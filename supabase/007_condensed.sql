-- Slidecraft: the notes a condensing run made of a long source, cached on the
-- source itself so a regenerate with the same text and the same brief does not
-- read it again. condensed_key is the sha256 of the text and the instruction
-- the notes were made under; the server compares it before trusting the notes.
-- Safe to run twice. Run after 001 to 006.

alter table public.sc_sources add column if not exists condensed_key text;
alter table public.sc_sources add column if not exists condensed text;
