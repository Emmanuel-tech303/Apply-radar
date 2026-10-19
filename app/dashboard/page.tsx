"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Clock3,
  Copy,
  FileText,
  Inbox,
  Plus,
  Search,
  Send,
  Target,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { QuickAddTrigger } from "./quick-add-trigger";

type Status = "applied" | "interview" | "offer" | "rejected";
type Application = {
  id: string;
  company: string;
  role: string;
  status: Status;
  date: string;
  logo: string;
  color: string;
  ageDays?: number;
  location?: string;
  source?: string;
};
type DashboardStats = {
  total_applications: number;
  responded_applications: number;
  response_rate: number;
  interview_applications: number;
  offers: number;
  offer_rate: number;
  rejected_applications: number;
  pending_followups: number;
};
type DueFollowup = {
  id: string;
  scheduled_for: string;
  daysOverdue: number;
  applications: {
    id: string;
    company_name: string;
    job_role: string;
    status: Status;
    created_at: string;
  } | null;
};
const statusInfo: Record<
  Status,
  { label: string; className: string; dot: string }
> = {
  applied: { label: "Applied", className: "status-applied", dot: "#df574b" },
  interview: {
    label: "Interview",
    className: "status-interview",
    dot: "#72cf8b",
  },
  offer: { label: "Offer", className: "status-offer", dot: "#78a7ff" },
  rejected: { label: "Closed", className: "status-rejected", dot: "#77767a" },
};

export default function Dashboard() {
  const [apps, setApps] = useState<Application[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [alias, setAlias] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [displayName, setDisplayName] = useState("there");
  const [greeting, setGreeting] = useState("Hello");
  const [dateLabel, setDateLabel] = useState("");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [metricsError, setMetricsError] = useState(false);
  const [dueFollowups, setDueFollowups] = useState<DueFollowup[]>([]);
  useEffect(() => {
    let disposed = false;
    const loadDashboard = async () => {
      const now = new Date();
      setDateLabel(
        new Intl.DateTimeFormat("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })
          .format(now)
          .toUpperCase(),
      );
      setGreeting(
        now.getHours() < 12
          ? "Good morning"
          : now.getHours() < 18
            ? "Good afternoon"
            : "Good evening",
      );
      const client = getSupabaseBrowserClient();
      if (client) {
        const { data } = await client.auth.getSession();
          const user = data.session?.user;
          if (!user) return;
          setSignedIn(true);
          setDisplayName(
            typeof user.user_metadata.full_name === "string"
              ? user.user_metadata.full_name
              : (user.email?.split("@")[0] ?? "there"),
          );
          const [profile, result, statsResult, followupResult] =
            await Promise.all([
              client
                .from("profiles")
                .select("assigned_alias,full_name")
                .eq("id", user.id)
                .maybeSingle(),
              client
                .from("applications")
                .select("id,company_name,job_role,status,source,created_at")
                .eq("user_id", user.id)
                .order("created_at", { ascending: false }),
              client.rpc("get_dashboard_stats"),
              client
                .from("followups")
                .select(
                  "id,scheduled_for,applications(id,company_name,job_role,status,created_at)",
                )
                .eq("is_sent", false)
                .order("scheduled_for", { ascending: true }),
            ]);
          if (profile.data?.assigned_alias)
            setAlias(profile.data.assigned_alias);
          if (profile.data?.full_name) setDisplayName(profile.data.full_name);
          if (result.data)
            setApps(
              result.data.map((row) => ({
                id: row.id,
                company: row.company_name,
                role: row.job_role,
                status: row.status as Status,
                date: new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "2-digit",
                }).format(new Date(row.created_at)),
                ageDays: Math.floor(
                  (Date.now() - new Date(row.created_at).getTime()) /
                    86_400_000,
                ),
                logo: row.company_name.charAt(0).toUpperCase(),
                color: "#5c62d6",
                source: row.source === "email" ? "Email" : "Quick add",
              })),
            );
          const metricRow = Array.isArray(statsResult.data)
            ? statsResult.data[0]
            : statsResult.data;
          if (metricRow) setStats(metricRow as DashboardStats);
          if (statsResult.error) setMetricsError(true);
          if (followupResult.data) {
            const nowMs = Date.now();
            setDueFollowups(
              (
                followupResult.data as unknown as Omit<
                  DueFollowup,
                  "daysOverdue"
                >[]
              )
                .filter(
                  (item) =>
                    item.applications?.status === "applied" &&
                    new Date(item.scheduled_for).getTime() <= nowMs,
                )
                .map((item) => ({
                  ...item,
                  daysOverdue: Math.max(
                    0,
                    Math.floor(
                      (nowMs - new Date(item.scheduled_for).getTime()) /
                        86_400_000,
                    ),
                  ),
                })),
            );
          }
      }
    };
    const loadIfActive = () => {
      if (!disposed) void loadDashboard();
    };
    const timer = window.setTimeout(loadIfActive, 0);
    window.addEventListener("applyradar:application-added", loadIfActive);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.removeEventListener("applyradar:application-added", loadIfActive);
    };
  }, []);
  const rows = useMemo(
    () =>
      apps.filter(
        (app) =>
          (filter === "all" || app.status === filter) &&
          `${app.company} ${app.role}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [apps, filter, query],
  );
  const dueApps = dueFollowups;
  const copyEmail = async () => {
    if (!alias) return;
    await navigator.clipboard.writeText(alias);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  const draftFollowup = (app: { company: string; role: string }) => {
    const subject = encodeURIComponent(
      `Following up on ${app.role} application`,
    );
    const body = encodeURIComponent(
      `Hello,\n\nI wanted to follow up on my application for the ${app.role} role at ${app.company}. I’m still very interested and would be happy to share anything else that might be helpful.\n\nThank you for your time.`,
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
  };
  return (
    <div className="dashboard-content">
      {!signedIn && (
        <div className="demo-banner">
          <span>NO ACCOUNT CONNECTED</span>
          <span>
            Application records load from Supabase after you sign in.{" "}
            <Link href="/login">
              Sign in or create an account <ArrowRight size={12} />
            </Link>
          </span>
        </div>
      )}
      {signedIn && metricsError && (
        <div className="demo-banner metrics-warning">
          <span>DATABASE UPDATE NEEDED</span>
          <span>
            Apply the dashboard stats migration in Supabase to enable live
            metrics.
          </span>
        </div>
      )}
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="live-dot" /> {dateLabel || "YOUR JOB SEARCH"}
          </div>
          <h1>
            {greeting}, {displayName}
          </h1>
          <p className="page-subtitle">
            A clear view of your applications and next steps.
          </p>
        </div>
        <QuickAddTrigger className="primary-button"><Plus size={16} /> Add application</QuickAddTrigger>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-head">
            <span>Total applications</span>
            <span className="stat-icon">
              <BriefcaseBusiness size={16} />
            </span>
          </div>
          <div className="stat-value">{stats?.total_applications ?? "—"}</div>
          <div className="stat-foot">Roles in your tracker</div>
        </div>
        <div className="stat-card">
          <div className="stat-head">
            <span>Response rate</span>
            <span className="stat-icon green">
              <Activity size={16} />
            </span>
          </div>
          <div className="stat-value">
            {stats ? (
              <>
                {stats.response_rate}
                <span className="percent">%</span>
              </>
            ) : (
              "—"
            )}
          </div>
          <div className="stat-foot">
            {stats
              ? `${stats.responded_applications} applications with a response`
              : "Applications with a response"}
          </div>
        </div>
        <div className="stat-card stat-highlight">
          <div className="stat-head">
            <span>Interviews</span>
            <span className="stat-icon blue">
              <CalendarDays size={16} />
            </span>
          </div>
          <div className="stat-value">
            {stats?.interview_applications ?? "—"}
            <span className="stat-unit">in progress</span>
          </div>
          <div className="stat-foot">Applications at interview stage</div>
        </div>
        <div className="stat-card">
          <div className="stat-head">
            <span>Offer rate</span>
            <span className="stat-icon blue">
              <Target size={16} />
            </span>
          </div>
          <div className="stat-value">
            {stats ? (
              <>
                {stats.offer_rate}
                <span className="percent">%</span>
              </>
            ) : (
              "—"
            )}
          </div>
          <div className="stat-foot">
            {stats
              ? `${stats.offers} offers from ${stats.total_applications} applications`
              : "Offers from total applications"}
          </div>
        </div>
      </div>
      <div className="content-grid">
        <section className="applications-panel" id="applications">
          <div className="panel-heading">
            <div>
              <h2>Application tracker</h2>
              <p>Your applications, saved to your account.</p>
            </div>
            <button
              className="text-button"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "Show less" : "View all"}
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="table-toolbar">
            <div className="tabs">
              <button
                className={filter === "all" ? "selected" : ""}
                onClick={() => setFilter("all")}
              >
                All <span>{apps.length}</span>
              </button>
              <button
                className={filter === "applied" ? "selected" : ""}
                onClick={() => setFilter("applied")}
              >
                Applied
              </button>
              <button
                className={filter === "interview" ? "selected" : ""}
                onClick={() => setFilter("interview")}
              >
                Interview
              </button>
              <button
                className={filter === "offer" ? "selected" : ""}
                onClick={() => setFilter("offer")}
              >
                Offer
              </button>
              <button
                className={filter === "rejected" ? "selected" : ""}
                onClick={() => setFilter("rejected")}
              >
                Closed
              </button>
            </div>
            <div className="table-controls">
              <div className="table-search">
                <Search size={14} />
                <input
                  id="app-search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search..."
                />
              </div>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>COMPANY & ROLE</th>
                  <th>STATUS</th>
                  <th>APPLIED</th>
                  <th>SOURCE</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, showAll ? rows.length : 5).map((app) => (
                  <tr key={app.id}>
                    <td>
                      <div className="company-cell">
                        <div
                          className="company-logo"
                          style={{ background: app.color }}
                        >
                          {app.logo}
                        </div>
                        <div>
                          <div className="company-name">{app.company}</div>
                          <div className="role-name">{app.role}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`status-chip ${statusInfo[app.status].className}`}
                      >
                        <i /> {statusInfo[app.status].label}
                      </span>
                    </td>
                    <td>
                      <span className="date-text">{app.date}</span>
                      <span className="date-age">
                        {app.ageDays !== undefined
                          ? `${app.ageDays} days ago`
                          : app.status === "applied"
                            ? "Just added"
                            : ""}
                      </span>
                    </td>
                    <td>
                      <span className="source">
                        <span
                          className={
                            app.source === "Email"
                              ? "source-mail"
                              : "source-manual"
                          }
                        >
                          {app.source === "Email" ? (
                            <Inbox size={12} />
                          ) : (
                            <FileText size={12} />
                          )}
                        </span>
                        {app.source ?? "Manual"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="empty-state">
                {apps.length === 0 ? (
                  <>
                    <p>
                      {signedIn
                        ? "No applications saved yet."
                        : "Sign in to see your saved applications."}
                    </p>
                    <QuickAddTrigger className="empty-action">Add your first application <ArrowRight size={13} /></QuickAddTrigger>
                  </>
                ) : (
                  "No applications match your search."
                )}
              </div>
            )}
          </div>
          <div className="table-bottom">
            <span>
              Showing <b>{Math.min(rows.length, showAll ? rows.length : 5)}</b>{" "}
              of <b>{apps.length}</b> applications
            </span>
          </div>
        </section>
        <aside className="right-column">
          <section className="followup-card" id="followups">
            <div className="followup-heading">
              <span className="followup-icon">
                <Clock3 size={16} />
              </span>
              <span>FOLLOW-UP REMINDERS</span>
            </div>
            <h3>
              {dueApps.length ? "Time to follow up" : "No follow-ups due"}
            </h3>
            <p>
              {dueApps.length
                ? "A quick note can help bring these applications back to the top of the pile."
                : signedIn
                  ? "We’ll show a reminder here when a scheduled follow-up is due."
                  : "Sign in to see reminders for your applications."}
            </p>
            {dueApps.map((item) => {
              const app = item.applications!;
              const days = item.daysOverdue;
              return (
                <div className="followup-company" key={item.id}>
                  <div
                    className="company-logo small-logo"
                    style={{ background: "#5c62d6" }}
                  >
                    {app.company_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <strong>{app.company_name}</strong>
                    <span>{app.job_role}</span>
                  </div>
                  <span className="days-pill">
                    {days === 0 ? "Due today" : `${days}d overdue`}
                  </span>
                </div>
              );
            })}
            {dueApps.length > 0 && (
              <button
                className="followup-button"
                onClick={() => {
                  const app = dueApps[0].applications!;
                  draftFollowup({
                    company: app.company_name,
                    role: app.job_role,
                  });
                }}
              >
                <Send size={14} /> Draft follow-up email
              </button>
            )}
          </section>
          <section className="email-card">
            <div className="email-card-top">
              <div>
                <span className="mini-label">YOUR RADAR ADDRESS</span>
                <div className="email-icon">
                  <Send size={17} />
                </div>
              </div>
              <span className="connected">
                <i /> {signedIn && alias ? "CONNECTED" : "NOT CONNECTED"}
              </span>
            </div>
            <div className="email-address">
              {alias || "Sign in to receive your address"}
            </div>
            <p>Forward job emails here to track their status automatically.</p>
            <button
              className="copy-button"
              disabled={!alias}
              onClick={copyEmail}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
              {copied ? "Copied to clipboard" : "Copy email address"}
            </button>
            <Link
              href={signedIn ? "/dashboard/settings" : "/login"}
              className="email-settings"
            >
              {signedIn ? "Set up forwarding" : "Sign in to set up forwarding"}{" "}
              <ArrowRight size={13} />
            </Link>
          </section>
        </aside>
      </div>
      <section className="prep-banner">
        <div className="prep-symbol">
          <Target size={19} />
        </div>
        <div className="prep-copy">
          <span>YOUR NEXT MOVE</span>
          <strong>
            {apps.some((app) => app.status === "interview")
              ? "Your interview prep is ready when you are."
              : apps.some((app) => app.status === "rejected")
                ? "Every outcome can inform your next move."
                : "Prepare for your next opportunity."}
          </strong>
          <small>
            Explore role matched prep or turn a rejection into a learning step.
          </small>
        </div>
        <Link href="/dashboard/prep" className="prep-link">
          Explore prep library <ArrowRight size={14} />
        </Link>
      </section>
      <footer className="dashboard-footer">
        <span>© 2026 Apply Radar</span>
        <span>
          <Link href="/dashboard/settings#forwarding">Help</Link>
          <span>
            Made for the ones who keep going <span className="heart">♥</span>
          </span>
        </span>
      </footer>
    </div>
  );
}
