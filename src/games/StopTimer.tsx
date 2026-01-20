import { useState, useEffect, useRef, useCallback } from 'react';
import { Timer, Target, Trophy, Zap } from 'lucide-react';
import { supabase, TABLES, type Player, type GameSession } from '../lib/supabase';

type Props = {
  player: Player;
  gameSession: GameSession;
};

const TARGET_TIME = 7.7;
const COUNTDOWN_DURATION = 3;

const StopTimer = ({ player, gameSession }: Props) => {
  const [phase, setPhase] = useState<'countdown' | 'running' | 'stopped'>('countdown');
  const [countdown, setCountdown] = useState(COUNTDOWN_DURATION);
  const [time, setTime] = useState(0);
  const [difference, setDifference] = useState<number | null>(null);
  const [isOverTarget, setIsOverTarget] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const progressUpdateRef = useRef<number | null>(null);
  const hasCompleted = useRef(false);
  const isActive = gameSession.current_stage === 3;

  const updateProgress = useCallback(async (elapsed: number, status: 'waiting' | 'playing' | 'finished') => {
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

  const stopTimer = useCallback(() => {
    if (phase !== 'running' || hasCompleted.current) return;

    if (progressUpdateRef.current) {
      clearTimeout(progressUpdateRef.current);
      progressUpdateRef.current = null;
    }

    const finalTime = startTimeRef.current ? (performance.now() - startTimeRef.current) / 1000 : time;
    setTime(finalTime);
    setPhase('stopped');

    const diff = Math.abs(finalTime - TARGET_TIME);
    setDifference(diff);
    setIsOverTarget(finalTime > TARGET_TIME);
    updateProgress(finalTime, 'finished');
    saveScore(diff, finalTime);
  }, [phase, time, updateProgress, saveScore]);

  useEffect(() => {
    if (!isActive) return;

    if (phase === 'countdown' && countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }

    if (phase === 'countdown' && countdown === 0) {
      setPhase('running');
      startTimeRef.current = performance.now();
      updateProgress(0, 'playing');
    }
  }, [phase, countdown, isActive, updateProgress]);

  useEffect(() => {
    if (phase === 'running') {
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

          if (progressUpdateRef.current) {
            clearTimeout(progressUpdateRef.current);
          }
          progressUpdateRef.current = window.setTimeout(() => {
            updateProgress(baseElapsed, 'playing');
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
  }, [phase, updateProgress]);

  useEffect(() => {
    if (!isActive) {
      setPhase('countdown');
      setCountdown(COUNTDOWN_DURATION);
      setTime(0);
      setDifference(null);
      setIsOverTarget(false);
      startTimeRef.current = null;
      hasCompleted.current = false;
      if (progressUpdateRef.current) {
        clearTimeout(progressUpdateRef.current);
        progressUpdateRef.current = null;
      }
    } else {
      updateProgress(0, 'waiting');
    }
  }, [isActive, updateProgress]);

  const getResultColor = () => {
    if (difference === null) return 'text-white';
    if (difference < 0.1) return 'text-emerald-400';
    if (difference < 0.3) return 'text-yellow-400';
    if (difference < 0.5) return 'text-orange-400';
    return 'text-red-400';
  };

  const getResultMessage = () => {
    if (difference === null) return '';
    if (difference < 0.1) return 'PERFECT PRECISION!';
    if (difference < 0.3) return 'EXCELLENT!';
    if (difference < 0.5) return 'ACCEPTABLE!';
    if (difference < 1) return 'ADEQUATE!';
    return 'RECALIBRATION REQUIRED';
  };

  if (!isActive) {
    return (
      <div className="w-full min-h-screen flex items-center justify-center p-6">
        <p className="text-slate-400 text-xl font-mono">AWAITING SIGNAL...</p>
      </div>
    );
  }

  if (phase === 'countdown') {
    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2 font-display tracking-wider">
            PRECISION <span className="text-purple-400">PROTOCOL</span>
          </h2>
          <p className="text-slate-400 font-mono">STOP AT EXACTLY {TARGET_TIME.toFixed(6)} SECONDS</p>
        </div>

        <div className="cyber-card rounded-3xl p-10 mb-8">
          <div className="text-center">
            <p className="text-slate-400 mb-6 font-mono">TIMER INITIATING IN</p>
            <div className="w-36 h-36 rounded-full bg-gradient-to-br from-purple-600 to-emerald-500 flex items-center justify-center mx-auto animate-pulse-glow">
              <span className="text-7xl font-bold text-white font-display">{countdown}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 text-cyan-400">
          <Target className="w-6 h-6" />
          <span className="font-mono text-xl">{TARGET_TIME.toFixed(6)}s</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2 font-display tracking-wider">
          PRECISION <span className="text-purple-400">PROTOCOL</span>
        </h2>
        <p className="text-slate-400 font-mono">STOP AT EXACTLY {TARGET_TIME.toFixed(6)} SECONDS</p>
      </div>

      <div className={`cyber-card rounded-3xl p-8 mb-8 w-full max-w-sm ${
        phase === 'stopped' ? (difference && difference < 0.1 ? 'neon-border' : 'neon-border-purple') : ''
      }`}>
        {/* Target display */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <Target className="w-6 h-6 text-cyan-400" />
          <span className="text-cyan-400 font-bold font-mono">TARGET: {TARGET_TIME.toFixed(6)}s</span>
        </div>

        {/* Timer display */}
        <div className={`text-center py-10 px-4 rounded-2xl ${phase === 'stopped' ? 'bg-slate-800/50' : 'bg-slate-900/80'}`}>
          <Timer className={`w-16 h-16 mx-auto mb-6 ${
            phase === 'running' ? 'text-cyan-400 animate-pulse' : 'text-purple-400'
          }`} />
          <p className={`text-5xl font-mono font-bold tracking-wider ${phase === 'stopped' ? getResultColor() : 'text-white'}`}>
            {time.toFixed(6)}
          </p>
          <p className="text-slate-400 text-sm mt-3 font-mono">SECONDS</p>
        </div>

        {/* Result display */}
        {phase === 'stopped' && difference !== null && (
          <div className="mt-8 text-center animate-bounce-in">
            <div className={`text-2xl font-bold font-display ${getResultColor()}`}>
              {getResultMessage()}
            </div>
            <p className="text-slate-400 mt-4 font-mono">
              YOUR TIME: <span className="text-white">{time.toFixed(6)}s</span>
            </p>
            <p className="text-slate-400 mt-2 font-mono">
              DEVIATION: <span className={getResultColor()}>
                {isOverTarget ? '+' : '-'}{difference.toFixed(6)}s
              </span>
            </p>
            {difference < 0.1 && (
              <div className="flex items-center justify-center gap-2 mt-6 text-emerald-400">
                <Trophy className="w-6 h-6" />
                <span className="font-bold font-display">EXCEPTIONAL TIMING</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stop button */}
      {phase === 'running' && (
        <button
          onClick={stopTimer}
          className="tap-button w-full max-w-sm h-36 rounded-2xl font-bold text-2xl transition-all duration-100 shadow-2xl bg-gradient-to-br from-red-500 via-pink-500 to-purple-600 hover:from-red-400 hover:via-pink-400 hover:to-purple-500 text-white animate-pulse-glow flex flex-col items-center justify-center gap-2"
          aria-label="Stop timer"
          tabIndex={0}
        >
          <Zap className="w-10 h-10" />
          <span className="font-display tracking-wider">STOP!</span>
        </button>
      )}
    </div>
  );
};

export default StopTimer;
