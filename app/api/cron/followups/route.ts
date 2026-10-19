import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseAdminReady } from "@/lib/supabase-admin";

type DueFollowup = {
  id: string;
  applications: {
    company_name: string;
    job_role: string;
    profiles: { full_name: string | null; id: string };
  };
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabaseAdminReady())
    return NextResponse.json(
      { error: "Server database configuration is missing." },
      { status: 503 },
    );
  const resendKey = process.env.RESEND_API_KEY;
  const reminderFrom = process.env.REMINDER_FROM_EMAIL;
  if (!resendKey || !reminderFrom)
    return NextResponse.json(
      { error: "Reminder email delivery is not configured." },
      { status: 503 },
    );
  try {
    const due = await supabaseAdmin<DueFollowup[]>(
      `followups?is_sent=eq.false&scheduled_for=lte.${encodeURIComponent(new Date().toISOString())}&applications.status=eq.applied&select=id,applications!inner(company_name,job_role,profiles(full_name,id))&limit=100`,
    );
    let sent = 0;
    for (const followup of due) {
      const { company_name, job_role, profiles } = followup.applications;
      const emails = await supabaseAdmin<Array<{ email_address: string }>>(
        `linked_emails?user_id=eq.${profiles.id}&is_verified=eq.true&select=email_address&limit=1`,
      );
      const recipient = emails[0]?.email_address;
      if (!recipient) continue;
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: reminderFrom,
          to: [recipient],
          subject: `A gentle nudge: ${company_name}`,
          text: `Hi${profiles.full_name ? ` ${profiles.full_name}` : ""},\n\nIt has been 14 days since you applied for ${job_role} at ${company_name}. If you have not heard back, you may want to send a short follow-up.\n\nYou’ve got this,\nApply Radar`,
        }),
      });
      if (!response.ok) continue;
      await supabaseAdmin(`followups?id=eq.${followup.id}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ is_sent: true }),
      });
      sent += 1;
    }
    return NextResponse.json({ processed: due.length, sent });
  } catch (error) {
    console.error("Follow-up reminder job failed", error);
    return NextResponse.json(
      { error: "Unable to send due follow-up reminders." },
      { status: 500 },
    );
  }
}
