import { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Server, Power, PowerOff, Activity, ShieldAlert, Zap, ArrowRight, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom'; // <--- DODANY IMPORT DO NAWIGACJI

const API_BASE = `http://${window.location.hostname}:8000`; // Na razie wracamy na sztywny localhost

function Home() {
    const [machines, setMachines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);

    const navigate = useNavigate(); // <--- INICJALIZACJA NAWIGACJI

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

    const handleWake = async (mac, name) => {
        if (!window.confirm(`Czy na pewno chcesz obudzić maszynę ${name}?`)) return;
        setActionLoading(mac);
        try {
            await axios.post(`${API_BASE}/api/machines/${mac}/wake`);
            alert(`⚡ Wysłano "Magic Packet" do ${name}.`);
        } catch (err) {
            alert(`Błąd: ${err.response?.data?.detail || err.message}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handlePowerOff = async (mac, name) => {
        if (!window.confirm(`⚠️ Czy NA PEWNO chcesz WYŁĄCZYĆ komputer ${name}?`)) return;
        setActionLoading(mac);
        try {
            await axios.post(`${API_BASE}/api/machines/${mac}/power`, { action: 'shutdown' });
            alert(`🛑 Rozkaz wyłączenia wysłany do ${name}.`);
            setTimeout(fetchMachines, 1500);
        } catch (err) {
            alert(`Błąd: ${err.response?.data?.detail || err.message}`);
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
            className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans selection:bg-blue-500/30"
        >      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center mb-10 gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20"><Server size={32} className="text-blue-400" /></div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">LAN Manager</h1>
                        <p className="text-xs md:text-sm text-slate-500 font-medium tracking-wide uppercase">Centrum Dowodzenia</p>
                    </div>
                </div>
                <button onClick={fetchMachines} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-800/50 hover:bg-slate-700 border border-slate-700 text-sm font-medium transition-all active:scale-95">
                    <RefreshCw size={16} className={actionLoading ? "animate-spin" : ""} /> Odśwież
                </button>
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
                                {/* TUTAJ JEST ZMIANA: Dodano nawigację po kliknięciu */}
                                <button
                                    disabled={!isOnline}
                                    onClick={() => navigate(`/machines/${machine.mac}`)}
                                    className={`col-span-2 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all active:scale-95 ${isOnline ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                                >
                                    <Activity size={18} /> Otwórz Dashboard <ArrowRight size={16} />
                                </button>
                                <button onClick={() => handleWake(machine.mac, machine.name)} disabled={isOnline || actionLoading === machine.mac} className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${!isOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-600 opacity-50'}`}><Zap size={16} /> Włącz</button>
                                <button onClick={() => handlePowerOff(machine.mac, machine.name)} disabled={!isOnline || isServer || actionLoading === machine.mac} className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all ${isOnline && !isServer ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-slate-800 text-slate-600 opacity-50'}`}><PowerOff size={16} /> Wyłącz</button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </motion.div>);
}

export default Home;