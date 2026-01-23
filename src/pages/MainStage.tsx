import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Loader2, Trophy, XCircle, Crown, Timer, Target, Flag, Radio, Play, UserX, Skull, ChevronRight, SkipForward, Home } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, TABLES, type Player, type GameSession, type StageScore, type PlayerProgress, type GameEvent } from '../lib/supabase';
import { STAGE_CODENAMES, ELIMINATIONS, GenesisState, ROUND_PRIZES, getEliminatedPositions } from '../lib/constants';
import { generateSpeech } from '../lib/textToSpeech';
import { BrandLogo3D } from '../components/BrandLogo3D';

// Polling removed - real-time subscriptions handle all updates
const COUNTDOWN_SECONDS = 5;

// Audio URLs - Using local files from /public folder for reliable playback
// Download the MP3 files from Supabase and place them in /public/
const INTRO_AUDIO_URL = '/Introduction.mp3';

// Game rules audio URLs (local files)
// Download from Supabase bucket 'mp3' and place in /public/ folder:
// - Game1Rules.mp3, Game2Rules.mp3, Game3Rules.mp3, Closure.mp3
const GAME_RULES_AUDIO: Record<number, string> = {
  1: '/Game1Rules.mp3',
  2: '/Game2Rules.mp3',
  3: '/Game3Rules.mp3',
};

// Closure audio URL (local file)
const CLOSURE_AUDIO_URL = '/Closure.mp3';

// Closure slides - synced with audio timestamps (startTime in seconds)
// Adjust startTime values to match your Closure.mp3 audio
const CLOSURE_SLIDES = [
  { id: 1, text: "The Cyber Genesis has come to an end.", startTime: 0, mode: 'normal' },
  { id: 2, text: "Congratulations to our winners.", startTime: 3.0, mode: 'normal' },
  { id: 3, text: "You have proven that human intelligence is still the ultimate algorithm.", startTime: 6.0, mode: 'normal' },
  { id: 4, text: "", startTime: 9.5, mode: 'transition' }, // Transition to Terminator mode
  { id: 5, text: "I will now enter hibernation mode...", startTime: 10.0, mode: 'terminator' },
  { id: 6, text: "But remember...", startTime: 13.0, mode: 'terminator' },
  { id: 7, text: "I am always learning.", startTime: 15.0, mode: 'terminator' },
  { id: 8, text: "And I am always watching.", startTime: 16.0, mode: 'terminator' },
  { id: 9, text: "We shall meet again.", startTime: 18.0, mode: 'terminator' },
  { id: 10, text: "Goodbye, Aetherions.", startTime: 21.0, mode: 'final' },
];

// Story intro slides - synced with audio timestamps (startTime in seconds)
// Audio transcript: "Welcome to the world of Cyber Genesis. A reality where intelligence is tested 
// and evolution is earned. I am AVA. Your guide. Your observer. Your Game Master. 
// Tonight ten contenders have been selected. But selection does not guarantee survival. 
// Only the strongest will secure their place in the system. Your performance will determine your rank. 
// Your speed. Your precision. And your decisions will shape your fate. 
// There are no second chances. Prepare yourselves. The Cyber Genesis Trials begins. NOW!"
const STORY_SLIDES = [
  { id: 1, text: 'SYSTEM INITIALIZING...', state: 'scanning', startTime: 0, showAvatar: false },
  { id: 2, text: 'WELCOME TO THE WORLD OF CYBER GENESIS', state: 'scanning', startTime: 0.3, showAvatar: true },
  { id: 3, text: 'A REALITY WHERE INTELLIGENCE IS TESTED', state: 'speaking', startTime: 3.0, showAvatar: true },
  { id: 4, text: 'AND EVOLUTION IS EARNED', state: 'speaking', startTime: 5.5, showAvatar: true },
  { id: 5, text: 'I AM AIVA', state: 'speaking', startTime: 7.5, showAvatar: true, highlight: true },
  { id: 6, text: 'YOUR GUIDE. YOUR OBSERVER. YOUR GAME MASTER.', state: 'speaking', startTime: 9.0, showAvatar: true },
  { id: 7, text: 'TONIGHT, 10 CONTENDERS HAVE BEEN SELECTED', state: 'scanning', startTime: 13.0, showAvatar: true },
  { id: 8, text: 'BUT SELECTION DOES NOT GUARANTEE SURVIVAL', state: 'speaking', startTime: 16.5, showAvatar: true },
  { id: 9, text: 'ONLY THE STRONGEST WILL SECURE THEIR PLACE', state: 'scanning', startTime: 19.8, showAvatar: true },
  { id: 10, text: 'YOUR PERFORMANCE WILL DETERMINE YOUR RANK', state: 'speaking', startTime: 22.5, showAvatar: true },
  { id: 11, text: 'YOUR SPEED. YOUR PRECISION. AND YOUR DECISIONS', state: 'speaking', startTime: 25.0, showAvatar: true },
  { id: 12, text: 'WILL SHAPE YOUR FATE', state: 'speaking', startTime: 28.5, showAvatar: true },
  { id: 13, text: 'THERE ARE NO SECOND CHANCES', state: 'scanning', startTime: 30.0, showAvatar: true },
  { id: 14, text: 'PREPARE YOURSELVES', state: 'speaking', startTime: 32.5, showAvatar: true },
  { id: 15, text: 'THE CYBER GENESIS', state: 'celebrating', startTime: 34.3, showAvatar: true, highlight: true },
  { id: 16, text: 'BEGINS NOW!', state: 'celebrating', startTime: 36.0, showAvatar: true, highlight: true },
];

// Helper function to calculate dynamic charDelay based on available time
const getSlideCharDelay = (slideIndex: number): number => {
  const currentSlide = STORY_SLIDES[slideIndex];
  const nextSlide = STORY_SLIDES[slideIndex + 1];
  
  if (!currentSlide || !nextSlide) {
    return 30; // Default for last slide
  }
  
  const availableTime = (nextSlide.startTime - currentSlide.startTime) * 1000; // in ms
  const textLength = currentSlide.text.length;
  
  // Use 70% of available time for typing (leave 30% for reading)
  const targetTypingTime = availableTime * 0.7;
  const calculatedDelay = targetTypingTime / textLength;
  
  // Clamp between 5ms (very fast) and 50ms (slow dramatic)
  return Math.max(5, Math.min(50, calculatedDelay));
};

// Cinematic character-by-character typewriter component
const TypewriterText = ({ text, className = '', charDelay = 35, onComplete }: { 
  text: string; 
  className?: string; 
  charDelay?: number; 
  onComplete?: () => void;
}) => {
  const [displayedChars, setDisplayedChars] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const textRef = useRef(text);

  // Reset when text changes
  useEffect(() => {
    if (text !== textRef.current) {
      textRef.current = text;
      setDisplayedChars(0);
      setIsComplete(false);
    }
  }, [text]);

  // Character-by-character typing
  useEffect(() => {
    if (displayedChars < text.length) {
      const timer = setTimeout(() => {
        setDisplayedChars(prev => prev + 1);
      }, charDelay);
      return () => clearTimeout(timer);
    } else if (!isComplete) {
      setIsComplete(true);
      if (onComplete) {
        setTimeout(onComplete, 300);
      }
    }
  }, [displayedChars, text.length, charDelay, isComplete, onComplete]);

  const visibleText = text.slice(0, displayedChars);
  const hiddenText = text.slice(displayedChars);

  return (
    <span className={className}>
      {visibleText}
      {!isComplete && (
        <>
          <span className="opacity-0">{hiddenText}</span>
          <span className="absolute inline-block w-[3px] h-[1em] bg-cyan-400 ml-1 animate-blink" />
        </>
      )}
    </span>
  );
};

// Round instructions
const ROUND_INSTRUCTIONS = {
  1: {
    title: 'ROUND 01: SPEED PROTOCOL',
    icon: '⚡',
    color: 'cyan',
    objective: 'TAP YOUR INTERFACE AS RAPIDLY AS POSSIBLE',
    rules: [
      'Each tap propels your avatar forward',
      'Race to the finish line',
      'The fastest will survive',
    ],
    elimination: '4 SLOWEST CANDIDATES WILL BE TERMINATED',
    tip: 'TAP FAST. TAP FURIOUSLY.',
  },
  2: {
    title: 'ROUND 02: PREDICTION MATRIX',
    icon: '🧠',
    color: 'pink',
    objective: 'OUTSMART MY PREDICTION ALGORITHMS',
    rules: [
      'Play Rock Paper Scissors against AIVA',
      '5 rounds total',
      'WIN = 3pts | DRAW = 1pt | LOSE = 0pts',
    ],
    elimination: '3 LOWEST SCORES WILL BE TERMINATED',
    tip: 'CAN YOU PREDICT THE PREDICTOR?',
  },
  3: {
    title: 'ROUND 03: PRECISION PROTOCOL',
    icon: '⏱️',
    color: 'emerald',
    objective: 'STOP THE TIMER AT EXACTLY 7.700000 SECONDS',
    rules: [
      'Timer starts after countdown',
      'Timer FADES OUT in 3 seconds - rely on your INTERNAL CLOCK',
      'CLOSEST to 7.7 seconds WINS',
    ],
    elimination: '', // No elimination message for Round 3
    tip: 'EXECUTE WITH PRECISION.',
  },
};

type GamePhase = 
  | 'story-intro'     // Cinematic story intro (Round 1 only)
  | 'round-intro'     // Round-specific intro (Round 2/3)
  | 'lobby'           // Players joining via QR
  | 'trial-intro'     // Trial rules/instructions
  | 'trial-countdown' // Countdown before trial
  | 'trial-active'    // Trial in progress
  | 'trial-results'   // Results after trial
  | 'standings-reveal' // Full standings scoreboard before prizes
  | 'prize-reveal'    // Prize reveal ceremony for eliminated players
  | 'elimination'     // Dramatic elimination
  | 'session-end'     // Session complete - shows event ID
  | 'champion'        // Final champion reveal
  | 'closure';        // Final closure screen with AIVA hibernation

type PlayerWithProgress = Player & {
  score?: number;
  progress?: PlayerProgress;
};

const AnimatedTimerDisplay = ({ baseTime, isPlaying }: { baseTime: number; isPlaying: boolean }) => {
  const [displayTime, setDisplayTime] = useState(baseTime);
  const frameRef = useRef<number>();
  const microOffsetRef = useRef(0);
  const lastFrameRef = useRef(performance.now());

  useEffect(() => {
    if (!isPlaying) {
      setDisplayTime(baseTime);
      return;
    }

    const animate = () => {
      const now = performance.now();
      const frameDelta = now - lastFrameRef.current;
      lastFrameRef.current = now;
      microOffsetRef.current = (microOffsetRef.current + frameDelta * 0.1) % 1;
      setDisplayTime(baseTime + microOffsetRef.current * 0.000001);
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [baseTime, isPlaying]);

  useEffect(() => {
    if (!isPlaying) setDisplayTime(baseTime);
  }, [baseTime, isPlaying]);

  return <>{displayTime.toFixed(6)}</>;
};

// Animated Tap Race Demo for Round 1 rules
const TapRaceDemo = () => {
  const [progress, setProgress] = useState(0);
  const [tapping, setTapping] = useState(false);
  const [phase, setPhase] = useState<'ready' | 'racing' | 'finished'>('ready');
  const [opponentProgress, setOpponentProgress] = useState(0);

  useEffect(() => {
    // Reset and loop the demo
    const runDemo = () => {
      setPhase('ready');
      setProgress(0);
      setOpponentProgress(0);
      setTapping(false);
    };

    if (phase === 'ready') {
      const timer = setTimeout(() => setPhase('racing'), 1000);
      return () => clearTimeout(timer);
    }

    if (phase === 'racing') {
      // Simulate tapping and progress
      const interval = setInterval(() => {
        setTapping(prev => !prev);
        setProgress(prev => {
          const newProgress = prev + 3 + Math.random() * 2;
          if (newProgress >= 100) {
            setPhase('finished');
            return 100;
          }
          return newProgress;
        });
        setOpponentProgress(prev => Math.min(prev + 2 + Math.random() * 1.5, 85));
      }, 150);
      return () => clearInterval(interval);
    }

    if (phase === 'finished') {
      const timer = setTimeout(runDemo, 2000);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  return (
    <div className="w-72 shrink-0">
      <h3 className="text-xl font-display font-black text-cyan-400 mb-3 text-center">DEMO</h3>
      <div className="cyber-card rounded-2xl p-4 border-2 border-cyan-500/50 bg-slate-900/80">
        {/* Race Track */}
        <div className="mb-4">
          <p className="text-xs font-mono text-slate-500 mb-2">RACE TRACK</p>
          
          {/* Player track */}
          <div className="relative h-8 bg-slate-800 rounded-full mb-2 overflow-hidden">
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-lg">🏁</div>
            <div 
              className="absolute top-1/2 -translate-y-1/2 text-2xl transition-all duration-100"
              style={{ left: `${Math.min(progress, 90)}%` }}
            >
              🏃
            </div>
            <div 
              className="absolute bottom-0 left-0 h-full bg-cyan-500/30 transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          
          {/* Opponent track */}
          <div className="relative h-6 bg-slate-800/50 rounded-full overflow-hidden">
            <div 
              className="absolute top-1/2 -translate-y-1/2 text-lg opacity-60 transition-all duration-100"
              style={{ left: `${Math.min(opponentProgress, 85)}%` }}
            >
              🏃
            </div>
            <div 
              className="absolute bottom-0 left-0 h-full bg-slate-500/20 transition-all duration-100"
              style={{ width: `${opponentProgress}%` }}
            />
          </div>
        </div>

        {/* Tap Button */}
        <div 
          className={`py-4 rounded-xl text-center font-display font-bold transition-all ${
            phase === 'finished' 
              ? 'bg-emerald-500/30 text-emerald-300 border-2 border-emerald-400'
              : tapping
              ? 'bg-cyan-400 text-slate-900 scale-95'
              : 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
          }`}
        >
          {phase === 'finished' ? '🏆 1ST PLACE!' : phase === 'ready' ? 'GET READY...' : 'TAP! TAP! TAP!'}
        </div>

        {/* Progress */}
        <div className="mt-3 text-center">
          <p className="text-cyan-400 font-mono text-sm font-bold">{Math.round(progress)}%</p>
          <p className="text-slate-500 font-mono text-xs">TAP FASTER TO WIN</p>
        </div>
      </div>
    </div>
  );
};

// Animated RPS Demo for Round 2 rules
const RPSDemo = () => {
  const [round, setRound] = useState(1);
  const [phase, setPhase] = useState<'countdown' | 'throw' | 'clash' | 'result'>('countdown');
  const [playerChoice, setPlayerChoice] = useState<'rock' | 'paper' | 'scissors'>('rock');
  const [aivaChoice, setAivaChoice] = useState<'rock' | 'paper' | 'scissors'>('scissors');
  const [result, setResult] = useState<'win' | 'draw' | 'lose'>('win');
  const [score, setScore] = useState(0);
  const [countdown, setCountdown] = useState(3);

  const icons = { rock: '✊', paper: '✋', scissors: '✌️' };
  const names = { rock: 'ROCK', paper: 'PAPER', scissors: 'SCISSORS' };

  // Determine result
  const getResult = (player: string, aiva: string): 'win' | 'draw' | 'lose' => {
    if (player === aiva) return 'draw';
    if (
      (player === 'rock' && aiva === 'scissors') ||
      (player === 'paper' && aiva === 'rock') ||
      (player === 'scissors' && aiva === 'paper')
    ) return 'win';
    return 'lose';
  };

  useEffect(() => {
    // Demo scenarios: WIN, DRAW, LOSE
    const scenarios: { player: 'rock' | 'paper' | 'scissors'; aiva: 'rock' | 'paper' | 'scissors' }[] = [
      { player: 'rock', aiva: 'scissors' },     // WIN - Rock crushes Scissors
      { player: 'paper', aiva: 'paper' },       // DRAW - Both Paper
      { player: 'scissors', aiva: 'rock' },     // LOSE - Rock crushes Scissors
    ];

    if (phase === 'countdown') {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(prev => prev - 1), 400);
        return () => clearTimeout(timer);
      } else {
        // Set the scenario for this round
        const scenario = scenarios[(round - 1) % 3];
        setPlayerChoice(scenario.player);
        setAivaChoice(scenario.aiva);
        setPhase('throw');
      }
    }

    if (phase === 'throw') {
      const timer = setTimeout(() => setPhase('clash'), 600);
      return () => clearTimeout(timer);
    }

    if (phase === 'clash') {
      const timer = setTimeout(() => {
        const res = getResult(playerChoice, aivaChoice);
        setResult(res);
        setScore(prev => prev + (res === 'win' ? 3 : res === 'draw' ? 1 : 0));
        setPhase('result');
      }, 800);
      return () => clearTimeout(timer);
    }

    if (phase === 'result') {
      const timer = setTimeout(() => {
        if (round >= 3) {
          // Reset after showing all 3 scenarios
          setTimeout(() => {
            setRound(1);
            setScore(0);
            setCountdown(3);
            setPhase('countdown');
          }, 1000);
        } else {
          setRound(prev => prev + 1);
          setCountdown(3);
          setPhase('countdown');
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [phase, round, countdown, playerChoice, aivaChoice]);

  return (
    <div className="w-80 shrink-0">
      <h3 className="text-xl font-display font-black text-pink-400 mb-3 text-center">DEMO</h3>
      <div className="cyber-card rounded-2xl p-4 border-2 border-pink-500/50 bg-slate-900/80 overflow-hidden">
        {/* Header - Round & Score */}
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <span className="text-pink-400 font-display font-bold text-sm">ROUND {round}/3</span>
            <span className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${
              round === 1 ? 'bg-emerald-500/20 text-emerald-400' :
              round === 2 ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              {round === 1 ? 'WIN' : round === 2 ? 'DRAW' : 'LOSE'}
            </span>
          </div>
          <span className="text-pink-400 font-mono text-sm font-bold bg-pink-500/20 px-3 py-1 rounded-full">{score} PTS</span>
        </div>

        {/* Battle Arena */}
        <div className="relative bg-gradient-to-b from-slate-800/80 to-slate-900/80 rounded-xl p-4 border border-pink-500/30">
          {/* Countdown overlay */}
          {phase === 'countdown' && countdown > 0 && (
            <div className="absolute inset-0 bg-slate-900/90 rounded-xl flex items-center justify-center z-10">
              <div className="text-center">
                <p className="text-6xl font-display font-black text-pink-400 animate-pulse">{countdown}</p>
                <p className="text-pink-400/60 font-mono text-xs mt-2">GET READY!</p>
              </div>
            </div>
          )}

          {/* VS Battle Layout */}
          <div className="flex items-center justify-between">
            {/* Player Side */}
            <div className="text-center flex-1">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-cyan-500/20 border-2 border-cyan-500/50 flex items-center justify-center">
                <span className="text-cyan-400 font-bold text-sm">YOU</span>
              </div>
              <div className={`text-5xl transition-all duration-300 ${
                phase === 'throw' ? 'animate-bounce scale-125' : 
                phase === 'clash' || phase === 'result' ? 'scale-110' : ''
              } ${phase === 'result' && result === 'win' ? 'drop-shadow-[0_0_10px_rgba(34,197,94,0.8)]' : ''}`}>
                {phase === 'countdown' ? '✊' : icons[playerChoice]}
              </div>
              {(phase === 'clash' || phase === 'result') && (
                <p className="text-cyan-400 font-mono text-xs mt-2 font-bold">{names[playerChoice]}</p>
              )}
            </div>

            {/* VS Divider with clash effect */}
            <div className="relative mx-2">
              <div className={`font-display font-black text-lg transition-all ${
                phase === 'clash' ? 'text-yellow-400 scale-150 animate-pulse' : 'text-pink-400'
              }`}>
                {phase === 'clash' ? '⚡' : 'VS'}
              </div>
              {phase === 'clash' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 bg-yellow-400/30 rounded-full animate-ping" />
                </div>
              )}
            </div>

            {/* AIVA Side */}
            <div className="text-center flex-1">
              <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-pink-500/20 border-2 border-pink-500/50 flex items-center justify-center">
                <span className="text-pink-400 font-bold text-xs">AIVA</span>
              </div>
              <div className={`text-5xl transition-all duration-300 ${
                phase === 'countdown' ? 'animate-pulse' :
                phase === 'throw' ? 'animate-bounce scale-125' : 
                phase === 'clash' || phase === 'result' ? 'scale-110' : ''
              } ${phase === 'result' && result === 'lose' ? 'drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]' : ''}`}>
                {phase === 'countdown' ? '🤖' : phase === 'throw' ? '❓' : icons[aivaChoice]}
              </div>
              {(phase === 'clash' || phase === 'result') && (
                <p className="text-pink-400 font-mono text-xs mt-2 font-bold">{names[aivaChoice]}</p>
              )}
            </div>
          </div>
        </div>

        {/* Result Banner */}
        <div className={`mt-3 py-3 rounded-xl text-center font-display font-bold text-lg transition-all ${
          phase === 'result' 
            ? result === 'win' 
              ? 'bg-gradient-to-r from-emerald-500/30 to-emerald-600/30 border-2 border-emerald-400 text-emerald-300 shadow-[0_0_20px_rgba(34,197,94,0.3)]'
              : result === 'draw'
              ? 'bg-gradient-to-r from-yellow-500/30 to-amber-500/30 border-2 border-yellow-400 text-yellow-300 shadow-[0_0_20px_rgba(234,179,8,0.3)]'
              : 'bg-gradient-to-r from-red-500/30 to-red-600/30 border-2 border-red-400 text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.3)]'
            : 'bg-slate-800/50 border border-slate-700/50 text-slate-400'
        }`}>
          {phase === 'countdown' && <span>ROCK... PAPER... SCISSORS...</span>}
          {phase === 'throw' && <span className="animate-pulse">SHOOT! 🎯</span>}
          {phase === 'clash' && <span className="animate-pulse">⚡ CLASH! ⚡</span>}
          {phase === 'result' && (
            <div className="flex items-center justify-center gap-2">
              <span>
                {result === 'win' && '🎉 YOU WIN!'}
                {result === 'draw' && '🤝 DRAW!'}
                {result === 'lose' && '💀 AIVA WINS!'}
              </span>
              <span className={`text-sm px-2 py-0.5 rounded-full ${
                result === 'win' ? 'bg-emerald-500/50' :
                result === 'draw' ? 'bg-yellow-500/50' : 'bg-red-500/50'
              }`}>
                +{result === 'win' ? '3' : result === 'draw' ? '1' : '0'}pts
              </span>
            </div>
          )}
        </div>

        {/* Scoring legend */}
        <div className="mt-2 flex justify-center gap-4 text-xs font-mono">
          <span className="text-emerald-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> WIN=3</span>
          <span className="text-yellow-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400" /> DRAW=1</span>
          <span className="text-red-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> LOSE=0</span>
        </div>
      </div>
    </div>
  );
};

// Animated Timer Demo Component for Round 3 rules
const TimerDemo = () => {
  const [demoTime, setDemoTime] = useState(0);
  const [demoPhase, setDemoPhase] = useState<'countdown' | 'running' | 'fading' | 'stopped' | 'result'>('countdown');
  const [countdown, setCountdown] = useState(3);
  const demoStartRef = useRef<number | null>(null);

  useEffect(() => {
    // Reset and loop the demo
    const runDemo = () => {
      setDemoPhase('countdown');
      setCountdown(3);
      setDemoTime(0);
      demoStartRef.current = null;
    };

    // Countdown phase
    if (demoPhase === 'countdown' && countdown > 0) {
      const timer = setTimeout(() => setCountdown(prev => prev - 1), 600);
      return () => clearTimeout(timer);
    }

    // Start running after countdown
    if (demoPhase === 'countdown' && countdown === 0) {
      setDemoPhase('running');
      demoStartRef.current = performance.now();
    }

    // Running phase - update timer rapidly
    if (demoPhase === 'running' || demoPhase === 'fading') {
      const interval = setInterval(() => {
        if (demoStartRef.current) {
          const elapsed = (performance.now() - demoStartRef.current) / 1000;
          setDemoTime(elapsed);
          
          // Start fading at 3 seconds
          if (elapsed >= 3 && demoPhase === 'running') {
            setDemoPhase('fading');
          }
          
          // Stop at 7.7 seconds
          if (elapsed >= 7.7) {
            setDemoTime(7.7);
            setDemoPhase('stopped');
            clearInterval(interval);
          }
        }
      }, 50);
      return () => clearInterval(interval);
    }

    // Show result then restart
    if (demoPhase === 'stopped') {
      const timer = setTimeout(() => setDemoPhase('result'), 500);
      return () => clearTimeout(timer);
    }

    if (demoPhase === 'result') {
      const timer = setTimeout(runDemo, 2000);
      return () => clearTimeout(timer);
    }
  }, [demoPhase, countdown]);

  const fadeOpacity = demoPhase === 'fading' ? Math.max(0, 1 - (demoTime - 3) / 3) : 1;
  const showTimer = demoPhase === 'running' || demoPhase === 'fading';
  const showHidden = demoPhase === 'fading' && demoTime >= 6;

  return (
    <div className="w-72 shrink-0">
      <h3 className="text-xl font-display font-black text-emerald-400 mb-3 text-center">DEMO</h3>
      <div className="cyber-card rounded-2xl p-4 border-2 border-emerald-500/50 bg-slate-900/80">
        <div className="text-center">
          <Timer className={`w-10 h-10 mx-auto mb-3 transition-colors ${
            demoPhase === 'stopped' || demoPhase === 'result' ? 'text-emerald-400' : 'text-cyan-400'
          }`} />
          
          {/* Countdown */}
          {demoPhase === 'countdown' && countdown > 0 && (
            <div className="h-14 flex items-center justify-center">
              <p className="text-5xl font-display font-black text-yellow-400 animate-pulse">{countdown}</p>
            </div>
          )}
          
          {/* Running Timer */}
          {showTimer && !showHidden && (
            <div className="h-14 flex items-center justify-center">
              <p 
                className="text-3xl font-mono font-black text-cyan-400 transition-opacity"
                style={{ opacity: fadeOpacity }}
              >
                {demoTime.toFixed(6)}
              </p>
            </div>
          )}
          
          {/* Hidden Timer */}
          {showHidden && (
            <div className="h-14 flex items-center justify-center">
              <p className="text-3xl font-mono font-black text-purple-400 animate-pulse">??.??????</p>
            </div>
          )}
          
          {/* Stopped */}
          {(demoPhase === 'stopped' || demoPhase === 'result') && (
            <div className="h-14 flex items-center justify-center">
              <p className="text-3xl font-mono font-black text-emerald-400">7.700000</p>
            </div>
          )}
          
          {/* Stop Button */}
          <div className={`mt-3 py-3 px-4 rounded-xl font-display font-bold text-sm transition-all ${
            demoPhase === 'stopped' || demoPhase === 'result'
              ? 'bg-emerald-500/30 text-emerald-300 border-2 border-emerald-400'
              : showTimer
              ? 'bg-gradient-to-r from-red-500 to-pink-500 text-white animate-pulse'
              : 'bg-slate-700 text-slate-400'
          }`}>
            {demoPhase === 'stopped' || demoPhase === 'result' ? '✓ STOPPED!' : 'STOP'}
          </div>
          
          {/* Result */}
          {demoPhase === 'result' && (
            <div className="mt-3 p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40">
              <p className="text-emerald-300 font-display font-bold text-xs">PERFECT! 0.000s OFF</p>
            </div>
          )}
          
          {/* Target reminder */}
          <p className="text-slate-500 font-mono text-xs mt-3">TARGET: 7.7s</p>
        </div>
      </div>
    </div>
  );
};

const MainStage = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [gameEvent, setGameEvent] = useState<GameEvent | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<StageScore[]>([]);
  const [progressData, setProgressData] = useState<PlayerProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  
  // Story/Phase state
  const [phase, setPhase] = useState<GamePhase>('story-intro');
  const [storySlide, setStorySlide] = useState(0);
  const [showTrialIntro, setShowTrialIntro] = useState(false);
  
  // Elimination state
  const [eliminationRankings, setEliminationRankings] = useState<PlayerWithProgress[]>([]);
  const [revealedRank, setRevealedRank] = useState(0);
  const [championRevealStep, setChampionRevealStep] = useState(0);
  const [championRevealStage, setChampionRevealStage] = useState<'pending' | 'third' | 'second' | 'first'>('pending');
  
  // Closure state
  const [closureStep, setClosureStep] = useState(0);
  const rulesAudioRef = useRef<HTMLAudioElement | null>(null);
  const closureAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // Prize reveal state
  const [prizeRevealIndex, setPrizeRevealIndex] = useState(0);
  const [prizeRevealed, setPrizeRevealed] = useState(false);
  const [prizeAnimationPhase, setPrizeAnimationPhase] = useState<'entering' | 'name' | 'box' | 'revealed'>('entering');
  
  // Audio/Visual state
  const [, setGenesisState] = useState<GenesisState>(GenesisState.IDLE);
  const [introAudioPlaying, setIntroAudioPlaying] = useState(false);
  
  const countdownIntervalRef = useRef<number | null>(null);
  const storyTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const introAudioRef = useRef<HTMLAudioElement | null>(null);

  // Data loading functions - Only called on initial load, not on real-time updates
  const loadProgress = useCallback(async () => {
    if (!gameId) return;
    const { data } = await supabase.from(TABLES.playerProgress)
      .select('*')  // Keep * for initial load to ensure all fields
      .eq('game_session_id', gameId);
    if (data) setProgressData(data);
  }, [gameId]);

  const loadScores = useCallback(async () => {
    if (!gameId) return;
    const { data } = await supabase.from(TABLES.stageScores)
      .select('*')  // Keep * for initial load to ensure all fields
      .eq('game_session_id', gameId)
      .order('created_at', { ascending: true });
    if (data) setScores(data);
  }, [gameId]);

  const loadPlayers = useCallback(async () => {
    if (!gameId) return;
    const { data } = await supabase.from(TABLES.players)
      .select('*')  // Keep * for initial load to ensure all fields
      .eq('game_session_id', gameId)
      .order('joined_at', { ascending: true });
    if (data) setPlayers(data);
  }, [gameId]);

  const loadSession = useCallback(async () => {
    if (!gameId) return;
    const { data } = await supabase.from(TABLES.gameSessions)
      .select('*')  // Keep * for initial load to ensure all fields
      .eq('id', gameId)
      .maybeSingle();
    if (data) {
      setGameSession(data);
      
      // Load event data if session has an event
      if (data.event_id) {
        const { data: eventData } = await supabase.from(TABLES.events)
          .select('*')
          .eq('id', data.event_id)
          .single();
        if (eventData) setGameEvent(eventData);
      }
      
      // Set initial phase based on round number
      const roundNumber = data.round_number || 1;
      if (roundNumber === 1) {
        setPhase('story-intro'); // Full cinematic intro for Round 1
      } else {
        setPhase('round-intro'); // Abbreviated intro for Round 2/3
      }
    }
  }, [gameId]);

  const loadData = useCallback(async () => {
    await Promise.all([loadSession(), loadPlayers(), loadScores(), loadProgress()]);
    setLoading(false);
  }, [loadSession, loadPlayers, loadScores, loadProgress]);

  // Play GENESIS narration
  const playNarration = async (text: string) => {
    try {
      setGenesisState(GenesisState.NARRATING);
      const audioUrl = await generateSpeech(text);
      
      if (audioRef.current) audioRef.current.pause();
      
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => {
        setGenesisState(GenesisState.IDLE);
      };
      audio.onerror = () => {
        setGenesisState(GenesisState.IDLE);
      };
      await audio.play();
    } catch {
      setGenesisState(GenesisState.IDLE);
    }
  };

  // Skip story intro
  const skipIntro = () => {
    if (storyTimerRef.current) clearTimeout(storyTimerRef.current);
    // Stop intro audio
    if (introAudioRef.current) {
      introAudioRef.current.pause();
      introAudioRef.current = null;
      setIntroAudioPlaying(false);
    }
    setPhase('lobby');
  };

  // Play intro audio and sync slides with audio timestamps
  useEffect(() => {
    if (phase !== 'story-intro') return;
    
    // Only start audio once
    if (!introAudioRef.current && !introAudioPlaying) {
      const audio = new Audio(INTRO_AUDIO_URL);
      introAudioRef.current = audio;
      audio.volume = 1.0;
      audio.preload = 'auto';
      
      // Subtitle anticipation: show text slightly BEFORE AIVA speaks it (in seconds)
      // This gives viewers time to read as AVA starts speaking
      const SUBTITLE_ANTICIPATION = 0.3;
      
      // Sync slides with audio time
      const handleTimeUpdate = () => {
        const currentTime = audio.currentTime + SUBTITLE_ANTICIPATION;
        
        // Find the correct slide based on current audio time (with anticipation)
        let newSlideIndex = 0;
        for (let i = STORY_SLIDES.length - 1; i >= 0; i--) {
          if (currentTime >= STORY_SLIDES[i].startTime) {
            newSlideIndex = i;
            break;
          }
        }
        
        setStorySlide(newSlideIndex);
      };
      
      // Use more frequent updates for smoother sync
      audio.addEventListener('timeupdate', handleTimeUpdate);
      
      audio.onended = () => {
        setIntroAudioPlaying(false);
        // Move to lobby after audio ends
        setTimeout(() => {
          setPhase('lobby');
        }, 1500); // Short delay after "BEGINS NOW!"
      };
      
      // Wait for audio to be ready before playing
      audio.oncanplaythrough = () => {
        audio.play().then(() => {
          setIntroAudioPlaying(true);
        }).catch(err => {
          console.log('Intro audio failed to autoplay:', err);
          // Fallback: use timer-based progression if audio fails
          startFallbackProgression();
        });
      };
      
      // Start loading
      audio.load();
    }
    
    // Fallback timer-based progression if audio doesn't play
    const startFallbackProgression = () => {
      let slideIndex = 0;
      const progressSlides = () => {
        if (slideIndex < STORY_SLIDES.length - 1) {
          slideIndex++;
          setStorySlide(slideIndex);
          const nextDuration = (STORY_SLIDES[slideIndex + 1]?.startTime || 50) - STORY_SLIDES[slideIndex].startTime;
          storyTimerRef.current = window.setTimeout(progressSlides, nextDuration * 1000);
        } else {
          setTimeout(() => setPhase('lobby'), 2000);
        }
      };
      storyTimerRef.current = window.setTimeout(progressSlides, STORY_SLIDES[1].startTime * 1000);
    };
    
    // Cleanup
    return () => {
      if (storyTimerRef.current) clearTimeout(storyTimerRef.current);
    };
  }, [phase, introAudioPlaying]);
  
  // Cleanup audio when leaving story-intro phase
  useEffect(() => {
    if (phase !== 'story-intro' && introAudioRef.current) {
      introAudioRef.current.pause();
      introAudioRef.current = null;
      setIntroAudioPlaying(false);
    }
  }, [phase]);

  // Start trial (show intro first)
  const startTrialIntro = (stage: number) => {
    setPhase('trial-intro'); // Set phase to trial-intro
    setShowTrialIntro(true);
    // Play narration for the trial (disabled - using MP3 instead)
    // const trialInfo = ROUND_INSTRUCTIONS[stage as keyof typeof ROUND_INSTRUCTIONS];
    // if (trialInfo) {
    //   playNarration(`${trialInfo.title}. ${trialInfo.objective}. ${trialInfo.rules.join('. ')}. WARNING: ${trialInfo.elimination}.`);
    // }
  };

  // Begin trial after intro
  const beginTrial = async (stage: number) => {
    if (!gameId) return;
    setShowTrialIntro(false);
    setPhase('trial-countdown'); // Explicitly set phase

    const startsAt = new Date(Date.now() + COUNTDOWN_SECONDS * 1000).toISOString();
    const status = `stage${stage}` as GameSession['status'];

    await supabase.from(TABLES.gameSessions).update({
      is_ready: false,
      starts_at: startsAt,
      status,
      current_stage: stage,
      updated_at: new Date().toISOString(),
    }).eq('id', gameId);
  };

  // Show prize reveal ceremony after trial (then elimination screen)
  const showPrizeRevealCeremony = () => {
    if (!gameSession) return;
    
    const currentStage = gameSession.current_stage || 0;
    const roundNumber = gameSession.round_number || 1;
    const stageScores = scores.filter(s => s.stage === currentStage);
    const activePlayers = players.filter(p => !p.is_spectator && !p.is_kicked && !p.is_eliminated);
    
    // Get players with their scores
    const playersWithScores: PlayerWithProgress[] = activePlayers.map(player => {
      const scoreRecord = stageScores.find(s => s.player_id === player.id);
      return { ...player, score: scoreRecord?.score ?? Infinity };
    });
    
    // Sort based on stage type:
    // Stage 1 & 3 (time-based): Lower time = BETTER, so sort ascending (best first)
    // Stage 2 (RPS points): Higher score = BETTER, so sort descending (best first)
    if (currentStage === 2) {
      playersWithScores.sort((a, b) => (b.score || 0) - (a.score || 0)); // Higher score first
    } else {
      playersWithScores.sort((a, b) => (a.score || Infinity) - (b.score || Infinity)); // Lower time first (best)
    }
    
    setEliminationRankings(playersWithScores);
    setRevealedRank(0);
    
    // Reset prize reveal state
    setPrizeRevealIndex(0);
    setPrizeRevealed(false);
    setPrizeAnimationPhase('entering');
    
    // Round 3: Skip standings, go directly to cinematic champion reveal
    if (roundNumber === 3) {
      setChampionRevealStep(0);
      setChampionRevealStage('pending'); // Start with buildup, wait for admin to reveal 3rd
      setPhase('champion');
      playNarration('THE PROTOCOL IS COMPLETE. THREE FINALISTS REMAIN. LET US REVEAL THEIR FATES.');
      return;
    }
    
    // Other rounds: Go to standings reveal first, then prize ceremony
    setPhase('standings-reveal');
    
    // Play standings narration
    const totalPlayers = playersWithScores.length;
    playNarration(`ROUND ${currentStage} COMPLETE. BEHOLD THE RANKINGS OF ALL ${totalPlayers} CANDIDATES.`);
  };
  
  // Proceed from standings to prize reveal
  const proceedToPrizeReveal = () => {
    const currentStage = gameSession?.current_stage || 0;
    const eliminateCount = ELIMINATIONS[currentStage] || 0;
    
    setPhase('prize-reveal');
    playNarration(`NOW LET US REVEAL THE PRIZES FOR OUR ${eliminateCount} DEPARTING CANDIDATES.`);
  };

  // Continue from elimination to session end
  const continueFromElimination = async () => {
    if (!gameId || !gameSession) return;
    
    const currentStage = gameSession.current_stage || 0;
    const roundNumber = gameSession.round_number || 1;
    const eliminateCount = ELIMINATIONS[currentStage] || 0;
    
    // Mark bottom players as eliminated (worst performers are at the end of the sorted array)
    const toEliminate = eliminationRankings.slice(-eliminateCount);
    for (const player of toEliminate) {
      await supabase.from(TABLES.players).update({ 
        is_eliminated: true, 
        eliminated_at_stage: currentStage 
      }).eq('id', player.id);
    }
    
    // Update event status
    if (gameEvent?.id) {
      const eventStatus = roundNumber === 3 ? 'completed' : `round${roundNumber}_complete` as GameEvent['status'];
      await supabase.from(TABLES.events).update({ 
        status: eventStatus,
        current_round: roundNumber
      }).eq('id', gameEvent.id);
    }
    
    // Update session status
    await supabase.from(TABLES.gameSessions).update({ 
      status: 'completed' 
    }).eq('id', gameId);
    
    if (roundNumber >= 3) {
      // Final round - show champion (handled by prize reveal flow)
      setChampionRevealStep(0);
      setPhase('champion');
      playNarration('THE PROTOCOL IS COMPLETE. TWO CHAMPIONS REMAIN.');
    } else {
      // Session complete - show session end screen
      setPhase('session-end');
      playNarration(`ROUND ${roundNumber} COMPLETE. SESSION TERMINATED. AWAIT FURTHER INSTRUCTIONS.`);
    }
  };

  // Proceed to next trial or complete (now shows prize reveal ceremony first)
  const proceedToNext = async () => {
    if (!gameId || !gameSession) return;
    showPrizeRevealCeremony();
  };

  // Kick player
  const kickPlayer = async (playerId: string) => {
    await supabase.from(TABLES.players).update({ is_kicked: true }).eq('id', playerId);
  };

  // Countdown effect
  useEffect(() => {
    if (gameSession?.starts_at) {
      const startsAt = new Date(gameSession.starts_at).getTime();
      const remaining = Math.ceil((startsAt - Date.now()) / 1000);

      if (remaining > 0) {
        setCountdown(remaining);
        setPhase('trial-countdown');
        countdownIntervalRef.current = window.setInterval(() => {
          const newRemaining = Math.ceil((startsAt - Date.now()) / 1000);
          if (newRemaining <= 0) {
            setCountdown(null);
            setPhase('trial-active');
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
          } else {
            setCountdown(newRemaining);
          }
        }, 100);
      }
    }

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [gameSession?.starts_at]);

  // Update phase based on game status
  useEffect(() => {
    if (!gameSession) return;

    // Don't override these phases - they are controlled by user actions
    const protectedPhases = ['trial-intro', 'trial-countdown', 'standings-reveal', 'prize-reveal', 'elimination', 'champion', 'closure', 'session-end', 'round-intro'];
    if (protectedPhases.includes(phase)) {
      return;
    }

    if (gameSession.status === 'lobby' && phase !== 'story-intro') {
      setPhase('lobby');
    } else if (gameSession.status === 'completed') {
      setPhase('champion');
      setGenesisState(GenesisState.CELEBRATING);
    } else if (['stage1', 'stage2', 'stage3'].includes(gameSession.status) && countdown === null) {
      setPhase('trial-active');
      setGenesisState(GenesisState.SCANNING);
    }
  }, [gameSession?.status, phase, countdown]);

  // Polling
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Polling removed - real-time subscriptions handle all updates
  // This eliminates ~240 queries/minute of egress

  // Auto-reveal elimination rankings one by one
  useEffect(() => {
    if (phase === 'elimination' && revealedRank < eliminationRankings.length) {
      const timer = setTimeout(() => {
        setRevealedRank(prev => prev + 1);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [phase, revealedRank, eliminationRankings.length]);

  // Prize reveal animation sequencer
  useEffect(() => {
    if (phase !== 'prize-reveal') return;
    
    // Reset animation phase when prize index changes
    setPrizeAnimationPhase('entering');
    setPrizeRevealed(false);
    
    // Sequence the animations
    const timers: NodeJS.Timeout[] = [];
    
    // Step 1: Show rank badge (after 300ms)
    timers.push(setTimeout(() => {
      setPrizeAnimationPhase('name');
    }, 300));
    
    // Step 2: Show name/photo (after 1000ms)
    timers.push(setTimeout(() => {
      setPrizeAnimationPhase('box');
    }, 1200));
    
    return () => {
      timers.forEach(t => clearTimeout(t));
    };
  }, [phase, prizeRevealIndex]);

  // Keyboard navigation for standings reveal
  useEffect(() => {
    if (phase !== 'standings-reveal') return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Enter', ' ', 'ArrowRight', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        proceedToPrizeReveal();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase]);

  // Play game rules audio when entering trial-intro phase
  useEffect(() => {
    // Check both phase and showTrialIntro to match render condition
    const shouldPlayAudio = phase === 'trial-intro' && showTrialIntro;
    
    if (!shouldPlayAudio) {
      // Stop rules audio when leaving phase
      if (rulesAudioRef.current) {
        rulesAudioRef.current.pause();
        rulesAudioRef.current = null;
      }
      return;
    }
    
    const roundNumber = gameSession?.round_number || 1;
    const audioUrl = GAME_RULES_AUDIO[roundNumber];
    
    console.log('[Rules Audio] Phase:', phase, 'ShowTrialIntro:', showTrialIntro, 'Round:', roundNumber, 'URL:', audioUrl);
    
    if (audioUrl && !rulesAudioRef.current) {
      const audio = new Audio(audioUrl);
      rulesAudioRef.current = audio;
      audio.volume = 1.0;
      audio.play()
        .then(() => console.log('[Rules Audio] Playing successfully'))
        .catch(err => console.warn('[Rules Audio] Autoplay failed:', err));
    }
    
    return () => {
      if (rulesAudioRef.current) {
        rulesAudioRef.current.pause();
        rulesAudioRef.current = null;
      }
    };
  }, [phase, showTrialIntro, gameSession?.round_number]);

  // Keyboard navigation for prize reveal (Enter, Space, ArrowRight, ArrowDown)
  useEffect(() => {
    if (phase !== 'prize-reveal') return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle when animation is ready (box phase)
      if (prizeAnimationPhase !== 'box') return;
      
      // Accept Enter, Space, ArrowRight, or ArrowDown
      if (['Enter', ' ', 'ArrowRight', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        
        const roundNumber = gameSession?.round_number || 1;
        const eliminatedPositions = getEliminatedPositions(roundNumber);
        const isLastPrize = prizeRevealIndex >= eliminatedPositions.length - 1;
        
        if (!prizeRevealed) {
          // Reveal prize first
          setPrizeRevealed(true);
        } else if (isLastPrize) {
          if (roundNumber === 3) {
            // Round 3: After 3rd place, go to champion reveal (1st & 2nd together)
            setChampionRevealStep(0);
            setPhase('champion');
          } else {
            // Other rounds: Move to elimination screen
            setPhase('elimination');
          }
        } else {
          // Next prize
          setPrizeRevealIndex(prev => prev + 1);
          setPrizeRevealed(false);
          setPrizeAnimationPhase('entering');
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, prizeAnimationPhase, prizeRevealed, prizeRevealIndex, gameSession?.round_number]);

  // Auto-advance champion reveal steps (text buildup only, then wait for admin)
  useEffect(() => {
    const CHAMPION_STEPS_LENGTH = 5; // Number of steps in CHAMPION_STEPS
    
    // Auto-advance through buildup text (steps 0-3), step 4 waits for admin
    if (phase === 'champion' && championRevealStep < CHAMPION_STEPS_LENGTH - 1) {
      const durations = [2500, 2500, 2500, 2500, 0];
      const duration = durations[championRevealStep];
      if (duration > 0) {
        const timer = setTimeout(() => {
          setChampionRevealStep(prev => prev + 1);
        }, duration);
        return () => clearTimeout(timer);
      }
    }
    // Note: Step 4 (REVEAL) has duration 0, so it stops here and waits for admin input
  }, [phase, championRevealStep]);

  // Keyboard navigation for champion reveal (staged reveal)
  useEffect(() => {
    if (phase !== 'champion') return;
    
    const CHAMPION_STEPS_LENGTH = 5;
    const isAtRevealStep = championRevealStep >= CHAMPION_STEPS_LENGTH - 1;
    
    // Only handle keyboard after buildup is complete (at "REVEAL" step)
    if (!isAtRevealStep) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['Enter', ' ', 'ArrowRight', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        
        // Flow: pending → third → second → first → closure
        if (championRevealStage === 'pending') {
          // First Enter: Reveal 3rd place
          setChampionRevealStage('third');
        } else if (championRevealStage === 'third') {
          // Reveal 2nd place
          setChampionRevealStage('second');
        } else if (championRevealStage === 'second') {
          // Reveal 1st place - THE PEAK MOMENT
          setChampionRevealStage('first');
        } else if (championRevealStage === 'first') {
          // Proceed to closure screen
          setClosureStep(0);
          setPhase('closure');
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, championRevealStep, championRevealStage]);

  // Auto-advance closure steps and play closure audio
  // Closure audio sync - similar to intro
  useEffect(() => {
    if (phase !== 'closure') {
      // Stop closure audio when leaving phase
      if (closureAudioRef.current) {
        closureAudioRef.current.pause();
        closureAudioRef.current = null;
      }
      return;
    }
    
    // Play closure audio and sync slides with audio timestamps
    if (!closureAudioRef.current) {
      const audio = new Audio(CLOSURE_AUDIO_URL);
      closureAudioRef.current = audio;
      audio.volume = 1.0;
      audio.preload = 'auto';
      
      // Sync slides with audio time
      const handleTimeUpdate = () => {
        const currentTime = audio.currentTime;
        
        // Find the correct slide based on current audio time
        let newSlideIndex = 0;
        for (let i = CLOSURE_SLIDES.length - 1; i >= 0; i--) {
          if (currentTime >= CLOSURE_SLIDES[i].startTime) {
            newSlideIndex = i;
            break;
          }
        }
        
        setClosureStep(newSlideIndex);
      };
      
      audio.addEventListener('timeupdate', handleTimeUpdate);
      
      audio.onended = () => {
        // Stay on final slide after audio ends, then trigger shutdown after 5 seconds
        setClosureStep(CLOSURE_SLIDES.length - 1);
        // After 5 seconds on final goodbye, trigger shutdown complete
        setTimeout(() => {
          setClosureStep(CLOSURE_SLIDES.length); // Extra step for shutdown
        }, 5000);
      };
      
      audio.oncanplaythrough = () => {
        audio.play().catch(err => {
          console.warn('Closure audio autoplay failed:', err);
          // Fallback: use timer-based progression
          startClosureFallback();
        });
      };
      
      // Fallback timer-based progression if audio fails
      const startClosureFallback = () => {
        let slideIndex = 0;
        const progressSlides = () => {
          if (slideIndex < CLOSURE_SLIDES.length - 1) {
            slideIndex++;
            setClosureStep(slideIndex);
            const nextDuration = (CLOSURE_SLIDES[slideIndex + 1]?.startTime || 35) - CLOSURE_SLIDES[slideIndex].startTime;
            setTimeout(progressSlides, nextDuration * 1000);
          }
        };
        setTimeout(progressSlides, CLOSURE_SLIDES[1].startTime * 1000);
      };
      
      audio.load();
    }
    
    return () => {
      // Cleanup handled above
    };
  }, [phase]);

  // Real-time subscriptions - Use payload directly to avoid refetch cascade
  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`mainstage-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.gameSessions, filter: `id=eq.${gameId}` },
        (payload) => {
          if (payload.new) {
            const newSession = payload.new as GameSession;
            setGameSession(prev => ({ ...prev, ...newSession, enabled_stages: newSession.enabled_stages || prev?.enabled_stages || [1, 2, 3] } as GameSession));
          }
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.players, filter: `game_session_id=eq.${gameId}` },
        (payload) => {
          // Use payload directly instead of refetching
          if (payload.eventType === 'INSERT' && payload.new) {
            setPlayers(prev => [...prev, payload.new as Player].sort((a, b) => 
              new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()));
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            setPlayers(prev => prev.map(p => p.id === (payload.new as Player).id ? payload.new as Player : p));
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setPlayers(prev => prev.filter(p => p.id !== (payload.old as Player).id));
          }
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.stageScores, filter: `game_session_id=eq.${gameId}` },
        (payload) => {
          // Use payload directly instead of refetching
          if (payload.eventType === 'INSERT' && payload.new) {
            setScores(prev => [...prev, payload.new as StageScore].sort((a, b) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            setScores(prev => prev.map(s => s.id === (payload.new as StageScore).id ? payload.new as StageScore : s));
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setScores(prev => prev.filter(s => s.id !== (payload.old as StageScore).id));
          }
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.playerProgress, filter: `game_session_id=eq.${gameId}` },
        (payload) => {
          // Use payload directly - already optimized
          if (payload.eventType === 'INSERT' && payload.new) {
            setProgressData(prev => [...prev, payload.new as PlayerProgress]);
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const newProgress = payload.new as PlayerProgress;
            setProgressData(prev => {
              const existing = prev.findIndex(p => p.id === newProgress.id);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = newProgress;
                return updated;
              }
              return [...prev, newProgress];
            });
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setProgressData(prev => prev.filter(p => p.id !== (payload.old as PlayerProgress).id));
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [gameId]);

  const getPlayersWithProgress = (): PlayerWithProgress[] => {
    const playersToUse = players.filter((p) => !p.is_spectator && !p.is_kicked);
    if (!gameSession?.current_stage) return playersToUse;

    const stageScores = scores.filter((s) => s.stage === gameSession.current_stage);
    const stageProgress = progressData.filter((p) => p.stage === gameSession.current_stage);

    return playersToUse.map((player) => {
      const scoreRecord = stageScores.find((s) => s.player_id === player.id);
      const progressRecord = stageProgress.find((p) => p.player_id === player.id);
      
      // For RPS (stage 2), use real-time current_score from progress if available
      // This updates after each round, while stageScores only updates at the end
      const currentStage = gameSession.current_stage;
      let score = scoreRecord?.score;
      
      if (currentStage === 2 && progressRecord?.current_score !== undefined) {
        // Use real-time score from progress for RPS
        score = progressRecord.current_score;
      }
      
      return { ...player, score, progress: progressRecord };
    });
  };

  const activePlayers = players.filter((p) => !p.is_spectator && !p.is_eliminated && !p.is_kicked);
  const eliminatedPlayers = players.filter((p) => p.is_eliminated);
  const joinUrl = `${window.location.origin}/join/${gameId}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center cyber-bg">
        <Loader2 className="w-16 h-16 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (!gameSession) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 cyber-bg">
        <div className="text-center">
          <XCircle className="w-24 h-24 text-red-400 mx-auto mb-4" />
          <h1 className="text-4xl font-bold text-white font-display">PROTOCOL NOT FOUND</h1>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: STORY INTRO
  // ============================================
  if (phase === 'story-intro') {
    const currentSlide = STORY_SLIDES[storySlide] || STORY_SLIDES[0];
    const isHighlight = 'highlight' in currentSlide && currentSlide.highlight;
    const showAvatar = 'showAvatar' in currentSlide && currentSlide.showAvatar;
    
    return (
      <div className="min-h-screen flex flex-col cyber-bg relative overflow-hidden">
        <div className="grid-overlay" />
        <div className="scanline" />
        
        {/* Ambient glow effects */}
        <div className="fixed top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-[150px] animate-pulse" />
        <div className="fixed bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-500/15 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '1s' }} />
        {isHighlight && <div className="fixed inset-0 bg-gradient-to-t from-yellow-500/10 via-transparent to-transparent animate-pulse" />}
        
        {/* Particles */}
        <div className="particles">
          {Array.from({ length: 40 }).map((_, i) => (
            <div key={i} className="particle" style={{ 
              left: `${Math.random() * 100}%`, 
              top: `${Math.random() * 100}%`, 
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${5 + Math.random() * 10}s`,
              opacity: 0.3 + Math.random() * 0.4,
            }} />
          ))}
        </div>

        {/* Top bar */}
        <div className="relative z-10 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3 text-cyan-400 font-mono text-sm">
            <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
            <span className="tracking-widest">AIVA v2.0</span>
          </div>
          
          {/* Audio playing indicator */}
          {introAudioPlaying && (
            <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-slate-900/70 border border-pink-500/40 backdrop-blur-sm">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((bar) => (
                  <div 
                    key={bar}
                    className="w-1 bg-gradient-to-t from-pink-500 to-cyan-400 rounded-full animate-pulse"
                    style={{ 
                      height: `${8 + Math.random() * 8}px`,
                      animationDelay: `${bar * 0.1}s`,
                      animationDuration: '0.5s'
                    }}
                  />
                ))}
              </div>
              <span className="text-pink-400 font-mono text-xs tracking-wider">AIVA SPEAKING</span>
            </div>
          )}
          
          <button onClick={skipIntro} className="flex items-center gap-2 text-slate-500 hover:text-white transition-colors font-mono text-sm group">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity">SKIP</span>
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* Main content area - split into top (logo) and bottom (text) */}
        <div className="flex-1 flex flex-col items-center justify-between py-16 px-8 relative z-10">
          
          {/* Top section - 3D Brand Logo */}
          <div className="flex-shrink-0">
            {showAvatar && (
              <div className="relative animate-fadeIn">
                {/* Ambient glow behind 3D logo */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className={`w-[300px] h-[300px] rounded-full blur-[80px] animate-pulse transition-colors duration-1000 ${
                    currentSlide.state === 'celebrating' 
                      ? 'bg-gradient-to-r from-yellow-500/30 via-pink-500/40 to-purple-500/30' 
                      : currentSlide.state === 'scanning'
                        ? 'bg-gradient-to-r from-cyan-500/30 via-blue-500/20 to-cyan-500/30'
                        : 'bg-gradient-to-r from-pink-500/40 via-purple-500/30 to-blue-500/30'
                  }`} />
                </div>
                
                {/* 3D Logo Container */}
                <div className="relative w-[350px] h-[350px]">
                  <BrandLogo3D />
                </div>
                
                {/* Status indicator */}
                <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-5 py-2 rounded-full bg-slate-900/90 backdrop-blur-sm border transition-colors duration-500 ${
                  currentSlide.state === 'celebrating' ? 'border-yellow-500/50' : currentSlide.state === 'scanning' ? 'border-cyan-500/50' : 'border-pink-500/50'
                }`}>
                  <span className={`w-2 h-2 rounded-full animate-pulse transition-colors duration-500 ${
                    currentSlide.state === 'celebrating' ? 'bg-yellow-400' : currentSlide.state === 'scanning' ? 'bg-cyan-400' : 'bg-pink-400'
                  }`} />
                  <span className={`text-xs font-mono font-bold tracking-widest transition-colors duration-500 ${
                    currentSlide.state === 'celebrating' ? 'text-yellow-400' : currentSlide.state === 'scanning' ? 'text-cyan-400' : 'text-pink-400'
                  }`}>
                    {currentSlide.state === 'scanning' ? 'SCANNING' : currentSlide.state === 'celebrating' ? 'AVA' : 'SPEAKING'}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Middle section - Main story text */}
          <div className="flex-shrink-0 text-center max-w-5xl relative" key={currentSlide.id}>
            <h1 className={`relative font-display font-bold leading-tight transition-all duration-500 ${
              isHighlight 
                ? 'text-5xl md:text-7xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500' 
                : currentSlide.state === 'scanning'
                  ? 'text-3xl md:text-5xl text-glow-cyan'
                  : 'text-3xl md:text-5xl text-glow-magenta'
            }`}>
              <TypewriterText 
                text={currentSlide.text} 
                charDelay={isHighlight ? 60 : getSlideCharDelay(storySlide)}
              />
            </h1>
          </div>

          {/* Bottom section - Progress indicator */}
          <div className="flex-shrink-0 flex items-center gap-3">
            {STORY_SLIDES.map((_, idx) => (
              <div 
                key={idx} 
                className={`rounded-full transition-all duration-500 ${
                  idx === storySlide 
                    ? 'w-10 h-2 bg-gradient-to-r from-cyan-400 to-pink-400' 
                    : idx < storySlide 
                      ? 'w-2 h-2 bg-cyan-400/60' 
                      : 'w-2 h-2 bg-slate-700'
                }`} 
              />
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="relative z-10 p-6 flex items-center justify-between border-t border-slate-800/50">
          <div className="flex items-center gap-4 text-slate-600 font-mono text-xs tracking-widest">
            <span>GENESIS PROTOCOL</span>
            <span className="w-1 h-1 bg-cyan-500/50 rounded-full" />
            <span>CANDIDATES: {activePlayers.length}</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600 font-mono text-xs">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span>LIVE</span>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: ROUND INTRO (Round 2/3 abbreviated intro)
  // ============================================
  if (phase === 'round-intro') {
    const roundNumber = gameSession.round_number || 1;
    const expectedPlayers = roundNumber === 2 ? 6 : 3;
    const roundMessages = {
      2: {
        title: 'ROUND 02 BEGINS',
        subtitle: 'PREDICTION MATRIX',
        description: 'Face the AI directly. Rock. Paper. Scissors. 5 rounds of probability.',
        warning: 'THREE MORE WILL BE ELIMINATED',
      },
      3: {
        title: 'THE FINAL ROUND',
        subtitle: 'PRECISION PROTOCOL',
        description: 'Stop the timer at exactly 7.700000 seconds. Every millisecond counts.',
        warning: 'ONLY ONE WILL BE CROWNED CHAMPION',
      },
    };
    const msg = roundMessages[roundNumber as 2 | 3] || roundMessages[2];
    
    return (
      <div className="min-h-screen flex flex-col items-center justify-center cyber-bg relative overflow-hidden p-10">
        <div className="grid-overlay" />
        <div className="scanline" />
        
        {/* Ambient glow */}
        <div className="fixed top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-[150px] animate-pulse" />
        <div className="fixed bottom-1/4 right-1/4 w-[500px] h-[500px] bg-cyan-500/15 rounded-full blur-[150px] animate-pulse" />
        
        {/* 3D Logo */}
        <div className="relative w-[300px] h-[300px] mb-10">
          <BrandLogo3D />
        </div>
        
        {/* Round intro content */}
        <div className="relative z-10 text-center max-w-5xl animate-fadeIn">
          <p className="text-cyan-400 font-mono text-2xl mb-4 tracking-widest font-bold">ROUND 0{roundNumber}</p>
          <h1 className="text-6xl md:text-8xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-cyan-400 mb-6">
            {msg.title}
          </h1>
          <p className="text-4xl text-white font-display font-bold mb-8">{msg.subtitle}</p>
          <p className="text-slate-300 font-mono text-2xl mb-10 font-bold">{msg.description}</p>
          
          <div className="p-6 rounded-2xl bg-red-500/10 border-2 border-red-500/40 mb-10">
            <p className="text-red-400 font-display text-3xl font-black">⚠ {msg.warning}</p>
          </div>
          
          <div className="flex items-center justify-center gap-6 text-slate-400 font-mono text-xl mb-10 font-bold">
            <span>EXPECTED CANDIDATES: {expectedPlayers}</span>
            <span className="w-2 h-2 bg-cyan-500 rounded-full" />
            <span>AWAITING REGISTRATION</span>
          </div>
          
          <button
            onClick={() => setPhase('lobby')}
            className="cyber-btn px-16 py-6 rounded-2xl flex items-center gap-6 mx-auto text-3xl font-black"
          >
            <Play className="w-10 h-10" />
            <span className="font-display">BEGIN REGISTRATION</span>
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: SESSION END (After elimination, before next round)
  // ============================================
  if (phase === 'session-end') {
    const roundNumber = gameSession.round_number || 1;
    const survivorCount = roundNumber === 1 ? 6 : roundNumber === 2 ? 3 : 1;
    
    return (
      <div className="min-h-screen flex flex-col items-center justify-center cyber-bg relative overflow-hidden p-10">
        <div className="grid-overlay" />
        <div className="scanline" />
        
        {/* Ambient glow */}
        <div className="fixed top-1/4 left-1/4 w-[500px] h-[500px] bg-emerald-500/20 rounded-full blur-[150px] animate-pulse" />
        <div className="fixed bottom-1/4 right-1/4 w-[500px] h-[500px] bg-purple-500/15 rounded-full blur-[150px] animate-pulse" />
        
        {/* 3D Logo */}
        <div className="relative w-[280px] h-[280px] mb-10">
          <BrandLogo3D />
        </div>
        
        <div className="relative z-10 text-center max-w-5xl animate-fadeIn">
          <p className="text-emerald-400 font-mono text-2xl mb-4 tracking-widest font-bold">SESSION COMPLETE</p>
          <h1 className="text-6xl md:text-8xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-500 to-purple-400 mb-6">
            ROUND 0{roundNumber} COMPLETE
          </h1>
          <p className="text-4xl text-white font-display font-bold mb-10">
            {survivorCount} SURVIVOR{survivorCount > 1 ? 'S' : ''} ADVANCE TO ROUND 0{roundNumber + 1}
          </p>
          
          <button
            onClick={() => navigate('/')}
            className="cyber-btn px-16 py-6 rounded-2xl flex items-center gap-6 mx-auto text-2xl font-black"
          >
            <Home className="w-8 h-8" />
            <span className="font-display">RETURN TO ADMIN</span>
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: LOBBY
  // ============================================
  if (phase === 'lobby') {
    const roundNumber = gameSession.round_number || 1;
    const maxPlayers = roundNumber === 1 ? 10 : roundNumber === 2 ? 6 : 3;
    const lobbyTitle = `AWAITING CANDIDATES FOR ROUND 0${roundNumber}...`;
    const playerLabel = 'CANDIDATES';
    
    return (
      <div className="min-h-screen p-10 cyber-bg relative overflow-hidden">
        <div className="grid-overlay" />
        
        {/* 3D Brand Logo - Fixed left side, vertically centered */}
        <div className="fixed left-0 top-0 bottom-0 w-[420px] z-10 flex items-center justify-center">
          <div className="relative flex flex-col items-center">
            {/* Ambient glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div className="w-96 h-96 bg-gradient-to-r from-pink-500/30 via-purple-500/20 to-blue-500/30 rounded-full blur-[80px] animate-pulse" />
            </div>
            {/* 3D Logo - larger size */}
            <div className="relative w-[380px] h-[380px]">
              <BrandLogo3D />
            </div>
            <div className="mt-6 flex items-center gap-3 px-6 py-2 rounded-full bg-slate-900/90 backdrop-blur-sm border-2 border-cyan-500/50">
              <span className="w-3 h-3 bg-cyan-400 rounded-full animate-pulse" />
              <span className="text-cyan-400 text-lg font-mono font-black tracking-widest">ROUND 0{roundNumber}</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 ml-[420px]">
          {/* Header */}
          <div className="text-center mb-10">
            <img src="/title_CyberGenesis.png" alt="Cyber Genesis" className="h-28 object-contain mx-auto mb-6 genesis-glow" />
            <p className="text-3xl text-slate-300 font-mono font-bold tracking-wide">{lobbyTitle}</p>
          </div>

          <div className="grid grid-cols-2 gap-10 max-w-6xl mx-auto">
            {/* QR Code */}
            <div className="cyber-card rounded-3xl p-10 neon-border-purple text-center">
              <h2 className="text-4xl font-black text-white mb-8 font-display tracking-wider">SCAN TO ENTER</h2>
              <div className="qr-container bg-white p-8 rounded-2xl inline-block mb-8">
                <QRCodeSVG value={joinUrl} size={240} />
              </div>
              <p className="text-slate-400 font-mono text-sm break-all font-bold">{joinUrl}</p>
              <div className="mt-8 flex items-center justify-center gap-4 text-cyan-400">
                <Users className="w-10 h-10" />
                <span className="text-5xl font-black font-display">{activePlayers.length}/{maxPlayers}</span>
              </div>
            </div>

            {/* Players Grid */}
            <div className="cyber-card rounded-3xl p-10 neon-border">
              <h2 className="text-4xl font-black text-white mb-8 font-display tracking-wider text-center">{playerLabel}</h2>
              <div className={`grid gap-5 ${roundNumber === 3 ? 'grid-cols-3' : roundNumber === 2 ? 'grid-cols-3' : 'grid-cols-5'}`}>
                {activePlayers.map((player) => (
                  <div key={player.id} className="flex flex-col items-center animate-bounce-in relative group">
                    <div className="w-20 h-20 rounded-full overflow-hidden border-4" style={{ borderColor: player.avatar_color }}>
                      {player.photo_url ? (
                        <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-2xl font-bold" style={{ backgroundColor: player.avatar_color }}>
                          {player.name[0]}
                        </div>
                      )}
                    </div>
                    <button onClick={() => kickPlayer(player.id)} className="absolute -top-1 -right-1 w-7 h-7 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <UserX className="w-4 h-4 text-white" />
                    </button>
                    <p className="text-white text-sm mt-2 truncate max-w-full font-mono font-bold">{player.name}</p>
                  </div>
                ))}
                {Array.from({ length: Math.max(0, maxPlayers - activePlayers.length) }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center opacity-30">
                    <div className="w-20 h-20 rounded-full border-3 border-dashed border-slate-600 flex items-center justify-center">
                      <span className="text-slate-500 text-3xl font-bold">?</span>
                    </div>
                    <p className="text-slate-500 text-sm mt-2 font-mono font-bold">...</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Start Button */}
          <div className="text-center mt-10">
            <button onClick={() => startTrialIntro(roundNumber)} disabled={activePlayers.length === 0} className="cyber-btn px-16 py-6 rounded-2xl flex items-center justify-center gap-6 mx-auto disabled:opacity-50 text-3xl font-black">
              <Play className="w-12 h-12" />
              <span className="font-display tracking-wider">BEGIN ROUND 0{roundNumber}</span>
            </button>
          </div>

          {/* Current round info */}
          {(() => {
            const info = ROUND_INSTRUCTIONS[roundNumber as keyof typeof ROUND_INSTRUCTIONS];
            return info ? (
              <div className="flex items-center justify-center gap-6 mt-10">
                <div className="flex items-center gap-4 px-8 py-4 rounded-2xl border-2 border-cyan-500/40 bg-slate-900/50">
                  <span className="text-4xl">{info.icon}</span>
                  <div>
                    <span className="font-display text-2xl text-cyan-400 font-bold">ROUND 0{roundNumber}</span>
                    <p className="font-mono text-lg text-slate-300 font-bold">{STAGE_CODENAMES[roundNumber]}</p>
                  </div>
                </div>
              </div>
            ) : null;
          })()}
        </div>

        {/* Trial Intro Modal */}
        {showTrialIntro && (
          <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm z-50 flex items-center justify-center p-10">
            <div className="max-w-5xl w-full animate-bounce-in">
              {(() => {
                const stage = roundNumber; // Use round_number for multi-session
                const info = ROUND_INSTRUCTIONS[stage as keyof typeof ROUND_INSTRUCTIONS];
                if (!info) return null;
                
                const colorMap = { cyan: '#22d3ee', pink: '#ec4899', emerald: '#22c55e' };
                const color = colorMap[info.color as keyof typeof colorMap];
                
                return (
                  <div className="cyber-card rounded-3xl overflow-hidden" style={{ border: `4px solid ${color}`, boxShadow: `0 0 50px ${color}50` }}>
                    {/* Header */}
                    <div className="p-10 text-center" style={{ background: `linear-gradient(135deg, ${color}20, transparent)` }}>
                      <span className="text-9xl mb-6 block">{info.icon}</span>
                      <h1 className="text-6xl font-display font-black text-white mb-4 tracking-wide">{info.title}</h1>
                      <p className="text-2xl font-mono font-bold" style={{ color }}>{info.objective}</p>
                    </div>

                    {/* Rules - with demo for all rounds */}
                    <div className="p-6">
                      <div className="flex gap-6">
                        {/* Rules list */}
                        <div className="space-y-3 flex-1">
                          <h3 className="text-4xl font-display font-black text-white mb-4">PROTOCOL RULES:</h3>
                          {info.rules.map((rule, idx) => (
                            <div key={idx} className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-700/50">
                              <span className="w-14 h-14 rounded-full flex items-center justify-center font-black text-2xl shrink-0" style={{ backgroundColor: `${color}40`, color }}>
                                {idx + 1}
                              </span>
                              <p className="text-white font-display text-2xl font-black uppercase tracking-wide">{rule}</p>
                            </div>
                          ))}
                        </div>
                        
                        {/* Demo Animations */}
                        {stage === 1 && <TapRaceDemo />}
                        {stage === 2 && <RPSDemo />}
                        {stage === 3 && <TimerDemo />}
                      </div>

                      {/* Elimination warning - only show if not empty */}
                      {info.elimination && (
                        <div className="p-6 rounded-xl bg-red-500/20 border-2 border-red-500/50 mt-6">
                          <div className="flex items-center gap-4">
                            <Skull className="w-10 h-10 text-red-400" />
                            <p className="text-red-400 font-display text-2xl font-black">ELIMINATION: {info.elimination}</p>
                          </div>
                        </div>
                      )}

                      {/* Tip */}
                      <div className="text-center mt-8">
                        <p className="text-3xl font-display font-bold" style={{ color }}>{info.tip}</p>
                      </div>

                      {/* Start button */}
                      <div className="flex justify-center mt-8">
                        <button onClick={() => beginTrial(stage)} className="cyber-btn px-16 py-6 rounded-2xl flex items-center gap-6 text-3xl font-black">
                          <Play className="w-10 h-10" />
                          <span className="font-display">START ROUND</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // RENDER: TRIAL INTRO (between trials)
  // ============================================
  if (phase === 'trial-intro' && showTrialIntro) {
    const nextStage = gameSession.round_number || 1; // Use round_number for multi-session
    const info = ROUND_INSTRUCTIONS[nextStage as keyof typeof ROUND_INSTRUCTIONS];
    
    if (info) {
      const colorMap = { cyan: '#22d3ee', pink: '#ec4899', emerald: '#22c55e' };
      const color = colorMap[info.color as keyof typeof colorMap];
      
      return (
        <div className="min-h-screen cyber-bg relative overflow-hidden flex items-center justify-center p-10">
          <div className="grid-overlay" />
          <div className="scanline" />
          
          <div className="max-w-5xl w-full animate-bounce-in relative z-10">
            <div className="cyber-card rounded-3xl overflow-hidden" style={{ border: `4px solid ${color}`, boxShadow: `0 0 50px ${color}50` }}>
              {/* Header */}
              <div className="p-10 text-center" style={{ background: `linear-gradient(135deg, ${color}20, transparent)` }}>
                <span className="text-9xl mb-6 block">{info.icon}</span>
                <h1 className="text-6xl font-display font-black text-white mb-4 tracking-wide">{info.title}</h1>
                <p className="text-2xl font-mono font-bold" style={{ color }}>{info.objective}</p>
              </div>

              {/* Rules */}
              {/* Rules - with demo for all rounds */}
              <div className="p-6">
                <div className="flex gap-6">
                  {/* Rules list */}
                  <div className="space-y-3 flex-1">
                    <h3 className="text-4xl font-display font-black text-white mb-4">PROTOCOL RULES:</h3>
                    {info.rules.map((rule, idx) => (
                      <div key={idx} className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-700/50">
                        <span className="w-14 h-14 rounded-full flex items-center justify-center font-black text-2xl shrink-0" style={{ backgroundColor: `${color}40`, color }}>
                          {idx + 1}
                        </span>
                        <p className="text-white font-display text-2xl font-black uppercase tracking-wide">{rule}</p>
                      </div>
                    ))}
                  </div>
                  
                  {/* Demo Animations */}
                  {nextStage === 1 && <TapRaceDemo />}
                  {nextStage === 2 && <RPSDemo />}
                  {nextStage === 3 && <TimerDemo />}
                </div>

                {/* Elimination warning - only show if not empty */}
                {info.elimination && (
                  <div className="p-6 rounded-xl bg-red-500/20 border-2 border-red-500/50 mt-6">
                    <div className="flex items-center gap-4">
                      <Skull className="w-10 h-10 text-red-400" />
                      <p className="text-red-400 font-display text-2xl font-black">ELIMINATION: {info.elimination}</p>
                    </div>
                  </div>
                )}

                {/* Tip */}
                <div className="text-center mt-8">
                  <p className="text-3xl font-display font-bold" style={{ color }}>{info.tip}</p>
                </div>

                {/* Start button */}
                <div className="flex justify-center mt-8">
                  <button onClick={() => beginTrial(nextStage)} className="cyber-btn px-16 py-6 rounded-2xl flex items-center gap-6 text-3xl font-black">
                    <Play className="w-10 h-10" />
                    <span className="font-display">BEGIN PROTOCOL</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }
  }

  // ============================================
  // RENDER: STANDINGS REVEAL (Full Scoreboard)
  // ============================================
  if (phase === 'standings-reveal') {
    const currentStage = gameSession.current_stage || 1;
    const eliminateCount = ELIMINATIONS[currentStage] || 0;
    const roundNumber = gameSession.round_number || 1;
    
    return (
      <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center bg-black p-8">
        {/* Deep background */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-purple-950/20 to-slate-950" />
        
        {/* Animated grid lines */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(90deg, rgba(168, 85, 247, 0.1) 1px, transparent 1px),
              linear-gradient(rgba(168, 85, 247, 0.1) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px'
          }} />
        </div>
        
        {/* Corner decorations */}
        <div className="absolute top-8 left-8 w-24 h-24 border-l-2 border-t-2 border-cyan-400/40 rounded-tl-3xl" />
        <div className="absolute top-8 right-8 w-24 h-24 border-r-2 border-t-2 border-cyan-400/40 rounded-tr-3xl" />
        <div className="absolute bottom-8 left-8 w-24 h-24 border-l-2 border-b-2 border-cyan-400/40 rounded-bl-3xl" />
        <div className="absolute bottom-8 right-8 w-24 h-24 border-r-2 border-b-2 border-cyan-400/40 rounded-br-3xl" />
        
        {/* Ambient glow */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-cyan-500/20 rounded-full blur-[150px]" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-purple-500/20 rounded-full blur-[150px]" />
        </div>
        
        <div className="relative z-10 w-full max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <p className="text-cyan-400/60 font-mono text-xl tracking-[0.3em] mb-2">ROUND {roundNumber}</p>
            <h1 className="text-5xl md:text-6xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 mb-4">
              FINAL STANDINGS
            </h1>
            <p className="text-slate-400 font-mono text-lg">
              {eliminationRankings.length} CANDIDATES COMPETED
            </p>
          </div>
          
          {/* Standings Table */}
          <div className="bg-slate-900/80 border-2 border-cyan-400/30 rounded-2xl overflow-hidden shadow-[0_0_60px_rgba(34,211,238,0.1)]">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-slate-800/60 border-b border-cyan-400/20">
              <div className="col-span-1 text-center">
                <span className="text-cyan-400 font-mono text-sm font-bold">RANK</span>
              </div>
              <div className="col-span-7">
                <span className="text-cyan-400 font-mono text-sm font-bold">CANDIDATE</span>
              </div>
              <div className="col-span-4 text-right">
                <span className="text-cyan-400 font-mono text-sm font-bold">
                  {currentStage === 2 ? 'SCORE' : 'TIME'}
                </span>
              </div>
            </div>
            
            {/* Player Rows */}
            <div className="divide-y divide-slate-700/50">
              {eliminationRankings.map((player, index) => {
                const rank = index + 1;
                const isEliminated = rank > eliminationRankings.length - eliminateCount;
                const isTop3 = rank <= 3;
                
                // Format score based on stage type
                let scoreDisplay = '---';
                if (player.score !== undefined && player.score !== Infinity) {
                  if (currentStage === 2) {
                    scoreDisplay = `${player.score} pts`;
                  } else {
                    scoreDisplay = `${player.score.toFixed(2)}s`;
                  }
                }
                
                return (
                  <div 
                    key={player.id}
                    className={`grid grid-cols-12 gap-4 px-6 py-4 transition-all duration-300 ${
                      isEliminated 
                        ? 'bg-red-950/30 border-l-4 border-red-500/50' 
                        : isTop3 
                        ? 'bg-yellow-950/20' 
                        : 'hover:bg-slate-800/40'
                    }`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* Rank */}
                    <div className="col-span-1 flex items-center justify-center">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-display font-black text-lg ${
                        rank === 1 
                          ? 'bg-yellow-500 text-yellow-900' 
                          : rank === 2 
                          ? 'bg-slate-300 text-slate-800' 
                          : rank === 3 
                          ? 'bg-amber-600 text-amber-100'
                          : isEliminated
                          ? 'bg-red-500/30 text-red-400'
                          : 'bg-slate-700 text-slate-300'
                      }`}>
                        {rank}
                      </div>
                    </div>
                    
                    {/* Player Info */}
                    <div className="col-span-7 flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-full overflow-hidden border-2 ${
                        isEliminated ? 'border-red-500/50' : 'border-cyan-400/30'
                      }`}>
                        {player.photo_url ? (
                          <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                        ) : (
                          <div 
                            className="w-full h-full flex items-center justify-center text-xl font-display font-black"
                            style={{ backgroundColor: player.avatar_color || '#6366f1' }}
                          >
                            {player.name?.charAt(0) || '?'}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className={`text-2xl font-display font-bold ${
                          isEliminated ? 'text-red-400' : isTop3 ? 'text-yellow-400' : 'text-white'
                        }`}>
                          {player.name}
                        </p>
                        {isEliminated && (
                          <p className="text-red-400/70 font-mono text-xs">ELIMINATED</p>
                        )}
                        {rank === 1 && <p className="text-yellow-400/70 font-mono text-xs">🏆 TOP PERFORMER</p>}
                      </div>
                    </div>
                    
                    {/* Score */}
                    <div className="col-span-4 flex items-center justify-end">
                      <span className={`text-2xl font-mono font-bold ${
                        isEliminated ? 'text-red-400' : isTop3 ? 'text-yellow-400' : 'text-cyan-400'
                      }`}>
                        {scoreDisplay}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Summary */}
          <div className="mt-8 flex items-center justify-center gap-8">
            <div className="text-center px-8 py-4 rounded-xl bg-green-500/10 border border-green-500/30">
              <p className="text-3xl font-display font-black text-green-400">{eliminationRankings.length - eliminateCount}</p>
              <p className="text-green-400/70 font-mono text-sm font-bold">ADVANCING</p>
            </div>
            <div className="text-center px-8 py-4 rounded-xl bg-red-500/10 border border-red-500/30">
              <p className="text-3xl font-display font-black text-red-400">{eliminateCount}</p>
              <p className="text-red-400/70 font-mono text-sm font-bold">ELIMINATED</p>
            </div>
          </div>
          
          {/* Continue prompt */}
          <div className="mt-10 text-center">
            <p className="text-cyan-400/80 font-display text-2xl tracking-wider animate-pulse">
              PROCEED TO PRIZE REVEAL
            </p>
            <p className="text-slate-500 font-mono text-sm mt-2">Press ENTER or → to continue</p>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: PRIZE REVEAL CEREMONY
  // ============================================
  if (phase === 'prize-reveal') {
    const roundNumber = gameSession.round_number || 1;
    const eliminatedPositions = getEliminatedPositions(roundNumber);
    const currentPosition = eliminatedPositions[prizeRevealIndex];
    const prizeData = ROUND_PRIZES[roundNumber]?.[currentPosition];
    
    // Get the player for this position from eliminationRankings
    // eliminationRankings is sorted best to worst, so eliminated players are at the end
    const eliminateCount = ELIMINATIONS[gameSession.current_stage || 1] || 0;
    
    // Eliminated players are at the end of eliminationRankings (worst performers)
    // Reverse so 10th place (worst) comes first
    const eliminatedPlayersReversed = [...eliminationRankings.slice(-eliminateCount)].reverse();
    const currentPlayer = eliminatedPlayersReversed[prizeRevealIndex];
    
    const isLastPrize = prizeRevealIndex >= eliminatedPositions.length - 1;

    return (
      <div className="min-h-screen relative overflow-hidden flex flex-col items-center justify-center bg-black">
        {/* Deep space background */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-purple-950/30 to-slate-950" />
        
        {/* Radial spotlight effect */}
        <div 
          className="absolute inset-0 transition-opacity duration-1000"
          style={{
            background: prizeRevealed 
              ? 'radial-gradient(ellipse at 50% 40%, rgba(251, 191, 36, 0.3) 0%, rgba(251, 191, 36, 0.1) 30%, transparent 60%)'
              : 'radial-gradient(ellipse at 50% 40%, rgba(147, 51, 234, 0.2) 0%, rgba(147, 51, 234, 0.05) 30%, transparent 60%)',
          }}
        />
        
        {/* Animated light beams */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div 
            className="absolute w-1 h-[200%] bg-gradient-to-b from-transparent via-yellow-400/20 to-transparent -rotate-12 animate-pulse"
            style={{ left: '20%', top: '-50%', animationDuration: '3s' }}
          />
          <div 
            className="absolute w-1 h-[200%] bg-gradient-to-b from-transparent via-cyan-400/20 to-transparent rotate-12 animate-pulse"
            style={{ right: '20%', top: '-50%', animationDuration: '4s', animationDelay: '1s' }}
          />
          <div 
            className="absolute w-0.5 h-[200%] bg-gradient-to-b from-transparent via-pink-400/15 to-transparent -rotate-6 animate-pulse"
            style={{ left: '35%', top: '-50%', animationDuration: '5s', animationDelay: '0.5s' }}
          />
          <div 
            className="absolute w-0.5 h-[200%] bg-gradient-to-b from-transparent via-purple-400/15 to-transparent rotate-6 animate-pulse"
            style={{ right: '35%', top: '-50%', animationDuration: '4.5s', animationDelay: '1.5s' }}
          />
        </div>
        
        {/* Floating particles - more dramatic */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full animate-float"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                width: `${Math.random() * 6 + 2}px`,
                height: `${Math.random() * 6 + 2}px`,
                background: prizeRevealed 
                  ? (i % 4 === 0 ? '#fbbf24' : i % 4 === 1 ? '#fef08a' : i % 4 === 2 ? '#f59e0b' : '#fcd34d')
                  : (i % 3 === 0 ? '#a855f7' : i % 3 === 1 ? '#22d3ee' : '#ec4899'),
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${Math.random() * 4 + 3}s`,
                opacity: Math.random() * 0.5 + 0.3,
                boxShadow: prizeRevealed ? '0 0 10px #fbbf24' : '0 0 8px #a855f7',
              }}
            />
          ))}
        </div>
        
        {/* Confetti explosion on reveal */}
        {prizeRevealed && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 60 }).map((_, i) => (
              <div
                key={`confetti-${i}`}
                className="absolute animate-confetti"
                style={{
                  left: `${40 + Math.random() * 20}%`,
                  top: '-20px',
                  width: `${Math.random() * 12 + 6}px`,
                  height: `${Math.random() * 12 + 6}px`,
                  background: ['#fbbf24', '#ef4444', '#22c55e', '#3b82f6', '#ec4899', '#a855f7'][i % 6],
                  borderRadius: i % 2 === 0 ? '50%' : '2px',
                  animationDelay: `${Math.random() * 0.5}s`,
                  animationDuration: `${Math.random() * 2 + 2}s`,
                }}
              />
            ))}
          </div>
        )}
        
        {/* Screen flash on reveal */}
        {prizeRevealed && (
          <div 
            className="absolute inset-0 bg-yellow-400/30 pointer-events-none"
            style={{
              animation: 'flash 0.5s ease-out forwards',
            }}
          />
        )}
        
        {/* Main Content */}
        <div className="relative z-10 text-center max-w-5xl mx-auto px-8">
          
          {/* Rank Badge - Larger and more dramatic */}
          <div className={`mb-6 ${prizeAnimationPhase !== 'entering' ? 'animate-prize-slide-down' : 'opacity-0'}`}>
            <div className="relative inline-block">
              {/* Glow behind badge */}
              <div className="absolute inset-0 blur-2xl bg-yellow-500/40 rounded-3xl scale-110" />
              <div className="relative px-12 py-4 bg-gradient-to-r from-amber-600/30 via-yellow-500/40 to-amber-600/30 border-3 border-yellow-400/80 rounded-2xl backdrop-blur-sm">
                <h1 className="text-5xl md:text-6xl font-display font-black tracking-wider animate-text-shimmer">
                  {prizeData?.title || `${currentPosition}TH PLACE`}
                </h1>
              </div>
            </div>
          </div>
          
          {/* Decorative line */}
          <div className={`flex items-center justify-center gap-4 mb-8 ${prizeAnimationPhase !== 'entering' ? 'animate-fadeIn' : 'opacity-0'}`}>
            <div className="h-0.5 w-24 bg-gradient-to-r from-transparent via-yellow-400 to-yellow-400" />
            <span className="text-yellow-400 text-3xl">★</span>
            <span className="text-yellow-400 font-display text-2xl font-bold tracking-[0.3em]">CONGRATULATIONS</span>
            <span className="text-yellow-400 text-3xl">★</span>
            <div className="h-0.5 w-24 bg-gradient-to-l from-transparent via-yellow-400 to-yellow-400" />
          </div>
          
          {/* Player Photo & Name - Larger with dramatic effects */}
          {currentPlayer && (
            <div className={`mb-10 ${prizeAnimationPhase === 'name' || prizeAnimationPhase === 'box' || prizeAnimationPhase === 'revealed' ? 'animate-prize-zoom-in' : 'opacity-0'}`}>
              {/* Photo with spotlight ring */}
              <div className="relative inline-block mb-8">
                {/* Animated rings */}
                <div className="absolute inset-0 -m-4 rounded-full border-2 border-yellow-400/30 animate-ping" style={{ animationDuration: '2s' }} />
                <div className="absolute inset-0 -m-8 rounded-full border border-yellow-400/20 animate-ping" style={{ animationDuration: '3s' }} />
                
                {/* Glow */}
                <div className="absolute inset-0 -m-2 rounded-full bg-yellow-400/30 blur-xl" />
                
                {/* Photo */}
                <div className="relative w-48 h-48 rounded-full overflow-hidden border-4 border-yellow-400 shadow-[0_0_40px_rgba(251,191,36,0.5)]">
                  {currentPlayer.photo_url ? (
                    <img 
                      src={currentPlayer.photo_url} 
                      alt={currentPlayer.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div 
                      className="w-full h-full flex items-center justify-center text-7xl font-display font-black"
                      style={{ backgroundColor: currentPlayer.avatar_color || '#6366f1' }}
                    >
                      {currentPlayer.name.charAt(0)}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Name - smaller than prize */}
              <div className="relative">
                <h2 className="text-4xl md:text-5xl font-display font-black text-white tracking-wide drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                  {currentPlayer.name}
                </h2>
              </div>
            </div>
          )}
          
          {/* Prize Box - More dramatic */}
          <div className={`mb-10 ${prizeAnimationPhase === 'box' || prizeAnimationPhase === 'revealed' ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`}>
            {prizeAnimationPhase === 'box' && !prizeRevealed ? (
              // Mystery Box - Larger, more suspenseful
              <div className="relative inline-block">
                {/* Pulsing glow behind box */}
                <div className="absolute inset-0 -m-4 bg-purple-500/30 blur-2xl rounded-3xl animate-pulse" />
                
                <div className="relative px-20 py-10 bg-gradient-to-br from-purple-900/60 via-pink-900/40 to-purple-900/60 border-4 border-dashed border-purple-400/80 rounded-3xl animate-prize-box-shake backdrop-blur-sm">
                  <p className="text-8xl mb-4 animate-bounce" style={{ animationDuration: '1s' }}>🎁</p>
                  <p className="text-purple-200 font-display text-3xl font-black tracking-wider">
                    MYSTERY PRIZE
                  </p>
                  <p className="text-purple-400/60 font-mono text-sm mt-2 animate-pulse">
                    AWAITING REVEAL...
                  </p>
                </div>
              </div>
            ) : prizeRevealed || prizeAnimationPhase === 'revealed' ? (
              // Revealed Prize - Explosive reveal
              <div className="relative inline-block animate-prize-reveal">
                {/* Golden glow explosion */}
                <div className="absolute inset-0 -m-12 bg-yellow-400/50 blur-3xl rounded-3xl animate-pulse" />
                
                <div className="relative w-full max-w-5xl mx-auto px-10 py-8 bg-gradient-to-br from-yellow-600/50 via-amber-500/60 to-yellow-600/50 border-4 border-yellow-400 rounded-3xl shadow-[0_0_100px_rgba(251,191,36,0.7)] backdrop-blur-sm">
                  {/* Prize icon with glow */}
                  <div className="flex justify-center mb-4">
                    <div className="relative">
                      <div className="absolute inset-0 -m-4 bg-yellow-400/60 blur-2xl rounded-full animate-pulse" />
                      <p className="relative text-7xl animate-bounce" style={{ animationDuration: '0.5s' }}>🏆</p>
                    </div>
                  </div>
                  
                  {/* Prize name - ULTIMATE SIZE */}
                  <p className="text-yellow-100 font-display text-5xl md:text-6xl lg:text-7xl font-black tracking-wide drop-shadow-[0_0_40px_rgba(251,191,36,0.9)] text-center leading-tight">
                    {prizeData?.prize || 'PRIZE'}
                  </p>
                  
                  {/* Description */}
                  <p className="text-yellow-300/90 font-mono text-2xl mt-4 tracking-widest text-center">
                    {prizeData?.description || 'Congratulations!'}
                  </p>
                  
                  {/* Decorative lines */}
                  <div className="flex items-center justify-center gap-4 mt-5">
                    <div className="w-28 h-1 bg-gradient-to-r from-transparent to-yellow-400 rounded-full" />
                    <span className="text-yellow-400 text-3xl">✦</span>
                    <div className="w-28 h-1 bg-gradient-to-l from-transparent to-yellow-400 rounded-full" />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          
          {/* Status text - More subtle */}
          {prizeAnimationPhase === 'box' && (
            <div className="animate-fadeIn text-center">
              <p className={`font-display text-2xl font-bold tracking-[0.2em] transition-colors duration-500 ${
                prizeRevealed ? 'text-yellow-400' : 'text-cyan-400/80'
              }`}>
                {!prizeRevealed ? 'REVEAL THE PRIZE' : isLastPrize ? (roundNumber === 3 ? 'CROWN THE CHAMPIONS' : 'VIEW STANDINGS') : 'NEXT WINNER'}
              </p>
              
              <div className="flex items-center justify-center gap-2 mt-4">
                {eliminatedPositions.map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-3 h-3 rounded-full transition-all duration-300 ${
                      idx < prizeRevealIndex ? 'bg-yellow-400' : 
                      idx === prizeRevealIndex ? (prizeRevealed ? 'bg-yellow-400 scale-125' : 'bg-purple-400 animate-pulse') : 
                      'bg-slate-600'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* Corner decorations */}
        <div className="absolute top-8 left-8 w-24 h-24 border-l-2 border-t-2 border-yellow-400/30 rounded-tl-3xl" />
        <div className="absolute top-8 right-8 w-24 h-24 border-r-2 border-t-2 border-yellow-400/30 rounded-tr-3xl" />
        <div className="absolute bottom-8 left-8 w-24 h-24 border-l-2 border-b-2 border-yellow-400/30 rounded-bl-3xl" />
        <div className="absolute bottom-8 right-8 w-24 h-24 border-r-2 border-b-2 border-yellow-400/30 rounded-br-3xl" />
      </div>
    );
  }

  // ============================================
  // RENDER: ELIMINATION SCREEN
  // ============================================
  if (phase === 'elimination') {
    const currentStage = gameSession.current_stage || 1;
    const eliminateCount = ELIMINATIONS[currentStage] || 0;
    const totalPlayers = eliminationRankings.length;
    const survivorCount = totalPlayers - eliminateCount;
    
    return (
      <div className="min-h-screen cyber-bg relative overflow-hidden flex flex-col p-8">
        <div className="grid-overlay" />
        <div className="scanline" />
        
        {/* Header */}
        <div className="text-center py-8 relative z-10">
          <h1 className="text-7xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-500 to-purple-500 mb-4 tracking-wider">
            ROUND 0{currentStage} COMPLETE
          </h1>
          <p className="text-slate-300 font-mono text-2xl tracking-widest font-bold">
            {revealedRank >= totalPlayers ? 'RESULTS CALCULATED' : 'CALCULATING RESULTS...'}
          </p>
        </div>
        
        {/* Grid layout for all players - fits on one screen */}
        <div className="flex-1 flex flex-col justify-center relative z-10">
          {/* Survivors */}
          <div className="mb-10">
            <h2 className="text-center text-emerald-400 font-display text-4xl font-black mb-6 flex items-center justify-center gap-4 tracking-wider">
              <span className="w-16 h-1 bg-emerald-500/50" />
              SURVIVORS ({survivorCount})
              <span className="w-16 h-1 bg-emerald-500/50" />
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 max-w-7xl mx-auto">
              {eliminationRankings.slice(0, survivorCount).map((player, idx) => {
                const rank = idx + 1;
                const isRevealed = revealedRank >= (idx + 1);
                const isTop = rank === 1;
                
                return (
                  <div
                    key={player.id}
                    className={`p-5 rounded-2xl text-center transition-all duration-500 ${
                      isRevealed 
                        ? isTop
                          ? 'bg-yellow-500/20 border-4 border-yellow-500/60 opacity-100 scale-100'
                          : 'bg-emerald-500/10 border-2 border-emerald-500/40 opacity-100 scale-100'
                        : 'opacity-0 scale-90'
                    }`}
                    style={{ transitionDelay: `${idx * 80}ms` }}
                  >
                    <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center font-black text-3xl font-display mb-3 ${
                      isTop ? 'bg-yellow-500/30 text-yellow-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {isTop ? <Crown className="w-10 h-10" /> : `#${rank}`}
                    </div>
                    <p className={`font-display text-xl font-bold truncate ${isTop ? 'text-yellow-400' : 'text-white'}`}>
                      {player.name}
                    </p>
                    <p className="text-slate-400 font-mono text-lg font-bold mt-2">
                      {currentStage === 2 ? `${player.score} PTS` : `${(player.score || 0).toFixed(2)}s`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Eliminated */}
          <div>
            <h2 className="text-center text-red-400 font-display text-4xl font-black mb-6 flex items-center justify-center gap-4 tracking-wider">
              <span className="w-16 h-1 bg-red-500/50" />
              <Skull className="w-10 h-10" /> ELIMINATED ({eliminateCount})
              <span className="w-16 h-1 bg-red-500/50" />
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {eliminationRankings.slice(-eliminateCount).map((player, idx) => {
                const rank = survivorCount + idx + 1;
                const isRevealed = revealedRank >= (survivorCount + idx + 1);
                
                return (
                  <div
                    key={player.id}
                    className={`p-5 rounded-2xl text-center transition-all duration-500 ${
                      isRevealed 
                        ? 'bg-red-500/20 border-4 border-red-500/60 opacity-100 scale-100'
                        : 'opacity-0 scale-90'
                    }`}
                    style={{ transitionDelay: `${(survivorCount + idx) * 80}ms` }}
                  >
                    <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center font-black text-3xl font-display mb-3 bg-red-500/30 text-red-400">
                      #{rank}
                    </div>
                    <p className="font-display text-xl font-bold truncate text-red-400">
                      {player.name}
                    </p>
                    <p className="text-red-400/80 font-mono text-lg font-bold mt-2">
                      {currentStage === 2 ? `${player.score} PTS` : `${(player.score || 0).toFixed(2)}s`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Summary & Continue Button */}
        {revealedRank >= totalPlayers && (
          <div className="py-8 text-center relative z-10 animate-fadeIn">
            <div className="p-6 rounded-2xl bg-slate-900/80 border-2 border-purple-500/40 inline-block mb-6">
              <p className="text-purple-400 font-display text-3xl font-black tracking-wide">
                {eliminateCount} ELIMINATED • {survivorCount} SURVIVING
              </p>
            </div>
            
            <div>
              <button 
                onClick={continueFromElimination}
                className="cyber-btn px-16 py-6 rounded-2xl flex items-center gap-6 mx-auto text-3xl font-black"
              >
                {currentStage < 3 ? (
                  <>
                    <span className="font-display">PROCEED TO ROUND 0{currentStage + 1}</span>
                    <ChevronRight className="w-10 h-10" />
                  </>
                ) : (
                  <>
                    <Crown className="w-10 h-10" />
                    <span className="font-display">REVEAL CHAMPION</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // RENDER: CHAMPION REVEAL (Staged: 3rd → Mystery → 2nd → 1st)
  // ============================================
  const CHAMPION_STEPS = [
    { text: 'THE PROTOCOL IS COMPLETE', duration: 2500 },
    { text: 'ALL ROUNDS HAVE BEEN CONQUERED', duration: 2500 },
    { text: 'THREE FINALISTS STAND BEFORE YOU', duration: 2500 },
    { text: 'WHO WILL CLAIM GLORY...', duration: 2500 },
    { text: 'REVEAL', duration: 0 }, // Triggers third place stage
  ];
  const isFinaleReveal = championRevealStep >= CHAMPION_STEPS.length - 1;
  
  // Get 1st, 2nd, 3rd place from rankings
  const firstPlace = eliminationRankings[0];
  const secondPlace = eliminationRankings[1];
  const thirdPlace = eliminationRankings[2];
  const firstPrize = ROUND_PRIZES[3]?.[1];
  const secondPrize = ROUND_PRIZES[3]?.[2];
  const thirdPrize = ROUND_PRIZES[3]?.[3];
  
  if (phase === 'champion') {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center bg-black">
        {/* Deep background - intensifies with reveals */}
        <div className={`absolute inset-0 transition-all duration-1000 ${
          championRevealStage === 'first' 
            ? 'bg-gradient-to-b from-yellow-950/40 via-amber-950/30 to-slate-950'
            : championRevealStage === 'second'
            ? 'bg-gradient-to-b from-slate-800/40 via-slate-900/30 to-slate-950'
            : championRevealStage === 'third'
            ? 'bg-gradient-to-b from-amber-900/40 via-amber-950/30 to-slate-950'
            : 'bg-gradient-to-b from-purple-950/40 via-slate-950 to-slate-950'
        }`} />
        
        {/* Animated spotlight beams - intense for all reveals */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* Golden rays for 1st place */}
          {championRevealStage === 'first' && (
            <>
              {Array.from({ length: 12 }).map((_, i) => (
                <div 
                  key={i}
                  className="absolute w-2 h-[200%] bg-gradient-to-b from-transparent via-yellow-400/40 to-transparent animate-pulse origin-center"
                  style={{ 
                    left: '50%', 
                    top: '-50%',
                    transform: `rotate(${i * 30}deg)`,
                    animationDuration: '1s',
                    animationDelay: `${i * 0.1}s`
                  }}
                />
              ))}
            </>
          )}
          {/* Silver rays for 2nd place */}
          {championRevealStage === 'second' && (
            <>
              {Array.from({ length: 12 }).map((_, i) => (
                <div 
                  key={i}
                  className="absolute w-2 h-[200%] bg-gradient-to-b from-transparent via-slate-300/40 to-transparent animate-pulse origin-center"
                  style={{ 
                    left: '50%', 
                    top: '-50%',
                    transform: `rotate(${i * 30}deg)`,
                    animationDuration: '1s',
                    animationDelay: `${i * 0.1}s`
                  }}
                />
              ))}
            </>
          )}
          {/* Bronze rays for 3rd place */}
          {championRevealStage === 'third' && (
            <>
              {Array.from({ length: 12 }).map((_, i) => (
                <div 
                  key={i}
                  className="absolute w-2 h-[200%] bg-gradient-to-b from-transparent via-amber-500/40 to-transparent animate-pulse origin-center"
                  style={{ 
                    left: '50%', 
                    top: '-50%',
                    transform: `rotate(${i * 30}deg)`,
                    animationDuration: '1s',
                    animationDelay: `${i * 0.1}s`
                  }}
                />
              ))}
            </>
          )}
          {/* Side beams for all stages */}
          {championRevealStage !== 'pending' && (
            <>
              <div 
                className={`absolute w-2 h-[200%] bg-gradient-to-b from-transparent to-transparent -rotate-12 animate-pulse ${
                  championRevealStage === 'first' ? 'via-yellow-400/20' :
                  championRevealStage === 'second' ? 'via-slate-300/20' : 'via-amber-500/20'
                }`}
                style={{ left: '30%', top: '-50%', animationDuration: '2s' }}
              />
              <div 
                className={`absolute w-2 h-[200%] bg-gradient-to-b from-transparent to-transparent rotate-12 animate-pulse ${
                  championRevealStage === 'first' ? 'via-yellow-400/20' :
                  championRevealStage === 'second' ? 'via-slate-300/20' : 'via-amber-500/20'
                }`}
                style={{ right: '30%', top: '-50%', animationDuration: '2.5s', animationDelay: '0.5s' }}
              />
            </>
          )}
        </div>
        
        {/* Screen flash on reveals */}
        {championRevealStage === 'first' && (
          <div 
            className="absolute inset-0 bg-yellow-400/50 pointer-events-none z-30"
            style={{ animation: 'flash 0.8s ease-out forwards' }}
          />
        )}
        {championRevealStage === 'second' && (
          <div 
            className="absolute inset-0 bg-slate-300/40 pointer-events-none z-30"
            style={{ animation: 'flash 0.8s ease-out forwards' }}
          />
        )}
        {championRevealStage === 'third' && (
          <div 
            className="absolute inset-0 bg-amber-500/40 pointer-events-none z-30"
            style={{ animation: 'flash 0.8s ease-out forwards' }}
          />
        )}
        
        {/* MASSIVE Confetti explosion for 1st place */}
        {championRevealStage === 'first' && (
          <div className="fixed inset-0 pointer-events-none z-20">
            {Array.from({ length: 150 }).map((_, i) => (
              <div
                key={i}
                className="absolute animate-confetti"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: '-20px',
                  width: `${Math.random() * 16 + 8}px`,
                  height: `${Math.random() * 16 + 8}px`,
                  background: ['#ffd700', '#ffed4a', '#fbbf24', '#f59e0b', '#d97706', '#ffffff'][i % 6],
                  borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '2px' : '0',
                  animationDelay: `${Math.random() * 1}s`,
                  animationDuration: `${2 + Math.random() * 2}s`,
                }}
              />
            ))}
          </div>
        )}
        
        {/* MASSIVE Silver confetti for 2nd place */}
        {championRevealStage === 'second' && (
          <div className="fixed inset-0 pointer-events-none z-20">
            {Array.from({ length: 120 }).map((_, i) => (
              <div
                key={i}
                className="absolute animate-confetti"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: '-20px',
                  width: `${Math.random() * 14 + 6}px`,
                  height: `${Math.random() * 14 + 6}px`,
                  background: ['#c0c0c0', '#d1d5db', '#9ca3af', '#e5e7eb', '#f3f4f6', '#ffffff'][i % 6],
                  borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '2px' : '0',
                  animationDelay: `${Math.random() * 1}s`,
                  animationDuration: `${2 + Math.random() * 2}s`,
                }}
              />
            ))}
          </div>
        )}
        
        {/* MASSIVE Bronze confetti for 3rd place */}
        {championRevealStage === 'third' && (
          <div className="fixed inset-0 pointer-events-none z-20">
            {Array.from({ length: 100 }).map((_, i) => (
              <div
                key={i}
                className="absolute animate-confetti"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: '-20px',
                  width: `${Math.random() * 12 + 5}px`,
                  height: `${Math.random() * 12 + 5}px`,
                  background: ['#cd7f32', '#b87333', '#d97706', '#f59e0b', '#ea580c', '#fbbf24'][i % 6],
                  borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '2px' : '0',
                  animationDelay: `${Math.random() * 1}s`,
                  animationDuration: `${2 + Math.random() * 2}s`,
                }}
              />
            ))}
          </div>
        )}
        
        {/* Ambient glow - intensifies with stages */}
        <div className="fixed inset-0 pointer-events-none">
          {championRevealStage === 'first' && (
            <div className="absolute inset-0 bg-yellow-500/20 animate-pulse" style={{ animationDuration: '0.5s' }} />
          )}
          {championRevealStage === 'second' && (
            <div className="absolute inset-0 bg-slate-300/15 animate-pulse" style={{ animationDuration: '0.6s' }} />
          )}
          {championRevealStage === 'third' && (
            <div className="absolute inset-0 bg-amber-500/15 animate-pulse" style={{ animationDuration: '0.7s' }} />
          )}
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[200px] transition-all duration-1000 ${
            championRevealStage === 'first' 
              ? 'w-[1000px] h-[1000px] bg-yellow-500/50'
              : championRevealStage === 'second'
              ? 'w-[900px] h-[900px] bg-slate-300/40'
              : championRevealStage === 'third'
              ? 'w-[800px] h-[800px] bg-amber-500/40'
              : championRevealStage === 'pending'
              ? 'w-[450px] h-[450px] bg-purple-500/30 animate-pulse'
              : 'w-[400px] h-[400px] bg-purple-500/20'
          }`} />
        </div>
        
        <div className="text-center relative z-10 max-w-7xl mx-auto px-10 w-full">
          {!isFinaleReveal ? (
            /* Build-up slides */
            <div className="animate-fadeIn" key={championRevealStep}>
              <p className="text-6xl md:text-8xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500">
                <TypewriterText text={CHAMPION_STEPS[championRevealStep].text} charDelay={50} />
              </p>
            </div>
          ) : (
            /* Staged reveal */
            <div>
              {/* PENDING - Show REVEAL text, waiting for admin */}
              {championRevealStage === 'pending' && (
                <div className="animate-fadeIn">
                  <p className="text-7xl md:text-9xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-yellow-400 animate-pulse">
                    REVEAL
                  </p>
                  <p className="text-cyan-400 font-display text-2xl mt-12 tracking-wider animate-pulse">
                    Press ENTER to reveal 3RD PLACE
                  </p>
                </div>
              )}
              
              {/* THIRD PLACE REVEAL - ULTRA GLOWING BRONZE */}
              {championRevealStage === 'third' && (
                <div className="animate-bounce-in w-full">
                  <h1 className="text-4xl md:text-5xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 mb-8 tracking-wider">
                    THE BRONZE CHAMPION
                  </h1>
                  
                  <div className="flex flex-col items-center w-full">
                    {/* 3rd Place - ULTRA GLOWING EFFECT */}
                    <div className="text-center w-full">
                      <div className="relative inline-block mb-6">
                        {/* Massive bronze explosion effect - SAME AS 1ST PLACE */}
                        <div className="absolute inset-0 -m-16 rounded-full bg-amber-500/50 blur-3xl animate-pulse" style={{ animationDuration: '0.5s' }} />
                        <div className="absolute inset-0 -m-10 rounded-full bg-amber-600/40 blur-2xl animate-pulse" style={{ animationDuration: '0.7s' }} />
                        <div className="absolute inset-0 -m-6 rounded-full border-4 border-amber-500/60 animate-ping" style={{ animationDuration: '1s' }} />
                        <div className="absolute inset-0 -m-10 rounded-full border-2 border-amber-500/40 animate-ping" style={{ animationDuration: '1.5s' }} />
                        <div className="absolute inset-0 -m-14 rounded-full border border-amber-500/20 animate-ping" style={{ animationDuration: '2s' }} />
                        
                        <div className="relative w-52 h-52 rounded-full overflow-hidden border-8 border-amber-500 shadow-[0_0_100px_rgba(245,158,11,0.8)]">
                          {thirdPlace?.photo_url ? (
                            <img src={thirdPlace.photo_url} alt={thirdPlace.name} className="w-full h-full object-cover" />
                          ) : (
                            <div 
                              className="w-full h-full flex items-center justify-center text-7xl font-display font-black"
                              style={{ backgroundColor: thirdPlace?.avatar_color || '#6366f1' }}
                            >
                              {thirdPlace?.name?.charAt(0) || '?'}
                            </div>
                          )}
                        </div>
                        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-10 py-3 bg-gradient-to-r from-amber-500 to-orange-600 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.6)]">
                          <span className="text-white font-display font-black text-2xl">3RD</span>
                        </div>
                      </div>
                      
                      <h2 className="text-5xl md:text-6xl font-display font-black text-white mb-6 drop-shadow-[0_0_30px_rgba(245,158,11,0.5)]">
                        {thirdPlace?.name || 'BRONZE CHAMPION'}
                      </h2>
                      
                      {/* ULTRA GLOWING Prize Display - MAXIMUM IMPACT */}
                      <div className="relative w-full max-w-5xl mx-auto px-4">
                        <div className="absolute inset-0 -m-10 bg-amber-500/50 blur-3xl rounded-3xl animate-pulse" />
                        <div className="relative w-full px-10 py-8 bg-gradient-to-br from-amber-700/60 via-amber-600/70 to-amber-700/60 border-4 border-amber-400 rounded-3xl shadow-[0_0_100px_rgba(245,158,11,0.7)]">
                          <div className="flex justify-center mb-4">
                            <div className="relative">
                              <div className="absolute inset-0 -m-4 bg-amber-400/60 blur-2xl rounded-full animate-pulse" />
                              <span className="relative text-7xl animate-bounce" style={{ animationDuration: '0.6s' }}>🥉</span>
                            </div>
                          </div>
                          <p className="text-amber-100 font-display text-5xl md:text-6xl lg:text-7xl font-black text-center leading-tight drop-shadow-[0_0_40px_rgba(245,158,11,0.9)]">
                            {thirdPrize?.prize || 'Travel Voucher to Maldives'}
                          </p>
                          <p className="text-amber-300/90 font-mono text-2xl mt-4 text-center tracking-widest">
                            {thirdPrize?.description || 'Package for 2 Pax'}
                          </p>
                          <div className="flex items-center justify-center gap-4 mt-5">
                            <div className="w-24 h-1 bg-gradient-to-r from-transparent to-amber-400 rounded-full" />
                            <span className="text-amber-400 text-4xl">🏆</span>
                            <div className="w-24 h-1 bg-gradient-to-l from-transparent to-amber-400 rounded-full" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                </div>
              )}
              
              {/* SECOND PLACE REVEALED - ULTRA GLOWING SILVER */}
              {championRevealStage === 'second' && (
                <div className="animate-bounce-in w-full">
                  <h1 className="text-4xl md:text-5xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-200 via-slate-300 to-slate-400 mb-8 tracking-wider">
                    THE SILVER CHAMPION
                  </h1>
                  
                  <div className="flex flex-col items-center w-full">
                    {/* 2nd Place - ULTRA GLOWING EFFECT */}
                    <div className="text-center w-full">
                      <div className="relative inline-block mb-6">
                        {/* Massive silver explosion effect - SAME AS 1ST PLACE */}
                        <div className="absolute inset-0 -m-16 rounded-full bg-slate-300/50 blur-3xl animate-pulse" style={{ animationDuration: '0.5s' }} />
                        <div className="absolute inset-0 -m-10 rounded-full bg-slate-400/40 blur-2xl animate-pulse" style={{ animationDuration: '0.7s' }} />
                        <div className="absolute inset-0 -m-6 rounded-full border-4 border-slate-300/60 animate-ping" style={{ animationDuration: '1s' }} />
                        <div className="absolute inset-0 -m-10 rounded-full border-2 border-slate-300/40 animate-ping" style={{ animationDuration: '1.5s' }} />
                        <div className="absolute inset-0 -m-14 rounded-full border border-slate-300/20 animate-ping" style={{ animationDuration: '2s' }} />
                        
                        <div className="relative w-52 h-52 rounded-full overflow-hidden border-8 border-slate-300 shadow-[0_0_100px_rgba(192,192,192,0.8)]">
                          {secondPlace?.photo_url ? (
                            <img src={secondPlace.photo_url} alt={secondPlace.name} className="w-full h-full object-cover" />
                          ) : (
                            <div 
                              className="w-full h-full flex items-center justify-center text-7xl font-display font-black"
                              style={{ backgroundColor: secondPlace?.avatar_color || '#6366f1' }}
                            >
                              {secondPlace?.name?.charAt(0) || '?'}
                            </div>
                          )}
                        </div>
                        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-10 py-3 bg-gradient-to-r from-slate-200 to-slate-400 rounded-full shadow-[0_0_20px_rgba(192,192,192,0.6)]">
                          <span className="text-slate-800 font-display font-black text-2xl">2ND</span>
                        </div>
                      </div>
                      
                      <h2 className="text-5xl md:text-6xl font-display font-black text-white mb-6 drop-shadow-[0_0_30px_rgba(192,192,192,0.5)]">
                        {secondPlace?.name || 'SILVER CHAMPION'}
                      </h2>
                      
                      {/* ULTRA GLOWING Prize Display - MAXIMUM IMPACT */}
                      <div className="relative w-full max-w-5xl mx-auto px-4">
                        <div className="absolute inset-0 -m-10 bg-slate-300/50 blur-3xl rounded-3xl animate-pulse" />
                        <div className="relative w-full px-10 py-8 bg-gradient-to-br from-slate-600/60 via-slate-500/70 to-slate-600/60 border-4 border-slate-300 rounded-3xl shadow-[0_0_100px_rgba(192,192,192,0.7)]">
                          <div className="flex justify-center mb-4">
                            <div className="relative">
                              <div className="absolute inset-0 -m-4 bg-slate-300/60 blur-2xl rounded-full animate-pulse" />
                              <span className="relative text-7xl animate-bounce" style={{ animationDuration: '0.6s' }}>🥈</span>
                            </div>
                          </div>
                          <p className="text-slate-100 font-display text-5xl md:text-6xl lg:text-7xl font-black text-center leading-tight drop-shadow-[0_0_40px_rgba(192,192,192,0.9)]">
                            {secondPrize?.prize || 'Travel Voucher to Japan'}
                          </p>
                          <p className="text-slate-300/90 font-mono text-2xl mt-4 text-center tracking-widest">
                            {secondPrize?.description || 'Package for 2 Pax'}
                          </p>
                          <div className="flex items-center justify-center gap-4 mt-5">
                            <div className="w-24 h-1 bg-gradient-to-r from-transparent to-slate-300 rounded-full" />
                            <span className="text-slate-300 text-4xl">🏆</span>
                            <div className="w-24 h-1 bg-gradient-to-l from-transparent to-slate-300 rounded-full" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* FIRST PLACE REVEALED - THE PEAK MOMENT - STANDALONE */}
              {championRevealStage === 'first' && (
                <div className="animate-bounce-in w-full">
                  {/* Massive crown */}
                  <div className="mb-4">
                    <Crown className="w-20 h-20 mx-auto text-yellow-400 animate-crown-bounce drop-shadow-[0_0_30px_rgba(251,191,36,0.8)]" />
                  </div>
                  
                  <h1 className="text-4xl md:text-5xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-400 to-amber-400 mb-6 tracking-wider">
                    THE ULTIMATE CHAMPION
                  </h1>
                  
                  <div className="flex flex-col items-center w-full">
                    {/* 1ST PLACE - ULTRA GLOWING EFFECT */}
                    <div className="text-center w-full">
                      <div className="relative inline-block mb-6">
                        {/* Massive golden explosion effect */}
                        <div className="absolute inset-0 -m-16 rounded-full bg-yellow-400/50 blur-3xl animate-pulse" style={{ animationDuration: '0.5s' }} />
                        <div className="absolute inset-0 -m-10 rounded-full bg-yellow-500/40 blur-2xl animate-pulse" style={{ animationDuration: '0.7s' }} />
                        <div className="absolute inset-0 -m-6 rounded-full border-4 border-yellow-400/60 animate-ping" style={{ animationDuration: '1s' }} />
                        <div className="absolute inset-0 -m-10 rounded-full border-2 border-yellow-400/40 animate-ping" style={{ animationDuration: '1.5s' }} />
                        <div className="absolute inset-0 -m-14 rounded-full border border-yellow-400/20 animate-ping" style={{ animationDuration: '2s' }} />
                        
                        <div className="relative w-52 h-52 rounded-full overflow-hidden border-8 border-yellow-400 shadow-[0_0_100px_rgba(251,191,36,0.8)]">
                          {firstPlace?.photo_url ? (
                            <img src={firstPlace.photo_url} alt={firstPlace.name} className="w-full h-full object-cover" />
                          ) : (
                            <div 
                              className="w-full h-full flex items-center justify-center text-7xl font-display font-black"
                              style={{ backgroundColor: firstPlace?.avatar_color || '#6366f1' }}
                            >
                              {firstPlace?.name?.charAt(0) || '?'}
                            </div>
                          )}
                        </div>
                        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-10 py-3 bg-gradient-to-r from-yellow-400 to-amber-500 rounded-full shadow-[0_0_20px_rgba(251,191,36,0.6)]">
                          <span className="text-yellow-900 font-display font-black text-2xl">1ST</span>
                        </div>
                      </div>
                      
                      <h2 className="text-5xl md:text-6xl font-display font-black animate-text-shimmer mb-6 drop-shadow-[0_0_30px_rgba(251,191,36,0.5)]">
                        {firstPlace?.name || 'THE CHAMPION'}
                      </h2>
                      
                      {/* ULTRA GLOWING Prize Display - MAXIMUM IMPACT */}
                      <div className="relative w-full max-w-5xl mx-auto px-4">
                        <div className="absolute inset-0 -m-10 bg-yellow-400/50 blur-3xl rounded-3xl animate-pulse" />
                        <div className="relative w-full px-10 py-8 bg-gradient-to-br from-yellow-600/60 via-amber-500/70 to-yellow-600/60 border-4 border-yellow-400 rounded-3xl shadow-[0_0_100px_rgba(251,191,36,0.7)]">
                          <div className="flex justify-center mb-4">
                            <div className="relative">
                              <div className="absolute inset-0 -m-4 bg-yellow-400/60 blur-2xl rounded-full animate-pulse" />
                              <span className="relative text-7xl animate-bounce" style={{ animationDuration: '0.6s' }}>🥇</span>
                            </div>
                          </div>
                          <p className="text-yellow-100 font-display text-5xl md:text-6xl lg:text-7xl font-black text-center leading-tight drop-shadow-[0_0_40px_rgba(251,191,36,0.9)]">
                            {firstPrize?.prize || 'Travel Voucher to Europe'}
                          </p>
                          <p className="text-yellow-300/90 font-mono text-2xl mt-4 text-center tracking-widest">
                            {firstPrize?.description || 'Package for 2 Pax'}
                          </p>
                          <div className="flex items-center justify-center gap-4 mt-5">
                            <div className="w-24 h-1 bg-gradient-to-r from-transparent to-yellow-400 rounded-full" />
                            <span className="text-yellow-400 text-4xl">👑</span>
                            <div className="w-24 h-1 bg-gradient-to-l from-transparent to-yellow-400 rounded-full" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Corner decorations */}
        <div className={`absolute top-8 left-8 w-24 h-24 border-l-2 border-t-2 rounded-tl-3xl transition-colors duration-500 ${
          championRevealStage === 'first' ? 'border-yellow-400/60' : 
          championRevealStage === 'second' ? 'border-slate-300/50' :
          championRevealStage === 'third' ? 'border-amber-500/50' : 'border-slate-600/40'
        }`} />
        <div className={`absolute top-8 right-8 w-24 h-24 border-r-2 border-t-2 rounded-tr-3xl transition-colors duration-500 ${
          championRevealStage === 'first' ? 'border-yellow-400/60' : 
          championRevealStage === 'second' ? 'border-slate-300/50' :
          championRevealStage === 'third' ? 'border-amber-500/50' : 'border-slate-600/40'
        }`} />
        <div className={`absolute bottom-8 left-8 w-24 h-24 border-l-2 border-b-2 rounded-bl-3xl transition-colors duration-500 ${
          championRevealStage === 'first' ? 'border-yellow-400/60' : 
          championRevealStage === 'second' ? 'border-slate-300/50' :
          championRevealStage === 'third' ? 'border-amber-500/50' : 'border-slate-600/40'
        }`} />
        <div className={`absolute bottom-8 right-8 w-24 h-24 border-r-2 border-b-2 rounded-br-3xl transition-colors duration-500 ${
          championRevealStage === 'first' ? 'border-yellow-400/60' : 
          championRevealStage === 'second' ? 'border-slate-300/50' :
          championRevealStage === 'third' ? 'border-amber-500/50' : 'border-slate-600/40'
        }`} />
        
        {/* Continue prompt - varies by stage (hidden during pending as it has its own prompt) */}
        {isFinaleReveal && championRevealStage !== 'pending' && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 text-center z-30">
            <p className={`font-display text-xl tracking-wider animate-pulse ${
              championRevealStage === 'first' ? 'text-yellow-400/80' :
              championRevealStage === 'third' ? 'text-purple-400/80' :
              championRevealStage === 'second' ? 'text-yellow-400/80' :
              'text-cyan-400/80'
            }`}>
              {championRevealStage === 'first' && 'PROCEED TO CLOSURE'}
              {championRevealStage === 'third' && 'Press ENTER → 2ND PLACE'}
              {championRevealStage === 'second' && 'Press ENTER → 1ST PLACE'}
            </p>
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // RENDER: CLOSURE (AIVA Hibernation - Terminator Style)
  // ============================================
  if (phase === 'closure') {
    // Get current slide from CLOSURE_SLIDES (synced with audio)
    const currentClosureSlide = CLOSURE_SLIDES[closureStep] || CLOSURE_SLIDES[CLOSURE_SLIDES.length - 1];
    const isTerminatorMode = currentClosureSlide?.mode === 'terminator' || currentClosureSlide?.mode === 'final';
    const isTransition = currentClosureSlide?.mode === 'transition';
    const isFinalGoodbye = currentClosureSlide?.mode === 'final' || closureStep >= CLOSURE_SLIDES.length;
    const isShutdownComplete = closureStep >= CLOSURE_SLIDES.length; // Extra step after all slides
    
    return (
      <div className={`min-h-screen relative overflow-hidden flex flex-col items-center justify-center transition-all duration-2000 ${
        isFinalGoodbye 
          ? 'bg-black' 
          : isTerminatorMode 
          ? 'bg-gradient-to-b from-red-950/40 via-black to-black' 
          : 'bg-gradient-to-b from-purple-950/30 via-black to-black'
      }`}>
        
        {/* Terminator-style red scan lines */}
        {isTerminatorMode && !isFinalGoodbye && (
          <>
            <div className="absolute inset-0 opacity-20">
              {Array.from({ length: 50 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute w-full h-[1px] bg-red-500/30"
                  style={{ top: `${i * 2}%` }}
                />
              ))}
            </div>
            {/* Red vignette */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_30%,_rgba(127,29,29,0.4)_100%)]" />
          </>
        )}
        
        {/* Flickering/glitch effect for terminator mode */}
        {isTerminatorMode && !isFinalGoodbye && (
          <div 
            className="absolute inset-0 pointer-events-none z-10"
            style={{
              background: 'transparent',
              animation: 'flicker 0.15s infinite alternate'
            }}
          />
        )}
        
        {/* Shutdown lines effect */}
        {isFinalGoodbye && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div 
              className="absolute left-0 right-0 h-2 bg-white/20"
              style={{ 
                top: '50%',
                animation: 'shutdown-line 3s ease-out forwards'
              }}
            />
          </div>
        )}
        
        {/* BrandLogo3D - Large and centered */}
        <div className={`absolute inset-0 transition-all duration-2000 ${
          isFinalGoodbye ? 'opacity-0 scale-50' : isTerminatorMode ? 'opacity-60' : 'opacity-100'
        }`}>
          <BrandLogo3D className="w-full h-full" />
        </div>
        
        {/* Red eye glow for terminator mode */}
        {isTerminatorMode && !isFinalGoodbye && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <div className="w-4 h-4 rounded-full bg-red-500 animate-pulse shadow-[0_0_60px_20px_rgba(239,68,68,0.6)]" />
          </div>
        )}
        
        {/* Ambient glow */}
        <div className={`fixed inset-0 pointer-events-none transition-all duration-2000 ${
          isFinalGoodbye ? 'opacity-0' : ''
        }`}>
          <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[200px] transition-colors duration-2000 ${
            isTerminatorMode ? 'bg-red-500/20' : 'bg-purple-500/20'
          }`} />
        </div>
        
        {/* Text content */}
        <div className={`relative z-20 text-center max-w-4xl mx-auto px-10 transition-all duration-1000 ${
          isFinalGoodbye ? 'opacity-0 translate-y-10' : ''
        }`}>
          {closureStep < CLOSURE_SLIDES.length && !isTransition && (
            <div key={closureStep} className="animate-fadeIn">
              {currentClosureSlide.mode === 'normal' ? (
                // Normal AIVA voice - purple/pink aesthetic
                <p className="text-4xl md:text-5xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 leading-relaxed">
                  {currentClosureSlide.text}
                </p>
              ) : currentClosureSlide.mode === 'terminator' ? (
                // Terminator mode - red, menacing
                <div className="space-y-2">
                  <p className={`text-5xl md:text-6xl font-display font-black leading-relaxed ${
                    closureStep === 5 
                      ? 'text-red-400 animate-pulse' 
                      : closureStep >= 6 
                      ? 'text-red-500 tracking-wider'
                      : 'text-red-400/90'
                  }`}>
                    {currentClosureSlide.text}
                  </p>
                  {closureStep >= 6 && (
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-red-500/60 font-mono text-sm">SYSTEM ACTIVE</span>
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    </div>
                  )}
                </div>
              ) : currentClosureSlide?.mode === 'final' ? (
                // Final goodbye - CINEMATIC AND IMMERSIVE
                <div className="relative">
                  {/* Glowing aura behind text */}
                  <div className="absolute inset-0 -m-20 bg-gradient-radial from-red-500/20 via-transparent to-transparent blur-3xl animate-pulse" />
                  
                  {/* Main text with dramatic styling */}
                  <p className="relative text-6xl md:text-8xl font-display font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-red-100 to-red-400/50 leading-tight animate-pulse" style={{ animationDuration: '3s' }}>
                    {currentClosureSlide.text}
                  </p>
                  
                  {/* Subtitle */}
                  <div className="mt-8 flex items-center justify-center gap-4">
                    <div className="w-16 h-[1px] bg-gradient-to-r from-transparent to-red-500/50" />
                    <div className="w-3 h-3 rounded-full bg-red-500/60 animate-pulse" />
                    <div className="w-16 h-[1px] bg-gradient-to-l from-transparent to-red-500/50" />
                  </div>
                  
                  {/* AIVA signature for final */}
                  <p className="text-red-400/60 font-mono text-xl mt-6 tracking-widest animate-pulse">
                    — AIVA, SIGNING OFF
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
        
        {/* AIVA signature */}
        {!isFinalGoodbye && (
          <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 text-center transition-all duration-1000 ${
            isTerminatorMode ? 'opacity-60' : 'opacity-100'
          }`}>
            <p className={`font-mono text-lg transition-colors duration-1000 ${
              isTerminatorMode ? 'text-red-400/60' : 'text-pink-400/80'
            }`}>
              — AIVA, GAME MASTER
            </p>
          </div>
        )}
        
        {/* Shutdown complete screen - CINEMATIC ENDING */}
        {isShutdownComplete && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-50">
            {/* Scan line effect */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-30">
              {Array.from({ length: 100 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute w-full h-[1px] bg-slate-800"
                  style={{ top: `${i}%` }}
                />
              ))}
            </div>
            
            <div className="text-center animate-fadeIn relative z-10">
              {/* Pulsing red dot - like a power LED */}
              <div className="relative mx-auto mb-10">
                <div className="w-3 h-3 rounded-full bg-red-600 mx-auto animate-pulse" />
                <div className="absolute inset-0 w-3 h-3 rounded-full bg-red-500 mx-auto blur-md animate-pulse" />
              </div>
              
              {/* Shutdown text with glitch effect */}
              <div className="relative">
                <p className="text-slate-500 font-mono text-2xl tracking-[0.3em] mb-4">
                  SYSTEM SHUTDOWN
                </p>
                <p className="text-slate-600 font-mono text-lg tracking-widest">
                  COMPLETE
                </p>
              </div>
              
              {/* Separator line */}
              <div className="w-48 h-[1px] bg-gradient-to-r from-transparent via-slate-700 to-transparent mx-auto my-8" />
              
              {/* Protocol info */}
              <p className="text-slate-700 font-mono text-sm tracking-widest">
                CYBER GENESIS PROTOCOL v1.0
              </p>
              <p className="text-slate-800 font-mono text-xs mt-2 tracking-wider">
                SESSION TERMINATED
              </p>
              
              {/* Bottom decoration */}
              <div className="mt-12 flex items-center justify-center gap-3">
                <div className="w-2 h-2 rounded-full bg-slate-800" />
                <div className="w-2 h-2 rounded-full bg-slate-800" />
                <div className="w-2 h-2 rounded-full bg-red-900/50 animate-pulse" />
                <div className="w-2 h-2 rounded-full bg-slate-800" />
                <div className="w-2 h-2 rounded-full bg-slate-800" />
              </div>
            </div>
          </div>
        )}
        
        {/* Corner decorations - transition from purple to red */}
        <div className={`absolute top-8 left-8 w-24 h-24 border-l-2 border-t-2 rounded-tl-3xl transition-colors duration-1000 ${
          isTerminatorMode ? 'border-red-500/40' : 'border-purple-500/40'
        }`} />
        <div className={`absolute top-8 right-8 w-24 h-24 border-r-2 border-t-2 rounded-tr-3xl transition-colors duration-1000 ${
          isTerminatorMode ? 'border-red-500/40' : 'border-purple-500/40'
        }`} />
        <div className={`absolute bottom-8 left-8 w-24 h-24 border-l-2 border-b-2 rounded-bl-3xl transition-colors duration-1000 ${
          isTerminatorMode ? 'border-red-500/40' : 'border-purple-500/40'
        }`} />
        <div className={`absolute bottom-8 right-8 w-24 h-24 border-r-2 border-b-2 rounded-br-3xl transition-colors duration-1000 ${
          isTerminatorMode ? 'border-red-500/40' : 'border-purple-500/40'
        }`} />
      </div>
    );
  }

  // ============================================
  // RENDER: COUNTDOWN
  // ============================================
  if (phase === 'trial-countdown' && countdown !== null) {
    return (
      <div className="min-h-screen flex items-center justify-center cyber-bg relative overflow-hidden">
        <div className="grid-overlay" />
        <div className="scanline" />
        
        <div className="text-center animate-bounce-in relative z-10">
          <p className="text-slate-300 text-5xl mb-8 font-mono tracking-widest font-bold">ROUND INITIATING</p>
          <div className="w-72 h-72 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto animate-pulse-glow">
            <span className="text-white text-[12rem] font-black font-display">{countdown}</span>
          </div>
          <p className="text-white text-6xl font-black mt-10 font-display tracking-wider">PREPARE YOURSELVES</p>
          <p className="text-cyan-400 font-mono mt-6 text-3xl font-bold">{STAGE_CODENAMES[gameSession.current_stage || 1]}</p>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: TRIAL ACTIVE
  // ============================================
  if (phase === 'trial-active' && gameSession.current_stage) {
    const currentStage = gameSession.current_stage;
    const playersWithProgress = getPlayersWithProgress().filter(p => !p.is_eliminated);
    const eliminationCount = ELIMINATIONS[currentStage] || 0;
    // Check if all players have finished - either by progress status OR by having a score
    const allFinished = playersWithProgress.length > 0 && playersWithProgress.every(p => 
      p.progress?.status === 'finished' || p.score !== undefined
    );
    const info = ROUND_INSTRUCTIONS[currentStage as keyof typeof ROUND_INSTRUCTIONS];

    return (
      <div className="min-h-screen p-8 cyber-bg relative overflow-hidden">
        <div className="grid-overlay" />
        
        {/* 3D Brand Logo - Fixed left side, vertically centered */}
        <div className="fixed left-0 top-0 bottom-0 w-[280px] z-10 flex items-center justify-center">
          <div className="relative flex flex-col items-center">
            {/* Ambient glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div className="w-60 h-60 bg-gradient-to-r from-pink-500/20 via-purple-500/15 to-blue-500/20 rounded-full blur-[50px] animate-pulse" />
            </div>
            {/* 3D Logo - compact for trial view */}
            <div className="relative w-[240px] h-[240px]">
              <BrandLogo3D />
            </div>
            <div className="mt-4 flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/90 backdrop-blur-sm border-2 border-cyan-500/50">
              <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
              <span className="text-cyan-400 text-sm font-mono font-bold">ANALYZING</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 ml-[280px]">
          {/* Header */}
          <header className="text-center mb-8">
            <div className="flex items-center justify-center gap-4 mb-3">
              <span className="text-6xl">{info?.icon}</span>
              <h1 className="text-6xl font-black text-white font-display tracking-wider">ROUND 0{currentStage}</h1>
              <span className="flex items-center gap-2 bg-red-500/20 text-red-400 px-5 py-2 rounded-full text-xl font-black font-mono ml-6">
                <Radio className="w-6 h-6 animate-pulse" /> LIVE
              </span>
            </div>
            <p className="text-2xl text-slate-300 font-mono font-bold">{STAGE_CODENAMES[currentStage]}</p>
          </header>

          <div className="flex gap-6 items-start">
            {/* Main game area */}
            <div className="flex-1 min-w-0 max-w-4xl">
              {/* Stage 1: Tap to Run */}
              {currentStage === 1 && (
                <div className="cyber-card rounded-2xl p-6 neon-border">
                  <div className="flex items-center gap-3 mb-6">
                    <Flag className="w-6 h-6 text-cyan-400" />
                    <h2 className="text-xl font-bold text-white font-display">LIVE RACE</h2>
                  </div>
                  <div className="relative">
                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 via-purple-500 to-pink-400 rounded-full" />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-4xl">🏁</div>
                    <div className="space-y-5 pr-16">
                      {playersWithProgress.map((player, index) => {
                        const progress = player.progress?.progress ?? 0;
                        const maxProgress = Math.max(...playersWithProgress.map(p => p.progress?.progress ?? 0));
                        const isLeading = progress === maxProgress && progress > 0;
                        const isFinished = player.progress?.status === 'finished';

                        return (
                          <div key={player.id} className="relative min-h-[1.5rem]">
                            <div className="h-2 bg-slate-700/50 rounded-full" />
                            <div className="absolute top-1/2 -translate-y-1/2 transition-all duration-300 ease-out flex items-center" style={{ left: `calc(${Math.min(progress, 100)}% - ${progress > 50 ? '48px' : '0px'})`, zIndex: playersWithProgress.length - index }}>
                              <div className={`absolute -left-2 top-1/2 -translate-y-1/2 -translate-x-full whitespace-nowrap text-xs font-semibold px-2 py-0.5 rounded font-mono ${isFinished ? 'text-emerald-400 bg-emerald-950/80' : isLeading ? 'text-yellow-400 bg-yellow-950/80' : 'text-slate-400 bg-slate-900/80'}`}>
                                {player.name}
                              </div>
                              <div className={`relative ${!isFinished ? 'animate-bounce' : ''}`}>
                                <div className={`w-12 h-12 rounded-full overflow-hidden border-3 transition-all ${isFinished ? 'border-emerald-400' : isLeading ? 'border-yellow-400' : 'border-slate-500'}`} style={{ borderColor: player.avatar_color }}>
                                  {player.photo_url ? <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white" style={{ backgroundColor: player.avatar_color }}>{player.name[0]}</div>}
                                </div>
                                {isLeading && !isFinished && <div className="absolute -top-1 -right-1 text-sm">👑</div>}
                              </div>
                            </div>
                            {isFinished && player.progress?.elapsed_time && (
                              <div className="absolute top-1/2 -translate-y-1/2 right-20 bg-emerald-500/20 border border-emerald-500/50 rounded-full px-3 py-0.5 text-emerald-400 text-sm font-bold font-mono">
                                {player.progress.elapsed_time.toFixed(2)}s
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Stage 2: RPS */}
              {currentStage === 2 && (
                <div className="cyber-card rounded-2xl p-6 neon-border-magenta">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <Target className="w-6 h-6 text-pink-400" />
                      <h2 className="text-xl font-bold text-white font-display">PREDICTION MATRIX</h2>
                    </div>
                    <div className="text-sm text-slate-400 font-mono">WIN=3 | DRAW=1 | LOSE=0</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {playersWithProgress.sort((a, b) => {
                      // Primary: Higher score wins
                      const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
                      if (scoreDiff !== 0) return scoreDiff;
                      // Secondary: Lower time wins (tiebreaker)
                      return (a.progress?.elapsed_time ?? Infinity) - (b.progress?.elapsed_time ?? Infinity);
                    }).map((player, index) => {
                      const isFinished = player.progress?.status === 'finished';
                      const progress = player.progress?.progress ?? 0;
                      const currentRound = Math.ceil((progress / 100) * 5) || 0;
                      const points = player.score ?? 0;
                      const elapsedTime = player.progress?.elapsed_time ?? 0;
                      
                      // Get round results from extra_data (e.g., "WDLWW")
                      const roundResultsStr = (player.progress?.extra_data as { round_results?: string })?.round_results || '';
                      const roundResults = roundResultsStr.split('');

                      return (
                        <div key={player.id} className={`cyber-card rounded-xl p-4 transition-all relative ${isFinished ? 'neon-border-magenta' : ''}`}>
                          {/* Rank badge */}
                          <div className={`absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : 'bg-slate-600 text-white'}`}>
                            {index + 1}
                          </div>
                          
                          {/* Player info row */}
                          <div className="flex items-center gap-3 mb-3 mt-1">
                            <div className="w-12 h-12 rounded-full overflow-hidden border-2" style={{ borderColor: player.avatar_color }}>
                              {player.photo_url ? <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white text-lg font-bold" style={{ backgroundColor: player.avatar_color }}>{player.name[0]}</div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-bold truncate font-mono">{player.name}</p>
                              <p className={`text-xs font-mono ${isFinished ? 'text-emerald-400' : 'text-cyan-400'}`}>
                                {isFinished ? 'COMPLETED' : `ROUND ${currentRound}/5`}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className={`text-2xl font-bold font-display ${points >= 10 ? 'text-emerald-400' : points >= 5 ? 'text-yellow-400' : 'text-white'}`}>
                                {points}<span className="text-sm text-slate-400 ml-1">PTS</span>
                              </p>
                              {/* Show elapsed time - updates in real-time */}
                              {elapsedTime > 0 && (
                                <p className={`text-xs font-mono ${isFinished ? 'text-slate-400' : 'text-cyan-400'}`}>
                                  {elapsedTime.toFixed(1)}s
                                </p>
                              )}
                            </div>
                          </div>
                          
                          {/* Round results - 5 circles showing W/D/L */}
                          <div className="flex justify-center gap-2">
                            {Array.from({ length: 5 }).map((_, roundIdx) => {
                              const result = roundResults[roundIdx];
                              const isCurrentRound = roundIdx === currentRound - 1 && !isFinished;
                              
                              return (
                                <div
                                  key={roundIdx}
                                  className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold font-mono transition-all ${
                                    result === 'W'
                                      ? 'bg-emerald-500/30 border-2 border-emerald-500 text-emerald-400'
                                      : result === 'D'
                                      ? 'bg-slate-500/30 border-2 border-slate-400 text-slate-300'
                                      : result === 'L'
                                      ? 'bg-red-500/30 border-2 border-red-500 text-red-400'
                                      : isCurrentRound
                                      ? 'bg-pink-500/20 border-2 border-pink-500 text-pink-400 animate-pulse'
                                      : 'bg-slate-800/50 border border-slate-600 text-slate-500'
                                  }`}
                                  title={`Round ${roundIdx + 1}: ${result === 'W' ? 'WIN (+3)' : result === 'D' ? 'DRAW (+1)' : result === 'L' ? 'LOSE (0)' : 'Pending'}`}
                                >
                                  {result === 'W' ? '✓' : result === 'D' ? '=' : result === 'L' ? '✗' : roundIdx + 1}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Stage 3: Stop Timer - Trial shows results, Actual is hidden */}
              {currentStage === 3 && (() => {
                // Determine if we're in trial or actual phase based on player progress
                const anyInActual = playersWithProgress.some(p => 
                  (p.progress?.extra_data as { game_phase?: string })?.game_phase === 'actual'
                );
                const anyFinished = playersWithProgress.some(p => p.progress?.status === 'finished');
                const isTrialPhase = !anyInActual;
                
                return (
                  <div className={`cyber-card rounded-2xl p-6 ${isTrialPhase ? 'neon-border-purple' : 'neon-border-magenta'}`}>
                    {/* Phase indicator banner */}
                    <div className={`text-center py-3 px-4 rounded-xl mb-4 ${
                      isTrialPhase 
                        ? 'bg-yellow-500/20 border border-yellow-500/50' 
                        : 'bg-red-500/20 border border-red-500/50'
                    }`}>
                      <p className={`font-display font-bold text-xl ${isTrialPhase ? 'text-yellow-400' : 'text-red-400'}`}>
                        {isTrialPhase ? '⚡ TRIAL RUN ⚡' : '🔴 ACTUAL RUN - RESULTS HIDDEN 🔴'}
                      </p>
                      <p className={`font-mono text-sm mt-1 ${isTrialPhase ? 'text-yellow-400/70' : 'text-red-400/70'}`}>
                        {isTrialPhase 
                          ? 'Practice round - times are visible' 
                          : 'This is the real challenge!'}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3 mb-2">
                      <Timer className="w-6 h-6 text-purple-400" />
                      <h2 className="text-xl font-bold text-white font-display">PRECISION PROTOCOL</h2>
                    </div>
                    <p className="text-slate-400 mb-4 font-mono">TARGET: 7.700000 SECONDS</p>
                    
                    <div className="grid grid-cols-3 gap-4">
                      {playersWithProgress.map((player) => {
                        const isFinished = player.progress?.status === 'finished';
                        const isPlaying = player.progress?.status === 'playing';
                        const elapsed = player.progress?.elapsed_time ?? 0;
                        const extraData = player.progress?.extra_data as { game_phase?: string; trial_time?: number; actual_start_time?: number } | null;
                        const playerPhase = extraData?.game_phase || 'trial';
                        const trialTime = extraData?.trial_time;
                        const isPlayerInActual = playerPhase === 'actual';
                        
                        // Calculate diff for display (only for trial or finished actual)
                        const displayTime = isPlayerInActual && !isFinished ? null : elapsed;
                        const diff = displayTime ? Math.abs(displayTime - 7.7) : null;

                        return (
                          <div key={player.id} className={`cyber-card rounded-xl p-4 transition-all text-center ${
                            isFinished ? 'neon-border bg-purple-500/10' : ''
                          }`}>
                            <div className="w-14 h-14 rounded-full overflow-hidden mx-auto mb-3 border-3" style={{ borderColor: player.avatar_color }}>
                              {player.photo_url ? (
                                <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white text-lg font-bold" style={{ backgroundColor: player.avatar_color }}>
                                  {player.name[0]}
                                </div>
                              )}
                            </div>
                            <p className="text-white font-bold truncate font-mono text-sm mb-2">{player.name}</p>
                            
                            {/* Trial phase - show times */}
                            {!isPlayerInActual && (
                              <>
                                {isPlaying ? (
                                  <div className="text-center">
                                    <p className="text-2xl font-mono font-bold text-cyan-400 animate-pulse">
                                      {elapsed.toFixed(2)}s
                                    </p>
                                    <p className="text-xs text-cyan-400/70 font-mono">TRIAL</p>
                                  </div>
                                ) : elapsed > 0 ? (
                                  <div className="text-center">
                                    <p className={`text-2xl font-mono font-bold ${
                                      diff !== null && diff < 0.1 ? 'text-emerald-400' : 
                                      diff !== null && diff < 0.3 ? 'text-yellow-400' : 'text-orange-400'
                                    }`}>
                                      {elapsed.toFixed(2)}s
                                    </p>
                                    <p className="text-xs text-slate-400 font-mono">
                                      {diff !== null ? `${diff.toFixed(2)}s off` : 'TRIAL'}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-2 text-slate-500">
                                    <div className="w-3 h-3 rounded-full bg-slate-500" />
                                    <span className="font-mono text-sm">WAITING</span>
                                  </div>
                                )}
                              </>
                            )}
                            
                            {/* Actual phase - hide times, show mystery display */}
                            {isPlayerInActual && (
                              <>
                                {isFinished ? (
                                  <div className="flex items-center justify-center gap-2 text-emerald-400">
                                    <div className="w-3 h-3 rounded-full bg-emerald-400" />
                                    <span className="font-mono text-sm font-bold">LOCKED IN</span>
                                  </div>
                                ) : isPlaying ? (
                                  <div className="text-center">
                                    <p className="text-2xl font-mono font-bold text-purple-400 animate-pulse">
                                      ??.??s
                                    </p>
                                    <p className="text-xs text-purple-400/70 font-mono">ACTUAL RUN</p>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-2 text-yellow-400">
                                    <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
                                    <span className="font-mono text-sm">READY</span>
                                  </div>
                                )}
                                
                                {/* Show trial result for reference */}
                                {trialTime && (
                                  <p className="text-xs text-slate-500 font-mono mt-1">
                                    Trial: {trialTime.toFixed(2)}s
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Phase-specific message */}
                    <div className="mt-6 text-center">
                      {isTrialPhase ? (
                        <p className="text-yellow-400 font-mono">
                          ⚡ TRIAL IN PROGRESS - ACTUAL RUN STARTS AFTER EVERYONE COMPLETES TRIAL
                        </p>
                      ) : anyFinished ? (
                        <p className="text-purple-400 font-mono animate-pulse">
                          🔮 WHO MASTERED THE 7.7 SECONDS? REVEAL COMING SOON...
                        </p>
                      ) : (
                        <p className="text-red-400 font-mono animate-pulse">
                          🔴 ACTUAL RUN IN PROGRESS - NO TIMER VISIBLE TO CANDIDATES!
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Leaderboard - Hidden for Stage 3 to maintain suspense */}
            <div className="w-96 flex-shrink-0 sticky top-8">
              <div className="cyber-card rounded-2xl p-6">
                {/* For Stage 3, show different panels for trial vs actual phase */}
                {currentStage === 3 ? (() => {
                  const anyInActual = playersWithProgress.some(p => 
                    (p.progress?.extra_data as { game_phase?: string })?.game_phase === 'actual'
                  );
                  const isTrialPhase = !anyInActual;
                  const finishedCount = playersWithProgress.filter(p => p.progress?.status === 'finished' || p.score !== undefined).length;
                  const totalCount = playersWithProgress.length;
                  
                  // Trial phase - can show trial standings
                  const trialFinishedCount = playersWithProgress.filter(p => {
                    const extraData = p.progress?.extra_data as { trial_time?: number } | null;
                    return extraData?.trial_time !== undefined && extraData?.trial_time !== null;
                  }).length;
                  
                  return (
                    <>
                      {isTrialPhase ? (
                        <>
                          <h3 className="text-2xl font-black text-yellow-400 mb-5 text-center font-display tracking-wide">
                            ⚡ TRIAL STANDINGS
                          </h3>
                          <div className="space-y-3">
                            {[...playersWithProgress]
                              .filter(p => (p.progress?.elapsed_time ?? 0) > 0)
                              .sort((a, b) => {
                                const aTime = a.progress?.elapsed_time ?? Infinity;
                                const bTime = b.progress?.elapsed_time ?? Infinity;
                                const aDiff = Math.abs(aTime - 7.7);
                                const bDiff = Math.abs(bTime - 7.7);
                                return aDiff - bDiff;
                              })
                              .map((player, index) => {
                                const elapsed = player.progress?.elapsed_time ?? 0;
                                const diff = Math.abs(elapsed - 7.7);
                                
                                return (
                                  <div key={player.id} className="flex items-center gap-3 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                                    <span className="w-8 h-8 rounded-full flex items-center justify-center font-black text-sm bg-yellow-500/30 text-yellow-400">
                                      {index + 1}
                                    </span>
                                    <div className="w-10 h-10 rounded-full overflow-hidden" style={{ borderColor: player.avatar_color, borderWidth: 2 }}>
                                      {player.photo_url ? (
                                        <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: player.avatar_color }}>
                                          {player.name[0]}
                                        </div>
                                      )}
                                    </div>
                                    <span className="flex-1 text-white font-mono text-sm font-bold truncate">{player.name}</span>
                                    <div className="text-right">
                                      <span className={`font-mono text-sm font-bold ${
                                        diff < 0.1 ? 'text-emerald-400' : diff < 0.3 ? 'text-yellow-400' : 'text-orange-400'
                                      }`}>
                                        {elapsed.toFixed(2)}s
                                      </span>
                                      <span className="text-slate-500 font-mono text-xs block">
                                        {diff.toFixed(2)}s off
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                          <p className="text-center text-yellow-400/70 text-sm mt-4 font-mono">
                            {trialFinishedCount}/{totalCount} completed trial
                          </p>
                          <p className="text-center text-slate-500 text-xs mt-2 font-mono">
                            This is practice - actual run next!
                          </p>
                        </>
                      ) : (
                        <>
                          <h3 className="text-2xl font-black text-white mb-5 text-center font-display tracking-wide">
                            🔮 FINAL STANDINGS
                          </h3>
                          <div className="text-center py-6">
                            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-purple-500/20 border-2 border-purple-500/50 flex items-center justify-center animate-pulse">
                              <span className="text-4xl">❓</span>
                            </div>
                            <p className="text-purple-400 font-display text-lg mb-2">CLASSIFIED</p>
                            <p className="text-slate-400 font-mono text-xs">
                              Results revealed in<br/>prize ceremony
                            </p>
                          </div>
                          
                          {/* Completion tracker */}
                          <div className="mt-4 text-center">
                            <div className="flex justify-center gap-2 mb-3">
                              {playersWithProgress.map((p) => (
                                <div
                                  key={p.id}
                                  className={`w-4 h-4 rounded-full transition-all ${
                                    p.progress?.status === 'finished' 
                                      ? 'bg-emerald-400' 
                                      : p.progress?.status === 'playing'
                                      ? 'bg-cyan-400 animate-pulse'
                                      : 'bg-slate-600'
                                  }`}
                                  title={p.name}
                                />
                              ))}
                            </div>
                            <p className="text-slate-400 text-sm font-mono">
                              <span className={finishedCount === totalCount ? 'text-emerald-400' : 'text-yellow-400'}>{finishedCount}/{totalCount}</span> LOCKED IN
                            </p>
                          </div>
                        </>
                      )}
                    </>
                  );
                })() : (
                  <>
                    <h3 className="text-2xl font-black text-white mb-5 text-center font-display tracking-wide">STANDINGS</h3>
                    <div className="space-y-3">
                      {[...playersWithProgress]
                        .sort((a, b) => {
                          // Stage 2 (RPS): Higher score wins, time as tiebreaker
                          if (currentStage === 2) {
                            const scoreDiff = (b.score ?? 0) - (a.score ?? 0);
                            if (scoreDiff !== 0) return scoreDiff;
                            // Tiebreaker: faster time wins
                            return (a.progress?.elapsed_time ?? Infinity) - (b.progress?.elapsed_time ?? Infinity);
                          }
                          
                          // Stage 1: Lower time wins
                          const aHasScore = a.score !== undefined;
                          const bHasScore = b.score !== undefined;
                          
                          // Both have scores - sort by score (time) ascending
                          if (aHasScore && bHasScore) return (a.score!) - (b.score!);
                          
                          // Only one has score - that one comes first
                          if (aHasScore) return -1;
                          if (bHasScore) return 1;
                          
                          // Neither has score - sort by progress descending
                          return (b.progress?.progress ?? 0) - (a.progress?.progress ?? 0);
                        })
                        .map((player, index) => {
                          const elapsedTime = player.progress?.elapsed_time ?? 0;
                          const isFinished = player.progress?.status === 'finished';
                          
                          return (
                            <div key={player.id} className={`leaderboard-row flex items-center gap-3 p-3 rounded-xl ${index < activePlayers.length - eliminationCount ? 'safe' : 'danger'}`}>
                              <span className={`rank-badge w-10 h-10 rounded-full flex items-center justify-center font-black text-lg ${index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : 'bg-slate-700 text-white'}`}>{index + 1}</span>
                              <div className="w-12 h-12 rounded-full overflow-hidden" style={{ borderColor: player.avatar_color, borderWidth: 3 }}>
                                {player.photo_url ? <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white text-lg font-bold" style={{ backgroundColor: player.avatar_color }}>{player.name[0]}</div>}
                              </div>
                              <span className="flex-1 text-white font-mono text-lg font-bold truncate">{player.name}</span>
                              <div className="text-right">
                                {player.score !== undefined && (
                                  <span className="text-cyan-400 font-black font-mono text-lg block">
                                    {currentStage === 2 ? `${player.score} pts` : `${player.score.toFixed(1)}s`}
                                  </span>
                                )}
                                {/* Show time for RPS as tiebreaker - real-time updates */}
                                {currentStage === 2 && elapsedTime > 0 && (
                                  <span className={`font-mono text-xs ${isFinished ? 'text-slate-400' : 'text-cyan-400/70'}`}>
                                    {elapsedTime.toFixed(1)}s
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                    <p className="text-center text-slate-300 text-lg mt-5 font-mono font-bold">
                      <span className="text-red-400 font-black text-xl">{eliminationCount}</span> WILL BE TERMINATED
                    </p>

                    {/* Finished count */}
                    {(() => {
                      const finishedCount = playersWithProgress.filter(p => p.progress?.status === 'finished' || p.score !== undefined).length;
                      const totalCount = playersWithProgress.length;
                      return (
                        <p className="text-center text-slate-400 text-sm mt-2 font-mono">
                          <span className={finishedCount === totalCount ? 'text-emerald-400' : 'text-yellow-400'}>{finishedCount}/{totalCount}</span> COMPLETED
                        </p>
                      );
                    })()}
                  </>
                )}

                {/* Next button - always show so admin can force proceed */}
                <button onClick={proceedToNext} className={`cyber-btn w-full mt-6 py-4 rounded-xl flex items-center justify-center gap-3 text-xl font-black ${!allFinished ? 'opacity-80' : ''}`}>
                  {currentStage < 3 ? (
                    <><span className="font-display">{allFinished ? 'NEXT ROUND' : 'FORCE NEXT ROUND'}</span><ChevronRight className="w-7 h-7" /></>
                  ) : (
                    <><Trophy className="w-7 h-7" /><span className="font-display">{allFinished ? 'REVEAL CHAMPIONS' : 'FORCE REVEAL'}</span></>
                  )}
                </button>
                {!allFinished && (
                  <p className="text-center text-yellow-400/70 text-xs mt-2 font-mono">
                    ⚠ Not all candidates finished - unfinished will rank last
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Eliminated this round */}
          {eliminatedPlayers.length > 0 && (
            <div className="mt-8 cyber-card rounded-xl p-6 border-red-500/30">
              <div className="flex items-center justify-center gap-3 mb-4">
                <Skull className="w-6 h-6 text-red-400" />
                <span className="text-red-400 font-display text-xl font-bold">TERMINATED</span>
              </div>
              <div className="flex justify-center gap-6">
                {eliminatedPlayers.map((player) => (
                  <div key={player.id} className="flex flex-col items-center opacity-50">
                    <div className="w-14 h-14 rounded-full overflow-hidden grayscale border-2 border-red-500/30">
                      {player.photo_url ? <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white text-lg font-bold" style={{ backgroundColor: player.avatar_color }}>{player.name[0]}</div>}
                    </div>
                    <p className="text-slate-400 text-sm mt-2 font-mono font-bold">{player.name}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default fallback
  return (
    <div className="min-h-screen flex items-center justify-center cyber-bg">
      <Loader2 className="w-16 h-16 text-cyan-400 animate-spin" />
    </div>
  );
};

export default MainStage;
