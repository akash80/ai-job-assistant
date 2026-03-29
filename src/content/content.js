import { sendMessage, debounce } from "../shared/utils.js";
import { MSG, ANALYSIS_DEBOUNCE_MS } from "../shared/constants.js";
import { extractJobText, isLikelyJobPage, getPageMeta } from "./extractor.js";
import { PageObserver } from "./observer.js";
import { showLoading, showResult, showError, removeOverlay } from "./overlay.js";

let analyzed = false;
let currentHash = null;

async function init() {
  const config = await sendMessage(MSG.GET_API_CONFIG);
  if (!config.success || !config.data.apiKey) return;

  if (isLikelyJobPage()) {
    setTimeout(() => analyzeCurrentPage(), ANALYSIS_DEBOUNCE_MS);
  }

  const observer = new PageObserver(() => {
    analyzed = false;
    currentHash = null;
    removeOverlay();
    if (isLikelyJobPage()) {
      setTimeout(() => analyzeCurrentPage(), ANALYSIS_DEBOUNCE_MS);
    }
  });
  observer.start();

  document.addEventListener("ja-retry-analysis", () => {
    analyzed = false;
    currentHash = null;
    analyzeCurrentPage();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "TRIGGER_ANALYSIS") {
      analyzed = false;
      currentHash = null;
      analyzeCurrentPage();
      sendResponse({ success: true });
    }
    return false;
  });
}

async function analyzeCurrentPage() {
  if (analyzed) return;
  analyzed = true;

  const jobText = extractJobText();
  if (jobText.length < 100) return;

  showLoading();

  const response = await sendMessage(MSG.ANALYZE_JOB, {
    jobText,
    pageUrl: window.location.href,
  });

  if (response.success) {
    showResult(response.data);
  } else {
    showError(response.error || "Something went wrong.");
  }
}

init();
