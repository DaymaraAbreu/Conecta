import React from 'react';
import { Feather } from '@expo/vector-icons';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { useAppColors } from '@/hooks/useAppColors';

export function InfoBanner({ children, tone = 'info' }: { children: string; tone?: 'info' | 'warning' }) {
  const colors = useAppColors();
  const tint = tone === 'warning' ? colors.accentForeground : colors.primary;
  const background = tone === 'warning' ? colors.accent : colors.secondary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', padding: 14, borderRadius: 16, backgroundColor: background, marginBottom: 18, gap: 10 }}>
      <Feather name={tone === 'warning' ? 'alert-triangle' : 'info'} size={17} color={tint} style={{ marginTop: 1 }} />
      <AppText size={12} color={tint} style={{ flex: 1, lineHeight: 18 }}>{children}</AppText>
    </View>
  );
}
