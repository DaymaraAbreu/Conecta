# TODO — Conecta · Ponte Mensagens

## [x] Auditoria do código-fonte fornecido
- Inspecionar as funcionalidades do projeto atual antes de decidir o que precisa ser alterado; não considerar qualquer funcionalidade identificada como concluída sem verificar sua implementação e suas integrações.
- Registrar recursos comprovados, dependências de configuração/dispositivo, divergências entre README e código, limites não implementados e defeitos de integração encontrados no ZIP.
- Evidência: leitura do app Expo, backend, dependências, SQL Supabase e auditoria técnica independente; os achados estão resumidos em `plan.md`.

## [ ] Migrar e iniciar o app móvel dentro do starter WebDev
- Integrar o código-fonte React Native/Expo/TypeScript fornecido na estrutura Expo Router gerenciada sem substituir silenciosamente o starter nem descartar sua configuração nativa, servidores, IDs de pacote, scheme ou portas declaradas.
- Manter a proposta do Conecta: aplicação de comunicação acessível voltada a pessoas neurodiversas e pessoas com deficiência, considerando necessidades visuais, auditivas, motoras e cognitivas.
- Preservar as telas e fluxos implementados do app, atualizar identidade/ativos fornecidos e oferecer estados de carregamento, vazio e falha compreensíveis.
- Alinhar dependências do app com o SDK Expo instalado; não afirmar compatibilidade nativa sem build/dispositivo apropriado.

## [ ] Autenticação, perfis e contatos integrados
- Preservar cadastro/login e gerenciamento de sessão de usuários usando o provedor Clerk já utilizado pelo projeto-fonte, armazenamento seguro no aparelho e token JWT solicitado para Supabase.
- Sincronizar o perfil autenticado com a tabela `profiles`; tratar falhas visivelmente e aguardar/confirmar a sincronização antes de habilitar busca/criação de conversas.
- Permitir buscar perfis por e-mail ou nome de usuário, adicionar contatos e iniciar uma conversa; resultados de descoberta não devem expor o e-mail do contato.
- Não incluir credenciais no código. Disponibilizar, à parte do login, uma opção que a pessoa escolhe explicitamente para abrir uma amostra anônima/local; ela não cria sessão/usuário, não acessa nem grava no Supabase e identifica os dados como fictícios/demonstrativos.

## [ ] Conversas e mensagens Supabase
- Integrar contatos, conversas diretas e mensagens ao Supabase conforme o esquema fornecido; permitir enviar mensagens e marcar mensagens recebidas como lidas para o usuário autenticado.
- Atualizar a lista e o conteúdo das conversas em tempo real usando Supabase Realtime e remover canais ao encerrar a tela/assinatura.
- Separar falha de conexão/Realtime de falha de envio; erro de inscrição em tempo real não deve, por si só, impedir envio, e deve haver meio compreensível de tentar atualizar/reconectar.
- Sem URL/chave Supabase, issuer/claims Clerk ou SQL aplicado, exibir limitações/configuração necessária em vez de alegar que o chat está sincronizado.

## [ ] Acessibilidade visual, auditiva, motora e cognitiva
- Preservar configuração de acessibilidade com escala de texto, espaçamento, alto contraste, negrito, redução de movimento, alvos de toque maiores e preferências de som/vibração; persistir ajustes localmente e nunca bloquear o uso local por falha de sincronização remota.
- Disponibilizar reconhecimento de texto em imagem por OCR e identificação de elementos por ML Kit, descrevendo com precisão que o processamento é local e sujeito a permissões, compatibilidade e build nativo.
- Preservar comandos de voz em português para navegação, síntese de voz em pt-BR via `expo-speech` e feedback háptico via `expo-haptics`, com estados de disponibilidade/permissão e alternativa visual quando esses recursos não estiverem disponíveis.
- Garantir rótulos/roles/hints acessíveis e textos legíveis; respeitar a preferência de movimento reduzido e não depender apenas da cor para transmitir estado.
- Identificar recursos não implementados como demonstrações: microfone de chat com frase predefinida, prévia de videochamada, captions/transcrição não reais e acionador IoT simulado sem Bluetooth/ESP32.

## [ ] Painel de pesquisa/IoT e dados de demonstração
- Carregar e validar dados JSON do projeto e exibir gráficos/distribuições acessíveis com indicação da origem, período e natureza dos dados.
- Quando não houver API realmente integrada/configurada, manter o painel local utilizável e identificar os valores como ilustrativos; não oferecer gravação/importação remota que aponte para endpoints inexistentes.
- Manter clara a distinção entre uma simulação do acionador acessível e um dispositivo IoT físico; não alegar conexão Bluetooth/ESP32.

## [ ] SQL Supabase e segurança RLS
- Entregar o SQL de perfis, contatos, conversas diretas, mensagens, recibos de leitura e funções necessárias, com políticas RLS, grants e publicação Realtime coerentes com a identidade `auth.jwt()->>'sub'` do JWT Clerk.
- Acrescentar política/tabela de preferências de acessibilidade por usuário somente se implementada com isolamento RLS e compatível com o fluxo do app.
- Não executar gravações ou exclusões de teste contra um banco Supabase compartilhado sem autorização; documentar como aplicar o SQL e quais claims/issuer/JWT template são necessários.

## [ ] Documentação, compatibilidade e entrega
- Atualizar README e configuração para descrever o fluxo real, as variáveis necessárias, execução, aplicação do SQL, serviços realmente implementados e limitações; retirar ou corrigir promessas/endpoints sem handler.
- Preservar secrets fora do app bundle/repositório e não afirmar login, Supabase, Realtime, OCR/ML Kit, comandos de voz, leitores de tela ou háptica validados quando credenciais/build/dispositivo estiverem ausentes.
- Resolver erros de diagnóstico acionáveis nos arquivos alterados; confirmar que configuração Expo, dependências/lockfile e servidores esperados podem iniciar e indicar precisamente quaisquer validações nativas impossíveis no sandbox.
- Atualizar os ativos de marca e cadastrar `logoUrl` literal HTTPS em `app.config.ts` antes do checkpoint, mantendo a configuração de identidade já gerada pelo WebDev.
