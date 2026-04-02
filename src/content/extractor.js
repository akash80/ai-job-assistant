import { MAX_JOB_TEXT_LENGTH } from "../shared/constants.js";

const NOISE_SELECTORS = [
  "nav", "header", "footer",
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  ".navbar", ".nav-bar", ".site-header", ".site-footer",
  ".cookie-banner", ".cookie-consent",
  "#cookie-banner", "#gdpr",
  ".advertisement", ".ad-container", ".ads",
  ".social-share", ".share-buttons",
  ".sidebar", "aside",
];

const JOB_KEYWORDS = [
  "job description", "responsibilities", "requirements", "qualifications",
  "experience", "skills", "apply now", "about the role", "what you'll do",
  "who you are", "benefits", "compensation", "salary", "remote",
  "full-time", "part-time", "contract", "internship",
  "years of experience", "bachelor", "master", "degree",
];

export function extractJobText() {
  return extractJobTextWithMeta().text;
}

function looksLikeJobText(text) {
  const s = String(text || "").toLowerCase();
  if (s.length < 200) return false;
  let hits = 0;
  for (const kw of JOB_KEYWORDS) {
    if (s.includes(kw)) hits++;
    if (hits >= 2) return true;
  }
  return false;
}

function pickJobRoot() {
  const selectors = [
    '[role="main"]',
    "main",
    "article",
    ".job-description",
    ".jobDescription",
    ".description",
    ".posting",
    ".job-posting",
    ".job-details",
    ".jobDetails",
    "#job-description",
    "#jobDescriptionText",
    '[data-automation-id="jobPostingDescription"]',
    '[data-testid*="jobDescription"]',
    '[data-testid*="job-description"]',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const text = el.innerText || el.textContent || "";
    if (looksLikeJobText(text)) return el;
  }

  return document.body;
}

export function extractJobTextWithMeta() {
  // Performance: avoid cloning the full DOM (expensive on large job boards).
  // Instead, prefer a likely job container (main/article/job-description). If missing, fall back to body.
  const root = pickJobRoot();
  let text = root?.innerText || root?.textContent || "";
  text = text.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();

  const truncated = text.length > MAX_JOB_TEXT_LENGTH;
  return { text: text.slice(0, MAX_JOB_TEXT_LENGTH), truncated };
}

export function isLikelyJobPage() {
  const text = document.body.innerText?.toLowerCase() || "";
  const url = window.location.href.toLowerCase();

  const jobSiteDomains = [
    "linkedin.com/jobs", "indeed.com", "glassdoor.com",
    "lever.co", "greenhouse.io", "workday.com",
    "jobs.ashbyhq.com", "boards.greenhouse.io",
    "angel.co/jobs", "wellfound.com",
    "ziprecruiter.com", "monster.com",
    "careers.", "jobs.",
  ];

  if (jobSiteDomains.some((d) => url.includes(d))) return true;

  const urlHints = ["/job/", "/jobs/", "/career", "/position/", "/opening/", "/vacancy/"];
  if (urlHints.some((h) => url.includes(h))) return true;

  let keywordHits = 0;
  for (const kw of JOB_KEYWORDS) {
    if (text.includes(kw)) keywordHits++;
  }

  return keywordHits >= 3;
}

export function getPageMeta() {
  const title = document.title || "";
  const url = window.location.href;
  const domain = window.location.hostname.replace("www.", "");
  return { title, url, domain };
}

function uniqPush(arr, value, max = 20) {
  const v = String(value || "").trim();
  if (!v) return;
  const key = v.toLowerCase();
  if (arr.some((x) => String(x).toLowerCase() === key)) return;
  if (arr.length < max) arr.push(v);
}

function readJsonLdJobPosting() {
  const out = { title: "", company: "", jobIds: [] };
  const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  for (const s of scripts) {
    const raw = String(s.textContent || "").trim();
    if (!raw) continue;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const nodes = Array.isArray(parsed) ? parsed : [parsed];
    for (const node of nodes) {
      const items = Array.isArray(node?.["@graph"]) ? node["@graph"] : [node];
      for (const it of items) {
        const t = String(it?.["@type"] || "");
        if (!t) continue;
        const isJobPosting = t === "JobPosting" || (Array.isArray(t) && t.includes("JobPosting"));
        if (!isJobPosting) continue;

        const title = String(it?.title || it?.name || "").trim();
        if (title && !out.title) out.title = title;

        const org = it?.hiringOrganization || it?.hiringOrganization?.name;
        const company = typeof org === "string" ? org : String(org?.name || "").trim();
        if (company && !out.company) out.company = company;

        const identifier = it?.identifier;
        const idVal =
          (typeof identifier === "string" ? identifier : "") ||
          String(identifier?.value || identifier?.["@id"] || "").trim();
        if (idVal) uniqPush(out.jobIds, idVal, 10);
      }
    }
  }
  return out;
}

function extractJobIdsFromText(text) {
  const s = String(text || "");
  if (!s) return [];

  const ids = [];
  const patterns = [
    /\b(?:job|req|requisition|posting|position|role)\s*(?:id|#|number|no\.?)\s*[:#]?\s*([a-z0-9][a-z0-9\-_/]{3,40})\b/gi,
    /\b(?:jr|job\s*ref|job\s*reference)\s*[:#]?\s*([a-z0-9][a-z0-9\-_/]{3,40})\b/gi,
    /\b(?:req|requisition)\s*[:#]?\s*(r-\d{4,})\b/gi,
    /\b(?:req|requisition)\s*[:#]?\s*(req-\d{4,})\b/gi,
    /\b(jr\d{4,})\b/gi,
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(s))) {
      const raw = String(m[1] || "").trim();
      const cleaned = raw.replace(/^[#:\s]+/, "").trim();
      if (!cleaned) continue;
      const isAllDigits = /^\d+$/.test(cleaned);
      if (isAllDigits && cleaned.length < 5) continue;
      uniqPush(ids, cleaned, 25);
    }
  }

  return ids;
}

/** Extract job identity hints beyond URL: job IDs, company, title. */
export function extractJobIdentity() {
  const jobIds = [];
  const companyCandidates = [];
  const titleCandidates = [];

  // Meta tags (often reliable on apply pages)
  const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
    document.querySelector('meta[name="twitter:title"]')?.getAttribute("content") ||
    "";
  const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute("content") ||
    document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
    "";
  uniqPush(titleCandidates, metaTitle, 8);

  // Headings
  uniqPush(titleCandidates, document.querySelector("h1")?.textContent, 8);
  uniqPush(titleCandidates, document.querySelector("h2")?.textContent, 8);

  // JSON-LD JobPosting
  const ld = readJsonLdJobPosting();
  uniqPush(titleCandidates, ld.title, 8);
  uniqPush(companyCandidates, ld.company, 8);
  for (const id of ld.jobIds) uniqPush(jobIds, id, 25);

  // Common data attributes used by ATS/job boards
  const idAttrSelectors = [
    "[data-job-id]",
    "[data-jobid]",
    "[data-requisition-id]",
    "[data-req-id]",
    "[data-reqid]",
    "[data-posting-id]",
    "[data-opening-id]",
  ];
  for (const sel of idAttrSelectors) {
    document.querySelectorAll(sel).forEach((el) => {
      const attrs = el.getAttributeNames ? el.getAttributeNames() : [];
      for (const name of attrs) {
        if (!/job|req|requisition|posting|opening|position/i.test(name)) continue;
        const val = el.getAttribute(name);
        const v = String(val || "").trim();
        if (!v) continue;
        // Avoid huge blobs
        if (v.length > 60) continue;
        uniqPush(jobIds, v, 25);
      }
    });
  }

  // Body text regex scan (bounded for performance)
  const bodyText = String(document.body?.innerText || "").slice(0, 8000);
  for (const id of extractJobIdsFromText([metaTitle, metaDesc, bodyText].filter(Boolean).join("\n"))) {
    uniqPush(jobIds, id, 25);
  }

  // Normalization: drop obvious junk IDs
  const cleanedJobIds = jobIds
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .filter((x) => !/^(job|req|requisition|id|number|no)$/i.test(x))
    .filter((x) => x.length >= 4);

  return {
    jobIds: cleanedJobIds.slice(0, 25),
    companyCandidates: companyCandidates.filter(Boolean).slice(0, 10),
    titleCandidates: titleCandidates.filter(Boolean).slice(0, 10),
  };
}
