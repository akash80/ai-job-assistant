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
  /** Returns a non-secret summary of API configuration (no keys). */
  GET_API_STATUS: "GET_API_STATUS",
  /** Security mode status (no secrets). */
  GET_SECURITY_STATUS: "GET_SECURITY_STATUS",
  /** Enable security mode and encrypt keys with passphrase. Payload: { passphrase: string } */
  ENABLE_SECURITY_MODE: "ENABLE_SECURITY_MODE",
  /** Disable security mode (restores plaintext keys). Payload: { passphrase?: string } */
  DISABLE_SECURITY_MODE: "DISABLE_SECURITY_MODE",
  /** Unlock security mode for this browser session. Payload: { passphrase: string } */
  UNLOCK_SECURITY_MODE: "UNLOCK_SECURITY_MODE",
  /** Lock now (clears session cache). */
  LOCK_SECURITY_MODE: "LOCK_SECURITY_MODE",
  SAVE_API_CONFIG: "SAVE_API_CONFIG",
  TEST_API_KEY: "TEST_API_KEY",
  TEST_PERPLEXITY_KEY: "TEST_PERPLEXITY_KEY",
  TEST_ANTHROPIC_KEY: "TEST_ANTHROPIC_KEY",
  TEST_GEMINI_KEY: "TEST_GEMINI_KEY",

  LOG_APPLICATION: "LOG_APPLICATION",
  GET_HISTORY: "GET_HISTORY",
  UPDATE_HISTORY_STATUS: "UPDATE_HISTORY_STATUS",
  CHECK_ALREADY_APPLIED: "CHECK_ALREADY_APPLIED",
  /** Payload: { url, company, jobTitle } → newest history row for this job (any status), or null */
  FIND_HISTORY_JOB_MATCH: "FIND_HISTORY_JOB_MATCH",

  GET_USAGE_STATS: "GET_USAGE_STATS",

  GENERATE_COVER_LETTER: "GENERATE_COVER_LETTER",

  /** Payload: { formSchema, pageUrl, jobContext? } → SmartFillPlan JSON */
  SMART_FILL_PLAN: "SMART_FILL_PLAN",
  /**
   * Background → content progress event while planning Smart Fill.
   * Payload: { requestId: string, step?: string, percent?: number, detail?: string }
   */
  SMART_FILL_PROGRESS: "SMART_FILL_PROGRESS",

  GET_SKILL_GAPS: "GET_SKILL_GAPS",
  CLEAR_SKILL_GAPS: "CLEAR_SKILL_GAPS",

  FIND_JOBS: "FIND_JOBS",

  /** Payload: { currencyCode: string } → factor + raw AI JSON for storage */
  FETCH_CURRENCY_FACTOR: "FETCH_CURRENCY_FACTOR",

  CLEAR_CACHE: "CLEAR_CACHE",

  EXPORT_ALL_DATA: "EXPORT_ALL_DATA",
  IMPORT_DATA: "IMPORT_DATA",
  CLEAR_ALL_DATA: "CLEAR_ALL_DATA",

  /** Persist last analyzed job context for multi-page apply flows. */
  SAVE_JOB_SESSION: "SAVE_JOB_SESSION",
  GET_JOB_SESSION: "GET_JOB_SESSION",
  CLEAR_JOB_SESSION: "CLEAR_JOB_SESSION",
  /** Returns list of recent analyzed job sessions. */
  GET_JOB_SESSIONS: "GET_JOB_SESSIONS",

  /** Experimental: Generate job-specific tailored resume (JSON). */
  GENERATE_TAILORED_RESUME: "GENERATE_TAILORED_RESUME",
  /** Experimental: Generate PDF for a tailored resume. */
  GENERATE_TAILORED_RESUME_PDF: "GENERATE_TAILORED_RESUME_PDF",

  /**
   * Background → content progress event while exporting tailored resume PDF.
   * Payload: { requestId: string, step?: string, detail?: string }
   */
  TAILORED_RESUME_PDF_PROGRESS: "TAILORED_RESUME_PDF_PROGRESS",
};

export const STORAGE_KEYS = {
  API_CONFIG: "apiConfig",
  SECURITY_CONFIG: "securityConfig",
  ENCRYPTED_API_KEYS: "encryptedApiKeys",
  SESSION_DECRYPTED_KEYS: "sessionDecryptedKeys",
  PROFILE: "profile",
  RESUME: "resume",
  ANSWERS: "answers",
  PREFERENCES: "preferences",
  ANALYSIS_CACHE: "analysisCache",
  FIND_JOBS_CACHE: "findJobsCache",
  HISTORY: "history",
  USAGE_STATS: "usageStats",
  RESUME_PDF: "resumePdf",
  SKIP_PATTERNS: "skipPatterns",
  ERROR_LOG: "errorLog",
  SKILL_GAPS: "skillGaps",
  /** Back-compat: older single-session key */
  JOB_SESSION: "jobSession",
  /** New: recent multi-job sessions keyed by posting key */
  JOB_SESSIONS: "jobSessions",
  /** Experimental: tailored resumes per job posting key */
  TAILORED_RESUMES: "tailoredResumes",
};

export const DEFAULT_API_CONFIG = {
  apiKey: "",
  model: "gpt-4.1-mini",
  baseUrl: "https://api.openai.com/v1",
  maxTokens: 1000,
  temperature: 0.3,
  // Perplexity
  perplexityKey: "",
  perplexityModel: "sonar",
  // Anthropic
  anthropicKey: "",
  anthropicModel: "claude-sonnet-4-6",
  // Gemini (Google AI Studio)
  geminiKey: "",
  geminiModel: "gemini-2.5-flash",
};

export const SUPPORTED_MODELS = [
  { id: "gpt-5",         name: "GPT-5",         input: 0.01,    output: 0.03,    desc: "High-end flagship (requires access). Best overall quality.", provider: "openai" },
  { id: "gpt-5-mini",    name: "GPT-5 Mini",    input: 0.003,   output: 0.009,   desc: "High-end, faster and cheaper than GPT-5 (requires access).", provider: "openai" },
  { id: "gpt-5-nano",    name: "GPT-5 Nano",    input: 0.001,   output: 0.003,   desc: "High-end budget tier (requires access). Fastest GPT-5 option.", provider: "openai" },
  { id: "gpt-4.1",       name: "GPT-4.1",       input: 0.002,   output: 0.008,   desc: "Latest flagship — best accuracy and speed", provider: "openai" },
  { id: "gpt-4.1-mini",  name: "GPT-4.1 Mini",  input: 0.0004,  output: 0.0016,  desc: "Best cost/quality balance (recommended)", provider: "openai" },
  { id: "gpt-4.1-nano",  name: "GPT-4.1 Nano",  input: 0.0001,  output: 0.0004,  desc: "Ultra-cheap, fastest responses", provider: "openai" },
  { id: "gpt-4o",        name: "GPT-4o",         input: 0.0025,  output: 0.01,    desc: "Previous flagship, multimodal", provider: "openai" },
  { id: "gpt-4o-mini",   name: "GPT-4o Mini",    input: 0.00015, output: 0.0006,  desc: "Compact and affordable", provider: "openai" },
  { id: "o3",            name: "o3",             input: 0.01,    output: 0.04,    desc: "Reasoning model — deep analysis, highest cost", provider: "openai" },
  { id: "o3-mini",       name: "o3 Mini",        input: 0.0011,  output: 0.0044,  desc: "Reasoning model — lighter and cheaper", provider: "openai" },
  { id: "o4-mini",       name: "o4 Mini",        input: 0.0011,  output: 0.0044,  desc: "Latest reasoning model — fast and smart", provider: "openai" },
  { id: "gpt-4-turbo",   name: "GPT-4 Turbo",    input: 0.01,    output: 0.03,    desc: "128k context, complex analysis", provider: "openai" },
  { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo",  input: 0.0005,  output: 0.0015,  desc: "Legacy budget model", provider: "openai" },
];

export const ANTHROPIC_MODELS = [
  { id: "claude-opus-4-6",    name: "Claude Opus 4.6",    input: 0.015, output: 0.075,  desc: "Most capable Claude — best for complex analysis", provider: "anthropic" },
  { id: "claude-sonnet-4-6",  name: "Claude Sonnet 4.6",  input: 0.003, output: 0.015,  desc: "Excellent balance of speed and intelligence (recommended)", provider: "anthropic" },
  { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", input: 0.0008, output: 0.004, desc: "Fast and affordable", provider: "anthropic" },
];

export const PERPLEXITY_MODELS = [
  { id: "sonar-pro",  name: "Sonar Pro",   input: 0.003, output: 0.015, desc: "Best for real-time job search and market data", provider: "perplexity" },
  { id: "sonar",      name: "Sonar",       input: 0.001, output: 0.001, desc: "Fast and affordable real-time search", provider: "perplexity" },
];

export const GEMINI_MODELS = [
  { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", input: 0.0, output: 0.0, desc: "Newest fast model (recommended when available).", provider: "gemini" },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", input: 0.0, output: 0.0, desc: "Newest quality model (recommended when available).", provider: "gemini" },
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", input: 0.0, output: 0.0, desc: "Older fast model (may be unavailable for new users).", provider: "gemini" },
  { id: "gemini-1.5-flash-001", name: "Gemini 1.5 Flash", input: 0.0, output: 0.0, desc: "Fast + free-tier friendly (versioned id).", provider: "gemini" },
  { id: "gemini-1.5-pro-001", name: "Gemini 1.5 Pro", input: 0.0, output: 0.0, desc: "Higher quality (versioned id).", provider: "gemini" },
];

export const COST_PER_1K_TOKENS = Object.fromEntries(
  [...SUPPORTED_MODELS, ...ANTHROPIC_MODELS, ...PERPLEXITY_MODELS, ...GEMINI_MODELS].map((m) => [
    m.id,
    { prompt: m.input, completion: m.output },
  ]),
);

export const APPLICATION_STATUSES = [
  { value: "analyzed",     label: "Analyzed",     color: "#e0e7ff" },
  { value: "applied",      label: "Applied",       color: "#dcfce7" },
  { value: "interviewing", label: "Interviewing",  color: "#fef9c3" },
  { value: "offer",        label: "Offer",         color: "#d1fae5" },
  { value: "rejected",     label: "Rejected",      color: "#fee2e2" },
  { value: "skipped",      label: "Skipped",       color: "#f3f4f6" },
];

export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const CACHE_MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
export const FIND_JOBS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
export const MAX_JOB_TEXT_LENGTH = 6000;
export const MAX_RESUME_TEXT_LENGTH = 6000;
export const HISTORY_MAX_ENTRIES = 500;
export const ANALYSIS_DEBOUNCE_MS = 1500;
export const SKILL_GAP_MIN_JOBS = 5; // minimum jobs before surfacing a gap skill
