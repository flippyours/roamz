-- Run this once in Supabase Dashboard > SQL Editor.
-- It keeps the existing public.whitelist table used by the old whitelist.js.

create table if not exists public.roamz_route_runs (
  id uuid primary key,
  client_key text not null,
  created_at bigint not null,
  expires_at bigint not null,
  checkpoint_at bigint not null,
  collected smallint not null default 0 check (collected between 0 and 5),
  completed_at bigint,
  used boolean not null default false
);

create index if not exists roamz_route_runs_client_created_idx
  on public.roamz_route_runs (client_key, created_at desc);

create index if not exists roamz_route_runs_expiry_idx
  on public.roamz_route_runs (expires_at);

alter table public.roamz_route_runs enable row level security;

alter table public.whitelist add column if not exists entry_id text;
alter table public.whitelist add column if not exists route_run_id uuid;
alter table public.whitelist add column if not exists game_duration integer;
alter table public.whitelist add column if not exists consent_at timestamptz;
alter table public.whitelist add column if not exists submitted_at timestamptz not null default now();

create unique index if not exists whitelist_entry_id_unique
  on public.whitelist (entry_id)
  where entry_id is not null;

create unique index if not exists whitelist_route_run_unique
  on public.whitelist (route_run_id)
  where route_run_id is not null;

create or replace function public.submit_roamz_whitelist(
  p_run_id uuid,
  p_x_handle text,
  p_wallet_address text,
  p_comment_url text,
  p_consent_at timestamptz
)
returns table (entry_id text, review_status text, created boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.roamz_route_runs%rowtype;
  v_existing public.whitelist%rowtype;
  v_handle text := lower(trim(leading '@' from trim(p_x_handle)));
  v_wallet text := lower(trim(p_wallet_address));
  v_entry_id text := 'RZ-' || upper(substr(replace(p_run_id::text, '-', ''), 1, 8));
begin
  select * into v_existing
  from public.whitelist
  where route_run_id = p_run_id;

  if found then
    if lower(trim(leading '@' from v_existing.x_handle)) = v_handle
       and lower(v_existing.wallet_address) = v_wallet
       and v_existing.comment_url = p_comment_url then
      return query select v_existing.entry_id, v_existing.review_status, false;
      return;
    end if;
    raise exception 'ROUTE_ALREADY_USED';
  end if;

  select * into v_run
  from public.roamz_route_runs
  where id = p_run_id
  for update;

  if not found
     or v_run.expires_at <= (extract(epoch from clock_timestamp()) * 1000)::bigint
     or v_run.collected <> 5
     or v_run.completed_at is null then
    raise exception 'ROUTE_INVALID';
  end if;

  if v_run.used then
    raise exception 'ROUTE_ALREADY_USED';
  end if;

  -- Serialize equivalent entries so simultaneous requests cannot race.
  perform pg_advisory_xact_lock(hashtext('wallet:' || v_wallet));
  perform pg_advisory_xact_lock(hashtext('handle:' || v_handle));
  perform pg_advisory_xact_lock(hashtext('comment:' || p_comment_url));

  if exists (
    select 1
    from public.whitelist
    where lower(wallet_address) = v_wallet
       or lower(trim(leading '@' from x_handle)) = v_handle
       or comment_url = p_comment_url
  ) then
    raise exception 'DUPLICATE_ENTRY';
  end if;

  insert into public.whitelist (
    x_handle,
    wallet_address,
    comment_url,
    review_status,
    entry_id,
    route_run_id,
    game_duration,
    consent_at,
    submitted_at
  ) values (
    '@' || v_handle,
    v_wallet,
    p_comment_url,
    'pending',
    v_entry_id,
    p_run_id,
    round((v_run.completed_at - v_run.created_at) / 1000.0),
    p_consent_at,
    now()
  );

  update public.roamz_route_runs
  set used = true
  where id = p_run_id;

  return query select v_entry_id, 'pending'::text, true;
end;
$$;

revoke all on function public.submit_roamz_whitelist(uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.submit_roamz_whitelist(uuid, text, text, text, timestamptz)
  to service_role;

