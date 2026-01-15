import { useEffect, useState, useRef } from 'react';
import { getModelUrl } from '../lib/modelStorage';
import { X, Info, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { generateSpeech } from '../lib/textToSpeech';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        src?: string;
        alt?: string;
        'auto-rotate'?: boolean;
        'camera-controls'?: boolean;
        'shadow-intensity'?: string;
        'exposure'?: string;
        'environment-image'?: string;
        style?: React.CSSProperties;
      }, HTMLElement>;
    }
  }
}

interface AnimatedMascotProps {
  showRules?: boolean;
  currentStage?: number;
  showMotivation?: boolean;
}

const MOTIVATION_MESSAGES = [
  "Amazing work! Keep that energy up! 💪✨",
  "Incredible performance! Unstoppable! 🔥🚀",
  "Unmatched speed! Keep going strong! ⚡💨",
  "Wow! Absolutely crushing it right now! 🎯💥",
  "Nothing stopping this momentum! On fire! 🔥🌟",
  "Lightning fast reflexes! Natural talent! ⚡✨",
  "Momentum is building! Killing it! 🚀💪",
  "Beast mode activated! This is the moment! 💥🐯",
  "Making this look easy! Outstanding! 🌟😎",
  "Pure excellence! Phenomenal skills! 💎🏆",
  "The magic touch is real! Keep it up! 🪄✨",
  "Quick and precise! Absolutely amazing! 🎯⚡",
  "Mind-blowing performance! Incredible! 🤯🎊",
  "Pure magic happening right now! 🪄💫",
  "Legendary performance! Simply the best! 👑🏆",
  "Spot on every single time! Perfect! 🎯✨",
  "Fierce and focused! Truly unstoppable! 🐯💪",
  "Shining like a superstar! Keep going! ⭐🌟",
  "Brilliant moves! Absolutely nailing it! 💡🎯",
  "Epic skills on display! What a champion! 🏅🔥",
  "Gaming skills are next level! Amazing! 🎮🚀",
  "This is insane! Dominating right now! 🤩💥",
  "Flawless execution! True professional! 💎👏",
  "Power moves only! Showing everyone how! 💪🔥",
  "Top tier performance! Champion material! 🥇🏆",
  "Godlike skills! Absolutely perfect! 👼✨",
  "Spectacular work! Energy is incredible! 🎆🌟",
  "Pure dynamite! Explosive performance! 💣💥",
  "Champion mindset! Built different! 🏆💪",
  "This is unreal! Making history here! 🌈🎉",
  "Blazing through like a comet! So fast! ☄️⚡",
  "Rocket speed! Flying through this! 🚀💨",
  "Talent is shining bright! Mega moves! 🌟💫",
  "Incredible focus and skill! The best! 🎯🏆",
  "Outstanding effort! Truly exceptional! 🌟👏"
];

export default function AnimatedMascot({ showRules = false, currentStage = 0, showMotivation = false }: AnimatedMascotProps) {
  const [rotation, setRotation] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMessage, setCurrentMessage] = useState('');
  const [showBubble, setShowBubble] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const modelUrl = getModelUrl('mascot-1768402475510.glb');

  const getRulesText = () => {
    if (currentStage === 0) {
      return `Hey there, champions! Welcome to the ultimate game challenge!

      Get ready for an exciting competition! You'll be playing 3 amazing mini-games, and after each stage, some players will be eliminated. Only the best will make it to the end, and the top 3 players will be crowned as winners!

      But that's not all - the very best player who comes out on top will earn the golden crown! Are you ready to show everyone what you're made of?

      Stay focused, give it your all, and may the best player win! Let's have an amazing game!`;
    } else if (currentStage === 1) {
      return `Alright everyone, are you ready for Stage 1? Let's get pumped!

      Here we go with Tap to Run! This is where the action begins! Your mission is simple but challenging - tap that screen as fast as you possibly can to make your character zoom to the finish line!

      Every single tap moves your character forward. The more you tap, the faster you run! It's all about that finger speed! Think of it like you're running a real race, but with your fingers doing all the work!

      Now here's the important part - after this stage, the 4 slowest players will be eliminated. That's right, only the fastest tappers move on! So dig deep, find that inner speed demon, and show us what you've got!

      Get those fingers ready, take a deep breath, and when that countdown hits zero... TAP LIKE YOUR LIFE DEPENDS ON IT! Let's go!`;
    } else if (currentStage === 2) {
      return `Welcome to Stage 2, everyone! Are you ready to test your brainpower? Let's do this!

      Time for Guess the Image! This is where things get interesting! You're going to see 10 different images pop up on your screen, one after another. Your job? Figure out what they are and pick the right answer as fast as possible!

      Here's the deal - it's not just about getting them right, you also need to be quick! The faster you answer correctly, the higher your score! Speed and accuracy working together - that's the winning formula!

      Take a good look at each image, trust your instincts, and make your choice! Don't overthink it, but don't rush blindly either. Find that perfect balance!

      And remember, after this round, the 3 players with the lowest scores won't be moving forward. So bring your A-game, stay focused, and show us how smart and fast you really are! You've got this! Good luck!`;
    } else if (currentStage === 3) {
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
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const rulesText = getRulesText();

      console.log('Fetching audio for text:', rulesText.substring(0, 50) + '...');
      const audioUrl = await generateSpeech(rulesText);

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPlaying(false);
        console.log('Audio playback ended');
      };

      audio.onpause = () => {
        setIsPlaying(false);
        console.log('Audio playback paused');
      };

      audio.onplay = () => {
        setIsPlaying(true);
        setIsLoading(false);
        console.log('Audio playback started');
      };

      audio.onerror = (e) => {
        console.error('Audio playback error:', e);
        setError('Failed to play audio');
        setIsPlaying(false);
        setIsLoading(false);
      };

      console.log('Starting audio playback...');
      await audio.play();
    } catch (error) {
      console.error('Failed to generate or play audio:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to play audio';
      setError(errorMessage);
      setIsLoading(false);
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.3.0/model-viewer.min.js';
    document.head.appendChild(script);

    const interval = setInterval(() => {
      setRotation((prev) => (prev + 0.5) % 360);
    }, 50);

    return () => {
      clearInterval(interval);
      document.head.removeChild(script);
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
    setError(null);
  }, [showModal, currentStage]);

  useEffect(() => {
    if (!showMotivation) {
      setShowBubble(false);
      return;
    }

    const getRandomMessage = () => {
      const randomIndex = Math.floor(Math.random() * MOTIVATION_MESSAGES.length);
      return MOTIVATION_MESSAGES[randomIndex];
    };

    setCurrentMessage(getRandomMessage());
    setShowBubble(true);

    const messageInterval = setInterval(() => {
      setShowBubble(false);
      setTimeout(() => {
        setCurrentMessage(getRandomMessage());
        setShowBubble(true);
      }, 300);
    }, 3000);

    return () => {
      clearInterval(messageInterval);
    };
  }, [showMotivation]);

  return (
    <>
      <div className="fixed left-12 top-1/2 -translate-y-1/2 z-10 pointer-events-auto">
        <div
          className={`relative w-[450px] h-[450px] animate-float ${showRules ? 'cursor-pointer' : ''}`}
          style={{
            transform: `perspective(1000px) rotateY(${Math.sin(rotation * 0.05) * 10}deg)`,
            transition: 'transform 0.3s ease-out',
          }}
          onClick={showRules ? () => setShowModal(true) : undefined}
        >
          <div className="absolute inset-0 animate-pulse-slow">
            <div
              className="w-full h-full bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-full blur-3xl"
              style={{
                transform: `scale(${1 + Math.sin(rotation * 0.02) * 0.1})`,
              }}
            />
          </div>

          <div className="relative w-full h-full">
            <model-viewer
              src={modelUrl}
              alt="3D Mascot"
              auto-rotate
              camera-controls
              shadow-intensity="1"
              exposure="1"
              style={{
                width: '100%',
                height: '100%',
              }}
            />
          </div>

          {showRules && (
            <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 bg-sky-500/90 backdrop-blur px-4 py-2 rounded-full flex items-center gap-2 animate-bounce">
              <Info className="w-4 h-4 text-white" />
              <span className="text-white text-sm font-bold">Click for Rules</span>
            </div>
          )}

          {showMotivation && showBubble && (
            <div className="absolute -top-28 left-1/2 -translate-x-1/2 w-80 pointer-events-none flex justify-center">
              <div className="animate-bubble-pop">
                <div className="relative bg-gradient-to-br from-emerald-500 to-sky-500 px-6 py-4 rounded-2xl shadow-lg">
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-l-transparent border-t-8 border-t-emerald-500 border-r-8 border-r-transparent" />
                  <span className="text-white text-base font-bold text-center block leading-snug">{currentMessage}</span>
                </div>
              </div>
            </div>
          )}

          <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-48 h-10 bg-slate-900/40 rounded-full blur-xl animate-shadow" />
        </div>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setShowModal(false)}
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
                  disabled={isLoading}
                  className="flex items-center gap-2 bg-white/20 hover:bg-white/30 disabled:bg-white/10 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm font-semibold">Loading...</span>
                    </>
                  ) : isPlaying ? (
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
                  onClick={() => setShowModal(false)}
                  className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {error && (
              <div className="mx-6 mt-4 bg-red-500/20 border border-red-500 rounded-lg p-4">
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}

            <div className="p-6 space-y-6">
              {currentStage === 0 && (
                <>
                  <div className="bg-gradient-to-br from-sky-500/20 to-emerald-500/20 rounded-2xl p-8 border-2 border-sky-500/50 text-center">
                    <h3 className="text-3xl font-bold text-white mb-4 flex items-center justify-center gap-3">
                      <span className="text-4xl">🎮</span> Welcome Champions!
                    </h3>
                    <p className="text-slate-200 text-lg leading-relaxed mb-6">
                      Get ready for an exciting competition featuring 3 amazing mini-games!
                    </p>
                  </div>

                  <div className="bg-slate-700/50 rounded-xl p-6 border border-sky-500/30">
                    <h3 className="text-xl font-bold text-sky-400 mb-4 flex items-center gap-2">
                      <span className="text-2xl">📋</span> How It Works
                    </h3>
                    <div className="space-y-3 text-slate-300">
                      <div className="flex items-start gap-3">
                        <span className="text-emerald-400 font-bold">1.</span>
                        <p>Play through 3 challenging mini-games</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="text-emerald-400 font-bold">2.</span>
                        <p>Players are eliminated after each stage</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="text-emerald-400 font-bold">3.</span>
                        <p>Only the best make it to the end</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border border-yellow-500/30 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-yellow-400 mb-3 flex items-center gap-2">
                      <span className="text-2xl">🏆</span> Victory
                    </h3>
                    <p className="text-slate-300 text-lg">
                      Top 3 players win, but only the best earns the crown!
                    </p>
                  </div>

                  <div className="bg-gradient-to-br from-emerald-500/10 to-sky-500/10 rounded-xl p-6 border border-emerald-500/30 text-center">
                    <p className="text-white text-lg font-semibold">
                      Rules for each stage will be explained before it begins. Good luck!
                    </p>
                  </div>
                </>
              )}

              {currentStage === 1 && (
                <div className="space-y-6">
                  <div className="bg-gradient-to-r from-emerald-500/10 to-emerald-600/10 border-2 border-emerald-500/50 rounded-2xl p-6">
                    <h3 className="text-2xl font-bold text-emerald-400 mb-4 flex items-center gap-3">
                      <span className="text-4xl">🏃</span> Stage 1: Tap to Run
                    </h3>
                    <div className="space-y-4">
                      <div className="bg-slate-900/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-white mb-2">Objective</h4>
                        <p className="text-slate-300">Tap the screen as fast as you can to make your character run to the finish line!</p>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-white mb-2">How to Play</h4>
                        <p className="text-slate-300">Each tap moves your character forward. The faster you tap, the faster you run!</p>
                      </div>
                      <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-red-400 mb-2">Elimination</h4>
                        <p className="text-slate-300">The 4 slowest players will be eliminated after this stage.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentStage === 2 && (
                <div className="space-y-6">
                  <div className="bg-gradient-to-r from-orange-500/10 to-orange-600/10 border-2 border-orange-500/50 rounded-2xl p-6">
                    <h3 className="text-2xl font-bold text-orange-400 mb-4 flex items-center gap-3">
                      <span className="text-4xl">🖼️</span> Stage 2: Guess the Image
                    </h3>
                    <div className="space-y-4">
                      <div className="bg-slate-900/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-white mb-2">Objective</h4>
                        <p className="text-slate-300">Identify 10 images correctly as quickly as possible!</p>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-white mb-2">How to Play</h4>
                        <p className="text-slate-300">Look at each image and select the correct answer from the options provided. Speed and accuracy both matter!</p>
                      </div>
                      <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-red-400 mb-2">Elimination</h4>
                        <p className="text-slate-300">The 3 players with the lowest scores will be eliminated after this stage.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentStage === 3 && (
                <div className="space-y-6">
                  <div className="bg-gradient-to-r from-sky-500/10 to-sky-600/10 border-2 border-sky-500/50 rounded-2xl p-6">
                    <h3 className="text-2xl font-bold text-sky-400 mb-4 flex items-center gap-3">
                      <span className="text-4xl">⏱️</span> Stage 3: Stop at 7.7s
                    </h3>
                    <div className="space-y-4">
                      <div className="bg-slate-900/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-white mb-2">Objective</h4>
                        <p className="text-slate-300">Stop the timer as close to exactly 7.70 seconds as possible!</p>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-white mb-2">How to Play</h4>
                        <p className="text-slate-300">The timer will start automatically. Tap to stop it when you think 7.70 seconds have passed. Precision is everything!</p>
                      </div>
                      <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-yellow-400 mb-2">Final Round</h4>
                        <p className="text-slate-300">This is the final stage! The player closest to 7.70 seconds wins the game!</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(-10px);
          }
          50% {
            transform: translateY(10px);
          }
        }

        @keyframes bounce-gentle {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-8px);
          }
        }

        @keyframes pulse-slow {
          0%, 100% {
            opacity: 0.6;
          }
          50% {
            opacity: 0.3;
          }
        }

        @keyframes shadow {
          0%, 100% {
            transform: translateX(-50%) scale(1);
            opacity: 0.3;
          }
          50% {
            transform: translateX(-50%) scale(0.8);
            opacity: 0.2;
          }
        }

        @keyframes bubble-pop {
          0% {
            transform: scale(0) rotate(-10deg);
            opacity: 0;
          }
          50% {
            transform: scale(1.1) rotate(2deg);
          }
          100% {
            transform: scale(1) rotate(0deg);
            opacity: 1;
          }
        }

        .animate-float {
          animation: float 4s ease-in-out infinite;
        }

        .animate-bounce-gentle {
          animation: bounce-gentle 3s ease-in-out infinite;
        }

        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }

        .animate-shadow {
          animation: shadow 4s ease-in-out infinite;
        }

        .animate-bubble-pop {
          animation: bubble-pop 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
      `}</style>
    </>
  );
}
