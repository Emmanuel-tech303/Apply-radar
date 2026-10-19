"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Inbox,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { QuickApplicationSchema } from "@/lib/validation";
import { QuickAddTrigger } from "../quick-add-trigger";

type Status = "applied" | "interview" | "offer" | "rejected";
type Application = {
  id: string;
  company_name: string;
  job_role: string;
  status: Status;
  source: string;
  created_at: string;
  last_updated_at: string;
  job_url: string | null;
  user_notes: string | null;
};
type Draft = {
  company: string;
  role: string;
  status: Status;
  jobUrl: string;
  notes: string;
};
type EditField = "company" | "role" | "jobUrl";
const statuses: Status[] = ["applied", "interview", "offer", "rejected"];
const labels: Record<Status, string> = {
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Closed",
};
const emptyDraft: Draft = {
  company: "",
  role: "",
  status: "applied",
  jobUrl: "",
  notes: "",
};

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Application | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editErrors, setEditErrors] = useState<Partial<Record<EditField, string>>>({});

  async function loadApplications() {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setError("Connect Supabase to load your application records.");
      setLoading(false);
      return;
    }
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) {
      setError("Sign in to view your applications.");
      setLoading(false);
      return;
    }
    const result = await client
      .from("applications")
      .select(
        "id,company_name,job_role,status,source,created_at,last_updated_at,job_url,user_notes",
      )
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false });
    if (result.error)
      setError(
        "Could not load applications. Check your Supabase schema and connection.",
      );
    else setApplications((result.data ?? []) as Application[]);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadApplications();
    }, 0);
    const refresh = () => void loadApplications();
    window.addEventListener("applyradar:application-added", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("applyradar:application-added", refresh);
    };
  }, []);
  const filtered = useMemo(
    () =>
      applications.filter(
        (application) =>
          (filter === "all" || application.status === filter) &&
          `${application.company_name} ${application.job_role}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [applications, filter, query],
  );

  async function saveStageResources(
    client: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
    application: Pick<Application, "id" | "company_name" | "job_role">,
    status: Status,
  ) {
    if (status !== "interview" && status !== "rejected") return;
    try {
      const { data: auth } = await client.auth.getSession();
      if (!auth.session) throw new Error("Sign in to search preparation resources.");
      const response = await fetch(
        `/api/prep/search?role=${encodeURIComponent(application.job_role)}&company=${encodeURIComponent(application.company_name)}&status=${status}`,
        { headers: { Authorization: `Bearer ${auth.session.access_token}` } },
      );
      const payload = (await response.json()) as {
        resources?: unknown[];
        error?: string;
      };
      if (!response.ok || !payload.resources)
        throw new Error(payload.error ?? "Resource search failed.");
      const saved = await client
        .from("applications")
        .update({ prep_resources: payload.resources })
        .eq("id", application.id);
      if (saved.error) throw saved.error;
    } catch {
      setError(
        `${labels[status]} status saved. Tailored resources will be generated when you open Prep Library.`,
      );
    }
  }

  async function changeStatus(application: Application, status: Status) {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    setError("");
    const updatedAt = new Date().toISOString();
    const result = await client
      .from("applications")
      .update({ status, last_updated_at: updatedAt })
      .eq("id", application.id);
    if (result.error) {
      setError("Could not update this application’s status.");
      return;
    }
    setApplications((current) =>
      current.map((item) =>
        item.id === application.id
          ? { ...item, status, last_updated_at: updatedAt }
          : item,
      ),
    );
    await saveStageResources(client, application, status);
  }

  function beginEdit(application: Application) {
    setError("");
    setEditErrors({});
    setEditing(application);
    setDraft({
      company: application.company_name,
      role: application.job_role,
      status: application.status,
      jobUrl: application.job_url ?? "",
      notes: application.user_notes ?? "",
    });
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setEditErrors({});
    const validation = QuickApplicationSchema.safeParse({
      companyName: draft.company,
      jobRole: draft.role,
      notes: draft.notes,
    });
    if (!validation.success) {
      const nextErrors: Partial<Record<EditField, string>> = {};
      for (const issue of validation.error.issues) {
        const field = issue.path[0] === "jobRole" ? "role" : "company";
        nextErrors[field] ??= issue.message;
      }
      setEditErrors(nextErrors);
      document.getElementById(nextErrors.company ? "edit-company" : "edit-role")?.focus();
      return;
    }
    const jobUrl = draft.jobUrl.trim();
    if (jobUrl) {
      try {
        const parsed = new URL(jobUrl);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
          throw new Error();
      } catch {
        setEditErrors({ jobUrl: "Enter a complete link beginning with http:// or https://." });
        document.getElementById("edit-link")?.focus();
        return;
      }
    }
    const client = getSupabaseBrowserClient();
    if (!client) {
      setError("Supabase is not connected.");
      return;
    }
    setBusy(true);
    setError("");
    const updatedAt = new Date().toISOString();
    const update = {
      company_name: validation.data.companyName,
      job_role: validation.data.jobRole,
      status: draft.status,
      job_url: jobUrl || null,
      user_notes: validation.data.notes || null,
      last_updated_at: updatedAt,
    };
    const result = await client
      .from("applications")
      .update(update)
      .eq("id", editing.id);
    if (result.error) {
      setError(
        "Could not save these changes. Apply the application editing migration in Supabase, then try again.",
      );
      setBusy(false);
      return;
    }
    const updated = { ...editing, ...update };
    setApplications((current) =>
      current.map((item) => (item.id === editing.id ? updated : item)),
    );
    setEditing(null);
    await saveStageResources(client, updated, draft.status);
    setBusy(false);
  }

  async function removeApplication(application: Application) {
    if (
      !window.confirm(
        `Delete the ${application.job_role} application at ${application.company_name}? Its follow-up reminders will also be deleted.`,
      )
    )
      return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const result = await client
      .from("applications")
      .delete()
      .eq("id", application.id);
    if (result.error) {
      setError("Could not delete this application.");
      return;
    }
    setApplications((current) =>
      current.filter((item) => item.id !== application.id),
    );
  }

  return (
    <section className="subpage route-page applications-page">
      <div className="subpage-heading">
        <div className="eyebrow">
          <span className="live-dot" /> YOUR JOB SEARCH
        </div>
        <h1>Applications</h1>
        <p className="subpage-intro">
          Every role you’re pursuing, with its latest status in one place. Edit
          the details whenever things change.
        </p>
      </div>
      <div className="route-toolbar">
        <div className="route-search">
          <Search size={15} />
          <input
            aria-label="Search applications"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search company or role"
          />
        </div>
        <QuickAddTrigger className="primary-button">
          <Plus size={15} /> Add application
        </QuickAddTrigger>
      </div>
      <div className="route-filters">
        {(["all", ...statuses] as const).map((status) => (
          <button
            key={status}
            className={filter === status ? "selected" : ""}
            onClick={() => setFilter(status)}
          >
            {status === "all" ? "All applications" : labels[status]}
            <span>
              {status === "all"
                ? applications.length
                : applications.filter(
                    (application) => application.status === status,
                  ).length}
            </span>
          </button>
        ))}
      </div>
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
      <div className="route-list">
        {loading ? (
          <div className="route-empty">Loading your applications…</div>
        ) : filtered.length ? (
          filtered.map((application) => (
            <article className="route-application" key={application.id}>
              <div className="route-company-mark">
                {application.company_name.charAt(0).toUpperCase()}
              </div>
              <div className="route-application-info">
                <h2>{application.company_name}</h2>
                <p>{application.job_role}</p>
                <span>
                  {application.source === "email" ? (
                    <>
                      <Inbox size={12} /> Forwarded email
                    </>
                  ) : (
                    <>
                      <BriefcaseBusiness size={12} /> Quick add
                    </>
                  )}{" "}
                  · Added{" "}
                  {new Date(application.created_at).toLocaleDateString()}
                </span>
              </div>
              <label className="route-status-label">
                <span>Status</span>
                <select
                  aria-label={`Status for ${application.company_name}`}
                  value={application.status}
                  onChange={(event) =>
                    void changeStatus(application, event.target.value as Status)
                  }
                >
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {labels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="route-record-actions">
                <button
                  aria-label={`Edit ${application.company_name}`}
                  title="Edit application"
                  onClick={() => beginEdit(application)}
                >
                  <Pencil size={14} />
                  <span>Edit</span>
                </button>
                <button
                  className="delete-record"
                  aria-label={`Delete ${application.company_name}`}
                  title="Delete application"
                  onClick={() => void removeApplication(application)}
                >
                  <Trash2 size={14} />
                  <span>Delete</span>
                </button>
              </div>
            </article>
          ))
        ) : (
          <div className="route-empty">
            <BriefcaseBusiness size={20} />
            <h2>
              {applications.length
                ? "No matching applications"
                : "Your application list is ready"}
            </h2>
            <p>
              {applications.length
                ? "Try another status or search term."
                : "Add your first role and keep the next steps in view."}
            </p>
            {!applications.length && (
              <QuickAddTrigger className="empty-action">
                Add an application <ArrowRight size={13} />
              </QuickAddTrigger>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div
          className="record-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setEditing(null);
          }}
        >
          <form
            className="record-modal"
            noValidate
            onSubmit={(event) => void saveEdit(event)}
            aria-labelledby="edit-application-title"
          >
            <div className="record-modal-heading">
              <div>
                <span className="eyebrow">UPDATE YOUR TRACKER</span>
                <h2 id="edit-application-title">Edit application</h2>
              </div>
              <button
                type="button"
                className="record-modal-close"
                aria-label="Close editor"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                <X size={17} />
              </button>
            </div>
            {error && (
              <div className="auth-error" role="alert">
                {error}
              </div>
            )}
            <div className="form-field">
              <label htmlFor="edit-company">Company</label>
              <input
                id="edit-company"
                required
                aria-invalid={Boolean(editErrors.company)}
                aria-describedby="edit-company-error"
                maxLength={100}
                value={draft.company}
                onChange={(event) => {
                  setEditErrors((current) => ({ ...current, company: undefined }));
                  setDraft((current) => ({
                    ...current,
                    company: event.target.value,
                  }));
                }}
              />
              <output id="edit-company-error" className="field-error">{editErrors.company}</output>
            </div>
            <div className="form-field">
              <label htmlFor="edit-role">Role</label>
              <input
                id="edit-role"
                required
                aria-invalid={Boolean(editErrors.role)}
                aria-describedby="edit-role-error"
                maxLength={120}
                value={draft.role}
                onChange={(event) => {
                  setEditErrors((current) => ({ ...current, role: undefined }));
                  setDraft((current) => ({
                    ...current,
                    role: event.target.value,
                  }));
                }}
              />
              <output id="edit-role-error" className="field-error">{editErrors.role}</output>
            </div>
            <div className="form-field">
              <label htmlFor="edit-status">Status</label>
              <select
                id="edit-status"
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value as Status,
                  }))
                }
              >
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {labels[status]}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="edit-link">
                Job link <span className="optional">OPTIONAL</span>
              </label>
              <input
                id="edit-link"
                type="url"
                aria-invalid={Boolean(editErrors.jobUrl)}
                aria-describedby="edit-link-error"
                maxLength={2000}
                placeholder="https://…"
                value={draft.jobUrl}
                onChange={(event) => {
                  setEditErrors((current) => ({ ...current, jobUrl: undefined }));
                  setDraft((current) => ({
                    ...current,
                    jobUrl: event.target.value,
                  }));
                }}
              />
              <output id="edit-link-error" className="field-error">{editErrors.jobUrl}</output>
            </div>
            <div className="form-field">
              <label htmlFor="edit-notes">
                Your notes <span className="optional">OPTIONAL</span>
              </label>
              <textarea
                id="edit-notes"
                maxLength={1500}
                value={draft.notes}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </div>
            <div className="record-modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
