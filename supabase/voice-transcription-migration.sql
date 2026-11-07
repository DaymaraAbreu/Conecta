-- Execute no SQL Editor do Supabase depois de supabase/chat-schema.sql.
-- Persiste transcrições sem conceder permissões de UPDATE amplas na tabela messages.

create or replace function public.set_message_audio_transcript(
  target_message_id uuid,
  transcript_text text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  current_user_id text := auth.jwt() ->> 'sub';
  updated_count integer;
begin
  if current_user_id is null or current_user_id = '' then
    raise exception 'Autenticação obrigatória';
  end if;
  if transcript_text is null or length(btrim(transcript_text)) = 0 or length(transcript_text) > 16000 then
    raise exception 'Transcrição inválida';
  end if;

  update public.messages
  set audio_transcript = btrim(transcript_text), updated_at = now()
  where id = target_message_id
    and media_type = 'audio'
    and (sender_id = current_user_id or receiver_id = current_user_id);

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'Mensagem de áudio não encontrada ou sem permissão';
  end if;
  return true;
end;
$$;

revoke all on function public.set_message_audio_transcript(uuid, text) from public, anon;
grant execute on function public.set_message_audio_transcript(uuid, text) to authenticated;

comment on function public.set_message_audio_transcript(uuid, text) is
  'Atualiza somente a transcrição de uma mensagem de áudio para um participante autenticado da conversa.';
