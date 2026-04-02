/** @jest-environment node */

describe("background/gemini-client", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("fails fast when geminiKey missing", async () => {
    const { analyzeJobGemini } = await import("../src/background/gemini-client.js");
    await expect(analyzeJobGemini("job", "resume", { geminiKey: "", geminiModel: "gemini-2.5-flash", maxTokens: 10, temperature: 0.1 }))
      .rejects.toMatchObject({ code: "NO_API_KEY" });
  });

  test("testGeminiKey returns invalid on 403", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: "permission denied" } }),
    });

    const { testGeminiKey } = await import("../src/background/gemini-client.js");
    const out = await testGeminiKey({ geminiKey: "k", geminiModel: "gemini-2.5-flash", maxTokens: 5, temperature: 0.1 });
    expect(out.valid).toBe(false);
    expect(out.error).toContain("permission denied");
  });

  test("falls back to ListModels when model missing/deprecated", async () => {
    global.fetch.mockImplementation(async (url, options) => {
      const u = String(url || "");
      const method = (options?.method || "GET").toUpperCase();

      // 1) Initial generateContent fails with model error
      if (method === "POST" && u.includes(":generateContent")) {
        // First POST fails, second succeeds
        const calls = global.fetch.mock.calls.filter((c) => String(c[0] || "").includes(":generateContent")).length;
        if (calls === 1) {
          return {
            ok: false,
            status: 404,
            json: async () => ({
              error: {
                message: "models/gemini-2.0-flash is not found for API version v1beta, or is not supported for generateContent. Call ListModels to see the list of available models and their supported methods.",
              },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: "{\"match_score\":77}" }] } }],
            usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 },
          }),
        };
      }

      // 2) ListModels returns a usable generateContent model
      if (method === "GET" && u.includes("/v1beta/models?")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            models: [
              { name: "models/gemini-2.5-flash-001", baseModelId: "gemini-2.5-flash", supportedGenerationMethods: ["generateContent"], displayName: "Gemini 2.5 Flash" },
            ],
          }),
        };
      }

      throw new Error(`Unexpected fetch call: ${method} ${u}`);
    });

    const { analyzeJobGemini } = await import("../src/background/gemini-client.js");
    const out = await analyzeJobGemini("job", "resume", { geminiKey: "k", geminiModel: "gemini-2.0-flash", maxTokens: 10, temperature: 0.1 });
    expect(out.result.match_score).toBe(77);

    const postCalls = global.fetch.mock.calls.filter((c) => String(c[0] || "").includes(":generateContent"));
    expect(postCalls.length).toBe(2);
    expect(String(postCalls[1][0])).toContain("gemini-2.5-flash-001");
  });
});

