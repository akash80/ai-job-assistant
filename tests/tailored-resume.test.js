/** @jest-environment node */

describe("shared/tailored-resume", () => {
  test("validateTailoredResume normalizes a valid object", async () => {
    const { validateTailoredResume, TAILORED_RESUME_SCHEMA_VERSION } = await import("../src/shared/tailored-resume.js");
    const input = {
      schemaVersion: TAILORED_RESUME_SCHEMA_VERSION,
      meta: { generatedAt: "2026-01-01T00:00:00.000Z", model: "gpt-test", warnings: [] },
      basics: { name: "Jane Doe", email: "jane@example.com", phone: "123", location: "Remote", links: { linkedin: "https://x" } },
      headline: "Software Engineer",
      summaryBullets: ["Built APIs", "Improved latency"],
      skills: { categories: { Core: ["JavaScript", "Node.js"] }, topKeywords: ["api", "node"] },
      experience: [
        { title: "Engineer", company: "ACME", location: "Remote", startDate: "2020", endDate: "2023", bullets: ["Shipped X"] },
      ],
      atsKeywords: ["api", "node"],
    };
    const out = validateTailoredResume(input);
    expect(out.schemaVersion).toBe(TAILORED_RESUME_SCHEMA_VERSION);
    expect(out.basics.name).toBe("Jane Doe");
    expect(Array.isArray(out.experience)).toBe(true);
    expect(out.experience.length).toBeGreaterThan(0);
  });

  test("validateTailoredResume rejects missing basics.name", async () => {
    const { validateTailoredResume, TAILORED_RESUME_SCHEMA_VERSION } = await import("../src/shared/tailored-resume.js");
    expect(() => validateTailoredResume({
      schemaVersion: TAILORED_RESUME_SCHEMA_VERSION,
      meta: { generatedAt: "x", model: "", warnings: [] },
      basics: { name: "" },
      headline: "",
      summaryBullets: [],
      skills: { categories: {}, topKeywords: [] },
      experience: [{ title: "X", company: "Y", bullets: ["Z"] }],
      atsKeywords: [],
    })).toThrow(/basics\.name/i);
  });

  test("validateTailoredResume rejects missing experience entries", async () => {
    const { validateTailoredResume, TAILORED_RESUME_SCHEMA_VERSION } = await import("../src/shared/tailored-resume.js");
    expect(() => validateTailoredResume({
      schemaVersion: TAILORED_RESUME_SCHEMA_VERSION,
      meta: { generatedAt: "x", model: "", warnings: [] },
      basics: { name: "Jane" },
      headline: "",
      summaryBullets: [],
      skills: { categories: {}, topKeywords: [] },
      experience: [],
      atsKeywords: [],
    })).toThrow(/experience/i);
  });
});

