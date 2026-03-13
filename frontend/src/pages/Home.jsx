import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Server, Power, PowerOff, Activity, ShieldAlert, Zap, ArrowRight, RefreshCw, X } from 'lucide-react'; // <-- Dodano 'X'
import { useNavigate } from 'react-router-dom';

const API_BASE = `http://${window.location.hostname}:8000`; 

function Home() {
    const [machines, setMachines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);

    // --- NOWY STAN DLA NASZEGO MODALA ---
    const [dialog, setDialog] = useState({ isOpen: false, type: '', mac: '', name: '' });

    const navigate = useNavigate();

    const fetchMachines = async () => {
        try {
            const response = await axios.get(`${API_BASE}/machines/`);
            setMachines(response.data);
            setError(null);
        } catch (err) {
            setError('Brak połączenia z serwerem API.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMachines();
        const interval = setInterval(fetchMachines, 5000);
        return () => clearInterval(interval);
    }, []);

    // Zamiast systemowego alertu, pokazujemy okienko
    const handleWake = (mac, name) => {
        setDialog({ isOpen: true, type: 'wake', mac, name });
    };

    // Zamiast systemowego alertu, pokazujemy okienko
    const handlePowerOff = (mac, name) => {
        setDialog({ isOpen: true, type: 'poweroff', mac, name });
    };

    // Ta funkcja odpala się po kliknięciu "Tak" w naszym okienku
    const confirmAction = async () => {
        const { type, mac, name } = dialog;
        setDialog({ isOpen: false, type: '', mac: '', name: '' }); // Zamykamy modal
        setActionLoading(mac);
        
        try {
            if (type === 'wake') {
                await axios.post(`${API_BASE}/api/machines/${mac}/wake`);
            } else if (type === 'poweroff') {
                await axios.post(`${API_BASE}/api/machines/${mac}/power`, { action: 'shutdown' });
                setTimeout(fetchMachines, 1500);
            }
        } catch (err) {
            console.error(`Błąd: ${err.response?.data?.detail || err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) return <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-blue-400 gap-4"><Activity className="animate-spin" size={48} /><span className="text-xl">Inicjalizacja...</span></div>;

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans selection:bg-blue-500/30 relative"
        >      
            <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20"><Server size={32} className="text-blue-400" /></div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">LAN Manager</h1>
                        <p className="text-xs md:text-sm text-slate-500 font-medium tracking-wide uppercase">Centrum Dowodzenia</p>
                    </div>
                </div>
                
                {/* TUTAJ DODANO WSKAŹNIK AUTO-ODŚWIEŻANIA OBOK PRZYCISKU */}
                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                        <Activity size={14} className="animate-pulse" />
                        <span>Autoodświeżanie</span>
                    </div>
                    <button onClick={fetchMachines} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-800/50 hover:bg-slate-700 border border-slate-700 text-sm font-medium transition-all active:scale-95">
                        <RefreshCw size={16} className={actionLoading ? "animate-spin" : ""} /> Odśwież
                    </button>
                </div>
            </header>

            {error && <div className="max-w-7xl mx-auto mb-8 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-400"><ShieldAlert size={24} /><p>{error}</p></div>}

            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {machines.map((machine) => {
                    const isOnline = machine.status === 'online';
                    const isServer = machine.is_server || machine.name.toLowerCase().includes('server');

                    return (
                        <div key={machine.id} className={`relative overflow-hidden bg-slate-900 border ${isOnline ? 'border-slate-700/80 shadow-xl' : 'border-slate-800 opacity-80'} rounded-3xl p-6 transition-all duration-300 hover:-translate-y-1`}>
                            {isOnline && <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl"></div>}

                            <div className="flex justify-between items-start mb-6 relative z-10">
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    {machine.name} {isServer && <span className="bg-amber-500/20 text-amber-400 text-[10px] uppercase font-bold px-2 py-1 rounded-md">Serwer</span>}
                                </h2>
                                <div className="flex items-center gap-2 bg-slate-950/50 px-3 py-1.5 rounded-full border border-slate-800">
                                    <div className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
                                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">{isOnline ? 'Online' : 'Offline'}</span>
                                </div>
                            </div>

                            <div className="space-y-4 mb-8 relative z-10 bg-slate-950/50 p-4 rounded-2xl border border-slate-800/50">
                                <div className="flex justify-between items-center mb-2"><span className="text-xs text-slate-500 uppercase font-bold">LAN IP</span><span className="font-mono text-sm text-blue-300">{machine.ip}</span></div>
                                <div className="flex justify-between items-center"><span className="text-xs text-slate-500 uppercase font-bold">MAC</span><span className="font-mono text-xs text-slate-400">{machine.mac}</span></div>
                                {machine.tailscale_ip && <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-800"><span className="text-xs text-slate-500 uppercase font-bold">Tailscale</span><span className="font-mono text-xs text-emerald-400">{machine.tailscale_ip}</span></div>}
                            </div>

                            <div className="grid grid-cols-2 gap-3 relative z-10">
                                <button
                                    disabled={!isOnline}
                                    onClick={() => navigate(`/machines/${machine.mac}`)}
                                    className={`col-span-2 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 ${isOnline ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                                >
                                    <Activity size={18} /> Otwórz Dashboard <ArrowRight size={16} />
                                </button>
                                
                                <button 
                                    onClick={() => handleWake(machine.mac, machine.name)} 
                                    disabled={isOnline || actionLoading === machine.mac} 
                                    className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 ${!isOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white hover:shadow-lg' : 'bg-slate-800 text-slate-600 opacity-50 cursor-not-allowed'}`}
                                >
                                    <Zap size={16} /> Włącz
                                </button>
                                
                                <button 
                                    onClick={() => handlePowerOff(machine.mac, machine.name)} 
                                    disabled={!isOnline || isServer || actionLoading === machine.mac} 
                                    className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 ${isOnline && !isServer ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500 hover:text-white hover:shadow-lg' : 'bg-slate-800 text-slate-600 opacity-50 cursor-not-allowed'}`}
                                >
                                    <PowerOff size={16} /> Wyłącz
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* --- CUSTOMOWY MODAL POTWIERDZENIA --- */}
            {dialog.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-sm w-full shadow-2xl"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                {dialog.type === 'wake' ? <Zap className="text-emerald-400" /> : <PowerOff className="text-rose-400" />}
                                Potwierdzenie
                            </h3>
                            <button onClick={() => setDialog({ isOpen: false, type: '', mac: '', name: '' })} className="text-slate-400 hover:text-white transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <p className="text-slate-400 mb-8 leading-relaxed">
                            Czy na pewno chcesz <strong className={dialog.type === 'wake' ? 'text-emerald-400' : 'text-rose-400'}>{dialog.type === 'wake' ? 'obudzić' : 'wyłączyć'}</strong> maszynę <span className="text-white font-semibold">{dialog.name}</span>?
                        </p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setDialog({ isOpen: false, type: '', mac: '', name: '' })}
                                className="flex-1 py-3 rounded-xl font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
                            >
                                Anuluj
                            </button>
                            <button
                                onClick={confirmAction}
                                className={`flex-1 py-3 rounded-xl font-semibold text-white transition-colors shadow-lg ${
                                    dialog.type === 'wake' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20' : 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/20'
                                }`}
                            >
                                Tak, {dialog.type === 'wake' ? 'włącz' : 'wyłącz'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </motion.div>
    );
}

export default Home;