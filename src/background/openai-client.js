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
  VALIDATION_PROMPT_MESSAGE,
} from "../shared/prompts.js";
import { MAX_JOB_TEXT_LENGTH } from "../shared/constants.js";
import { validateTailoredResume } from "../shared/tailored-resume.js";

export async function analyzeJob(jobText, resumeText, apiConfig) {
  const trimmedJob = jobText.slice(0, MAX_JOB_TEXT_LENGTH);
  const userMessage = buildAnalysisPrompt(trimmedJob, resumeText);

  const response = await callOpenAI(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    apiConfig,
    { response_format: { type: "json_object" } },
  );

  const parsed = JSON.parse(response.content);

  return {
    result: validateAnalysisResult(parsed),
    usage: response.usage,
  };
}

export async function parseResume(resumeText, apiConfig, parseOpts = {}) {
  const depth = normalizeResumeProfileDepth(parseOpts.depth);
  const maxTokens = getParseResumeMaxTokens(depth);
  const response = await callOpenAI(
    [
      { role: "system", content: buildResumeParseSystem(depth) },
      { role: "user", content: buildResumeParsePrompt(resumeText, depth) },
    ],
    { ...apiConfig, maxTokens },
    { response_format: { type: "json_object" } },
  );

  const parsed = JSON.parse(response.content);
  return { result: parsed, usage: response.usage };
}

export async function generateCoverLetterOpenAI(jobAnalysis, profile, tone, apiConfig, letterOpts = {}) {
  const smart = letterOpts.smart === true;
  const jobPostingText = letterOpts.jobPostingText || "";
  const userContent = smart
    ? buildSmartCoverLetterPrompt(jobAnalysis, profile, tone, jobPostingText)
    : buildCoverLetterPrompt(jobAnalysis, profile, tone);
  const maxTokens = smart ? 2800 : 1500;
  const response = await callOpenAI(
    [{ role: "user", content: userContent }],
    { ...apiConfig, maxTokens },
  );
  return { result: response.content.trim(), usage: response.usage };
}

export async function testApiKey(apiConfig) {
  try {
    const response = await callOpenAI(
      [{ role: "user", content: VALIDATION_PROMPT_MESSAGE }],
      { ...apiConfig, maxTokens: 5 },
    );
    return { valid: true, model: apiConfig.model };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

export async function planSmartFormFillOpenAI(input, apiConfig, smartOpts = {}) {
  const system = buildSmartFillSystem({ allowGeneration: smartOpts.allowGeneration !== false });
  const user = buildSmartFillPrompt(input);
  const response = await callOpenAI(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { ...apiConfig, maxTokens: Math.max(1200, Number(apiConfig?.maxTokens || 1000)) },
    { response_format: { type: "json_object" } },
  );
  const parsed = JSON.parse(response.content);
  return { result: parsed, usage: response.usage };
}

export async function generateTailoredResumeOpenAI(requestJson, apiConfig) {
  const system = buildTailorResumeSystem();
  const user = buildTailorResumePrompt(requestJson);
  const response = await callOpenAI(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { ...apiConfig, maxTokens: Math.max(1800, Number(apiConfig?.maxTokens || 2000)) },
    { response_format: { type: "json_object" } },
  );
  const parsed = JSON.parse(response.content);
  return { result: validateTailoredResume(parsed), usage: response.usage };
}

function modelPrefersMaxCompletionTokens(modelId) {
  // OpenAI reasoning models reject `max_tokens` on Chat Completions and require `max_completion_tokens`.
  // Keep this conservative: prefer the newer param for "o*" models, and rely on server-error fallback for others.
  return typeof modelId === "string" && /^o\d/i.test(modelId);
}

function modelSupportsCustomTemperature(modelId) {
  // Some newer/high-end models only support the default temperature and reject custom values.
  // Keep this conservative: omit temperature for o* reasoning models and gpt-5*.
  return !(typeof modelId === "string" && (/^o\d/i.test(modelId) || /^gpt-5/i.test(modelId)));
}

function buildChatCompletionsBody({ model, messages, maxTokens, temperature, extraBody, tokenParam }) {
  const body = {
    model,
    messages,
    ...extraBody,
  };
  if (modelSupportsCustomTemperature(model) && typeof temperature === "number" && Number.isFinite(temperature)) {
    body.temperature = temperature;
  }
  if (typeof maxTokens === "number" && Number.isFinite(maxTokens) && maxTokens > 0) {
    body[tokenParam] = maxTokens;
  }
  return body;
}

async function callOpenAI(messages, apiConfig, extraBody = {}) {
  const { apiKey, model, baseUrl, maxTokens, temperature } = apiConfig;

  if (!apiKey) {
    throw new OpenAIError("API key not configured", "NO_API_KEY");
  }

  const url = `${baseUrl}/chat/completions`;

  let tokenParam = modelPrefersMaxCompletionTokens(model) ? "max_completion_tokens" : "max_tokens";
  let body = buildChatCompletionsBody({ model, messages, maxTokens, temperature, extraBody, tokenParam });

  let response;
  let retries = 0;
  const maxRetries = 3;
  let tokenParamFallbackTried = false;
  let temperatureFallbackTried = false;

  while (retries <= maxRetries) {
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
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

      // Some models reject custom temperature and only support the default.
      // Retry once with `temperature` omitted.
      if (response.status === 400 && !temperatureFallbackTried) {
        const tempUnsupported =
          /Unsupported (parameter|value):\s*'temperature'/i.test(errorMsg)
          || /Only the default\s*\(1\)\s*value is supported/i.test(errorMsg);
        if (tempUnsupported && "temperature" in body) {
          temperatureFallbackTried = true;
          body = { ...body };
          delete body.temperature;
          continue;
        }
      }

      // Some newer models reject `max_tokens` and require `max_completion_tokens` (and vice versa).
      // Retry once with the alternative param to keep the UI simple.
      if (response.status === 400 && !tokenParamFallbackTried) {
        const needsMaxCompletion = /Unsupported parameter:\s*'max_tokens'[\s\S]*max_completion_tokens/i.test(errorMsg);
        const needsMaxTokens = /Unsupported parameter:\s*'max_completion_tokens'[\s\S]*max_tokens/i.test(errorMsg);
        if (needsMaxCompletion && tokenParam !== "max_completion_tokens") {
          tokenParamFallbackTried = true;
          tokenParam = "max_completion_tokens";
          body = buildChatCompletionsBody({ model, messages, maxTokens, temperature, extraBody, tokenParam });
          continue;
        }
        if (needsMaxTokens && tokenParam !== "max_tokens") {
          tokenParamFallbackTried = true;
          tokenParam = "max_tokens";
          body = buildChatCompletionsBody({ model, messages, maxTokens, temperature, extraBody, tokenParam });
          continue;
        }
      }

      if (response.status === 401) throw new OpenAIError(errorMsg, "INVALID_API_KEY");
      if (response.status === 404) throw new OpenAIError(`Model "${model}" not available`, "MODEL_NOT_FOUND");
      if (response.status === 429) throw new OpenAIError("Rate limit exceeded. Try again later.", "RATE_LIMITED");

      throw new OpenAIError(errorMsg, "API_ERROR");
    } catch (err) {
      if (err instanceof OpenAIError) throw err;
      if (retries < maxRetries) {
        retries++;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      throw new OpenAIError("Cannot reach OpenAI API. Check your internet connection.", "NETWORK_ERROR");
    }
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  if (!choice?.message?.content) {
    throw new OpenAIError("Empty response from OpenAI", "PARSE_ERROR");
  }

  return {
    content: choice.message.content,
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
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

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function ensureArray(val) {
  return Array.isArray(val) ? val.map(String) : [];
}

class OpenAIError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "OpenAIError";
    this.code = code;
  }
}
