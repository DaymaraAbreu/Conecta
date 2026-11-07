import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Avatar } from '@/components/Avatar';
import { AppScreen } from '@/components/AppScreen';
import { AppText } from '@/components/AppText';
import { InfoBanner } from '@/components/InfoBanner';
import { PageHeader } from '@/components/PageHeader';
import { useApp } from '@/context/AppContext';
import { useAccountSession, useDemoMode } from '@/context/AppSessionContext';
import { useAppColors } from '@/hooks/useAppColors';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';

export default function ProfileScreen() {
  const colors = useAppColors();
  const account = useAccountSession();
  const { enabled: demoMode, setEnabled } = useDemoMode();
  const { profile, updateProfile, preferences } = useApp();
  const [name, setName] = useState(profile.name);
  const [about, setAbout] = useState(profile.about);
  const [loading, setLoading] = useState(() => Boolean(account.isSignedIn && account.userId && hasSupabaseConfig()));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!account.isSignedIn || !account.userId || !hasSupabaseConfig()) return;
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase.from('profiles').select('name, about').eq('id', account.userId!).maybeSingle();
        if (!active) return;
        if (error) setStatus('Não foi possível carregar o nome remoto; você ainda pode tentar novamente ou editar localmente.');
        else {
          if (data?.name) setName(data.name);
          if (data?.about) setAbout(data.about);
        }
      } finally {
        if (active) setLoading(false);
      }
    })().catch(() => {
      if (active) {
        setStatus('Não foi possível carregar o nome remoto; você ainda pode editar localmente.');
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [account.isSignedIn, account.userId]);

  const save = async () => {
    const cleanedName = name.trim();
    if (!cleanedName) {
      setStatus('Digite um nome antes de salvar.');
      return;
    }
    setSaving(true);
    setStatus('');
    try {
      if (!demoMode && account.isSignedIn && account.userId && hasSupabaseConfig()) {
        const cleanedAbout = about.trim() || 'Disponível';
        const { error } = await supabase.from('profiles').update({ name: cleanedName, about: cleanedAbout }).eq('id', account.userId);
        if (error) throw error;
        setStatus('Perfil atualizado e confirmado no Supabase.');
      } else {
        setStatus('Alterações salvas somente neste aparelho; não foram sincronizadas.');
      }
      updateProfile({ ...profile, name: cleanedName, about: about.trim() || 'Disponível' });
    } catch (error) {
      setStatus(error instanceof Error ? `Não foi possível salvar no Supabase: ${error.message}` : 'Não foi possível salvar o nome remoto.');
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    if (demoMode) {
      setEnabled(false);
      router.replace('/welcome');
      return;
    }
    try {
      await account.signOut();
      router.replace('/welcome');
    } catch {
      setStatus('Não foi possível sair da conta. Tente novamente em instantes.');
    }
  };

  const initials = name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'VC';
  return (
    <AppScreen>
      <PageHeader title="Seu perfil" subtitle={demoMode ? 'Amostra local anônima' : 'Conta e perfil'} back />
      {demoMode ? (
        <InfoBanner tone="warning">Este perfil é um exemplo local. Nenhum usuário foi autenticado e nenhuma alteração será enviada.</InfoBanner>
      ) : (
        <InfoBanner>Nome e descrição são atualizados no Supabase quando há conexão. O telefone continua sendo apenas um dado de exemplo.</InfoBanner>
      )}
      {!demoMode && account.isSignedIn ? (
        <View style={{ borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, marginBottom: 12 }}>
          <AppText size={11} weight="700" muted>CONTA CONECTADA</AppText>
          <AppText size={14} weight="600" style={{ marginTop: 5 }}>{account.email ?? 'Conta autenticada'}</AppText>
        </View>
      ) : null}
      <View style={{ alignItems: 'center', paddingVertical: 14, marginBottom: 18 }}>
        <Avatar initials={initials} size={88} />
        <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Feather name="camera" size={15} color={colors.mutedForeground} />
          <AppText size={12} muted>A foto ainda não está conectada</AppText>
        </View>
      </View>
      <View style={{ gap: 16 }}>
        <View>
          <AppText size={12} weight="700" muted style={{ marginBottom: 7 }}>NOME</AppText>
          <TextInput accessibilityLabel="Nome do perfil" value={name} onChangeText={setName} placeholder="Seu nome" placeholderTextColor={colors.mutedForeground} maxLength={40} style={{ backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: preferences.largeTouchTargets ? 60 : 50, fontSize: 16 * preferences.fontScale }} />
        </View>
        <View>
          <AppText size={12} weight="700" muted style={{ marginBottom: 7 }}>SOBRE (NESTE APARELHO)</AppText>
          <TextInput accessibilityLabel="Descrição local do perfil" value={about} onChangeText={setAbout} placeholder="Escreva algo sobre você" placeholderTextColor={colors.mutedForeground} maxLength={100} style={{ backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: preferences.largeTouchTargets ? 60 : 50, fontSize: 16 * preferences.fontScale }} />
        </View>
        <View>
          <AppText size={12} weight="700" muted style={{ marginBottom: 7 }}>TELEFONE DE EXEMPLO</AppText>
          <View style={{ height: 50, borderRadius: 14, backgroundColor: colors.muted, paddingHorizontal: 14, justifyContent: 'center' }}><AppText muted>{profile.phone}</AppText></View>
        </View>
        {loading ? <AppText size={12} muted accessibilityLiveRegion="polite">Carregando nome da conta…</AppText> : null}
        {status ? <AppText accessibilityRole="alert" size={12} color={status.startsWith('Não foi') ? colors.destructive : colors.primary}>{status}</AppText> : null}
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={({ pressed }) => ({ height: 52, backgroundColor: colors.primary, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 8, opacity: saving || pressed ? 0.75 : 1 })}>
          <AppText weight="700" color={colors.primaryForeground}>{saving ? 'Salvando…' : 'Salvar perfil'}</AppText>
        </Pressable>
        {demoMode || account.isSignedIn ? (
          <Pressable accessibilityRole="button" onPress={() => void leave()} style={({ pressed }) => ({ height: 50, borderColor: colors.destructive, borderWidth: 1, borderRadius: 15, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
            <AppText weight="700" color={colors.destructive}>{demoMode ? 'Sair da demonstração' : 'Sair da conta'}</AppText>
          </Pressable>
        ) : null}
      </View>
    </AppScreen>
  );
}
