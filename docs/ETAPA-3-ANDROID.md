# ETAPA 3 — Android: acessibilidade, OCR e execução

## O que está implementado

- Preferências de acessibilidade persistem localmente pelo contexto do app. Quando há conta Clerk, configuração Supabase e acesso permitido pela política RLS, a tela também tenta carregar/sincronizar `accessibility_preferences`; falhas remotas mantêm os ajustes locais. A sincronização não é garantida sem backend e configuração válidos.
- O tamanho do texto e o espaçamento podem ser ajustados na tela **Acessibilidade**. Há opções de contraste, negrito, alvos maiores e redução de movimento. O app não altera as opções globais de acessibilidade do Android.
- Comandos e ditado usam `expo-speech-recognition`, solicitam permissão em tempo de execução e configuram `lang: 'pt-BR'`. A disponibilidade depende do sistema/serviço de reconhecimento instalado, suporte de plataforma e permissões. O ditado apenas preenche texto para revisão; não envia mensagens automaticamente.
- `expo-speech` lê conteúdo em pt-BR. Leitores de tela, TalkBack e VoiceOver são funcionalidades do sistema operacional.
- A seleção de imagem usa `expo-image-picker`. `expo-ocr-kit` realiza OCR e `@react-native-ml-kit/image-labeling` sugere rótulos visuais quando a opção de descrição de imagens está habilitada. O código executa essas análises nativamente e não envia a imagem para esse processamento. Rótulos são sugestões, não descrições garantidas. A descrição manual permanece disponível.

## Expo Go, Web e development build

**Expo Go:** não é um substituto para validar módulos nativos que não estejam incluídos na versão do Expo Go. OCR (`expo-ocr-kit`) e ML Kit de rótulos requerem um binário nativo que contenha esses módulos; não considere a disponibilidade no Expo Go garantida. O reconhecimento de fala e permissões também variam com a plataforma e serviços instalados. Uma tela abrir no Expo Go não comprova que esses recursos funcionarão.

**Web/Preview Web:** o seletor de imagem pode abrir conforme o navegador, mas a própria tela informa que o OCR requer build nativo. Não usar Preview Web como teste de OCR, ML Kit, permissões Android/iOS, TalkBack ou hardware.

**Development build:** para testar os módulos integrados, gere/instale um development build Android pelo fluxo Mobile/Dashboard do projeto (ou EAS conforme a configuração existente), com os plugins nativos processados. Depois de alterar plugins/configuração nativa, é necessário gerar um novo binário; reiniciar apenas Metro não atualiza o aplicativo nativo instalado. Inicie Metro no modo de desenvolvimento para conectar o app instalado e conceda as permissões quando solicitadas. O comando `pnpm dev` deste repositório inicia Metro para Web junto do servidor, não equivale por si só a criar um development build Android.

Não foi gerado build nesta etapa. As instruções não afirmam teste em aparelho real, validação de permissões, qualidade de OCR, funcionamento de TalkBack ou reconhecimento de fala no Android.

## Configuração nativa revisada

`app.config.ts` já declara os plugins `expo-image-picker`, `expo-speech-recognition`, `expo-ocr-kit` e `expo-build-properties`, além de descrições de uso de fotos e microfone/reconhecimento no iOS. O Android declara `RECORD_AUDIO`. Os módulos e permissões nativos dependem de prebuild/build; não se deve inferir suporte Android apenas da presença do plugin. A configuração contém ainda permissões Bluetooth/Localização usadas por outros recursos do app; não foram alteradas nesta revisão.

## Checagens recomendadas no dispositivo (pendentes)

1. Instalar development build em Android compatível e verificar concessão/recusa de microfone e fotos.
2. Testar TalkBack na tela, foco/ordem, nomes de botões, estados selecionados, alvos e escala do texto do sistema.
3. Testar OCR em imagens variadas, incluindo imagem sem texto, imagem ilegível e texto pt-BR; confirmar que o resultado pode ser revisado e que a descrição manual funciona.
4. Testar reconhecimento com idioma/serviço pt-BR disponível e indisponível, erros de permissão e cancelamento; confirmar que nenhum ditado envia mensagem automaticamente.
5. Verificar persistência após reinício e comportamento sem rede/configuração Supabase, bem como sincronização com RLS válida.

## Revisão estática desta etapa

O código foi lido sem alterar `app/_layout.tsx` nem `app/conversation/[id].tsx`. Não houve instalação de dependências, prebuild, build, nem teste em dispositivo. Execute `pnpm check` e `pnpm lint` no ambiente de desenvolvimento quando disponíveis; resultados estáticos não substituem a matriz manual acima.
