import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
let clerkTokenGetter: (() => Promise<string | null>) | undefined;

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function setClerkTokenGetter(getter?: () => Promise<string | null>) {
  clerkTokenGetter = getter;
}

export async function getClerkAccessToken() {
  return (await clerkTokenGetter?.()) ?? null;
}

// `.invalid` is a reserved TLD: absent credentials can never silently connect to a third-party project.
export const supabase = createClient(
  supabaseUrl || 'https://supabase-not-configured.invalid',
  supabaseAnonKey || 'missing-public-anon-key',
  {
    accessToken: getClerkAccessToken,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

export async function syncClerkUserToSupabase(
  user?: {
    id: string;
    fullName?: string | null;
    firstName?: string | null;
    username?: string | null;
    primaryEmailAddress?: { emailAddress?: string | null } | null;
  } | null,
) {
  if (!user || !hasSupabaseConfig()) return false;
  

  const email = user.primaryEmailAddress?.emailAddress || '';
  const name = user.fullName || user.firstName || email.split('@')[0] || 'Usuário';
  const username = user.username || null;

  const { error: insertError } = await supabase
    .from('profiles')
    .upsert(
      { id: user.id, name, email, username },
      { onConflict: 'id', ignoreDuplicates: true },
    );

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ name, email, username })
    .eq('id', user.id);

  const error = insertError ?? updateError;
  if (error) {
    console.warn('Não foi possível sincronizar o perfil com o Supabase:', error.message);
    return false;
  }
  return true;
}