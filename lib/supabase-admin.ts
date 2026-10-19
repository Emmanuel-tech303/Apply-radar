const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function supabaseAdminReady(): boolean {
  return Boolean(baseUrl && serviceRoleKey);
}

export async function supabaseAdmin<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!baseUrl || !serviceRoleKey)
    throw new Error("Supabase server configuration is missing.");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  const content = await response.text();
  if (!response.ok)
    throw new Error(`Supabase request failed (${response.status}): ${content}`);
  return (content ? JSON.parse(content) : null) as T;
}
