import { NextResponse } from "next/server";
import { z } from "zod";
import { findPrepResources, type PrepStatus } from "@/lib/prep-search";

const SearchQuery = z.string().trim().min(2).max(120);
const CompanyQuery = z.string().trim().max(80).optional().default("");

export async function GET(request: Request) {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const bearer = request.headers.get("authorization");
  if (!projectUrl || !anonKey)
    return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  if (!bearer?.startsWith("Bearer "))
    return NextResponse.json({ error: "Sign in to search preparation resources." }, { status: 401 });
  const identity = await fetch(`${projectUrl.replace(/\/$/, "")}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: bearer },
    cache: "no-store",
  }).catch(() => null);
  if (!identity?.ok)
    return NextResponse.json({ error: "Your session is no longer valid. Sign in again." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const parsedRole = SearchQuery.safeParse(params.get("role") ?? "");
  const parsedCompany = CompanyQuery.safeParse(params.get("company") ?? "");
  if (!parsedRole.success || !parsedCompany.success) {
    return NextResponse.json({ error: "Enter a valid job title and company." }, { status: 400 });
  }
  const status: PrepStatus = params.get("status") === "rejected" ? "rejected" : "interview";
  const resources = await findPrepResources(parsedRole.data, parsedCompany.data, status, process.env.YOUTUBE_API_KEY);
  return NextResponse.json({
    role: parsedRole.data,
    company: parsedCompany.data || null,
    status,
    rankedBy: process.env.YOUTUBE_API_KEY ? "video views and book review signals" : "search relevance and available book ratings",
    resources,
    message: resources.length ? undefined : "No matching resources were found right now. Try again in a moment.",
  });
}
