export type ApplicationStatus = "applied" | "interview" | "offer" | "rejected";

export interface ParsedJobEmail {
  companyName: string;
  jobRole: string;
  status: ApplicationStatus;
}

const stagePatterns: ReadonlyArray<[ApplicationStatus, RegExp]> = [
  ["interview", /(interview|invitation to chat|screening call|assessment link|coding test|schedule time|talk with our team)/i],
  ["rejected", /(regret to inform|thank you for your interest|pursuing other candidates|not selected|unfortunately|decided not to move forward)/i],
  ["offer", /(offer letter|pleased to offer|congratulations|employment offer)/i],
  ["applied", /(application received|thank you for applying|received your application|application submitted)/i],
];

const companyPatterns = [
  /\b(?:interview|application|opportunity|role|position|offer)\s+(?:at|with|from)\s+([A-Z][\w&.' -]{1,48}?)(?=[.!?,\n\u2013\u2014|]|\s+(?:for|as|regarding|about|role|position)\b|$)/i,
  /\b(?:at|with|from|joining)\s+([A-Z][\w&.' -]{1,48}?)(?=[.!?,\n\u2013\u2014|]|\s+(?:for|as|regarding|about|role|position)\b|$)/i,
  /\b([A-Z][\w&.' -]{1,36})\s+(?:team|careers|recruiting)\b/i,
];

export function parseJobEmail(subject: string, body: string): ParsedJobEmail {
  const combined = `${subject ?? ""}\n${body ?? ""}`.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const status = stagePatterns.find(([, pattern]) => pattern.test(combined))?.[0] ?? "applied";
  const rolePattern = /\b(?:for|as)\s+(?:the\s+)?(?:(?:role|position)\s+of\s+)?([A-Z][\w+.#/& -]{2,70}?)(?=\s+(?:at|with|for|from|starting|beginning|on|in)\b|[.,;!?\n]|$)|\b(?:role|position|job title)\s*[:\-]\s*([A-Z][\w+.#/& -]{2,70}?)(?=[.,;!?\n]|$)/i;
  const roleMatch = combined.match(rolePattern);
  const jobRole = (roleMatch?.[1] ?? roleMatch?.[2])?.trim().replace(/\s+/g, " ") ?? "General application";

  let companyName = "Unknown Company";
  for (const pattern of companyPatterns) {
    const match = combined.match(pattern);
    const candidate = match?.[1]?.trim().replace(/\s+(?:team|careers)$/i, "").replace(/[.' -]+$/, "");
    if (candidate && candidate.length > 1 && !/^(our|the|your|a|an)$/i.test(candidate)) {
      companyName = candidate;
      break;
    }
  }
  return { companyName, jobRole, status };
}
