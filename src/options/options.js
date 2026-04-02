import {
  MSG,
  SUPPORTED_MODELS,
  ANTHROPIC_MODELS,
  PERPLEXITY_MODELS,
  GEMINI_MODELS,
  DEFAULT_API_CONFIG,
  APPLICATION_STATUSES,
} from "../shared/constants.js";
import {
  buildProfileGenerationPrompt,
  normalizeResumeProfileDepth,
  RESUME_PROFILE_DEPTH_OPTIONS,
} from "../shared/prompts.js";
import { formatUsdInPreferenceCurrency } from "../shared/currency-format.js";
import {
  formatDate,
  PROFILE_MONTH_NAMES as MONTHS,
  monthYearToIsoDate,
  isoDateToMonthYear,
} from "../shared/utils.js";

// ─── Constants ──────────────────────────────────────────────────

const COMMON_QUESTIONS = [
  { key: "disability", label: "Do you have a disability?", placeholder: "Yes / No / Prefer not to say" },
  { key: "veteran_status", label: "Are you a protected veteran?", placeholder: "Yes / No / Prefer not to say" },
  { key: "work_authorization", label: "Are you authorized to work in this country?", placeholder: "Yes / No" },
  { key: "visa_sponsorship", label: "Will you now or in the future require visa sponsorship?", placeholder: "Yes / No" },
  { key: "expected_salary", label: "What is your expected salary?", placeholder: "e.g. 80,000 USD / 12 LPA" },
  { key: "notice_period", label: "What is your notice period?", placeholder: "e.g. 2 weeks / 30 days / Immediate" },
  { key: "willing_to_relocate", label: "Are you willing to relocate?", placeholder: "Yes / No" },
  { key: "gender", label: "What is your gender? (voluntary)", placeholder: "Male / Female / Non-binary / Prefer not to say" },
  { key: "race_ethnicity", label: "What is your race/ethnicity? (voluntary EEO)", placeholder: "Prefer not to say" },
  { key: "age_over_18", label: "Are you 18 years of age or older?", placeholder: "Yes / No" },
  { key: "felony_conviction", label: "Have you ever been convicted of a felony?", placeholder: "Yes / No" },
  { key: "hear_about_position", label: "How did you hear about this position?", placeholder: "e.g. LinkedIn / Referral / Job Board" },
  { key: "earliest_start_date", label: "What is your earliest start date?", placeholder: "e.g. Immediately / 2 weeks / April 2025" },
  { key: "background_check", label: "Willing to undergo a background check?", placeholder: "Yes / No" },
  { key: "drivers_license", label: "Do you have a valid driver's license?", placeholder: "Yes / No" },
  { key: "highest_education", label: "What is your highest level of education?", placeholder: "e.g. Bachelor's / Master's / PhD" },
  { key: "work_schedule", label: "Are you available to work the required schedule?", placeholder: "Yes / No" },
  { key: "us_citizen", label: "Are you a citizen of this country?", placeholder: "Yes / No" },
];

const PROFILE_SIMPLE_FIELDS = [
  { id: "p-firstName", key: "firstName" },
  { id: "p-middleName", key: "middleName" },
  { id: "p-lastName", key: "lastName" },
  { id: "p-email", key: "email" },
  { id: "p-phone", key: "phone" },
  { id: "p-dateOfBirth", key: "dateOfBirth" },
  { id: "p-addressLine1", key: "addressLine1" },
  { id: "p-addressLine2", key: "addressLine2" },
  { id: "p-city", key: "city" },
  { id: "p-postalCode", key: "postalCode" },
  { id: "p-location", key: "location" },
  { id: "p-linkedin", key: "linkedinUrl" },
  { id: "p-github", key: "githubUrl" },
  { id: "p-portfolio", key: "portfolioUrl" },
  { id: "p-title", key: "currentTitle" },
  { id: "p-company", key: "currentCompany" },
  { id: "p-headline", key: "headline" },
  { id: "p-experience", key: "yearsExperience" },
  { id: "p-keywords", key: "keywords" },
  { id: "p-summary", key: "summary" },
];

/** Inputs that get a visible highlight when empty (common on job application forms). */
const PROFILE_ADDRESS_SPOTLIGHT_IDS = ["p-dateOfBirth", "p-addressLine1", "p-city", "p-postalCode"];

const SETUP_KEY = "completedSetup";

// ─── State ──────────────────────────────────────────────────────

let lastParsedJSON = null;
let currentProfileData = null;
/** Last saved preference currency (for reverting failed AI rate fetch). */
let lastCommittedCurrency = "USD";

// ─── Init ───────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", init);

async function init() {
  setupTabs();
  setupProviderTabs();
  await loadApiConfig();
  await loadSecurityStatus();
  await loadResume();
  await loadProfile();
  await loadPreferences();
  await loadExperimentalFeatures();
  await loadAnswers();
  await loadHistory();
  await loadSkillGaps();
  await checkFindJobsReady();
  bindEvents();
  await updateWarningBadges();

  const hash = window.location.hash.replace("#", "");
  if (hash) switchTab(hash);
}

// ─── Tab Navigation + Warning Badges ────────────────────────────

function setupTabs() {
  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const tab = link.dataset.tab;
      switchTab(tab);
      history.replaceState(null, "", `#${tab}`);
    });
  });
}

function switchTab(tab) {
  document.querySelectorAll(".nav-link").forEach((l) => l.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach((t) => t.classList.remove("active"));
  const link = document.querySelector(`.nav-link[data-tab="${tab}"]`);
  const content = document.getElementById(`tab-${tab}`);
  if (link) link.classList.add("active");
  if (content) content.classList.add("active");
}

function setupProviderTabs() {
  const tabs = [...document.querySelectorAll(".provider-tab")];
  const panels = [...document.querySelectorAll(".provider-panel")];
  if (!tabs.length || !panels.length) return;

  const setActive = (providerId) => {
    for (const t of tabs) {
      const active = t.dataset.provider === providerId;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    }
    for (const p of panels) {
      p.classList.toggle("active", p.dataset.providerPanel === providerId);
    }
  };

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => setActive(btn.dataset.provider));
  });
}

async function updateWarningBadges() {
  const resp = await sendMsg(MSG.GET_API_CONFIG);
  let setup = {};
  try {
    const raw = await chrome.storage.local.get(SETUP_KEY);
    setup = raw[SETUP_KEY] || {};
  } catch { /* empty */ }

  const tabs = ["resume", "profile", "preferences", "answers"];
  for (const tab of tabs) {
    const el = document.getElementById(`warn-${tab}`);
    if (el) el.style.display = setup[tab] ? "none" : "inline-block";
  }
}

async function markTabSaved(tab) {
  let setup = {};
  try {
    const raw = await chrome.storage.local.get(SETUP_KEY);
    setup = raw[SETUP_KEY] || {};
  } catch { /* empty */ }
  setup[tab] = true;
  await chrome.storage.local.set({ [SETUP_KEY]: setup });
  const el = document.getElementById(`warn-${tab}`);
  if (el) el.style.display = "none";
}

// ─── API Config ─────────────────────────────────────────────────

function formatModelPricePair(input, output, prefs) {
  const a = formatUsdInPreferenceCurrency(input, prefs);
  const b = formatUsdInPreferenceCurrency(output, prefs);
  return `${a}/1K in · ${b}/1K out`;
}

async function loadApiConfig() {
  const resp = await sendMsg(MSG.GET_API_CONFIG);
  const config = resp.success ? resp.data : { ...DEFAULT_API_CONFIG };

  document.getElementById("api-key").value = config.apiKey || "";
  document.getElementById("temperature").value = config.temperature ?? 0.3;
  document.getElementById("max-tokens").value = config.maxTokens ?? 1000;

  // Anthropic
  const anthropicKeyEl = document.getElementById("anthropic-key");
  if (anthropicKeyEl) anthropicKeyEl.value = config.anthropicKey || "";

  // Perplexity
  const perplexityKeyEl = document.getElementById("perplexity-key");
  if (perplexityKeyEl) perplexityKeyEl.value = config.perplexityKey || "";
  const perplexityModelEl = document.getElementById("perplexity-model-select");
  if (perplexityModelEl) perplexityModelEl.value = config.perplexityModel || "sonar";

  // Gemini
  const geminiKeyEl = document.getElementById("gemini-key");
  if (geminiKeyEl) geminiKeyEl.value = config.geminiKey || "";

  // Anthropic model select
  const anthropicSelect = document.getElementById("anthropic-model-select");
  if (anthropicSelect) {
    anthropicSelect.innerHTML = "";
    for (const m of ANTHROPIC_MODELS) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name} — ${m.desc}`;
      if (m.id === (config.anthropicModel || "claude-sonnet-4-6")) opt.selected = true;
      anthropicSelect.appendChild(opt);
    }
    const descEl = document.getElementById("anthropic-model-desc");
    if (descEl) {
      const sel = ANTHROPIC_MODELS.find((m) => m.id === anthropicSelect.value);
      if (sel) descEl.textContent = sel.desc;
    }
    anthropicSelect.addEventListener("change", () => {
      const sel = ANTHROPIC_MODELS.find((m) => m.id === anthropicSelect.value);
      const descEl = document.getElementById("anthropic-model-desc");
      if (descEl && sel) descEl.textContent = sel.desc;
    });
  }

  // Gemini model select
  const geminiSelect = document.getElementById("gemini-model-select");
  if (geminiSelect) {
    geminiSelect.innerHTML = "";
    for (const m of GEMINI_MODELS) {
      const opt = document.createElement("option");
      opt.value = m.id;
      opt.textContent = `${m.name} — ${m.desc}`;
      if (m.id === (config.geminiModel || "gemini-2.5-flash")) opt.selected = true;
      geminiSelect.appendChild(opt);
    }
    const descEl = document.getElementById("gemini-model-desc");
    if (descEl) {
      const sel = GEMINI_MODELS.find((m) => m.id === geminiSelect.value);
      if (sel) descEl.textContent = sel.desc;
    }
    geminiSelect.addEventListener("change", () => {
      const sel = GEMINI_MODELS.find((m) => m.id === geminiSelect.value);
      const descEl = document.getElementById("gemini-model-desc");
      if (descEl && sel) descEl.textContent = sel.desc;
    });
  }

  const prefResp = await sendMsg(MSG.GET_PREFERENCES);
  const prefs = prefResp.success && prefResp.data ? prefResp.data : {};

  const select = document.getElementById("model-select");
  select.innerHTML = "";
  for (const m of SUPPORTED_MODELS) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = `${m.name}  —  ${formatModelPricePair(m.input, m.output, prefs)}`;
    if (m.id === config.model) opt.selected = true;
    select.appendChild(opt);
  }
  updateModelInfo(prefs);
  select.removeEventListener("change", onModelSelectChange);
  select.addEventListener("change", onModelSelectChange);
}

function onModelSelectChange() {
  sendMsg(MSG.GET_PREFERENCES).then((prefResp) => {
    const prefs = prefResp.success && prefResp.data ? prefResp.data : {};
    updateModelInfo(prefs);
  });
}

function updateModelInfo(prefs) {
  const sel = document.getElementById("model-select");
  const model = SUPPORTED_MODELS.find((m) => m.id === sel.value);
  document.getElementById("model-desc").textContent = model?.desc || "";

  const pricingEl = document.getElementById("model-pricing");
  if (model) {
    const estUsd = (2 * model.input) + (1 * model.output);
    const inStr = formatUsdInPreferenceCurrency(model.input, prefs);
    const outStr = formatUsdInPreferenceCurrency(model.output, prefs);
    const estStr = formatUsdInPreferenceCurrency(estUsd, prefs);
    pricingEl.innerHTML = `
      <div class="pricing-row"><span class="pricing-label">Input:</span><span class="pricing-value">${inStr} / 1K tokens</span></div>
      <div class="pricing-row"><span class="pricing-label">Output:</span><span class="pricing-value">${outStr} / 1K tokens</span></div>
      <div class="pricing-row"><span class="pricing-label">~Cost per analysis:</span><span class="pricing-value">~${estStr}</span></div>
    `;
  }
}

/** Refresh model dropdown labels and pricing when currency / factor changes. */
async function refreshModelPricingDisplay() {
  const [cfgResp, prefResp] = await Promise.all([
    sendMsg(MSG.GET_API_CONFIG),
    sendMsg(MSG.GET_PREFERENCES),
  ]);
  const config = cfgResp.success ? cfgResp.data : { ...DEFAULT_API_CONFIG };
  const prefs = prefResp.success && prefResp.data ? prefResp.data : {};
  const select = document.getElementById("model-select");
  if (!select) return;
  for (const m of SUPPORTED_MODELS) {
    const opt = Array.from(select.options).find((o) => o.value === m.id);
    if (opt) {
      opt.textContent = `${m.name}  —  ${formatModelPricePair(m.input, m.output, prefs)}`;
    }
  }
  if (config.model && select.value !== config.model) {
    select.value = config.model;
  }
  updateModelInfo(prefs);
}

async function saveApiConfigHandler() {
  const normalizedOpenAI = document.getElementById("api-key").value.trim();
  const normalizedAnthropic = (document.getElementById("anthropic-key")?.value || "").trim();
  const normalizedPerplexity = (document.getElementById("perplexity-key")?.value || "").trim();
  const normalizedGemini = (document.getElementById("gemini-key")?.value || "").trim();

  const invalid = validateApiKeys({
    openai: normalizedOpenAI,
    anthropic: normalizedAnthropic,
    perplexity: normalizedPerplexity,
    gemini: normalizedGemini,
  });
  if (invalid.blockSave) {
    showStatus("api-status", invalid.message, "error");
    return;
  }
  if (invalid.message) {
    // Soft warning: still save so we don't break users with non-standard keys.
    showStatus("api-status", invalid.message, "error");
    // Continue saving.
  }

  const config = {
    apiKey: normalizedOpenAI,
    model: document.getElementById("model-select").value,
    baseUrl: DEFAULT_API_CONFIG.baseUrl,
    temperature: parseFloat(document.getElementById("temperature").value) || 0.3,
    maxTokens: parseInt(document.getElementById("max-tokens").value) || 1000,
    // Anthropic
    anthropicKey: normalizedAnthropic,
    anthropicModel: document.getElementById("anthropic-model-select")?.value || "claude-sonnet-4-6",
    // Gemini
    geminiKey: normalizedGemini,
    geminiModel: document.getElementById("gemini-model-select")?.value || "gemini-1.5-flash",
    // Perplexity
    perplexityKey: normalizedPerplexity,
    perplexityModel: document.getElementById("perplexity-model-select")?.value || "sonar",
  };
  await sendMsg(MSG.SAVE_API_CONFIG, config);
  showStatus("api-status", "All API settings saved!", "success");
  await checkFindJobsReady();
}

function validateApiKeys(keys) {
  const openai = String(keys?.openai || "");
  const anthropic = String(keys?.anthropic || "");
  const perplexity = String(keys?.perplexity || "");
  const gemini = String(keys?.gemini || "");

  const anyWhitespace = (s) => /\s/.test(s);
  const looksTooShort = (s) => s && s.length < 20;

  // Hard block: whitespace inside keys almost always indicates accidental copy/paste.
  if (
    (openai && anyWhitespace(openai))
    || (anthropic && anyWhitespace(anthropic))
    || (perplexity && anyWhitespace(perplexity))
    || (gemini && anyWhitespace(gemini))
  ) {
    return { blockSave: true, message: "API keys cannot contain spaces or newlines. Please paste the key again." };
  }

  // Soft warnings: don't block to avoid breaking non-standard key formats.
  if (looksTooShort(openai) || looksTooShort(anthropic) || looksTooShort(perplexity) || looksTooShort(gemini)) {
    return { blockSave: false, message: "One of the API keys looks unusually short. Double-check it if requests fail." };
  }

  const warn = [];
  if (openai && !/^sk-[A-Za-z0-9_\-]+$/.test(openai)) warn.push("OpenAI");
  if (anthropic && !/^sk-ant-[A-Za-z0-9_\-]+$/.test(anthropic)) warn.push("Anthropic");
  if (perplexity && !/^[A-Za-z0-9_\-]+$/.test(perplexity)) warn.push("Perplexity");
  if (gemini && !/^[A-Za-z0-9_\-]+$/.test(gemini)) warn.push("Gemini");
  if (warn.length) {
    return { blockSave: false, message: `${warn.join(", ")} key format looks unusual. Saved anyway, but double-check if requests fail.` };
  }

  return { blockSave: false, message: "" };
}

async function testApiKeyHandler() {
  const btn = document.getElementById("btn-test-key");
  btn.disabled = true;
  btn.textContent = "Testing...";
  const config = {
    apiKey: document.getElementById("api-key").value.trim(),
    model: document.getElementById("model-select").value,
    baseUrl: DEFAULT_API_CONFIG.baseUrl,
    maxTokens: 5,
    temperature: 0.3,
  };
  const resp = await sendMsg(MSG.TEST_API_KEY, config);
  btn.disabled = false;
  btn.textContent = "Test OpenAI";
  if (resp.success && resp.data.valid) {
    showStatus("openai-test-status", "OpenAI connection successful!", "success");
  } else {
    showStatus("openai-test-status", `Failed: ${resp.data?.error || resp.error}`, "error");
  }
}

async function testAnthropicKeyHandler() {
  const btn = document.getElementById("btn-test-anthropic");
  btn.disabled = true;
  btn.textContent = "Testing...";
  const config = {
    anthropicKey: (document.getElementById("anthropic-key")?.value || "").trim(),
    anthropicModel: document.getElementById("anthropic-model-select")?.value || "claude-sonnet-4-6",
    maxTokens: 5,
    temperature: 0.3,
  };
  const resp = await sendMsg(MSG.TEST_ANTHROPIC_KEY, config);
  btn.disabled = false;
  btn.textContent = "Test Anthropic";
  if (resp.success && resp.data?.valid) {
    showStatus("anthropic-test-status", "Anthropic connection successful!", "success");
  } else {
    showStatus("anthropic-test-status", `Failed: ${resp.data?.error || resp.error}`, "error");
  }
}

async function testPerplexityKeyHandler() {
  const btn = document.getElementById("btn-test-perplexity");
  btn.disabled = true;
  btn.textContent = "Testing...";
  const config = {
    perplexityKey: (document.getElementById("perplexity-key")?.value || "").trim(),
    perplexityModel: document.getElementById("perplexity-model-select")?.value || "sonar",
    maxTokens: 5,
    temperature: 0.3,
  };
  const resp = await sendMsg(MSG.TEST_PERPLEXITY_KEY, config);
  btn.disabled = false;
  btn.textContent = "Test Perplexity";
  if (resp.success && resp.data?.valid) {
    showStatus("perplexity-test-status", "Perplexity connection successful!", "success");
  } else {
    showStatus("perplexity-test-status", `Failed: ${resp.data?.error || resp.error}`, "error");
  }
}

async function testGeminiKeyHandler() {
  const btn = document.getElementById("btn-test-gemini");
  btn.disabled = true;
  btn.textContent = "Testing...";
  const config = {
    geminiKey: (document.getElementById("gemini-key")?.value || "").trim(),
    geminiModel: document.getElementById("gemini-model-select")?.value || "gemini-2.5-flash",
    maxTokens: 5,
    temperature: 0.3,
  };
  const resp = await sendMsg(MSG.TEST_GEMINI_KEY, config);
  btn.disabled = false;
  btn.textContent = "Test Gemini";
  if (resp.success && resp.data?.valid) {
    showStatus("gemini-test-status", "Gemini connection successful!", "success");
  } else {
    showStatus("gemini-test-status", `Failed: ${resp.data?.error || resp.error}`, "error");
  }
}

// ─── Resume ─────────────────────────────────────────────────────

const FIND_JOBS_BTN_LABEL = `${String.fromCodePoint(0x1f50d)} Find Jobs for My Profile`;

async function extractPdfTextToResume() {
  const pdfResp = await sendMsg(MSG.GET_RESUME_PDF);
  if (!pdfResp.success || !pdfResp.data?.base64) {
    showStatus("resume-status", "No PDF uploaded. Please upload a PDF first.", "error");
    return;
  }
  showStatus("resume-status", "Reading PDF…", "success");
  try {
    const pdfjs = await import("pdfjs-dist/build/pdf.min.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.min.mjs");
    const binary = atob(pdfResp.data.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const pdf = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
    let fullText = "";
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const line = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      fullText += `${line}\n\n`;
    }
    const trimmed = fullText.replace(/\s+/g, " ").trim();
    if (!trimmed) {
      showStatus("resume-status", "No text found in this PDF (it may be a scanned image). Paste text manually or use OCR.", "error");
      return;
    }
    const ta = document.getElementById("resume-text");
    ta.value = fullText.trim();
    ta.dispatchEvent(new Event("input"));
    showStatus(
      "resume-status",
      `Extracted text from PDF (${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}). Review and click Save & Parse with AI.`,
      "success",
    );
  } catch (e) {
    console.error(e);
    showStatus("resume-status", e.message || "PDF extraction failed.", "error");
  } finally {
  }
}

async function loadResume() {
  const resp = await sendMsg(MSG.GET_RESUME);
  if (resp.success && resp.data) {
    document.getElementById("resume-text").value = resp.data.rawText || "";
    document.getElementById("resume-words").textContent = `${resp.data.wordCount || 0} words`;
    if (resp.data.parsedAt) {
      document.getElementById("resume-date").textContent = `Last saved: ${formatDate(resp.data.parsedAt)}`;
    }
  }

  document.getElementById("resume-text").addEventListener("input", () => {
    const words = document.getElementById("resume-text").value.trim().split(/\s+/).filter(Boolean).length;
    document.getElementById("resume-words").textContent = `${words} words`;
  });

  const profileResp = await sendMsg(MSG.GET_PROFILE);
  if (profileResp.success && profileResp.data && profileResp.data.name) {
    lastParsedJSON = profileResp.data;
    showJSONPreview(profileResp.data);
  }

  await loadResumePdf();
}

async function loadResumePdf() {
  const resp = await sendMsg(MSG.GET_RESUME_PDF);
  if (resp.success && resp.data) {
    showPdfInfo(resp.data.fileName, resp.data.fileSize);
  } else {
    showPdfPlaceholder();
  }
}

function handlePdfFile(file) {
  if (file.type !== "application/pdf") {
    showStatus("resume-status", "Only PDF files are accepted.", "error");
    return;
  }
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    showStatus("resume-status", "File too large. Maximum size is 5 MB.", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(",")[1];
    const pdfData = {
      base64,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      savedAt: new Date().toISOString(),
    };
    const saveResp = await sendMsg(MSG.SAVE_RESUME_PDF, pdfData);
    if (!saveResp.success) {
      showStatus("resume-status", `Failed to save PDF: ${saveResp.error || "Unknown error"}`, "error");
      return;
    }
    showPdfInfo(file.name, file.size);
    showStatus("resume-status", `Resume PDF "${file.name}" uploaded and saved.`, "success");

    const existingText = document.getElementById("resume-text")?.value?.trim() || "";
    if (existingText) {
      showStatus("resume-status", "PDF uploaded. Resume text already has content, so it was not overwritten.", "success");
      return;
    }

    await extractPdfTextToResume();
  };
  reader.onerror = () => {
    showStatus("resume-status", "Failed to read the PDF file.", "error");
  };
  reader.readAsDataURL(file);
}

function showPdfInfo(name, size) {
  document.getElementById("pdf-upload-placeholder").style.display = "none";
  document.getElementById("pdf-upload-info").style.display = "flex";
  document.getElementById("pdf-file-name").textContent = name;
  document.getElementById("pdf-file-size").textContent = formatFileSize(size);
}

function showPdfPlaceholder() {
  document.getElementById("pdf-upload-placeholder").style.display = "flex";
  document.getElementById("pdf-upload-info").style.display = "none";
  const pdfInput = document.getElementById("resume-pdf-input");
  if (pdfInput) pdfInput.value = "";
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

async function saveResumeHandler() {
  const text = document.getElementById("resume-text").value.trim();
  if (!text) { showStatus("resume-status", "Please paste your resume first.", "error"); return; }

  const btn = document.getElementById("btn-save-resume");
  const progress = document.getElementById("resume-parse-progress");

  await sendMsg(MSG.SAVE_RESUME, { rawText: text, source: "paste" });
  await markTabSaved("resume");
  document.getElementById("resume-date").textContent = `Last saved: ${formatDate(new Date().toISOString())}`;

  const apiResp = await sendMsg(MSG.GET_API_CONFIG);
  const hasAnyKey = apiResp.success && (apiResp.data?.apiKey || apiResp.data?.anthropicKey || apiResp.data?.geminiKey || apiResp.data?.perplexityKey);
  if (!hasAnyKey) {
    showStatus("resume-status", "Resume saved! No API key configured — use the prompt generator below to parse your profile.", "success");
    return;
  }

  btn.disabled = true;
  progress.style.display = "flex";
  animateParseSteps();

  const parseResp = await sendMsg(MSG.PARSE_RESUME, { resumeText: text });
  btn.disabled = false;
  progress.style.display = "none";

  if (parseResp.success) {
    lastParsedJSON = parseResp.data;
    showJSONPreview(parseResp.data);
    showStatus("resume-status", "Resume parsed successfully! Profile auto-filled. Check the Profile tab.", "success");
    await markTabSaved("profile");
    await loadProfile();
  } else {
    showStatus("resume-status", `Resume saved but parsing failed: ${parseResp.error}. Fill the profile manually.`, "error");
  }
}

function animateParseSteps() {
  const steps = ["ps-1", "ps-2", "ps-3"];
  steps.forEach((id) => { const el = document.getElementById(id); if (el) el.classList.remove("active", "done"); });
  let idx = 0;
  const interval = setInterval(() => {
    if (idx > 0) { const prev = document.getElementById(steps[idx - 1]); if (prev) { prev.classList.remove("active"); prev.classList.add("done"); } }
    if (idx < steps.length) { const cur = document.getElementById(steps[idx]); if (cur) cur.classList.add("active"); idx++; }
    else clearInterval(interval);
  }, 2000);
}

function showJSONPreview(data) {
  const section = document.getElementById("json-preview-section");
  const pre = document.getElementById("json-preview");
  const statsEl = document.getElementById("json-stats");
  section.style.display = "block";
  pre.textContent = JSON.stringify(data, null, 2);

  const stats = [];
  if (data.name) stats.push(`Name: ${data.name}`);
  if (data.skills) stats.push(`Skill categories: ${Object.keys(data.skills).length}`);
  if (data.experience?.length) stats.push(`Experience: ${data.experience.length} roles`);
  if (data.education?.length) stats.push(`Education: ${data.education.length}`);
  if (data.projects?.length) stats.push(`Projects: ${data.projects.length}`);
  if (data.certifications?.length) stats.push(`Certifications: ${data.certifications.length}`);
  if (data.openSource?.length) stats.push(`Open source: ${data.openSource.length}`);
  if (data.internships?.length) stats.push(`Internships: ${data.internships.length}`);
  const additionalKeys = Object.keys(data.additionalSections || {});
  if (additionalKeys.length) stats.push(`Extra sections: ${additionalKeys.join(", ")}`);
  statsEl.innerHTML = stats.map((s) => `<span class="json-stat">${escHtml(s)}</span>`).join("");
}

// ─── Profile ────────────────────────────────────────────────────

function normalizeExpDates(entries) {
  for (const exp of entries) {
    const s = String(exp.startDate || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const p = isoDateToMonthYear(s);
      if (!exp.startMonth) exp.startMonth = p.month;
      if (!exp.startYear) exp.startYear = p.year;
    } else if (exp.startDate && (!exp.startMonth || !exp.startYear)) {
      const parts = parseClientDate(exp.startDate);
      if (!exp.startMonth) exp.startMonth = parts.month;
      if (!exp.startYear) exp.startYear = parts.year;
    }
    if (exp.startMonth && exp.startYear && !/^\d{4}-\d{2}-\d{2}$/.test(String(exp.startDate || "").trim())) {
      exp.startDate = monthYearToIsoDate(exp.startMonth, exp.startYear);
    }

    if (exp.isCurrentCompany) {
      exp.endDate = "";
      exp.endMonth = "";
      exp.endYear = "";
    } else {
      const e = String(exp.endDate || "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(e)) {
        const p = isoDateToMonthYear(e);
        if (!exp.endMonth) exp.endMonth = p.month;
        if (!exp.endYear) exp.endYear = p.year;
      } else if (exp.endDate && (!exp.endMonth || !exp.endYear)) {
        const lower = (exp.endDate || "").toLowerCase().trim();
        if (lower === "current" || lower === "present") {
          exp.isCurrentCompany = true;
          exp.endDate = "";
          exp.endMonth = "";
          exp.endYear = "";
        } else {
          const parts = parseClientDate(exp.endDate);
          exp.endMonth = parts.month;
          exp.endYear = parts.year;
        }
      }
      if (exp.endMonth && exp.endYear && !/^\d{4}-\d{2}-\d{2}$/.test(String(exp.endDate || ""))) {
        exp.endDate = monthYearToIsoDate(exp.endMonth, exp.endYear);
      }
    }
  }
  return entries;
}

function parseClientDate(str) {
  if (!str) return { month: "", year: "" };
  const yearMatch = str.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? yearMatch[0] : "";
  let month = "";
  for (const m of MONTHS) {
    if (str.toLowerCase().includes(m.toLowerCase().slice(0, 3))) { month = m; break; }
  }
  return { month, year };
}

function formatDateInputValue(exp, which) {
  if (which === "start") {
    const raw = exp.startDate;
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim())) return String(raw).trim();
    return monthYearToIsoDate(exp.startMonth, exp.startYear) || "";
  }
  if (exp.isCurrentCompany) return "";
  const raw = exp.endDate;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim())) return String(raw).trim();
  return monthYearToIsoDate(exp.endMonth, exp.endYear) || "";
}

async function loadProfile() {
  const resp = await sendMsg(MSG.GET_PROFILE);
  if (!resp.success || !resp.data) return;
  const p = resp.data;

  // Normalize dates on existing data so old startDate/endDate strings render properly
  if (p.experience) normalizeExpDates(p.experience);
  if (p.internships) normalizeExpDates(p.internships);

  currentProfileData = p;

  for (const f of PROFILE_SIMPLE_FIELDS) {
    const el = document.getElementById(f.id);
    if (!el) continue;
    const raw = p[f.key] || "";
    if (f.key === "dateOfBirth" && raw) {
      const m = String(raw).trim().match(/^(\d{4}-\d{2}-\d{2})/);
      el.value = m ? m[1] : "";
    } else {
      el.value = raw;
    }
  }

  renderSkills(p.skills || {});
  renderEditableExperience(p.experience || []);
  renderEditableEducation(p.education || []);
  renderEditableProjects(p.projects || []);
  renderEditableCertifications(p.certifications || []);
  renderEditableLanguages(p.spokenLanguages || []);
  renderEditableInternships(p.internships || []);
  renderEditableOpenSource(p.openSource || []);
  renderAdditionalSections(p.additionalSections || {});
  syncProfileAddressHighlights();
}

function syncProfileAddressHighlights() {
  for (const id of PROFILE_ADDRESS_SPOTLIGHT_IDS) {
    const el = document.getElementById(id);
    const group = el?.closest?.(".form-group");
    if (!el || !group) continue;
    const empty = !String(el.value || "").trim();
    group.classList.toggle("profile-field-missing", empty);
  }
}

function renderSkills(skills) {
  const container = document.getElementById("skills-container");
  const categories = Object.entries(skills);
  if (!categories.length) { container.innerHTML = '<p class="empty-state-sm">No skills data. Save your resume to auto-fill.</p>'; return; }
  const rows = [];
  for (let i = 0; i < categories.length; i += 2) {
    const pair = categories.slice(i, i + 2);
    rows.push(`<div class="form-row">${pair.map(([cat, items]) => {
      const label = cat.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
      const values = Array.isArray(items) ? items.join(", ") : (items || "");
      return `<div class="form-group"><label>${escHtml(label)}</label><input type="text" class="input skill-input" data-skill-key="${escAttr(cat)}" value="${escAttr(values)}" /></div>`;
    }).join("")}</div>`);
  }
  container.innerHTML = rows.join("");
}

// ─── Editable Experience ────────────────────────────────────────

function renderEditableExperience(experience) {
  const container = document.getElementById("experience-list");
  if (!experience.length) { container.innerHTML = '<p class="empty-state-sm">No experience data. Save your resume or click + Add.</p>'; return; }
  container.innerHTML = experience.map((exp, i) => {
    const startDateVal = formatDateInputValue(exp, "start");
    const endDateVal = formatDateInputValue(exp, "end");
    const startMissing = !startDateVal;
    const endMissing = !exp.isCurrentCompany && !endDateVal;
    return `
    <div class="editable-card" data-section="experience" data-idx="${i}">
      <div class="editable-card-header">
        <span class="editable-card-num">#${i + 1}</span>
        ${exp.isCurrentCompany ? '<span class="badge-current">Current</span>' : ""}
        <button class="btn btn-sm btn-danger btn-remove-item" data-section="experience" data-idx="${i}">Remove</button>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Job Title</label><input type="text" class="input ed-title" value="${escAttr(exp.title || "")}" /></div>
        <div class="form-group"><label>Company</label><input type="text" class="input ed-company" value="${escAttr(exp.company || "")}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Location</label><input type="text" class="input ed-location" value="${escAttr(exp.location || "")}" /></div>
        <div class="form-group"><label>Industry</label><input type="text" class="input ed-industry" value="${escAttr(exp.industry || "")}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group${startMissing ? " date-missing" : ""}">
          <label>Start date${startMissing ? ' <span class="missing-label">Missing</span>' : ""}</label>
          <div class="date-picker-row">
            <input type="date" class="input input-sm ed-start-date" value="${escAttr(startDateVal)}" />
          </div>
        </div>
        <div class="form-group${endMissing ? " date-missing" : ""}">
          <label>End date${endMissing ? ' <span class="missing-label">Missing</span>' : ""}</label>
          <div class="date-picker-row">
            <input type="date" class="input input-sm ed-end-date"${exp.isCurrentCompany ? " disabled" : ""} value="${escAttr(endDateVal)}" />
          </div>
        </div>
      </div>
      <label class="toggle-label" style="margin-bottom:12px">
        <input type="checkbox" class="ed-is-current" ${exp.isCurrentCompany ? "checked" : ""} />
        <span>This is my current company</span>
      </label>
      <div class="form-group">
        <label>Key Highlights (one per line)</label>
        <textarea class="input textarea-small ed-highlights" placeholder="e.g. Migrated monolith to microservices...">${escHtml((exp.highlights || []).join("\n"))}</textarea>
      </div>
    </div>`;
  }).join("");

  bindCardEvents(container, "experience");
}

// ─── Editable Education ─────────────────────────────────────────

function renderEditableEducation(education) {
  const container = document.getElementById("education-list");
  if (!education.length) { container.innerHTML = '<p class="empty-state-sm">No education data. Save your resume or click + Add.</p>'; return; }
  container.innerHTML = education.map((edu, i) => `
    <div class="editable-card" data-section="education" data-idx="${i}">
      <div class="editable-card-header">
        <span class="editable-card-num">#${i + 1}</span>
        <button class="btn btn-sm btn-danger btn-remove-item" data-section="education" data-idx="${i}">Remove</button>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Degree</label><input type="text" class="input ed-degree" value="${escAttr(edu.degree || "")}" placeholder="e.g. Bachelor of Technology" /></div>
        <div class="form-group"><label>Field of Study</label><input type="text" class="input ed-field" value="${escAttr(edu.field || "")}" placeholder="e.g. Software Engineering" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Institution</label><input type="text" class="input ed-institution" value="${escAttr(edu.institution || "")}" placeholder="e.g. SRM University" /></div>
        <div class="form-group"><label>Year</label><input type="text" class="input ed-year" value="${escAttr(edu.year || "")}" placeholder="e.g. 2018" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Location</label><input type="text" class="input ed-location" value="${escAttr(edu.location || "")}" placeholder="e.g. Chennai, India" /></div>
        <div class="form-group"><label>GPA</label><input type="text" class="input ed-gpa" value="${escAttr(edu.gpa || "")}" placeholder="e.g. 3.8 / 4.0" /></div>
      </div>
    </div>
  `).join("");
  bindCardEvents(container, "education");
}

// ─── Editable Projects ──────────────────────────────────────────

function renderEditableProjects(projects) {
  const container = document.getElementById("projects-list");
  if (!projects.length) { container.innerHTML = '<p class="empty-state-sm">No projects. Save your resume or click + Add.</p>'; return; }
  container.innerHTML = projects.map((proj, i) => `
    <div class="editable-card" data-section="projects" data-idx="${i}">
      <div class="editable-card-header">
        <span class="editable-card-num">#${i + 1}</span>
        <button class="btn btn-sm btn-danger btn-remove-item" data-section="projects" data-idx="${i}">Remove</button>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Project Name</label><input type="text" class="input ed-name" value="${escAttr(proj.name || "")}" /></div>
        <div class="form-group"><label>URL</label><input type="text" class="input ed-url" value="${escAttr(proj.url || "")}" placeholder="https://..." /></div>
      </div>
      <div class="form-group"><label>Description</label><textarea class="input textarea-small ed-description" placeholder="Short description...">${escHtml(proj.description || "")}</textarea></div>
      <div class="form-group"><label>Tech Stack (comma-separated)</label><input type="text" class="input ed-techstack" value="${escAttr((proj.techStack || []).join(", "))}" /></div>
    </div>
  `).join("");
  bindCardEvents(container, "projects");
}

// ─── Editable Certifications ────────────────────────────────────

function renderEditableCertifications(certifications) {
  const container = document.getElementById("certifications-list");
  if (!certifications.length) { container.innerHTML = '<p class="empty-state-sm">No certifications. Save your resume or click + Add.</p>'; return; }
  container.innerHTML = certifications.map((cert, i) => {
    const name = typeof cert === "string" ? cert : cert.name || "";
    const issuer = typeof cert === "string" ? "" : cert.issuer || "";
    const year = typeof cert === "string" ? "" : cert.year || "";
    return `
    <div class="editable-card editable-card-compact" data-section="certifications" data-idx="${i}">
      <div class="editable-card-header">
        <span class="editable-card-num">#${i + 1}</span>
        <button class="btn btn-sm btn-danger btn-remove-item" data-section="certifications" data-idx="${i}">Remove</button>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Name</label><input type="text" class="input ed-name" value="${escAttr(name)}" /></div>
        <div class="form-group"><label>Issuer</label><input type="text" class="input ed-issuer" value="${escAttr(issuer)}" placeholder="e.g. Coursera" /></div>
        <div class="form-group" style="max-width:100px"><label>Year</label><input type="text" class="input ed-year" value="${escAttr(year)}" placeholder="2024" /></div>
      </div>
    </div>`;
  }).join("");
  bindCardEvents(container, "certifications");
}

// ─── Editable Languages ─────────────────────────────────────────

function renderEditableLanguages(languages) {
  const container = document.getElementById("languages-list");
  if (!languages.length) { container.innerHTML = '<p class="empty-state-sm">No spoken languages. Save your resume or click + Add.</p>'; return; }
  container.innerHTML = languages.map((lang, i) => {
    const name = typeof lang === "string" ? lang : lang.language || "";
    const prof = typeof lang === "string" ? "" : lang.proficiency || "";
    return `
    <div class="editable-card editable-card-compact" data-section="languages" data-idx="${i}">
      <div class="editable-card-header">
        <span class="editable-card-num">#${i + 1}</span>
        <button class="btn btn-sm btn-danger btn-remove-item" data-section="languages" data-idx="${i}">Remove</button>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Language</label><input type="text" class="input ed-language" value="${escAttr(name)}" placeholder="e.g. English" /></div>
        <div class="form-group"><label>Proficiency</label><input type="text" class="input ed-proficiency" value="${escAttr(prof)}" placeholder="e.g. Native / Professional / Fluent" /></div>
      </div>
    </div>`;
  }).join("");
  bindCardEvents(container, "languages");
}

// ─── Editable Internships ───────────────────────────────────────

function renderEditableInternships(internships) {
  const container = document.getElementById("internships-list");
  if (!internships || !internships.length) { container.innerHTML = '<p class="empty-state-sm">No internships. Save your resume or click + Add.</p>'; return; }
  container.innerHTML = internships.map((int, i) => `
    <div class="editable-card" data-section="internships" data-idx="${i}">
      <div class="editable-card-header">
        <span class="editable-card-num">#${i + 1}</span>
        <button class="btn btn-sm btn-danger btn-remove-item" data-section="internships" data-idx="${i}">Remove</button>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Title / Role</label><input type="text" class="input ed-title" value="${escAttr(int.title || int.role || "")}" /></div>
        <div class="form-group"><label>Company</label><input type="text" class="input ed-company" value="${escAttr(int.company || "")}" /></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Location</label><input type="text" class="input ed-location" value="${escAttr(int.location || "")}" /></div>
        <div class="form-group"><label>Duration</label><input type="text" class="input ed-duration" value="${escAttr(int.duration || "")}" placeholder="e.g. 6 months" /></div>
      </div>
    </div>
  `).join("");
  bindCardEvents(container, "internships");
}

// ─── Editable Open Source ───────────────────────────────────────

function renderEditableOpenSource(openSource) {
  const container = document.getElementById("opensource-list");
  if (!openSource || !openSource.length) { container.innerHTML = '<p class="empty-state-sm">No open source contributions. Save your resume or click + Add.</p>'; return; }
  container.innerHTML = openSource.map((os, i) => `
    <div class="editable-card" data-section="opensource" data-idx="${i}">
      <div class="editable-card-header">
        <span class="editable-card-num">#${i + 1}</span>
        <button class="btn btn-sm btn-danger btn-remove-item" data-section="opensource" data-idx="${i}">Remove</button>
      </div>
      <div class="form-row">
        <div class="form-group"><label>Project Name</label><input type="text" class="input ed-name" value="${escAttr(os.name || "")}" /></div>
        <div class="form-group"><label>URL</label><input type="text" class="input ed-url" value="${escAttr(os.url || "")}" placeholder="https://github.com/..." /></div>
      </div>
      <div class="form-group"><label>Description</label><input type="text" class="input ed-description" value="${escAttr(os.description || "")}" /></div>
    </div>
  `).join("");
  bindCardEvents(container, "opensource");
}

// ─── Additional Sections (read-only for AI-detected extras) ─────

function renderAdditionalSections(additionalSections) {
  const container = document.getElementById("additional-sections-container");
  const entries = Object.entries(additionalSections);
  if (!entries.length) { container.innerHTML = ""; return; }

  container.innerHTML = entries.map(([sectionName, data]) => {
    const label = sectionName.replace(/([A-Z])/g, " $1").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
    let content = "";
    if (Array.isArray(data)) {
      content = data.map((item) => {
        if (typeof item === "string") return `<div class="parsed-chip">${escHtml(item)}</div>`;
        const fields = Object.entries(item).filter(([, v]) => v);
        const title = item.title || item.name || item.role || fields[0]?.[1] || "";
        const rest = fields.filter(([k]) => !["title", "name", "role"].includes(k));
        return `<div class="parsed-card parsed-card-compact"><strong>${escHtml(String(title))}</strong>${rest.map(([k, v]) => `<div class="parsed-card-detail"><span class="detail-label">${escHtml(k)}:</span> ${escHtml(Array.isArray(v) ? v.join(", ") : String(v))}</div>`).join("")}</div>`;
      }).join("");
    } else if (typeof data === "object") {
      content = Object.entries(data).map(([k, v]) => `<div class="parsed-card-detail"><span class="detail-label">${escHtml(k)}:</span> ${escHtml(Array.isArray(v) ? v.join(", ") : String(v))}</div>`).join("");
    } else {
      content = `<p>${escHtml(String(data))}</p>`;
    }
    return `<div class="profile-section"><h3 class="profile-section-title">${escHtml(label)}</h3><div class="parsed-dynamic-section">${content}</div></div>`;
  }).join("");
}

// ─── Card Event Helpers ─────────────────────────────────────────

function bindCardEvents(container, section) {
  container.querySelectorAll(".btn-remove-item").forEach((btn) => {
    btn.addEventListener("click", () => removeItem(section, parseInt(btn.dataset.idx)));
  });
  container.querySelectorAll(".ed-is-current").forEach((cb) => {
    cb.addEventListener("change", () => {
      const card = cb.closest(".editable-card");
      const endDate = card.querySelector(".ed-end-date");
      if (endDate) {
        endDate.disabled = cb.checked;
        if (cb.checked) endDate.value = "";
      }
    });
  });
  // Improve date picker behavior in extension pages where empty date fields
  // can fail to open on first click in some Chromium builds.
  container.querySelectorAll('input[type="date"]').forEach((input) => {
    input.addEventListener("pointerdown", () => {
      if (input.disabled || typeof input.showPicker !== "function") return;
      try { input.showPicker(); } catch { /* no-op */ }
    });
  });
}

function removeItem(section, idx) {
  if (!currentProfileData) return;
  const key = sectionToProfileKey(section);
  const arr = currentProfileData[key];
  if (!Array.isArray(arr)) return;
  arr.splice(idx, 1);
  reRenderSection(section);
}

function addItem(section) {
  if (!currentProfileData) currentProfileData = {};
  const key = sectionToProfileKey(section);
  if (!Array.isArray(currentProfileData[key])) currentProfileData[key] = [];

  const templates = {
    experience: {
      title: "",
      company: "",
      location: "",
      startDate: "",
      endDate: "",
      startMonth: "",
      startYear: "",
      endMonth: "",
      endYear: "",
      isCurrentCompany: false,
      industry: "",
      highlights: [],
    },
    education: { degree: "", field: "", institution: "", year: "", location: "", gpa: "" },
    projects: { name: "", description: "", techStack: [], url: "" },
    certifications: { name: "", issuer: "", year: "" },
    languages: { language: "", proficiency: "" },
    internships: { title: "", company: "", location: "", duration: "" },
    opensource: { name: "", description: "", url: "" },
  };

  currentProfileData[key].push(templates[section] || {});
  reRenderSection(section);
}

function sectionToProfileKey(section) {
  const map = { experience: "experience", education: "education", projects: "projects", certifications: "certifications", languages: "spokenLanguages", internships: "internships", opensource: "openSource" };
  return map[section] || section;
}

function reRenderSection(section) {
  const key = sectionToProfileKey(section);
  const data = currentProfileData[key] || [];
  const renderers = {
    experience: renderEditableExperience,
    education: renderEditableEducation,
    projects: renderEditableProjects,
    certifications: renderEditableCertifications,
    languages: renderEditableLanguages,
    internships: renderEditableInternships,
    opensource: renderEditableOpenSource,
  };
  if (renderers[section]) renderers[section](data);
}

// ─── Collect Profile Data from Editable Cards ───────────────────

function collectExperience() {
  return [...document.querySelectorAll('#experience-list .editable-card')].map((card) => {
    const isCurrentCompany = card.querySelector(".ed-is-current")?.checked || false;
    const startDate = card.querySelector(".ed-start-date")?.value || "";
    const endDate = isCurrentCompany ? "" : (card.querySelector(".ed-end-date")?.value || "");
    const startParts = isoDateToMonthYear(startDate);
    const endParts = isoDateToMonthYear(endDate);
    return {
      title: card.querySelector(".ed-title")?.value.trim() || "",
      company: card.querySelector(".ed-company")?.value.trim() || "",
      location: card.querySelector(".ed-location")?.value.trim() || "",
      industry: card.querySelector(".ed-industry")?.value.trim() || "",
      startDate,
      endDate,
      startMonth: startParts.month,
      startYear: startParts.year,
      endMonth: endParts.month,
      endYear: endParts.year,
      isCurrentCompany,
      highlights: (card.querySelector(".ed-highlights")?.value || "").split("\n").map((s) => s.trim()).filter(Boolean),
    };
  });
}

function collectEducation() {
  return [...document.querySelectorAll('#education-list .editable-card')].map((card) => ({
    degree: card.querySelector(".ed-degree")?.value.trim() || "",
    field: card.querySelector(".ed-field")?.value.trim() || "",
    institution: card.querySelector(".ed-institution")?.value.trim() || "",
    year: card.querySelector(".ed-year")?.value.trim() || "",
    location: card.querySelector(".ed-location")?.value.trim() || "",
    gpa: card.querySelector(".ed-gpa")?.value.trim() || "",
  }));
}

function collectProjects() {
  return [...document.querySelectorAll('#projects-list .editable-card')].map((card) => ({
    name: card.querySelector(".ed-name")?.value.trim() || "",
    description: card.querySelector(".ed-description")?.value.trim() || "",
    techStack: (card.querySelector(".ed-techstack")?.value || "").split(",").map((s) => s.trim()).filter(Boolean),
    url: card.querySelector(".ed-url")?.value.trim() || "",
  }));
}

function collectCertifications() {
  return [...document.querySelectorAll('#certifications-list .editable-card')].map((card) => ({
    name: card.querySelector(".ed-name")?.value.trim() || "",
    issuer: card.querySelector(".ed-issuer")?.value.trim() || "",
    year: card.querySelector(".ed-year")?.value.trim() || "",
  }));
}

function collectLanguages() {
  return [...document.querySelectorAll('#languages-list .editable-card')].map((card) => ({
    language: card.querySelector(".ed-language")?.value.trim() || "",
    proficiency: card.querySelector(".ed-proficiency")?.value.trim() || "",
  }));
}

function collectInternships() {
  return [...document.querySelectorAll('#internships-list .editable-card')].map((card) => ({
    title: card.querySelector(".ed-title")?.value.trim() || "",
    company: card.querySelector(".ed-company")?.value.trim() || "",
    location: card.querySelector(".ed-location")?.value.trim() || "",
    duration: card.querySelector(".ed-duration")?.value.trim() || "",
  }));
}

function collectOpenSource() {
  return [...document.querySelectorAll('#opensource-list .editable-card')].map((card) => ({
    name: card.querySelector(".ed-name")?.value.trim() || "",
    description: card.querySelector(".ed-description")?.value.trim() || "",
    url: card.querySelector(".ed-url")?.value.trim() || "",
  }));
}

// ─── Save Profile ───────────────────────────────────────────────

async function saveProfileHandler() {
  const profile = {};
  const existing = currentProfileData || {};

  for (const f of PROFILE_SIMPLE_FIELDS) {
    const el = document.getElementById(f.id);
    if (el) profile[f.key] = el.value.trim();
  }

  // Maintain legacy `profile.name` as full name for older sites and matching logic.
  // If user had an older profile (only `name`), derive first/middle/last so saving doesn't wipe it.
  if ((!profile.firstName || !profile.lastName) && existing.name) {
    const parts = String(existing.name || "").trim().split(/\s+/).filter(Boolean);
    if (!profile.firstName) profile.firstName = parts[0] || "";
    if (!profile.lastName) profile.lastName = parts.length > 1 ? parts[parts.length - 1] : "";
    if (!profile.middleName && parts.length > 2) profile.middleName = parts.slice(1, -1).join(" ");
  }

  const nameParts = [profile.firstName, profile.middleName, profile.lastName].map((s) => (s || "").trim()).filter(Boolean);
  profile.name = nameParts.join(" ").trim();

  if (!(profile.location || "").trim()) {
    const city = (profile.city || "").trim();
    const pc = (profile.postalCode || "").trim();
    const line1 = (profile.addressLine1 || "").trim();
    if (city && pc) profile.location = `${city}, ${pc}`;
    else if (city) profile.location = city;
    else if (pc) profile.location = pc;
    else if (line1) profile.location = line1;
  } else {
    profile.location = String(profile.location || "").trim();
  }

  const locInput = document.getElementById("p-location");
  if (locInput && profile.location && !(String(locInput.value || "").trim())) {
    locInput.value = profile.location;
  }

  profile.skills = {};
  document.querySelectorAll(".skill-input").forEach((input) => {
    const key = input.dataset.skillKey;
    if (key) profile.skills[key] = input.value.split(",").map((s) => s.trim()).filter(Boolean);
  });

  profile.experience = collectExperience();
  profile.education = collectEducation();
  profile.projects = collectProjects();
  profile.certifications = collectCertifications();
  profile.spokenLanguages = collectLanguages();
  profile.internships = collectInternships();
  profile.openSource = collectOpenSource();

  // Preserve AI-parsed data not editable inline
  profile.publications = existing.publications || [];
  profile.awards = existing.awards || [];
  profile.volunteer = existing.volunteer || [];
  profile.otherLinks = existing.otherLinks || [];
  profile.additionalSections = existing.additionalSections || {};

  // Flatten for form auto-fill
  const allSkills = Object.values(profile.skills).flat();
  profile.skillsText = allSkills.join(", ");

  if (profile.certifications.length) {
    profile.certificationsText = profile.certifications.map((c) => c.name || "").filter(Boolean).join(", ");
  }
  if (profile.spokenLanguages.length) {
    profile.spokenLanguagesText = profile.spokenLanguages.map((l) => `${l.language || ""}${l.proficiency ? ` (${l.proficiency})` : ""}`).filter(Boolean).join(", ");
  }
  if (profile.education.length) {
    const e = profile.education[0];
    profile.educationText = [e.degree, e.field, e.institution, e.year].filter(Boolean).join(", ");
  }

  await sendMsg(MSG.SAVE_PROFILE, profile);
  currentProfileData = profile;
  await markTabSaved("profile");
  syncProfileAddressHighlights();
  showStatus("profile-status", "Profile saved!", "success");
}

// ─── Preferences ────────────────────────────────────────────────

async function persistResumeProfileDepth() {
  const el = document.getElementById("resume-profile-depth");
  if (!el) return;
  const prevResp = await sendMsg(MSG.GET_PREFERENCES);
  const prev = prevResp.success && prevResp.data ? prevResp.data : {};
  await sendMsg(MSG.SAVE_PREFERENCES, {
    ...prev,
    resumeProfileDepth: normalizeResumeProfileDepth(el.value),
  });
}

function updateResumeDepthHint() {
  const el = document.getElementById("resume-profile-depth");
  const hint = document.getElementById("resume-depth-hint");
  if (!el || !hint) return;
  const opt = RESUME_PROFILE_DEPTH_OPTIONS.find((o) => o.id === el.value);
  hint.textContent = opt ? opt.hint : "";
}

async function loadPreferences() {
  const resp = await sendMsg(MSG.GET_PREFERENCES);
  if (resp.success && resp.data) {
    const p = resp.data;
    lastCommittedCurrency = p.salaryCurrency || "USD";
    const fillModeEl = document.getElementById("pref-fill-mode");
    if (fillModeEl) fillModeEl.value = p.fillMode || "fast";
    const smartEnabledEl = document.getElementById("pref-smart-fill-enabled");
    if (smartEnabledEl) smartEnabledEl.checked = p.smartFillEnabled !== false;
    const smartThresholdEl = document.getElementById("pref-smart-fill-threshold");
    if (smartThresholdEl) smartThresholdEl.value = String(Number(p.smartFillConfidenceThreshold || 0.9));
    const smartGenEl = document.getElementById("pref-smart-fill-allow-generation");
    if (smartGenEl) smartGenEl.checked = p.smartFillAllowGeneration !== false;
    const remoteVal = p.remote === true ? "true" : p.remote === false ? "false" : "null";
    const radio = document.querySelector(`input[name="remote"][value="${remoteVal}"]`);
    if (radio) radio.checked = true;
    document.getElementById("pref-min-salary").value = p.minSalary || "";
    document.getElementById("pref-max-salary").value = p.maxSalary || "";
    document.getElementById("pref-currency").value = p.salaryCurrency || "USD";
    document.getElementById("pref-roles").value = (p.preferredRoles || []).join(", ");
    document.getElementById("pref-location").value = (p.preferredLocations || []).join(", ");
    document.getElementById("pref-excluded-locations").value = (p.excludedLocations || []).join(", ");
    document.getElementById("pref-relocate").checked = p.willingToRelocate || false;
    const depthEl = document.getElementById("resume-profile-depth");
    if (depthEl) {
      depthEl.value = normalizeResumeProfileDepth(p.resumeProfileDepth);
      updateResumeDepthHint();
    }
  }
}

async function loadExperimentalFeatures() {
  const resp = await sendMsg(MSG.GET_PREFERENCES);
  const p = resp.success && resp.data ? resp.data : {};
  const exp = p.experimentalFeatures && typeof p.experimentalFeatures === "object" ? p.experimentalFeatures : {};
  const resumeGenEl = document.getElementById("exp-resume-generator-enabled");
  if (resumeGenEl) resumeGenEl.checked = exp.resumeGeneratorEnabled === true;
}

async function saveExperimentalHandler() {
  const prevResp = await sendMsg(MSG.GET_PREFERENCES);
  const prev = prevResp.success && prevResp.data ? prevResp.data : {};
  const prevExp = prev.experimentalFeatures && typeof prev.experimentalFeatures === "object" ? prev.experimentalFeatures : {};
  const resumeGeneratorEnabled = document.getElementById("exp-resume-generator-enabled")?.checked === true;

  const next = {
    ...prev,
    experimentalFeatures: {
      ...prevExp,
      resumeGeneratorEnabled,
    },
  };
  await sendMsg(MSG.SAVE_PREFERENCES, next);
  showStatus("experimental-status", "Experimental settings saved!", "success");
}

async function savePrefsHandler() {
  const remoteRadio = document.querySelector('input[name="remote"]:checked');
  const remoteVal = remoteRadio?.value === "true" ? true : remoteRadio?.value === "false" ? false : null;
  const prevResp = await sendMsg(MSG.GET_PREFERENCES);
  const prev = prevResp.success && prevResp.data ? prevResp.data : {};
  const fillMode = document.getElementById("pref-fill-mode")?.value || "fast";
  const smartFillEnabled = document.getElementById("pref-smart-fill-enabled")?.checked === true;
  const smartFillConfidenceThreshold = Number(document.getElementById("pref-smart-fill-threshold")?.value || 0.9);
  const smartFillAllowGeneration = document.getElementById("pref-smart-fill-allow-generation")?.checked === true;
  const prefs = {
    ...prev,
    fillMode,
    smartFillEnabled,
    smartFillConfidenceThreshold: Number.isFinite(smartFillConfidenceThreshold) ? smartFillConfidenceThreshold : 0.9,
    smartFillAllowGeneration,
    remote: remoteVal,
    hybridOk: true,
    minSalary: document.getElementById("pref-min-salary").value.trim(),
    maxSalary: document.getElementById("pref-max-salary").value.trim(),
    salaryCurrency: document.getElementById("pref-currency").value,
    preferredRoles: document.getElementById("pref-roles").value.split(",").map((s) => s.trim()).filter(Boolean),
    preferredLocations: document.getElementById("pref-location").value.split(",").map((s) => s.trim()).filter(Boolean),
    excludedLocations: document.getElementById("pref-excluded-locations").value.split(",").map((s) => s.trim()).filter(Boolean),
    willingToRelocate: document.getElementById("pref-relocate").checked,
    preferredCompanySize: "any",
    skipPatterns: [],
  };
  await sendMsg(MSG.SAVE_PREFERENCES, prefs);
  lastCommittedCurrency = prefs.salaryCurrency;
  await refreshModelPricingDisplay();
  await markTabSaved("preferences");
  showStatus("prefs-status", "Preferences saved!", "success");
}

async function onPreferenceCurrencyChange() {
  const newCurrency = document.getElementById("pref-currency").value;
  const prevResp = await sendMsg(MSG.GET_PREFERENCES);
  const prev = prevResp.success && prevResp.data ? prevResp.data : {};

  if (newCurrency === "USD") {
    await sendMsg(MSG.SAVE_PREFERENCES, {
      ...prev,
      salaryCurrency: "USD",
      usdToDisplayCurrencyFactor: 1,
      currencyFactorRawResponse: null,
      currencyFactorFetchedAt: new Date().toISOString(),
    });
    lastCommittedCurrency = "USD";
    await refreshModelPricingDisplay();
    showStatus("prefs-status", "Pricing is shown in USD.", "success");
    return;
  }

  showStatus("prefs-status", "Fetching exchange rate from AI…", "success");
  const resp = await sendMsg(MSG.FETCH_CURRENCY_FACTOR, { currencyCode: newCurrency });
  if (!resp.success) {
    document.getElementById("pref-currency").value = lastCommittedCurrency;
    showStatus("prefs-status", resp.error || "Could not fetch exchange rate. Check your network.", "error");
    return;
  }

  await sendMsg(MSG.SAVE_PREFERENCES, {
    ...prev,
    salaryCurrency: newCurrency,
    usdToDisplayCurrencyFactor: resp.data.factor,
    currencyFactorRawResponse: resp.data.rawContent,
    currencyFactorFetchedAt: resp.data.fetchedAt,
  });
  lastCommittedCurrency = newCurrency;
  await refreshModelPricingDisplay();
  showStatus("prefs-status", `Rate saved. Pricing is shown in ${newCurrency}.`, "success");
}

// ─── Saved Answers + Common Questions ───────────────────────────

async function loadAnswers() {
  const resp = await sendMsg(MSG.GET_ANSWERS);
  const savedAnswers = (resp.success && resp.data) ? resp.data : {};

  renderCommonQuestions(savedAnswers);
  renderCustomAnswers(savedAnswers);
}

function renderCommonQuestions(savedAnswers) {
  const grid = document.getElementById("common-questions-grid");
  grid.innerHTML = COMMON_QUESTIONS.map((q) => {
    const saved = savedAnswers[q.key];
    const hasValue = saved && saved.value;
    return `
    <div class="cq-card ${hasValue ? "cq-answered" : "cq-unanswered"}" data-key="${q.key}">
      <div class="cq-label">${escHtml(q.label)}</div>
      <div class="cq-input-row" ${hasValue ? "" : 'style="display:none"'}>
        <input type="text" class="input input-sm cq-value" value="${escAttr(hasValue ? saved.value : "")}" placeholder="${escAttr(q.placeholder)}" />
        <button class="btn btn-sm btn-primary cq-save-btn">Save</button>
      </div>
      ${!hasValue ? `<div class="cq-placeholder">${escHtml(q.placeholder)}</div>` : ""}
    </div>`;
  }).join("");

  grid.querySelectorAll(".cq-card").forEach((card) => {
    const key = card.dataset.key;
    const q = COMMON_QUESTIONS.find((cq) => cq.key === key);
    const inputRow = card.querySelector(".cq-input-row");
    const placeholder = card.querySelector(".cq-placeholder");

    card.addEventListener("click", (e) => {
      if (e.target.closest(".cq-input-row")) return;
      inputRow.style.display = "flex";
      if (placeholder) placeholder.style.display = "none";
      card.querySelector(".cq-value")?.focus();
    });

    card.querySelector(".cq-save-btn")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const val = card.querySelector(".cq-value").value.trim();
      if (!val) return;
      await sendMsg(MSG.SAVE_ANSWER, { key, value: val, label: q.label, source: "common" });
      card.classList.remove("cq-unanswered");
      card.classList.add("cq-answered");
      if (placeholder) placeholder.remove();
      await markTabSaved("answers");
    });
  });
}

function renderCustomAnswers(savedAnswers) {
  const container = document.getElementById("answers-list");
  const commonKeys = new Set(COMMON_QUESTIONS.map((q) => q.key));
  const customEntries = Object.entries(savedAnswers).filter(([key]) => !commonKeys.has(key));

  if (!customEntries.length) {
    container.innerHTML = '<p class="empty-state">No custom answers yet. Add your own or they\'ll appear as you apply to jobs.</p>';
    return;
  }

  container.innerHTML = customEntries.map(([key, entry]) => `
    <div class="answer-row" data-key="${escAttr(key)}">
      <div class="answer-key">${escHtml(entry.label || key)}</div>
      <div class="answer-value">${escHtml(entry.value)}</div>
      <div class="answer-meta">Used ${entry.usedCount || 0}x</div>
      <div class="answer-actions">
        <button class="btn btn-sm btn-danger btn-delete-answer" data-key="${escAttr(key)}">Delete</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".btn-delete-answer").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await sendMsg(MSG.DELETE_ANSWER, { key: btn.dataset.key });
      loadAnswers();
    });
  });
}

// ─── History ────────────────────────────────────────────────────

let historyData = [];
let historyFilter = "all";

async function loadHistory() {
  const resp = await sendMsg(MSG.GET_HISTORY);
  if (resp.success && resp.data) {
    historyData = resp.data;
  }
  renderHistory();

  // Bind filter buttons
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      historyFilter = btn.dataset.filter || "all";
      renderHistory();
    });
  });
}

function renderHistory() {
  const container = document.getElementById("history-list");
  if (!container) return;

  let filtered = historyData;
  if (historyFilter !== "all") {
    filtered = historyData.filter((h) => (h.status || h.action) === historyFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = `<p class="empty-state">${historyData.length === 0 ? "No history yet. Start analyzing job postings!" : `No entries with status "${historyFilter}".`}</p>`;
    return;
  }

  container.innerHTML = filtered.slice(0, 100).map((entry) => {
    const status = entry.status || entry.action || "analyzed";
    const scoreClass = entry.matchScore >= 70 ? "high" : entry.matchScore >= 40 ? "medium" : "low";
    const statusInfo = APPLICATION_STATUSES.find((s) => s.value === status) || APPLICATION_STATUSES[0];
    const safeHref = safeExternalHref(entry.url);
    const jobUrl = safeHref ? `<a href="${escAttr(safeHref)}" target="_blank" rel="noopener noreferrer" class="history-link" title="Open job posting">&#128279;</a>` : "";

    const statusOptions = APPLICATION_STATUSES.map((s) =>
      `<option value="${escAttr(s.value)}" ${s.value === status ? "selected" : ""}>${escHtml(s.label)}</option>`
    ).join("");

    const jobIdPart = entry.jobId
      ? `<span class="history-job-id">ID ${escHtml(entry.jobId)}</span> · `
      : "";

    return `
    <div class="history-row" data-id="${escAttr(entry.id || "")}">
      <div class="history-score ${scoreClass}">${entry.matchScore || 0}%</div>
      <div class="history-info">
        <div class="history-title">${escHtml(entry.jobTitle || "Unknown")} ${jobUrl}</div>
        <div class="history-sub">${jobIdPart}${escHtml(entry.company || entry.domain || "")} &middot; ${formatDate(entry.timestamp)}</div>
      </div>
      <select class="history-status-select input-sm" data-id="${escAttr(entry.id || "")}" style="background:${statusInfo.color};border:none;border-radius:4px;padding:2px 6px;font-size:12px;cursor:pointer">
        ${statusOptions}
      </select>
    </div>`;
  }).join("");

  // Bind status change
  container.querySelectorAll(".history-status-select").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const id = sel.dataset.id;
      const newStatus = sel.value;
      if (!id) return;
      await sendMsg(MSG.UPDATE_HISTORY_STATUS, { id, status: newStatus });
      // Update local data
      const entry = historyData.find((h) => h.id === id);
      if (entry) entry.status = newStatus;
      // Update background color
      const statusInfo = APPLICATION_STATUSES.find((s) => s.value === newStatus);
      if (statusInfo) sel.style.background = statusInfo.color;
    });
  });
}

// ─── Skills Intelligence ─────────────────────────────────────────

async function loadSkillGaps() {
  const resp = await sendMsg(MSG.GET_SKILL_GAPS);
  const container = document.getElementById("skill-gaps-container");
  if (!container) return;

  if (!resp.success || !resp.data || resp.data.length === 0) {
    container.innerHTML = '<p class="empty-state">No skill gap data yet. Analyze more job postings (with AI) to build your intelligence report. Data appears for jobs where you scored ≥75% but still had missing skills.</p>';
    return;
  }

  const { SKILL_GAP_MIN_JOBS } = await import("../shared/constants.js");
  const gaps = resp.data.sort((a, b) => b.count - a.count);
  const significant = gaps.filter((g) => g.count >= SKILL_GAP_MIN_JOBS);
  const emerging = gaps.filter((g) => g.count < SKILL_GAP_MIN_JOBS && g.count >= 2);

  let html = "";

  if (significant.length > 0) {
    html += `<h3 style="font-size:15px;font-weight:600;margin-bottom:12px">&#128313; High Priority Skills (appear in ${SKILL_GAP_MIN_JOBS}+ jobs)</h3>`;
    html += `<div class="skill-gaps-grid">`;
    html += significant.map((g) => renderSkillGapCard(g, "high")).join("");
    html += `</div>`;
  }

  if (emerging.length > 0) {
    html += `<h3 style="font-size:15px;font-weight:600;margin:20px 0 12px">&#128314; Emerging Skills (seen in 2-${SKILL_GAP_MIN_JOBS - 1} jobs)</h3>`;
    html += `<div class="skill-gaps-grid">`;
    html += emerging.map((g) => renderSkillGapCard(g, "medium")).join("");
    html += `</div>`;
  }

  if (gaps.length === 0) {
    html = '<p class="empty-state">No patterns detected yet. Keep analyzing jobs!</p>';
  }

  container.innerHTML = html;
}

function renderSkillGapCard(gap, priority) {
  const borderColor = priority === "high" ? "#f59e0b" : "#a78bfa";
  const jobs = (gap.relatedJobs || []).slice(0, 3);
  const jobsHtml = jobs.map((j) => `<li>${escHtml(j.jobTitle || "")} @ ${escHtml(j.company || "")} (${j.matchScore}%)</li>`).join("");
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(gap.skill + " course tutorial")}`;

  return `
    <div class="skill-gap-card" style="border-left:3px solid ${borderColor}">
      <div class="skill-gap-header">
        <strong>${escHtml(gap.skill)}</strong>
        <span class="skill-gap-count">Seen in ${gap.count} job${gap.count !== 1 ? "s" : ""}</span>
      </div>
      ${jobsHtml ? `<ul class="skill-gap-jobs">${jobsHtml}</ul>` : ""}
      <div class="skill-gap-actions">
        <a href="${searchUrl}" target="_blank" class="btn btn-sm btn-secondary" style="font-size:11px">Learn ${escHtml(gap.skill)}</a>
      </div>
    </div>
  `;
}

// ─── Find Jobs ───────────────────────────────────────────────────

async function checkFindJobsReady() {
  const resp = await sendMsg(MSG.GET_API_CONFIG);
  const hasPerplexity = resp.success && resp.data?.perplexityKey;
  const noKeyEl = document.getElementById("find-jobs-no-key");
  const uiEl = document.getElementById("find-jobs-ui");
  if (noKeyEl) noKeyEl.style.display = hasPerplexity ? "none" : "block";
  if (uiEl) uiEl.style.display = hasPerplexity ? "block" : "none";
}

async function findJobsHandler() {
  const btn = document.getElementById("btn-find-jobs");
  const resultsEl = document.getElementById("find-jobs-results");
  if (!btn || !resultsEl) return;

  btn.disabled = true;
  btn.textContent = "Searching...";
  resultsEl.innerHTML = `<div class="parse-progress" style="display:flex"><div class="spinner-sm"></div><span style="margin-left:8px">Finding jobs with Perplexity real-time search...</span></div>`;

  const resp = await sendMsg(MSG.FIND_JOBS, {});
  btn.disabled = false;
  btn.textContent = FIND_JOBS_BTN_LABEL;

  if (!resp.success) {
    showStatus("find-jobs-status", resp.error || "Search failed", "error");
    resultsEl.innerHTML = "";
    return;
  }

  const jobs = resp.data;
  if (!Array.isArray(jobs) || jobs.length === 0) {
    resultsEl.innerHTML = '<p class="empty-state">No results found. Try again or adjust your profile.</p>';
    return;
  }

  resultsEl.innerHTML = `<div class="jobs-results-grid">${jobs.map((job) => `
    <div class="job-result-card">
      <div class="job-result-header">
        <strong>${escHtml(job.title || "Unknown Position")}</strong>
        ${safeExternalHref(job.url) ? `<a href="${escAttr(safeExternalHref(job.url))}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary" style="font-size:11px">View Job</a>` : ""}
      </div>
      <div class="job-result-meta">
        ${escHtml(job.company || "")}${job.location ? ` &middot; ${escHtml(job.location)}` : ""}
        ${job.postedDate ? ` &middot; ${escHtml(job.postedDate)}` : ""}
        ${job.salary ? ` &middot; ${escHtml(job.salary)}` : ""}
      </div>
      ${job.match ? `<p class="job-result-match">${escHtml(job.match)}</p>` : ""}
    </div>
  `).join("")}</div>`;
}

// ─── Data Management ────────────────────────────────────────────

async function exportDataHandler() {
  const resp = await sendMsg(MSG.EXPORT_ALL_DATA);
  if (!resp.success) return;
  const blob = new Blob([JSON.stringify(resp.data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ai-job-assistant-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importDataHandler() { document.getElementById("file-import").click(); }

async function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    if (!data.version || !data.data) throw new Error("Invalid file format");
    await sendMsg(MSG.IMPORT_DATA, data);
    alert("Data imported successfully! Reloading...");
    location.reload();
  } catch (err) { alert(`Import failed: ${err.message}`); }
}

async function clearCacheHandler() {
  if (!confirm("Clear all cached analysis results?")) return;
  await sendMsg(MSG.CLEAR_CACHE);
  alert("Cache cleared!");
}

async function clearAllHandler() {
  if (!confirm("This will permanently delete ALL your data. Are you sure?")) return;
  if (!confirm("Last chance — this cannot be undone. Proceed?")) return;
  await sendMsg(MSG.CLEAR_ALL_DATA);
  alert("All data cleared. Reloading...");
  location.reload();
}

// ─── Event Bindings ─────────────────────────────────────────────

function bindEvents() {
  document.getElementById("btn-save-api").addEventListener("click", saveApiConfigHandler);
  document.getElementById("btn-test-key").addEventListener("click", testApiKeyHandler);
  document.getElementById("btn-test-anthropic")?.addEventListener("click", testAnthropicKeyHandler);
  document.getElementById("btn-test-perplexity")?.addEventListener("click", testPerplexityKeyHandler);
  document.getElementById("btn-test-gemini")?.addEventListener("click", testGeminiKeyHandler);
  document.getElementById("btn-save-resume").addEventListener("click", saveResumeHandler);
  document.getElementById("btn-save-experimental")?.addEventListener("click", saveExperimentalHandler);

  // Security mode (optional)
  document.getElementById("sec-toggle-passphrase")?.addEventListener("click", () => {
    const input = document.getElementById("sec-passphrase");
    if (input) input.type = input.type === "password" ? "text" : "password";
  });
  document.getElementById("sec-enable")?.addEventListener("change", onSecurityToggleChange);
  document.getElementById("sec-btn-enable")?.addEventListener("click", enableSecurityHandler);
  document.getElementById("sec-btn-unlock")?.addEventListener("click", unlockSecurityHandler);
  document.getElementById("sec-btn-lock")?.addEventListener("click", lockSecurityHandler);
  document.getElementById("sec-btn-disable")?.addEventListener("click", disableSecurityHandler);

  // Toggle API key visibility
  document.getElementById("toggle-anthropic-vis")?.addEventListener("click", () => {
    const input = document.getElementById("anthropic-key");
    if (input) input.type = input.type === "password" ? "text" : "password";
  });
  document.getElementById("toggle-perplexity-vis")?.addEventListener("click", () => {
    const input = document.getElementById("perplexity-key");
    if (input) input.type = input.type === "password" ? "text" : "password";
  });
  document.getElementById("toggle-gemini-vis")?.addEventListener("click", () => {
    const input = document.getElementById("gemini-key");
    if (input) input.type = input.type === "password" ? "text" : "password";
  });

  document.getElementById("resume-profile-depth")?.addEventListener("change", async () => {
    await persistResumeProfileDepth();
    updateResumeDepthHint();
  });

  // Prompt generator
  document.getElementById("btn-copy-ai-prompt")?.addEventListener("click", () => {
    const resumeText = document.getElementById("resume-text")?.value.trim();
    if (!resumeText) {
      showStatus("json-import-status", "Please paste your resume text first.", "error");
      return;
    }
    const depth = document.getElementById("resume-profile-depth")?.value;
    const prompt = buildProfileGenerationPrompt(resumeText, depth);
    navigator.clipboard.writeText(prompt).then(() => {
      const btn = document.getElementById("btn-copy-ai-prompt");
      if (btn) { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy Prompt for ChatGPT/Claude"; }, 3000); }
    });
  });

  document.getElementById("btn-import-json-profile")?.addEventListener("click", async () => {
    const jsonText = document.getElementById("json-import-input")?.value.trim();
    if (!jsonText) { showStatus("json-import-status", "Please paste the JSON from your AI chat.", "error"); return; }
    try {
      const profile = JSON.parse(jsonText);
      if (typeof profile !== "object" || Array.isArray(profile)) throw new Error("Expected a JSON object");
      await sendMsg(MSG.SAVE_PROFILE, profile);
      showStatus("json-import-status", "Profile imported successfully! Check the Profile tab.", "success");
      await markTabSaved("profile");
      await loadProfile();
      showJSONPreview(profile);
      document.getElementById("json-import-input").value = "";
    } catch (err) {
      showStatus("json-import-status", `Invalid JSON: ${err.message}`, "error");
    }
  });

  // Skills Intelligence
  document.getElementById("btn-clear-skill-gaps")?.addEventListener("click", async () => {
    if (!confirm("Clear all skill gap data?")) return;
    await sendMsg(MSG.CLEAR_SKILL_GAPS);
    showStatus("skill-gaps-status", "Skill gap data cleared.", "success");
    await loadSkillGaps();
  });

  // Find Jobs
  document.getElementById("btn-find-jobs")?.addEventListener("click", findJobsHandler);
  document.getElementById("goto-api-from-jobs")?.addEventListener("click", (e) => {
    e.preventDefault();
    switchTab("api");
    history.replaceState(null, "", "#api");
  });
  document.getElementById("btn-save-profile").addEventListener("click", saveProfileHandler);
  document.getElementById("tab-profile")?.addEventListener("input", (e) => {
    const t = e.target;
    if (t?.matches?.("#p-dateOfBirth, #p-addressLine1, #p-addressLine2, #p-city, #p-postalCode, #p-location")) {
      syncProfileAddressHighlights();
    }
  });
  document.getElementById("btn-save-prefs").addEventListener("click", savePrefsHandler);
  document.getElementById("pref-currency")?.addEventListener("change", onPreferenceCurrencyChange);
  document.getElementById("btn-export").addEventListener("click", exportDataHandler);
  document.getElementById("btn-import").addEventListener("click", importDataHandler);
  document.getElementById("file-import").addEventListener("change", handleFileImport);
  document.getElementById("btn-clear-cache").addEventListener("click", clearCacheHandler);
  document.getElementById("btn-clear-all").addEventListener("click", clearAllHandler);

  document.getElementById("toggle-key-vis").addEventListener("click", () => {
    const input = document.getElementById("api-key");
    input.type = input.type === "password" ? "text" : "password";
  });

  document.getElementById("btn-copy-json")?.addEventListener("click", () => {
    if (lastParsedJSON) {
      navigator.clipboard.writeText(JSON.stringify(lastParsedJSON, null, 2));
      const btn = document.getElementById("btn-copy-json");
      btn.textContent = "Copied!";
      setTimeout(() => { btn.textContent = "Copy JSON"; }, 2000);
    }
  });

  document.getElementById("btn-toggle-json")?.addEventListener("click", () => {
    const pre = document.getElementById("json-preview");
    const btn = document.getElementById("btn-toggle-json");
    pre.classList.toggle("collapsed");
    btn.textContent = pre.classList.contains("collapsed") ? "Expand" : "Collapse";
  });

  // Add buttons for profile sections
  document.getElementById("btn-add-experience")?.addEventListener("click", () => addItem("experience"));
  document.getElementById("btn-add-education")?.addEventListener("click", () => addItem("education"));
  document.getElementById("btn-add-project")?.addEventListener("click", () => addItem("projects"));
  document.getElementById("btn-add-cert")?.addEventListener("click", () => addItem("certifications"));
  document.getElementById("btn-add-lang")?.addEventListener("click", () => addItem("languages"));
  document.getElementById("btn-add-internship")?.addEventListener("click", () => addItem("internships"));
  document.getElementById("btn-add-opensource")?.addEventListener("click", () => addItem("opensource"));

  document.getElementById("btn-add-answer")?.addEventListener("click", () => {
    const key = prompt("Question/Field name:");
    if (!key) return;
    const value = prompt("Your answer:");
    if (!value) return;
    sendMsg(MSG.SAVE_ANSWER, { key: normalizeKey(key), value, label: key, source: "manual" }).then(() => { markTabSaved("answers"); loadAnswers(); });
  });

  // PDF upload
  const pdfArea = document.getElementById("pdf-upload-area");
  const pdfInput = document.getElementById("resume-pdf-input");

  pdfArea?.addEventListener("click", (e) => {
    if (e.target.closest("#btn-remove-pdf")) return;
    pdfInput?.click();
  });

  pdfArea?.addEventListener("dragover", (e) => { e.preventDefault(); pdfArea.classList.add("drag-over"); });
  pdfArea?.addEventListener("dragleave", () => pdfArea.classList.remove("drag-over"));
  pdfArea?.addEventListener("drop", (e) => {
    e.preventDefault();
    pdfArea.classList.remove("drag-over");
    const file = e.dataTransfer?.files?.[0];
    if (file) handlePdfFile(file);
  });

  pdfInput?.addEventListener("change", () => {
    const file = pdfInput.files?.[0];
    if (file) handlePdfFile(file);
  });

  document.getElementById("btn-remove-pdf")?.addEventListener("click", async (e) => {
    e.stopPropagation();
    await sendMsg(MSG.REMOVE_RESUME_PDF);
    showPdfPlaceholder();
    showStatus("resume-status", "Resume PDF removed.", "success");
  });
}

async function loadSecurityStatus() {
  const el = document.getElementById("sec-enable");
  if (!el) return;
  const resp = await sendMsg(MSG.GET_SECURITY_STATUS);
  const enabled = resp.success && resp.data?.enabled === true;
  const locked = resp.success && resp.data?.locked === true;
  el.checked = enabled;
  updateSecurityButtons({ enabled, locked });
  if (enabled) {
    showStatus("sec-status", locked ? "Security mode enabled — keys are locked. Unlock to use AI." : "Security mode enabled — unlocked for this browser session.", locked ? "error" : "success");
  } else {
    const st = document.getElementById("sec-status");
    if (st) st.style.display = "none";
  }
}

function updateSecurityButtons(state) {
  const enabled = state?.enabled === true;
  const locked = state?.locked === true;
  const btnEnable = document.getElementById("sec-btn-enable");
  const btnUnlock = document.getElementById("sec-btn-unlock");
  const btnLock = document.getElementById("sec-btn-lock");
  const btnDisable = document.getElementById("sec-btn-disable");
  if (btnEnable) btnEnable.disabled = enabled;
  if (btnUnlock) btnUnlock.disabled = !enabled || !locked;
  if (btnLock) btnLock.disabled = !enabled || locked;
  if (btnDisable) btnDisable.disabled = !enabled;
}

function getSecurityPassphrase() {
  return String(document.getElementById("sec-passphrase")?.value || "");
}

async function onSecurityToggleChange() {
  const cb = document.getElementById("sec-enable");
  if (!cb) return;
  const resp = await sendMsg(MSG.GET_SECURITY_STATUS);
  const currentlyEnabled = resp.success && resp.data?.enabled === true;
  const desired = cb.checked === true;
  if (desired === currentlyEnabled) return;

  if (desired) {
    await enableSecurityHandler();
  } else {
    await disableSecurityHandler();
  }
  await loadSecurityStatus();
}

async function enableSecurityHandler() {
  const passphrase = getSecurityPassphrase();
  if (passphrase.length < 12) {
    showStatus("sec-status", "Passphrase must be at least 12 characters.", "error");
    const cb = document.getElementById("sec-enable");
    if (cb) cb.checked = false;
    return;
  }
  const resp = await sendMsg(MSG.ENABLE_SECURITY_MODE, { passphrase });
  if (!resp.success) {
    showStatus("sec-status", resp.error || "Failed to enable security mode.", "error");
    const cb = document.getElementById("sec-enable");
    if (cb) cb.checked = false;
    return;
  }
  showStatus("sec-status", "Security mode enabled. Keys are now encrypted at rest.", "success");
  await loadSecurityStatus();
}

async function unlockSecurityHandler() {
  const passphrase = getSecurityPassphrase();
  if (!passphrase) {
    showStatus("sec-status", "Enter your passphrase to unlock.", "error");
    return;
  }
  const resp = await sendMsg(MSG.UNLOCK_SECURITY_MODE, { passphrase });
  if (!resp.success) {
    showStatus("sec-status", resp.error || "Unlock failed.", "error");
    return;
  }
  showStatus("sec-status", "Unlocked for this browser session.", "success");
  await loadSecurityStatus();
}

async function lockSecurityHandler() {
  const resp = await sendMsg(MSG.LOCK_SECURITY_MODE, {});
  if (!resp.success) {
    showStatus("sec-status", resp.error || "Failed to lock.", "error");
    return;
  }
  showStatus("sec-status", "Locked. AI features are disabled until you unlock again.", "success");
  await loadSecurityStatus();
}

async function disableSecurityHandler() {
  const passphrase = getSecurityPassphrase();
  // If locked, the background will require passphrase to restore keys.
  const resp = await sendMsg(MSG.DISABLE_SECURITY_MODE, passphrase ? { passphrase } : {});
  if (!resp.success) {
    showStatus("sec-status", resp.error || "Failed to disable security mode.", "error");
    const status = await sendMsg(MSG.GET_SECURITY_STATUS);
    const cb = document.getElementById("sec-enable");
    if (cb) cb.checked = status.success && status.data?.enabled === true;
    return;
  }
  showStatus("sec-status", "Security mode disabled. Keys restored to normal storage.", "success");
  await loadSecurityStatus();
}

// ─── Helpers ────────────────────────────────────────────────────

async function sendMsg(type, payload = {}) {
  try { return await chrome.runtime.sendMessage({ type, payload }); }
  catch (err) { return { success: false, error: err.message }; }
}

function showStatus(elId, message, type) {
  const el = document.getElementById(elId);
  el.textContent = message;
  el.className = `status-msg ${type}`;
  el.style.display = "block";
  setTimeout(() => { el.style.display = "none"; }, 5000);
}

function escHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

function escAttr(text) {
  return (text || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function safeExternalHref(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
    return "";
  } catch {
    return "";
  }
}

function normalizeKey(label) {
  return label.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "_").slice(0, 50);
}
