import {
  SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildResumeParseSystem,
  buildResumeParsePrompt,
  getParseResumeMaxTokens,
  normalizeResumeProfileDepth,
  buildCoverLetterPrompt,
  buildSmartCoverLetterPrompt,
  buildFindJobsPrompt,
  buildSmartFillSystem,
  buildSmartFillPrompt,
} from "../shared/prompts.js";
import { MAX_JOB_TEXT_LENGTH } from "../shared/constants.js";
import { buildJobPostingKey, normalizeJobPageUrl, normalizeCompanyTitleKey } from "../shared/utils.js";

const PERPLEXITY_BASE = "https://api.perplexity.ai";

export async function analyzeJobPerplexity(jobText, resumeText, apiConfig) {
  const trimmedJob = jobText.slice(0, MAX_JOB_TEXT_LENGTH);
  const userMessage = buildAnalysisPrompt(trimmedJob, resumeText);

  const response = await callPerplexity(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    apiConfig,
  );

  let parsed;
  try {
    parsed = JSON.parse(extractJson(response.content));
  } catch {
    throw new PerplexityError("Failed to parse Perplexity response as JSON", "PARSE_ERROR");
  }

  return { result: validateAnalysisResult(parsed), usage: response.usage };
}

export async function parseResumePerplexity(resumeText, apiConfig, parseOpts = {}) {
  const depth = normalizeResumeProfileDepth(parseOpts.depth);
  const maxTokens = getParseResumeMaxTokens(depth);
  const response = await callPerplexity(
    [
      { role: "system", content: buildResumeParseSystem(depth) },
      { role: "user", content: buildResumeParsePrompt(resumeText, depth) },
    ],
    { ...apiConfig, maxTokens },
  );

  let parsed;
  try {
    parsed = JSON.parse(extractJson(response.content));
  } catch {
    throw new PerplexityError("Failed to parse Perplexity response as JSON", "PARSE_ERROR");
  }
  return { result: parsed, usage: response.usage };
}

export async function generateCoverLetterPerplexity(jobAnalysis, profile, tone, apiConfig, letterOpts = {}) {
  const smart = letterOpts.smart === true;
  const jobPostingText = letterOpts.jobPostingText || "";
  const prompt = smart
    ? buildSmartCoverLetterPrompt(jobAnalysis, profile, tone, jobPostingText)
    : buildCoverLetterPrompt(jobAnalysis, profile, tone);
  const maxTokens = smart ? 2800 : 1500;
  const response = await callPerplexity(
    [{ role: "user", content: prompt }],
    { ...apiConfig, maxTokens },
  );
  return { result: response.content.trim(), usage: response.usage };
}

export async function findJobsPerplexity(profile, preferences, apiConfig) {
  const { content, usage, raw } = await callPerplexityFull(
    [{ role: "user", content: buildFindJobsPrompt(profile, preferences) }],
    { ...apiConfig, maxTokens: 2000 },
  );

  let jobs = parseFindJobsJsonArray(content);
  if (!jobs.length && Array.isArray(raw?.search_results) && raw.search_results.length) {
    jobs = raw.search_results.map((r) => normalizeSearchResultRow(r));
  }

  jobs = dedupeJobListings(jobs);

  if (!jobs.length && content?.trim()) {
    jobs = [{
      title: "Could not parse job list",
      company: "",
      location: "",
      url: raw?.citations?.[0] || null,
      postedDate: "",
      salary: "",
      match: "The model returned text that was not valid JSON. Try again or switch Perplexity model.",
    }];
  }

  return { result: jobs, usage };
}

export async function planSmartFormFillPerplexity(input, apiConfig, smartOpts = {}) {
  const system = buildSmartFillSystem({ allowGeneration: smartOpts.allowGeneration !== false });
  const user = buildSmartFillPrompt(input);
  const response = await callPerplexity(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { ...apiConfig, maxTokens: Math.max(1400, Number(apiConfig?.maxTokens || 1000)) },
  );

  let parsed;
  try {
    parsed = JSON.parse(extractJson(response.content));
  } catch {
    throw new PerplexityError("Failed to parse Perplexity response as JSON", "PARSE_ERROR");
  }
  return { result: parsed, usage: response.usage };
}

function dedupeJobListings(jobs) {
  if (!Array.isArray(jobs) || jobs.length === 0) return [];
  const out = [];
  const seen = new Set();

  for (const j of jobs) {
    const url = j?.url ? String(j.url).trim() : "";
    const byPostingKey = url ? buildJobPostingKey(url) : "";
    const byNormUrl = url ? normalizeJobPageUrl(url) : "";
    const byMeta = `meta:${normalizeCompanyTitleKey(j?.company)}|${normalizeCompanyTitleKey(j?.title)}`;
    const key = byPostingKey || (byNormUrl ? `url:${byNormUrl}` : byMeta);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(j);
  }

  return out;
}

export async function testPerplexityKey(apiConfig) {
  try {
    await callPerplexity(
      [{ role: "user", content: "Reply with exactly: OK" }],
      { ...apiConfig, maxTokens: 5 },
    );
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

async function callPerplexity(messages, apiConfig) {
  const out = await callPerplexityFull(messages, apiConfig);
  return { content: out.content, usage: out.usage };
}

/**
 * Full Perplexity response including raw JSON (for search_results fallback on Find Jobs).
 */
async function callPerplexityFull(messages, apiConfig) {
  const { perplexityKey, perplexityModel = "sonar", maxTokens = 1000, temperature = 0.3 } = apiConfig;

  if (!perplexityKey) {
    throw new PerplexityError("Perplexity API key not configured", "NO_API_KEY");
  }

  const url = `${PERPLEXITY_BASE}/chat/completions`;
  const body = {
    model: perplexityModel,
    messages,
    max_tokens: maxTokens,
    temperature,
  };

  let response;
  let retries = 0;
  const maxRetries = 3;

  while (retries <= maxRetries) {
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${perplexityKey}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) break;

      const retryableHttp = response.status === 429 || (response.status >= 500 && response.status <= 599);
      if (retryableHttp && retries < maxRetries) {
        const waitMs = Math.pow(2, retries) * 1000 + Math.random() * 1000;
        await new Promise((r) => setTimeout(r, waitMs));
        retries++;
        continue;
      }

      const errorBody = await response.json().catch(() => ({}));
      const errorMsgFull = errorBody.error?.message || `HTTP ${response.status}`;
      const errorMsg = String(errorMsgFull).slice(0, 2000);
      if (response.status === 401) throw new PerplexityError(errorMsg, "INVALID_API_KEY");
      if (response.status === 429) throw new PerplexityError("Rate limit exceeded. Try again later.", "RATE_LIMITED");
      throw new PerplexityError(errorMsg, "API_ERROR");
    } catch (err) {
      if (err instanceof PerplexityError) throw err;
      if (retries < maxRetries) {
        retries++;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw new PerplexityError("Cannot reach Perplexity API. Check your internet connection.", "NETWORK_ERROR");
    }
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  if (!choice?.message?.content) {
    throw new PerplexityError("Empty response from Perplexity", "PARSE_ERROR");
  }

  return {
    content: choice.message.content,
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    raw: data,
  };
}

/**
 * Parse a JSON array of job objects from model output (handles ``` fences and balanced [...]).
 */
function parseFindJobsJsonArray(text) {
  if (!text || typeof text !== "string") return [];

  const trimmed = text.trim();
  const tryParse = (s) => {
    try {
      const v = JSON.parse(s);
      if (Array.isArray(v)) return v.map(normalizeJobListing).filter((j) => j.title || j.url);
      if (v && typeof v === "object" && Array.isArray(v.jobs)) {
        return v.jobs.map(normalizeJobListing).filter((j) => j.title || j.url);
      }
      if (v && typeof v === "object" && Array.isArray(v.results)) {
        return v.results.map(normalizeJobListing).filter((j) => j.title || j.url);
      }
    } catch {
      /* continue */
    }
    return [];
  };

  let jobs = tryParse(trimmed);
  if (jobs.length) return jobs;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) {
    jobs = tryParse(fenced[1].trim());
    if (jobs.length) return jobs;
  }

  const slice = extractBalancedJsonArray(trimmed);
  if (slice) {
    jobs = tryParse(slice);
    if (jobs.length) return jobs;
  }

  return [];
}

function extractBalancedJsonArray(str) {
  const start = str.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < str.length; i++) {
    const c = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === "\"" && !escape) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) return str.slice(start, i + 1);
    }
  }
  return null;
}

function normalizeJobListing(row) {
  if (!row || typeof row !== "object") {
    return { title: "", company: "", location: "", url: null, postedDate: "", salary: "", match: "" };
  }
  return {
    title: String(row.title || row.job_title || "").trim(),
    company: String(row.company || row.employer || "").trim(),
    location: String(row.location || "").trim(),
    url: row.url ? String(row.url).trim() : null,
    postedDate: String(row.postedDate || row.posted || row.date || "").trim(),
    salary: String(row.salary || row.compensation || "").trim(),
    match: String(row.match || row.reason || row.summary || "").trim(),
  };
}

function normalizeSearchResultRow(r) {
  if (!r || typeof r !== "object") {
    return { title: "Listing", company: "", location: "", url: null, postedDate: "", salary: "", match: "" };
  }
  return {
    title: String(r.title || "Job listing").trim(),
    company: "",
    location: "",
    url: r.url ? String(r.url).trim() : null,
    postedDate: String(r.date || r.last_updated || "").trim(),
    salary: "",
    match: String(r.snippet || "").trim(),
  };
}

/** Extract JSON object from a response that may have markdown code fences */
function extractJson(content) {
  if (!content) return content;
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const objMatch = content.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  return content;
}

function validateAnalysisResult(parsed) {
  return {
    match_score: clamp(Number(parsed.match_score) || 0, 0, 100),
    strengths: ensureArray(parsed.strengths).slice(0, 5),
    missing_skills: ensureArray(parsed.missing_skills).slice(0, 5),
    recommendation: ["Apply", "Skip", "Consider"].includes(parsed.recommendation)
      ? parsed.recommendation
      : "Consider",
    reason: String(parsed.reason || "No explanation provided."),
    job_title: String(parsed.job_title || "Unknown Title"),
    company: String(parsed.company || "Unknown Company"),
    key_requirements: ensureArray(parsed.key_requirements).slice(0, 5),
    experience_match: String(parsed.experience_match || ""),
    salary_range: parsed.salary_range || null,
    location: String(parsed.location || "Not specified"),
    job_type: String(parsed.job_type || "Full-time"),
  };
}

function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }
function ensureArray(val) { return Array.isArray(val) ? val.map(String) : []; }

class PerplexityError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "PerplexityError";
    this.code = code;
  }
}
