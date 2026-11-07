import React, { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { Href, router } from 'expo-router';
import { useSignUp } from '@clerk/expo';
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

function ConfiguredSignUpScreen() {
  const colors = useAppColors();
  const { preferences } = useApp();
  const { signUp, fetchStatus } = useSignUp();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [verificationSent, setVerificationSent] = useState(false);
  const [feedback, setFeedback] = useState('');

  const finishSignUp = async () => {
    await signUp.finalize({
      navigate: async ({ session }) => {
        if (session?.currentTask) {
          setFeedback('Conclua a etapa de segurança pendente para continuar.');
          return;
        }
        router.replace('/(tabs)' as Href);
      },
    });
  };

  const createAccount = async () => {
    setFeedback('');
    try {
      const { error } = await signUp.password({
        username: username.trim() || undefined,
        emailAddress: email.trim(),
        password,
      });
      if (error) {
        setFeedback(getErrorMessage(error, 'Confira o e-mail e a senha e tente novamente.'));
        return;
      }
      const result = await signUp.verifications.sendEmailCode();
      if (result.error) {
        setFeedback(getErrorMessage(result.error, 'Não foi possível enviar o código de confirmação.'));
        return;
      }
      setVerificationSent(true);
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Não foi possível criar a conta agora.'));
    }
  };

  const verifyEmail = async () => {
    setFeedback('');
    try {
      const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (error) {
        setFeedback(getErrorMessage(error, 'Código inválido ou expirado.'));
        return;
      }
      if (signUp.status === 'complete') await finishSignUp();
      else setFeedback('A verificação ainda não foi concluída. Confira o código e tente novamente.');
    } catch (error) {
      setFeedback(getErrorMessage(error, 'Não foi possível validar o código.'));
    }
  };

  return (
    <AuthShell
      title={verificationSent ? 'Confirme seu e-mail' : 'Criar conta'}
      subtitle="Crie sua conta Ponte"
      footerText="Já tem uma conta?"
      footerAction="Entrar"
      onFooterPress={() => router.replace('/(auth)/sign-in' as Href)}
    >
      {verificationSent ? (
        <>
          <AppText size={13} muted style={{ marginBottom: 12, lineHeight: 19 }}>
            Enviamos um código para {email}. Digite-o abaixo para ativar sua conta.
          </AppText>
          <TextInput
            accessibilityLabel="Código de verificação do e-mail"
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
            onPress={verifyEmail}
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
                Confirmar e-mail
              </AppText>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => signUp.verifications.sendEmailCode()}
            style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <AppText size={12} weight="600" color={colors.primary}>
              Reenviar código
            </AppText>
          </Pressable>
        </>
      ) : (
        <>
          <AppText size={12} weight="700" muted style={{ marginBottom: 7 }}>
            NOME DE USUÁRIO (OPCIONAL)
          </AppText>
          <TextInput
            accessibilityLabel="Nome de usuário"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            value={username}
            onChangeText={setUsername}
            placeholder="seuusuario"
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
            autoComplete="new-password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="Crie uma senha"
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
              marginBottom: 8,
            }}
          />
          <AppText size={11} muted style={{ marginBottom: 13 }}>
            Use no mínimo 8 caracteres.
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={createAccount}
            disabled={fetchStatus === 'fetching' || !email.trim() || password.length < 8}
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
                Criar conta
              </AppText>
            )}
          </Pressable>
          <View nativeID="clerk-captcha" />
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

export default function SignUpScreen() {
  if (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) return <ConfiguredSignUpScreen />;
  return (
    <AuthShell
      title="Cadastro não configurado"
      subtitle="O cadastro exige uma chave Clerk real."
      footerText="Voltar à página inicial"
      footerAction="Início"
      onFooterPress={() => router.replace('/welcome' as Href)}
    >
      <AppText accessibilityRole="alert" muted style={{ lineHeight: 21 }}>
        Nenhuma conta foi criada. Configure Clerk para habilitar o cadastro real ou volte e explore a amostra local anônima.
      </AppText>
    </AuthShell>
  );
}
