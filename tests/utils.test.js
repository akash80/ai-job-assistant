/** @jest-environment node */

describe("shared/utils", () => {
  test("normalizeJobPageUrl removes tracking params and fragments", async () => {
    const { normalizeJobPageUrl } = await import("../src/shared/utils.js");
    const url = "https://www.linkedin.com/jobs/view/123456789/?utm_source=x&gclid=y&foo=bar#frag";
    expect(normalizeJobPageUrl(url)).toBe("linkedin.com/jobs/view/123456789?foo=bar");
  });

  test("buildJobPostingKey prefers stable host+id when present", async () => {
    const { buildJobPostingKey } = await import("../src/shared/utils.js");
    const url = "https://www.linkedin.com/jobs/view/987654321/?trk=abc";
    expect(buildJobPostingKey(url)).toBe("linkedin.com|id:987654321");
  });

  test("buildJobPostingKeyFromHints prefers extracted job ids over URL", async () => {
    const { buildJobPostingKeyFromHints } = await import("../src/shared/utils.js");
    const url = "https://careers.example.com/apply?step=1&utm_source=x";
    expect(buildJobPostingKeyFromHints(url, ["REQ-12345"])).toBe("careers.example.com|id:REQ-12345");
  });

  test("hashString returns a 64-char hex sha256", async () => {
    const { hashString } = await import("../src/shared/utils.js");
    const h = await hashString("hello");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  test("extractJobIdFromUrl handles several platforms", async () => {
    const { extractJobIdFromUrl } = await import("../src/shared/utils.js");
    expect(extractJobIdFromUrl("https://www.linkedin.com/jobs/view/123456789/")).toBe("123456789");
    expect(extractJobIdFromUrl("https://jobs.lever.co/acme/role-123")).toBe("role-123");
    expect(extractJobIdFromUrl("https://boards.greenhouse.io/acme/jobs/555666")).toBe("555666");
    expect(extractJobIdFromUrl("https://acme.wd5.myworkday.com/en-US/External/job/City/Req-Name_12345")).toContain("city/");
  });

  test("date helpers and title/company normalization behave sanely", async () => {
    const { normalizeCompanyTitleKey, monthYearToIsoDate, isoDateToMonthYear } = await import("../src/shared/utils.js");
    expect(normalizeCompanyTitleKey("  ACME, Inc. ")).toBe("acme inc");
    expect(monthYearToIsoDate("January", "2020")).toBe("2020-01-01");
    expect(isoDateToMonthYear("2020-01-01")).toEqual({ month: "January", year: "2020" });
    expect(isoDateToMonthYear("bad")).toEqual({ month: "", year: "" });
  });
});

