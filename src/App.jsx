import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { Heart, Zap, Wrench, FlaskConical, AlertTriangle, ShieldCheck, Activity, Users, X, CheckCircle2, Terminal, RefreshCw, Trash2, Key, Play, Home, Trophy, Beaker, Grid3X3, Loader2, PlusCircle, LogIn, Timer, Wifi, WifiOff, Cpu, Battery, Database, Layers, Droplets, Thermometer, Wind, Fingerprint, Copy, Award, Search, Move } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Global Constants
const DECAY_RATE = 2.8;
const GAME_DURATION = 180;

export default function App() {
  const [appState, setAppState] = useState('welcome'); 
  const [roomId, setRoomId] = useState('');
  const [role, setRole] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [countdown, setCountdown] = useState(null);
  const [partnerAfk, setPartnerAfk] = useState(false);
  const [score, setScore] = useState(0);

  const [activeTaskPool, setActiveTaskPool] = useState([]);

  const ENGINEER_POOL = ['grid', 'gencode', 'reactor', 'wires', 'battery', 'calibration', 'datalink', 'encryption'];
  const PHARMACIST_POOL = ['chem', 'terminal', 'sweep', 'sort', 'vent', 'dna', 'cooling', 'scanner'];

  // --- Sync State with DB ---
  useEffect(() => {
    if (!roomId) return;
    const fetchNow = async () => {
      const { data } = await supabase.from('game_sessions').select('*').eq('id', roomId).single();
      if (data) setGameState(data);
    };
    fetchNow();
    const channel = supabase.channel(`room_${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${roomId}` }, 
      (payload) => setGameState(payload.new))
      .subscribe();
    const poll = setInterval(() => { if (appState === 'lobby' || appState === 'role-select') fetchNow(); }, 2000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [roomId, appState]);

  // --- Transitions & Countdown ---
  useEffect(() => { if (gameState?.last_start_at && (appState === 'lobby' || appState === 'role-select')) setAppState('playing'); }, [gameState?.last_start_at, appState]);
  useEffect(() => { if (!gameState || appState !== 'lobby') return; if (gameState.engineer_taken && gameState.pharmacist_taken && !gameState.last_start_at && countdown === null) setCountdown(3); }, [gameState, countdown, appState]);
  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) { const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000); return () => clearTimeout(timer); }
    if (countdown === 0) {
      const startGame = async () => {
        if (role === 'Engineer') { await supabase.from('game_sessions').update({ last_start_at: new Date().toISOString(), base_health: 100, updated_at: new Date().toISOString() }).eq('id', roomId); }
        setCountdown(null); setAppState('playing');
      };
      startGame();
    }
  }, [countdown, role, roomId]);

  // --- Game Ticker ---
  useEffect(() => {
    const ticker = setInterval(() => {
      if (appState === 'playing' && gameState?.last_start_at) {
        const start = new Date(gameState.last_start_at).getTime();
        const elapsed = Math.floor((Date.now() - start) / 1000);
        setCurrentTime(elapsed);
        if (elapsed >= GAME_DURATION) setAppState('win');
      }
      if (gameState && role) {
        const partnerActive = role === 'Engineer' ? new Date(gameState.pharmacist_last_active).getTime() : new Date(gameState.engineer_last_active).getTime();
        setPartnerAfk((Date.now() - partnerActive) > 45000);
      }
    }, 1000);
    return () => clearInterval(ticker);
  }, [appState, gameState, role]);

  // --- Task Management ---
  useEffect(() => {
    if (appState === 'playing' && activeTaskPool.length === 0) {
      const pool = role === 'Engineer' ? ENGINEER_POOL : PHARMACIST_POOL;
      const initial = [...pool].sort(() => 0.5 - Math.random()).slice(0, 5);
      setActiveTaskPool(initial);
    }
  }, [appState, role]);

  const updateGameDB = async (updates) => {
    if (!roomId) return;
    const activityKey = role === 'Engineer' ? 'engineer_last_active' : 'pharmacist_last_active';
    await supabase.from('game_sessions').update({ ...updates, [activityKey]: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', roomId);
  };

  const calculateCurrentHealth = useCallback((dbState) => {
    if (!dbState || !dbState.last_start_at) return 100;
    const lastUpdate = new Date(dbState.updated_at || dbState.last_start_at).getTime();
    const now = Date.now();
    const secondsPassed = (now - lastUpdate) / 1000;
    return Math.max(0, dbState.base_health - (secondsPassed * DECAY_RATE));
  }, []);

  const currentHealth = useMemo(() => calculateCurrentHealth(gameState), [gameState, calculateCurrentHealth, currentTime]);

  const completeTask = (reward, taskId) => {
    updateGameDB({ base_health: Math.min(currentHealth + reward, 100) });
    setScore(s => s + 100);
    setNotification(`STABILITY RESTORED: +${reward}%`);
    setActiveTask(null);
    const pool = role === 'Engineer' ? ENGINEER_POOL : PHARMACIST_POOL;
    const remainingInPool = pool.filter(t => !activeTaskPool.includes(t));
    if (remainingInPool.length > 0) {
      const newTask = remainingInPool[Math.floor(Math.random() * remainingInPool.length)];
      setActiveTaskPool(prev => prev.map(t => t === taskId ? newTask : t));
    }
    setTimeout(() => setNotification(null), 2000);
  };

  const createRoom = async () => {
    setLoading(true);
    const newId = Math.floor(100000 + Math.random() * 900000).toString();
    const initialData = { id: newId, base_health: 100, engineer_taken: false, pharmacist_taken: false, engineer_last_active: new Date().toISOString(), pharmacist_last_active: new Date().toISOString(), updated_at: new Date().toISOString() };
    await supabase.from('game_sessions').insert([initialData]);
    setRoomId(newId); setGameState(initialData); setAppState('role-select');
    setLoading(false);
  };

  const joinRoom = async (code) => {
    setLoading(true);
    const { data } = await supabase.from('game_sessions').select('*').eq('id', code).single();
    if (data) {
      if (data.engineer_taken && data.pharmacist_taken) alert("Room Full!");
      else { setRoomId(code); setGameState(data); setAppState('role-select'); }
    } else alert("Room Invalid!");
    setLoading(false);
  };

  const exitGame = async () => {
    if (roomId) {
      await supabase.from('highscores').insert([{ room_id: roomId, score: score }]);
      await supabase.from('game_sessions').delete().eq('id', roomId);
    }
    setAppState('welcome'); setRoomId(''); setRole(null); setGameState(null); setActiveTaskPool([]); setScore(0); setCurrentTime(0);
  };

  const copyRoomId = () => { navigator.clipboard.writeText(roomId); setNotification("ROOM ID COPIED!"); setTimeout(() => setNotification(null), 2000); };

  if (loading) return <LoadingScreen />;

  return (
    <div className="relative h-screen bg-cyber-black text-white overflow-hidden font-sans select-none">
      <div className="bg-grid absolute inset-0 z-0 opacity-10" />
      <AnimatePresence mode="wait">
        {appState === 'welcome' && <WelcomeScreen onCreate={createRoom} onJoin={() => setAppState('joining')} />}
        {appState === 'joining' && <JoinScreen onJoin={joinRoom} onBack={() => setAppState('welcome')} />}
        {appState === 'role-select' && <RoleSelectScreen gameState={gameState} roomId={roomId} onCopy={copyRoomId} onSelect={async (r) => { await updateGameDB({ [r === 'Engineer' ? 'engineer_taken' : 'pharmacist_taken']: true }); setRole(r); setAppState('lobby'); }} />}
        {appState === 'lobby' && <LobbyScreen roomId={roomId} role={role} partnerIn={role === 'Engineer' ? gameState?.pharmacist_taken : gameState?.engineer_taken} countdown={countdown} onCopy={copyRoomId} />}
        {appState === 'playing' && <GamePlayScreen role={role} health={currentHealth} time={currentTime} score={score} afk={partnerAfk} tasks={activeTaskPool} onTaskSelect={setActiveTask} activeTask={activeTask} onComplete={completeTask} onCloseTask={() => setActiveTask(null)} updateDB={updateGameDB} />}
        {(currentHealth <= 0 && appState === 'playing') && <GameOverScreen score={score} onExit={exitGame} />}
        {appState === 'win' && <WinScreen score={score} onExit={exitGame} />}
      </AnimatePresence>

      {currentHealth < 30 && appState === 'playing' && (
        <motion.div animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 1.5, repeat: Infinity }} className="fixed inset-0 pointer-events-none z-[60] shadow-[inset_0_0_200px_rgba(239,68,68,0.6)]" />
      )}

      <AnimatePresence>{notification && <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }} className="fixed top-20 left-1/2 -translate-x-1/2 bg-cyber-accent text-black font-black text-[10px] px-6 py-2 rounded-full tracking-widest z-[100] shadow-2xl">{notification}</motion.div>}</AnimatePresence>
    </div>
  );
}

// --- Screens ---
function WelcomeScreen({ onCreate, onJoin }) { return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 flex flex-col items-center justify-center h-full p-8 text-center"><h1 className="text-8xl font-black italic mb-2 tracking-tighter">VESSEL</h1><p className="text-[10px] text-gray-500 font-mono tracking-[0.5em] uppercase mb-12">Core Survival Protocol</p><div className="flex flex-col gap-4 w-full max-w-xs"><button onClick={onCreate} className="py-6 bg-white text-black font-black rounded-3xl hover:scale-105 transition-all shadow-2xl">NEW MISSION</button><button onClick={onJoin} className="py-6 bg-white/5 border border-white/10 font-black rounded-3xl hover:bg-white/10 transition-all">JOIN LINK</button></div></motion.div>; }
function JoinScreen({ onJoin, onBack }) { const [code, setCode] = useState(''); return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 flex flex-col items-center justify-center h-full p-8 text-center"><h2 className="text-4xl font-black mb-12 italic">ACCESS KEY</h2><input type="text" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} className="w-64 bg-transparent border-b-4 border-white/20 py-4 text-center text-6xl font-black font-mono focus:border-cyber-accent outline-none mb-12 transition-all" placeholder="000000" /><div className="flex flex-col gap-4 w-64"><button onClick={() => onJoin(code)} className="py-5 bg-cyber-accent text-black font-black rounded-2xl">SYNC</button><button onClick={onBack} className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Back</button></div></motion.div>; }
function RoleSelectScreen({ gameState, roomId, onSelect, onCopy }) { const displayId = roomId || gameState?.id || "------"; return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 flex flex-col items-center justify-center h-full p-8 text-center"><div className="mb-12"><h2 className="text-3xl font-black italic mb-4 tracking-tighter uppercase opacity-50">Authorized Room</h2><button onClick={onCopy} className="group relative inline-block px-10 py-5 bg-white/5 border-2 border-cyber-accent/30 rounded-3xl shadow-[0_0_30px_rgba(34,211,238,0.1)] hover:bg-white/10 transition-all"><div className="text-[10px] font-mono text-cyber-accent tracking-[0.5em] uppercase mb-1 flex items-center justify-center gap-2">Access Key <Copy size={10} /></div><div className="text-6xl font-black font-mono tracking-tighter text-white">{displayId}</div></button></div><h3 className="text-4xl font-black italic mb-10 tracking-tight">SELECT YOUR UNIT</h3><div className="grid md:grid-cols-2 gap-8 w-full max-w-5xl"><RoleCard title="ENGINEER" icon={<Wrench size={40}/>} taken={gameState?.engineer_taken} onClick={() => onSelect('Engineer')} /><RoleCard title="PHARMACIST" icon={<FlaskConical size={40}/>} taken={gameState?.pharmacist_taken} onClick={() => onSelect('Pharmacist')} /></div></motion.div>; }
function RoleCard({ title, icon, taken, onClick }) { return <button onClick={onClick} disabled={taken} className={`p-10 text-left border-2 rounded-[40px] transition-all relative ${taken ? 'border-red-900 bg-red-950/20 opacity-50 grayscale' : 'border-white/5 bg-white/5 hover:border-white/10'}`}><div className={`mb-6 p-4 rounded-xl w-fit ${taken ? 'bg-red-900/40 text-red-500' : 'bg-white text-black'}`}>{icon}</div><h3 className="text-3xl font-black italic mb-2 tracking-tight">{title}</h3>{taken ? <div className="text-red-500 font-black text-[10px] animate-pulse">LOCKED</div> : <div className="text-cyber-accent font-black text-[10px]">UNIT AVAILABLE →</div>}</button>; }
function LobbyScreen({ roomId, role, partnerIn, countdown, onCopy }) { return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 flex flex-col items-center justify-center h-full p-8 text-center"><div className="mb-12"><button onClick={onCopy} className="group flex items-center gap-4 px-8 py-3 bg-white/5 rounded-2xl text-gray-500 font-mono tracking-widest mb-6 border border-white/5 hover:bg-white/10 transition-all"><span className="uppercase text-[10px]">Room ID // </span><span className="text-2xl font-black text-white">{roomId}</span><Copy size={16} className="text-cyber-accent" /></button><h2 className="text-7xl font-black italic uppercase tracking-tighter leading-tight">{role} ACTIVE</h2></div><div className="relative w-80 h-80 flex items-center justify-center border-4 border-white/5 rounded-full shadow-2xl">{partnerIn ? <AnimatePresence mode="wait"><motion.div key={countdown} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.5, opacity: 0 }} className="text-[12rem] font-black italic text-cyber-accent leading-none">{countdown !== null ? (countdown > 0 ? countdown : 'GO') : '...'}</motion.div></AnimatePresence> : <div className="flex flex-col items-center gap-8"><div className="w-16 h-16 border-4 border-white/10 border-t-cyber-accent rounded-full animate-spin" /><p className="text-xs text-white font-black tracking-[0.4em] uppercase">Awaiting Partner</p></div>}</div></motion.div>; }

function GamePlayScreen({ role, health, time, score, afk, tasks, onTaskSelect, activeTask, onComplete, onCloseTask, updateDB }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 flex flex-col h-full">
      <div className="absolute top-0 left-0 right-0 h-1 bg-white/5 z-50"><motion.div className="h-full bg-cyber-accent shadow-[0_0_10px_#22d3ee]" animate={{ width: `${(time/GAME_DURATION)*100}%` }} transition={{ ease: "linear" }} /></div>
      <div className="p-4 md:p-8 flex flex-col h-full max-w-6xl mx-auto w-full">
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4"><div className="p-3 bg-white text-black rounded-2xl shadow-xl">{role === 'Engineer' ? <Wrench size={20}/> : <FlaskConical size={20}/>}</div><div><h2 className="text-lg font-black italic tracking-tighter uppercase">{role}</h2><p className="text-[8px] font-mono text-gray-500 uppercase tracking-widest">MISSION TIME: {Math.floor(time)}s / {GAME_DURATION}s</p></div></div>
          <div className="flex flex-col items-end"><div className="flex items-center gap-2 mb-1"><Award size={14} className="text-cyber-accent" /><span className="text-2xl font-black italic font-mono tracking-tighter text-white">{score}</span></div><p className="text-[8px] font-black text-cyber-accent uppercase tracking-[0.2em]">Current Performance</p></div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center relative"><div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 text-center pointer-events-none"><motion.div key={Math.round(health)} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className={`text-7xl font-black font-mono tracking-tighter ${health < 25 ? 'text-red-500 animate-pulse' : 'text-white'}`}>{Math.round(health)}%</motion.div><div className="text-[8px] font-bold tracking-[0.4em] text-white/20 uppercase">Core Stability</div></div><LifeVessel health={health} />{afk && <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity }} className="mt-8 text-red-500 text-[10px] font-black uppercase flex items-center gap-2"><AlertTriangle size={14}/> Partner Status: Offline</motion.div>}</div>
        <div className="grid grid-cols-5 gap-3 w-full mb-8">{tasks.map((t) => (<button key={t} onClick={() => onTaskSelect(t)} className="flex flex-col items-center justify-center gap-2 p-5 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all group"><div className="text-white/20 group-hover:text-white transition-colors">{getTaskIcon(t)}</div><span className="text-[8px] font-black uppercase tracking-widest">{t.substring(0, 5)}</span></button>))}</div>
      </div>
      <AnimatePresence>{activeTask && <TaskModal task={activeTask} onComplete={(r) => onComplete(r, activeTask)} onClose={onCloseTask} role={role} updateDB={updateDB} />}</AnimatePresence>
    </motion.div>
  );
}

// --- Specific Tasks ---
function GridPulseTask({ onComplete }) {
  const [cells, setCells] = useState(Array(16).fill(false));
  const [count, setCount] = useState(0);
  useEffect(() => { const it = setInterval(() => { setCells(p => { const n = [...p]; n[Math.floor(Math.random()*16)] = true; return n; }); }, 600); return () => clearInterval(it); }, []);
  const click = (i) => { if(cells[i]) { setCells(p=>{ const n=[...p]; n[i]=false; return n; }); setCount(c => { const next = c + 1; if(next >= 15) onComplete(); return next; }); } };
  return <div className="w-full text-center"><div className="text-[10px] text-red-500 mb-4 font-black">CLEANING: {count}/15</div><div className="grid grid-cols-4 gap-4">{cells.map((a,i)=><button key={i} onClick={()=>click(i)} className={`w-14 h-14 rounded-2xl border-2 transition-all ${a?'bg-red-500 border-red-400 shadow-[0_0_20px_#ef4444]':'bg-white/5 border-white/5'}`}/>)}</div></div>;
}

function CalibrationTask({ onComplete }) {
  const [needle, setNeedle] = useState(0);
  const [target] = useState(Math.floor(Math.random()*60)+20);
  useEffect(() => { const it = setInterval(() => setNeedle(p => (p + 3) % 100), 50); return () => clearInterval(it); }, []);
  const check = () => { if(Math.abs(needle - target) < 8) onComplete(); };
  return <div className="w-full text-center"><p className="text-[10px] text-orange-500 mb-6 font-black uppercase">Sync Frequency</p><div className="relative h-4 bg-white/5 rounded-full mb-10 overflow-hidden"><div className="absolute top-0 bottom-0 bg-orange-500/40 border-x-2 border-orange-500" style={{ left: `${target-8}%`, width: '16%' }} /><motion.div className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_white]" style={{ left: `${needle}%` }} /></div><button onClick={check} className="w-full py-4 bg-orange-500 text-black font-black rounded-2xl uppercase text-[10px]">Calibrate</button></div>;
}

function DatalinkTask({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const [movingPos, setMovingPos] = useState(50);
  useEffect(() => { const it = setInterval(() => setMovingPos(p => Math.min(90, Math.max(10, p + (Math.random()-0.5)*15))), 100); return () => clearInterval(it); }, []);
  const [pos, setPos] = useState(50);
  const check = () => { if(Math.abs(pos - movingPos) < 12) { setProgress(p => { const next = p + 2; if(next >= 100) onComplete(); return next; }); } };
  return <div className="w-full text-center"><p className="text-[10px] text-purple-500 mb-6 font-black uppercase">Hold Link Zone</p><div className="relative h-20 bg-white/5 rounded-3xl mb-8 flex items-center p-4"><div className="absolute h-12 w-12 bg-purple-500/30 rounded-xl border border-purple-500 animate-pulse" style={{ left: `${movingPos-6}%` }} /><motion.input type="range" value={pos} onChange={e => {setPos(e.target.value); check();}} className="w-full accent-purple-500 opacity-80" /></div><div className="h-2 bg-purple-900 rounded-full overflow-hidden"><motion.div className="h-full bg-purple-500" animate={{ width: `${progress}%` }} /></div></div>;
}

function DNATask({ onComplete }) {
  const [sequence] = useState(['A', 'T', 'G', 'C'].sort(() => 0.5 - Math.random()));
  const [target] = useState(sequence[Math.floor(Math.random()*4)]);
  return <div className="w-full text-center text-emerald-500"><p className="text-[10px] mb-8 font-black uppercase">Match Nitrogen Base: {target}</p><div className="grid grid-cols-2 gap-4">{sequence.map(b => <button key={b} onClick={() => { if(b === target) onComplete(); }} className={`py-6 rounded-2xl border-2 font-black text-2xl transition-all ${b === target ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/5 hover:border-white/20'}`}>{b}</button>)}</div></div>;
}

function CoolingTask({ onComplete }) {
  const [temp, setTemp] = useState(50);
  useEffect(() => { const it = setInterval(() => setTemp(p => Math.min(100, p + 2)), 100); return () => clearInterval(it); }, []);
  const cool = () => { setTemp(p => { const next = Math.max(0, p - 10); if(next === 0) onComplete(); return next; }); };
  return <div className="w-full text-center text-blue-400"><p className="text-[10px] mb-6 font-black uppercase">Reduce Heat</p><div className="text-6xl font-black font-mono mb-8">{temp}°C</div><div className="h-4 bg-white/5 rounded-full mb-8 overflow-hidden"><motion.div className="h-full bg-blue-500" animate={{ width: `${temp}%` }} /></div><button onClick={cool} className="w-full py-6 bg-blue-500 text-black font-black rounded-3xl uppercase text-xs shadow-[0_0_20px_rgba(59,130,246,0.5)]">Cool Down</button></div>;
}

function ScannerTask({ onComplete }) {
  const [targetPos, setTargetPos] = useState({ x: 50, y: 50 });
  const [pos, setPos] = useState({ x: 50, y: 50 });
  useEffect(() => { const it = setInterval(() => setTargetPos({ x: Math.random()*80+10, y: Math.random()*80+10 }), 1500); return () => clearInterval(it); }, []);
  const check = () => { if(Math.abs(pos.x - targetPos.x) < 10 && Math.abs(pos.y - targetPos.y) < 10) onComplete(); };
  return <div className="w-full h-56 bg-white/5 rounded-3xl relative overflow-hidden border border-white/10"><motion.div animate={{ x: `${targetPos.x}%`, y: `${targetPos.y}%` }} className="absolute w-8 h-8 border-2 border-red-500/50 rounded-full flex items-center justify-center"><Search size={12} className="text-red-500/50" /></motion.div><motion.div drag dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }} onDrag={(e, info) => { setPos(p => ({ x: p.x + info.delta.x/2, y: p.y + info.delta.y/2 })); check(); }} className="absolute w-12 h-12 bg-cyber-accent/20 border-2 border-cyber-accent rounded-full flex items-center justify-center cursor-move"><Move size={16} className="text-cyber-accent" /></motion.div></div>;
}

function EncryptionTask({ onComplete }) {
  const [code] = useState(Math.random().toString(2).slice(2, 6));
  const [inp, setInp] = useState('');
  return <div className="w-full text-center text-violet-400"><p className="text-[10px] mb-6 font-black uppercase">Binary Sequence: {code}</p><div className="flex gap-4 justify-center mb-10">{code.split('').map((c, i) => <div key={i} className={`w-10 h-10 border-2 rounded-xl flex items-center justify-center font-black ${inp[i] ? 'border-violet-500 bg-violet-500/20' : 'border-white/10'}`}>{inp[i]}</div>)}</div><div className="grid grid-cols-2 gap-4"><button onClick={() => { const next = inp + '0'; setInp(next); if(next === code) onComplete(); if(!code.startsWith(next)) setInp(''); }} className="py-6 bg-violet-600 text-white font-black rounded-2xl text-2xl">0</button><button onClick={() => { const next = inp + '1'; setInp(next); if(next === code) onComplete(); if(!code.startsWith(next)) setInp(''); }} className="py-6 bg-violet-600 text-white font-black rounded-2xl text-2xl">1</button></div></div>;
}

function SweepTask({ onComplete }) {
  const [trash, setTrash] = useState([...Array(6)].map((_, i) => ({ id: i, x: Math.random()*70+5, y: Math.random()*70+5 })));
  const rem = (id) => { setTrash(t => { const n = t.filter(x => x.id !== id); if (n.length === 0) onComplete(); return n; }); };
  return <div className="relative w-full h-64 bg-emerald-950/20 rounded-3xl border border-emerald-500/20 p-4">{trash.map(t => <motion.button key={t.id} drag dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }} onDragEnd={() => rem(t.id)} style={{ left: `${t.x}%`, top: `${t.y}%` }} className="absolute p-4 bg-emerald-500/20 border-2 border-emerald-500 text-emerald-500 rounded-3xl cursor-grab active:cursor-grabbing"><Trash2 size={24} /></motion.button>)}</div>;
}

function TaskModal({ task, onComplete, onClose, role, updateDB }) {
  const colors = { grid: 'border-red-500 text-red-500', chem: 'border-pharmacist text-pharmacist', reactor: 'border-engineer text-engineer', gencode: 'border-engineer text-engineer', terminal: 'border-pharmacist text-pharmacist', sweep: 'border-emerald-500 text-emerald-500', sort: 'border-cyan-500 text-cyan-500', vent: 'border-white text-white', calibration: 'border-orange-500 text-orange-500', datalink: 'border-purple-500 text-purple-500', dna: 'border-emerald-400 text-emerald-400', cooling: 'border-blue-400 text-blue-400', scanner: 'border-red-400 text-red-400', encryption: 'border-violet-500 text-violet-500' };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/95 backdrop-blur-3xl">
      <div className={`w-full max-w-sm rounded-[45px] p-12 relative border-2 bg-white/[0.02] ${colors[task] || 'border-white/10'}`}>
        <button onClick={onClose} className="absolute top-10 right-10 opacity-20 hover:opacity-100 transition-opacity"><X size={28}/></button>
        <h2 className="text-3xl font-black mb-10 italic uppercase tracking-tighter">{task.replace('_', ' ')}</h2>
        <div className="min-h-[250px] flex items-center justify-center bg-white/5 rounded-[40px] p-8 border border-white/5">
          {task === 'grid' && <GridPulseTask onComplete={() => onComplete(10)} />}
          {task === 'chem' && <ChemistryTask onComplete={() => onComplete(12)} />}
          {task === 'reactor' && <ReactorTask onComplete={() => onComplete(15)} />}
          {task === 'gencode' && <GenCodeTask onComplete={() => onComplete(8)} updateDB={updateDB} />}
          {task === 'terminal' && <TerminalTask onComplete={() => onComplete(15)} />}
          {task === 'sweep' && <SweepTask onComplete={() => onComplete(12)} />}
          {task === 'wires' && <WiresTask onComplete={() => onComplete(10)} />}
          {task === 'battery' && <BatteryTask onComplete={() => onComplete(8)} />}
          {task === 'sort' && <SortTask onComplete={() => onComplete(12)} />}
          {task === 'vent' && <VentTask onComplete={() => onComplete(10)} />}
          {task === 'calibration' && <CalibrationTask onComplete={() => onComplete(12)} />}
          {task === 'datalink' && <DatalinkTask onComplete={() => onComplete(15)} />}
          {task === 'dna' && <DNATask onComplete={() => onComplete(12)} />}
          {task === 'cooling' && <CoolingTask onComplete={() => onComplete(15)} />}
          {task === 'scanner' && <ScannerTask onComplete={() => onComplete(12)} />}
          {task === 'encryption' && <EncryptionTask onComplete={() => onComplete(15)} />}
        </div>
      </div>
    </div>
  );
}

// --- Common Components ---
function getTaskIcon(task) { const icons = { grid: <Grid3X3 size={18}/>, gencode: <Key size={18}/>, reactor: <RefreshCw size={18}/>, wires: <Zap size={18}/>, battery: <Battery size={18}/>, calibration: <Cpu size={18}/>, datalink: <Database size={18}/>, encryption: <Layers size={18}/>, chem: <Beaker size={18}/>, terminal: <Terminal size={18}/>, sweep: <Trash2 size={18}/>, sort: <Droplets size={18}/>, vent: <Wind size={18}/>, dna: <Fingerprint size={18}/>, cooling: <Thermometer size={18}/>, scanner: <Activity size={18}/> }; return icons[task] || <CheckCircle2 size={18}/>; }
function LifeVessel({ health }) { return <div className="relative w-48 h-80"><div className="absolute inset-0 glass-vessel rounded-[60px] overflow-hidden border-4 border-white/5"><motion.div animate={{ height: `${health}%` }} className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-cyan-600 via-cyan-300 liquid-wave" style={{ transformOrigin: 'bottom' }} /></div><div className="absolute inset-4 border-l-2 border-t-2 border-white/10 rounded-[50px] pointer-events-none" /></div>; }
function LoadingScreen() { return <div className="h-screen flex flex-col items-center justify-center bg-cyber-black text-white"><Loader2 className="w-12 h-12 text-cyber-accent animate-spin" /><p className="mt-8 font-mono text-[10px] tracking-widest uppercase">Syncing Protocol...</p></div>; }
function GameOverScreen({ score, onExit }) { return <div className="h-screen flex flex-col items-center justify-center p-8 bg-red-950/40 text-center backdrop-blur-xl z-[300] fixed inset-0"><AlertTriangle size={100} className="text-red-500 mb-8" /><h1 className="text-7xl font-black text-red-500 mb-4 italic tracking-tighter">FAILURE</h1><p className="mb-16 font-mono text-white uppercase tracking-widest">Final Performance Score: {score}</p><button onClick={onExit} className="py-6 px-12 bg-white text-black font-black rounded-3xl uppercase tracking-widest text-xs">Home</button></div>; }
function WinScreen({ score, onExit }) { return <div className="h-screen flex flex-col items-center justify-center p-8 bg-cyber-accent/20 text-center backdrop-blur-xl z-[300] fixed inset-0"><Trophy size={100} className="text-cyber-accent mb-8" /><h1 className="text-7xl font-black text-cyber-accent mb-4 italic tracking-tighter">STABILIZED</h1><p className="mb-16 font-mono text-white uppercase tracking-widest">Master Score: {score}</p><button onClick={onExit} className="py-6 px-16 bg-cyber-accent text-black font-black rounded-3xl uppercase tracking-widest text-xs">Safe Return</button></div>; }

// --- Existing Tasks (Keep original logic) ---
function SortTask({ onComplete }) {
  const [items, setItems] = useState(['cyan', 'cyan', 'magenta', 'magenta', 'cyan'].sort(() => 0.5 - Math.random()));
  const click = (color, idx) => { if (color === 'cyan') { const nextItems = items.filter((_, i) => i !== idx); setItems(nextItems); if (nextItems.filter(c => c === 'cyan').length === 0) onComplete(); } };
  return <div className="flex flex-col gap-6 items-center"><p className="text-[10px] text-cyan-500 uppercase tracking-widest font-black">Cyan Filter</p><div className="flex gap-4 flex-wrap justify-center">{items.map((color, i) => <button key={i} onClick={() => click(color, i)} className={`w-14 h-14 rounded-2xl ${color === 'cyan' ? 'bg-cyan-400 shadow-[0_0_15px_#22d3ee]' : 'bg-pink-500'}`} />)}</div></div>;
}
function WiresTask({ onComplete }) {
  const [order] = useState([1, 2, 3, 4].sort(() => 0.5 - Math.random()));
  const [currentIdx, setCurrentIdx] = useState(0);
  const click = (val) => { if(val === order[currentIdx]) { if(currentIdx === 3) onComplete(); else setCurrentIdx(c => c + 1); } else setCurrentIdx(0); };
  return <div className="flex flex-col gap-4 items-center text-yellow-500"><p className="text-[10px] mb-2 font-black">SEQUENCE: {order.join(' ')}</p><div className="flex gap-4">{[1, 2, 3, 4].map(v => <button key={v} onClick={() => click(v)} className={`w-14 h-14 rounded-full border-2 font-black ${currentIdx > order.indexOf(v) ? 'bg-yellow-500 border-yellow-400 text-black' : 'bg-white/5 border-white/10'}`}>{v}</button>)}</div></div>;
}
function BatteryTask({ onComplete }) {
  const [charge, setCharge] = useState(0);
  const [holding, setHolding] = useState(false);
  useEffect(() => { if(holding) { const it = setInterval(() => { setCharge(c => { const next = c + 3; if(next >= 100) onComplete(); return next; }); }, 50); return () => clearInterval(it); } }, [holding]);
  return <div className="text-center w-full"><div className="h-10 w-full bg-white/5 rounded-2xl mb-8 overflow-hidden"><motion.div className="h-full bg-yellow-500 shadow-[0_0_15px_#eab308]" animate={{ width: `${charge}%` }} /></div><button onMouseDown={() => setHolding(true)} onMouseUp={() => setHolding(false)} onTouchStart={() => setHolding(true)} onTouchEnd={() => setHolding(false)} className="px-12 py-6 bg-yellow-500 text-black font-black rounded-3xl uppercase text-xs tracking-widest active:scale-95 transition-all">Charge</button></div>;
}
function VentTask({ onComplete }) {
  const [pressure, setPressure] = useState(50);
  useEffect(() => { const it = setInterval(() => setPressure(p => Math.min(100, p + 3)), 150); return () => clearInterval(it); }, []);
  const vent = () => { setPressure(p => { const next = Math.max(0, p - 35); if(next === 0) onComplete(); return next; }); };
  return <div className="text-center w-full"><div className={`text-4xl font-black font-mono mb-8 ${pressure > 80 ? 'text-red-500 animate-pulse' : 'text-white'}`}>{pressure}% PSI</div><button onClick={vent} className="w-full py-5 bg-white/5 border-2 border-white/20 rounded-2xl font-black uppercase text-xs hover:bg-white/10">Purge Vent</button></div>;
}
function ChemistryTask({ onComplete }) {
  const [target] = useState(Math.floor(Math.random()*40)+20);
  const [cur, setCur] = useState(0);
  const add = (v) => { const n=cur+v; if(n===target) onComplete(); if(n>target) setCur(0); else setCur(n); };
  return <div className="text-center w-full text-pharmacist"><p className="text-[10px] mb-4 uppercase font-black tracking-widest">Synthesis Target: {target}mg</p><div className="text-7xl font-black mb-12 font-mono">{cur}</div><div className="flex gap-4 justify-center">{[3,7,11].map(v=><button key={v} onClick={()=>add(v)} className="w-16 h-16 bg-white/10 border-2 border-pharmacist/40 rounded-3xl text-pharmacist font-black text-xl hover:bg-pharmacist/20">+{v}</button>)}</div></div>;
}
function ReactorTask({ onComplete }) {
  const [vals, setVals] = useState([50, 50, 50]);
  const [targets] = useState([Math.floor(Math.random()*60+20), Math.floor(Math.random()*60+20), Math.floor(Math.random()*60+20)]);
  useEffect(() => { const it = setInterval(() => { setVals(v => v.map(x => Math.max(0, Math.min(100, x + (Math.random()-0.5)*5)))); }, 150); return () => clearInterval(it); }, []);
  const adjust = (i, d) => { setVals(v => { const next = [...v]; next[i] = Math.max(0, Math.min(100, next[i] + d)); if (next.every((x, idx) => Math.abs(x - targets[idx]) < 12)) setTimeout(onComplete, 500); return next; }); };
  return <div className="flex flex-col gap-6 w-full text-engineer">{vals.map((v, i) => <div key={i} className="flex flex-col gap-1"><div className="relative h-6 bg-white/5 rounded-2xl overflow-hidden border border-white/10"><div className="absolute top-0 bottom-0 bg-engineer/30 border-x-2 border-engineer" style={{ left: `${targets[i]-10}%`, width: '20%' }} /><motion.div className="h-full bg-engineer/60" animate={{ width: `${v}%` }} /></div><div className="flex justify-between gap-3"><button onClick={() => adjust(i, -12)} className="flex-1 py-2 bg-white/5 border border-white/10 text-engineer text-[10px] font-black rounded-xl">-</button><button onClick={() => adjust(i, 12)} className="flex-1 py-2 bg-white/5 border border-white/10 text-engineer text-[10px] font-black rounded-xl">+</button></div></div>)}</div>;
}
function GenCodeTask({ onComplete, updateDB }) {
  const [code, setCode] = useState('----');
  const gen = () => { const c = Math.floor(1000 + Math.random() * 9000).toString(); setCode(c); updateDB({ sync_code: c }); };
  return <div className="text-center w-full"><div className="text-7xl font-black font-mono mb-12 text-engineer drop-shadow-[0_0_15px_#22c55e]">{code}</div><div className="flex flex-col gap-4"><button onClick={gen} className="w-full py-5 bg-engineer text-black font-black rounded-2xl shadow-lg hover:scale-105 transition-all">Generate Sync Code</button><button onClick={() => onComplete()} className="w-full py-3 bg-white/5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Validate</button></div></div>;
}
function TerminalTask({ onComplete }) {
  const [inp, setInp] = useState('');
  return <div className="text-center w-full text-pharmacist"><p className="text-[10px] mb-6 font-black uppercase">Input Authorization</p><input type="text" maxLength={4} value={inp} onChange={(e) => { setInp(e.target.value); if(e.target.value.length === 4) onComplete(); }} className="w-full bg-white/5 border-2 border-pharmacist/40 rounded-3xl py-6 text-center text-6xl font-black font-mono text-pharmacist outline-none focus:border-pharmacist shadow-[inset_0_0_20px_rgba(236,72,153,0.1)]" placeholder="----" /></div>;
}
