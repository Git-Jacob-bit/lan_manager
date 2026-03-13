import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { ArrowLeft, Activity, HardDrive, Box } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

const API_BASE = `http://${window.location.hostname}:8000`;

function Telemetry() {
  const { mac } = useParams();
  const navigate = useNavigate();
  
  const [metrics, setMetrics] = useState([]);
  const [latestMetric, setLatestMetric] = useState(null);
  const [machine, setMachine] = useState(null);

  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [isInitialLoading, setIsInitialLoading] = useState(true); // Nowy stan dla "wstępnego ładowania"

  const fetchData = async () => {
    try {
      // 1. Pobierz info o maszynie (do nagłówka)
      const machinesRes = await axios.get(`${API_BASE}/machines/`);
      const currentMachine = machinesRes.data.find(m => m.mac === mac);
      setMachine(currentMachine);

      // 2. Pobierz metryki (zabezpieczone limitem 30 wyników, jak w oryginale)
      const metricsRes = await axios.get(`${API_BASE}/machines/${mac}/metrics?limit=30`);
      let data = metricsRes.data;
      
      if (data && data.length > 0) {
        // Odwracamy tablicę, żeby najstarsze były po lewej, a najnowsze po prawej
        data.reverse();
        
        // Formatujemy czas, żeby ładnie wyglądał na osi X
        const formattedData = data.map(item => ({
          ...item,
          timeLabel: new Date(item.timestamp).toLocaleTimeString()
        }));
        
        setMetrics(formattedData);
        // Najświeższy punkt danych to ostatni element w odwróconej tablicy
        setLatestMetric(formattedData[formattedData.length - 1]);

        if (isInitialLoading) {
            // Mały timeout, żeby animacja wejścia nie trwała 0.1 sekundy (wyglądałoby jak mignięcie)
            setTimeout(() => setIsInitialLoading(false), 800);
        }

        if (isFirstLoad) {
          setTimeout(() => setIsFirstLoad(false), 1000);
        }
      }
    } catch (err) {
      console.error('Błąd pobierania telemetrii:', err);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Odświeżanie co 5 sekund
    return () => clearInterval(interval);
  }, [mac]);

  // Niestandardowy Tooltip dla wykresów (żeby wyglądał mrocznie i nowocześnie)
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-800 border border-slate-700 p-3 rounded-xl shadow-xl">
          <p className="text-slate-300 text-xs mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="font-bold text-sm">
              {entry.name}: {entry.value} {entry.name.includes('Sieć') ? 'MB' : '%'}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // Funkcja pomocnicza do generowania kafelka z wykresem
  // Funkcja pomocnicza do generowania kafelka z wykresem
  const ChartCard = ({ title, dataKey, color, data, isNetwork = false }) => (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-3xl shadow-lg">
      <h3 className="text-slate-300 font-bold mb-4 ml-2">{title}</h3>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
            <XAxis dataKey="timeLabel" stroke="#64748b" fontSize={12} tickMargin={10} maxTicksLimit={8} />
            <YAxis stroke="#64748b" fontSize={12} domain={isNetwork ? ['auto', 'auto'] : [0, 100]} />
            <Tooltip content={<CustomTooltip />} />
            {isNetwork ? (
              <>
                {/* WYŁĄCZONA ANIMACJA STARTOWA (isAnimationActive={false}) */}
                <Line isAnimationActive={false} type="monotone" dataKey="net_sent" name="Wysłane (Sieć)" stroke="#f59e0b" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
                <Line isAnimationActive={false} type="monotone" dataKey="net_recv" name="Odebrane (Sieć)" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
              </>
            ) : (
              <Line isAnimationActive={false} type="monotone" dataKey={dataKey} name={title} stroke={color} strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  if (isInitialLoading) {
    return (
      <motion.div 
        key="loader"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, filter: 'blur(10px)' }}
        className="min-h-screen bg-slate-950 flex flex-col justify-center items-center"
      >
        <div className="relative">
          {/* Pulsujące kółka w tle */}
          <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full animate-pulse"></div>
          <Activity size={64} className="text-blue-500 animate-spin mb-4 relative z-10" />
        </div>
        <h2 className="text-blue-200 font-bold text-xl tracking-widest animate-pulse">
            POBIERANIE DANYCH...
        </h2>
        <p className="text-slate-500 text-sm mt-2">Nawiązywanie połączenia z maszyną</p>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans"
    >
      {/* --- GÓRNY PASEK NAWIGACJI --- */}
      <div className="max-w-7xl mx-auto flex justify-between items-center mb-8">
        <button 
          onClick={() => navigate(`/machines/${mac}`)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-colors text-sm font-medium text-slate-300"
        >
          <ArrowLeft size={16} /> Powrót do Huba
        </button>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div> Live
        </div>
      </div>

      {/* --- NAGŁÓWEK --- */}
      <div className="max-w-7xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Activity className="text-blue-500" size={32} />
            {machine ? machine.name : 'Ładowanie...'}
          </h1>
          <p className="text-slate-500 mt-2 font-mono text-sm">
            MAC: {mac} <span className="mx-2">•</span> IP: {machine?.ip || '...'}
          </p>
        </div>
        
        {/* Zdrowie Dysku */}
        <div className="flex flex-col items-end">
          <span className="text-slate-400 text-sm mb-1 font-semibold flex items-center gap-1"><HardDrive size={14}/> Zdrowie Dysku</span>
          {latestMetric ? (
            <span className={`px-4 py-1.5 rounded-xl font-bold text-sm border
              ${latestMetric.disk_health === 'OK' 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}
            >
              {latestMetric.disk_health}
            </span>
          ) : (
            <span className="text-slate-600">Brak danych</span>
          )}
        </div>
      </div>

      {/* --- WYKRESY --- */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <ChartCard title="Zużycie CPU (%)" dataKey="cpu_usage" color="#ef4444" data={metrics} />
        <ChartCard title="Zużycie RAM (%)" dataKey="ram_usage" color="#3b82f6" data={metrics} />
        <ChartCard title="Zużycie Dysku (%)" dataKey="disk_usage" color="#a855f7" data={metrics} />
        <ChartCard title="Sieć (MB)" isNetwork={true} data={metrics} />
      </div>

      {/* --- TABELA DOCKER --- */}
      <div className="max-w-7xl mx-auto bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden mb-8">
        <div className="bg-slate-900 border-b border-slate-800 p-6 flex items-center gap-3">
          <Box className="text-slate-400" />
          <h2 className="text-xl font-bold text-slate-200">Uruchomione Kontenery Docker</h2>
        </div>
        <>
            {/* --- WIDOK MOBILNY (KARTY) --- */}
            <div className="grid grid-cols-1 gap-3 md:hidden p-4">
              {!latestMetric ? (
                <div className="p-6 text-center text-slate-500 bg-slate-800/20 rounded-2xl border border-slate-800">Czekam na pierwsze dane...</div>
              ) : latestMetric.dockers && latestMetric.dockers.length > 0 ? (
                latestMetric.dockers.map((d, i) => (
                  <div key={i} className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-200 truncate pr-2">{d.name}</span>
                      <span className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-bold border ${d.state === 'running' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
                        {d.state}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 bg-slate-900/50 p-2 rounded-xl">
                      Status: {d.status}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-slate-500 bg-slate-800/20 rounded-2xl border border-slate-800">Brak uruchomionych kontenerów</div>
              )}
            </div>

            {/* --- WIDOK DESKTOPOWY (TABELA) --- */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-950/50 text-slate-400 text-sm uppercase tracking-wider border-b border-slate-800">
                    <th className="p-4 font-semibold">Nazwa kontenera</th>
                    <th className="p-4 font-semibold">Status</th>
                    <th className="p-4 font-semibold">Stan (State)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {!latestMetric ? (
                    <tr><td colSpan="3" className="p-6 text-center text-slate-500">Czekam na pierwsze dane...</td></tr>
                  ) : latestMetric.dockers && latestMetric.dockers.length > 0 ? (
                    latestMetric.dockers.map((d, i) => (
                      <tr key={i} className="hover:bg-slate-800/50 transition-colors">
                        <td className="p-4 font-bold text-slate-200">{d.name}</td>
                        <td className="p-4 text-slate-400 text-sm">{d.status}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border
                            ${d.state === 'running' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : 'bg-slate-800 text-slate-400 border-slate-700'}`}
                          >
                            {d.state}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="3" className="p-6 text-center text-slate-500">Brak uruchomionych kontenerów</td></tr>
                  )}
                </tbody>
              </table>
            </div>
        </>
      </div>
    </motion.div>
  );
}

export default Telemetry;