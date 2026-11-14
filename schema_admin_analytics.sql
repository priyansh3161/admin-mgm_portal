begin;

create table if not exists public.portal_page_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  page text not null check (length(page) between 1 and 40),
  event_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, page, event_date)
);

create index if not exists portal_page_views_event_date_idx
  on public.portal_page_views (event_date desc);

create table if not exists public.portal_client_errors (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  page text not null check (length(page) between 1 and 40),
  message text not null check (length(message) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists portal_client_errors_created_at_idx
  on public.portal_client_errors (created_at desc);

create table if not exists public.portal_database_size_snapshots (
  snapshot_date date primary key,
  database_bytes bigint not null check (database_bytes >= 0),
  sampled_at timestamptz not null default now()
);

alter table public.portal_page_views enable row level security;
alter table public.portal_client_errors enable row level security;
alter table public.portal_database_size_snapshots enable row level security;

revoke all on public.portal_page_views, public.portal_client_errors,
  public.portal_database_size_snapshots from public, anon, authenticated;
grant all on public.portal_page_views, public.portal_client_errors,
  public.portal_database_size_snapshots to service_role;
grant usage, select on sequence public.portal_client_errors_id_seq to service_role;

create or replace function public.admin_portal_analytics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
  v_month_start date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
  v_database_bytes bigint;
  v_month_start_bytes bigint;
begin
  delete from public.portal_page_views where event_date < v_today - 365;
  delete from public.portal_client_errors where created_at < now() - interval '90 days';
  v_database_bytes := pg_catalog.pg_database_size(pg_catalog.current_database());

  insert into public.portal_database_size_snapshots (snapshot_date, database_bytes)
  values (v_today, v_database_bytes)
  on conflict (snapshot_date) do update
    set database_bytes = excluded.database_bytes, sampled_at = now();

  select s.database_bytes into v_month_start_bytes
    from public.portal_database_size_snapshots s
    where s.snapshot_date >= v_month_start and s.snapshot_date <= v_today
    order by s.snapshot_date asc limit 1;

  return jsonb_build_object(
    'database_bytes', v_database_bytes,
    'database_month_start_bytes', v_month_start_bytes,
    'page_views_month_to_date', (
      select count(*) from public.portal_page_views p where p.event_date >= v_month_start and p.event_date <= v_today
    ),
    'active_users_month_to_date', (
      select count(distinct p.user_id) from public.portal_page_views p where p.event_date >= v_month_start and p.event_date <= v_today
    ),
    'daily_active_users', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d.day::text, 'users', coalesce(v.users, 0)) order by d.day), '[]'::jsonb)
      from generate_series((v_today - 29)::timestamp, v_today::timestamp, interval '1 day') as d(day)
      left join (
        select p.event_date, count(distinct p.user_id)::integer as users
          from public.portal_page_views p
          where p.event_date >= v_today - 29 and p.event_date <= v_today
          group by p.event_date
      ) v on v.event_date = d.day::date
    ),
    'client_errors_24h', (
      select count(*) from public.portal_client_errors e where e.created_at >= now() - interval '24 hours'
    ),
    'recent_client_errors', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'created_at', e.created_at, 'page', e.page, 'message', e.message
      ) order by e.created_at desc), '[]'::jsonb)
      from (
        select e.created_at, e.page, e.message from public.portal_client_errors e
        order by e.created_at desc limit 30
      ) e
    ),
    'largest_tables', (
      select coalesce(jsonb_agg(jsonb_build_object('table', t.table_name, 'bytes', t.bytes) order by t.bytes desc), '[]'::jsonb)
      from (
        select c.relname as table_name, pg_catalog.pg_total_relation_size(c.oid)::bigint as bytes
          from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'm')
          order by pg_catalog.pg_total_relation_size(c.oid) desc limit 10
      ) t
    )
  );
end;
$function$;

revoke all on function public.admin_portal_analytics() from public, anon, authenticated;
grant execute on function public.admin_portal_analytics() to service_role;

commit;
