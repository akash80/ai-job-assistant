import {
  SYSTEM_PROMPT,
  buildAnalysisPrompt,
  buildResumeParseSystem,
  buildResumeParsePrompt,
  getParseResumeMaxTokens,
  normalizeResumeProfileDepth,
  buildCoverLetterPrompt,
  buildSmartCoverLetterPrompt,
  buildSmartFillSystem,
  buildSmartFillPrompt,
} from "../shared/prompts.js";
import { MAX_JOB_TEXT_LENGTH } from "../shared/constants.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

function looksLikeMissingModelError(status, message) {
  const msg = String(message || "");
  const notFoundOrUnsupported =
    /models\/.+ is not found/i.test(msg)
    || /Call ListModels/i.test(msg)
    || /not supported for generateContent/i.test(msg);
  const deprecatedForNewUsers =
    /no longer available to new users/i.test(msg)
    || /update your code to use a newer model/i.test(msg);
  if (deprecatedForNewUsers) return true;
  return status === 404 && notFoundOrUnsupported;
}

function stripModelsPrefix(name) {
  return String(name || "").replace(/^models\//, "");
}

async function listModels(geminiKey) {
  const url = `${GEMINI_BASE}/models?key=${encodeURIComponent(geminiKey)}`;
  const resp = await fetch(url, { method: "GET" });
  if (!resp.ok) {
    const errorBody = await resp.json().catch(() => ({}));
    const errorMsg = String(errorBody.error?.message || `HTTP ${resp.status}`).slice(0, 2000);
    throw new GeminiError(errorMsg, "API_ERROR");
  }
  const data = await resp.json().catch(() => ({}));
  const models = Array.isArray(data?.models) ? data.models : [];
  return models.map((m) => ({
    name: stripModelsPrefix(m?.name),
    baseModelId: String(m?.baseModelId || ""),
    supportedGenerationMethods: Array.isArray(m?.supportedGenerationMethods) ? m.supportedGenerationMethods : [],
    displayName: String(m?.displayName || ""),
  }));
}

function pickFallbackModelId(models) {
  const supportsGenerateContent = (m) => (m.supportedGenerationMethods || []).includes("generateContent");
  const supported = (models || []).filter((m) => m?.name && supportsGenerateContent(m));
  if (!supported.length) return "";

  const prefer = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-001",
    "gemini-2.5-pro",
    "gemini-2.5-pro-001",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-1.5-flash-001",
    "gemini-1.5-pro-001",
    "gemini-flash-latest",
  ];

  for (const id of prefer) {
    const hit = supported.find((m) => m.name === id || m.baseModelId === id);
    if (hit?.name) return hit.name;
  }

  return supported[0].name;
}

export async function analyzeJobGemini(jobText, resumeText, apiConfig) {
  const trimmedJob = jobText.slice(0, MAX_JOB_TEXT_LENGTH);
  const userMessage = buildAnalysisPrompt(trimmedJob, resumeText);

  const response = await callGemini(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    apiConfig,
    { responseMimeType: "application/json" },
  );

  let parsed;
  try {
    parsed = JSON.parse(extractJson(response.content));
  } catch {
    throw new GeminiError("Failed to parse Gemini response as JSON", "PARSE_ERROR");
  }

  return { result: validateAnalysisResult(parsed), usage: response.usage };
}

export async function parseResumeGemini(resumeText, apiConfig, parseOpts = {}) {
  const depth = normalizeResumeProfileDepth(parseOpts.depth);
  const maxTokens = getParseResumeMaxTokens(depth);
  const response = await callGemini(
    [
      { role: "system", content: buildResumeParseSystem(depth) },
      { role: "user", content: buildResumeParsePrompt(resumeText, depth) },
    ],
    { ...apiConfig, maxTokens },
    { responseMimeType: "application/json" },
  );

  let parsed;
  try {
    parsed = JSON.parse(extractJson(response.content));
  } catch {
    throw new GeminiError("Failed to parse Gemini response as JSON", "PARSE_ERROR");
  }
  return { result: parsed, usage: response.usage };
}

export async function generateCoverLetterGemini(jobAnalysis, profile, tone, apiConfig, letterOpts = {}) {
  const smart = letterOpts.smart === true;
  const jobPostingText = letterOpts.jobPostingText || "";
  const prompt = smart
    ? buildSmartCoverLetterPrompt(jobAnalysis, profile, tone, jobPostingText)
    : buildCoverLetterPrompt(jobAnalysis, profile, tone);
  const maxTokens = smart ? 2800 : 1500;
  const response = await callGemini(
    [{ role: "user", content: prompt }],
    { ...apiConfig, maxTokens },
  );
  return { result: response.content.trim(), usage: response.usage };
}

export async function planSmartFormFillGemini(input, apiConfig, smartOpts = {}) {
  const system = buildSmartFillSystem({ allowGeneration: smartOpts.allowGeneration !== false });
  const user = buildSmartFillPrompt(input);
  const response = await callGemini(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { ...apiConfig, maxTokens: Math.max(1400, Number(apiConfig?.maxTokens || 1000)) },
    { responseMimeType: "application/json" },
  );

  let parsed;
  try {
    parsed = JSON.parse(extractJson(response.content));
  } catch {
    throw new GeminiError("Failed to parse Gemini response as JSON", "PARSE_ERROR");
  }
  return { result: parsed, usage: response.usage };
}

export async function testGeminiKey(apiConfig) {
  try {
    await callGemini(
      [{ role: "user", content: "Reply with exactly: OK" }],
      { ...apiConfig, maxTokens: 5 },
    );
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

function toGeminiContents(messages) {
  const out = [];
  for (const m of messages || []) {
    const role = m?.role === "system" ? "user" : m?.role === "assistant" ? "model" : "user";
    const text = String(m?.content || "");
    if (!text) continue;
    out.push({ role, parts: [{ text }] });
  }
  return out;
}

async function callGemini(messages, apiConfig, extra = {}) {
  const { geminiKey, geminiModel = "gemini-2.0-flash", maxTokens = 1000, temperature = 0.3 } = apiConfig;

  if (!geminiKey) {
    throw new GeminiError("Gemini API key not configured", "NO_API_KEY");
  }

  const body = {
    contents: toGeminiContents(messages),
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(extra?.responseMimeType ? { responseMimeType: extra.responseMimeType } : {}),
    },
  };

  const doRequest = async (modelId) => {
    const url = `${GEMINI_BASE}/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(geminiKey)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response;
  };

  let response;
  let retries = 0;
  const maxRetries = 3;
  let modelId = String(geminiModel || "").trim() || "gemini-2.0-flash";
  let modelFallbackTried = false;

  while (retries <= maxRetries) {
    try {
      response = await doRequest(modelId);

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

      if (!modelFallbackTried && looksLikeMissingModelError(response.status, errorMsg)) {
        modelFallbackTried = true;
        const models = await listModels(geminiKey).catch(() => []);
        const fallback = pickFallbackModelId(models);
        if (fallback && fallback !== modelId) {
          modelId = fallback;
          continue;
        }
      }

      if (response.status === 401 || response.status === 403) throw new GeminiError(errorMsg, "INVALID_API_KEY");
      if (response.status === 429) throw new GeminiError("Rate limit exceeded. Try again later.", "RATE_LIMITED");
      throw new GeminiError(errorMsg, "API_ERROR");
    } catch (err) {
      if (err instanceof GeminiError) throw err;
      if (retries < maxRetries) {
        retries++;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw new GeminiError("Cannot reach Gemini API. Check your internet connection.", "NETWORK_ERROR");
    }
  }

  const data = await response.json().catch(() => ({}));
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || "").join("") || "";
  if (!text) {
    throw new GeminiError("Empty response from Gemini", "PARSE_ERROR");
  }

  const usage = {
    prompt_tokens: data?.usageMetadata?.promptTokenCount || 0,
    completion_tokens: data?.usageMetadata?.candidatesTokenCount || 0,
    total_tokens: data?.usageMetadata?.totalTokenCount || 0,
  };

  return { content: text, usage };
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

/** Extract JSON from a response that may have markdown code fences */
function extractJson(content) {
  if (!content) return content;
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const objMatch = content.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  return content;
}

class GeminiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "GeminiError";
    this.code = code;
  }
}

