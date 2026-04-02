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
  buildTailorResumeSystem,
  buildTailorResumePrompt,
} from "../shared/prompts.js";
import { MAX_JOB_TEXT_LENGTH } from "../shared/constants.js";
import { validateTailoredResume } from "../shared/tailored-resume.js";

const ANTHROPIC_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

export async function analyzeJobAnthropic(jobText, resumeText, apiConfig) {
  const trimmedJob = jobText.slice(0, MAX_JOB_TEXT_LENGTH);
  const userMessage = buildAnalysisPrompt(trimmedJob, resumeText);

  const response = await callAnthropic(
    SYSTEM_PROMPT,
    [{ role: "user", content: userMessage }],
    apiConfig,
  );

  let parsed;
  try {
    parsed = JSON.parse(extractJson(response.content));
  } catch {
    throw new AnthropicError("Failed to parse Anthropic response as JSON", "PARSE_ERROR");
  }

  return { result: validateAnalysisResult(parsed), usage: response.usage };
}

export async function parseResumeAnthropic(resumeText, apiConfig, parseOpts = {}) {
  const depth = normalizeResumeProfileDepth(parseOpts.depth);
  const maxTokens = getParseResumeMaxTokens(depth);
  const response = await callAnthropic(
    buildResumeParseSystem(depth),
    [{ role: "user", content: buildResumeParsePrompt(resumeText, depth) }],
    { ...apiConfig, maxTokens },
  );

  let parsed;
  try {
    parsed = JSON.parse(extractJson(response.content));
  } catch {
    throw new AnthropicError("Failed to parse Anthropic response as JSON", "PARSE_ERROR");
  }
  return { result: parsed, usage: response.usage };
}

export async function generateCoverLetterAnthropic(jobAnalysis, profile, tone, apiConfig, letterOpts = {}) {
  const smart = letterOpts.smart === true;
  const jobPostingText = letterOpts.jobPostingText || "";
  const userContent = smart
    ? buildSmartCoverLetterPrompt(jobAnalysis, profile, tone, jobPostingText)
    : buildCoverLetterPrompt(jobAnalysis, profile, tone);
  const maxTokens = smart ? 2800 : 1500;
  const response = await callAnthropic(
    "You are an expert career coach and professional writer. Write compelling, authentic cover letters.",
    [{ role: "user", content: userContent }],
    { ...apiConfig, maxTokens },
  );
  return { result: response.content.trim(), usage: response.usage };
}

export async function testAnthropicKey(apiConfig) {
  try {
    await callAnthropic(
      "You are a helpful assistant.",
      [{ role: "user", content: "Reply with exactly: OK" }],
      { ...apiConfig, maxTokens: 5 },
    );
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

export async function planSmartFormFillAnthropic(input, apiConfig, smartOpts = {}) {
  const system = buildSmartFillSystem({ allowGeneration: smartOpts.allowGeneration !== false });
  const user = buildSmartFillPrompt(input);
  const response = await callAnthropic(
    system,
    [{ role: "user", content: user }],
    { ...apiConfig, maxTokens: Math.max(1400, Number(apiConfig?.maxTokens || 1000)) },
  );
  let parsed;
  try {
    parsed = JSON.parse(extractJson(response.content));
  } catch {
    throw new AnthropicError("Failed to parse Anthropic response as JSON", "PARSE_ERROR");
  }
  return { result: parsed, usage: response.usage };
}

export async function generateTailoredResumeAnthropic(requestJson, apiConfig) {
  const response = await callAnthropic(
    buildTailorResumeSystem(),
    [{ role: "user", content: buildTailorResumePrompt(requestJson) }],
    { ...apiConfig, maxTokens: Math.max(2200, Number(apiConfig?.maxTokens || 2000)) },
  );
  let parsed;
  try {
    parsed = JSON.parse(extractJson(response.content));
  } catch {
    throw new AnthropicError("Failed to parse Anthropic tailored resume as JSON", "PARSE_ERROR");
  }
  return { result: validateTailoredResume(parsed), usage: response.usage };
}

async function callAnthropic(systemPrompt, messages, apiConfig) {
  const { anthropicKey, anthropicModel = "claude-sonnet-4-6", maxTokens = 1000, temperature = 0.3 } = apiConfig;

  if (!anthropicKey) {
    throw new AnthropicError("Anthropic API key not configured", "NO_API_KEY");
  }

  const url = `${ANTHROPIC_BASE}/messages`;
  const body = {
    model: anthropicModel,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages,
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
          "x-api-key": anthropicKey,
          "anthropic-version": ANTHROPIC_VERSION,
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
      if (response.status === 401) throw new AnthropicError(errorMsg, "INVALID_API_KEY");
      if (response.status === 429) throw new AnthropicError("Rate limit exceeded. Try again later.", "RATE_LIMITED");
      throw new AnthropicError(errorMsg, "API_ERROR");
    } catch (err) {
      if (err instanceof AnthropicError) throw err;
      if (retries < maxRetries) {
        retries++;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw new AnthropicError("Cannot reach Anthropic API. Check your internet connection.", "NETWORK_ERROR");
    }
  }

  const data = await response.json();
  // Anthropic returns content as an array of blocks
  const textBlock = data.content?.find((b) => b.type === "text");
  if (!textBlock?.text) {
    throw new AnthropicError("Empty response from Anthropic", "PARSE_ERROR");
  }

  return {
    content: textBlock.text,
    usage: {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };
}

/** Extract JSON from a response that may have markdown code fences */
function extractJson(content) {
  if (!content) return content;
  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const objMatch = content.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  return content;
}

function validateAnalysisResult(parsed) {
  const LIST_CAP = 12;
  return {
    match_score: clamp(Number(parsed.match_score) || 0, 0, 100),
    strengths: ensureArray(parsed.strengths).slice(0, LIST_CAP),
    missing_skills: ensureArray(parsed.missing_skills).slice(0, LIST_CAP),
    recommendation: ["Apply", "Skip", "Consider"].includes(parsed.recommendation)
      ? parsed.recommendation
      : "Consider",
    reason: String(parsed.reason || "No explanation provided."),
    job_title: String(parsed.job_title || "Unknown Title"),
    company: String(parsed.company || "Unknown Company"),
    key_requirements: ensureArray(parsed.key_requirements).slice(0, LIST_CAP),
    experience_match: String(parsed.experience_match || ""),
    salary_range: parsed.salary_range || null,
    location: String(parsed.location || "Not specified"),
    job_type: String(parsed.job_type || "Full-time"),
  };
}

function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }
function ensureArray(val) { return Array.isArray(val) ? val.map(String) : []; }

class AnthropicError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "AnthropicError";
    this.code = code;
  }
}
