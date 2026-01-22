import { useState, useEffect, useRef, useCallback } from 'react';
import { Timer, Target, Trophy, Zap, Play, RotateCcw } from 'lucide-react';
import { supabase, TABLES, type Player, type GameSession } from '../lib/supabase';

type Props = {
  player: Player;
  gameSession: GameSession;
};

type GamePhase = 'trial-intro' | 'trial-countdown' | 'trial-running' | 'trial-result' | 'actual-countdown' | 'actual-running' | 'actual-stopped';

const TARGET_TIME = 7.7;
const COUNTDOWN_DURATION = 3;

const FADE_DURATION = 3000; // 3 seconds to fade out timer

const StopTimer = ({ player, gameSession }: Props) => {
  const [phase, setPhase] = useState<GamePhase>('trial-intro');
  const [countdown, setCountdown] = useState(COUNTDOWN_DURATION);
  const [time, setTime] = useState(0);
  const [trialTime, setTrialTime] = useState<number | null>(null);
  const [difference, setDifference] = useState<number | null>(null);
  const [isOverTarget, setIsOverTarget] = useState(false);
  const [timerFadeProgress, setTimerFadeProgress] = useState(0); // 0 = visible, 100 = hidden
  const startTimeRef = useRef<number | null>(null);
  const fadeStartRef = useRef<number | null>(null);
  const progressUpdateRef = useRef<number | null>(null);
  const hasCompleted = useRef(false);
  const isActive = gameSession.current_stage === 3;

  const updateProgress = useCallback(async (
    elapsed: number, 
    status: 'waiting' | 'playing' | 'finished',
    gamePhase: 'trial' | 'actual' = 'trial',
    trialResult?: number
  ) => {
    try {
      const progress = status === 'finished' ? 100 : Math.min((elapsed / TARGET_TIME) * 100, 100);
      await supabase
        .from(TABLES.playerProgress)
        .upsert({
          player_id: player.id,
          game_session_id: player.game_session_id,
          stage: 3,
          progress,
          current_score: 0,
          elapsed_time: elapsed,
          status,
          extra_data: { 
            game_phase: gamePhase,
            trial_time: trialResult ?? null
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'player_id,game_session_id,stage' });
    } catch (err) {
      console.error('Error updating progress:', err);
    }
  }, [player.id, player.game_session_id]);

  const saveScore = useCallback(async (diff: number, finalTime: number) => {
    if (hasCompleted.current) return;
    hasCompleted.current = true;

    try {
      await supabase
        .from(TABLES.stageScores)
        .upsert({
          player_id: player.id,
          game_session_id: player.game_session_id,
          stage: 3,
          score: diff,
          time_taken: finalTime,
        }, { onConflict: 'player_id,game_session_id,stage' });
    } catch (err) {
      console.error('Error saving score:', err);
    }
  }, [player.id, player.game_session_id]);

  // Stop timer for trial run
  const stopTrialTimer = useCallback(() => {
    if (phase !== 'trial-running') return;

    const finalTime = startTimeRef.current ? (performance.now() - startTimeRef.current) / 1000 : time;
    setTrialTime(finalTime);
    setPhase('trial-result');
    // Update progress with trial result
    updateProgress(finalTime, 'playing', 'trial', finalTime);
  }, [phase, time, updateProgress]);

  // Stop timer for actual run
  const stopActualTimer = useCallback(() => {
    if (phase !== 'actual-running' || hasCompleted.current) return;

    if (progressUpdateRef.current) {
      clearTimeout(progressUpdateRef.current);
      progressUpdateRef.current = null;
    }

    const finalTime = startTimeRef.current ? (performance.now() - startTimeRef.current) / 1000 : time;
    setTime(finalTime);
    setPhase('actual-stopped');

    const diff = Math.abs(finalTime - TARGET_TIME);
    setDifference(diff);
    setIsOverTarget(finalTime > TARGET_TIME);
    updateProgress(finalTime, 'finished', 'actual', trialTime ?? undefined);
    saveScore(diff, finalTime);
  }, [phase, time, updateProgress, saveScore, trialTime]);

  // Start trial run
  const startTrialRun = () => {
    setPhase('trial-countdown');
    setCountdown(COUNTDOWN_DURATION);
    setTime(0);
    setTrialTime(null);
  };

  // Start actual run after trial
  const startActualRun = () => {
    setPhase('actual-countdown');
    setCountdown(COUNTDOWN_DURATION);
    setTime(0);
    // Store actual start time for audience fade sync
    updateProgressWithActualStart(0, 'waiting', 'actual', trialTime ?? undefined, null);
  };
  
  // Update progress with actual start timestamp
  const updateProgressWithActualStart = async (
    elapsed: number, 
    status: 'waiting' | 'playing' | 'finished',
    gamePhase: 'trial' | 'actual' = 'trial',
    trialResult?: number,
    actualStartTime?: number | null
  ) => {
    try {
      const progress = status === 'finished' ? 100 : Math.min((elapsed / TARGET_TIME) * 100, 100);
      await supabase
        .from(TABLES.playerProgress)
        .upsert({
          player_id: player.id,
          game_session_id: player.game_session_id,
          stage: 3,
          progress,
          current_score: 0,
          elapsed_time: elapsed,
          status,
          extra_data: { 
            game_phase: gamePhase,
            trial_time: trialResult ?? null,
            actual_start_time: actualStartTime
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'player_id,game_session_id,stage' });
    } catch (err) {
      console.error('Error updating progress:', err);
    }
  };

  // Countdown effect
  useEffect(() => {
    if (!isActive) return;

    if ((phase === 'trial-countdown' || phase === 'actual-countdown') && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }

    if (phase === 'trial-countdown' && countdown === 0) {
      setPhase('trial-running');
      startTimeRef.current = performance.now();
    }

    if (phase === 'actual-countdown' && countdown === 0) {
      setPhase('actual-running');
      const startTime = Date.now();
      startTimeRef.current = performance.now();
      fadeStartRef.current = performance.now(); // Start fade timer
      setTimerFadeProgress(0); // Reset fade
      // Store actual start time for audience sync
      updateProgressWithActualStart(0, 'playing', 'actual', trialTime ?? undefined, startTime);
    }
  }, [phase, countdown, isActive, trialTime]);

  // Timer fade-out effect for actual run
  useEffect(() => {
    if (phase !== 'actual-running') {
      setTimerFadeProgress(0);
      fadeStartRef.current = null;
      return;
    }

    let animationId: number;
    
    const updateFade = () => {
      if (fadeStartRef.current) {
        const elapsed = performance.now() - fadeStartRef.current;
        const progress = Math.min((elapsed / FADE_DURATION) * 100, 100);
        setTimerFadeProgress(progress);
        
        if (progress < 100) {
          animationId = requestAnimationFrame(updateFade);
        }
      }
    };
    
    animationId = requestAnimationFrame(updateFade);
    
    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [phase]);

  // Timer update effect
  useEffect(() => {
    if (phase === 'trial-running' || phase === 'actual-running') {
      let animationId: number;
      let lastFrameTime = performance.now();
      let microOffset = 0;

      const updateTime = () => {
        if (startTimeRef.current) {
          const now = performance.now();
          const frameDelta = now - lastFrameTime;
          lastFrameTime = now;

          microOffset = (microOffset + frameDelta * 0.1) % 1;
          const baseElapsed = (now - startTimeRef.current) / 1000;
          const displayElapsed = baseElapsed + (microOffset * 0.000001);

          setTime(displayElapsed);

          // Update progress for both phases
          if (progressUpdateRef.current) {
            clearTimeout(progressUpdateRef.current);
          }
          const currentPhase = phase === 'actual-running' ? 'actual' : 'trial';
          progressUpdateRef.current = window.setTimeout(() => {
            updateProgress(baseElapsed, 'playing', currentPhase, trialTime ?? undefined);
          }, 200);
        }
        animationId = requestAnimationFrame(updateTime);
      };
      animationId = requestAnimationFrame(updateTime);

      return () => {
        cancelAnimationFrame(animationId);
        if (progressUpdateRef.current) {
          clearTimeout(progressUpdateRef.current);
          progressUpdateRef.current = null;
        }
      };
    }
  }, [phase, updateProgress, trialTime]);

  // Reset on stage change
  useEffect(() => {
    if (!isActive) {
      setPhase('trial-intro');
      setCountdown(COUNTDOWN_DURATION);
      setTime(0);
      setTrialTime(null);
      setDifference(null);
      setIsOverTarget(false);
      startTimeRef.current = null;
      hasCompleted.current = false;
      if (progressUpdateRef.current) {
        clearTimeout(progressUpdateRef.current);
        progressUpdateRef.current = null;
      }
    } else {
      updateProgress(0, 'waiting', 'trial');
    }
  }, [isActive, updateProgress]);

  const getResultColor = (diff: number | null) => {
    if (diff === null) return 'text-white';
    if (diff < 0.1) return 'text-emerald-400';
    if (diff < 0.3) return 'text-yellow-400';
    if (diff < 0.5) return 'text-orange-400';
    return 'text-red-400';
  };

  const getResultMessage = (diff: number | null) => {
    if (diff === null) return '';
    if (diff < 0.1) return 'PERFECT PRECISION!';
    if (diff < 0.3) return 'EXCELLENT!';
    if (diff < 0.5) return 'ACCEPTABLE!';
    if (diff < 1) return 'ADEQUATE!';
    return 'RECALIBRATION REQUIRED';
  };

  if (!isActive) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-6">
        <p className="text-slate-400 text-xl font-mono">AWAITING SIGNAL...</p>
      </div>
    );
  }

  // Trial Intro Screen
  if (phase === 'trial-intro') {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center mb-8">
          <h2 className="text-4xl font-bold text-white mb-2 font-display tracking-wider">
            PRECISION <span className="text-purple-400">PROTOCOL</span>
          </h2>
          <p className="text-slate-400 font-mono text-lg mt-4">STOP AT EXACTLY</p>
          <p className="text-5xl font-mono font-bold text-cyan-400 mt-2">{TARGET_TIME.toFixed(1)} SECONDS</p>
        </div>

        <div className="cyber-card rounded-3xl p-8 mb-8 max-w-md text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Target className="w-8 h-8 text-yellow-400" />
            <span className="text-yellow-400 font-bold font-display text-xl">TRIAL RUN</span>
          </div>
          <p className="text-slate-300 font-mono mb-6">
            Practice your timing before the real challenge. 
            The timer will be visible during this trial.
          </p>
          <p className="text-purple-400 font-mono text-sm mb-8">
            ⚠️ In the actual run, the timer will be HIDDEN!
          </p>
          
          <button
            onClick={startTrialRun}
            className="cyber-btn w-full py-4 rounded-xl flex items-center justify-center gap-3 text-xl font-black"
            aria-label="Start trial run"
            tabIndex={0}
          >
            <Play className="w-6 h-6" />
            <span className="font-display">START TRIAL</span>
          </button>
        </div>
      </div>
    );
  }

  // Trial Countdown
  if (phase === 'trial-countdown') {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center mb-4">
          <span className="text-yellow-400 font-mono text-lg">⚡ TRIAL RUN ⚡</span>
        </div>
        <div className="cyber-card rounded-3xl p-10 mb-8">
          <div className="text-center">
            <p className="text-slate-400 mb-6 font-mono">TRIAL STARTING IN</p>
            <div className="w-36 h-36 rounded-full bg-gradient-to-br from-yellow-600 to-orange-500 flex items-center justify-center mx-auto animate-pulse-glow">
              <span className="text-7xl font-bold text-white font-display">{countdown}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-cyan-400">
          <Target className="w-6 h-6" />
          <span className="font-mono text-xl">TARGET: {TARGET_TIME.toFixed(1)}s</span>
        </div>
      </div>
    );
  }

  // Trial Running - Timer VISIBLE
  if (phase === 'trial-running') {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center mb-4">
          <span className="text-yellow-400 font-mono text-lg">⚡ TRIAL RUN ⚡</span>
        </div>
        
        <div className="cyber-card rounded-3xl p-8 mb-8 w-full max-w-sm">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Target className="w-6 h-6 text-cyan-400" />
            <span className="text-cyan-400 font-bold font-mono">TARGET: {TARGET_TIME.toFixed(1)}s</span>
          </div>

          <div className="text-center py-10 px-4 rounded-2xl bg-slate-900/80">
            <Timer className="w-16 h-16 mx-auto mb-6 text-cyan-400 animate-pulse" />
            <p className="text-5xl font-mono font-bold tracking-wider text-white">
              {time.toFixed(6)}
            </p>
            <p className="text-slate-400 text-sm mt-3 font-mono">SECONDS</p>
          </div>
        </div>

        <button
          onClick={stopTrialTimer}
          className="tap-button w-full max-w-sm h-36 rounded-2xl font-bold text-2xl transition-all duration-100 shadow-2xl bg-gradient-to-br from-yellow-500 via-orange-500 to-red-500 hover:from-yellow-400 hover:via-orange-400 hover:to-red-400 text-white animate-pulse-glow flex flex-col items-center justify-center gap-2"
          aria-label="Stop trial timer"
          tabIndex={0}
        >
          <Zap className="w-10 h-10" />
          <span className="font-display tracking-wider">STOP!</span>
        </button>
      </div>
    );
  }

  // Trial Result
  if (phase === 'trial-result' && trialTime !== null) {
    const trialDiff = Math.abs(trialTime - TARGET_TIME);
    const trialOver = trialTime > TARGET_TIME;

    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center mb-4">
          <span className="text-yellow-400 font-mono text-lg">⚡ TRIAL RESULT ⚡</span>
        </div>

        <div className="cyber-card rounded-3xl p-8 mb-8 w-full max-w-sm neon-border-purple">
          <div className="text-center py-6">
            <p className="text-slate-400 mb-2 font-mono">YOUR TRIAL TIME</p>
            <p className={`text-4xl font-mono font-bold ${getResultColor(trialDiff)}`}>
              {trialTime.toFixed(6)}s
            </p>
            <p className="text-slate-400 mt-4 font-mono text-sm">
              TARGET: <span className="text-cyan-400">{TARGET_TIME.toFixed(1)}s</span>
            </p>
            <p className={`mt-2 font-mono ${getResultColor(trialDiff)}`}>
              DEVIATION: {trialOver ? '+' : '-'}{trialDiff.toFixed(3)}s
            </p>
            <p className={`mt-4 text-xl font-bold font-display ${getResultColor(trialDiff)}`}>
              {getResultMessage(trialDiff)}
            </p>
          </div>
        </div>

        <p className="text-purple-400 font-mono text-center mb-6 max-w-sm">
          ⚠️ Remember this feeling! In the ACTUAL run, the timer will be HIDDEN!
        </p>

        <button
          onClick={startActualRun}
          className="cyber-btn w-full max-w-sm py-5 rounded-xl flex items-center justify-center gap-3 text-xl font-black bg-gradient-to-r from-purple-600 to-pink-600"
          aria-label="Start actual run"
          tabIndex={0}
        >
          <Zap className="w-6 h-6" />
          <span className="font-display">BEGIN ACTUAL RUN</span>
        </button>
      </div>
    );
  }

  // Actual Countdown
  if (phase === 'actual-countdown') {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center mb-4">
          <span className="text-red-400 font-mono text-lg animate-pulse">🔴 THIS IS THE REAL RUN 🔴</span>
        </div>
        <div className="cyber-card rounded-3xl p-10 mb-8 neon-border-magenta">
          <div className="text-center">
            <p className="text-slate-400 mb-6 font-mono">ACTUAL RUN STARTING IN</p>
            <div className="w-36 h-36 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center mx-auto animate-pulse-glow">
              <span className="text-7xl font-bold text-white font-display">{countdown}</span>
            </div>
          </div>
        </div>
        <p className="text-red-400 font-mono text-center animate-pulse">
          ⚠️ TIMER WILL BE HIDDEN - USE YOUR INTERNAL CLOCK!
        </p>
      </div>
    );
  }

  // Actual Running - Timer fades out over 3 seconds then shows mystery
  if (phase === 'actual-running') {
    const isFaded = timerFadeProgress >= 100;
    
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center mb-4">
          <span className="text-red-400 font-mono text-lg animate-pulse">🔴 ACTUAL RUN 🔴</span>
        </div>

        <div className="cyber-card rounded-3xl p-8 mb-8 w-full max-w-sm neon-border-magenta">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Target className="w-6 h-6 text-cyan-400" />
            <span className="text-cyan-400 font-bold font-mono">TARGET: {TARGET_TIME.toFixed(1)}s</span>
          </div>

          {/* Timer display - shows actual time OR mystery, not both */}
          <div className="text-center py-10 px-4 rounded-2xl bg-slate-900/80 relative">
            <Timer className={`w-20 h-20 mx-auto mb-6 transition-colors duration-500 ${isFaded ? 'text-purple-400 animate-pulse' : 'text-cyan-400'}`} />
            
            {/* Container for timer/mystery - fixed height to prevent layout shift */}
            <div className="h-16 flex items-center justify-center">
              {!isFaded ? (
                <p 
                  className="text-5xl font-mono font-bold tracking-wider text-cyan-400"
                  style={{ opacity: Math.max(0, 1 - (timerFadeProgress / 100)) }}
                >
                  {time.toFixed(6)}
                </p>
              ) : (
                <p className="text-5xl font-mono font-bold tracking-wider text-purple-400 animate-pulse">
                  ??.??????
                </p>
              )}
            </div>
            
            <p className="text-slate-400 text-sm mt-3 font-mono">
              {isFaded ? 'TRUST YOUR INSTINCTS' : 'TIMER FADING...'}
            </p>
          </div>
        </div>

        <button
          onClick={stopActualTimer}
          className="tap-button w-full max-w-sm h-40 rounded-2xl font-bold text-3xl transition-all duration-100 shadow-2xl bg-gradient-to-br from-red-500 via-pink-500 to-purple-600 hover:from-red-400 hover:via-pink-400 hover:to-purple-500 text-white animate-pulse-glow flex flex-col items-center justify-center gap-3"
          aria-label="Stop timer"
          tabIndex={0}
        >
          <Zap className="w-12 h-12" />
          <span className="font-display tracking-wider">STOP!</span>
        </button>
      </div>
    );
  }

  // Actual Stopped - Show result
  if (phase === 'actual-stopped') {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center p-6">
        <div className={`cyber-card rounded-3xl p-8 w-full max-w-sm ${
          difference !== null && difference < 0.1 ? 'neon-border' : 'neon-border-purple'
        }`}>
          <div className="text-center mb-6">
            <Trophy className={`w-16 h-16 mx-auto mb-4 ${getResultColor(difference)}`} />
            <p className={`text-3xl font-bold font-display ${getResultColor(difference)}`}>
              {getResultMessage(difference)}
            </p>
          </div>

          <div className="text-center py-6 rounded-2xl bg-slate-800/50">
            <p className="text-slate-400 mb-2 font-mono">YOUR TIME</p>
            <p className={`text-4xl font-mono font-bold ${getResultColor(difference)}`}>
              {time.toFixed(6)}s
            </p>
            <p className="text-slate-400 mt-4 font-mono text-sm">
              TARGET: <span className="text-cyan-400">{TARGET_TIME.toFixed(6)}s</span>
            </p>
            <p className={`mt-2 font-mono ${getResultColor(difference)}`}>
              DEVIATION: {isOverTarget ? '+' : '-'}{difference?.toFixed(6)}s
            </p>
          </div>

          <div className="mt-6 text-center">
            <p className="text-slate-400 font-mono text-sm">
              AWAITING FINAL RESULTS...
            </p>
            <p className="text-purple-400 font-mono text-xs mt-2">
              Rankings will be revealed soon
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default StopTimer;
