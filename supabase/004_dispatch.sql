-- Slidecraft on Supabase · 004 · wake the worker
--
-- A new pending job fires a GitHub repository_dispatch, so the worker starts
-- within seconds instead of waiting for its 15-minute poll (the poll stays as
-- the safety net: a lost webhook costs minutes, not the job).
--
-- The GitHub token lives in Supabase Vault, never in this file and never in the
-- browser. Create it once: a fine-grained personal access token for this
-- repository only, with "Contents: Read and write" (what repository_dispatch needs):
--
--   select vault.create_secret('github_pat_…', 'slidecraft_dispatch_token', 'fires repository_dispatch on the Slidecraft repo');
--   select vault.create_secret('wanshah07/Wanshah-Test', 'slidecraft_dispatch_repo', 'owner/repo');
--
-- Needs the pg_net extension (Database, Extensions, pg_net).

create extension if not exists pg_net;

create or replace function public.sc_notify_job() returns trigger
language plpgsql security definer set search_path = public, vault, net as $$
declare
  v_token text;
  v_repo  text;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'slidecraft_dispatch_token';
  select decrypted_secret into v_repo  from vault.decrypted_secrets where name = 'slidecraft_dispatch_repo';
  if v_token is null or v_repo is null then
    raise warning 'slidecraft: slidecraft_dispatch_token / slidecraft_dispatch_repo missing from vault; relying on the 15-minute poll';
    return new;
  end if;
  -- Only the job id travels: the worker reads the job itself with its own key.
  perform net.http_post(
    url     := 'https://api.github.com/repos/' || v_repo || '/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'Accept', 'application/vnd.github+json',
      'Content-Type', 'application/json',
      'User-Agent', 'slidecraft-supabase'
    ),
    body    := jsonb_build_object('event_type', 'slidecraft_job', 'client_payload', jsonb_build_object('id', new.id))
  );
  return new;
end $$;

drop trigger if exists sc_jobs_notify on public.sc_jobs;
create trigger sc_jobs_notify
  after insert on public.sc_jobs
  for each row
  when (new.status = 'pending')
  execute function public.sc_notify_job();
