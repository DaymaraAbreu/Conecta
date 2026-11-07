import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { type Href, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

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
import * as Speech from 'expo-speech';
import { AppScreen } from '@/components/AppScreen';
import { AppText } from '@/components/AppText';
import { InfoBanner } from '@/components/InfoBanner';
import { PageHeader } from '@/components/PageHeader';
import { SectionCard } from '@/components/SectionCard';
import { SettingRow } from '@/components/SettingRow';
import { DEFAULT_PREFERENCES, useApp, type Preferences } from '@/context/AppContext';
import { useAccountSession, useDemoMode } from '@/context/AppSessionContext';
import { useAppColors } from '@/hooks/useAppColors';
import { provideAccessibilityFeedback } from '@/lib/accessibilityFeedback';
import { hasSupabaseConfig, supabase } from '@/lib/supabase';

const scaleSteps = [1, 1.15, 1.3, 1.45];
const spacingSteps = [1, 1.15, 1.3, 1.45];
const holdSteps = [0.5, 1, 1.5, 2];
type Label = { text: string; confidence?: number };
const accessibilityKeys: (keyof Preferences)[] = [
  'fontScale',
  'spacingScale',
  'highContrast',
  'boldText',
  'reduceMotion',
  'visualFlash',
  'liveCaptions',
  'monoAudio',
  'audioTranscription',
  'describeImages',
  'describeFigures',
  'describeGifs',
  'describeVideos',
  'describeVideoCalls',
  'largeTouchTargets',
  'voiceNavigation',
  'switchControl',
  'holdDelay',
  'vibration',
  'audioFeedback',
];

export default function AccessibilityScreen() {
  const colors = useAppColors();
  const account = useAccountSession();
  const { enabled: demoMode } = useDemoMode();
  const { preferences, setPreference, togglePreference, ready } = useApp();
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState('Preferências salvas neste aparelho.');
  const [syncRetry, setSyncRetry] = useState(0);
  const [recognizing, setRecognizing] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const [imageUri, setImageUri] = useState('');
  const [imageDescription, setImageDescription] = useState('');
  const [recognizedImageText, setRecognizedImageText] = useState('');
  const [imageLabels, setImageLabels] = useState<Label[]>([]);
  const [imageStatus, setImageStatus] = useState('');
  const [processingImage, setProcessingImage] = useState(false);
  const [deviceInfoVisible, setDeviceInfoVisible] = useState(false);
  const scaleIndex = Math.max(0, scaleSteps.indexOf(preferences.fontScale));
  const spacingIndex = Math.max(0, spacingSteps.indexOf(preferences.spacingScale));
  const holdIndex = Math.max(0, holdSteps.indexOf(preferences.holdDelay));
  const remoteEnabled = !demoMode && account.isSignedIn && Boolean(account.userId) && hasSupabaseConfig();

  const handleVoiceCommand = useCallback((transcript: string) => {
    const command = transcript
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('pt-BR');
    const routes: { match: RegExp; path: string; label: string }[] = [
      { match: /nova conversa|novo contato/, path: '/contacts', label: 'Abrindo nova conversa.' },
      { match: /convers|mensagen/, path: '/(tabs)', label: 'Abrindo conversas.' },
      { match: /chamad/, path: '/(tabs)/calls', label: 'Abrindo chamadas.' },
      { match: /configur/, path: '/(tabs)/settings', label: 'Abrindo configurações.' },
      { match: /acessibil/, path: '/accessibility', label: 'Abrindo acessibilidade.' },
      { match: /pesquisa|dashboard/, path: '/dashboard', label: 'Abrindo o painel da pesquisa.' },
    ];
    const destination = routes.find(({ match }) => match.test(command));
    if (!destination) {
      const message = 'Comando não reconhecido. Diga conversas, nova conversa, chamadas, configurações, acessibilidade ou pesquisa.';
      setVoiceStatus(message);
      void provideAccessibilityFeedback(message, preferences, 'warning');
      return;
    }
    setVoiceStatus(`${destination.label} Comando: ${transcript}`);
    void provideAccessibilityFeedback(destination.label, preferences);
    router.push(destination.path as Href);
  }, [preferences]);

  useSpeechRecognitionEvent('start', () => {
    setRecognizing(true);
    setVoiceStatus('Ouvindo. Diga o nome da tela que deseja abrir.');
  });
  useSpeechRecognitionEvent('end', () => setRecognizing(false));
  useSpeechRecognitionEvent('result', (event) => {
    const result = event.results.find((item) => item.transcript.trim());
    if (!event.isFinal || !result) return;
    setVoiceStatus(`Reconhecido: ${result.transcript}`);
    handleVoiceCommand(result.transcript);
  });
  useSpeechRecognitionEvent('error', (event) => {
    setRecognizing(false);
    const message = event.error === 'not-allowed'
      ? 'Permissão de microfone ou reconhecimento de fala negada.'
      : `Falha no reconhecimento de voz: ${event.message}`;
    setVoiceStatus(message);
  });

  useEffect(() => () => {
    if (ExpoSpeechRecognitionModule.isRecognitionAvailable()) ExpoSpeechRecognitionModule.stop();
    Speech.stop();
  }, []);

  const startVoiceCommands = async () => {
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setVoiceStatus('Reconhecimento de voz indisponível neste dispositivo ou navegador.');
        return;
      }
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        setVoiceStatus('Permita o acesso ao microfone e ao reconhecimento de fala nas configurações do aparelho.');
        return;
      }
      setVoiceStatus('');
      ExpoSpeechRecognitionModule.start({
        lang: 'pt-BR',
        interimResults: false,
        maxAlternatives: 1,
        continuous: false,
        addsPunctuation: true,
        contextualStrings: ['conversas', 'nova conversa', 'chamadas', 'configurações', 'acessibilidade', 'pesquisa'],
      });
    } catch (error) {
      setRecognizing(false);
      setVoiceStatus(error instanceof Error ? error.message : 'Não foi possível iniciar o reconhecimento de voz.');
    }
  };

  const selectImageForReading = async () => {
    setImageStatus('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setImageStatus('Permissão para acessar as fotos não concedida.');
        return;
      }
      const selection = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });
      if (selection.canceled || !selection.assets[0]) return;

      const uri = selection.assets[0].uri;
      setImageUri(uri);
      setRecognizedImageText('');
      setImageLabels([]);
      setProcessingImage(true);
      if (Platform.OS === 'web') {
        setImageStatus('O OCR exige um build nativo atualizado (Android/iOS); o navegador não processa esta imagem.');
        return;
      }

      const [ocrModule, labelingModule] = await Promise.all([
        import('expo-ocr-kit'),
        preferences.describeImages
          ? import('@react-native-ml-kit/image-labeling')
          : Promise.resolve(null),
      ]);
      const [ocrResult, labels] = await Promise.all([
        ocrModule.recognizeText(uri),
        labelingModule
          ? labelingModule.default.label(uri) as Promise<Label[]>
          : Promise.resolve([] as Label[]),
      ]);
      const text = ocrResult.text.trim();
      setRecognizedImageText(text);
      setImageLabels(labels);
      setImageStatus(
        labels.length || text
          ? 'Rótulos visuais e texto analisados no próprio aparelho.'
          : 'Não foram encontrados rótulos ou texto. Você ainda pode escrever uma descrição manual.',
      );
      void provideAccessibilityFeedback(
        labels.length || text
          ? 'Análise local da imagem concluída.'
          : 'Não foi possível identificar conteúdo nesta imagem.',
        preferences,
        labels.length || text ? 'success' : 'warning',
      );
    } catch (error) {
      console.warn('Falha ao selecionar ou processar imagem:', error);
      setImageStatus(error instanceof Error ? error.message : 'Não foi possível processar esta imagem.');
    } finally {
      setProcessingImage(false);
    }
  };

  const readImageContent = () => {
    const content = [
      imageLabels.length
        ? `Rótulos visuais sugeridos: ${imageLabels.slice(0, 5).map((label) => label.text).join(', ')}`
        : '',
      imageDescription.trim() ? `Descrição da imagem: ${imageDescription.trim()}` : '',
      recognizedImageText.trim() ? `Texto identificado na imagem: ${recognizedImageText.trim()}` : '',
    ].filter(Boolean).join('. ');
    if (!content) {
      setImageStatus('Adicione uma descrição ou selecione uma imagem com texto antes de ouvir.');
      return;
    }
    Speech.speak(content, { language: 'pt-BR', rate: 0.9 });
    void provideAccessibilityFeedback(
      'Iniciando a leitura da descrição e do texto identificado.',
      { ...preferences, audioFeedback: false },
    );
  };

  useEffect(() => {
    let active = true;
    if (!ready) return;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      setRemoteReady(false);
      if (!remoteEnabled || !account.userId) {
        setSyncStatus(demoMode
          ? 'Demonstração anônima: preferências armazenadas apenas neste aparelho.'
          : 'Sem sessão Supabase configurada: preferências armazenadas apenas neste aparelho.');
        return;
      }

      setSyncStatus('Carregando preferências seguras da sua conta…');
      try {
        const { data, error } = await supabase.from('accessibility_preferences')
          .select('preferences').eq('user_id', account.userId).maybeSingle();
        if (error) throw error;
        if (!active) return;
        if (data?.preferences && typeof data.preferences === 'object' && !Array.isArray(data.preferences)) {
          const saved = data.preferences as Partial<Preferences>;
          for (const key of accessibilityKeys) {
            const value = saved[key];
            if (value !== undefined && typeof value === typeof DEFAULT_PREFERENCES[key]) {
              setPreference(key, value as never);
            }
          }
        }
        if (active) {
          setSyncStatus('Preferências carregadas do Supabase.');
          setRemoteReady(true);
        }
      } catch (error) {
        if (active) {
          setRemoteReady(false);
          setSyncStatus(error instanceof Error
            ? `Não foi possível ler preferências remotas. Seus ajustes locais estão preservados: ${error.message}`
            : 'Não foi possível ler preferências remotas. Seus ajustes locais estão preservados.');
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [account.userId, demoMode, ready, remoteEnabled, setPreference, syncRetry]);

  useEffect(() => {
    if (!ready || !remoteReady || !remoteEnabled || !account.userId) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const accessibilityPreferences: Record<string, boolean | number> = {};
          for (const key of accessibilityKeys) {
            accessibilityPreferences[key] = preferences[key] as boolean | number;
          }
          const { error } = await supabase.from('accessibility_preferences').upsert({
            user_id: account.userId,
            preferences: accessibilityPreferences,
          }, { onConflict: 'user_id' });
          if (error) throw error;
          setSyncStatus('Preferências sincronizadas com Supabase.');
        } catch {
          setSyncStatus('Falha ao sincronizar. Os ajustes locais foram mantidos; tente novamente depois.');
        }
      })();
    }, 500);
    return () => clearTimeout(timer);
  }, [account.userId, preferences, ready, remoteEnabled, remoteReady]);

  return (
    <AppScreen>
      <PageHeader title="Acessibilidade" subtitle="Ajustes para diferentes necessidades" back />
      <InfoBanner>OCR e rótulos visuais de fotos são processados localmente e exigem build nativo atualizado; não há envio de imagens. Comandos de voz exigem autorização e navegador/serviço de reconhecimento compatível.</InfoBanner>
      <SectionCard title="Sincronização">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 }}>
          <Feather name={remoteEnabled && remoteReady ? 'cloud' : 'smartphone'} size={17} color={colors.primary} />
          <AppText size={12} muted style={{ flex: 1, lineHeight: 18 }}>{syncStatus}</AppText>
        </View>
        {remoteEnabled && !remoteReady ? (
          <Pressable accessibilityRole="button" onPress={() => setSyncRetry((value) => value + 1)} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
            <AppText size={12} weight="700" color={colors.primary}>Tentar ler novamente</AppText>
          </Pressable>
        ) : null}
      </SectionCard>
      <SectionCard title="Visão">
        <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <AppText size={15} weight="600">Tamanho do texto</AppText>
          <AppText size={12} muted style={{ marginTop: 4 }}>Ajusta textos e rótulos do aplicativo</AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, gap: 10 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Diminuir tamanho do texto"
              onPress={() => setPreference('fontScale', scaleSteps[Math.max(0, scaleIndex - 1)])}
              disabled={scaleIndex === 0}
              style={({ pressed }) => ({ width: 48, height: 44, borderRadius: 14, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : scaleIndex === 0 ? 0.45 : 1 })}
            ><Feather name="minus" size={19} color={colors.primary} /></Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <AppText size={18} weight="700">{Math.round(preferences.fontScale * 100)}%</AppText>
              <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 2, width: '80%', marginTop: 7 }}>
                <View style={{ width: `${((scaleIndex + 1) / scaleSteps.length) * 100}%`, height: 4, borderRadius: 2, backgroundColor: colors.primary }} />
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Aumentar tamanho do texto"
              onPress={() => setPreference('fontScale', scaleSteps[Math.min(scaleSteps.length - 1, scaleIndex + 1)])}
              disabled={scaleIndex === scaleSteps.length - 1}
              style={({ pressed }) => ({ width: 48, height: 44, borderRadius: 14, backgroundColor: colors.secondary, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.65 : scaleIndex === scaleSteps.length - 1 ? 0.45 : 1 })}
            ><Feather name="plus" size={19} color={colors.primary} /></Pressable>
          </View>
        </View>
        <View style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <AppText size={15} weight="600">Espaçamento do conteúdo</AppText>
          <AppText size={12} muted style={{ marginTop: 4 }}>Aumenta o espaço entre linhas, seções e controles</AppText>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            {spacingSteps.map((step, index) => (
              <Pressable
                key={step}
                accessibilityRole="button"
                accessibilityLabel={`Espaçamento ${Math.round(step * 100)} por cento`}
                accessibilityState={{ selected: spacingIndex === index }}
                onPress={() => setPreference('spacingScale', step)}
                style={{ flex: 1, minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: spacingIndex === index ? colors.primary : colors.secondary }}
              >
                <AppText size={11} weight="700" color={spacingIndex === index ? colors.primaryForeground : colors.primary}>
                  {Math.round(step * 100)}%
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
        <SettingRow title="Descrição de imagens" subtitle="Exibe uma descrição textual de imagens nos chats" value={preferences.describeImages} onToggle={() => togglePreference('describeImages')} />
        <SettingRow title="Descrição de figuras e infográficos" subtitle="Resume diagramas, ilustrações e gráficos" value={preferences.describeFigures} onToggle={() => togglePreference('describeFigures')} />
        <SettingRow title="Descrição de GIFs" subtitle="Mostra uma descrição do movimento da animação" value={preferences.describeGifs} onToggle={() => togglePreference('describeGifs')} />
        <SettingRow title="Descrição de vídeos" subtitle="Exibe um resumo visual do vídeo no chat" value={preferences.describeVideos} onToggle={() => togglePreference('describeVideos')} />
        <SettingRow title="Descrição em chamadas de vídeo" subtitle="Exibe uma descrição da cena na chamada simulada" value={preferences.describeVideoCalls} onToggle={() => togglePreference('describeVideoCalls')} />
        <SettingRow title="Alto contraste" subtitle="Reforça o contraste entre texto e superfícies" value={preferences.highContrast} onToggle={() => togglePreference('highContrast')} />
        <SettingRow title="Texto em negrito" subtitle="Aumenta o peso das letras em todo o app" value={preferences.boldText} onToggle={() => togglePreference('boldText')} />
        <SettingRow title="Reduzir movimento" subtitle="Prefira transições com menos movimento" value={preferences.reduceMotion} onToggle={() => togglePreference('reduceMotion')} last />
      </SectionCard>
      <SectionCard title="Audição">
        <SettingRow title="Feedback por áudio" subtitle="Fala confirmações e alertas de ações importantes" value={preferences.audioFeedback} onToggle={() => togglePreference('audioFeedback')} />
        <SettingRow title="Legendas para áudio" subtitle="Exibe transcrições disponíveis em mensagens de voz" value={preferences.liveCaptions} onToggle={() => togglePreference('liveCaptions')} />
        <SettingRow title="Transcrição de áudios" subtitle="Mostra a transcrição de exemplo quando disponível" value={preferences.audioTranscription} onToggle={() => togglePreference('audioTranscription')} />
        <SettingRow title="Áudio mono" subtitle="Combina canais quando o sistema ou o reprodutor oferecer suporte; o Conecta não altera o ajuste de áudio do aparelho" value={preferences.monoAudio} onToggle={() => togglePreference('monoAudio')} />
        <SettingRow title="Alertas visuais" subtitle="Destaca notificações com indicadores visuais" value={preferences.visualFlash} onToggle={() => togglePreference('visualFlash')} last />
      </SectionCard>
      <SectionCard title="Mobilidade">
        <SettingRow title="Alvos de toque maiores" subtitle="Aumenta a área de botões e controles" value={preferences.largeTouchTargets} onToggle={() => togglePreference('largeTouchTargets')} />
        <SettingRow title="Feedback por vibração" subtitle="Usa o atuador háptico do aparelho em interações de exemplo" value={preferences.vibration} onToggle={() => togglePreference('vibration')} />
        <SettingRow
          title="Ditado e comandos por voz"
          subtitle={preferences.voiceNavigation ? 'Botão de fala liberado nas conversas' : 'Ative para liberar o botão de fala nas conversas'}
          value={preferences.voiceNavigation}
          onToggle={(value) => {
            setPreference('voiceNavigation', value);
            if (!value && recognizing) ExpoSpeechRecognitionModule.abort();
          }}
        />
        <AppText size={11} muted style={{ paddingBottom: 12, lineHeight: 16 }}>
          Use o botão acessível dentro da conversa para ditar no rascunho. O aplicativo não remapeia os botões físicos do celular; a mensagem só é enviada quando você tocar em Enviar.
        </AppText>
        <SettingRow title="Acesso por interruptor" subtitle="O controle por interruptor é configurado no sistema do aparelho" value={preferences.switchControl} onToggle={() => togglePreference('switchControl')} last />
      </SectionCard>
      <SectionCard title="Comandos por voz" description="Toque para falar. O serviço de reconhecimento do sistema ou navegador pode processar áudio fora do aparelho conforme as configurações do provedor.">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            recognizing
              ? 'Parar de ouvir comando de voz'
              : preferences.voiceNavigation
                ? 'Falar um comando'
                : 'Ative ditado e comandos por voz antes de falar'
          }
          onPress={() => {
            if (recognizing) ExpoSpeechRecognitionModule.stop();
            else void startVoiceCommands();
          }}
          disabled={!preferences.voiceNavigation && !recognizing}
          style={({ pressed }) => ({
            minHeight: 52,
            borderRadius: 14,
            backgroundColor: recognizing ? colors.destructive : colors.primary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            opacity: pressed || (!preferences.voiceNavigation && !recognizing) ? 0.55 : 1,
          })}
        >
          <Feather name={recognizing ? 'square' : 'mic'} size={17} color={colors.primaryForeground} />
          <AppText size={13} weight="700" color={colors.primaryForeground}>
            {recognizing ? 'Parar de ouvir' : preferences.voiceNavigation ? 'Falar um comando' : 'Ative ditado e comandos por voz'}
          </AppText>
        </Pressable>
        <AppText accessibilityLiveRegion="polite" size={12} muted style={{ paddingVertical: 10, lineHeight: 18 }}>
          {voiceStatus || 'Comandos: “abrir conversas”, “nova conversa”, “abrir chamadas”, “abrir configurações”, “abrir acessibilidade” ou “abrir pesquisa”.'}
        </AppText>
      </SectionCard>
      <SectionCard title="Leitura e descrição de imagens" description="OCR e rótulos visuais são analisados no próprio aparelho. Os rótulos são sugestões automáticas; você também pode complementar com uma descrição manual.">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Selecionar imagem para ler texto"
          disabled={processingImage}
          onPress={() => void selectImageForReading()}
          style={({ pressed }) => ({
            minHeight: 50,
            borderRadius: 14,
            backgroundColor: colors.secondary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            opacity: pressed || processingImage ? 0.7 : 1,
          })}
        >
          {processingImage ? <ActivityIndicator color={colors.primary} /> : <Feather name="image" size={17} color={colors.primary} />}
          <AppText size={13} weight="700" color={colors.primary}>
            {processingImage ? 'Lendo imagem…' : 'Escolher imagem e ler texto'}
          </AppText>
        </Pressable>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            accessibilityLabel="Imagem selecionada para leitura"
            resizeMode="contain"
            style={{ width: '100%', height: 190, marginTop: 12, borderRadius: 12, backgroundColor: colors.muted }}
          />
        ) : null}
        <AppText size={12} weight="600" style={{ marginTop: 12 }}>Descrição visual (escrita por você)</AppText>
        <TextInput
          accessibilityLabel="Descrição visual da imagem"
          value={imageDescription}
          onChangeText={setImageDescription}
          placeholder="Ex.: uma pessoa usando uma bengala atravessa a rua..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          textAlignVertical="top"
          style={{
            minHeight: preferences.largeTouchTargets ? 104 : 82,
            marginTop: 7,
            padding: 11,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            color: colors.foreground,
            backgroundColor: colors.background,
            fontSize: 14 * preferences.fontScale,
          }}
        />
        {recognizedImageText ? (
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.muted, marginTop: 10 }}>
            <AppText size={12} weight="700">Texto reconhecido</AppText>
            <AppText size={13} style={{ marginTop: 5 }}>{recognizedImageText}</AppText>
          </View>
        ) : null}
        {imageLabels.length ? (
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: colors.secondary, marginTop: 10 }}>
            <AppText size={12} weight="700">Rótulos visuais sugeridos</AppText>
            <AppText size={13} style={{ marginTop: 5 }}>
              {imageLabels.slice(0, 5).map((label) => label.text).join(', ')}
            </AppText>
          </View>
        ) : null}
        {imageStatus ? (
          <AppText accessibilityLiveRegion="polite" size={12} color={/não|negada|falha|indisponível/i.test(imageStatus) ? colors.destructive : colors.mutedForeground} style={{ marginTop: 8 }}>
            {imageStatus}
          </AppText>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ouvir descrição e texto da imagem"
          onPress={readImageContent}
          style={({ pressed }) => ({
            minHeight: 48,
            borderRadius: 14,
            backgroundColor: colors.primary,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            marginTop: 12,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <Feather name="volume-2" size={17} color={colors.primaryForeground} />
          <AppText size={13} weight="700" color={colors.primaryForeground}>Ouvir descrição e texto</AppText>
        </Pressable>
      </SectionCard>
      <SectionCard title="Tempo de toque" description="Altera apenas a preferência salva no protótipo; não modifica a resposta do sistema operacional.">
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14 }}>
          <View style={{ flex: 1 }}>
            <AppText weight="600">Atraso de toque e pressão</AppText>
            <AppText size={12} muted style={{ marginTop: 4 }}>Tempo selecionado: {preferences.holdDelay.toFixed(1)} s</AppText>
          </View>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {holdSteps.map((step, index) => (
              <Pressable
                key={step}
                accessibilityRole="button"
                accessibilityLabel={`Selecionar ${step} segundos`}
                accessibilityState={{ selected: index === holdIndex }}
                onPress={() => setPreference('holdDelay', step)}
                style={{ minWidth: 35, height: 38, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: index === holdIndex ? colors.primary : colors.secondary }}
              >
                <AppText size={11} weight="700" color={index === holdIndex ? colors.primaryForeground : colors.primary}>{step}s</AppText>
              </Pressable>
            ))}
          </View>
        </View>
      </SectionCard>
      <Pressable
        accessibilityRole="button"
        onPress={() => setDeviceInfoVisible((value) => !value)}
        style={({ pressed }) => ({ padding: 14, borderRadius: 16, backgroundColor: colors.secondary, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.75 : 1 })}
      >
        <Feather name="smartphone" size={17} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <AppText size={13} weight="700">Recursos de acessibilidade do aparelho</AppText>
          <AppText size={11} muted style={{ marginTop: 3 }}>Saiba onde habilitar VoiceOver, TalkBack e controles do sistema</AppText>
        </View>
        <Feather name="chevron-right" size={18} color={colors.primary} />
      </Pressable>
      {deviceInfoVisible ? <InfoBanner tone="info">VoiceOver, TalkBack, controle por voz e acesso por interruptor são recursos do sistema operacional. Ative-os em Ajustes (iOS) ou Configurações → Acessibilidade (Android).</InfoBanner> : null}
    </AppScreen>
  );
}
