-- Slidecraft on Supabase · 001 · tables
--
-- Replaces the SQLite file and data/ folder of the server build. Every table is
-- prefixed sc_ so this file can also run in a project another app already uses.
-- Ids stay text in the server's own format (d_…, s_…, m_…) so the existing code
-- keeps working unchanged inside the worker. Run 001 to 004 in order in the SQL
-- editor; each file can be run again safely.
--
-- No column here holds a key. The OpenAI and Composio keys are GitHub Actions
-- secrets, read only by the worker.

create extension if not exists pgcrypto;

-- Who may use Slidecraft. Signing in is not enough: a person must be listed here.
-- Add someone after they have signed in once:
--   insert into public.sc_members (user_id, role, note)
--   select id, 'member', email from auth.users where email = 'teammate@example.com';
create table if not exists public.sc_members (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  role     text not null default 'member' check (role in ('owner', 'member')),
  note     text,
  added_at timestamptz not null default now()
);

create or replace function public.sc_is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sc_members where user_id = auth.uid())
$$;

create or replace function public.sc_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- One row per person: choices only, never a key.
create table if not exists public.sc_settings (
  user_id           uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  model             text,
  image_model       text,
  app_theme         text,
  default_theme     text,
  onedrive_folder   text,
  cz_account        text,
  cz_account_label  text,
  cz_user           text,
  gd_account        text,
  gd_account_label  text,
  gd_user           text,
  house_prompt      text,
  vision_ok         text,
  vision_for        text,
  updated_at        timestamptz not null default now()
);

create table if not exists public.sc_decks (
  id         text primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text not null,
  doc        jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sc_decks_user on public.sc_decks (user_id, updated_at desc);

create table if not exists public.sc_sources (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id     text references public.sc_decks (id) on delete cascade,
  name        text not null,
  rel_path    text,
  kind        text not null,
  bytes       integer not null,
  chars       integer not null,
  text        text not null,
  media_id    text,
  remote_id   text,
  remote_etag text,
  created_at  timestamptz not null default now()
);
create index if not exists sc_sources_deck on public.sc_sources (deck_id, created_at);

-- The picture itself is in the private sc-media bucket at object_path.
create table if not exists public.sc_media (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id     text,
  name        text not null,
  mime        text not null,
  bytes       integer not null,
  width       integer,
  height      integer,
  origin      text not null,
  object_path text not null,
  created_at  timestamptz not null default now()
);
create index if not exists sc_media_deck on public.sc_media (user_id, deck_id);

create table if not exists public.sc_designs (
  id               text primary key,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null,
  theme            jsonb not null,
  notes            text not null default '',
  analysis         jsonb not null default '{}'::jsonb,
  preview_media_id text,
  source_name      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists sc_designs_user on public.sc_designs (user_id, updated_at desc);

create table if not exists public.sc_prompts (
  id         text primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null,
  text       text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sc_prompts_user on public.sc_prompts (user_id, name);

-- Work the browser cannot do: writing a deck, reading a file, calling Composio,
-- building a PowerPoint. The page inserts a pending row; the worker in GitHub
-- Actions runs it and writes progress, then the result or the error.
-- request: {"method": "POST", "path": "/api/decks/d_x/generate", "body": {...},
--           "files": [{"field": "file", "name": "a.pdf", "path": "<uid>/<job>/a.pdf"}]}
create table if not exists public.sc_jobs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id    text,
  kind       text not null,
  status     text not null default 'pending' check (status in ('pending', 'running', 'done', 'error')),
  request    jsonb not null default '{}'::jsonb,
  progress   jsonb not null default '{}'::jsonb,
  result     jsonb,
  error      text,
  attempts   integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists sc_jobs_queue on public.sc_jobs (status, created_at);
create index if not exists sc_jobs_user on public.sc_jobs (user_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['sc_settings', 'sc_decks', 'sc_designs', 'sc_prompts', 'sc_jobs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.sc_touch()', t || '_touch', t);
  end loop;
end $$;

-- Live updates in the page: a job's progress, and a deck the worker has just written.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['sc_jobs', 'sc_decks'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
