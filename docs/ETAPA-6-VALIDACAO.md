# ETAPA 6 — Testes e validação

## Resumo

A revisão automatizada do projeto foi concluída em 7 de novembro de 2026. O código compila, o lint não encontrou erros e os testes automatizados passaram. O export Web também foi concluído.

Isso não substitui testes de integração com duas contas, credenciais reais do Clerk/Supabase, development build Android/iOS, permissões do dispositivo ou um ESP32 físico. Esses pontos estão separados abaixo para evitar que uma demonstração seja confundida com uma validação real.

## Evidências automatizadas

| Verificação | Resultado |
|---|---|
| `pnpm check` | Aprovado |
| `pnpm lint` | Aprovado, sem erros |
| `pnpm test` | 25 aprovados; 1 teste de logout ignorado |
| `npx expo export --platform web` | Aprovado |
| `npx expo config --type public` | Aprovado; plugins e permissões resolvidos |
| `npx expo-doctor` | 20/21 verificações; 1 aviso de metadados nativos |

O aviso do Expo Doctor é sobre `@react-native-ml-kit/image-labeling` não ter compatibilidade declarada com a New Architecture e `expo-ocr-kit` não possuir metadados no React Native Directory. A funcionalidade não foi declarada como validada por causa desse aviso.

## Matriz funcional

| Fluxo | Estado | Evidência ou dependência |
|---|---|---|
| Autenticação e cadastro | Preparado; não testado contra serviço real | Clerk, telas de entrada/cadastro e guardas de rota presentes. Exige chave e provedor configurados. |
| Criação e edição de perfil | Implementado; integração real não executada | Nome e descrição usam Supabase quando há sessão e schema aplicado. |
| Adição de contatos | Implementado; integração real não executada | RPCs `search_profiles`, `list_contacts` e `add_contact`, protegidas por RLS. |
| Criação de conversas | Implementado; integração real não executada | RPC `get_or_create_direct_conversation`, com par único. |
| Mensagens entre contas | Implementado; não testado com duas contas | Inserção, leitura, RLS e deduplicação por `message.id`. |
| Realtime | Implementado; servidor não disponível nesta validação | Canais Supabase para mensagens, conversas e lista; estados de erro/timeout tratados. |
| Imagens | Implementado; não testado em Storage real | `expo-image-picker`, bucket privado, URLs assinadas e política de Storage. |
| Áudio | Implementado; não testado em dispositivo | Gravação/reprodução com `expo-audio`, permissão de microfone e upload. |
| Transcrição de áudio | Integrada condicionalmente | Após upload, `lib/assistiveAi.ts` chama `/transcribe-audio` e persiste `audio_transcript`; exige `EXPO_PUBLIC_ASSISTIVE_AI_URL` e backend que valide JWT Clerk. |
| OCR | Preparado; não testado neste ambiente | `expo-ocr-kit` exige build nativo atualizado. |
| Descrição de imagens por IA | Integrada condicionalmente | Após upload, chama `/describe-image` e persiste `media_description`; OCR/ML Kit e descrição manual continuam disponíveis localmente. |
| Simplificação de mensagens por IA | Integrada condicionalmente | O botão simplifica somente o rascunho e exige revisão humana antes do envio; chama `/simplify-message`. |
| Acessibilidade | Implementada em código; precisa de validação manual | Escala, contraste, leitores de tela, voz, feedback e alvos de toque foram conectados às preferências. |
| Navegação por voz | Preparada; não testada com microfone real | `expo-speech-recognition`, comandos em pt-BR e estados de erro implementados. |
| Feedback sonoro/tátil | Implementado condicionalmente | `expo-speech` e `expo-haptics`; exige aparelho e preferências ativas. |
| Dashboard/importação | Implementado e validado estaticamente | JSON local vazio; snapshot agregado Supabase com RLS administrativo; filtros e validação. |
| ESP32 | Estrutura implementada; não testada | BLE, protocolo e firmware presentes; exige ESP32 e development build. |
| Android/iOS | Configuração resolvida; execução nativa pendente | Permissões e plugins aparecem na configuração Expo; não há simulador/dispositivo disponível. |

## Problemas corrigidos durante a revisão

- O dashboard não trata valores fictícios como pesquisa real: `data/pesquisa.json` agora é um modelo vazio.
- O dashboard não depende somente de um import estático: tenta o snapshot agregado autorizado do Supabase e faz fallback seguro.
- Foram adicionados filtros e indicadores separados de participantes, respostas e barreiras.
- Foi adicionada proteção administrativa para `research_aggregate_snapshots` por `app_metadata.role = admin`.
- O export Web foi verificado após as alterações.

## Testes manuais necessários

Para concluir a validação de campo, ainda é necessário executar, em ambiente controlado:

1. Criar duas contas Clerk reais e confirmar os perfis no Supabase.
2. Adicionar uma conta como contato e abrir a conversa nas duas contas.
3. Enviar textos em ambas as direções e confirmar o Realtime sem duplicatas.
4. Aplicar `supabase/chat-schema.sql` e testar upload/leitura de imagem com RLS.
5. Gravar, enviar e reproduzir áudio em Android e iOS.
6. Configurar o backend de IA assistiva e verificar que transcrição, descrição e simplificação retornam conteúdo válido, sem PII, e que a transcrição salva em `audio_transcript` pertence à mensagem correta.
7. Testar OCR e permissões de biblioteca em development build.
8. Testar TalkBack/VoiceOver, reconhecimento de voz, som, vibração e redução de movimento.
9. Publicar um snapshot anonimizado como administrador e confirmar que um usuário comum não o lê.
10. Conectar o ESP32 real, validar botão, desconexão, reconexão e comandos inválidos.

Nenhum desses testes manuais deve ser marcado como aprovado sem evidência em dispositivo/serviço real.
