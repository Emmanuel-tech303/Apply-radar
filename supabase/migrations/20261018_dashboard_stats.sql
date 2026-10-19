-- Aggregate personal dashboard metrics in Postgres so the UI does not infer
-- counts from a possibly incomplete client-side result set.
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
language sql
stable
security invoker
set search_path = public
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
      select count(*)
      from public.followups f
      join public.applications fa on fa.id = f.application_id
      where fa.user_id = auth.uid() and fa.status = 'applied' and f.is_sent = false
    )
  from public.applications a
  where a.user_id = auth.uid();
$$;

grant execute on function public.get_dashboard_stats() to authenticated;
