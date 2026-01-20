import { useState, useEffect, useCallback, useRef } from 'react';
import { Flag, Zap, Trophy } from 'lucide-react';
import { supabase, TABLES, type Player, type GameSession } from '../lib/supabase';

type Props = {
  player: Player;
  gameSession: GameSession;
};

const FINISH_LINE = 100;
const DISTANCE_PER_TAP = 1;

const TapToRun = ({ player, gameSession }: Props) => {
  const [position, setPosition] = useState(0);
  const [taps, setTaps] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [finalTime, setFinalTime] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const progressUpdateRef = useRef<number | null>(null);
  const hasCompleted = useRef(false);
  const isActive = gameSession.current_stage === 1;

  const updateProgress = useCallback(async (progress: number, elapsed: number, status: 'waiting' | 'playing' | 'finished') => {
    try {
      await supabase
        .from(TABLES.playerProgress)
        .upsert({
          player_id: player.id,
          game_session_id: player.game_session_id,
          stage: 1,
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

  const saveScore = useCallback(async (time: number) => {
    if (hasCompleted.current) return;
    hasCompleted.current = true;

    try {
      await supabase
        .from(TABLES.stageScores)
        .upsert({
          player_id: player.id,
          game_session_id: player.game_session_id,
          stage: 1,
          score: time,
          time_taken: time,
        }, { onConflict: 'player_id,game_session_id,stage' });
    } catch (err) {
      console.error('Error saving score:', err);
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
        saveScore(time);
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
  }, [isActive, finished, startTime, updateProgress, saveScore]);

  useEffect(() => {
    if (!isActive) {
      setPosition(0);
      setTaps(0);
      setStartTime(null);
      setFinished(false);
      setFinalTime(null);
      hasCompleted.current = false;
    } else {
      updateProgress(0, 0, 'waiting');
    }
  }, [isActive, updateProgress]);

  const progressPercent = (position / FINISH_LINE) * 100;

  return (
    <div className="w-full min-h-screen flex flex-col p-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2 font-display tracking-wider">
          SPEED <span className="text-cyan-400">PROTOCOL</span>
        </h2>
        <p className="text-slate-400 font-mono">TAP AS FAST AS POSSIBLE TO REACH THE FINISH LINE</p>
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-lg mx-auto w-full">
        {/* Race Track */}
        <div className="relative cyber-card rounded-2xl p-6 mb-8 neon-border">
          <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <Flag className="w-8 h-8 text-emerald-400" />
            <span className="text-xl">🏁</span>
          </div>

          <div className="h-24 bg-slate-800/80 rounded-xl relative overflow-hidden border border-slate-700">
            {/* Progress bar */}
            <div
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-cyan-500/30 via-purple-500/30 to-pink-500/30"
              style={{ width: `${progressPercent}%` }}
            />

            {/* Track lines */}
            <div className="absolute inset-0 flex items-center">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex-1 border-r border-dashed border-slate-600/30 h-full" />
              ))}
            </div>

            {/* Player avatar */}
            <div
              className={`absolute top-1/2 -translate-y-1/2 transition-all duration-100 ${isRunning ? 'animate-run scale-110' : ''}`}
              style={{ left: `calc(${progressPercent}% - 24px)`, zIndex: 10 }}
            >
              <div className="relative">
                {player.photo_url ? (
                  <img
                    src={player.photo_url}
                    alt={player.name}
                    className="w-14 h-14 rounded-full border-3 object-cover"
                    style={{ borderColor: player.avatar_color }}
                  />
                ) : (
                  <div 
                    className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold"
                    style={{ backgroundColor: player.avatar_color }}
                  >
                    {player.name[0]}
                  </div>
                )}
                {isRunning && (
                  <div className="absolute -right-2 top-1/2 -translate-y-1/2">
                    <Zap className="w-5 h-5 text-yellow-400 animate-pulse" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-between mt-3 text-sm font-mono">
            <span className="text-slate-400">START</span>
            <span className="text-cyan-400">{progressPercent.toFixed(0)}%</span>
            <span className="text-emerald-400">FINISH</span>
          </div>
        </div>

        {/* Tap Button or Results */}
        {finished ? (
          <div className="text-center animate-bounce-in">
            <div className="cyber-card rounded-2xl p-8 neon-border">
              <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
              <p className="text-emerald-400 text-2xl font-bold mb-2 font-display">PROTOCOL COMPLETE</p>
              <p className="text-white text-4xl font-bold font-mono">{finalTime?.toFixed(2)}s</p>
              <div className="mt-4 flex items-center justify-center gap-4 text-slate-400">
                <span className="font-mono">{taps} TAPS</span>
                <span>•</span>
                <span className="font-mono">{taps && finalTime ? (taps / finalTime).toFixed(1) : 0} TPS</span>
              </div>
            </div>
          </div>
        ) : isActive ? (
          <button
            onClick={handleTap}
            className="tap-button w-full h-56 bg-gradient-to-br from-purple-600 via-pink-500 to-cyan-500 hover:from-purple-500 hover:via-pink-400 hover:to-cyan-400 rounded-3xl flex flex-col items-center justify-center shadow-2xl active:shadow-lg transition-all duration-100 neon-border"
            aria-label="Tap to run"
            tabIndex={0}
          >
            <Zap className="w-20 h-20 text-white mb-3" />
            <span className="text-white text-3xl font-bold font-display tracking-wider">TAP!</span>
            <span className="text-white/80 text-lg mt-2 font-mono">{taps} TAPS</span>
          </button>
        ) : (
          <div className="w-full h-56 cyber-card rounded-3xl flex flex-col items-center justify-center">
            <p className="text-slate-400 text-xl font-mono">AWAITING SIGNAL...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TapToRun;
