export type PrepStatus = "interview" | "rejected";
export type PrepResource = {
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

type SearchSpec = { category: string; query: string; youtube?: boolean };
type GoogleBook = {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    description?: string;
    averageRating?: number;
    ratingsCount?: number;
    canonicalVolumeLink?: string;
    infoLink?: string;
  };
};
type YouTubeSearchItem = { id?: { videoId?: string }; snippet?: { title?: string; description?: string; channelTitle?: string } };
type YouTubeVideo = { id: string; snippet?: { title?: string; description?: string; channelTitle?: string }; statistics?: { viewCount?: string } };

function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]*>/g, "").trim();
}

function readSearchResults(html: string, category: string, limit = 4): PrepResource[] {
  const resources: PrepResource[] = [];
  const blocks = html.match(/<div[^>]*class="[^"]*result[^"]*"[\s\S]*?(?=<div[^>]*class="[^"]*result[^"]*"|$)/gi) ?? [];
  for (const block of blocks) {
    const anchor = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!anchor) continue;
    try {
      const candidate = new URL(decodeEntities(anchor[1]), "https://duckduckgo.com");
      const url = new URL(candidate.searchParams.get("uddg") ?? candidate.toString());
      if (!/^https?:$/.test(url.protocol) || url.hostname.endsWith("duckduckgo.com")) continue;
      const snippet = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      resources.push({ title: decodeEntities(anchor[2]), url: url.toString(), description: decodeEntities(snippet?.[1] ?? snippet?.[2] ?? "A relevant resource selected from the current results."), source: url.hostname.replace(/^www\./, ""), category, rankReason: "Relevant search match" });
      if (resources.length >= limit) break;
    } catch { /* Ignore malformed search results. */ }
  }
  return resources;
}

async function discoverWeb(spec: SearchSpec): Promise<PrepResource[]> {
  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(spec.query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ApplyRadar/1.0; +https://applyradar.app)" },
      signal: AbortSignal.timeout(6500), cache: "no-store",
    });
    if (!response.ok) return [];
    const found = readSearchResults(await response.text(), spec.category, 5);
    return spec.youtube ? found.filter((item) => /(^|\.)youtube\.com$/.test(new URL(item.url).hostname) && new URL(item.url).pathname === "/watch") : found;
  } catch { return []; }
}

async function searchYouTube(query: string, category: string, apiKey?: string): Promise<PrepResource[]> {
  if (!apiKey) return discoverWeb({ query: `site:youtube.com/watch ${query}`, category, youtube: true });
  try {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.search = new URLSearchParams({ part: "snippet", type: "video", maxResults: "20", order: "relevance", q: query, key: apiKey }).toString();
    const searchResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(7000), cache: "no-store" });
    if (!searchResponse.ok) return discoverWeb({ query: `site:youtube.com/watch ${query}`, category, youtube: true });
    const search = await searchResponse.json() as { items?: YouTubeSearchItem[] };
    const ids = (search.items ?? []).flatMap((item) => item.id?.videoId ? [item.id.videoId] : []);
    if (!ids.length) return [];
    const detailUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailUrl.search = new URLSearchParams({ part: "snippet,statistics", id: ids.join(","), key: apiKey }).toString();
    const detailsResponse = await fetch(detailUrl, { signal: AbortSignal.timeout(7000), cache: "no-store" });
    if (!detailsResponse.ok) return [];
    const details = await detailsResponse.json() as { items?: YouTubeVideo[] };
    return (details.items ?? []).map((item) => {
      const views = Number(item.statistics?.viewCount ?? 0);
      return {
        title: decodeEntities(item.snippet?.title ?? "Video resource"),
        url: `https://www.youtube.com/watch?v=${encodeURIComponent(item.id)}`,
        description: decodeEntities(item.snippet?.description ?? "Role relevant interview preparation." ).slice(0, 260),
        source: item.snippet?.channelTitle ?? "YouTube",
        category,
        viewCount: views,
        rankReason: `${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(views)} views`,
      };
    }).sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0)).slice(0, 5);
  } catch { return discoverWeb({ query: `site:youtube.com/watch ${query}`, category, youtube: true }); }
}

async function searchBooks(query: string, category: string): Promise<PrepResource[]> {
  try {
    const url = new URL("https://www.googleapis.com/books/v1/volumes");
    url.search = new URLSearchParams({ q: query, maxResults: "20", orderBy: "relevance", printType: "books" }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(7000), cache: "no-store" });
    if (!response.ok) return [];
    const payload = await response.json() as { items?: GoogleBook[] };
    return (payload.items ?? []).flatMap((book) => {
      const info = book.volumeInfo;
      if (!book.id || !info?.title) return [];
      const rating = info.averageRating;
      const ratingCount = info.ratingsCount ?? 0;
      return [{
        title: info.title,
        url: info.canonicalVolumeLink ?? info.infoLink ?? `https://books.google.com/books?id=${encodeURIComponent(book.id)}`,
        description: `${info.authors?.join(", ") ? `By ${info.authors.join(", ")}. ` : ""}${decodeEntities(info.description ?? "A book selected for this role and preparation stage.").slice(0, 240)}`,
        source: "Google Books",
        category,
        rating,
        ratingCount,
        rankReason: rating ? `${rating.toFixed(1)} / 5 · ${ratingCount.toLocaleString()} ratings` : "Role relevant book",
      }];
    }).sort((a, b) => {
      const scoreA = (a.rating ?? 0) * Math.log10((a.ratingCount ?? 0) + 1);
      const scoreB = (b.rating ?? 0) * Math.log10((b.ratingCount ?? 0) + 1);
      return scoreB - scoreA;
    }).slice(0, 5);
  } catch { return []; }
}

export async function findPrepResources(role: string, company = "", status: PrepStatus = "interview", youtubeApiKey?: string): Promise<PrepResource[]> {
  const job = role.trim();
  const employer = company.trim();
  const org = employer ? ` ${employer}` : "";
  const specs: SearchSpec[] = status === "rejected" ? [
    { category: "Lessons from rejection", query: `how to learn from a job rejection career resilience what to do next` },
    { category: "Resume & portfolio", query: `${job} resume portfolio examples how to improve` },
    { category: "Books & role learning", query: `${job} career development best books skills` },
    { category: "Interview experiences & lessons", query: `${employer || job} ${job} interview experience lessons candidate` },
  ] : [
    { category: "Employee interview experiences", query: `${employer || job} ${job} former employee interview process experience candidate` },
    { category: "Practice & role guides", query: `${job} interview questions hiring process practical guide` },
  ];
  const [books, videos, ...webGroups] = await Promise.all([
    searchBooks(`${job} ${status === "interview" ? "interview career" : "career skills"}`, status === "interview" ? "Books & reading" : "Books & role learning"),
    searchYouTube(`${job}${org} ${status === "interview" ? "job interview preparation" : "job rejection career lesson"}`, status === "interview" ? "YouTube videos" : "Lessons from rejection", youtubeApiKey),
    ...specs.map(discoverWeb),
  ]);
  const collected = [books, videos, ...webGroups].flat();
  const deduplicated = new Map<string, PrepResource>();
  for (const resource of collected) {
    if (!deduplicated.has(resource.url)) deduplicated.set(resource.url, resource);
  }
  return [...deduplicated.values()];
}
