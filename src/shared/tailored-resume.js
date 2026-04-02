export const TAILORED_RESUME_SCHEMA_VERSION = 1;

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function clampArray(arr, maxLen) {
  if (!Array.isArray(arr)) return [];
  return arr.map((x) => String(x || "").trim()).filter(Boolean).slice(0, maxLen);
}

function clampStr(s, maxLen) {
  const out = String(s || "").replace(/\s+/g, " ").trim();
  if (!out) return "";
  if (out.length <= maxLen) return out;
  return out.slice(0, Math.max(0, maxLen - 1)) + "…";
}

function normalizeLinks(links) {
  const base = isPlainObject(links) ? links : {};
  return {
    linkedin: clampStr(base.linkedin || base.linkedinUrl || "", 220),
    github: clampStr(base.github || base.githubUrl || "", 220),
    portfolio: clampStr(base.portfolio || base.portfolioUrl || "", 220),
    website: clampStr(base.website || "", 220),
  };
}

function normalizeSkillCategories(categories) {
  const obj = isPlainObject(categories) ? categories : {};
  const out = {};
  const entries = Object.entries(obj).slice(0, 30);
  for (const [k, v] of entries) {
    const key = clampStr(k, 60);
    if (!key) continue;
    out[key] = clampArray(v, 40);
  }
  return out;
}

function normalizeExperience(experience) {
  const arr = Array.isArray(experience) ? experience : [];
  return arr.slice(0, 12).map((e) => {
    const base = isPlainObject(e) ? e : {};
    return {
      title: clampStr(base.title, 120),
      company: clampStr(base.company, 120),
      location: clampStr(base.location, 140),
      startDate: clampStr(base.startDate, 20),
      endDate: clampStr(base.endDate, 20),
      bullets: clampArray(base.bullets, 8).map((b) => clampStr(b, 220)),
    };
  }).filter((e) => e.title || e.company || e.bullets.length > 0);
}

/**
 * Validates and normalizes a TailoredResume JSON object.
 * Throws an Error if the shape is fundamentally invalid.
 */
export function validateTailoredResume(parsed) {
  if (!isPlainObject(parsed)) {
    throw new Error("Tailored resume must be a JSON object.");
  }

  const schemaVersion = Number(parsed.schemaVersion || parsed.schema_version || 0) || 0;
  if (schemaVersion !== TAILORED_RESUME_SCHEMA_VERSION) {
    throw new Error(`Unsupported tailored resume schemaVersion: ${schemaVersion}`);
  }

  const metaIn = isPlainObject(parsed.meta) ? parsed.meta : {};
  const basicsIn = isPlainObject(parsed.basics) ? parsed.basics : {};
  const skillsIn = isPlainObject(parsed.skills) ? parsed.skills : {};

  const normalized = {
    schemaVersion: TAILORED_RESUME_SCHEMA_VERSION,
    meta: {
      generatedAt: clampStr(metaIn.generatedAt || metaIn.generated_at || new Date().toISOString(), 60),
      jobPostingKey: clampStr(metaIn.jobPostingKey || metaIn.job_posting_key || "", 120),
      model: clampStr(metaIn.model || "", 80),
      warnings: clampArray(metaIn.warnings, 12).map((w) => clampStr(w, 200)),
    },
    basics: {
      name: clampStr(basicsIn.name || "", 120),
      email: clampStr(basicsIn.email || "", 140),
      phone: clampStr(basicsIn.phone || "", 60),
      location: clampStr(basicsIn.location || "", 160),
      links: normalizeLinks(basicsIn.links),
    },
    headline: clampStr(parsed.headline || "", 160),
    summaryBullets: clampArray(parsed.summaryBullets || parsed.summary_bullets, 6).map((b) => clampStr(b, 240)),
    skills: {
      categories: normalizeSkillCategories(skillsIn.categories),
      topKeywords: clampArray(skillsIn.topKeywords || skillsIn.top_keywords, 30).map((k) => clampStr(k, 60)),
    },
    experience: normalizeExperience(parsed.experience),
    projects: Array.isArray(parsed.projects) ? parsed.projects.slice(0, 8) : [],
    education: Array.isArray(parsed.education) ? parsed.education.slice(0, 6) : [],
    certifications: Array.isArray(parsed.certifications) ? parsed.certifications.slice(0, 12) : [],
    additionalSections: isPlainObject(parsed.additionalSections) ? parsed.additionalSections : {},
    atsKeywords: clampArray(parsed.atsKeywords || parsed.ats_keywords, 40).map((k) => clampStr(k, 60)),
  };

  if (!normalized.basics.name) {
    throw new Error("Tailored resume is missing basics.name.");
  }
  if (normalized.experience.length === 0) {
    throw new Error("Tailored resume is missing experience entries.");
  }

  return normalized;
}

