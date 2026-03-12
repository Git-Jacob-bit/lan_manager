import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, CheckCircle2, Loader2, Download, Package } from 'lucide-react';
import { motion } from 'framer-motion';

const APPS = [
    {
        id: 'vscode',
        name: 'VS Code Server',
        icon: '📝',
        description: 'Pełnoprawne środowisko programistyczne (IDE) działające prosto w przeglądarce. Posiada dostęp do plików maszyny.'
    },
    {
        id: 'ollama',
        name: 'Ollama (LLM)',
        icon: '🦙',
        description: 'Uruchamiaj lokalne modele sztucznej inteligencji (np. Llama 3, Mistral) bez wysyłania danych do chmury.'
    }
];

const AppManagerPage = () => {
    const { mac } = useParams();
    const navigate = useNavigate();
    
    const [machine, setMachine] = useState(null);
    const [loading, setLoading] = useState(true);
    const [installingApp, setInstallingApp] = useState(null); // Przechowuje ID aktualnie instalowanej apki

    // 1. Pobieranie danych maszyny z Twojego backendu (zastępuje zmienne Jinja2)
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
        // Opcjonalnie: odświeżaj listę co 5 sekund, żeby sprawdzić status kontenerów
        const interval = setInterval(fetchMachineData, 5000);
        return () => clearInterval(interval);
    }, [mac]);

    // 2. Funkcja sprawdzająca czy aplikacja jest już zainstalowana
    const isAppInstalled = (appId) => {
        // Zakładamy, że API zwraca listę dockers w machine.dockers 
        // (zgodnie z tym co Agent w Go wysyła jako metryki)
        if (!machine || !machine.dockers) return false;
        return machine.dockers.some(container => container.name.includes(appId));
    };

    // 3. Instalacja aplikacji (z inteligentnym wyborem IP - LAN vs Tailscale)
    const handleInstall = async (appId) => {
        if (!machine) return;
        setInstallingApp(appId);

        const currentHost = window.location.hostname;
        let targetHost = machine.ip;
        if (currentHost.startsWith('100.') && machine.tailscale_ip) {
            targetHost = machine.tailscale_ip;
        }
        if (!targetHost) targetHost = currentHost;

        try {
            // 1. Wysyłamy żądanie instalacji
            await axios.post(`http://${targetHost}:8001/apps/install?id=${appId}`);
            
            // 2. Dajemy wyraźny feedback użytkownikowi
            alert(`✅ Sukces! Aplikacja ${appId} została zainstalowana na maszynie.`);
            
            // 3. Czekamy 3 sekundy, żeby Agent zdążył wysłać nowe metryki do bazy,
            // po czym pobieramy świeże dane (przycisk zmieni się na "Zainstalowano")
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
            
            {/* --- NAGŁÓWEK --- */}
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

                {/* Pusty div dla wyśrodkowania flexboxa */}
                <div className="w-[140px]"></div> 
            </div>

            {/* --- SIATKA APLIKACJI --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto w-full">
                {APPS.map((app) => {
                    const installed = isAppInstalled(app.id);
                    const isInstallingThis = installingApp === app.id;

                    return (
                        <motion.div 
                            key={app.id}
                            whileHover={{ y: installed ? 0 : -5 }}
                            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col h-full relative overflow-hidden"
                        >
                            {/* Dekoracyjne tło dla estetyki */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-cyan-500 opacity-50"></div>

                            <div className="text-center mb-4 mt-2">
                                <span className="text-5xl">{app.icon}</span>
                            </div>
                            
                            <h4 className="text-xl font-bold text-center mb-2">{app.name}</h4>
                            <p className="text-slate-400 text-sm text-center mb-6 flex-grow">
                                {app.description}
                            </p>

                            {/* --- PRZYCISK INSTALACJI / STATUS --- */}
                            {installed ? (
                                <button disabled className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 bg-slate-800 text-emerald-500 border border-emerald-500/30 opacity-80 cursor-not-allowed">
                                    <CheckCircle2 size={20} />
                                    Zainstalowano
                                </button>
                            ) : (
                                <button 
                                    onClick={() => handleInstall(app.id)}
                                    disabled={installingApp !== null} // Blokujemy resztę, jeśli coś się już instaluje
                                    className={`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg
                                        ${isInstallingThis 
                                            ? 'bg-warning text-yellow-900 cursor-wait' // Żółty stan ładowania
                                            : 'bg-blue-600 hover:bg-blue-500 text-white' // Niebieski stan domyślny
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