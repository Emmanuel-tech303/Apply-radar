-- Apply Radar initial schema. Run in the Supabase SQL editor or via the CLI.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone_number text,
  assigned_alias text not null unique,
  forwarding_verification_code text,
  forwarding_verification_link text,
  forwarding_verification_received_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists forwarding_verification_code text;
alter table public.profiles add column if not exists forwarding_verification_link text;
alter table public.profiles add column if not exists forwarding_verification_received_at timestamptz;

create table if not exists public.linked_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email_address text not null,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, email_address)
);

create or replace function public.guard_linked_email_verification()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    new.is_verified := lower(new.email_address) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null);
  end if;
  return new;
end;
$$;

drop trigger if exists guard_linked_email_verification on public.linked_emails;
create trigger guard_linked_email_verification
  before insert or update of email_address, is_verified on public.linked_emails
  for each row execute procedure public.guard_linked_email_verification();

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_name text not null,
  job_role text not null,
  status text not null default 'applied' check (status in ('applied', 'interview', 'offer', 'rejected')),
  source text not null default 'email' check (source in ('email', 'manual')),
  last_updated_at timestamptz not null default now(),
  raw_subject text,
  raw_sender text,
  raw_body text,
  job_url text,
  user_notes text,
  prep_resources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.applications add column if not exists source text not null default 'email';
alter table public.applications add column if not exists raw_sender text;
alter table public.applications add column if not exists job_url text;
alter table public.applications add column if not exists user_notes text;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'applications_source_check'
      and conrelid = 'public.applications'::regclass
  ) then
    alter table public.applications
      add constraint applications_source_check check (source in ('email', 'manual'));
  end if;
end $$;

create table if not exists public.followups (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  scheduled_for timestamptz not null,
  is_sent boolean not null default false
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  alias_local text;
  alias_domain text;
begin
  alias_local := coalesce(nullif(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9._-]', '', 'g'), ''), 'applicant');
  alias_domain := lower(trim(coalesce(new.raw_user_meta_data ->> 'email_alias_domain', 'jobs.applyradar.app')));
  if alias_domain !~ '^[a-z0-9][a-z0-9.-]{1,251}[a-z0-9]$' or position('..' in alias_domain) > 0 then
    alias_domain := 'jobs.applyradar.app';
  end if;
  insert into public.profiles (id, full_name, assigned_alias)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    alias_local || '+' || left(replace(new.id::text, '-', ''), 12) || '@' || alias_domain
  ) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create index if not exists applications_user_created_idx on public.applications(user_id, created_at desc);
create index if not exists followups_due_idx on public.followups(scheduled_for) where is_sent = false;

alter table public.profiles enable row level security;
alter table public.linked_emails enable row level security;
alter table public.applications enable row level security;
alter table public.followups enable row level security;

create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can create own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users can manage own linked emails" on public.linked_emails for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can manage own applications" on public.applications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can read own followups" on public.followups for select using (
  exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
);
create policy "Users can manage own followups" on public.followups for all using (
  exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
) with check (
  exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid())
);

-- Aggregate metrics in Postgres so dashboard values use complete account data.
create or replace function public.get_dashboard_stats()
returns table (
  total_applications bigint,
  responded_applications bigint,
  response_rate numeric,
  interview_applications bigint,
  offers bigint,
  offer_rate numeric,
  rejected_applications bigint,
  pending_followups bigint
)
language sql stable security invoker set search_path = public
as $$
  select
    count(a.id),
    count(a.id) filter (where a.status <> 'applied'),
    coalesce(round(100.0 * count(a.id) filter (where a.status <> 'applied') / nullif(count(a.id), 0), 0), 0),
    count(a.id) filter (where a.status = 'interview'),
    count(a.id) filter (where a.status = 'offer'),
    coalesce(round(100.0 * count(a.id) filter (where a.status = 'offer') / nullif(count(a.id), 0), 0), 0),
    count(a.id) filter (where a.status = 'rejected'),
    (
      select count(*) from public.followups f
      join public.applications fa on fa.id = f.application_id
      where fa.user_id = auth.uid() and fa.status = 'applied' and f.is_sent = false
    )
  from public.applications a
  where a.user_id = auth.uid();
$$;
grant execute on function public.get_dashboard_stats() to authenticated;

-- Keep the reminder lifecycle in the database so every source (manual or email)
-- receives the same reminder behavior, even when a browser closes mid-request.
delete from public.followups f
using public.applications a
where f.application_id = a.id and f.is_sent = false and a.status <> 'applied';

with pending_followups as (
  select id, row_number() over (
    partition by application_id order by scheduled_for desc, id desc
  ) as position
  from public.followups
  where is_sent = false
)
delete from public.followups f
using pending_followups p
where f.id = p.id and p.position > 1;

create unique index if not exists followups_one_open_per_application_idx
  on public.followups (application_id) where is_sent = false;

create or replace function public.sync_application_followup()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'applied' then
    insert into public.followups (application_id, scheduled_for, is_sent)
    values (new.id, now() + interval '14 days', false)
    on conflict (application_id) where is_sent = false
    do update set scheduled_for = excluded.scheduled_for;
  else
    delete from public.followups
    where application_id = new.id and is_sent = false;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_application_followup on public.applications;
create trigger sync_application_followup
  after insert or update of status on public.applications
  for each row execute procedure public.sync_application_followup();

insert into public.followups (application_id, scheduled_for, is_sent)
select a.id, a.created_at + interval '14 days', false
from public.applications a
where a.status = 'applied'
  and not exists (
    select 1 from public.followups f
    where f.application_id = a.id and f.is_sent = false
  )
on conflict (application_id) where is_sent = false do nothing;

-- Set NEXT_PUBLIC_EMAIL_ALIAS_DOMAIN in the app environment. Signup passes it
-- as auth metadata, and the trigger assigns each account its unique alias.
