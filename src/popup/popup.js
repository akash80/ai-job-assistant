import { MSG } from "../shared/constants.js";
import { formatUsdInPreferenceCurrency } from "../shared/currency-format.js";

document.addEventListener("DOMContentLoaded", init);

let deepLinkToSecurity = false;

async function init() {
  const status = await sendMsg(MSG.GET_API_STATUS);
  const resume = await sendMsg(MSG.GET_RESUME);
  const hasKey = status.success && status.data?.hasAnyKey;
  const hasResume = resume.success && resume.data?.rawText;

  const securityLocked = status.success && status.data?.securityEnabled === true && status.data?.securityLocked === true;
  deepLinkToSecurity = securityLocked;

  if (securityLocked || !hasKey || !hasResume) {
    showSetup(hasKey, hasResume, securityLocked);
  } else {
    await showReady(status.data, resume.data);
  }

  document.getElementById("btn-open-settings")?.addEventListener("click", openSettings);
  document.getElementById("btn-settings")?.addEventListener("click", openSettings);
  document.getElementById("btn-analyze")?.addEventListener("click", triggerAnalysis);
  document.getElementById("btn-fill-form")?.addEventListener("click", triggerFillForm);
  document.getElementById("btn-smart-fill-form")?.addEventListener("click", triggerSmartFillForm);
  document.getElementById("btn-show-panel")?.addEventListener("click", triggerShowPanel);
  document.getElementById("btn-history")?.addEventListener("click", openHistory);
}

function showSetup(hasKey, hasResume, securityLocked = false) {
  document.getElementById("setup-required").style.display = "block";
  document.getElementById("ready-state").style.display = "none";

  const apiCheck = document.getElementById("check-apikey");
  const resumeCheck = document.getElementById("check-resume");

  if (securityLocked) {
    apiCheck.innerHTML = '<span class="check-icon">&#9744;</span> Unlock API keys (Security mode)';
  }

  if (hasKey) {
    apiCheck.classList.add("check-done");
    apiCheck.querySelector(".check-icon").innerHTML = "&#9745;";
  }
  if (hasResume) {
    resumeCheck.classList.add("check-done");
    resumeCheck.querySelector(".check-icon").innerHTML = "&#9745;";
  }
}

async function showReady(status, resume) {
  document.getElementById("setup-required").style.display = "none";
  document.getElementById("ready-state").style.display = "block";

  const apiLabel = status?.securityEnabled && status?.securityLocked ? "Locked" : "Configured";
  document.getElementById("status-api").textContent = apiLabel;

  // Show the OpenAI model if configured; otherwise show a generic ready state.
  document.getElementById("status-model").textContent = status?.openaiModel || status?.anthropicModel || status?.geminiModel || status?.perplexityModel || "Configured";
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
  hideActionMessage();
  btn.disabled = true;
  btn.textContent = "Analyzing...";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const injected = await ensureContentReady(tab);
      if (!injected) {
        resetAnalyzeButton();
        return;
      }
      await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_ANALYSIS" });
    }
  } catch (err) {
    console.error("Failed to trigger analysis:", err);
    showActionMessage("Could not start analysis on this page. Please refresh and try again.");
    resetAnalyzeButton();
    return;
  }

  setTimeout(() => window.close(), 500);
}

async function triggerFillForm() {
  const btn = document.getElementById("btn-fill-form");
  hideActionMessage();
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Opening...";
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const injected = await ensureContentReady(tab);
      if (!injected) {
        resetFillButton();
        return;
      }
      await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_FILL_FORM" });
    }
  } catch (err) {
    console.error("Failed to trigger fill form:", err);
    showActionMessage("Could not open fill assist on this page. Please refresh and try again.");
    resetFillButton();
    return;
  }

  setTimeout(() => window.close(), 500);
}

async function triggerSmartFillForm() {
  const btn = document.getElementById("btn-smart-fill-form");
  hideActionMessage();
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Opening...";
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const injected = await ensureContentReady(tab);
      if (!injected) {
        resetSmartFillButton();
        return;
      }
      await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_SMART_FILL_FORM" });
    }
  } catch (err) {
    console.error("Failed to trigger smart fill form:", err);
    showActionMessage("Could not open smart fill assist on this page. Please refresh and try again.");
    resetSmartFillButton();
    return;
  }

  setTimeout(() => window.close(), 500);
}

async function triggerShowPanel() {
  hideActionMessage();
  const btn = document.getElementById("btn-show-panel");
  if (btn) {
    btn.disabled = true;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      showActionMessage("No active tab.");
      resetShowPanelButton();
      return;
    }
    const injected = await ensureContentReady(tab);
    if (!injected) {
      resetShowPanelButton();
      return;
    }
    const resp = await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_SHOW_PANEL" });
    if (resp?.opened) {
      setTimeout(() => window.close(), 300);
      return;
    }
    showActionMessage("No hidden panel on this tab. Use Analyze or Fill Form first, then hide the panel with the header ×.");
  } catch (err) {
    console.error("Failed to show panel:", err);
    showActionMessage("Could not reach this page. Refresh the tab and try again.");
  }

  resetShowPanelButton();
}

function openSettings() {
  const hash = deepLinkToSecurity ? "#security" : "";
  const url = chrome.runtime.getURL(`options/options.html${hash}`);
  deepLinkToSecurity = false;

  if (chrome.runtime.openOptionsPage && !hash) {
    chrome.runtime.openOptionsPage();
    return;
  }
  window.open(url);
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

async function ensureContentReady(tab) {
  // activeTab does not allow injecting into browser internal pages.
  if (!isInjectableUrl(tab?.url || "")) {
    showActionMessage("This page is restricted. Open a normal website page and try again.");
    return false;
  }

  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["content/content.css"],
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content/content.js"],
    });
  } catch (err) {
    console.warn("Failed to inject content scripts:", err);
    showActionMessage("Unable to run on this page. Try refreshing the tab first.");
    return false;
  }

  return true;
}

function isInjectableUrl(url) {
  return /^https?:\/\//i.test(url);
}

function showActionMessage(message) {
  const el = document.getElementById("action-message");
  if (!el) return;
  el.textContent = message;
  el.style.display = "block";
}

function hideActionMessage() {
  const el = document.getElementById("action-message");
  if (!el) return;
  el.textContent = "";
  el.style.display = "none";
}

function resetAnalyzeButton() {
  const btn = document.getElementById("btn-analyze");
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML = "<span>&#128202;</span> Analyze This Page";
}

function resetFillButton() {
  const btn = document.getElementById("btn-fill-form");
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML = "<span>&#9997;&#65039;</span> Fill Form";
}

function resetSmartFillButton() {
  const btn = document.getElementById("btn-smart-fill-form");
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML = "<span>&#129302;</span> Smart Form Fill";
}

function resetShowPanelButton() {
  const btn = document.getElementById("btn-show-panel");
  if (!btn) return;
  btn.disabled = false;
  btn.innerHTML = "<span>&#128470;&#65039;</span> Show Assistant Panel";
}

function formatNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}
