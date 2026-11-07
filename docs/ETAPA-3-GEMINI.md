# Etapa 3 — configuração do Gemini

## Variáveis

Configure no ambiente **do servidor** `GEMINI_API_KEY` com uma chave válida do Google AI Studio/Gemini; não a inclua no app, repositório ou em variáveis `EXPO_PUBLIC_*`. `GEMINI_MODEL` seleciona o modelo de chat, simplificação e descrição de imagem; `GEMINI_TRANSCRIPTION_MODEL` seleciona o modelo de transcrição. Os padrões estão em `.env.example` e devem ser confirmados contra os modelos habilitados para a chave antes do uso. A chave permanece exclusivamente no servidor.

Configure `CLERK_ISSUER` e `CLERK_JWKS_URL` correspondentes à mesma instância Clerk. As rotas verificam o token Bearer, emissor e assinatura; sem esses valores a autenticação falha. A configuração pública do app também precisa de `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`.

Para recursos que leem mídia do Storage, configure `SUPABASE_URL` no servidor como a URL HTTPS raiz exata do projeto (por exemplo, `https://<project-ref>.supabase.co`, sem caminho, credenciais, query ou fragmento). Ela deve corresponder à origem dos links assinados; não use apenas um domínio Supabase genérico. `EXPO_PUBLIC_SUPABASE_URL` e a chave anon pública são configurações do app e não substituem a configuração privada do servidor.

O app pode apontar `EXPO_PUBLIC_ASSISTIVE_AI_URL` para a origem HTTPS raiz de um serviço compatível. A origem deve expor `/api/ai/simplify-message`, `/api/ai/describe-image` e `/api/ai/transcribe-audio`; não inclua tokens nessa URL. O app envia o token Clerk em `Authorization: Bearer`.

## Contratos e limites

- `POST /api/ai/simplify-message`: JSON `{text}`; até 4.000 caracteres. Retorno `{text, model}`.
- `POST /api/ai/describe-image`: JSON `{imageUrl}`; URL assinada com `token` no caminho de objeto do bucket privado `chat-media`, na origem Supabase configurada. Aceita JPEG, PNG, WebP e GIF, até 8 MiB. O servidor bloqueia redirects, limita leitura do stream mesmo sem `Content-Length`, compara MIME e assinatura do arquivo e usa timeout de 15 s para Storage.
- `POST /api/ai/chat`: JSON `{message, history?}`; mensagem e cada turno até 4.000 caracteres, no máximo 12 turnos; roles `user`/`model`. Retorno `{text, model}`.
- `POST /api/ai/transcribe-audio`: JSON `{audioUrl}`; link assinado de `chat-media`, formatos de áudio suportados pelo handler, até 12 MiB, máximo 10 transcrições por minuto por usuário.

As rotas Gemini autenticam por Clerk e limitam chamadas a 20 por minuto por usuário. Rejeitam configuração inválida/ausente ou autenticação ausente; retornam 400 para entrada inválida, 401 para não autenticado, 429 para limite e 502/503 para indisponibilidade. Limites em memória são por instância e não substituem controles distribuídos em implantação com múltiplas instâncias.

Não coloque chaves privadas em `.env.example` versionado nem em builds mobile. As rotas usam timeouts nas chamadas externas e não seguem redirects para conteúdo de mídia.
