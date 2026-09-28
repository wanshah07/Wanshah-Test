-- Slidecraft on Supabase · 003 · file storage
--
-- Three private buckets, every object under the owner's own folder (<user id>/…):
--   sc-inbox    files the page hands to a job (an uploaded PDF, a template deck). The page writes here.
--   sc-media    pictures kept with a deck. Only the worker writes; the page reads its own.
--   sc-exports  PowerPoint and HTML files the worker built. Only the worker writes; the page reads its own.
-- None is public, and there is no listing policy beyond the owner's folder.
-- 50 MB per file is the Free plan's ceiling.

insert into storage.buckets (id, name, public, file_size_limit)
values ('sc-inbox', 'sc-inbox', false, 52428800),
       ('sc-media', 'sc-media', false, 52428800),
       ('sc-exports', 'sc-exports', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "sc: read own files" on storage.objects;
create policy "sc: read own files" on storage.objects for select
  to authenticated
  using (bucket_id in ('sc-inbox', 'sc-media', 'sc-exports')
         and (storage.foldername(name))[1] = auth.uid()::text
         and public.sc_is_member());

drop policy if exists "sc: upload to own inbox" on storage.objects;
create policy "sc: upload to own inbox" on storage.objects for insert
  to authenticated
  with check (bucket_id = 'sc-inbox'
              and (storage.foldername(name))[1] = auth.uid()::text
              and public.sc_is_member());

drop policy if exists "sc: remove own files" on storage.objects;
create policy "sc: remove own files" on storage.objects for delete
  to authenticated
  using (bucket_id in ('sc-inbox', 'sc-media', 'sc-exports')
         and (storage.foldername(name))[1] = auth.uid()::text
         and public.sc_is_member());
