"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Clock3, Inbox, Mail, RefreshCw, Settings, ShieldCheck } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type InboundApplication = { id: string; company_name: string; job_role: string; status: string; raw_subject: string | null; raw_sender: string | null; created_at: string };
type LinkedEmail = { id: string; email_address: string; is_verified: boolean; created_at: string };

export default function InboxPage() {
  const [alias, setAlias] = useState("");
  const [email, setEmail] = useState("");
  const [linkedEmails, setLinkedEmails] = useState<LinkedEmail[]>([]);
  const [inbound, setInbound] = useState<InboundApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function loadInbox() {
    const client = getSupabaseBrowserClient();
    if (!client) { setLoading(false); return; }
    const { data: auth } = await client.auth.getUser();
    const user = auth.user;
    if (!user) { setLoading(false); return; }
    setEmail(user.email ?? "");
    const [profile, linked, applications] = await Promise.all([
      client.from("profiles").select("assigned_alias").eq("id", user.id).maybeSingle(),
      client.from("linked_emails").select("id,email_address,is_verified,created_at").eq("user_id", user.id).order("created_at", { ascending: false }),
      client.from("applications").select("id,company_name,job_role,status,raw_subject,raw_sender,created_at").eq("user_id", user.id).eq("source", "email").order("created_at", { ascending: false }).limit(100),
    ]);
    if (profile.data?.assigned_alias) setAlias(profile.data.assigned_alias);
    if (linked.data) setLinkedEmails(linked.data as LinkedEmail[]);
    if (applications.data) setInbound(applications.data as InboundApplication[]);
    if (linked.error || applications.error) setError("Could not load inbox records. Confirm the latest Supabase schema has been applied.");
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadInbox(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function connectAccountEmail() {
    const client = getSupabaseBrowserClient();
    if (!client || !email) return;
    setBusy(true); setError(""); setNotice("");
    const { data } = await client.auth.getUser();
    if (!data.user) { setError("Sign in to connect an email address."); setBusy(false); return; }
    const result = await client.from("linked_emails").upsert({ user_id: data.user.id, email_address: email, is_verified: true }, { onConflict: "user_id,email_address" });
    if (result.error) setError("Could not connect this address. Check that the latest Supabase schema is installed and your account email is verified.");
    else { setNotice("Your sign-in email is connected for follow-up reminders."); await loadInbox(); }
    setBusy(false);
  }

  async function disconnectAccountEmail(linkedEmail: LinkedEmail) {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setBusy(true); setError(""); setNotice("");
    const { data } = await client.auth.getUser();
    if (!data.user) { setBusy(false); setError("Sign in to manage connected emails."); return; }
    const result = await client.from("linked_emails").delete().eq("id", linkedEmail.id).eq("user_id", data.user.id);
    if (result.error) setError("Could not disconnect this email address.");
    else { setNotice("Email disconnected. Follow-up reminders will stop going to this address."); await loadInbox(); }
    setBusy(false);
  }

  const connected = linkedEmails.find(item => item.email_address.toLowerCase() === email.toLowerCase());
  return <section className="subpage inbox-page">
      <div className="subpage-heading"><div className="eyebrow"><span className="live-dot"/> YOUR WORKSPACE</div><h1>Connected inbox.</h1><p className="subpage-intro">See which email addresses send reminders to you and the application messages Apply Radar has received.</p></div>
      {error && <div className="auth-error" role="alert">{error}</div>}{notice && <div className="success-message"><Check size={14}/>{notice}</div>}
      <section className="inbox-address-card"><div className="inbox-card-icon"><Inbox size={18}/></div><div className="inbox-address-copy"><span className="card-kicker">YOUR INBOUND APPLY RADAR ADDRESS</span><h2>{alias || (loading ? "Loading your address…" : "Sign in to create your address")}</h2><p>Forward application emails here. They’ll appear below and be added to your tracker.</p></div><Link className="secondary-button" href="/dashboard/settings"><Settings size={14}/> Forwarding setup</Link></section>
      <section className="inbox-columns">
        <div className="settings-card inbox-linked-card"><div className="card-kicker"><ShieldCheck size={15}/> REMINDER EMAILS</div><h2>Where reminders are sent</h2><p>Connect your verified sign-in email to receive follow-up reminders when an application has been waiting 14 days.</p>{email ? <>{!connected && <div className="linked-email-row"><Mail size={16}/><div><strong>{email}</strong><span>Not connected yet</span></div><button className="primary-button" disabled={busy} onClick={connectAccountEmail}>{busy ? "Connecting…" : "Connect email"}</button></div>}{linkedEmails.length > 0 && <div className="connected-email-list"><span>CONNECTED ADDRESSES</span>{linkedEmails.map(linkedEmail => <div className="linked-email-row" key={linkedEmail.id}><Mail size={16}/><div><strong>{linkedEmail.email_address}</strong><span>{linkedEmail.is_verified ? "Verified · reminders enabled" : "Not verified · reminders paused"}</span></div>{linkedEmail.is_verified && <span className="inbox-verified"><Check size={13}/> Connected</span>}<button className="inbox-disconnect" disabled={busy} onClick={() => disconnectAccountEmail(linkedEmail)}>{busy ? "Saving…" : "Disconnect"}</button></div>)}</div>}{linkedEmails.length === 0 && connected && <p className="inbox-no-email">No reminder email connected.</p>}</> : <Link className="primary-button" href="/login">Sign in to connect an email <ArrowRight size={14}/></Link>}</div>
        <div className="settings-card inbox-messages-card"><div className="inbox-section-head"><div><div className="card-kicker"><Mail size={15}/> RECEIVED APPLICATION EMAILS</div><h2>Inbound messages</h2></div><button className="inbox-refresh" disabled={loading} onClick={() => { setLoading(true); setError(""); void loadInbox(); }} aria-label="Refresh inbound messages"><RefreshCw size={15}/></button></div>
          {loading ? <div className="inbox-empty"><Clock3 size={18}/><p>Loading your messages…</p></div> : inbound.length ? <div className="inbound-list">{inbound.map(message => <article className="inbound-row" key={message.id}><span className="inbound-status"><Mail size={15}/></span><div className="inbound-copy"><strong>{message.company_name} <span>· {message.job_role}</span></strong><p>{message.raw_subject || "Application email received"}</p><small>{message.raw_sender || "Sender not available"} · {new Date(message.created_at).toLocaleString()}</small></div><span className={`status-chip status-${message.status}`}><i/>{message.status}</span></article>)}</div> : <div className="inbox-empty"><Inbox size={20}/><p>No forwarded application emails yet.</p><span>Once you forward an application email to the address above, it will show here.</span><Link href="/dashboard/settings">Set up forwarding <ArrowRight size={13}/></Link></div>}
        </div>
      </section>
  </section>;
}
