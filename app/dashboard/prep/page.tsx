"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  BriefcaseBusiness,
  LoaderCircle,
  Search,
} from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type Resource = {
  title: string;
  url: string;
  description: string;
  source: string;
  category: string;
  rating?: number;
  ratingCount?: number;
  viewCount?: number;
  rankReason?: string;
};
type SavedApplication = {
  id: string;
  company_name: string;
  job_role: string;
  status: string;
  prep_resources: unknown;
};

const interviewCategories = [
  "Books & reading",
  "YouTube videos",
  "Employee interview experiences",
  "Practice & role guides",
];
const rejectionCategories = [
  "Lessons from rejection",
  "Resume & portfolio",
  "Books & role learning",
  "Interview experiences & lessons",
];
const isResourceList = (value: unknown): value is Resource[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      "category" in item &&
      "url" in item &&
      "title" in item &&
      "source" in item &&
      "description" in item,
  );

export default function PrepPage() {
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [applications, setApplications] = useState<SavedApplication[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [resources, setResources] = useState<Resource[]>([]);
  const [searchedRole, setSearchedRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [roleError, setRoleError] = useState("");

  async function loadResources(
    jobRole: string,
    employer: string,
    applicationId?: string,
    status = "interview",
  ) {
    const cleanRole = jobRole.trim();
    if (cleanRole.length < 2) {
      setRoleError("Enter a job title with at least 2 characters.");
      return;
    }
    setRoleError("");
    setLoading(true);
    setError("");
    setResources([]);
    try {
      const client = getSupabaseBrowserClient();
      const { data: auth } = await client?.auth.getSession() ?? { data: { session: null } };
      if (!auth.session) throw new Error("Sign in to search preparation resources.");
      const response = await fetch(
        `/api/prep/search?role=${encodeURIComponent(cleanRole)}&company=${encodeURIComponent(employer.trim())}&status=${status}`,
        { headers: { Authorization: `Bearer ${auth.session.access_token}` } },
      );
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        role?: string;
        resources?: Resource[];
      };
      if (!response.ok)
        throw new Error(payload.error ?? "Could not find resources right now.");
      const found = payload.resources ?? [];
      if (!found.length)
        throw new Error(payload.message ?? "No matching resources were found. Try again in a moment.");
      setResources(found);
      setSearchedRole(payload.role ?? cleanRole);
      if (applicationId) {
        const client = getSupabaseBrowserClient();
        const saved = await client
          ?.from("applications")
          .update({ prep_resources: found })
          .eq("id", applicationId);
        if (saved?.error)
          setError(
            "Resources loaded, but could not be saved to this application.",
          );
        else
          setApplications((current) =>
            current.map((item) =>
              item.id === applicationId
                ? { ...item, prep_resources: found }
                : item,
            ),
          );
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not find resources right now.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    void client.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const result = await client
        .from("applications")
        .select("id,company_name,job_role,status,prep_resources")
        .eq("user_id", data.user.id)
        .order("last_updated_at", { ascending: false })
        .limit(50);
      if (!result.data?.length) return;
      const saved = result.data as SavedApplication[];
      setApplications(saved);
      // An active interview is the most urgent prep context. Otherwise, keep
      // the library useful by defaulting to the user's most recently updated role.
      const focus =
        saved.find((item) => item.status === "interview") ?? saved[0];
      setSelectedId(focus.id);
      setRole(focus.job_role);
      setCompany(focus.company_name);
      if (isResourceList(focus.prep_resources)) {
        setResources(focus.prep_resources);
        setSearchedRole(focus.job_role);
      } else {
        void loadResources(
          focus.job_role,
          focus.company_name,
          focus.id,
          focus.status,
        );
      }
    });
  }, []);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = applications.find((item) => item.id === selectedId);
    const matchesSavedRole =
      selected &&
      selected.job_role === role &&
      selected.company_name === company;
    void loadResources(
      role,
      company,
      matchesSavedRole ? selected.id : undefined,
      matchesSavedRole ? selected.status : "interview",
    );
  }

  function chooseApplication(application: SavedApplication) {
    setSelectedId(application.id);
    setRole(application.job_role);
    setCompany(application.company_name);
    if (isResourceList(application.prep_resources)) {
      setResources(application.prep_resources);
      setSearchedRole(application.job_role);
      setError("");
    } else {
      void loadResources(
        application.job_role,
        application.company_name,
        application.id,
        application.status,
      );
    }
  }

  const selectedApplication = applications.find(
    (item) =>
      item.id === selectedId &&
      item.job_role === role &&
      item.company_name === company,
  );
  const isInterview = selectedApplication?.status === "interview";
  const isRejected = selectedApplication?.status === "rejected";
  const categories = isRejected ? rejectionCategories : interviewCategories;

  return (
    <section className="subpage prep-page">
      <div className="subpage-heading">
        <div className="eyebrow">
          <span className="live-dot" /> PREP FOR YOUR NEXT STEP
        </div>
        <h1>
          {isInterview
            ? "Your interview prep is ready."
            : isRejected
              ? "Turn this into your next step."
              : "Prepare for your role."}
        </h1>
        <p className="subpage-intro">
          {isInterview
            ? `Your ${role} application at ${company} is at interview stage. Role specific resources are saved with your application.`
            : isRejected
              ? `Use this ${role} outcome as useful signal. Review your materials, build the skills for the role, and learn from others who interviewed at ${company}.`
              : "Resources follow your saved applications. When an application moves to interview, its tailored prep is brought to the top automatically."}
        </p>
      </div>
      <form className="prep-search-card" noValidate onSubmit={submit}>
        <div className="card-kicker">
          <BriefcaseBusiness size={15} /> YOUR PERSONAL PREP LIST
        </div>
        <label className="prep-search-label" htmlFor="prep-role">
          Job title
        </label>
        <div className="prep-fields">
          <div className="prep-role-field">
            <input
              id="prep-role"
              required
              value={role}
              aria-invalid={Boolean(roleError)}
              aria-describedby="prep-role-error"
              onChange={(event) => { setRole(event.target.value); setRoleError(""); }}
              placeholder="e.g. Junior Frontend Developer"
              maxLength={120}
            />
            <output id="prep-role-error" className="field-error">{roleError}</output>
          </div>
          <input
            aria-label="Company (optional)"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            placeholder="Company (optional)"
            maxLength={80}
          />
          <button className="primary-button" disabled={loading} type="submit">
            {loading ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <Search size={15} />
            )}{" "}
            {loading ? "Searching" : "Search resources"}
          </button>
        </div>
        {applications.length > 0 ? (
          <div className="prep-saved-roles">
            <span>YOUR SAVED ROLES</span>
            {applications.map((application) => (
              <button
                className={`${application.id === selectedId ? "role-selected" : ""} ${application.status === "interview" ? "role-interview" : ""}`}
                type="button"
                key={application.id}
                onClick={() => chooseApplication(application)}
              >
                {application.job_role}{" "}
                <span>
                  · {application.company_name}
                  {application.status === "interview" ? " · Interview" : ""}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="prep-no-roles">
            No saved roles yet. Add an application and we’ll build this list
            around it, or search any job title above.
          </p>
        )}
        {error && (
          <p className="prep-error" role="alert">
            {error}
          </p>
        )}
      </form>
      <div className="prep-section-label">
        <BookOpen size={14} />
        {searchedRole
          ? `PREP FOR ${searchedRole.toUpperCase()}`
          : "YOUR PREP RESOURCES"}
      </div>
      {loading ? (
        <div className="prep-empty">
          <LoaderCircle className="spin" size={18} />
          <p>Finding role specific material…</p>
        </div>
      ) : resources.length ? (
        <div className="prep-groups">
          {categories.map((category) => {
            const items = resources.filter(
              (resource) => resource.category === category,
            );
            if (!items.length) return null;
            return (
              <section className="prep-resource-group" key={category}>
                <h2>{category}</h2>
                <div className="prep-layout">
                  {items.map((resource, index) => (
                    <article
                      className="resource-card"
                      key={`${resource.url}-${index}`}
                    >
                      <span className="resource-tag">
                        {resource.source.toUpperCase()}
                      </span>
                      <h3>{resource.title}</h3>
                      <p>{resource.description}</p>
                      {resource.rankReason && <span className="resource-rank">{resource.rankReason}</span>}
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open resource <ArrowUpRight size={13} />
                      </a>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="prep-empty">
          <Search size={18} />
          <p>
            Save a role to see its prep here automatically, or enter a job title
            above to search for tailored resources.
          </p>
        </div>
      )}
      {isRejected && (
        <section className="rejection-reflection">
          <div>
            <strong>Take one useful lesson forward</strong>
            <span>
              A rejection is an outcome, not a measure of your potential.
            </span>
          </div>
          <ul>
            <li>Write down one part of the process that felt strong.</li>
            <li>
              Choose one skill or story to sharpen before the next interview.
            </li>
            <li>
              If appropriate, ask the recruiter for one specific piece of
              feedback.
            </li>
          </ul>
        </section>
      )}
      <div className="prep-encouragement">
        <BookOpen size={16} />
        <span>
          These resources are saved to the selected application. Open each
          source to confirm it matches what you need to practice.
        </span>
      </div>
    </section>
  );
}
