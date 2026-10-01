-- Slidecraft: Studio outputs (reports, flashcards, quizzes, mind maps, data
-- tables, infographics and saved notes), one row each, hanging off a notebook
-- (sc_decks). Safe to run twice. Run after 001 to 004.

create table if not exists public.sc_outputs (
  id           text primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id      text not null references public.sc_decks (id) on delete cascade,
  kind         text not null check (kind in ('report', 'flashcards', 'quiz', 'mindmap', 'table', 'infographic', 'note')),
  title        text not null,
  data         jsonb not null default '{}'::jsonb,
  model        text,
  source_count integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists sc_outputs_deck on public.sc_outputs (deck_id, created_at desc);

drop trigger if exists sc_outputs_touch on public.sc_outputs;
create trigger sc_outputs_touch before update on public.sc_outputs for each row execute function public.sc_touch();

alter table public.sc_outputs enable row level security;

-- Own rows only, for members only, and only on the person's own notebook.
drop policy if exists "own: read" on public.sc_outputs;
create policy "own: read" on public.sc_outputs for select to authenticated
  using (user_id = auth.uid() and public.sc_is_member());
drop policy if exists "own: add" on public.sc_outputs;
create policy "own: add" on public.sc_outputs for insert to authenticated
  with check (user_id = auth.uid() and public.sc_is_member()
              and exists (select 1 from public.sc_decks d where d.id = deck_id and d.user_id = auth.uid()));
drop policy if exists "own: change" on public.sc_outputs;
create policy "own: change" on public.sc_outputs for update to authenticated
  using (user_id = auth.uid() and public.sc_is_member())
  with check (user_id = auth.uid()
              and exists (select 1 from public.sc_decks d where d.id = deck_id and d.user_id = auth.uid()));
drop policy if exists "own: remove" on public.sc_outputs;
create policy "own: remove" on public.sc_outputs for delete to authenticated
  using (user_id = auth.uid() and public.sc_is_member());
