import React, { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { AppText } from '@/components/AppText';
import { useApp } from '@/context/AppContext';
import { useAppColors } from '@/hooks/useAppColors';

export function PageHeader({
  title,
  subtitle,
  back = false,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
}) {
  const colors = useAppColors();
  const { preferences } = useApp();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 * preferences.spacingScale, minHeight: 48 * preferences.spacingScale }}>
      {back ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          onPress={() => router.back()}
          hitSlop={10}
          style={{ width: 40, height: 44, justifyContent: 'center' }}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <AppText size={27} weight="700">{title}</AppText>
        {subtitle ? <AppText size={13} muted style={{ marginTop: 3 }}>{subtitle}</AppText> : null}
      </View>
      {right}
    </View>
  );
}
