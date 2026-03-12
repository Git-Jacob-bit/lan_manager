import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import {
    ArrowLeft, Activity, Box, Terminal, ShoppingCart,
    Settings, Code, Brain, Server, Power, Play, Square, Mic
} from 'lucide-react';

const API_BASE = `http://${window.location.hostname}:8000`;

function MachineDetails() {
    const { mac } = useParams();
    const navigate = useNavigate();

    const [machine, setMachine] = useState(null);
    const [dockers, setDockers] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            // Pobieramy pełne dane konkretnej maszyny (zawiera też wysłane przez Agenta metryki i dockery)
            const res = await axios.get(`${API_BASE}/machines/${mac}`);
            const currentMachine = res.data;

            setMachine(currentMachine);

            // Bezpieczne przypisanie listy kontenerów (jeśli Agent ich jeszcze nie wysłał, dajemy pustą tablicę)
            setDockers(currentMachine?.dockers || []);

        } catch (err) {
            console.error('Błąd pobierania danych maszyny:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000); // Autoodświeżanie co 5 sek
        return () => clearInterval(interval);
    }, [mac]);

    if (loading) {
        return <div className="min-h-screen bg-slate-950 flex justify-center items-center text-blue-400"><Activity className="animate-spin" size={48} /></div>;
    }

    if (!machine) {
        return (
            <div className="min-h-screen bg-slate-950 p-8 text-center text-slate-300">
                <h2 className="text-2xl mb-4">Nie znaleziono maszyny o adresie MAC: {mac}</h2>
                <button onClick={() => navigate('/')} className="text-blue-400 hover:text-blue-300">Wróć na stronę główną</button>
            </div>
        );
    }

    const isOnline = machine.status === 'online';

    // --- LOGIKA WYBORU IP (LAN vs TAILSCALE) ---
    const currentHost = window.location.hostname;
    let targetIp = machine.ip;
    if (currentHost.startsWith('100.') && machine.tailscale_ip) {
        targetIp = machine.tailscale_ip;
    } else if (!targetIp) {
        targetIp = currentHost;
    }

    // Filtrujemy aplikacje, szukając tych znanych (vscode, ollama)
    const installedApps = dockers.filter(container =>
        container.name && (container.name.includes('vscode') || container.name.includes('ai-assistant') || container.name.includes('whisper-asr'))
    );

    // Konfiguracja Narzędzi Systemowych
    const systemTools = [
        { id: 'telemetry', title: 'Telemetria', icon: Activity, color: 'text-blue-400', bg: 'bg-blue-500/10', path: `/machines/${mac}/telemetry` },
        { id: 'docker', title: 'Docker UI', icon: Box, color: 'text-emerald-400', bg: 'bg-emerald-500/10', path: `/machines/${mac}/docker` },
        { id: 'terminal', title: 'Terminal Live', icon: Terminal, color: 'text-slate-300', bg: 'bg-slate-700/30', path: `/machines/${mac}/terminal` },
        { id: 'apps', title: 'Sklep Aplikacji', icon: ShoppingCart, color: 'text-amber-400', bg: 'bg-amber-500/10', path: `/machines/${mac}/apps`, subtitle: 'Pobierz nowe' },
        { id: 'settings', title: 'Ustawienia', icon: Settings, color: 'text-slate-500', bg: 'bg-slate-800/50', path: '#', subtitle: 'Wkrótce', disabled: true },
    ];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, filter: 'blur(5px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans selection:bg-blue-500/30"
        >

            {/* --- GÓRNY PASEK NAWIGACJI --- */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4 max-w-7xl mx-auto">
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors text-sm font-medium text-slate-300 active:scale-95"
                >
                    <ArrowLeft size={16} /> Wróć do listy
                </button>

                <div className="flex items-center gap-2 bg-slate-900/50 px-4 py-2 rounded-full border border-slate-800">
                    <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-rose-500'}`}></div>
                    <span className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                        {isOnline ? 'Online' : 'Offline'}
                    </span>
                </div>
            </div>

            {/* --- NAGŁÓWEK MASZYNY --- */}
            <div className="max-w-7xl mx-auto mb-12 text-center">
                <div className="inline-flex items-center justify-center p-4 bg-blue-500/10 rounded-3xl border border-blue-500/20 mb-4">
                    <Server size={48} className="text-blue-400" />
                </div>
                <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-3 tracking-tight">{machine.name}</h1>
                <div className="flex flex-col md:flex-row justify-center items-center gap-2 md:gap-6 text-slate-400 font-mono text-sm">
                    <span>IP: <span className="text-blue-300">{targetIp}</span></span>
                    <span className="hidden md:inline text-slate-600">•</span>
                    <span>MAC: <span className="text-slate-300">{machine.mac}</span></span>
                </div>
            </div>

            {/* --- NARZĘDZIA SYSTEMOWE --- */}
            <div className="max-w-7xl mx-auto mb-12">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 border-b border-slate-800 pb-3">
                    <Settings className="text-slate-500" /> Narzędzia Systemowe
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {systemTools.map((tool) => (
                        <button
                            key={tool.id}
                            onClick={() => !tool.disabled && navigate(tool.path)}
                            disabled={tool.disabled || !isOnline}
                            className={`flex flex-col items-center justify-center p-6 rounded-3xl border transition-all duration-300 
                ${tool.disabled || !isOnline
                                    ? 'bg-slate-900 border-slate-800 opacity-50 cursor-not-allowed'
                                    : 'bg-slate-900 border-slate-700/50 hover:border-slate-500 hover:-translate-y-1 hover:shadow-xl hover:bg-slate-800'
                                }`}
                        >
                            <div className={`p-4 rounded-2xl mb-4 ${tool.bg}`}>
                                <tool.icon size={32} className={tool.color} />
                            </div>
                            <span className="font-bold text-slate-200 text-sm md:text-base text-center">{tool.title}</span>
                            {tool.subtitle && <span className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-wider">{tool.subtitle}</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* --- TWOJE APLIKACJE (DOCKER) --- */}
            <div className="max-w-7xl mx-auto mb-12">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 border-b border-slate-800 pb-3">
                    <Box className="text-slate-500" /> Twoje Aplikacje
                </h2>

                {installedApps.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {installedApps.map((app) => {
                            let appUrl = "#";
                            let AppIcon = Box;
                            let appTitle = "Aplikacja";
                            let colorClass = "text-blue-400";
                            let bgClass = "bg-blue-500/10";

                            // VS Code Server
                            if (app.name.includes('vscode')) {
                                appUrl = `http://${targetIp}:8443`;
                                AppIcon = Code;
                                appTitle = "VS CODE";
                                colorClass = "text-cyan-400";
                                bgClass = "bg-cyan-500/10";
                            }
                            // Ollama LLM
                            else if (app.name.includes('ai-assistant')) {
                                appUrl = `http://${targetIp}:3000`; // Port dla Open WebUI
                                AppIcon = Brain;
                                appTitle = "AI ASSISTANT";
                                colorClass = "text-rose-400";
                                bgClass = "bg-rose-500/10";
                            }

                            // --- DODAJEMY TEN FRAGMENT ---
                            else if (app.name.includes('whisper-asr')) {
                                appUrl = `http://${targetIp}:9000/docs`; // Kierujemy od razu na podstronę /docs z interfejsem graficznym
                                AppIcon = Mic;
                                appTitle = "WHISPER AI";
                                colorClass = "text-violet-400"; // Fioletowy ładnie pasuje do audio
                                bgClass = "bg-violet-500/10";
                            }
                            // -----------------------------

                            const isRunning = app.state === 'running';

                            return (
                                <a
                                    key={app.name}
                                    href={appUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`flex flex-col items-center justify-center p-6 rounded-3xl border bg-slate-900 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl group
                    ${isRunning ? 'border-slate-700 hover:border-slate-500' : 'border-slate-800 opacity-75'}`}
                                >
                                    <div className={`p-5 rounded-3xl mb-4 transition-transform group-hover:scale-110 ${bgClass}`}>
                                        <AppIcon size={40} className={colorClass} />
                                    </div>
                                    <span className="font-bold text-lg text-slate-200 mb-3">{appTitle}</span>
                                    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border
                    ${isRunning ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}
                  `}>
                                        {isRunning ? <Play size={12} /> : <Square size={12} />}
                                        {isRunning ? 'Działa' : 'Zatrzymany'}
                                    </div>
                                </a>
                            );
                        })}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/50">
                        <ShoppingCart size={48} className="text-slate-600 mb-4" />
                        <h3 className="text-xl font-bold text-slate-300 mb-2">Brak zainstalowanych aplikacji</h3>
                        <p className="text-slate-500 mb-6 text-center max-w-md">Nie pobrałeś jeszcze żadnych kontenerów z naszego sklepu. Przejdź do Menedżera Aplikacji, aby zainstalować np. VS Code.</p>
                        <button
                            onClick={() => navigate(`/machines/${mac}/apps`)}
                            disabled={!isOnline}
                            className={`px-6 py-3 rounded-xl font-bold transition-colors ${isOnline ? 'bg-amber-500 hover:bg-amber-400 text-amber-950' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                        >
                            Otwórz Menedżer Aplikacji
                        </button>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

export default MachineDetails;