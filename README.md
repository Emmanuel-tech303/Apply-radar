# Apply Radar

A mobile-first job application tracker built with Next.js, TypeScript, Tailwind CSS, Supabase, and a Cloudflare Email Worker.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and fill in the Supabase project URL, anon key, email alias domain, and server secrets. Reminder delivery also needs Resend settings. YouTube ranking is optional.
3. For a new Supabase project, run `supabase/schema.sql` once in the SQL editor. For an existing project, run every migration in `supabase/migrations/` in date order, including `20261019_workflow_defaults.sql`.
4. Set Supabase Auth's Site URL and allowed redirect URLs to the deployed app origin and its `/welcome` route.
5. Start the app with `npm run dev`.

### Environment values

| Variable | Set in | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel and local `.env.local` | Browser sign-in and user-owned database access |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel and local `.env.local` | Server-only inbound email and reminder database access; never expose to the browser |
| `NEXT_PUBLIC_EMAIL_ALIAS_DOMAIN` | Vercel and local `.env.local` | Domain part of each user's inbound email address, for example `jobs.yourdomain.com` |
| `WEBHOOK_SECRET`, `CRON_SECRET` | Vercel and Cloudflare Worker secrets | Authenticate incoming mail and daily reminder calls; use the same values in both places |
| `RESEND_API_KEY`, `REMINDER_FROM_EMAIL` | Vercel | Send follow-up reminder emails from a verified Resend sender |
| `YOUTUBE_API_KEY` | Vercel (optional) | Add YouTube view counts to role-specific video ranking |
| `APP_BASE_URL` | `worker/wrangler.toml` | Deployed Vercel app URL called by the Worker |

These settings complete app configuration after the Supabase project, email domain, Cloudflare route, and Resend sender exist. The domain and provider setup cannot be replaced by environment variables: those services must first be connected to their accounts.

No sample application records are included. The dashboard reads signed-in users’ records from Supabase, and quick-add requires an authenticated Supabase session. Configure the project values before creating an account or saving applications.

## Email routing

Email routing needs a domain you control; a Vercel `*.vercel.app` address cannot receive mail through Cloudflare Email Routing. Set `NEXT_PUBLIC_EMAIL_ALIAS_DOMAIN` to a subdomain such as `jobs.yourdomain.com` in local and Vercel environments. The signup trigger reads this setting from signup metadata, so no per-user or source-code edits are needed. In Cloudflare, configure Email Routing for that subdomain and route its catch-all address to the Worker in `worker/index.ts`. Set `APP_BASE_URL` in `worker/wrangler.toml` to the deployed Next.js origin and set `WEBHOOK_SECRET` and `CRON_SECRET` as Worker secrets matching the Vercel environment. Deploy the Worker with Wrangler. The Worker forwards messages to `/api/webhooks/inbound-email`, Google forwarding confirmations to `/api/webhooks/verify-forwarding`, and daily follow-up checks to `/api/cron/followups`.

## Reminder delivery

Verify the sender domain in Resend, then configure `RESEND_API_KEY` and `REMINDER_FROM_EMAIL` in Vercel. The same `CRON_SECRET` must be present in Vercel and the Worker. Due reminders are sent to a verified address in `linked_emails` and marked sent only after Resend accepts the message. PostgreSQL creates a 14-day reminder for every new applied application and cancels pending reminders when its status changes.

## Main routes

- `/dashboard` — application tracker and follow-up overview
- `/dashboard/inbox` — connected reminder email and inbound application messages
- `/dashboard/applications` — edit or delete saved application details and update status
- `/dashboard/followups` — manage scheduled reminders
- `/dashboard/settings` — unique email alias and forwarding instructions
- `/dashboard/prep` — role-specific interview preparation and rejection learning resources, saved to each application
- `/login` — Supabase email/password sign-up and sign-in
- `/welcome` — first-use guide shown after sign-up

## Data access and validation

The app uses the Supabase client and PostgreSQL Row Level Security directly; it does not use Prisma. The database model is defined by `supabase/schema.sql`. Zod validates inbound email, forwarding verification, and quick-add inputs. Quick Add is a shared native dialog available from the dashboard, Applications, and welcome screen. Prep search returns individual role-matched books, videos, interview experiences, and guides, ranking books by available Google Books review signals. Add an optional YouTube Data API key as `YOUTUBE_API_KEY` to rank videos by their view counts. Without a key, video discovery falls back to direct video results; it never sends the user to a generic YouTube search page.
