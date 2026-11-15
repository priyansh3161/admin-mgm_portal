-- Run once in the Supabase SQL Editor to add an Odysee fallback for chapter videos.
alter table public.academic_chapters
  add column if not exists video_odysee_url text;
