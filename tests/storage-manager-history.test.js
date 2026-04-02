/** @jest-environment jsdom */

describe("background/storage-manager history", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-02T00:00:00.000Z"));

    global.chrome.storage.local.get.mockImplementation(async (key) => {
      if (key === "history") return { history: [] };
      return {};
    });
    global.chrome.storage.local.set.mockImplementation(async () => {});
    global.chrome.storage.local.remove.mockImplementation(async () => {});
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("logApplication dedupes by job posting key", async () => {
    let stored = { history: [] };
    global.chrome.storage.local.get.mockImplementation(async () => stored);
    global.chrome.storage.local.set.mockImplementation(async (obj) => { stored = { ...stored, ...obj }; });

    const { logApplication, getHistory } = await import("../src/background/storage-manager.js");
    await logApplication({ url: "https://www.linkedin.com/jobs/view/123456789/", company: "A", jobTitle: "Eng", action: "analyzed", matchScore: 10 });
    await logApplication({ url: "https://www.linkedin.com/jobs/view/123456789/?trk=1", company: "A", jobTitle: "Eng", status: "applied", action: "applied", matchScore: 50 });

    const h = await getHistory();
    expect(h.length).toBe(1);
    expect(h[0].status).toBe("applied");
    expect(Number(h[0].matchScore)).toBe(50);
  });

  test("updateHistoryStatus returns false when id missing", async () => {
    const { updateHistoryStatus } = await import("../src/background/storage-manager.js");
    const ok = await updateHistoryStatus("nope", "applied");
    expect(ok).toBe(false);
  });
});

