"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Check, Clock3, Mail, RefreshCw } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type Followup = { id: string; scheduled_for: string; is_sent: boolean; applications: { company_name: string; job_role: string; status: string } | null };
const nextWeekDate = () => new Date(Date.now() + 7 * 86_400_000).toISOString();

export default function FollowupsPage() {
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  async function loadFollowups() {
    const client = getSupabaseBrowserClient();
    if (!client) { setError("Connect Supabase to load your follow-up reminders."); setLoading(false); return; }
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) { setError("Sign in to view your follow-up reminders."); setLoading(false); return; }
    const result = await client.from("followups").select("id,scheduled_for,is_sent,applications(company_name,job_role,status)").order("scheduled_for", { ascending: true });
    if (result.error) setError("Could not load reminders. Check your Supabase schema and connection.");
    else setFollowups((result.data ?? []) as unknown as Followup[]);
    setNow(Date.now());
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadFollowups(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function updateReminder(id: string, changes: { is_sent?: boolean; scheduled_for?: string }) {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setBusyId(id); setError("");
    const result = await client.from("followups").update(changes).eq("id", id);
    if (result.error) setError("Could not update that reminder.");
    else setFollowups(items => items.map(item => item.id === id ? { ...item, ...changes } : item));
    setBusyId("");
  }

  function draftEmail(followup: Followup) {
    const application = followup.applications;
    if (!application) return;
    const subject = encodeURIComponent(`Following up on ${application.job_role} application`);
    const body = encodeURIComponent(`Hello,\n\nI wanted to follow up on my application for the ${application.job_role} role at ${application.company_name}. I’m still very interested and would be happy to share anything else that might be helpful.\n\nThank you for your time.`);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
  }

  const pending = followups.filter(item => !item.is_sent && item.applications?.status === "applied");
  const completed = followups.filter(item => item.is_sent);
  return <section className="subpage route-page followups-page">
    <div className="subpage-heading"><div className="eyebrow"><span className="live-dot"/> KEEP THE THREAD MOVING</div><h1>Follow-ups</h1><p className="subpage-intro">Reminders are scheduled 14 days after an application. Draft a note, move a reminder, or mark it done.</p></div>
    {error && <div className="auth-error" role="alert">{error}</div>}
    {loading ? <div className="route-empty">Loading reminders…</div> : <>
      <section className="followup-route-group"><div className="route-group-heading"><div><CalendarClock size={16}/><h2>Upcoming reminders</h2></div><span>{pending.length}</span></div>
        {pending.length ? pending.map(item => {
          const application = item.applications;
          if (!application) return null;
          const due = new Date(item.scheduled_for);
          const isDue = now > 0 && due.getTime() <= now;
          return <article className="route-followup" key={item.id}><div className={`followup-date-icon ${isDue ? "is-due" : ""}`}><Clock3 size={17}/></div><div className="route-followup-info"><strong>{application.company_name}</strong><span>{application.job_role}</span><small>{isDue ? "Due now" : `Scheduled for ${due.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`}</small></div><div className="route-followup-actions"><button className="secondary-button" disabled={busyId === item.id} onClick={() => draftEmail(item)}><Mail size={13}/> Draft email</button><button className="followup-done" disabled={busyId === item.id} onClick={() => void updateReminder(item.id, { is_sent: true })}><Check size={14}/> Mark done</button><button className="followup-postpone" disabled={busyId === item.id} onClick={() => void updateReminder(item.id, { scheduled_for: nextWeekDate() })}><RefreshCw size={13}/> Move 7 days</button></div></article>;
        }) : <div className="route-empty compact"><Check size={18}/><p>No upcoming reminders. New applications get a reminder after 14 days.</p></div>}
      </section>
      {completed.length > 0 && <section className="followup-route-group completed-group"><div className="route-group-heading"><div><Check size={16}/><h2>Completed</h2></div><span>{completed.length}</span></div>{completed.map(item => <article className="route-followup completed-followup" key={item.id}><div className="followup-date-icon"><Check size={17}/></div><div className="route-followup-info"><strong>{item.applications?.company_name ?? "Application"}</strong><span>{item.applications?.job_role ?? ""}</span><small>Reminder completed</small></div></article>)}</section>}
    </>}
    <p className="followup-route-note">If a connected reminder email is verified, Apply Radar sends due reminders automatically. You can also draft a follow-up directly from your email app.</p>
  </section>;
}
