import { useState, useEffect, useRef, useCallback } from 'react';
import { Timer, Target, Trophy } from 'lucide-react';
import { supabase, type Player } from '../lib/supabase';

type Props = {
  player: Player;
  isActive: boolean;
  onComplete: (score: number) => void;
};

const TARGET_TIME = 7.7;
const COUNTDOWN_DURATION = 5;

export default function StopTimer({ player, isActive, onComplete }: Props) {
  const [phase, setPhase] = useState<'countdown' | 'running' | 'stopped'>('countdown');
  const [countdown, setCountdown] = useState(COUNTDOWN_DURATION);
  const [time, setTime] = useState(0);
  const [difference, setDifference] = useState<number | null>(null);
  const [isOverTarget, setIsOverTarget] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const progressUpdateRef = useRef<number | null>(null);
  const hasCompleted = useRef(false);

  const updateProgress = useCallback(async (elapsed: number, status: 'waiting' | 'playing' | 'finished') => {
    try {
      const progress = status === 'finished' ? 100 : Math.min((elapsed / TARGET_TIME) * 100, 100);
      await supabase
        .from('player_progress')
        .upsert({
          player_id: player.id,
          game_session_id: player.game_session_id,
          stage: 3,
          progress,
          elapsed_time: elapsed,
          status,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'player_id,game_session_id,stage' });
    } catch (err) {
      console.error('Error updating progress:', err);
    }
  }, [player.id, player.game_session_id]);

  const stopTimer = useCallback(() => {
    if (phase !== 'running' || hasCompleted.current) return;
    hasCompleted.current = true;

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
    onComplete(diff, finalTime);
  }, [phase, time, onComplete, updateProgress]);

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
    if (difference === null) return '';
    if (difference < 0.1) return 'text-emerald-400';
    if (difference < 0.3) return 'text-yellow-400';
    if (difference < 0.5) return 'text-orange-400';
    return 'text-red-400';
  };

  const getResultMessage = () => {
    if (difference === null) return '';
    if (difference < 0.1) return 'Perfect!';
    if (difference < 0.3) return 'Great!';
    if (difference < 0.5) return 'Good!';
    if (difference < 1) return 'Not bad!';
    return 'Keep practicing!';
  };

  if (!isActive) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-slate-400 text-lg">Waiting for game to start...</p>
      </div>
    );
  }

  if (phase === 'countdown') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">Stop at {TARGET_TIME.toFixed(6)}s!</h2>
          <p className="text-slate-400">Timer will start automatically after countdown</p>
        </div>

        <div className="bg-slate-800 rounded-3xl p-8 mb-8">
          <div className="text-center">
            <p className="text-slate-400 mb-4">Get Ready!</p>
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center mx-auto animate-pulse">
              <span className="text-6xl font-bold text-white">{countdown}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Stop at {TARGET_TIME.toFixed(6)}s!</h2>
        <p className="text-slate-400">Stop the timer as close to the target as possible</p>
      </div>

      <div className="bg-slate-800 rounded-3xl p-8 mb-8 w-full max-w-xs">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Target className="w-6 h-6 text-orange-400" />
          <span className="text-orange-400 font-bold">Target: {TARGET_TIME.toFixed(6)}s</span>
        </div>

        <div className={`text-center py-8 px-4 rounded-2xl ${phase === 'stopped' ? 'bg-slate-700' : 'bg-slate-900'}`}>
          <Timer className="w-12 h-12 mx-auto mb-4 text-sky-400" />
          <p className={`text-4xl font-mono font-bold ${phase === 'stopped' ? getResultColor() : 'text-white'}`}>
            {time.toFixed(6)}
          </p>
          <p className="text-slate-400 text-sm mt-2">seconds</p>
        </div>

        {phase === 'stopped' && difference !== null && (
          <div className="mt-6 text-center animate-bounce-in">
            <div className={`text-2xl font-bold ${getResultColor()}`}>
              {getResultMessage()}
            </div>
            <p className="text-slate-400 mt-2">
              Your time: <span className="text-white font-mono">{time.toFixed(6)}s</span>
            </p>
            <p className="text-slate-400 mt-1">
              Difference: <span className={getResultColor()}>
                {isOverTarget ? '+' : '-'}{difference.toFixed(6)}s
              </span>
            </p>
            {difference < 0.1 && (
              <div className="flex items-center justify-center gap-2 mt-4 text-emerald-400">
                <Trophy className="w-5 h-5" />
                <span className="font-bold">Incredible Timing!</span>
              </div>
            )}
          </div>
        )}
      </div>

      {phase === 'running' && (
        <button
          onClick={stopTimer}
          className="tap-button w-full max-w-xs h-32 rounded-2xl font-bold text-xl transition-all duration-300 shadow-xl bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white animate-pulse-glow"
        >
          STOP!
        </button>
      )}
    </div>
  );
}
