import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, User, Loader2, Scan } from 'lucide-react';
import { supabase, TABLES, GameSession } from '../lib/supabase';
import { PLAYER_COLORS } from '../lib/constants';

const Join = () => {
  const { gameId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [session, setSession] = useState<GameSession | null>(null);
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Load session info on mount
  useEffect(() => {
    const loadSession = async () => {
      if (!gameId) return;
      
      const { data } = await supabase
        .from(TABLES.gameSessions)
        .select('*')
        .eq('id', gameId)
        .single();
      
      if (data) {
        setSession(data);
      }
    };
    
    loadSession();
  }, [gameId]);

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

  const getRandomAvatarColor = () => {
    return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
  };

  const handleJoin = async () => {
    if (!name.trim()) {
      setError('NEURAL SIGNATURE REQUIRED');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let photoUrl: string | null = null;

      // Upload photo to Supabase Storage if provided
      if (photo) {
        setUploadingPhoto(true);
        const fileExt = photo.name.split('.').pop()?.toLowerCase() || 'jpg';
        const fileName = `${gameId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('player-photos')
          .upload(fileName, photo, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          console.error('Photo upload error:', uploadError);
          // Don't use base64 fallback - it causes display issues
          // Just continue without photo
        } else {
          const { data: { publicUrl } } = supabase.storage
            .from('player-photos')
            .getPublicUrl(fileName);
          photoUrl = publicUrl;
        }
        setUploadingPhoto(false);
      }

      const { data, error: insertError } = await supabase
        .from(TABLES.players)
        .insert({
          game_session_id: gameId,
          event_id: session?.event_id || null,
          name: name.trim().toUpperCase(),
          photo_url: photoUrl, // Only use Supabase URL, no base64
          avatar_color: getRandomAvatarColor(),
          is_spectator: false, // Always player, no spectator option
        })
        .select()
        .single();

      if (insertError) throw insertError;

      navigate(`/play/${data.id}`);
    } catch (err) {
      console.error('Error joining game:', err);
      setError('CONNECTION FAILED. RETRY NEURAL LINK.');
    } finally {
      setLoading(false);
      setUploadingPhoto(false);
    }
  };

  const roundNumber = session?.round_number || 1;
  const roundLabel = `ROUND 0${roundNumber}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 cyber-bg relative overflow-hidden">
      <div className="grid-overlay" />
      
      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8 animate-bounce-in">
          <div className="flex items-center justify-center mb-4">
            <Scan className="w-12 h-12 text-cyan-400 animate-pulse" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 font-display tracking-wider">
            {roundLabel} <span className="text-cyan-400">REGISTRATION</span>
          </h1>
          <p className="text-slate-400 font-mono text-sm">ENTER YOUR NEURAL SIGNATURE</p>
        </div>

        <div className="space-y-6 animate-slide-up">
          {/* Photo upload - optional */}
          <div className="flex flex-col items-center">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handlePhotoChange}
              className="hidden"
              aria-label="Upload photo"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="relative w-32 h-32 rounded-full bg-slate-800 border-4 border-dashed border-slate-600 hover:border-cyan-400 transition-all overflow-hidden group neon-border disabled:opacity-50"
              aria-label="Take or upload photo"
              tabIndex={0}
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 group-hover:text-cyan-400">
                  <Camera className="w-8 h-8 mb-1" />
                  <span className="text-xs font-mono">SCAN</span>
                </div>
              )}
            </button>
            <p className="text-slate-500 text-sm mt-2 font-mono">TAP TO CAPTURE (OPTIONAL)</p>
          </div>

          <div>
            <label className="block text-slate-300 text-sm font-medium mb-2 font-mono">
              DESIGNATION
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.toUpperCase())}
                placeholder="ENTER NAME"
                maxLength={20}
                className="w-full bg-slate-800/80 border border-slate-600 rounded-xl py-4 pl-12 pr-4 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:shadow-[0_0_10px_rgba(34,211,238,0.3)] transition-all font-mono uppercase"
                aria-label="Enter your name"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3">
              <p className="text-red-400 text-sm text-center font-mono">{error}</p>
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={loading}
            className="cyber-btn w-full py-4 px-8 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            aria-label="Complete registration"
            tabIndex={0}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="font-display">{uploadingPhoto ? 'UPLOADING PHOTO...' : 'CONNECTING...'}</span>
              </>
            ) : (
              <span className="font-display tracking-wider">REGISTER</span>
            )}
          </button>
        </div>

        <div className="relative z-10 mt-8 text-center">
          <p className="text-slate-600 text-xs font-mono">
            GENESIS PROTOCOL v3.0 • {roundLabel}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Join;
