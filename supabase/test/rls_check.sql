-- Runs after stub.sql and 001 to 004. Every check raises an error when it fails.
\set ON_ERROR_STOP on
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on storage.objects to authenticated;
grant usage, select on all sequences in schema storage to authenticated;

-- 007: the condensed-notes cache columns are on sc_sources.
do $$ begin
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'sc_sources' and column_name in ('condensed_key', 'condensed')) <> 2
  then raise exception 'FAILED: sc_sources lacks condensed_key / condensed (run 007_condensed.sql)'; end if;
  raise notice 'ok   sc_sources carries the condensed-notes cache (007)';
end $$;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'wan@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'mate@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'stranger@example.com');
insert into public.sc_members (user_id, role) values
  ('00000000-0000-0000-0000-00000000000a', 'owner'),
  ('00000000-0000-0000-0000-00000000000b', 'member');
insert into public.sc_decks (id, user_id, title, doc) values
  ('d_wan', '00000000-0000-0000-0000-00000000000a', 'Wan deck', '{}'),
  ('d_mate', '00000000-0000-0000-0000-00000000000b', 'Mate deck', '{}');

create or replace function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', what; end if;
  raise notice 'ok   %', what;
end $$;

-- Wan, signed in
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.expect((select count(*) from public.sc_decks) = 1, 'a member sees only their own decks');
select pg_temp.expect((select title from public.sc_decks) = 'Wan deck', 'and it is theirs');
update public.sc_decks set title = 'hacked' where id = 'd_mate';
select pg_temp.expect((select count(*) from public.sc_decks where title = 'hacked') = 0, 'cannot change another person''s deck');
delete from public.sc_decks where id = 'd_mate';
insert into public.sc_decks (id, title, doc) values ('d_new', 'New', '{}');
select pg_temp.expect((select user_id from public.sc_decks where id = 'd_new') = '00000000-0000-0000-0000-00000000000a', 'a new deck belongs to whoever made it');
do $$ begin
  insert into public.sc_decks (id, user_id, title, doc) values ('d_forge', '00000000-0000-0000-0000-00000000000b', 'x', '{}');
  raise exception 'FAILED: made a deck in someone else''s name';
exception when insufficient_privilege then raise notice 'ok   cannot make a deck in someone else''s name';
end $$;
do $$ begin
  insert into public.sc_sources (id, deck_id, name, kind, bytes, chars, text) values ('s_x', 'd_mate', 'x', 'text', 1, 1, 'x');
  raise exception 'FAILED: hung a source off another person''s deck';
exception when insufficient_privilege then raise notice 'ok   cannot hang a source off another person''s deck';
end $$;
insert into public.sc_sources (id, deck_id, name, kind, bytes, chars, text) values ('s_ok', 'd_wan', 'notes', 'text', 5, 5, 'hello');
do $$ begin
  update public.sc_sources set deck_id = 'd_mate' where id = 's_ok';
  raise exception 'FAILED: moved a source onto another person''s deck';
exception when insufficient_privilege then raise notice 'ok   cannot move a source onto another person''s deck';
end $$;
insert into public.sc_jobs (kind, deck_id, request) values ('generate', 'd_wan', '{"method":"POST","path":"/api/decks/d_wan/generate"}');
select pg_temp.expect((select count(*) from public.sc_jobs) = 1, 'a member can queue a job');
do $$ begin
  insert into public.sc_jobs (kind, status) values ('generate', 'done');
  raise exception 'FAILED: queued a job as already done';
exception when insufficient_privilege then raise notice 'ok   cannot queue a job that claims to be done';
end $$;
update public.sc_jobs set status = 'done', result = '{"fake":true}';
select pg_temp.expect((select count(*) from public.sc_jobs where status = 'pending') = 1, 'cannot mark own job done (only the worker can)');
insert into storage.objects (bucket_id, name) values ('sc-inbox', '00000000-0000-0000-0000-00000000000a/job/a.pdf');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('sc-media', '00000000-0000-0000-0000-00000000000a/m_x.png');
  raise exception 'FAILED: wrote into sc-media';
exception when insufficient_privilege then raise notice 'ok   the page cannot write into sc-media';
end $$;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('sc-inbox', '00000000-0000-0000-0000-00000000000b/job/a.pdf');
  raise exception 'FAILED: uploaded into another person''s folder';
exception when insufficient_privilege then raise notice 'ok   cannot upload into another person''s folder';
end $$;

-- Studio outputs: Wan's own, on Wan's own notebook only
insert into public.sc_outputs (id, deck_id, kind, title, data) values ('o_wan', 'd_wan', 'quiz', 'Quiz', '{"questions":[]}');
select pg_temp.expect((select user_id from public.sc_outputs where id = 'o_wan') = '00000000-0000-0000-0000-00000000000a', 'a new output belongs to whoever made it');
do $$ begin
  insert into public.sc_outputs (id, deck_id, kind, title) values ('o_x', 'd_mate', 'note', 'x');
  raise exception 'FAILED: put an output on another person''s notebook';
exception when insufficient_privilege then raise notice 'ok   cannot put an output on another person''s notebook';
end $$;
do $$ begin
  update public.sc_outputs set deck_id = 'd_mate' where id = 'o_wan';
  raise exception 'FAILED: moved an output onto another person''s notebook';
exception when insufficient_privilege then raise notice 'ok   cannot move an output onto another person''s notebook';
end $$;
do $$ begin
  insert into public.sc_outputs (id, user_id, deck_id, kind, title) values ('o_forge', '00000000-0000-0000-0000-00000000000b', 'd_wan', 'note', 'x');
  raise exception 'FAILED: forged an output for someone else';
exception when insufficient_privilege then raise notice 'ok   cannot make an output in someone else''s name';
end $$;

-- Picture rows: only in the owner's own folder, under a plain id
insert into public.sc_media (id, name, mime, bytes, origin, object_path) values ('m_wan', 'a.png', 'image/png', 1, 'upload', '00000000-0000-0000-0000-00000000000a/m_wan.png');
select pg_temp.expect((select count(*) from public.sc_media where id = 'm_wan') = 1, 'a picture row in the owner''s own folder is allowed');
do $$ begin
  insert into public.sc_media (id, name, mime, bytes, origin, object_path) values ('m_steal', 'x.png', 'image/png', 1, 'upload', '00000000-0000-0000-0000-00000000000b/m_secret.png');
  raise exception 'FAILED: a picture row pointing into another person''s folder';
exception when insufficient_privilege then raise notice 'ok   a picture row cannot point into another person''s folder';
end $$;
do $$ begin
  update public.sc_media set object_path = '00000000-0000-0000-0000-00000000000b/m_secret.png' where id = 'm_wan';
  raise exception 'FAILED: moved a picture row into another person''s folder';
exception when insufficient_privilege then raise notice 'ok   nor be moved there later';
end $$;
do $$ begin
  insert into public.sc_media (id, name, mime, bytes, origin, object_path) values ('../../x', 'x.png', 'image/png', 1, 'upload', '00000000-0000-0000-0000-00000000000a/../../x.png');
  raise exception 'FAILED: a picture id that climbs out of its folder';
exception when insufficient_privilege then raise notice 'ok   a picture id or path cannot climb out of its folder';
end $$;

-- A teammate
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.expect((select count(*) from public.sc_decks) = 1 and (select title from public.sc_decks) = 'Mate deck', 'a teammate sees only their own deck');
select pg_temp.expect((select count(*) from public.sc_sources) = 0 and (select count(*) from public.sc_jobs) = 0, 'and none of Wan''s sources or jobs');
select pg_temp.expect((select count(*) from public.sc_outputs) = 0, 'and none of Wan''s Studio outputs');
delete from public.sc_outputs where id = 'o_wan';
select pg_temp.expect((select count(*) from storage.objects) = 0, 'and none of Wan''s files');

-- Signed in, but not a member
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select pg_temp.expect((select count(*) from public.sc_decks) = 0, 'a signed-in stranger sees no decks');
do $$ begin
  insert into public.sc_decks (id, title, doc) values ('d_s', 'x', '{}');
  raise exception 'FAILED: a stranger made a deck';
exception when insufficient_privilege then raise notice 'ok   a signed-in stranger cannot make a deck';
end $$;
do $$ begin
  insert into public.sc_jobs (kind) values ('generate');
  raise exception 'FAILED: a stranger queued a job';
exception when insufficient_privilege then raise notice 'ok   a signed-in stranger cannot queue a job (and spend the OpenAI key)';
end $$;
do $$ begin
  insert into public.sc_members (user_id) values ('00000000-0000-0000-0000-00000000000c');
  raise exception 'FAILED: a stranger added themselves';
exception when insufficient_privilege then raise notice 'ok   a stranger cannot add themselves as a member';
end $$;

-- Not signed in at all (the anon key the page carries)
reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect((select count(*) from public.sc_decks) = 0 and (select count(*) from public.sc_settings) = 0 and (select count(*) from public.sc_jobs) = 0 and (select count(*) from public.sc_outputs) = 0, 'the public anon key reads nothing');

-- The worker (service_role) sees everything and wakes on a new job
reset role;
select pg_temp.expect((select count(*) from public.sc_outputs where id = 'o_wan') = 1, 'a teammate''s delete did not remove Wan''s output');
select pg_temp.expect((select count(*) from net.calls where body->>'event_type' = 'slidecraft_job') = 1, 'the queued job fired one repository_dispatch');
select pg_temp.expect((select body->'client_payload' ? 'id' and not (body->'client_payload' ? 'request') from net.calls limit 1), 'the dispatch carries only the job id, never its content');
select pg_temp.expect((select url from net.calls limit 1) = 'https://api.github.com/repos/wanshah07/Wanshah-Test/dispatches', 'to the repository named in the vault');
