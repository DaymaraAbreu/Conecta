import React from 'react';
import { Pressable, View } from 'react-native';
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
import { hasSupabaseConfig } from '@/lib/supabase';

const menuItems = [
  { title: 'Conta', subtitle: 'Número, dispositivos e opções da conta', icon: 'user' as const, path: '/preferences/account' },
  { title: 'Privacidade', subtitle: 'Visto por último, confirmações e bloqueios', icon: 'eye' as const, path: '/privacy' },
  { title: 'Segurança', subtitle: 'Alertas, PIN e informações de proteção', icon: 'shield' as const, path: '/security' },
  { title: 'Acessibilidade', subtitle: 'Visão, audição e mobilidade', icon: 'eye' as const, path: '/accessibility' },
  { title: 'Dispositivo Assistivo', subtitle: 'Simulador do botão acessível ESP32', icon: 'radio' as const, path: '/assistive-device' },
  { title: 'Pesquisa e IoT', subtitle: 'Dashboard de barreiras e acionador acessível', icon: 'bar-chart-2' as const, path: '/dashboard' },
  { title: 'Conversas', subtitle: 'Histórico, mídias e aparência', icon: 'message-circle' as const, path: '/preferences/chats' },
  { title: 'Notificações', subtitle: 'Alertas de mensagens e grupos', icon: 'bell' as const, path: '/preferences/notifications' },
  { title: 'Armazenamento e dados', subtitle: 'Downloads e uso de dados', icon: 'hard-drive' as const, path: '/preferences/data' },
  { title: 'Dispositivos conectados', subtitle: 'Sessões e aparelhos vinculados', icon: 'monitor' as const, path: '/preferences/devices' },
  { title: 'Ajuda', subtitle: 'Informações do protótipo', icon: 'help-circle' as const, path: '/preferences/help' },
];

export default function SettingsScreen() {
  const colors = useAppColors();
  const { profile, ready } = useApp();
  const account = useAccountSession();
  const { enabled: demoMode } = useDemoMode();
  const displayName = !demoMode && account.isSignedIn && account.displayName ? account.displayName : profile.name;
  return (
    <AppScreen tabPage>
      <PageHeader title="Configurações" subtitle="Sua conta, do seu jeito" />
      <InfoBanner tone={demoMode || !account.isSignedIn || !hasSupabaseConfig() ? 'warning' : 'info'}>
        {demoMode
          ? 'Amostra anônima local; não há conta, sincronização ou chamadas reais.'
          : account.isSignedIn && hasSupabaseConfig()
            ? 'Conta Clerk e conversas Supabase estão conectadas. Chamadas, criptografia ponta a ponta e notificações push ainda são demonstrações.'
            : 'Entre em uma conta e configure Supabase para sincronizar mensagens. Chamadas, criptografia ponta a ponta e notificações push ainda são demonstrações.'}
      </InfoBanner>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Editar perfil"
        onPress={() => router.push('/profile')}
        style={({ pressed }) => ({ padding: 15, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 19, flexDirection: 'row', alignItems: 'center', marginBottom: 19, opacity: pressed ? 0.75 : 1 })}
      >
        <Avatar initials={profile.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'VC'} size={56} />
        <View style={{ flex: 1, marginLeft: 13 }}>
          <AppText size={17} weight="700">{ready ? displayName : 'Carregando perfil...'}</AppText>
          <AppText size={13} muted style={{ marginTop: 4 }}>{profile.about}</AppText>
          <AppText size={11} muted style={{ marginTop: 3 }}>{profile.phone}</AppText>
        </View>
        <Feather name="edit-2" size={17} color={colors.primary} />
      </Pressable>
      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 14 }}>
        {menuItems.map((item, index) => (
          <Pressable
            key={item.path}
            accessibilityRole="button"
            onPress={() => router.push(item.path as never)}
            style={({ pressed }) => ({ minHeight: 67, flexDirection: 'row', alignItems: 'center', borderBottomWidth: index === menuItems.length - 1 ? 0 : 1, borderBottomColor: colors.border, opacity: pressed ? 0.72 : 1 })}
          >
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: item.title === 'Acessibilidade' ? colors.accent : colors.secondary, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
              <Feather name={item.icon} size={17} color={item.title === 'Acessibilidade' ? colors.accentForeground : colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText size={14} weight="600">{item.title}</AppText>
              <AppText size={11} muted style={{ marginTop: 3 }}>{item.subtitle}</AppText>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        ))}
      </View>
      <AppText size={11} muted style={{ textAlign: 'center', marginTop: 20 }}>Ponte · Protótipo interativo · Dados locais de demonstração</AppText>
    </AppScreen>
  );
}
