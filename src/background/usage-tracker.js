import { STORAGE_KEYS, COST_PER_1K_TOKENS } from "../shared/constants.js";
import { getFromStorage, saveToStorage } from "./storage-manager.js";

export async function trackUsage(model, usage) {
  const stats = await getUsageStats();
  const today = new Date().toISOString().slice(0, 10);
  const cost = estimateCostForUsage(model, usage);

  stats.totalCalls += 1;
  stats.totalTokens += usage.total_tokens || 0;
  stats.totalPromptTokens += usage.prompt_tokens || 0;
  stats.totalCompletionTokens += usage.completion_tokens || 0;

  if (!stats.dailyStats[today]) {
    stats.dailyStats[today] = {
      calls: 0,
      tokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCost: 0,
    };
  }

  stats.dailyStats[today].calls += 1;
  stats.dailyStats[today].tokens += usage.total_tokens || 0;
  stats.dailyStats[today].promptTokens += usage.prompt_tokens || 0;
  stats.dailyStats[today].completionTokens += usage.completion_tokens || 0;
  stats.dailyStats[today].estimatedCost += cost;

  cleanOldDailyStats(stats);
  await saveToStorage(STORAGE_KEYS.USAGE_STATS, stats);
}

export async function trackCacheHit() {
  const stats = await getUsageStats();
  stats.cacheHits += 1;
  await saveToStorage(STORAGE_KEYS.USAGE_STATS, stats);
}

export async function getUsageStats() {
  return (
    (await getFromStorage(STORAGE_KEYS.USAGE_STATS)) || {
      totalCalls: 0,
      totalTokens: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      cacheHits: 0,
      dailyStats: {},
    }
  );
}

export async function getTodayStats() {
  const stats = await getUsageStats();
  const today = new Date().toISOString().slice(0, 10);
  return stats.dailyStats[today] || {
    calls: 0,
    tokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    estimatedCost: 0,
  };
}

function estimateCostForUsage(model, usage) {
  const costs = COST_PER_1K_TOKENS[model];
  if (!costs) return 0;
  const promptCost = ((usage.prompt_tokens || 0) / 1000) * costs.prompt;
  const completionCost = ((usage.completion_tokens || 0) / 1000) * costs.completion;
  return promptCost + completionCost;
}

function cleanOldDailyStats(stats) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  for (const date of Object.keys(stats.dailyStats)) {
    if (date < cutoffStr) {
      delete stats.dailyStats[date];
    }
  }
}
