export const SYSTEM_PROMPT = `You are a job matching assistant. Analyze the job posting against the candidate's resume and return a structured JSON assessment. Be objective, precise, and helpful. Only return valid JSON — no markdown, no explanation, no extra text.`;

export function buildAnalysisPrompt(jobText, resumeText) {
  return `Analyze this job posting against my resume.

---JOB POSTING---
${jobText}

---MY RESUME---
${resumeText}

Return a JSON object with this exact structure:
{
  "match_score": <number 0-100>,
  "strengths": ["<matching skill/experience (0-12 items; include only truly relevant items)>"],
  "missing_skills": ["<required skill the candidate lacks (0-12 items; include only concrete skills/requirements)>"],
  "recommendation": "Apply" | "Skip" | "Consider",
  "reason": "<1-2 sentence explanation>",
  "job_title": "<extracted job title>",
  "company": "<extracted company name or Unknown>",
  "key_requirements": ["<key requirements from the posting (0-12 items; prefer concrete requirements over generic phrasing)>"],
  "experience_match": "<how candidate experience aligns, 1 sentence>",
  "salary_range": "<if mentioned, otherwise null>",
  "location": "<job location or Remote>",
  "job_type": "<Full-time | Part-time | Contract | Internship>"
}`;
}

/** Ordered ids for resume → profile JSON depth (API parse + manual ChatGPT prompt). */
export const RESUME_PROFILE_DEPTH_IDS = ["compact", "standard", "detailed", "comprehensive"];

/** UI labels — avoid vague terms like "medium" or "descriptive". */
export const RESUME_PROFILE_DEPTH_OPTIONS = [
  { id: "compact", label: "Essentials", hint: "Shortest: core roles, tight bullets, best for quick forms." },
  { id: "standard", label: "Balanced", hint: "Default — full work history, sensible length." },
  { id: "detailed", label: "Rich", hint: "More bullets and fuller blurbs where the résumé supports them." },
  { id: "comprehensive", label: "Complete", hint: "Everything in the document — longest output, all extras." },
];

export function normalizeResumeProfileDepth(depth) {
  const s = String(depth || "").toLowerCase();
  return RESUME_PROFILE_DEPTH_IDS.includes(s) ? s : "standard";
}

export function getParseResumeMaxTokens(depth) {
  const d = normalizeResumeProfileDepth(depth);
  const map = { compact: 2200, standard: 3000, detailed: 4000, comprehensive: 5500 };
  return map[d] ?? 3000;
}

export function buildResumeParseSystem(depth = "standard") {
  const d = normalizeResumeProfileDepth(depth);
  const tail = "Return ONLY valid JSON — no markdown, no code fences, no explanation.";
  if (d === "compact") {
    return `You parse résumés into compact structured JSON: short phrases, few bullets per role, no fluff. ${tail}`;
  }
  if (d === "standard") {
    return `You are an expert résumé parsing AI. Any format or language. Accurate structured JSON without overly long prose. ${tail}`;
  }
  if (d === "detailed") {
    return `You are an expert résumé parsing AI. Preserve nuance with richer bullets and descriptions when the source supports it. ${tail}`;
  }
  return `You are an expert résumé parsing AI. Any format — standard headings, creative layouts, different languages, unconventional structures. Extract thoroughly into structured JSON. ${tail}`;
}

/** @deprecated Prefer buildResumeParseSystem(depth). Kept for backward compatibility. */
export const RESUME_PARSE_SYSTEM = buildResumeParseSystem("comprehensive");

const RESUME_JSON_SCHEMA_BLOCK = `Return a JSON object. Use the structure below as a GUIDE, but you MUST also:
- The résumé may use non-standard headings (e.g. "What I Do" instead of "Experience"). Map by intent.
- Skill categories are dynamic — mirror how the résumé groups skills.
- If a section does not exist in the résumé, use an empty array [] or empty string "".

{
  "name": "",
  "firstName": "",
  "middleName": "",
  "lastName": "",
  "email": "",
  "phone": "",
  "dateOfBirth": "",
  "addressLine1": "",
  "addressLine2": "",
  "city": "",
  "postalCode": "",
  "location": "",
  "linkedinUrl": "",
  "githubUrl": "",
  "portfolioUrl": "",
  "otherLinks": [{"label": "", "url": ""}],
  "currentTitle": "",
  "headline": "",
  "summary": "",
  "keywords": "",
  "yearsExperience": "",
  "currentCompany": "",
  "skills": {
    "<category_name>": ["skill1", "skill2"]
  },
  "experience": [
    {
      "title": "",
      "company": "",
      "location": "",
      "startDate": "",
      "endDate": "",
      "startMonth": "",
      "startYear": "",
      "endMonth": "",
      "endYear": "",
      "isCurrentCompany": false,
      "industry": "",
      "highlights": [""]
    }
  ],
  "education": [
    {
      "degree": "",
      "field": "",
      "institution": "",
      "year": "",
      "location": "",
      "gpa": "",
      "honors": ""
    }
  ],
  "certifications": [{"name": "", "issuer": "", "year": ""}],
  "spokenLanguages": [{"language": "", "proficiency": ""}],
  "projects": [
    {
      "name": "",
      "description": "",
      "techStack": [""],
      "url": ""
    }
  ],
  "openSource": [
    {
      "name": "",
      "description": "",
      "url": ""
    }
  ],
  "internships": [
    {
      "title": "",
      "company": "",
      "location": "",
      "duration": "",
      "highlights": [""]
    }
  ],
  "publications": [{"title": "", "publisher": "", "year": "", "url": ""}],
  "awards": [{"title": "", "issuer": "", "year": ""}],
  "volunteer": [{"role": "", "organization": "", "duration": "", "description": ""}],
  "additionalSections": {
    "<section_name>": [<any_structured_data>]
  }
}`;

function buildResumeParseRules(depth) {
  const d = normalizeResumeProfileDepth(depth);
  const nameSkillsDates = `For the candidate name, extract firstName, middleName (optional), and lastName when available. Keep name as full display name: firstName + (middleName if present) + lastName.
When the résumé lists a street or mailing address, split it into addressLine1 (street / line 1), addressLine2 (apt/suite/unit if any), city, and postalCode (ZIP / PIN / postal code). Use "location" for a short one-line place (e.g. City, State/Country) when that is all that appears or for headline-style location.
If date of birth appears on the résumé, set dateOfBirth as ISO YYYY-MM-DD when you can infer it reliably; otherwise use an empty string.
Skills categories should match what the résumé uses.
For years of experience, calculate from earliest job start to now.
For experience dates: prefer "startDate" and "endDate" as ISO YYYY-MM-DD when known; otherwise startMonth/startYear/endMonth/endYear. Current job: isCurrentCompany: true, clear end fields.
For internships: use startMonth/startYear/endMonth/endYear when available, else "duration".
Return ONLY the JSON object — no wrapping text.`;

  if (d === "compact") {
    return `Rules (depth: Essentials — keep output short):
1. summary: at most 2 short sentences (under 45 words total).
2. experience: at most the 3 most recent roles; each role at most 2 highlight bullets; each bullet one line, under ~120 characters, outcome-focused.
3. skills: keep categories from the résumé; you may merge tiny categories; only skills that appear in the text.
4. education: at most 2 entries. projects: at most 2; description one line each. certifications: name and year if obvious; skip long issuer text.
5. Use empty arrays for publications, awards, volunteer, openSource unless there is a single clear line each; skip redundant internships already covered in experience.
6. additionalSections: use {} unless something important truly does not fit elsewhere.
7. ${nameSkillsDates}`;
  }

  if (d === "standard") {
    return `Rules (depth: Balanced):
1. Include all work experience roles in order; up to 3 highlight bullets per role, one line each, max ~160 characters.
2. summary: 2–3 sentences, professional, not exhaustive.
3. Include certifications, projects, internships, languages when present in the résumé. Project descriptions: up to 2 sentences.
4. additionalSections: only for meaningful extras that do not fit standard fields.
5. ${nameSkillsDates}`;
  }

  if (d === "detailed") {
    return `Rules (depth: Rich):
1. All roles; up to 5 highlights per role when justified; bullets can be slightly longer (still scannable).
2. summary: up to 4 sentences if the résumé supports it.
3. Richer project and open-source descriptions (2–3 sentences) when the source has detail.
4. Populate publications, awards, volunteer when present; use additionalSections for the rest.
5. ${nameSkillsDates}`;
  }

  return `Rules (depth: Complete):
1. Extract EVERY piece of information — miss nothing.
2. Include ANY extra sections (awards, publications, volunteer, hobbies, references, etc.) in "additionalSections" when not mapped above.
3. Keep highlight bullets concise (1 line each, max 4 per role) unless the résumé is already minimal.
4. Certifications: include issuer/year when present.
5. ${nameSkillsDates}`;
}

export function buildResumeParsePrompt(resumeText, depth = "standard") {
  const d = normalizeResumeProfileDepth(depth);
  const intro =
    d === "compact"
      ? "Parse this résumé into a compact JSON profile. Prefer brevity over completeness for optional sections."
      : d === "comprehensive"
        ? "Parse this résumé intelligently. The résumé may use ANY format, ANY headings, ANY structure. Extract everything you find."
        : "Parse this résumé into structured JSON. Match the requested depth: lean, balanced, or rich — see Rules below.";

  return `${intro}

---RESUME TEXT---
${resumeText}
---END---

${RESUME_JSON_SCHEMA_BLOCK}

${buildResumeParseRules(d)}`;
}

export const VALIDATION_PROMPT_MESSAGE = "Reply with exactly: OK";

// ─── Cover Letter ────────────────────────────────────────────────

export function buildCoverLetterPrompt(jobAnalysis, profile, tone = "professional") {
  const toneGuide = {
    professional: "formal, professional, and confident",
    conversational: "warm, conversational, and personable",
    concise: "concise, direct, and impactful — no filler words",
  }[tone] || "professional, confident, and clear";

  const skills = Object.values(profile?.skills || {}).flat().slice(0, 15).join(", ");
  const currentRole = profile?.currentTitle || "professional";
  const name = profile?.name || profile?.firstName || "Candidate";
  const experience = profile?.yearsExperience ? `${profile.yearsExperience}+ years of experience` : "extensive experience";
  const currentCompany = profile?.currentCompany || "";
  const topStrengths = (jobAnalysis.strengths || []).slice(0, 3).join(", ");

  return `Write a cover letter for this job application. Tone: ${toneGuide}.

---JOB DETAILS---
Title: ${jobAnalysis.job_title}
Company: ${jobAnalysis.company}
Location: ${jobAnalysis.location}
Key Requirements: ${(jobAnalysis.key_requirements || []).join(", ")}

---CANDIDATE PROFILE---
Name: ${name}
Current Role: ${currentRole}${currentCompany ? ` at ${currentCompany}` : ""}
Experience: ${experience}
Top Matching Skills: ${topStrengths || skills}
Skills: ${skills}
Summary: ${profile?.summary || ""}

Instructions:
- Write exactly 3 paragraphs
- Paragraph 1: Express enthusiasm for the specific role and company (1-2 sentences). Briefly state why you're a strong fit.
- Paragraph 2: Highlight 2-3 specific achievements or skills directly relevant to their key requirements. Be concrete.
- Paragraph 3: Call to action — express interest in discussing further, thank them.
- Do NOT include "Dear Hiring Manager" or any greeting/sign-off — just the 3 paragraphs
- Do NOT use placeholder brackets like [Company Name] — use the actual values above
- Keep it under 300 words
- Return only the cover letter text, no extra formatting`;
}

// ─── Smart Form Fill ─────────────────────────────────────────────

export function buildSmartFillSystem({ allowGeneration = true } = {}) {
  const gen = allowGeneration === true
    ? "You MAY suggest short free-text answers (1–3 sentences) when necessary."
    : "You MUST NOT write new free-text answers. Only choose values from profile/answers/preferences.";
  return `You are a form-filling assistant for job applications.

You will be given:
- A compact JSON schema of the current form fields (with ids, labels, hints, options)
- The candidate's saved profile, saved answers, and preferences
- Optional job context (job title/company/job text snippet)

Task:
Return a SmartFillPlan as VALID JSON ONLY (no markdown, no extra text). The plan must map the form fields to values.

Rules:
1) Never invent personal facts. If unsure, ask a question for user confirmation.
2) For select/radio fields, choose ONLY from provided option values/labels.
3) Always include a confidence number between 0 and 1 for each proposed fill.
4) Keep generated text concise. ${gen}
5) Prefer using saved answers and profile fields; only infer when strongly supported by the provided data.
6) If a field should be skipped (e.g., unrelated upload), add it to skip[] with a reason.
`;
}

export function buildSmartFillPrompt({ formSchema, profile, answers, preferences, jobContext, pageUrl }) {
  const safe = (x) => (x && typeof x === "object") ? JSON.stringify(x) : String(x || "");
  return `Build a SmartFillPlan for this page.

Return JSON with this exact top-level structure:
{
  "fills": [{"fieldId":"", "value":"", "confidence":0.0, "source":"profile"|"answers"|"generated"|"inferred", "reason":""}],
  "skip": [{"fieldId":"", "reason":""}],
  "questions": [{"fieldId":"", "prompt":"", "suggestedValue":""}]
}

Constraints:
- fieldId MUST match one of the formSchema.fields[].fieldId values.
- For select/radio_group, value MUST match an available option value or label.
- If confidence < 0.9, prefer returning a questions[] item instead of a fills[] item unless it is a trivial mapping (e.g., email).

---PAGE URL---
${String(pageUrl || "")}

---JOB CONTEXT (optional)---
${safe(jobContext || null)}

---PREFERENCES---
${safe(preferences || {})}

---SAVED PROFILE---
${safe(profile || {})}

---SAVED ANSWERS---
${safe(answers || {})}

---FORM SCHEMA---
${safe(formSchema)}
`;
}

/**
 * Deeper cover letter: full posting + inferred company/role fit (higher quality, longer, more tokens).
 */
export function buildSmartCoverLetterPrompt(jobAnalysis, profile, tone = "professional", jobPostingText = "") {
  const toneGuide = {
    professional: "formal, professional, and confident",
    conversational: "warm, conversational, and personable",
    concise: "concise, direct, and impactful — no filler words",
  }[tone] || "professional, confident, and clear";

  const skills = Object.values(profile?.skills || {}).flat().slice(0, 25).join(", ");
  const currentRole = profile?.currentTitle || "professional";
  const name = profile?.name || profile?.firstName || "Candidate";
  const experience = profile?.yearsExperience ? `${profile.yearsExperience}+ years of experience` : "strong professional experience";
  const currentCompany = profile?.currentCompany || "";
  const topStrengths = (jobAnalysis.strengths || []).slice(0, 5).join(", ");
  const missingOrStretch = (jobAnalysis.missing_skills || []).slice(0, 4).join(", ");
  const posting = String(jobPostingText || "").slice(0, 12000);

  return `You are an expert career writer. Write a standout cover letter that maximizes interview likelihood.

Tone: ${toneGuide}.

---STRUCTURED JOB SUMMARY (from prior analysis)---
Title: ${jobAnalysis.job_title}
Company: ${jobAnalysis.company}
Location: ${jobAnalysis.location}
Key requirements: ${(jobAnalysis.key_requirements || []).join("; ")}
Match strengths: ${topStrengths || "(none listed)"}
Gaps or stretch areas: ${missingOrStretch || "(none listed)"}
Experience alignment (one line): ${jobAnalysis.experience_match || ""}
Recommendation context: ${jobAnalysis.recommendation} — ${jobAnalysis.reason || ""}

---FULL JOB POSTING TEXT (primary source; quote specific phrases where natural)---
${posting || "(Posting text not attached — infer carefully from summary above only.)"}

---CANDIDATE PROFILE---
Name: ${name}
Current role: ${currentRole}${currentCompany ? ` at ${currentCompany}` : ""}
Experience summary: ${experience}
Skills: ${skills}
Summary: ${profile?.summary || ""}
Notable experience bullets (if any): ${formatExperienceBullets(profile)}

Instructions:
1) Infer what you reasonably can about the company and role from the posting (mission, product, stack, stage). Do not invent facts; tie claims to posting language or safe generalities.
2) Open with a hook that ties the company's stated needs to the candidate's specific proof points (metrics, scale, technologies).
3) Middle: 2 short sections or one dense section mapping 3–4 requirements to concrete achievements (technologies, outcomes, leadership, scale).
4) Address any obvious gap honestly as eagerness to deepen in X, backed by adjacent experience — do not lie.
5) Close with a confident, specific interest in this team/role (not generic).
6) Optional "Dear Hiring Manager" / sign-off is allowed for paste-into-form fields; if the field is plain text only, you may omit formal letter headers.
7) Target 350–500 words for smart mode (more depth than a standard letter).
8) Return ONLY the cover letter body text — no JSON, no markdown code fences.`;
}

function formatExperienceBullets(profile) {
  const ex = profile?.experience;
  if (!Array.isArray(ex) || !ex.length) return "";
  return ex
    .slice(0, 3)
    .map((e) => {
      const h = Array.isArray(e.highlights) ? e.highlights.slice(0, 2).join(" | ") : "";
      return [e.title, e.company, h].filter(Boolean).join(" — ");
    })
    .filter(Boolean)
    .join("\n");
}

// ─── Find Jobs (Perplexity) ──────────────────────────────────────

export function buildFindJobsPrompt(profile, preferences) {
  const title = profile?.currentTitle || "Software Engineer";
  const skills = Object.values(profile?.skills || {}).flat().slice(0, 10).join(", ");
  const location = preferences?.preferredLocations?.[0] || profile?.location || "";
  const remote = preferences?.remote === "true" ? "remote" : preferences?.remote === "false" ? "on-site" : "remote or on-site";
  const minSalary = preferences?.minSalary || "";

  return `Search for real, currently open job postings that match this profile. Focus on jobs posted in the last 7 days.

Profile:
- Title: ${title}
- Key Skills: ${skills}
- Location preference: ${location || "flexible"} (${remote})
${minSalary ? `- Minimum salary: ${minSalary}` : ""}

Find 6-8 relevant job postings. For each job, return a JSON array with objects:
[
  {
    "title": "Job Title",
    "company": "Company Name",
    "location": "City, State or Remote",
    "url": "direct URL to the job posting",
    "postedDate": "when it was posted",
    "salary": "salary range if mentioned",
    "match": "1-2 sentence reason why this matches the profile"
  }
]

Rules:
- Only include real, verifiable job postings with working URLs
- Prioritize jobs from LinkedIn, Indeed, company career pages
- Return ONLY the JSON array, no extra text`;
}

// ─── Tailored Resume (Experimental) ───────────────────────────────

export function buildTailorResumeSystem() {
  return `You are an expert résumé writer and ATS optimizer.

You will receive a JSON request that includes:
- Candidate profile JSON (source of truth)
- Candidate raw resume text (secondary source; may contain extra details)
- Job posting text + job meta

Return ONLY valid JSON (no markdown, no code fences, no extra text).
Do not invent facts. If a detail is not supported by the inputs, omit it or add a warning in meta.warnings.

Output MUST follow the TailoredResume schema described in the user message.`;
}

export function buildTailorResumePrompt(requestJson) {
  return `Generate a job-specific tailored resume as JSON.

---REQUEST JSON---
${JSON.stringify(requestJson, null, 2)}
---END REQUEST JSON---

Return a JSON object with this exact structure (keys required unless marked optional):
{
  "schemaVersion": 1,
  "meta": {
    "generatedAt": "<ISO timestamp>",
    "jobPostingKey": "<optional stable key if provided>",
    "model": "<model id string if known, else empty string>",
    "warnings": ["<strings; include any uncertainty or omissions>"]
  },
  "basics": {
    "name": "<full name>",
    "email": "<email or empty>",
    "phone": "<phone or empty>",
    "location": "<location or empty>",
    "links": {
      "linkedin": "<optional>",
      "github": "<optional>",
      "portfolio": "<optional>",
      "website": "<optional>"
    }
  },
  "headline": "<1 line, role-aligned>",
  "summaryBullets": ["<3-6 bullets, impact-focused, truthful>"],
  "skills": {
    "categories": {
      "<Category>": ["Skill1", "Skill2"]
    },
    "topKeywords": ["<ATS keywords relevant to the job, drawn from posting + candidate truth>"]
  },
  "experience": [
    {
      "title": "",
      "company": "",
      "location": "",
      "startDate": "",
      "endDate": "",
      "bullets": ["<4-8 bullets, quantified when supported>"]
    }
  ],
  "projects": [],
  "education": [],
  "certifications": [],
  "additionalSections": {},
  "atsKeywords": ["<up to 40>"]
}

Rules:
- Keep content concise and ATS-friendly.
- Prefer the candidate's existing experience; reorder and rewrite bullets to match the job.
- If job requires something the candidate does not have, do NOT claim it. Add a warning in meta.warnings instead.
- Ensure JSON is strictly valid.`;
}

export function friendlyTailorResumeProviderHint() {
  return "To use this experimental feature, add an AI API key in Settings → API Configuration (OpenAI, Anthropic, Gemini, or Perplexity).";
}

// ─── ChatGPT / Claude profile JSON prompt (no API key path) ───

function profileGenerationDepthPreamble(depth) {
  const d = normalizeResumeProfileDepth(depth);
  const labels = {
    compact: "Essentials",
    standard: "Balanced",
    detailed: "Rich",
    comprehensive: "Complete",
  };
  return `Target depth: **${labels[d]}** (${d}). Follow the matching rules in the Rules section exactly.`;
}

export function buildProfileGenerationPrompt(resumeText, depth = "standard") {
  const d = normalizeResumeProfileDepth(depth);
  const rulesForChat = buildResumeParseRules(d)
    .replace(/^Rules \(depth:[^\n]*\n/, "")
    .replace(/Return ONLY the JSON object — no wrapping text\./g, "")
    .trim();

  return `I need you to parse my résumé into a structured JSON profile for a job-application assistant.

${profileGenerationDepthPreamble(d)}

---RESUME---
${resumeText}
---END RESUME---

Return ONLY a valid JSON object with this structure (fill from my résumé; use [] or "" where missing):
{
  "name": "Full Name",
  "firstName": "",
  "middleName": "",
  "lastName": "",
  "email": "",
  "phone": "",
  "dateOfBirth": "",
  "addressLine1": "",
  "addressLine2": "",
  "city": "",
  "postalCode": "",
  "location": "",
  "linkedinUrl": "",
  "githubUrl": "",
  "portfolioUrl": "",
  "currentTitle": "",
  "currentCompany": "",
  "headline": "",
  "summary": "",
  "yearsExperience": "",
  "keywords": "",
  "skills": {
    "Category Name": ["skill1", "skill2"]
  },
  "experience": [
    {
      "title": "",
      "company": "",
      "location": "",
      "startMonth": "January",
      "startYear": "2020",
      "endMonth": "March",
      "endYear": "2023",
      "isCurrentCompany": false,
      "industry": "",
      "highlights": ["achievement 1", "achievement 2"]
    }
  ],
  "education": [
    {
      "degree": "",
      "field": "",
      "institution": "",
      "year": "",
      "gpa": ""
    }
  ],
  "certifications": [{"name": "", "issuer": "", "year": ""}],
  "projects": [{"name": "", "description": "", "techStack": []}],
  "spokenLanguages": [{"language": "", "proficiency": ""}],
  "internships": [{"title": "", "company": "", "duration": ""}],
  "openSource": [{"name": "", "description": "", "url": ""}],
  "publications": [],
  "awards": [],
  "volunteer": [],
  "additionalSections": {}
}

Rules:
- For current jobs: set isCurrentCompany: true, endMonth: "", endYear: ""
- Split street or mailing addresses into addressLine1, addressLine2 (if any), city, and postalCode when the résumé includes them; use "location" for a short one-line place when that is all that appears.
- If the résumé includes date of birth, set dateOfBirth as YYYY-MM-DD when clear; otherwise "".
- For skills: use the same categories as my résumé (e.g. "Languages", "Frameworks", "Cloud & DevOps")
${rulesForChat}
- Return ONLY the JSON object, no explanation, no markdown code fences`;
}
