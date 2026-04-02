/** @jest-environment node */

describe("background/local-analyzer", () => {
  test("analyzeJobLocally matches synonyms (js -> javascript) and returns stable shape", async () => {
    const { analyzeJobLocally } = await import("../src/background/local-analyzer.js");
    const job = "We require JS, Docker, and Kubernetes. Preferred: React. Location: Remote.";
    const profile = {
      skills: { core: ["JavaScript", "docker", "k8s"] },
      currentTitle: "Frontend Engineer",
      experience: [{ title: "Engineer", highlights: ["Built React apps"] }],
    };
    const out = analyzeJobLocally(job, profile);
    expect(out).toMatchObject({
      _local: true,
      company: expect.any(String),
      job_title: expect.any(String),
      recommendation: expect.any(String),
    });
    expect(out.match_score).toBeGreaterThan(0);
    expect(Array.isArray(out.strengths)).toBe(true);
  });

  test("analyzeJobLocally recommends Skip for low overlap", async () => {
    const { analyzeJobLocally } = await import("../src/background/local-analyzer.js");
    const job = "We require COBOL, Mainframe, and z/OS. Mandatory: JCL.";
    const profile = { skills: { core: ["JavaScript", "React"] } };
    const out = analyzeJobLocally(job, profile);
    expect(out.recommendation).toBe("Skip");
  });
});

