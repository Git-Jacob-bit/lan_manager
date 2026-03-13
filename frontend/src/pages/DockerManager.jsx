import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, Square, RefreshCw, Loader2, Server } from 'lucide-react';

const API_BASE = `http://${window.location.hostname}:8000`;

function DockerManager() {
    const { mac } = useParams();
    const navigate = useNavigate();
    const [containers, setContainers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(null); // ID kontenera, który jest w trakcie akcji

    const fetchContainers = async () => {
        try {
            const res = await axios.get(`${API_BASE}/machines/${mac}/metrics?limit=1`);
            if (res.data && res.data.length > 0 && res.data[0].dockers) {
                setContainers(res.data[0].dockers);
            }
        } catch (err) {
            console.error("Błąd pobierania kontenerów:", err);
        } finally {
            setLoading(false);
        }
    };

    const doAction = async (containerName, action) => {
        setActionLoading(containerName);
        const targetState = action === 'start' ? 'running' : 'exited';
        try {
            await axios.post(`${API_BASE}/api/machines/${mac}/docker/action`, {
                container_name: containerName,
                action: action
            });

            // 2. Czekaj, aż stan się zmieni (pętla sprawdzająca)
            let isReady = false;
            let attempts = 0;

            while (!isReady && attempts < 10) { // Maksymalnie 10 prób
                await new Promise(resolve => setTimeout(resolve, 800)); // Czekaj 800ms

                const res = await axios.get(`${API_BASE}/machines/${mac}/metrics?limit=1`);
                const updatedContainer = res.data[0]?.dockers.find(c => c.name === containerName);

                // Sprawdź czy stan jest zgodny z oczekiwanym
                if (updatedContainer && updatedContainer.state === targetState) {
                    isReady = true;
                    setContainers(res.data[0].dockers); // Aktualizujemy listę
                }
                attempts++;
            }
        } catch (err) {
            alert("Wystąpił błąd przy wysyłaniu komendy.");
        } finally {
            setActionLoading(null);
        }
    };

    useEffect(() => {
        fetchContainers();
        const interval = setInterval(fetchContainers, 3000);
        return () => clearInterval(interval);
    }, [mac]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans"
        >
            {/* Nagłówek */}
            <div className="max-w-5xl mx-auto mb-8 flex justify-between items-center">
                <button
                    onClick={() => navigate(`/machines/${mac}`)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors text-slate-300"
                >
                    <ArrowLeft size={16} /> Powrót
                </button>
                <h1 className="text-2xl font-bold flex items-center gap-3">
                    <Server className="text-blue-500" /> Zarządzanie Dockerem
                </h1>
            </div>

            {/* Tabela */}
            <div className="max-w-5xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                {loading ? (
                    <div className="p-12 text-center text-slate-500 flex flex-col items-center gap-4">
                        <Loader2 className="animate-spin" /> Ładowanie kontenerów...
                    </div>
                ) : (
                    <>
                        {/* --- WIDOK MOBILNY (KARTY) --- */}
                        <div className="grid grid-cols-1 gap-4 md:hidden p-4">
                            {containers.map((d) => (
                                <div key={d.name} className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-3">
                                    <div className="flex justify-between items-start">
                                        <h3 className="font-bold text-slate-200 truncate pr-2">{d.name}</h3>
                                        <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-bold border ${d.state === 'running' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
                                            {d.state}
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-400 bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/50">
                                        Status: {d.status}
                                    </div>
                                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-700/50 mt-1">
                                        {actionLoading === d.name ? (
                                            <div className="py-2 px-4"><Loader2 className="animate-spin text-slate-500" size={18} /></div>
                                        ) : (
                                            <>
                                                {d.state !== 'running' && (
                                                    <button onClick={() => doAction(d.name, 'start')} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl text-emerald-400 transition-colors text-sm font-semibold active:scale-95">
                                                        <Play size={16} /> Start
                                                    </button>
                                                )}
                                                {d.state === 'running' && (
                                                    <>
                                                        <button onClick={() => doAction(d.name, 'stop')} className="flex items-center gap-1.5 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl text-rose-400 transition-colors text-sm font-semibold active:scale-95">
                                                            <Square size={16} /> Stop
                                                        </button>
                                                        <button onClick={() => doAction(d.name, 'restart')} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl text-amber-400 transition-colors text-sm font-semibold active:scale-95">
                                                            <RefreshCw size={16} /> Restart
                                                        </button>
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* --- WIDOK DESKTOPOWY (TABELA) --- */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-950/50 text-slate-400 text-sm uppercase">
                                    <tr>
                                        <th className="p-6">Kontener</th>
                                        <th className="p-6">Status</th>
                                        <th className="p-6">Stan</th>
                                        <th className="p-6 text-right">Akcje</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {containers.map((d) => (
                                        <tr key={d.name} className="hover:bg-slate-800/30 transition-colors">
                                            <td className="p-6 font-bold">{d.name}</td>
                                            <td className="p-6 text-slate-400 text-sm">{d.status}</td>
                                            <td className="p-6">
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold border ${d.state === 'running' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-500 border-slate-700'
                                                    }`}>
                                                    {d.state}
                                                </span>
                                            </td>
                                            <td className="p-6 text-right flex justify-end gap-2">
                                                {actionLoading === d.name ? (
                                                    <Loader2 className="animate-spin text-slate-500" size={20} />
                                                ) : (
                                                    <>
                                                        {d.state !== 'running' && (
                                                            <button onClick={() => doAction(d.name, 'start')} className="p-2 hover:bg-emerald-500/20 rounded-lg text-emerald-400 transition-colors"><Play size={18} /></button>
                                                        )}
                                                        {d.state === 'running' && (
                                                            <>
                                                                <button onClick={() => doAction(d.name, 'stop')} className="p-2 hover:bg-rose-500/20 rounded-lg text-rose-400 transition-colors"><Square size={18} /></button>
                                                                <button onClick={() => doAction(d.name, 'restart')} className="p-2 hover:bg-amber-500/20 rounded-lg text-amber-400 transition-colors"><RefreshCw size={18} /></button>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </motion.div>
    );
}

export default DockerManager;