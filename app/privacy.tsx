import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { AppScreen } from '@/components/AppScreen';
import { AppText } from '@/components/AppText';
import { InfoBanner } from '@/components/InfoBanner';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { SettingRow } from '@/components/SettingRow';
import { useApp } from '@/context/AppContext';
import { useAppColors } from '@/hooks/useAppColors';

export default function PrivacyScreen() {
  const colors = useAppColors();
  const { preferences, togglePreference, blockedContacts } = useApp();
  const [notice, setNotice] = useState('');
  return (
    <AppScreen>
      <PageHeader title="Privacidade" subtitle="Escolha o que as pessoas podem ver" back />
      <InfoBanner>As opções salvam preferências neste aparelho para a demonstração. Não controlam uma conta ou rede real.</InfoBanner>
      <SectionCard title="Quem pode ver">
        <SettingRow title="Visto por último e online" subtitle="Permitir que contatos vejam sua atividade" value={preferences.lastSeen} onToggle={() => togglePreference('lastSeen')} />
        <SettingRow title="Confirmações de leitura" subtitle="Exibir quando uma mensagem foi lida" value={preferences.readReceipts} onToggle={() => togglePreference('readReceipts')} />
        <SettingRow title="Foto do perfil" subtitle="Visibilidade da imagem de perfil" value={preferences.profilePhoto} onToggle={() => togglePreference('profilePhoto')} />
        <SettingRow title="Status" subtitle="Permitir que contatos vejam suas atualizações" value={preferences.statusAudience} onToggle={() => togglePreference('statusAudience')} />
        <SettingRow title="Adicionar a grupos" subtitle="Permitir convites para conversas em grupo" value={preferences.groupInvites} onToggle={() => togglePreference('groupInvites')} last />
      </SectionCard>
      <SectionCard title="Mensagens">
        <SettingRow title="Mensagens temporárias" subtitle="Duração padrão: desativada" icon="clock" onPress={() => setNotice('Nenhuma mensagem é apagada neste protótipo. A opção será conectada apenas em uma versão com regras de retenção implementadas.')} />
        <SettingRow title="Contatos bloqueados" subtitle={`${blockedContacts.length} contato${blockedContacts.length === 1 ? '' : 's'} bloqueado${blockedContacts.length === 1 ? '' : 's'}`} icon="slash" onPress={() => router.push('/preferences/blocked')} last />
      </SectionCard>
      {notice ? <InfoBanner tone="info">{notice}</InfoBanner> : null}
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 }}>
        <AppText size={12} muted style={{ lineHeight: 18 }}>A privacidade real depende de armazenamento, transmissão e processamento seguros em um serviço conectado. Esta demonstração não transmite dados.</AppText>
      </View>
    </AppScreen>
  );
}
