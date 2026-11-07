import React, { ReactNode } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { useApp } from '@/context/AppContext';
import { useAppColors } from '@/hooks/useAppColors';

export function SectionCard({
  title,
  children,
  description,
}: {
  title: string;
  children: ReactNode;
  description?: string;
}) {
  const colors = useAppColors();
  const { preferences } = useApp();
  return (
    <View style={{ marginBottom: 22 * preferences.spacingScale }}>
      <AppText accessibilityRole="header" size={13} weight="700" muted style={{ textTransform: 'uppercase', letterSpacing: 1, marginBottom: 9 * preferences.spacingScale, marginLeft: 3 }}>
        {title}
      </AppText>
      <View style={{ backgroundColor: colors.card, borderRadius: 20, paddingHorizontal: 14 * preferences.spacingScale, borderWidth: 1, borderColor: colors.border }}>
        {children}
      </View>
      {description ? <AppText size={12} muted style={{ marginTop: 8 * preferences.spacingScale, lineHeight: 17, marginHorizontal: 3 }}>{description}</AppText> : null}
    </View>
  );
}
