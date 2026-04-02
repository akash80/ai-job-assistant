/** @jest-environment node */

describe("background/anthropic-client", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("returns NO_API_KEY when key missing", async () => {
    const { analyzeJobAnthropic } = await import("../src/background/anthropic-client.js");
    await expect(analyzeJobAnthropic("job", "resume", { anthropicKey: "" })).rejects.toMatchObject({ code: "NO_API_KEY" });
  });

  test("extracts JSON from fenced response content", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: "```json\n{\"match_score\":80}\n```" }],
        usage: { input_tokens: 2, output_tokens: 3 },
      }),
    });

    const { analyzeJobAnthropic } = await import("../src/background/anthropic-client.js");
    const out = await analyzeJobAnthropic("job", "resume", { anthropicKey: "k", anthropicModel: "claude-sonnet-4-6", maxTokens: 10, temperature: 0.1 });
    expect(out.result.match_score).toBe(80);
    expect(out.usage.total_tokens).toBe(5);
  });

  test("maps 401 to INVALID_API_KEY", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "bad key" } }),
    });

    const { testAnthropicKey } = await import("../src/background/anthropic-client.js");
    const out = await testAnthropicKey({ anthropicKey: "k", anthropicModel: "claude-sonnet-4-6", maxTokens: 5, temperature: 0.1 });
    expect(out.valid).toBe(false);
    expect(out.error).toContain("bad key");
  });

  test("throws PARSE_ERROR when response has no text block", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: "tool_use", text: "" }], usage: { input_tokens: 1, output_tokens: 1 } }),
    });

    const { testAnthropicKey } = await import("../src/background/anthropic-client.js");
    const out = await testAnthropicKey({ anthropicKey: "k", anthropicModel: "claude-sonnet-4-6", maxTokens: 5, temperature: 0.1 });
    expect(out.valid).toBe(false);
    expect(out.error).toContain("Empty response");
  });

  test("planSmartFormFillAnthropic parses fenced JSON plan", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: "text", text: "```json\n{\"fills\":[],\"skip\":[],\"questions\":[]}\n```" }],
        usage: { input_tokens: 2, output_tokens: 3 },
      }),
    });

    const { planSmartFormFillAnthropic } = await import("../src/background/anthropic-client.js");
    const out = await planSmartFormFillAnthropic(
      { pageUrl: "https://example.com", formSchema: { fields: [{ fieldId: "id:x" }] }, profile: {}, answers: {}, preferences: {} },
      { anthropicKey: "k", anthropicModel: "claude-sonnet-4-6", maxTokens: 100, temperature: 0.1 },
      { allowGeneration: false },
    );
    expect(out.result).toMatchObject({ fills: [], skip: [], questions: [] });
  });
});

