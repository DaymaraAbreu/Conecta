# Guia passo a passo — integrações e testes do Conecta

Este guia parte do código atual do Conecta e organiza o que configurar antes de testar. As verificações automatizadas já executadas passaram, mas **nenhuma conexão autenticada com Gemini, Clerk ou Supabase real foi comprovada**. Marque cada teste somente depois de observar o resultado no ambiente de destino.

## 0. Proteja as credenciais e prepare o ambiente

1. Use um projeto Supabase, uma instância Clerk e uma chave Gemini pertencentes ao responsável autorizado. Prefira um ambiente de teste separado da produção.
2. Na raiz do repositório, crie o arquivo local de configuração: `cp .env.example .env`. Edite somente esse `.env`; não atualize o `.env.example` com valores reais e não envie chaves privadas em chat, prints, logs, GitHub ou ZIP.
3. Os nomes iniciados por `EXPO_PUBLIC_` entram no bundle do aplicativo e **não são secretos**. `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` são chaves públicas do cliente. Não inclua `CLERK_SECRET_KEY`, chave `service_role`, chave Gemini ou outro segredo em `EXPO_PUBLIC_*`.
4. Não é necessário colocar uma Supabase `service_role` no app ou no servidor para o fluxo descrito aqui. O acesso do cliente deve passar por Clerk JWT, RLS, Storage privado e RPCs limitadas.

## 1. Configure Clerk e o token aceito pelo Supabase

1. Crie/configure a instância Clerk usada pelo app e habilite o método de login que será testado. Para o teste recomendado, crie duas contas de teste autorizadas, A e B, com usuários diferentes.
2. Copie a **publishable key** da mesma instância para `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` no `.env` do app. Não use a secret key no cliente.
3. Anote o Frontend API URL/issuer exato da instância. No ambiente do servidor, configure `CLERK_ISSUER` com esse issuer e `CLERK_JWKS_URL` com o endpoint JWKS correspondente, normalmente `<issuer>/.well-known/jwks.json`. Ambos devem apontar para a mesma instância.
4. No Clerk, crie o JWT template/preset chamado `supabase`. Ele deve emitir `iss` compatível com o provider configurado no Supabase, `sub` igual ao ID estável do usuário Clerk, `role: "authenticated"`, `aud: "authenticated"` e claims temporais válidos (`iat`, `exp`; `nbf` quando usado). Não crie nem edite JWT manualmente.
5. No Supabase, habilite Clerk como provedor third-party Auth e configure o issuer exato. O app já solicita `getToken({ template: 'supabase' })`; sem esse template e os claims compatíveis, as consultas remotas não serão autorizadas.

**Checagem Clerk/Supabase:** entre no app com a conta A e, pelo painel autorizado, confirme que `profiles.id` corresponde ao `sub` daquela sessão. Repita com B e confirme IDs distintos. Não copie tokens para evidências.

## 2. Configure Supabase, esquema, RLS, Storage e Realtime

1. Crie o projeto Supabase de teste e anote a URL HTTPS exata, por exemplo `https://<project-ref>.supabase.co`, e a chave pública/anon do cliente.
2. No `.env` do app, preencha `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`. No ambiente do servidor, preencha `SUPABASE_URL` com a URL HTTPS raiz exata do mesmo projeto — sem caminho, credenciais, query ou fragmento.
3. No **SQL Editor** do projeto de teste, revise e execute na ordem:
   1. `supabase/chat-schema.sql`
   2. `supabase/voice-transcription-migration.sql`
   3. `supabase/media-description-migration.sql`
   4. `supabase/dashboard-additional-charts-migration.sql`
4. Em **Storage**, confirme que o bucket `chat-media` existe e é privado (`public=false`). Não torne o bucket público para contornar erro de acesso.
5. Em **Database → Replication**, confirme que `public.messages` e `public.conversations` estão na publicação `supabase_realtime`.
6. Verifique no painel que RLS está habilitado nas tabelas do schema e que policies/grants correspondem ao `supabase/SETUP.md`. Não remova RLS ou grants restritos para “fazer funcionar”.
7. Para testar o dashboard administrativo, configure `app_metadata.role="admin"` somente por um mecanismo Clerk confiável de servidor/administrador. Metadata editável pelo usuário não pode conceder acesso. Sem snapshot agregado autorizado, o dashboard deve permanecer vazio; não carregue dados fictícios.

## 3. Configure Gemini e as URLs do servidor

No `.env`, confira a distinção entre variáveis do cliente e do servidor:

| Variável | Onde | Uso |
|---|---|---|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | bundle do app | Login Clerk, chave pública da instância correta |
| `EXPO_PUBLIC_SUPABASE_URL` | bundle do app | URL do projeto Supabase |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | bundle do app | Chave pública/anon do mesmo projeto |
| `EXPO_PUBLIC_API_BASE_URL` | bundle do app | Origem/base HTTPS da API usada pelo app, especialmente transcrição de mensagem |
| `EXPO_PUBLIC_ASSISTIVE_AI_URL` | bundle do app | Origem HTTPS raiz das rotas Gemini de simplificação, descrição e transcrição |
| `GEMINI_API_KEY` | **somente servidor** | Chave privada do provedor Gemini |
| `GEMINI_MODEL` | servidor, opcional | Modelo para chat, simplificação e descrição |
| `GEMINI_TRANSCRIPTION_MODEL` | servidor, opcional | Modelo de transcrição de áudio |
| `CLERK_ISSUER` | **somente servidor** | Issuer exato da instância Clerk |
| `CLERK_JWKS_URL` | **somente servidor** | JWKS da mesma instância Clerk |
| `SUPABASE_URL` | **somente servidor** | Origem HTTPS exata usada para validar/obter mídia assinada |

1. Crie a chave Gemini no ambiente autorizado e coloque-a somente em `GEMINI_API_KEY` no `.env` local do servidor ou em um gerenciador de segredos do host. Não a inclua em builds mobile, Git, ZIP ou screenshots.
2. Confirme no painel do provedor que os valores de `GEMINI_MODEL` e `GEMINI_TRANSCRIPTION_MODEL` estão habilitados para aquela chave; os padrões de `.env.example` podem depender da disponibilidade da conta/modelo.
3. Defina `EXPO_PUBLIC_API_BASE_URL` e `EXPO_PUBLIC_ASSISTIVE_AI_URL` com as bases corretas do ambiente. Em Web, `EXPO_PUBLIC_API_BASE_URL` pode ser inferida pelo host de Preview (porta 8081 para API na 3000), mas `EXPO_PUBLIC_ASSISTIVE_AI_URL` precisa estar preenchida para os recursos de IA assistiva.
4. Para aparelho físico, `localhost` aponta para o próprio aparelho, não para o computador. Use uma origem HTTPS alcançável pelo telefone (por exemplo, servidor de teste HTTPS ou túnel HTTPS autorizado). O helper de IA assistiva rejeita origem HTTP; não use uma URL LAN HTTP para essa variável.
5. Reinicie Metro e servidor depois de alterar variáveis. Valores `EXPO_PUBLIC_*` são aplicados ao reiniciar/recriar o bundle; o servidor precisa iniciar com as variáveis privadas carregadas.

O servidor expõe `GET /api/health`. As rotas assistivas relevantes são `POST /api/ai/chat`, `/api/ai/simplify-message`, `/api/ai/describe-image` e `/api/ai/transcribe-audio`. O app envia Clerk Bearer token; não registre nem compartilhe o token. `describe-image` e transcrição de mídia exigem URL assinada válida do bucket privado `chat-media` no mesmo projeto Supabase. Limites atuais: até 20 chamadas Gemini/minuto/usuário nas rotas gerais; até 10 transcrições/minuto/usuário; imagem até 8 MiB e áudio até 12 MiB.

## 4. Instale, execute e faça as verificações automatizadas

Na raiz do projeto:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm lint
pnpm test
pnpm build
npx expo export --platform web
```

Para desenvolvimento Web, `pnpm dev` inicia o servidor Express na porta 3000 e o Metro Web na 8081. Confirme `GET http://localhost:3000/api/health` com resposta 200. O export Web **não** valida chaves Gemini/Supabase/Clerk, OCR nativo, permissões Android ou BLE.

## 5. Teste Gemini pelo app

1. Entre com uma conta Clerk real e confirme que as chamadas autenticadas não retornam 401.
2. No **Assistente Gemini**, envie uma pergunta não sensível. Confirme resposta e leitura em voz alta; verifique que o histórico continua local conforme o app.
3. Em uma mensagem ainda em rascunho, solicite simplificação. Revise o texto proposto antes de enviá-lo; a IA não deve enviar a mensagem automaticamente.
4. Envie uma imagem de teste não sensível a uma conversa autorizada, solicite descrição e confirme que a descrição é retornada/salva apenas para participante. Teste também URL expirada, bucket diferente ou usuário não participante: o acesso deve falhar.
5. Grave um áudio curto de teste, envie-o e verifique transcrição e salvamento na mensagem. Tente também áudio inválido/acima do limite e recusa de microfone; registre o comportamento sem gravar conteúdo pessoal.
6. Faça um teste negativo sem sessão: endpoints protegidos devem recusar a chamada. Se ocorrer 503, confira configuração do servidor; 401 costuma indicar issuer/JWKS/template/sessão; 403 em mídia costuma indicar URL, bucket ou autorização; 429 indica limite temporário.

## 6. Teste chat, RLS, Storage e Realtime com duas contas

Use sessões separadas para A e B e dados de teste não sensíveis. Siga também `docs/ETAPA-3-SUPABASE-TESTE.md`.

1. Faça login A e B; confira IDs Clerk distintos e correspondência de `profiles.id` com `sub`.
2. Como A, localize B, crie/abra conversa direta e envie texto. Como B, receba e responda. Confirme linhas em `messages`, resumo em `conversations` e evento Realtime nas duas sessões.
3. Confirme que recibo de leitura (`read_at`) marca somente as mensagens recebidas pela conta que abriu a conversa.
4. Envie áudio e imagem de teste. Confirme objeto no bucket privado em caminho cujo primeiro segmento é o `sub` correto; URL assinada só pode ser emitida para participante e é temporária.
5. Execute, com registros reais do ambiente de teste, verificações negativas: usuário sem sessão, usuário não participante, caminho Storage cujo primeiro segmento não corresponde ao usuário e RPC aplicada a tipo de mídia incorreto devem falhar.
6. Confirme que `set_message_audio_transcript` só altera transcrição de mensagem de áudio autorizada e `set_message_media_description` só altera descrição de imagem autorizada; as funções não devem permitir editar remetente, destinatário, conteúdo ou caminho de mídia.
7. Confirme que usuários comuns não leem `research_aggregate_snapshots`; teste leitura administrativa somente com `app_metadata.role="admin"` atribuído de forma confiável. Não use SQL Editor como prova de isolamento RLS, porque acesso administrativo pode contornar RLS.

## 7. Teste acessibilidade e hardware no Android

1. Gere/instale um **development build Android** que inclua os plugins nativos do projeto. Expo Go e export Web não comprovam OCR/ML Kit, reconhecimento de fala, BLE ou permissões nativas. O repositório não tinha um build físico validado nesta etapa.
2. Teste permissão concedida e negada para fotos/microfone; valide mensagem de erro e possibilidade de continuar pelos caminhos alternativos.
3. Com TalkBack, teste foco/ordem, nomes e estados de botões, campos, alvos e escala de texto; repita ajustes de contraste, negrito, espaçamento e redução de movimento.
4. Teste OCR em imagem com texto legível, sem texto e ilegível. Revise a saída manualmente; rótulos ML Kit são sugestões, não fatos garantidos.
5. Teste voz pt-BR com serviço disponível/indisponível, cancelamento e interrupção. Confirme que ditado apenas preenche o rascunho e não envia automaticamente.
6. Teste gravação/reprodução/transcrição, vibração e interrupção da leitura em aparelho real, com consentimento quando houver áudio de outra pessoa.
7. Para ESP32, use development build, firmware e placa compatíveis. Teste conexão, botão, leitura da última mensagem, desconexão e reconexão. O simulador do app é útil, mas não valida BLE/hardware. Não prometa funcionamento em segundo plano sem teste específico.

## 8. Registre evidências e conclua a atividade extensionista

O roteiro da disciplina exige pesquisa de campo com **no mínimo 10 pessoas com deficiência**, questionário/entrevista e TCLE quando aplicável; mapeamento de barreiras; proposta e protótipo com IA/IoT; tratamento/análise de dados e gráficos; relatório técnico final; documentação de replicação; código-fonte no GitHub com link; e entrega no AVA dentro do prazo, além da apresentação/defesa indicada pela coordenação. Validação por usuário real ou instituição parceira é valorizada.

A versão atual **não possui respostas reais de pesquisa nem evidência de testes com essas pessoas**. Não transforme o modelo vazio ou conteúdo de demonstração em resultado. Obtenha consentimento e orientação institucional, anonimize registros, colete apenas o necessário, agregue resultados sem identificar participantes e documente método, limitações, datas, evidências e relação com o ODS 10. Confirme datas e exigências com a professora/AVA. Uso de IA não substitui autoria, participação ou validação do grupo.

Use uma tabela de execução com uma linha por cenário e os estados `Aprovado`, `Falhou`, `Não executado` ou `Bloqueado`; anote versão/ambiente, evidência sanitizada e responsável. Nunca publique chaves, tokens, URLs assinadas, nomes, e-mails, respostas individuais, conteúdo de conversa ou mídia. Só conclua o item quando o teste tiver sido observado de fato.
