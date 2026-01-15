import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, User, Loader2, Eye, Gamepad2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function Join() {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [joinType, setJoinType] = useState<'player' | 'spectator' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleJoin = async () => {
    if (!name.trim()) {
      setError('Please enter your name');
      return;
    }
    if (joinType === 'player' && !photo) {
      setError('Please upload a photo');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let photoUrl = null;

      if (photo) {
        const fileExt = photo.name.split('.').pop();
        const fileName = `${gameId}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('player-photos')
          .upload(fileName, photo);

        if (uploadError) {
          photoUrl = photoPreview;
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('player-photos')
            .getPublicUrl(fileName);
          photoUrl = publicUrl;
        }
      }

      const { data, error: insertError } = await supabase
        .from('players')
        .insert({
          game_session_id: gameId,
          name: name.trim(),
          photo_url: photoUrl || photoPreview,
          is_spectator: joinType === 'spectator',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (joinType === 'spectator') {
        navigate(`/spectator/${gameId}`);
      } else {
        navigate(`/play/${data.id}`);
      }
    } catch (err) {
      console.error('Error joining game:', err);
      setError('Failed to join game. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!joinType) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-center mb-8 animate-bounce-in">
          <h1 className="text-4xl font-bold text-white mb-2">Join Game</h1>
          <p className="text-slate-400">Choose how you want to participate</p>
        </div>

        <div className="grid gap-4 w-full max-w-sm">
          <button
            onClick={() => setJoinType('player')}
            className="group bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-bold py-6 px-8 rounded-2xl transition-all duration-300 shadow-lg hover:shadow-sky-500/30"
          >
            <div className="flex items-center justify-center gap-3">
              <Gamepad2 className="w-8 h-8" />
              <div className="text-left">
                <p className="text-xl">Join as Player</p>
                <p className="text-sky-200 text-sm font-normal">Compete in the games</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setJoinType('spectator')}
            className="group bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 text-white font-bold py-6 px-8 rounded-2xl transition-all duration-300 shadow-lg hover:shadow-slate-500/20"
          >
            <div className="flex items-center justify-center gap-3">
              <Eye className="w-8 h-8" />
              <div className="text-left">
                <p className="text-xl">Join as Spectator</p>
                <p className="text-slate-300 text-sm font-normal">Watch the games live</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8 animate-bounce-in">
          <h1 className="text-3xl font-bold text-white mb-2">
            {joinType === 'player' ? 'Player Registration' : 'Spectator Registration'}
          </h1>
          <p className="text-slate-400">Enter your details to join</p>
        </div>

        <div className="space-y-6 animate-slide-up">
          {joinType === 'player' && (
            <div className="flex flex-col items-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="relative w-32 h-32 rounded-full bg-slate-700 border-4 border-dashed border-slate-500 hover:border-sky-400 transition-colors overflow-hidden group"
              >
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 group-hover:text-sky-400">
                    <Camera className="w-8 h-8 mb-1" />
                    <span className="text-xs">Add Photo</span>
                  </div>
                )}
              </button>
              <p className="text-slate-400 text-sm mt-2">Tap to upload photo</p>
            </div>
          )}

          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2">
              Your Name
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                maxLength={20}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl py-4 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
              />
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            onClick={handleJoin}
            disabled={loading}
            className="w-full bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-bold py-4 px-8 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Joining...</span>
              </>
            ) : (
              <span>Join Game</span>
            )}
          </button>

          <button
            onClick={() => setJoinType(null)}
            className="w-full text-slate-400 hover:text-white py-2 transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
