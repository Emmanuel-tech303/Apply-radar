import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAdminReady } from "@/lib/supabase-admin";
import { ForwardingVerificationSchema } from "@/lib/validation";

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
  const validation = ForwardingVerificationSchema.safeParse(json);
  if (!validation.success)
    return NextResponse.json(
      {
        error: "Invalid verification payload.",
        details: validation.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  const payload = validation.data;
  const alias = payload.recipientAlias.trim().toLowerCase();
  try {
    const rows = await supabaseAdmin<Array<{ id: string }>>(
      `profiles?assigned_alias=eq.${encodeURIComponent(alias)}&select=id&limit=1`,
    );
    if (!rows[0])
      return NextResponse.json(
        { error: "No profile is assigned to this alias." },
        { status: 404 },
      );
    // Display the code to the signed-in user so they can finish Google's setup.
    // Never follow verification links from an inbound message.
    let safeVerificationLink: string | null = null;
    if (payload?.verificationLink) {
      try {
        const candidate = new URL(payload.verificationLink);
        if (
          candidate.protocol === "https:" &&
          (candidate.hostname === "google.com" ||
            candidate.hostname.endsWith(".google.com"))
        )
          safeVerificationLink = candidate.toString();
      } catch {
        /* Ignore malformed links in the message. */
      }
    }
    if (payload?.verificationCode || safeVerificationLink)
      await supabaseAdmin(`profiles?id=eq.${rows[0].id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          forwarding_verification_code: payload.verificationCode ?? null,
          forwarding_verification_link: safeVerificationLink,
          forwarding_verification_received_at: new Date().toISOString(),
        }),
      });
    return NextResponse.json({
      ok: true,
      userId: rows[0].id,
      sender: payload?.sender ?? "forwarding-noreply@google.com",
      verificationReceived: Boolean(
        payload?.verificationCode || safeVerificationLink,
      ),
    });
  } catch (error) {
    console.error("Forwarding verification lookup failed", error);
    return NextResponse.json(
      { error: "Unable to resolve the forwarding alias." },
      { status: 500 },
    );
  }
}
