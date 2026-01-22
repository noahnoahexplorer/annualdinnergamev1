import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Clock, Trophy, XCircle, Users, Crown, Radio, CheckCircle, Zap, Target, Timer } from 'lucide-react';
import { supabase, TABLES, type Player, type GameSession, type StageScore, type PlayerProgress } from '../lib/supabase';
import { STAGE_CODENAMES, ELIMINATIONS, GenesisState } from '../lib/constants';
import TapToRun from '../games/TapToRun';
import RockPaperScissors from '../games/RockPaperScissors';
import StopTimer from '../games/StopTimer';

const STAGE_NAMES = ['', 'Speed Protocol', 'Prediction Matrix', 'Precision Protocol'];
const STAGE_ICONS = ['', '⚡', '🎯', '⏱️'];

const PlayerGame = () => {
  const { playerId } = useParams();
  const navigate = useNavigate();
  const [player, setPlayer] = useState<Player | null>(null);
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [allScores, setAllScores] = useState<StageScore[]>([]);
  const [allProgress, setAllProgress] = useState<PlayerProgress[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);

  const loadScores = useCallback(async () => {
    if (!gameSession?.id) return;
    const { data } = await supabase
      .from(TABLES.stageScores)
      .select('*')
      .eq('game_session_id', gameSession.id)
      .order('created_at', { ascending: true });
    if (data) setAllScores(data);
  }, [gameSession?.id]);

  const loadProgress = useCallback(async () => {
    if (!gameSession?.id) return;
    const { data } = await supabase
      .from(TABLES.playerProgress)
      .select('*')
      .eq('game_session_id', gameSession.id);
    if (data) setAllProgress(data);
  }, [gameSession?.id]);

  const loadAllPlayers = useCallback(async () => {
    if (!gameSession?.id) return;
    const { data } = await supabase
      .from(TABLES.players)
      .select('*')
      .eq('game_session_id', gameSession.id);
    if (data) setAllPlayers(data);
  }, [gameSession?.id]);

  const loadData = useCallback(async () => {
    if (!playerId) return;

    try {
      const { data: playerData } = await supabase
        .from(TABLES.players)
        .select('*')
        .eq('id', playerId)
        .maybeSingle();

      if (!playerData) {
        navigate('/');
        return;
      }

      setPlayer(playerData);

      const { data: sessionData } = await supabase
        .from(TABLES.gameSessions)
        .select('*')
        .eq('id', playerData.game_session_id)
        .maybeSingle();

      if (sessionData) {
        setGameSession(sessionData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [playerId, navigate]);

  const calculatePosition = useCallback(() => {
    if (!gameSession?.current_stage || !player) return;

    const stage = gameSession.current_stage;
    const stageScores = allScores.filter(s => s.stage === stage);
    const stageProgress = allProgress.filter(p => p.stage === stage);
    const activePlayers = allPlayers.filter(p => !p.is_spectator && !p.is_eliminated && !p.is_kicked);

    type PlayerWithData = {
      id: string;
      score?: number;
      progress?: number;
      elapsedTime?: number;
      status?: string;
    };

    const playersWithData: PlayerWithData[] = activePlayers.map(p => {
      const scoreRecord = stageScores.find(s => s.player_id === p.id);
      const progressRecord = stageProgress.find(pr => pr.player_id === p.id);
      return {
        id: p.id,
        score: scoreRecord?.score,
        progress: progressRecord?.progress,
        elapsedTime: progressRecord?.elapsed_time,
        status: progressRecord?.status
      };
    });

    playersWithData.sort((a, b) => {
      if (stage === 1 || stage === 3) {
        const aFinished = a.status === 'finished';
        const bFinished = b.status === 'finished';
        if (aFinished && bFinished) return (a.score ?? Infinity) - (b.score ?? Infinity);
        if (aFinished) return -1;
        if (bFinished) return 1;
        return (b.progress ?? 0) - (a.progress ?? 0);
      } else if (stage === 2) {
        const aFinished = a.status === 'finished';
        const bFinished = b.status === 'finished';
        if (aFinished && bFinished) {
          if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
          return (a.elapsedTime ?? 999) - (b.elapsedTime ?? 999);
        }
        if (aFinished) return -1;
        if (bFinished) return 1;
        return (b.score ?? 0) - (a.score ?? 0);
      }
      return 0;
    });

    const rank = playersWithData.findIndex(p => p.id === player.id) + 1;
    setMyRank(rank > 0 ? rank : null);
  }, [gameSession?.current_stage, player, allScores, allProgress, allPlayers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (gameSession?.id) {
      loadAllPlayers();
      loadScores();
      loadProgress();
    }
  }, [gameSession?.id, loadAllPlayers, loadScores, loadProgress]);

  useEffect(() => {
    calculatePosition();
  }, [calculatePosition]);

  useEffect(() => {
    if (gameSession?.starts_at) {
      const startsAt = new Date(gameSession.starts_at).getTime();
      const now = Date.now();
      const remaining = Math.ceil((startsAt - now) / 1000);

      if (remaining > 0) {
        setCountdown(remaining);
        const interval = setInterval(() => {
          const newRemaining = Math.ceil((startsAt - Date.now()) / 1000);
          if (newRemaining <= 0) {
            setCountdown(null);
            clearInterval(interval);
          } else {
            setCountdown(newRemaining);
          }
        }, 100);
        return () => clearInterval(interval);
      } else {
        setCountdown(null);
      }
    }
  }, [gameSession?.starts_at]);

  // Real-time subscriptions - Use payload directly to avoid refetch cascade
  useEffect(() => {
    if (!player?.game_session_id || !gameSession?.id) return;

    const channel = supabase
      .channel(`player-${playerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.gameSessions, filter: `id=eq.${gameSession.id}` },
        (payload) => {
          if (payload.new) setGameSession(payload.new as GameSession);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.players, filter: `id=eq.${playerId}` },
        (payload) => {
          if (payload.new) setPlayer(payload.new as Player);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.stageScores, filter: `game_session_id=eq.${gameSession.id}` },
        (payload) => {
          // Use payload directly instead of refetching
          if (payload.eventType === 'INSERT' && payload.new) {
            setAllScores(prev => [...prev, payload.new as StageScore].sort((a, b) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            setAllScores(prev => prev.map(s => s.id === (payload.new as StageScore).id ? payload.new as StageScore : s));
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setAllScores(prev => prev.filter(s => s.id !== (payload.old as StageScore).id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLES.playerProgress, filter: `game_session_id=eq.${gameSession.id}` },
        (payload) => {
          // Use payload directly instead of refetching
          if (payload.eventType === 'INSERT' && payload.new) {
            setAllProgress(prev => [...prev, payload.new as PlayerProgress]);
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            const newProg = payload.new as PlayerProgress;
            setAllProgress(prev => {
              const existing = prev.findIndex(p => p.id === newProg.id);
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = newProg;
                return updated;
              }
              return [...prev, newProg];
            });
          } else if (payload.eventType === 'DELETE' && payload.old) {
            setAllProgress(prev => prev.filter(p => p.id !== (payload.old as PlayerProgress).id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [player?.game_session_id, gameSession?.id, playerId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center cyber-bg">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (!player || !gameSession) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 cyber-bg">
        <div className="text-center">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white font-display">CONNECTION LOST</h1>
          <p className="text-slate-400 mt-2 font-mono">RE-ESTABLISHING NEURAL LINK...</p>
        </div>
      </div>
    );
  }

  if (player.is_kicked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 cyber-bg">
        <div className="cyber-card rounded-2xl p-8 max-w-md text-center neon-border-magenta">
          <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white font-display">TERMINATED</h1>
          <p className="text-red-400 mt-2 font-mono">YOUR NEURAL SIGNATURE HAS BEEN REVOKED</p>
        </div>
      </div>
    );
  }

  if (player.is_eliminated) {
    const eliminatedPlayers = allPlayers.filter(p => p.is_eliminated && p.eliminated_at_stage === player.eliminated_at_stage);
    const remainingPlayers = allPlayers.filter(p => !p.is_spectator && !p.is_eliminated && !p.is_kicked);

    return (
      <div className="min-h-screen flex items-center justify-center p-6 cyber-bg">
        <div className="cyber-card rounded-2xl p-8 max-w-lg text-center neon-border-magenta">
          <XCircle className="w-20 h-20 text-red-400 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-2 font-display">PROTOCOL TERMINATED</h1>
          <p className="text-red-400 text-xl mb-6 font-mono">
            ROUND 0{player.eliminated_at_stage} - {STAGE_CODENAMES[player.eliminated_at_stage || 1]}
          </p>
          
          <div className="bg-slate-800/50 rounded-xl p-6 mb-6">
            <p className="text-slate-300 mb-4 font-mono text-sm">TERMINATED ALONGSIDE:</p>
            <div className="flex flex-wrap justify-center gap-3">
              {eliminatedPlayers.map(p => (
                <div key={p.id} className="flex items-center gap-2 bg-slate-900/50 rounded-full px-3 py-1">
                  <div className="w-6 h-6 rounded-full overflow-hidden" style={{ borderColor: p.avatar_color, borderWidth: 2 }}>
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-white" style={{ backgroundColor: p.avatar_color }}>
                        {p.name[0]}
                      </div>
                    )}
                  </div>
                  <span className="text-slate-400 text-sm font-mono">{p.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-xl p-6">
            <p className="text-slate-300 mb-4 font-mono text-sm">REMAINING CANDIDATES: {remainingPlayers.length}</p>
            <div className="flex flex-wrap justify-center gap-3">
              {remainingPlayers.slice(0, 6).map(p => (
                <div key={p.id} className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-full overflow-hidden" style={{ borderColor: p.avatar_color, borderWidth: 2 }}>
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white" style={{ backgroundColor: p.avatar_color }}>
                        {p.name[0]}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {remainingPlayers.length > 6 && (
                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-mono">
                  +{remainingPlayers.length - 6}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameSession.status === 'lobby') {
    const roundNumber = gameSession.round_number || 1;
    const maxPlayers = roundNumber === 1 ? 10 : roundNumber === 2 ? 6 : 3;
    
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 cyber-bg">
        <div className="cyber-card rounded-2xl p-8 max-w-md w-full text-center neon-border-purple">
          <div className="w-24 h-24 rounded-full mx-auto mb-6 overflow-hidden" style={{ borderColor: player.avatar_color, borderWidth: 3 }}>
            {player.photo_url ? (
              <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-3xl" style={{ backgroundColor: player.avatar_color }}>
                {player.name[0]}
              </div>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white mb-2 font-display">{player.name}</h1>
          <p className="text-cyan-400 mb-2 font-mono">CANDIDATE REGISTERED</p>
          <p className="text-purple-400 text-sm mb-8 font-mono">ROUND 0{roundNumber}</p>

          {gameSession.is_ready ? (
            <div className="bg-emerald-500/20 border border-emerald-500/50 rounded-xl p-6 mb-6">
              <div className="flex items-center justify-center gap-2 text-emerald-400 mb-2">
                <CheckCircle className="w-6 h-6" />
                <span className="font-bold font-display">PROTOCOL READY</span>
              </div>
              <p className="text-slate-300 text-sm font-mono">GENESIS IS EXPLAINING THE RULES...</p>
            </div>
          ) : (
            <div className="mb-6">
              <div className="flex items-center justify-center gap-2 text-purple-400 mb-4">
                <Clock className="w-6 h-6 animate-pulse" />
                <span className="font-medium font-display">AWAITING GENESIS</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-slate-400">
                <Users className="w-5 h-5" />
                <span className="font-mono">{allPlayers.filter(p => !p.is_spectator && !p.is_kicked).length}/{maxPlayers} CANDIDATES</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (countdown !== null) {
    return (
      <div className="min-h-screen flex items-center justify-center cyber-bg">
        <div className="text-center animate-bounce-in">
          <p className="text-slate-400 text-xl mb-4 font-mono">INITIALIZING ROUND 0{gameSession.current_stage}</p>
          <div className="w-40 h-40 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto animate-pulse-glow">
            <span className="text-white text-7xl font-bold font-display">{countdown}</span>
          </div>
          <p className="text-white text-2xl font-bold mt-6 font-display tracking-wider">{STAGE_CODENAMES[gameSession.current_stage]}</p>
        </div>
      </div>
    );
  }

  if (gameSession.status === 'completed') {
    const activePlayers = allPlayers.filter(p => !p.is_spectator && !p.is_eliminated && !p.is_kicked);
    const myIndex = activePlayers.findIndex(p => p.id === player.id);
    const isChampion = myIndex === 0;
    const isWinner = myIndex <= 2;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 cyber-bg">
        <div className={`cyber-card rounded-2xl p-8 max-w-md text-center ${
          isChampion ? 'neon-border' : isWinner ? 'neon-border-purple' : 'border border-slate-600'
        }`}>
          {isChampion ? (
            <>
              <Crown className="w-20 h-20 text-yellow-400 mx-auto mb-6 animate-float" />
              <h1 className="text-3xl font-bold text-white mb-2 font-display tracking-wider">HUMAN CHAMPION</h1>
              <p className="text-yellow-400 font-mono">YOU HAVE PROVEN YOUR WORTH TO GENESIS</p>
            </>
          ) : isWinner ? (
            <>
              <Trophy className="w-20 h-20 text-purple-400 mx-auto mb-6" />
              <h1 className="text-3xl font-bold text-white mb-2 font-display tracking-wider">
                {myIndex === 1 ? '2ND PLACE' : '3RD PLACE'}
              </h1>
              <p className="text-purple-400 font-mono">YOU HAVE DEMONSTRATED EXCEPTIONAL ABILITY</p>
            </>
          ) : (
            <>
              <Trophy className="w-20 h-20 text-slate-400 mx-auto mb-6" />
              <h1 className="text-3xl font-bold text-white mb-2 font-display tracking-wider">PROTOCOL COMPLETE</h1>
              <p className="text-slate-400 font-mono">YOUR DATA HAS BEEN RECORDED</p>
            </>
          )}

          <div className="w-24 h-24 rounded-full mx-auto mt-8 overflow-hidden" style={{ borderColor: player.avatar_color, borderWidth: 3 }}>
            {player.photo_url ? (
              <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white text-2xl" style={{ backgroundColor: player.avatar_color }}>
                {player.name[0]}
              </div>
            )}
          </div>
          <p className="text-white font-bold text-xl mt-4 font-display">{player.name}</p>
        </div>
      </div>
    );
  }

  const renderGame = () => {
    const activePlayers = allPlayers.filter(p => !p.is_spectator && !p.is_eliminated && !p.is_kicked);
    const eliminationCount = ELIMINATIONS[gameSession.current_stage] || 0;
    const isInDanger = myRank !== null && myRank > activePlayers.length - eliminationCount;

    const gameHeader = (
      <div className="flex items-center justify-between p-4 cyber-card border-b border-slate-700/50 mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{STAGE_ICONS[gameSession.current_stage]}</span>
          <div>
            <p className="text-xs text-slate-400 font-mono">ROUND 0{gameSession.current_stage}</p>
            <p className="text-white font-bold font-display">{STAGE_CODENAMES[gameSession.current_stage]}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {myRank !== null && (
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${
              isInDanger ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
            }`}>
              <span className="font-bold font-mono">#{myRank}</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
            <Radio className="w-3 h-3 animate-pulse" />
            <span className="text-xs font-mono">LIVE</span>
          </div>
        </div>
      </div>
    );

    switch (gameSession.current_stage) {
      case 1:
        return (
          <>
            {gameHeader}
            <TapToRun player={player} gameSession={gameSession} />
          </>
        );
      case 2:
        return (
          <>
            {gameHeader}
            <RockPaperScissors player={player} gameSession={gameSession} />
          </>
        );
      case 3:
        return (
          <>
            {gameHeader}
            <StopTimer player={player} gameSession={gameSession} />
          </>
        );
      default:
        return (
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen cyber-bg relative">
      <div className="grid-overlay" />
      <div className="relative z-10">
        {renderGame()}
      </div>
    </div>
  );
};

export default PlayerGame;
