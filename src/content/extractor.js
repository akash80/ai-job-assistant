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
  const bodyClone = document.body.cloneNode(true);

  for (const sel of NOISE_SELECTORS) {
    bodyClone.querySelectorAll(sel).forEach((el) => el.remove());
  }

  bodyClone.querySelectorAll("script, style, noscript, iframe, svg, img, video, audio").forEach(
    (el) => el.remove(),
  );

  let text = bodyClone.innerText || bodyClone.textContent || "";
  text = text.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();

  return text.slice(0, MAX_JOB_TEXT_LENGTH);
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
