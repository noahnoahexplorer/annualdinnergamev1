import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Eye, Users, Loader2, Trophy, XCircle, Crown, Clock, Timer, Target, Flag, Radio, Play, UserX, X, Volume2, VolumeX, BookOpen } from 'lucide-react';
import { supabase, type Player, type GameSession, type StageScore, type PlayerProgress } from '../lib/supabase';
import AnimatedMascot from '../components/AnimatedMascot';
import { generateSpeech } from '../lib/textToSpeech';

const STAGE_NAMES = ['', 'Tap to Run', 'Rock Paper Scissors', 'Stop at 7.7s'];
const ELIMINATIONS = [0, 4, 3, 0];
const POLL_INTERVAL = 500;

type PlayerWithProgress = Player & {
  score?: number;
  progress?: PlayerProgress;
};

const COUNTDOWN_SECONDS = 5;

function AnimatedTimerDisplay({ baseTime, isPlaying }: { baseTime: number; isPlaying: boolean }) {
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
}

export default function SpectatorView() {
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
  const pollIntervalRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadProgress = useCallback(async () => {
    if (!gameId) return;
    const { data } = await supabase
      .from('player_progress')
      .select('*')
      .eq('game_session_id', gameId);
    if (data) setProgressData(data);
  }, [gameId]);

  const loadScores = useCallback(async () => {
    if (!gameId) return;
    const { data } = await supabase
      .from('stage_scores')
      .select('*')
      .eq('game_session_id', gameId)
      .order('created_at', { ascending: true });
    if (data) setScores(data);
  }, [gameId]);

  const loadPlayers = useCallback(async () => {
    if (!gameId) return;
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('game_session_id', gameId)
      .order('joined_at', { ascending: true });
    if (data) setPlayers(data);
  }, [gameId]);

  const loadSession = useCallback(async () => {
    if (!gameId) return;
    const { data } = await supabase
      .from('game_sessions')
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
    if (stage === 1) {
      return `Alright everyone, are you ready for Stage 1? Let's get pumped!

      Here we go with Tap to Run! This is where the action begins! Your mission is simple but challenging - tap that screen as fast as you possibly can to make your character zoom to the finish line!

      Every single tap moves your character forward. The more you tap, the faster you run! It's all about that finger speed! Think of it like you're running a real race, but with your fingers doing all the work!

      Now here's the important part - after this stage, the 4 slowest players will be eliminated. That's right, only the fastest tappers move on! So dig deep, find that inner speed demon, and show us what you've got!

      Get those fingers ready, take a deep breath, and when that countdown hits zero... TAP LIKE YOUR LIFE DEPENDS ON IT! Let's go!`;
    } else if (stage === 2) {
      return `Welcome to Stage 2, everyone! Are you ready for a classic showdown? Let's do this!

      Time for Rock Paper Scissors! This is a 5-round battle where luck meets strategy! You're going to play against our lightning-fast bot in an epic series of battles!

      Here's how the scoring works - Win gets you 3 points, Draw gets you 1 point, and Lose gets you nothing! Every point matters!

      Each round starts with a 5-second countdown, then you'll have 10 seconds to make your choice. Rock crushes scissors, scissors cuts paper, and paper covers rock - you know the drill!

      But here's the twist - if you don't make a choice within 10 seconds, you automatically lose that round! So stay alert, trust your gut, and make that decision!

      If players tie on points, the fastest total time wins! So choose quickly and wisely!

      After all 5 rounds, the 3 players with the lowest scores won't be moving forward. So channel your inner champion and rack up those points! Let's go!`;
    } else if (stage === 3) {
      return `This is it, folks! The final stage! Are you ready for the ultimate challenge? Here we go!

      Welcome to Stage 3: Stop at exactly 7 point 7 seconds! This is where legends are born! Everything comes down to this one moment!

      Here's how it works - a timer is going to start running, and your job is to stop it as close to exactly 7.70 seconds as you possibly can. Sounds easy? Think again! It's all about that perfect timing, that incredible precision!

      The timer will start automatically, and you'll feel every second ticking by. When you think 7.70 seconds have passed, tap that screen to stop it! But be careful - tap too early and you're out of the running. Wait too long and someone else might beat you to perfection!

      This is the final showdown! No more eliminations after this - the player who gets closest to 7.70 seconds wins the entire game and takes home the crown! Every millisecond matters! Every split second counts!

      Take a deep breath, trust your internal clock, and when you're ready... show us that perfect timing! May the most precise player win! Let's go!`;
    }
    return '';
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
      const upcomingStage = getUpcomingStage();
      const rulesText = getRulesText(upcomingStage);

      const audioUrl = await generateSpeech(rulesText);

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => setIsPlayingAudio(false);
      audio.onpause = () => setIsPlayingAudio(false);
      audio.onplay = () => {
        setIsPlayingAudio(true);
        setIsLoadingAudio(false);
      };
      audio.onerror = () => {
        setAudioError('Failed to play audio');
        setIsPlayingAudio(false);
        setIsLoadingAudio(false);
      };

      await audio.play();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to play audio';
      setAudioError(errorMessage);
      setIsLoadingAudio(false);
      setIsPlayingAudio(false);
    }
  };

  const setReady = async () => {
    if (!gameId) return;

    try {
      await supabase
        .from('game_sessions')
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
        .from('game_sessions')
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
        .from('game_sessions')
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
        .from('players')
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

  useEffect(() => {
    const isGameActive = gameSession?.status &&
      ['stage1', 'stage2', 'stage3'].includes(gameSession.status);
    const isLobby = gameSession?.status === 'lobby';

    if (isGameActive) {
      pollIntervalRef.current = window.setInterval(() => {
        loadSession();
        loadProgress();
        loadScores();
      }, POLL_INTERVAL);
    } else if (isLobby) {
      pollIntervalRef.current = window.setInterval(() => {
        loadSession();
        loadPlayers();
      }, POLL_INTERVAL);
    } else if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [gameSession?.status, loadSession, loadProgress, loadScores, loadPlayers]);

  useEffect(() => {
    if (!gameId) return;

    const channel = supabase
      .channel(`spectator-${gameId}`)
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'player_progress',
          filter: `game_session_id=eq.${gameId}`,
        },
        (payload) => {
          if (payload.new) {
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
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, loadPlayers, loadScores]);

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
        </div>
      </div>
    );
  }

  const EMOJI_SETS = [
    { finished: '🏆', waiting: '😴', leading: '🔥', almost: '😤', speeding: '💨', sweating: '😅', running: '🏃', start: '💪' },
    { finished: '🎉', waiting: '😪', leading: '⚡', almost: '🥵', speeding: '🚀', sweating: '💦', running: '🦵', start: '✊' },
    { finished: '🥇', waiting: '😶', leading: '👑', almost: '😬', speeding: '🌪️', sweating: '🥴', running: '🏃‍♂️', start: '👊' },
    { finished: '✨', waiting: '🥱', leading: '💥', almost: '😠', speeding: '💫', sweating: '😓', running: '🦶', start: '🤜' },
    { finished: '🌟', waiting: '💤', leading: '🌈', almost: '🤯', speeding: '⭐', sweating: '😰', running: '👟', start: '🙌' },
    { finished: '🎊', waiting: '😑', leading: '🎯', almost: '😵', speeding: '🔹', sweating: '🫠', running: '🦿', start: '💯' },
  ];

  const getRunnerReaction = (progress: number, status: string | undefined, isLeading: boolean, playerId: string) => {
    const emojiIndex = playerId.charCodeAt(0) % EMOJI_SETS.length;
    const emojis = EMOJI_SETS[emojiIndex];

    if (status === 'finished') return { emoji: emojis.finished, text: 'Finished!' };
    if (status !== 'playing') return { emoji: emojis.waiting, text: 'Waiting...' };
    if (isLeading && progress > 50) return { emoji: emojis.leading, text: 'On fire!' };
    if (progress > 80) return { emoji: emojis.almost, text: 'Almost there!' };
    if (progress > 60) return { emoji: emojis.speeding, text: 'Speeding!' };
    if (progress > 40) return { emoji: emojis.sweating, text: 'Sweating!' };
    if (progress > 20) return { emoji: emojis.running, text: 'Running!' };
    return { emoji: emojis.start, text: 'Let\'s go!' };
  };

  const renderTapToRunProgress = () => {
    const playersWithProgress = getPlayersWithProgress()
      .filter((p) => !p.is_spectator && !p.is_eliminated && !p.is_kicked);

    return (
      <div className="space-y-4">
        <div className="bg-slate-800/50 rounded-2xl p-6 overflow-hidden">
          <div className="flex items-center gap-3 mb-6">
            <Flag className="w-6 h-6 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Live Race</h2>
            <span className="text-2xl animate-bounce">🏁</span>
          </div>

          <div className="relative">
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-emerald-400 via-emerald-500 to-emerald-400 rounded-full" />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-3xl">🏁</div>

            <div className="space-y-8 pr-16">
              {playersWithProgress.map((player, index) => {
                const progress = player.progress?.progress ?? 0;
                const maxProgress = Math.max(...playersWithProgress.map(p => p.progress?.progress ?? 0));
                const isLeading = progress === maxProgress && progress > 0 && player.progress?.status === 'playing';
                const isFinished = player.progress?.status === 'finished';
                const isPlaying = player.progress?.status === 'playing';
                const reaction = getRunnerReaction(progress, player.progress?.status, isLeading, player.id);

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
                      <div className={`absolute -left-2 top-1/2 -translate-y-1/2 -translate-x-full whitespace-nowrap text-sm font-semibold px-2 py-1 rounded shadow-md ${
                        isFinished ? 'text-emerald-400 bg-emerald-950/80' :
                        isLeading ? 'text-yellow-400 bg-yellow-950/80' :
                        isPlaying ? 'text-sky-400 bg-sky-950/80' : 'text-slate-400 bg-slate-900/80'
                      }`}>
                        {player.name}
                      </div>

                      <div className={`relative ${isPlaying && !isFinished ? 'animate-bounce' : ''}`}>
                        <div className={`w-16 h-16 rounded-full overflow-hidden border-3 transition-all shadow-lg ${
                          isFinished ? 'border-emerald-400 ring-4 ring-emerald-400/30 scale-110' :
                          isLeading ? 'border-yellow-400 ring-2 ring-yellow-400/30' :
                          isPlaying ? 'border-sky-400' : 'border-slate-600'
                        }`}>
                          {player.photo_url ? (
                            <img
                              src={player.photo_url}
                              alt={player.name}
                              className={`w-full h-full object-cover ${isPlaying && !isFinished ? 'animate-pulse' : ''}`}
                            />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center text-white text-xl font-bold ${
                              isFinished ? 'bg-emerald-600' :
                              isLeading ? 'bg-yellow-600' :
                              isPlaying ? 'bg-sky-600' : 'bg-slate-600'
                            }`}>
                              {player.name[0]}
                            </div>
                          )}
                        </div>

                        {isLeading && !isFinished && (
                          <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center text-sm shadow-md z-10">
                            👑
                          </div>
                        )}
                      </div>

                      <div className={`absolute -right-2 top-1/2 -translate-y-1/2 translate-x-full text-2xl transition-all ${
                        isPlaying ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
                      }`}>
                        {reaction.emoji}
                      </div>

                      {isPlaying && progress > 30 && !isFinished && (
                        <div className="absolute -right-8 top-1/2 -translate-y-1/2 text-xl animate-ping opacity-70">
                          💨
                        </div>
                      )}
                    </div>

                    {isFinished && player.progress?.elapsed_time && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 right-20 bg-emerald-500/20 border border-emerald-500/50 rounded-full px-3 py-1 text-emerald-400 text-sm font-bold animate-bounce-in"
                      >
                        {player.progress.elapsed_time.toFixed(2)}s
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-12 pt-4 border-t border-slate-700">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-400">Start</span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Tap faster to win!</span>
                <span className="text-xl animate-bounce">👆</span>
              </div>
              <span className="text-emerald-400">Finish</span>
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
        <div className="bg-slate-800/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Target className="w-6 h-6 text-orange-400" />
              <h2 className="text-xl font-bold text-white">Rock Paper Scissors</h2>
              <span className="text-2xl">✊🖐️✌️</span>
            </div>
            <div className="text-sm text-slate-400">
              5 Rounds | Win=3 | Draw=1 | Lose=0
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {playersWithProgress.map((player, index) => {
              const isFinished = player.progress?.status === 'finished';
              const isPlaying = player.progress?.status === 'playing';
              const progress = player.progress?.progress ?? 0;
              const currentRound = Math.ceil((progress / 100) * TOTAL_ROUNDS) || 0;
              const points = player.score ?? 0;
              const timeTaken = player.progress?.elapsed_time ?? 0;
              const rank = index + 1;
              const roundResults = player.progress?.round_results || '';

              return (
                <div
                  key={player.id}
                  className={`bg-slate-700/50 rounded-xl p-4 transition-all relative ${
                    isFinished ? 'ring-2 ring-orange-500' : ''
                  }`}
                >
                  <div className={`absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    rank === 1 ? 'bg-yellow-500 text-yellow-900' :
                    rank === 2 ? 'bg-slate-300 text-slate-700' :
                    rank === 3 ? 'bg-orange-600 text-white' :
                    'bg-slate-600 text-white'
                  }`}>
                    #{rank}
                  </div>

                  <div className="flex items-center gap-3 mb-3 mt-1">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-600">
                        {player.photo_url ? (
                          <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-slate-600 flex items-center justify-center text-white">
                            {player.name[0]}
                          </div>
                        )}
                      </div>
                      {rank === 1 && (isPlaying || isFinished) && (
                        <div className="absolute -top-1 -right-1 text-sm">👑</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{player.name}</p>
                      <p className={`text-xs ${
                        isFinished ? 'text-emerald-400' : isPlaying ? 'text-sky-400' : 'text-slate-400'
                      }`}>
                        {isFinished
                          ? 'Complete'
                          : isPlaying
                          ? `Round ${currentRound}/5`
                          : 'Waiting'}
                      </p>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="flex gap-1 justify-center">
                      {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => {
                        const result = roundResults[i];
                        let bgColor = 'bg-slate-600 text-slate-400';
                        if (i < currentRound && result) {
                          if (result === 'W') {
                            bgColor = 'bg-emerald-500 text-white';
                          } else if (result === 'D') {
                            bgColor = 'bg-slate-500 text-white';
                          } else if (result === 'L') {
                            bgColor = 'bg-red-500 text-white';
                          }
                        }
                        return (
                          <div
                            key={i}
                            className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${bgColor}`}
                          >
                            {i + 1}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="text-center">
                    <p className={`text-3xl font-bold transition-all ${
                      points >= 10 ? 'text-emerald-400' : points >= 5 ? 'text-yellow-400' : points > 0 ? 'text-orange-400' : 'text-white'
                    }`}>
                      {points} <span className="text-lg text-slate-400">pts</span>
                    </p>
                    {(isPlaying || isFinished) && timeTaken > 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        {timeTaken.toFixed(2)}s
                      </p>
                    )}
                    {isPlaying && !isFinished && currentRound > 0 && (
                      <div className="flex justify-center gap-1 text-xl mt-2 animate-pulse">
                        <span>✊</span>
                        <span>🖐️</span>
                        <span>✌️</span>
                      </div>
                    )}
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
        <div className="bg-slate-800/50 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-2">
            <Timer className="w-6 h-6 text-sky-400" />
            <h2 className="text-xl font-bold text-white">Live Timer Progress</h2>
          </div>
          <p className="text-slate-400 text-sm mb-6">Target: 7.700000 seconds</p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {playersWithProgress.map((player) => {
              const isFinished = player.progress?.status === 'finished';
              const isPlaying = player.progress?.status === 'playing';
              const elapsed = player.progress?.elapsed_time ?? 0;
              const diff = isFinished ? Math.abs(elapsed - 7.7) : null;

              return (
                <div
                  key={player.id}
                  className={`bg-slate-700/50 rounded-xl p-4 transition-all ${
                    isFinished ? 'ring-2 ring-emerald-500' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-slate-600">
                      {player.photo_url ? (
                        <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-slate-600 flex items-center justify-center text-white text-sm">
                          {player.name[0]}
                        </div>
                      )}
                    </div>
                    <p className="text-white font-medium truncate flex-1">{player.name}</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-3xl font-mono font-bold ${
                      isFinished
                        ? diff !== null && diff < 0.1 ? 'text-emerald-400' : diff !== null && diff < 0.3 ? 'text-yellow-400' : 'text-orange-400'
                        : isPlaying ? 'text-sky-400' : 'text-slate-400'
                    }`}>
                      {isPlaying ? (
                        <AnimatedTimerDisplay baseTime={elapsed} isPlaying={true} />
                      ) : isFinished ? (
                        elapsed.toFixed(6)
                      ) : (
                        '--:------'
                      )}
                    </p>
                    <p className={`text-xs mt-1 ${
                      isFinished ? 'text-emerald-400' :
                      isPlaying ? 'text-sky-400 animate-pulse' : 'text-slate-500'
                    }`}>
                      {isFinished ? `${diff !== null ? diff.toFixed(6) : '0.000000'}s off target` :
                       isPlaying ? 'Timer running...' : 'Not started'}
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
        if (gameSession.current_stage === 1) {
          const aFinished = a.progress?.status === 'finished';
          const bFinished = b.progress?.status === 'finished';

          if (aFinished && bFinished) {
            return (a.score ?? Infinity) - (b.score ?? Infinity);
          }
          if (aFinished) return -1;
          if (bFinished) return 1;

          return (b.progress?.progress ?? 0) - (a.progress?.progress ?? 0);
        } else if (gameSession.current_stage === 2) {
          const aFinished = a.progress?.status === 'finished';
          const bFinished = b.progress?.status === 'finished';

          if (aFinished && bFinished) {
            const aScore = a.score ?? 0;
            const bScore = b.score ?? 0;
            if (bScore !== aScore) return bScore - aScore;
            return (a.progress?.elapsed_time ?? 999) - (b.progress?.elapsed_time ?? 999);
          }
          if (aFinished) return -1;
          if (bFinished) return 1;

          const aScore = a.score ?? 0;
          const bScore = b.score ?? 0;
          if (bScore !== aScore) return bScore - aScore;
          return (a.progress?.progress ?? 0) - (b.progress?.progress ?? 0);
        } else if (gameSession.current_stage === 3) {
          const aFinished = a.progress?.status === 'finished';
          const bFinished = b.progress?.status === 'finished';

          if (aFinished && bFinished) {
            return (a.score ?? Infinity) - (b.score ?? Infinity);
          }
          if (aFinished) return -1;
          if (bFinished) return 1;

          return (b.progress?.elapsed_time ?? 0) - (a.progress?.elapsed_time ?? 0);
        }
        return 0;
      });

    return (
      <div className="bg-slate-800/30 rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-4 text-center">Standings</h3>
        <div className="space-y-2">
          {playersWithProgress.map((player, index) => (
            <div
              key={player.id}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                index < activePlayers.length - ELIMINATIONS[gameSession.current_stage]
                  ? 'bg-emerald-500/20 border border-emerald-500/30'
                  : 'bg-red-500/20 border border-red-500/30'
              }`}
            >
              <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                index === 0 ? 'bg-yellow-500 text-yellow-900' :
                index === 1 ? 'bg-slate-300 text-slate-700' :
                index === 2 ? 'bg-orange-600 text-orange-100' : 'bg-slate-700 text-white'
              }`}>
                {index + 1}
              </span>
              <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-slate-600">
                {player.photo_url ? (
                  <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
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
                    ? `${player.score}pts ${(player.progress?.elapsed_time ?? 0).toFixed(2)}s`
                    : gameSession.current_stage === 3
                    ? `${player.score.toFixed(6)}s`
                    : `${player.score.toFixed(2)}s`}
                </span>
              ) : player.progress?.status === 'playing' ? (
                <span className="text-slate-400 text-sm">
                  {gameSession.current_stage === 1
                    ? `${Math.round(player.progress?.progress ?? 0)}%`
                    : gameSession.current_stage === 2
                    ? `${player.score ?? 0}pts - R${Math.ceil(((player.progress?.progress ?? 0) / 100) * 5)}/5`
                    : `${(player.progress?.elapsed_time ?? 0).toFixed(6)}s`
                  }
                </span>
              ) : (
                <span className="text-slate-400 text-sm">Waiting...</span>
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-slate-400 text-sm mt-4">
          <span className="text-red-400 font-bold">{ELIMINATIONS[gameSession.current_stage]}</span> players will be eliminated
        </p>
      </div>
    );
  };

  return (
    <div className="min-h-screen p-6 relative">
      <AnimatedMascot
        showRules
        currentStage={gameSession.status === 'lobby' ? 0 : gameSession.current_stage}
        showMotivation={gameSession.status !== 'lobby' && gameSession.status !== 'completed'}
      />
      <div className={gameSession.status === 'lobby' || gameSession.status === 'completed' ? '' : 'ml-[520px] mr-8 pr-8'}>
        <header className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 text-emerald-400 mb-2">
            <Eye className="w-6 h-6" />
            <span className="font-bold">SPECTATOR VIEW</span>
            {isLive && (
              <span className="flex items-center gap-1 bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full text-xs font-bold ml-2">
                <Radio className="w-3 h-3 animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">
            {gameSession.status === 'lobby'
              ? 'Waiting to Start'
              : gameSession.status === 'completed'
              ? 'Game Complete!'
              : `Stage ${gameSession.current_stage}`}
          </h1>
          {gameSession.status !== 'lobby' && gameSession.status !== 'completed' && (
            <p className="text-slate-400 text-xl">{STAGE_NAMES[gameSession.current_stage]}</p>
          )}
        </header>

        {gameSession.status === 'lobby' && (
          <div className="flex justify-center items-center min-h-[calc(100vh-200px)] px-6">
            <div className="max-w-4xl w-full bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8 pb-10 text-center">
            <Clock className="w-16 h-16 text-sky-400 mx-auto mb-4 animate-pulse" />
            <h2 className="text-2xl font-bold text-white mb-4">Waiting for Players</h2>
            <div className="flex items-center justify-center gap-2 text-slate-400">
              <Users className="w-5 h-5" />
              <span>{activePlayers.length}/10 players joined</span>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="text-slate-400 text-sm">Selected stages:</span>
              {(gameSession.enabled_stages || [1, 2, 3]).sort().map((stageNum) => (
                <span
                  key={stageNum}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    stageNum === 1 ? 'bg-sky-500/20 text-sky-400' :
                    stageNum === 2 ? 'bg-orange-500/20 text-orange-400' :
                    'bg-emerald-500/20 text-emerald-400'
                  }`}
                >
                  {STAGE_NAMES[stageNum]}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-5 gap-4 mt-8">
              {activePlayers.map((player) => (
                <div key={player.id} className="flex flex-col items-center animate-bounce-in relative group">
                  <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-sky-500">
                    {player.photo_url ? (
                      <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-slate-600 flex items-center justify-center text-white text-xl">
                        {player.name[0]}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => kickPlayer(player.id)}
                    className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    title="Kick player"
                  >
                    <UserX className="w-3.5 h-3.5 text-white" />
                  </button>
                  <p className="text-white text-sm mt-2 truncate max-w-full">{player.name}</p>
                </div>
              ))}
              {Array.from({ length: 10 - activePlayers.length }).map((_, i) => (
                <div key={i} className="flex flex-col items-center opacity-30">
                  <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-600 flex items-center justify-center">
                    <span className="text-slate-500 text-2xl">?</span>
                  </div>
                  <p className="text-slate-500 text-sm mt-2">Waiting...</p>
                </div>
              ))}
            </div>

            {!gameSession?.is_ready ? (
              <>
                <button
                  onClick={setReady}
                  disabled={activePlayers.length === 0}
                  className="mt-8 px-8 py-4 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-bold text-lg rounded-2xl flex items-center justify-center gap-3 mx-auto transition-all shadow-lg hover:shadow-sky-500/25"
                >
                  <Play className="w-6 h-6" />
                  Ready
                </button>
                {activePlayers.length === 0 && (
                  <p className="text-slate-500 text-sm mt-3">At least 1 player must join to start</p>
                )}
              </>
            ) : (
              <div className="mt-8 space-y-4">
                <div className="flex items-center justify-center gap-2 text-emerald-400">
                  <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="font-semibold">Players notified!</span>
                </div>
                <button
                  onClick={() => setShowRulesModal(true)}
                  className="px-8 py-4 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white font-bold text-lg rounded-2xl flex items-center justify-center gap-3 mx-auto transition-all shadow-lg hover:shadow-sky-500/25"
                >
                  <BookOpen className="w-6 h-6" />
                  View Rules & Start
                </button>
              </div>
            )}
            </div>
          </div>
        )}

        {showRulesModal && (
          <div
            className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
            onClick={() => setShowRulesModal(false)}
          >
            <div
              className="bg-slate-800 border-2 border-sky-500 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 bg-gradient-to-r from-sky-600 to-emerald-600 p-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">Game Rules</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePlayRules}
                    disabled={isLoadingAudio}
                    className="flex items-center gap-2 bg-white/20 hover:bg-white/30 disabled:bg-white/10 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    {isLoadingAudio ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm font-semibold">Loading...</span>
                      </>
                    ) : isPlayingAudio ? (
                      <>
                        <VolumeX className="w-5 h-5" />
                        <span className="text-sm font-semibold">Stop</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-5 h-5" />
                        <span className="text-sm font-semibold">Listen</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowRulesModal(false)}
                    className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {audioError && (
                <div className="mx-6 mt-4 bg-red-500/20 border border-red-500 rounded-lg p-4">
                  <p className="text-red-300 text-sm">{audioError}</p>
                </div>
              )}

              <div className="p-6 space-y-6">
                {getUpcomingStage() === 1 && (
                  <>
                    <div className="bg-gradient-to-br from-sky-500/20 to-emerald-500/20 rounded-2xl p-8 border-2 border-sky-500/50 text-center">
                      <h3 className="text-3xl font-bold text-white mb-4 flex items-center justify-center gap-3">
                        <span className="text-4xl">🏃</span> Stage 1: Tap to Run
                      </h3>
                      <p className="text-slate-200 text-lg leading-relaxed">
                        Tap your screen as fast as possible to race to the finish line!
                      </p>
                    </div>

                    <div className="bg-slate-700/50 rounded-xl p-6 border border-sky-500/30">
                      <h3 className="text-xl font-bold text-sky-400 mb-4 flex items-center gap-2">
                        <span className="text-2xl">📋</span> How to Play
                      </h3>
                      <div className="space-y-3 text-slate-300">
                        <div className="flex items-start gap-3">
                          <span className="text-emerald-400 font-bold">1.</span>
                          <p>Tap the screen rapidly to move your character forward</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="text-emerald-400 font-bold">2.</span>
                          <p>The more you tap, the faster you run</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="text-emerald-400 font-bold">3.</span>
                          <p>Be the first to reach the finish line!</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-red-500/10 to-red-600/10 border border-red-500/30 rounded-xl p-6">
                      <h3 className="text-xl font-bold text-red-400 mb-3 flex items-center gap-2">
                        <span className="text-2xl">⚠️</span> Elimination
                      </h3>
                      <p className="text-slate-300 text-lg">
                        The <span className="text-red-400 font-bold">4 slowest players</span> will be eliminated after this stage!
                      </p>
                    </div>
                  </>
                )}

                {getUpcomingStage() === 2 && (
                  <>
                    <div className="bg-gradient-to-br from-orange-500/20 to-yellow-500/20 rounded-2xl p-8 border-2 border-orange-500/50 text-center">
                      <h3 className="text-3xl font-bold text-white mb-4 flex items-center justify-center gap-3">
                        <span className="text-4xl">✊</span> Stage 2: Rock Paper Scissors
                      </h3>
                      <p className="text-slate-200 text-lg leading-relaxed">
                        5 rounds of Rock Paper Scissors against the bot!
                      </p>
                    </div>

                    <div className="bg-slate-700/50 rounded-xl p-6 border border-orange-500/30">
                      <h3 className="text-xl font-bold text-orange-400 mb-4 flex items-center gap-2">
                        <span className="text-2xl">📋</span> How to Play
                      </h3>
                      <div className="space-y-3 text-slate-300">
                        <div className="flex items-start gap-3">
                          <span className="text-emerald-400 font-bold">1.</span>
                          <p>Play 5 rounds against the bot</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="text-emerald-400 font-bold">2.</span>
                          <p>Each round: 5s countdown, then 10s to choose</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="text-emerald-400 font-bold">3.</span>
                          <p>If you don't choose in time, you lose the round!</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-700/50 rounded-xl p-6 border border-yellow-500/30">
                      <h3 className="text-xl font-bold text-yellow-400 mb-4 flex items-center gap-2">
                        <span className="text-2xl">🏆</span> Scoring
                      </h3>
                      <div className="flex justify-center gap-6 text-lg">
                        <div className="text-center">
                          <p className="text-emerald-400 font-bold text-2xl">3</p>
                          <p className="text-slate-400 text-sm">Win</p>
                        </div>
                        <div className="text-center">
                          <p className="text-slate-300 font-bold text-2xl">1</p>
                          <p className="text-slate-400 text-sm">Draw</p>
                        </div>
                        <div className="text-center">
                          <p className="text-red-400 font-bold text-2xl">0</p>
                          <p className="text-slate-400 text-sm">Lose</p>
                        </div>
                      </div>
                      <p className="text-slate-400 text-sm text-center mt-3">
                        Tiebreaker: Fastest total time wins!
                      </p>
                    </div>

                    <div className="bg-gradient-to-r from-red-500/10 to-red-600/10 border border-red-500/30 rounded-xl p-6">
                      <h3 className="text-xl font-bold text-red-400 mb-3 flex items-center gap-2">
                        <span className="text-2xl">⚠️</span> Elimination
                      </h3>
                      <p className="text-slate-300 text-lg">
                        The <span className="text-red-400 font-bold">3 players with the lowest scores</span> will be eliminated!
                      </p>
                    </div>
                  </>
                )}

                {getUpcomingStage() === 3 && (
                  <>
                    <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl p-8 border-2 border-purple-500/50 text-center">
                      <h3 className="text-3xl font-bold text-white mb-4 flex items-center justify-center gap-3">
                        <span className="text-4xl">⏱️</span> Stage 3: Stop at 7.7s
                      </h3>
                      <p className="text-slate-200 text-lg leading-relaxed">
                        Stop the timer as close to exactly 7.70 seconds as possible!
                      </p>
                    </div>

                    <div className="bg-slate-700/50 rounded-xl p-6 border border-purple-500/30">
                      <h3 className="text-xl font-bold text-purple-400 mb-4 flex items-center gap-2">
                        <span className="text-2xl">📋</span> How to Play
                      </h3>
                      <div className="space-y-3 text-slate-300">
                        <div className="flex items-start gap-3">
                          <span className="text-emerald-400 font-bold">1.</span>
                          <p>The timer starts automatically</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="text-emerald-400 font-bold">2.</span>
                          <p>Count in your head and feel the rhythm</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span className="text-emerald-400 font-bold">3.</span>
                          <p>Tap to stop at exactly 7.70 seconds!</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border border-yellow-500/30 rounded-xl p-6">
                      <h3 className="text-xl font-bold text-yellow-400 mb-3 flex items-center gap-2">
                        <span className="text-2xl">🏆</span> Final Showdown
                      </h3>
                      <p className="text-slate-300 text-lg">
                        The player <span className="text-yellow-400 font-bold">closest to 7.70 seconds</span> wins the crown!
                      </p>
                    </div>
                  </>
                )}

                <div className="bg-gradient-to-br from-emerald-500/10 to-sky-500/10 rounded-xl p-6 border border-emerald-500/30 text-center">
                  <button
                    onClick={startGame}
                    disabled={isStarting}
                    className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 disabled:from-slate-600 disabled:to-slate-700 disabled:cursor-not-allowed text-white font-bold text-lg rounded-2xl flex items-center justify-center gap-3 mx-auto transition-all shadow-lg hover:shadow-emerald-500/25"
                  >
                    <Play className="w-6 h-6" />
                    {isStarting ? 'Starting...' : 'Start Game'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {countdown !== null && (
          <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="text-center animate-bounce-in">
              <p className="text-slate-400 text-xl mb-4">Game starting in</p>
              <div className="w-40 h-40 rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 flex items-center justify-center mx-auto shadow-2xl shadow-sky-500/30">
                <span className="text-white text-7xl font-bold">{countdown}</span>
              </div>
              <p className="text-white text-2xl font-bold mt-6">Get Ready!</p>
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
            <div className="max-w-3xl w-full bg-slate-800/50 backdrop-blur border border-slate-700 rounded-2xl p-8 text-center">
            <Trophy className="w-24 h-24 text-yellow-400 mx-auto mb-6" />
            <h2 className="text-3xl font-bold text-white mb-8">Final Results</h2>

            <div className="space-y-4 max-w-lg mx-auto">
              {activePlayers.map((player, index) => (
                <div
                  key={player.id}
                  className={`flex items-center gap-4 p-6 rounded-xl ${
                    index === 0
                      ? 'bg-gradient-to-r from-yellow-500/30 to-yellow-600/30 border-2 border-yellow-500'
                      : index === 1
                      ? 'bg-gradient-to-r from-slate-400/20 to-slate-500/20 border-2 border-slate-400'
                      : 'bg-gradient-to-r from-orange-700/20 to-orange-800/20 border-2 border-orange-700'
                  }`}
                >
                  <Crown className={`w-10 h-10 ${
                    index === 0 ? 'text-yellow-400' :
                    index === 1 ? 'text-slate-300' : 'text-orange-600'
                  }`} />
                  <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-white/30">
                    {player.photo_url ? (
                      <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-slate-600 flex items-center justify-center text-white text-2xl">
                        {player.name[0]}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-white font-bold text-xl">{player.name}</p>
                    <p className={`text-sm ${
                      index === 0 ? 'text-yellow-400' :
                      index === 1 ? 'text-slate-300' : 'text-orange-500'
                    }`}>
                      {index === 0 ? 'Champion' : index === 1 ? '2nd Place' : '3rd Place'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            </div>
          </div>
        )}

        {eliminatedPlayers.length > 0 && (
          <div className="mt-8 bg-slate-800/30 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-slate-400 mb-4 text-center">
              Eliminated ({eliminatedPlayers.length})
            </h3>
            <div className="grid grid-cols-4 md:grid-cols-5 gap-4">
              {eliminatedPlayers.map((player) => (
                <div key={player.id} className="flex flex-col items-center opacity-50">
                  <div className="w-12 h-12 rounded-full overflow-hidden grayscale">
                    {player.photo_url ? (
                      <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-slate-600 flex items-center justify-center text-white">
                        {player.name[0]}
                      </div>
                    )}
                  </div>
                  <p className="text-slate-500 text-xs mt-1 truncate max-w-full">{player.name}</p>
                  <p className="text-slate-600 text-xs">Stage {player.eliminated_at_stage}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
