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
  "strengths": ["<matching skill/experience, max 5 items>"],
  "missing_skills": ["<required skill the candidate lacks, max 5 items>"],
  "recommendation": "Apply" | "Skip" | "Consider",
  "reason": "<1-2 sentence explanation>",
  "job_title": "<extracted job title>",
  "company": "<extracted company name or Unknown>",
  "key_requirements": ["<top 5 requirements from the posting>"],
  "experience_match": "<how candidate experience aligns, 1 sentence>",
  "salary_range": "<if mentioned, otherwise null>",
  "location": "<job location or Remote>",
  "job_type": "<Full-time | Part-time | Contract | Internship>"
}`;
}

export const RESUME_PARSE_SYSTEM = `You are an expert resume parsing AI. You can understand ANY resume format — whether it uses standard headings, creative layouts, different languages, or unconventional structures. Your job is to intelligently extract ALL information from the resume into structured JSON. Return ONLY valid JSON — no markdown, no code fences, no explanation.`;

export function buildResumeParsePrompt(resumeText) {
  return `Parse this resume intelligently. The resume may use ANY format, ANY headings, ANY structure. Extract everything you find.

---RESUME TEXT---
${resumeText}
---END---

Return a JSON object. Use the structure below as a GUIDE, but you MUST also:
- Include ANY additional sections the resume contains (awards, publications, volunteer, hobbies, references, etc.) in the "additionalSections" object
- The resume may use non-standard headings (e.g. "What I Do" instead of "Experience", "Tools I Use" instead of "Skills", "My Work" instead of "Projects"). Understand the INTENT and map it correctly.
- Skill categories are dynamic — if the resume groups skills differently, mirror those groups
- If a section doesn't exist in the resume, use an empty array [] or empty string ""

{
  "name": "",
  "email": "",
  "phone": "",
  "location": "",
  "linkedinUrl": "",
  "githubUrl": "",
  "portfolioUrl": "",
  "otherLinks": [{"label": "", "url": ""}],
  "currentTitle": "",
  "headline": "",
  "summary": "",
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
}

Rules:
1. Extract EVERY piece of information — miss nothing
2. Skills categories should match what the resume uses (e.g. if resume says "Languages" and "Frameworks" use those; if it says "Technical Skills" and "Soft Skills", use those)
3. For years of experience, calculate from earliest job start to now
4. Keep highlight bullets concise (1 line each, max 4 per role)
8. For experience dates: use "startMonth" (e.g. "April"), "startYear" (e.g. "2025"), "endMonth", "endYear". If current job, set isCurrentCompany: true, endMonth: "", endYear: ""
9. For internships: also use startMonth/startYear/endMonth/endYear if dates are available, otherwise use "duration"
5. "additionalSections" captures anything that doesn't fit the standard fields (awards, publications, volunteer work, hobbies, references, patents, speaking engagements, etc.)
6. If certifications have issuer/year info, include it. If they're just names, put name only
7. Return ONLY the JSON object — no wrapping text`;
}

export const VALIDATION_PROMPT_MESSAGE = "Reply with exactly: OK";
