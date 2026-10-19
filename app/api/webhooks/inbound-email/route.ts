import { NextResponse } from "next/server";
import { parseJobEmail } from "@/lib/parser";
import { findPrepResources } from "@/lib/prep-search";
import { supabaseAdmin, supabaseAdminReady } from "@/lib/supabase-admin";
import { InboundEmailSchema } from "@/lib/validation";

type Profile = { id: string; assigned_alias: string };
type ApplicationRow = { id: string };

export async function POST(request: Request) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || request.headers.get("x-webhook-secret") !== secret)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdminReady())
    return NextResponse.json(
      { error: "Server database configuration is missing." },
      { status: 503 },
    );
  const json: unknown = await request.json().catch(() => null);
  const validation = InboundEmailSchema.safeParse(json);
  if (!validation.success)
    return NextResponse.json(
      {
        error: "Invalid inbound email payload.",
        details: validation.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  const payload = validation.data;
  const alias = payload.recipientAlias.trim().toLowerCase();
  const subject = payload.subject;
  const body = payload.body;
  try {
    const profiles = await supabaseAdmin<Profile[]>(
      `profiles?assigned_alias=eq.${encodeURIComponent(alias)}&select=id,assigned_alias&limit=1`,
    );
    const profile = profiles[0];
    if (!profile)
      return NextResponse.json(
        { error: "No profile is assigned to this alias." },
        { status: 404 },
      );
    const parsed = parseJobEmail(subject, body);
    const resources = parsed.status === "interview" || parsed.status === "rejected"
      ? await findPrepResources(parsed.jobRole, parsed.companyName, parsed.status, process.env.YOUTUBE_API_KEY)
      : [];
    const existing = await supabaseAdmin<ApplicationRow[]>(
      `applications?user_id=eq.${profile.id}&company_name=eq.${encodeURIComponent(parsed.companyName)}&job_role=eq.${encodeURIComponent(parsed.jobRole)}&select=id&limit=1`,
    );
    const application = {
      user_id: profile.id,
      company_name: parsed.companyName,
      job_role: parsed.jobRole,
      source: "email",
      status: parsed.status,
      last_updated_at: new Date().toISOString(),
      raw_subject: subject,
      raw_sender: payload.sender,
      raw_body: body,
      prep_resources: resources,
    };
    let saved: ApplicationRow[];
    if (existing[0]) {
      saved = await supabaseAdmin<ApplicationRow[]>(
        `applications?id=eq.${existing[0].id}&select=id`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(application),
        },
      );
    } else {
      saved = await supabaseAdmin<ApplicationRow[]>("applications?select=id", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(application),
      });
    }
    const applicationId = saved[0]?.id ?? existing[0]?.id;
    return NextResponse.json({
      ok: true,
      applicationId,
      status: parsed.status,
      company: parsed.companyName,
      resources,
    });
  } catch (error) {
    console.error("Inbound email processing failed", error);
    return NextResponse.json(
      { error: "Unable to process the inbound email." },
      { status: 500 },
    );
  }
}
