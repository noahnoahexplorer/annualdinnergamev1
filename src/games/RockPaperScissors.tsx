import { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, Trophy, XCircle, Minus } from 'lucide-react';
import { supabase, type Player } from '../lib/supabase';

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
  isActive: boolean;
  onComplete: (score: number, time?: number) => void;
};

const TOTAL_ROUNDS = 5;
const COUNTDOWN_DURATION = 5;
const SELECTION_DURATION = 10;
const RESULT_DISPLAY_DURATION = 3;

const POINTS = {
  win: 3,
  draw: 1,
  lose: 0,
};

const CHOICES: { value: Choice; emoji: string; label: string }[] = [
  { value: 'rock', emoji: '✊', label: 'Rock' },
  { value: 'paper', emoji: '🖐️', label: 'Paper' },
  { value: 'scissors', emoji: '✌️', label: 'Scissors' },
];

const getResult = (player: Choice, bot: Choice): Result => {
  if (!player || !bot) return 'lose';
  if (player === bot) return 'draw';
  if (
    (player === 'rock' && bot === 'scissors') ||
    (player === 'paper' && bot === 'rock') ||
    (player === 'scissors' && bot === 'paper')
  ) {
    return 'win';
  }
  return 'lose';
};

const getBotChoice = (): Choice => {
  const choices: Choice[] = ['rock', 'paper', 'scissors'];
  return choices[Math.floor(Math.random() * 3)];
};

export default function RockPaperScissors({ player, isActive, onComplete }: Props) {
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
  const hasCompleted = useRef(false);

  const updateProgress = useCallback(async (round: number, score: number, time: number, status: 'waiting' | 'playing' | 'finished', roundResults: string = '') => {
    try {
      const progress = Math.round((round / TOTAL_ROUNDS) * 100);

      await supabase
        .from('player_progress')
        .upsert({
          player_id: player.id,
          game_session_id: player.game_session_id,
          stage: 2,
          progress,
          elapsed_time: time,
          status,
          round_results: roundResults,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'player_id,game_session_id,stage' });

      if (round > 0) {
        await supabase
          .from('stage_scores')
          .upsert({
            player_id: player.id,
            game_session_id: player.game_session_id,
            stage: 2,
            score: score,
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
          onComplete(newTotalScore, newTotalTime);
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
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-slate-400 text-lg">Waiting for game to start...</p>
      </div>
    );
  }

  if (phase === 'countdown') {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <div className="mb-4 flex items-center gap-4">
          <span className="text-slate-400 text-lg">Round</span>
          <div className="flex gap-1">
            {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  i < currentRound - 1
                    ? roundResults[i]?.result === 'win'
                      ? 'bg-emerald-500 text-white'
                      : roundResults[i]?.result === 'draw'
                      ? 'bg-slate-500 text-white'
                      : 'bg-red-500 text-white'
                    : i === currentRound - 1
                    ? 'bg-orange-500 text-white ring-2 ring-orange-300'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>

        <p className="text-slate-400 text-xl mb-4">Round {currentRound} starting!</p>
        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-orange-500 to-yellow-500 flex items-center justify-center shadow-2xl shadow-orange-500/30">
          <span className="text-white text-6xl font-bold">{countdown}</span>
        </div>
        <p className="text-white text-lg font-semibold mt-6">Get Ready!</p>

        {totalScore > 0 && (
          <div className="mt-4 text-slate-400">
            Current Score: <span className="text-white font-bold">{totalScore}</span> points
          </div>
        )}
      </div>
    );
  }

  if (phase === 'complete') {
    const maxPossibleScore = TOTAL_ROUNDS * POINTS.win;
    const scorePercentage = Math.round((totalScore / maxPossibleScore) * 100);

    return (
      <div className="w-full h-full flex flex-col items-center justify-center animate-bounce-in p-4">
        <div className={`border rounded-2xl p-6 text-center w-full max-w-md ${
          totalScore >= 10
            ? 'bg-emerald-500/20 border-emerald-500/50'
            : totalScore >= 5
            ? 'bg-yellow-500/20 border-yellow-500/50'
            : 'bg-red-500/20 border-red-500/50'
        }`}>
          <Trophy className={`w-12 h-12 mx-auto mb-3 ${
            totalScore >= 10 ? 'text-yellow-400' : totalScore >= 5 ? 'text-slate-300' : 'text-orange-600'
          }`} />
          <p className="text-white text-3xl font-bold mb-1">{totalScore} Points</p>
          <p className="text-slate-400 text-sm mb-4">
            {scorePercentage}% score | {totalTime.toFixed(2)}s total time
          </p>

          <div className="space-y-2">
            <p className="text-slate-400 text-xs uppercase tracking-wide">Round Results</p>
            <div className="flex justify-center gap-2">
              {roundResults.map((r, i) => (
                <div
                  key={i}
                  className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center text-xs ${
                    r.result === 'win'
                      ? 'bg-emerald-500/30 border border-emerald-500'
                      : r.result === 'draw'
                      ? 'bg-slate-500/30 border border-slate-500'
                      : 'bg-red-500/30 border border-red-500'
                  }`}
                >
                  <span className="font-bold text-white">+{r.points}</span>
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
    <div className="w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-4 px-2">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-sm">Round</span>
          <div className="flex gap-1">
            {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
              <div
                key={i}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i < currentRound - 1
                    ? roundResults[i]?.result === 'win'
                      ? 'bg-emerald-500 text-white'
                      : roundResults[i]?.result === 'draw'
                      ? 'bg-slate-500 text-white'
                      : 'bg-red-500 text-white'
                    : i === currentRound - 1
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>
        <div className="text-right">
          <span className="text-white font-bold">{totalScore}</span>
          <span className="text-slate-400 text-sm ml-1">pts</span>
        </div>
      </div>

      {phase === 'selection' && (
        <>
          <div className="flex justify-center items-center mb-6">
            <div className="flex items-center gap-2 bg-slate-700 px-6 py-3 rounded-full">
              <Clock className={`w-5 h-5 ${timeLeft <= 3 ? 'text-red-400' : 'text-orange-400'}`} />
              <span className={`text-2xl font-bold ${timeLeft <= 3 ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                {timeLeft}s
              </span>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center">
            <p className="text-white text-2xl font-bold mb-8">Choose Your Weapon!</p>

            <div className="grid grid-cols-3 gap-4 w-full max-w-md">
              {CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  onClick={() => handleSelection(choice.value)}
                  className="aspect-square bg-slate-700 hover:bg-slate-600 active:scale-95 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all border-2 border-transparent hover:border-orange-500"
                >
                  <span className="text-6xl">{choice.emoji}</span>
                  <span className="text-white font-semibold">{choice.label}</span>
                </button>
              ))}
            </div>

            <p className="text-slate-400 mt-8 text-center">
              Win = 3pts | Draw = 1pt | Lose = 0pts
            </p>
          </div>
        </>
      )}

      {phase === 'result' && (
        <div className="flex-1 flex flex-col items-center justify-center animate-bounce-in">
          <div className="grid grid-cols-3 gap-8 items-center mb-6">
            <div className="text-center">
              <p className="text-slate-400 mb-2">You</p>
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl ${
                playerChoice ? 'bg-sky-500/20 border-2 border-sky-500' : 'bg-red-500/20 border-2 border-red-500'
              }`}>
                {playerChoice ? getChoiceEmoji(playerChoice) : '⏰'}
              </div>
            </div>

            <div className="text-center">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl ${
                result === 'win'
                  ? 'bg-emerald-500 text-white'
                  : result === 'lose'
                  ? 'bg-red-500 text-white'
                  : 'bg-slate-600 text-white'
              }`}>
                {result === 'win' ? (
                  <Trophy className="w-7 h-7" />
                ) : result === 'lose' ? (
                  <XCircle className="w-7 h-7" />
                ) : (
                  <Minus className="w-7 h-7" />
                )}
              </div>
              <p className={`mt-2 text-lg font-bold ${
                result === 'win' ? 'text-emerald-400' : result === 'lose' ? 'text-red-400' : 'text-slate-400'
              }`}>
                +{POINTS[result || 'lose']}
              </p>
            </div>

            <div className="text-center">
              <p className="text-slate-400 mb-2">Bot</p>
              <div className="w-20 h-20 rounded-2xl bg-orange-500/20 border-2 border-orange-500 flex items-center justify-center text-4xl">
                {getChoiceEmoji(botChoice)}
              </div>
            </div>
          </div>

          <p className="text-white text-lg mb-2">
            {result === 'win'
              ? 'You win this round!'
              : result === 'draw'
              ? 'It\'s a draw!'
              : playerChoice
              ? 'Bot wins this round!'
              : 'Time\'s up!'}
          </p>

          {currentRound < TOTAL_ROUNDS && (
            <p className="text-slate-400 text-sm">
              Next round starting soon...
            </p>
          )}
        </div>
      )}
    </div>
  );
}
