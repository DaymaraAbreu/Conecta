import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Avatar } from '@/components/Avatar';
import { AppScreen } from '@/components/AppScreen';
import { AppText } from '@/components/AppText';
import { InfoBanner } from '@/components/InfoBanner';
import { useApp } from '@/context/AppContext';
import { useAppColors } from '@/hooks/useAppColors';

export default function VideoCallPreviewScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const conversationId = Array.isArray(params.id) ? params.id[0] : params.id;
  const colors = useAppColors();
  const { conversations, preferences } = useApp();
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [descriptionInfo, setDescriptionInfo] = useState(false);
  const contact = conversations.find((item) => item.id === conversationId);
  const name = contact?.name ?? 'Contato de demonstração';
  const visualDescription = cameraOn
    ? `Tela ilustrativa de ${name}: avatar com as iniciais da pessoa ao centro, sobre um fundo verde suave. Os controles de chamada aparecem na parte inferior.`
    : `A câmera de demonstração de ${name} está desligada; o avatar com as iniciais continua visível no centro da tela.`;

  return (
    <AppScreen scroll={false} contentStyle={{ paddingHorizontal: 18 }}>
      <View style={{ flex: 1, paddingTop: 10, paddingBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar chamada de demonstração" onPress={() => router.back()} hitSlop={9} style={{ width: 42, height: 44, justifyContent: 'center' }}>
            <Feather name="arrow-left" size={21} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <AppText size={18} weight="700">Videochamada</AppText>
            <AppText size={12} muted style={{ marginTop: 2 }}>Demonstração acessível · sem conexão</AppText>
          </View>
          <Feather name="shield" size={18} color={colors.primary} />
        </View>

        <View
          accessible
          accessibilityLabel={visualDescription}
          style={{ flex: 1, minHeight: 250, borderRadius: 25, backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', padding: 22 }}
        >
          {cameraOn ? (
            <>
              <Avatar initials={contact?.initials ?? 'CD'} colorIndex={contact?.colorIndex ?? 0} size={112} />
              <View style={{ alignItems: 'center', marginTop: 18 }}>
                <AppText size={22} weight="700">{name}</AppText>
                <AppText size={13} muted style={{ marginTop: 5 }}>Chamada simulada</AppText>
              </View>
            </>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Feather name="video-off" size={48} color={colors.mutedForeground} />
              <AppText size={16} weight="600" style={{ marginTop: 14 }}>Câmera desligada</AppText>
              <AppText size={12} muted style={{ marginTop: 4 }}>{name}</AppText>
            </View>
          )}
          <View style={{ position: 'absolute', top: 14, right: 14, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.card }}>
            <AppText size={11} weight="600" color={colors.primary}>PRÉVIA DE DEMONSTRAÇÃO</AppText>
          </View>
        </View>

        {preferences.describeVideoCalls ? (
          <View accessible accessibilityLabel={`Descrição visual da chamada: ${visualDescription}`} style={{ marginTop: 14, borderRadius: 17, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <Feather name="eye" size={17} color={colors.primary} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <AppText size={12} weight="700" color={colors.primary}>DESCRIÇÃO VISUAL</AppText>
              <AppText size={13} style={{ lineHeight: 19, marginTop: 4 }}>{visualDescription}</AppText>
            </View>
          </View>
        ) : (
          <InfoBanner>Ative “Descrição em chamadas de vídeo” em Acessibilidade para exibir a descrição visual.</InfoBanner>
        )}
        {descriptionInfo ? <InfoBanner>Esta tela é uma ilustração. Uma chamada real exigiria um serviço de mídia e consentimento dos participantes; nenhuma câmera ou análise de imagem é usada.</InfoBanner> : null}

        <View style={{ alignItems: 'center', paddingTop: 17, paddingBottom: 7 }}>
          <AppText size={12} muted style={{ textAlign: 'center', marginBottom: 14 }}>
            Nenhuma câmera, microfone ou chamada real é usada nesta tela.
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={muted ? 'Ativar microfone de demonstração' : 'Silenciar microfone de demonstração'}
              onPress={() => setMuted((value) => !value)}
              style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 19, backgroundColor: muted ? colors.accent : colors.secondary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.72 : 1 })}
            ><Feather name={muted ? 'mic-off' : 'mic'} size={20} color={muted ? colors.accentForeground : colors.primary} /></Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Encerrar chamada de demonstração"
              onPress={() => router.back()}
              style={({ pressed }) => ({ width: 60, height: 54, borderRadius: 20, backgroundColor: colors.destructive, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.72 : 1 })}
            ><Feather name="phone-off" size={21} color={colors.destructiveForeground} /></Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={cameraOn ? 'Desligar câmera de demonstração' : 'Ligar câmera de demonstração'}
              onPress={() => setCameraOn((value) => !value)}
              style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 19, backgroundColor: cameraOn ? colors.secondary : colors.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.72 : 1 })}
            ><Feather name={cameraOn ? 'video' : 'video-off'} size={20} color={cameraOn ? colors.primary : colors.accentForeground} /></Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Informações sobre descrição visual"
              onPress={() => setDescriptionInfo((value) => !value)}
              style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 19, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.72 : 1 })}
            ><Feather name="info" size={19} color={colors.primary} /></Pressable>
          </View>
        </View>
      </View>
    </AppScreen>
  );
}
