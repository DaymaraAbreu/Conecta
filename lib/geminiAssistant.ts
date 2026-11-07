import { getApiBaseUrl } from '@/constants/oauth';
import { getClerkAccessToken } from '@/lib/supabase';

export type GeminiTurn = { role: 'user' | 'model'; text: string };

export async function sendGeminiMessage(message: string, history: GeminiTurn[]) {
  const token = await getClerkAccessToken();
  if (!token) throw new Error('Entre na sua conta para conversar com o Assistente Gemini.');

  const baseUrl = getApiBaseUrl().replace(/\/$/, '');
  if (!baseUrl) {
    throw new Error('Configure EXPO_PUBLIC_API_BASE_URL para conectar o aplicativo ao servidor.');
  }

  const response = await fetch(`${baseUrl}/api/ai/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message: message.trim(), history: history.slice(-12) }),
  });
  const payload = await response.json().catch(() => ({})) as { text?: unknown; error?: unknown };
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' ? payload.error : `O Assistente Gemini não respondeu (${response.status}).`);
  }
  if (typeof payload.text !== 'string' || !payload.text.trim()) {
    throw new Error('O Assistente Gemini retornou uma resposta vazia.');
  }
  return payload.text.trim();
}
