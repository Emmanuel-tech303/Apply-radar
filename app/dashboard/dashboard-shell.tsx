"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  Clock3,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  X,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { DashboardBreadcrumb, HomeBreadcrumb } from "./breadcrumb";
import { QuickAddModal } from "./quick-add-modal";
import { QuickAddTrigger } from "./quick-add-trigger";

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [name, setName] = useState("Your account");
  const [email, setEmail] = useState("Sign in to get started");
  const [count, setCount] = useState(0);
  const [signedIn, setSignedIn] = useState(false);
  const [initials, setInitials] = useState("A");

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    void client.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) return;
      setSignedIn(true);
      setEmail(user.email ?? "");
      const fallbackName =
        typeof user.user_metadata.full_name === "string"
          ? user.user_metadata.full_name
          : (user.email?.split("@")[0] ?? "Your account");
      let fullName = fallbackName;
      const [profile, applications] = await Promise.all([
        client
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle(),
        client
          .from("applications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id),
      ]);
      if (profile.data?.full_name) fullName = profile.data.full_name;
      setName(fullName);
      setInitials(
        fullName
          .split(/\s+/)
          .map((part) => part[0])
          .join("")
          .slice(0, 2)
          .toUpperCase() || "A",
      );
      setCount(applications.count ?? 0);
    });
  }, []);

  const navLink = (
    href: string,
    label: string,
    icon: ReactNode,
    active: boolean,
    countLabel?: number,
  ) => (
    <Link
      className={`nav-item ${active ? "active" : ""}`}
      href={href}
      onClick={() => setMobileMenu(false)}
      key={label}
    >
      {icon}
      {label}
      {countLabel !== undefined && (
        <span className="nav-count">{countLabel}</span>
      )}
    </Link>
  );
  const overview = pathname === "/dashboard";
  const label =
    pathname === "/dashboard"
      ? "Dashboard"
      : pathname === "/dashboard/inbox"
        ? "Inbox"
        : pathname === "/dashboard/prep"
          ? "Prep library"
          : pathname === "/dashboard/applications"
              ? "Applications"
              : pathname === "/dashboard/followups"
                ? "Follow-ups"
                : "Settings";

  return (
    <main className="app-shell">
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <Activity size={18} strokeWidth={2.5} />
          </span>
          <span>
            apply<span className="brand-light">radar</span>
          </span>
          <button
            className="close-menu"
            aria-label="Close menu"
            onClick={() => setMobileMenu(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Workspace navigation">
          {navLink(
            "/dashboard",
            "Overview",
            <LayoutDashboard size={17} />,
            overview,
            count,
          )}
          {navLink(
            "/dashboard/inbox",
            "Connected inbox",
            <Inbox size={17} />,
            pathname === "/dashboard/inbox",
          )}
          {navLink(
            "/dashboard/applications",
            "Applications",
            <BriefcaseBusiness size={17} />,
            pathname === "/dashboard/applications",
          )}
          {navLink(
            "/dashboard/followups",
            "Follow-ups",
            <Clock3 size={17} />,
            pathname === "/dashboard/followups",
          )}
          {navLink(
            "/dashboard/prep",
            "Prep library",
            <BookOpen size={17} />,
            pathname === "/dashboard/prep",
          )}
        </nav>
        <div className="nav-label label-spaced">PERSONAL</div>
        <nav className="side-nav" aria-label="Personal navigation">
          {navLink(
            "/dashboard/settings",
            "Settings",
            <Settings size={17} />,
            pathname === "/dashboard/settings",
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="streak-card">
            <div className="streak-top">
              <span className="streak-icon">
                <BriefcaseBusiness size={15} />
              </span>
              <span>START WITH ONE STEP</span>
            </div>
            <div className="streak-text">
              Add a role you’re interested in. Your tracker will take it from
              there.
            </div>
            <QuickAddTrigger className="streak-action" ariaLabel="Add an application" onClick={() => setMobileMenu(false)}>Add an application <ArrowRight size={12}/></QuickAddTrigger>
          </div>
          <div className="profile-row">
            <div className="avatar avatar-large">{initials}</div>
            <div className="profile-info">
              <strong>{signedIn ? name : "Your account"}</strong>
              <span>{email}</span>
            </div>
            {signedIn ? (
              <button
                className="profile-logout"
                aria-label="Sign out of Apply Radar"
                title="Sign out"
                onClick={async () => {
                  const client = getSupabaseBrowserClient();
                  if (client) await client.auth.signOut();
                  router.replace("/dashboard");
                  router.refresh();
                }}
              >
                <LogOut size={15} />
              </button>
            ) : (
              <Link className="profile-login" href="/login">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="mobile-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <section className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-toggle"
            aria-label="Open navigation"
            onClick={() => setMobileMenu(true)}
          >
            <Menu size={19} />
          </button>
          {overview ? (
            <HomeBreadcrumb current="Dashboard" />
          ) : (
            <DashboardBreadcrumb current={label} />
          )}
          <div className="topbar-actions">
            <Link
              className="avatar avatar-top"
              href={signedIn ? "/dashboard/settings" : "/login"}
              aria-label="Open account settings"
            >
              {signedIn ? initials : <Check size={14} />}
            </Link>
          </div>
        </header>
        {children}
      </section>
      <QuickAddModal />
    </main>
  );
}
