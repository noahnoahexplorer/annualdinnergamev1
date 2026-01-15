import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gamepad2, Users, Eye, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';

const STAGES = [
  { id: 1, name: 'Tap to Run - Speed Race', color: 'sky' },
  { id: 2, name: 'Rock Paper Scissors - Battle', color: 'orange' },
  { id: 3, name: 'Stop at 7.7s - Timing', color: 'emerald' },
];

export default function Home() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [selectedStages, setSelectedStages] = useState<number[]>([]);

  const toggleStage = (stageId: number) => {
    setSelectedStages(prev =>
      prev.includes(stageId)
        ? prev.filter(id => id !== stageId)
        : [...prev, stageId].sort()
    );
  };

  const createGame = async () => {
    if (selectedStages.length === 0) {
      alert('Please select at least one stage!');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('game_sessions')
        .insert({
          status: 'lobby',
          current_stage: 0,
          enabled_stages: selectedStages
        })
        .select()
        .single();

      if (error) throw error;
      navigate(`/host/${data.id}`);
    } catch (err) {
      console.error('Error creating game:', err);
      alert('Failed to create game. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="text-center mb-12 animate-bounce-in">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Gamepad2 className="w-16 h-16 text-sky-400" />
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4">
          Game<span className="text-sky-400">Arena</span>
        </h1>
        <p className="text-slate-400 text-lg max-w-md mx-auto">
          Epic Challenges. 10 Players. 1 Champion.
        </p>
      </div>

      <div className="grid gap-6 w-full max-w-md">
        <button
          onClick={createGame}
          disabled={loading}
          className="group relative bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-bold py-5 px-8 rounded-2xl transition-all duration-300 shadow-lg hover:shadow-sky-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex items-center justify-center gap-3">
            <Zap className="w-6 h-6" />
            <span className="text-xl">{loading ? 'Creating...' : 'Create New Game'}</span>
          </div>
          <div className="absolute inset-0 rounded-2xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6 text-center">
            <Users className="w-8 h-8 text-orange-400 mx-auto mb-2" />
            <p className="text-white font-semibold">10 Players</p>
            <p className="text-slate-400 text-sm">Compete</p>
          </div>
          <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6 text-center">
            <Eye className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-white font-semibold">1 Spectator</p>
            <p className="text-slate-400 text-sm">Watch Live</p>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
          <h3 className="text-white font-bold mb-4 text-center">Select Stages</h3>
          <div className="space-y-3">
            {STAGES.map((stage) => {
              const isSelected = selectedStages.includes(stage.id);
              const colorClasses = {
                sky: isSelected ? 'bg-sky-500/20 text-sky-400 border-sky-400' : 'bg-slate-700/20 text-slate-500 border-slate-600',
                orange: isSelected ? 'bg-orange-500/20 text-orange-400 border-orange-400' : 'bg-slate-700/20 text-slate-500 border-slate-600',
                emerald: isSelected ? 'bg-emerald-500/20 text-emerald-400 border-emerald-400' : 'bg-slate-700/20 text-slate-500 border-slate-600',
              };

              return (
                <button
                  key={stage.id}
                  onClick={() => toggleStage(stage.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                    isSelected ? 'bg-slate-700/30' : 'bg-slate-800/30'
                  }`}
                >
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all ${
                    colorClasses[stage.color]
                  }`}>
                    {isSelected ? '✓' : stage.id}
                  </span>
                  <span className={`flex-1 text-left transition-colors ${
                    isSelected ? 'text-white font-medium' : 'text-slate-400'
                  }`}>
                    {stage.name}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-slate-400 text-xs text-center mt-4">
            {selectedStages.length} {selectedStages.length === 1 ? 'stage' : 'stages'} selected
          </p>
        </div>
      </div>
    </div>
  );
}
