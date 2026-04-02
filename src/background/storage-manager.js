import { STORAGE_KEYS, DEFAULT_API_CONFIG, HISTORY_MAX_ENTRIES, SKILL_GAP_MIN_JOBS } from "../shared/constants.js";
import {
  buildJobPostingKey,
  buildJobPostingKeyFromHints,
  extractJobIdFromUrl,
  normalizeJobPageUrl,
  normalizeCompanyTitleKey,
} from "../shared/utils.js";
import { getSecurityConfig, getSessionDecryptedKeys } from "./security-manager.js";

export async function getFromStorage(key) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? null;
}

export async function saveToStorage(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

export async function removeFromStorage(key) {
  await chrome.storage.local.remove(key);
}

export async function getProfile() {
  return (await getFromStorage(STORAGE_KEYS.PROFILE)) || {};
}

export async function saveProfile(profile) {
  await saveToStorage(STORAGE_KEYS.PROFILE, profile);
}

export async function getResume() {
  return (await getFromStorage(STORAGE_KEYS.RESUME)) || null;
}

export async function saveResume(resumeData) {
  await saveToStorage(STORAGE_KEYS.RESUME, {
    ...resumeData,
    parsedAt: new Date().toISOString(),
    wordCount: resumeData.rawText ? resumeData.rawText.split(/\s+/).length : 0,
  });
}

export async function getResumePdf() {
  return (await getFromStorage(STORAGE_KEYS.RESUME_PDF)) || null;
}

export async function saveResumePdf(pdfData) {
  await saveToStorage(STORAGE_KEYS.RESUME_PDF, pdfData);
}

export async function removeResumePdf() {
  await removeFromStorage(STORAGE_KEYS.RESUME_PDF);
}

export async function getAnswers() {
  return (await getFromStorage(STORAGE_KEYS.ANSWERS)) || {};
}

export async function saveAnswer(key, value, label, source = "form_prompt") {
  const answers = await getAnswers();
  answers[key] = {
    value,
    label,
    usedCount: (answers[key]?.usedCount || 0) + 1,
    lastUsed: new Date().toISOString(),
    createdAt: answers[key]?.createdAt || new Date().toISOString(),
    source,
  };
  await saveToStorage(STORAGE_KEYS.ANSWERS, answers);
}

export async function deleteAnswer(key) {
  const answers = await getAnswers();
  delete answers[key];
  await saveToStorage(STORAGE_KEYS.ANSWERS, answers);
}

const DEFAULT_PREFERENCES = {
  remote: null,
  hybridOk: true,
  minSalary: "",
  maxSalary: "",
  salaryCurrency: "USD",
  /** Multiply USD amounts to show in salaryCurrency (1 when USD). */
  usdToDisplayCurrencyFactor: 1,
  /** Raw JSON string from the AI exchange-rate response (persisted). */
  currencyFactorRawResponse: null,
  currencyFactorFetchedAt: null,
  preferredRoles: [],
  excludedRoles: [],
  preferredLocations: [],
  willingToRelocate: false,
  preferredCompanySize: "any",
  skipPatterns: [],
  /** compact | standard | detailed | comprehensive — controls résumé→profile JSON verbosity */
  resumeProfileDepth: "standard",
  /** human | fast | bot — controls form filling speed/strategy */
  fillMode: "fast",
  /** Enable AI-driven Smart Form Fill planner. */
  smartFillEnabled: true,
  /** Auto-fill only when AI confidence >= this threshold. */
  smartFillConfidenceThreshold: 0.9,
  /** Allow short AI-written answers for free-text fields. */
  smartFillAllowGeneration: true,
};

export async function getPreferences() {
  const stored = await getFromStorage(STORAGE_KEYS.PREFERENCES);
  if (!stored) return { ...DEFAULT_PREFERENCES };
  return { ...DEFAULT_PREFERENCES, ...stored };
}

export async function savePreferences(prefs) {
  await saveToStorage(STORAGE_KEYS.PREFERENCES, prefs);
}

export async function getApiConfig() {
  const { DEFAULT_API_CONFIG } = await import("../shared/constants.js");
  const base = (await getFromStorage(STORAGE_KEYS.API_CONFIG)) || { ...DEFAULT_API_CONFIG };
  const security = await getSecurityConfig();
  if (!security.enabled) return base;

  const sessionKeys = await getSessionDecryptedKeys();
  if (!sessionKeys) {
    return {
      ...base,
      apiKey: "",
      anthropicKey: "",
      perplexityKey: "",
      geminiKey: "",
    };
  }

  return {
    ...base,
    apiKey: String(sessionKeys.apiKey || ""),
    anthropicKey: String(sessionKeys.anthropicKey || ""),
    perplexityKey: String(sessionKeys.perplexityKey || ""),
    geminiKey: String(sessionKeys.geminiKey || ""),
  };
}

export async function saveApiConfig(config) {
  await saveToStorage(STORAGE_KEYS.API_CONFIG, config);
}

// ─── Find Jobs Cache (dedupe identical searches) ─────────────────

export async function getFindJobsCache() {
  return (await getFromStorage(STORAGE_KEYS.FIND_JOBS_CACHE)) || null;
}

export async function saveFindJobsCache(entry) {
  await saveToStorage(STORAGE_KEYS.FIND_JOBS_CACHE, entry);
}

export async function clearFindJobsCache() {
  await saveToStorage(STORAGE_KEYS.FIND_JOBS_CACHE, null);
}

// ─── Job Sessions (recent analyzed jobs across tabs/pages) ───────

const JOB_SESSION_TTL_MS = 60 * 60 * 1000; // 60 minutes
const JOB_SESSIONS_MAX = 25;

function normalizeJobSession(s) {
  if (!s || typeof s !== "object") return null;
  const url = typeof s.url === "string" ? s.url : "";
  const jobIds = Array.isArray(s.jobIds) ? s.jobIds.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 25) : [];
  const jobPostingKey = s.jobPostingKey || (url ? buildJobPostingKeyFromHints(url, jobIds) : "");
  const analysis = s.analysis && typeof s.analysis === "object" ? s.analysis : null;
  if (!analysis) return null;
  const jobTitle = analysis.job_title || s.jobTitle || "";
  const company = analysis.company || s.company || "";
  const jobId = s.jobId || jobIds[0] || (url ? extractJobIdFromUrl(url) : "") || "";
  return {
    ...s,
    url,
    jobPostingKey,
    jobId,
    jobIds,
    jobTitle,
    company,
    analysis,
    jobText: typeof s.jobText === "string" ? s.jobText : "",
    savedAt: s.savedAt || new Date().toISOString(),
  };
}

function isExpiredJobSession(s) {
  const ts = new Date(s.savedAt || s.timestamp || 0).getTime();
  if (!ts || Number.isNaN(ts)) return false;
  return Date.now() - ts > JOB_SESSION_TTL_MS;
}

async function migrateSingleSessionIfPresent() {
  const existing = await getFromStorage(STORAGE_KEYS.JOB_SESSIONS);
  if (existing) return;
  const legacy = await getFromStorage(STORAGE_KEYS.JOB_SESSION);
  if (!legacy) return;
  const norm = normalizeJobSession(legacy);
  if (norm) {
    await saveToStorage(STORAGE_KEYS.JOB_SESSIONS, [norm]);
  }
  await removeFromStorage(STORAGE_KEYS.JOB_SESSION);
}

export async function saveJobSession(session) {
  await migrateSingleSessionIfPresent();
  const norm = normalizeJobSession(session);
  if (!norm) return;

  const list = (await getFromStorage(STORAGE_KEYS.JOB_SESSIONS)) || [];
  const out = [];
  const seen = new Set();
  const key = norm.jobPostingKey || (norm.url ? buildJobPostingKey(norm.url) : "") || "";
  const sig = key || `meta:${normalizeCompanyTitleKey(norm.company)}|${normalizeCompanyTitleKey(norm.jobTitle)}`;
  seen.add(sig);
  out.push({ ...norm, savedAt: new Date().toISOString() });

  for (const s of list) {
    const n = normalizeJobSession(s);
    if (!n) continue;
    if (isExpiredJobSession(n)) continue;
    const k = n.jobPostingKey || (n.url ? buildJobPostingKey(n.url) : "") || "";
    const sSig = k || `meta:${normalizeCompanyTitleKey(n.company)}|${normalizeCompanyTitleKey(n.jobTitle)}`;
    if (seen.has(sSig)) continue;
    seen.add(sSig);
    out.push(n);
    if (out.length >= JOB_SESSIONS_MAX) break;
  }

  await saveToStorage(STORAGE_KEYS.JOB_SESSIONS, out);
}

export async function getJobSession() {
  // Return the most recent (for backward compatibility with caller expectations).
  const all = await getJobSessions();
  return all[0] || null;
}

export async function getJobSessions() {
  await migrateSingleSessionIfPresent();
  const list = (await getFromStorage(STORAGE_KEYS.JOB_SESSIONS)) || [];
  const out = [];
  let mutated = false;
  for (const s of list) {
    const n = normalizeJobSession(s);
    if (!n) { mutated = true; continue; }
    if (isExpiredJobSession(n)) { mutated = true; continue; }
    out.push(n);
  }
  if (mutated) await saveToStorage(STORAGE_KEYS.JOB_SESSIONS, out);
  return out;
}

export async function clearJobSession() {
  await removeFromStorage(STORAGE_KEYS.JOB_SESSIONS);
  await removeFromStorage(STORAGE_KEYS.JOB_SESSION);
}

export async function getHistory() {
  const list = (await getFromStorage(STORAGE_KEYS.HISTORY)) || [];
  const enriched = list.map(enrichHistoryEntry);
  const deduped = dedupeHistoryList(enriched);
  if (shouldPersistHistoryMerge(list, deduped)) {
    await saveToStorage(STORAGE_KEYS.HISTORY, deduped);
  }
  return deduped;
}

function shouldPersistHistoryMerge(before, after) {
  if (after.length !== before.length) return true;
  for (let i = 0; i < after.length; i++) {
    const a = after[i];
    const b = before.find((x) => x.id === a.id);
    if (!b) return true;
    if ((a.jobPostingKey || "") !== (b.jobPostingKey || "") || (a.jobId || "") !== (b.jobId || "")) return true;
  }
  return false;
}

function enrichHistoryEntry(entry) {
  const url = entry.url || "";
  const jobIds = Array.isArray(entry.jobIds) ? entry.jobIds.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 25) : [];
  const jobPostingKey = entry.jobPostingKey || (url ? buildJobPostingKeyFromHints(url, jobIds) : "");
  const jobId = entry.jobId || jobIds[0] || (url ? extractJobIdFromUrl(url) : "");
  const mergedIds = [...jobIds, jobId].filter(Boolean);
  const uniq = [];
  for (const id of mergedIds) {
    if (!uniq.some((x) => x.toLowerCase() === String(id).toLowerCase())) uniq.push(id);
  }
  return { ...entry, jobPostingKey, jobId, jobIds: uniq.slice(0, 25) };
}

function historyStatusRank(status) {
  const s = status || "";
  const order = { offer: 60, applied: 50, interviewing: 45, rejected: 40, skipped: 30, analyzed: 20 };
  return order[s] ?? 10;
}

function mergeHistoryDuplicates(newer, older) {
  const sa = newer.status || newer.action;
  const sb = older.status || older.action;
  const status = historyStatusRank(sa) >= historyStatusRank(sb) ? sa : sb;
  const na = Number(newer.matchScore) || 0;
  const nb = Number(older.matchScore) || 0;
  const url = newer.url || older.url;
  return {
    ...older,
    ...newer,
    id: newer.id,
    timestamp: newer.timestamp,
    status,
    action: status,
    matchScore: Math.max(na, nb) || newer.matchScore || older.matchScore,
    url,
    company: newer.company || older.company,
    jobTitle: newer.jobTitle || older.jobTitle,
    jobPostingKey: newer.jobPostingKey || older.jobPostingKey || (url ? buildJobPostingKey(url) : ""),
    jobId: newer.jobId || older.jobId || (url ? extractJobIdFromUrl(url) : ""),
    recommendation: newer.recommendation || older.recommendation,
    domain: newer.domain || older.domain,
    updatedAt: new Date().toISOString(),
  };
}

export async function logApplication(entry) {
  const raw = enrichHistoryEntry(entry);
  const history = await getHistory();
  const existingIdx = findSameHistoryIndex(history, raw);

  if (existingIdx >= 0) {
    const existing = history[existingIdx];
    const incoming = { ...existing, ...raw, id: existing.id, timestamp: existing.timestamp };
    const merged = mergeHistoryDuplicates(incoming, existing);
    merged.action = merged.status;
    history.splice(existingIdx, 1);
    history.unshift(merged);
    if (history.length > HISTORY_MAX_ENTRIES) {
      history.length = HISTORY_MAX_ENTRIES;
    }
    await saveToStorage(STORAGE_KEYS.HISTORY, history);
    return;
  }

  history.unshift({
    ...raw,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    timestamp: new Date().toISOString(),
    status: raw.action || "analyzed",
  });
  if (history.length > HISTORY_MAX_ENTRIES) {
    history.length = HISTORY_MAX_ENTRIES;
  }
  await saveToStorage(STORAGE_KEYS.HISTORY, history);
}

export async function updateHistoryStatus(id, newStatus) {
  const history = await getHistory();
  const entry = history.find((h) => h.id === id);
  if (entry) {
    entry.status = newStatus;
    entry.action = newStatus;
    entry.updatedAt = new Date().toISOString();
    await saveToStorage(STORAGE_KEYS.HISTORY, history);
    return true;
  }
  return false;
}

/**
 * Same job = job posting key (host + job id or normalized URL), then normalized URL, then company + title (+ job id if both have one).
 * Excludes "analyzed" / "skipped" so we only flag real application progress.
 */
export async function checkAlreadyApplied(url, company, jobTitle, jobIds = []) {
  const hit = await findNewestHistoryForJob(url, company, jobTitle, jobIds);
  if (!hit) return null;
  const st = hit.status || hit.action;
  if (st === "analyzed" || st === "skipped") return null;
  return hit;
}

export async function findNewestHistoryForJob(url, company, jobTitle, jobIds = []) {
  const history = await getHistory();
  return findNewestHistoryMatch(history, url, company, jobTitle, jobIds);
}

function metaHistoryKey(company, jobTitle) {
  if (!company || !jobTitle) return null;
  return `meta:${normalizeCompanyTitleKey(company)}|${normalizeCompanyTitleKey(jobTitle)}`;
}

/** Stable key: host|id:…, url:normalized, or company|title when there is no URL. */
function historyJobKey(entry) {
  if (entry.jobPostingKey) return entry.jobPostingKey;
  if (entry.url) {
    const k = buildJobPostingKey(entry.url);
    if (k) return k;
  }
  return metaHistoryKey(entry.company, entry.jobTitle);
}

function findSameHistoryIndex(history, entry) {
  const key = historyJobKey(entry);
  if (!key) return -1;
  return history.findIndex((h) => historyJobKey(h) === key);
}

function historyMatchesCurrentUrl(h, url) {
  if (!url) return false;
  const pk = buildJobPostingKey(url);
  const hk = h.jobPostingKey || buildJobPostingKey(h.url || "");
  if (pk && hk && pk === hk) return true;
  const nu = normalizeJobPageUrl(url);
  const he = normalizeJobPageUrl(h.url || "");
  if (nu && he && nu === he) return true;
  return false;
}

/**
 * Find the newest history row for this job (any status). Used to avoid duplicate rows and to match cache.
 */
function hasIdIntersection(a, b) {
  const aa = Array.isArray(a) ? a : [];
  const bb = Array.isArray(b) ? b : [];
  if (aa.length === 0 || bb.length === 0) return false;
  const set = new Set(aa.map((x) => String(x || "").toLowerCase()).filter(Boolean));
  return bb.some((x) => set.has(String(x || "").toLowerCase()));
}

function findNewestHistoryMatch(history, url, company, jobTitle, jobIds = []) {
  // 0) Strong match: extracted job IDs (apply pages often differ in URL).
  if (Array.isArray(jobIds) && jobIds.length > 0) {
    for (const h of history) {
      const ids = Array.isArray(h.jobIds) ? h.jobIds : (h.jobId ? [h.jobId] : []);
      if (hasIdIntersection(ids, jobIds)) return h;
    }
  }

  for (const h of history) {
    if (historyMatchesCurrentUrl(h, url)) return h;
  }
  if (company && jobTitle) {
    const cid = url ? extractJobIdFromUrl(url) : "";
    for (const h of history) {
      if (normalizeCompanyTitleKey(h.company) !== normalizeCompanyTitleKey(company)) continue;
      if (normalizeCompanyTitleKey(h.jobTitle) !== normalizeCompanyTitleKey(jobTitle)) continue;
      const hid = extractJobIdFromUrl(h.url || "");
      if (cid && hid && cid !== hid) continue;
      return h;
    }
  }
  return null;
}

/** Merge rows that share the same job key (newest first in array preserves primary id/timestamp). */
function dedupeHistoryList(history) {
  const mergeByKey = new Map();
  for (const e of history) {
    const key = historyJobKey(e);
    if (!key) continue;
    if (!mergeByKey.has(key)) {
      mergeByKey.set(key, { ...e });
    } else {
      const prev = mergeByKey.get(key);
      mergeByKey.set(key, mergeHistoryDuplicates(prev, e));
    }
  }

  const seen = new Set();
  const out = [];
  for (const e of history) {
    const key = historyJobKey(e);
    if (!key) {
      out.push(e);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(mergeByKey.get(key));
  }
  return out;
}

// ─── Skill Gaps ─────────────────────────────────────────────────

export async function getSkillGaps() {
  return (await getFromStorage(STORAGE_KEYS.SKILL_GAPS)) || [];
}

export async function updateSkillGaps(missingSkills, jobTitle, company, matchScore) {
  const { SKILL_GAP_MIN_JOBS } = await import("../shared/constants.js");
  const gaps = await getSkillGaps();

  for (const skill of missingSkills) {
    const normalized = normalizeSkillLabel(skill);
    const key = normalizeSkillKey(normalized);
    const existing = gaps.find((g) => normalizeSkillKey(g.skill) === key);
    if (existing) {
      existing.count += 1;
      existing.lastSeen = new Date().toISOString();
      if (!existing.relatedJobs) existing.relatedJobs = [];
      existing.relatedJobs.unshift({ jobTitle, company, matchScore, date: new Date().toISOString() });
      // Keep only last 10 related jobs
      existing.relatedJobs = existing.relatedJobs.slice(0, 10);
    } else {
      gaps.push({
        skill: normalized,
        count: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        relatedJobs: [{ jobTitle, company, matchScore, date: new Date().toISOString() }],
      });
    }
  }

  await saveToStorage(STORAGE_KEYS.SKILL_GAPS, gaps);
  return gaps;
}

function normalizeSkillKey(skill) {
  return String(skill || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[(){}\[\]]/g, "")
    .replace(/[^\w\s\.\+\#\/-]/g, "");
}

function normalizeSkillLabel(skill) {
  const s = String(skill || "").trim();
  if (!s) return "";

  const key = normalizeSkillKey(s);
  const map = {
    "js": "JavaScript",
    "javascript": "JavaScript",
    "ts": "TypeScript",
    "typescript": "TypeScript",
    "node": "Node.js",
    "nodejs": "Node.js",
    "node.js": "Node.js",
    "reactjs": "React",
    "react.js": "React",
    "k8s": "Kubernetes",
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "gcp": "Google Cloud",
    "google cloud platform": "Google Cloud",
    "ci/cd": "CI/CD",
    "ci cd": "CI/CD",
    "aws": "AWS",
  };

  return map[key] || s;
}

export async function clearSkillGaps() {
  await saveToStorage(STORAGE_KEYS.SKILL_GAPS, []);
}

export async function exportAllData() {
  const profile = await getProfile();
  const resume = await getResume();
  const answers = await getAnswers();
  const preferences = await getPreferences();
  const history = await getHistory();
  const findJobsCache = await getFindJobsCache();

  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    data: { profile, resume, answers, preferences, history, findJobsCache },
  };
}

export async function importData(data) {
  if (data.data.profile) await saveProfile(data.data.profile);
  if (data.data.resume) await saveToStorage(STORAGE_KEYS.RESUME, data.data.resume);
  if (data.data.answers) await saveToStorage(STORAGE_KEYS.ANSWERS, data.data.answers);
  if (data.data.preferences) await savePreferences(data.data.preferences);
  if (data.data.history) await saveToStorage(STORAGE_KEYS.HISTORY, data.data.history);
  if (Object.prototype.hasOwnProperty.call(data.data, "findJobsCache")) {
    await saveToStorage(STORAGE_KEYS.FIND_JOBS_CACHE, data.data.findJobsCache);
  }
}

export async function clearAllData() {
  await chrome.storage.local.clear();
}
