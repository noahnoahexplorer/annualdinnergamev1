import { useState, useEffect, useCallback, useRef } from 'react';
import { Flag, Zap } from 'lucide-react';
import { supabase, type Player } from '../lib/supabase';

type Props = {
  player: Player;
  isActive: boolean;
  onComplete: (score: number) => void;
};

const FINISH_LINE = 100;
const DISTANCE_PER_TAP = 1;

export default function TapToRun({ player, isActive, onComplete }: Props) {
  const [position, setPosition] = useState(0);
  const [taps, setTaps] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [finalTime, setFinalTime] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const progressUpdateRef = useRef<number | null>(null);

  const updateProgress = useCallback(async (progress: number, elapsed: number, status: 'waiting' | 'playing' | 'finished') => {
    try {
      await supabase
        .from('player_progress')
        .upsert({
          player_id: player.id,
          game_session_id: player.game_session_id,
          stage: 1,
          progress,
          elapsed_time: elapsed,
          status,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'player_id,game_session_id,stage' });
    } catch (err) {
      console.error('Error updating progress:', err);
    }
  }, [player.id, player.game_session_id]);

  const handleTap = useCallback(() => {
    if (!isActive || finished) return;

    const now = Date.now();
    if (!startTime) {
      setStartTime(now);
    }

    setTaps((prev) => prev + 1);
    setPosition((prev) => {
      const newPos = Math.min(prev + DISTANCE_PER_TAP, FINISH_LINE);
      const elapsed = (now - (startTime || now)) / 1000;

      if (newPos >= FINISH_LINE && !finished) {
        const time = elapsed;
        setFinished(true);
        setFinalTime(time);
        updateProgress(100, time, 'finished');
        onComplete(time);
      } else {
        if (progressUpdateRef.current) {
          clearTimeout(progressUpdateRef.current);
        }
        progressUpdateRef.current = window.setTimeout(() => {
          updateProgress(newPos, elapsed, 'playing');
        }, 100);
      }
      return newPos;
    });
    setIsRunning(true);
    setTimeout(() => setIsRunning(false), 150);
  }, [isActive, finished, startTime, onComplete, updateProgress]);

  useEffect(() => {
    if (!isActive) {
      setPosition(0);
      setTaps(0);
      setStartTime(null);
      setFinished(false);
      setFinalTime(null);
    } else {
      updateProgress(0, 0, 'waiting');
    }
  }, [isActive, updateProgress]);

  const progressPercent = (position / FINISH_LINE) * 100;

  return (
    <div className="w-full h-full flex flex-col">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-white mb-1">Tap to Run!</h2>
        <p className="text-slate-400 text-sm">Tap as fast as you can to reach the finish line</p>
      </div>

      <div className="flex-1 flex flex-col justify-center">
        <div className="relative bg-slate-800 rounded-2xl p-4 mb-6">
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <Flag className="w-8 h-8 text-emerald-400" />
          </div>

          <div className="h-20 bg-slate-700 rounded-xl relative overflow-hidden">
            <div
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-sky-500/30 to-sky-500/10"
              style={{ width: `${progressPercent}%` }}
            />

            <div
              className={`absolute top-1/2 -translate-y-1/2 transition-all duration-100 ${isRunning ? 'animate-run' : ''}`}
              style={{ left: `calc(${progressPercent}% - 20px)` }}
            >
              {player.photo_url ? (
                <img
                  src={player.photo_url}
                  alt={player.name}
                  className="w-12 h-12 rounded-full border-2 border-sky-400 object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-sky-500 flex items-center justify-center text-white font-bold">
                  {player.name[0]}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between mt-2 text-sm">
            <span className="text-slate-400">Start</span>
            <span className="text-emerald-400">Finish</span>
          </div>
        </div>

        {finished ? (
          <div className="text-center animate-bounce-in">
            <div className="bg-emerald-500/20 border border-emerald-500/50 rounded-2xl p-6">
              <p className="text-emerald-400 text-xl font-bold mb-1">Finished!</p>
              <p className="text-white text-3xl font-bold">{finalTime?.toFixed(2)}s</p>
              <p className="text-slate-400 mt-2">{taps} taps</p>
            </div>
          </div>
        ) : isActive ? (
          <button
            onClick={handleTap}
            className="tap-button w-full h-48 bg-gradient-to-br from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 rounded-3xl flex flex-col items-center justify-center shadow-xl active:shadow-lg animate-pulse-glow"
          >
            <Zap className="w-16 h-16 text-white mb-2" />
            <span className="text-white text-2xl font-bold">TAP!</span>
            <span className="text-sky-200 text-sm mt-1">{taps} taps</span>
          </button>
        ) : (
          <div className="w-full h-48 bg-slate-700 rounded-3xl flex flex-col items-center justify-center">
            <p className="text-slate-400 text-lg">Waiting for game to start...</p>
          </div>
        )}
      </div>
    </div>
  );
}
