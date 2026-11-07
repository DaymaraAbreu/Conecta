import React, { useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { useSSO } from '@clerk/expo';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Href, router } from 'expo-router';
import { Platform, Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { useAppColors } from '@/hooks/useAppColors';

WebBrowser.maybeCompleteAuthSession();

type GoogleSignInButtonProps = {
  onError: (message: string) => void;
};

export function GoogleSignInButton({ onError }: GoogleSignInButtonProps) {
  const colors = useAppColors();
  const { startSSOFlow } = useSSO();
  const [busy, setBusy] = useState(false);
  const configuredScheme = Constants.expoConfig?.scheme;
  const appScheme = Array.isArray(configuredScheme) ? configuredScheme[0] : configuredScheme;

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  const signInWithGoogle = async () => {
    setBusy(true);
    onError('');
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri({ scheme: appScheme }),
      });
      if (!createdSessionId || !setActive) {
        onError('O acesso Google precisa de etapas adicionais. Tente entrar por e-mail ou configure o provedor Google no painel Auth.');
        return;
      }
      await setActive({
        session: createdSessionId,
        navigate: async ({ session }) => {
          if (session?.currentTask) {
            onError('Conclua a etapa de segurança pendente e tente novamente.');
            return;
          }
          router.replace('/(tabs)' as Href);
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      onError(message || 'Não foi possível entrar com Google. Confirme se o provedor está ativo no painel Auth.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continuar com Google"
      onPress={signInWithGoogle}
      disabled={busy}
      style={({ pressed }) => ({
        minHeight: 50,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 10,
        backgroundColor: colors.card,
        opacity: pressed || busy ? 0.7 : 1,
      })}
    >
      <View style={{ width: 19, height: 19, alignItems: 'center', justifyContent: 'center' }}>
        <AppText size={16} weight="700" color={colors.primary}>G</AppText>
      </View>
      <AppText size={14} weight="600">{busy ? 'Conectando…' : 'Continuar com Google'}</AppText>
      <Feather name="arrow-up-right" size={14} color={colors.mutedForeground} />
    </Pressable>
  );
}
