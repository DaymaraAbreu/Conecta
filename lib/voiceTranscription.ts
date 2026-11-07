import { getApiBaseUrl } from '@/constants/oauth';
import { getClerkAccessToken } from '@/lib/supabase';

export async function transcribeChatAudio(audioUrl: string) {
  const token = await getClerkAccessToken();
  if (!token) throw new Error('Entre na sua conta para transcrever o áudio.');
  const baseUrl = getApiBaseUrl().replace(/\/$/, '');
  if (!baseUrl) throw new Error('Configure EXPO_PUBLIC_API_BASE_URL para conectar ao servidor de transcrição.');
  const response = await fetch(`${baseUrl}/api/ai/transcribe-audio`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ audioUrl }),
  });
  const payload = await response.json().catch(() => ({})) as { text?: unknown; error?: unknown };
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `Falha na transcrição (${response.status}).`);
  }
  if (typeof payload.text !== 'string' || !payload.text.trim()) throw new Error('Não foi reconhecida fala neste áudio.');
  return payload.text.trim();
}
