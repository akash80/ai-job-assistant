export const FIELD_PATTERNS = [
  { type: "first_name", regex: /first.?name|given.?name|fname/i, profileKey: "name", transform: "firstName" },
  { type: "last_name", regex: /last.?name|surname|family.?name|lname/i, profileKey: "name", transform: "lastName" },
  { type: "full_name", regex: /\bname\b|full.?name|your.?name|applicant.?name/i, profileKey: "name" },
  { type: "email", regex: /email|e-mail/i, profileKey: "email" },
  { type: "phone", regex: /phone|mobile|tel|cell|contact.?num/i, profileKey: "phone" },
  { type: "location", regex: /location|city|address|where.?you/i, profileKey: "location" },
  { type: "linkedin", regex: /linkedin/i, profileKey: "linkedinUrl" },
  { type: "github", regex: /github/i, profileKey: "githubUrl" },
  { type: "portfolio", regex: /portfolio|website|personal.?url|blog/i, profileKey: "portfolioUrl" },
  { type: "salary", regex: /salary|compensation|ctc|expected.?pay|desired.?pay/i, answerKey: "expected_salary" },
  { type: "experience_years", regex: /year.?of.?exp|total.?exp|experience/i, profileKey: "yearsExperience" },
  { type: "notice_period", regex: /notice.?period|notice/i, answerKey: "notice_period" },
  { type: "start_date", regex: /start.?date|available|earliest.?date|join/i, answerKey: "start_date" },
  { type: "current_company", regex: /current.?company|present.?employer/i, profileKey: "currentCompany" },
  { type: "current_title", regex: /current.?title|current.?role|designation/i, profileKey: "currentTitle" },
  { type: "headline", regex: /headline|tagline|professional.?title/i, profileKey: "headline" },
  { type: "education", regex: /education|degree|university|college/i, profileKey: "educationText" },
  { type: "skills", regex: /skills|technologies|tech.?stack|competenc/i, profileKey: "skillsText" },
  { type: "certifications", regex: /certif|license|accredit/i, profileKey: "certificationsText" },
  { type: "languages_spoken", regex: /language.?spoken|language.?profic|fluent/i, profileKey: "spokenLanguagesText" },
  { type: "cover_letter", regex: /cover.?letter|motivation|why.?apply|why.?interested/i, answerKey: "cover_letter" },
  { type: "referral", regex: /referr|hear.?about|how.?did.?you/i, answerKey: "referral_source" },
  { type: "visa_status", regex: /visa|sponsorship|authorized|work.?permit/i, answerKey: "visa_status" },
  { type: "relocate", regex: /relocat|willing.?to.?move/i, answerKey: "willing_to_relocate" },
  { type: "gender", regex: /gender|sex/i, answerKey: "gender" },
  { type: "ethnicity", regex: /ethnic|race|demographic/i, answerKey: "ethnicity" },
  { type: "veteran", regex: /veteran|military/i, answerKey: "veteran_status" },
  { type: "disability", regex: /disabilit/i, answerKey: "disability_status" },
  { type: "resume_upload", regex: /resume|cv|curriculum/i },
];

export const FIELD_SELECTORS = [
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="image"]):not([type="reset"])',
  "textarea",
  "select",
  '[contenteditable="true"]',
  '[role="textbox"]',
  '[role="combobox"]',
].join(", ");

export const FILE_INPUT_SELECTOR = 'input[type="file"]';

export const KEYBOARD_NEIGHBORS = {
  a: "sqwz", b: "vghn", c: "xdfv", d: "sfce", e: "rdw",
  f: "dgcv", g: "fhtb", h: "gjyn", i: "uojk", j: "hkun",
  k: "jlim", l: "kop", m: "njk", n: "bhjm", o: "iplk",
  p: "ol", q: "wa", r: "etf", s: "adwz", t: "rgy",
  u: "yij", v: "cfgb", w: "qase", x: "zsdc", y: "tuh",
  z: "asx",
};
