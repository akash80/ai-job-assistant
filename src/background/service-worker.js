import { MSG, FIND_JOBS_CACHE_TTL_MS, MAX_RESUME_TEXT_LENGTH } from "../shared/constants.js";
import { hashContent, hashString, monthYearToIsoDate, buildJobPostingKeyFromHints } from "../shared/utils.js";
import { testApiKey } from "./openai-client.js";
import { testPerplexityKey } from "./perplexity-client.js";
import { testAnthropicKey } from "./anthropic-client.js";
import { testGeminiKey } from "./gemini-client.js";
import {
  getSecurityStatus,
  enableSecurityMode,
  unlockSecurityMode,
  lockSecurityMode,
  disableSecurityMode,
} from "./security-manager.js";
import {
  routeAnalyzeJob,
  routeParseResume,
  routeGenerateCoverLetter,
  routeFindJobs,
  routeSmartFormFill,
  hasAnyProvider,
  getAnalysisModelId,
  getParseResumeModelId,
  getCoverLetterModelId,
  getSmartFillModelId,
} from "./ai-router.js";
import { analyzeJobLocally } from "./local-analyzer.js";
import {
  fetchUsdToCurrencyFactor,
  CURRENCY_RATE_STALE_MS,
  ExchangeRateError,
} from "./exchange-rate-client.js";
import {
  getCachedAnalysis,
  getCachedAnalysisByUrl,
  getCachedAnalysisByPostingKey,
  cacheAnalysis,
  clearCache,
} from "./cache-manager.js";
import { trackUsage, trackCacheHit, getUsageStats, getTodayStats } from "./usage-tracker.js";
import {
  getApiConfig,
  saveApiConfig,
  getProfile,
  saveProfile,
  getResume,
  saveResume,
  getResumePdf,
  saveResumePdf,
  removeResumePdf,
  getAnswers,
  saveAnswer,
  deleteAnswer,
  getPreferences,
  savePreferences,
  getFindJobsCache,
  saveFindJobsCache,
  getHistory,
  logApplication,
  updateHistoryStatus,
  checkAlreadyApplied,
  findNewestHistoryForJob,
  saveJobSession,
  getJobSession,
  getJobSessions,
  clearJobSession,
  exportAllData,
  importData,
  clearAllData,
  getSkillGaps,
  updateSkillGaps,
  clearSkillGaps,
} from "./storage-manager.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((err) => {
      try {
        sendResponse(error(err?.message || "Unhandled background error", err?.code || "UNHANDLED_ERROR"));
      } catch {
        // ignore
      }
    });
  return true; // keep message channel open for async response
});

const CURRENCY_ALARM = "currency-daily";
const inFlightFindJobs = new Map();

const MAX_ANALYZE_JOB_TEXT_LEN = 4200;
const MAX_ANALYZE_RESUME_CONTEXT_LEN = 2600;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(CURRENCY_ALARM, { periodInMinutes: 24 * 60 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CURRENCY_ALARM) {
    maybeRefreshStaleCurrencyRate().catch(() => {});
  }
});

async function handleMessage(message, sender) {
  const { type, payload } = message;

  try {
    switch (type) {
      case MSG.ANALYZE_JOB:
        return await handleAnalyzeJob(payload);

      case MSG.GET_CACHED_ANALYSIS:
        return await handleGetCached(payload);

      case MSG.TEST_API_KEY:
        return await handleTestApiKey(payload);

      case MSG.TEST_PERPLEXITY_KEY:
        return await handleTestPerplexityKey(payload);

      case MSG.TEST_ANTHROPIC_KEY:
        return await handleTestAnthropicKey(payload);

      case MSG.TEST_GEMINI_KEY:
        return await handleTestGeminiKey(payload);

      case MSG.GET_API_CONFIG:
        return success(await getApiConfig());

      case MSG.GET_API_STATUS: {
        const cfg = await getApiConfig();
        const hasOpenAIKey = !!(cfg?.apiKey);
        const hasAnthropicKey = !!(cfg?.anthropicKey);
        const hasPerplexityKey = !!(cfg?.perplexityKey);
        const hasGeminiKey = !!(cfg?.geminiKey);
        const sec = await getSecurityStatus();
        return success({
          hasOpenAIKey,
          hasAnthropicKey,
          hasPerplexityKey,
          hasGeminiKey,
          hasAnyKey: hasOpenAIKey || hasAnthropicKey || hasPerplexityKey || hasGeminiKey,
          openaiModel: cfg?.model || null,
          anthropicModel: cfg?.anthropicModel || null,
          perplexityModel: cfg?.perplexityModel || null,
          geminiModel: cfg?.geminiModel || null,
          securityEnabled: sec.enabled,
          securityLocked: sec.enabled ? sec.locked : false,
        });
      }

      case MSG.GET_SECURITY_STATUS:
        return success(await getSecurityStatus());

      case MSG.ENABLE_SECURITY_MODE: {
        const storedCfg = await getFromRawStorageApiConfig();
        await enableSecurityMode(payload?.passphrase, storedCfg);
        await saveApiConfig({
          ...(storedCfg || {}),
          apiKey: "",
          anthropicKey: "",
          perplexityKey: "",
          geminiKey: "",
        });
        return success({ enabled: true });
      }

      case MSG.UNLOCK_SECURITY_MODE:
        return success(await unlockSecurityMode(payload?.passphrase));

      case MSG.LOCK_SECURITY_MODE:
        return success(await lockSecurityMode());

      case MSG.DISABLE_SECURITY_MODE: {
        const out = await disableSecurityMode(payload?.passphrase);
        if (out?.restored && out?.keys) {
          const current = await getFromRawStorageApiConfig();
          await saveApiConfig({
            ...(current || {}),
            apiKey: String(out.keys.apiKey || ""),
            anthropicKey: String(out.keys.anthropicKey || ""),
            perplexityKey: String(out.keys.perplexityKey || ""),
            geminiKey: String(out.keys.geminiKey || ""),
          });
        }
        return success(out);
      }

      case MSG.SAVE_API_CONFIG:
        await saveApiConfig(payload);
        return success(true);

      case MSG.GET_PROFILE:
        return success(await getProfile());

      case MSG.SAVE_PROFILE:
        await saveProfile(payload);
        return success(true);

      case MSG.GET_RESUME:
        return success(await getResume());

      case MSG.SAVE_RESUME:
        await saveResume(payload);
        return success(true);

      case MSG.PARSE_RESUME:
        return await handleParseResume(payload);

      case MSG.SAVE_RESUME_PDF:
        await saveResumePdf(payload);
        return success(true);

      case MSG.GET_RESUME_PDF:
        return success(await getResumePdf());

      case MSG.REMOVE_RESUME_PDF:
        await removeResumePdf();
        return success(true);

      case MSG.GET_ANSWERS:
        return success(await getAnswers());

      case MSG.SAVE_ANSWER:
        await saveAnswer(payload.key, payload.value, payload.label, payload.source);
        return success(true);

      case MSG.DELETE_ANSWER:
        await deleteAnswer(payload.key);
        return success(true);

      case MSG.GET_PREFERENCES:
        await maybeRefreshStaleCurrencyRate();
        return success(await getPreferences());

      case MSG.SAVE_PREFERENCES:
        await savePreferences(payload);
        return success(true);

      case MSG.FETCH_CURRENCY_FACTOR:
        return await handleFetchCurrencyFactor(payload);

      case MSG.LOG_APPLICATION:
        await logApplication(payload);
        return success(true);

      case MSG.GET_HISTORY:
        return success(await getHistory());

      case MSG.UPDATE_HISTORY_STATUS:
        return success(await updateHistoryStatus(payload.id, payload.status));

      case MSG.CHECK_ALREADY_APPLIED:
        return success(await checkAlreadyApplied(payload.url, payload.company, payload.jobTitle, payload.jobIds || []));

      case MSG.FIND_HISTORY_JOB_MATCH:
        return success(await findNewestHistoryForJob(payload.url, payload.company, payload.jobTitle, payload.jobIds || []));

      case MSG.SAVE_JOB_SESSION:
        await saveJobSession(payload);
        return success(true);

      case MSG.GET_JOB_SESSION:
        return success(await getJobSession());

      case MSG.GET_JOB_SESSIONS:
        return success(await getJobSessions());

      case MSG.CLEAR_JOB_SESSION:
        await clearJobSession();
        return success(true);

      case MSG.GET_USAGE_STATS:
        return success({ all: await getUsageStats(), today: await getTodayStats() });

      case MSG.GENERATE_COVER_LETTER:
        return await handleGenerateCoverLetter(payload);

      case MSG.SMART_FILL_PLAN:
        return await handleSmartFillPlan(payload, sender);

      case MSG.GET_SKILL_GAPS:
        return success(await getSkillGaps());

      case MSG.CLEAR_SKILL_GAPS:
        await clearSkillGaps();
        return success(true);

      case MSG.FIND_JOBS:
        return await handleFindJobs(payload);

      case MSG.CLEAR_CACHE:
        await clearCache();
        return success(true);

      case MSG.EXPORT_ALL_DATA:
        return success(await exportAllData());

      case MSG.IMPORT_DATA:
        await importData(payload);
        return success(true);

      case MSG.CLEAR_ALL_DATA:
        await clearAllData();
        return success(true);

      default:
        return error(`Unknown message type: ${type}`, "UNKNOWN_MESSAGE");
    }
  } catch (err) {
    console.error(`Handler error [${type}]:`, err);
    return error(err.message, err.code || "UNKNOWN_ERROR");
  }
}

async function handleAnalyzeJob(payload) {
  const { jobText, pageUrl, forceLocal = false, jobIds = [] } = payload;
  const apiConfig = await getApiConfig();
  const resume = await getResume();
  const profile = await getProfile();

  const postingKey = buildJobPostingKeyFromHints(pageUrl || "", jobIds);

  // Fast cache paths first (avoid hashing/condensing when possible).
  let cached = null;
  if (!cached && postingKey) {
    cached = await getCachedAnalysisByPostingKey(postingKey);
  }
  if (!cached && pageUrl) {
    cached = await getCachedAnalysisByUrl(pageUrl);
  }
  if (cached) {
    await trackCacheHit();
    return success({ ...applyProfileSkillOverrides(cached.result, profile), cached: true });
  }

  // Slower cache key: hash the content (used to dedupe same posting across different URLs).
  const contentHash = await hashContent(jobText, pageUrl);

  // Check cache by content hash (only after the fast URL/postingKey checks).
  cached = await getCachedAnalysis(contentHash);
  if (cached) {
    await trackCacheHit();
    return success({ ...applyProfileSkillOverrides(cached.result, profile), cached: true });
  }

  // No AI providers available OR forceLocal requested → fall back to local analysis
  if (!hasAnyProvider(apiConfig) || forceLocal) {
    const sec = await getSecurityStatus();
    if (sec.enabled && sec.locked && !forceLocal) {
      return error("API keys are locked. Open Settings → Security to unlock.", "KEYS_LOCKED");
    }
    if (!resume?.rawText && !profile?.skillsText) {
      return error("Please add your resume in Settings to analyze jobs.", "NO_RESUME");
    }
    const localResult = analyzeJobLocally(jobText, profile);
    // Cache local result (shorter TTL conceptually but reuse same cache)
    await cacheAnalysis(contentHash, localResult, {
      jobUrl: pageUrl,
      jobTitle: localResult.job_title,
      model: "local",
      tokensUsed: 0,
      jobPostingKey: postingKey || undefined,
    });
    return success({ ...applyProfileSkillOverrides(localResult, profile), cached: false });
  }

  if (!resume?.rawText) {
    return error("Please add your resume in Settings.", "NO_RESUME");
  }

  const condensedJobText = condenseJobText(jobText, MAX_ANALYZE_JOB_TEXT_LEN);
  const resumeText = buildCompactResumeContext(profile, resume.rawText, MAX_RESUME_TEXT_LENGTH);
  const { result, usage } = await routeAnalyzeJob(condensedJobText, resumeText, apiConfig);
  const analysisModelId = getAnalysisModelId(apiConfig);

  await cacheAnalysis(contentHash, result, {
    jobUrl: pageUrl,
    jobTitle: result.job_title,
    model: analysisModelId,
    tokensUsed: usage.total_tokens,
    jobPostingKey: postingKey || undefined,
  });

  await trackUsage(analysisModelId, usage);

  // Track skill gaps for high-scoring jobs (≥75) that still have missing skills
  const finalResult = applyProfileSkillOverrides(result, profile);
  if (finalResult.match_score >= 75 && finalResult.missing_skills?.length > 0) {
    await updateSkillGaps(
      finalResult.missing_skills,
      finalResult.job_title,
      finalResult.company,
      finalResult.match_score,
    );
  }

  return success({ ...finalResult, cached: false });
}

/**
 * Keeps analysis output aligned with user-edited profile skills.
 */
function applyProfileSkillOverrides(result, profile) {
  if (!result || typeof result !== "object") return result;

  const baseScore = Number(result.match_score) || 0;
  const normalized = {
    ...result,
    match_score: baseScore,
    missing_skills: Array.isArray(result.missing_skills) ? [...result.missing_skills] : [],
  };
  const originalMissingCount = normalized.missing_skills.length;

  const knownSkills = new Set();
  const skillsByCategory = profile?.skills && typeof profile.skills === "object" ? profile.skills : {};
  for (const value of Object.values(skillsByCategory)) {
    if (!Array.isArray(value)) continue;
    for (const skill of value) {
      const k = String(skill || "").trim().toLowerCase();
      if (k) knownSkills.add(k);
    }
  }

  if (knownSkills.size === 0) return normalized;

  normalized.missing_skills = normalized.missing_skills.filter((skill) => {
    const k = String(skill || "").trim().toLowerCase();
    return k ? !knownSkills.has(k) : false;
  });

  if (originalMissingCount > 0) {
    const resolved = Math.max(0, originalMissingCount - normalized.missing_skills.length);
    const bonus = Math.round((resolved / originalMissingCount) * 20);
    normalized.match_score = clampScore(baseScore + bonus);
  }

  return normalized;
}

function clampScore(n) {
  return Math.max(0, Math.min(100, Number(n) || 0));
}

function normalizeWs(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function clampText(s, maxLen) {
  const str = normalizeWs(s);
  if (str.length <= maxLen) return str;
  return str.slice(0, Math.max(0, maxLen - 1)) + "…";
}

function splitToLines(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean);
}

function dropDuplicateAndBoilerplateLines(lines) {
  const seen = new Set();
  const out = [];

  const boilerplateRe = /(equal opportunity|e-?verify|accommodat|privacy policy|terms of use|cookie|cookies|gdpr|california consumer privacy|ccpa|reasonable accommodation|work authorization|right to work|applicant tracking|by applying you agree|fraudulent recruitment)/i;

  for (const line of lines) {
    const norm = normalizeWs(line).toLowerCase();
    if (!norm) continue;
    if (norm.length <= 2) continue;
    if (boilerplateRe.test(norm)) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(line);
  }

  return out;
}

function pickSectionFocusedLines(lines, maxLines) {
  const headingRe = /^(about (the )?(role|job)|responsibilities|what you( will)? do|requirements|qualifications|must have|nice to have|preferred|benefits|compensation|salary|who you are|what you bring|what we offer)\b/i;
  const keepIdx = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!headingRe.test(line)) continue;
    for (let j = Math.max(0, i - 1); j <= Math.min(lines.length - 1, i + 18); j++) {
      keepIdx.add(j);
    }
  }

  const picked = [];
  if (keepIdx.size > 0) {
    const idxs = [...keepIdx].sort((a, b) => a - b);
    for (const i of idxs) {
      picked.push(lines[i]);
      if (picked.length >= maxLines) break;
    }
    return picked;
  }

  return lines.slice(0, maxLines);
}

function condenseJobText(jobText, maxLen) {
  const raw = String(jobText || "").trim();
  if (!raw) return "";

  const lines = splitToLines(raw);
  const cleaned = dropDuplicateAndBoilerplateLines(lines);
  const picked = pickSectionFocusedLines(cleaned, 180);

  // Keep a small header context for title/company snippets at the top (often useful).
  const header = cleaned.slice(0, 18);
  const merged = dropDuplicateAndBoilerplateLines([...header, ...picked]);

  const out = merged.join("\n");
  return out.length <= maxLen ? out : out.slice(0, maxLen);
}

function formatExperienceForContext(profile) {
  const ex = Array.isArray(profile?.experience) ? profile.experience : [];
  if (ex.length === 0) return "";

  const parts = [];
  for (const e of ex.slice(0, 3)) {
    const role = [e?.title, e?.company].filter(Boolean).map((x) => normalizeWs(x)).filter(Boolean).join(" @ ");
    const highlights = Array.isArray(e?.highlights) ? e.highlights.map((h) => clampText(h, 160)).filter(Boolean).slice(0, 2) : [];
    const line = [role, highlights.length ? `(${highlights.join(" | ")})` : ""].filter(Boolean).join(" ");
    if (line) parts.push(line);
  }
  return parts.join("\n");
}

function buildCompactResumeContext(profile, fallbackResumeRawText, maxLen) {
  const p = profile && typeof profile === "object" ? profile : null;
  if (!p) {
    return String(fallbackResumeRawText || "").slice(0, maxLen);
  }

  const skillsText = clampText(p.skillsText || "", 1200);
  const experienceText = clampText(formatExperienceForContext(p), 900);
  const educationText = clampText(p.educationText || "", 280);
  const keywords = clampText(p.keywords || "", 500);
  const name = clampText(p.name || [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" "), 120);
  const currentTitle = clampText(p.currentTitle || "", 120);

  const blocks = [
    name ? `Name: ${name}` : "",
    currentTitle ? `Current title: ${currentTitle}` : "",
    skillsText ? `Skills: ${skillsText}` : "",
    keywords ? `Keywords: ${keywords}` : "",
    experienceText ? `Recent experience:\n${experienceText}` : "",
    educationText ? `Education: ${educationText}` : "",
  ].filter(Boolean);

  const compact = blocks.join("\n\n");
  const cap = Math.min(maxLen, MAX_ANALYZE_RESUME_CONTEXT_LEN);
  const out = compact.length <= cap ? compact : compact.slice(0, cap);

  // If compact became empty for some reason, fall back to raw resume.
  if (!out.trim()) return String(fallbackResumeRawText || "").slice(0, maxLen);
  return out;
}

async function handleParseResume(payload) {
  const apiConfig = await getApiConfig();

  if (!hasAnyProvider(apiConfig)) {
    const sec = await getSecurityStatus();
    if (sec.enabled && sec.locked) {
      return error("API keys are locked. Open Settings → Security to unlock.", "KEYS_LOCKED");
    }
    return error("Please configure an AI API key first (OpenAI, Anthropic, or Perplexity).", "NO_API_KEY");
  }

  const preferences = await getPreferences();
  const resumeProfileDepth = preferences.resumeProfileDepth;
  const { result, usage } = await routeParseResume(payload.resumeText, apiConfig, { depth: resumeProfileDepth });
  await trackUsage(getParseResumeModelId(apiConfig), usage);

  const profile = { ...result };

  // Ensure critical fields exist
  profile.firstName = profile.firstName || "";
  profile.middleName = profile.middleName || "";
  profile.lastName = profile.lastName || "";
  profile.name = profile.name || "";
  profile.email = profile.email || "";
  profile.phone = profile.phone || "";
  profile.location = profile.location || "";
  profile.keywords = profile.keywords || "";
  profile.skills = profile.skills || {};
  profile.experience = profile.experience || [];
  profile.education = profile.education || [];
  profile.projects = profile.projects || [];
  profile.additionalSections = profile.additionalSections || {};

  // Split legacy full name
  if ((!profile.firstName || !profile.lastName) && profile.name) {
    const parts = profile.name.trim().split(/\s+/).filter(Boolean);
    if (!profile.firstName) profile.firstName = parts[0] || "";
    if (!profile.lastName) profile.lastName = parts.length > 1 ? parts[parts.length - 1] : "";
    if (!profile.middleName && parts.length > 2) profile.middleName = parts.slice(1, -1).join(" ");
  }

  if (profile.firstName || profile.lastName) {
    const parts = [profile.firstName, profile.middleName, profile.lastName].map((s) => (s || "").trim()).filter(Boolean);
    profile.name = parts.join(" ").trim();
  }

  // Normalize experience dates
  for (const exp of profile.experience) {
    normalizeDateEntry(exp);
  }
  for (const int of (profile.internships || [])) {
    normalizeDateEntry(int);
  }

  // Derive isCurrentCompany
  if (profile.experience.length) {
    const hasAnyCurrent = profile.experience.some((e) => e.isCurrentCompany);
    if (!hasAnyCurrent) {
      const first = profile.experience[0];
      const end = (first.endYear || first.endDate || "").toLowerCase().trim();
      if (!end || end === "current" || end === "present") {
        first.isCurrentCompany = true;
        first.endMonth = "";
        first.endYear = "";
        first.endDate = "";
      }
    }
  }

  // Build flattened text
  const allSkills = Object.values(profile.skills).flat();
  profile.skillsText = allSkills.join(", ");

  if (profile.education.length) {
    const e = profile.education[0];
    profile.educationText = [e.degree, e.field, e.institution, e.year].filter(Boolean).join(", ");
  }

  if (Array.isArray(profile.certifications)) {
    profile.certificationsText = profile.certifications
      .map((c) => (typeof c === "string" ? c : c.name || ""))
      .filter(Boolean)
      .join(", ");
  }

  if (Array.isArray(profile.spokenLanguages)) {
    profile.spokenLanguagesText = profile.spokenLanguages
      .map((l) => (typeof l === "string" ? l : `${l.language || ""}${l.proficiency ? ` (${l.proficiency})` : ""}`))
      .filter(Boolean)
      .join(", ");
  }

  // Derive preferred roles from parsed profile (don't overwrite user preferences)
  try {
    const roles = [];
    const pushRole = (t) => {
      const s = String(t || "").replace(/\s+/g, " ").trim();
      if (!s) return;
      const low = s.toLowerCase();
      if (low === "na" || low === "n/a" || low === "none") return;
      if (!roles.some((r) => r.toLowerCase() === low)) roles.push(s);
    };
    pushRole(profile.currentTitle);
    if (Array.isArray(profile.experience)) {
      for (const exp of profile.experience.slice(0, 6)) pushRole(exp?.title);
    }
    const preferredRoles = roles.slice(0, 5);
    profile.preferredRoles = preferredRoles;

    const prevRoles = Array.isArray(preferences.preferredRoles) ? preferences.preferredRoles.filter(Boolean) : [];
    if (prevRoles.length === 0 && preferredRoles.length > 0) {
      await savePreferences({ ...preferences, preferredRoles });
    }
  } catch {
    // ignore role derivation failures
  }

  await saveProfile(profile);
  return success(profile);
}

function normalizeDateEntry(entry) {
  if (entry.startDate && (!entry.startMonth || !entry.startYear)) {
    const parsed = parseDateString(entry.startDate);
    if (!entry.startMonth) entry.startMonth = parsed.month;
    if (!entry.startYear) entry.startYear = parsed.year;
  }
  if (entry.endDate && (!entry.endMonth || !entry.endYear)) {
    const endLower = (entry.endDate || "").toLowerCase().trim();
    if (endLower === "current" || endLower === "present") {
      entry.isCurrentCompany = true;
      entry.endMonth = "";
      entry.endYear = "";
      entry.endDate = "";
    } else {
      const parsed = parseDateString(entry.endDate);
      if (!entry.endMonth) entry.endMonth = parsed.month;
      if (!entry.endYear) entry.endYear = parsed.year;
    }
  }
  if (entry.startMonth && entry.startYear && !/^\d{4}-\d{2}-\d{2}$/.test(String(entry.startDate || "").trim())) {
    entry.startDate = monthYearToIsoDate(entry.startMonth, entry.startYear);
  }
  if (entry.isCurrentCompany) {
    entry.endDate = "";
  } else if (entry.endMonth && entry.endYear && !/^\d{4}-\d{2}-\d{2}$/.test(String(entry.endDate || "").trim())) {
    entry.endDate = monthYearToIsoDate(entry.endMonth, entry.endYear);
  }
}

async function handleGetCached(payload) {
  const contentHash = await hashContent(payload.jobText, payload.pageUrl);
  const cached = (await getCachedAnalysis(contentHash)) || (await getCachedAnalysisByUrl(payload.pageUrl));
  return success(cached?.result || null);
}

async function handleTestApiKey(payload) {
  const config = payload.apiKey ? payload : await getApiConfig();
  const result = await testApiKey(config);
  return success(result);
}

async function handleTestPerplexityKey(payload) {
  const config = payload.perplexityKey ? payload : await getApiConfig();
  const result = await testPerplexityKey(config);
  return success(result);
}

async function handleTestAnthropicKey(payload) {
  const config = payload.anthropicKey ? payload : await getApiConfig();
  const result = await testAnthropicKey(config);
  return success(result);
}

async function handleTestGeminiKey(payload) {
  const config = payload.geminiKey ? payload : await getApiConfig();
  const result = await testGeminiKey(config);
  return success(result);
}

async function handleGenerateCoverLetter(payload) {
  const { jobAnalysis, tone, smart, jobPostingText } = payload;
  const apiConfig = await getApiConfig();

  if (!hasAnyProvider(apiConfig)) {
    const sec = await getSecurityStatus();
    if (sec.enabled && sec.locked) {
      return error("API keys are locked. Open Settings → Security to unlock.", "KEYS_LOCKED");
    }
    return error("Please configure an AI API key to generate cover letters.", "NO_API_KEY");
  }

  const profile = await getProfile();
  const letterOpts = {
    smart: smart === true,
    jobPostingText: typeof jobPostingText === "string" ? jobPostingText : "",
  };
  const { result, usage } = await routeGenerateCoverLetter(jobAnalysis, profile, tone, apiConfig, letterOpts);
  await trackUsage(getCoverLetterModelId(apiConfig), usage);
  return success(result);
}

function normalizeSmartFillInput(payload) {
  const pageUrl = typeof payload?.pageUrl === "string" ? payload.pageUrl : "";
  const formSchema = payload?.formSchema && typeof payload.formSchema === "object" ? payload.formSchema : null;
  const jobContext = payload?.jobContext && typeof payload.jobContext === "object" ? payload.jobContext : null;
  const requestId = typeof payload?.requestId === "string" ? payload.requestId : "";
  return { pageUrl, formSchema, jobContext, requestId };
}

function isValidSmartFillPlanShape(plan) {
  if (!plan || typeof plan !== "object") return false;
  if (!Array.isArray(plan.fills)) return false;
  if (!Array.isArray(plan.skip)) return false;
  if (!Array.isArray(plan.questions)) return false;
  return true;
}

function sendSmartFillProgress(sender, progressPayload) {
  try {
    const tabId = sender?.tab?.id;
    if (!Number.isFinite(Number(tabId))) return;
    chrome.tabs.sendMessage(tabId, { type: MSG.SMART_FILL_PROGRESS, payload: progressPayload });
  } catch {
    // ignore
  }
}

function clampStr(s, maxLen) {
  const str = String(s || "").replace(/\s+/g, " ").trim();
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

function pruneSmartFormSchema(schema) {
  const base = schema && typeof schema === "object" ? schema : {};
  const fields = Array.isArray(base.fields) ? base.fields : [];

  const prunedFields = fields.map((f) => {
    const obj = f && typeof f === "object" ? f : {};
    const out = {
      fieldId: String(obj.fieldId || ""),
      kind: String(obj.kind || ""),
      tagName: String(obj.tagName || ""),
      inputType: String(obj.inputType || ""),
      name: clampStr(obj.name, 80),
      id: clampStr(obj.id, 80),
      label: clampStr(obj.label, 140),
      placeholder: clampStr(obj.placeholder, 140),
      autocomplete: clampStr(obj.autocomplete, 80),
      required: Boolean(obj.required),
      describedBy: clampStr(obj.describedBy, 160),
      // nearbyText can be huge on some pages; keep it short.
      nearbyText: clampStr(obj.nearbyText, 120),
      maxLength: Number.isFinite(Number(obj.maxLength)) ? Number(obj.maxLength) : null,
      classification: obj.classification && typeof obj.classification === "object"
        ? { type: String(obj.classification.type || ""), confidence: Number(obj.classification.confidence || 0) }
        : { type: "", confidence: 0 },
    };

    if (Array.isArray(obj.options)) {
      // Cap options to avoid massive selects (country lists, etc.)
      out.options = obj.options
        .slice(0, 80)
        .map((o) => {
          const opt = o && typeof o === "object" ? o : {};
          return {
            value: clampStr(opt.value, 120),
            label: clampStr(opt.label, 120),
            disabled: Boolean(opt.disabled),
          };
        });
    }

    return out;
  });

  return {
    version: Number(base.version || 1),
    pageUrl: clampStr(base.pageUrl, 300),
    fieldCount: prunedFields.length,
    fields: prunedFields,
  };
}

function pruneProfileForSmartFill(profile) {
  const p = profile && typeof profile === "object" ? profile : {};
  const skillsText = clampStr(p.skillsText || "", 1200);
  return {
    name: clampStr(p.name || [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" "), 120),
    firstName: clampStr(p.firstName, 60),
    middleName: clampStr(p.middleName, 60),
    lastName: clampStr(p.lastName, 60),
    email: clampStr(p.email, 120),
    phone: clampStr(p.phone, 60),
    location: clampStr(p.location, 160),
    linkedin: clampStr(p.linkedin || p.linkedIn || "", 200),
    github: clampStr(p.github || "", 200),
    website: clampStr(p.website || "", 200),
    portfolio: clampStr(p.portfolio || "", 200),
    educationText: clampStr(p.educationText || "", 300),
    skillsText,
    keywords: clampStr(p.keywords || "", 600),
    // Keep a tiny slice of experience as hints, but don't ship the full resume-like structure.
    currentTitle: clampStr(p.currentTitle || "", 120),
    preferredRoles: Array.isArray(p.preferredRoles) ? p.preferredRoles.slice(0, 8).map((x) => clampStr(x, 80)) : [],
  };
}

function pruneAnswersForSmartFill(answers, formSchema) {
  const a = answers && typeof answers === "object" ? answers : {};
  const out = {};

  const labelWords = new Set();
  try {
    const fields = Array.isArray(formSchema?.fields) ? formSchema.fields : [];
    for (const f of fields.slice(0, 200)) {
      const words = String(f?.label || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4)
        .slice(0, 8);
      for (const w of words) labelWords.add(w);
    }
  } catch {
    // ignore
  }

  const keys = Object.keys(a);
  // Prefer commonly-used keys first.
  keys.sort((ka, kb) => {
    const aLen = String(a[ka] || "").length;
    const bLen = String(a[kb] || "").length;
    return aLen - bLen;
  });

  const isHighValueKey = (k) => {
    const s = String(k || "").toLowerCase();
    if (s.includes("email") || s.includes("phone") || s.includes("mobile")) return true;
    if (s.includes("linkedin") || s.includes("github") || s.includes("portfolio") || s.includes("website")) return true;
    if (s.includes("city") || s.includes("state") || s.includes("country") || s.includes("location")) return true;
    if (s.includes("salary") || s.includes("compensation")) return true;
    if (s.includes("visa") || s.includes("sponsor") || s.includes("work_auth")) return true;
    if (s.startsWith("smart:")) return true;
    return false;
  };

  const matchesAnyLabelWord = (k) => {
    const s = String(k || "").toLowerCase();
    for (const w of labelWords) {
      if (s.includes(w)) return true;
    }
    return false;
  };

  const picked = [];
  for (const k of keys) {
    if (!k) continue;
    if (isHighValueKey(k) || matchesAnyLabelWord(k)) picked.push(k);
    if (picked.length >= 120) break;
  }
  // Ensure we include some general answers even if labels don't match.
  if (picked.length < 40) {
    for (const k of keys) {
      if (picked.includes(k)) continue;
      picked.push(k);
      if (picked.length >= 60) break;
    }
  }

  for (const k of picked) {
    const v = a[k];
    const value = typeof v === "string" ? v : JSON.stringify(v);
    out[k] = clampStr(value, 400);
  }

  return out;
}

function prunePreferencesForSmartFill(preferences) {
  const p = preferences && typeof preferences === "object" ? preferences : {};
  return {
    smartFillAllowGeneration: p.smartFillAllowGeneration !== false,
    smartFillConfidenceThreshold: Number(p.smartFillConfidenceThreshold || 0.9),
    fillMode: String(p.fillMode || "fast"),
  };
}

async function handleSmartFillPlan(payload, sender) {
  const apiConfig = await getApiConfig();
  if (!hasAnyProvider(apiConfig)) {
    const sec = await getSecurityStatus();
    if (sec.enabled && sec.locked) {
      return error("API keys are locked. Open Settings → Security to unlock.", "KEYS_LOCKED");
    }
    return error("Please configure an AI API key first (OpenAI, Anthropic, or Perplexity).", "NO_API_KEY");
  }

  const preferences = await getPreferences();
  const profile = await getProfile();
  const answers = await getAnswers();

  const { pageUrl, formSchema, jobContext, requestId } = normalizeSmartFillInput(payload);
  if (!formSchema || !Array.isArray(formSchema.fields)) {
    return error("Missing or invalid form schema.", "BAD_SCHEMA");
  }

  sendSmartFillProgress(sender, { requestId, step: "Preparing input", percent: 45 });

  const smartOpts = { allowGeneration: preferences.smartFillAllowGeneration !== false };

  const prunedSchema = pruneSmartFormSchema(formSchema);
  const prunedProfile = pruneProfileForSmartFill(profile);
  const prunedPreferences = prunePreferencesForSmartFill(preferences);
  const prunedAnswers = pruneAnswersForSmartFill(answers, prunedSchema);

  sendSmartFillProgress(sender, {
    requestId,
    step: "Optimizing payload",
    percent: 55,
    detail: `${prunedSchema.fieldCount} fields, ${Object.keys(prunedAnswers || {}).length} saved answers`,
  });

  const input = {
    pageUrl,
    formSchema: prunedSchema,
    profile: prunedProfile,
    answers: prunedAnswers,
    preferences: prunedPreferences,
    jobContext,
  };

  sendSmartFillProgress(sender, { requestId, step: "Calling AI", percent: 70 });
  const { result, usage } = await routeSmartFormFill(input, apiConfig, smartOpts);
  await trackUsage(getSmartFillModelId(apiConfig), usage);

  sendSmartFillProgress(sender, { requestId, step: "Validating response", percent: 90 });
  if (!isValidSmartFillPlanShape(result)) {
    return error("Smart fill returned an invalid plan. Try again or switch models.", "BAD_SMART_FILL_PLAN");
  }

  sendSmartFillProgress(sender, { requestId, step: "Done", percent: 100 });
  return success(result);
}

async function handleFindJobs(payload) {
  const apiConfig = await getApiConfig();
  const sec = await getSecurityStatus();
  if (sec.enabled && sec.locked) {
    return error("API keys are locked. Open Settings → Security to unlock.", "KEYS_LOCKED");
  }
  const profile = await getProfile();
  const preferences = await getPreferences();
  const signature = await buildFindJobsSignature(profile, preferences, apiConfig);

  const cached = await getFindJobsCache();
  if (cached && cached.signature === signature) {
    const ts = Date.parse(cached.timestamp || "");
    if (Number.isFinite(ts) && Date.now() - ts < FIND_JOBS_CACHE_TTL_MS && Array.isArray(cached.result)) {
      return success(cached.result);
    }
  }

  if (inFlightFindJobs.has(signature)) {
    return await inFlightFindJobs.get(signature);
  }

  const p = (async () => {
    const { result, usage } = await routeFindJobs(profile, preferences, apiConfig);
    await trackUsage(apiConfig.perplexityModel || "sonar", usage);
    await saveFindJobsCache({
      signature,
      timestamp: new Date().toISOString(),
      result,
      model: apiConfig.perplexityModel || "sonar",
    });
    return success(result);
  })();

  inFlightFindJobs.set(signature, p);
  try {
    return await p;
  } finally {
    inFlightFindJobs.delete(signature);
  }
}

async function buildFindJobsSignature(profile, preferences, apiConfig) {
  const skillsByCategory = profile?.skills && typeof profile.skills === "object" ? profile.skills : {};
  const skills = [];
  for (const value of Object.values(skillsByCategory)) {
    if (!Array.isArray(value)) continue;
    for (const s of value) {
      const k = String(s || "").trim().toLowerCase();
      if (k) skills.push(k);
    }
  }
  skills.sort();
  const uniqSkills = [];
  for (const s of skills) {
    if (uniqSkills.length === 0 || uniqSkills[uniqSkills.length - 1] !== s) uniqSkills.push(s);
  }

  const normArr = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .map((x) => x.toLowerCase())
      .sort();
  };

  const sigObj = {
    v: 1,
    model: String(apiConfig?.perplexityModel || "sonar"),
    title: String(profile?.currentTitle || "").trim().toLowerCase(),
    skills: uniqSkills.slice(0, 50),
    preferredRoles: normArr(preferences?.preferredRoles),
    excludedRoles: normArr(preferences?.excludedRoles),
    preferredLocations: normArr(preferences?.preferredLocations),
    excludedLocations: normArr(preferences?.excludedLocations),
    remote: preferences?.remote === true ? "true" : preferences?.remote === false ? "false" : "null",
    minSalary: String(preferences?.minSalary || "").trim(),
    maxSalary: String(preferences?.maxSalary || "").trim(),
    currency: String(preferences?.salaryCurrency || "USD").trim().toUpperCase(),
  };

  return await hashString(JSON.stringify(sigObj));
}

async function handleFetchCurrencyFactor(payload) {
  const code = (payload?.currencyCode || "USD").toUpperCase();
  try {
    const { factor, rawContent } = await fetchUsdToCurrencyFactor(code);
    return success({
      factor,
      rawContent,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    const codeErr = err instanceof ExchangeRateError ? err.code : undefined;
    return error(err.message || "Currency lookup failed", codeErr || "CURRENCY_FETCH_ERROR");
  }
}

async function maybeRefreshStaleCurrencyRate() {
  const prefs = await getPreferences();
  const code = (prefs.salaryCurrency || "USD").toUpperCase();
  if (code === "USD") return;

  const fetchedAt = prefs.currencyFactorFetchedAt ? Date.parse(prefs.currencyFactorFetchedAt) : 0;
  if (Number.isFinite(fetchedAt) && Date.now() - fetchedAt < CURRENCY_RATE_STALE_MS) {
    return;
  }

  try {
    const { factor, rawContent } = await fetchUsdToCurrencyFactor(code);
    await savePreferences({
      ...prefs,
      usdToDisplayCurrencyFactor: factor,
      currencyFactorRawResponse: rawContent,
      currencyFactorFetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[currency] Stale refresh failed:", e?.message || e);
  }
}

function parseDateString(dateStr) {
  if (!dateStr) return { month: "", year: "" };
  const str = String(dateStr).trim();

  const MONTH_NAMES = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];
  const MON_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3).toLowerCase());

  // Handle "present" / "current"
  const lower = str.toLowerCase();
  if (lower === "present" || lower === "current" || lower === "now") {
    return { month: "", year: "" };
  }

  // Handle date ranges like "Jan 2020 – Mar 2022" — take only the first part
  const rangeParts = str.split(/\s*[-–—]\s*/);
  const datePart = rangeParts[0].trim();

  const yearMatch = datePart.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : "";

  // Year-only (e.g. "2022") → default to January
  if (/^\d{4}$/.test(datePart) && year) {
    return { month: "January", year };
  }

  let month = "";
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const lowerPart = datePart.toLowerCase();
    if (lowerPart.includes(MONTH_NAMES[i].toLowerCase()) || lowerPart.includes(MON_SHORT[i])) {
      month = MONTH_NAMES[i];
      break;
    }
  }

  // Try numeric month: "04/2025", "04-2025", "2025-04", "04.2025"
  if (!month && year) {
    const numMatch = datePart.match(/\b(0?[1-9]|1[0-2])\s*[\/\-\.]\s*(19|20)\d{2}\b/) ||
                     datePart.match(/\b(19|20)\d{2}\s*[\/\-\.]\s*(0?[1-9]|1[0-2])\b/);
    if (numMatch) {
      const parts = datePart.split(/[\/\-\.]/);
      for (const p of parts) {
        const num = parseInt(p.trim(), 10);
        if (num >= 1 && num <= 12 && p.trim().length <= 2) {
          month = MONTH_NAMES[num - 1];
          break;
        }
      }
    }
  }

  return { month, year };
}

function success(data) {
  return { success: true, data };
}

function error(message, code = "UNKNOWN_ERROR") {
  return { success: false, error: message, code };
}

async function getFromRawStorageApiConfig() {
  // Raw config as stored in chrome.storage.local, without injecting decrypted session keys.
  try {
    const raw = await chrome.storage.local.get("apiConfig");
    return raw?.apiConfig || null;
  } catch {
    return null;
  }
}
