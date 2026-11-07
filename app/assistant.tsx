import React, { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Speech from 'expo-speech';
import { AppScreen } from '@/components/AppScreen';

const speechRecognition = (() => {
  if (Platform.OS === 'web') return null;

  try {
    return require('expo-speech-recognition') as typeof import('expo-speech-recognition');
  } catch {
    return null;
  }
})();

const useSpeechRecognitionEvent = speechRecognition?.useSpeechRecognitionEvent ?? (() => undefined);
const ExpoSpeechRecognitionModule = speechRecognition?.ExpoSpeechRecognitionModule ?? {
  isRecognitionAvailable: () => false,
  requestPermissionsAsync: async () => ({ granted: false }),
  start: () => undefined,
  stop: () => undefined,
  abort: () => undefined,
};
import { AppText } from '@/components/AppText';
import { InfoBanner } from '@/components/InfoBanner';
import { useAccountSession, useDemoMode } from '@/context/AppSessionContext';
import { useApp } from '@/context/AppContext';
import { useAppColors } from '@/hooks/useAppColors';
import { GeminiTurn, sendGeminiMessage } from '@/lib/geminiAssistant';

type AssistantMessage = GeminiTurn & { id: string; createdAt: number };

const STORAGE_KEY = '@conecta/gemini-assistant-v1';
const welcomeMessage: AssistantMessage = {
  id: 'welcome-gemini',
  role: 'model',
  text: 'Olá! Sou o Assistente Gemini do Conecta. Posso responder perguntas, explicar assuntos com clareza e ajudar você a organizar ideias. O que você gostaria de conversar?',
  createdAt: 0,
};

function formatMessageTime(timestamp: number) {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function AssistantScreen() {
  const colors = useAppColors();
  const account = useAccountSession();
  const { enabled: demoMode } = useDemoMode();
  const { preferences } = useApp();
  const [messages, setMessages] = useState<AssistantMessage[]>([welcomeMessage]);
  const [historyReady, setHistoryReady] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const listRef = useRef<FlatList<AssistantMessage>>(null);
  const canUseGemini = account.isSignedIn && !demoMode;

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!active || !raw) return;
      try {
        const stored = JSON.parse(raw) as unknown;
        if (Array.isArray(stored)) {
          const valid = stored.filter((item): item is AssistantMessage =>
            typeof item === 'object' && item !== null &&
            (item as AssistantMessage).role !== undefined &&
            ((item as AssistantMessage).role === 'user' || (item as AssistantMessage).role === 'model') &&
            typeof (item as AssistantMessage).text === 'string' &&
            typeof (item as AssistantMessage).id === 'string' &&
            typeof (item as AssistantMessage).createdAt === 'number',
          ).slice(-60);
          if (valid.length) setMessages([welcomeMessage, ...valid]);
        }
      } catch {
        // Ignore a damaged local history and keep the fresh welcome message.
      }
    }).catch(() => undefined).finally(() => {
      if (active) setHistoryReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!historyReady) return;
    const persisted = messages.filter((message) => message.id !== welcomeMessage.id).slice(-60);
    void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)).catch(() => undefined);
  }, [historyReady, messages]);

  useSpeechRecognitionEvent('start', () => {
    setListening(true);
    setVoiceStatus('Ouvindo. A fala será transformada em texto para você revisar.');
  });
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results.find((item) => item.transcript.trim())?.transcript.trim();
    if (!event.isFinal || !transcript) return;
    setInputText((current) => current.trim() ? `${current.trim()} ${transcript}` : transcript);
    setVoiceStatus('Texto reconhecido. Revise e envie quando quiser.');
  });
  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    setVoiceStatus(event.error === 'not-allowed'
      ? 'Permissão de microfone ou reconhecimento de fala negada.'
      : `Falha no reconhecimento de voz: ${event.message}`);
  });

  useEffect(() => () => {
    try {
      if (ExpoSpeechRecognitionModule.isRecognitionAvailable()) ExpoSpeechRecognitionModule.stop();
    } catch {
      // Speech recognition may not be available on this platform.
    }
    Speech.stop();
  }, []);

  const startDictation = async () => {
    if (!preferences.voiceNavigation) {
      setVoiceStatus('Ative “Ditado e comandos por voz” em Acessibilidade para ditar uma pergunta.');
      return;
    }
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setVoiceStatus('Reconhecimento de voz indisponível neste aparelho ou navegador.');
        return;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setVoiceStatus('Permita o acesso ao microfone e ao reconhecimento de fala nas configurações do aparelho.');
        return;
      }
      setVoiceStatus('');
      ExpoSpeechRecognitionModule.start({ lang: 'pt-BR', interimResults: false, maxAlternatives: 1, continuous: false, addsPunctuation: true });
    } catch (error) {
      setListening(false);
      setVoiceStatus(error instanceof Error ? error.message : 'Não foi possível iniciar o ditado.');
    }
  };

  const submitMessage = async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    if (!canUseGemini) {
      setErrorMessage('Entre em uma conta Clerk para conversar com a IA. A amostra local não envia dados a serviços externos.');
      return;
    }
    const history = messages
      .filter((message) => message.id !== welcomeMessage.id)
      .slice(-12)
      .map(({ role, text: turnText }) => ({ role, text: turnText }));
    const userMessage: AssistantMessage = { id: `user-${Date.now()}`, role: 'user', text, createdAt: Date.now() };
    setMessages((previous) => [...previous, userMessage]);
    setInputText('');
    setSending(true);
    setErrorMessage('');
    try {
      const answer = await sendGeminiMessage(text, history);
      setMessages((previous) => [...previous, { id: `model-${Date.now()}`, role: 'model', text: answer, createdAt: Date.now() }]);
    } catch (error) {
      setMessages((previous) => previous.filter((message) => message.id !== userMessage.id));
      setInputText(text);
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível obter uma resposta do Gemini.');
    } finally {
      setSending(false);
    }
  };

  const clearHistory = async () => {
    if (sending) return;
    setMessages([welcomeMessage]);
    setInputText('');
    setErrorMessage('');
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  };

  return (
    <AppScreen scroll={false} contentStyle={{ flex: 1, paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border, gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <AppText size={16} weight="700">Assistente Gemini</AppText>
            <AppText size={11} muted>Conversa com inteligência artificial</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Apagar histórico do Assistente Gemini" onPress={() => void clearHistory()} disabled={sending || messages.length <= 1} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: sending || messages.length <= 1 ? 0.45 : 1 }}>
            <Feather name="trash-2" size={18} color={colors.primary} />
          </Pressable>
        </View>

        {!canUseGemini ? (
          <InfoBanner tone="warning">O Assistente Gemini requer uma conta autenticada. A amostra local permanece no aparelho e não envia mensagens à IA.</InfoBanner>
        ) : <InfoBanner tone="info">Suas mensagens são enviadas ao Gemini para gerar respostas. Evite compartilhar informações sensíveis.</InfoBanner>}

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: !preferences.reduceMotion })}
          renderItem={({ item }) => {
            const isUser = item.role === 'user';
            return (
              <View style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '88%', minWidth: 115, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 17, backgroundColor: isUser ? colors.primary : colors.muted }}>
                <AppText size={15} color={isUser ? colors.primaryForeground : colors.foreground} style={{ lineHeight: 22 * preferences.spacingScale }}>{item.text}</AppText>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 5, gap: 10 }}>
                  <AppText size={10} color={isUser ? colors.primaryForeground : colors.mutedForeground}>{item.createdAt ? formatMessageTime(item.createdAt) : 'Gemini'}</AppText>
                  {!isUser ? (
                    <Pressable accessibilityRole="button" accessibilityLabel="Ouvir resposta do Gemini" onPress={() => { Speech.stop(); Speech.speak(item.text, { language: 'pt-BR', rate: 0.9 }); }} style={{ minWidth: 36, minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <Feather name="volume-2" size={14} color={colors.primary} />
                      <AppText size={10} color={colors.primary}>Ouvir</AppText>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          }}
          ListFooterComponent={sending ? (
            <View accessibilityLiveRegion="polite" style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <AppText size={12} muted>Gemini está respondendo…</AppText>
            </View>
          ) : null}
        />

        {errorMessage ? (
          <View style={{ marginHorizontal: 12, marginBottom: 6, padding: 10, borderRadius: 12, backgroundColor: colors.destructive + '12' }}>
            <AppText accessibilityRole="alert" size={12} color={colors.destructive}>{errorMessage}</AppText>
          </View>
        ) : null}
        {voiceStatus ? <AppText accessibilityLiveRegion="polite" size={11} muted style={{ paddingHorizontal: 14, paddingBottom: 5 }}>{voiceStatus}</AppText> : null}

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}>
          <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingTop: 9, paddingBottom: 12, borderTopWidth: 1, borderColor: colors.border, alignItems: 'flex-end', gap: 7 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={listening ? 'Parar ditado' : 'Ditar pergunta para o Gemini'}
              onPress={() => listening ? ExpoSpeechRecognitionModule.stop() : void startDictation()}
              disabled={!canUseGemini || sending}
              style={({ pressed }) => ({ width: preferences.largeTouchTargets ? 52 : 44, height: preferences.largeTouchTargets ? 52 : 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: listening ? colors.destructive : colors.secondary, opacity: pressed || !canUseGemini || sending ? 0.55 : 1 })}
            >
              <Feather name={listening ? 'square' : 'mic'} size={18} color={listening ? colors.primaryForeground : colors.primary} />
            </Pressable>
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder="Escreva sua pergunta…"
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel="Mensagem para o Assistente Gemini"
              editable={canUseGemini && !sending && historyReady}
              multiline
              maxLength={4_000}
              style={{ flex: 1, maxHeight: 120, minHeight: preferences.largeTouchTargets ? 52 : 44, paddingHorizontal: 15, paddingVertical: 11, borderRadius: 18, color: colors.foreground, backgroundColor: colors.muted, fontSize: 15 * preferences.fontScale }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enviar mensagem ao Gemini"
              onPress={() => void submitMessage()}
              disabled={!inputText.trim() || !canUseGemini || sending || !historyReady}
              style={({ pressed }) => ({ width: preferences.largeTouchTargets ? 54 : 46, height: preferences.largeTouchTargets ? 54 : 46, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, opacity: pressed || !inputText.trim() || !canUseGemini || sending || !historyReady ? 0.5 : 1 })}
            >
              {sending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Feather name="send" size={18} color={colors.primaryForeground} />}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
        <AppText size={10} muted style={{ textAlign: 'center', paddingBottom: Platform.OS === 'web' ? 38 : 8, paddingHorizontal: 10 }}>
          As respostas podem conter erros. O histórico é salvo somente neste aparelho.
        </AppText>
      </View>
    </AppScreen>
  );
}
