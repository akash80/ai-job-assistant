export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function hashContent(text) {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 5000);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

export function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatNumber(num) {
  return new Intl.NumberFormat("en-US").format(num);
}

export function estimateCost(promptTokens, completionTokens, model, costTable) {
  const costs = costTable[model];
  if (!costs) return 0;
  return (promptTokens / 1000) * costs.prompt + (completionTokens / 1000) * costs.completion;
}

export function debounce(fn, delay) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

export function extractDomain(url) {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}

export async function sendMessage(type, payload = {}) {
  try {
    return await chrome.runtime.sendMessage({ type, payload });
  } catch (err) {
    console.error(`Message ${type} failed:`, err);
    return { success: false, error: err.message, code: "MESSAGE_ERROR" };
  }
}
