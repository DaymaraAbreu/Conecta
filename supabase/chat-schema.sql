create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id text primary key,
  name text not null,
  email text,
  username text,
  about text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists username text;

create unique index if not exists profiles_username_lower_unique_idx
  on public.profiles (lower(username))
  where username is not null and username <> '';

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  participant_one_id text not null,
  participant_two_id text not null,
  last_message text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint conversations_distinct_participants check (participant_one_id < participant_two_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid,
  sender_id text not null references public.profiles (id) on delete cascade,
  receiver_id text not null references public.profiles (id) on delete cascade,
  text text not null default '',
  media_url text,
  media_type text check (media_type in ('image', 'audio', 'figure', 'gif', 'video')),
  media_description text,
  audio_transcript text,
  audio_duration_ms integer check (audio_duration_ms is null or audio_duration_ms >= 0),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint messages_not_self check (sender_id <> receiver_id)
);

create table if not exists public.contacts (
  user_id text not null references public.profiles (id) on delete cascade,
  contact_id text not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, contact_id),
  constraint contacts_not_self check (user_id <> contact_id)
);

create table if not exists public.accessibility_preferences (
  user_id text primary key references public.profiles (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.research_aggregate_snapshots (
  id uuid primary key default gen_random_uuid(),
  survey_id text not null,
  period text not null,
  source text not null,
  participant_count integer not null check (participant_count >= 0),
  response_count integer not null check (response_count >= 0),
  participants jsonb not null default '[]'::jsonb,
  barriers jsonb not null default '[]'::jsonb,
  additional_charts jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint research_participants_array check (jsonb_typeof(participants) = 'array'),
  constraint research_barriers_array check (jsonb_typeof(barriers) = 'array'),
  constraint research_additional_charts_array check (jsonb_typeof(additional_charts) = 'array')
);

alter table public.research_aggregate_snapshots
  add column if not exists additional_charts jsonb not null default '[]'::jsonb;

create index if not exists research_aggregate_latest_idx
  on public.research_aggregate_snapshots (updated_at desc);

alter table public.messages
  add column if not exists conversation_id uuid,
  add column if not exists read_at timestamptz,
  add column if not exists media_url text,
  add column if not exists media_type text,
  add column if not exists media_description text,
  add column if not exists audio_transcript text,
  add column if not exists audio_duration_ms integer;

alter table public.profiles add column if not exists about text;

create unique index if not exists conversations_direct_pair_unique_idx
  on public.conversations (participant_one_id, participant_two_id);

insert into public.conversations (participant_one_id, participant_two_id)
select distinct least(sender_id, receiver_id), greatest(sender_id, receiver_id)
from public.messages
where sender_id <> receiver_id
on conflict (participant_one_id, participant_two_id) do nothing;

update public.messages as message
set conversation_id = conversation.id
from public.conversations as conversation
where message.conversation_id is null
  and conversation.participant_one_id = least(message.sender_id, message.receiver_id)
  and conversation.participant_two_id = greatest(message.sender_id, message.receiver_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_conversation_fk'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_conversation_fk
      foreign key (conversation_id) references public.conversations (id) on delete cascade;
  end if;

  if not exists (select 1 from public.messages where conversation_id is null) then
    alter table public.messages alter column conversation_id set not null;
  end if;
end;
$$;

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

create index if not exists messages_unread_by_receiver_idx
  on public.messages (receiver_id, conversation_id)
  where read_at is null;

update public.conversations as conversation
set last_message = latest.text,
    last_message_at = latest.created_at
from (
  select distinct on (conversation_id)
    conversation_id, text, created_at
  from public.messages
  where conversation_id is not null
  order by conversation_id, created_at desc, id desc
) as latest
where conversation.id = latest.conversation_id;

create or replace function public.update_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.conversations
  set last_message = new.text,
      last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

-- A função é invocada pelo trigger; não deve ser chamável como RPC pelo cliente.
revoke all on function public.update_conversation_last_message() from public, anon, authenticated;

drop trigger if exists messages_update_conversation_last_message on public.messages;
create trigger messages_update_conversation_last_message
after insert on public.messages
for each row
execute function public.update_conversation_last_message();

create or replace function public.get_or_create_direct_conversation(other_user_id text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  current_user_id text := auth.jwt() ->> 'sub';
  conversation_id uuid;
begin
  if current_user_id is null or current_user_id = '' then
    raise exception 'Autenticação obrigatória';
  end if;
  if other_user_id is null or other_user_id = '' or other_user_id = current_user_id then
    raise exception 'Destinatário inválido';
  end if;
  if not exists (select 1 from public.profiles where id = other_user_id) then
    raise exception 'Perfil do destinatário não encontrado';
  end if;

  insert into public.conversations (participant_one_id, participant_two_id)
  values (least(current_user_id, other_user_id), greatest(current_user_id, other_user_id))
  on conflict (participant_one_id, participant_two_id) do nothing;

  select id into conversation_id
  from public.conversations
  where participant_one_id = least(current_user_id, other_user_id)
    and participant_two_id = greatest(current_user_id, other_user_id);

  return conversation_id;
end;
$$;

create or replace function public.search_profiles(search_term text)
returns table (id text, name text, username text)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  current_user_id text := auth.jwt() ->> 'sub';
  normalized_search text := lower(btrim(coalesce(search_term, '')));
  normalized_username text := ltrim(lower(btrim(coalesce(search_term, ''))), '@');
begin
  if current_user_id is null or current_user_id = '' then
    raise exception 'Autenticação obrigatória';
  end if;
  if normalized_search = '' or length(normalized_search) > 254 then
    return;
  end if;

  return query
  select profile.id, profile.name, profile.username
  from public.profiles as profile
  where profile.id <> current_user_id
    and (
      lower(coalesce(profile.email, '')) = normalized_search
      or (
        normalized_username <> ''
        and lower(coalesce(profile.username, '')) = normalized_username
      )
    )
  order by lower(profile.name)
  limit 10;
end;
$$;

create or replace function public.list_contacts()
returns table (id text, name text, username text)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  current_user_id text := auth.jwt() ->> 'sub';
begin
  if current_user_id is null or current_user_id = '' then
    raise exception 'Autenticação obrigatória';
  end if;

  return query
  select profile.id, profile.name, profile.username
  from public.contacts as contact
  join public.profiles as profile on profile.id = contact.contact_id
  where contact.user_id = current_user_id
  order by lower(profile.name);
end;
$$;

create or replace function public.add_contact(other_user_id text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  current_user_id text := auth.jwt() ->> 'sub';
begin
  if current_user_id is null or current_user_id = '' then
    raise exception 'Autenticação obrigatória';
  end if;
  if other_user_id is null or other_user_id = '' or other_user_id = current_user_id then
    raise exception 'Contato inválido';
  end if;
  if not exists (select 1 from public.profiles where id = other_user_id) then
    raise exception 'Perfil do contato não encontrado';
  end if;

  insert into public.contacts (user_id, contact_id)
  values (current_user_id, other_user_id)
  on conflict (user_id, contact_id) do nothing;

  return true;
end;
$$;

create or replace function public.mark_conversation_read(target_conversation_id uuid)
returns integer
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

  update public.messages
  set read_at = now()
  where conversation_id = target_conversation_id
    and receiver_id = current_user_id
    and read_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.contacts enable row level security;
alter table public.accessibility_preferences enable row level security;
alter table public.research_aggregate_snapshots enable row level security;

insert into storage.buckets (id, name, public)
values ('chat-media', 'chat-media', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists chat_media_insert_own_folder on storage.objects;
create policy chat_media_insert_own_folder
on storage.objects for insert to authenticated
with check (bucket_id = 'chat-media' and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub'));

drop policy if exists chat_media_read_participant_folder on storage.objects;
create policy chat_media_read_participant_folder
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-media'
  and (
    (storage.foldername(name))[1] = (auth.jwt() ->> 'sub')
    or exists (
      select 1
      from public.messages as message
      where message.media_url = name
        and ((auth.jwt() ->> 'sub') = message.sender_id or (auth.jwt() ->> 'sub') = message.receiver_id)
    )
  )
);

drop policy if exists chat_media_delete_own_folder on storage.objects;
create policy chat_media_delete_own_folder
on storage.objects for delete to authenticated
using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = (auth.jwt() ->> 'sub'));

drop policy if exists research_aggregate_admin_read on public.research_aggregate_snapshots;
create policy research_aggregate_admin_read
on public.research_aggregate_snapshots for select to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists profiles_read_all_users on public.profiles;
drop policy if exists profiles_update_own_profile on public.profiles;
drop policy if exists profiles_insert_own_profile on public.profiles;
drop policy if exists profiles_read_authenticated on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_read_authenticated
on public.profiles for select
using (coalesce(auth.jwt() ->> 'sub', '') <> '');

create policy profiles_insert_own
on public.profiles for insert
with check ((auth.jwt() ->> 'sub') = id);

create policy profiles_update_own
on public.profiles for update
using ((auth.jwt() ->> 'sub') = id)
with check ((auth.jwt() ->> 'sub') = id);

drop policy if exists contacts_read_own on public.contacts;
create policy contacts_read_own
on public.contacts for select
using ((auth.jwt() ->> 'sub') = user_id);

drop policy if exists accessibility_preferences_read_own on public.accessibility_preferences;
create policy accessibility_preferences_read_own
on public.accessibility_preferences for select
using ((auth.jwt() ->> 'sub') = user_id);

drop policy if exists accessibility_preferences_insert_own on public.accessibility_preferences;
create policy accessibility_preferences_insert_own
on public.accessibility_preferences for insert
with check ((auth.jwt() ->> 'sub') = user_id);

drop policy if exists accessibility_preferences_update_own on public.accessibility_preferences;
create policy accessibility_preferences_update_own
on public.accessibility_preferences for update
using ((auth.jwt() ->> 'sub') = user_id)
with check ((auth.jwt() ->> 'sub') = user_id);

drop policy if exists contacts_add_own on public.contacts;
create policy contacts_add_own
on public.contacts for insert
with check (
  (auth.jwt() ->> 'sub') = user_id
  and user_id <> contact_id
);

drop policy if exists conversations_read_participants on public.conversations;
create policy conversations_read_participants
on public.conversations for select
using (
  (auth.jwt() ->> 'sub') = participant_one_id
  or (auth.jwt() ->> 'sub') = participant_two_id
);

drop policy if exists messages_select_participants on public.messages;
drop policy if exists messages_insert_own_messages on public.messages;
drop policy if exists messages_update_own_messages on public.messages;
drop policy if exists messages_delete_own_messages on public.messages;
drop policy if exists messages_read_participant on public.messages;
drop policy if exists messages_send_as_participant on public.messages;
drop policy if exists messages_mark_received_read on public.messages;

create policy messages_read_participant
on public.messages for select
using (
  (auth.jwt() ->> 'sub') = sender_id
  or (auth.jwt() ->> 'sub') = receiver_id
);

create policy messages_send_as_participant
on public.messages for insert
with check (
  (auth.jwt() ->> 'sub') = sender_id
  and exists (
    select 1
    from public.conversations as conversation
    where conversation.id = conversation_id
      and (
        (conversation.participant_one_id = sender_id and conversation.participant_two_id = receiver_id)
        or (conversation.participant_two_id = sender_id and conversation.participant_one_id = receiver_id)
      )
  )
);

create policy messages_mark_received_read
on public.messages for update
using ((auth.jwt() ->> 'sub') = receiver_id)
with check ((auth.jwt() ->> 'sub') = receiver_id);

revoke all on public.profiles, public.contacts, public.conversations, public.messages,
  public.accessibility_preferences from anon, authenticated;
grant select (id, name, about, avatar_url) on public.profiles to authenticated;
grant insert (id, name, email, username, about, avatar_url) on public.profiles to authenticated;
grant update (id, name, email, username, about, avatar_url) on public.profiles to authenticated;
grant select on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
grant select, insert, update on public.accessibility_preferences to authenticated;
revoke all on public.research_aggregate_snapshots from anon, authenticated;
grant select on public.research_aggregate_snapshots to authenticated;

revoke all on function public.get_or_create_direct_conversation(text) from public, anon;
revoke all on function public.search_profiles(text) from public, anon;
revoke all on function public.list_contacts() from public, anon;
revoke all on function public.add_contact(text) from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.get_or_create_direct_conversation(text) to authenticated;
grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.list_contacts() to authenticated;
grant execute on function public.add_contact(text) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
      alter publication supabase_realtime add table public.messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
    ) then
      alter publication supabase_realtime add table public.conversations;
    end if;
  end if;
end;
$$;

comment on table public.conversations is 'Conversas diretas; pares de participantes são únicos e cada usuário só pode ler as próprias conversas.';
comment on table public.messages is 'Mensagens de conversas diretas, com recibo de leitura individual por destinatário.';
comment on table public.accessibility_preferences is 'Preferências de acessibilidade; somente o usuário identificado no JWT pode ler ou alterar a própria linha.';
