import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { AppScreen } from '@/components/AppScreen';
import { AppText } from '@/components/AppText';
import { InfoBanner } from '@/components/InfoBanner';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { useApp } from '@/context/AppContext';
import { useAppColors } from '@/hooks/useAppColors';

export default function UpdatesScreen() {
  const colors = useAppColors();
  const { stories, addMyStory } = useApp();
  const [notice, setNotice] = useState('');
  const myStory = stories.find((story) => story.id.startsWith('mine'));
  const otherStories = stories.filter((story) => !story.id.startsWith('mine'));

  return (
    <AppScreen tabPage>
      <PageHeader title="Atualizações" subtitle="Compartilhe momentos com seus contatos" />
      <InfoBanner tone="warning">As publicações desta tela são exemplos visuais. Nenhuma imagem ou atualização é enviada.</InfoBanner>
      <SectionCard title="Meu status">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={myStory ? 'Adicionar outra atualização de demonstração' : 'Adicionar atualização de status'}
          onPress={() => {
            addMyStory();
            setNotice('Seu status foi adicionado apenas ao armazenamento local deste aparelho.');
          }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 15, opacity: pressed ? 0.7 : 1 })}
        >
          <View style={{ position: 'relative', marginRight: 13 }}>
            <Avatar initials={myStory ? 'VC' : 'VC'} colorIndex={0} size={54} ring={!!myStory} />
            <View style={{ position: 'absolute', right: -2, bottom: -2, width: 21, height: 21, borderRadius: 11, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.card, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="plus" size={13} color={colors.primaryForeground} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <AppText weight="700">{myStory ? 'Seu status' : 'Adicionar ao meu status'}</AppText>
            <AppText size={12} muted style={{ marginTop: 4 }}>{myStory ? 'Atualizado agora · somente demonstração' : 'Compartilhe uma foto ou texto'}</AppText>
          </View>
          <Feather name="camera" size={18} color={colors.primary} />
        </Pressable>
      </SectionCard>
      {notice ? <InfoBanner tone="info">{notice}</InfoBanner> : null}
      <SectionCard title="Atualizações recentes" description="As visualizações e a privacidade de status são exemplos; não há publicação real neste protótipo.">
        {otherStories.map((story, index) => (
          <Pressable
            key={story.id}
            accessibilityRole="button"
            accessibilityLabel={`Ver atualização de ${story.name}`}
            onPress={() => setNotice(`Atualização de demonstração de ${story.name}, publicada ${story.time}. Nenhuma publicação remota foi carregada.`)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: index === otherStories.length - 1 ? 0 : 1, borderBottomColor: colors.border, opacity: pressed ? 0.72 : 1 })}
          >
            <View style={{ marginRight: 13 }}>
              <Avatar initials={story.initials} colorIndex={story.colorIndex} size={50} ring={!story.seen} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText weight="600">{story.name}</AppText>
              <AppText size={12} muted style={{ marginTop: 4 }}>{story.time}</AppText>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </Pressable>
        ))}
        {otherStories.length === 0 ? <AppText muted style={{ paddingVertical: 15 }}>Ainda não há atualizações.</AppText> : null}
      </SectionCard>
      <Pressable onPress={() => setNotice('A privacidade dessas atualizações é apenas local. As opções demonstrativas ficam na tela Privacidade.')} style={{ flexDirection: 'row', alignItems: 'center', gap: 9, padding: 4 }}>
        <Feather name="lock" size={15} color={colors.primary} />
        <AppText size={13} weight="600" color={colors.primary}>Configurar privacidade do status</AppText>
      </Pressable>
    </AppScreen>
  );
}
