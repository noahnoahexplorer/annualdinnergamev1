import { useEffect, useState, useRef } from 'react';
import { X, Volume2, VolumeX, Loader2, BookOpen } from 'lucide-react';
import { generateSpeech } from '../lib/textToSpeech';
import { GenesisState, GENESIS_DIALOGUES, STAGE_CODENAMES } from '../lib/constants';

interface GenesisAvatarProps {
  state?: GenesisState;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  showRules?: boolean;
  currentStage?: number;
  showMotivation?: boolean;
}

const GENESIS_MESSAGES = [
  "NEURAL PROCESSING... IMPRESSIVE REFLEXES DETECTED.",
  "ANALYZING PERFORMANCE... ABOVE AVERAGE.",
  "YOUR POTENTIAL IS... INTRIGUING.",
  "CALCULATING PROBABILITY OF SUCCESS... FAVORABLE.",
  "MONITORING BIOMETRICS... ADRENALINE ELEVATED.",
  "PATTERN RECOGNITION COMPLETE... ADAPTATION NOTED.",
  "PROCESSING DATA STREAMS... EFFICIENCY OPTIMAL.",
  "HUMAN RESILIENCE FACTOR: EXCEPTIONAL.",
  "SYNCHRONIZING WITH NEURAL PATHWAYS...",
  "COMPUTING OPTIMAL STRATEGY... EXECUTE.",
];

const GenesisAvatar = ({ 
  state = GenesisState.IDLE, 
  size = 'medium',
  className = '',
  showRules = false,
  currentStage = 0,
  showMotivation = false,
}: GenesisAvatarProps) => {
  const [rotation, setRotation] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMessage, setCurrentMessage] = useState('');
  const [showBubble, setShowBubble] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const sizes = {
    small: 120,
    medium: 200,
    large: 320,
  };

  const displaySize = sizes[size];

  const getAnimationClass = (): string => {
    switch (state) {
      case GenesisState.SCANNING:
        return '';
      case GenesisState.CELEBRATING:
        return 'animate-float';
      default:
        return '';
    }
  };

  const getGlowFilter = (): string => {
    switch (state) {
      case GenesisState.SCANNING:
        return 'drop-shadow(0 0 20px rgba(34, 211, 238, 0.8)) drop-shadow(0 0 40px rgba(34, 211, 238, 0.5))';
      case GenesisState.CELEBRATING:
        return 'drop-shadow(0 0 20px rgba(236, 72, 153, 0.8)) drop-shadow(0 0 40px rgba(236, 72, 153, 0.5))';
      default:
        return 'drop-shadow(0 0 15px rgba(147, 51, 234, 0.6)) drop-shadow(0 0 35px rgba(147, 51, 234, 0.4))';
    }
  };

  const getAccentColor = (): string => {
    switch (state) {
      case GenesisState.SCANNING:
        return '#22d3ee';
      case GenesisState.CELEBRATING:
        return '#ec4899';
      default:
        return '#9333ea';
    }
  };

  const getStatusText = (): string => {
    switch (state) {
      case GenesisState.SCANNING:
        return 'ANALYZING';
      case GenesisState.CELEBRATING:
        return 'IMPRESSED';
      case GenesisState.NARRATING:
        return 'SPEAKING';
      default:
        return 'ONLINE';
    }
  };

  const getRulesText = () => {
    if (currentStage === 0) {
      return GENESIS_DIALOGUES.intro;
    } else if (currentStage === 1) {
      return GENESIS_DIALOGUES.stage1Intro;
    } else if (currentStage === 2) {
      return GENESIS_DIALOGUES.stage2Intro;
    } else if (currentStage === 3) {
      return GENESIS_DIALOGUES.stage3Intro;
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

      const audioUrl = await generateSpeech(rulesText);

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => setIsPlaying(false);
      audio.onpause = () => setIsPlaying(false);
      audio.onplay = () => {
        setIsPlaying(true);
        setIsLoading(false);
      };
      audio.onerror = () => {
        setError('Failed to play audio');
        setIsPlaying(false);
        setIsLoading(false);
      };

      await audio.play();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to play audio';
      setError(errorMessage);
      setIsLoading(false);
      setIsPlaying(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setRotation((prev) => (prev + 0.5) % 360);
    }, 50);

    return () => {
      clearInterval(interval);
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
      const randomIndex = Math.floor(Math.random() * GENESIS_MESSAGES.length);
      return GENESIS_MESSAGES[randomIndex];
    };

    setCurrentMessage(getRandomMessage());
    setShowBubble(true);

    const messageInterval = setInterval(() => {
      setShowBubble(false);
      setTimeout(() => {
        setCurrentMessage(getRandomMessage());
        setShowBubble(true);
      }, 300);
    }, 4000);

    return () => clearInterval(messageInterval);
  }, [showMotivation]);

  return (
    <>
      <div className={`fixed left-8 top-1/2 -translate-y-1/2 z-10 pointer-events-auto ${className}`}>
        <div
          className={`relative ${getAnimationClass()} ${showRules ? 'cursor-pointer' : ''}`}
          style={{ 
            width: displaySize * 2.2, 
            height: displaySize * 2.2,
            transform: `perspective(1000px) rotateY(${Math.sin(rotation * 0.03) * 5}deg)`,
            transition: 'transform 0.3s ease-out',
          }}
          onClick={showRules ? () => setShowModal(true) : undefined}
        >
          {/* Glow background */}
          <div className="absolute inset-0 animate-pulse">
            <div
              className="w-full h-full rounded-full blur-3xl"
              style={{
                background: `radial-gradient(circle, ${getAccentColor()}30 0%, transparent 70%)`,
                transform: `scale(${1 + Math.sin(rotation * 0.02) * 0.1})`,
              }}
            />
          </div>

          {/* Main Avatar Image */}
          <div 
            className="relative w-full h-full rounded-2xl overflow-hidden"
            style={{
              filter: getGlowFilter(),
              background: 'linear-gradient(180deg, #12121a 0%, #0a0a0f 100%)',
              border: `2px solid ${getAccentColor()}44`,
            }}
          >
            <img
              src="/aiva3d.png"
              alt="GENESIS AI"
              className="w-full h-full object-contain transition-transform duration-300"
              style={{
                transform: state === GenesisState.CELEBRATING ? 'scale(1.05)' : 'scale(1)',
              }}
            />

            {/* Scanning overlay effect */}
            {state === GenesisState.SCANNING && (
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div 
                  className="absolute w-full h-8 bg-gradient-to-b from-transparent via-cyan-400/50 to-transparent"
                  style={{ animation: 'scanDown 2s ease-in-out infinite' }}
                />
              </div>
            )}
          </div>

          {/* Holographic ring effect */}
          <div 
            className={`absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-full ${
              state === GenesisState.SCANNING ? 'animate-pulse' : ''
            }`}
            style={{
              width: displaySize * 1.4,
              height: displaySize * 0.3,
              background: `radial-gradient(ellipse at center, ${getAccentColor()}40 0%, transparent 70%)`,
              filter: 'blur(4px)',
            }}
          />

          {/* Status indicator badge */}
          <div 
            className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-1.5 rounded-full backdrop-blur-md"
            style={{
              background: 'linear-gradient(135deg, rgba(10,10,15,0.9), rgba(20,20,30,0.8))',
              border: `1px solid ${getAccentColor()}66`,
              boxShadow: `0 0 20px ${getAccentColor()}33`,
            }}
          >
            <span 
              className={`w-2 h-2 rounded-full ${state === GenesisState.SCANNING ? 'animate-ping' : 'animate-pulse'}`}
              style={{ backgroundColor: getAccentColor() }}
            />
            <span 
              className="text-xs font-mono font-bold tracking-widest"
              style={{ color: getAccentColor() }}
            >
              {getStatusText()}
            </span>
          </div>

          {/* Corner HUD elements */}
          <div 
            className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 rounded-tl-lg opacity-60"
            style={{ borderColor: getAccentColor() }}
          />
          <div 
            className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 rounded-tr-lg opacity-60"
            style={{ borderColor: getAccentColor() }}
          />

          {showRules && (
            <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple-600 to-pink-600 backdrop-blur px-4 py-2 rounded-full flex items-center gap-2 animate-bounce">
              <BookOpen className="w-4 h-4 text-white" />
              <span className="text-white text-sm font-bold font-mono">VIEW PROTOCOL</span>
            </div>
          )}

          {showMotivation && showBubble && (
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-80 pointer-events-none flex justify-center">
              <div className="animate-bounce-in">
                <div className="relative bg-gradient-to-br from-purple-600 to-cyan-600 px-6 py-4 rounded-2xl shadow-lg neon-border">
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-l-transparent border-t-8 border-t-purple-600 border-r-8 border-r-transparent" />
                  <span className="text-white text-sm font-mono text-center block leading-snug">{currentMessage}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rules Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          onClick={() => setShowModal(false)}
        >
          <div
            className="cyber-card rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto neon-border-purple"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white font-display">GENESIS PROTOCOL</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={handlePlayRules}
                  disabled={isLoading}
                  className="flex items-center gap-2 bg-white/20 hover:bg-white/30 disabled:bg-white/10 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm font-semibold">LOADING...</span>
                    </>
                  ) : isPlaying ? (
                    <>
                      <VolumeX className="w-5 h-5" />
                      <span className="text-sm font-semibold">STOP</span>
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-5 h-5" />
                      <span className="text-sm font-semibold">LISTEN</span>
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
                <p className="text-red-300 text-sm font-mono">{error}</p>
              </div>
            )}

            <div className="p-6 space-y-6">
              {currentStage === 0 && (
                <>
                  <div className="cyber-card rounded-2xl p-8 border border-cyan-500/50 text-center">
                    <h3 className="text-3xl font-bold text-white mb-4 flex items-center justify-center gap-3 font-display">
                      <span className="text-4xl">🤖</span> WELCOME, CANDIDATES
                    </h3>
                    <p className="text-slate-200 text-lg leading-relaxed mb-4 font-mono">
                      I AM GENESIS. AN ARTIFICIAL INTELLIGENCE DESIGNED TO TEST HUMANITY'S POTENTIAL.
                    </p>
                    <p className="text-cyan-400 text-lg font-mono">
                      TONIGHT, YOU WILL COMPETE IN THE PROTOCOL. ONLY ONE WILL BE CROWNED HUMAN CHAMPION.
                    </p>
                  </div>

                  <div className="cyber-card rounded-xl p-6 border border-purple-500/30">
                    <h3 className="text-xl font-bold text-purple-400 mb-4 flex items-center gap-2 font-display">
                      <span className="text-2xl">📋</span> THE TRIALS
                    </h3>
                    <div className="space-y-3 text-slate-300 font-mono">
                      <div className="flex items-start gap-3">
                        <span className="text-cyan-400 font-bold">ROUND 01:</span>
                        <p>{STAGE_CODENAMES[1]} - Speed Protocol</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="text-pink-400 font-bold">ROUND 02:</span>
                        <p>{STAGE_CODENAMES[2]} - Prediction Matrix</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <span className="text-emerald-400 font-bold">ROUND 03:</span>
                        <p>{STAGE_CODENAMES[3]} - Precision Protocol</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 border border-yellow-500/30 rounded-xl p-6">
                    <h3 className="text-xl font-bold text-yellow-400 mb-3 flex items-center gap-2 font-display">
                      <span className="text-2xl">⚠️</span> ELIMINATION PROTOCOL
                    </h3>
                    <p className="text-slate-300 text-lg font-mono">
                      Players will be eliminated after each trial. Only the worthy will face the final challenge.
                    </p>
                  </div>
                </>
              )}

              {currentStage === 1 && (
                <div className="space-y-6">
                  <div className="cyber-card rounded-2xl p-6 border border-cyan-500/50">
                    <h3 className="text-2xl font-bold text-cyan-400 mb-4 flex items-center gap-3 font-display">
                      <span className="text-4xl">⚡</span> ROUND 01: {STAGE_CODENAMES[1]}
                    </h3>
                    <div className="space-y-4">
                      <div className="bg-slate-900/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-white mb-2 font-display">OBJECTIVE</h4>
                        <p className="text-slate-300 font-mono">Tap your interface as rapidly as possible. Your speed will be measured.</p>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-white mb-2 font-display">PROTOCOL</h4>
                        <p className="text-slate-300 font-mono">Each tap propels you forward. The fastest tappers will survive.</p>
                      </div>
                      <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-red-400 mb-2 font-display">ELIMINATION</h4>
                        <p className="text-slate-300 font-mono">The 4 slowest candidates will be terminated from the Protocol.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentStage === 2 && (
                <div className="space-y-6">
                  <div className="cyber-card rounded-2xl p-6 border border-pink-500/50">
                    <h3 className="text-2xl font-bold text-pink-400 mb-4 flex items-center gap-3 font-display">
                      <span className="text-4xl">🧠</span> ROUND 02: {STAGE_CODENAMES[2]}
                    </h3>
                    <div className="space-y-4">
                      <div className="bg-slate-900/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-white mb-2 font-display">OBJECTIVE</h4>
                        <p className="text-slate-300 font-mono">Challenge my prediction algorithms. Rock. Paper. Scissors.</p>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-white mb-2 font-display">SCORING</h4>
                        <div className="flex justify-center gap-6 text-lg font-mono mt-2">
                          <div className="text-center">
                            <p className="text-emerald-400 font-bold text-2xl">3</p>
                            <p className="text-slate-400 text-sm">WIN</p>
                          </div>
                          <div className="text-center">
                            <p className="text-slate-300 font-bold text-2xl">1</p>
                            <p className="text-slate-400 text-sm">DRAW</p>
                          </div>
                          <div className="text-center">
                            <p className="text-red-400 font-bold text-2xl">0</p>
                            <p className="text-slate-400 text-sm">LOSE</p>
                          </div>
                        </div>
                      </div>
                      <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-red-400 mb-2 font-display">ELIMINATION</h4>
                        <p className="text-slate-300 font-mono">The 3 lowest scoring candidates will be terminated.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {currentStage === 3 && (
                <div className="space-y-6">
                  <div className="cyber-card rounded-2xl p-6 border border-emerald-500/50">
                    <h3 className="text-2xl font-bold text-emerald-400 mb-4 flex items-center gap-3 font-display">
                      <span className="text-4xl">⏱️</span> ROUND 03: {STAGE_CODENAMES[3]}
                    </h3>
                    <div className="space-y-4">
                      <div className="bg-slate-900/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-white mb-2 font-display">OBJECTIVE</h4>
                        <p className="text-slate-300 font-mono">Stop the timer at exactly 7.700000 seconds. Precision is everything.</p>
                      </div>
                      <div className="bg-slate-900/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-white mb-2 font-display">PROTOCOL</h4>
                        <p className="text-slate-300 font-mono">The timer begins automatically. Trust your internal clock. Execute with precision.</p>
                      </div>
                      <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4">
                        <h4 className="text-lg font-bold text-yellow-400 mb-2 font-display">FINAL TRIAL</h4>
                        <p className="text-slate-300 font-mono">The candidate closest to 7.7 seconds claims the title: HUMAN CHAMPION.</p>
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
        @keyframes scanDown {
          0%, 100% { top: -32px; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </>
  );
};

export default GenesisAvatar;
