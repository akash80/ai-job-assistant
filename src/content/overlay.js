import { generateId, sendMessage } from "../shared/utils.js";
import { MSG } from "../shared/constants.js";
import { extractJobText, extractJobIdentity } from "./extractor.js";
import { detectFields, detectFileInputs } from "./fields/detector.js";
import { buildFillPlan } from "./fields/mapper.js";
import { executeFillPlan, fillFileInput } from "./fields/filler.js";
import { createPrompterUI, promptForField, promptCoverLetterField } from "./fields/prompter.js";
import { buildSmartFormSchema } from "./fields/schema.js";
import { overlayStyles } from "./overlay-styles.js";
import { detectPageState } from "./page-state.js";

let overlayHost = null;
let shadowRoot = null;
let prompterEl = null;
let currentResult = null;
let baselineResult = null;
/** Job posting text + last analysis for cover letters when overlay is closed mid-flow */
let sessionJobContext = { jobText: "", analysis: null };
let coverLetterSmartMode = false;
/** Page chip to reopen after soft-close (panel hidden, session kept in DOM) */
let floatingLauncherRoot = null;
let smartFillActiveRequestId = null;
let smartFillLastProgressAt = 0;
let smartFillProgressTimer = null;
let smartFillElapsedTimer = null;
let smartFillStartedAt = 0;
let cachedExperimentalPrefs = null;
let tailoredPdfActiveRequestId = null;
let tailoredPdfStartedAt = 0;
let tailoredPdfElapsedTimer = null;

const LAUNCHER_SHADOW_STYLES = `
  :host { all: initial; }
  *, *::before, *::after { box-sizing: border-box; }
  .ja-launcher {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 2147483646;
    display: flex;
    align-items: stretch;
    gap: 0;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    box-shadow: 0 10px 25px -5px rgba(0,0,0,0.2), 0 4px 10px -4px rgba(0,0,0,0.15);
    border-radius: 10px;
    overflow: hidden;
    animation: ja-launcher-in 180ms ease-out;
  }
  @keyframes ja-launcher-in {
    from { transform: translateY(12px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
  }
  .ja-launcher-main {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border: none;
    background: #6366f1;
    color: #fff;
    cursor: pointer;
    font-weight: 600;
    max-width: 240px;
    text-align: left;
  }
  .ja-launcher-main:hover { background: #4f46e5; }
  .ja-launcher-dismiss {
    width: 36px;
    border: none;
    background: #4f46e5;
    color: rgba(255,255,255,0.9);
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 0;
  }
  .ja-launcher-dismiss:hover { background: #4338ca; color: #fff; }
`;

export function showLoading() {
  ensureOverlay();
  const content = shadowRoot.querySelector(".ja-content");
  content.innerHTML = `
    <div class="ja-loading">
      <div class="ja-spinner"></div>
      <p class="ja-loading-text">Analyzing job posting...</p>
    </div>
  `;
  show();
}

function startSmartFillProgressUI(requestId) {
  smartFillActiveRequestId = requestId;
  smartFillLastProgressAt = Date.now();
  smartFillStartedAt = Date.now();

  stopSmartFillProgressUI();

  smartFillElapsedTimer = setInterval(() => {
    const el = shadowRoot?.querySelector(".ja-fill-progress [data-ja-elapsed]");
    if (!el) return;
    const secs = Math.max(0, Math.round((Date.now() - smartFillStartedAt) / 1000));
    el.textContent = secs ? `${secs}s` : "";
  }, 500);

  smartFillProgressTimer = setInterval(() => {
    // If we haven't heard anything in a bit, make it obvious we're still working.
    if (Date.now() - smartFillLastProgressAt < 5000) return;
    const msgEl = shadowRoot?.querySelector(".ja-fill-progress .ja-fill-msg");
    if (msgEl && smartFillActiveRequestId === requestId) {
      msgEl.textContent = "Still working… (waiting for AI)";
    }
  }, 1000);
}

function stopSmartFillProgressUI() {
  if (smartFillProgressTimer) clearInterval(smartFillProgressTimer);
  if (smartFillElapsedTimer) clearInterval(smartFillElapsedTimer);
  smartFillProgressTimer = null;
  smartFillElapsedTimer = null;
}

function setSmartFillProgress({ requestId, step, percent, detail }) {
  if (!requestId || requestId !== smartFillActiveRequestId) return;
  smartFillLastProgressAt = Date.now();

  const msgEl = shadowRoot?.querySelector(".ja-fill-progress .ja-fill-msg");
  if (msgEl) {
    const parts = [step, detail].filter(Boolean);
    msgEl.textContent = parts.length ? parts.join(" — ") : msgEl.textContent;
  }

  if (Number.isFinite(Number(percent))) {
    const bar = shadowRoot?.querySelector(".ja-fill-progress .ja-score-fill");
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, Math.round(Number(percent))))}%`;
  }
}

let smartFillListenerAttached = false;
function ensureSmartFillProgressListener() {
  if (smartFillListenerAttached) return;
  smartFillListenerAttached = true;
  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message !== "object") return;
      if (message.type !== MSG.SMART_FILL_PROGRESS) return;
      const payload = message.payload || {};
      setSmartFillProgress(payload);
    });
  } catch {
    // ignore
  }
}

let tailoredPdfListenerAttached = false;
function ensureTailoredPdfProgressListener() {
  if (tailoredPdfListenerAttached) return;
  tailoredPdfListenerAttached = true;
  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || typeof message !== "object") return;
      if (message.type !== MSG.TAILORED_RESUME_PDF_PROGRESS) return;
      const payload = message.payload || {};
      setTailoredPdfProgress(payload);
    });
  } catch {
    // ignore
  }
}

function stopTailoredPdfElapsed() {
  if (tailoredPdfElapsedTimer) clearInterval(tailoredPdfElapsedTimer);
  tailoredPdfElapsedTimer = null;
}

function startTailoredPdfElapsed(requestId) {
  tailoredPdfActiveRequestId = requestId;
  tailoredPdfStartedAt = Date.now();
  stopTailoredPdfElapsed();
  tailoredPdfElapsedTimer = setInterval(() => {
    const el = shadowRoot?.querySelector("[data-ja-pdf-elapsed]");
    if (!el) return;
    const secs = Math.max(0, Math.round((Date.now() - tailoredPdfStartedAt) / 1000));
    el.textContent = secs ? `${secs}s` : "";
  }, 500);
}

function setTailoredPdfStatus(text) {
  const el = shadowRoot?.querySelector("[data-ja-pdf-status]");
  if (el) el.textContent = String(text || "");
}

function setTailoredPdfProgress({ requestId, step, detail }) {
  if (!requestId || requestId !== tailoredPdfActiveRequestId) return;
  const parts = [step, detail].filter(Boolean);
  if (parts.length) setTailoredPdfStatus(parts.join(" — "));
  if (step === "Done" || step === "Failed") stopTailoredPdfElapsed();
}

export function showResult(result, options = {}) {
  const { preserveBaseline = false, jobText = "", jobTextTruncated = false } = options;
  currentResult = result;
  sessionJobContext.analysis = result;
  if (jobText) sessionJobContext.jobText = jobText;
  sessionJobContext.jobTextTruncated = jobTextTruncated === true;
  if (!preserveBaseline) {
    baselineResult = {
      match_score: Number(result.match_score) || 0,
      missing_skills: Array.isArray(result.missing_skills) ? [...result.missing_skills] : [],
    };
  }
  ensureOverlay();
  ensureTailoredPdfProgressListener();
  const content = shadowRoot.querySelector(".ja-content");
  const scoreClass = result.match_score >= 70 ? "high" : result.match_score >= 40 ? "medium" : "low";

  // Build history banner (already analyzed/applied/etc.)
  const historyBanner = renderHistoryBanner(result);

  // Build local analysis banner if no AI was used
  const localBanner = result._local ? `
    <div class="ja-local-banner">
      <span>&#128272;</span>
      <div>
        <strong>Basic analysis</strong> — No AI key configured.
        <a class="ja-link" href="#" onclick="chrome.runtime.openOptionsPage?.()">Add API key</a> for accurate AI results.
      </div>
    </div>
  ` : "";

  // Growth opportunities section (score ≥75 with remaining gaps)
  const growthSection = (result.match_score >= 75 && result.missing_skills?.length > 0) ?
    renderGrowthOpportunities(result.missing_skills) : "";

  const tailoredResumeAction = renderTailoredResumeAction();

  content.innerHTML = `
    <div class="ja-result">
      ${historyBanner}
      ${localBanner}
      <div class="ja-job-info">
        <h3 class="ja-job-title">${escHtml(result.job_title)}</h3>
        <p class="ja-job-meta">${escHtml(result.company)} &middot; ${escHtml(result.job_type)} &middot; ${escHtml(result.location)}</p>
        ${result.salary_range ? `<p class="ja-salary">${escHtml(result.salary_range)}</p>` : ""}
      </div>

      <div class="ja-score-section">
        <div class="ja-score-header">
          <span class="ja-score-label">Match Score</span>
          <span class="ja-score-value ja-score-${scoreClass}">${result.match_score}%</span>
        </div>
        <div class="ja-score-bar">
          <div class="ja-score-fill ja-score-${scoreClass}" style="width: ${result.match_score}%"></div>
        </div>
      </div>

      ${renderSection("Strengths", result.strengths, "ja-strengths", "&#9989;")}
      ${renderMissingSkills(result.missing_skills || [])}
      ${growthSection}
      ${renderSection("Key Requirements", result.key_requirements, "ja-requirements", "&#128203;")}

      <div class="ja-recommendation">
        <div class="ja-rec-badge ja-rec-${result.recommendation.toLowerCase()}">${escHtml(result.recommendation)}</div>
        <p class="ja-rec-reason">${escHtml(result.reason)}</p>
      </div>

      <div class="ja-actions">
        <button class="ja-btn ja-btn-primary ja-btn-apply"></button>
        <button class="ja-btn ja-btn-secondary ja-btn-cover">Cover Letter</button>
        ${tailoredResumeAction}
        <button class="ja-btn ja-btn-secondary ja-btn-skip">Skip</button>
      </div>
    </div>
  `;

  configurePrimaryActionButton();
  shadowRoot.querySelector(".ja-btn-cover").addEventListener("click", () => showCoverLetterModal());
  const resumeBtn = shadowRoot.querySelector(".ja-btn-tailored-resume");
  if (resumeBtn) resumeBtn.addEventListener("click", () => showTailoredResumeModal());
  shadowRoot.querySelector(".ja-btn-skip").addEventListener("click", handleSkip);

  setupCollapsibles(shadowRoot);
  setupMissingSkillActions(shadowRoot);
  show();
  animateScore(shadowRoot, result.match_score, scoreClass);

  // Ensure experimental prefs are loaded; if enabled, re-render to show the Tailor Resume action.
  if (!cachedExperimentalPrefs) {
    ensureExperimentalPrefsLoaded().then(() => {
      if (currentResult) showResult(currentResult, { preserveBaseline: true });
    }).catch(() => {});
  }
}

function renderTailoredResumeAction() {
  const enabled = cachedExperimentalPrefs?.resumeGeneratorEnabled === true;
  if (!enabled) return "";
  return `<button class="ja-btn ja-btn-secondary ja-btn-tailored-resume">Tailor Resume</button>`;
}

async function ensureExperimentalPrefsLoaded() {
  if (cachedExperimentalPrefs) return cachedExperimentalPrefs;
  const resp = await sendMessage(MSG.GET_PREFERENCES);
  const p = resp?.success && resp.data ? resp.data : {};
  const exp = p.experimentalFeatures && typeof p.experimentalFeatures === "object" ? p.experimentalFeatures : {};
  cachedExperimentalPrefs = {
    resumeGeneratorEnabled: exp.resumeGeneratorEnabled === true,
  };
  return cachedExperimentalPrefs;
}

async function showTailoredResumeModal() {
  await ensureExperimentalPrefsLoaded();
  const exp = cachedExperimentalPrefs || {};
  if (exp.resumeGeneratorEnabled !== true) {
    showFillStatus("Enable Tailored Resume Generator in Settings → Experimental Features.", true);
    return;
  }
  if (!currentResult) return;

  const jobText = sessionJobContext.jobText || "";
  if (!jobText.trim()) {
    showFillStatus("Missing job text. Please analyze the job again.", true);
    return;
  }

  ensureOverlay();
  ensureTailoredPdfProgressListener();
  const content = shadowRoot.querySelector(".ja-content");
  content.innerHTML = `
    <div class="ja-modal">
      <div class="ja-modal-header">
        <h3 class="ja-modal-title">Tailored Resume (Experimental)</h3>
        <button class="ja-btn ja-btn-secondary ja-btn-back">${currentResult ? "Back to Analysis" : "Close"}</button>
      </div>
      <div class="ja-loading" style="margin-top:10px">
        <div class="ja-spinner"></div>
        <p class="ja-loading-text">Generating tailored resume JSON…</p>
      </div>
    </div>
  `;
  content.querySelector(".ja-btn-back")?.addEventListener("click", () => {
    if (currentResult) showResult(currentResult);
  });
  show();

  const jobPostingKey = currentResult?.jobPostingKey || "";
  const resp = await sendMessage(MSG.GENERATE_TAILORED_RESUME, {
    jobTitle: currentResult.job_title,
    company: currentResult.company,
    location: currentResult.location,
    jobUrl: window.location.href,
    jobPostingKey,
    jobText,
  });

  if (!resp?.success) {
    const friendly = (resp?.code === "NO_API_KEY" || resp?.code === "NO_PROVIDER")
      ? "This experimental feature needs an AI API key. Add OpenAI, Anthropic, Gemini, or Perplexity in Settings → API Configuration."
      : "";
    content.innerHTML = `
      <div class="ja-modal">
        <div class="ja-modal-header">
          <h3 class="ja-modal-title">Tailored Resume (Experimental)</h3>
          <button class="ja-btn ja-btn-secondary ja-btn-back">Back to Analysis</button>
        </div>
        <div class="ja-error" style="margin-top:12px">
          <strong>Failed:</strong> ${escHtml(resp?.error || "Unknown error")}
          ${friendly ? `<div style="margin-top:6px;color:#475569">${escHtml(friendly)}</div>` : ""}
        </div>
      </div>
    `;
    content.querySelector(".ja-btn-back")?.addEventListener("click", () => showResult(currentResult));
    return;
  }

  const jsonText = JSON.stringify(resp.data, null, 2);
  content.innerHTML = `
    <div class="ja-modal">
      <div class="ja-modal-header">
        <h3 class="ja-modal-title">Tailored Resume (Experimental)</h3>
        <button class="ja-btn ja-btn-secondary ja-btn-back">Back to Analysis</button>
      </div>
      <p class="ja-modal-desc">Review the generated JSON. You can copy it, and (optionally) export as PDF.</p>
      <div style="display:flex;align-items:center;gap:10px;margin:10px 0 6px">
        <div class="ja-spinner" style="width:16px;height:16px;border-width:2px"></div>
        <div style="font-size:12.5px;color:#475569">
          <span data-ja-pdf-status>Ready</span>
          <span style="margin-left:8px;color:#94a3b8" data-ja-pdf-elapsed></span>
        </div>
      </div>
      <div class="ja-actions" style="margin:10px 0 8px">
        <button class="ja-btn ja-btn-secondary ja-btn-copy-json">Copy JSON</button>
        <button class="ja-btn ja-btn-secondary ja-btn-download-pdf">Download PDF</button>
      </div>
      <pre class="ja-json-preview" style="max-height:340px;overflow:auto;background:#0b1020;color:#e5e7eb;padding:12px;border-radius:10px;font-size:11.5px;line-height:1.35">${escHtml(jsonText)}</pre>
    </div>
  `;
  content.querySelector(".ja-btn-back")?.addEventListener("click", () => showResult(currentResult));
  content.querySelector(".ja-btn-copy-json")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(jsonText);
      showFillStatus("Copied tailored resume JSON.", false);
    } catch {
      showFillStatus("Copy failed. Select and copy manually.", true);
    }
  });
  content.querySelector(".ja-btn-download-pdf")?.addEventListener("click", () => {
    const baseName = `${currentResult.company || "company"}-${currentResult.job_title || "resume"}`.toLowerCase();
    const requestId = generateId();
    startTailoredPdfElapsed(requestId);
    setTailoredPdfStatus("Starting export");
    sendMessage(MSG.GENERATE_TAILORED_RESUME_PDF, {
      requestId,
      jobPostingKey: jobPostingKey || "",
      fileBaseName: baseName,
    }).then((pdfResp) => {
      if (!pdfResp?.success) {
        setTailoredPdfStatus("Failed");
        stopTailoredPdfElapsed();
        showFillStatus(pdfResp?.error || "PDF export failed.", true);
        return;
      }
      setTailoredPdfStatus("Preview opened");
      showFillStatus("Preview opened. Press Ctrl+P → Save as PDF.", true);
    });
  });
}

function configurePrimaryActionButton() {
  const btn = shadowRoot?.querySelector(".ja-btn-apply");
  if (!btn) return;

  const state = detectPageState();
  btn.replaceWith(btn.cloneNode(true));
  const freshBtn = shadowRoot?.querySelector(".ja-btn-apply");
  if (!freshBtn) return;

  if (state.applicationForm) {
    freshBtn.textContent = "Apply Assist";
    freshBtn.addEventListener("click", () => handleApplyAssist());
    return;
  }

  if (state.applyCta) {
    freshBtn.textContent = "Apply";
    freshBtn.addEventListener("click", () => handleClickRealApply(state.applyCta));
    return;
  }

  freshBtn.textContent = "Apply Assist";
  freshBtn.addEventListener("click", () => handleApplyAssist());
}

async function handleClickRealApply(applyEl) {
  showFillStatus("Opening application…", false);

  try {
    applyEl.scrollIntoView?.({ block: "center", behavior: "smooth" });
  } catch {
    // ignore
  }

  try {
    applyEl.click?.();
  } catch {
    try {
      applyEl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    } catch {
      // ignore
    }
  }

  // If the site opens the form inline (no navigation), auto-start Apply Assist.
  for (const waitMs of [800, 1200, 1600, 2500]) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, waitMs));
    const state = detectPageState();
    if (state.applicationForm) {
      // eslint-disable-next-line no-await-in-loop
      await handleApplyAssist();
      return;
    }
  }

  showFillStatus("If the application form opened in another step, click Apply Assist on that page to continue.", true);
}

export function showError(message, showRetry = true) {
  ensureOverlay();
  const content = shadowRoot.querySelector(".ja-content");

  // Check if it's a no-API-key error — show a more helpful message
  const isNoKey = message.includes("API key") || message.includes("No AI provider");
  const noKeyHtml = isNoKey ? `
    <div class="ja-nokey-hint">
      <p><strong>Options:</strong></p>
      <ul>
        <li><a class="ja-link" href="#" id="ja-open-settings">Add an API key in Settings</a></li>
        <li>Or analyze with <strong>basic keyword matching</strong> (no key needed):</li>
      </ul>
      <button class="ja-btn ja-btn-secondary ja-btn-local-analyze" style="margin-top:8px">Analyze Without AI</button>
    </div>
  ` : "";

  content.innerHTML = `
    <div class="ja-error">
      <p class="ja-error-icon">&#9888;&#65039;</p>
      <p class="ja-error-title">Analysis Failed</p>
      <p class="ja-error-message">${escHtml(message)}</p>
      ${noKeyHtml}
      <div class="ja-actions">
        ${showRetry && !isNoKey ? '<button class="ja-btn ja-btn-primary ja-btn-retry">Retry</button>' : ""}
        <button class="ja-btn ja-btn-secondary ja-btn-settings">Settings</button>
      </div>
    </div>
  `;

  if (showRetry && !isNoKey) {
    shadowRoot.querySelector(".ja-btn-retry")?.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("ja-retry-analysis"));
    });
  }
  shadowRoot.querySelector(".ja-btn-settings")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage?.() || window.open(chrome.runtime.getURL("options/options.html"));
  });
  shadowRoot.querySelector("#ja-open-settings")?.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage?.() || window.open(chrome.runtime.getURL("options/options.html"));
  });
  shadowRoot.querySelector(".ja-btn-local-analyze")?.addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("ja-local-analysis"));
  });
  show();
}

/** Start form assist directly without running page analysis first. */
export async function startFillAssist() {
  currentResult = null;
  ensureOverlay();
  show();
  await handleApplyAssist();
}

/** Start Smart form assist (AI-planned fill). */
export async function startSmartFillAssist() {
  // For now, reuse the same entry flow. The Smart preview / AI plan
  // is implemented in the Apply Assist preview/fill pipeline.
  currentResult = null;
  ensureOverlay();
  show();
  await handleApplyAssist({ smart: true });
}

export function removeOverlay() {
  destroyFloatingLauncher();
  sessionJobContext = { jobText: "", analysis: null };
  currentResult = null;
  baselineResult = null;
  if (overlayHost) {
    overlayHost.remove();
    overlayHost = null;
    shadowRoot = null;
    prompterEl = null;
  }
}

/** Hide panel but keep the same UI state (cover letter, preview, analysis). Use chip or extension popup to reopen. */
function softCloseOverlay() {
  if (!overlayHost) return;
  overlayHost.style.display = "none";
  showFloatingLauncher();
}

/** Reopen panel after soft-close, or focus if already visible. */
export function restoreHiddenOverlay() {
  if (!overlayHost) return false;
  if (overlayHost.style.display !== "none") return false;
  hideFloatingLauncher();
  overlayHost.style.display = "block";
  show();
  return true;
}

/** Show the overlay if it exists (restores if hidden; focuses if already visible). */
export function showExistingOverlay() {
  if (!overlayHost) return false;
  hideFloatingLauncher();
  overlayHost.style.display = "block";
  show();
  return true;
}

/** Restore analysis + job text across navigation (apply flow on a different URL). */
export function hydrateJobSession(session) {
  if (!session || typeof session !== "object") return false;
  if (session.analysis && typeof session.analysis === "object") {
    sessionJobContext.analysis = session.analysis;
  }
  if (typeof session.jobText === "string" && session.jobText.trim()) {
    sessionJobContext.jobText = session.jobText;
  }
  return !!sessionJobContext.analysis;
}

/** Show a persistent chip that can reopen the assistant on the new page. */
export function showContinueChip(label = "Continue") {
  const host = ensureFloatingLauncher();
  host.style.display = "block";
  try {
    const shadow = host.shadowRoot;
    const btn = shadow?.querySelector(".ja-launcher-main span:last-child");
    if (btn) btn.textContent = label;
  } catch {
    // ignore
  }
}

function destroyFloatingLauncher() {
  if (floatingLauncherRoot) {
    floatingLauncherRoot.remove();
    floatingLauncherRoot = null;
  }
}

function ensureFloatingLauncher() {
  if (floatingLauncherRoot) return floatingLauncherRoot;

  const host = document.createElement("div");
  host.id = "ja-extension-launcher";
  host.setAttribute("data-ja-extension", "launcher");

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = LAUNCHER_SHADOW_STYLES;
  shadow.appendChild(style);

  const wrap = document.createElement("div");
  wrap.className = "ja-launcher";
  wrap.innerHTML = `
    <button type="button" class="ja-launcher-main" title="Reopen AI Job Assistant">
      <span aria-hidden="true">&#128640;</span>
      <span>AI Job Assistant</span>
    </button>
    <button type="button" class="ja-launcher-dismiss" title="Dismiss and clear this session">&times;</button>
  `;
  shadow.appendChild(wrap);

  wrap.querySelector(".ja-launcher-main").addEventListener("click", () => {
    if (restoreHiddenOverlay()) return;
    if (sessionJobContext.analysis) {
      showResult(sessionJobContext.analysis, { preserveBaseline: true, jobText: sessionJobContext.jobText || "" });
    }
  });
  wrap.querySelector(".ja-launcher-dismiss").addEventListener("click", (e) => {
    e.stopPropagation();
    removeOverlay();
  });

  document.body.appendChild(host);
  floatingLauncherRoot = host;
  return host;
}

function showFloatingLauncher() {
  const host = ensureFloatingLauncher();
  host.style.display = "block";
}

function hideFloatingLauncher() {
  if (floatingLauncherRoot) floatingLauncherRoot.style.display = "none";
}

export function minimizeOverlay() {
  if (!overlayHost || !currentResult) return;
  const panel = shadowRoot.querySelector(".ja-panel");
  if (panel) panel.classList.add("ja-minimized");
}

function ensureOverlay() {
  if (overlayHost) return;

  overlayHost = document.createElement("div");
  overlayHost.id = "ja-extension-root";
  shadowRoot = overlayHost.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = overlayStyles;
  shadowRoot.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "ja-panel";
  panel.innerHTML = `
    <div class="ja-header">
      <span class="ja-title">AI Job Assistant</span>
      <div class="ja-header-actions">
        <button type="button" class="ja-header-btn ja-btn-minimize" title="Minimize to corner">&#8722;</button>
        <button type="button" class="ja-header-btn ja-btn-close" title="Hide panel — reopen from the page chip or extension menu">&#10005;</button>
      </div>
    </div>
    <div class="ja-content"></div>
  `;

  shadowRoot.appendChild(panel);
  prompterEl = createPrompterUI(shadowRoot);

  panel.querySelector(".ja-btn-close").addEventListener("click", softCloseOverlay);
  panel.querySelector(".ja-btn-minimize").addEventListener("click", minimizeOverlay);

  document.body.appendChild(overlayHost);
}

function show() {
  hideFloatingLauncher();
  if (overlayHost) overlayHost.style.display = "block";
  const panel = shadowRoot?.querySelector(".ja-panel");
  if (panel) panel.classList.remove("ja-minimized");
}

async function handleApplyAssist(applyOpts = {}) {
  const profileResp = await sendMessage(MSG.GET_PROFILE);
  const answersResp = await sendMessage(MSG.GET_ANSWERS);
  const preferencesResp = await sendMessage(MSG.GET_PREFERENCES);
  const profile = profileResp.success ? profileResp.data : {};
  const answers = answersResp.success ? answersResp.data : {};
  const preferences = preferencesResp.success ? preferencesResp.data : {};

  const fields = detectFields();
  const fileInputs = detectFileInputs();
  if (fields.length === 0 && fileInputs.length === 0) {
    showFillStatus("No form fields found on this page.", true);
    return;
  }

  showPreview({ fields, fileInputs, profile, answers, preferences }, applyOpts);
}

function appendResumeFileFields(plan, fileInputs) {
  for (const el of fileInputs) {
    const label = extractFileInputLabel(el);
    plan.fileFields.push({ element: el, fieldType: "resume_upload", label });
  }
}

async function showPreview(ctx, applyOpts = {}) {
  const { fields, fileInputs, profile, answers, preferences } = ctx;
  if (applyOpts.smart === true && preferences?.smartFillEnabled !== false) {
    await showSmartPreview(ctx);
    return;
  }

  await showNormalPreview(ctx);
}

async function showNormalPreview(ctx) {
  const { fields, fileInputs, profile, answers, preferences } = ctx;

  function makePlan(overrideFilled) {
    const p = buildFillPlan(fields, profile, answers, { overrideFilled });
    appendResumeFileFields(p, fileInputs);
    return p;
  }

  const plan = makePlan(false);
  const content = shadowRoot.querySelector(".ja-content");
  const knownHtml = plan.knownFields
    .map((f) => `<tr><td>&#9989;</td><td>${escHtml(f.label || f.fieldType)}</td><td>${escHtml(f.value)}</td></tr>`)
    .join("");
  const unknownHtml = plan.unknownFields
    .map((f) => `<tr><td>&#10067;</td><td>${escHtml(f.label || f.fieldType)}</td><td class="ja-muted">Need input</td></tr>`)
    .join("");
  const skippedHtml = plan.skippedFields
    .filter((f) => f.reason !== "hidden")
    .map((f) => `<tr><td>&#9197;</td><td>${escHtml(f.label || f.reason)}</td><td class="ja-muted">${escHtml(f.reason)}</td></tr>`)
    .join("");

  let fileHtml = "";
  if (plan.fileFields && plan.fileFields.length > 0) {
    const pdfResp = await sendMessage(MSG.GET_RESUME_PDF);
    const hasPdf = pdfResp.success && pdfResp.data;
    fileHtml = plan.fileFields.map((f) => {
      if (hasPdf) {
        return `<tr><td>&#128206;</td><td>${escHtml(f.label || "Resume Upload")}</td><td>${escHtml(pdfResp.data.fileName)}</td></tr>`;
      }
      return `<tr><td>&#9888;</td><td>${escHtml(f.label || "Resume Upload")}</td><td class="ja-muted">No PDF uploaded — upload in Settings</td></tr>`;
    }).join("");
  }

  const fileCount = plan.fileFields?.length || 0;
  content.innerHTML = `
    <div class="ja-preview">
      <h3>Fill Preview</h3>
      <p class="ja-preview-summary">
        &#9989; ${plan.knownFields.length} auto-fill &nbsp;
        ${fileCount > 0 ? `&#128206; ${fileCount} resume attach &nbsp;` : ""}
        &#10067; ${plan.unknownFields.length} need input &nbsp;
        &#9197; ${plan.skippedFields.length} skipped
      </p>
      <table class="ja-preview-table">
        <tbody>${knownHtml}${fileHtml}${unknownHtml}${skippedHtml}</tbody>
      </table>
      <label class="ja-preview-override">
        <input type="checkbox" id="ja-override-filled" />
        <span>Overwrite fields that already have values</span>
      </label>
      <p class="ja-preview-override-hint">Leave unchecked to keep existing answers. Check before Proceed to replace them with your profile data.</p>
      <div class="ja-actions">
        <button class="ja-btn ja-btn-primary ja-btn-proceed">Proceed</button>
        <button class="ja-btn ja-btn-secondary ja-btn-cancel">Cancel</button>
      </div>
    </div>
  `;

  shadowRoot.querySelector(".ja-btn-proceed").addEventListener("click", () => {
    const overrideFilled = shadowRoot.querySelector("#ja-override-filled")?.checked === true;
    const planToRun = makePlan(overrideFilled);
    startFilling(planToRun, preferences);
  });
  shadowRoot.querySelector(".ja-btn-cancel").addEventListener("click", () => {
    if (currentResult) showResult(currentResult);
    else removeOverlay();
  });
}

async function showSmartPreview(ctx) {
  const { fields, fileInputs, preferences } = ctx;
  const content = shadowRoot.querySelector(".ja-content");
  ensureSmartFillProgressListener();
  const requestId = generateId();
  content.innerHTML = `
    <div class="ja-fill-progress">
      <p class="ja-fill-msg">Preparing Smart Form Fill plan…</p>
      <p class="ja-muted" style="margin-top:6px">Elapsed: <span data-ja-elapsed></span></p>
      <div class="ja-score-bar"><div class="ja-score-fill ja-score-high" style="width:10%"></div></div>
    </div>
  `;
  startSmartFillProgressUI(requestId);
  setSmartFillProgress({ requestId, step: "Scanning fields", percent: 15 });

  const overrideFilledDefault = false;
  const { schema: formSchema, indexById } = buildSmartFormSchema(fields);
  setSmartFillProgress({ requestId, step: "Building schema", percent: 25, detail: `${Number(formSchema?.fieldCount || 0)} fields` });

  const jobContext = sessionJobContext?.analysis ? {
    analysis: sessionJobContext.analysis,
    jobText: String(sessionJobContext.jobText || "").slice(0, 12000),
  } : null;

  setSmartFillProgress({ requestId, step: "Sending to AI", percent: 35 });
  const resp = await sendMessage(MSG.SMART_FILL_PLAN, { requestId, formSchema, pageUrl: window.location.href, jobContext });
  if (!resp.success) {
    stopSmartFillProgressUI();
    smartFillActiveRequestId = null;
    content.innerHTML = `
      <div class="ja-fill-status">
        <p>${escHtml(resp.error || "Could not build a Smart Form Fill plan. Falling back to standard Fill Preview.")}</p>
        <div class="ja-actions">
          <button class="ja-btn ja-btn-primary ja-btn-fallback">Use standard fill</button>
          <button class="ja-btn ja-btn-secondary ja-btn-cancel">Cancel</button>
        </div>
      </div>
    `;
    shadowRoot.querySelector(".ja-btn-fallback")?.addEventListener("click", () => showNormalPreview(ctx));
    shadowRoot.querySelector(".ja-btn-cancel")?.addEventListener("click", () => {
      if (currentResult) showResult(currentResult);
      else removeOverlay();
    });
    return;
  }

  setSmartFillProgress({ requestId, step: "Finalizing plan", percent: 95 });
  stopSmartFillProgressUI();
  smartFillActiveRequestId = null;

  const plan = buildExecutableSmartFillPlan(resp.data, indexById, preferences, overrideFilledDefault);
  appendResumeFileFields(plan, fileInputs);

  const knownHtml = plan.knownFields
    .map((f) => `<tr><td>&#9989;</td><td>${escHtml(f.label || f.fieldType)}</td><td>${escHtml(String(f.value))}</td></tr>`)
    .join("");
  const unknownHtml = plan.unknownFields
    .map((f) => `<tr><td>&#129302;</td><td>${escHtml(f.label || f.fieldType)}</td><td class="ja-muted">Confirm</td></tr>`)
    .join("");
  const skippedHtml = plan.skippedFields
    .filter((f) => f.reason !== "hidden")
    .map((f) => `<tr><td>&#9197;</td><td>${escHtml(f.label || f.reason)}</td><td class="ja-muted">${escHtml(f.reason)}</td></tr>`)
    .join("");

  let fileHtml = "";
  if (plan.fileFields && plan.fileFields.length > 0) {
    const pdfResp = await sendMessage(MSG.GET_RESUME_PDF);
    const hasPdf = pdfResp.success && pdfResp.data;
    fileHtml = plan.fileFields.map((f) => {
      if (hasPdf) {
        return `<tr><td>&#128206;</td><td>${escHtml(f.label || "Resume Upload")}</td><td>${escHtml(pdfResp.data.fileName)}</td></tr>`;
      }
      return `<tr><td>&#9888;</td><td>${escHtml(f.label || "Resume Upload")}</td><td class="ja-muted">No PDF uploaded — upload in Settings</td></tr>`;
    }).join("");
  }

  const fileCount = plan.fileFields?.length || 0;
  content.innerHTML = `
    <div class="ja-preview">
      <h3>Smart Fill Preview</h3>
      <p class="ja-preview-summary">
        &#9989; ${plan.knownFields.length} auto-fill &nbsp;
        ${fileCount > 0 ? `&#128206; ${fileCount} resume attach &nbsp;` : ""}
        &#129302; ${plan.unknownFields.length} confirm &nbsp;
        &#9197; ${plan.skippedFields.length} skipped
      </p>
      <table class="ja-preview-table">
        <tbody>${knownHtml}${fileHtml}${unknownHtml}${skippedHtml}</tbody>
      </table>
      <label class="ja-preview-override">
        <input type="checkbox" id="ja-override-filled" />
        <span>Overwrite fields that already have values</span>
      </label>
      <p class="ja-preview-override-hint">Leave unchecked to keep existing answers. Check before Proceed to replace them with the Smart Fill plan.</p>
      <div class="ja-actions">
        <button class="ja-btn ja-btn-primary ja-btn-proceed">Proceed</button>
        <button class="ja-btn ja-btn-secondary ja-btn-cancel">Cancel</button>
      </div>
    </div>
  `;

  shadowRoot.querySelector(".ja-btn-proceed").addEventListener("click", () => {
    const overrideFilled = shadowRoot.querySelector("#ja-override-filled")?.checked === true;
    const planToRun = buildExecutableSmartFillPlan(resp.data, indexById, preferences, overrideFilled);
    appendResumeFileFields(planToRun, fileInputs);
    startFilling(planToRun, preferences);
  });
  shadowRoot.querySelector(".ja-btn-cancel").addEventListener("click", () => {
    if (currentResult) showResult(currentResult);
    else removeOverlay();
  });
}

function buildExecutableSmartFillPlan(aiPlan, indexById, preferences, overrideFilled) {
  const threshold = Number(preferences?.smartFillConfidenceThreshold || 0.9);
  const knownFields = [];
  const unknownFields = [];
  const skippedFields = [];

  const addQuestion = (q) => {
    const el = indexById[q.fieldId];
    if (!el) return;
    unknownFields.push({
      element: el,
      fieldType: "unknown",
      label: q.prompt || q.fieldId,
      answerKey: `smart:${q.fieldId}`,
      placeholder: "",
      isRequired: true,
      suggestedValue: q.suggestedValue || "",
    });
  };

  // Convert low-confidence fills into questions for confirmation.
  for (const f of Array.isArray(aiPlan?.fills) ? aiPlan.fills : []) {
    if (!f || typeof f !== "object") continue;
    const el = indexById[f.fieldId];
    if (!el) continue;
    const confidence = Number(f.confidence || 0);
    const isLow = !Number.isFinite(confidence) || confidence < threshold || f.source === "generated" || f.source === "inferred";
    if (isLow) {
      addQuestion({
        fieldId: f.fieldId,
        prompt: `Confirm: ${f.reason || f.fieldId}`,
        suggestedValue: String(f.value ?? ""),
      });
      continue;
    }

    const normalized = normalizeSmartFillValueForElement(el, f.value);
    if (normalized.ok !== true) {
      addQuestion({
        fieldId: f.fieldId,
        prompt: `Confirm: ${f.reason || f.fieldId}`,
        suggestedValue: String(f.value ?? ""),
      });
      continue;
    }

    if (!overrideFilled && !Array.isArray(el) && el?.value && String(el.value).trim()) {
      skippedFields.push({ element: el, reason: "already_filled", label: "" });
      continue;
    }

    knownFields.push({
      element: el,
      fieldType: "smart_fill",
      label: f.reason || f.fieldId,
      value: normalized.value,
      confidence,
      source: f.source || "inferred",
    });
  }

  for (const s of Array.isArray(aiPlan?.skip) ? aiPlan.skip : []) {
    const el = indexById?.[s?.fieldId];
    if (!el) continue;
    skippedFields.push({ element: el, reason: s.reason || "skipped", label: "" });
  }

  for (const q of Array.isArray(aiPlan?.questions) ? aiPlan.questions : []) {
    if (!q || typeof q !== "object") continue;
    addQuestion(q);
  }

  return {
    totalFields: knownFields.length + unknownFields.length,
    knownFields,
    unknownFields,
    skippedFields,
    fileFields: [],
  };
}

function normalizeSmartFillValueForElement(element, rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value) return { ok: false, value: "" };

  // Radio groups.
  if (Array.isArray(element)) {
    const first = element[0];
    const type = String(first?.type || "").toLowerCase();
    if (type === "radio") {
      // Let filler do fuzzy matching, but avoid obviously empty/invalid.
      return { ok: true, value };
    }
    return { ok: false, value: "" };
  }

  const tag = String(element?.tagName || "").toLowerCase();
  const type = String(element?.type || "").toLowerCase();

  if (tag === "select") {
    const opts = Array.from(element.options || []).map((o) => ({
      value: String(o.value ?? "").trim(),
      label: String(o.textContent ?? "").trim(),
      disabled: Boolean(o.disabled),
    })).filter((o) => (o.value || o.label) && !o.disabled);

    const lower = value.toLowerCase();
    const match = opts.find((o) => o.value.toLowerCase() === lower) || opts.find((o) => o.label.toLowerCase() === lower);
    if (match) return { ok: true, value: match.value || match.label };
    return { ok: false, value: "" };
  }

  if (type === "email") {
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    return ok ? { ok: true, value } : { ok: false, value: "" };
  }

  if (type === "url") {
    try {
      // eslint-disable-next-line no-new
      new URL(value);
      return { ok: true, value };
    } catch {
      return { ok: false, value: "" };
    }
  }

  return { ok: true, value };
}

async function startFilling(plan, preferences = {}) {
  if (plan.fileFields && plan.fileFields.length > 0) {
    const pdfResp = await sendMessage(MSG.GET_RESUME_PDF);
    if (pdfResp.success && pdfResp.data) {
      for (const ff of plan.fileFields) {
        showFillStatus(`Attaching resume: ${ff.label || "Resume Upload"}`, false);
        await fillFileInput(ff.element, pdfResp.data.base64, pdfResp.data.fileName, pdfResp.data.mimeType);
      }
    }
  }

  await executeFillPlan(plan, {
    onFieldStart: (field, done, total) => {
      showFillStatus(`Filling: ${field.label || field.fieldType} (${done + 1}/${total})`, false);
    },
    onFieldComplete: (_field, done, total) => {
      updateProgress(done, total);
    },
    onUnknownField: async (field) => {
      if (field.fieldType === "cover_letter") {
        return promptCoverLetterField(prompterEl, field);
      }
      return promptForField(prompterEl, field);
    },
    onComplete: (stats) => {
      const resumeAttached = plan.fileFields?.length > 0;
      const statusParts = [`${stats.filled} filled`, `${stats.skipped} skipped`, `${stats.errors} errors`];
      if (resumeAttached) statusParts.push("resume attached");
      showFillStatus(`Done! ${statusParts.join(", ")}. Submit the application to mark it as applied in History.`, true);
    },
  }, { fillMode: preferences?.fillMode || "fast" });
}

function showFillStatus(message, isFinal) {
  const content = shadowRoot.querySelector(".ja-content");
  if (!content) return;

  if (isFinal) {
    content.innerHTML = `
      <div class="ja-fill-status">
        <p>${escHtml(message)}</p>
        <div class="ja-actions">
          <button class="ja-btn ja-btn-secondary ja-btn-back">${currentResult ? "Back to Analysis" : "Close"}</button>
        </div>
      </div>
    `;
    shadowRoot.querySelector(".ja-btn-back")?.addEventListener("click", () => {
      if (currentResult) showResult(currentResult);
      else removeOverlay();
    });
  } else {
    let statusEl = content.querySelector(".ja-fill-progress");
    if (!statusEl) {
      content.innerHTML = `
        <div class="ja-fill-progress">
          <p class="ja-fill-msg"></p>
          <div class="ja-score-bar"><div class="ja-score-fill ja-score-high" style="width:0%"></div></div>
        </div>
      `;
      statusEl = content.querySelector(".ja-fill-progress");
    }
    statusEl.querySelector(".ja-fill-msg").textContent = message;
  }
}

function updateProgress(done, total) {
  const bar = shadowRoot?.querySelector(".ja-fill-progress .ja-score-fill");
  if (bar) bar.style.width = `${Math.round((done / total) * 100)}%`;
}

async function handleSkip() {
  if (currentResult) {
    const identity = extractJobIdentity();
    await sendMessage(MSG.LOG_APPLICATION, {
      url: window.location.href,
      domain: window.location.hostname,
      jobTitle: currentResult.job_title,
      company: currentResult.company,
      jobIds: identity?.jobIds || [],
      matchScore: currentResult.match_score,
      action: "skipped",
      status: "skipped",
      recommendation: currentResult.recommendation,
      fieldsAutoFilled: 0,
      fieldsManual: 0,
    });
  }
  removeOverlay();
}

// ─── Cover Letter Modal ──────────────────────────────────────────

async function showCoverLetterModal(tone = "professional") {
  const content = shadowRoot.querySelector(".ja-content");

  content.innerHTML = `
    <div class="ja-cover-letter">
      <h3>&#128221; Cover Letter</h3>
      <div class="ja-tone-selector">
        <span class="ja-tone-label">Tone:</span>
        <button class="ja-tone-btn ${tone === "professional" ? "active" : ""}" data-tone="professional">Professional</button>
        <button class="ja-tone-btn ${tone === "conversational" ? "active" : ""}" data-tone="conversational">Conversational</button>
        <button class="ja-tone-btn ${tone === "concise" ? "active" : ""}" data-tone="concise">Concise</button>
      </div>
      <div class="ja-cover-mode-row">
        <span class="ja-tone-label">Depth:</span>
        <button type="button" class="ja-cover-mode-btn ${coverLetterSmartMode ? "" : "active"}" data-cover-mode="standard">Standard</button>
        <button type="button" class="ja-cover-mode-btn ${coverLetterSmartMode ? "active" : ""}" data-cover-mode="smart">Smart</button>
      </div>
      <p class="ja-cover-mode-hint">Smart analyzes the full job posting plus your profile for a stronger, longer letter (uses more API tokens).</p>
      <div id="ja-cover-body" class="ja-cover-body">
        <div class="ja-loading" style="padding: 20px">
          <div class="ja-spinner"></div>
          <p class="ja-loading-text">Generating cover letter...</p>
        </div>
      </div>
      <div class="ja-actions" id="ja-cover-actions" style="display:none">
        <button class="ja-btn ja-btn-primary ja-btn-copy-cover">Copy</button>
        <button class="ja-btn ja-btn-secondary ja-btn-regen-cover">Regenerate</button>
        <button class="ja-btn ja-btn-secondary ja-btn-back-cover">Back</button>
      </div>
      <div class="ja-actions" id="ja-cover-back" style="display:none">
        <button class="ja-btn ja-btn-secondary ja-btn-back-cover2">Back to Analysis</button>
      </div>
    </div>
  `;

  // Tone buttons
  shadowRoot.querySelectorAll(".ja-tone-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      showCoverLetterModal(btn.dataset.tone);
    });
  });

  shadowRoot.querySelectorAll("[data-cover-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      coverLetterSmartMode = btn.dataset.coverMode === "smart";
      shadowRoot.querySelectorAll("[data-cover-mode]").forEach((b) => {
        b.classList.toggle("active", b.dataset.coverMode === (coverLetterSmartMode ? "smart" : "standard"));
      });
    });
  });

  // Generate
  await generateCoverLetter(tone);
}

async function generateCoverLetter(tone) {
  const bodyEl = shadowRoot.querySelector("#ja-cover-body");
  const actionsEl = shadowRoot.querySelector("#ja-cover-actions");
  const backEl = shadowRoot.querySelector("#ja-cover-back");
  if (!bodyEl) return;

  const jobAnalysis = currentResult || sessionJobContext.analysis;
  if (!jobAnalysis) {
    bodyEl.innerHTML = `<p class="ja-error-message">No job analysis available. Analyze this page from the extension toolbar first.</p>`;
    if (backEl) backEl.style.display = "flex";
    shadowRoot.querySelector(".ja-btn-back-cover2")?.addEventListener("click", () => {
      if (currentResult) showResult(currentResult);
      else if (sessionJobContext.analysis) showResult(sessionJobContext.analysis);
      else removeOverlay();
    });
    return;
  }

  const jobPostingText =
    sessionJobContext.jobText ||
    (typeof extractJobText === "function" ? extractJobText() : "") ||
    "";

  const resp = await sendMessage(MSG.GENERATE_COVER_LETTER, {
    jobAnalysis,
    tone,
    smart: coverLetterSmartMode,
    jobPostingText: jobPostingText.slice(0, 15000),
  });

  if (!resp.success) {
    // If no API key, show the prompt instead
    if (resp.code === "NO_API_KEY" || resp.code === "NO_PROVIDER") {
      const profileResp = await sendMessage(MSG.GET_PROFILE);
      const profile = profileResp.success ? profileResp.data : {};
      showCoverLetterPromptFallback(bodyEl, backEl, jobAnalysis, profile, tone);
      return;
    }
    bodyEl.innerHTML = `<p class="ja-error-message">&#9888; ${escHtml(resp.error)}</p>`;
    if (backEl) backEl.style.display = "flex";
    shadowRoot.querySelector(".ja-btn-back-cover2")?.addEventListener("click", () => {
      if (currentResult) showResult(currentResult);
      else removeOverlay();
    });
    return;
  }

  const letter = resp.data;
  bodyEl.innerHTML = `<div class="ja-cover-text" contenteditable="true">${escHtml(letter)}</div>`;

  if (actionsEl) actionsEl.style.display = "flex";

  shadowRoot.querySelector(".ja-btn-copy-cover")?.addEventListener("click", () => {
    const text = shadowRoot.querySelector(".ja-cover-text")?.innerText || letter;
    navigator.clipboard.writeText(text).then(() => {
      const btn = shadowRoot.querySelector(".ja-btn-copy-cover");
      if (btn) { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy"; }, 2000); }
    });
  });

  shadowRoot.querySelector(".ja-btn-regen-cover")?.addEventListener("click", () => {
    const activeTone = shadowRoot.querySelector(".ja-tone-btn.active")?.dataset.tone || tone;
    bodyEl.innerHTML = `<div class="ja-loading" style="padding:20px"><div class="ja-spinner"></div><p>Regenerating...</p></div>`;
    generateCoverLetter(activeTone);
  });

  shadowRoot.querySelector(".ja-btn-back-cover")?.addEventListener("click", () => {
    if (currentResult) showResult(currentResult);
    else if (sessionJobContext.analysis) showResult(sessionJobContext.analysis);
    else removeOverlay();
  });
}

function showCoverLetterPromptFallback(bodyEl, backEl, jobAnalysis, profile, tone) {
  const { buildChatGptCoverLetterInstructions } = (() => {
    const skills = Object.values(profile?.skills || {}).flat().slice(0, 10).join(", ");
    const name = profile?.name || profile?.firstName || "Your Name";
    return {
      buildChatGptCoverLetterInstructions: () => `Write a ${tone} cover letter for:
Job: ${jobAnalysis?.job_title || "this position"} at ${jobAnalysis?.company || "the company"}
Requirements: ${(jobAnalysis?.key_requirements || []).join(", ")}
My name: ${name}
My skills: ${skills}
My match strengths: ${(jobAnalysis?.strengths || []).join(", ")}

Write exactly 3 paragraphs. No greeting/sign-off. Under 300 words.`,
    };
  })();

  const prompt = buildChatGptCoverLetterInstructions();
  bodyEl.innerHTML = `
    <div class="ja-prompt-fallback">
      <p class="ja-muted" style="margin-bottom:8px">No AI key configured. Copy this prompt into ChatGPT or Claude:</p>
      <pre class="ja-prompt-box">${escHtml(prompt)}</pre>
      <button class="ja-btn ja-btn-secondary ja-btn-copy-prompt" style="margin-top:8px">Copy Prompt</button>
    </div>
  `;

  shadowRoot.querySelector(".ja-btn-copy-prompt")?.addEventListener("click", () => {
    navigator.clipboard.writeText(prompt).then(() => {
      const btn = shadowRoot.querySelector(".ja-btn-copy-prompt");
      if (btn) { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy Prompt"; }, 2000); }
    });
  });

  if (backEl) {
    backEl.style.display = "flex";
    shadowRoot.querySelector(".ja-btn-back-cover2")?.addEventListener("click", () => {
      if (currentResult) showResult(currentResult);
      else removeOverlay();
    });
  }
}

// ─── Missing Skills ──────────────────────────────────────────────

function renderMissingSkills(skills) {
  if (!skills || skills.length === 0) return "";
  const items = skills.map((skill, i) => `
    <li class="ja-missing-item" data-skill="${escHtml(skill)}" data-idx="${i}">
      <span class="ja-missing-text">${escHtml(skill)}</span>
      <button class="ja-skill-btn ja-skill-add" data-idx="${i}" title="Add to your profile">+ Add</button>
      <button class="ja-skill-btn ja-skill-undo" data-idx="${i}" title="Remove from profile" style="display:none">Undo</button>
    </li>
  `).join("");
  return `
    <div class="ja-section ja-collapsible ja-missing">
      <div class="ja-section-header">
        <span>&#10060; Missing Skills (${skills.length})</span>
        <span class="ja-chevron">&#9656;</span>
      </div>
      <ul class="ja-section-list ja-missing-list">${items}</ul>
      <div class="ja-missing-hint">Have a skill? Click <strong>+ Add</strong> to add it to your profile.</div>
    </div>
  `;
}

function renderGrowthOpportunities(missingSkills) {
  if (!missingSkills || missingSkills.length === 0) return "";
  const items = missingSkills.map((s) => `<li>&#127919; ${escHtml(s)}</li>`).join("");
  return `
    <div class="ja-section ja-collapsible ja-growth">
      <div class="ja-section-header">
        <span>&#127381; Growth Opportunities</span>
        <span class="ja-chevron">&#9656;</span>
      </div>
      <ul class="ja-section-list">${items}</ul>
      <p class="ja-missing-hint">You're a strong match! Adding these skills could make you an even stronger candidate.</p>
    </div>
  `;
}

function renderAppliedBanner(historyEntry) {
  const statusMap = {
    analyzed: "You already analyzed this job",
    applied: "You applied to this job",
    interviewing: "You are currently interviewing",
    offer: "You received an offer",
    rejected: "You were rejected from this role",
    skipped: "You previously skipped this job",
  };
  const msg = statusMap[historyEntry.status] || "You previously interacted with this job";
  const date = historyEntry.timestamp ? new Date(historyEntry.timestamp).toLocaleDateString() : "";
  const bgColor = historyEntry.status === "offer" ? "#d1fae5" :
                  historyEntry.status === "rejected" ? "#fee2e2" :
                  historyEntry.status === "interviewing" ? "#fef9c3" : "#e0e7ff";

  return `
    <div class="ja-applied-banner" style="background:${bgColor}">
      <span>&#128338;</span>
      <div>
        <strong>${msg}</strong>${date ? ` on ${date}` : ""}
        <br><span class="ja-muted">Status: ${historyEntry.status}</span>
      </div>
    </div>
  `;
}

function renderHistoryBanner(result) {
  // Prefer definitive statuses (applied/interviewing/offer/rejected/skipped). If not present, show "analyzed" when we have prior history.
  const already = result?._alreadyApplied && typeof result._alreadyApplied === "object" ? result._alreadyApplied : null;
  if (already) return renderAppliedBanner(already);

  const prior = result?._priorHistory && typeof result._priorHistory === "object" ? result._priorHistory : null;
  const st = prior?.status || prior?.action;
  if (!prior || !st) return "";
  if (st !== "analyzed" && st !== "skipped" && st !== "applied" && st !== "interviewing" && st !== "offer" && st !== "rejected") return "";

  // If it's analyzed, show it as a gentle FYI instead of the stronger "already applied" banner.
  return renderAppliedBanner({ ...prior, status: st });
}

function setupMissingSkillActions(root) {
  root.querySelectorAll(".ja-skill-add").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const li = btn.closest(".ja-missing-item");
      const skill = li.dataset.skill;
      if (!skill) return;

      const resp = await sendMessage(MSG.GET_PROFILE);
      const profile = resp.success ? resp.data || {} : {};
      const skills = profile.skills || {};

      const otherKey = Object.keys(skills).find((k) => k.toLowerCase().includes("other")) || "Other";
      if (!Array.isArray(skills[otherKey])) skills[otherKey] = [];

      if (!skills[otherKey].some((s) => s.toLowerCase() === skill.toLowerCase())) {
        skills[otherKey].push(skill);
        profile.skills = skills;
        const allSkills = Object.values(skills).flat();
        profile.skillsText = allSkills.join(", ");
        await sendMessage(MSG.SAVE_PROFILE, profile);
      }

      // Animate out and remove the skill item
      li.style.transition = "all 0.3s ease";
      li.style.opacity = "0";
      li.style.maxHeight = li.offsetHeight + "px";
      await new Promise((r) => setTimeout(r, 50));
      li.style.maxHeight = "0";
      li.style.padding = "0";
      li.style.margin = "0";
      li.style.overflow = "hidden";

      setTimeout(() => {
        li.remove();

        // Update the missing skills count in the header
        const list = root.querySelector(".ja-missing-list");
        const remaining = list ? list.querySelectorAll(".ja-missing-item").length : 0;
        const sectionHeader = root.querySelector(".ja-missing .ja-section-header span:first-child");
        if (sectionHeader) {
          sectionHeader.textContent = `❌ Missing Skills (${remaining})`;
        }

        // If all skills added, show success state
        if (remaining === 0) {
          const section = root.querySelector(".ja-missing");
          if (section) {
            section.innerHTML = `<div class="ja-all-skills-added">&#9989; All missing skills added to your profile!</div>`;
          }
        }

        // Update currentResult and score
        if (currentResult) {
          currentResult.missing_skills = (currentResult.missing_skills || []).filter(
            (s) => s.toLowerCase() !== skill.toLowerCase(),
          );
          currentResult.match_score = computeAdjustedScore();

          // Update the score display in-place without re-rendering
          const scoreVal = root.querySelector(".ja-score-value");
          const scoreFill = root.querySelector(".ja-score-fill");
          if (scoreVal) scoreVal.textContent = `${currentResult.match_score}%`;
          if (scoreFill) scoreFill.style.width = `${currentResult.match_score}%`;
        }
      }, 350);
    });
  });

  root.querySelectorAll(".ja-skill-undo").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const li = btn.closest(".ja-missing-item");
      const skill = li.dataset.skill;
      if (!skill) return;

      const resp = await sendMessage(MSG.GET_PROFILE);
      const profile = resp.success ? resp.data || {} : {};
      const skills = profile.skills || {};

      for (const key of Object.keys(skills)) {
        if (Array.isArray(skills[key])) {
          skills[key] = skills[key].filter((s) => s.toLowerCase() !== skill.toLowerCase());
        }
      }
      profile.skills = skills;
      const allSkills = Object.values(skills).flat();
      profile.skillsText = allSkills.join(", ");
      await sendMessage(MSG.SAVE_PROFILE, profile);

      if (currentResult && baselineResult) {
        const baseList = baselineResult.missing_skills || [];
        const hasInBase = baseList.some((s) => s.toLowerCase() === skill.toLowerCase());
        if (hasInBase && !(currentResult.missing_skills || []).some((s) => s.toLowerCase() === skill.toLowerCase())) {
          currentResult.missing_skills = [...(currentResult.missing_skills || []), skill];
        }
        currentResult.match_score = computeAdjustedScore();
        showResult(currentResult, { preserveBaseline: true });
      }
    });
  });
}

function renderSection(title, items, className, icon) {
  if (!items || items.length === 0) return "";
  const listItems = items.map((item) => `<li>${escHtml(item)}</li>`).join("");
  return `
    <div class="ja-section ja-collapsible ${className}">
      <div class="ja-section-header">
        <span>${icon} ${escHtml(title)} (${items.length})</span>
        <span class="ja-chevron">&#9656;</span>
      </div>
      <ul class="ja-section-list">${listItems}</ul>
    </div>
  `;
}

function setupCollapsibles(root) {
  root.querySelectorAll(".ja-collapsible .ja-section-header").forEach((header) => {
    header.addEventListener("click", () => {
      const section = header.closest(".ja-collapsible");
      section.classList.toggle("ja-expanded");
    });
  });
}

function animateScore(root, target, scoreClass) {
  const valueEl = root.querySelector(".ja-score-value");
  const fillEl = root.querySelector(".ja-score-fill");
  if (!valueEl || !fillEl) return;

  let current = 0;
  fillEl.style.width = "0%";

  const interval = setInterval(() => {
    current += 1;
    if (current > target) {
      clearInterval(interval);
      return;
    }
    valueEl.textContent = `${current}%`;
    fillEl.style.width = `${current}%`;
  }, 12);
}

function extractFileInputLabel(el) {
  const attachmentField = el.closest?.(".attachmentField");
  if (attachmentField) {
    const label = attachmentField.querySelector("label");
    if (label?.textContent?.trim()) return label.textContent.trim();
  }
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.textContent.trim();
  }
  const parent = el.closest("label");
  if (parent) return parent.textContent.trim();
  const prev = el.previousElementSibling;
  if (prev && prev.textContent.trim().length < 100) return prev.textContent.trim();
  return "Resume Upload";
}

function escHtml(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

function computeAdjustedScore() {
  const baseScore = Number(baselineResult?.match_score) || Number(currentResult?.match_score) || 0;
  const baseMissing = Array.isArray(baselineResult?.missing_skills) ? baselineResult.missing_skills.length : 0;
  const nowMissing = Array.isArray(currentResult?.missing_skills) ? currentResult.missing_skills.length : 0;

  if (baseMissing <= 0) return clampScore(baseScore);

  const resolved = Math.max(0, baseMissing - nowMissing);
  const bonus = Math.round((resolved / baseMissing) * 20);
  return clampScore(baseScore + bonus);
}

function clampScore(n) {
  return Math.max(0, Math.min(100, Number(n) || 0));
}
