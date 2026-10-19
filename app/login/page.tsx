"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { SignInSchema, SignUpSchema } from "@/lib/validation";

type LoginField = "name" | "email" | "password";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<LoginField, string>>>({});

  function clearFieldError(field: LoginField) {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    const validation = (mode === "signup" ? SignUpSchema : SignInSchema).safeParse({ name, email, password });
    if (!validation.success) {
      const nextErrors: Partial<Record<LoginField, string>> = {};
      for (const issue of validation.error.issues) {
        const field = issue.path[0] as LoginField;
        nextErrors[field] ??= issue.message;
      }
      setFieldErrors(nextErrors);
      document.getElementById(`login-${Object.keys(nextErrors)[0]}`)?.focus();
      return;
    }
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    setBusy(true);
    const aliasDomain = process.env.NEXT_PUBLIC_EMAIL_ALIAS_DOMAIN?.trim().toLowerCase();
    const validAliasDomain = Boolean(aliasDomain && /^[a-z0-9][a-z0-9.-]{1,251}[a-z0-9]$/.test(aliasDomain) && !aliasDomain.includes(".."));
    if (mode === "signup" && process.env.NODE_ENV === "production" && !validAliasDomain) {
      setError("Set NEXT_PUBLIC_EMAIL_ALIAS_DOMAIN to your email-routing domain before enabling sign-up.");
      setBusy(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Connect Supabase first by adding the public URL and anon key to your environment.");
      setBusy(false);
      return;
    }
    try {
      const result = mode === "signup"
        ? await supabase.auth.signUp({ email: cleanEmail, password, options: { data: { full_name: cleanName, email_alias_domain: aliasDomain || "jobs.applyradar.app" } } })
        : await supabase.auth.signInWithPassword({ email: cleanEmail, password });
      if (result.error) throw result.error;
      if (result.data.session && result.data.user) {
        if (validAliasDomain && aliasDomain) {
          const user = result.data.user;
          const localPart = (user.email?.split("@")[0] ?? "applicant").replace(/[^a-zA-Z0-9._-]/g, "") || "applicant";
          const desiredAlias = `${localPart}+${user.id.replace(/-/g, "").slice(0, 12)}@${aliasDomain}`;
          const profile = await supabase.from("profiles").select("assigned_alias").eq("id", user.id).maybeSingle();
          if (profile.error) throw profile.error;
          if (profile.data && profile.data.assigned_alias !== desiredAlias) {
            const update = await supabase.from("profiles").update({ assigned_alias: desiredAlias }).eq("id", user.id);
            if (update.error) throw update.error;
          } else if (!profile.data) {
            const insert = await supabase.from("profiles").insert({
              id: user.id,
              full_name: name || user.user_metadata.full_name || null,
              assigned_alias: desiredAlias,
            });
            if (insert.error) throw insert.error;
          }
        }
        await supabase.from("linked_emails").upsert({
          user_id: result.data.user.id,
          email_address: result.data.user.email ?? email,
          is_verified: Boolean(result.data.user.email_confirmed_at),
        }, { onConflict: "user_id,email_address" });
        router.push(mode === "signup" ? "/welcome" : "/dashboard");
        router.refresh();
      } else setDone(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t complete that request.");
    } finally { setBusy(false); }
  }

  return <main className="auth-page">
    <div className="auth-top"><Link href="/dashboard" className="auth-back"><ArrowLeft size={14}/> Preview dashboard</Link><Link href="/" className="brand auth-brand"><span className="brand-mark"><Activity size={18}/></span><span>apply<span className="brand-light">radar</span></span></Link></div>
    <section className="auth-card">
      <div className="auth-eyebrow"><span className="live-dot"/> YOUR NEXT CHAPTER STARTS HERE</div>
      <h1>{mode === "signup" ? "Keep your job search organized, one application at a time." : "Welcome back to your radar."}</h1>
      <p>{mode === "signup" ? "Save roles, track replies, get a follow-up reminder, and prepare for interviews." : "Pick up right where you left off."}</p>
      {done ? <div className="success-message"><Check size={15}/> Check your inbox to confirm your email, then come back to sign in.</div> : <form noValidate onSubmit={submit}>
        {mode === "signup" && <div className={`form-field ${fieldErrors.name ? "field-invalid" : ""}`}><label htmlFor="login-name">Your name <span className="required">*</span></label><input id="login-name" required autoComplete="name" value={name} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "login-name-error" : undefined} onChange={event => { setName(event.target.value); clearFieldError("name"); }} placeholder="Kazeem A."/>{fieldErrors.name && <span className="field-error" id="login-name-error">{fieldErrors.name}</span>}</div>}
        <div className={`form-field ${fieldErrors.email ? "field-invalid" : ""}`}><label htmlFor="login-email">Email address <span className="required">*</span></label><input id="login-email" type="email" required autoComplete="email" value={email} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "login-email-error" : undefined} onChange={event => { setEmail(event.target.value); clearFieldError("email"); }} placeholder="you@example.com"/>{fieldErrors.email && <span className="field-error" id="login-email-error">{fieldErrors.email}</span>}</div>
        <div className={`form-field ${fieldErrors.password ? "field-invalid" : ""}`}><label htmlFor="login-password">Password <span className="required">*</span></label><input id="login-password" type="password" required autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "login-password-error" : undefined} onChange={event => { setPassword(event.target.value); clearFieldError("password"); }} placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}/>{fieldErrors.password && <span className="field-error" id="login-password-error">{fieldErrors.password}</span>}</div>
        {error && <div className="auth-error">{error}</div>}
        <button className="primary-button auth-submit" disabled={busy}>{busy ? "One moment…" : mode === "signup" ? "Create your free account" : "Sign in"}<ArrowRight size={15}/></button>
      </form>}
      <div className="auth-switch">{mode === "signup" ? "Already have an account?" : "New to Apply Radar?"}<button onClick={() => { setDone(false); setMode(mode === "signup" ? "login" : "signup"); }}>{mode === "signup" ? "Sign in" : "Create an account"}</button></div>
      <div className="auth-footnote">Free to start <span>·</span> Made for the ones who keep going</div>
    </section>
    <div className="auth-bottom">© 2026 Apply Radar <span>·</span> Your search, at your pace.</div>
  </main>;
}
