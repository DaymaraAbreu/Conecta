import React from 'react';
import { StyleSheet, Text, TextProps, TextStyle } from 'react-native';
import { useApp } from '@/context/AppContext';
import { useAppColors } from '@/hooks/useAppColors';

type AppTextProps = TextProps & {
  size?: number;
  weight?: TextStyle['fontWeight'];
  muted?: boolean;
  color?: string;
};

export function AppText({
  size = 15,
  weight = '400',
  muted = false,
  color,
  style,
  ...props
}: AppTextProps) {
  const colors = useAppColors();
  const { preferences } = useApp();
  const resolvedStyle = StyleSheet.flatten(style) ?? {};
  const scaledFontSize = size * preferences.fontScale;
  const lineHeight =
    typeof resolvedStyle.lineHeight === 'number'
      ? resolvedStyle.lineHeight * preferences.spacingScale
      : scaledFontSize * 1.35 * preferences.spacingScale;
  return (
    <Text
      allowFontScaling
      {...props}
      style={{
        ...resolvedStyle,
        color: color ?? (muted ? colors.mutedForeground : colors.foreground),
        fontSize: scaledFontSize,
        fontWeight: preferences.boldText ? '700' : weight,
        lineHeight,
      }}
    />
  );
}
