/** @jest-environment node */

describe("shared/prompts", () => {
  test("buildAnalysisPrompt contains expected sections", async () => {
    const { buildAnalysisPrompt } = await import("../src/shared/prompts.js");
    const s = buildAnalysisPrompt("JOB", "RESUME");
    expect(s).toContain("---JOB POSTING---");
    expect(s).toContain("JOB");
    expect(s).toContain("---MY RESUME---");
    expect(s).toContain("RESUME");
    expect(s).toContain("\"match_score\"");
  });

  test("normalizeResumeProfileDepth defaults to standard", async () => {
    const { normalizeResumeProfileDepth, getParseResumeMaxTokens, buildResumeParseSystem } = await import("../src/shared/prompts.js");
    expect(normalizeResumeProfileDepth("weird")).toBe("standard");
    expect(getParseResumeMaxTokens("compact")).toBeGreaterThan(1000);
    expect(buildResumeParseSystem("compact")).toContain("Return ONLY valid JSON");
    expect(buildResumeParseSystem("standard")).toContain("expert résumé parsing AI");
    expect(buildResumeParseSystem("detailed")).toContain("richer bullets");
    expect(buildResumeParseSystem("comprehensive")).toContain("Extract thoroughly");
  });

  test("buildResumeParsePrompt includes schema block and rules", async () => {
    const { buildResumeParsePrompt } = await import("../src/shared/prompts.js");
    const p = buildResumeParsePrompt("hello", "compact");
    expect(p).toContain("---RESUME TEXT---");
    expect(p).toContain("\"experience\"");
    expect(p).toContain("Rules");
  });

  test("buildCoverLetterPrompt includes job + candidate sections", async () => {
    const { buildCoverLetterPrompt } = await import("../src/shared/prompts.js");
    const s = buildCoverLetterPrompt(
      { job_title: "Engineer", company: "ACME", location: "Remote", key_requirements: ["JS"], strengths: ["JS"] },
      { name: "Candidate", currentTitle: "Dev", skills: { core: ["JavaScript"] }, yearsExperience: "5" },
      "concise",
    );
    expect(s).toContain("---JOB DETAILS---");
    expect(s).toContain("ACME");
    expect(s).toContain("---CANDIDATE PROFILE---");
  });

  test("buildCoverLetterPrompt tone fallback works", async () => {
    const { buildCoverLetterPrompt } = await import("../src/shared/prompts.js");
    const s = buildCoverLetterPrompt(
      { job_title: "Engineer", company: "ACME", location: "Remote", key_requirements: [] },
      { name: "Candidate", currentTitle: "Dev", skills: {} },
      "unknown-tone",
    );
    expect(s).toContain("Tone:");
  });

  test("buildResumeParsePrompt covers comprehensive branch", async () => {
    const { buildResumeParsePrompt } = await import("../src/shared/prompts.js");
    const p = buildResumeParsePrompt("hello", "comprehensive");
    expect(p).toContain("Extract everything you find");
  });

  test("buildFindJobsPrompt includes structured preferences", async () => {
    const { buildFindJobsPrompt } = await import("../src/shared/prompts.js");
    const s = buildFindJobsPrompt(
      { currentTitle: "Dev", skills: { core: ["JS"] } },
      { preferredLocations: ["Remote"], preferredRoles: ["Frontend"], salaryCurrency: "USD" },
    );
    expect(s).toContain("Location preference");
    expect(s).toContain("Remote");
  });

  test("buildSmartFillSystem and buildSmartFillPrompt include required scaffolding", async () => {
    const { buildSmartFillSystem, buildSmartFillPrompt } = await import("../src/shared/prompts.js");
    const sys = buildSmartFillSystem({ allowGeneration: true });
    expect(sys).toContain("Return a SmartFillPlan");
    expect(sys).toContain("confidence");
    const user = buildSmartFillPrompt({
      pageUrl: "https://example.com",
      formSchema: { fields: [{ fieldId: "id:email" }] },
      profile: { email: "a@b.com" },
      answers: { x: { value: "y" } },
      preferences: { smartFillAllowGeneration: true },
      jobContext: { analysis: { job_title: "Dev" } },
    });
    expect(user).toContain("---FORM SCHEMA---");
    expect(user).toContain("id:email");
    expect(user).toContain("---SAVED PROFILE---");
  });
});

