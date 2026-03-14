# 🚀 LAN Manager (Centrum Dowodzenia)

Centralny system webowy do zarządzania, monitorowania i kontrolowania maszyn (komputerów/serwerów) w sieci lokalnej (LAN) oraz poprzez Tailscale. Aplikacja pozwala na pełną kontrolę nad infrastrukturą bezpośrednio z poziomu przeglądarki.

## ✨ Główne funkcjonalności

* **💻 Zarządzanie flotą:** Podgląd wszystkich maszyn w sieci z ich statusem (Online/Offline), adresami IP (LAN & Tailscale) oraz adresami MAC.
* **⚡ Kontrola zasilania:** Wybudzanie maszyn przez sieć (Wake-on-LAN) oraz zdalne wyłączanie.
* **📈 Telemetria na żywo:** Monitorowanie zużycia zasobów (CPU, RAM, Dysk) w czasie rzeczywistym z wykorzystaniem interaktywnych wykresów.
* **🐳 Docker Manager:** Pełna kontrola nad kontenerami Docker na docelowych maszynach (Start, Stop, Restart) z poziomu responsywnego interfejsu (karty na mobile, tabele na desktopie).
* **🛒 App Manager:** Wbudowany "sklep" z aplikacjami pozwalający na instalację gotowych kontenerów jednym kliknięciem (np. VS Code Server, Ollama AI Assistant, Whisper AI).
* **⌨️ Web Terminal:** Wbudowany w przeglądarkę terminal dający bezpośredni dostęp do powłoki zarządzanych maszyn.

## 🛠 Technologie

Projekt został zbudowany przy użyciu nowoczesnych narzędzi:

**Frontend:**
* [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
* [Tailwind CSS](https://tailwindcss.com/) (stylowanie i responsywność)
* [Framer Motion](https://www.framer.com/motion/) (płynne animacje interfejsu)
* [Recharts](https://recharts.org/) (wykresy telemetrii)
* [Xterm.js](https://xtermjs.org/) (silnik terminala webowego)
* [Lucide React](https://lucide.dev/) (ikony)

**Backend / Architektura:**
* Główne API REST (Port `8000`)
* Agent kliencki (napisany w Go) działający na maszynach docelowych
* Docker & Docker Compose (konteneryzacja i wdrażanie)

## 🚀 Instalacja i uruchomienie

Aplikacja jest w pełni skonteneryzowana. Aby uruchomić projekt na swoim serwerze, upewnij się, że masz zainstalowanego Dockera i Git.

1. Sklonuj repozytorium:
   ```bash
   git clone [https://github.com/TwojLogin/lan_manager.git](https://github.com/TwojLogin/lan_manager.git)
   cd lan_manager
