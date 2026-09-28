-- A stand-in for the parts of Supabase the migrations touch, so they can be
-- tested on plain Postgres. Not for a real project.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
create table if not exists storage.objects (id bigserial primary key, bucket_id text, name text, owner uuid);
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
create schema if not exists vault;
create table if not exists vault.secrets_store (name text primary key, secret text);
create or replace view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets_store;
create schema if not exists net;
create table if not exists net.calls (id bigserial, url text, headers jsonb, body jsonb);
create or replace function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as
  $$ insert into net.calls (url, headers, body) values (url, headers, body) returning id $$;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated;
