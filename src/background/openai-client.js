import {
  SYSTEM_PROMPT,
  buildAnalysisPrompt,
  RESUME_PARSE_SYSTEM,
  buildResumeParsePrompt,
  VALIDATION_PROMPT_MESSAGE,
} from "../shared/prompts.js";
import { MAX_JOB_TEXT_LENGTH } from "../shared/constants.js";

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

export async function parseResume(resumeText, apiConfig) {
  const response = await callOpenAI(
    [
      { role: "system", content: RESUME_PARSE_SYSTEM },
      { role: "user", content: buildResumeParsePrompt(resumeText) },
    ],
    { ...apiConfig, maxTokens: 3000 },
    { response_format: { type: "json_object" } },
  );

  const parsed = JSON.parse(response.content);
  return { result: parsed, usage: response.usage };
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

const CURRENCY_FACTOR_SYSTEM = `You output only valid JSON. The user will name a target ISO 4217 currency code.
Respond with how many units of that currency equal 1.00 USD at roughly current market rates.
Schema: {"usdToCurrency": <positive number>, "currencyCode": "<uppercase ISO code>", "brief": "<one short sentence>"}
Example for EUR: {"usdToCurrency":0.92,"currencyCode":"EUR","brief":"approximate spot rate"}`;

/**
 * Uses OpenAI to estimate USD → target currency (for UI pricing display only).
 */
export async function fetchUsdToCurrencyFactor(currencyCode, apiConfig) {
  const code = String(currencyCode || "USD").trim().toUpperCase();
  if (code === "USD") {
    const raw = JSON.stringify({
      usdToCurrency: 1,
      currencyCode: "USD",
      brief: "identity",
    });
    return { factor: 1, rawContent: raw };
  }

  const response = await callOpenAI(
    [
      { role: "system", content: CURRENCY_FACTOR_SYSTEM },
      {
        role: "user",
        content: `Target currency code: ${code}. Return only the JSON object with usdToCurrency = units of ${code} per 1 USD.`,
      },
    ],
    { ...apiConfig, maxTokens: 200, temperature: 0.2 },
    { response_format: { type: "json_object" } },
  );

  let parsed;
  try {
    parsed = JSON.parse(response.content);
  } catch {
    throw new OpenAIError("Could not parse currency response", "INVALID_CURRENCY_RESPONSE");
  }

  const factor = Number(parsed.usdToCurrency);
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new OpenAIError("Invalid usdToCurrency in model response", "INVALID_CURRENCY_RESPONSE");
  }

  return { factor, rawContent: response.content };
}

async function callOpenAI(messages, apiConfig, extraBody = {}) {
  const { apiKey, model, baseUrl, maxTokens, temperature } = apiConfig;

  if (!apiKey) {
    throw new OpenAIError("API key not configured", "NO_API_KEY");
  }

  const url = `${baseUrl}/chat/completions`;

  const body = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature,
    ...extraBody,
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
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (response.ok) break;

      if (response.status === 429 && retries < maxRetries) {
        const waitMs = Math.pow(2, retries) * 1000 + Math.random() * 1000;
        await new Promise((r) => setTimeout(r, waitMs));
        retries++;
        continue;
      }

      const errorBody = await response.json().catch(() => ({}));
      const errorMsg = errorBody.error?.message || `HTTP ${response.status}`;

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
