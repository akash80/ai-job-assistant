/** @jest-environment node */

/**
 * Optional live API smoke tests (runs only if keys are present).
 *
 * These are intentionally lightweight and safe:
 * - They only call each provider's "test key" method (maxTokens ~5).
 * - They run only when the corresponding API key is present in .env / environment.
 * - They do not print secrets (never log keys).
 *
 * Note: network tests can be flaky due to rate limits or regional restrictions.
 */

const maybe = (cond) => (cond ? test : test.skip);

describe("live API smoke tests (optional)", () => {
  // Avoid long hangs if a provider is slow.
  jest.setTimeout(20000);

  test("prints whether live tests are enabled", () => {
    // This is a tiny "sanity" test to surface intent in test output without leaking secrets.
    const enabled = {
      openai: Boolean(process.env.OPENAI_API_KEY),
      anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
      perplexity: Boolean(process.env.PERPLEXITY_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY),
    };
    expect(typeof enabled.openai).toBe("boolean");
    expect(typeof enabled.anthropic).toBe("boolean");
    expect(typeof enabled.perplexity).toBe("boolean");
    expect(typeof enabled.gemini).toBe("boolean");
  });

  maybe(Boolean(process.env.OPENAI_API_KEY))("OpenAI key is valid (smoke)", async () => {
    const { testApiKey } = await import("../src/background/openai-client.js");
    const out = await testApiKey({
      apiKey: String(process.env.OPENAI_API_KEY || ""),
      model: "gpt-4.1-mini",
      baseUrl: "https://api.openai.com/v1",
      maxTokens: 5,
      temperature: 0.3,
    });
    expect(out.valid).toBe(true);
  });

  maybe(Boolean(process.env.ANTHROPIC_API_KEY))("Anthropic key is valid (smoke)", async () => {
    const { testAnthropicKey } = await import("../src/background/anthropic-client.js");
    const out = await testAnthropicKey({
      anthropicKey: String(process.env.ANTHROPIC_API_KEY || ""),
      anthropicModel: "claude-sonnet-4-6",
      maxTokens: 5,
      temperature: 0.3,
    });
    expect(out.valid).toBe(true);
  });

  maybe(Boolean(process.env.PERPLEXITY_API_KEY))("Perplexity key is valid (smoke)", async () => {
    const { testPerplexityKey } = await import("../src/background/perplexity-client.js");
    const out = await testPerplexityKey({
      perplexityKey: String(process.env.PERPLEXITY_API_KEY || ""),
      perplexityModel: "sonar",
      maxTokens: 5,
      temperature: 0.3,
    });
    expect(out.valid).toBe(true);
  });

  maybe(Boolean(process.env.GEMINI_API_KEY))("Gemini key is valid (smoke)", async () => {
    const { testGeminiKey } = await import("../src/background/gemini-client.js");
    const out = await testGeminiKey({
      geminiKey: String(process.env.GEMINI_API_KEY || ""),
      geminiModel: "gemini-2.5-flash",
      maxTokens: 5,
      temperature: 0.3,
    });
    expect(out.valid).toBe(true);
  });
});

