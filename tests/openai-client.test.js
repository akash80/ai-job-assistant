/** @jest-environment node */

describe("background/openai-client", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  test("call fails fast when apiKey missing", async () => {
    const { analyzeJob } = await import("../src/background/openai-client.js");
    await expect(analyzeJob("job", "resume", { apiKey: "", model: "gpt-4.1-mini", baseUrl: "https://api.openai.com/v1", maxTokens: 10, temperature: 0.1 }))
      .rejects.toMatchObject({ code: "NO_API_KEY" });
  });

  test("maps 401 to INVALID_API_KEY", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: "bad key" } }),
    });

    const { testApiKey } = await import("../src/background/openai-client.js");
    const out = await testApiKey({ apiKey: "k", model: "gpt-4.1-mini", baseUrl: "https://api.openai.com/v1", maxTokens: 5, temperature: 0.1 });
    expect(out.valid).toBe(false);
    expect(out.error).toContain("bad key");
  });

  test("maps 404 to MODEL_NOT_FOUND", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: "not found" } }),
    });

    const { analyzeJob } = await import("../src/background/openai-client.js");
    await expect(analyzeJob("job", "resume", { apiKey: "k", model: "bad-model", baseUrl: "https://api.openai.com/v1", maxTokens: 10, temperature: 0.1 }))
      .rejects.toMatchObject({ code: "MODEL_NOT_FOUND" });
  });

  test("retries on 429 then succeeds", async () => {
    const okResp = {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "{\"match_score\":50}" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
      .mockResolvedValueOnce(okResp);

    const { analyzeJob } = await import("../src/background/openai-client.js");
    const out = await analyzeJob("job", "resume", { apiKey: "k", model: "gpt-4.1-mini", baseUrl: "https://api.openai.com/v1", maxTokens: 10, temperature: 0.1 });
    expect(out.result.match_score).toBe(50);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("throws PARSE_ERROR on empty model content", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "" } }] }),
    });
    const { analyzeJob } = await import("../src/background/openai-client.js");
    await expect(analyzeJob("job", "resume", { apiKey: "k", model: "gpt-4.1-mini", baseUrl: "https://api.openai.com/v1", maxTokens: 10, temperature: 0.1 }))
      .rejects.toMatchObject({ code: "PARSE_ERROR" });
  });

  test("uses max_completion_tokens for o* reasoning models", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "{\"match_score\":50}" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    });

    const { analyzeJob } = await import("../src/background/openai-client.js");
    await analyzeJob("job", "resume", { apiKey: "k", model: "o3", baseUrl: "https://api.openai.com/v1", maxTokens: 10, temperature: 0.1 });

    const firstCall = global.fetch.mock.calls[0];
    const options = firstCall[1];
    const body = JSON.parse(options.body);
    expect(body.max_completion_tokens).toBe(10);
    expect(body.max_tokens).toBeUndefined();
  });

  test("retries with max_completion_tokens when max_tokens is rejected", async () => {
    const badReq = {
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead." } }),
    };
    const okResp = {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "{\"match_score\":50}" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    global.fetch.mockResolvedValueOnce(badReq).mockResolvedValueOnce(okResp);

    const { analyzeJob } = await import("../src/background/openai-client.js");
    await analyzeJob("job", "resume", { apiKey: "k", model: "gpt-5", baseUrl: "https://api.openai.com/v1", maxTokens: 10, temperature: 0.1 });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    const retryOptions = global.fetch.mock.calls[1][1];
    const retryBody = JSON.parse(retryOptions.body);
    expect(retryBody.max_completion_tokens).toBe(10);
    expect(retryBody.max_tokens).toBeUndefined();
  });

  test("retries without temperature when model rejects custom temperature", async () => {
    const badReq = {
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Unsupported value: 'temperature' does not support 0.3 with this model. Only the default (1) value is supported." } }),
    };
    const okResp = {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "{\"match_score\":50}" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    };

    global.fetch.mockResolvedValueOnce(badReq).mockResolvedValueOnce(okResp);

    const { analyzeJob } = await import("../src/background/openai-client.js");
    await analyzeJob("job", "resume", { apiKey: "k", model: "gpt-4.1-mini", baseUrl: "https://api.openai.com/v1", maxTokens: 10, temperature: 0.3 });

    expect(global.fetch).toHaveBeenCalledTimes(2);

    const firstBody = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(firstBody.temperature).toBe(0.3);

    const retryBody = JSON.parse(global.fetch.mock.calls[1][1].body);
    expect(retryBody.temperature).toBeUndefined();
  });

  test("planSmartFormFillOpenAI returns a JSON plan", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({ fills: [], skip: [], questions: [{ fieldId: "id:email", prompt: "Email?", suggestedValue: "a@b.com" }] }),
          },
        }],
        usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      }),
    });

    const { planSmartFormFillOpenAI } = await import("../src/background/openai-client.js");
    const out = await planSmartFormFillOpenAI(
      { pageUrl: "https://example.com", formSchema: { fields: [{ fieldId: "id:email" }] }, profile: {}, answers: {}, preferences: {} },
      { apiKey: "k", model: "gpt-4.1-mini", baseUrl: "https://api.openai.com/v1", maxTokens: 50, temperature: 0.1 },
      { allowGeneration: true },
    );
    expect(Array.isArray(out.result.questions)).toBe(true);
    expect(out.usage.total_tokens).toBe(5);
  });
});

