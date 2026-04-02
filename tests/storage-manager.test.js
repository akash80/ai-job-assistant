/** @jest-environment jsdom */

describe("background/storage-manager", () => {
  beforeEach(() => {
    global.chrome.storage.local.get.mockImplementation(async (key) => ({}));
    global.chrome.storage.local.set.mockImplementation(async () => {});
    global.chrome.storage.local.remove.mockImplementation(async () => {});
  });

  test("getApiConfig returns DEFAULT_API_CONFIG when nothing stored", async () => {
    const { getApiConfig } = await import("../src/background/storage-manager.js");
    const cfg = await getApiConfig();
    expect(cfg).toMatchObject({
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
    });
  });

  test("saveAnswer increments usedCount", async () => {
    global.chrome.storage.local.get.mockImplementation(async () => ({ answers: {} }));
    let saved;
    global.chrome.storage.local.set.mockImplementation(async (obj) => { saved = obj; });

    const { saveAnswer } = await import("../src/background/storage-manager.js");
    await saveAnswer("sponsorship", "No", "Sponsorship", "form_prompt");
    expect(saved.answers.sponsorship.usedCount).toBe(1);

    global.chrome.storage.local.get.mockImplementation(async () => saved);
    await saveAnswer("sponsorship", "No", "Sponsorship", "form_prompt");
    expect(saved.answers.sponsorship.usedCount).toBe(2);
  });

  test("exportAllData never includes apiConfig or any keys", async () => {
    global.chrome.storage.local.get.mockImplementation(async (key) => {
      const map = {
        apiConfig: { apiKey: "sk-should-not-export", anthropicKey: "sk-ant-should-not-export", perplexityKey: "pplx-should-not-export" },
        profile: { name: "A" },
        resume: { rawText: "resume" },
        answers: {},
        preferences: {},
        history: [],
        findJobsCache: null,
      };
      return key ? { [key]: map[key] } : map;
    });

    const { exportAllData } = await import("../src/background/storage-manager.js");
    const exported = await exportAllData();
    const str = JSON.stringify(exported);
    expect(str).not.toContain("apiConfig");
    expect(str).not.toContain("sk-should-not-export");
    expect(str).not.toContain("sk-ant-should-not-export");
    expect(str).not.toContain("pplx-should-not-export");
  });
});

