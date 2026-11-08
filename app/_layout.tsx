import '@/global.css';
import 'react-native-reanimated';
import '@/lib/_core/nativewind-pressable';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import { Stack, router, useSegments, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { ThemeProvider } from '@/lib/theme-provider';
import { initManusRuntime, subscribeSafeAreaInsets } from '@/lib/_core/manus-runtime';
import {
  SafeAreaFrameContext,
  SafeAreaInsetsContext,
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';
import type { EdgeInsets, Metrics, Rect } from 'react-native-safe-area-context';
import { ClerkLoaded, ClerkProvider, useAuth, useUser } from '@clerk/expo';
import { tokenCache } from '@clerk/expo/token-cache';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { AppProvider, useApp } from '@/context/AppContext';
import {
  AccountSessionProvider,
  AppSessionProvider,
  useDemoMode,
  type AccountSession,
} from '@/context/AppSessionContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppScreen } from '@/components/AppScreen';
import { AppText } from '@/components/AppText';
import { useAppColors } from '@/hooks/useAppColors';
import { hasSupabaseConfig, setClerkTokenGetter, syncClerkUserToSupabase } from '@/lib/supabase';
import { esp32Ble } from '@/lib/esp32Ble';
import { provideAccessibilityFeedback } from '@/lib/accessibilityFeedback';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const DEFAULT_WEB_INSETS: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_WEB_FRAME: Rect = { x: 0, y: 0, width: 0, height: 0 };
const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
const clerkProxyUrl = process.env.EXPO_PUBLIC_CLERK_PROXY_URL || undefined;

export const unstable_settings = { anchor: '(tabs)' };

function LoadingScreen({ label = 'Carregando…' }: { label?: string }) {
  const colors = useAppColors();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <ActivityIndicator color={colors.primary} />
      <AppText muted size={13} style={{ marginTop: 12 }}>{label}</AppText>
    </View>
  );
}

function ProfileSyncGate({
  message,
  retry,
  signOut,
}: {
  message: string;
  retry: () => Promise<boolean>;
  signOut: () => Promise<void>;
}) {
  const colors = useAppColors();
  const [busy, setBusy] = useState(false);
  const runRetry = async () => {
    setBusy(true);
    await retry();
    setBusy(false);
  };
  return (
    <AppScreen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <View style={{ width: '100%', maxWidth: 460, alignSelf: 'center', gap: 12, padding: 8 }}>
        <AppText size={23} weight="700">Não foi possível preparar seu perfil</AppText>
        <AppText muted style={{ lineHeight: 22 }}>{message}</AppText>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void runRetry()}
          style={{ minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: busy ? 0.65 : 1 }}
        >
          <AppText weight="700" color={colors.primaryForeground}>{busy ? 'Tentando…' : 'Tentar novamente'}</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => void signOut()}
          style={{ minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <AppText weight="600">Sair da conta</AppText>
        </Pressable>
      </View>
    </AppScreen>
  );
}

function RouteStack() {
  return (
    <Stack screenOptions={{ headerShown: false, headerBackTitle: 'Voltar' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="assistant" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/sign-up" options={{ headerShown: false }} />
      <Stack.Screen name="conversation/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="video-call/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="contacts" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
      <Stack.Screen name="privacy" options={{ headerShown: false }} />
      <Stack.Screen name="security" options={{ headerShown: false }} />
      <Stack.Screen name="accessibility" options={{ headerShown: false }} />
      <Stack.Screen name="dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="assistive-device" options={{ headerShown: false }} />
      <Stack.Screen name="preferences/[section]" options={{ headerShown: false }} />
      <Stack.Screen name="oauth/callback" options={{ headerShown: false }} />
    </Stack>
  );
}

function ClerkRoutes() {
  const { isLoaded: authLoaded, isSignedIn, getToken, signOut } = useAuth();
  const { isLoaded: userLoaded, user } = useUser();
  const segments = useSegments();
  const { enabled: demoMode } = useDemoMode();
  const [profileSyncState, setProfileSyncState] = useState<AccountSession['profileSyncState']>('idle');
  const [profileSyncError, setProfileSyncError] = useState('');
  const signedIn = isSignedIn === true;
  const authRoute = segments[0] === '(auth)';
  const welcomeRoute = segments[0] === 'welcome';
  const configuredForSupabase = hasSupabaseConfig();

  const retryProfileSync = useCallback(async () => {
    if (!signedIn || !user || !configuredForSupabase) return false;
    setProfileSyncState('syncing');
    setProfileSyncError('');
    try {
      const synced = await syncClerkUserToSupabase(user);
      if (!synced) throw new Error('O Supabase não confirmou a sincronização do perfil. Confira as claims do JWT Clerk e a política RLS de profiles.');
      setProfileSyncState('ready');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'A sincronização do perfil falhou.';
      setProfileSyncError(message);
      setProfileSyncState('error');
      return false;
    }
  }, [configuredForSupabase, signedIn, user]);

  useEffect(() => {
    setClerkTokenGetter(signedIn && !demoMode ? () => getToken() : undefined);
    return () => setClerkTokenGetter(undefined);
  }, [demoMode, getToken, signedIn]);

  useEffect(() => {
    if (!authLoaded || !userLoaded) return;
    const timer = setTimeout(() => {
      if (signedIn && user && !demoMode && configuredForSupabase) {
        void retryProfileSync();
      } else {
        setProfileSyncError('');
        setProfileSyncState('idle');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [authLoaded, configuredForSupabase, demoMode, retryProfileSync, signedIn, user, userLoaded]);

  useEffect(() => {
    if (!authLoaded) return;
    if (demoMode && welcomeRoute) {
      router.replace('/(tabs)' as Href);
    } else if (!demoMode && signedIn && (authRoute || welcomeRoute)) {
      router.replace('/(tabs)' as Href);
    } else if (!demoMode && !signedIn && !authRoute && !welcomeRoute) {
      router.replace('/welcome' as Href);
    }
  }, [authLoaded, authRoute, demoMode, signedIn, welcomeRoute]);

  if (!authLoaded || (signedIn && !userLoaded)) return <LoadingScreen label="Verificando sua conta…" />;
  if (signedIn && !demoMode && configuredForSupabase && profileSyncState !== 'ready' && profileSyncState !== 'error') {
    return <LoadingScreen label="Preparando seu perfil no Supabase…" />;
  }
  if (signedIn && !demoMode && configuredForSupabase && profileSyncState === 'error') {
    return <ProfileSyncGate message={profileSyncError} retry={retryProfileSync} signOut={signOut} />;
  }

  const redirecting = demoMode
    ? welcomeRoute
    : signedIn
      ? authRoute || welcomeRoute
      : !authRoute && !welcomeRoute;
  if (redirecting) return <LoadingScreen />;

  const session: AccountSession = demoMode
    ? {
        isSignedIn: false,
        userId: null,
        email: null,
        displayName: null,
        profileSyncState: 'idle',
        profileSyncError: '',
        retryProfileSync: async () => false,
        signOut: async () => undefined,
      }
    : {
        isSignedIn: signedIn,
        userId: user?.id ?? null,
        email: user?.primaryEmailAddress?.emailAddress ?? user?.username ?? null,
        displayName: user?.fullName ?? user?.firstName ?? null,
        profileSyncState,
        profileSyncError,
        retryProfileSync,
        signOut,
      };

  return (
    <AccountSessionProvider value={session}>
      <RouteStack />
    </AccountSessionProvider>
  );
}

function PublicRoutes() {
  const segments = useSegments();
  const { enabled: demoMode } = useDemoMode();
  const welcomeRoute = segments[0] === 'welcome';

  useEffect(() => {
    if (demoMode && welcomeRoute) router.replace('/(tabs)' as Href);
    if (!demoMode && !welcomeRoute) router.replace('/welcome' as Href);
  }, [demoMode, welcomeRoute]);

  if (demoMode ? welcomeRoute : !welcomeRoute) return <LoadingScreen />;
  const anonymous: AccountSession = {
    isSignedIn: false,
    userId: null,
    email: null,
    displayName: null,
    profileSyncState: 'idle',
    profileSyncError: '',
    retryProfileSync: async () => false,
    signOut: async () => undefined,
  };
  return (
    <AccountSessionProvider value={anonymous}>
      <RouteStack />
    </AccountSessionProvider>
  );
}

function ApplicationRoutes() {
  return clerkPublishableKey ? (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      tokenCache={Platform.OS !== 'web' ? tokenCache : undefined}
      proxyUrl={clerkProxyUrl}
    >
      <ClerkLoaded><ClerkRoutes /></ClerkLoaded>
    </ClerkProvider>
  ) : <PublicRoutes />;
}

function Esp32EventBridge() {
  const { preferences } = useApp();
  const segments = useSegments();
  const onAssistiveDeviceScreen = segments.join('/') === 'assistive-device';
  useEffect(() => esp32Ble.subscribeToEvents((event) => {
    if (event.type === 'button_press' && event.action === 'read_last_message') {
      esp32Ble.dispatchReadLastMessage(event);
      void provideAccessibilityFeedback('Comando do botão assistivo recebido.', preferences);
      const conversationId = esp32Ble.getSelectedConversationId();
      if (!onAssistiveDeviceScreen) {
        router.push((conversationId ? `/assistive-device?conversationId=${encodeURIComponent(conversationId)}` : '/assistive-device') as Href);
      }
    } else if (event.type === 'error') {
      void provideAccessibilityFeedback(event.message ?? 'O ESP32 enviou um comando inválido.', preferences, 'error');
    }
  }), [onAssistiveDeviceScreen, preferences]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const initialInsets = initialWindowMetrics?.insets ?? DEFAULT_WEB_INSETS;
  const initialFrame = initialWindowMetrics?.frame ?? DEFAULT_WEB_FRAME;
  const [insets, setInsets] = useState<EdgeInsets>(initialInsets);
  const [frame, setFrame] = useState<Rect>(initialFrame);
  useEffect(() => { initManusRuntime(); }, []);
  const handleSafeAreaUpdate = useCallback((metrics: Metrics) => {
    setInsets(metrics.insets);
    setFrame(metrics.frame);
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    return subscribeSafeAreaInsets(handleSafeAreaUpdate);
  }, [handleSafeAreaUpdate]);
  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontError, fontsLoaded]);

  const providerInitialMetrics = useMemo(() => {
    const metrics = initialWindowMetrics ?? { insets: initialInsets, frame: initialFrame };
    return {
      ...metrics,
      insets: {
        ...metrics.insets,
        top: Math.max(metrics.insets.top, 16),
        bottom: Math.max(metrics.insets.bottom, 12),
      },
    };
  }, [initialFrame, initialInsets]);

  if (!fontsLoaded && !fontError) return null;

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <AppProvider>
          <AppSessionProvider>
            <ErrorBoundary>
              <Esp32EventBridge />
              <ApplicationRoutes />
              <StatusBar style="auto" />
            </ErrorBoundary>
          </AppSessionProvider>
        </AppProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );

  return (
    <ThemeProvider>
      <SafeAreaProvider initialMetrics={providerInitialMetrics}>
        {Platform.OS === 'web' ? (
          <SafeAreaFrameContext.Provider value={frame}>
            <SafeAreaInsetsContext.Provider value={insets}>{content}</SafeAreaInsetsContext.Provider>
          </SafeAreaFrameContext.Provider>
        ) : content}
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
