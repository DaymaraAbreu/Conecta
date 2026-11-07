-- Execute no SQL Editor do Supabase depois de supabase/chat-schema.sql.
-- Persiste descrições visuais sem conceder UPDATE amplo na tabela messages.

create or replace function public.set_message_media_description(
  target_message_id uuid,
  description_text text
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
  if description_text is null or length(btrim(description_text)) = 0 or length(description_text) > 4000 then
    raise exception 'Descrição inválida';
  end if;

  update public.messages
  set media_description = btrim(description_text), updated_at = now()
  where id = target_message_id
    and media_type = 'image'
    and (sender_id = current_user_id or receiver_id = current_user_id);

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'Mensagem de imagem não encontrada ou sem permissão';
  end if;
  return true;
end;
$$;

revoke all on function public.set_message_media_description(uuid, text) from public, anon;
grant execute on function public.set_message_media_description(uuid, text) to authenticated;

comment on function public.set_message_media_description(uuid, text) is
  'Atualiza somente a descrição de uma mensagem de imagem para um participante autenticado da conversa.';
