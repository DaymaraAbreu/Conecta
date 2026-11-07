import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { type Href, router } from 'expo-router';
import { supabase, hasSupabaseConfig } from '@/lib/supabase';
import { AppScreen } from '@/components/AppScreen';
import { AppText } from '@/components/AppText';
import { Avatar } from '@/components/Avatar';
import { InfoBanner } from '@/components/InfoBanner';
import { useApp } from '@/context/AppContext';
import { useAccountSession, useDemoMode } from '@/context/AppSessionContext';
import { useAppColors } from '@/hooks/useAppColors';

type ConversationListItem = {
  id: string;
  participant_one_id: string;
  participant_two_id: string;
  last_message: string | null;
  last_message_at: string;
  name: string;
  unread: number;
  displayTime?: string;
};

function localTime(index: number) {
  return new Date(Date.now() - index * 5 * 60_000).toISOString();
}

export default function ChatsScreen() {
  const account = useAccountSession();
  const { enabled: demoMode } = useDemoMode();
  const { conversations: localConversations, ready: localReady } = useApp();
  const colors = useAppColors();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [connectionNotice, setConnectionNotice] = useState('');

  const fetchConversations = useCallback(async () => {
    if (demoMode) {
      const rows = localConversations.map((item, index): ConversationListItem => ({
        id: item.id,
        participant_one_id: 'amostra-local',
        participant_two_id: item.id,
        last_message: item.lastMessage,
        last_message_at: localTime(index),
        name: item.name,
        unread: item.unread,
        displayTime: item.time,
      }));
      setConversations(rows);
      setErrorMessage('');
      setConnectionNotice('');
      setLoading(!localReady);
      setRefreshing(false);
      return;
    }

    if (!account.isSignedIn || !account.userId) {
      setConversations([]);
      setErrorMessage('Entre em uma conta para sincronizar suas conversas.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (!hasSupabaseConfig()) {
      setConversations([]);
      setErrorMessage('O chat remoto ainda não está configurado. Informe a URL e a chave pública do Supabase para sincronizar conversas.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      const currentUserId = account.userId;
      const { data: rows, error: conversationsError } = await supabase
        .from('conversations')
        .select('id, participant_one_id, participant_two_id, last_message, last_message_at')
        .or(`participant_one_id.eq.${currentUserId},participant_two_id.eq.${currentUserId}`)
        .order('last_message_at', { ascending: false });
      if (conversationsError) throw conversationsError;

      const conversationRows = rows ?? [];
      if (conversationRows.length === 0) {
        setConversations([]);
        return;
      }

      const otherUserIds = conversationRows.map((conversation) =>
        conversation.participant_one_id === currentUserId
          ? conversation.participant_two_id
          : conversation.participant_one_id,
      );
      const conversationIds = conversationRows.map((conversation) => conversation.id);
      const [{ data: profiles, error: profilesError }, { data: unreadMessages, error: unreadError }] =
        await Promise.all([
          supabase.from('profiles').select('id, name').in('id', otherUserIds),
          supabase.from('messages').select('conversation_id')
            .in('conversation_id', conversationIds).eq('receiver_id', currentUserId).is('read_at', null),
        ]);
      if (profilesError) throw profilesError;
      if (unreadError) throw unreadError;

      const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
      const unreadCounts = new Map<string, number>();
      (unreadMessages ?? []).forEach(({ conversation_id }) => {
        unreadCounts.set(conversation_id, (unreadCounts.get(conversation_id) ?? 0) + 1);
      });
      setConversations(conversationRows.flatMap((conversation) => {
        const otherUserId = conversation.participant_one_id === currentUserId
          ? conversation.participant_two_id
          : conversation.participant_one_id;
        const profile = profileMap.get(otherUserId);
        if (!profile) return [];
        return [{ ...conversation, name: profile.name, unread: unreadCounts.get(conversation.id) ?? 0 }];
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível carregar as conversas.');
      setConversations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [account.isSignedIn, account.userId, demoMode, localConversations, localReady]);

  useEffect(() => {
    const fetchTimer = setTimeout(() => { void fetchConversations(); }, 0);
    if (demoMode || !account.isSignedIn || !account.userId || !hasSupabaseConfig()) {
      return () => clearTimeout(fetchTimer);
    }

    const currentUserId = account.userId;
    const channel = supabase
      .channel(`conversation_list_${currentUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        const message = payload.new as { sender_id?: string; receiver_id?: string };
        if (message.sender_id === currentUserId || message.receiver_id === currentUserId) {
          void fetchConversations();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
        void fetchConversations();
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionNotice('A atualização automática foi interrompida. Suas conversas continuam disponíveis; atualize para buscar as mensagens novas.');
        } else if (status === 'SUBSCRIBED') {
          setConnectionNotice('');
        }
      });
    return () => {
      clearTimeout(fetchTimer);
      void supabase.removeChannel(channel);
    };
  }, [account.isSignedIn, account.userId, demoMode, fetchConversations]);

  const onRefresh = () => {
    setRefreshing(true);
    void fetchConversations();
  };

  return (
    <AppScreen>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <AppText weight="700" size={22}>Conversas</AppText>
            <AppText muted size={13} style={{ marginTop: 2 }}>
              {demoMode ? 'Amostra local · nada será enviado' : 'Mensagens sincronizadas'}
            </AppText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Iniciar nova conversa"
            onPress={() => router.push('/contacts' as Href)}
            style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="edit-2" size={18} color={colors.primaryForeground} />
          </Pressable>
        </View>

        {demoMode ? <InfoBanner tone="warning">Demonstração local e anônima. Nomes e mensagens são exemplos salvos neste aparelho; não há conta autenticada nem conexão Supabase.</InfoBanner> : null}
        {connectionNotice ? <InfoBanner>{connectionNotice}</InfoBanner> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Conversar com o Assistente Gemini"
          onPress={() => router.push('/assistant' as Href)}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, marginTop: 12, marginBottom: 4, padding: 13, borderRadius: 16, backgroundColor: colors.secondary, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.75 : 1 })}
        >
          <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="zap" size={19} color={colors.primaryForeground} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <AppText size={14} weight="700">Assistente Gemini</AppText>
            <AppText size={11} muted style={{ marginTop: 2 }}>Faça perguntas e converse com a IA</AppText>
          </View>
          <Feather name="chevron-right" size={18} color={colors.primary} />
        </Pressable>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color={colors.primary} size="large" />
            <AppText muted size={13} style={{ marginTop: 12 }}>Carregando conversas…</AppText>
          </View>
        ) : errorMessage ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 12 }}>
            <AppText accessibilityRole="alert" color={colors.destructive} style={{ textAlign: 'center' }}>{errorMessage}</AppText>
            <Pressable accessibilityRole="button" onPress={onRefresh} style={{ padding: 12 }}>
              <AppText weight="600" color={colors.primary}>Tentar novamente</AppText>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            contentContainerStyle={conversations.length === 0 ? { flex: 1 } : undefined}
            ListEmptyComponent={
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, gap: 8 }}>
                <AppText weight="600" size={16} style={{ textAlign: 'center' }}>Nenhuma conversa ainda</AppText>
                <AppText muted size={14} style={{ textAlign: 'center', lineHeight: 20 }}>Toque no botão acima para encontrar alguém e iniciar uma conversa.</AppText>
              </View>
            }
            renderItem={({ item }) => {
              const initials = item.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'US';
              const time = item.displayTime ?? new Date(item.last_message_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Conversa com ${item.name}${item.unread ? `, ${item.unread} mensagens não lidas` : ''}`}
                  onPress={() => router.push(`/conversation/${item.id}` as Href)}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.muted : colors.background })}
                >
                  <Avatar name={item.name} initials={initials} size={48} />
                  <View style={{ marginLeft: 14, flex: 1, justifyContent: 'center' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                      <AppText weight="600" size={16} numberOfLines={1} style={{ flex: 1, marginRight: 8 }}>{item.name}</AppText>
                      <AppText muted size={11}>{time}</AppText>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <AppText muted size={13} numberOfLines={1} style={{ flex: 1, marginRight: 8 }}>{item.last_message || 'Conversa iniciada'}</AppText>
                      {item.unread > 0 ? (
                        <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                          <AppText size={11} weight="700" color={colors.primaryForeground}>{item.unread}</AppText>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
        )}
      </View>
    </AppScreen>
  );
}
