import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Eye, Users, Loader2, Trophy, XCircle, Crown, Clock, Timer, Target, Flag, Radio, Play, UserX, X, Volume2, VolumeX, BookOpen } from 'lucide-react';
import { supabase, TABLES, type Player, type GameSession, type StageScore, type PlayerProgress } from '../lib/supabase';
import { STAGE_CODENAMES, ELIMINATIONS, GenesisState, GENESIS_DIALOGUES } from '../lib/constants';
import GenesisAvatar from '../components/GenesisAvatar';
import { generateSpeech } from '../lib/textToSpeech';

const STAGE_NAMES = ['', 'Speed Protocol', 'Prediction Matrix', 'Precision Protocol'];
// Polling removed - real-time subscriptions handle all updates

type PlayerWithProgress = Player & {
  score?: number;
  progress?: PlayerProgress;
};

const COUNTDOWN_SECONDS = 5;

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
    if (!isPlaying) {
      setDisplayTime(baseTime);
    }
  }, [baseTime, isPlaying]);

  return <>{displayTime.toFixed(6)}</>;
};

const SpectatorView = () => {
  const { gameId } = useParams();
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [scores, setScores] = useState<StageScore[]>([]);
  const [progressData, setProgressData] = useState<PlayerProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [genesisState, setGenesisState] = useState<GenesisState>(GenesisState.IDLE);
  const countdownIntervalRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadProgress = useCallback(async () => {
    if (!gameId) return;
    const { data } = await supabase
      .from(TABLES.playerProgress)
      .select('*')
      .eq('game_session_id', gameId);
    if (data) setProgressData(data);
  }, [gameId]);

  const loadScores = useCallback(async () => {
    if (!gameId) return;
    const { data } = await supabase
      .from(TABLES.stageScores)
      .select('*')
      .eq('game_session_id', gameId)
      .order('created_at', { ascending: true });
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

  const loadSession = useCallback(async () => {
    if (!gameId) return;
    const { data } = await supabase
      .from(TABLES.gameSessions)
      .select('*')
      .eq('id', gameId)
      .maybeSingle();
    if (data) setGameSession(data);
  }, [gameId]);

  const loadData = useCallback(async () => {
    await Promise.all([loadSession(), loadPlayers(), loadScores(), loadProgress()]);
    setLoading(false);
  }, [loadSession, loadPlayers, loadScores, loadProgress]);

  const getUpcomingStage = () => {
    if (gameSession?.status === 'lobby') {
      const enabledStages = gameSession?.enabled_stages || [1, 2, 3];
      return Math.min(...enabledStages);
    }
    return gameSession?.current_stage ?? 1;
  };

  const getRulesText = (stage: number) => {
    if (stage === 1) return GENESIS_DIALOGUES.stage1Intro;
    if (stage === 2) return GENESIS_DIALOGUES.stage2Intro;
    if (stage === 3) return GENESIS_DIALOGUES.stage3Intro;
    return GENESIS_DIALOGUES.intro;
  };

  const handlePlayRules = async () => {
    if (isPlayingAudio && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlayingAudio(false);
      return;
    }

    try {
      setIsLoadingAudio(true);
      setAudioError(null);
      setGenesisState(GenesisState.NARRATING);
      const upcomingStage = getUpcomingStage();
      const rulesText = getRulesText(upcomingStage);

      const audioUrl = await generateSpeech(rulesText);

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlayingAudio(false);
        setGenesisState(GenesisState.IDLE);
      };
      audio.onpause = () => {
        setIsPlayingAudio(false);
        setGenesisState(GenesisState.IDLE);
      };
      audio.onplay = () => {
        setIsPlayingAudio(true);
        setIsLoadingAudio(false);
      };
      audio.onerror = () => {
        setAudioError('AUDIO SYNTHESIS FAILED');
        setIsPlayingAudio(false);
        setIsLoadingAudio(false);
        setGenesisState(GenesisState.IDLE);
      };

      await audio.play();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'AUDIO SYNTHESIS FAILED';
      setAudioError(errorMessage);
      setIsLoadingAudio(false);
      setIsPlayingAudio(false);
      setGenesisState(GenesisState.IDLE);
    }
  };

  const setReady = async () => {
    if (!gameId) return;
    try {
      await supabase
        .from(TABLES.gameSessions)
        .update({
          is_ready: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameId);
    } catch (err) {
      console.error('Error setting ready:', err);
    }
  };

  const startGame = async () => {
    if (!gameId || isStarting) return;
    setIsStarting(true);
    setShowRulesModal(false);

    const startsAt = new Date(Date.now() + COUNTDOWN_SECONDS * 1000).toISOString();

    try {
      const { data: freshSession } = await supabase
        .from(TABLES.gameSessions)
        .select('enabled_stages')
        .eq('id', gameId)
        .maybeSingle();

      let enabledStages = freshSession?.enabled_stages;
      if (!enabledStages || !Array.isArray(enabledStages) || enabledStages.length === 0) {
        enabledStages = gameSession?.enabled_stages;
      }
      if (!enabledStages || !Array.isArray(enabledStages) || enabledStages.length === 0) {
        enabledStages = [1, 2, 3];
      }

      const firstStage = Math.min(...enabledStages);
      const status = `stage${firstStage}` as GameSession['status'];

      await supabase
        .from(TABLES.gameSessions)
        .update({
          is_ready: false,
          starts_at: startsAt,
          status,
          current_stage: firstStage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', gameId);
    } catch (err) {
      console.error('Error starting game:', err);
      setIsStarting(false);
    }
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
            setIsStarting(false);
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
        setIsStarting(false);
      }
    }

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [gameSession?.starts_at]);

  useEffect(() => {
    if (!showRulesModal && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlayingAudio(false);
    }
    setAudioError(null);
  }, [showRulesModal]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Polling removed - real-time subscriptions handle all updates
  useEffect(() => {
    const isGameActive = gameSession?.status &&
      ['stage1', 'stage2', 'stage3'].includes(gameSession.status);
    const isLobby = gameSession?.status === 'lobby';

    if (isGameActive) {
      setGenesisState(GenesisState.SCANNING);
    } else if (isLobby) {
      setGenesisState(GenesisState.IDLE);
    }
  }, [gameSession?.status]);

  // Real-time subscriptions - Use payload directly to avoid refetch cascade
  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`spectator-${gameId}`)
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
            setScores(prev => [...prev, payload.new as StageScore].sort((a, b) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  const isLive = gameSession?.status &&
    ['lobby', 'stage1', 'stage2', 'stage3'].includes(gameSession.status);

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

  const renderTapToRunProgress = () => {
    const playersWithProgress = getPlayersWithProgress()
      .filter((p) => !p.is_spectator && !p.is_eliminated && !p.is_kicked);

    return (
      <div className="space-y-4">
        <div className="cyber-card rounded-2xl p-6 overflow-hidden neon-border">
          <div className="flex items-center gap-3 mb-6">
            <Flag className="w-6 h-6 text-cyan-400" />
            <h2 className="text-xl font-bold text-white font-display">LIVE RACE</h2>
          </div>

          <div className="relative">
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-cyan-400 via-purple-500 to-pink-400 rounded-full" />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-3xl">🏁</div>

            <div className="space-y-8 pr-16">
              {playersWithProgress.map((player, index) => {
                const progress = player.progress?.progress ?? 0;
                const maxProgress = Math.max(...playersWithProgress.map(p => p.progress?.progress ?? 0));
                const isLeading = progress === maxProgress && progress > 0 && player.progress?.status === 'playing';
                const isFinished = player.progress?.status === 'finished';
                const isPlaying = player.progress?.status === 'playing';

                return (
                  <div key={player.id} className="relative min-h-[1rem]">
                    <div className="h-2 bg-slate-700/50 rounded-full mb-1" />
                    <div
                      className="absolute top-1/2 -translate-y-1/2 transition-all duration-300 ease-out flex items-center gap-3"
                      style={{
                        left: `calc(${Math.min(progress, 100)}% - ${progress > 50 ? '48px' : '0px'})`,
                        zIndex: playersWithProgress.length - index
                      }}
                    >
                      <div className={`absolute -left-2 top-1/2 -translate-y-1/2 -translate-x-full whitespace-nowrap text-sm font-semibold px-2 py-1 rounded font-mono ${
                        isFinished ? 'text-emerald-400 bg-emerald-950/80' :
                        isLeading ? 'text-yellow-400 bg-yellow-950/80' :
                        isPlaying ? 'text-cyan-400 bg-cyan-950/80' : 'text-slate-400 bg-slate-900/80'
                      }`}>
                        {player.name}
                      </div>

                      <div className={`relative ${isPlaying && !isFinished ? 'animate-bounce' : ''}`}>
                        <div className={`w-14 h-14 rounded-full overflow-hidden border-3 transition-all ${
                          isFinished ? 'border-emerald-400 ring-4 ring-emerald-400/30' :
                          isLeading ? 'border-yellow-400 ring-2 ring-yellow-400/30' :
                          isPlaying ? 'border-cyan-400' : 'border-slate-600'
                        }`} style={{ borderColor: player.avatar_color }}>
                          {player.photo_url ? (
                            <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white text-lg font-bold" style={{ backgroundColor: player.avatar_color }}>
                              {player.name[0]}
                            </div>
                          )}
                        </div>
                        {isLeading && !isFinished && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center text-xs">👑</div>
                        )}
                      </div>
                    </div>

                    {isFinished && player.progress?.elapsed_time && (
                      <div className="absolute top-1/2 -translate-y-1/2 right-20 bg-emerald-500/20 border border-emerald-500/50 rounded-full px-3 py-1 text-emerald-400 text-sm font-bold font-mono">
                        {player.progress.elapsed_time.toFixed(2)}s
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRockPaperScissorsProgress = () => {
    const playersWithProgress = getPlayersWithProgress()
      .filter((p) => !p.is_spectator && !p.is_eliminated && !p.is_kicked)
      .sort((a, b) => {
        const aScore = a.score ?? 0;
        const bScore = b.score ?? 0;
        if (bScore !== aScore) return bScore - aScore;
        return (a.progress?.elapsed_time ?? 999) - (b.progress?.elapsed_time ?? 999);
      });

    const TOTAL_ROUNDS = 5;

    return (
      <div className="space-y-4">
        <div className="cyber-card rounded-2xl p-6 neon-border-magenta">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Target className="w-6 h-6 text-pink-400" />
              <h2 className="text-xl font-bold text-white font-display">PREDICTION MATRIX</h2>
            </div>
            <div className="text-sm text-slate-400 font-mono">
              5 ROUNDS | WIN=3 | DRAW=1 | LOSE=0
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {playersWithProgress.map((player, index) => {
              const isFinished = player.progress?.status === 'finished';
              const isPlaying = player.progress?.status === 'playing';
              const progress = player.progress?.progress ?? 0;
              const currentRound = Math.ceil((progress / 100) * TOTAL_ROUNDS) || 0;
              const points = player.score ?? 0;
              const rank = index + 1;

              return (
                <div
                  key={player.id}
                  className={`cyber-card rounded-xl p-4 transition-all relative ${
                    isFinished ? 'neon-border-magenta' : ''
                  }`}
                >
                  <div className={`absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-display ${
                    rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'bg-slate-600 text-white'
                  }`}>
                    #{rank}
                  </div>

                  <div className="flex items-center gap-3 mb-3 mt-1">
                    <div className="w-10 h-10 rounded-full overflow-hidden" style={{ borderColor: player.avatar_color, borderWidth: 2 }}>
                      {player.photo_url ? (
                        <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white" style={{ backgroundColor: player.avatar_color }}>
                          {player.name[0]}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate font-mono text-sm">{player.name}</p>
                      <p className={`text-xs font-mono ${
                        isFinished ? 'text-emerald-400' : isPlaying ? 'text-cyan-400' : 'text-slate-400'
                      }`}>
                        {isFinished ? 'COMPLETE' : isPlaying ? `ROUND ${currentRound}/5` : 'WAITING'}
                      </p>
                    </div>
                  </div>

                  <div className="text-center">
                    <p className={`text-3xl font-bold font-display ${
                      points >= 10 ? 'text-emerald-400' : points >= 5 ? 'text-yellow-400' : 'text-white'
                    }`}>
                      {points} <span className="text-lg text-slate-400">PTS</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderStopTimerProgress = () => {
    const playersWithProgress = getPlayersWithProgress()
      .filter((p) => !p.is_spectator && !p.is_eliminated && !p.is_kicked);

    return (
      <div className="space-y-4">
        <div className="cyber-card rounded-2xl p-6 neon-border-purple">
          <div className="flex items-center gap-3 mb-2">
            <Timer className="w-6 h-6 text-purple-400" />
            <h2 className="text-xl font-bold text-white font-display">PRECISION PROTOCOL</h2>
          </div>
          <p className="text-slate-400 text-sm mb-6 font-mono">TARGET: 7.700000 SECONDS</p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {playersWithProgress.map((player) => {
              const isFinished = player.progress?.status === 'finished';
              const isPlaying = player.progress?.status === 'playing';
              const elapsed = player.progress?.elapsed_time ?? 0;
              const diff = isFinished ? Math.abs(elapsed - 7.7) : null;

              return (
                <div
                  key={player.id}
                  className={`cyber-card rounded-xl p-4 transition-all ${
                    isFinished ? 'neon-border' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full overflow-hidden" style={{ borderColor: player.avatar_color, borderWidth: 2 }}>
                      {player.photo_url ? (
                        <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-sm" style={{ backgroundColor: player.avatar_color }}>
                          {player.name[0]}
                        </div>
                      )}
                    </div>
                    <p className="text-white font-medium truncate flex-1 font-mono text-sm">{player.name}</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-mono font-bold ${
                      isFinished
                        ? diff !== null && diff < 0.1 ? 'text-emerald-400' : diff !== null && diff < 0.3 ? 'text-yellow-400' : 'text-orange-400'
                        : isPlaying ? 'text-cyan-400' : 'text-slate-400'
                    }`}>
                      {isPlaying ? (
                        <AnimatedTimerDisplay baseTime={elapsed} isPlaying={true} />
                      ) : isFinished ? (
                        elapsed.toFixed(6)
                      ) : (
                        '--:------'
                      )}
                    </p>
                    <p className={`text-xs mt-1 font-mono ${
                      isFinished ? 'text-emerald-400' : isPlaying ? 'text-cyan-400 animate-pulse' : 'text-slate-500'
                    }`}>
                      {isFinished ? `${diff !== null ? diff.toFixed(6) : '0.000000'}s OFF` :
                       isPlaying ? 'RUNNING...' : 'STANDBY'}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderLeaderboard = () => {
    const playersWithProgress = getPlayersWithProgress()
      .filter((p) => !p.is_spectator && !p.is_eliminated && !p.is_kicked)
      .sort((a, b) => {
        if (gameSession.current_stage === 1 || gameSession.current_stage === 3) {
          const aFinished = a.progress?.status === 'finished';
          const bFinished = b.progress?.status === 'finished';
          if (aFinished && bFinished) return (a.score ?? Infinity) - (b.score ?? Infinity);
          if (aFinished) return -1;
          if (bFinished) return 1;
          return (b.progress?.progress ?? 0) - (a.progress?.progress ?? 0);
        } else if (gameSession.current_stage === 2) {
          const aFinished = a.progress?.status === 'finished';
          const bFinished = b.progress?.status === 'finished';
          if (aFinished && bFinished) {
            if ((b.score ?? 0) !== (a.score ?? 0)) return (b.score ?? 0) - (a.score ?? 0);
            return (a.progress?.elapsed_time ?? 999) - (b.progress?.elapsed_time ?? 999);
          }
          if (aFinished) return -1;
          if (bFinished) return 1;
          return (b.score ?? 0) - (a.score ?? 0);
        }
        return 0;
      });

    const eliminationCount = ELIMINATIONS[gameSession.current_stage] || 0;

    return (
      <div className="cyber-card rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-4 text-center font-display">STANDINGS</h3>
        <div className="space-y-2">
          {playersWithProgress.map((player, index) => (
            <div
              key={player.id}
              className={`leaderboard-row flex items-center gap-3 p-3 rounded-xl ${
                index < activePlayers.length - eliminationCount ? 'safe' : 'danger'
              }`}
            >
              <span className={`rank-badge w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                index === 0 ? 'rank-1' : index === 1 ? 'rank-2' : index === 2 ? 'rank-3' : 'bg-slate-700 text-white'
              }`}>
                {index + 1}
              </span>
              <div className="w-10 h-10 rounded-full overflow-hidden" style={{ borderColor: player.avatar_color, borderWidth: 2 }}>
                {player.photo_url ? (
                  <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white" style={{ backgroundColor: player.avatar_color }}>
                    {player.name[0]}
                  </div>
                )}
              </div>
              <span className="flex-1 text-white font-medium font-mono">{player.name}</span>
              {player.score !== undefined ? (
                <span className="text-cyan-400 font-bold font-mono">
                  {gameSession.current_stage === 2
                    ? `${player.score}pts`
                    : `${player.score.toFixed(2)}s`}
                </span>
              ) : player.progress?.status === 'playing' ? (
                <span className="text-slate-400 text-sm font-mono">PLAYING...</span>
              ) : (
                <span className="text-slate-400 text-sm font-mono">WAITING...</span>
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-slate-400 text-sm mt-4 font-mono">
          <span className="text-red-400 font-bold">{eliminationCount}</span> CANDIDATES WILL BE TERMINATED
        </p>
      </div>
    );
  };

  return (
    <div className="min-h-screen p-6 cyber-bg relative">
      <div className="grid-overlay" />
      
      <GenesisAvatar
        state={genesisState}
        showRules={gameSession.status === 'lobby' || ['stage1', 'stage2', 'stage3'].includes(gameSession.status)}
        currentStage={gameSession.status === 'lobby' ? 0 : gameSession.current_stage}
        showMotivation={gameSession.status !== 'lobby' && gameSession.status !== 'completed'}
      />

      <div className={`relative z-10 ${gameSession.status === 'lobby' || gameSession.status === 'completed' ? '' : 'ml-[480px] mr-4'}`}>
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 text-purple-400 mb-2">
            <Eye className="w-6 h-6" />
            <span className="font-bold font-display tracking-wider">OBSERVER MODE</span>
            {isLive && (
              <span className="flex items-center gap-1 bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full text-xs font-bold ml-2 font-mono">
                <Radio className="w-3 h-3 animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <h1 className="text-4xl font-bold text-white mb-2 font-display tracking-wider">
            {gameSession.status === 'lobby'
              ? 'AWAITING CANDIDATES'
              : gameSession.status === 'completed'
              ? 'PROTOCOL COMPLETE'
              : `ROUND 0${gameSession.current_stage}`}
          </h1>
          {gameSession.status !== 'lobby' && gameSession.status !== 'completed' && (
            <p className="text-slate-400 text-xl font-mono">{STAGE_NAMES[gameSession.current_stage]}</p>
          )}
        </header>

        {gameSession.status === 'lobby' && (
          <div className="flex justify-center items-center min-h-[calc(100vh-200px)] px-6">
            <div className="max-w-4xl w-full cyber-card rounded-2xl p-8 pb-10 text-center neon-border-purple">
              <Clock className="w-16 h-16 text-purple-400 mx-auto mb-4 animate-pulse" />
              <h2 className="text-2xl font-bold text-white mb-4 font-display">SCANNING FOR CANDIDATES</h2>
              <div className="flex items-center justify-center gap-2 text-slate-400 font-mono">
                <Users className="w-5 h-5" />
                <span>{activePlayers.length}/10 NEURAL SIGNATURES DETECTED</span>
              </div>

              <div className="grid grid-cols-5 gap-4 mt-8">
                {activePlayers.map((player) => (
                  <div key={player.id} className="flex flex-col items-center animate-bounce-in relative group">
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2" style={{ borderColor: player.avatar_color }}>
                      {player.photo_url ? (
                        <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-xl" style={{ backgroundColor: player.avatar_color }}>
                          {player.name[0]}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => kickPlayer(player.id)}
                      className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Terminate candidate"
                    >
                      <UserX className="w-3.5 h-3.5 text-white" />
                    </button>
                    <p className="text-white text-sm mt-2 truncate max-w-full font-mono">{player.name}</p>
                  </div>
                ))}
                {Array.from({ length: 10 - activePlayers.length }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center opacity-30">
                    <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-600 flex items-center justify-center">
                      <span className="text-slate-500 text-2xl">?</span>
                    </div>
                    <p className="text-slate-500 text-sm mt-2 font-mono">SCANNING...</p>
                  </div>
                ))}
              </div>

              {!gameSession?.is_ready ? (
                <button
                  onClick={setReady}
                  disabled={activePlayers.length === 0}
                  className="cyber-btn mt-8 px-8 py-4 rounded-lg flex items-center justify-center gap-3 mx-auto disabled:opacity-50"
                >
                  <Play className="w-6 h-6" />
                  <span className="font-display tracking-wider">READY</span>
                </button>
              ) : (
                <div className="mt-8 space-y-4">
                  <div className="flex items-center justify-center gap-2 text-emerald-400">
                    <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="font-semibold font-mono">CANDIDATES NOTIFIED</span>
                  </div>
                  <button
                    onClick={() => setShowRulesModal(true)}
                    className="cyber-btn px-8 py-4 rounded-lg flex items-center justify-center gap-3 mx-auto"
                  >
                    <BookOpen className="w-6 h-6" />
                    <span className="font-display tracking-wider">VIEW PROTOCOL & START</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {showRulesModal && (
          <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowRulesModal(false)}>
            <div className="cyber-card rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto neon-border-purple" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 p-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white font-display">GENESIS PROTOCOL</h2>
                <div className="flex items-center gap-3">
                  <button onClick={handlePlayRules} disabled={isLoadingAudio} className="flex items-center gap-2 bg-white/20 hover:bg-white/30 disabled:bg-white/10 text-white px-4 py-2 rounded-lg transition-colors">
                    {isLoadingAudio ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm font-semibold font-mono">LOADING...</span></>
                    ) : isPlayingAudio ? (
                      <><VolumeX className="w-5 h-5" /><span className="text-sm font-semibold font-mono">STOP</span></>
                    ) : (
                      <><Volume2 className="w-5 h-5" /><span className="text-sm font-semibold font-mono">LISTEN</span></>
                    )}
                  </button>
                  <button onClick={() => setShowRulesModal(false)} className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors">
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {audioError && (
                <div className="mx-6 mt-4 bg-red-500/20 border border-red-500 rounded-lg p-4">
                  <p className="text-red-300 text-sm font-mono">{audioError}</p>
                </div>
              )}

              <div className="p-6 space-y-6">
                <div className="cyber-card rounded-xl p-6 border border-cyan-500/30">
                  <p className="text-slate-300 font-mono text-sm leading-relaxed whitespace-pre-line">
                    {getRulesText(getUpcomingStage())}
                  </p>
                </div>

                <div className="text-center">
                  <button onClick={startGame} disabled={isStarting} className="cyber-btn px-8 py-4 rounded-lg flex items-center justify-center gap-3 mx-auto disabled:opacity-50">
                    <Play className="w-6 h-6" />
                    <span className="font-display tracking-wider">{isStarting ? 'INITIALIZING...' : 'START PROTOCOL'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {countdown !== null && (
          <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="text-center animate-bounce-in">
              <p className="text-slate-400 text-xl mb-4 font-mono">PROTOCOL INITIATING</p>
              <div className="countdown w-40 h-40 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mx-auto animate-pulse-glow">
                <span className="text-white text-7xl font-bold font-display">{countdown}</span>
              </div>
              <p className="text-white text-2xl font-bold mt-6 font-display tracking-wider">PREPARE YOURSELVES</p>
            </div>
          </div>
        )}

        {gameSession.status !== 'lobby' && gameSession.status !== 'completed' && (
          <div className="flex gap-8 items-start">
            <div className="flex-1 min-w-0 max-w-4xl">
              {gameSession.current_stage === 1 && renderTapToRunProgress()}
              {gameSession.current_stage === 2 && renderRockPaperScissorsProgress()}
              {gameSession.current_stage === 3 && renderStopTimerProgress()}
            </div>
            <div className="w-96 flex-shrink-0 sticky top-6">
              {renderLeaderboard()}
            </div>
          </div>
        )}

        {gameSession.status === 'completed' && (
          <div className="flex justify-center items-center min-h-[calc(100vh-200px)] px-6">
            <div className="max-w-3xl w-full cyber-card rounded-2xl p-8 text-center neon-border">
              <Trophy className="w-24 h-24 text-yellow-400 mx-auto mb-6" />
              <h2 className="text-3xl font-bold text-white mb-8 font-display tracking-wider">HUMAN CHAMPION</h2>

              <div className="space-y-4 max-w-lg mx-auto">
                {activePlayers.map((player, index) => (
                  <div
                    key={player.id}
                    className={`flex items-center gap-4 p-6 rounded-xl ${
                      index === 0 ? 'bg-gradient-to-r from-yellow-500/30 to-yellow-600/30 neon-border' :
                      index === 1 ? 'bg-gradient-to-r from-slate-400/20 to-slate-500/20 border border-slate-400' :
                      'bg-gradient-to-r from-orange-700/20 to-orange-800/20 border border-orange-700'
                    }`}
                  >
                    <Crown className={`w-10 h-10 ${
                      index === 0 ? 'text-yellow-400' : index === 1 ? 'text-slate-300' : 'text-orange-600'
                    }`} />
                    <div className="w-16 h-16 rounded-full overflow-hidden" style={{ borderColor: player.avatar_color, borderWidth: 3 }}>
                      {player.photo_url ? (
                        <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-2xl" style={{ backgroundColor: player.avatar_color }}>
                          {player.name[0]}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-white font-bold text-xl font-display">{player.name}</p>
                      <p className={`text-sm font-mono ${
                        index === 0 ? 'text-yellow-400' : index === 1 ? 'text-slate-300' : 'text-orange-500'
                      }`}>
                        {index === 0 ? 'CHAMPION' : index === 1 ? '2ND PLACE' : '3RD PLACE'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {eliminatedPlayers.length > 0 && (
          <div className="mt-8 cyber-card rounded-2xl p-6">
            <h3 className="text-lg font-bold text-slate-400 mb-4 text-center font-display">TERMINATED CANDIDATES</h3>
            <div className="grid grid-cols-4 md:grid-cols-5 gap-4">
              {eliminatedPlayers.map((player) => (
                <div key={player.id} className="flex flex-col items-center opacity-50">
                  <div className="w-12 h-12 rounded-full overflow-hidden grayscale">
                    {player.photo_url ? (
                      <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white" style={{ backgroundColor: player.avatar_color }}>
                        {player.name[0]}
                      </div>
                    )}
                  </div>
                  <p className="text-slate-500 text-xs mt-1 truncate max-w-full font-mono">{player.name}</p>
                  <p className="text-slate-600 text-xs font-mono">TRIAL {player.eliminated_at_stage}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SpectatorView;
