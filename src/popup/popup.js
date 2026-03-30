import { MSG } from "../shared/constants.js";
import { formatUsdInPreferenceCurrency } from "../shared/currency-format.js";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const config = await sendMsg(MSG.GET_API_CONFIG);
  const resume = await sendMsg(MSG.GET_RESUME);
  const hasKey = config.success && config.data?.apiKey;
  const hasResume = resume.success && resume.data?.rawText;

  if (!hasKey || !hasResume) {
    showSetup(hasKey, hasResume);
  } else {
    await showReady(config.data, resume.data);
  }

  document.getElementById("btn-open-settings")?.addEventListener("click", openSettings);
  document.getElementById("btn-settings")?.addEventListener("click", openSettings);
  document.getElementById("btn-analyze")?.addEventListener("click", triggerAnalysis);
  document.getElementById("btn-fill-form")?.addEventListener("click", triggerFillForm);
  document.getElementById("btn-history")?.addEventListener("click", openHistory);
}

function showSetup(hasKey, hasResume) {
  document.getElementById("setup-required").style.display = "block";
  document.getElementById("ready-state").style.display = "none";

  const apiCheck = document.getElementById("check-apikey");
  const resumeCheck = document.getElementById("check-resume");

  if (hasKey) {
    apiCheck.classList.add("check-done");
    apiCheck.querySelector(".check-icon").innerHTML = "&#9745;";
  }
  if (hasResume) {
    resumeCheck.classList.add("check-done");
    resumeCheck.querySelector(".check-icon").innerHTML = "&#9745;";
  }
}

async function showReady(config, resume) {
  document.getElementById("setup-required").style.display = "none";
  document.getElementById("ready-state").style.display = "block";

  document.getElementById("status-model").textContent = config.model || "gpt-4.1-mini";
  document.getElementById("status-resume").textContent = resume ? "Uploaded" : "Missing";

  const dotResume = document.getElementById("dot-resume");
  if (resume?.rawText) {
    dotResume.classList.add("status-ok");
  } else {
    dotResume.classList.add("status-warn");
  }

  const prefsResp = await sendMsg(MSG.GET_PREFERENCES);
  const prefs = prefsResp.success && prefsResp.data ? prefsResp.data : {};

  const usage = await sendMsg(MSG.GET_USAGE_STATS);
  if (usage.success && usage.data?.today) {
    const t = usage.data.today;
    document.getElementById("stat-calls").textContent = t.calls || 0;
    document.getElementById("stat-tokens").textContent = formatNum(t.tokens || 0);
    document.getElementById("stat-cost").textContent = formatUsdInPreferenceCurrency(t.estimatedCost || 0, prefs);
  }

  if (usage.success && usage.data?.all) {
    document.getElementById("stat-cache").textContent = usage.data.all.cacheHits || 0;
  }
}

async function triggerAnalysis() {
  const btn = document.getElementById("btn-analyze");
  btn.disabled = true;
  btn.textContent = "Analyzing...";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_ANALYSIS" });
    }
  } catch (err) {
    console.error("Failed to trigger analysis:", err);
  }

  setTimeout(() => window.close(), 500);
}

async function triggerFillForm() {
  const btn = document.getElementById("btn-fill-form");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Opening...";
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_FILL_FORM" });
    }
  } catch (err) {
    console.error("Failed to trigger fill form:", err);
  }

  setTimeout(() => window.close(), 500);
}

function openSettings() {
  chrome.runtime.openOptionsPage
    ? chrome.runtime.openOptionsPage()
    : window.open(chrome.runtime.getURL("options/options.html"));
}

function openHistory() {
  window.open(chrome.runtime.getURL("options/options.html#history"));
}

async function sendMsg(type, payload = {}) {
  try {
    return await chrome.runtime.sendMessage({ type, payload });
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function formatNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}
