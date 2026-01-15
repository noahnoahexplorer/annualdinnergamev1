import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Trophy, XCircle, Clock, Users, UserX, Medal, AlertCircle } from 'lucide-react';
import { supabase, type Player, type GameSession } from '../lib/supabase';
import TapToRun from '../games/TapToRun';
import RockPaperScissors from '../games/RockPaperScissors';
import StopTimer from '../games/StopTimer';

const ELIMINATIONS: Record<number, number> = {
  1: 4,
  2: 3,
  3: 2,
};

export default function PlayerGame() {
  const { playerId } = useParams();
  const [player, setPlayer] = useState<Player | null>(null);
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [stageComplete, setStageComplete] = useState(false);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [myTime, setMyTime] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentPosition, setCurrentPosition] = useState<number | null>(null);
  const [isAdvancing, setIsAdvancing] = useState<boolean>(false);
  const [allPlayersFinished, setAllPlayersFinished] = useState<boolean>(false);
  const countdownIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    loadPlayerData();
  }, [playerId]);

  useEffect(() => {
    if (!player?.game_session_id) return;

    const channel = supabase
      .channel(`game-${player.game_session_id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${player.game_session_id}`,
        },
        (payload) => {
          if (payload.new) {
            const newSession = payload.new as GameSession;
            if (newSession.current_stage !== gameSession?.current_stage) {
              setStageComplete(false);
              setMyScore(null);
              setCurrentPosition(null);
              setIsAdvancing(false);
              setAllPlayersFinished(false);
            }
            setGameSession(newSession);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `id=eq.${playerId}`,
        },
        (payload) => {
          if (payload.new) {
            setPlayer(payload.new as Player);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [player?.game_session_id, playerId]);

  const loadPlayerData = async () => {
    if (!playerId) return;

    try {
      const { data: playerData, error: playerError } = await supabase
        .from('players')
        .select('*')
        .eq('id', playerId)
        .maybeSingle();

      if (playerError) throw playerError;
      if (!playerData) {
        setLoading(false);
        return;
      }

      setPlayer(playerData);

      const { data: sessionData, error: sessionError } = await supabase
        .from('game_sessions')
        .select('*')
        .eq('id', playerData.game_session_id)
        .maybeSingle();

      if (sessionError) throw sessionError;
      setGameSession(sessionData);
    } catch (err) {
      console.error('Error loading player data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (gameSession?.starts_at) {
      const startsAt = new Date(gameSession.starts_at).getTime();
      const now = Date.now();
      const remaining = Math.ceil((startsAt - now) / 1000);

      if (remaining > 0) {
        setCountdown(remaining);
        countdownIntervalRef.current = window.setInterval(() => {
          const newRemaining = Math.ceil((startsAt - Date.now()) / 1000);
          if (newRemaining <= 0) {
            setCountdown(null);
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
          } else {
            setCountdown(newRemaining);
          }
        }, 100);
      } else {
        setCountdown(null);
      }
    }

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [gameSession?.starts_at]);

  const calculatePosition = useCallback(async () => {
    if (!player || !gameSession || myScore === null) return;

    try {
      const { data: allPlayers } = await supabase
        .from('players')
        .select('id')
        .eq('game_session_id', gameSession.id)
        .eq('is_spectator', false)
        .eq('is_eliminated', false)
        .eq('is_kicked', false);

      const { data: playerProgress } = await supabase
        .from('player_progress')
        .select('player_id, status')
        .eq('game_session_id', gameSession.id)
        .eq('stage', gameSession.current_stage);

      const { data: scores } = await supabase
        .from('stage_scores')
        .select('player_id, score')
        .eq('game_session_id', gameSession.id)
        .eq('stage', gameSession.current_stage);

      if (!scores || !allPlayers) return;

      const activePlayerIds = new Set(allPlayers.map(p => p.id));
      const activeScores = scores.filter(s => activePlayerIds.has(s.player_id));

      const sortedScores = activeScores.sort((a, b) => {
        if (gameSession.current_stage === 1 || gameSession.current_stage === 3) {
          return a.score - b.score;
        }
        return b.score - a.score;
      });

      const position = sortedScores.findIndex(s => s.player_id === player.id) + 1;
      setCurrentPosition(position);

      const totalActivePlayers = allPlayers.length;
      const eliminationCount = ELIMINATIONS[gameSession.current_stage] || 0;
      const advancingCount = totalActivePlayers - eliminationCount;
      setIsAdvancing(position <= advancingCount);

      const playersWhoStarted = playerProgress?.filter(p =>
        p.status !== 'waiting' && activePlayerIds.has(p.player_id)
      ).length || 0;
      const allFinished = playersWhoStarted > 0 && activeScores.length === playersWhoStarted;
      setAllPlayersFinished(allFinished);
    } catch (err) {
      console.error('Error calculating position:', err);
    }
  }, [player, gameSession, myScore]);

  useEffect(() => {
    if (stageComplete && myScore !== null) {
      calculatePosition();

      const channel = supabase
        .channel(`stage-scores-${gameSession?.id}-${gameSession?.current_stage}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'stage_scores',
            filter: `game_session_id=eq.${gameSession?.id}`,
          },
          () => {
            calculatePosition();
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'player_progress',
            filter: `game_session_id=eq.${gameSession?.id}`,
          },
          () => {
            calculatePosition();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [stageComplete, myScore, gameSession?.id, gameSession?.current_stage, calculatePosition]);

  const handleGameComplete = useCallback(async (score: number, time?: number) => {
    if (!player || !gameSession || stageComplete) return;

    setStageComplete(true);
    setMyScore(score);
    if (time !== undefined) {
      setMyTime(time);
    }

    try {
      await supabase.from('stage_scores').upsert({
        player_id: player.id,
        game_session_id: gameSession.id,
        stage: gameSession.current_stage,
        score,
      }, {
        onConflict: 'player_id,game_session_id,stage'
      });
    } catch (err) {
      console.error('Error saving score:', err);
    }
  }, [player, gameSession, stageComplete]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Player Not Found</h1>
          <p className="text-slate-400">This player session may have expired.</p>
        </div>
      </div>
    );
  }

  if (player.is_kicked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center animate-bounce-in">
          <UserX className="w-20 h-20 text-red-400 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white mb-2">Kicked from Lobby</h1>
          <p className="text-slate-400 mb-4">
            You have been removed from the game by the host
          </p>
          <div className="bg-slate-800/50 rounded-xl p-6">
            <p className="text-slate-300">Sorry, {player.name}</p>
            <p className="text-slate-400 text-sm mt-2">
              Please contact the game host if you believe this was a mistake.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (player.is_eliminated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center animate-bounce-in">
          <XCircle className="w-20 h-20 text-red-400 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white mb-2">Eliminated</h1>
          <p className="text-slate-400 mb-4">
            You were eliminated in Stage {player.eliminated_at_stage}
          </p>
          <div className="bg-slate-800/50 rounded-xl p-6">
            <p className="text-slate-300">Thanks for playing, {player.name}!</p>
            <p className="text-slate-400 text-sm mt-2">
              You can continue watching as a spectator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!gameSession || gameSession.status === 'lobby') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center animate-bounce-in">
          <div className="w-24 h-24 rounded-full bg-slate-700 border-4 border-sky-500 mx-auto mb-6 overflow-hidden">
            {player.photo_url ? (
              <img
                src={player.photo_url}
                alt={player.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-3xl font-bold">
                {player.name[0]}
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Welcome, {player.name}!</h1>

          {gameSession?.is_ready ? (
            <>
              <div className="mb-8 p-6 bg-gradient-to-r from-emerald-500/20 to-sky-500/20 border-2 border-emerald-500 rounded-2xl animate-pulse">
                <p className="text-3xl font-bold text-emerald-400 mb-2">Get Ready!</p>
                <p className="text-slate-300">The game is about to start...</p>
              </div>
              <div className="flex items-center justify-center gap-2 text-emerald-400">
                <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
                <span className="font-semibold">Starting soon...</span>
              </div>
            </>
          ) : (
            <>
              <p className="text-slate-400 mb-8">Waiting for the host to start the game...</p>
              <div className="flex items-center justify-center gap-2 text-sky-400">
                <Clock className="w-5 h-5 animate-pulse" />
                <span>Game will begin soon</span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (gameSession.status === 'completed') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center animate-bounce-in">
          <Trophy className="w-20 h-20 text-yellow-400 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white mb-2">Game Complete!</h1>
          <p className="text-slate-400 mb-4">Congratulations on making it to the final!</p>
          <div className="bg-slate-800/50 rounded-xl p-6">
            <p className="text-emerald-400 font-bold text-xl">You're a Champion!</p>
          </div>
        </div>
      </div>
    );
  }

  const isGameActive = gameSession.current_stage > 0 &&
    ['stage1', 'stage2', 'stage3'].includes(gameSession.status) &&
    countdown === null;

  const renderGame = () => {
    if (stageComplete) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="bg-slate-800/80 backdrop-blur rounded-2xl p-8 text-center animate-bounce-in max-w-md w-full">
            <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-2">Stage Complete!</h2>

            {currentPosition !== null && (
              <div className="my-6">
                <div className={`inline-flex items-center justify-center w-32 h-32 rounded-full text-6xl font-bold mb-4 ${
                  currentPosition === 1
                    ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-yellow-900 shadow-2xl shadow-yellow-500/50'
                    : currentPosition === 2
                    ? 'bg-gradient-to-br from-slate-300 to-slate-400 text-slate-700 shadow-2xl shadow-slate-400/50'
                    : currentPosition === 3
                    ? 'bg-gradient-to-br from-orange-500 to-orange-700 text-orange-100 shadow-2xl shadow-orange-500/50'
                    : 'bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-xl'
                }`}>
                  {currentPosition}
                </div>
                <p className="text-slate-300 text-lg mb-2">
                  Your Position
                </p>
              </div>
            )}

            <p className="text-slate-400 mb-6">
              {gameSession?.current_stage === 3 ? (
                <>
                  You stopped at: <span className="text-sky-400 font-bold">{myTime?.toFixed(6)}s</span>
                  <br />
                  <span className="text-sm">({myScore?.toFixed(6)}s off target)</span>
                </>
              ) : (
                <>
                  Your score: <span className="text-sky-400 font-bold">
                    {gameSession?.current_stage === 2
                      ? `${myScore}pts ${myTime !== null ? myTime.toFixed(2) : '0.00'}s`
                      : `${myScore?.toFixed(2)}s`}
                  </span>
                </>
              )}
            </p>

            {currentPosition !== null && (
              <div className={`p-4 rounded-xl mb-4 ${
                isAdvancing
                  ? 'bg-emerald-500/20 border-2 border-emerald-500'
                  : 'bg-red-500/20 border-2 border-red-500'
              }`}>
                {isAdvancing ? (
                  <div className="flex items-center justify-center gap-2">
                    <Medal className="w-6 h-6 text-emerald-400" />
                    <span className="text-emerald-400 font-bold text-lg">
                      Advancing to Next Stage!
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                    <span className="text-red-400 font-bold text-lg">
                      Eliminated
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-center gap-2 text-slate-300">
              {!allPlayersFinished ? (
                <>
                  <Users className="w-5 h-5" />
                  <span>{currentPosition !== null ? 'Waiting for all players to finish...' : 'Calculating position...'}</span>
                </>
              ) : (
                <>
                  {isAdvancing ? (
                    <>
                      <Trophy className="w-5 h-5 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">Get ready for the next stage!</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5 text-red-400" />
                      <span className="text-red-400 font-semibold">You have been eliminated from the game</span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      );
    }

    switch (gameSession?.current_stage) {
      case 1:
        return (
          <div className="flex-1 p-6">
            <TapToRun
              player={player}
              isActive={isGameActive}
              onComplete={handleGameComplete}
            />
          </div>
        );
      case 2:
        return (
          <div className="flex-1 p-6">
            <RockPaperScissors
              player={player}
              isActive={isGameActive}
              onComplete={handleGameComplete}
            />
          </div>
        );
      case 3:
        return (
          <div className="flex-1 p-6">
            <StopTimer
              player={player}
              isActive={isGameActive}
              onComplete={handleGameComplete}
            />
          </div>
        );
      default:
        return (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-slate-400">Preparing next stage...</p>
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-800/50 backdrop-blur border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-sky-500">
              {player.photo_url ? (
                <img
                  src={player.photo_url}
                  alt={player.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-sky-500 flex items-center justify-center text-white font-bold">
                  {player.name[0]}
                </div>
              )}
            </div>
            <span className="text-white font-semibold">{player.name}</span>
          </div>
          <div className="bg-sky-500/20 text-sky-400 px-3 py-1 rounded-full text-sm font-bold">
            Stage {gameSession?.current_stage || 0}
          </div>
        </div>
      </header>

      {renderGame()}

      {countdown !== null && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="text-center animate-bounce-in">
            <p className="text-slate-400 text-xl mb-4">Get Ready!</p>
            <div className="w-36 h-36 rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center mx-auto shadow-2xl shadow-sky-500/30">
              <span className="text-white text-6xl font-bold">{countdown}</span>
            </div>
            <p className="text-white text-xl font-bold mt-6">Stage {gameSession?.current_stage}</p>
          </div>
        </div>
      )}
    </div>
  );
}
