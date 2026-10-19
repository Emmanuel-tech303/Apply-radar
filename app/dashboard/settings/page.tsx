"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Copy, ExternalLink, Mail, ShieldCheck, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function SettingsPage() {
  const [copied, setCopied] = useState(false);
  const [provider, setProvider] = useState<"gmail" | "yahoo" | null>(null);
  const [alias, setAlias] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationLink, setVerificationLink] = useState("");

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    let active = true;
    let timer: number | undefined;
    void client.auth.getSession().then(async ({ data }) => {
      const userId = data.session?.user.id;
      if (!userId) return;
      const loadProfile = async () => {
        const profile = await client.from("profiles").select("assigned_alias,forwarding_verification_code,forwarding_verification_link").eq("id", userId).maybeSingle();
        if (!active || !profile.data) return;
        if (profile.data.assigned_alias) setAlias(profile.data.assigned_alias);
        if (profile.data.forwarding_verification_code) setVerificationCode(profile.data.forwarding_verification_code);
        if (profile.data.forwarding_verification_link) setVerificationLink(profile.data.forwarding_verification_link);
      };
      await loadProfile();
      timer = window.setInterval(() => void loadProfile(), 5000);
    });
    return () => { active = false; if (timer) window.clearInterval(timer); };
  }, []);

  async function copy() {
    if (!alias) return;
    await navigator.clipboard.writeText(alias);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return <section className="subpage">
      <div className="subpage-heading"><div className="eyebrow"><span className="live-dot"/> YOUR ACCOUNT</div><h1>Make your inbox work for you.</h1><p className="subpage-intro">One simple setup. Every application tracked automatically.</p></div>
      <div className="settings-grid">
        <section className="settings-card" id="forwarding"><div className="card-kicker"><Mail size={15}/> YOUR PERSONAL RADAR ADDRESS</div><h2>Forward job emails here</h2><p>When a job email lands in your inbox, forward it to your Apply Radar address. We’ll recognize the company, role, and status for you.</p><div className="alias-box"><span>{alias || "Sign in to receive your forwarding address"}</span><button disabled={!alias} onClick={copy}>{copied ? <Check size={13}/> : <Copy size={13}/>} {copied ? "Copied" : "Copy"}</button></div>{alias ? <div className="privacy-note"><ShieldCheck size={14}/> Only emails sent to your unique address enter your tracker.</div> : <Link className="settings-back" href="/login">Sign in to connect your account <ArrowRight size={13}/></Link>}{verificationCode && <div className="verification-code"><span>GOOGLE FORWARDING CODE</span><strong>{verificationCode}</strong><small>Enter this code in your Gmail forwarding settings to finish setup.</small></div>}{verificationLink && <div className="verification-code"><span>GMAIL CONFIRMATION IS READY</span><a href={verificationLink} target="_blank" rel="noopener noreferrer">Confirm this forwarding address <ExternalLink size={12}/></a><small>Only open this link if you just requested forwarding to the address above.</small></div>}</section>
        <section className="settings-card"><div className="card-kicker"><span className="connected"><i/> {alias ? "CONNECTED" : "ACCOUNT NEEDED"}</span></div><h2>Choose your email provider</h2><p>Follow the quick guide for the inbox you use most.</p><div className="provider-list"><button disabled={!alias} className={`provider-row ${provider === "gmail" ? "provider-active" : ""}`} onClick={() => setProvider(provider === "gmail" ? null : "gmail")}><span className="provider-glyph gmail-glyph">G</span><span><strong>Gmail</strong><span>Set up in your mobile browser</span></span><ArrowRight size={15}/></button><button disabled={!alias} className={`provider-row ${provider === "yahoo" ? "provider-active" : ""}`} onClick={() => setProvider(provider === "yahoo" ? null : "yahoo")}><span className="provider-glyph yahoo-glyph">Y!</span><span><strong>Yahoo Mail</strong><span>Auto-forwarding may require Mail Plus</span></span><ArrowRight size={15}/></button></div>{provider && <div className="provider-overlay" onClick={() => setProvider(null)}><section className="provider-modal" role="dialog" aria-modal="true" aria-label={`${provider === "gmail" ? "Gmail" : "Yahoo Mail"} forwarding setup`} onClick={event => event.stopPropagation()}><button className="provider-close" aria-label="Close instructions" onClick={() => setProvider(null)}><X size={16}/></button><div className="steps"><div className="setup-note">{provider === "gmail" ? "Use your phone browser and request the desktop site; Gmail’s forwarding controls are in full settings." : "Yahoo automatic forwarding is a Mail Plus feature and may not be available in every region."}</div>{provider === "gmail" ? <><div className="step"><span className="step-number">1</span><div><strong>Open Gmail in your phone browser</strong><p>Go to <b>mail.google.com</b>, sign in, then use your browser menu to turn on <b>Desktop site</b>.</p></div></div><div className="step"><span className="step-number">2</span><div><strong>Add your radar address</strong><p>Open <b>Settings → See all settings → Forwarding and POP/IMAP</b>. Choose <b>Add a forwarding address</b> and enter <b>{alias}</b>.</p></div></div><div className="step"><span className="step-number">3</span><div><strong>Confirm and enable forwarding</strong><p>Wait for the confirmation in Apply Radar, open its link here (or enter its code), then return to Gmail. For job emails only, create a filter and choose <b>Forward it</b>; forwarding all new mail sends every message. Save changes.</p></div></div></> : <><div className="step"><span className="step-number">1</span><div><strong>Check Mail Plus availability</strong><p>In Yahoo Mail, open <b>Settings → Mailboxes</b>. Auto-forwarding requires an eligible Yahoo Mail Plus plan in your region.</p></div></div><div className="step"><span className="step-number">2</span><div><strong>Add the forwarding address</strong><p>Select your mailbox, enter <b>{alias}</b> under <b>Forwarding</b>, then choose <b>Verify</b>.</p></div></div><div className="step"><span className="step-number">3</span><div><strong>Confirm your address</strong><p>Check your Apply Radar inbox and complete Yahoo’s verification instructions.</p></div></div></>}<a className="provider-help" href={provider === "gmail" ? "https://support.google.com/mail/answer/10957" : "https://help.yahoo.com/kb/mail/SLN22028.html"} target="_blank" rel="noreferrer">Open {provider === "gmail" ? "Gmail" : "Yahoo"} help center <ExternalLink size={12}/></a></div></section></div>}</section>
        <section className="settings-card settings-wide"><div className="card-kicker"><ShieldCheck size={15}/> YOUR PRIVACY, BUILT IN</div><h2>You’re in control of your inbox</h2><p>Apply Radar only processes messages that arrive at your personal radar address. You can remove a forwarding rule whenever you want from your email settings.</p></section>
      </div>
      <Link className="settings-back" href="/dashboard">Return to your dashboard <ArrowRight size={13}/></Link>
  </section>;
}
