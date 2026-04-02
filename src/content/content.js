import { sendMessage } from "../shared/utils.js";
import { MSG } from "../shared/constants.js";
import { extractJobTextWithMeta, isLikelyJobPage, extractJobIdentity } from "./extractor.js";
import { PageObserver } from "./observer.js";
import { showLoading, showResult, showError, removeOverlay, startFillAssist, startSmartFillAssist, showExistingOverlay, hydrateJobSession, showContinueChip } from "./overlay.js";
import { detectFields, detectFileInputs } from "./fields/detector.js";
import { buildJobPostingKey, normalizeCompanyTitleKey } from "../shared/utils.js";
import { isLikelyApplicationForm } from "./page-state.js";

if (window.__AI_JOB_ASSISTANT_CONTENT_LOADED__) {
  // Prevent duplicate listeners/observers when script is injected again.
} else {
  window.__AI_JOB_ASSISTANT_CONTENT_LOADED__ = true;

let analyzed = false;
let appliedLogged = false;

// Register listeners immediately so first click after injection works.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "TRIGGER_ANALYSIS") {
    analyzed = false;
    analyzeCurrentPage();
    sendResponse({ success: true });
  } else if (msg.type === "TRIGGER_FILL_FORM") {
    startFillAssist();
    sendResponse({ success: true });
  } else if (msg.type === "TRIGGER_SMART_FILL_FORM") {
    startSmartFillAssist();
    sendResponse({ success: true });
  } else if (msg.type === "TRIGGER_SHOW_PANEL") {
    const opened = showExistingOverlay();
    sendResponse({ success: true, opened });
  }
  return false;
});

document.addEventListener("ja-retry-analysis", () => {
  analyzed = false;
  analyzeCurrentPage();
});

// Triggered from overlay's "Analyze Without AI" button
document.addEventListener("ja-local-analysis", () => {
  analyzed = false;
  analyzeCurrentPage(true);
});

// When the extension is reloaded/updated, existing content scripts can keep running
// but messaging APIs become invalid. Surface a clear instruction instead of spamming errors.
window.addEventListener("ja-extension-context-invalidated", () => {
  showError("The extension was reloaded/updated. Please refresh this page to continue using AI Job Assistant.", false);
});

async function init() {
  // Smart restore on apply forms: look for a matching analyzed job session.
  try {
    const fields = detectFields();
    const files = detectFileInputs();
    const isApplicationForm = isLikelyApplicationForm(fields, files);

    if (isApplicationForm) {
      const sessionsResp = await sendMessage(MSG.GET_JOB_SESSIONS);
      const sessions = sessionsResp.success && Array.isArray(sessionsResp.data) ? sessionsResp.data : [];
      const match = pickBestJobSessionMatch(sessions);
      if (match) {
        const ok = hydrateJobSession(match);
        if (ok) {
          const title = match?.analysis?.job_title || match?.jobTitle || "";
          const company = match?.analysis?.company || match?.company || "";
          const label = company && title ? `Continue: ${company} · ${title}` : title ? `Continue: ${title}` : "Continue last job";
          showContinueChip(label);
        }
      }
    }
  } catch {
    // ignore restore failures
  }

  const observer = new PageObserver(() => {
    analyzed = false;
    removeOverlay();
  });
  observer.start();

  // Best-effort: when a job application form is submitted, mark this job as applied.
  // We prefer a real submit event; if the site doesn't use <form>, the fill flow still logs "analyzed" and the user can update status in History.
  try {
    document.addEventListener("submit", handlePossibleApplicationSubmit, true);
  } catch {
    // ignore listener failures
  }
}

function getPageTitleHints() {
  const title = String(document.title || "").trim();
  const h1 = String(document.querySelector("h1")?.textContent || "").trim();
  const og = String(document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "").trim();
  return [title, h1, og].filter(Boolean).slice(0, 3);
}

function pickBestJobSessionMatch(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) return null;
  const url = window.location.href;
  const postingKey = buildJobPostingKey(url);
  const identity = extractJobIdentity();
  const currentIds = Array.isArray(identity?.jobIds) ? identity.jobIds : [];

  // 1) Strong match: same posting key (jobId-based).
  if (postingKey) {
    const exact = sessions.find((s) => (s.jobPostingKey || buildJobPostingKey(s.url || "")) === postingKey);
    if (exact) return exact;
  }

  // 1b) Strong match: intersecting extracted job IDs (works even when apply URL differs).
  if (currentIds.length > 0) {
    const curSet = new Set(currentIds.map((x) => String(x || "").toLowerCase()));
    const byIds = sessions.find((s) => {
      const ids = Array.isArray(s.jobIds) ? s.jobIds : [];
      const single = s.jobId ? [s.jobId] : [];
      const all = [...ids, ...single].filter(Boolean);
      return all.some((id) => curSet.has(String(id).toLowerCase()));
    });
    if (byIds) return byIds;
  }

  // 2) Heuristic match: company + title tokens appear in page title hints (apply pages often include them).
  const hints = getPageTitleHints().map((t) => normalizeCompanyTitleKey(t)).join(" ");
  if (!hints) return sessions[0];

  let best = null;
  let bestScore = 0;
  for (const s of sessions) {
    const company = normalizeCompanyTitleKey(s.company || s.analysis?.company);
    const title = normalizeCompanyTitleKey(s.jobTitle || s.analysis?.job_title);
    if (!company && !title) continue;
    let score = 0;
    if (company && hints.includes(company)) score += 2;
    if (title && hints.includes(title)) score += 2;
    // partial token overlap
    const toks = `${company} ${title}`.split(" ").filter(Boolean);
    const overlap = toks.filter((tok) => tok.length >= 4 && hints.includes(tok)).length;
    score += Math.min(3, overlap * 0.5);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return bestScore >= 2 ? best : sessions[0];
}

async function analyzeCurrentPage(forceLocal = false) {
  if (analyzed) return;
  if (!isLikelyJobPage()) return;
  analyzed = true;

  const extracted = extractJobTextWithMeta();
  const jobText = extracted.text;
  const jobTextTruncated = extracted.truncated === true;
  if (jobText.length < 100) return;
  const identity = extractJobIdentity();

  showLoading();

  const response = await sendMessage(MSG.ANALYZE_JOB, {
    jobText,
    pageUrl: window.location.href,
    forceLocal,
    jobIds: identity?.jobIds || [],
    pageTitleHints: identity?.titleCandidates || [],
    pageCompanyHints: identity?.companyCandidates || [],
  });

  if (response.success) {
    const result = response.data;

    // Check if user already applied/interacted with this job
    const historyCheck = await sendMessage(MSG.CHECK_ALREADY_APPLIED, {
      url: window.location.href,
      company: result.company,
      jobTitle: result.job_title,
      jobIds: identity?.jobIds || [],
    });

    if (historyCheck.success && historyCheck.data) {
      result._alreadyApplied = historyCheck.data;
    }

    const priorMatch = await sendMessage(MSG.FIND_HISTORY_JOB_MATCH, {
      url: window.location.href,
      company: result.company,
      jobTitle: result.job_title,
      jobIds: identity?.jobIds || [],
    });
    if (priorMatch.success && priorMatch.data) {
      result._priorHistory = priorMatch.data;
    }
    const priorStatus =
      priorMatch.success && priorMatch.data ? priorMatch.data.status || priorMatch.data.action : null;
    const skipAnalyzedLog =
      result.cached === true && (priorStatus === "analyzed" || priorStatus === "skipped");

    // Log as "analyzed" (merges into one row per job; upgraded when you apply/skip)
    if (!result._alreadyApplied && !skipAnalyzedLog) {
      await sendMessage(MSG.LOG_APPLICATION, {
        url: window.location.href,
        domain: window.location.hostname,
        jobTitle: result.job_title,
        company: result.company,
        jobIds: identity?.jobIds || [],
        matchScore: result.match_score,
        action: "analyzed",
        status: "analyzed",
        recommendation: result.recommendation,
        fieldsAutoFilled: 0,
        fieldsManual: 0,
      });
    }

    // Persist session so apply flows on a different URL can continue.
    try {
      await sendMessage(MSG.SAVE_JOB_SESSION, {
        url: window.location.href,
        jobPostingKey: buildJobPostingKey(window.location.href),
        jobIds: identity?.jobIds || [],
        analysis: result,
        jobText,
        jobTextTruncated,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // ignore
    }

    showResult(result, { jobText, jobTextTruncated });
  } else {
    showError(response.error || "Something went wrong.");
  }
}

init();
}

async function handlePossibleApplicationSubmit() {
  if (appliedLogged) return;
  appliedLogged = true;

  try {
    const sessionsResp = await sendMessage(MSG.GET_JOB_SESSIONS);
    const sessions = sessionsResp.success && Array.isArray(sessionsResp.data) ? sessionsResp.data : [];
    const match = pickBestJobSessionMatch(sessions);
    const analysis = match?.analysis && typeof match.analysis === "object" ? match.analysis : null;
    const jobIds = Array.isArray(match?.jobIds) ? match.jobIds : (match?.jobId ? [match.jobId] : []);

    await sendMessage(MSG.LOG_APPLICATION, {
      url: window.location.href,
      domain: window.location.hostname,
      jobTitle: analysis?.job_title || match?.jobTitle || "",
      company: analysis?.company || match?.company || "",
      jobIds,
      matchScore: Number(analysis?.match_score) || 0,
      action: "applied",
      status: "applied",
      recommendation: analysis?.recommendation || "",
      fieldsAutoFilled: 0,
      fieldsManual: 0,
    });
  } catch {
    // ignore submit tracking failures
  } finally {
    // allow re-log after a while in case the page uses multiple internal submit steps
    setTimeout(() => { appliedLogged = false; }, 15000);
  }
}
