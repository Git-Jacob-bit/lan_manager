import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, CheckCircle2, Loader2, Download, Package, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';

// 1. ZAKTUALIZOWANA LISTA APLIKACJI (Dodane porty i nowe ID)
const APPS = [
    {
        id: 'vscode',
        name: 'VS Code Server',
        icon: '💻',
        description: 'Pełnoprawne środowisko programistyczne (IDE) działające prosto w przeglądarce. Posiada dostęp do plików maszyny.',
        port: 8443
    },
    {
        id: 'ai-assistant', // <--- Zmienione na to samo ID, co w Agencie w Go
        name: 'Ollama AI Assistant',
        icon: '🧠',
        description: 'Twój prywatny asystent AI i analizator dokumentów (Open WebUI + LLM). Dane nie opuszczają sieci LAN.',
        port: 3000 // <--- Port, na którym działa interfejs WebUI
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
    const [installingApp, setInstallingApp] = useState(null);

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

    const isAppInstalled = (appId) => {
        if (!machine || !machine.dockers) return false;
        return machine.dockers.some(container => container.name.includes(appId));
    };

    // 2. WYCIĄGNIĘTA LOGIKA ADRESU IP (Przydaje się do instalacji ORAZ do przycisku Otwórz)
    const getTargetIp = () => {
        if (!machine) return window.location.hostname;
        const currentHost = window.location.hostname;
        if (currentHost.startsWith('100.') && machine.tailscale_ip) {
            return machine.tailscale_ip;
        }
        return machine.ip || currentHost;
    };

    const handleInstall = async (appId) => {
        if (!machine) return;
        setInstallingApp(appId);

        const targetHost = getTargetIp();

        try {
            await axios.post(`http://${targetHost}:8001/apps/install?id=${appId}`);
            
            // Usunąłem Alert, żeby nie blokował przeglądarki, użytkownik widzi zmianę na przycisku
            setTimeout(() => {
                fetchMachineData();
                setInstallingApp(null);
            }, 3000);

        } catch (err) {
            console.error(`Błąd instalacji ${appId}:`, err);
            alert(`❌ Błąd instalacji aplikacji. Sprawdź, czy maszyna jest online.`);
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
            
            <div className="flex justify-between items-center mb-8">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 transition-colors px-4 py-2 rounded-full border border-slate-800 shadow-md">
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
                    
                    // 3. GENEROWANIE LINKU DO APLIKACJI
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

                            {/* --- 4. ZAKTUALIZOWANY PRZYCISK OTWÓRZ / ZAINSTALUJ --- */}
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
                                    onClick={() => handleInstall(app.id)}
                                    disabled={installingApp !== null}
                                    className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg
                                        ${isInstallingThis 
                                            ? 'bg-yellow-600 text-white cursor-wait' 
                                            : 'bg-blue-600 hover:bg-blue-500 text-white' 
                                        }
                                        ${installingApp !== null && !isInstallingThis ? 'opacity-50 cursor-not-allowed' : ''}
                                    `}
                                >
                                    {isInstallingThis ? (
                                        <>
                                            <Loader2 className="animate-spin" size={20} />
                                            Instalowanie...
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