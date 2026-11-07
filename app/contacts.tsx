import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { AppScreen } from '@/components/AppScreen';
import { AppText } from '@/components/AppText';
import { InfoBanner } from '@/components/InfoBanner';
import { PageHeader } from '@/components/PageHeader';
import { useApp } from '@/context/AppContext';
import { useAccountSession, useDemoMode } from '@/context/AppSessionContext';
import { useAppColors } from '@/hooks/useAppColors';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';

type Contact = {
  id: string;
  name: string;
  username: string | null;
};

const samplePeople: Contact[] = [
  { id: 'ana', name: 'Ana Martins', username: 'anamartins' },
  { id: 'gui', name: 'Guilherme Costa', username: 'guicosta' },
  { id: 'luiza', name: 'Luiza Ferreira', username: 'luizaferreira' },
  { id: 'marina-amostra', name: 'Marina Azevedo', username: 'marinaazevedo' },
  { id: 'rafael-amostra', name: 'Rafael Lima', username: 'rafaellima' },
];

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function ContactsScreen() {
  const account = useAccountSession();
  const { enabled: demoMode } = useDemoMode();
  const colors = useAppColors();
  const { preferences, conversations: localConversations, createConversation, ready: localReady } = useApp();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [results, setResults] = useState<Contact[]>([]);
  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadContacts = useCallback(async () => {
    await Promise.resolve();
    if (demoMode) {
      setContacts(localConversations.map((item) => ({ id: item.id, name: item.name, username: item.id.replace(/[^a-z0-9]/gi, '') })));
      setErrorMessage('');
      setLoading(!localReady);
      return;
    }
    if (!account.isSignedIn || !account.userId) {
      setContacts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage('');
    try {
      if (!hasSupabaseConfig()) {
        throw new Error('Configure o Supabase para carregar e adicionar contatos.');
      }
      const { data, error } = await supabase.rpc('list_contacts');
      if (error) throw error;
      setContacts(data ?? []);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível carregar os contatos.'));
    } finally {
      setLoading(false);
    }
  }, [account.isSignedIn, account.userId, demoMode, localConversations, localReady]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadContacts(); }, 0);
    return () => clearTimeout(timer);
  }, [loadContacts]);

  const searchProfiles = async () => {
    const searchTerm = query.trim();
    setFeedback('');
    setErrorMessage('');
    setHasSearched(true);
    setResults([]);
    if (!searchTerm) {
      setFeedback('Digite um e-mail ou nome de usuário para buscar.');
      return;
    }

    if (demoMode) {
      const normalized = searchTerm.replace(/^@/, '').toLocaleLowerCase('pt-BR');
      setResults(samplePeople.filter((person) =>
        `${person.name} ${person.username ?? ''}`.toLocaleLowerCase('pt-BR').includes(normalized),
      ));
      return;
    }

    setSearching(true);
    try {
      if (!account.isSignedIn || !account.userId) throw new Error('Entre em uma conta para buscar pessoas.');
      if (!hasSupabaseConfig()) {
        throw new Error('Configure o Supabase para buscar pessoas.');
      }
      const { data, error } = await supabase.rpc('search_profiles', {
        search_term: searchTerm,
      });
      if (error) throw error;
      setResults(data ?? []);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível buscar essa conta.'));
    } finally {
      setSearching(false);
    }
  };

  const addContact = async (contact: Contact) => {
    setAddingId(contact.id);
    setErrorMessage('');
    setFeedback('');
    try {
      if (demoMode) {
        createConversation({
          id: contact.id,
          name: contact.name,
          initials: contact.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase(),
          colorIndex: localConversations.length % 4,
          online: true,
        });
        setContacts((previous) => previous.some((item) => item.id === contact.id) ? previous : [...previous, contact]);
        setFeedback(`${contact.name} foi adicionado somente a esta amostra local.`);
        return;
      }
      if (!account.isSignedIn || !account.userId || !hasSupabaseConfig()) {
        throw new Error('É necessário entrar e configurar o Supabase para adicionar contatos reais.');
      }
      const { error } = await supabase.rpc('add_contact', {
        other_user_id: contact.id,
      });
      if (error) throw error;
      await loadContacts();
      setFeedback(`${contact.name} foi adicionado(a) aos seus contatos.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível adicionar esse contato.'));
    } finally {
      setAddingId(null);
    }
  };

  const startConversation = async (contact: Contact) => {
    setOpeningId(contact.id);
    setErrorMessage('');
    try {
      if (demoMode) {
        if (!localConversations.some((item) => item.id === contact.id)) {
          createConversation({
            id: contact.id,
            name: contact.name,
            initials: contact.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase(),
            colorIndex: localConversations.length % 4,
            online: true,
          });
        }
        router.replace({ pathname: '/conversation/[id]', params: { id: contact.id } });
        return;
      }
      if (!account.isSignedIn || !account.userId || !hasSupabaseConfig()) {
        throw new Error('Entre em uma conta e configure o Supabase para iniciar uma conversa real.');
      }
      const { data: conversationId, error } = await supabase.rpc(
        'get_or_create_direct_conversation',
        { other_user_id: contact.id },
      );
      if (error) throw error;
      if (!conversationId) throw new Error('O banco não retornou o identificador da conversa.');
      router.replace({ pathname: '/conversation/[id]', params: { id: conversationId } });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível iniciar a conversa.'));
    } finally {
      setOpeningId(null);
    }
  };

  const renderContact = (contact: Contact, action: 'add' | 'open') => {
    const initials = contact.name
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'US';
    const busy = action === 'add' ? addingId === contact.id : openingId === contact.id;
    const alreadyAdded = contacts.some((item) => item.id === contact.id);

    return (
      <View
        key={contact.id}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 72,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ marginRight: 12 }}>
          <Avatar name={contact.name} initials={initials} size={49} />
        </View>
        <View style={{ flex: 1, marginRight: 10 }}>
          <AppText weight="600">{contact.name}</AppText>
          {contact.username ? (
            <AppText muted size={12} style={{ marginTop: 2 }}>@{contact.username}</AppText>
          ) : null}
        </View>
        {action === 'add' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={alreadyAdded ? `${contact.name} já é seu contato` : `Adicionar ${contact.name}`}
            disabled={alreadyAdded || Boolean(addingId)}
            onPress={() => void addContact(contact)}
            style={({ pressed }) => ({
              minHeight: 40,
              minWidth: 92,
              paddingHorizontal: 12,
              borderRadius: 13,
              backgroundColor: alreadyAdded ? colors.secondary : colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed || busy ? 0.7 : 1,
            })}
          >
            {busy ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <AppText size={12} weight="700" color={alreadyAdded ? colors.foreground : colors.primaryForeground}>
                {alreadyAdded ? 'Adicionado' : 'Adicionar'}
              </AppText>
            )}
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Iniciar conversa com ${contact.name}`}
            disabled={Boolean(openingId)}
            onPress={() => void startConversation(contact)}
            style={({ pressed }) => ({
              width: 42,
              height: 42,
              borderRadius: 21,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed || busy ? 0.65 : 1,
            })}
          >
            {busy ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Feather name="message-circle" size={19} color={colors.primary} />
            )}
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <AppScreen>
      <PageHeader title="Contatos" subtitle="Encontre pessoas pelo e-mail ou usuário" back />
      {demoMode ? <InfoBanner tone="warning">Amostra anônima: use nomes ou usuários de exemplo. Esses contatos e conversas ficam apenas neste aparelho.</InfoBanner> : null}
      <AppText size={13} weight="700" style={{ marginTop: 12, marginBottom: 8 }}>
        ADICIONAR CONTATO
      </AppText>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          accessibilityLabel="E-mail ou nome de usuário"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          keyboardType="email-address"
          returnKeyType="search"
          value={query}
          onChangeText={(value) => {
            setQuery(value);
            setHasSearched(false);
            setResults([]);
            setFeedback('');
          }}
          onSubmitEditing={() => void searchProfiles()}
          placeholder="E-mail ou @usuário"
          placeholderTextColor={colors.mutedForeground}
          style={{
            flex: 1,
            minHeight: 48,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 14,
            paddingHorizontal: 14,
            color: colors.foreground,
            backgroundColor: colors.card,
            fontSize: 15 * preferences.fontScale,
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Buscar contato"
          disabled={searching || !query.trim()}
          onPress={() => void searchProfiles()}
          style={({ pressed }) => ({
            height: 48,
            width: 48,
            borderRadius: 14,
            backgroundColor: colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed || searching || !query.trim() ? 0.65 : 1,
          })}
        >
          {searching ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Feather name="search" size={19} color={colors.primaryForeground} />
          )}
        </Pressable>
      </View>

      {errorMessage ? (
        <AppText accessibilityRole="alert" size={12} color={colors.destructive} style={{ marginTop: 10 }}>
          {errorMessage}
        </AppText>
      ) : null}
      {feedback ? (
        <AppText accessibilityRole="alert" size={12} color={colors.primary} style={{ marginTop: 10 }}>
          {feedback}
        </AppText>
      ) : null}

      {hasSearched ? (
        <View style={{ marginTop: 18 }}>
          <AppText size={13} weight="700" style={{ marginBottom: 4 }}>RESULTADOS</AppText>
          {results.map((contact) => renderContact(contact, 'add'))}
          {!searching && results.length === 0 && !errorMessage ? (
            <AppText muted size={13} style={{ paddingVertical: 12 }}>
              Nenhuma conta encontrada. Confira o e-mail ou o nome de usuário.
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View style={{ marginTop: 24 }}>
        <AppText size={13} weight="700" style={{ marginBottom: 4 }}>MEUS CONTATOS</AppText>
        {loading ? (
          <View style={{ alignItems: 'center', padding: 22 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : contacts.length ? (
          contacts.map((contact) => renderContact(contact, 'open'))
        ) : errorMessage ? null : (
          <AppText muted size={13} style={{ paddingVertical: 12, lineHeight: 19 }}>
            Você ainda não adicionou contatos. Busque uma pessoa por e-mail ou nome de usuário.
          </AppText>
        )}
      </View>
    </AppScreen>
  );
}
