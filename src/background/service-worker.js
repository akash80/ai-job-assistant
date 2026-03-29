import { MSG } from "../shared/constants.js";
import { hashContent } from "../shared/utils.js";
import { analyzeJob, parseResume, testApiKey, fetchUsdToCurrencyFactor } from "./openai-client.js";
import { getCachedAnalysis, cacheAnalysis, clearCache } from "./cache-manager.js";
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
  getHistory,
  logApplication,
  exportAllData,
  importData,
  clearAllData,
} from "./storage-manager.js";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // keep message channel open for async response
});

async function handleMessage(message, _sender) {
  const { type, payload } = message;

  try {
    switch (type) {
      case MSG.ANALYZE_JOB:
        return await handleAnalyzeJob(payload);

      case MSG.GET_CACHED_ANALYSIS:
        return await handleGetCached(payload);

      case MSG.TEST_API_KEY:
        return await handleTestApiKey(payload);

      case MSG.GET_API_CONFIG:
        return success(await getApiConfig());

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

      case MSG.GET_USAGE_STATS:
        return success({ all: await getUsageStats(), today: await getTodayStats() });

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
  const { jobText, pageUrl } = payload;
  const apiConfig = await getApiConfig();

  if (!apiConfig.apiKey) {
    return error("Please configure your OpenAI API key in settings.", "NO_API_KEY");
  }

  const resume = await getResume();
  if (!resume?.rawText) {
    return error("Please add your resume in settings.", "NO_RESUME");
  }

  const contentHash = await hashContent(jobText);

  const cached = await getCachedAnalysis(contentHash);
  if (cached) {
    await trackCacheHit();
    return success({ ...cached.result, cached: true });
  }

  const { result, usage } = await analyzeJob(jobText, resume.rawText, apiConfig);

  await cacheAnalysis(contentHash, result, {
    jobUrl: pageUrl,
    jobTitle: result.job_title,
    model: apiConfig.model,
    tokensUsed: usage.total_tokens,
  });

  await trackUsage(apiConfig.model, usage);

  return success({ ...result, cached: false });
}

async function handleParseResume(payload) {
  const apiConfig = await getApiConfig();
  if (!apiConfig.apiKey) {
    return error("Please configure your OpenAI API key first.", "NO_API_KEY");
  }

  const { result, usage } = await parseResume(payload.resumeText, apiConfig);
  await trackUsage(apiConfig.model, usage);

  // Pass through everything the AI extracted — don't hardcode fields
  // This lets ANY resume format work, including custom sections
  const profile = { ...result };

  // Ensure critical fields exist with defaults
  profile.name = profile.name || "";
  profile.email = profile.email || "";
  profile.phone = profile.phone || "";
  profile.location = profile.location || "";
  profile.skills = profile.skills || {};
  profile.experience = profile.experience || [];
  profile.education = profile.education || [];
  profile.projects = profile.projects || [];
  profile.additionalSections = profile.additionalSections || {};

  // Normalize experience dates: convert "startDate"/"endDate" strings to month/year fields
  for (const exp of profile.experience) {
    if (exp.startDate && (!exp.startMonth || !exp.startYear)) {
      const parsed = parseDateString(exp.startDate);
      if (!exp.startMonth) exp.startMonth = parsed.month;
      if (!exp.startYear) exp.startYear = parsed.year;
    }
    if (exp.endDate && (!exp.endMonth || !exp.endYear)) {
      const endLower = (exp.endDate || "").toLowerCase().trim();
      if (endLower === "current" || endLower === "present") {
        exp.isCurrentCompany = true;
        exp.endMonth = "";
        exp.endYear = "";
      } else {
        const parsed = parseDateString(exp.endDate);
        if (!exp.endMonth) exp.endMonth = parsed.month;
        if (!exp.endYear) exp.endYear = parsed.year;
      }
    }
  }

  // Normalize internship dates the same way
  for (const int of (profile.internships || [])) {
    if (int.startDate && (!int.startMonth || !int.startYear)) {
      const parsed = parseDateString(int.startDate);
      if (!int.startMonth) int.startMonth = parsed.month;
      if (!int.startYear) int.startYear = parsed.year;
    }
    if (int.endDate && (!int.endMonth || !int.endYear)) {
      const parsed = parseDateString(int.endDate);
      if (!int.endMonth) int.endMonth = parsed.month;
      if (!int.endYear) int.endYear = parsed.year;
    }
  }

  // Derive isCurrentCompany if AI didn't set it
  if (profile.experience.length) {
    const hasAnyCurrent = profile.experience.some((e) => e.isCurrentCompany);
    if (!hasAnyCurrent) {
      const first = profile.experience[0];
      const end = (first.endYear || first.endDate || "").toLowerCase().trim();
      if (!end || end === "current" || end === "present") {
        first.isCurrentCompany = true;
        first.endMonth = "";
        first.endYear = "";
      }
    }
  }

  // Build flattened text fields for form auto-fill
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

  await saveProfile(profile);
  return success(profile);
}

async function handleGetCached(payload) {
  const contentHash = await hashContent(payload.jobText);
  const cached = await getCachedAnalysis(contentHash);
  return success(cached?.result || null);
}

async function handleTestApiKey(payload) {
  const config = payload.apiKey ? payload : await getApiConfig();
  const result = await testApiKey(config);
  return success(result);
}

async function handleFetchCurrencyFactor(payload) {
  const apiConfig = await getApiConfig();
  if (!apiConfig.apiKey) {
    return error("Please configure your OpenAI API key in settings.", "NO_API_KEY");
  }
  const code = (payload?.currencyCode || "USD").toUpperCase();
  try {
    const { factor, rawContent } = await fetchUsdToCurrencyFactor(code, apiConfig);
    return success({
      factor,
      rawContent,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    return error(err.message || "Currency lookup failed", err.code || "CURRENCY_FETCH_ERROR");
  }
}

function parseDateString(dateStr) {
  if (!dateStr) return { month: "", year: "" };
  const str = dateStr.trim();

  const MONTH_NAMES = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December"
  ];
  const MON_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3).toLowerCase());

  const yearMatch = str.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : "";

  let month = "";
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (str.toLowerCase().includes(MONTH_NAMES[i].toLowerCase()) || str.toLowerCase().includes(MON_SHORT[i])) {
      month = MONTH_NAMES[i];
      break;
    }
  }

  // Try numeric month: "04/2025", "04-2025", "2025-04"
  if (!month) {
    const numMatch = str.match(/\b(0?[1-9]|1[0-2])\s*[\/\-\.]\s*(19|20)\d{2}\b/) ||
                     str.match(/\b(19|20)\d{2}\s*[\/\-\.]\s*(0?[1-9]|1[0-2])\b/);
    if (numMatch) {
      const parts = str.split(/[\/\-\.]/);
      for (const p of parts) {
        const num = parseInt(p.trim());
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
