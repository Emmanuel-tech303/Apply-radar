-- Configure the email alias domain from NEXT_PUBLIC_EMAIL_ALIAS_DOMAIN at signup.
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

-- Keep one open reminder per application and have PostgreSQL create/cancel it
-- for manual adds, inbound emails, and status changes alike.
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
