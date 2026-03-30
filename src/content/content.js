import { sendMessage } from "../shared/utils.js";
import { MSG } from "../shared/constants.js";
import { extractJobText, isLikelyJobPage } from "./extractor.js";
import { PageObserver } from "./observer.js";
import { showLoading, showResult, showError, removeOverlay } from "./overlay.js";

let analyzed = false;

async function init() {
  const config = await sendMessage(MSG.GET_API_CONFIG);
  if (!config.success || !config.data.apiKey) return;

  const observer = new PageObserver(() => {
    analyzed = false;
    removeOverlay();
  });
  observer.start();

  document.addEventListener("ja-retry-analysis", () => {
    analyzed = false;
    analyzeCurrentPage();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "TRIGGER_ANALYSIS") {
      analyzed = false;
      analyzeCurrentPage();
      sendResponse({ success: true });
    }
    return false;
  });
}

async function analyzeCurrentPage() {
  if (analyzed) return;
  if (!isLikelyJobPage()) return;
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
