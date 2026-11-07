import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Avatar } from '@/components/Avatar';
import { AppScreen } from '@/components/AppScreen';
import { AppText } from '@/components/AppText';
import { InfoBanner } from '@/components/InfoBanner';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { SettingRow } from '@/components/SettingRow';
import { useApp, Preferences } from '@/context/AppContext';
import { useAppColors } from '@/hooks/useAppColors';

type SettingDefinition = {
  title: string;
  subtitle: string;
  key?: keyof Preferences;
  icon?: React.ComponentProps<typeof Feather>['name'];
  actionTitle?: string;
  actionText?: string;
};

const sections: Record<string, { title: string; subtitle: string; rows: SettingDefinition[] }> = {
  account: {
    title: 'Conta',
    subtitle: 'Informações e acesso',
    rows: [
      { title: 'Número de telefone', subtitle: 'Número de exemplo; não foi verificado', icon: 'phone' },
      { title: 'Verificação em duas etapas', subtitle: 'Ative uma camada adicional na demonstração', key: 'twoStepEnabled', icon: 'shield' },
      { title: 'Notificações de segurança', subtitle: 'Avisos sobre mudanças de código', key: 'securityNotifications', icon: 'bell' },
      { title: 'Solicitar informações da conta', subtitle: 'Este app ainda não oferece exportação de dados', icon: 'file-text', actionTitle: 'Exportação indisponível', actionText: 'Esta tela não consulta nem exporta dados da conta no provedor de autenticação.' },
      { title: 'Excluir minha conta', subtitle: 'A exclusão remota não é oferecida por esta tela', icon: 'trash-2', actionTitle: 'Exclusão indisponível', actionText: 'Esta demonstração não exclui contas, perfis ou mensagens remotas. Nenhum dado será removido por essa ação.' },
    ],
  },
  chats: {
    title: 'Conversas',
    subtitle: 'Ajuste o comportamento dos chats',
    rows: [
      { title: 'Manter conversas arquivadas', subtitle: 'Manter chats arquivados fora da lista principal', key: 'keepArchived', icon: 'archive' },
      { title: 'Salvar mídias recebidas', subtitle: 'Preferência local; não há download de mídia', key: 'saveMedia', icon: 'image' },
      { title: 'Enter envia mensagem', subtitle: 'Preferência para o botão de retorno do teclado', key: 'enterToSend', icon: 'corner-down-left' },
      { title: 'Transcrição de áudio', subtitle: 'Mostrar transcrições de exemplo nos chats', key: 'audioTranscription', icon: 'file-text' },
      { title: 'Papel de parede', subtitle: 'Aparência de demonstração do chat', icon: 'image', actionTitle: 'Papel de parede', actionText: 'A personalização do fundo da conversa será conectada em uma versão futura.' },
    ],
  },
  notifications: {
    title: 'Notificações',
    subtitle: 'Preferências de alertas do aplicativo',
    rows: [
      { title: 'Notificações de mensagens', subtitle: 'Ativar alertas de conversas individuais', key: 'messageNotifications', icon: 'message-circle' },
      { title: 'Notificações de grupos', subtitle: 'Ativar alertas de conversas em grupo', key: 'groupNotifications', icon: 'users' },
      { title: 'Mostrar prévias', subtitle: 'Exibir o conteúdo na notificação', key: 'notificationPreview', icon: 'eye' },
      { title: 'Vibração', subtitle: 'Preferência de retorno tátil', key: 'vibration', icon: 'smartphone' },
      { title: 'Som de notificação', subtitle: 'Os sons dependem das configurações do aparelho', icon: 'volume-2', actionTitle: 'Som de notificação', actionText: 'Nenhum som é enviado por este protótipo. Ajuste sons nas configurações do iOS ou Android.' },
    ],
  },
  data: {
    title: 'Armazenamento e dados',
    subtitle: 'Downloads e uso de conexão',
    rows: [
      { title: 'Reduzir dados em chamadas', subtitle: 'Usar menos dados quando chamadas estiverem disponíveis', key: 'reduceDataCalls', icon: 'bar-chart-2' },
      { title: 'Baixar apenas no Wi-Fi', subtitle: 'Preferência de download de mídia', key: 'wifiOnlyDownloads', icon: 'wifi' },
      { title: 'Download automático de fotos', subtitle: 'Preferência local; nenhum download é feito', key: 'autoDownloadPhotos', icon: 'download' },
      { title: 'Uso de armazenamento', subtitle: 'Dados guardados por este protótipo', icon: 'hard-drive', actionTitle: 'Armazenamento local', actionText: 'A demonstração salva mensagens de texto e preferências no armazenamento local do aplicativo. Não baixa fotos ou arquivos.' },
      { title: 'Redefinir dados de exemplo', subtitle: 'Apagar mensagens e preferências salvas neste aparelho', icon: 'rotate-ccw' },
    ],
  },
  devices: {
    title: 'Dispositivos conectados',
    subtitle: 'Gerencie sessões da sua conta',
    rows: [
      { title: 'Nenhum dispositivo conectado', subtitle: 'A demonstração não cria sessões em outros aparelhos', icon: 'monitor' },
      { title: 'Conectar dispositivo', subtitle: 'Esta função precisa de um serviço conectado', icon: 'plus-circle', actionTitle: 'Vinculação indisponível', actionText: 'A conexão de dispositivos e a leitura de QR precisam de backend e conta reais.' },
    ],
  },
  help: {
    title: 'Ajuda',
    subtitle: 'Sobre o protótipo Ponte',
    rows: [
      { title: 'Como funciona esta demonstração', subtitle: 'Recursos locais e limitações', icon: 'info', actionTitle: 'Sobre o protótipo', actionText: 'Chamada, atualização, preferências de privacidade e dados de exemplo são locais. O chat pode usar Supabase quando Clerk, credenciais, JWT e SQL estiverem configurados. Chamadas reais e criptografia ponta a ponta não estão conectadas.' },
      { title: 'Privacidade e segurança', subtitle: 'Veja os limites das proteções demonstradas', icon: 'shield', actionTitle: 'Privacidade', actionText: 'Consulte as telas Privacidade e Segurança para ver as opções e o que ainda não é implementado.' },
      { title: 'Acessibilidade', subtitle: 'Ajustes para visão, audição e mobilidade', icon: 'eye', actionTitle: 'Acessibilidade', actionText: 'Abra Configurações → Acessibilidade para ajustar texto, contraste, transcrições e alvos de toque.' },
      { title: 'Versão', subtitle: 'Ponte · protótipo de mensageria', icon: 'smartphone', actionTitle: 'Versão', actionText: 'Protótipo interativo local.' },
    ],
  },
  blocked: {
    title: 'Contatos bloqueados',
    subtitle: 'Gerencie a lista de demonstração',
    rows: [],
  },
};

export default function PreferencesScreen() {
  const params = useLocalSearchParams<{ section: string }>();
  const sectionId = Array.isArray(params.section) ? params.section[0] : params.section;
  const section = sections[sectionId ?? ''];
  const colors = useAppColors();
  const [confirmReset, setConfirmReset] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const {
    preferences,
    togglePreference,
    conversations,
    blockedContacts,
    toggleBlocked,
    resetDemo,
  } = useApp();

  const handleAction = (row: SettingDefinition) => {
    if (row.title === 'Redefinir dados de exemplo') {
      setConfirmReset(true);
      return;
    }
    setActionNotice(`${row.actionTitle ?? row.title}: ${row.actionText ?? row.subtitle}`);
  };

  if (!section) {
    return (
      <AppScreen>
        <PageHeader title="Configuração" back />
        <AppText muted>Esta seção não está disponível.</AppText>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <PageHeader title={section.title} subtitle={section.subtitle} back />
      <InfoBanner>As preferências desta tela são locais; elas não ativam políticas de privacidade ou segurança em serviços remotos.</InfoBanner>
      {actionNotice ? <InfoBanner tone="info">{actionNotice}</InfoBanner> : null}
      {sectionId === 'blocked' ? (
        <SectionCard title="Contatos de exemplo" description="Bloquear alguém aqui só altera a lista local; não existe uma conta real.">
          {conversations.filter((item) => !item.isGroup).map((contact, index, list) => {
            const isBlocked = blockedContacts.includes(contact.id);
            return (
              <Pressable
                key={contact.id}
                accessibilityRole="button"
                accessibilityLabel={`${isBlocked ? 'Desbloquear' : 'Bloquear'} ${contact.name}`}
                onPress={() => toggleBlocked(contact.id)}
                style={({ pressed }) => ({ minHeight: 69, flexDirection: 'row', alignItems: 'center', borderBottomWidth: index === list.length - 1 ? 0 : 1, borderBottomColor: colors.border, opacity: pressed ? 0.72 : 1 })}
              >
                <View style={{ marginRight: 12 }}><Avatar initials={contact.initials} colorIndex={contact.colorIndex} size={44} /></View>
                <View style={{ flex: 1 }}>
                  <AppText weight="600">{contact.name}</AppText>
                  <AppText size={12} muted style={{ marginTop: 3 }}>{isBlocked ? 'Bloqueado nesta demonstração' : 'Não bloqueado'}</AppText>
                </View>
                <Feather name={isBlocked ? 'user-check' : 'slash'} size={18} color={isBlocked ? colors.primary : colors.destructive} />
              </Pressable>
            );
          })}
        </SectionCard>
      ) : (
        <SectionCard title={sectionId === 'devices' ? 'Dispositivos' : 'Opções'}>
          {section.rows.map((row, index) => {
            const isToggle = row.key !== undefined && typeof preferences[row.key] === 'boolean';
            return (
              <SettingRow
                key={row.title}
                title={row.title}
                subtitle={row.subtitle}
                icon={row.icon}
                value={isToggle ? Boolean(preferences[row.key as keyof Preferences]) : undefined}
                onToggle={isToggle ? () => togglePreference(row.key as keyof Preferences) : undefined}
                onPress={!isToggle ? () => handleAction(row) : undefined}
                last={index === section.rows.length - 1}
              />
            );
          })}
        </SectionCard>
      )}
      {sectionId === 'devices' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 3 }}>
          <Feather name="lock" size={14} color={colors.mutedForeground} />
          <AppText size={12} muted>Uma sessão real exige autenticação e proteção no servidor.</AppText>
        </View>
      ) : null}
      <Modal visible={confirmReset} transparent animationType="fade" onRequestClose={() => setConfirmReset(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 }}>
          <View accessibilityViewIsModal style={{ width: '100%', maxWidth: 420, alignSelf: 'center', padding: 20, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 12 }}>
            <AppText accessibilityRole="header" size={19} weight="700">Redefinir dados de exemplo?</AppText>
            <AppText muted style={{ lineHeight: 21 }}>Mensagens e preferências armazenadas somente neste aparelho serão substituídas pelos dados iniciais. Nenhum dado remoto será apagado.</AppText>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 9, marginTop: 4 }}>
              <Pressable accessibilityRole="button" onPress={() => setConfirmReset(false)} style={{ minHeight: 46, paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><AppText weight="600">Cancelar</AppText></Pressable>
              <Pressable accessibilityRole="button" onPress={() => { setConfirmReset(false); resetDemo(); router.replace('/(tabs)/settings'); }} style={{ minHeight: 46, paddingHorizontal: 14, borderRadius: 13, backgroundColor: colors.destructive, alignItems: 'center', justifyContent: 'center' }}><AppText weight="700" color={colors.destructiveForeground}>Redefinir</AppText></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}
