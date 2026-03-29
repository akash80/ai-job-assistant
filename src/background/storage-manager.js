import { STORAGE_KEYS } from "../shared/constants.js";

export async function getFromStorage(key) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? null;
}

export async function saveToStorage(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

export async function removeFromStorage(key) {
  await chrome.storage.local.remove(key);
}

export async function getProfile() {
  return (await getFromStorage(STORAGE_KEYS.PROFILE)) || {};
}

export async function saveProfile(profile) {
  await saveToStorage(STORAGE_KEYS.PROFILE, profile);
}

export async function getResume() {
  return (await getFromStorage(STORAGE_KEYS.RESUME)) || null;
}

export async function saveResume(resumeData) {
  await saveToStorage(STORAGE_KEYS.RESUME, {
    ...resumeData,
    parsedAt: new Date().toISOString(),
    wordCount: resumeData.rawText ? resumeData.rawText.split(/\s+/).length : 0,
  });
}

export async function getResumePdf() {
  return (await getFromStorage(STORAGE_KEYS.RESUME_PDF)) || null;
}

export async function saveResumePdf(pdfData) {
  await saveToStorage(STORAGE_KEYS.RESUME_PDF, pdfData);
}

export async function removeResumePdf() {
  await removeFromStorage(STORAGE_KEYS.RESUME_PDF);
}

export async function getAnswers() {
  return (await getFromStorage(STORAGE_KEYS.ANSWERS)) || {};
}

export async function saveAnswer(key, value, label, source = "form_prompt") {
  const answers = await getAnswers();
  answers[key] = {
    value,
    label,
    usedCount: (answers[key]?.usedCount || 0) + 1,
    lastUsed: new Date().toISOString(),
    createdAt: answers[key]?.createdAt || new Date().toISOString(),
    source,
  };
  await saveToStorage(STORAGE_KEYS.ANSWERS, answers);
}

export async function deleteAnswer(key) {
  const answers = await getAnswers();
  delete answers[key];
  await saveToStorage(STORAGE_KEYS.ANSWERS, answers);
}

const DEFAULT_PREFERENCES = {
  remote: null,
  hybridOk: true,
  minSalary: "",
  maxSalary: "",
  salaryCurrency: "USD",
  /** Multiply USD amounts to show in salaryCurrency (1 when USD). */
  usdToDisplayCurrencyFactor: 1,
  /** Raw JSON string from the AI exchange-rate response (persisted). */
  currencyFactorRawResponse: null,
  currencyFactorFetchedAt: null,
  preferredRoles: [],
  excludedRoles: [],
  preferredLocations: [],
  willingToRelocate: false,
  preferredCompanySize: "any",
  skipPatterns: [],
};

export async function getPreferences() {
  const stored = await getFromStorage(STORAGE_KEYS.PREFERENCES);
  if (!stored) return { ...DEFAULT_PREFERENCES };
  return { ...DEFAULT_PREFERENCES, ...stored };
}

export async function savePreferences(prefs) {
  await saveToStorage(STORAGE_KEYS.PREFERENCES, prefs);
}

export async function getApiConfig() {
  const { DEFAULT_API_CONFIG } = await import("../shared/constants.js");
  return (await getFromStorage(STORAGE_KEYS.API_CONFIG)) || { ...DEFAULT_API_CONFIG };
}

export async function saveApiConfig(config) {
  await saveToStorage(STORAGE_KEYS.API_CONFIG, config);
}

export async function getHistory() {
  return (await getFromStorage(STORAGE_KEYS.HISTORY)) || [];
}

export async function logApplication(entry) {
  const { HISTORY_MAX_ENTRIES } = await import("../shared/constants.js");
  const history = await getHistory();
  history.unshift({
    ...entry,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    timestamp: new Date().toISOString(),
  });
  if (history.length > HISTORY_MAX_ENTRIES) {
    history.length = HISTORY_MAX_ENTRIES;
  }
  await saveToStorage(STORAGE_KEYS.HISTORY, history);
}

export async function exportAllData() {
  const profile = await getProfile();
  const resume = await getResume();
  const answers = await getAnswers();
  const preferences = await getPreferences();
  const history = await getHistory();

  return {
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    data: { profile, resume, answers, preferences, history },
  };
}

export async function importData(data) {
  if (data.data.profile) await saveProfile(data.data.profile);
  if (data.data.resume) await saveToStorage(STORAGE_KEYS.RESUME, data.data.resume);
  if (data.data.answers) await saveToStorage(STORAGE_KEYS.ANSWERS, data.data.answers);
  if (data.data.preferences) await savePreferences(data.data.preferences);
  if (data.data.history) await saveToStorage(STORAGE_KEYS.HISTORY, data.data.history);
}

export async function clearAllData() {
  await chrome.storage.local.clear();
}
