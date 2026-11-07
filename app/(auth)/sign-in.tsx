import React, { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Href, router } from 'expo-router';
import { useSignIn } from '@clerk/expo';
import { AppText } from '@/components/AppText';
import { AuthShell } from '@/components/AuthShell';
import { GoogleSignInButton } from '@/components/GoogleSignInButton';
import { useApp } from '@/context/AppContext';
import { useAppColors } from '@/hooks/useAppColors';

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

function ConfiguredSignInScreen() {
  const colors = useAppColors();
  const { preferences } = useApp();
  const { signIn, fetchStatus } = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [feedback, setFeedback] = useState('');

  const finishSignIn = async () => {
    await signIn.finalize({
      navigate: async ({ session }) => {
        if (session?.currentTask) {
          setFeedback('Conclua a etapa de segurança pendente para continuar.');
          return;
        }
        router.replace('/(tabs)' as Href);
      },
    });
  };

  const submit = async () => {
    setFeedback('');
    try {
      const { error } = await signIn.password({
        emailAddress: email.trim(),
        password,
      });
      if (error) {
        setFeedback(getErrorMessage(error, 'Confira o e-mail e a senha e tente novamente.'));
        return;
      }
      if (signIn.status === 'complete') {
        await finishSignIn();
        return;
      }
      if (signIn.status === 'needs_client_trust') {
        const emailFactor = signIn.supportedSecondFactors?.find((factor) => factor.strategy === 'email_code');
        if (emailFactor) {
          const result = await signIn.mfa.sendEmailCode();
          if (result.error) {
            setFeedback(getErrorMessage(result.error, 'Não foi possível enviar o código.'));
            return;
          }
          setAwaitingCode(true);
          return;
        }
      }
      setFeedback('A conta exige uma etapa de segurança que ainda não está configurada nesta tela.');
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Não foi possível entrar agora.'));
    }
  };

  const verifyCode = async () => {
    setFeedback('');
    try {
      const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
      if (error) {
        setFeedback(getErrorMessage(error, 'Código inválido ou expirado.'));
        return;
      }
      if (signIn.status === 'complete') await finishSignIn();
      else setFeedback('A verificação ainda não foi concluída. Confira o código e tente de novo.');
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Não foi possível validar o código.'));
    }
  };

  return (
    <AuthShell
      title={awaitingCode ? 'Confirme sua entrada' : 'Entrar na conta'}
      subtitle="Acesse sua conta Ponte"
      footerText="Ainda não tem uma conta?"
      footerAction="Criar conta"
      onFooterPress={() => router.replace('/(auth)/sign-up' as Href)}
    >
      {awaitingCode ? (
        <>
          <AppText size={13} muted style={{ marginBottom: 12 }}>
            Digite o código enviado ao seu e-mail para confirmar este acesso.
          </AppText>
          <TextInput
            accessibilityLabel="Código de verificação"
            autoComplete="one-time-code"
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
            placeholder="Código de verificação"
            placeholderTextColor={colors.mutedForeground}
            style={{
              minHeight: 50,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              paddingHorizontal: 14,
              color: colors.foreground,
              backgroundColor: colors.background,
              fontSize: 16 * preferences.fontScale,
              marginBottom: 12,
            }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={verifyCode}
            disabled={fetchStatus === 'fetching' || !code.trim()}
            style={({ pressed }) => ({
              minHeight: 50,
              borderRadius: 15,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed || fetchStatus === 'fetching' ? 0.7 : 1,
            })}
          >
            {fetchStatus === 'fetching' ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <AppText weight="700" color={colors.primaryForeground}>
                Verificar código
              </AppText>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <AppText size={12} weight="700" muted style={{ marginBottom: 7 }}>
            E-MAIL
          </AppText>
          <TextInput
            accessibilityLabel="E-mail"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="voce@exemplo.com"
            placeholderTextColor={colors.mutedForeground}
            style={{
              minHeight: 50,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              paddingHorizontal: 14,
              color: colors.foreground,
              backgroundColor: colors.background,
              fontSize: 16 * preferences.fontScale,
              marginBottom: 14,
            }}
          />
          <AppText size={12} weight="700" muted style={{ marginBottom: 7 }}>
            SENHA
          </AppText>
          <TextInput
            accessibilityLabel="Senha"
            autoComplete="current-password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Sua senha"
            placeholderTextColor={colors.mutedForeground}
            style={{
              minHeight: 50,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              paddingHorizontal: 14,
              color: colors.foreground,
              backgroundColor: colors.background,
              fontSize: 16 * preferences.fontScale,
              marginBottom: 14,
            }}
          />
          <Pressable
            accessibilityRole="button"
            onPress={submit}
            disabled={fetchStatus === 'fetching' || !email.trim() || !password}
            style={({ pressed }) => ({
              minHeight: 50,
              borderRadius: 15,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed || fetchStatus === 'fetching' ? 0.7 : 1,
            })}
          >
            {fetchStatus === 'fetching' ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <AppText weight="700" color={colors.primaryForeground}>
                Entrar
              </AppText>
            )}
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 15 }}>
            <View style={{ height: 1, flex: 1, backgroundColor: colors.border }} />
            <AppText size={11} muted>OU</AppText>
            <View style={{ height: 1, flex: 1, backgroundColor: colors.border }} />
          </View>
          <GoogleSignInButton onError={setFeedback} />
        </>
      )}
      {feedback ? (
        <AppText accessibilityRole="alert" size={12} color={colors.destructive} style={{ marginTop: 12, lineHeight: 18 }}>
          {feedback}
        </AppText>
      ) : null}
    </AuthShell>
  );
}

export default function SignInScreen() {
  if (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) return <ConfiguredSignInScreen />;
  return (
    <AuthShell
      title="Login não configurado"
      subtitle="O acesso exige uma chave Clerk real."
      footerText="Voltar à página inicial"
      footerAction="Início"
      onFooterPress={() => router.replace('/welcome' as Href)}
    >
      <AppText accessibilityRole="alert" muted style={{ lineHeight: 21 }}>
        Nenhuma sessão foi criada. Configure Clerk para entrar em uma conta real ou volte e explore a amostra local anônima.
      </AppText>
    </AuthShell>
  );
}
