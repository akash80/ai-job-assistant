export const MSG = {
  ANALYZE_JOB: "ANALYZE_JOB",
  ANALYSIS_RESULT: "ANALYSIS_RESULT",
  GET_CACHED_ANALYSIS: "GET_CACHED_ANALYSIS",

  GET_PROFILE: "GET_PROFILE",
  SAVE_PROFILE: "SAVE_PROFILE",
  GET_RESUME: "GET_RESUME",
  SAVE_RESUME: "SAVE_RESUME",
  PARSE_RESUME: "PARSE_RESUME",
  SAVE_RESUME_PDF: "SAVE_RESUME_PDF",
  GET_RESUME_PDF: "GET_RESUME_PDF",
  REMOVE_RESUME_PDF: "REMOVE_RESUME_PDF",

  GET_ANSWERS: "GET_ANSWERS",
  SAVE_ANSWER: "SAVE_ANSWER",
  DELETE_ANSWER: "DELETE_ANSWER",

  GET_PREFERENCES: "GET_PREFERENCES",
  SAVE_PREFERENCES: "SAVE_PREFERENCES",

  GET_API_CONFIG: "GET_API_CONFIG",
  SAVE_API_CONFIG: "SAVE_API_CONFIG",
  TEST_API_KEY: "TEST_API_KEY",

  LOG_APPLICATION: "LOG_APPLICATION",
  GET_HISTORY: "GET_HISTORY",

  GET_USAGE_STATS: "GET_USAGE_STATS",

  /** Payload: { currencyCode: string } → factor + raw AI JSON for storage */
  FETCH_CURRENCY_FACTOR: "FETCH_CURRENCY_FACTOR",

  CLEAR_CACHE: "CLEAR_CACHE",

  EXPORT_ALL_DATA: "EXPORT_ALL_DATA",
  IMPORT_DATA: "IMPORT_DATA",
  CLEAR_ALL_DATA: "CLEAR_ALL_DATA",
};

export const STORAGE_KEYS = {
  API_CONFIG: "apiConfig",
  PROFILE: "profile",
  RESUME: "resume",
  ANSWERS: "answers",
  PREFERENCES: "preferences",
  ANALYSIS_CACHE: "analysisCache",
  HISTORY: "history",
  USAGE_STATS: "usageStats",
  RESUME_PDF: "resumePdf",
  SKIP_PATTERNS: "skipPatterns",
  ERROR_LOG: "errorLog",
};

export const DEFAULT_API_CONFIG = {
  apiKey: "",
  model: "gpt-4.1-mini",
  baseUrl: "https://api.openai.com/v1",
  maxTokens: 1000,
  temperature: 0.3,
};

export const SUPPORTED_MODELS = [
  { id: "gpt-4.1",       name: "GPT-4.1",       input: 0.002,   output: 0.008,   desc: "Latest flagship — best accuracy and speed" },
  { id: "gpt-4.1-mini",  name: "GPT-4.1 Mini",  input: 0.0004,  output: 0.0016,  desc: "Best cost/quality balance (recommended)" },
  { id: "gpt-4.1-nano",  name: "GPT-4.1 Nano",  input: 0.0001,  output: 0.0004,  desc: "Ultra-cheap, fastest responses" },
  { id: "gpt-4o",        name: "GPT-4o",         input: 0.0025,  output: 0.01,    desc: "Previous flagship, multimodal" },
  { id: "gpt-4o-mini",   name: "GPT-4o Mini",    input: 0.00015, output: 0.0006,  desc: "Compact and affordable" },
  { id: "o3",            name: "o3",             input: 0.01,    output: 0.04,    desc: "Reasoning model — deep analysis, highest cost" },
  { id: "o3-mini",       name: "o3 Mini",        input: 0.0011,  output: 0.0044,  desc: "Reasoning model — lighter and cheaper" },
  { id: "o4-mini",       name: "o4 Mini",        input: 0.0011,  output: 0.0044,  desc: "Latest reasoning model — fast and smart" },
  { id: "gpt-4-turbo",   name: "GPT-4 Turbo",    input: 0.01,    output: 0.03,    desc: "128k context, complex analysis" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo",  input: 0.0005,  output: 0.0015,  desc: "Legacy budget model" },
];

export const COST_PER_1K_TOKENS = Object.fromEntries(
  SUPPORTED_MODELS.map((m) => [m.id, { prompt: m.input, completion: m.output }]),
);

export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const CACHE_MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
export const MAX_JOB_TEXT_LENGTH = 15000;
export const HISTORY_MAX_ENTRIES = 500;
export const ANALYSIS_DEBOUNCE_MS = 1500;
