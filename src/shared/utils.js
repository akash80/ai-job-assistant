import { MAX_JOB_TEXT_LENGTH } from "./constants.js";

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Stable URL for cache keys:
 * - keep path
 * - keep meaningful query params (job ids, etc.)
 * - drop tracking/noise query params
 * - drop fragment; drop leading www
 */
export function normalizeJobPageUrl(pageUrl) {
  if (!pageUrl || typeof pageUrl !== "string") return "";
  try {
    const u = new URL(pageUrl);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "") || "/";
    const noiseParams = new Set([
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "gclid", "fbclid", "msclkid", "ref", "referrer", "source", "trk",
    ]);

    const keptParams = [];
    for (const [key, value] of u.searchParams.entries()) {
      const k = String(key || "").toLowerCase().trim();
      if (!k || noiseParams.has(k)) continue;
      // Ignore obvious session/navigation-only flags.
      if (k.startsWith("session") || k.startsWith("sid") || k.startsWith("ts")) continue;
      keptParams.push([k, String(value || "").trim()]);
    }
    keptParams.sort(([a], [b]) => a.localeCompare(b));

    if (keptParams.length === 0) {
      return `${host}${path.toLowerCase()}`;
    }
    const query = keptParams
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");
    return `${host}${path.toLowerCase()}?${query}`;
  } catch {
    return String(pageUrl).toLowerCase().trim();
  }
}

/** Lowercase company/title for stable history matching. */
export function normalizeCompanyTitleKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best-effort job posting id from URL (LinkedIn, Indeed, Greenhouse, Lever, Ashby, etc.).
 * Empty string when unknown — callers should fall back to normalizeJobPageUrl.
 */
export function extractJobIdFromUrl(pageUrl) {
  if (!pageUrl || typeof pageUrl !== "string") return "";
  try {
    const u = new URL(pageUrl);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();

    const liPath = u.pathname.match(/\/jobs\/view\/(\d{6,})/i);
    if (host.includes("linkedin.com") && liPath) return liPath[1];

    const cj =
      u.searchParams.get("currentJobId") ||
      u.searchParams.get("jobId") ||
      u.searchParams.get("job_id");
    if (host.includes("linkedin.com") && cj) {
      const digits = String(cj).replace(/\D/g, "");
      return digits.length >= 6 ? digits : String(cj).trim();
    }

    const jk = u.searchParams.get("jk");
    if (host.includes("indeed.") && jk) return String(jk).trim();

    const gh = u.pathname.match(/\/jobs\/(\d{5,})/);
    if ((host.includes("greenhouse.io") || host.includes("grnh.se")) && gh) return gh[1];

    if (host.includes("myworkdayjobs.com") || host.includes("wd5.myworkday.com")) {
      const wd = u.pathname.match(/\/job\/([^/]+)\/([^/?]+)/i);
      if (wd) return `${wd[1]}/${wd[2]}`.toLowerCase();
    }

    const lev = u.pathname.match(/\/([a-z0-9][-a-z0-9]+)\/?$/i);
    if (host.includes("jobs.lever.co") && lev && lev[1] && !/^jobs$/i.test(lev[1])) return lev[1];

    const ash = u.pathname.match(/\/jobs\/([a-f0-9-]{8,})/i);
    if (host.includes("ashbyhq.com") && ash) return ash[1];

    const smart = u.pathname.match(/\/(req|requisition|position)\/([a-z0-9-]+)/i);
    if (smart) return smart[2];

    return "";
  } catch {
    return "";
  }
}

/**
 * One key per job posting for cache + history dedupe: host + platform job id, or normalized URL.
 */
export function buildJobPostingKey(pageUrl) {
  if (!pageUrl || typeof pageUrl !== "string") return "";
  try {
    const u = new URL(pageUrl);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const jid = extractJobIdFromUrl(pageUrl);
    if (jid) return `${host}|id:${jid}`;
    const norm = normalizeJobPageUrl(pageUrl);
    return norm ? `url:${norm}` : "";
  } catch {
    return "";
  }
}

/**
 * Prefer explicit job IDs (from DOM/text) over URL parsing when available.
 * This reduces over-reliance on URL structure (apply pages often have different URLs).
 */
export function buildJobPostingKeyFromHints(pageUrl, jobIds = []) {
  const ids = Array.isArray(jobIds) ? jobIds : [];
  const best = ids
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0];

  if (best && pageUrl) {
    try {
      const u = new URL(pageUrl);
      const host = u.hostname.replace(/^www\./i, "").toLowerCase();
      return `${host}|id:${best}`;
    } catch {
      // fall back below
    }
  }

  return buildJobPostingKey(pageUrl);
}

/** Patterns that change on every refresh but are not part of the job posting. */
const CACHE_NOISE_PATTERNS = [
  /\b\d+\s*(second|minute|hour|day|week|month|year)s?\s+ago\b/gi,
  /\b(just\s+now|yesterday|earlier\s+today)\b/gi,
  /\b\d[\d,]*\s*(applicants?|people|views?)\b/gi,
  /\b(be\s+the\s+first|\d+)\s+to\s+apply\b/gi,
  /\b\d[\d,]*\s+mutual\s+connections?\b/gi,
  /\b\d+\s+followers?\b/gi,
  /\b\(edited\)\b/gi,
  /\bupdated\s+\d{1,2}\/\d{1,2}\/\d{2,4}\b/gi,
];

/**
 * Normalize job text before hashing so cache hits survive "Posted 2h ago" → "3h ago", view counts, etc.
 */
export function normalizeTextForCacheHash(text) {
  let s = String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  for (const re of CACHE_NOISE_PATTERNS) {
    s = s.replace(re, " ");
  }
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, MAX_JOB_TEXT_LENGTH);
}

/**
 * Cache key for job analysis: stable URL + normalized body (same length cap as API input).
 * Previously only the first 5k chars were hashed and volatile UI text broke hits on every load.
 */
export async function hashContent(text, pageUrl = "") {
  const textNorm = normalizeTextForCacheHash(text);
  const urlNorm = normalizeJobPageUrl(pageUrl);
  const combined = urlNorm ? `${urlNorm}\n${textNorm}` : textNorm;
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash an arbitrary string for stable cache keys (SHA-256 hex).
 */
export async function hashString(str) {
  const s = String(str || "");
  const encoder = new TextEncoder();
  const data = encoder.encode(s);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Full English month names (profile / resume parsing). */
export const PROFILE_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Month name + year → ISO date (first of month). */
export function monthYearToIsoDate(monthName, year) {
  if (!year) return "";
  const idx = PROFILE_MONTH_NAMES.indexOf(monthName);
  if (idx < 0) return "";
  const mm = String(idx + 1).padStart(2, "0");
  return `${year}-${mm}-01`;
}

/** ISO YYYY-MM-DD → full month name + year (for legacy month/year fields). */
export function isoDateToMonthYear(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso).trim())) return { month: "", year: "" };
  const [y, m] = String(iso).trim().split("-");
  const mi = parseInt(m, 10) - 1;
  if (mi < 0 || mi >= PROFILE_MONTH_NAMES.length) return { month: "", year: "" };
  return { month: PROFILE_MONTH_NAMES[mi], year: y };
}

export function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

export function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatNumber(num) {
  return new Intl.NumberFormat("en-US").format(num);
}

export function estimateCost(promptTokens, completionTokens, model, costTable) {
  const costs = costTable[model];
  if (!costs) return 0;
  return (promptTokens / 1000) * costs.prompt + (completionTokens / 1000) * costs.completion;
}

export function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function extractDomain(url) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

export async function sendMessage(type, payload = {}) {
  const maxRetries = 2;
  const baseDelayMs = 200;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // In MV3, this returns a promise when no callback is provided.
      return await chrome.runtime.sendMessage({ type, payload });
    } catch (err) {
      const msg = String(err?.message || err || "");

      if (isExtensionContextInvalidatedError(msg)) {
        notifyExtensionContextInvalidated(type);
        console.warn(`Message ${type} failed: extension context invalidated.`);
        return { success: false, error: "Extension context invalidated. Please refresh the page.", code: "CONTEXT_INVALIDATED" };
      }

      if (attempt < maxRetries && isRetryableMessagingError(msg)) {
        await sleep(baseDelayMs * Math.pow(2, attempt));
        continue;
      }

      console.error(`Message ${type} failed:`, err);
      return { success: false, error: msg || "Message failed", code: "MESSAGE_ERROR" };
    }
  }

  return { success: false, error: "Message failed", code: "MESSAGE_ERROR" };
}

function isExtensionContextInvalidatedError(message) {
  const m = String(message || "").toLowerCase();
  return m.includes("extension context invalidated") || m.includes("context invalidated");
}

function isRetryableMessagingError(message) {
  const m = String(message || "").toLowerCase();
  return (
    m.includes("could not establish connection") ||
    m.includes("receiving end does not exist") ||
    m.includes("the message port closed") ||
    m.includes("message port closed") ||
    m.includes("disconnected port")
  );
}

let contextInvalidationNotified = false;
function notifyExtensionContextInvalidated(failedType) {
  if (contextInvalidationNotified) return;
  contextInvalidationNotified = true;

  try {
    window.dispatchEvent(new CustomEvent("ja-extension-context-invalidated", { detail: { failedType } }));
  } catch {
    // ignore
  }
}
