import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { Heart, Zap, Wrench, FlaskConical, AlertTriangle, ShieldCheck, Activity, Users, X, CheckCircle2, Terminal, RefreshCw, Trash2, Key, Play, Home, Trophy, Beaker, Grid3X3, Loader2, PlusCircle, LogIn, Timer, Wifi, WifiOff, Cpu, Battery, Database, Layers, Droplets, Thermometer, Wind, Fingerprint, Copy, Award, Search, Move, TrendingUp, ZapOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Global Constants
const BASE_DECAY = 2.8;
const CRITICAL_DECAY = 5.0;
const GAME_DURATION = 120; // 2 Minutes

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
  const [leaderboard, setLeaderboard] = useState([]);
  
  const hasSavedScore = useRef(false);

  // AFK Local State
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [isAfkWarning, setIsAfkWarning] = useState(false);

  const [activeTaskPool, setActiveTaskPool] = useState([]);

  const ENGINEER_POOL = ['grid', 'gencode', 'reactor', 'wires', 'battery', 'calibration', 'datalink', 'encryption'];
  const PHARMACIST_POOL = ['chem', 'terminal', 'sweep', 'sort', 'vent', 'dna', 'cooling', 'scanner'];

  // --- Core Health Calculation ---
  const calculateCurrentHealth = useCallback((dbState) => {
    if (!dbState || !dbState.last_start_at) return 100;
    const lastUpdate = new Date(dbState.updated_at || dbState.last_start_at).getTime();
    const now = Date.now();
    const start = new Date(dbState.last_start_at).getTime();
    const currentT = Math.floor((now - start) / 1000);
    
    const decay = currentT >= 90 ? CRITICAL_DECAY : BASE_DECAY;
    const secondsPassed = (now - lastUpdate) / 1000;
    
    return Math.max(0, dbState.base_health - (secondsPassed * decay));
  }, []);

  const currentHealth = useMemo(() => calculateCurrentHealth(gameState), [gameState, calculateCurrentHealth, currentTime]);

  // --- Database Sync Functions ---
  const updateGameDB = async (updates) => {
    if (!roomId) return;
    const activityKey = role === 'Engineer' ? 'engineer_last_active' : 'pharmacist_last_active';
    await supabase.from('game_sessions').update({ 
      ...updates, 
      [activityKey]: new Date().toISOString(), 
      updated_at: new Date().toISOString() 
    }).eq('id', roomId);
  };

  const saveFinalScore = async (finalScore) => {
    if (hasSavedScore.current || !roomId || finalScore <= 0) return;
    hasSavedScore.current = true;
    
    try {
      const { error } = await supabase.from('highscores').insert([
        { room_id: String(roomId), score: parseInt(finalScore) }
      ]);
      
      if (error) {
        console.error("LEADERBOARD SYNC ERROR:", error);
        setNotification("SYNC ERR: " + error.message.substring(0, 20));
        hasSavedScore.current = false; 
        setTimeout(() => setNotification(null), 3000); 
      } else {
        setNotification("RECORDS UPDATED!");
        fetchLeaderboard();
        setTimeout(() => setNotification(null), 3000); 
      }
    } catch (e) {
      console.error("DB EXCEPTION:", e);
      setNotification("DB ERROR OCCURRED");
      setTimeout(() => setNotification(null), 3000);
    }
  };

  // --- AFK Detection ---
  useEffect(() => {
    const handleActivity = () => { setLastActivity(Date.now()); setIsAfkWarning(false); };
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    return () => { window.removeEventListener('mousedown', handleActivity); window.removeEventListener('touchstart', handleActivity); };
  }, []);

  useEffect(() => {
    if (appState !== 'playing') return;
    const it = setInterval(() => {
      if (Date.now() - lastActivity > 30000) setIsAfkWarning(true);
    }, 1000);
    return () => clearInterval(it);
  }, [lastActivity, appState]);

  // --- Game Over Auto-Save ---
  useEffect(() => {
    if (appState === 'playing' && currentHealth <= 0) {
      setAppState('gameover');
      saveFinalScore(score);
    }
  }, [currentHealth, appState, score]);

  // --- Sync State with DB (Realtime) ---
  useEffect(() => {
    if (!roomId) return;
    const fetchNow = async () => {
      const { data } = await supabase.from('game_sessions').select('*').eq('id', roomId).single();
      if (data) setGameState(data);
    };
    fetchNow();
    const channel = supabase.channel(`room_${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions', filter: `id=eq.${roomId}` }, 
      (payload) => {
        if (payload.eventType === 'DELETE') {
          if (appState === 'playing') return; 
          setAppState('welcome'); setRoomId(''); setRole(null); setGameState(null); setNotification("SESSION CLOSED"); setTimeout(() => setNotification(null), 3000);
        } else setGameState(payload.new);
      })
      .subscribe();
    const poll = setInterval(() => { if (appState === 'lobby' || appState === 'role-select') fetchNow(); }, 2000);
    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [roomId, appState]);

  // --- Game State Transitions ---
  useEffect(() => { if (gameState?.last_start_at && (appState === 'lobby' || appState === 'role-select')) setAppState('playing'); }, [gameState?.last_start_at, appState]);
  useEffect(() => { if (!gameState || appState !== 'lobby') return; if (gameState.engineer_taken && gameState.pharmacist_taken && !gameState.last_start_at && countdown === null) setCountdown(3); }, [gameState, countdown, appState]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) { const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000); return () => clearTimeout(timer); }
    if (countdown === 0) {
      const startGame = async () => {
        if (role === 'Engineer') { await supabase.from('game_sessions').update({ last_start_at: new Date().toISOString(), base_health: 100, updated_at: new Date().toISOString() }).eq('id', roomId); }
        setCountdown(null); setAppState('playing'); hasSavedScore.current = false;
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
        if (elapsed >= GAME_DURATION) {
          setAppState('win');
          saveFinalScore(score);
        }
      }
      if (gameState && role) {
        const partnerActive = role === 'Engineer' ? new Date(gameState.pharmacist_last_active).getTime() : new Date(gameState.engineer_last_active).getTime();
        setPartnerAfk((Date.now() - partnerActive) > 45000);
      }
    }, 1000);
    return () => clearInterval(ticker);
  }, [appState, gameState, role, score]);

  // --- Task Pool Management ---
  useEffect(() => {
    if (appState === 'playing' && activeTaskPool.length === 0) {
      const pool = role === 'Engineer' ? ENGINEER_POOL : PHARMACIST_POOL;
      const initial = [...pool].sort(() => 0.5 - Math.random()).slice(0, 5);
      setActiveTaskPool(initial);
    }
  }, [appState, role]);

  const completeTask = (reward, taskId) => {
    setTimeout(() => {
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
    }, 0);
  };

  const fetchLeaderboard = async () => {
    const { data } = await supabase.from('highscores').select('*').order('score', { ascending: false }).limit(5);
    if (data) setLeaderboard(data);
  };

  useEffect(() => { if (appState === 'welcome') { fetchLeaderboard(); } }, [appState]);

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
    if (roomId) await supabase.from('game_sessions').delete().eq('id', roomId);
    setAppState('welcome'); setRoomId(''); setRole(null); setGameState(null); setActiveTaskPool([]); setScore(0); setCurrentTime(0);
  };

  const copyRoomId = () => { navigator.clipboard.writeText(roomId); setNotification("ROOM ID COPIED!"); setTimeout(() => setNotification(null), 2000); };

  if (loading) return <LoadingScreen />;

  return (
    <div className="relative h-[100dvh] bg-cyber-black text-white font-sans select-none overflow-hidden flex flex-col">
      <div className="bg-grid absolute inset-0 z-0 opacity-10" />
      <AnimatePresence mode="wait">
        {appState === 'welcome' && <WelcomeScreen onCreate={createRoom} onJoin={() => setAppState('joining')} leaderboard={leaderboard} />}
        {appState === 'joining' && <JoinScreen onJoin={joinRoom} onBack={() => setAppState('welcome')} />}
        {appState === 'role-select' && <RoleSelectScreen gameState={gameState} roomId={roomId} onCopy={copyRoomId} onSelect={async (r) => { await updateGameDB({ [r === 'Engineer' ? 'engineer_taken' : 'pharmacist_taken']: true }); setRole(r); setAppState('lobby'); }} onBack={exitGame} />}
        {appState === 'lobby' && <LobbyScreen roomId={roomId} role={role} partnerIn={role === 'Engineer' ? gameState?.pharmacist_taken : gameState?.engineer_taken} countdown={countdown} onCopy={copyRoomId} />}
        {appState === 'playing' && <GamePlayScreen role={role} health={currentHealth} time={currentTime} score={score} afk={partnerAfk} tasks={activeTaskPool} onTaskSelect={setActiveTask} activeTask={activeTask} onComplete={completeTask} onCloseTask={() => setActiveTask(null)} updateDB={updateGameDB} />}
        {appState === 'gameover' && <GameOverScreen score={score} onExit={exitGame} />}
        {appState === 'win' && <WinScreen score={score} onExit={exitGame} />}
      </AnimatePresence>

      <AnimatePresence>
        {isAfkWarning && appState === 'playing' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-red-950/80 backdrop-blur-xl">
            <div className="bg-black border-2 border-red-500 p-12 rounded-[40px] text-center max-w-xs shadow-[0_0_50px_rgba(239,68,68,0.3)]">
              <ZapOff size={60} className="text-red-500 mx-auto mb-6 animate-bounce" />
              <h2 className="text-3xl font-black italic text-white mb-4 uppercase tracking-tighter">AFK DETECTED</h2>
              <p className="text-[10px] font-bold text-gray-400 mb-8 uppercase tracking-widest">Inactivity detected for 30s. Vessel stability at risk.</p>
              <button onClick={() => { setLastActivity(Date.now()); setIsAfkWarning(false); updateGameDB({}); }} className="w-full py-5 bg-red-500 text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all uppercase tracking-widest text-xs">I'M HERE</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {currentHealth < 30 && appState === 'playing' && (
        <motion.div animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 1.5, repeat: Infinity }} className="fixed inset-0 pointer-events-none z-[60] shadow-[inset_0_0_200px_rgba(239,68,68,0.6)]" />
      )}

      <AnimatePresence>{notification && <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }} className="fixed top-20 left-1/2 -translate-x-1/2 bg-cyber-accent text-black font-black text-[10px] px-6 py-2 rounded-full tracking-widest z-[100] shadow-2xl">{notification}</motion.div>}</AnimatePresence>
    </div>
  );
}

// --- Screens ---
function WelcomeScreen({ onCreate, onJoin, leaderboard }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 flex flex-col md:flex-row items-center justify-center h-full w-full p-6 py-10 md:p-8 text-center md:text-left gap-8 md:gap-24 max-w-5xl mx-auto overflow-y-auto pb-12">
      <div className="flex flex-col items-center md:items-start max-w-sm w-full mt-auto md:mt-0">
        <h1 className="text-7xl md:text-8xl font-black italic mb-2 tracking-tighter text-white leading-none">VESSEL</h1>
        <p className="text-[9px] md:text-[10px] text-gray-500 font-mono tracking-[0.4em] md:tracking-[0.5em] uppercase mb-10 md:mb-12">Core Survival Protocol</p>
        <div className="flex flex-col gap-4 w-full px-2 md:px-0">
          <button onClick={onCreate} className="py-5 md:py-6 bg-white text-black font-black rounded-3xl hover:scale-105 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)] uppercase tracking-widest text-xs">NEW MISSION</button>
          <button onClick={onJoin} className="py-5 md:py-6 bg-white/5 border border-white/10 font-black rounded-3xl hover:bg-white/10 transition-all uppercase tracking-widest text-xs text-white">JOIN LINK</button>
        </div>
      </div>
      <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-[30px] md:rounded-[40px] p-6 md:p-10 backdrop-blur-xl mb-auto md:mb-0 mt-4 md:mt-0">
        <div className="flex flex-col items-center md:items-start gap-2 mb-6 md:mb-8 text-white">
          <TrendingUp size={20} className="text-cyber-accent mb-1" />
          <h2 className="text-[10px] md:text-xs font-black uppercase tracking-[0.4em] text-white">Top Performers</h2>
        </div>
        <div className="flex flex-col gap-4 md:gap-5">
          {leaderboard.length > 0 ? leaderboard.map((item, i) => (
            <div key={i} className="flex justify-between items-center border-b border-white/5 pb-3 md:pb-4">
              <div className="flex items-center gap-3 md:gap-4 text-left">
                <span className={`text-[10px] md:text-xs font-black ${i === 0 ? 'text-yellow-500' : 'text-white'}`}>0{i+1}</span>
                <span className="text-[9px] md:text-[10px] font-mono text-gray-400 uppercase tracking-widest">Room #{item.room_id}</span>
              </div>
              <span className="text-base md:text-lg font-black italic text-white leading-none">{item.score}</span>
            </div>
          )) : (
            <div className="py-8 text-center md:text-left text-gray-600 text-[9px] md:text-[10px] font-bold uppercase tracking-[0.3em]">No Mission Data</div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function JoinScreen({ onJoin, onBack }) { const [code, setCode] = useState(''); return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 flex flex-col items-center justify-center h-full p-8 text-center"><h2 className="text-4xl font-black mb-12 italic text-white">ACCESS KEY</h2><input type="text" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} className="w-64 bg-transparent border-b-4 border-white/20 py-4 text-center text-6xl font-black font-mono focus:border-cyber-accent outline-none mb-12 transition-all text-white" placeholder="000000" /><div className="flex flex-col gap-4 w-64"><button onClick={() => onJoin(code)} className="py-5 bg-cyber-accent text-black font-black rounded-2xl">SYNC</button><button onClick={onBack} className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Back</button></div></motion.div>; }
function RoleSelectScreen({ gameState, roomId, onSelect, onCopy, onBack }) { 
  const displayId = roomId || gameState?.id || "------"; 
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 flex flex-col items-center justify-start md:justify-center h-full w-full p-6 pt-20 md:p-8 text-center overflow-y-auto">
      <button onClick={onBack} className="absolute top-6 left-6 md:top-10 md:left-10 flex items-center gap-2 text-[10px] md:text-xs text-gray-500 font-bold uppercase tracking-widest hover:text-white transition-colors">
        <X size={16} /> Back
      </button>
      <div className="mb-8 md:mb-12 mt-4 md:mt-0">
        <h2 className="text-xl md:text-3xl font-black italic mb-3 md:mb-4 tracking-tighter uppercase opacity-50">Authorized Room</h2>
        <button onClick={onCopy} className="group relative inline-block px-8 py-4 md:px-10 md:py-5 bg-white/5 border-2 border-cyber-accent/30 rounded-3xl shadow-[0_0_30px_rgba(34,211,238,0.1)] hover:bg-white/10 transition-all">
          <div className="text-[9px] md:text-[10px] font-mono text-cyber-accent tracking-[0.5em] uppercase mb-1 flex items-center justify-center gap-2">Access Key <Copy size={10} /></div>
          <div className="text-5xl md:text-6xl font-black font-mono tracking-tighter text-white">{displayId}</div>
        </button>
      </div>
      <h3 className="text-2xl md:text-4xl font-black italic mb-6 md:mb-10 tracking-tight text-white">SELECT YOUR UNIT</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8 w-full max-w-4xl pb-10">
        <RoleCard title="ENGINEER" icon={<Wrench size={30} />} taken={gameState?.engineer_taken} onClick={() => onSelect('Engineer')} />
        <RoleCard title="PHARMACIST" icon={<FlaskConical size={30} />} taken={gameState?.pharmacist_taken} onClick={() => onSelect('Pharmacist')} />
      </div>
    </motion.div>
  ); 
}

function RoleCard({ title, icon, taken, onClick }) { 
  return (
    <button onClick={onClick} disabled={taken} className={`p-6 md:p-10 text-left border-2 rounded-[30px] md:rounded-[40px] transition-all relative flex flex-row md:flex-col items-center md:items-start gap-6 md:gap-0 ${taken ? 'border-red-900 bg-red-950/20 opacity-50 grayscale' : 'border-white/5 bg-white/5 hover:border-white/10'}`}>
      <div className={`shrink-0 md:mb-6 p-4 rounded-xl w-fit ${taken ? 'bg-red-900/40 text-red-500' : 'bg-white text-black'}`}>
        {icon}
      </div>
      <div>
        <h3 className="text-2xl md:text-3xl font-black italic mb-1 md:mb-2 tracking-tight text-white">{title}</h3>
        {taken ? <div className="text-red-500 font-black text-[9px] md:text-[10px] animate-pulse">LOCKED</div> : <div className="text-cyber-accent font-black text-[9px] md:text-[10px]">UNIT AVAILABLE →</div>}
      </div>
    </button>
  ); 
}

function LobbyScreen({ roomId, role, partnerIn, countdown, onCopy }) { 
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="mb-8 md:mb-12">
        <button onClick={onCopy} className="group flex items-center gap-3 px-6 py-2 md:px-8 md:py-3 bg-white/5 rounded-2xl text-gray-500 font-mono tracking-widest mb-4 md:mb-6 border border-white/5 hover:bg-white/10 transition-all mx-auto">
          <span className="uppercase text-[8px] md:text-[10px]">Room ID // </span>
          <span className="text-xl md:text-2xl font-black text-white">{roomId}</span>
          <Copy size={14} className="text-cyber-accent" />
        </button>
        <h2 className="text-4xl md:text-7xl font-black italic uppercase tracking-tighter leading-tight text-white">{role} ACTIVE</h2>
      </div>
      <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center border-4 border-white/5 rounded-full shadow-2xl overflow-hidden">
        {partnerIn ? (
          <AnimatePresence mode="wait">
            <motion.div key={countdown} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.5, opacity: 0 }} className="text-8xl md:text-[12rem] font-black italic text-cyber-accent leading-none">
              {countdown !== null ? (countdown > 0 ? countdown : 'GO') : '...'}
            </motion.div>
          </AnimatePresence> 
        ) : (
          <div className="flex flex-col items-center gap-6 md:gap-8 p-4">
            <div className="w-12 h-12 md:w-16 md:h-16 border-4 border-white/10 border-t-cyber-accent rounded-full animate-spin" />
            <p className="text-[10px] md:text-xs text-white font-black tracking-[0.4em] uppercase">Awaiting Partner</p>
          </div>
        )}
      </div>
    </motion.div>
  ); 
}

function GamePlayScreen({ role, health, time, score, afk, tasks, onTaskSelect, activeTask, onComplete, onCloseTask, updateDB }) {
  const isCritical = time >= 90;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 flex flex-col h-full">
      <div className={`absolute top-0 left-0 right-0 h-2 z-50 transition-colors ${isCritical ? 'bg-red-950' : 'bg-white/5'}`}>
        <motion.div className={`h-full shadow-[0_0_20px_rgba(34,211,238,0.5)] ${isCritical ? 'bg-red-500 shadow-red-500' : 'bg-cyber-accent'}`} animate={{ width: `${(time/GAME_DURATION)*100}%` }} transition={{ ease: "linear" }} />
      </div>
      <div className="p-4 md:p-8 flex flex-col h-full max-w-6xl mx-auto w-full">
        <header className="flex justify-between items-start mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white text-black rounded-2xl shadow-xl">{role === 'Engineer' ? <Wrench size={20}/> : <FlaskConical size={20}/>}</div>
            <div>
              <h2 className="text-lg font-black italic tracking-tighter uppercase leading-none mb-1 text-white">{role}</h2>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-cyber-accent uppercase tracking-widest">Time Remaining</span>
                <span className={`text-4xl font-black italic font-mono leading-none ${isCritical ? 'text-red-500 animate-pulse' : 'text-white'}`}>{GAME_DURATION - Math.floor(time)}<span className="text-xs text-gray-600 ml-1">S</span></span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end pt-2 text-right">
            {isCritical && <motion.div animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 0.5 }} className="bg-red-500 text-black px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2"><AlertTriangle size={12}/> Critical Overload</motion.div>}
            <div className="flex items-center gap-2 mb-1"><Award size={14} className="text-cyber-accent" /><span className="text-3xl font-black italic font-mono tracking-tighter text-white">{score}</span></div>
            <p className="text-[8px] font-black text-cyber-accent uppercase tracking-[0.2em]">Efficiency Rating</p>
          </div>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center relative"><div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 text-center pointer-events-none"><motion.div key={Math.round(health)} initial={{ scale: 1.2 }} animate={{ scale: 1 }} className={`text-7xl font-black font-mono tracking-tighter ${health < 25 ? 'text-red-500 animate-pulse' : 'text-white'}`}>{Math.round(health)}%</motion.div><div className="text-[8px] font-bold tracking-[0.4em] text-white/20 uppercase">Core Stability</div></div><LifeVessel health={health} />{afk && <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity }} className="mt-8 text-red-500 text-[10px] font-black uppercase flex items-center gap-2"><AlertTriangle size={14}/> Partner Offline</motion.div>}</div>
        <div className="grid grid-cols-5 gap-3 w-full mb-8">{tasks.map((t) => (<button key={t} onClick={() => onTaskSelect(t)} className="flex flex-col items-center justify-center gap-2 p-5 rounded-3xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all group"><div className="text-white/20 group-hover:text-white transition-colors">{getTaskIcon(t)}</div><span className="text-[8px] font-black uppercase tracking-widest text-white">{t.substring(0, 5)}</span></button>))}</div>
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
  return <div className="w-full text-center"><div className="text-[10px] text-red-500 mb-4 font-black tracking-widest uppercase">Cleaning: {count}/15</div><div className="grid grid-cols-4 gap-3 md:gap-4">{cells.map((a,i)=><button key={i} onClick={()=>click(i)} className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl border-2 transition-all ${a?'bg-red-500 border-red-400 shadow-[0_0_20px_#ef4444]':'bg-white/5 border-white/5'}`}/>)}</div></div>;
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
  return <div className="w-full text-center text-emerald-500"><p className="text-[10px] mb-8 font-black uppercase tracking-widest">Match Nitrogen Base: {target}</p><div className="grid grid-cols-2 gap-4">{sequence.map(b => <button key={b} onClick={() => { if(b === target) onComplete(); }} className={`py-6 rounded-2xl border-2 font-black text-2xl transition-all ${b === target ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/5 hover:border-white/20'}`}>{b}</button>)}</div></div>;
}
function CoolingTask({ onComplete }) {
  const [temp, setTemp] = useState(50);
  useEffect(() => { const it = setInterval(() => setTemp(p => Math.min(100, p + 2)), 100); return () => clearInterval(it); }, []);
  const cool = () => { setTemp(p => { const next = Math.max(0, p - 10); if(next === 0) onComplete(); return next; }); };
  return <div className="w-full text-center text-blue-400"><p className="text-[10px] mb-6 font-black uppercase">Reduce Heat</p><div className="text-6xl font-black font-mono mb-8">{temp}°C</div><div className="h-4 bg-white/5 rounded-full mb-8 overflow-hidden"><motion.div className="h-full bg-blue-500" animate={{ width: `${temp}%` }} /></div><button onClick={cool} className="w-full py-6 bg-blue-500 text-black font-black rounded-3xl uppercase text-xs shadow-[0_0_20px_rgba(59,130,246,0.5)]">Cool Down</button></div>;
}

function ScannerTask({ onComplete }) {
  const [targetPos] = useState({ x: Math.random() * 70 + 15, y: Math.random() * 60 + 20 });
  const [lensPos, setLensPos] = useState({ x: 50, y: 50 });
  const [isDetected, setIsDetected] = useState(false);
  
  useEffect(() => {
    const dist = Math.sqrt(Math.pow(lensPos.x - targetPos.x, 2) + Math.pow(lensPos.y - targetPos.y, 2));
    setIsDetected(dist < 15);
  }, [lensPos, targetPos]);

  return (
    <div className="w-full h-64 bg-black/40 rounded-[35px] relative overflow-hidden border border-white/10 touch-none">
      <div className="absolute inset-0 opacity-20 pointer-events-none bg-[radial-gradient(circle_at_center,_#ef4444_0%,_transparent_70%)]" />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: [0.2, 0.8, 0.2], scale: [0.8, 1.2, 0.8], x: `${targetPos.x}%`, y: `${targetPos.y}%` }} transition={{ repeat: Infinity, duration: 1.5 }} className="absolute w-8 h-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/40 blur-sm flex items-center justify-center"><div className="w-2 h-2 bg-red-500 rounded-full shadow-[0_0_10px_#ef4444]" /></motion.div>
      <motion.div drag dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }} onDrag={(e, info) => { setLensPos(prev => ({ x: Math.max(5, Math.min(95, prev.x + (info.delta.x * 0.3))), y: Math.max(5, Math.min(95, prev.y + (info.delta.y * 0.4))) })); }} style={{ left: `${lensPos.x}%`, top: `${lensPos.y}%` }} className={`absolute w-16 h-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 flex items-center justify-center transition-colors cursor-grab active:cursor-grabbing ${isDetected ? 'border-cyber-accent bg-cyber-accent/20 shadow-[0_0_25px_rgba(34,211,238,0.4)]' : 'border-white/30 bg-white/5'}`}><Search size={20} className={isDetected ? 'text-cyber-accent' : 'text-white/40'} />{isDetected && <div className="absolute -top-6 text-[8px] font-black uppercase text-cyber-accent animate-pulse">LOCKED</div>}</motion.div>
      <div className="absolute bottom-4 left-0 right-0 px-8"><button onClick={() => { if(isDetected) onComplete(); }} disabled={!isDetected} className={`w-full py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${isDetected ? 'bg-cyber-accent text-black scale-100' : 'bg-white/5 text-white/20 scale-95 opacity-50'}`}>{isDetected ? 'ESTABLISH LINK' : 'SEARCHING SIGNAL...'}</button></div>
    </div>
  );
}

function EncryptionTask({ onComplete }) {
  const [code] = useState(Math.random().toString(2).slice(2, 6));
  const [inp, setInp] = useState('');
  return <div className="w-full text-center text-violet-400"><p className="text-[10px] mb-6 font-black uppercase tracking-widest">Binary Sequence: {code}</p><div className="flex gap-4 justify-center mb-10">{code.split('').map((c, i) => <div key={i} className={`w-10 h-10 border-2 rounded-xl flex items-center justify-center font-black ${inp[i] ? 'border-violet-500 bg-violet-500/20' : 'border-white/10'}`}>{inp[i]}</div>)}</div><div className="grid grid-cols-2 gap-4"><button onClick={() => { const next = inp + '0'; setInp(next); if(next === code) onComplete(); if(!code.startsWith(next)) setInp(''); }} className="py-6 bg-violet-600 text-white font-black rounded-2xl text-2xl">0</button><button onClick={() => { const next = inp + '1'; setInp(next); if(next === code) onComplete(); if(!code.startsWith(next)) setInp(''); }} className="py-6 bg-violet-600 text-white font-black rounded-2xl text-2xl">1</button></div></div>;
}
function SweepTask({ onComplete }) {
  const [trash, setTrash] = useState([...Array(6)].map((_, i) => ({ id: i, x: Math.random()*70+5, y: Math.random()*70+5 })));
  const rem = (id) => { setTrash(t => { const n = t.filter(x => x.id !== id); if (n.length === 0) onComplete(); return n; }); };
  return <div className="relative w-full h-64 bg-emerald-950/20 rounded-3xl border border-emerald-500/20 p-4">{trash.map(t => <motion.button key={t.id} drag dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }} onDragEnd={() => rem(t.id)} style={{ left: `${t.x}%`, top: `${t.y}%` }} className="absolute p-4 bg-emerald-500/20 border-2 border-emerald-500 text-emerald-500 rounded-3xl cursor-grab active:cursor-grabbing"><Trash2 size={24} /></motion.button>)}</div>;
}

function TaskModal({ task, onComplete, onClose, role, updateDB }) {
  const colors = { grid: 'border-red-500', reactor: 'border-engineer', chem: 'border-pharmacist', terminal: 'border-pharmacist', sweep: 'border-emerald-500', dna: 'border-emerald-400', calibration: 'border-orange-500', cooling: 'border-blue-400', scanner: 'border-red-400', wires: 'border-engineer', battery: 'border-engineer', datalink: 'border-engineer', encryption: 'border-engineer', sort: 'border-pharmacist', vent: 'border-pharmacist' };
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/95 backdrop-blur-3xl">
      <div className={`w-full max-w-sm rounded-[30px] md:rounded-[45px] p-6 md:p-12 relative border-2 bg-white/[0.02] shadow-2xl ${colors[task] || 'border-white/10'}`}>
        <button onClick={onClose} className="absolute top-6 right-6 md:top-10 md:right-10 opacity-30 hover:opacity-100 transition-opacity"><X size={24} /></button>
        <h2 className="text-xl md:text-3xl font-black mb-6 md:mb-10 italic uppercase tracking-tighter text-white">{task.replace('_', ' ')}</h2>
        <div className="min-h-[200px] md:min-h-[250px] flex items-center justify-center bg-white/5 rounded-[25px] md:rounded-[40px] p-4 md:p-8 border border-white/5">
          {task === 'grid' && <GridPulseTask onComplete={() => onComplete(10)} />}
          {task === 'chem' && <ChemistryTask onComplete={() => onComplete(12)} />}
          {task === 'reactor' && <ReactorTask onComplete={() => onComplete(15)} />}
          {task === 'gencode' && <GenCodeTask onComplete={() => onComplete(8)} updateDB={updateDB} />}
          {task === 'terminal' && <TerminalTask onComplete={() => onComplete(15)} />}
          {task === 'sweep' && <SweepTask onComplete={() => onComplete(12)} />}
          {task === 'dna' && <DNATask onComplete={() => onComplete(12)} />}
          {task === 'cooling' && <CoolingTask onComplete={() => onComplete(15)} />}
          {task === 'calibration' && <CalibrationTask onComplete={() => onComplete(12)} />}
          {task === 'scanner' && <ScannerTask onComplete={() => onComplete(12)} />}
          {task === 'wires' && <WiresTask onComplete={() => onComplete(10)} />}
          {task === 'battery' && <BatteryTask onComplete={() => onComplete(10)} />}
          {task === 'datalink' && <DatalinkTask onComplete={() => onComplete(15)} />}
          {task === 'encryption' && <EncryptionTask onComplete={() => onComplete(15)} />}
          {task === 'sort' && <SortTask onComplete={() => onComplete(12)} />}
          {task === 'vent' && <VentTask onComplete={() => onComplete(10)} />}
          {!['grid', 'chem', 'reactor', 'gencode', 'terminal', 'sweep', 'dna', 'cooling', 'calibration', 'scanner', 'wires', 'battery', 'datalink', 'encryption', 'sort', 'vent'].includes(task) && (<div className="text-center"><p className="text-[10px] text-gray-500 mb-6 uppercase tracking-widest">Protocol Sync</p><button onClick={() => onComplete(8)} className="py-4 px-10 bg-white/10 rounded-2xl font-black text-white">ESTABLISH</button></div>)}
        </div>
        <p className="mt-6 text-[8px] text-center uppercase tracking-[0.3em] opacity-30 font-bold">Manual Override Required</p>
      </div>
    </div>
  );
}

// --- Common Components ---
function getTaskIcon(task) { const icons = { grid: <Grid3X3 size={18}/>, gencode: <Key size={18}/>, reactor: <RefreshCw size={18}/>, wires: <Zap size={18}/>, battery: <Battery size={18}/>, calibration: <Cpu size={18}/>, datalink: <Database size={18}/>, encryption: <Layers size={18}/>, chem: <Beaker size={18}/>, terminal: <Terminal size={18}/>, sweep: <Trash2 size={18}/>, sort: <Droplets size={18}/>, vent: <Wind size={18}/>, dna: <Fingerprint size={18}/>, cooling: <Thermometer size={18}/>, scanner: <Activity size={18}/> }; return icons[task] || <CheckCircle2 size={18}/>; }
function LifeVessel({ health }) { return <div className="relative w-48 h-80"><div className="absolute inset-0 glass-vessel rounded-[60px] overflow-hidden border-4 border-white/5"><motion.div animate={{ height: `${health}%` }} className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-cyan-600 via-cyan-300 liquid-wave" style={{ transformOrigin: 'bottom' }} /></div><div className="absolute inset-4 border-l-2 border-t-2 border-white/10 rounded-[50px] pointer-events-none" /></div>; }
function LoadingScreen() { return <div className="h-screen flex flex-col items-center justify-center bg-cyber-black text-white"><Loader2 className="w-12 h-12 text-cyber-accent animate-spin" /><p className="mt-8 font-mono text-[10px] tracking-widest uppercase">Syncing Protocol...</p></div>; }

function GameOverScreen({ score, onExit }) { 
  return (
    <div className="h-[100dvh] flex flex-col items-center justify-center p-6 bg-red-950/60 text-center backdrop-blur-xl z-[300] fixed inset-0">
      <AlertTriangle size={64} className="text-red-500 mb-6 md:size-[100px] md:mb-8" />
      <h1 className="text-5xl md:text-7xl font-black text-red-500 mb-4 italic tracking-tighter uppercase">FAILURE</h1>
      <p className="mb-12 md:mb-16 font-mono text-white text-xs md:text-sm uppercase tracking-widest opacity-80">Final Performance Score: <span className="text-white font-black">{score}</span></p>
      <button onClick={onExit} className="py-5 px-12 bg-white text-black font-black rounded-3xl uppercase tracking-widest text-[10px] active:scale-95 transition-all">Return to Home</button>
    </div>
  ); 
}

function WinScreen({ score, onExit }) { 
  return (
    <div className="h-[100dvh] flex flex-col items-center justify-center p-6 bg-cyber-accent/30 text-center backdrop-blur-xl z-[300] fixed inset-0">
      <Trophy size={64} className="text-cyber-accent mb-6 md:size-[100px] md:mb-8" />
      <h1 className="text-5xl md:text-7xl font-black text-cyber-accent mb-4 italic tracking-tighter uppercase">STABILIZED</h1>
      <p className="mb-12 md:mb-16 font-mono text-white text-xs md:text-sm uppercase tracking-widest opacity-80">Master Score: <span className="text-white font-black">{score}</span></p>
      <button onClick={onExit} className="py-5 px-16 bg-cyber-accent text-black font-black rounded-3xl uppercase tracking-widest text-[10px] active:scale-95 transition-all">Safe Return</button>
    </div>
  ); 
}

function SortTask({ onComplete }) {
  const [items, setItems] = useState(['cyan', 'cyan', 'magenta', 'magenta', 'cyan'].sort(() => 0.5 - Math.random()));
  const click = (color, idx) => { if (color === 'cyan') { const nextItems = items.filter((_, i) => i !== idx); setItems(nextItems); if (nextItems.filter(c => c === 'cyan').length === 0) onComplete(); } };
  return <div className="flex flex-col gap-6 items-center"><p className="text-[10px] text-cyan-500 uppercase tracking-widest font-black">Cyan Filter</p><div className="flex gap-4 flex-wrap justify-center">{items.map((color, i) => <button key={i} onClick={() => click(color, i)} className={`w-14 h-14 rounded-2xl ${color === 'cyan' ? 'bg-cyan-400 shadow-[0_0_15px_#22d3ee]' : 'bg-pink-500'}`} />)}</div></div>;
}
function WiresTask({ onComplete }) {
  const [order] = useState([1, 2, 3, 4].sort(() => 0.5 - Math.random()));
  const [currentIdx, setCurrentIdx] = useState(0);
  const click = (val) => { if(val === order[currentIdx]) { if(currentIdx === 3) onComplete(); else setCurrentIdx(c => c + 1); } else setCurrentIdx(0); };
  return <div className="flex flex-col gap-4 items-center text-yellow-500"><p className="text-[10px] mb-2 font-black text-white">SEQUENCE: {order.join(' ')}</p><div className="flex gap-4">{[1, 2, 3, 4].map(v => <button key={v} onClick={() => click(v)} className={`w-14 h-14 rounded-full border-2 font-black ${currentIdx > order.indexOf(v) ? 'bg-yellow-500 border-yellow-400 text-black' : 'bg-white/5 border-white/10 text-white'}`}>{v}</button>)}</div></div>;
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
  return <div className="text-center w-full"><div className={`text-4xl font-black font-mono mb-8 ${pressure > 80 ? 'text-red-500 animate-pulse' : 'text-white'}`}>{pressure}% PSI</div><button onClick={vent} className="w-full py-5 bg-white/5 border-2 border-white/20 rounded-2xl font-black uppercase text-xs hover:bg-white/10 text-white">Purge Vent</button></div>;
}
function ChemistryTask({ onComplete }) {
  const [target] = useState(Math.floor(Math.random()*40)+20);
  const [cur, setCur] = useState(0);
  const add = (v) => { const n=cur+v; if(n===target) onComplete(); if(n>target) setCur(0); else setCur(n); };
  return (
    <div className="text-center w-full text-pharmacist">
      <p className="text-[9px] md:text-[10px] mb-4 uppercase font-black tracking-widest text-white">Target: {target}mg</p>
      <div className="text-5xl md:text-7xl font-black mb-8 md:mb-12 font-mono text-white tracking-tighter">{cur}</div>
      <div className="flex gap-3 md:gap-4 justify-center">
        {[3,7,11].map(v=><button key={v} onClick={()=>add(v)} className="w-12 h-12 md:w-16 md:h-16 bg-white/10 border-2 border-pharmacist/40 rounded-2xl text-pharmacist font-black text-lg hover:bg-pharmacist/20">+{v}</button>)}
      </div>
    </div>
  );
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
  return (
    <div className="text-center w-full">
      <div className="text-5xl md:text-7xl font-black font-mono mb-8 md:mb-12 text-engineer drop-shadow-[0_0_15px_#22c55e]">{code}</div>
      <div className="flex flex-col gap-4">
        <button onClick={gen} className="w-full py-5 bg-engineer text-black font-black rounded-2xl shadow-lg hover:scale-105 transition-all text-xs">GENERATE SYNC CODE</button>
        <button onClick={() => onComplete()} className="w-full py-3 bg-white/5 text-[8px] md:text-[10px] font-bold text-gray-500 uppercase tracking-widest text-white">Validate</button>
      </div>
    </div>
  );
}
function TerminalTask({ onComplete }) {
  const [inp, setInp] = useState('');
  return (
    <div className="text-center w-full text-pharmacist">
      <p className="text-[10px] mb-6 font-black uppercase text-white">Input Authorization</p>
      <input type="text" maxLength={4} value={inp} onChange={(e) => { setInp(e.target.value); if(e.target.value.length === 4) onComplete(); }} className="w-full bg-white/5 border-2 border-pharmacist/40 rounded-3xl py-4 md:py-6 text-center text-4xl md:text-6xl font-black font-mono text-pharmacist outline-none focus:border-pharmacist shadow-[inset_0_0_20px_rgba(236,72,153,0.1)]" placeholder="----" />
    </div>
  );
}
