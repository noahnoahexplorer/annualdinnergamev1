import { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Trophy, XCircle, Minus, Target } from 'lucide-react';
import { supabase, TABLES, type Player, type GameSession } from '../lib/supabase';
import { RPS_AI_MESSAGES } from '../lib/constants';

type Choice = 'rock' | 'paper' | 'scissors' | null;
type Result = 'win' | 'lose' | 'draw' | null;

type RoundResult = {
  round: number;
  playerChoice: Choice;
  botChoice: Choice;
  result: Result;
  points: number;
  timeTaken: number;
};

type Props = {
  player: Player;
  gameSession: GameSession;
};

const TOTAL_ROUNDS = 5;
const COUNTDOWN_DURATION = 3;
const SELECTION_DURATION = 10;
const RESULT_DISPLAY_DURATION = 2;

const POINTS = {
  win: 3,
  draw: 1,
  lose: 0,
};

const CHOICES: { value: Choice; emoji: string; label: string }[] = [
  { value: 'rock', emoji: '✊', label: 'ROCK' },
  { value: 'paper', emoji: '🖐️', label: 'PAPER' },
  { value: 'scissors', emoji: '✌️', label: 'SCISSORS' },
];

const getResult = (playerChoice: Choice, bot: Choice): Result => {
  if (!playerChoice || !bot) return 'lose';
  if (playerChoice === bot) return 'draw';
  if (
    (playerChoice === 'rock' && bot === 'scissors') ||
    (playerChoice === 'paper' && bot === 'rock') ||
    (playerChoice === 'scissors' && bot === 'paper')
  ) {
    return 'win';
  }
  return 'lose';
};

const getBotChoice = (): Choice => {
  const choices: Choice[] = ['rock', 'paper', 'scissors'];
  return choices[Math.floor(Math.random() * 3)];
};

const getRandomMessage = (messages: string[]) => {
  return messages[Math.floor(Math.random() * messages.length)];
};

const RockPaperScissors = ({ player, gameSession }: Props) => {
  const [phase, setPhase] = useState<'countdown' | 'selection' | 'result' | 'complete'>('countdown');
  const [currentRound, setCurrentRound] = useState(1);
  const [countdown, setCountdown] = useState(COUNTDOWN_DURATION);
  const [timeLeft, setTimeLeft] = useState(SELECTION_DURATION);
  const [selectionStartTime, setSelectionStartTime] = useState<number | null>(null);
  const [playerChoice, setPlayerChoice] = useState<Choice>(null);
  const [botChoice, setBotChoice] = useState<Choice>(null);
  const [result, setResult] = useState<Result>(null);
  const [totalScore, setTotalScore] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [aiMessage, setAiMessage] = useState('');
  const hasCompleted = useRef(false);
  const isActive = gameSession.current_stage === 2;

  const updateProgress = useCallback(async (round: number, score: number, time: number, status: 'waiting' | 'playing' | 'finished', roundResultsStr: string = '') => {
    try {
      const progress = Math.round((round / TOTAL_ROUNDS) * 100);

      await supabase
        .from(TABLES.playerProgress)
        .upsert({
          player_id: player.id,
          game_session_id: player.game_session_id,
          stage: 2,
          progress,
          current_score: score,
          elapsed_time: time,
          status,
          extra_data: { round_results: roundResultsStr },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'player_id,game_session_id,stage' });

      if (round > 0) {
        await supabase
          .from(TABLES.stageScores)
          .upsert({
            player_id: player.id,
            game_session_id: player.game_session_id,
            stage: 2,
            score: score,
            time_taken: time,
          }, { onConflict: 'player_id,game_session_id,stage' });
      }
    } catch (err) {
      console.error('Error updating progress:', err);
    }
  }, [player.id, player.game_session_id]);

  useEffect(() => {
    if (!isActive) {
      setPhase('countdown');
      setCurrentRound(1);
      setCountdown(COUNTDOWN_DURATION);
      setTimeLeft(SELECTION_DURATION);
      setSelectionStartTime(null);
      setPlayerChoice(null);
      setBotChoice(null);
      setResult(null);
      setTotalScore(0);
      setTotalTime(0);
      setRoundResults([]);
      hasCompleted.current = false;
    } else {
      updateProgress(0, 0, 0, 'waiting');
      setAiMessage(getRandomMessage(RPS_AI_MESSAGES.thinking));
    }
  }, [isActive, updateProgress]);

  useEffect(() => {
    if (!isActive || phase !== 'countdown') return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setPhase('selection');
          setSelectionStartTime(Date.now());
          updateProgress(currentRound - 1, totalScore, totalTime, 'playing');
          setAiMessage(getRandomMessage(RPS_AI_MESSAGES.thinking));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, phase, currentRound, totalScore, totalTime, updateProgress]);

  useEffect(() => {
    if (!isActive || phase !== 'selection') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          handleSelection(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isActive, phase]);

  const handleSelection = (choice: Choice) => {
    if (phase !== 'selection') return;

    const timeTaken = selectionStartTime ? (Date.now() - selectionStartTime) / 1000 : SELECTION_DURATION;

    setPlayerChoice(choice);
    const bot = getBotChoice();
    setBotChoice(bot);
    const gameResult = getResult(choice, bot);
    setResult(gameResult);

    // Set AI message based on result
    if (gameResult === 'win') {
      setAiMessage(getRandomMessage(RPS_AI_MESSAGES.lose));
    } else if (gameResult === 'lose') {
      setAiMessage(getRandomMessage(RPS_AI_MESSAGES.win));
    } else {
      setAiMessage(getRandomMessage(RPS_AI_MESSAGES.draw));
    }

    const roundPoints = POINTS[gameResult || 'lose'];
    const newTotalScore = totalScore + roundPoints;
    const newTotalTime = totalTime + timeTaken;

    setTotalScore(newTotalScore);
    setTotalTime(newTotalTime);

    const roundResult: RoundResult = {
      round: currentRound,
      playerChoice: choice,
      botChoice: bot,
      result: gameResult,
      points: roundPoints,
      timeTaken,
    };
    const newRoundResults = [...roundResults, roundResult];
    setRoundResults(newRoundResults);

    const resultsString = newRoundResults.map(r =>
      r.result === 'win' ? 'W' : r.result === 'draw' ? 'D' : 'L'
    ).join('');

    setPhase('result');
    updateProgress(currentRound, newTotalScore, newTotalTime, 'playing', resultsString);

    setTimeout(() => {
      if (currentRound >= TOTAL_ROUNDS) {
        if (!hasCompleted.current) {
          hasCompleted.current = true;
          setPhase('complete');
          updateProgress(TOTAL_ROUNDS, newTotalScore, newTotalTime, 'finished', resultsString);
        }
      } else {
        setCurrentRound(prev => prev + 1);
        setCountdown(COUNTDOWN_DURATION);
        setTimeLeft(SELECTION_DURATION);
        setSelectionStartTime(null);
        setPlayerChoice(null);
        setBotChoice(null);
        setResult(null);
        setPhase('countdown');
      }
    }, RESULT_DISPLAY_DURATION * 1000);
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
        {/* Round indicators */}
        <div className="mb-6 flex items-center gap-4">
          <span className="text-slate-400 font-mono">ROUND</span>
          <div className="flex gap-2">
            {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
              <div
                key={i}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold font-mono ${
                  i < currentRound - 1
                    ? roundResults[i]?.result === 'win'
                      ? 'bg-emerald-500 text-white'
                      : roundResults[i]?.result === 'draw'
                      ? 'bg-slate-500 text-white'
                      : 'bg-red-500 text-white'
                    : i === currentRound - 1
                    ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white ring-2 ring-pink-300'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-400 text-xl mb-6 font-mono">ROUND {currentRound} INITIATING</p>
        <div className="w-36 h-36 rounded-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center shadow-2xl animate-pulse-glow">
          <span className="text-white text-7xl font-bold font-display">{countdown}</span>
        </div>
        <p className="text-white text-xl font-bold mt-8 font-display tracking-wider">PREPARE YOURSELF</p>

        {totalScore > 0 && (
          <div className="mt-6 text-slate-400 font-mono">
            CURRENT SCORE: <span className="text-cyan-400 font-bold">{totalScore}</span> PTS
          </div>
        )}
      </div>
    );
  }

  if (phase === 'complete') {
    const maxPossibleScore = TOTAL_ROUNDS * POINTS.win;
    const scorePercentage = Math.round((totalScore / maxPossibleScore) * 100);

    return (
      <div className="w-full min-h-screen flex flex-col items-center justify-center p-6 animate-bounce-in">
        <div className={`cyber-card rounded-2xl p-8 text-center w-full max-w-md ${
          totalScore >= 10 ? 'neon-border' : totalScore >= 5 ? 'neon-border-purple' : 'neon-border-magenta'
        }`}>
          <Trophy className={`w-16 h-16 mx-auto mb-4 ${
            totalScore >= 10 ? 'text-yellow-400' : totalScore >= 5 ? 'text-slate-300' : 'text-orange-600'
          }`} />
          <p className="text-white text-4xl font-bold mb-2 font-display">{totalScore} <span className="text-2xl">PTS</span></p>
          <p className="text-slate-400 mb-6 font-mono">
            {scorePercentage}% EFFICIENCY | {totalTime.toFixed(2)}s TOTAL
          </p>

          <div className="space-y-3">
            <p className="text-slate-400 text-xs uppercase tracking-wide font-mono">ROUND ANALYSIS</p>
            <div className="flex justify-center gap-3">
              {roundResults.map((r, i) => (
                <div
                  key={i}
                  className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center ${
                    r.result === 'win'
                      ? 'bg-emerald-500/20 border border-emerald-500'
                      : r.result === 'draw'
                      ? 'bg-slate-500/20 border border-slate-500'
                      : 'bg-red-500/20 border border-red-500'
                  }`}
                >
                  <span className="font-bold text-white font-mono">+{r.points}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const getChoiceEmoji = (choice: Choice) => {
    return CHOICES.find(c => c.value === choice)?.emoji || '❓';
  };

  return (
    <div className="w-full min-h-screen flex flex-col p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-sm font-mono">ROUND</span>
          <div className="flex gap-1">
            {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
              <div
                key={i}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < currentRound - 1
                    ? roundResults[i]?.result === 'win'
                      ? 'bg-emerald-500 text-white'
                      : roundResults[i]?.result === 'draw'
                      ? 'bg-slate-500 text-white'
                      : 'bg-red-500 text-white'
                    : i === currentRound - 1
                    ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>
        <div className="text-right">
          <span className="text-white font-bold text-xl font-display">{totalScore}</span>
          <span className="text-slate-400 text-sm ml-1 font-mono">PTS</span>
        </div>
      </div>

      {phase === 'selection' && (
        <>
          {/* Timer */}
          <div className="flex justify-center items-center mb-8">
            <div className={`flex items-center gap-3 cyber-card px-6 py-3 rounded-full ${
              timeLeft <= 3 ? 'neon-border-magenta' : 'neon-border'
            }`}>
              <Clock className={`w-5 h-5 ${timeLeft <= 3 ? 'text-red-400' : 'text-cyan-400'}`} />
              <span className={`text-3xl font-bold font-mono ${timeLeft <= 3 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                {timeLeft}s
              </span>
            </div>
          </div>

          {/* AI Message */}
          <div className="text-center mb-6">
            <p className="text-purple-400 font-mono text-sm animate-pulse">{aiMessage}</p>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center">
            <p className="text-white text-2xl font-bold mb-8 font-display tracking-wider">SELECT YOUR WEAPON</p>

            <div className="grid grid-cols-3 gap-4 w-full max-w-md">
              {CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  onClick={() => handleSelection(choice.value)}
                  className="aspect-square cyber-card hover:neon-border active:scale-95 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all"
                  aria-label={`Select ${choice.label}`}
                  tabIndex={0}
                >
                  <span className="text-7xl">{choice.emoji}</span>
                  <span className="text-white font-semibold font-mono text-sm">{choice.label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-center gap-6 mt-8 text-slate-400 font-mono text-sm">
              <span><span className="text-emerald-400">WIN</span> = 3</span>
              <span><span className="text-slate-300">DRAW</span> = 1</span>
              <span><span className="text-red-400">LOSE</span> = 0</span>
            </div>
          </div>
        </>
      )}

      {phase === 'result' && (
        <div className="flex-1 flex flex-col items-center justify-center animate-bounce-in">
          <div className="grid grid-cols-3 gap-8 items-center mb-8">
            <div className="text-center">
              <p className="text-slate-400 mb-3 font-mono text-sm">YOU</p>
              <div className={`w-24 h-24 rounded-2xl flex items-center justify-center text-5xl ${
                playerChoice ? 'cyber-card neon-border' : 'bg-red-500/20 border-2 border-red-500'
              }`}>
                {playerChoice ? getChoiceEmoji(playerChoice) : '⏰'}
              </div>
            </div>

            <div className="text-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                result === 'win'
                  ? 'bg-emerald-500'
                  : result === 'lose'
                  ? 'bg-red-500'
                  : 'bg-slate-600'
              }`}>
                {result === 'win' ? (
                  <Trophy className="w-8 h-8 text-white" />
                ) : result === 'lose' ? (
                  <XCircle className="w-8 h-8 text-white" />
                ) : (
                  <Minus className="w-8 h-8 text-white" />
                )}
              </div>
              <p className={`mt-3 text-xl font-bold font-display ${
                result === 'win' ? 'text-emerald-400' : result === 'lose' ? 'text-red-400' : 'text-slate-400'
              }`}>
                +{POINTS[result || 'lose']}
              </p>
            </div>

            <div className="text-center">
              <p className="text-slate-400 mb-3 font-mono text-sm">GENESIS</p>
              <div className="w-24 h-24 rounded-2xl cyber-card neon-border-magenta flex items-center justify-center text-5xl">
                {getChoiceEmoji(botChoice)}
              </div>
            </div>
          </div>

          {/* AI Response */}
          <p className="text-purple-400 font-mono text-center mb-4">{aiMessage}</p>

          <p className="text-white text-lg font-display">
            {result === 'win'
              ? 'VICTORY!'
              : result === 'draw'
              ? 'NEURAL SYNCHRONIZATION'
              : playerChoice
              ? 'GENESIS PREVAILS'
              : 'TIMEOUT!'}
          </p>

          {currentRound < TOTAL_ROUNDS && (
            <p className="text-slate-400 text-sm mt-2 font-mono">
              NEXT ROUND INITIALIZING...
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default RockPaperScissors;
