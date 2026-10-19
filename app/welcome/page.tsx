"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Inbox, BookOpen, Check } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { QuickAddModal } from "@/app/dashboard/quick-add-modal";
import { QuickAddTrigger } from "@/app/dashboard/quick-add-trigger";

const steps = [
  { icon: BriefcaseBusiness, title: "Add an application", body: "Log a role in a few seconds, or forward a job email to your personal Apply Radar address." },
  { icon: Inbox, title: "Keep the thread moving", body: "Your tracker groups roles by stage and reminds you to follow up after 14 days without a reply." },
  { icon: BookOpen, title: "Prepare for what’s next", body: "Use the interview, career, and resume resources when you need them." },
];

export default function WelcomePage() {
  const [name, setName] = useState("");
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (client) void client.auth.getUser().then(({ data }) => {
      const fullName = data.user?.user_metadata.full_name;
      if (typeof fullName === "string") setName(fullName.split(/\s+/)[0]);
    });
  }, []);
  return <main className="auth-page welcome-page">
    <Link href="/dashboard" className="brand auth-brand"><span className="brand-mark"><Check size={17}/></span><span>apply<span className="brand-light">radar</span></span></Link>
    <section className="welcome-card">
      <div className="auth-eyebrow"><span className="live-dot"/> YOUR JOB SEARCH, IN FOCUS</div>
      <h1>{name ? `Welcome, ${name}.` : "Welcome to Apply Radar."}</h1>
      <p>Here’s how to get started. Take it one step at a time.</p>
      <div className="welcome-steps">{steps.map((step, index) => <article className="welcome-step" key={step.title}><span className="welcome-step-number">0{index + 1}</span><span className="welcome-step-icon"><step.icon size={17}/></span><div><h2>{step.title}</h2><p>{step.body}</p></div></article>)}</div>
      <div className="welcome-actions"><QuickAddTrigger className="primary-button">Add your first application <ArrowRight size={15}/></QuickAddTrigger><Link className="welcome-secondary" href="/dashboard">Go to the dashboard</Link></div>
    </section>
    <div className="auth-bottom">© 2026 Apply Radar <span>·</span> Your search, at your pace.</div>
    <QuickAddModal />
  </main>;
}
