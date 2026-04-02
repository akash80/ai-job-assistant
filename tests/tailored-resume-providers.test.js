/** @jest-environment node */

function mockFetchOkJson(payload) {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => payload,
  }));
}

function minimalTailoredResumeJson() {
  return {
    schemaVersion: 1,
    meta: { generatedAt: "2026-01-01T00:00:00.000Z", model: "x", warnings: [] },
    basics: { name: "Jane Doe", email: "", phone: "", location: "", links: {} },
    headline: "Software Engineer",
    summaryBullets: ["Built systems"],
    skills: { categories: { Core: ["JavaScript"] }, topKeywords: ["JavaScript"] },
    experience: [{ title: "Engineer", company: "ACME", location: "", startDate: "", endDate: "", bullets: ["Did work"] }],
    projects: [],
    education: [],
    certifications: [],
    additionalSections: {},
    atsKeywords: ["JavaScript"],
  };
}

describe("tailored resume providers", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("generateTailoredResumeAnthropic parses JSON output", async () => {
    mockFetchOkJson({
      content: [{ type: "text", text: JSON.stringify(minimalTailoredResumeJson()) }],
      usage: { input_tokens: 1, output_tokens: 2 },
    });
    const { generateTailoredResumeAnthropic } = await import("../src/background/anthropic-client.js");
    const out = await generateTailoredResumeAnthropic({ schemaVersion: 1 }, { anthropicKey: "k", anthropicModel: "claude-sonnet-4-6", maxTokens: 10, temperature: 0 });
    expect(out.result?.basics?.name).toBe("Jane Doe");
  });

  test("generateTailoredResumeGemini parses JSON output", async () => {
    mockFetchOkJson({
      candidates: [{ content: { parts: [{ text: JSON.stringify(minimalTailoredResumeJson()) }] } }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 },
    });
    const { generateTailoredResumeGemini } = await import("../src/background/gemini-client.js");
    const out = await generateTailoredResumeGemini({ schemaVersion: 1 }, { geminiKey: "k", geminiModel: "gemini-2.5-flash", maxTokens: 10, temperature: 0 });
    expect(out.result?.headline).toContain("Software");
  });

  test("generateTailoredResumePerplexity parses JSON output", async () => {
    mockFetchOkJson({
      choices: [{ message: { content: JSON.stringify(minimalTailoredResumeJson()) } }],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    });
    const { generateTailoredResumePerplexity } = await import("../src/background/perplexity-client.js");
    const out = await generateTailoredResumePerplexity({ schemaVersion: 1 }, { perplexityKey: "k", perplexityModel: "sonar", maxTokens: 10, temperature: 0 });
    expect(out.result?.experience?.[0]?.company).toBe("ACME");
  });
});

