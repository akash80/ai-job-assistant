/** @jest-environment node */

describe("background/ai-router", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("getAvailableProviders reflects configured keys", async () => {
    const { getAvailableProviders } = await import("../src/background/ai-router.js");
    expect(getAvailableProviders({ apiKey: "x" })).toEqual({ openai: true, perplexity: false, anthropic: false, gemini: false });
    expect(getAvailableProviders({ perplexityKey: "p" })).toEqual({ openai: false, perplexity: true, anthropic: false, gemini: false });
    expect(getAvailableProviders({ anthropicKey: "a" })).toEqual({ openai: false, perplexity: false, anthropic: true, gemini: false });
    expect(getAvailableProviders({ geminiKey: "g" })).toEqual({ openai: false, perplexity: false, anthropic: false, gemini: true });
    expect(getAvailableProviders({ apiKey: "x", perplexityKey: "p", anthropicKey: "a", geminiKey: "g" })).toEqual({ openai: true, perplexity: true, anthropic: true, gemini: true });
  });

  test("getAnalysisModelId reflects provider preference order", async () => {
    const { getAnalysisModelId } = await import("../src/background/ai-router.js");
    expect(getAnalysisModelId({ apiKey: "k", model: "m1", anthropicKey: "a", anthropicModel: "m2", geminiKey: "g", geminiModel: "m4", perplexityKey: "p", perplexityModel: "m3" })).toBe("m1");
    expect(getAnalysisModelId({ anthropicKey: "a", anthropicModel: "m2", geminiKey: "g", geminiModel: "m4", perplexityKey: "p", perplexityModel: "m3", model: "fallback" })).toBe("m2");
    expect(getAnalysisModelId({ geminiKey: "g", geminiModel: "m4", perplexityKey: "p", perplexityModel: "m3", model: "fallback" })).toBe("m4");
    expect(getAnalysisModelId({ perplexityKey: "p", perplexityModel: "m3", model: "fallback" })).toBe("m3");
  });

  test("getParseResumeModelId and getCoverLetterModelId mirror analysis model id", async () => {
    const { getParseResumeModelId, getCoverLetterModelId } = await import("../src/background/ai-router.js");
    expect(getParseResumeModelId({ apiKey: "k", model: "m1" })).toBe("m1");
    expect(getCoverLetterModelId({ perplexityKey: "k", perplexityModel: "sonar", model: "fallback" })).toBe("sonar");
  });

  test("routeAnalyzeJob throws NO_PROVIDER when no keys configured", async () => {
    const { routeAnalyzeJob } = await import("../src/background/ai-router.js");
    await expect(routeAnalyzeJob("j", "r", {})).rejects.toMatchObject({ code: "NO_PROVIDER" });
  });

  test("routeFindJobs requires Perplexity", async () => {
    const router = await import("../src/background/ai-router.js");
    await expect(router.routeFindJobs({}, {}, { apiKey: "x" })).rejects.toMatchObject({ code: "NO_PERPLEXITY" });
  });

  test("routeGenerateTailoredResume requires OpenAI for now", async () => {
    const router = await import("../src/background/ai-router.js");
    await expect(router.routeGenerateTailoredResume({ schemaVersion: 1 }, { })).rejects.toMatchObject({ code: "NO_PROVIDER" });
  });
});

