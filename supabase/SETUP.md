# Banco de dados do Conecta

O projeto usa Supabase Postgres, Auth federado por Clerk e Storage privado para mídia. O SQL não é executado automaticamente pelo app: aplique as migrações no projeto Supabase antes de testar conversas reais.

## Implantação inicial

1. Crie um projeto Supabase. Guarde a URL do projeto e a chave pública/anon para a configuração do app. A chave `service_role` é administrativa e não deve ser colocada no cliente, no repositório ou em variáveis `EXPO_PUBLIC_*`.
2. No painel Clerk, copie o **Frontend API URL** da instância correta (issuer, sem inventar nem trocar o domínio da instância). No Supabase, habilite Clerk como provedor terceiro de autenticação e informe esse issuer exatamente. No Clerk, crie o JWT template/preset `supabase` compatível com Supabase: `iss` emitido pela instância, `sub` igual ao ID estável do usuário Clerk, `role: "authenticated"` e `aud: "authenticated"`, além dos claims temporais assinados (`iat`, `exp` e, se emitido, `nbf`). Assine o token pelo Clerk e use esse token no cliente Supabase; não construa nem edite JWT manualmente. O identificador `sub` é usado como chave em todas as políticas e precisa coincidir com `profiles.id`. Não copie tokens para logs ou documentação.
3. Abra o **SQL Editor** do Supabase. Execute `chat-schema.sql` inteiro. Depois execute `voice-transcription-migration.sql`, `media-description-migration.sql` e `dashboard-additional-charts-migration.sql`. Não remova as políticas RLS ou os grants para “fazer funcionar”: isso exporia dados entre usuários.
4. Confirme no Table Editor a presença de `profiles`, `contacts`, `conversations`, `messages`, `accessibility_preferences` e `research_aggregate_snapshots`. Em Storage, confirme o bucket `chat-media` com acesso privado. O schema tenta adicionar `messages` e `conversations` à publicação `supabase_realtime` quando ela existe; confirme em **Database → Replication** que ambas estão publicadas.
5. No app, configure `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` e a `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` correspondente àquela mesma instância. Configure `EXPO_PUBLIC_ASSISTIVE_AI_URL` para a origem HTTPS raiz da API assistiva; `EXPO_PUBLIC_API_BASE_URL` aponta para a API Express usada por outros fluxos do app. No runtime do servidor, configure `GEMINI_API_KEY`, `CLERK_ISSUER`, `CLERK_JWKS_URL` e a URL exata do projeto Supabase (`SUPABASE_URL`). Nunca exponha a chave Gemini, `service_role`, nem segredo Clerk em variáveis `EXPO_PUBLIC_*`.
6. Reinicie Metro e servidor. Entre com uma conta real. O app sincroniza o perfil Clerk para `profiles`; depois teste busca/contato, abertura de conversa, mensagem, recibo de leitura, upload de áudio e transcrição.

## Escopo e segurança

RLS está ativado nas tabelas do schema. O usuário só deve gravar o próprio perfil, ler suas conversas e mensagens participantes, e ler/alterar suas preferências. As funções `get_or_create_direct_conversation`, `search_profiles`, `list_contacts`, `add_contact`, `mark_conversation_read`, `set_message_audio_transcript` e `set_message_media_description` validam o ID do usuário a partir do JWT. As duas últimas atualizam somente o campo permitido do tipo de mídia correspondente e apenas para um participante da conversa. A busca de perfil retorna somente dados mínimos; não solicite `email` na consulta pública, pois o grant de leitura não expõe esse campo.

O bucket `chat-media` é privado. O app salva objetos sob `user_id/conversation_id/arquivo`, cria URL assinada temporária para participantes e armazena o caminho do objeto em `messages.media_url`. A transcrição exige URL assinada do mesmo bucket, limite de 12 MB e autenticação Clerk. O backend busca o objeto no host Supabase configurado e envia os bytes ao Gemini; configure `GEMINI_TRANSCRIPTION_MODEL=gemini-3.5-transcribe`. Transcrições têm texto sensível potencial: trate-as como conteúdo da mensagem e não as exporte sem autorização.

O acesso administrativo a `research_aggregate_snapshots` depende do claim confiável `app_metadata.role="admin"`; não derive esse valor de metadata editável pelo usuário nem permita que o cliente o defina. Configure-o somente por mecanismo administrativo confiável e valide que o provedor Clerk realmente o inclui no JWT que o Supabase verifica. A policy compara esse claim diretamente; se não estiver presente, o acesso deve falhar fechado.

As RPCs `get_or_create_direct_conversation`, `search_profiles`, `list_contacts`, `add_contact` e `mark_conversation_read` são concedidas somente a `authenticated`; cada uma deriva o usuário de `auth.jwt()->>'sub'`. As RPCs de transcrição e descrição seguem o mesmo padrão e limitam a atualização à mensagem participante e ao tipo correspondente. O trigger `update_conversation_last_message` é interno ao banco e não é uma RPC de cliente. Realtime não substitui RLS: mantenha a publicação limitada às tabelas necessárias e confira que subscriptions continuam retornando somente linhas autorizadas ao JWT de cada conta. Storage exige bucket privado e caminho cujo primeiro segmento seja o `sub`; uma URL assinada é um bearer temporário, portanto não a compartilhe.

Não inclua service-role, chave Gemini, JWT de usuário ou URLs assinadas em commits, logs, analytics ou capturas de tela. Proteja `.env` e use Secrets/Environment Variables do provedor de hospedagem. Restrinja chaves Gemini ao serviço necessário, habilite alertas de uso/faturamento e limite requisições na borda de produção. O limite por usuário em memória do processo não substitui rate limit distribuído em múltiplas réplicas.

## Testes de verificação

- Faça login e confirme que seu perfil existe em `profiles` com `id` igual ao `sub` do JWT.
- Use duas contas de teste. Confirme que cada uma só consegue ler as conversas em que participa e que uma não consegue ler/atualizar o perfil, preferências, mensagens ou mídia privada da outra.
- Envie texto e confirme o novo registro em `messages`, `conversations.last_message` e o evento Realtime. Abra a conversa do destinatário e confirme `read_at`.
- Grave áudio curto. Confirme o objeto no bucket privado, a mensagem `media_type='audio'` e, com `audioTranscription` ativado, a coluna `audio_transcript` depois do processamento. Teste também sem permissão de microfone, com rede indisponível e com áudio maior que o limite.
- Tente chamar a RPC de transcrição sem JWT, para ID que não pertence à conta e para mensagem que não é de áudio; as três chamadas devem falhar.
- Tente chamar a RPC `set_message_media_description` sem JWT, para ID que não pertence à conta e para mensagem que não é imagem; as três chamadas devem falhar.
- Confirme que as tabelas `research_aggregate_snapshots` só são legíveis por JWT com `app_metadata.role='admin'`.

## Migrações, backup e recuperação

Mantenha os arquivos SQL versionados e aplique cada mudança como migração revisada em staging antes de produção. Antes de mudanças destrutivas, crie backup do banco e confirme que mídia do Storage também tem política de retenção/cópia; backup do Postgres não deve ser presumido como cópia automática dos objetos de Storage. Defina retenção e recuperação conforme o plano Supabase, restrinja acesso administrativo, teste uma restauração periodicamente e não guarde tokens ou mídia em exports de diagnóstico.

Chamadas e status não estão cobertos por tabelas funcionais porque as telas correspondentes ainda são demonstrações. Históricos do Assistente Gemini também ficam locais neste momento. Ao tornar essas áreas remotas, projete tabelas e políticas RLS específicas e atualize este guia antes de liberar o recurso.
