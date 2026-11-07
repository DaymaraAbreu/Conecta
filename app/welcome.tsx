import React from 'react';
import { router, type Href } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';
import { AppScreen } from '@/components/AppScreen';
import { AppText } from '@/components/AppText';
import { InfoBanner } from '@/components/InfoBanner';
import { useDemoMode } from '@/context/AppSessionContext';
import { useAppColors } from '@/hooks/useAppColors';

export default function WelcomeScreen() {
  const colors = useAppColors();
  const { setEnabled } = useDemoMode();
  const clerkConfigured = Boolean(process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY);

  return (
    <AppScreen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center', alignItems: 'center' }}>
        <View style={{ width: 78, height: 78, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
          <Feather name="message-circle" size={37} color={colors.primaryForeground} />
        </View>
        <AppText size={32} weight="700" style={{ marginTop: 17 }}>Ponte Mensagens</AppText>
        <AppText size={15} muted style={{ marginTop: 7, textAlign: 'center', lineHeight: 22 }}>
          Conversas acessíveis, com privacidade e controle.
        </AppText>

        {!clerkConfigured ? (
          <InfoBanner tone="warning">A autenticação ainda não está configurada. Você pode experimentar apenas a amostra local; não será criada uma conta nem haverá sincronização.</InfoBanner>
        ) : null}

        <View style={{ width: '100%', gap: 11, marginTop: 32 }}>
          <Pressable
            accessibilityRole="button"
            disabled={!clerkConfigured}
            onPress={() => router.push('/(auth)/sign-up' as Href)}
            style={({ pressed }) => ({ minHeight: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: !clerkConfigured ? 0.45 : pressed ? 0.75 : 1 })}
          >
            <AppText size={15} weight="700" color={colors.primaryForeground}>Criar conta</AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!clerkConfigured}
            onPress={() => router.push('/(auth)/sign-in' as Href)}
            style={({ pressed }) => ({ minHeight: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, opacity: !clerkConfigured ? 0.45 : pressed ? 0.75 : 1 })}
          >
            <AppText size={15} weight="700">Entrar</AppText>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setEnabled(true);
            router.replace('/(tabs)' as Href);
          }}
          style={({ pressed }) => ({ minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 14, borderRadius: 15, borderWidth: 1, borderColor: colors.primary, opacity: pressed ? 0.7 : 1 })}
        >
          <AppText size={14} weight="700" color={colors.primary}>Explorar uma amostra local</AppText>
        </Pressable>

        <AppText size={12} muted style={{ textAlign: 'center', marginTop: 23, lineHeight: 18 }}>
          {clerkConfigured
            ? 'O login usa Clerk. O chat só sincroniza depois de configurar Supabase, JWT e SQL; chamadas e mídia seguem como demonstração.'
            : 'A amostra não usa conta nem envia mensagens. Chamadas e mídia são demonstrações locais.'}
        </AppText>
      </View>
    </AppScreen>
  );
}
