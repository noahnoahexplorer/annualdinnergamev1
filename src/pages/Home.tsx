import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Users, Target, Timer, Crown, ChevronRight, Sparkles } from 'lucide-react';
import { supabase, TABLES } from '../lib/supabase';
import { BrandLogo3D } from '../components/BrandLogo3D';

const ROUND_CONFIG = [
  {
    number: 1,
    title: 'ROUND 01',
    subtitle: 'SPEED PROTOCOL',
    description: 'Tap as fast as possible to complete the race',
    icon: Zap,
    players: 10,
    eliminates: 4,
    color: 'cyan',
    gradient: 'from-cyan-600 to-blue-600',
    borderColor: 'border-cyan-500/50',
    glowColor: 'rgba(6, 182, 212, 0.3)',
  },
  {
    number: 2,
    title: 'ROUND 02',
    subtitle: 'PREDICTION MATRIX',
    description: 'Rock Paper Scissors against the AI',
    icon: Target,
    players: 6,
    eliminates: 3,
    color: 'pink',
    gradient: 'from-pink-600 to-purple-600',
    borderColor: 'border-pink-500/50',
    glowColor: 'rgba(236, 72, 153, 0.3)',
  },
  {
    number: 3,
    title: 'ROUND 03',
    subtitle: 'PRECISION PROTOCOL',
    description: 'Stop the timer at exactly 7.700000 seconds',
    icon: Timer,
    players: 3,
    eliminates: 2,
    color: 'purple',
    gradient: 'from-purple-600 to-indigo-600',
    borderColor: 'border-purple-500/50',
    glowColor: 'rgba(168, 85, 247, 0.3)',
  },
];

const Home = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<number | null>(null);
  const [error, setError] = useState('');

  // Start a specific round
  const handleStartRound = async (roundNumber: number) => {
    setLoading(roundNumber);
    setError('');
    try {
      // Create a new event for this round
      const { data: eventData, error: eventError } = await supabase
        .from(TABLES.events)
        .insert({
          name: 'CYBER GENESIS',
          current_round: roundNumber,
          status: `round${roundNumber}`
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // Create session for this round
      const { data: sessionData, error: sessionError } = await supabase
        .from(TABLES.gameSessions)
        .insert({
          event_id: eventData.id,
          round_number: roundNumber,
          status: 'lobby',
          current_stage: roundNumber,
          enabled_stages: [roundNumber]
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      navigate(`/stage/${sessionData.id}`);
    } catch (err) {
      console.error('Error starting round:', err);
      setError('INITIALIZATION FAILED. RETRY.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen cyber-bg relative overflow-hidden">
      {/* Animated grid overlay */}
      <div className="grid-overlay" />
      
      {/* Scanline effect */}
      <div className="scanline" />
      
      {/* Floating particles */}
      <div className="particles">
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 8}s`,
              animationDuration: `${5 + Math.random() * 10}s`,
              opacity: 0.2 + Math.random() * 0.5,
              width: `${2 + Math.random() * 4}px`,
              height: `${2 + Math.random() * 4}px`,
            }}
          />
        ))}
      </div>

      {/* Ambient glow effects */}
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-purple-500/20 rounded-full blur-[200px] animate-pulse" />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/20 rounded-full blur-[200px] animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="fixed top-1/2 left-0 w-[400px] h-[400px] bg-pink-500/15 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '2s' }} />

      {/* Main layout - two columns */}
      <div className="relative z-10 min-h-screen flex">
        {/* Left side - 3D Logo */}
        <div className="hidden lg:flex lg:w-1/2 items-center justify-center relative">
          {/* Logo container with glow */}
          <div className="relative w-[500px] h-[500px]">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-96 h-96 bg-gradient-to-r from-pink-500/40 via-purple-500/30 to-cyan-500/40 rounded-full blur-[100px] animate-pulse" />
            </div>
            <BrandLogo3D />
          </div>
          
          {/* AIVA label */}
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 text-center">
            <div className="flex items-center gap-3 px-6 py-3 rounded-full bg-slate-900/80 backdrop-blur-sm border border-purple-500/40">
              <Sparkles className="w-5 h-5 text-purple-400 animate-pulse" />
              <span className="text-purple-400 font-mono font-bold tracking-widest">AIVA - YOUR GAME MASTER</span>
            </div>
          </div>
        </div>

        {/* Right side - Controls */}
        <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-8 lg:p-12">
          {/* Logo for mobile */}
          <div className="lg:hidden relative w-64 h-64 mb-8">
            <BrandLogo3D />
          </div>

          {/* Title */}
          <div className="text-center mb-10">
            <img 
              src="/title_CyberGenesis.png" 
              alt="Cyber Genesis" 
              className="h-24 md:h-32 object-contain mx-auto genesis-glow mb-4"
            />
            <div className="flex items-center justify-center gap-3">
              <div className="w-12 h-px bg-gradient-to-r from-transparent to-cyan-500/50" />
              <p className="text-slate-400 font-mono text-sm tracking-[0.3em]">
                EVENT ADMINISTRATOR
              </p>
              <div className="w-12 h-px bg-gradient-to-l from-transparent to-pink-500/50" />
            </div>
          </div>

          {/* Round Selection */}
          <div className="w-full max-w-lg space-y-5">
            <h2 className="text-center text-slate-500 font-mono text-xs tracking-widest mb-6">
              SELECT ROUND TO BEGIN
            </h2>

            {ROUND_CONFIG.map((round) => {
              const Icon = round.icon;
              const isLoading = loading === round.number;
              
              return (
                <button
                  key={round.number}
                  onClick={() => handleStartRound(round.number)}
                  disabled={loading !== null}
                  className="w-full group relative overflow-hidden rounded-2xl transition-all duration-300 disabled:opacity-50"
                  aria-label={`Start ${round.title}`}
                  tabIndex={0}
                >
                  <div 
                    className={`relative p-6 bg-gradient-to-r ${round.gradient} border-2 ${round.borderColor} rounded-2xl transition-all duration-300 group-hover:scale-[1.02]`}
                    style={{ boxShadow: `0 0 40px ${round.glowColor}` }}
                  >
                    {/* Shine effect */}
                    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    
                    <div className="flex items-center gap-5">
                      {/* Icon */}
                      <div className="w-16 h-16 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                        <Icon className="w-8 h-8 text-white" />
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-2xl font-display font-black text-white tracking-wide">
                            {round.title}
                          </h3>
                        </div>
                        <p className="text-white/80 font-mono text-sm font-bold mb-2">
                          {round.subtitle}
                        </p>
                        <p className="text-white/60 font-mono text-xs">
                          {round.description}
                        </p>
                      </div>
                      
                      {/* Arrow */}
                      <div className="flex flex-col items-end gap-2">
                        <ChevronRight className="w-8 h-8 text-white/70 group-hover:text-white group-hover:translate-x-1 transition-all" />
                        <div className="flex items-center gap-2 text-white/70 font-mono text-xs">
                          <Users className="w-4 h-4" />
                          <span>{round.players}</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom stats bar */}
                    <div className="mt-4 pt-4 border-t border-white/20 flex items-center justify-between text-xs font-mono">
                      <span className="text-white/70">
                        <span className="text-white font-bold">{round.players}</span> CANDIDATES
                      </span>
                      <span className="text-white/70">
                        <span className="text-red-300 font-bold">{round.eliminates}</span> ELIMINATED
                      </span>
                      {round.number === 3 && (
                        <span className="flex items-center gap-1 text-yellow-300">
                          <Crown className="w-4 h-4" />
                          <span className="font-bold">CHAMPION</span>
                        </span>
                      )}
                    </div>

                    {/* Loading overlay */}
                    {isLoading && (
                      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center rounded-2xl">
                        <div className="flex items-center gap-3 text-white font-display font-bold">
                          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          INITIALIZING...
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Error message */}
            {error && (
              <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-center">
                <p className="text-red-400 font-mono text-sm">{error}</p>
              </div>
            )}
          </div>

          {/* Instructions */}
          <div className="mt-10 text-center max-w-lg">
            <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-700/50">
              <p className="text-slate-400 font-mono text-xs leading-relaxed">
                💡 <span className="text-cyan-400">TIP:</span> Select any round to generate a unique QR code. 
                Candidates will scan the QR to join that specific round.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom decorative elements */}
      <div className="absolute bottom-6 left-0 right-0 flex items-center justify-center gap-4 text-slate-700 font-mono text-xs z-10">
        <span>GENESIS PROTOCOL v3.0</span>
        <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse" />
        <span>MULTI-SESSION MODE</span>
        <span className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-pulse" />
        <span>POWERED BY AIVA</span>
      </div>

      {/* Corner decorations */}
      <div className="absolute top-6 left-6 w-16 h-16 border-l-2 border-t-2 border-cyan-500/30 rounded-tl-xl" />
      <div className="absolute top-6 right-6 w-16 h-16 border-r-2 border-t-2 border-pink-500/30 rounded-tr-xl" />
      <div className="absolute bottom-6 left-6 w-16 h-16 border-l-2 border-b-2 border-pink-500/30 rounded-bl-xl" />
      <div className="absolute bottom-6 right-6 w-16 h-16 border-r-2 border-b-2 border-cyan-500/30 rounded-br-xl" />
    </div>
  );
};

export default Home;
