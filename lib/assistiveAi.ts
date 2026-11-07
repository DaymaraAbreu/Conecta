import { getClerkAccessToken } from '@/lib/supabase';

const configuredBaseUrl = process.env.EXPO_PUBLIC_ASSISTIVE_AI_URL?.trim() ?? '';
const baseUrl = (() => {
  if (!configuredBaseUrl) return '';
  try { const url = new URL(configuredBaseUrl); return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' ? url.origin : ''; } catch { return ''; }
})();

export type AssistiveAiResult = {
  text: string;
  model?: string;
  source?: string;
};

export function hasAssistiveAiConfig() {
  return Boolean(baseUrl);
}

async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!baseUrl) throw new Error('Serviço de IA assistiva não configurado.');
  const token = await getClerkAccessToken();
  if (!token) throw new Error('É necessário estar autenticado para usar a IA assistiva.');
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : `Serviço de IA indisponível (${response.status}).`);
  }
  if (!payload || typeof payload.text !== 'string' || !payload.text.trim()) {
    throw new Error('O serviço de IA retornou uma resposta vazia ou inválida.');
  }
  return payload as T;
}

export function simplifyMessage(text: string) {
  return request<AssistiveAiResult>('/api/ai/simplify-message', {
    text: text.trim(),
    language: 'pt-BR',
    instructions: 'Use linguagem simples, preserve o sentido e não acrescente fatos.',
  });
}

export function describeImage(imageUrl: string) {
  return request<AssistiveAiResult>('/api/ai/describe-image', {
    imageUrl,
    language: 'pt-BR',
    instructions: 'Descreva a imagem de forma objetiva e acessível. Não identifique pessoas.',
  });
}

export function transcribeAudio(audioUrl: string, messageId: string) {
  return request<AssistiveAiResult>('/api/ai/transcribe-audio', {
    audioUrl,
    messageId,
    language: 'pt-BR',
  });
}
