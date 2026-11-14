-- Track comment authors without exposing their identity in the public view.
begin;

alter table public.confession_comments
  add column if not exists author_id uuid;

alter table public.confession_comments
  alter column author_id set default auth.uid();

-- Preserve known authors if this installation already stored them in user_id.
do $backfill$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'confession_comments'
      and column_name = 'user_id'
      and data_type = 'uuid'
  ) then
    execute 'update public.confession_comments set author_id = user_id where author_id is null';
  end if;
end;
$backfill$;

create index if not exists confession_comments_author_id_idx
  on public.confession_comments (author_id);

create or replace function public.my_confession_comment_ids()
returns table(comment_id uuid)
language sql
stable
security definer
set search_path = ''
as $function$
  select c.id
  from public.confession_comments c
  where c.author_id = auth.uid();
$function$;

revoke all on function public.my_confession_comment_ids() from public, anon;
grant execute on function public.my_confession_comment_ids() to authenticated;

commit;
