-- Slidecraft on Supabase · 002 · row level security
--
-- The page uses the public anon key, so these policies are the only thing
-- between a stranger and a client's deck. Every row belongs to one person and
-- only that person, while listed in sc_members, can see or change it. The
-- worker uses the service_role key, which bypasses RLS by design.

alter table public.sc_members  enable row level security;
alter table public.sc_settings enable row level security;
alter table public.sc_decks    enable row level security;
alter table public.sc_sources  enable row level security;
alter table public.sc_media    enable row level security;
alter table public.sc_designs  enable row level security;
alter table public.sc_prompts  enable row level security;
alter table public.sc_jobs     enable row level security;

-- A person can see their own membership (the page uses it to say "not added yet").
-- Nobody adds members from the page: the owner does it in the SQL editor.
drop policy if exists "members: read own" on public.sc_members;
create policy "members: read own" on public.sc_members for select
  to authenticated using (user_id = auth.uid());

-- Own rows only, for members only: read, add, change, remove.
do $$
declare t text;
begin
  foreach t in array array['sc_settings', 'sc_decks', 'sc_sources', 'sc_media', 'sc_designs', 'sc_prompts'] loop
    execute format('drop policy if exists "own: read" on public.%I', t);
    execute format('create policy "own: read" on public.%I for select to authenticated using (user_id = auth.uid() and public.sc_is_member())', t);
    execute format('drop policy if exists "own: add" on public.%I', t);
    execute format('create policy "own: add" on public.%I for insert to authenticated with check (user_id = auth.uid() and public.sc_is_member())', t);
    execute format('drop policy if exists "own: change" on public.%I', t);
    execute format('create policy "own: change" on public.%I for update to authenticated using (user_id = auth.uid() and public.sc_is_member()) with check (user_id = auth.uid())', t);
    execute format('drop policy if exists "own: remove" on public.%I', t);
    execute format('create policy "own: remove" on public.%I for delete to authenticated using (user_id = auth.uid() and public.sc_is_member())', t);
  end loop;
end $$;

-- A source may only hang off the person's own deck.
drop policy if exists "own: add" on public.sc_sources;
create policy "own: add" on public.sc_sources for insert to authenticated
  with check (user_id = auth.uid() and public.sc_is_member()
              and (deck_id is null or exists (select 1 from public.sc_decks d where d.id = deck_id and d.user_id = auth.uid())));
-- Nor be moved onto someone else's deck later: the worker reads a deck's sources by deck id.
drop policy if exists "own: change" on public.sc_sources;
create policy "own: change" on public.sc_sources for update to authenticated
  using (user_id = auth.uid() and public.sc_is_member())
  with check (user_id = auth.uid()
              and (deck_id is null or exists (select 1 from public.sc_decks d where d.id = deck_id and d.user_id = auth.uid())));

-- Jobs: a member queues their own and watches them. Only the worker moves a job
-- on, so there is no update policy; a person may clear their finished jobs.
drop policy if exists "jobs: read own" on public.sc_jobs;
create policy "jobs: read own" on public.sc_jobs for select
  to authenticated using (user_id = auth.uid() and public.sc_is_member());
drop policy if exists "jobs: queue own" on public.sc_jobs;
create policy "jobs: queue own" on public.sc_jobs for insert
  to authenticated with check (user_id = auth.uid() and status = 'pending' and attempts = 0
                                and result is null and error is null and public.sc_is_member());
drop policy if exists "jobs: clear finished" on public.sc_jobs;
create policy "jobs: clear finished" on public.sc_jobs for delete
  to authenticated using (user_id = auth.uid() and status in ('done', 'error'));
