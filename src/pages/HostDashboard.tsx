import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Users,
  Play,
  Eye,
  Loader2,
  Trophy,
  XCircle,
  Crown,
  Copy,
  Check,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import { supabase, type Player, type GameSession, type StageScore } from '../lib/supabase';

const STAGE_NAMES = ['', 'Tap to Run', 'Rock Paper Scissors', 'Stop at 7.7s'];
const ELIMINATIONS = [0, 4, 3, 0];

type PlayerWithScore = Player & { score?: number; rank?: number };

const getNextStage = (currentStage: number, enabledStages: number[]): number | null => {
  const sortedStages = [...enabledStages].sort((a, b) => a - b);
  const currentIndex = sortedStages.indexOf(currentStage);
  if (currentIndex === -1 || currentIndex === sortedStages.length - 1) {
    return null;
  }
  return sortedStages[currentIndex + 1];
};

export default function HostDashboard() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<PlayerWithScore[]>([]);
  const [scores, setScores] = useState<StageScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [processing, setProcessing] = useState(false);

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/join/${gameId}`
    : '';

  useEffect(() => {
    loadData();
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`host-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_sessions',
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          if (payload.new) {
            const newSession = payload.new as GameSession;
            setGameSession(prev => ({
              ...prev,
              ...newSession,
              enabled_stages: newSession.enabled_stages || prev?.enabled_stages || [1, 2, 3]
            } as GameSession));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `game_session_id=eq.${gameId}`,
        },
        () => {
          loadPlayers();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stage_scores',
          filter: `game_session_id=eq.${gameId}`,
        },
        () => {
          loadScores();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  const loadData = async () => {
    await Promise.all([loadSession(), loadPlayers(), loadScores()]);
    setLoading(false);
  };

  const loadSession = async () => {
    if (!gameId) return;
    const { data } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('id', gameId)
      .maybeSingle();
    if (data) setGameSession(data);
  };

  const loadPlayers = async () => {
    if (!gameId) return;
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('game_session_id', gameId)
      .order('joined_at', { ascending: true });
    if (data) setPlayers(data);
  };

  const loadScores = async () => {
    if (!gameId) return;
    const { data } = await supabase
      .from('stage_scores')
      .select('*')
      .eq('game_session_id', gameId)
      .order('created_at', { ascending: true });
    if (data) setScores(data);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startGame = async () => {
    if (!gameId || !gameSession || processing) return;
    setProcessing(true);
    try {
      const { data: freshSession } = await supabase
        .from('game_sessions')
        .select('enabled_stages')
        .eq('id', gameId)
        .maybeSingle();

      let enabledStages = freshSession?.enabled_stages;
      if (!enabledStages || !Array.isArray(enabledStages) || enabledStages.length === 0) {
        enabledStages = gameSession.enabled_stages;
      }
      if (!enabledStages || !Array.isArray(enabledStages) || enabledStages.length === 0) {
        enabledStages = [1, 2, 3];
      }

      const firstStage = Math.min(...enabledStages);
      const status = `stage${firstStage}` as GameSession['status'];

      await supabase
        .from('game_sessions')
        .update({
          status,
          current_stage: firstStage,
          updated_at: new Date().toISOString()
        })
        .eq('id', gameId);
    } finally {
      setProcessing(false);
    }
  };

  const processEliminations = async () => {
    if (!gameId || !gameSession || processing) return;
    setProcessing(true);

    try {
      const currentStage = gameSession.current_stage;
      const stageScores = scores.filter((s) => s.stage === currentStage);

      const activePlayers = players.filter((p) => !p.is_spectator && !p.is_eliminated && !p.is_kicked);
      const playersWithScores = activePlayers.map((player) => {
        const scoreRecord = stageScores.find((s) => s.player_id === player.id);
        return {
          ...player,
          score: scoreRecord?.score ?? (currentStage === 1 ? Infinity : 0),
        };
      });

      playersWithScores.sort((a, b) => {
        if (currentStage === 1 || currentStage === 3) {
          return (a.score ?? Infinity) - (b.score ?? Infinity);
        }
        return (b.score ?? 0) - (a.score ?? 0);
      });

      const eliminateCount = ELIMINATIONS[currentStage];
      const toEliminate = playersWithScores.slice(-eliminateCount);

      for (const player of toEliminate) {
        await supabase
          .from('players')
          .update({ is_eliminated: true, eliminated_at_stage: currentStage })
          .eq('id', player.id);
      }

      const nextStage = getNextStage(currentStage, gameSession.enabled_stages || [1, 2, 3]);

      if (nextStage !== null) {
        await supabase
          .from('game_sessions')
          .update({
            status: `stage${nextStage}`,
            current_stage: nextStage,
            is_ready: false,
            starts_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', gameId);
      } else {
        await supabase
          .from('game_sessions')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', gameId);
      }
    } finally {
      setProcessing(false);
    }
  };

  const activePlayerCount = players.filter((p) => !p.is_spectator && !p.is_eliminated).length;
  const spectatorCount = players.filter((p) => p.is_spectator).length;
  const currentStageScores = scores.filter((s) => s.stage === gameSession?.current_stage);
  const allPlayersFinished = activePlayerCount > 0 && currentStageScores.length >= activePlayerCount;

  const getPlayersWithScores = (): PlayerWithScore[] => {
    if (!gameSession?.current_stage) return players;

    const stageScores = scores.filter((s) => s.stage === gameSession.current_stage);

    return players.map((player) => {
      const scoreRecord = stageScores.find((s) => s.player_id === player.id);
      return { ...player, score: scoreRecord?.score };
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
      </div>
    );
  }

  if (!gameSession) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Game Not Found</h1>
          <button
            onClick={() => navigate('/')}
            className="text-sky-400 hover:text-sky-300"
          >
            Create New Game
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div className="flex items-start gap-3">
            <button
              onClick={() => navigate('/')}
              className="mt-1 p-2 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
              title="Back to Home"
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-white">Game Host Dashboard</h1>
              <p className="text-slate-400 mt-1">
                {gameSession.status === 'lobby'
                  ? 'Waiting for players to join'
                  : gameSession.status === 'completed'
                  ? 'Game completed'
                  : `Stage ${gameSession.current_stage}: ${STAGE_NAMES[gameSession.current_stage]}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg">
              <Users className="w-5 h-5 text-sky-400" />
              <span className="text-white font-bold">{activePlayerCount}/10</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-800 px-4 py-2 rounded-lg">
              <Eye className="w-5 h-5 text-emerald-400" />
              <span className="text-white font-bold">{spectatorCount}/1</span>
            </div>
          </div>
        </header>

        {gameSession.status === 'lobby' && (
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6">
              <h2 className="text-xl font-bold text-white mb-4">Join QR Code</h2>
              <div className="bg-white p-4 rounded-xl inline-block">
                <QRCodeSVG value={joinUrl} size={200} />
              </div>
              <div className="mt-4">
                <p className="text-slate-400 text-sm mb-2">Or share this link:</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={joinUrl}
                    readOnly
                    className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  />
                  <button
                    onClick={copyLink}
                    className="bg-sky-500 hover:bg-sky-600 text-white p-2 rounded-lg transition-colors"
                  >
                    {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6">
              <h2 className="text-xl font-bold text-white mb-4">Players ({activePlayerCount}/10)</h2>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {players.filter((p) => !p.is_spectator).map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center gap-3 bg-slate-700/50 rounded-lg p-2"
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-600">
                      {player.photo_url ? (
                        <img
                          src={player.photo_url}
                          alt={player.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-600 flex items-center justify-center text-white">
                          {player.name[0]}
                        </div>
                      )}
                    </div>
                    <span className="text-white">{player.name}</span>
                  </div>
                ))}
                {activePlayerCount === 0 && (
                  <p className="text-slate-400 text-center py-4">No players yet</p>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-700">
                <h3 className="text-white font-semibold mb-2">Selected Stages</h3>
                <div className="space-y-2">
                  {(gameSession.enabled_stages || [1, 2, 3]).sort().map((stageNum) => (
                    <div key={stageNum} className="flex items-center gap-2 text-slate-300 text-sm">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                        stageNum === 1 ? 'bg-sky-500/20 text-sky-400' :
                        stageNum === 2 ? 'bg-orange-500/20 text-orange-400' :
                        'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {stageNum}
                      </span>
                      <span>{STAGE_NAMES[stageNum]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {activePlayerCount >= 1 && (
                <button
                  onClick={startGame}
                  disabled={processing}
                  className="w-full mt-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {processing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Play className="w-5 h-5" />
                  )}
                  <span>Start Game</span>
                </button>
              )}
            </div>
          </div>
        )}

        {gameSession.status !== 'lobby' && gameSession.status !== 'completed' && (
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">
                Stage {gameSession.current_stage} Leaderboard
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadScores}
                  className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              {getPlayersWithScores()
                .filter((p) => !p.is_spectator && !p.is_eliminated && !p.is_kicked)
                .sort((a, b) => {
                  if (gameSession.current_stage === 1 || gameSession.current_stage === 3) {
                    return (a.score ?? Infinity) - (b.score ?? Infinity);
                  }
                  return (b.score ?? 0) - (a.score ?? 0);
                })
                .map((player, index) => (
                  <div
                    key={player.id}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      index < activePlayerCount - ELIMINATIONS[gameSession.current_stage]
                        ? 'bg-emerald-500/20 border border-emerald-500/30'
                        : 'bg-red-500/20 border border-red-500/30'
                    }`}
                  >
                    <span className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold">
                      {index + 1}
                    </span>
                    <div className="w-10 h-10 rounded-full overflow-hidden">
                      {player.photo_url ? (
                        <img
                          src={player.photo_url}
                          alt={player.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-600 flex items-center justify-center text-white">
                          {player.name[0]}
                        </div>
                      )}
                    </div>
                    <span className="flex-1 text-white font-medium">{player.name}</span>
                    {player.score !== undefined ? (
                      <span className="text-sky-400 font-bold">
                        {gameSession.current_stage === 2
                          ? player.score === 1 ? 'Win' : 'Loss'
                          : `${player.score.toFixed(2)}s`}
                      </span>
                    ) : (
                      <span className="text-slate-400">Playing...</span>
                    )}
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-slate-400">
                {currentStageScores.length}/{activePlayerCount} players finished
              </p>
              {allPlayersFinished && (
                <button
                  onClick={processEliminations}
                  disabled={processing}
                  className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-3 px-6 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  {processing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                  <span>
                    {getNextStage(gameSession.current_stage, gameSession.enabled_stages || [1, 2, 3]) !== null
                      ? `Eliminate ${ELIMINATIONS[gameSession.current_stage]} & Next Stage`
                      : 'Finish Game'}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {gameSession.status === 'completed' && (
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8 text-center">
            <Trophy className="w-20 h-20 text-yellow-400 mx-auto mb-4" />
            <h2 className="text-3xl font-bold text-white mb-6">Game Complete!</h2>

            <div className="space-y-4 max-w-md mx-auto">
              {players
                .filter((p) => !p.is_spectator && !p.is_eliminated)
                .map((player, index) => (
                  <div
                    key={player.id}
                    className={`flex items-center gap-4 p-4 rounded-xl ${
                      index === 0
                        ? 'bg-yellow-500/20 border-2 border-yellow-500'
                        : index === 1
                        ? 'bg-slate-400/20 border-2 border-slate-400'
                        : 'bg-orange-700/20 border-2 border-orange-700'
                    }`}
                  >
                    <Crown
                      className={`w-8 h-8 ${
                        index === 0
                          ? 'text-yellow-400'
                          : index === 1
                          ? 'text-slate-300'
                          : 'text-orange-600'
                      }`}
                    />
                    <div className="w-12 h-12 rounded-full overflow-hidden">
                      {player.photo_url ? (
                        <img
                          src={player.photo_url}
                          alt={player.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-600 flex items-center justify-center text-white text-xl">
                          {player.name[0]}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white font-bold text-lg">{player.name}</p>
                      <p className="text-slate-400 text-sm">
                        {index === 0 ? 'Champion' : index === 1 ? '2nd Place' : '3rd Place'}
                      </p>
                    </div>
                  </div>
                ))}
            </div>

            <button
              onClick={() => navigate('/')}
              className="mt-8 bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 px-8 rounded-xl transition-colors"
            >
              Create New Game
            </button>
          </div>
        )}

        {players.filter((p) => p.is_eliminated).length > 0 && (
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6 mt-6">
            <h3 className="text-lg font-bold text-slate-400 mb-4">Eliminated Players</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {players
                .filter((p) => p.is_eliminated)
                .map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center gap-2 bg-slate-800/50 rounded-lg p-2 opacity-60"
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden grayscale">
                      {player.photo_url ? (
                        <img
                          src={player.photo_url}
                          alt={player.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-600 flex items-center justify-center text-white text-sm">
                          {player.name[0]}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-slate-400 text-sm">{player.name}</p>
                      <p className="text-slate-500 text-xs">Stage {player.eliminated_at_stage}</p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
