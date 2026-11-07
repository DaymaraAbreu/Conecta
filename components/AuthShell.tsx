import React, { ReactNode } from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import { AppScreen } from '@/components/AppScreen';
import { AppText } from '@/components/AppText';
import { useAppColors } from '@/hooks/useAppColors';

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footerText: string;
  footerAction: string;
  onFooterPress: () => void;
};

export function AuthShell({
  title,
  subtitle,
  children,
  footerText,
  footerAction,
  onFooterPress,
}: AuthShellProps) {
  const colors = useAppColors();

  return (
    <AppScreen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <View style={{ width: 56, height: 56, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
            <Feather name="message-circle" size={27} color={colors.primaryForeground} />
          </View>
          <AppText size={27} weight="700" style={{ marginTop: 13 }}>Ponte</AppText>
          <AppText size={14} muted style={{ marginTop: 3, textAlign: 'center' }}>{subtitle}</AppText>
        </View>

        <View style={{ padding: 20, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
          <AppText size={21} weight="700" style={{ marginBottom: 18 }}>{title}</AppText>
          {children}
          <Pressable accessibilityRole="button" onPress={onFooterPress} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
            <AppText size={13} muted>{footerText} <AppText size={13} weight="700" color={colors.primary}>{footerAction}</AppText></AppText>
          </Pressable>
        </View>

        <AppText size={11} muted style={{ textAlign: 'center', marginTop: 17, lineHeight: 16 }}>
          Suas mensagens ainda não estão conectadas ao servidor nem protegidas por criptografia ponta a ponta.
        </AppText>
      </View>
    </AppScreen>
  );
}
