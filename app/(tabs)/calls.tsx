import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Avatar } from '@/components/Avatar';
import { AppScreen } from '@/components/AppScreen';
import { AppText } from '@/components/AppText';
import { InfoBanner } from '@/components/InfoBanner';
import { PageHeader } from '@/components/PageHeader';
import { useApp } from '@/context/AppContext';
import { useAppColors } from '@/hooks/useAppColors';

export default function CallsScreen() {
  const colors = useAppColors();
  const { calls, conversations } = useApp();
  const [notice, setNotice] = useState('');
  const startCall = (name: string, video: boolean) => {
    if (video) {
      const conversation = conversations.find((item) => item.name === name);
      if (conversation) {
        router.push({ pathname: '/video-call/[id]', params: { id: conversation.id } });
        return;
      }
    }
    setNotice(`Chamada para ${name} é apenas uma demonstração. Nenhuma ligação real foi iniciada.`);
  };
  return (
    <AppScreen tabPage>
      <PageHeader
        title="Chamadas"
        subtitle="Fale com quem importa"
          right={
          <Pressable accessibilityRole="button" accessibilityLabel="Nova chamada" onPress={() => setNotice('Escolha um contato na aba Conversas para abrir a prévia de chamada simulada.')}>
            <Feather name="phone-call" size={20} color={colors.primary} />
          </Pressable>
        }
      />
      <InfoBanner>O histórico é ilustrativo. Chamadas de voz e vídeo ainda não se conectam a outros aparelhos.</InfoBanner>
      {notice ? <InfoBanner tone="info">{notice}</InfoBanner> : null}
      <View style={{ backgroundColor: colors.secondary, borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card }}>
          <Feather name="link" size={19} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText weight="700">Links de chamada</AppText>
          <AppText size={12} muted style={{ marginTop: 3 }}>Os convites seriam configurados em uma versão conectada.</AppText>
        </View>
        <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
      </View>
      <AppText size={17} weight="700" style={{ marginBottom: 12 }}>Recentes</AppText>
      {calls.map((call, index) => (
        <View key={call.id} style={{ minHeight: 74, flexDirection: 'row', alignItems: 'center', borderBottomWidth: index === calls.length - 1 ? 0 : 1, borderBottomColor: colors.border }}>
          <View style={{ marginRight: 12 }}><Avatar initials={call.initials} colorIndex={call.colorIndex} size={49} /></View>
          <View style={{ flex: 1 }}>
            <AppText weight="600" color={call.direction === 'missed' ? colors.destructive : colors.foreground}>{call.name}</AppText>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 }}>
              <Feather
                name={call.direction === 'incoming' ? 'arrow-down-left' : call.direction === 'missed' ? 'phone-missed' : 'arrow-up-right'}
                size={13}
                color={call.direction === 'missed' ? colors.destructive : colors.primary}
              />
              <AppText size={12} muted>{call.time} · {call.video ? 'vídeo' : 'voz'}</AppText>
            </View>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Ligar para ${call.name}`} onPress={() => startCall(call.name, false)} hitSlop={8} style={{ padding: 9 }}>
            <Feather name="phone" size={19} color={colors.primary} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Abrir demonstração de videochamada com ${call.name}`} onPress={() => startCall(call.name, true)} hitSlop={8} style={{ padding: 9 }}>
            <Feather name="video" size={19} color={colors.primary} />
          </Pressable>
        </View>
      ))}
    </AppScreen>
  );
}
