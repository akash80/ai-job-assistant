/** @jest-environment node */

describe("background/perplexity-client", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("testPerplexityKey returns invalid on 401", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "nope" } }),
    });

    const { testPerplexityKey } = await import("../src/background/perplexity-client.js");
    const out = await testPerplexityKey({ perplexityKey: "k", perplexityModel: "sonar", maxTokens: 5, temperature: 0.1 });
    expect(out.valid).toBe(false);
    expect(out.error).toContain("nope");
  });

  test("findJobsPerplexity falls back to raw.search_results when content not JSON", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "not json" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        search_results: [
          { title: "Role", url: "https://example.com/jobs/1", source: "Example", snippet: "hi", date: "2026-01-01" },
        ],
      }),
    });

    const { findJobsPerplexity } = await import("../src/background/perplexity-client.js");
    const out = await findJobsPerplexity({}, {}, { perplexityKey: "k", perplexityModel: "sonar", maxTokens: 100, temperature: 0.1 });
    expect(Array.isArray(out.result)).toBe(true);
    expect(out.result[0].url).toBe("https://example.com/jobs/1");
  });

  test("findJobsPerplexity parses fenced JSON array", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "```json\n[{\"title\":\"T\",\"company\":\"C\",\"url\":\"https://example.com/a\"}]\n```" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    });
    const { findJobsPerplexity } = await import("../src/background/perplexity-client.js");
    const out = await findJobsPerplexity({}, {}, { perplexityKey: "k", perplexityModel: "sonar", maxTokens: 100, temperature: 0.1 });
    expect(out.result[0].title).toBe("T");
  });

  test("findJobsPerplexity dedupes duplicate urls", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify([
              { title: "T1", company: "C", url: "https://example.com/a?utm_source=x" },
              { title: "T2", company: "C", url: "https://example.com/a?utm_source=y" },
            ]),
          },
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    });
    const { findJobsPerplexity } = await import("../src/background/perplexity-client.js");
    const out = await findJobsPerplexity({}, {}, { perplexityKey: "k", perplexityModel: "sonar", maxTokens: 100, temperature: 0.1 });
    expect(out.result.length).toBe(1);
  });

  test("analyzeJobPerplexity parses JSON from fenced content", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "```json\n{\"match_score\":42}\n```" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    });

    const { analyzeJobPerplexity } = await import("../src/background/perplexity-client.js");
    const out = await analyzeJobPerplexity("job", "resume", { perplexityKey: "k", perplexityModel: "sonar", maxTokens: 10, temperature: 0.1 });
    expect(out.result.match_score).toBe(42);
  });

  test("parseResumePerplexity throws PARSE_ERROR on non-JSON", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "no json here" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    });

    const { parseResumePerplexity } = await import("../src/background/perplexity-client.js");
    await expect(parseResumePerplexity("resume", { perplexityKey: "k", perplexityModel: "sonar", maxTokens: 10, temperature: 0.1 }, { depth: "standard" }))
      .rejects.toMatchObject({ code: "PARSE_ERROR" });
  });

  test("planSmartFormFillPerplexity parses JSON plan", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "```json\n{\"fills\":[],\"skip\":[],\"questions\":[{\"fieldId\":\"id:email\",\"prompt\":\"Email?\",\"suggestedValue\":\"a@b.com\"}]}\n```" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    });

    const { planSmartFormFillPerplexity } = await import("../src/background/perplexity-client.js");
    const out = await planSmartFormFillPerplexity(
      { pageUrl: "https://example.com", formSchema: { fields: [{ fieldId: "id:email" }] }, profile: {}, answers: {}, preferences: {} },
      { perplexityKey: "k", perplexityModel: "sonar", maxTokens: 200, temperature: 0.1 },
      { allowGeneration: true },
    );
    expect(out.result.questions[0].fieldId).toBe("id:email");
  });
});

