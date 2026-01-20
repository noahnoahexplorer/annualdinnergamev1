import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Loader2, Play, Users, Trophy, QrCode, Copy, Check, XCircle, 
  Crown, RefreshCw, UserX, Radio, ArrowRight, Eye, Zap, Target, Timer, SkipForward
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase, TABLES, type Player, type GameSession, type StageScore, type PlayerProgress } from '../lib/supabase';
import { STAGE_CODENAMES, ELIMINATIONS } from '../lib/constants';

const STAGE_NAMES = ['', 'Speed Protocol', 'Prediction Matrix', 'Precision Protocol'];
const STAGE_ICONS = [null, Zap, Target, Timer];

const HostDashboard = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<StageScore[]>([]);
  const [progress, setProgress] = useState<PlayerProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [processing, setProcessing] = useState(false);

  const loadProgress = useCallback(async () => {
    if (!gameId) return;
    const { data } = await supabase
      .from(TABLES.playerProgress)
      .select('*')
      .eq('game_session_id', gameId);
    if (data) setProgress(data);
  }, [gameId]);

  const loadScores = useCallback(async () => {
    if (!gameId) return;
    const { data } = await supabase
      .from(TABLES.stageScores)
      .select('*')
      .eq('game_session_id', gameId)
      .order('stage', { ascending: true })
      .order('score', { ascending: true });
    if (data) setScores(data);
  }, [gameId]);

  const loadPlayers = useCallback(async () => {
    if (!gameId) return;
    const { data } = await supabase
      .from(TABLES.players)
      .select('*')
      .eq('game_session_id', gameId)
      .order('joined_at', { ascending: true });
    if (data) setPlayers(data);
  }, [gameId]);

  const loadData = useCallback(async () => {
    if (!gameId) return;

    const { data: sessionData } = await supabase
      .from(TABLES.gameSessions)
      .select('*')
      .eq('id', gameId)
      .maybeSingle();

    if (!sessionData) {
      navigate('/');
      return;
    }

    setGameSession(sessionData);
    await Promise.all([loadPlayers(), loadScores(), loadProgress()]);
    setLoading(false);
  }, [gameId, navigate, loadPlayers, loadScores, loadProgress]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time subscriptions - Use payload directly to avoid refetch cascade
  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`host-${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.gameSessions, filter: `id=eq.${gameId}` },
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
        { event: '*', schema: 'public', table: TABLES.players, filter: `game_session_id=eq.${gameId}` },
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
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.stageScores, filter: `game_session_id=eq.${gameId}` },
        (payload) => {
          // Use payload directly instead of refetching
          if (payload.eventType === 'INSERT' && payload.new) {
            setScores(prev => [...prev, payload.new as StageScore]);
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            setScores(prev => prev.map(s => s.id === (payload.new as StageScore).id ? payload.new as StageScore : s));
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setScores(prev => prev.filter(s => s.id !== (payload.old as StageScore).id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.playerProgress, filter: `game_session_id=eq.${gameId}` },
        (payload) => {
          // Use payload directly instead of refetching
          if (payload.eventType === 'INSERT' && payload.new) {
            setProgress(prev => [...prev, payload.new as PlayerProgress]);
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const newProg = payload.new as PlayerProgress;
            setProgress(prev => {
              const existing = prev.findIndex(p => p.id === newProg.id);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = newProg;
                return updated;
              }
              return [...prev, newProg];
            });
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setProgress(prev => prev.filter(p => p.id !== (payload.old as PlayerProgress).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  const joinUrl = `${window.location.origin}/join/${gameId}`;

  const copyLink = async () => {
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const kickPlayer = async (playerId: string) => {
    try {
      await supabase
        .from(TABLES.players)
        .update({ is_kicked: true })
        .eq('id', playerId);
    } catch (err) {
      console.error('Error kicking player:', err);
    }
  };

  const openSpectatorView = () => {
    window.open(`/spectator/${gameId}`, '_blank');
  };

  const processEliminations = async () => {
    if (!gameSession || processing) return;

    setProcessing(true);
    const stage = gameSession.current_stage;
    const eliminationCount = ELIMINATIONS[stage] || 0;

    const activePlayers = players.filter(p => !p.is_spectator && !p.is_eliminated && !p.is_kicked);
    const stageScores = scores.filter(s => s.stage === stage);
    const stageProgress = progress.filter(p => p.stage === stage);

    type PlayerWithScore = {
      id: string;
      score: number | undefined;
      status: string | undefined;
      elapsedTime: number;
    };

    const playersWithScores: PlayerWithScore[] = activePlayers.map(p => {
      const scoreRecord = stageScores.find(s => s.player_id === p.id);
      const progressRecord = stageProgress.find(pr => pr.player_id === p.id);
      return {
        id: p.id,
        score: scoreRecord?.score,
        status: progressRecord?.status,
        elapsedTime: progressRecord?.elapsed_time ?? 0
      };
    });

    playersWithScores.sort((a, b) => {
      if (stage === 1 || stage === 3) {
        const aFinished = a.status === 'finished';
        const bFinished = b.status === 'finished';
        if (aFinished && bFinished) return (a.score ?? Infinity) - (b.score ?? Infinity);
        if (aFinished) return -1;
        if (bFinished) return 1;
        return (a.score ?? Infinity) - (b.score ?? Infinity);
      } else if (stage === 2) {
        const aFinished = a.status === 'finished';
        const bFinished = b.status === 'finished';
        if (aFinished && bFinished) {
          if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
          return a.elapsedTime - b.elapsedTime;
        }
        if (aFinished) return -1;
        if (bFinished) return 1;
        return (b.score ?? 0) - (a.score ?? 0);
      }
      return 0;
    });

    const playersToEliminate = playersWithScores.slice(-eliminationCount);

    try {
      for (const player of playersToEliminate) {
        await supabase
          .from(TABLES.players)
          .update({
            is_eliminated: true,
            eliminated_at_stage: stage
          })
          .eq('id', player.id);
      }

      const enabledStages = gameSession.enabled_stages || [1, 2, 3];
      const currentIndex = enabledStages.indexOf(stage);
      const nextStageIndex = currentIndex + 1;

      if (nextStageIndex < enabledStages.length) {
        const nextStage = enabledStages[nextStageIndex];
        await supabase
          .from(TABLES.gameSessions)
          .update({
            status: `stage${nextStage}` as GameSession['status'],
            current_stage: nextStage,
            starts_at: new Date(Date.now() + 5000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', gameId);
      } else {
        await supabase
          .from(TABLES.gameSessions)
          .update({
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', gameId);
      }
    } catch (err) {
      console.error('Error processing eliminations:', err);
    } finally {
      setProcessing(false);
    }
  };

  const skipToNextStage = async () => {
    if (!gameSession || processing) return;

    setProcessing(true);
    const stage = gameSession.current_stage;

    try {
      const enabledStages = gameSession.enabled_stages || [1, 2, 3];
      const currentIndex = enabledStages.indexOf(stage);
      const nextStageIndex = currentIndex + 1;

      if (nextStageIndex < enabledStages.length) {
        const nextStage = enabledStages[nextStageIndex];
        await supabase
          .from(TABLES.gameSessions)
          .update({
            status: `stage${nextStage}` as GameSession['status'],
            current_stage: nextStage,
            starts_at: new Date(Date.now() + 5000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', gameId);
      } else {
        await supabase
          .from(TABLES.gameSessions)
          .update({
            status: 'completed',
            updated_at: new Date().toISOString()
          })
          .eq('id', gameId);
      }
    } catch (err) {
      console.error('Error skipping stage:', err);
    } finally {
      setProcessing(false);
    }
  };

  const resetGame = async () => {
    if (!confirm('RESET PROTOCOL? ALL PROGRESS WILL BE LOST.')) return;

    try {
      await supabase.from(TABLES.stageScores).delete().eq('game_session_id', gameId);
      await supabase.from(TABLES.playerProgress).delete().eq('game_session_id', gameId);
      await supabase
        .from(TABLES.players)
        .update({ is_eliminated: false, eliminated_at_stage: null })
        .eq('game_session_id', gameId);
      await supabase
        .from(TABLES.gameSessions)
        .update({
          status: 'lobby',
          current_stage: 0,
          is_ready: false,
          starts_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', gameId);
    } catch (err) {
      console.error('Error resetting game:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center cyber-bg">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (!gameSession) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 cyber-bg">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white font-display">PROTOCOL NOT FOUND</h1>
        </div>
      </div>
    );
  }

  const activePlayers = players.filter(p => !p.is_spectator && !p.is_kicked);
  const activeNonEliminated = activePlayers.filter(p => !p.is_eliminated);
  const spectators = players.filter(p => p.is_spectator && !p.is_kicked);
  const isLive = ['stage1', 'stage2', 'stage3'].includes(gameSession.status);

  const allPlayersFinished = () => {
    const stageProgress = progress.filter(p => p.stage === gameSession.current_stage);
    return activeNonEliminated.every(player => {
      const playerProgress = stageProgress.find(p => p.player_id === player.id);
      return playerProgress?.status === 'finished';
    });
  };

  const StageIcon = gameSession.current_stage > 0 ? STAGE_ICONS[gameSession.current_stage] : null;

  return (
    <div className="min-h-screen p-6 cyber-bg relative">
      <div className="grid-overlay" />
      
      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 text-purple-400 mb-1">
              <Crown className="w-5 h-5" />
              <span className="font-bold font-display tracking-wider">GENESIS CONTROL</span>
              {isLive && (
                <span className="flex items-center gap-1 bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full text-xs font-bold ml-2 font-mono">
                  <Radio className="w-3 h-3 animate-pulse" />
                  LIVE
                </span>
              )}
            </div>
            <h1 className="text-3xl font-bold text-white font-display tracking-wider">
              {gameSession.status === 'lobby'
                ? 'AWAITING CANDIDATES'
                : gameSession.status === 'completed'
                ? 'PROTOCOL COMPLETE'
                : `ROUND 0${gameSession.current_stage}`}
            </h1>
            {isLive && (
              <p className="text-slate-400 font-mono">{STAGE_CODENAMES[gameSession.current_stage]}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={openSpectatorView}
              className="cyber-btn-secondary flex items-center gap-2 px-4 py-2 rounded-lg"
            >
              <Eye className="w-5 h-5" />
              <span className="font-mono">SPECTATE</span>
            </button>
            <button
              onClick={resetGame}
              className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 px-4 py-2 rounded-lg transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              <span className="font-mono">RESET</span>
            </button>
          </div>
        </header>

        <div className="grid grid-cols-3 gap-6">
          {/* Left Column - Players */}
          <div className="col-span-2 space-y-6">
            {/* Active Players */}
            <div className="cyber-card rounded-2xl p-6 neon-border">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-cyan-400" />
                  <h2 className="text-lg font-bold text-white font-display">CANDIDATES</h2>
                </div>
                <span className="text-cyan-400 font-mono">{activeNonEliminated.length}/{activePlayers.length}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {activePlayers.map((player) => {
                  const playerProgress = progress.find(p => p.player_id === player.id && p.stage === gameSession.current_stage);
                  const playerScore = scores.find(s => s.player_id === player.id && s.stage === gameSession.current_stage);

                  return (
                    <div
                      key={player.id}
                      className={`player-card flex items-center gap-3 p-3 rounded-xl group ${
                        player.is_eliminated ? 'eliminated' : ''
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0" style={{ borderColor: player.avatar_color, borderWidth: 2 }}>
                        {player.photo_url ? (
                          <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white" style={{ backgroundColor: player.avatar_color }}>
                            {player.name[0]}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium truncate font-mono">{player.name}</p>
                        <p className={`text-xs font-mono ${
                          player.is_eliminated
                            ? 'text-red-400'
                            : playerProgress?.status === 'finished'
                            ? 'text-emerald-400'
                            : playerProgress?.status === 'playing'
                            ? 'text-cyan-400'
                            : 'text-slate-400'
                        }`}>
                          {player.is_eliminated
                            ? `TERMINATED @ ROUND 0${player.eliminated_at_stage}`
                            : playerProgress?.status === 'finished'
                            ? `COMPLETE: ${gameSession.current_stage === 2 ? `${playerScore?.score || 0}pts` : `${playerScore?.score?.toFixed(2) || '--'}s`}`
                            : playerProgress?.status === 'playing'
                            ? 'IN PROGRESS...'
                            : 'STANDBY'}
                        </p>
                      </div>
                      {!player.is_eliminated && gameSession.status === 'lobby' && (
                        <button
                          onClick={() => kickPlayer(player.id)}
                          className="opacity-0 group-hover:opacity-100 p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-all"
                          title="Terminate candidate"
                        >
                          <UserX className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stage Controls */}
            {isLive && (
              <div className="cyber-card rounded-2xl p-6 neon-border-purple">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    {StageIcon && <StageIcon className="w-5 h-5 text-purple-400" />}
                    <h2 className="text-lg font-bold text-white font-display">TRIAL CONTROLS</h2>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={processEliminations}
                    disabled={processing || !allPlayersFinished()}
                    className="cyber-btn flex items-center justify-center gap-2 py-3 rounded-lg disabled:opacity-50"
                  >
                    <ArrowRight className="w-5 h-5" />
                    <span className="font-display">
                      {processing ? 'PROCESSING...' : 'NEXT TRIAL'}
                    </span>
                  </button>
                  <button
                    onClick={skipToNextStage}
                    disabled={processing}
                    className="cyber-btn-secondary flex items-center justify-center gap-2 py-3 rounded-lg disabled:opacity-50"
                  >
                    <SkipForward className="w-5 h-5" />
                    <span className="font-display">SKIP</span>
                  </button>
                </div>

                <div className="mt-4 bg-slate-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400 font-mono">CANDIDATES FINISHED</span>
                    <span className="text-white font-mono">
                      {progress.filter(p => p.stage === gameSession.current_stage && p.status === 'finished').length} / {activeNonEliminated.length}
                    </span>
                  </div>
                  <div className="progress-bar mt-2">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${(progress.filter(p => p.stage === gameSession.current_stage && p.status === 'finished').length / activeNonEliminated.length) * 100}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - QR & Info */}
          <div className="space-y-6">
            {/* QR Code */}
            <div className="cyber-card rounded-2xl p-6 neon-border-magenta text-center">
              <h2 className="text-lg font-bold text-white mb-4 font-display">JOIN PROTOCOL</h2>
              <div className="qr-container inline-block mb-4">
                <QRCodeSVG value={joinUrl} size={180} />
              </div>
              <button
                onClick={copyLink}
                className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition-colors font-mono text-sm"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'COPIED!' : 'COPY LINK'}</span>
              </button>
            </div>

            {/* Stage Progress */}
            <div className="cyber-card rounded-2xl p-6">
              <h2 className="text-lg font-bold text-white mb-4 font-display">TRIAL SEQUENCE</h2>
              <div className="space-y-3">
                {(gameSession.enabled_stages || [1, 2, 3]).map((stageNum) => {
                  const isActive = gameSession.current_stage === stageNum;
                  const isComplete = gameSession.current_stage > stageNum || gameSession.status === 'completed';
                  const Icon = STAGE_ICONS[stageNum];

                  return (
                    <div
                      key={stageNum}
                      className={`flex items-center gap-3 p-3 rounded-lg ${
                        isActive ? 'bg-purple-500/20 border border-purple-500/50' :
                        isComplete ? 'bg-emerald-500/10 border border-emerald-500/30' :
                        'bg-slate-800/50'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        isActive ? 'bg-purple-500 text-white' :
                        isComplete ? 'bg-emerald-500 text-white' :
                        'bg-slate-700 text-slate-400'
                      }`}>
                        {isComplete ? <Check className="w-4 h-4" /> : Icon && <Icon className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <p className={`font-mono text-xs ${isActive ? 'text-purple-400' : isComplete ? 'text-emerald-400' : 'text-slate-500'}`}>
                          ROUND 0{stageNum}
                        </p>
                        <p className={`font-display ${isActive || isComplete ? 'text-white' : 'text-slate-400'}`}>
                          {STAGE_CODENAMES[stageNum]}
                        </p>
                      </div>
                      {isActive && (
                        <span className="flex items-center gap-1 text-purple-400 text-xs font-mono">
                          <Radio className="w-3 h-3 animate-pulse" />
                          LIVE
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Spectators */}
            {spectators.length > 0 && (
              <div className="cyber-card rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Eye className="w-5 h-5 text-pink-400" />
                  <h2 className="text-lg font-bold text-white font-display">OBSERVERS</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {spectators.map((spectator) => (
                    <span key={spectator.id} className="bg-slate-700 text-slate-300 px-3 py-1 rounded-full text-sm font-mono">
                      {spectator.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostDashboard;
