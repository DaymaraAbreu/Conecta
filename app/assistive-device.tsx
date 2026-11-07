import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { AppScreen } from '@/components/AppScreen';
import { AppText } from '@/components/AppText';
import { InfoBanner } from '@/components/InfoBanner';
import { PageHeader } from '@/components/PageHeader';
import { useApp } from '@/context/AppContext';
import { useAccountSession, useDemoMode } from '@/context/AppSessionContext';
import { useAppColors } from '@/hooks/useAppColors';
import { esp32Ble, type Esp32ConnectionSnapshot, type Esp32Event } from '@/lib/esp32Ble';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';

type ConversationOption = { id: string; name: string };
type PressRecord = { id: string; at: string; conversationName: string; result: string };
type MessageRow = { id: string; text: string; sender_id: string | null; audio_transcript: string | null; media_description: string | null; media_type: string | null; created_at: string };
const HISTORY_KEY = '@ponte/assistive-button-history-v1';
const MAX_HISTORY = 30;

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AssistiveDeviceScreen() {
  const params = useLocalSearchParams<{ conversationId?: string | string[] }>();
  const routeConversationId = Array.isArray(params.conversationId) ? params.conversationId[0] : params.conversationId;
  const colors = useAppColors();
  const account = useAccountSession();
  const { enabled: demoMode } = useDemoMode();
  const { conversations: localConversations, messages: localMessages, preferences, ready: localReady } = useApp();
  const [remoteConversations, setRemoteConversations] = useState<ConversationOption[]>([]);
  const [selectedId, setSelectedId] = useState(routeConversationId ?? esp32Ble.getSelectedConversationId());
  const [connection, setConnection] = useState<Esp32ConnectionSnapshot>(esp32Ble.getSnapshot());
  const [history, setHistory] = useState<PressRecord[]>([]);
  const [status, setStatus] = useState('Escolha uma conversa e pressione o botão para ouvir a última mensagem recebida.');
  const [lastRead, setLastRead] = useState<{ id: string; conversationName: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const handlerRef = useRef<(event: Esp32Event) => void>(() => undefined);
  const unregisterReadHandlerRef = useRef<(() => void) | null>(null);
  const selectionRef = useRef('');
  const lockRef = useRef(false);

  const localOptions = useMemo(() => localConversations.map((conversation) => ({ id: conversation.id, name: conversation.name })), [localConversations]);
  const remoteEnabled = !demoMode && account.isSignedIn && Boolean(account.userId) && hasSupabaseConfig();
  const conversationOptions = useMemo(() => demoMode ? localOptions : remoteEnabled ? remoteConversations : [], [demoMode, localOptions, remoteEnabled, remoteConversations]);
  const effectiveSelectedId = selectedId || (!routeConversationId && demoMode ? localOptions[0]?.id ?? '' : '');
  const selectedConversation = conversationOptions.find((conversation) => conversation.id === effectiveSelectedId);

  useEffect(() => {
    selectionRef.current = effectiveSelectedId;
    esp32Ble.setSelectedConversationId(effectiveSelectedId);
  }, [effectiveSelectedId]);

  useEffect(() => {
    const unsubscribeSnapshot = esp32Ble.subscribe(setConnection);
    return () => {
      unsubscribeSnapshot();
      unregisterReadHandlerRef.current?.();
      unregisterReadHandlerRef.current = null;
      Speech.stop();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(HISTORY_KEY).then((value) => {
      if (!mounted || !value) return;
      try {
        const parsed = JSON.parse(value) as PressRecord[];
        if (Array.isArray(parsed)) setHistory(parsed.slice(0, MAX_HISTORY));
      } catch { /* histórico corrompido não impede o simulador */ }
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (demoMode) {
      return;
    }
    if (!account.isSignedIn || !account.userId || !hasSupabaseConfig()) return;
    let active = true;
    void (async () => {
      try {
        const userId = account.userId as string;
        const { data: rows, error } = await supabase.from('conversations')
          .select('id, participant_one_id, participant_two_id')
          .or(`participant_one_id.eq.${userId},participant_two_id.eq.${userId}`)
          .order('last_message_at', { ascending: false });
        if (error) throw error;
        const otherIds = (rows ?? []).map((row) => row.participant_one_id === userId ? row.participant_two_id : row.participant_one_id);
        if (!otherIds.length) { if (active) setRemoteConversations([]); return; }
        const { data: profiles, error: profileError } = await supabase.from('profiles').select('id, name').in('id', otherIds);
        if (profileError) throw profileError;
        const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.name]));
        if (active) setRemoteConversations((rows ?? []).flatMap((row) => {
          const otherId = row.participant_one_id === userId ? row.participant_two_id : row.participant_one_id;
          const name = names.get(otherId);
          return name ? [{ id: row.id, name }] : [];
        }));
      } catch (error) {
        if (active) setStatus(`Não foi possível carregar conversas: ${error instanceof Error ? error.message : 'erro inesperado'}`);
      } finally {
      }
    })();
    return () => { active = false; };
  }, [account.isSignedIn, account.userId, demoMode]);

  const recordPress = useCallback((conversationName: string, result: string) => {
    const next: PressRecord[] = [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), conversationName, result }, ...history].slice(0, MAX_HISTORY);
    setHistory(next);
    void AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => undefined);
  }, [history]);

  const speakLatestReceived = useCallback(async () => {
    const conversationId = selectionRef.current;
    const conversation = conversationOptions.find((item) => item.id === conversationId);
    if (!conversationId || !conversation) {
      const message = conversationOptions.length === 0
        ? 'Não há conversas disponíveis. Entre em uma conta conectada ou abra uma conversa de demonstração.'
        : 'Selecione uma conversa antes de pressionar o botão assistivo.';
      setStatus(message);
      recordPress('Nenhuma conversa selecionada', 'Sem conversa selecionada');
      if (preferences.vibration) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      if (preferences.audioFeedback) Speech.speak(message, { language: 'pt-BR', rate: 0.9 });
      return;
    }
    setBusy(true);
    setStatus(`Procurando a última mensagem recebida de ${conversation.name}…`);
    try {
      let message: MessageRow | null = null;
      if (demoMode) {
        const received = (localMessages[conversationId] ?? []).filter((item) => !item.mine).at(-1);
        if (received) message = {
          id: received.id,
          text: received.text,
          sender_id: null,
          audio_transcript: received.audioTranscript ?? null,
          media_description: received.mediaDescription ?? null,
          media_type: received.mediaType ?? null,
          created_at: received.time,
        };
      } else {
        if (!account.isSignedIn || !account.userId || !hasSupabaseConfig()) throw new Error('Entre na conta e configure o Supabase para ler mensagens remotas.');
        const { data, error } = await supabase.from('messages')
          .select('id, text, sender_id, audio_transcript, media_description, media_type, created_at')
          .eq('conversation_id', conversationId)
          .eq('receiver_id', account.userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        message = data as MessageRow | null;
      }
      if (!message) {
        const messageText = `Não há mensagens recebidas em ${conversation.name}.`;
        setLastRead(null);
        setStatus(messageText);
        recordPress(conversation.name, 'Nenhuma mensagem recebida');
        if (preferences.vibration) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
        if (preferences.audioFeedback) Speech.speak(messageText, { language: 'pt-BR', rate: 0.9 });
        return;
      }
      const parts = [message.text];
      if (preferences.audioTranscription || preferences.liveCaptions) parts.push(message.audio_transcript ?? '');
      if ((message.media_type === 'image' && preferences.describeImages) || (message.media_type === 'figure' && preferences.describeFigures) || (message.media_type === 'gif' && preferences.describeGifs) || (message.media_type === 'video' && preferences.describeVideos)) parts.push(message.media_description ?? '');
      const text = parts.map((part) => part.trim()).filter(Boolean).join('. ');
      if (!text) {
        const unavailable = 'A última mensagem não contém texto acessível para leitura.';
        setLastRead({ id: message.id, conversationName: conversation.name, text: unavailable });
        setStatus(unavailable);
        recordPress(conversation.name, 'Mensagem sem conteúdo acessível');
        if (preferences.audioFeedback) Speech.speak(unavailable, { language: 'pt-BR', rate: 0.9 });
        return;
      }
      setLastRead({ id: message.id, conversationName: conversation.name, text });
      setStatus(`Lendo a última mensagem recebida de ${conversation.name}.`);
      setReading(true);
      recordPress(conversation.name, 'Leitura iniciada');
      if (preferences.vibration) await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      Speech.stop();
      Speech.speak(`${conversation.name} enviou: ${text}`, {
        language: 'pt-BR',
        rate: 0.9,
        onDone: () => { setReading(false); setStatus(`Leitura concluída: mensagem de ${conversation.name}.`); },
        onStopped: () => setReading(false),
        onError: () => { setReading(false); setStatus('Não foi possível iniciar a leitura em voz alta neste aparelho.'); },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível ler a mensagem.';
      setStatus(message);
      recordPress(conversation.name, 'Falha ao ler mensagem');
      if (preferences.vibration) await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      if (preferences.audioFeedback) Speech.speak(message, { language: 'pt-BR', rate: 0.9 });
    } finally {
      setBusy(false);
    }
  }, [account.isSignedIn, account.userId, conversationOptions, demoMode, localMessages, preferences, recordPress]);

  useEffect(() => {
    handlerRef.current = (event) => {
      if (event.type !== 'button_press' || event.action !== 'read_last_message' || lockRef.current) return;
      lockRef.current = true;
      const source = event.simulated === true ? 'simulado' : 'ESP32 físico';
      setStatus(`Botão ${source} acionado: button_press / read_last_message.`);
      void speakLatestReceived().finally(() => { lockRef.current = false; });
    };
    unregisterReadHandlerRef.current?.();
    unregisterReadHandlerRef.current = esp32Ble.registerReadLastMessageHandler((event) => handlerRef.current(event));
    return () => {
      unregisterReadHandlerRef.current?.();
      unregisterReadHandlerRef.current = null;
    };
  }, [speakLatestReceived]);

  const pressSimulatedButton = () => {
    if (busy) return;
    esp32Ble.simulateButtonPress();
  };

  const stopReading = () => {
    Speech.stop();
    setReading(false);
    setStatus('Leitura interrompida.');
    recordPress(selectedConversation?.name ?? 'Nenhuma conversa', 'Leitura interrompida');
    if (preferences.vibration) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  const statusLabel = connection.status === 'connected'
    ? `ESP32 conectado: ${connection.deviceName ?? 'dispositivo'}`
    : connection.status === 'unavailable'
      ? 'ESP32 físico indisponível nesta plataforma; simulador ativo'
      : 'Modo simulado ativo; nenhum ESP32 conectado';

  return (
    <AppScreen>
      <PageHeader title="Dispositivo Assistivo" subtitle="Simulador do botão ESP32" />
      <InfoBanner tone="info">O simulador usa o mesmo evento do firmware: button_press com a ação read_last_message. Não é necessário ter hardware.</InfoBanner>

      <View accessibilityLiveRegion="polite" style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, padding: 14, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Feather name={connection.status === 'connected' ? 'bluetooth' : 'cpu'} size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <AppText weight="700">{statusLabel}</AppText>
          <AppText size={12} muted style={{ marginTop: 3 }}>{connection.message}</AppText>
        </View>
      </View>

      <AppText size={14} weight="700" style={{ marginBottom: 7 }}>Conversa para leitura</AppText>
      {conversationOptions.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 52, marginBottom: 12 }} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
          {conversationOptions.map((item) => {
            const selected = effectiveSelectedId === item.id;
            return <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Selecionar conversa com ${item.name}`} onPress={() => { setSelectedId(item.id); esp32Ble.setSelectedConversationId(item.id); setStatus(`Conversa selecionada: ${item.name}.`); }} style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center', backgroundColor: selected ? colors.primary : colors.secondary, borderWidth: 1, borderColor: selected ? colors.primary : colors.border }}>
              <AppText size={13} weight="600" color={selected ? colors.primaryForeground : colors.foreground}>{item.name}</AppText>
            </Pressable>;
          })}
        </ScrollView>
      ) : <AppText muted style={{ marginBottom: 12 }}>{demoMode ? (localReady ? 'Nenhuma conversa de demonstração disponível.' : 'Carregando conversas…') : 'Nenhuma conversa remota disponível. Abra uma conversa ou entre em uma conta.'}</AppText>}

      <Pressable accessibilityRole="button" accessibilityLabel="Pressionar botão assistivo para ler a última mensagem recebida" accessibilityHint="Emite button_press com a ação read_last_message e inicia a leitura da última mensagem recebida na conversa selecionada." onPress={pressSimulatedButton} disabled={busy} style={({ pressed }) => ({ minHeight: 92, borderRadius: 20, backgroundColor: pressed ? colors.accent : colors.primary, borderWidth: 2, borderColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 12, opacity: busy ? 0.65 : pressed ? 0.82 : 1 })}>
        {busy ? <ActivityIndicator color={colors.primaryForeground} size="large" /> : <Feather name="radio" size={29} color={colors.primaryForeground} />}
        <AppText size={18} weight="700" color={colors.primaryForeground}>{busy ? 'Buscando mensagem…' : 'Pressionar botão assistivo'}</AppText>
      </Pressable>

      {reading ? <Pressable accessibilityRole="button" accessibilityLabel="Interromper leitura em voz alta" onPress={stopReading} style={{ minHeight: 54, borderRadius: 14, backgroundColor: colors.destructive, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginBottom: 12 }}><Feather name="square" size={18} color={colors.destructiveForeground} /><AppText weight="700" color={colors.destructiveForeground}>Interromper leitura</AppText></Pressable> : null}
      <AppText accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ padding: 12, borderRadius: 12, backgroundColor: colors.secondary, marginBottom: 12 }}>{status}</AppText>

      {lastRead ? <View style={{ borderLeftWidth: 4, borderLeftColor: colors.primary, backgroundColor: colors.card, borderRadius: 12, padding: 13, marginBottom: 16 }}><AppText size={11} weight="700" color={colors.primary}>MENSAGEM EM LEITURA · {lastRead.conversationName}</AppText><AppText size={14} style={{ marginTop: 6, lineHeight: 21 }}>{lastRead.text}</AppText></View> : null}

      <View style={{ flexDirection: 'row', gap: 9, marginBottom: 20 }}>
        {connection.status === 'connected' ? <Pressable accessibilityRole="button" onPress={() => void esp32Ble.sendCommand('read_last_message').catch((error) => setStatus(error instanceof Error ? error.message : 'Não foi possível enviar o comando ao ESP32.'))} style={{ flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><AppText size={12} weight="600">Testar ESP32 físico</AppText></Pressable> : <Pressable accessibilityRole="button" disabled={connection.status === 'scanning' || connection.status === 'connecting'} onPress={() => void esp32Ble.scanAndConnect()} style={{ flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', opacity: connection.status === 'scanning' || connection.status === 'connecting' ? 0.5 : 1 }}><AppText size={12} weight="600">{connection.status === 'scanning' || connection.status === 'connecting' ? 'Procurando ESP32…' : 'Conectar ESP32 físico'}</AppText></Pressable>}
        {connection.status === 'connected' ? <Pressable accessibilityRole="button" onPress={() => void esp32Ble.disconnect()} style={{ minHeight: 46, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}><AppText size={12} weight="600">Desconectar</AppText></Pressable> : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}><AppText size={16} weight="700">Histórico de acionamentos</AppText><AppText size={11} muted>{history.length} registros</AppText></View>
      {history.length ? history.slice(0, 10).map((item) => <View key={item.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', gap: 9 }}><Feather name="clock" size={15} color={colors.primary} style={{ marginTop: 2 }} /><View style={{ flex: 1 }}><AppText size={13} weight="600">{item.conversationName}</AppText><AppText size={11} muted style={{ marginTop: 2 }}>{timeLabel(item.at)} · {item.result}</AppText></View></View>) : <AppText muted size={13}>Os acionamentos aparecerão aqui neste aparelho.</AppText>}
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={{ alignSelf: 'flex-start', paddingVertical: 14 }}><AppText weight="600" color={colors.primary}>Voltar</AppText></Pressable>
    </AppScreen>
  );
}
