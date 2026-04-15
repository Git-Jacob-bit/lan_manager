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
	"github.com/docker/docker/api/types/container" // <--- DODAJ TĘ LINIJKĘ
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

// --- Nowa struktura do strumieniowania logów na żywo ---
type flushWriter struct {
	w http.ResponseWriter
	f http.Flusher
}

func (fw *flushWriter) Write(p []byte) (n int, err error) {
	n, err = fw.w.Write(p)
	if fw.f != nil {
		fw.f.Flush() // Wypycha dane natychmiast do przeglądarki
	}
	return
}

// --------------------------------------------------------

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
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET")

			// 1. Zmieniamy nagłówki, żeby przeglądarka wiedziała, że to "niekończący się" strumień tekstu
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			w.Header().Set("Transfer-Encoding", "chunked")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			// 2. Inicjalizacja strumieniowania
			flusher, ok := w.(http.Flusher)
			if !ok {
				http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
				return
			}
			fw := &flushWriter{w: w, f: flusher}

			appName := r.URL.Query().Get("id")
			fmt.Fprintf(fw, "📥 Rozpoczynam przygotowania dla aplikacji: %s...\n", appName)

			var cmd *exec.Cmd

			switch appName {
			case "vscode":
				fmt.Fprintf(fw, "📂 Konfiguracja folderów roboczych na serwerze...\n")
				agentDir, err := os.Getwd()
				if err != nil {
					fmt.Fprintf(fw, "❌ Błąd pobierania ścieżki: %v\n", err)
					return
				}
				workspacePath := filepath.Join(agentDir, "workspace")
				os.MkdirAll(workspacePath, 0777)
				exec.Command("chmod", "777", workspacePath).Run()

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
				fmt.Fprintf(fw, "🧠 Przygotowanie AI Assistant (Ollama + Open WebUI)...\n")
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
				fmt.Fprintf(fw, "🎙️ Przygotowanie Whisper AI (Transkrypcja)...\n")
				cmd = exec.Command("docker", "run", "-d",
					"--name=app-whisper-asr",
					"--gpus", "all",
					"-p", "9000:9000",
					"-e", "ASR_MODEL=medium",
					"-e", "ASR_ENGINE=openai_whisper",
					"--restart", "unless-stopped",
					"onerahmet/openai-whisper-asr-webservice:latest-gpu")

			default:
				fmt.Fprintf(fw, "❌ Nieznana aplikacja\n")
				return
			}

			// --- 3. KLUCZOWA ZMIANA ---
			// Podpinamy nasz strumień pod standardowe wyjście komendy z Dockera!
			cmd.Stdout = fw
			cmd.Stderr = fw

			fmt.Fprintf(fw, "🚀 Wykonywanie komendy w Dockerze (pobieranie obrazu może chwilę potrwać)...\n\n")

			// Zamiast CombinedOutput, używamy po prostu Run()
			err := cmd.Run()
			if err != nil {
				fmt.Fprintf(fw, "\n❌ Błąd instalacji: %v\n", err)
			} else {
				fmt.Fprintf(fw, "\n✅ Aplikacja %s pomyślnie zainstalowana i uruchomiona!\n", appName)
			}
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
		if err != nil {
			log.Println("❌ Błąd połączenia z Dockerem (inicjalizacja):", err)
		} else {
			containers, err := cli.ContainerList(context.Background(), container.ListOptions{All: true})
			if err != nil {
				log.Println("❌ Błąd pobierania listy kontenerów:", err)
			} else {
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
