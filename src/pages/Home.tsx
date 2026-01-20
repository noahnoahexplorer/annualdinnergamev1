import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Play, ArrowRight, RefreshCw } from 'lucide-react';
import { supabase, TABLES, GameEvent } from '../lib/supabase';

type Mode = 'select' | 'continue';

const Home = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('select');
  const [eventId, setEventId] = useState('');
  const [eventData, setEventData] = useState<GameEvent | null>(null);
  const [error, setError] = useState('');

  // Create a new event and start Round 1
  const handleCreateEvent = async () => {
    setLoading(true);
    setError('');
    try {
      // Create master event
      const { data: eventData, error: eventError } = await supabase
        .from(TABLES.events)
        .insert({
          name: 'CYBER GENESIS',
          current_round: 1,
          status: 'round1'
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // Create Round 1 session linked to event
      const { data: sessionData, error: sessionError } = await supabase
        .from(TABLES.gameSessions)
        .insert({
          event_id: eventData.id,
          round_number: 1,
          status: 'lobby',
          current_stage: 1,
          enabled_stages: [1]
        })
        .select()
        .single();

      if (sessionError) throw sessionError;

      navigate(`/stage/${sessionData.id}`);
    } catch (err) {
      console.error('Error creating event:', err);
      setError('EVENT CREATION FAILED. CHECK CONNECTION.');
    } finally {
      setLoading(false);
    }
  };

  // Look up an existing event
  const handleLookupEvent = async () => {
    if (!eventId.trim()) {
      setError('ENTER EVENT ID');
      return;
    }
    
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase
        .from(TABLES.events)
        .select('*')
        .eq('id', eventId.trim())
        .single();

      if (fetchError || !data) {
        setError('EVENT NOT FOUND');
        setEventData(null);
        return;
      }

      setEventData(data);
    } catch (err) {
      console.error('Error looking up event:', err);
      setError('LOOKUP FAILED');
    } finally {
      setLoading(false);
    }
  };

  // Start a specific round for an existing event
  const handleStartRound = async (roundNumber: number) => {
    if (!eventData) return;
    
    setLoading(true);
    setError('');
    try {
      // Update event status
      const roundStatus = `round${roundNumber}` as GameEvent['status'];
      await supabase
        .from(TABLES.events)
        .update({ current_round: roundNumber, status: roundStatus })
        .eq('id', eventData.id);

      // Create new session for this round
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
      setError('ROUND INITIALIZATION FAILED');
    } finally {
      setLoading(false);
    }
  };

  // Get available rounds based on event status
  const getAvailableRounds = (): number[] => {
    if (!eventData) return [];
    
    switch (eventData.status) {
      case 'round1_complete':
        return [2];
      case 'round2_complete':
        return [3];
      case 'completed':
        return [];
      default:
        // If event is in progress or just created, show next logical round
        if (eventData.current_round === 0) return [1];
        if (eventData.current_round < 3) return [eventData.current_round + 1];
        return [];
    }
  };

  const availableRounds = getAvailableRounds();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center cyber-bg relative overflow-hidden">
      {/* Animated grid overlay */}
      <div className="grid-overlay" />
      
      {/* Scanline effect */}
      <div className="scanline" />
      
      {/* Floating particles */}
      <div className="particles">
        {Array.from({ length: 30 }).map((_, i) => (
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
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[150px] animate-pulse" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '1s' }} />

      {/* Main content */}
      <div className="relative z-10 text-center max-w-2xl mx-auto px-8">
        {/* Logo */}
        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-64 h-64 bg-gradient-to-r from-purple-500/30 via-pink-500/30 to-cyan-500/30 rounded-full blur-[80px] animate-pulse" />
          </div>
          <img 
            src="/title_CyberGenesis.png" 
            alt="Cyber Genesis" 
            className="relative h-32 md:h-40 object-contain mx-auto genesis-glow"
          />
        </div>

        <p className="text-slate-500 font-mono text-sm mb-8 tracking-widest">
          EVENT ADMINISTRATOR CONSOLE
        </p>

        {mode === 'select' && (
          <div className="space-y-6">
            {/* Create New Event */}
            <button
              onClick={handleCreateEvent}
              disabled={loading}
              className="w-full group relative overflow-hidden rounded-xl"
              aria-label="Create New Event"
              tabIndex={0}
            >
              <div className="relative px-8 py-6 bg-gradient-to-r from-purple-600/80 to-pink-600/80 border border-purple-500/50 rounded-xl transition-all duration-300 hover:shadow-[0_0_40px_rgba(168,85,247,0.4)]">
                <div className="flex items-center justify-center gap-4">
                  <Zap className="w-6 h-6 text-white" />
                  <span className="text-xl font-display font-bold tracking-wider text-white">
                    {loading ? 'INITIALIZING...' : 'CREATE NEW EVENT'}
                  </span>
                </div>
                <p className="text-purple-200/70 text-sm font-mono mt-2">
                  Start fresh with Round 1 • 10 Players
                </p>
              </div>
            </button>

            {/* Divider */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
              <span className="text-slate-500 font-mono text-xs">OR CONTINUE</span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-600 to-transparent" />
            </div>

            {/* Continue Existing Event */}
            <button
              onClick={() => setMode('continue')}
              className="w-full group relative overflow-hidden rounded-xl"
              aria-label="Continue Event"
              tabIndex={0}
            >
              <div className="relative px-8 py-6 bg-slate-800/50 border border-cyan-500/30 rounded-xl transition-all duration-300 hover:border-cyan-500/60 hover:shadow-[0_0_30px_rgba(6,182,212,0.2)]">
                <div className="flex items-center justify-center gap-4">
                  <RefreshCw className="w-6 h-6 text-cyan-400" />
                  <span className="text-xl font-display font-bold tracking-wider text-cyan-400">
                    CONTINUE EVENT
                  </span>
                </div>
                <p className="text-slate-400 text-sm font-mono mt-2">
                  Resume Round 2 or Round 3
                </p>
              </div>
            </button>
          </div>
        )}

        {mode === 'continue' && (
          <div className="space-y-6">
            {/* Back button */}
            <button
              onClick={() => { setMode('select'); setEventData(null); setEventId(''); setError(''); }}
              className="text-slate-400 hover:text-white font-mono text-sm flex items-center gap-2 mx-auto transition-colors"
              tabIndex={0}
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              BACK TO MENU
            </button>

            {/* Event ID Input */}
            <div className="p-6 bg-slate-900/80 border border-slate-700 rounded-xl">
              <label className="block text-slate-400 font-mono text-sm mb-3 text-left">
                EVENT ID
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  placeholder="Enter event ID..."
                  className="flex-1 px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white font-mono focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                />
                <button
                  onClick={handleLookupEvent}
                  disabled={loading}
                  className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 rounded-lg font-display font-bold text-white transition-colors disabled:opacity-50"
                  tabIndex={0}
                >
                  {loading ? '...' : 'LOOKUP'}
                </button>
              </div>

              {error && (
                <p className="mt-3 text-red-400 font-mono text-sm">{error}</p>
              )}
            </div>

            {/* Event Details & Actions */}
            {eventData && (
              <div className="p-6 bg-slate-900/80 border border-purple-500/30 rounded-xl animate-fadeIn">
                <div className="text-left mb-4">
                  <p className="text-purple-400 font-mono text-xs mb-1">EVENT FOUND</p>
                  <p className="text-white font-display text-xl">{eventData.name}</p>
                  <p className="text-slate-400 font-mono text-sm mt-2">
                    Status: <span className="text-cyan-400">{eventData.status.toUpperCase().replace('_', ' ')}</span>
                  </p>
                  <p className="text-slate-400 font-mono text-sm">
                    Current Round: <span className="text-pink-400">{eventData.current_round}</span>
                  </p>
                </div>

                {availableRounds.length > 0 ? (
                  <div className="space-y-3">
                    {availableRounds.map(round => (
                      <button
                        key={round}
                        onClick={() => handleStartRound(round)}
                        disabled={loading}
                        className="w-full px-6 py-4 bg-gradient-to-r from-emerald-600/80 to-cyan-600/80 border border-emerald-500/50 rounded-lg font-display font-bold text-white transition-all hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] disabled:opacity-50"
                        tabIndex={0}
                      >
                        <div className="flex items-center justify-center gap-3">
                          <Play className="w-5 h-5" />
                          <span>START ROUND {round}</span>
                        </div>
                        <p className="text-emerald-200/70 text-xs font-mono mt-1">
                          {round === 2 ? '6 Survivors compete' : round === 3 ? '3 Finalists compete' : '10 Players compete'}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 bg-slate-800/50 border border-slate-600 rounded-lg text-center">
                    <p className="text-slate-400 font-mono text-sm">
                      {eventData.status === 'completed' 
                        ? 'EVENT COMPLETED - ALL ROUNDS FINISHED'
                        : 'NO ROUNDS AVAILABLE'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom decorative elements */}
      <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-4 text-slate-700 font-mono text-xs">
        <span>GENESIS PROTOCOL v3.0</span>
        <span className="w-1 h-1 bg-cyan-500 rounded-full animate-pulse" />
        <span>MULTI-SESSION MODE</span>
      </div>

      {/* Corner decorations */}
      <div className="absolute top-8 left-8 w-12 h-12 border-l-2 border-t-2 border-cyan-500/30 rounded-tl-lg" />
      <div className="absolute top-8 right-8 w-12 h-12 border-r-2 border-t-2 border-pink-500/30 rounded-tr-lg" />
      <div className="absolute bottom-8 left-8 w-12 h-12 border-l-2 border-b-2 border-pink-500/30 rounded-bl-lg" />
      <div className="absolute bottom-8 right-8 w-12 h-12 border-r-2 border-b-2 border-cyan-500/30 rounded-br-lg" />
    </div>
  );
};

export default Home;
