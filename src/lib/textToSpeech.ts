const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const VOICE_ID = 'ErXwobaYiN019PkySvjV';

export async function generateSpeech(text: string): Promise<string> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ElevenLabs API key is not configured');
  }

  console.log('Generating speech with ElevenLabs...');

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.65,
          use_speaker_boost: true,
          speed: 0.95,
        },
      }),
    });

    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
      } catch (e) {
        errorText = 'Unable to read error response';
      }
      console.error('ElevenLabs API error:', response.status, errorText);
      throw new Error(`Failed to generate speech: ${response.status} - ${errorText || 'Unknown error'}`);
    }

    console.log('Audio generated successfully');

    let audioBlob: Blob;
    try {
      audioBlob = await response.blob();
    } catch (e) {
      console.error('Error reading audio blob:', e);
      throw new Error('Failed to read audio data from response');
    }

    if (!audioBlob || audioBlob.size === 0) {
      throw new Error('Received empty audio data');
    }

    const audioUrl = URL.createObjectURL(audioBlob);
    console.log('Audio URL created:', audioUrl);
    return audioUrl;
  } catch (error) {
    console.error('Error generating speech:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Unknown error occurred while generating speech');
  }
}

export function playAudio(audioUrl: string): HTMLAudioElement {
  const audio = new Audio(audioUrl);
  audio.play();
  return audio;
}
