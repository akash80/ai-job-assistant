/** @jest-environment node */

const fs = require("node:fs");
const path = require("node:path");

describe("resume fixture", () => {
  test("buildResumeParsePrompt includes fixture text", async () => {
    const resumeText = fs.readFileSync(path.join(__dirname, "fixtures", "resume_sanitized.txt"), "utf8");
    const { buildResumeParsePrompt } = await import("../src/shared/prompts.js");
    const prompt = buildResumeParsePrompt(resumeText, "standard");
    expect(prompt).toContain("SANITIZED CANDIDATE");
    expect(prompt).toContain("---RESUME TEXT---");
  });
});

