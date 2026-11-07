import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type Conversation = {
  id: string;
  name: string;
  initials: string;
  colorIndex: number;
  lastMessage: string;
  time: string;
  unread: number;
  isGroup?: boolean;
  online?: boolean;
  pinned?: boolean;
};

export type Message = {
  id: string;
  text: string;
  time: string;
  mine: boolean;
  read?: boolean;
  audioTranscript?: string;
  mediaType?: 'image' | 'figure' | 'gif' | 'video';
  mediaDescription?: string;
};

export type CallRecord = {
  id: string;
  name: string;
  initials: string;
  colorIndex: number;
  direction: 'incoming' | 'outgoing' | 'missed';
  video: boolean;
  time: string;
};

export type Story = {
  id: string;
  name: string;
  initials: string;
  colorIndex: number;
  time: string;
  seen: boolean;
};

export type Preferences = {
  fontScale: number;
  spacingScale: number;
  highContrast: boolean;
  boldText: boolean;
  reduceMotion: boolean;
  visualFlash: boolean;
  liveCaptions: boolean;
  monoAudio: boolean;
  audioTranscription: boolean;
  describeImages: boolean;
  describeFigures: boolean;
  describeGifs: boolean;
  describeVideos: boolean;
  describeVideoCalls: boolean;
  largeTouchTargets: boolean;
  voiceNavigation: boolean;
  switchControl: boolean;
  holdDelay: number;
  lastSeen: boolean;
  readReceipts: boolean;
  profilePhoto: boolean;
  statusAudience: boolean;
  groupInvites: boolean;
  securityNotifications: boolean;
  twoStepEnabled: boolean;
  encryptedBackup: boolean;
  hideIpInCalls: boolean;
  keepArchived: boolean;
  saveMedia: boolean;
  enterToSend: boolean;
  messageNotifications: boolean;
  groupNotifications: boolean;
  notificationPreview: boolean;
  vibration: boolean;
  audioFeedback: boolean;
  reduceDataCalls: boolean;
  wifiOnlyDownloads: boolean;
  autoDownloadPhotos: boolean;
};

export type Profile = {
  name: string;
  about: string;
  phone: string;
};

type AppData = {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  calls: CallRecord[];
  stories: Story[];
  preferences: Preferences;
  profile: Profile;
  blockedContacts: string[];
};

type AppContextValue = AppData & {
  ready: boolean;
  sendMessage: (conversationId: string, text: string, options?: { audioTranscript?: string }) => void;
  openConversation: (conversationId: string) => void;
  createConversation: (contact: Omit<Conversation, 'lastMessage' | 'time' | 'unread'>) => string;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  togglePreference: (key: keyof Preferences) => void;
  updateProfile: (profile: Profile) => void;
  toggleBlocked: (contactId: string) => void;
  addMyStory: () => void;
  resetDemo: () => void;
};

const STORAGE_KEY = '@ponte/demo-v1';

export const DEFAULT_PREFERENCES: Preferences = {
  fontScale: 1,
  spacingScale: 1,
  highContrast: false,
  boldText: false,
  reduceMotion: false,
  visualFlash: false,
  liveCaptions: false,
  monoAudio: false,
  audioTranscription: true,
  describeImages: true,
  describeFigures: true,
  describeGifs: true,
  describeVideos: true,
  describeVideoCalls: true,
  largeTouchTargets: false,
  voiceNavigation: false,
  switchControl: false,
  holdDelay: 0.5,
  lastSeen: true,
  readReceipts: true,
  profilePhoto: true,
  statusAudience: true,
  groupInvites: true,
  securityNotifications: true,
  twoStepEnabled: false,
  encryptedBackup: false,
  hideIpInCalls: false,
  keepArchived: false,
  saveMedia: true,
  enterToSend: false,
  messageNotifications: true,
  groupNotifications: true,
  notificationPreview: true,
  vibration: true,
  audioFeedback: false,
  reduceDataCalls: false,
  wifiOnlyDownloads: false,
  autoDownloadPhotos: true,
};

const defaultData: AppData = {
  conversations: [
    { id: 'ana', name: 'Ana Martins', initials: 'AM', colorIndex: 0, lastMessage: 'Chego em 10 minutos!', time: 'Agora', unread: 2, online: true, pinned: true },
    { id: 'grupo-familia', name: 'Família', initials: 'FA', colorIndex: 1, lastMessage: 'Marina: domingo confirmado?', time: '10:42', unread: 3, isGroup: true, pinned: true },
    { id: 'gui', name: 'Guilherme Costa', initials: 'GC', colorIndex: 2, lastMessage: 'O áudio ficou ótimo', time: '09:18', unread: 0, online: true },
    { id: 'mae', name: 'Mãe', initials: 'M', colorIndex: 3, lastMessage: 'Obrigada, meu amor.', time: 'Ontem', unread: 0 },
    { id: 'luiza', name: 'Luiza Ferreira', initials: 'LF', colorIndex: 0, lastMessage: 'Você: combinado!', time: 'Ontem', unread: 0 },
    { id: 'equipe', name: 'Equipe de projeto', initials: 'EP', colorIndex: 2, lastMessage: 'Rafael: arquivo atualizado', time: 'Seg', unread: 0, isGroup: true },
  ],
  messages: {
    ana: [
      { id: 'a1', text: 'Oi! Você está por perto?', time: '10:31', mine: false },
      { id: 'a2', text: 'Estou saindo agora. Já estou a caminho.', time: '10:34', mine: true, read: true },
      { id: 'a3', text: 'Perfeito, vou esperar na entrada.', time: '10:36', mine: false },
      { id: 'a-image', text: 'Foto do passeio', time: '10:37', mine: false, mediaType: 'image', mediaDescription: 'Uma bicicleta azul encostada em uma parede com plantas verdes ao lado.' },
      { id: 'a-figure', text: 'O resumo do evento', time: '10:38', mine: false, mediaType: 'figure', mediaDescription: 'Infográfico com três etapas conectadas por setas: inscrição, encontro e apresentação.' },
      { id: 'a-gif', text: 'Olha essa animação', time: '10:39', mine: false, mediaType: 'gif', mediaDescription: 'Animação em loop de uma pessoa acenando perto de uma janela.' },
      { id: 'a-video', text: 'Um vídeo rapidinho', time: '10:40', mine: false, mediaType: 'video', mediaDescription: 'Clipe curto de um cachorro correndo na grama em direção a uma bola vermelha.' },
      { id: 'a4', text: 'Chego em 10 minutos!', time: 'Agora', mine: false },
    ],
    'grupo-familia': [
      { id: 'f1', text: 'Almoço de domingo vai ser aqui em casa.', time: '10:12', mine: false },
      { id: 'f2', text: 'Levo a sobremesa!', time: '10:24', mine: true, read: true },
      { id: 'f3', text: 'Marina: domingo confirmado?', time: '10:42', mine: false },
    ],
    gui: [
      { id: 'g1', text: 'Te mandei a gravação para ouvir.', time: '09:10', mine: false, audioTranscript: 'Oi, tudo certo? Segue a gravação da reunião.' },
      { id: 'g2', text: 'O áudio ficou ótimo', time: '09:18', mine: false },
    ],
    mae: [
      { id: 'm1', text: 'A encomenda chegou hoje de manhã.', time: 'Ontem', mine: false },
      { id: 'm2', text: 'Que bom! Obrigada por avisar.', time: 'Ontem', mine: true, read: true },
      { id: 'm3', text: 'Obrigada, meu amor.', time: 'Ontem', mine: false },
    ],
    luiza: [
      { id: 'l1', text: 'A gente se encontra às 15h?', time: 'Ontem', mine: false },
      { id: 'l2', text: 'Você: combinado!', time: 'Ontem', mine: true, read: true },
    ],
    equipe: [
      { id: 'e1', text: 'A apresentação está quase pronta.', time: 'Seg', mine: false },
      { id: 'e2', text: 'Rafael: arquivo atualizado', time: 'Seg', mine: false },
    ],
  },
  calls: [
    { id: 'c1', name: 'Ana Martins', initials: 'AM', colorIndex: 0, direction: 'incoming', video: true, time: 'Hoje, 10:02' },
    { id: 'c2', name: 'Guilherme Costa', initials: 'GC', colorIndex: 2, direction: 'outgoing', video: false, time: 'Ontem, 18:34' },
    { id: 'c3', name: 'Mãe', initials: 'M', colorIndex: 3, direction: 'missed', video: false, time: 'Ontem, 15:20' },
  ],
  stories: [
    { id: 's1', name: 'Ana Martins', initials: 'AM', colorIndex: 0, time: 'há 12 min', seen: false },
    { id: 's2', name: 'Guilherme Costa', initials: 'GC', colorIndex: 2, time: 'há 38 min', seen: false },
    { id: 's3', name: 'Luiza Ferreira', initials: 'LF', colorIndex: 1, time: 'há 1 h', seen: true },
  ],
  preferences: DEFAULT_PREFERENCES,
  profile: { name: 'Você', about: 'Disponível', phone: '+55 11 90000-0000' },
  blockedContacts: [],
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(defaultData);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        const parsed = JSON.parse(stored) as Partial<AppData>;
        setData({
          ...defaultData,
          ...parsed,
          preferences: { ...DEFAULT_PREFERENCES, ...parsed.preferences },
        });
      })
      .catch(() => {
        // If a prior demo save is unreadable, continue with the sample content.
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const updateData = useCallback((update: (current: AppData) => AppData) => {
    setData((current) => {
      const next = update(current);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
        // Keep the current session usable if local storage is unavailable.
      });
      return next;
    });
  }, []);

  const sendMessage = useCallback((conversationId: string, rawText: string, options?: { audioTranscript?: string }) => {
    const text = rawText.trim();
    if (!text) return;
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    updateData((current) => {
      const previous = current.messages[conversationId] ?? [];
      const message: Message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        time,
        mine: true,
        read: false,
        audioTranscript: options?.audioTranscript,
      };
      return {
        ...current,
        messages: { ...current.messages, [conversationId]: [...previous, message] },
        conversations: current.conversations.map((conversation) =>
          conversation.id === conversationId
            ? { ...conversation, lastMessage: text, time: 'Agora', unread: 0 }
            : conversation,
        ),
      };
    });
  }, [updateData]);

  const openConversation = useCallback((conversationId: string) => {
    updateData((current) => {
      if (!current.conversations.some((conversation) => conversation.id === conversationId && conversation.unread > 0)) return current;
      return {
        ...current,
        conversations: current.conversations.map((conversation) =>
          conversation.id === conversationId ? { ...conversation, unread: 0 } : conversation,
        ),
      };
    });
  }, [updateData]);

  const createConversation = useCallback((contact: Omit<Conversation, 'lastMessage' | 'time' | 'unread'>) => {
    let resultId = contact.id;
    updateData((current) => {
      const existing = current.conversations.find((item) => item.id === contact.id);
      if (existing) return current;
      const newConversation: Conversation = { ...contact, lastMessage: 'Inicie uma conversa', time: '', unread: 0 };
      resultId = newConversation.id;
      return {
        ...current,
        conversations: [newConversation, ...current.conversations],
        messages: { ...current.messages, [newConversation.id]: [] },
      };
    });
    return resultId;
  }, [updateData]);

  const setPreference = useCallback(<K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    updateData((current) => ({
      ...current,
      preferences: { ...current.preferences, [key]: value },
    }));
  }, [updateData]);

  const togglePreference = useCallback((key: keyof Preferences) => {
    updateData((current) => {
      const value = current.preferences[key];
      if (typeof value !== 'boolean') return current;
      return { ...current, preferences: { ...current.preferences, [key]: !value } };
    });
  }, [updateData]);

  const updateProfile = useCallback((profile: Profile) => {
    updateData((current) => ({ ...current, profile }));
  }, [updateData]);

  const toggleBlocked = useCallback((contactId: string) => {
    updateData((current) => ({
      ...current,
      blockedContacts: current.blockedContacts.includes(contactId)
        ? current.blockedContacts.filter((item) => item !== contactId)
        : [...current.blockedContacts, contactId],
    }));
  }, [updateData]);

  const addMyStory = useCallback(() => {
    updateData((current) => ({
      ...current,
      stories: [
        { id: `mine-${Date.now()}`, name: 'Seu status', initials: 'VC', colorIndex: 0, time: 'agora', seen: false },
        ...current.stories.filter((story) => story.id !== 'mine'),
      ],
    }));
  }, [updateData]);

  const resetDemo = useCallback(() => {
    setData(defaultData);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData)).catch(() => undefined);
  }, []);

  const value = useMemo<AppContextValue>(() => ({
    ...data,
    ready,
    sendMessage,
    openConversation,
    createConversation,
    setPreference,
    togglePreference,
    updateProfile,
    toggleBlocked,
    addMyStory,
    resetDemo,
  }), [
    data,
    ready,
    sendMessage,
    openConversation,
    createConversation,
    setPreference,
    togglePreference,
    updateProfile,
    toggleBlocked,
    addMyStory,
    resetDemo,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside AppProvider');
  return context;
}
