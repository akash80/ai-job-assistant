export const FIELD_PATTERNS = [
  { type: "first_name", regex: /first.?name|given.?name|fname/i, profileKey: "firstName" },
  { type: "middle_name", regex: /middle\b|middle.?name|mid.?name|middle initial|mname/i, profileKey: "middleName" },
  { type: "last_name", regex: /last.?name|surname|family.?name|lname/i, profileKey: "lastName" },
  // Do NOT use a generic /\bname\b/ match; it breaks "Middle Name" fields.
  { type: "full_name", regex: /full.?name|applicant.?name|your.?name/i, profileKey: "name" },
  { type: "email", regex: /email|e-mail/i, profileKey: "email" },
  { type: "phone", regex: /phone|mobile|tel|cell|contact.?num/i, profileKey: "phone" },
  {
    type: "date_of_birth",
    regex: /\bdate\s*of\s*birth\b|\bd\.?o\.?b\.?\b|\bbirth\s*date\b|\bdate\s*born\b/i,
    profileKey: "dateOfBirth",
  },
  {
    type: "address_line_2",
    regex:
      /\baddress\s*line\s*2\b|\baddress2\b|\baddr2\b|(^|\s)apt\.?\b|\bapartment\b|\bsuite\b|\bflat\b/i,
    profileKey: "addressLine2",
  },
  {
    type: "address_line_1",
    regex:
      /\baddress\s*line\s*1\b|\bstreet\s*address\b|\bmailing\s*address\b|\baddress1\b|\baddr1\b|\bstreet\s*1\b|\bstreet\s*name\b/i,
    profileKey: "addressLine1",
  },
  { type: "postal_code", regex: /\bpostal\b|\bzip\s*code\b|\bpin\s*code\b|\bpostcode\b|\bzip\b|\bpincode\b/i, profileKey: "postalCode" },
  { type: "city", regex: /\bcity\b|\btown\b/i, profileKey: "city" },
  { type: "location", regex: /\blocation\b|\bwhere.?you|city\s*\/\s*state|state\s*\/\s*city|region\b/i, profileKey: "location" },
  { type: "linkedin", regex: /linkedin/i, profileKey: "linkedinUrl" },
  { type: "github", regex: /github/i, profileKey: "githubUrl" },
  { type: "portfolio", regex: /portfolio|website|personal.?url|blog/i, profileKey: "portfolioUrl" },
  { type: "salary", regex: /salary|compensation|ctc|expected.?pay|desired.?pay/i, answerKey: "expected_salary" },
  // Do NOT use a bare /experience/i match — Workday IDs like "workExperience-4--jobTitle" contain
  // "experience" as a substring and would be misclassified as years-of-experience.
  {
    type: "experience_years",
    regex:
      /year(?:s)?\s+of\s+(?:work\s+)?experience|total\s+(?:work\s+)?experience|total\s+exp|years?\s+of\s+exp|how\s+many\s+years|years?\s+in\s+industry/i,
    profileKey: "yearsExperience",
  },
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
