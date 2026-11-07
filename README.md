# Conecta — Ponte Mensagens

Aplicativo móvel Expo/React Native/TypeScript de comunicação acessível para pessoas neurodiversas e pessoas com deficiência. A interface prioriza linguagem direta, áreas de toque claras, texto dimensionável, contrastes, alternativas visuais e suporte aos leitores de tela do sistema.

## Estado desta entrega

- A estrutura Expo Router do WebDev foi preservada; telas, contexto local e identidade visual do ZIP foram migrados para o projeto móvel.
- O código de cadastro/login usa Clerk. A sessão real não é simulada e só fica disponível quando `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` está configurada.
- Perfil, busca de contatos, conversas diretas, mensagens, recibos de leitura e Realtime usam Supabase quando todas as configurações e o SQL abaixo estão aplicados.
- Sem chaves ou com a rede indisponível, o app informa a limitação. A opção **Explorar uma amostra local** é escolhida explicitamente, não cria usuário/sessão, não acessa o Supabase e identifica os dados como demonstração.
- A tela Pesquisa e IoT valida categorias e contagens e tenta carregar o snapshot mais recente de `research_aggregate_snapshots` no Supabase. Essa tabela aceita somente leitura para JWTs com `app_metadata.role = admin`; sem snapshot autorizado, o app usa `data/pesquisa.json`, que agora é um modelo vazio. Nenhum dado pessoal ou resposta individual é exibido.
- Chamadas e atualizações/status permanecem demonstrações. Conversas reais suportam mídia no Storage privado, gravação/reprodução de áudio, transcrição opcional e notificações locais. O **Dispositivo Assistivo** inclui simulador funcional que emite o evento `button_press/read_last_message`, localiza a última mensagem recebida e a lê com Expo Speech; também mantém o adaptador BLE físico. A integração física só deve ser considerada conectada após validação num development build nativo com hardware real. Não há chamadas reais, notificações push remotas ou criptografia ponta a ponta.

## Configuração externa do chat

Copie `.env.example` para um arquivo `.env` local e configure os valores **públicos** de Clerk e Supabase. Esses valores são necessários no bundle do app; não coloque `CLERK_SECRET_KEY`, `service_role` ou qualquer outra chave secreta em variáveis `EXPO_PUBLIC_*`, código ou commits.

1. Configure o Clerk e habilite e-mail/senha e, se desejado, Google. Ative o nome de usuário se pretende buscá-lo. O OAuth Google exige também que o provedor e o redirect estejam configurados no painel Clerk.
2. No Supabase, configure o provedor de autenticação de terceiros Clerk com o issuer correto.
3. No Clerk, crie um JWT template/preset Supabase chamado `supabase`. O token precisa emitir o ID Clerk em `sub` e a role `authenticated`.
4. No **SQL Editor do seu projeto Supabase**, aplique `supabase/chat-schema.sql` e depois `supabase/voice-transcription-migration.sql`. O primeiro script inclui tabelas, campos de mídia, bucket privado `chat-media`, políticas Storage, funções, grants, RLS por `auth.jwt()->>'sub'`, recibos e publicação Realtime. A migração seguinte cria a RPC que grava transcrições sem conceder UPDATE irrestrito nas mensagens. A aplicação não executa SQL automaticamente.
5. Reinicie o Metro depois de alterar variáveis públicas e entre com uma conta Clerk real. O app aguarda a sincronização do perfil no Supabase antes de permitir descoberta de perfis e criação de conversa.
6. Opcionalmente, defina `EXPO_PUBLIC_ASSISTIVE_AI_URL` para um backend HTTPS que valide o JWT Clerk e implemente `POST /simplify-message`, `POST /describe-image` e `POST /transcribe-audio`, retornando `{ "text": "..." }`. As chaves do provedor de IA ficam somente nesse backend.

## Assistente interativo Gemini

A lista de conversas inclui a tela **Assistente Gemini**, com respostas de texto em português, leitura em voz alta e ditado opcional. O ditado só preenche o rascunho; a pergunta é enviada quando a pessoa toca em **Enviar**. O histórico fica no armazenamento local do aparelho e pode ser apagado na própria tela. Para conversar, é necessária uma sessão Clerk real; a amostra anônima não chama o serviço de IA.

1. Crie uma chave da Gemini API no [Google AI Studio](https://aistudio.google.com/api-keys) e adicione-a ao `.env` do servidor como `GEMINI_API_KEY`. Não use `EXPO_PUBLIC_GEMINI_API_KEY`, não inclua a chave no app e não a envie ao Git. O servidor usa `GEMINI_MODEL=gemini-3.8-flash` para o assistente e `GEMINI_TRANSCRIPTION_MODEL=gemini-3.5-transcribe` para transcrever áudio. Ambos precisam estar habilitados na sua conta.
2. No mesmo ambiente do servidor, configure `CLERK_ISSUER` com o emissor exato do JWT da instância Clerk e `CLERK_JWKS_URL` com o endpoint JWKS correspondente (`<issuer>/.well-known/jwks.json`). O endpoint `/api/ai/chat` verifica a assinatura e o emissor do JWT antes de encaminhar mensagens.
3. Em Web, o app deriva a URL do servidor a partir do host do preview. Para um build nativo, configure `EXPO_PUBLIC_API_BASE_URL` com a base HTTPS pública do servidor; em desenvolvimento, use um endereço de rede alcançável pelo celular, não `localhost` do próprio aparelho.
4. Reinicie o servidor depois de adicionar as variáveis. A rota Gemini limita o histórico enviado a 12 mensagens anteriores e aplica limite básico de 20 solicitações por minuto por usuário e instância do servidor. Mensagens enviadas ao Assistente são processadas pelo provedor Gemini; não inclua informações sensíveis.

A integração usa o endpoint REST oficial [`generateContent`](https://ai.google.dev/gemini-api/docs/generate-content) e envia a chave pela chamada server-side. O Google recomenda manter chaves confidenciais e nunca expô-las em código cliente; consulte [segurança de chaves Gemini](https://aistudio.google.com/docs/api-key).

## Reconhecimento e transcrição de voz

O reconhecimento de fala ao vivo usa `expo-speech-recognition` em pt-BR para comandos e ditado; ele converte a fala em texto para revisão e nunca envia uma mensagem automaticamente. Permissões e reconhecimento do sistema dependem do aparelho e podem envolver processamento do provedor do sistema operacional. Para mensagens gravadas, o app envia o áudio ao Storage privado e, se `audioTranscription` estiver ativo, pede a transcrição ao backend Gemini. O backend aceita somente URL assinada do bucket `chat-media`, limita áudio a 12 MB e chama `gemini-3.5-transcribe`. O texto é persistido pela RPC `set_message_audio_transcript`, que exige sessão Clerk/Supabase válida e participante da conversa. Áudio e transcrição são enviados ao Google para processamento; obtenha consentimento e evite conteúdo sensível.

## Botão assistivo simulado

Abra **Configurações → Dispositivo Assistivo**, selecione uma conversa e toque em **Pressionar botão assistivo**. O simulador envia pelo barramento do serviço BLE o mesmo evento do firmware (`type: button_press`, `action: read_last_message`); o app procura a última mensagem recebida, mostra o conteúdo e lê em pt-BR. O controle de interrupção para a fala atual. O histórico de até 30 acionamentos fica no armazenamento local do aparelho. Também é possível abrir o simulador pelo ícone de rádio no cabeçalho de uma conversa; o ID é carregado como seleção. O feedback háptico e os avisos falados respeitam as preferências de vibração e feedback sonoro. Sem conversa/mensagem, a tela explica o que falta. O botão simulado não afirma que há um ESP32 conectado e não depende de placa física.

## Dados funcionais e operação do banco

O backend de dados remotos é Supabase. O esquema atual cobre perfis, contatos, conversas diretas, mensagens textuais e de mídia, preferências de acessibilidade, snapshots agregados de pesquisa e Storage privado. Ative Clerk como provedor terceiro de Auth no Supabase; aplique as políticas RLS do SQL antes de distribuir o app. Não use `service_role` no cliente. Veja `supabase/SETUP.md` para ordem de implantação, validação e cuidados com backup.

As abas **Chamadas** e **Atualizações/status** continuam explicitamente demonstrativas: ainda não existe chamada de áudio/vídeo em tempo real nem publicação real de status. O schema de chat não transforma essas telas em funcionalidades remotas; isso requer implementar serviços de mídia, consentimento e as respectivas telas/RLS antes de anunciar como disponível.

O client mobile usa apenas a URL do projeto e a chave pública/anon de Supabase. Com as credenciais ausentes, o endereço substituto termina em `.invalid`, e o app não tenta gravar dados remotos.

## Executar e verificar

```bash
pnpm install
pnpm check
pnpm exec expo install --check
pnpm dev
```

No template móvel gerenciado, `pnpm dev` inicia Metro e o servidor base do starter. O chat deste app não usa o banco Drizzle do starter; ele usa o Supabase configurado acima. O fluxo do starter com OAuth/API pode depender de seu schema Drizzle; não confunda esse banco com as tabelas Supabase do Conecta.

## Recursos assistivos e builds nativos

- As preferências (texto, contraste, espaçamento, redução de movimento, tamanho de alvos, som e vibração) persistem localmente. Se Clerk/Supabase estiverem configurados e a linha RLS estiver acessível, preferências de acessibilidade também podem sincronizar em `accessibility_preferences`; uma falha de leitura não autoriza sobrescrever o registro remoto.
- OCR e rótulos sugeridos por ML Kit processam a imagem selecionada no aparelho. O resultado é uma sugestão, não uma descrição perfeita; há um campo de descrição manual complementar.
- Comandos de navegação usam reconhecimento de fala em pt-BR, sujeito a permissão e suporte do dispositivo/navegador. Dependendo da plataforma, o reconhecimento do sistema pode processar áudio conforme suas próprias regras de privacidade. A síntese pt-BR usa `expo-speech`; feedback háptico usa `expo-haptics` quando disponível e habilitado.
- Imagens e áudios enviados são armazenados no bucket privado `chat-media`; o app gera URLs assinadas temporárias apenas para participantes da conversa. A reprodução e gravação usam `expo-audio` e exigem build nativo para validação completa. A transcrição automática requer a conexão de um serviço Speech-to-Text ao campo `audio_transcript`; sem ele, a mensagem continua reproduzível e não recebe texto inventado.
- Notificações de novas mensagens são preparadas como notificações locais no dispositivo, respeitando permissão, `messageNotifications`, `groupNotifications` e `notificationPreview`. Push remoto não foi fingido nem adicionado sem um provedor de entrega.
- `lib/assistiveAi.ts` conecta o chat a um serviço externo de IA assistiva: o botão de simplificação altera apenas o rascunho para revisão humana; após upload, áudio e imagem podem receber transcrição/descrição e persistir nos campos `audio_transcript`/`media_description`. O app nunca envia uma chave privada e não cria texto de IA quando o serviço falha.
- OCR (`expo-ocr-kit`) e rótulos ML Kit são módulos nativos e exigem binário que os inclua; não presuma suporte em Expo Go. O Preview Web não processa OCR. Para diferenças entre Expo Go, Web e development build Android, permissões, persistência e roteiro manual, consulte [`docs/ETAPA-3-ANDROID.md`](docs/ETAPA-3-ANDROID.md). Nenhum build ou teste em aparelho real é alegado nesta etapa.
- A integração ESP32 usa Bluetooth Low Energy. O app procura o serviço anunciado pelo firmware, conecta, recebe o evento do botão físico, exibe desconexões e tenta reconectar até cinco vezes. Web/Expo Go não comprovam o fluxo BLE; consulte `esp32/README.md` para montagem, protocolo e gravação do firmware.
- O simulador local compartilha o evento `button_press/read_last_message` com o handler usado pelo BLE físico; selecione uma conversa e toque no botão grande em **Dispositivo Assistivo**. Isso valida o comportamento da aplicação sem hardware, mas não valida BLE, firmware, permissões Bluetooth nem botão elétrico.
- A revisão geral da ETAPA 6 está em `docs/ETAPA-6-VALIDACAO.md`. TypeScript, lint, testes automatizados e export Web passaram. O cliente `lib/assistiveAi.ts` agora integra simplificação de rascunhos, descrição de imagens e transcrição pós-upload quando `EXPO_PUBLIC_ASSISTIVE_AI_URL` aponta para um serviço HTTPS que valide o JWT Clerk; sem esse serviço, o app informa a indisponibilidade e mantém as alternativas locais.

## Arquivos principais

- `app/`: rotas, abas, conversas, perfil, acessibilidade e painel.
- `context/`: preferências/dados locais e separação de sessão anônima/autenticada.
- `lib/supabase.ts`: client Supabase e upsert do perfil Clerk.
- `data/pesquisa.json`: modelo vazio para configuração local; não contém respostas fictícias.
- `supabase/chat-schema.sql`: schema, grants, funções e RLS.
- `lib/esp32Ble.ts`: serviço BLE com descoberta, conexão, notificações, protocolo e reconexão.
- `esp32/`: firmware separado, protocolo JSON e montagem do botão assistivo.
- `assets/images/`: ativos do projeto e versões de launcher/splash/adaptive icon.
- `docs/ETAPA-6-VALIDACAO.md`: matriz de testes, evidências e validações manuais pendentes.
