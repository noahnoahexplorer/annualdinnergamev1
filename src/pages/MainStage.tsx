import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, Loader2, Trophy, XCircle, Crown, Timer, Target, Flag, Radio, Play, UserX, Skull, ChevronRight, SkipForward, Copy, Check, Home } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, TABLES, type Player, type GameSession, type StageScore, type PlayerProgress, type GameEvent } from '../lib/supabase';
import { STAGE_CODENAMES, ELIMINATIONS, GenesisState } from '../lib/constants';
import { generateSpeech } from '../lib/textToSpeech';
import { BrandLogo3D } from '../components/BrandLogo3D';

// Polling removed - real-time subscriptions handle all updates
const COUNTDOWN_SECONDS = 5;

// Intro audio URL - Using local file to avoid Supabase Storage egress costs
// Download the MP3 and place it in /public/Introduction.mp3
const INTRO_AUDIO_URL = '/Introduction.mp3';

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
  { id: 9, text: 'ONLY THE STRONGEST WILL SECURE THEIR PLACE', state: 'scanning', startTime: 20.0, showAvatar: true },
  { id: 10, text: 'YOUR PERFORMANCE WILL DETERMINE YOUR RANK', state: 'speaking', startTime: 24.0, showAvatar: true },
  { id: 11, text: 'YOUR SPEED. YOUR PRECISION. AND YOUR DECISIONS', state: 'speaking', startTime: 27.5, showAvatar: true },
  { id: 12, text: 'WILL SHAPE YOUR FATE', state: 'speaking', startTime: 31.5, showAvatar: true },
  { id: 13, text: 'THERE ARE NO SECOND CHANCES', state: 'scanning', startTime: 34.0, showAvatar: true },
  { id: 14, text: 'PREPARE YOURSELVES', state: 'speaking', startTime: 37.0, showAvatar: true },
  { id: 15, text: 'THE CYBER GENESIS TRIALS', state: 'celebrating', startTime: 39.5, showAvatar: true, highlight: true },
  { id: 16, text: 'BEGINS NOW!', state: 'celebrating', startTime: 42.5, showAvatar: true, highlight: true },
];

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
      'Play Rock Paper Scissors against AVA',
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
      'Timer starts automatically',
      'Trust your internal clock',
      'Every millisecond matters',
    ],
    elimination: 'THE CLOSEST TO PERFECTION WINS',
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
  | 'elimination'     // Dramatic elimination
  | 'session-end'     // Session complete - shows event ID
  | 'champion';       // Final champion reveal

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
  const [eventIdCopied, setEventIdCopied] = useState(false);
  
  // Elimination state
  const [eliminationRankings, setEliminationRankings] = useState<PlayerWithProgress[]>([]);
  const [revealedRank, setRevealedRank] = useState(0);
  const [champion, setChampion] = useState<Player | null>(null);
  const [championRevealStep, setChampionRevealStep] = useState(0);
  
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
      
      // Subtitle anticipation: show text slightly BEFORE AVA speaks it (in seconds)
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
    setShowTrialIntro(true);
    // Play narration for the trial
    const trialInfo = ROUND_INSTRUCTIONS[stage as keyof typeof ROUND_INSTRUCTIONS];
    if (trialInfo) {
      playNarration(`${trialInfo.title}. ${trialInfo.objective}. ${trialInfo.rules.join('. ')}. WARNING: ${trialInfo.elimination}.`);
    }
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

  // Show elimination screen after trial
  const showEliminationScreen = () => {
    if (!gameSession) return;
    
    const currentStage = gameSession.current_stage || 0;
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
    setPhase('elimination');
    
    // Play elimination narration
    const eliminateCount = ELIMINATIONS[currentStage] || 0;
    playNarration(`ROUND ${currentStage} COMPLETE. CALCULATING RESULTS. ${eliminateCount} CANDIDATES WILL BE ELIMINATED.`);
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
      // Final round - show champion
      const winner = eliminationRankings[0];
      setChampion(winner || null);
      setChampionRevealStep(0);
      setPhase('champion');
      playNarration('THE PROTOCOL IS COMPLETE. ONE HUMAN HAS PROVEN THEIR WORTH.');
    } else {
      // Session complete - show session end screen
      setPhase('session-end');
      playNarration(`ROUND ${roundNumber} COMPLETE. SESSION TERMINATED. AWAIT FURTHER INSTRUCTIONS.`);
    }
  };

  // Proceed to next trial or complete (now shows elimination first)
  const proceedToNext = async () => {
    if (!gameId || !gameSession) return;
    showEliminationScreen();
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
    const protectedPhases = ['trial-intro', 'trial-countdown', 'elimination', 'champion', 'session-end', 'round-intro'];
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

  // Auto-advance champion reveal steps
  useEffect(() => {
    const CHAMPION_STEPS_LENGTH = 5; // Number of steps in CHAMPION_STEPS
    if (phase === 'champion' && championRevealStep < CHAMPION_STEPS_LENGTH - 1) {
      const durations = [2500, 2500, 3000, 2500, 0];
      const duration = durations[championRevealStep];
      if (duration > 0) {
        const timer = setTimeout(() => {
          setChampionRevealStep(prev => prev + 1);
        }, duration);
        return () => clearTimeout(timer);
      }
    }
  }, [phase, championRevealStep]);

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
      return { ...player, score: scoreRecord?.score, progress: progressRecord };
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
            <span className="tracking-widest">AVA v2.0</span>
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
              <span className="text-pink-400 font-mono text-xs tracking-wider">AVA SPEAKING</span>
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
                charDelay={isHighlight ? 80 : 40}
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
      <div className="min-h-screen flex flex-col items-center justify-center cyber-bg relative overflow-hidden p-8">
        <div className="grid-overlay" />
        <div className="scanline" />
        
        {/* Ambient glow */}
        <div className="fixed top-1/4 left-1/4 w-[400px] h-[400px] bg-purple-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="fixed bottom-1/4 right-1/4 w-[400px] h-[400px] bg-cyan-500/15 rounded-full blur-[120px] animate-pulse" />
        
        {/* 3D Logo */}
        <div className="relative w-[250px] h-[250px] mb-8">
          <BrandLogo3D />
        </div>
        
        {/* Round intro content */}
        <div className="relative z-10 text-center max-w-3xl animate-fadeIn">
          <p className="text-cyan-400 font-mono text-lg mb-2 tracking-widest">ROUND 0{roundNumber}</p>
          <h1 className="text-5xl md:text-6xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-cyan-400 mb-4">
            {msg.title}
          </h1>
          <p className="text-2xl text-white font-display mb-6">{msg.subtitle}</p>
          <p className="text-slate-400 font-mono text-lg mb-8">{msg.description}</p>
          
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 mb-8">
            <p className="text-red-400 font-display text-xl">⚠ {msg.warning}</p>
          </div>
          
          <div className="flex items-center justify-center gap-4 text-slate-500 font-mono text-sm mb-8">
            <span>EXPECTED CANDIDATES: {expectedPlayers}</span>
            <span className="w-1 h-1 bg-cyan-500 rounded-full" />
            <span>AWAITING REGISTRATION</span>
          </div>
          
          <button
            onClick={() => setPhase('lobby')}
            className="cyber-btn px-12 py-5 rounded-xl flex items-center gap-4 mx-auto text-xl"
          >
            <Play className="w-6 h-6" />
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
    const eventId = gameEvent?.id || gameSession.event_id || '';
    
    const handleCopyEventId = () => {
      navigator.clipboard.writeText(eventId);
      setEventIdCopied(true);
      setTimeout(() => setEventIdCopied(false), 2000);
    };
    
    return (
      <div className="min-h-screen flex flex-col items-center justify-center cyber-bg relative overflow-hidden p-8">
        <div className="grid-overlay" />
        <div className="scanline" />
        
        {/* Ambient glow */}
        <div className="fixed top-1/4 left-1/4 w-[400px] h-[400px] bg-emerald-500/20 rounded-full blur-[120px] animate-pulse" />
        <div className="fixed bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-500/15 rounded-full blur-[120px] animate-pulse" />
        
        {/* 3D Logo */}
        <div className="relative w-[200px] h-[200px] mb-8">
          <BrandLogo3D />
        </div>
        
        <div className="relative z-10 text-center max-w-3xl animate-fadeIn">
          <p className="text-emerald-400 font-mono text-lg mb-2 tracking-widest">SESSION COMPLETE</p>
          <h1 className="text-5xl md:text-6xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-500 to-purple-400 mb-4">
            ROUND 0{roundNumber} COMPLETE
          </h1>
          <p className="text-2xl text-white font-display mb-8">
            {survivorCount} SURVIVOR{survivorCount > 1 ? 'S' : ''} ADVANCE TO ROUND 0{roundNumber + 1}
          </p>
          
          {/* Event ID for admin */}
          <div className="p-6 rounded-xl bg-slate-900/80 border border-purple-500/30 mb-8">
            <p className="text-purple-400 font-mono text-sm mb-3">EVENT ID FOR NEXT ROUND</p>
            <div className="flex items-center justify-center gap-4">
              <code className="text-2xl text-cyan-400 font-mono bg-slate-800 px-6 py-3 rounded-lg">
                {eventId.slice(0, 8)}...
              </code>
              <button
                onClick={handleCopyEventId}
                className="p-3 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
                aria-label="Copy event ID"
              >
                {eventIdCopied ? (
                  <Check className="w-6 h-6 text-emerald-400" />
                ) : (
                  <Copy className="w-6 h-6 text-slate-400" />
                )}
              </button>
            </div>
            <p className="text-slate-500 font-mono text-xs mt-3">
              Use this ID to continue with Round {roundNumber + 1}
            </p>
          </div>
          
          <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700 mb-8">
            <p className="text-slate-400 font-mono text-sm">
              🎤 HR TEAM: Announce prizes for eliminated candidates
            </p>
          </div>
          
          <button
            onClick={() => navigate('/')}
            className="cyber-btn px-12 py-4 rounded-xl flex items-center gap-4 mx-auto"
          >
            <Home className="w-5 h-5" />
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
      <div className="min-h-screen p-8 cyber-bg relative overflow-hidden">
        <div className="grid-overlay" />
        
        {/* 3D Brand Logo - Fixed left side, vertically centered */}
        <div className="fixed left-0 top-0 bottom-0 w-[380px] z-10 flex items-center justify-center">
          <div className="relative flex flex-col items-center">
            {/* Ambient glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div className="w-80 h-80 bg-gradient-to-r from-pink-500/30 via-purple-500/20 to-blue-500/30 rounded-full blur-[80px] animate-pulse" />
            </div>
            {/* 3D Logo - larger size */}
            <div className="relative w-[340px] h-[340px]">
              <BrandLogo3D />
            </div>
            <div className="mt-4 flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900/90 backdrop-blur-sm border border-cyan-500/50">
              <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
              <span className="text-cyan-400 text-xs font-mono font-bold tracking-widest">ROUND 0{roundNumber}</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 ml-[380px]">
          {/* Header */}
          <div className="text-center mb-8">
            <img src="/title_CyberGenesis.png" alt="Cyber Genesis" className="h-20 object-contain mx-auto mb-4 genesis-glow" />
            <p className="text-xl text-slate-400 font-mono">{lobbyTitle}</p>
          </div>

          <div className="grid grid-cols-2 gap-8 max-w-5xl mx-auto">
            {/* QR Code */}
            <div className="cyber-card rounded-2xl p-8 neon-border-purple text-center">
              <h2 className="text-2xl font-bold text-white mb-6 font-display tracking-wider">SCAN TO ENTER</h2>
              <div className="qr-container bg-white p-6 rounded-xl inline-block mb-6">
                <QRCodeSVG value={joinUrl} size={180} />
              </div>
              <p className="text-slate-400 font-mono text-xs break-all">{joinUrl}</p>
              <div className="mt-6 flex items-center justify-center gap-3 text-cyan-400">
                <Users className="w-6 h-6" />
                <span className="text-3xl font-bold font-display">{activePlayers.length}/{maxPlayers}</span>
              </div>
            </div>

            {/* Players Grid */}
            <div className="cyber-card rounded-2xl p-8 neon-border">
              <h2 className="text-2xl font-bold text-white mb-6 font-display tracking-wider text-center">{playerLabel}</h2>
              <div className={`grid gap-3 ${roundNumber === 3 ? 'grid-cols-3' : roundNumber === 2 ? 'grid-cols-3' : 'grid-cols-5'}`}>
                {activePlayers.map((player) => (
                  <div key={player.id} className="flex flex-col items-center animate-bounce-in relative group">
                    <div className="w-14 h-14 rounded-full overflow-hidden border-3" style={{ borderColor: player.avatar_color }}>
                      {player.photo_url ? (
                        <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-lg" style={{ backgroundColor: player.avatar_color }}>
                          {player.name[0]}
                        </div>
                      )}
                    </div>
                    <button onClick={() => kickPlayer(player.id)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <UserX className="w-3 h-3 text-white" />
                    </button>
                    <p className="text-white text-xs mt-1 truncate max-w-full font-mono">{player.name}</p>
                  </div>
                ))}
                {Array.from({ length: Math.max(0, maxPlayers - activePlayers.length) }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center opacity-30">
                    <div className="w-14 h-14 rounded-full border-2 border-dashed border-slate-600 flex items-center justify-center">
                      <span className="text-slate-500 text-xl">?</span>
                    </div>
                    <p className="text-slate-500 text-xs mt-1 font-mono">...</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Start Button */}
          <div className="text-center mt-8">
            <button onClick={() => startTrialIntro(roundNumber)} disabled={activePlayers.length === 0} className="cyber-btn px-12 py-5 rounded-xl flex items-center justify-center gap-4 mx-auto disabled:opacity-50 text-xl">
              <Play className="w-8 h-8" />
              <span className="font-display tracking-wider">BEGIN ROUND 0{roundNumber}</span>
            </button>
          </div>

          {/* Current round info */}
          {(() => {
            const info = ROUND_INSTRUCTIONS[roundNumber as keyof typeof ROUND_INSTRUCTIONS];
            return info ? (
              <div className="flex items-center justify-center gap-4 mt-8">
                <div className="flex items-center gap-3 px-6 py-3 rounded-xl border border-cyan-500/30 bg-slate-900/50">
                  <span className="text-2xl">{info.icon}</span>
                  <div>
                    <span className="font-display text-lg text-cyan-400">ROUND 0{roundNumber}</span>
                    <p className="font-mono text-sm text-slate-400">{STAGE_CODENAMES[roundNumber]}</p>
                  </div>
                </div>
              </div>
            ) : null;
          })()}
        </div>

        {/* Trial Intro Modal */}
        {showTrialIntro && (
          <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm z-50 flex items-center justify-center p-8">
            <div className="max-w-4xl w-full animate-bounce-in">
              {(() => {
                const stage = roundNumber; // Use round_number for multi-session
                const info = ROUND_INSTRUCTIONS[stage as keyof typeof ROUND_INSTRUCTIONS];
                if (!info) return null;
                
                const colorMap = { cyan: '#22d3ee', pink: '#ec4899', emerald: '#22c55e' };
                const color = colorMap[info.color as keyof typeof colorMap];
                
                return (
                  <div className="cyber-card rounded-3xl overflow-hidden" style={{ border: `2px solid ${color}`, boxShadow: `0 0 30px ${color}40` }}>
                    {/* Header */}
                    <div className="p-8 text-center" style={{ background: `linear-gradient(135deg, ${color}20, transparent)` }}>
                      <span className="text-8xl mb-4 block">{info.icon}</span>
                      <h1 className="text-5xl font-display font-bold text-white mb-2">{info.title}</h1>
                      <p className="text-xl font-mono" style={{ color }}>{info.objective}</p>
                    </div>

                    {/* Rules */}
                    <div className="p-8 space-y-4">
                      <h3 className="text-xl font-display text-white mb-4">PROTOCOL RULES:</h3>
                      {info.rules.map((rule, idx) => (
                        <div key={idx} className="flex items-center gap-4 p-4 rounded-lg bg-slate-900/50">
                          <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm" style={{ backgroundColor: `${color}30`, color }}>
                            {idx + 1}
                          </span>
                          <p className="text-slate-300 font-mono text-lg">{rule}</p>
                        </div>
                      ))}

                      {/* Elimination warning */}
                      <div className="p-4 rounded-lg bg-red-500/20 border border-red-500/50 mt-6">
                        <div className="flex items-center gap-3">
                          <Skull className="w-6 h-6 text-red-400" />
                          <p className="text-red-400 font-display text-lg">ELIMINATION: {info.elimination}</p>
                        </div>
                      </div>

                      {/* Tip */}
                      <div className="text-center mt-8">
                        <p className="text-2xl font-display" style={{ color }}>{info.tip}</p>
                      </div>

                      {/* Start button */}
                      <div className="flex justify-center mt-8">
                        <button onClick={() => beginTrial(stage)} className="cyber-btn px-12 py-4 rounded-xl flex items-center gap-4 text-xl">
                          <Play className="w-6 h-6" />
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
        <div className="min-h-screen cyber-bg relative overflow-hidden flex items-center justify-center p-8">
          <div className="grid-overlay" />
          <div className="scanline" />
          
          <div className="max-w-4xl w-full animate-bounce-in relative z-10">
            <div className="cyber-card rounded-3xl overflow-hidden" style={{ border: `2px solid ${color}`, boxShadow: `0 0 30px ${color}40` }}>
              {/* Header */}
              <div className="p-8 text-center" style={{ background: `linear-gradient(135deg, ${color}20, transparent)` }}>
                <span className="text-8xl mb-4 block">{info.icon}</span>
                <h1 className="text-5xl font-display font-bold text-white mb-2">{info.title}</h1>
                <p className="text-xl font-mono" style={{ color }}>{info.objective}</p>
              </div>

              {/* Rules */}
              <div className="p-8 space-y-4">
                <h3 className="text-xl font-display text-white mb-4">PROTOCOL RULES:</h3>
                {info.rules.map((rule, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-4 rounded-lg bg-slate-900/50">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm" style={{ backgroundColor: `${color}30`, color }}>
                      {idx + 1}
                    </span>
                    <p className="text-slate-300 font-mono text-lg">{rule}</p>
                  </div>
                ))}

                {/* Elimination warning */}
                <div className="p-4 rounded-lg bg-red-500/20 border border-red-500/50 mt-6">
                  <div className="flex items-center gap-3">
                    <Skull className="w-6 h-6 text-red-400" />
                    <p className="text-red-400 font-display text-lg">ELIMINATION: {info.elimination}</p>
                  </div>
                </div>

                {/* Tip */}
                <div className="text-center mt-8">
                  <p className="text-2xl font-display" style={{ color }}>{info.tip}</p>
                </div>

                {/* Start button */}
                <div className="flex justify-center mt-8">
                  <button onClick={() => beginTrial(nextStage)} className="cyber-btn px-12 py-4 rounded-xl flex items-center gap-4 text-xl">
                    <Play className="w-6 h-6" />
                    <span className="font-display">START ROUND</span>
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
  // RENDER: ELIMINATION SCREEN
  // ============================================
  if (phase === 'elimination') {
    const currentStage = gameSession.current_stage || 1;
    const eliminateCount = ELIMINATIONS[currentStage] || 0;
    const totalPlayers = eliminationRankings.length;
    const survivorCount = totalPlayers - eliminateCount;
    
    return (
      <div className="min-h-screen cyber-bg relative overflow-hidden flex flex-col p-6">
        <div className="grid-overlay" />
        <div className="scanline" />
        
        {/* Header */}
        <div className="text-center py-6 relative z-10">
          <h1 className="text-5xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-500 to-purple-500 mb-2">
            ROUND 0{currentStage} COMPLETE
          </h1>
          <p className="text-slate-400 font-mono text-lg tracking-widest">
            {revealedRank >= totalPlayers ? 'RESULTS CALCULATED' : 'CALCULATING RESULTS...'}
          </p>
        </div>
        
        {/* Grid layout for all players - fits on one screen */}
        <div className="flex-1 flex flex-col justify-center relative z-10">
          {/* Survivors */}
          <div className="mb-6">
            <h2 className="text-center text-emerald-400 font-display text-xl mb-4 flex items-center justify-center gap-2">
              <span className="w-8 h-0.5 bg-emerald-500/50" />
              SURVIVORS ({survivorCount})
              <span className="w-8 h-0.5 bg-emerald-500/50" />
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 max-w-6xl mx-auto">
              {eliminationRankings.slice(0, survivorCount).map((player, idx) => {
                const rank = idx + 1;
                const isRevealed = revealedRank >= (idx + 1);
                const isTop = rank === 1;
                
                return (
                  <div
                    key={player.id}
                    className={`p-3 rounded-xl text-center transition-all duration-500 ${
                      isRevealed 
                        ? isTop
                          ? 'bg-yellow-500/20 border-2 border-yellow-500/50 opacity-100 scale-100'
                          : 'bg-emerald-500/10 border border-emerald-500/30 opacity-100 scale-100'
                        : 'opacity-0 scale-90'
                    }`}
                    style={{ transitionDelay: `${idx * 80}ms` }}
                  >
                    <div className={`w-12 h-12 mx-auto rounded-full flex items-center justify-center font-bold text-lg font-display mb-2 ${
                      isTop ? 'bg-yellow-500/30 text-yellow-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {isTop ? <Crown className="w-6 h-6" /> : `#${rank}`}
                    </div>
                    <p className={`font-display text-sm truncate ${isTop ? 'text-yellow-400' : 'text-white'}`}>
                      {player.name}
                    </p>
                    <p className="text-slate-500 font-mono text-xs mt-1">
                      {currentStage === 2 ? `${player.score} PTS` : `${(player.score || 0).toFixed(2)}s`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* Eliminated */}
          <div>
            <h2 className="text-center text-red-400 font-display text-xl mb-4 flex items-center justify-center gap-2">
              <span className="w-8 h-0.5 bg-red-500/50" />
              <Skull className="w-5 h-5" /> ELIMINATED ({eliminateCount})
              <span className="w-8 h-0.5 bg-red-500/50" />
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto">
              {eliminationRankings.slice(-eliminateCount).map((player, idx) => {
                const rank = survivorCount + idx + 1;
                const isRevealed = revealedRank >= (survivorCount + idx + 1);
                
                return (
                  <div
                    key={player.id}
                    className={`p-3 rounded-xl text-center transition-all duration-500 ${
                      isRevealed 
                        ? 'bg-red-500/20 border-2 border-red-500/50 opacity-100 scale-100'
                        : 'opacity-0 scale-90'
                    }`}
                    style={{ transitionDelay: `${(survivorCount + idx) * 80}ms` }}
                  >
                    <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center font-bold text-lg font-display mb-2 bg-red-500/30 text-red-400">
                      #{rank}
                    </div>
                    <p className="font-display text-sm truncate text-red-400">
                      {player.name}
                    </p>
                    <p className="text-red-500/70 font-mono text-xs mt-1">
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
          <div className="py-6 text-center relative z-10 animate-fadeIn">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-purple-500/30 inline-block mb-4">
              <p className="text-purple-400 font-display text-xl">
                {eliminateCount} ELIMINATED • {survivorCount} SURVIVING
              </p>
            </div>
            
            <div>
              <button 
                onClick={continueFromElimination}
                className="cyber-btn px-12 py-4 rounded-xl flex items-center gap-4 mx-auto text-xl"
              >
                {currentStage < 3 ? (
                  <>
                    <span className="font-display">PROCEED TO ROUND 0{currentStage + 1}</span>
                    <ChevronRight className="w-6 h-6" />
                  </>
                ) : (
                  <>
                    <Crown className="w-6 h-6" />
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
  // RENDER: CHAMPION REVEAL
  // ============================================
  const CHAMPION_STEPS = [
    { text: 'THE PROTOCOL IS COMPLETE', duration: 2500 },
    { text: 'ALL ROUNDS HAVE BEEN CONQUERED', duration: 2500 },
    { text: 'ONE HUMAN HAS PROVEN THEIR WORTH', duration: 3000 },
    { text: 'I PRESENT TO YOU...', duration: 2500 },
    { text: 'THE HUMAN CHAMPION', duration: 0 }, // Final reveal
  ];
  const isFinaleReveal = championRevealStep >= CHAMPION_STEPS.length - 1;
  
  if (phase === 'champion') {
    return (
      <div className="min-h-screen cyber-bg relative overflow-hidden flex items-center justify-center">
        <div className="grid-overlay" />
        <div className="scanline" />
        
        {/* Confetti/particles effect */}
        {isFinaleReveal && (
          <div className="fixed inset-0 pointer-events-none z-20">
            {Array.from({ length: 50 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-3 h-3 animate-confetti"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: '-20px',
                  background: ['#ffd700', '#ff6b6b', '#4ecdc4', '#a855f7', '#ec4899'][Math.floor(Math.random() * 5)],
                  animationDelay: `${Math.random() * 3}s`,
                  animationDuration: `${3 + Math.random() * 2}s`,
                }}
              />
            ))}
          </div>
        )}
        
        {/* Ambient celebration glow */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-yellow-500/20 rounded-full blur-[150px] animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-pink-500/20 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '1s' }} />
        </div>
        
        <div className="text-center relative z-10 max-w-4xl mx-auto px-8">
          {!isFinaleReveal ? (
            /* Build-up slides */
            <div className="animate-fadeIn" key={championRevealStep}>
              <p className="text-4xl md:text-6xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-500">
                <TypewriterText text={CHAMPION_STEPS[championRevealStep].text} charDelay={50} />
              </p>
            </div>
          ) : (
            /* Final champion reveal */
            <div className="animate-bounce-in">
              {/* Crown animation */}
              <div className="mb-8">
                <div className="w-40 h-40 mx-auto rounded-full bg-gradient-to-br from-yellow-400 via-yellow-500 to-orange-500 flex items-center justify-center animate-pulse-glow" style={{ boxShadow: '0 0 60px rgba(234, 179, 8, 0.5), 0 0 120px rgba(234, 179, 8, 0.3)' }}>
                  <Crown className="w-20 h-20 text-white" />
                </div>
              </div>
              
              {/* Title */}
              <h1 className="text-3xl font-display text-slate-400 mb-4 tracking-widest">THE HUMAN CHAMPION</h1>
              
              {/* Champion name */}
              <div className="py-8">
                <p className="text-7xl md:text-9xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-400 to-orange-400" style={{ textShadow: '0 0 40px rgba(234, 179, 8, 0.5)' }}>
                  {champion?.name || 'CHAMPION'}
                </p>
              </div>
              
              {/* Subtitle */}
              <p className="text-xl text-slate-400 font-mono mt-4 max-w-2xl mx-auto">
                "YOU HAVE PROVEN YOUR WORTH. YOU ARE THE PINNACLE OF HUMAN POTENTIAL."
              </p>
              <p className="text-pink-400 font-mono text-sm mt-2">— GENESIS AI</p>
              
              {/* Stats */}
              <div className="mt-12 flex items-center justify-center gap-8">
                <div className="text-center px-6 py-4 rounded-xl bg-slate-900/50 border border-yellow-500/30">
                  <p className="text-4xl font-display font-bold text-yellow-400">3</p>
                  <p className="text-slate-500 font-mono text-sm">ROUNDS CONQUERED</p>
                </div>
                <div className="text-center px-6 py-4 rounded-xl bg-slate-900/50 border border-pink-500/30">
                  <p className="text-4xl font-display font-bold text-pink-400">10</p>
                  <p className="text-slate-500 font-mono text-sm">COMPETITORS DEFEATED</p>
                </div>
                <div className="text-center px-6 py-4 rounded-xl bg-slate-900/50 border border-purple-500/30">
                  <p className="text-4xl font-display font-bold text-purple-400">1</p>
                  <p className="text-slate-500 font-mono text-sm">CHAMPION CROWNED</p>
                </div>
              </div>
              
              {/* Final message */}
              <div className="mt-12 p-6 rounded-xl bg-gradient-to-r from-yellow-500/10 via-pink-500/10 to-purple-500/10 border border-yellow-500/30">
                <p className="text-2xl font-display text-white">
                  CONGRATULATIONS, <span className="text-yellow-400">{champion?.name || 'CHAMPION'}</span>
                </p>
                <p className="text-slate-400 font-mono mt-2">
                  THE PROTOCOL IS COMPLETE. GENESIS AI ACKNOWLEDGES YOUR SUPREMACY.
                </p>
              </div>
            </div>
          )}
        </div>
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
          <p className="text-slate-400 text-3xl mb-6 font-mono tracking-widest">ROUND INITIATING</p>
          <div className="w-56 h-56 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto animate-pulse-glow">
            <span className="text-white text-9xl font-bold font-display">{countdown}</span>
          </div>
          <p className="text-white text-4xl font-bold mt-8 font-display tracking-wider">PREPARE YOURSELVES</p>
          <p className="text-cyan-400 font-mono mt-4 text-xl">{STAGE_CODENAMES[gameSession.current_stage || 1]}</p>
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
      <div className="min-h-screen p-6 cyber-bg relative overflow-hidden">
        <div className="grid-overlay" />
        
        {/* 3D Brand Logo - Fixed left side, vertically centered */}
        <div className="fixed left-0 top-0 bottom-0 w-[240px] z-10 flex items-center justify-center">
          <div className="relative flex flex-col items-center">
            {/* Ambient glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
              <div className="w-52 h-52 bg-gradient-to-r from-pink-500/20 via-purple-500/15 to-blue-500/20 rounded-full blur-[50px] animate-pulse" />
            </div>
            {/* 3D Logo - compact for trial view */}
            <div className="relative w-[200px] h-[200px]">
              <BrandLogo3D />
            </div>
            <div className="mt-3 flex items-center gap-1 px-3 py-1 rounded-full bg-slate-900/90 backdrop-blur-sm border border-cyan-500/50">
              <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
              <span className="text-cyan-400 text-xs font-mono">ANALYZING</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 ml-[240px]">
          {/* Header */}
          <header className="text-center mb-6">
            <div className="flex items-center justify-center gap-3 mb-2">
              <span className="text-4xl">{info?.icon}</span>
              <h1 className="text-4xl font-bold text-white font-display tracking-wider">ROUND 0{currentStage}</h1>
              <span className="flex items-center gap-1 bg-red-500/20 text-red-400 px-3 py-1 rounded-full text-sm font-bold font-mono ml-4">
                <Radio className="w-4 h-4 animate-pulse" /> LIVE
              </span>
            </div>
            <p className="text-xl text-slate-400 font-mono">{STAGE_CODENAMES[currentStage]}</p>
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
                  <div className="grid grid-cols-3 gap-3">
                    {playersWithProgress.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map((player, index) => {
                      const isFinished = player.progress?.status === 'finished';
                      const progress = player.progress?.progress ?? 0;
                      const currentRound = Math.ceil((progress / 100) * 5) || 0;
                      const points = player.score ?? 0;

                      return (
                        <div key={player.id} className={`cyber-card rounded-xl p-3 transition-all relative ${isFinished ? 'neon-border-magenta' : ''}`}>
                          <div className={`absolute -top-2 -left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : 'bg-slate-600 text-white'}`}>
                            {index + 1}
                          </div>
                          <div className="flex items-center gap-2 mb-2 mt-1">
                            <div className="w-10 h-10 rounded-full overflow-hidden" style={{ borderColor: player.avatar_color, borderWidth: 2 }}>
                              {player.photo_url ? <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white text-sm" style={{ backgroundColor: player.avatar_color }}>{player.name[0]}</div>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-medium truncate font-mono text-sm">{player.name}</p>
                              <p className={`text-xs font-mono ${isFinished ? 'text-emerald-400' : 'text-cyan-400'}`}>{isFinished ? 'DONE' : `R${currentRound}/5`}</p>
                            </div>
                          </div>
                          <div className="text-center">
                            <p className={`text-3xl font-bold font-display ${points >= 10 ? 'text-emerald-400' : points >= 5 ? 'text-yellow-400' : 'text-white'}`}>{points}<span className="text-sm text-slate-400 ml-1">PTS</span></p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Stage 3: Stop Timer */}
              {currentStage === 3 && (
                <div className="cyber-card rounded-2xl p-6 neon-border-purple">
                  <div className="flex items-center gap-3 mb-2">
                    <Timer className="w-6 h-6 text-purple-400" />
                    <h2 className="text-xl font-bold text-white font-display">PRECISION PROTOCOL</h2>
                  </div>
                  <p className="text-slate-400 mb-4 font-mono">TARGET: 7.700000 SECONDS</p>
                  <div className="grid grid-cols-3 gap-3">
                    {playersWithProgress.map((player) => {
                      const isFinished = player.progress?.status === 'finished';
                      const isPlaying = player.progress?.status === 'playing';
                      const elapsed = player.progress?.elapsed_time ?? 0;
                      const diff = isFinished ? Math.abs(elapsed - 7.7) : null;

                      return (
                        <div key={player.id} className={`cyber-card rounded-xl p-3 transition-all ${isFinished ? 'neon-border' : ''}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-8 h-8 rounded-full overflow-hidden" style={{ borderColor: player.avatar_color, borderWidth: 2 }}>
                              {player.photo_url ? <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white text-xs" style={{ backgroundColor: player.avatar_color }}>{player.name[0]}</div>}
                            </div>
                            <p className="text-white font-medium truncate flex-1 font-mono text-sm">{player.name}</p>
                          </div>
                          <div className="text-center">
                            <p className={`text-2xl font-mono font-bold ${isFinished ? (diff !== null && diff < 0.1 ? 'text-emerald-400' : diff !== null && diff < 0.3 ? 'text-yellow-400' : 'text-orange-400') : isPlaying ? 'text-cyan-400' : 'text-slate-400'}`}>
                              {isPlaying ? <AnimatedTimerDisplay baseTime={elapsed} isPlaying={true} /> : isFinished ? elapsed.toFixed(6) : '--:------'}
                            </p>
                            <p className={`text-xs mt-0.5 font-mono ${isFinished ? 'text-emerald-400' : isPlaying ? 'text-cyan-400 animate-pulse' : 'text-slate-500'}`}>
                              {isFinished ? `${diff?.toFixed(3)}s off` : isPlaying ? 'RUNNING' : 'WAIT'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Leaderboard */}
            <div className="w-80 flex-shrink-0 sticky top-6">
              <div className="cyber-card rounded-2xl p-4">
                <h3 className="text-lg font-bold text-white mb-3 text-center font-display">STANDINGS</h3>
                <div className="space-y-1.5">
                  {[...playersWithProgress]
                    .sort((a, b) => {
                      // Stage 2 (RPS): Higher score wins
                      if (currentStage === 2) return (b.score ?? 0) - (a.score ?? 0);
                      
                      // Stage 1 & 3: Lower time wins
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
                    .map((player, index) => (
                      <div key={player.id} className={`leaderboard-row flex items-center gap-2 p-2 rounded-lg ${index < activePlayers.length - eliminationCount ? 'safe' : 'danger'}`}>
                        <span className={`rank-badge w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : 'bg-slate-700 text-white'}`}>{index + 1}</span>
                        <div className="w-8 h-8 rounded-full overflow-hidden" style={{ borderColor: player.avatar_color, borderWidth: 2 }}>
                          {player.photo_url ? <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white text-xs" style={{ backgroundColor: player.avatar_color }}>{player.name[0]}</div>}
                        </div>
                        <span className="flex-1 text-white font-mono text-sm truncate">{player.name}</span>
                        {player.score !== undefined && <span className="text-cyan-400 font-bold font-mono text-sm">{currentStage === 2 ? `${player.score}` : `${player.score.toFixed(1)}s`}</span>}
                      </div>
                    ))}
                </div>
                <p className="text-center text-slate-400 text-xs mt-3 font-mono">
                  <span className="text-red-400 font-bold">{eliminationCount}</span> WILL BE TERMINATED
                </p>

                {/* Next button when all finished */}
                {allFinished && (
                  <button onClick={proceedToNext} className="cyber-btn w-full mt-4 py-3 rounded-lg flex items-center justify-center gap-2">
                    {currentStage < 3 ? (
                      <><span className="font-display text-sm">NEXT ROUND</span><ChevronRight className="w-5 h-5" /></>
                    ) : (
                      <><Trophy className="w-5 h-5" /><span className="font-display text-sm">CROWN CHAMPION</span></>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Eliminated this round */}
          {eliminatedPlayers.length > 0 && (
            <div className="mt-6 cyber-card rounded-xl p-4 border-red-500/30">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Skull className="w-4 h-4 text-red-400" />
                <span className="text-red-400 font-display text-sm">TERMINATED</span>
              </div>
              <div className="flex justify-center gap-4">
                {eliminatedPlayers.map((player) => (
                  <div key={player.id} className="flex flex-col items-center opacity-50">
                    <div className="w-10 h-10 rounded-full overflow-hidden grayscale border border-red-500/30">
                      {player.photo_url ? <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white text-xs" style={{ backgroundColor: player.avatar_color }}>{player.name[0]}</div>}
                    </div>
                    <p className="text-slate-500 text-xs mt-1 font-mono">{player.name}</p>
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
