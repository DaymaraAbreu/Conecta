# Etapa 3 — Auditoria e teste manual do Supabase

## Estado desta entrega

Este documento é um roteiro para executar em um projeto Supabase configurado com o Clerk real da aplicação. **Nenhum teste autenticado contra um projeto Supabase/Clerk real foi executado nesta etapa.** Não há IDs, tokens, usuários ou resultados de execução presumidos aqui. Use duas contas de teste autorizadas (A e B), em sessões/dispositivos isolados, e descarte os dados de teste ao concluir.

## Antes de começar

1. Aplique `supabase/chat-schema.sql` e, na ordem indicada em `supabase/SETUP.md`, as migrations de voz, descrição de mídia e gráficos. Revise o SQL no ambiente de destino antes da aplicação; não remova RLS, policies ou grants para contornar falhas.
2. Confirme que o projeto Supabase reconhece Clerk como terceiro provedor e que o issuer é exatamente o **Frontend API URL** da instância Clerk usada pelo app.
3. No Clerk, configure o template/preset `supabase`. O JWT destinado ao Supabase deve ser assinado pelo Clerk e conter `iss` esperado, `sub` como ID estável do usuário Clerk, `role: "authenticated"`, `aud: "authenticated"` e claims temporais válidos (`iat`, `exp`; `nbf` se aplicável). Não fabrique nem edite tokens manualmente. O valor de `sub` tem de ser igual a `profiles.id`. Não exponha tokens em logs, screenshots ou relatórios.
4. Se for necessário testar leitura administrativa de agregados, configure `app_metadata.role="admin"` somente por configuração confiável de servidor/administrador e confirme que consta no JWT emitido. Metadata editável pelo usuário não pode conceder administração. Sem esse claim, a leitura deve ser negada.
5. Use apenas a URL e a chave pública/anon do projeto no cliente. Nunca use `service_role` no app. Tenha mídia de teste não sensível e curta; URLs assinadas dão acesso a quem as possuir até expirarem.

## Teste com duas contas

### A. Identidade, perfil e políticas RLS

1. Entre como conta A no app e registre, sem copiar o token, o ID Clerk exibido pela sessão. Confirme no painel autorizado que `profiles.id` corresponde exatamente ao `sub` do JWT A. Repita com B e confirme que os IDs são distintos.
2. Como A, consulte o próprio perfil pelos campos que o app usa. Confirme que os dados de perfil visíveis a contas autenticadas são apenas os concedidos pelo schema. A policy permite leitura de perfis autenticados para descoberta; portanto, não interprete `profiles` como tabela privada. O grant de leitura deliberadamente não inclui `email` nem `username`.
3. Com A, crie/abra conversa direta com B pelo fluxo normal do app. A RPC `get_or_create_direct_conversation(other_user_id)` deve retornar o mesmo UUID ao ser chamada novamente para o mesmo par, sem criar duplicatas. Verifique que usuário não autenticado ou destinatário inexistente/igual ao chamador não consegue criar uma conversa válida.
4. Como A e B, confira que cada conta consegue ler a conversa compartilhada. Se houver uma terceira conta autorizada de teste, ela não deve ler essa conversa nem as mensagens; não use uma identidade fictícia para isso. Uma conta não participante não deve conseguir inserir mensagem se não for remetente autenticado e participante correspondente.
5. Verifique que cada conta só pode inserir contato em seu próprio nome e que `list_contacts()` lista os contatos da sessão atual. Confirme que preferências de acessibilidade podem ser lidas/alteradas somente pela própria conta.
6. `mark_conversation_read(target_conversation_id)` deve marcar apenas mensagens da conversa cujo `receiver_id` seja a conta chamadora; a contagem retornada deve ser o número de linhas efetivamente alteradas. A chamada não deve marcar mensagens recebidas por outra conta.

### B. RPCs de mídia

1. Envie pelo app uma mensagem de áudio real de teste e confirme que a linha tem `media_type='audio'`. Para participante autenticado, `set_message_audio_transcript(target_message_id, transcript_text)` pode atualizar somente a transcrição da mensagem de áudio participante. Uma chamada sem sessão autenticada, com UUID de mensagem não pertencente à conta, para mensagem não-áudio ou com texto vazio/acima do limite deve falhar.
2. Envie pelo app uma imagem de teste e confirme `media_type='image'`. `set_message_media_description(target_message_id, description_text)` pode atualizar apenas a descrição de imagem participante; sem sessão, mensagem de outra conversa, tipo diferente, texto vazio ou acima do limite deve falhar.
3. As RPCs de atualização de campos não devem permitir alterar remetente, destinatário, texto, caminho de mídia ou recibo de leitura. A atualização geral de `messages` não é concedida ao cliente; o cliente só tem `UPDATE(read_at)` e a função dedicada faz as atualizações de mídia com validação restrita.
4. As operações com UUIDs alheios são testes negativos; use UUIDs reais de registros controlados no ambiente de teste e não os publique no relatório.

### C. Realtime

1. No painel Supabase, em **Database → Replication**, confirme que `public.messages` e `public.conversations` estão na publicação `supabase_realtime`. O script tenta adicioná-las quando a publicação existe; a confirmação no projeto é necessária.
2. Abra duas sessões reais, A e B, com sessões Clerk separadas. Inscreva ambas no fluxo Realtime do app para a mesma conversa autorizada e envie mensagem de A. Confirme o evento esperado para A e B e a atualização do resumo/última mensagem.
3. Confirme em sessão não participante (se disponível) que não há vazamento de linhas/eventos. Realtime não substitui RLS; teste o comportamento com JWT válido de cada identidade. Observe limitações do painel/configuração do provedor e não use SQL Editor (que normalmente não representa o JWT do cliente) como prova de isolamento por usuário.

### D. Storage

1. Confirme que o bucket `chat-media` está privado. Como A, faça upload pelo fluxo do app para um objeto em `sub-A/conversation-id/nome-gerado`, respeitando limites do app. O primeiro segmento deve ser o `sub` de A.
2. Como A, confirme leitura do próprio objeto. Como B, confirme leitura apenas quando a linha de mensagem real referencia aquele caminho e B é remetente ou destinatário da mensagem. Uma conta que não participa não deve ler o objeto. Não tente contornar por bucket público.
3. Teste upload em pasta cujo primeiro segmento não é o `sub` da sessão: deve ser negado. Teste remoção por B de objeto de A: deve ser negada; a policy de remoção permite somente pasta própria.
4. Gere URL assinada pelo fluxo autorizado, confirme que expira conforme a duração configurada e não a registre nem compartilhe. Uma URL assinada é bearer; a possibilidade de uso enquanto válida não significa que o bucket seja público.

### E. Agregados administrativos

Como JWT normal sem claim administrativo, `research_aggregate_snapshots` não deve ser legível. Em ambiente autorizado, teste separadamente um JWT emitido por configuração confiável com `app_metadata.role="admin"`; só esse deve ler agregados. Não introduza respostas individuais nem use metadata controlada pelo usuário para simular admin.

## Conferência SQL administrativa (painel autorizado)

Estas consultas são inspeção de configuração, não testes autenticados de RLS. Execute com acesso administrativo, não com `service_role` no cliente; o SQL Editor pode contornar RLS e não prova isolamento entre contas.

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'contacts', 'conversations', 'messages',
                    'accessibility_preferences', 'research_aggregate_snapshots')
order by tablename;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
  and (tablename in ('profiles', 'contacts', 'conversations', 'messages',
                     'accessibility_preferences', 'research_aggregate_snapshots', 'objects'))
order by schemaname, tablename, policyname;

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('messages', 'conversations')
order by tablename;

select id, name, public
from storage.buckets
where id = 'chat-media';
```

Esperado na inspeção: RLS habilitado nas seis tabelas públicas listadas, policies presentes conforme schema, ambas as tabelas esperadas na publicação e bucket `chat-media` com `public=false`. A consulta administrativa não substitui os testes pelos clientes A e B.

## Registro dos resultados

Preencha somente após executar no projeto real: data/ambiente; versões/aplicação das migrations; resultado por seção (passou/falhou/não executado); erro exato sanitizado; configuração que precisa de ajuste; responsável pelo ambiente. Nunca inclua JWT, chaves, URL assinada, emails, conteúdo de mensagens ou mídia. Não classifique como “passou” sem observação efetiva.

## Pendências externas / limites

- Criar/configurar projeto Supabase e provedor Clerk, selecionar issuer correto e emitir template JWT válido: depende de acesso administrativo aos respectivos painéis.
- Executar migrations e conferir grants/publication/bucket no projeto de destino: não realizado por este roteiro/documento.
- Testar com duas contas Clerk reais, eventos Realtime e uploads/URLs assinadas: depende de contas e ambiente autorizados; não realizado aqui.
- Confirmar que `app_metadata.role` é emitido de forma confiável e reconhecido pela policy: depende da configuração Clerk/Supabase do ambiente.
- Disponibilidade/semântica de Replication e políticas Storage podem variar conforme estado/configuração do projeto; conferir no painel e nos clientes reais.
- Integração de backend de transcrição, variáveis e modelo Gemini são externas ao banco; testar separadamente, sem expor segredo.
