import { supabase } from '@/lib/supabase';
import * as Crypto from 'expo-crypto';

export const CHAT_MEDIA_BUCKET = 'chat-media';

const extensionByMimeType: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/webm': 'webm',
};

export function extensionForMimeType(mimeType: string) {
  return extensionByMimeType[mimeType] ?? 'bin';
}

export async function uploadChatMedia({
  uri,
  userId,
  conversationId,
  mimeType,
}: {
  uri: string;
  userId: string;
  conversationId: string;
  mimeType: string;
}) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Não foi possível ler o arquivo selecionado.');
  const body = await response.arrayBuffer();
  const path = `${userId}/${conversationId}/${Crypto.randomUUID()}.${extensionForMimeType(mimeType)}`;
  const { error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).upload(path, body, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function createChatMediaUrl(path: string) {
  const { data, error } = await supabase.storage.from(CHAT_MEDIA_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}
