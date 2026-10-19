alter table public.applications add column if not exists job_url text;
alter table public.applications add column if not exists user_notes text;

-- Preserve notes previously captured by Quick Add without changing inbound email bodies.
update public.applications
set user_notes = raw_body
where source = 'manual' and user_notes is null and raw_body is not null;
