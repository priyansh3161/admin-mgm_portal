-- Add invisible-by-default review for new confession posts.
-- Existing posts stay published; only new inserts start pending.

begin;

alter table public.confessions
  add column if not exists status text;

update public.confessions
set status = 'approved'
where status is null;

alter table public.confessions
  alter column status set default 'pending',
  alter column status set not null;

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'confessions_status_check'
      and conrelid = 'public.confessions'::regclass
  ) then
    alter table public.confessions
      add constraint confessions_status_check
      check (status in ('pending', 'approved'));
  end if;
end;
$constraint$;

-- Client inserts can never publish directly. Client status changes are limited
-- to academic staff; the service-role moderation function bypasses this check.
create or replace function public.enforce_confession_review_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  staff_role text;
begin
  if tg_op = 'INSERT' then
    new.status := 'pending';
    return new;
  end if;

  if new.status is distinct from old.status and coalesce(auth.role(), '') <> 'service_role' then
    select s.role into staff_role
    from public.academic_staff s
    where s.user_id = auth.uid();

    if coalesce(staff_role, '') not in ('admin', 'subadmin') then
      raise exception 'Only academic staff can review confession posts.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists confession_review_status_guard on public.confessions;
create trigger confession_review_status_guard
before insert or update of status on public.confessions
for each row execute function public.enforce_confession_review_status();

-- Ensure any existing permissive SELECT policy still cannot expose pending
-- rows through direct table queries. Owners use get_shared_confession instead.
alter table public.confessions enable row level security;
drop policy if exists confession_public_approved_only on public.confessions;
create policy confession_public_approved_only
on public.confessions as restrictive
for select to anon, authenticated
using (status = 'approved');

-- Preserve the old anonymous, safe projection. Replace the public relation
-- with an approved-only view and remove direct access to the old projection.
do $view$
begin
  if to_regclass('public.public_confessions') is not null
    and to_regclass('public.public_confessions_pre_moderation') is null then
    alter view public.public_confessions rename to public_confessions_pre_moderation;
  end if;
end;
$view$;

revoke all on public.public_confessions_pre_moderation from public, anon, authenticated;

create or replace view public.public_confessions
with (security_invoker = false)
as
select old_post.*
from public.public_confessions_pre_moderation old_post
join public.confessions c on c.id = old_post.id
where c.status = 'approved';

grant select on public.public_confessions to anon, authenticated;

-- A direct share URL contains a UUID. This RPC returns that single post even
-- while pending, allowing owners and people they share the link with to view it
-- without putting pending posts in public feed queries.
create or replace function public.get_shared_confession(p_post_id uuid)
returns setof public.public_confessions_pre_moderation
language sql
stable
security definer
set search_path = ''
as $function$
  select old_post.*
  from public.public_confessions_pre_moderation old_post
  join public.confessions c on c.id = old_post.id
  where old_post.id = p_post_id
    and c.status in ('approved', 'pending');
$function$;

revoke all on function public.get_shared_confession(uuid) from public;
grant execute on function public.get_shared_confession(uuid) to anon, authenticated;

commit;
