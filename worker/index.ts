import PostalMime from "postal-mime";

interface Env {
  APP_BASE_URL: string;
  WEBHOOK_SECRET: string;
  CRON_SECRET: string;
}
interface EmailMessage {
  from: string;
  to: string;
  raw: ReadableStream<Uint8Array>;
}

function firstAddress(value: string): string {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return (match?.[0] ?? value).trim().toLowerCase();
}

export default {
  async email(message: EmailMessage, env: Env): Promise<void> {
    const recipientAlias = firstAddress(message.to);
    const parsed = await new PostalMime().parse(message.raw);
    const subject = parsed.subject ?? "";
    const body =
      parsed.text ??
      parsed.html?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ") ??
      "";
    const htmlVerificationLink = parsed.html?.match(
      /href=["'](https:\/\/[^"']+)["']/i,
    )?.[1];
    const sender = firstAddress(parsed.from?.address ?? message.from);
    const endpoint =
      sender === "forwarding-noreply@google.com"
        ? "verify-forwarding"
        : "inbound-email";
    const payload =
      endpoint === "verify-forwarding"
        ? {
            recipientAlias,
            sender,
            verificationCode: body.match(/\b\d{9}\b/)?.[0],
            verificationLink:
              body.match(/https?:\/\/[^\s<>"']+/i)?.[0] ?? htmlVerificationLink,
            subject,
          }
        : { recipientAlias, sender, subject, body };
    const response = await fetch(
      `${env.APP_BASE_URL.replace(/\/$/, "")}/api/webhooks/${endpoint}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": env.WEBHOOK_SECRET,
        },
        body: JSON.stringify(payload),
      },
    );
    if (!response.ok)
      throw new Error(`Apply Radar webhook returned ${response.status}`);
  },
  async scheduled(_event: { scheduledTime: number }, env: Env): Promise<void> {
    const response = await fetch(
      `${env.APP_BASE_URL.replace(/\/$/, "")}/api/cron/followups`,
      {
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      },
    );
    if (!response.ok)
      throw new Error(`Apply Radar reminder job returned ${response.status}`);
  },
};
