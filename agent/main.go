package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/creack/pty"
	"github.com/docker/docker/api/types"
	"github.com/docker/docker/client"
	"github.com/gorilla/websocket"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
	psnet "github.com/shirou/gopsutil/v3/net"
)

// Konfiguracja
const (
	BackendURL = "http://localhost:8000"
)

// Struktura dla pojedynczego kontenera
type DockerStats struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	State  string `json:"state"`
}

// Struktura paczki z metrykami
type Metrics struct {
	CPUUsage   float64       `json:"cpu_usage"`
	RAMUsage   float64       `json:"ram_usage"`
	DiskUsage  float64       `json:"disk_usage"`
	NetSent    float64       `json:"net_sent"`
	NetRecv    float64       `json:"net_recv"`
	DiskHealth string        `json:"disk_health"`
	Dockers    []DockerStats `json:"dockers"`
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func handleTerminal(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("❌ Błąd WebSocket:", err)
		return
	}

	log.Println("🔌 Nawiązano połączenie z Terminalem (WebSocket)!")

	// 1. Wymuszenie trybu logowania i odpowiedniego terminala (naprawia brak promptu i kolorów)
	cmd := exec.Command("bash", "-l")
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	ptmx, err := pty.Start(cmd)
	if err != nil {
		log.Println("❌ Błąd uruchamiania PTY:", err)
		ws.Close()
		return
	}

	// 2. KLUCZOWE: Zamykamy deskryptor ORAZ zabijamy proces Bash!
	// To eliminuje problem zombie i błąd "file already closed"
	defer func() {
		ptmx.Close()
		cmd.Process.Kill()
		ws.Close()
		log.Println("🔌 Zamknięto połączenie z Terminalem i oczyszczono proces.")
	}()

	// Czytanie z PTY -> wysyłanie do WebSocket
	go func() {
		buf := make([]byte, 1024)
		for {
			n, err := ptmx.Read(buf)
			if err != nil {
				return // Wychodzimy po cichu, defer posprząta
			}
			if err := ws.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
				return
			}
		}
	}()

	// Czytanie z WebSocket -> wysyłanie do PTY
	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			break // Przerwanie pętli odpala defer i zabija sesję
		}
		ptmx.Write(msg)
	}
}

func getMacAddress() string {
	interfaces, err := net.Interfaces()
	if err != nil {
		return "00:00:00:00:00:00"
	}

	for _, i := range interfaces {
		// Szukamy aktywnego interfejsu, który ma MAC i nie jest loopbackiem (lo) ani wirtualną siecią Dockera
		if i.Flags&net.FlagUp != 0 && len(i.HardwareAddr) > 0 {
			if i.Name != "lo" && !strings.HasPrefix(i.Name, "docker") && !strings.HasPrefix(i.Name, "veth") && !strings.HasPrefix(i.Name, "br-") {
				return i.HardwareAddr.String()
			}
		}
	}
	return "00:00:00:00:00:00"
}

func getOutboundIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		return "127.0.0.1"
	}
	defer conn.Close()
	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

func getTailscaleIP() string {
	iface, err := net.InterfaceByName("tailscale0")
	if err != nil {
		return "" // Nie ma Tailscale na tej maszynie
	}

	addrs, err := iface.Addrs()
	if err != nil {
		return ""
	}

	for _, addr := range addrs {
		if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() {
			if ipnet.IP.To4() != nil {
				return ipnet.IP.String() // Zwróci np. "100.105.x.x"
			}
		}
	}
	return ""
}

func main() {
	AgentName, _ := os.Hostname()
	AgentIP := getOutboundIP()
	AgentMAC := getMacAddress() // <- O, tutaj!
	AgentTailscaleIP := getTailscaleIP()

	// --- GRACEFUL SHUTDOWN (Szybkie rozłączenie) ---
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-c // Czeka, aż ktoś wyłączy Agenta (np. Ctrl+C)
		log.Println("⚠️ Otrzymano sygnał wyłączenia! Zgłaszam offline do serwera...")

		// Wysyłamy szybki strzał do backendu, że padamy (musisz obsłużyć ten endpoint na backendzie!)
		offlineURL := fmt.Sprintf("%s/machines/%s/offline", BackendURL, AgentMAC)
		http.Post(offlineURL, "application/json", nil)

		log.Println("Zakończono pracę Agenta.")
		os.Exit(0)
	}()
	// -----------------------------------------------

	fmt.Println("🚀 Uruchamiam Agenta LAN Machine Manager... ", AgentName, AgentIP)

	go func() {

		// --- NOWOŚĆ: Zarządzanie zasilaniem maszyny ---
		http.HandleFunc("/machine/power", func(w http.ResponseWriter, r *http.Request) {
			action := r.URL.Query().Get("action") // "shutdown" lub "reboot"

			var cmd *exec.Cmd
			if action == "shutdown" {
				log.Println("⚠️ Otrzymano rozkaz WYŁĄCZENIA maszyny!")
				cmd = exec.Command("shutdown", "-h", "now") // Linux: wyłączenie natychmiastowe
			} else if action == "reboot" {
				log.Println("⚠️ Otrzymano rozkaz RESTARTU maszyny!")
				cmd = exec.Command("reboot")
			} else {
				http.Error(w, "Nieznana akcja", http.StatusBadRequest)
				return
			}

			w.WriteHeader(http.StatusOK)
			w.Write([]byte("Wykonywanie: " + action))

			// Uruchamiamy komendę w osobnej gorutynie (w tle), żeby Agent zdążył
			// wysłać odpowiedź HTTP "OK" do Dashboardu zanim system zabije proces.
			go func() {
				time.Sleep(2 * time.Second)
				cmd.Run()
			}()
		})

		http.HandleFunc("/docker/action", func(w http.ResponseWriter, r *http.Request) {
			containerName := r.URL.Query().Get("name")
			action := r.URL.Query().Get("action")

			if containerName == "" || (action != "start" && action != "stop" && action != "restart") {
				http.Error(w, "Złe parametry", http.StatusBadRequest)
				return
			}

			log.Printf("🐳 Otrzymano rozkaz: docker %s %s", action, containerName)
			cmd := exec.Command("docker", action, containerName)
			if err := cmd.Run(); err != nil {
				log.Printf("❌ Błąd wykonania: %v", err)
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusOK)
		})

		http.HandleFunc("/apps/install", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			appName := r.URL.Query().Get("id")
			log.Printf("📥 Rozpoczynam instalację aplikacji: %s...\n", appName)

			var cmd *exec.Cmd

			switch appName {
			case "vscode":
				// --- KLUCZOWE POPRAWKI ---

				// 1. Zamiast os.Executable() używamy os.Getwd(), aby zablokować zjawisko znikających plików w 'go run'
				agentDir, err := os.Getwd()
				if err != nil {
					log.Println("❌ Błąd pobierania ścieżki:", err)
					http.Error(w, "Błąd ścieżki", http.StatusInternalServerError)
					return
				}
				workspacePath := filepath.Join(agentDir, "workspace")

				// 2. Tworzymy folder i dajemy uprawnienia 777 (każdy może czytać/pisać) - eliminuje błędy dostępu z obu stron
				os.MkdirAll(workspacePath, 0777)
				exec.Command("chmod", "777", workspacePath).Run()

				// 3. Usuwamy --user=0:0, ale zostawiamy PUID=0 i PGID=0 (dzięki temu struktura kontenera s6-overlay ładuje się poprawnie, a Ty jesteś rootem)
				cmd = exec.Command("docker", "run", "-d",
					"--name=app-vscode",
					"-e", "PUID=0",
					"-e", "PGID=0",
					"-e", "TZ=Europe/Warsaw",
					"-e", "PASSWORD=admin",
					"-p", "8443:8443",
					"-v", workspacePath+":/config/workspace",
					"--restart", "unless-stopped",
					"linuxserver/code-server")

			case "ai-assistant":
				log.Println("🧠 Rozpoczynam instalację AI Assistant (Ollama + Open WebUI)...")

				// Używamy obrazu All-in-One.
				// Port 3000: Interfejs WWW dla Ciebie
				// Port 11434: API Ollamy (pod automatyzacje w tle)
				cmd = exec.Command("docker", "run", "-d",
					"--name=app-ai-assistant",
					"--gpus", "all",
					"-p", "3000:8080",
					"-p", "11434:11434",
					"-v", "open-webui-data:/app/backend/data",
					"-v", "ollama-data:/root/.ollama",
					"--restart", "unless-stopped",
					"ghcr.io/open-webui/open-webui:ollama")

			case "whisper-asr":
				log.Println("🎙️ Rozpoczynam instalację Whisper AI (Transkrypcja Audio na GPU)...")
				cmd = exec.Command("docker", "run", "-d",
					"--name=app-whisper-asr",
					"--gpus", "all", // <--- 1. DAJEMY DOSTĘP DO KARTY RTX
					"-p", "9000:9000",
					"-e", "ASR_MODEL=medium", // <--- 2. WYBIERAMY MODEL (small lub medium)
					"-e", "ASR_ENGINE=openai_whisper",
					"--restart", "unless-stopped",
					"onerahmet/openai-whisper-asr-webservice:latest-gpu") // <--- 3. UŻYWAMY WERSJI OBRAZU Z OBSŁUGĄ KART GRAFICZNYCH

			default:
				http.Error(w, "Nieznana aplikacja", http.StatusBadRequest)
				return
			}

			output, err := cmd.CombinedOutput()
			if err != nil {
				log.Printf("❌ Błąd instalacji %s: %v\nWyjście: %s", appName, err, string(output))
				http.Error(w, "Błąd instalacji: "+string(output), http.StatusInternalServerError)
				return
			}

			log.Printf("✅ Aplikacja %s pomyślnie zainstalowana!", appName)
			w.WriteHeader(http.StatusOK)
		})

		http.HandleFunc("/ws", handleTerminal)

		log.Println("📡 Agent nasłuchuje rozkazów Docker i Terminal (port 8001)...")
		log.Fatal(http.ListenAndServe(":8001", nil))
	}()

	var lastBytesSent uint64 = 0
	var lastBytesRecv uint64 = 0
	var lastTime time.Time

	for {
		registerURL := fmt.Sprintf("%s/machines?name=%s&ip=%s&mac=%s&tailscale_ip=%s", BackendURL, AgentName, AgentIP, AgentMAC, AgentTailscaleIP)
		resp, err := http.Post(registerURL, "application/json", nil)
		if err != nil {
			log.Println("❌ Błąd połączenia z backendem:", err)
			time.Sleep(5 * time.Second)
			continue
		}
		resp.Body.Close()

		cpuPercent, _ := cpu.Percent(0, false)
		vMem, _ := mem.VirtualMemory()
		dStat, _ := disk.Usage("/")

		cpuU := 0.0
		if len(cpuPercent) > 0 {
			cpuU = cpuPercent[0]
		}

		diskHealth := "OK"
		if dStat != nil && dStat.UsedPercent > 90.0 {
			diskHealth = "WARNING"
		}

		netStats, _ := psnet.IOCounters(false)
		netSentMBps := 0.0
		netRecvMBps := 0.0

		if len(netStats) > 0 {
			currentBytesSent := netStats[0].BytesSent
			currentBytesRecv := netStats[0].BytesRecv
			currentTime := time.Now()

			if !lastTime.IsZero() {
				duration := currentTime.Sub(lastTime).Seconds()
				if duration > 0 {
					sentDelta := currentBytesSent - lastBytesSent
					recvDelta := currentBytesRecv - lastBytesRecv

					netSentMBps = (float64(sentDelta) / (1024 * 1024)) / duration
					netRecvMBps = (float64(recvDelta) / (1024 * 1024)) / duration
				}
			}

			lastBytesSent = currentBytesSent
			lastBytesRecv = currentBytesRecv
			lastTime = currentTime
		}

		var dockerList []DockerStats
		cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
		if err == nil {
			containers, err := cli.ContainerList(context.Background(), types.ContainerListOptions{All: true})
			if err == nil {
				for _, c := range containers {
					name := "unknown"
					if len(c.Names) > 0 {
						name = c.Names[0][1:]
					}
					dockerList = append(dockerList, DockerStats{
						Name:   name,
						Status: c.Status,
						State:  c.State,
					})
				}
			}
			cli.Close()
		}

		metrics := Metrics{
			CPUUsage:   cpuU,
			RAMUsage:   vMem.UsedPercent,
			DiskUsage:  dStat.UsedPercent,
			NetSent:    netSentMBps,
			NetRecv:    netRecvMBps,
			DiskHealth: diskHealth,
			Dockers:    dockerList,
		}

		jsonData, _ := json.Marshal(metrics)

		metricsURL := fmt.Sprintf("%s/machines/%s/metrics", BackendURL, AgentMAC)
		mResp, mErr := http.Post(metricsURL, "application/json", bytes.NewBuffer(jsonData))

		if mErr != nil {
			log.Println("❌ Błąd wysyłania metryk:", mErr)
		} else {
			log.Printf("✅ Wysłano metryki | CPU: %.1f%% | RAM: %.1f%% | Dysk: %s | Kontenery: %d\n",
				metrics.CPUUsage, metrics.RAMUsage, metrics.DiskHealth, len(metrics.Dockers))
			mResp.Body.Close()
		}

		time.Sleep(5 * time.Second)
	}
}
