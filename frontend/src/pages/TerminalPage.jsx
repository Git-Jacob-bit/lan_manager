import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { ArrowLeft, RefreshCw, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const TerminalPage = () => {
    const { mac } = useParams();
    const navigate = useNavigate();

    // Używamy refów, aby zapobiec dublowaniu podczas re-renderowania Reacta
    const terminalRef = useRef(null);
    const term = useRef(null);
    const ws = useRef(null);
    const fitAddon = useRef(null);

    const [status, setStatus] = useState('loading_machine');
    const [machine, setMachine] = useState(null);

    // 1. Pobieranie danych maszyny (tylko raz po MAC)
    useEffect(() => {
        axios.get(`http://${window.location.hostname}:8000/machines/${mac}`)
            .then(res => {
                setMachine(res.data);
                setStatus('connecting');
            })
            .catch(err => {
                console.error("Błąd API:", err);
                setStatus('error');
            });
    }, [mac]);

    // 2. Inicjalizacja Terminala (tylko RAZ podczas montowania komponentu)
    useEffect(() => {
        term.current = new Terminal({
            cursorBlink: true,
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 15,
            theme: { background: '#000000', foreground: '#00ff00', cursor: '#00ff00' }
        });

        fitAddon.current = new FitAddon();
        term.current.loadAddon(fitAddon.current);
        term.current.open(terminalRef.current);
        fitAddon.current.fit();

        // Skalowanie przy zmianie rozmiaru okna
        const handleResize = () => fitAddon.current.fit();
        window.addEventListener('resize', handleResize);

        // Wysyłanie wciśniętych znaków do Agenta
        term.current.onData(data => {
            if (ws.current?.readyState === WebSocket.OPEN) {
                ws.current.send(data);
            }
        });

        // Sprzątanie po wyjściu z podstrony terminala
        return () => {
            window.removeEventListener('resize', handleResize);
            if (ws.current) ws.current.close();
            if (term.current) term.current.dispose();
        };
    }, []);

    // 3. Uruchamianie połączenia WebSocket, gdy już znamy IP maszyny
    useEffect(() => {
        if (machine && machine.ip) {
            connectTerminal();
        }
    }, [machine?.ip]); // Wywoła się, gdy IP maszyny zostanie załadowane z API

    const connectTerminal = () => {
        if (!machine) return;

        // Jeśli połączenie już istnieje, zamykamy je przed otwarciem nowego
        if (ws.current) ws.current.close();

        setStatus('connecting');
        term.current.clear();

        // ==========================================
        // LOGIKA WYBORU ADRESU IP (LAN vs TAILSCALE)
        // ==========================================
        const currentHost = window.location.hostname;
        let targetHost = machine.ip; // Domyślnie używamy zwykłego LAN IP
        let networkType = "LAN";

        // Sprawdzamy, czy łączysz się przez Tailscale (adresy zaczynające się od 100.)
        // oraz czy w bazie jest zapisany adres Tailscale dla tej maszyny
        if (currentHost.startsWith('100.') && machine.tailscale_ip) {
            targetHost = machine.tailscale_ip;
            networkType = "Tailscale";
        }

        // Zabezpieczenie: jeśli z jakiegoś powodu nie ma IP, użyj hosta z przeglądarki
        if (!targetHost) {
            targetHost = currentHost;
            networkType = "Fallback";
        }

        // Wyświetlamy użytkownikowi informację o tym, z jakiej sieci korzysta
        term.current.writeln(`\r\n[Wykryto sieć: ${networkType} -> Używam IP: ${targetHost}]`);
        term.current.writeln(`\r\n[Trwa nawiązywanie tunelu do Agenta na porcie 8001...]`);

        // Łączymy się na wybrane docelowe IP maszyny
        ws.current = new WebSocket(`ws://${targetHost}:8001/ws`);

        ws.current.onopen = () => {
            setStatus('connected');
            term.current.writeln('\r\n[POŁĄCZONO! Pełny dostęp do powłoki bash]\r\n');
        };

        ws.current.onmessage = async (event) => {
            // KLUCZOWE: Konwersja paczki Blob na tekst (żeby xterm mógł to narysować)
            const text = (event.data instanceof Blob) ? await event.data.text() : event.data;
            term.current.write(text);
        };

        ws.current.onclose = () => {
            setStatus('closed');
            term.current.writeln('\r\n\r\n[Połączenie zakończone - Agent rozłączył sesję]');
        };

        ws.current.onerror = () => {
            setStatus('error');
            term.current.writeln('\r\n[BŁĄD POŁĄCZENIA] - Upewnij się, że Agent nasłuchuje na porcie 8001.');
        };
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white flex flex-col p-6">
            <div className="flex justify-between items-center mb-6">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 transition-colors px-4 py-2 rounded-full border border-slate-800 shadow-md">
                    <ArrowLeft size={18} /> Powrót do Huba
                </button>

                <div className="text-center">
                    <h2 className="text-xl font-bold">{machine?.name || 'Ładowanie danych...'}</h2>
                    <p className="text-xs text-emerald-500 font-mono">{machine?.ip || 'Trwa wyszukiwanie IP...'}</p>
                </div>

                <div className="flex items-center gap-3 bg-slate-900 px-4 py-2 rounded-xl border border-slate-800 shadow-md">
                    {status === 'loading_machine' && <Loader2 className="animate-spin text-blue-500" size={18} />}
                    {status === 'connecting' && <Loader2 className="animate-spin text-warning" size={18} />}
                    {status === 'connected' && <CheckCircle2 className="text-emerald-500" size={18} />}
                    {(status === 'closed' || status === 'error') && <XCircle className="text-rose-500" size={18} />}

                    <span className="uppercase text-xs font-bold w-20 text-center">
                        {status === 'loading_machine' ? 'Czekam' : status}
                    </span>

                    <button onClick={connectTerminal} title="Restart sesji" className="hover:text-emerald-400 transition-colors">
                        <RefreshCw size={16} className={status === 'connecting' ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-grow bg-[#000000] border border-slate-800 rounded-2xl p-4 overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)]"
            >
                {/* Ten div musi mieć 100% wysokości, by fitAddon działał */}
                <div ref={terminalRef} className="h-full w-full" />
            </motion.div>
        </div>
    );
};

export default TerminalPage;