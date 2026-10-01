-- Slidecraft: tighter rules found in a review on 1 Oct 2026. Safe to run twice.
-- Run after 001 to 005.

-- A picture row may only point at a file in its owner's own folder, under a plain id. The worker reads
-- sc-media with the service key; a row naming another person's object_path would otherwise hand that
-- person's picture to whoever wrote the row.
drop policy if exists "own: add" on public.sc_media;
create policy "own: add" on public.sc_media for insert to authenticated
  with check (user_id = auth.uid() and public.sc_is_member()
              and id ~ '^[A-Za-z0-9_-]{1,80}$'
              and (storage.foldername(object_path))[1] = auth.uid()::text
              and object_path !~ '(^|/)\.\.?(/|$)');
drop policy if exists "own: change" on public.sc_media;
create policy "own: change" on public.sc_media for update to authenticated
  using (user_id = auth.uid() and public.sc_is_member())
  with check (user_id = auth.uid()
              and id ~ '^[A-Za-z0-9_-]{1,80}$'
              and (storage.foldername(object_path))[1] = auth.uid()::text
              and object_path !~ '(^|/)\.\.?(/|$)');

-- Clearing finished jobs is for members, like everything else.
drop policy if exists "jobs: clear finished" on public.sc_jobs;
create policy "jobs: clear finished" on public.sc_jobs for delete
  to authenticated using (user_id = auth.uid() and status in ('done', 'error') and public.sc_is_member());
