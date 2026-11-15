-- Run once in the Supabase SQL Editor for this portal project.
-- Avatar URLs are visible to signed-in students in Community profiles.
alter table public.profiles
  add column if not exists avatar_url text;

notify pgrst, 'reload schema';