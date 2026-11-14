-- Run once in the Supabase SQL Editor to add an optional alternate notes link.
alter table public.academic_chapters
  add column if not exists notes_url_2 text;
