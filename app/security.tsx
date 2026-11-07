import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AppScreen } from '@/components/AppScreen';
import { AppText } from '@/components/AppText';
import { InfoBanner } from '@/components/InfoBanner';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { SettingRow } from '@/components/SettingRow';
import { useApp } from '@/context/AppContext';
import { useAppColors } from '@/hooks/useAppColors';

export default function SecurityScreen() {
  const colors = useAppColors();
  const { preferences, togglePreference } = useApp();
  const [notice, setNotice] = useState('');
  return (
    <AppScreen>
      <PageHeader title="Segurança" subtitle="Entenda as proteções e seus limites" back />
      <InfoBanner tone="warning">Importante: este protótipo não implementa criptografia de ponta a ponta, contas, PIN real, backup seguro ou chamadas protegidas.</InfoBanner>
      <View style={{ padding: 17, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, marginBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 9 }}>
          <Feather name="shield" size={19} color={colors.primary} />
          <AppText size={16} weight="700">Como a segurança funciona</AppText>
        </View>
        <AppText size={13} muted style={{ lineHeight: 19 }}>
          Em uma versão de produção, mensagens privadas devem usar criptografia de ponta a ponta e chaves verificáveis. Aqui, conversas e controles são exemplos locais para demonstrar a experiência.
        </AppText>
      </View>
      <SectionCard title="Proteção da conta">
        <SettingRow title="Verificação em duas etapas" subtitle={preferences.twoStepEnabled ? 'Ativada apenas na demonstração; sem PIN armazenado' : 'Adicione uma camada extra à conta conectada'} value={preferences.twoStepEnabled} onToggle={() => togglePreference('twoStepEnabled')} />
        <SettingRow title="Notificações de segurança" subtitle="Avisos quando um código de segurança mudar" value={preferences.securityNotifications} onToggle={() => togglePreference('securityNotifications')} />
        <SettingRow title="Backup criptografado" subtitle="A configuração é demonstrativa; nenhum backup é criado" value={preferences.encryptedBackup} onToggle={() => togglePreference('encryptedBackup')} last />
      </SectionCard>
      <SectionCard title="Chamadas">
        <SettingRow title="Proteger endereço IP" subtitle="Ocultar o IP em chamadas encaminhadas por servidor" value={preferences.hideIpInCalls} onToggle={() => togglePreference('hideIpInCalls')} last />
      </SectionCard>
      <SectionCard title="Orientações">
        <SettingRow title="Código de segurança" subtitle="Cada conversa teria um código para comparar com seu contato" icon="key" onPress={() => setNotice('Códigos de verificação reais dependem de chaves criptográficas de cada dispositivo; esta demonstração não as gera.')} />
        <SettingRow title="Dispositivos conectados" subtitle="Revise sessões abertas e encerre as que não reconhecer" icon="monitor" onPress={() => setNotice('Esta demonstração não cria sessões em outros dispositivos.')} last />
      </SectionCard>
      {notice ? <InfoBanner tone="info">{notice}</InfoBanner> : null}
      <Pressable onPress={() => setNotice('Antes de um lançamento real, esta arquitetura precisa de revisão independente de segurança, gerenciamento de chaves e política de retenção de dados.')} style={{ padding: 5, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Feather name="external-link" size={14} color={colors.primary} />
        <AppText size={12} weight="600" color={colors.primary}>Ver observações de segurança</AppText>
      </Pressable>
    </AppScreen>
  );
}
