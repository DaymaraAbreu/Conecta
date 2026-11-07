import React from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { useAppColors } from '@/hooks/useAppColors';

export function Avatar({
  initials,
  colorIndex = 0,
  size = 54,
  ring = false,
  name,
}: {
  initials: string;
  colorIndex?: number;
  size?: number;
  ring?: boolean;
  name?: string;
}) {

  const colors = useAppColors();
  const fills = [colors.avatar1, colors.avatar2, colors.avatar3, colors.avatar4];
  return (
    <View
      accessible
      accessibilityLabel={name ? `Foto de perfil: ${name}` : `Foto de perfil: ${initials}`}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: fills[colorIndex % fills.length],
        borderWidth: ring ? 2 : 0,
        borderColor: colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText size={size * 0.28} weight="700" color={colors.avatarText}>
        {initials}
      </AppText>
    </View>
  );
}
