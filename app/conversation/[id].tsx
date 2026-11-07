import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Image,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import * as ImagePicker from 'expo-image-picker';
import { RecordingPresets, requestRecordingPermissionsAsync, useAudioPlayer, useAudioRecorder, useAudioRecorderState } from 'expo-audio';

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
import { supabase, hasSupabaseConfig } from '@/lib/supabase';
import { AppScreen } from '@/components/AppScreen';
import { AppText } from '@/components/AppText';
import { InfoBanner } from '@/components/InfoBanner';
import { useApp } from '@/context/AppContext';
import { useAccountSession, useDemoMode } from '@/context/AppSessionContext';
import { useAppColors } from '@/hooks/useAppColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { provideAccessibilityFeedback } from '@/lib/accessibilityFeedback';
import { createChatMediaUrl, uploadChatMedia } from '@/lib/chatMedia';
import { notifyIncomingMessage } from '@/lib/notifications';
import { describeImage, hasAssistiveAiConfig, simplifyMessage } from '@/lib/assistiveAi';
import { transcribeChatAudio } from '@/lib/voiceTranscription';

type MessageItem = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  receiver_id: string | null;
  text: string;
  created_at: string;
  read_at: string | null;
  localMine: boolean;
  audioTranscript?: string;
  mediaType?: 'image' | 'audio' | 'figure' | 'gif' | 'video';
  mediaDescription?: string;
  mediaUrl?: string;
  mediaPath?: string;
  audioDurationMs?: number;
};

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function messageFromLocal(
  message: { id: string; text: string; time: string; mine: boolean; read?: boolean; audioTranscript?: string; mediaType?: MessageItem['mediaType']; mediaDescription?: string },
  conversationId: string,
): MessageItem {
  const today = new Date();
  const parts = message.time.match(/^(\d{2}):(\d{2})$/);
  if (parts) today.setHours(Number(parts[1]), Number(parts[2]), 0, 0);
  return {
    id: message.id,
    conversation_id: conversationId,
    sender_id: null,
    receiver_id: null,
    text: message.text,
    created_at: parts ? today.toISOString() : message.time,
    read_at: message.read ? today.toISOString() : null,
    localMine: message.mine,
    audioTranscript: message.audioTranscript,
    mediaType: message.mediaType,
    mediaDescription: message.mediaDescription,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
}

export default function ConversationScreen() {
  const { id: routeId } = useLocalSearchParams<{ id: string | string[] }>();
  const conversationId = Array.isArray(routeId) ? routeId[0] : routeId;
  const account = useAccountSession();
  const { enabled: demoMode } = useDemoMode();
  const {
    preferences,
    messages: localMessages,
    conversations: localConversations,
    ready: localReady,
    sendMessage,
    openConversation,
  } = useApp();
  const colors = useAppColors();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [receiverName, setReceiverName] = useState('Contato');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [sendErrorMessage, setSendErrorMessage] = useState('');
  const [realtimeNotice, setRealtimeNotice] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [assistiveMenuOpen, setAssistiveMenuOpen] = useState(false);
  const [voiceInputActive, setVoiceInputActive] = useState(false);
  const [voiceInputStatus, setVoiceInputStatus] = useState('');
  const [imageReadingBusy, setImageReadingBusy] = useState(false);
  const [imageReadingStatus, setImageReadingStatus] = useState('');
  const [imageReadingText, setImageReadingText] = useState('');
  const [imageReadingDescription, setImageReadingDescription] = useState('');
  const flatListRef = useRef<FlatList<MessageItem>>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const player = useAudioPlayer(null);

  useSpeechRecognitionEvent('start', () => {
    setVoiceInputActive(true);
    setVoiceInputStatus('Ouvindo. Sua fala será inserida no rascunho; nada será enviado automaticamente.');
  });
  useSpeechRecognitionEvent('end', () => setVoiceInputActive(false));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results.find((item) => item.transcript.trim())?.transcript.trim();
    if (!event.isFinal || !transcript) return;
    setInputText((current) => current.trim() ? `${current.trim()} ${transcript}` : transcript);
    setVoiceInputStatus('Fala adicionada ao rascunho. Revise e toque em Enviar quando quiser.');
  });
  useSpeechRecognitionEvent('error', (event) => {
    setVoiceInputActive(false);
    setVoiceInputStatus(event.error === 'not-allowed'
      ? 'Permissão de microfone ou reconhecimento de fala negada.'
      : `Falha no reconhecimento de voz: ${event.message}`);
  });

  useEffect(() => () => {
    try {
      if (ExpoSpeechRecognitionModule.isRecognitionAvailable()) ExpoSpeechRecognitionModule.stop();
    } catch {
      // O serviço de fala pode não estar disponível nesta plataforma.
    }
    Speech.stop();
  }, []);

  const markConversationRead = useCallback(async () => {
    if (!conversationId) return;
    if (demoMode) {
      openConversation(conversationId);
      return;
    }
    if (!account.isSignedIn || !account.userId || !hasSupabaseConfig()) return;
    const { error } = await supabase.rpc('mark_conversation_read', {
      target_conversation_id: conversationId,
    });
    if (error) {
      setRealtimeNotice('Não foi possível atualizar o recibo de leitura agora.');
      return;
    }
    const readAt = new Date().toISOString();
    setMessages((previous) => previous.map((message) =>
      message.receiver_id === account.userId && !message.read_at
        ? { ...message, read_at: readAt }
        : message,
    ));
  }, [account.isSignedIn, account.userId, conversationId, demoMode, openConversation]);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const timer = setTimeout(() => {
      void (async () => {
        await Promise.resolve();
        if (!active) return;
    if (!conversationId) {
      setLoading(false);
      setErrorMessage('A conversa solicitada não foi encontrada.');
      return;
    }
    if (demoMode) {
      const conversation = localConversations.find((item) => item.id === conversationId);
      if (!conversation) {
        setErrorMessage('Este exemplo de conversa não existe mais. Volte à lista e abra uma conversa local.');
        setLoading(false);
        return;
      }
      setReceiverName(conversation.name);
      setMessages((localMessages[conversationId] ?? []).map((message) => messageFromLocal(message, conversationId)));
      setErrorMessage('');
      setRealtimeNotice('');
      setLoading(!localReady);
      openConversation(conversationId);
      return;
    }
    if (!account.isSignedIn || !account.userId) {
      setErrorMessage('Entre em uma conta real para abrir uma conversa.');
      setLoading(false);
      return;
    }
    if (!hasSupabaseConfig()) {
      setErrorMessage('O chat remoto não está configurado. Conecte Clerk ao projeto Supabase e execute supabase/chat-schema.sql.');
      setLoading(false);
      return;
    }

    const currentUserId = account.userId;
    setLoading(true);
    setErrorMessage('');
    setSendErrorMessage('');
    setRealtimeNotice('');

    const loadConversation = async () => {
      try {
        const { data: conversation, error: conversationError } = await supabase
          .from('conversations')
          .select('participant_one_id, participant_two_id')
          .eq('id', conversationId)
          .single();
        if (conversationError) throw conversationError;
        const receiverId = conversation.participant_one_id === currentUserId
          ? conversation.participant_two_id
          : conversation.participant_one_id;
        const { data: profile, error: profileError } = await supabase
          .from('profiles').select('name').eq('id', receiverId).single();
        if (profileError) throw profileError;
        const { data: conversationMessages, error: messagesError } = await supabase
          .from('messages')
          .select('id, conversation_id, sender_id, receiver_id, text, created_at, read_at, media_url, media_type, media_description, audio_transcript, audio_duration_ms')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });
        if (messagesError) throw messagesError;
        if (!active) return;
        setReceiverName(profile.name);
        const hydratedMessages = await Promise.all((conversationMessages ?? []).map(async (message) => ({
          ...message,
          localMine: message.sender_id === currentUserId,
          audioTranscript: message.audio_transcript ?? undefined,
          mediaDescription: message.media_description ?? undefined,
          mediaType: message.media_type ?? undefined,
          mediaPath: message.media_url ?? undefined,
          mediaUrl: message.media_url ? await createChatMediaUrl(message.media_url).catch(() => undefined) : undefined,
          audioDurationMs: message.audio_duration_ms ?? undefined,
        })));
        setMessages(hydratedMessages as MessageItem[]);
        await markConversationRead();
      } catch (error) {
        if (active) setErrorMessage(`Não foi possível abrir a conversa: ${getErrorMessage(error)}`);
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadConversation();

    channel = supabase
      .channel(`conversation_${conversationId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        if (!active) return;
        const rawMessage = payload.new as Record<string, unknown>;
        const changedMessage = {
          ...rawMessage,
          audioTranscript: typeof rawMessage.audio_transcript === 'string' ? rawMessage.audio_transcript : undefined,
          mediaDescription: typeof rawMessage.media_description === 'string' ? rawMessage.media_description : undefined,
          mediaType: typeof rawMessage.media_type === 'string' ? rawMessage.media_type : undefined,
          mediaPath: typeof rawMessage.media_url === 'string' ? rawMessage.media_url : undefined,
        } as Omit<MessageItem, 'localMine'> & { id?: string };
        if (!changedMessage.id) return;
        void (async () => {
          const item = { ...changedMessage, localMine: changedMessage.sender_id === currentUserId, mediaUrl: typeof changedMessage.mediaPath === 'string' ? await createChatMediaUrl(changedMessage.mediaPath).catch(() => undefined) : undefined } as MessageItem;
          if (!active) return;
          setMessages((previous) => {
            const existingIndex = previous.findIndex((message) => message.id === item.id);
            const merged = existingIndex < 0
              ? [...previous, item]
              : previous.map((message, index) => index === existingIndex ? { ...message, ...item } : message);
            return merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
          });
        })();
        if (payload.eventType === 'INSERT' && changedMessage.receiver_id === currentUserId) {
          void markConversationRead();
          void provideAccessibilityFeedback('Você recebeu uma nova mensagem.', preferences);
          if (preferences.messageNotifications) {
            void notifyIncomingMessage({ senderName: receiverName, message: changedMessage.text, showPreview: preferences.notificationPreview });
          }
        }
      })
      .subscribe((status) => {
        if (!active) return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setRealtimeNotice('Conexão em tempo real indisponível. Você pode atualizar ou tentar enviar novamente.');
        } else if (status === 'SUBSCRIBED') {
          setRealtimeNotice('');
        }
      });

        })();
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [account.isSignedIn, account.userId, conversationId, demoMode, localConversations, localMessages, localReady, markConversationRead, openConversation, preferences, receiverName]);

  const handleSend = async () => {
    const text = inputText.trim();
    if (!text || !conversationId || sending || loading) return;
    setSending(true);
    setSendErrorMessage('');
    try {
      if (demoMode) {
        sendMessage(conversationId, text);
        setMessages((previous) => [...previous, messageFromLocal({
          id: `local-${Date.now()}`,
          text,
          time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          mine: true,
        }, conversationId)]);
        setInputText('');
        void provideAccessibilityFeedback('Mensagem de exemplo salva somente neste aparelho.', preferences);
        return;
      }
      if (!account.isSignedIn || !account.userId || !hasSupabaseConfig()) {
        throw new Error('É necessário ter uma conta real e Supabase configurado para enviar mensagens.');
      }
      const currentUserId = account.userId;
      const { data: conversation, error: conversationError } = await supabase
        .from('conversations').select('participant_one_id, participant_two_id').eq('id', conversationId).single();
      if (conversationError) throw conversationError;
      const receiverId = conversation.participant_one_id === currentUserId
        ? conversation.participant_two_id
        : conversation.participant_one_id;
      const { data: newMessage, error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: currentUserId, receiver_id: receiverId, text })
        .select('id, conversation_id, sender_id, receiver_id, text, created_at, read_at')
        .single();
      if (error) throw error;
      setMessages((previous) => previous.some((message) => message.id === newMessage.id)
        ? previous
        : [...previous, { ...newMessage, localMine: true }]);
      setInputText('');
      setSendErrorMessage('');
      void provideAccessibilityFeedback('Mensagem enviada.', preferences);
    } catch (error) {
      const message = getErrorMessage(error);
      setSendErrorMessage(`Não foi possível enviar a mensagem: ${message}`);
      void provideAccessibilityFeedback('Não foi possível enviar a mensagem.', preferences, 'error');
    } finally {
      setSending(false);
    }
  };

  const getReceiverId = async (currentUserId: string) => {
    const { data, error } = await supabase.from('conversations')
      .select('participant_one_id, participant_two_id').eq('id', conversationId).single();
    if (error) throw error;
    return data.participant_one_id === currentUserId ? data.participant_two_id : data.participant_one_id;
  };

  const sendMediaMessage = async (uri: string, mimeType: string, mediaType: 'image' | 'audio', durationMs?: number) => {
    if (demoMode || !account.userId || !conversationId || !hasSupabaseConfig()) {
      throw new Error('Mídias exigem uma conta real com Supabase e o schema atualizado.');
    }
    const receiverId = await getReceiverId(account.userId);
    const mediaPath = await uploadChatMedia({ uri, userId: account.userId, conversationId, mimeType });
    const { data, error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: account.userId,
      receiver_id: receiverId,
      text: mediaType === 'image' ? 'Imagem enviada' : 'Mensagem de áudio',
      media_url: mediaPath,
      media_type: mediaType,
      audio_duration_ms: durationMs ?? null,
    }).select('id, conversation_id, sender_id, receiver_id, text, created_at, read_at, media_url, media_type, audio_duration_ms').single();
    if (error) throw error;
    const mediaUrl = await createChatMediaUrl(mediaPath);
    setMessages((previous) => previous.some((message) => message.id === data.id) ? previous : [...previous, {
      ...data,
      localMine: true,
      mediaPath,
      mediaUrl,
      mediaType,
      audioDurationMs: durationMs,
    } as MessageItem]);
    if (mediaType === 'audio' && preferences.audioTranscription) {
      void transcribeChatAudio(mediaUrl).then(async (transcript) => {
        const { error: transcriptError } = await supabase.rpc('set_message_audio_transcript', {
          target_message_id: data.id,
          transcript_text: transcript,
        });
        if (transcriptError) throw transcriptError;
        setMessages((previous) => previous.map((message) => message.id === data.id ? { ...message, audioTranscript: transcript } : message));
      }).catch((error) => setSendErrorMessage(`Áudio enviado, mas a transcrição não foi concluída: ${getErrorMessage(error)}`));
    } else if (mediaType === 'image' && hasAssistiveAiConfig()) {
      void describeImage(mediaUrl).then(async (result) => {
          const { error: descriptionError } = await supabase.rpc('set_message_media_description', {
            target_message_id: data.id,
            description_text: result.text,
          });
          if (descriptionError) throw descriptionError;
          setMessages((previous) => previous.map((message) => message.id === data.id ? { ...message, mediaDescription: result.text } : message));
        }).catch((error) => setSendErrorMessage(`Imagem enviada, mas a descrição não foi concluída: ${getErrorMessage(error)}`));
    }
  };

  const chooseImage = async () => {
    if (mediaBusy) return;
    setMediaBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('Permissão para acessar fotos não concedida.');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (!result.canceled && result.assets[0]) {
        await sendMediaMessage(result.assets[0].uri, result.assets[0].mimeType ?? 'image/jpeg', 'image');
        void provideAccessibilityFeedback('Imagem enviada.', preferences);
      }
    } catch (error) {
      setSendErrorMessage(`Não foi possível enviar a imagem: ${getErrorMessage(error)}`);
    } finally {
      setMediaBusy(false);
    }
  };

  const toggleRecording = async () => {
    if (mediaBusy) return;
    if (recorderState.isRecording) {
      setMediaBusy(true);
      try {
        await recorder.stop();
        if (!recorder.uri) throw new Error('A gravação não produziu um arquivo.');
        await sendMediaMessage(recorder.uri, 'audio/m4a', 'audio', Math.round(recorder.currentTime * 1000));
        void provideAccessibilityFeedback('Mensagem de áudio enviada.', preferences);
      } catch (error) {
        setSendErrorMessage(`Não foi possível enviar o áudio: ${getErrorMessage(error)}`);
      } finally {
        setMediaBusy(false);
      }
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setSendErrorMessage('Permissão de microfone não concedida.');
      return;
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
  };

  const playAudio = (message: MessageItem) => {
    if (!message.mediaUrl) return;
    if (playingMessageId === message.id) {
      player.pause();
      setPlayingMessageId(null);
      return;
    }
    player.replace(message.mediaUrl);
    player.play();
    setPlayingMessageId(message.id);
  };

  const simplifyDraft = async () => {
    const text = inputText.trim();
    if (!text || aiBusy) return;
    if (!hasAssistiveAiConfig()) {
      setSendErrorMessage('A simplificação por IA exige configurar EXPO_PUBLIC_ASSISTIVE_AI_URL.');
      return;
    }
    setAiBusy(true);
    setSendErrorMessage('Simplificando a mensagem…');
    try {
      const result = await simplifyMessage(text);
      setInputText(result.text.trim());
      setSendErrorMessage('Mensagem simplificada. Revise antes de enviar.');
      void provideAccessibilityFeedback('A mensagem foi simplificada. Revise o texto antes de enviar.', preferences);
    } catch (error) {
      setSendErrorMessage(`Não foi possível simplificar: ${getErrorMessage(error)}`);
    } finally {
      setAiBusy(false);
    }
  };

  const startVoiceDraft = async () => {
    if (!preferences.voiceNavigation) {
      setVoiceInputStatus('Ative “Atalhos para controle por voz” em Acessibilidade para usar a fala na conversa.');
      return;
    }
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setVoiceInputStatus('Reconhecimento de voz indisponível neste aparelho ou navegador.');
        return;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setVoiceInputStatus('Permita o acesso ao microfone e ao reconhecimento de fala nas configurações do aparelho.');
        return;
      }
      setVoiceInputStatus('');
      ExpoSpeechRecognitionModule.start({
        lang: 'pt-BR',
        interimResults: false,
        maxAlternatives: 1,
        continuous: false,
        addsPunctuation: true,
      });
    } catch (error) {
      setVoiceInputActive(false);
      setVoiceInputStatus(error instanceof Error ? error.message : 'Não foi possível iniciar o reconhecimento de voz.');
    }
  };

  const selectImageForReading = async () => {
    setImageReadingStatus('');
    setImageReadingText('');
    setImageReadingDescription('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setImageReadingStatus('Permissão para acessar as fotos não concedida.');
        return;
      }
      const selection = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (selection.canceled || !selection.assets[0]) return;
      if (Platform.OS === 'web') {
        setImageReadingStatus('A leitura OCR exige um development build atualizado para Android ou iPhone.');
        return;
      }
      setImageReadingBusy(true);
      const ocrModule = await import('expo-ocr-kit');
      const result = await ocrModule.recognizeText(selection.assets[0].uri);
      const text = result.text.trim();
      setImageReadingText(text);
      setImageReadingStatus(text
        ? 'Texto identificado no aparelho. Você pode ouvi-lo ou colocá-lo no rascunho.'
        : 'Não foi encontrado texto. Você pode escrever uma descrição abaixo e ouvi-la.');
    } catch (error) {
      setImageReadingStatus(error instanceof Error ? error.message : 'Não foi possível ler esta imagem.');
    } finally {
      setImageReadingBusy(false);
    }
  };

  const speakImageReading = () => {
    const content = [imageReadingDescription.trim(), imageReadingText.trim()].filter(Boolean).join('. ');
    if (!content) {
      setImageReadingStatus('Selecione uma imagem com texto ou escreva uma descrição antes de ouvir.');
      return;
    }
    Speech.stop();
    Speech.speak(content, { language: 'pt-BR', rate: 0.9 });
  };

  const insertImageReadingIntoDraft = () => {
    const content = [imageReadingDescription.trim(), imageReadingText.trim()].filter(Boolean).join('\n');
    if (!content) {
      setImageReadingStatus('Ainda não há texto ou descrição para inserir.');
      return;
    }
    setInputText((current) => current.trim() ? `${current.trim()}\n${content}` : content);
    setImageReadingStatus('Texto adicionado ao rascunho. Revise antes de enviar.');
  };

  const readMessage = (text: string) => {
    Speech.stop();
    Speech.speak(text, { language: 'pt-BR', rate: 0.9 });
  };

  const getAccessibleMessageText = (message: MessageItem) => [
    message.text,
    preferences.audioTranscription || preferences.liveCaptions ? message.audioTranscript : '',
    preferences.describeImages || preferences.describeFigures || preferences.describeGifs || preferences.describeVideos
      ? message.mediaDescription
      : '',
  ].filter(Boolean).join('. ');

  return (
    <AppScreen contentStyle={{ flex: 1, paddingHorizontal: 0, paddingBottom: 0 }}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: Math.max(0, insets.top - 8) }}>
        <View style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Voltar às conversas" onPress={() => router.back()} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <AppText weight="700" size={17}>{receiverName}</AppText>
            <AppText size={11} muted>{demoMode ? 'Amostra local · nada é enviado' : 'Conversa privada'}</AppText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Ouvir as últimas mensagens de ${receiverName}`} delayLongPress={preferences.holdDelay * 1000} onPress={() => readMessage(messages.slice(-5).map(getAccessibleMessageText).join('. ') || `Conversa com ${receiverName}`)} onLongPress={() => readMessage(messages.slice(-5).map(getAccessibleMessageText).join('. ') || `Conversa com ${receiverName}`)} style={{ minWidth: preferences.largeTouchTargets ? 56 : 44, minHeight: preferences.largeTouchTargets ? 56 : 44, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="volume-2" size={20} color={colors.primary} />
            <AppText size={10} color={colors.primary}>Ouvir</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir simulador do botão assistivo para esta conversa" onPress={() => router.push({ pathname: '/assistive-device' as never, params: { conversationId } })} style={{ minWidth: preferences.largeTouchTargets ? 54 : 44, minHeight: preferences.largeTouchTargets ? 54 : 44, alignItems: 'center', justifyContent: 'center', marginLeft: 2 }}>
            <Feather name="radio" size={20} color={colors.primary} />
          </Pressable>
        </View>

        {demoMode ? <InfoBanner tone="warning">Esta é uma conversa demonstrativa anônima. As mensagens permanecem neste aparelho e não são enviadas.</InfoBanner> : null}
        {realtimeNotice ? <InfoBanner>{realtimeNotice}</InfoBanner> : null}

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={colors.primary} /><AppText muted size={12} style={{ marginTop: 10 }}>Carregando mensagens…</AppText></View>
        ) : errorMessage && messages.length === 0 ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 }}>
            <AppText accessibilityRole="alert" color={colors.destructive} style={{ textAlign: 'center' }}>{errorMessage}</AppText>
            <Pressable accessibilityRole="button" onPress={() => router.replace('/(tabs)' as never)} style={{ padding: 12 }}><AppText color={colors.primary} weight="700">Voltar às conversas</AppText></Pressable>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: !preferences.reduceMotion })}
            contentContainerStyle={{ padding: 16, gap: 10, flexGrow: 1 }}
            ListEmptyComponent={<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><AppText muted>Envie uma mensagem para iniciar a conversa.</AppText></View>}
            renderItem={({ item }) => (
              <View style={{ alignSelf: item.localMine ? 'flex-end' : 'flex-start', backgroundColor: item.localMine ? colors.primary : colors.muted, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 17, maxWidth: '86%', minWidth: 120 }}>
                <AppText color={item.localMine ? colors.primaryForeground : colors.foreground} size={15} style={{ fontSize: 15 * preferences.fontScale, lineHeight: 21 * preferences.fontScale }}>{item.text}</AppText>
                {item.mediaType === 'image' && item.mediaUrl ? (
                  <Image source={{ uri: item.mediaUrl }} accessibilityLabel={item.mediaDescription ?? 'Imagem recebida'} style={{ width: 220, height: 160, borderRadius: 12, marginTop: 8 }} resizeMode="cover" />
                ) : null}
                {item.mediaType === 'audio' ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={playingMessageId === item.id ? 'Pausar mensagem de áudio' : 'Reproduzir mensagem de áudio'} onPress={() => playAudio(item)} disabled={!item.mediaUrl} style={{ minHeight: preferences.largeTouchTargets ? 48 : 38, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7, opacity: item.mediaUrl ? 1 : 0.55 }}>
                    <Feather name={playingMessageId === item.id ? 'pause' : 'play'} size={17} color={item.localMine ? colors.primaryForeground : colors.primary} />
                    <AppText size={12} color={item.localMine ? colors.primaryForeground : colors.primary}>{playingMessageId === item.id ? 'Pausar áudio' : 'Ouvir áudio'}{item.audioDurationMs ? ` · ${Math.round(item.audioDurationMs / 1000)} s` : ''}</AppText>
                  </Pressable>
                ) : null}
                {item.audioTranscript && (preferences.audioTranscription || preferences.liveCaptions) ? (
                  <AppText accessibilityLabel={`Transcrição do áudio: ${item.audioTranscript}`} size={12} muted={!item.localMine} color={item.localMine ? colors.primaryForeground : undefined} style={{ marginTop: 7, lineHeight: 17 * preferences.spacingScale }}>
                    Transcrição: {item.audioTranscript}
                  </AppText>
                ) : null}
                {item.mediaDescription && (
                  (item.mediaType === 'image' && preferences.describeImages) ||
                  (item.mediaType === 'figure' && preferences.describeFigures) ||
                  (item.mediaType === 'gif' && preferences.describeGifs) ||
                  (item.mediaType === 'video' && preferences.describeVideos)
                ) ? (
                  <AppText accessibilityLabel={`Descrição acessível do conteúdo: ${item.mediaDescription}`} size={12} muted={!item.localMine} color={item.localMine ? colors.primaryForeground : undefined} style={{ marginTop: 7, lineHeight: 17 * preferences.spacingScale }}>
                    Descrição: {item.mediaDescription}
                  </AppText>
                ) : null}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <AppText size={10} color={item.localMine ? colors.primaryForeground : colors.mutedForeground}>{formatTime(item.created_at)}{item.localMine ? ` · ${item.read_at ? 'Lida' : 'Enviada'}` : ''}</AppText>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Ouvir mensagem: ${getAccessibleMessageText(item)}`} delayLongPress={preferences.holdDelay * 1000} onPress={() => readMessage(getAccessibleMessageText(item))} onLongPress={() => readMessage(getAccessibleMessageText(item))} hitSlop={8} style={{ minWidth: preferences.largeTouchTargets ? 44 : 34, minHeight: preferences.largeTouchTargets ? 44 : 34, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="volume-2" size={14} color={item.localMine ? colors.primaryForeground : colors.primary} />
                    <AppText size={10} color={item.localMine ? colors.primaryForeground : colors.primary}>Ouvir</AppText>
                  </Pressable>
                </View>
              </View>
            )}
          />
        )}

        {errorMessage && messages.length > 0 ? <AppText accessibilityRole="alert" size={12} color={colors.destructive} style={{ paddingHorizontal: 14, paddingTop: 8 }}>{errorMessage}</AppText> : null}

        {sendErrorMessage ? (
          <View style={{ marginHorizontal: 14, marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: colors.destructive + '12', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <AppText accessibilityRole="alert" size={12} color={colors.destructive} style={{ flex: 1 }}>{sendErrorMessage}</AppText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Tentar enviar a mensagem novamente"
              onPress={() => void handleSend()}
              disabled={sending || !inputText.trim()}
              style={{ minHeight: 40, paddingHorizontal: 11, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', opacity: sending || !inputText.trim() ? 0.5 : 1 }}
            >
              <AppText size={12} weight="700" color={colors.primaryForeground}>{sending ? 'Enviando…' : 'Tentar novamente'}</AppText>
            </Pressable>
          </View>
        ) : null}

        {assistiveMenuOpen ? (
          <View accessibilityLabel="Ferramentas de acessibilidade da conversa" style={{ marginHorizontal: 12, marginBottom: 8, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card, gap: 9 }}>
            <AppText size={13} weight="700">Ferramentas para esta conversa</AppText>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={voiceInputActive ? 'Parar ditado por voz' : 'Ditar mensagem por voz'}
                onPress={() => voiceInputActive ? ExpoSpeechRecognitionModule.stop() : void startVoiceDraft()}
                disabled={sending || loading}
                style={({ pressed }) => ({ flex: 1, minHeight: preferences.largeTouchTargets ? 54 : 46, borderRadius: 12, backgroundColor: voiceInputActive ? colors.destructive : colors.primary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, opacity: pressed ? 0.75 : 1 })}
              >
                <Feather name={voiceInputActive ? 'square' : 'mic'} size={16} color={colors.primaryForeground} />
                <AppText size={12} weight="700" color={colors.primaryForeground}>{voiceInputActive ? 'Parar ditado' : 'Falar mensagem'}</AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ler as últimas mensagens em voz alta"
                onPress={() => readMessage(messages.slice(-5).map(getAccessibleMessageText).join('. ') || `Conversa com ${receiverName}`)}
                style={({ pressed }) => ({ flex: 1, minHeight: preferences.largeTouchTargets ? 54 : 46, borderRadius: 12, backgroundColor: colors.secondary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, opacity: pressed ? 0.75 : 1 })}
              >
                <Feather name="volume-2" size={16} color={colors.primary} />
                <AppText size={12} weight="700" color={colors.primary}>Ler mensagens</AppText>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Escolher imagem para reconhecer texto"
                onPress={() => void selectImageForReading()}
                disabled={imageReadingBusy}
                style={({ pressed }) => ({ flex: 1, minHeight: preferences.largeTouchTargets ? 54 : 46, borderRadius: 12, backgroundColor: colors.secondary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, opacity: pressed || imageReadingBusy ? 0.7 : 1 })}
              >
                {imageReadingBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="image" size={16} color={colors.primary} />}
                <AppText size={12} weight="700" color={colors.primary}>{imageReadingBusy ? 'Lendo imagem…' : 'Ler imagem'}</AppText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Simplificar texto do rascunho"
                onPress={() => void simplifyDraft()}
                disabled={!inputText.trim() || aiBusy || sending || loading}
                style={({ pressed }) => ({ flex: 1, minHeight: preferences.largeTouchTargets ? 54 : 46, borderRadius: 12, backgroundColor: colors.secondary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, opacity: pressed || !inputText.trim() || aiBusy ? 0.55 : 1 })}
              >
                {aiBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="zap" size={16} color={colors.primary} />}
                <AppText size={12} weight="700" color={colors.primary}>Simplificar</AppText>
              </Pressable>
            </View>
            {imageReadingText || imageReadingDescription || imageReadingStatus ? (
              <View style={{ gap: 8 }}>
                {imageReadingText ? <AppText size={12} muted accessibilityLiveRegion="polite">Texto reconhecido: {imageReadingText}</AppText> : null}
                <TextInput
                  accessibilityLabel="Descrição manual da imagem"
                  value={imageReadingDescription}
                  onChangeText={setImageReadingDescription}
                  placeholder="Descrição opcional da imagem"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  style={{ minHeight: 48, maxHeight: 110, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, color: colors.foreground, backgroundColor: colors.background, fontSize: 13 * preferences.fontScale }}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 14 }}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Ouvir texto da imagem" onPress={speakImageReading} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 }}>
                    <AppText size={12} weight="700" color={colors.primary}>Ouvir</AppText>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel="Inserir texto da imagem no rascunho" onPress={insertImageReadingIntoDraft} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 }}>
                    <AppText size={12} weight="700" color={colors.primary}>Usar no rascunho</AppText>
                  </Pressable>
                </View>
              </View>
            ) : null}
            {voiceInputStatus || imageReadingStatus ? (
              <AppText accessibilityLiveRegion="polite" size={11} muted style={{ lineHeight: 16 }}>{voiceInputStatus || imageReadingStatus}</AppText>
            ) : null}
            <AppText size={10} muted style={{ lineHeight: 15 }}>O ditado preenche o rascunho e nunca envia sozinho. Para ditar, ative “Atalhos para controle por voz” em Acessibilidade. O botão funciona na tela; não remapeia botões físicos do aparelho.</AppText>
          </View>
        ) : null}

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 68 : 0}>
          <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10), borderTopWidth: 1, borderColor: colors.border, alignItems: 'center', gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={assistiveMenuOpen ? 'Fechar ferramentas de acessibilidade' : 'Abrir ferramentas de acessibilidade da conversa'}
              accessibilityHint="Mostra opções de ditado por voz, leitura de mensagens e leitura de imagens"
              accessibilityState={{ expanded: assistiveMenuOpen }}
              onPress={() => setAssistiveMenuOpen((open) => !open)}
              style={({ pressed }) => ({ width: preferences.largeTouchTargets ? 50 : 42, height: preferences.largeTouchTargets ? 50 : 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: assistiveMenuOpen ? colors.primary : colors.secondary, opacity: pressed ? 0.7 : 1 })}
            >
              <Feather name={assistiveMenuOpen ? 'x' : 'grid'} size={19} color={assistiveMenuOpen ? colors.primaryForeground : colors.primary} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Anexar imagem" accessibilityHint="Escolhe uma imagem da biblioteca para enviar" onPress={() => void chooseImage()} disabled={mediaBusy || sending || loading} style={{ width: preferences.largeTouchTargets ? 48 : 40, height: preferences.largeTouchTargets ? 48 : 40, alignItems: 'center', justifyContent: 'center', opacity: mediaBusy ? 0.5 : 1 }}>
              <Feather name="image" size={19} color={colors.primary} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={recorderState.isRecording ? 'Parar gravação de áudio' : 'Gravar mensagem de áudio'} onPress={() => void toggleRecording()} disabled={mediaBusy || sending || loading} style={{ width: preferences.largeTouchTargets ? 48 : 40, height: preferences.largeTouchTargets ? 48 : 40, alignItems: 'center', justifyContent: 'center', opacity: mediaBusy ? 0.5 : 1 }}>
              <Feather name={recorderState.isRecording ? 'square' : 'mic'} size={19} color={recorderState.isRecording ? colors.destructive : colors.primary} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Simplificar mensagem com inteligência artificial" onPress={() => void simplifyDraft()} disabled={!inputText.trim() || aiBusy || sending || loading} style={{ width: preferences.largeTouchTargets ? 48 : 40, height: preferences.largeTouchTargets ? 48 : 40, alignItems: 'center', justifyContent: 'center', opacity: !inputText.trim() || aiBusy ? 0.45 : 1 }}>
              {aiBusy ? <ActivityIndicator color={colors.primary} size="small" /> : <Feather name="zap" size={19} color={colors.primary} />}
            </Pressable>
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              placeholder={demoMode ? 'Mensagem de demonstração…' : 'Digite sua mensagem…'}
              placeholderTextColor={colors.mutedForeground}
              editable={!sending && !loading && !errorMessage}
              accessibilityLabel="Mensagem"
              returnKeyType="send"
              onSubmitEditing={() => void handleSend()}
              style={{ flex: 1, minHeight: preferences.largeTouchTargets ? 56 : 46, backgroundColor: colors.muted, borderRadius: 23, paddingHorizontal: 16, color: colors.foreground, fontSize: 15 * preferences.fontScale }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={demoMode ? 'Salvar mensagem de demonstração' : 'Enviar mensagem'}
              onPress={() => void handleSend()}
              disabled={!inputText.trim() || sending || loading || Boolean(errorMessage)}
              style={{ width: preferences.largeTouchTargets ? 54 : 46, height: preferences.largeTouchTargets ? 54 : 46, borderRadius: 27, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', opacity: !inputText.trim() || sending || loading || Boolean(errorMessage) ? 0.5 : 1 }}
            >
              {sending ? <ActivityIndicator color={colors.primaryForeground} size="small" /> : <Feather name="send" size={18} color={colors.primaryForeground} />}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </AppScreen>
  );
}
