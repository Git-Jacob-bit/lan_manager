import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, CheckCircle2, Loader2, Download, Package, ExternalLink, X } from 'lucide-react';
import { motion } from 'framer-motion';

const APPS = [
    {
        id: 'vscode',
        name: 'VS Code Server',
        icon: '💻',
        description: 'Pełnoprawne środowisko programistyczne (IDE) działające prosto w przeglądarce. Posiada dostęp do plików maszyny.',
        port: 8443
    },
    {
        id: 'ai-assistant',
        name: 'Ollama AI Assistant',
        icon: '🧠',
        description: 'Twój prywatny asystent AI i analizator dokumentów (Open WebUI + LLM). Dane nie opuszczają sieci LAN.',
        port: 3000 
    },
    {
        id: 'whisper-asr',
        name: 'Whisper AI',
        icon: '🎙️',
        description: 'Lokalna transkrypcja mowy na tekst. Prześlij plik audio/wideo, a sztuczna inteligencja zamieni go na tekst.',
        port: 9000 
    }
];

const AppManagerPage = () => {
    const { mac } = useParams();
    const navigate = useNavigate();
    
    const [machine, setMachine] = useState(null);
    const [loading, setLoading] = useState(true);
    
    // Zmienne do instalacji i terminala
    const [installingApp, setInstallingApp] = useState(null);
    const [installLogs, setInstallLogs] = useState("");
    const [showTerminal, setShowTerminal] = useState(false);
    
    // Referencja do zjeżdżania terminala na dół
    const terminalEndRef = useRef(null);

    const fetchMachineData = async () => {
        try {
            const res = await axios.get(`http://${window.location.hostname}:8000/machines/${mac}`);
            setMachine(res.data);
        } catch (err) {
            console.error("Błąd API podczas pobierania maszyny:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMachineData();
        const interval = setInterval(fetchMachineData, 5000);
        return () => clearInterval(interval);
    }, [mac]);

    // Zabezpieczenie przed przypadkowym odświeżeniem/wyjściem ze strony
    useEffect(() => {
        const handleBeforeUnload = (e) => {
            if (installingApp) {
                e.preventDefault();
                e.returnValue = ''; // Wymagane przez nowoczesne przeglądarki do pokazania alertu
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [installingApp]);

    // Automatyczne scrollowanie terminala w dół, gdy pojawiają się nowe logi
    useEffect(() => {
        if (terminalEndRef.current) {
            terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [installLogs]);

    const isAppInstalled = (appId) => {
        if (!machine || !machine.dockers) return false;
        return machine.dockers.some(container => container.name.includes(appId));
    };

    const getTargetIp = () => {
        if (!machine) return window.location.hostname;
        const currentHost = window.location.hostname;
        if (currentHost.startsWith('100.') && machine.tailscale_ip) {
            return machine.tailscale_ip;
        }
        return machine.ip || currentHost;
    };

    // ZMODYFIKOWANA FUNKCJA INSTALACJI (Obsługa Strumieni)
    const handleInstall = async (appId) => {
        if (!machine) return;
        setInstallingApp(appId);
        setInstallLogs(""); // Czyścimy logi
        setShowTerminal(true); // Otwieramy terminal

        const targetHost = getTargetIp();

        try {
            const response = await fetch(`http://${targetHost}:8001/apps/install?id=${appId}`, {
                method: 'POST',
            });

            // Odczyt strumieniowy
            const reader = response.body.getReader();
            const decoder = new TextDecoder("utf-8");

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                setInstallLogs((prev) => prev + chunk);
            }

            // Strumień zakończony
            fetchMachineData();
            setInstallingApp(null);
            setInstallLogs((prev) => prev + "\n\n✅ Proces zakończony.");

        } catch (err) {
            console.error(`Błąd instalacji ${appId}:`, err);
            setInstallLogs((prev) => prev + `\n\n❌ Błąd komunikacji z serwerem: ${err.message}`);
            setInstallingApp(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
                <Loader2 className="animate-spin text-emerald-500 w-12 h-12" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col p-6">
            
            {/* --- MODAL Z TERMINALEM --- */}
            {showTerminal && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
                    <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-xl shadow-2xl flex flex-col h-[75vh]">
                        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950 rounded-t-xl">
                            <h3 className="font-bold text-slate-200 flex items-center gap-2">
                                <Loader2 className={`w-5 h-5 ${installingApp ? 'animate-spin text-blue-500' : 'hidden'}`} />
                                Terminal Instalatora
                            </h3>
                            <button 
                                onClick={() => setShowTerminal(false)} 
                                className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition-colors"
                            >
                                <X size={16} /> Zamknij
                            </button>
                        </div>
                        
                        {/* Okno z logami */}
                        <div className="p-4 flex-1 overflow-auto bg-black font-mono text-sm text-green-400 whitespace-pre-wrap leading-relaxed tracking-wide">
                            {installLogs || "Oczekiwanie na odpowiedź serwera..."}
                            <div ref={terminalEndRef} />
                        </div>
                    </div>
                </div>
            )}
            
            <div className="flex justify-between items-center mb-8">
                <button 
                    onClick={() => {
                        if (installingApp) {
                            const czyWyjsc = window.confirm("Aplikacja nadal się instaluje. Czy na pewno chcesz opuścić stronę? Może to przerwać proces.");
                            if (!czyWyjsc) return; // Jeśli użytkownik kliknie "Anuluj", przerywamy funkcję
                        }
                        navigate(-1); // Jeśli nie instaluje, lub kliknął "OK", nawigujemy
                    }} 
                    className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 transition-colors px-4 py-2 rounded-full border border-slate-800 shadow-md"
                >
                    <ArrowLeft size={18} /> Powrót do Huba
                </button>
                
                <div className="text-center flex flex-col items-center">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <Package className="text-emerald-500" /> Menedżer Aplikacji
                    </h2>
                    <p className="text-sm text-slate-400">
                        {machine?.name} <span className="font-mono text-emerald-500 ml-1">({machine?.ip})</span>
                    </p>
                </div>

                <div className="w-[140px]"></div> 
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto w-full">
                {APPS.map((app) => {
                    const installed = isAppInstalled(app.id);
                    const isInstallingThis = installingApp === app.id;
                    const appUrl = `http://${getTargetIp()}:${app.port}`;

                    return (
                        <motion.div 
                            key={app.id}
                            whileHover={{ y: installed ? 0 : -5 }}
                            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col h-full relative overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-cyan-500 opacity-50"></div>

                            <div className="text-center mb-4 mt-2">
                                <span className="text-5xl">{app.icon}</span>
                            </div>
                            
                            <h4 className="text-xl font-bold text-center mb-2">{app.name}</h4>
                            <p className="text-slate-400 text-sm text-center mb-6 flex-grow">
                                {app.description}
                            </p>

                            {installed ? (
                                <button 
                                    onClick={() => window.open(appUrl, '_blank')}
                                    className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg"
                                >
                                    <ExternalLink size={20} />
                                    Otwórz Aplikację
                                </button>
                            ) : (
                                <button 
                                    onClick={() => isInstallingThis ? setShowTerminal(true) : handleInstall(app.id)}
                                    disabled={installingApp !== null && !isInstallingThis}
                                    className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg
                                        ${isInstallingThis 
                                            ? 'bg-yellow-600 hover:bg-yellow-500 text-white cursor-pointer' 
                                            : 'bg-blue-600 hover:bg-blue-500 text-white' 
                                        }
                                        ${installingApp !== null && !isInstallingThis ? 'opacity-50 cursor-not-allowed' : ''}
                                    `}
                                >
                                    {isInstallingThis ? (
                                        <>
                                            <Loader2 className="animate-spin" size={20} />
                                            Pokaż logi
                                        </>
                                    ) : (
                                        <>
                                            <Download size={20} />
                                            Zainstaluj
                                        </>
                                    )}
                                </button>
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
};

export default AppManagerPage;