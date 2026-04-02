/**
 * Smart AI Router — selects the right AI provider based on:
 * 1. Task type (real-time data → Perplexity, analysis → OpenAI/Anthropic)
 * 2. Available API keys
 * 3. User's configured providers
 *
 * Routing rules:
 * - Job finding (real-time search) → Perplexity only (OpenAI cannot do live web search here)
 * - Job analysis (structured match scoring) → OpenAI/Anthropic preferred, falls back to Perplexity
 * - Resume parsing → OpenAI/Anthropic preferred
 * - Cover letter → OpenAI/Anthropic preferred
 * - If only Perplexity → uses Perplexity for everything
 * - If only OpenAI → uses OpenAI for everything
 * - If both → smart routing per task
 */

import { analyzeJob, parseResume, testApiKey, planSmartFormFillOpenAI } from "./openai-client.js";
import {
  analyzeJobPerplexity,
  parseResumePerplexity,
  generateCoverLetterPerplexity,
  findJobsPerplexity,
  planSmartFormFillPerplexity,
  testPerplexityKey,
} from "./perplexity-client.js";
import {
  analyzeJobAnthropic,
  parseResumeAnthropic,
  generateCoverLetterAnthropic,
  planSmartFormFillAnthropic,
  testAnthropicKey,
} from "./anthropic-client.js";
import {
  analyzeJobGemini,
  parseResumeGemini,
  generateCoverLetterGemini,
  planSmartFormFillGemini,
  testGeminiKey,
} from "./gemini-client.js";
import { generateCoverLetterOpenAI } from "./openai-client.js";

/**
 * Returns which providers are configured.
 */
export function getAvailableProviders(apiConfig) {
  return {
    openai: !!(apiConfig?.apiKey),
    perplexity: !!(apiConfig?.perplexityKey),
    anthropic: !!(apiConfig?.anthropicKey),
    gemini: !!(apiConfig?.geminiKey),
  };
}

/**
 * Returns true if ANY AI provider is configured.
 */
export function hasAnyProvider(apiConfig) {
  const p = getAvailableProviders(apiConfig);
  return p.openai || p.perplexity || p.anthropic || p.gemini;
}

/**
 * Model id used for usage/cost tracking — mirrors routeAnalyzeJob provider order.
 */
export function getAnalysisModelId(apiConfig) {
  const p = getAvailableProviders(apiConfig);
  if (p.openai) return apiConfig.model;
  if (p.anthropic) return apiConfig.anthropicModel;
  if (p.gemini) return apiConfig.geminiModel;
  if (p.perplexity) return apiConfig.perplexityModel;
  return apiConfig.model;
}

/** Mirrors routeParseResume provider order. */
export function getParseResumeModelId(apiConfig) {
  return getAnalysisModelId(apiConfig);
}

/** Mirrors routeGenerateCoverLetter provider order. */
export function getCoverLetterModelId(apiConfig) {
  return getAnalysisModelId(apiConfig);
}

/** Mirrors routeSmartFormFill provider order. */
export function getSmartFillModelId(apiConfig) {
  return getAnalysisModelId(apiConfig);
}

/**
 * Route job analysis to the best available provider.
 * OpenAI/Anthropic are preferred (better structured JSON output).
 * Falls back to Perplexity if those aren't available.
 */
export async function routeAnalyzeJob(jobText, resumeText, apiConfig) {
  const providers = getAvailableProviders(apiConfig);

  // Prefer OpenAI for analysis (better structured JSON, cheaper)
  if (providers.openai) {
    return analyzeJob(jobText, resumeText, apiConfig);
  }

  // Anthropic next
  if (providers.anthropic) {
    return analyzeJobAnthropic(jobText, resumeText, apiConfig);
  }

  // Gemini next
  if (providers.gemini) {
    return analyzeJobGemini(jobText, resumeText, apiConfig);
  }

  // Perplexity last (works but may need JSON extraction)
  if (providers.perplexity) {
    return analyzeJobPerplexity(jobText, resumeText, apiConfig);
  }

  throw new RouterError("No AI provider configured. Please add an API key in Settings.", "NO_PROVIDER");
}

/**
 * Route resume parsing to the best available provider.
 */
export async function routeParseResume(resumeText, apiConfig, parseOpts = {}) {
  const providers = getAvailableProviders(apiConfig);

  if (providers.openai) {
    return parseResume(resumeText, apiConfig, parseOpts);
  }

  if (providers.anthropic) {
    return parseResumeAnthropic(resumeText, apiConfig, parseOpts);
  }

  if (providers.gemini) {
    return parseResumeGemini(resumeText, apiConfig, parseOpts);
  }

  if (providers.perplexity) {
    return parseResumePerplexity(resumeText, apiConfig, parseOpts);
  }

  throw new RouterError("No AI provider configured. Please add an API key in Settings.", "NO_PROVIDER");
}

/**
 * Route cover letter generation.
 * OpenAI/Anthropic preferred for quality.
 */
export async function routeGenerateCoverLetter(jobAnalysis, profile, tone, apiConfig, letterOpts = {}) {
  const providers = getAvailableProviders(apiConfig);

  if (providers.openai) {
    return generateCoverLetterOpenAI(jobAnalysis, profile, tone, apiConfig, letterOpts);
  }

  if (providers.anthropic) {
    return generateCoverLetterAnthropic(jobAnalysis, profile, tone, apiConfig, letterOpts);
  }

  if (providers.gemini) {
    return generateCoverLetterGemini(jobAnalysis, profile, tone, apiConfig, letterOpts);
  }

  if (providers.perplexity) {
    return generateCoverLetterPerplexity(jobAnalysis, profile, tone, apiConfig, letterOpts);
  }

  throw new RouterError("No AI provider configured for cover letter generation.", "NO_PROVIDER");
}

/**
 * Route job search — Perplexity is the clear winner here (real-time web search).
 * Falls back to OpenAI with a degraded message if Perplexity not available.
 */
export async function routeFindJobs(profile, preferences, apiConfig) {
  const providers = getAvailableProviders(apiConfig);

  if (providers.perplexity) {
    return findJobsPerplexity(profile, preferences, apiConfig);
  }

  throw new RouterError(
    "Job search requires a Perplexity API key for real-time results. Add your Perplexity key in Settings → API Configuration.",
    "NO_PERPLEXITY",
  );
}

/**
 * Route Smart Form Fill planning to the best available provider.
 * Prefer OpenAI/Anthropic for structured JSON; fall back to Perplexity.
 */
export async function routeSmartFormFill(input, apiConfig, smartOpts = {}) {
  const providers = getAvailableProviders(apiConfig);

  if (providers.openai) {
    return planSmartFormFillOpenAI(input, apiConfig, smartOpts);
  }

  if (providers.anthropic) {
    return planSmartFormFillAnthropic(input, apiConfig, smartOpts);
  }

  if (providers.gemini) {
    return planSmartFormFillGemini(input, apiConfig, smartOpts);
  }

  if (providers.perplexity) {
    return planSmartFormFillPerplexity(input, apiConfig, smartOpts);
  }

  throw new RouterError("No AI provider configured. Please add an API key in Settings.", "NO_PROVIDER");
}

/**
 * Test a specific provider's API key.
 */
export async function routeTestKey(provider, apiConfig) {
  if (provider === "openai") return testApiKey(apiConfig);
  if (provider === "perplexity") return testPerplexityKey(apiConfig);
  if (provider === "anthropic") return testAnthropicKey(apiConfig);
  if (provider === "gemini") return testGeminiKey(apiConfig);
  return { valid: false, error: "Unknown provider" };
}

class RouterError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "RouterError";
    this.code = code;
  }
}
