/**
 * Local keyword-based job analyzer — works without any API key.
 * Uses synonym expansion and TF-IDF-like scoring for reasonable accuracy.
 */

// Common skill synonyms for better matching
const SYNONYMS = {
  "javascript": ["js", "ecmascript", "es6", "es2015"],
  "typescript": ["ts"],
  "python": ["py"],
  "java": ["jdk", "jvm", "java 8", "java 11", "java 17", "java 21"],
  "kubernetes": ["k8s"],
  "docker": ["containerization", "containers"],
  "postgresql": ["postgres", "psql"],
  "mongodb": ["mongo"],
  "react": ["reactjs", "react.js"],
  "angular": ["angularjs"],
  "vue": ["vuejs", "vue.js"],
  "node": ["nodejs", "node.js"],
  "machine learning": ["ml", "artificial intelligence"],
  "artificial intelligence": ["ai", "machine learning"],
  "amazon web services": ["aws"],
  "google cloud": ["gcp", "google cloud platform"],
  "microsoft azure": ["azure"],
  "continuous integration": ["ci", "ci/cd"],
  "continuous deployment": ["cd", "ci/cd"],
  "spring boot": ["spring", "springboot"],
  "microservices": ["microservice", "micro-services"],
  "restful": ["rest", "rest api", "rest apis"],
  "graphql": ["graph ql"],
  "redis": ["cache", "caching"],
  "kafka": ["apache kafka", "message queue"],
  "elasticsearch": ["elastic search", "elk"],
  "terraform": ["infrastructure as code", "iac"],
  "git": ["github", "gitlab", "version control"],
  "sql": ["mysql", "postgresql", "oracle", "mssql", "database"],
  "nosql": ["mongodb", "cassandra", "dynamodb"],
};

// Build reverse synonym map
const REVERSE_SYNONYMS = {};
for (const [canonical, syns] of Object.entries(SYNONYMS)) {
  for (const syn of syns) {
    REVERSE_SYNONYMS[syn] = canonical;
  }
}

// Common stop words to ignore when extracting keywords
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have",
  "in", "is", "it", "its", "of", "on", "or", "that", "the", "this", "to", "was",
  "we", "were", "will", "with", "you", "your", "our", "their", "they", "not",
  "but", "if", "do", "does", "can", "all", "been", "would", "should", "could",
  "may", "might", "must", "shall", "should", "also", "more", "other", "than",
  "then", "there", "these", "those", "what", "when", "where", "which", "who",
  "work", "team", "strong", "ability", "skills", "skill", "experience", "years",
  "required", "preferred", "plus", "minimum", "least", "including", "within",
  "across", "using", "knowledge", "understanding", "familiar", "familiarity",
  "proficiency", "proficient", "excellent", "good", "great", "solid",
  "looking", "seeking", "join", "help", "build", "develop", "support", "manage",
  "responsible", "responsibilities", "qualifications", "requirements", "nice",
  "like", "such", "etc", "amp", "eg", "ie",
]);

// Weight boosts for terms appearing in key sections
const SECTION_WEIGHTS = {
  required: 2.0,
  must: 2.0,
  essential: 2.0,
  mandatory: 2.0,
  preferred: 1.2,
  desired: 1.2,
  bonus: 0.8,
  optional: 0.8,
};

/**
 * Main local analysis function.
 * Returns same shape as the AI analysis response.
 */
export function analyzeJobLocally(jobText, profile) {
  const jobTokens = extractTokens(jobText);
  const profileTokens = extractProfileTokens(profile);

  const jobKeywords = scoreKeywords(jobTokens, jobText);
  const profileSet = new Set(profileTokens.map(normalize));

  // Match job keywords against profile
  const matched = [];
  const missing = [];

  for (const [kw, score] of jobKeywords) {
    const normKw = normalize(kw);
    const expandedKw = REVERSE_SYNONYMS[normKw] || normKw;

    const isMatch =
      profileSet.has(normKw) ||
      profileSet.has(expandedKw) ||
      [...profileSet].some((pk) => {
        const expandedPk = REVERSE_SYNONYMS[pk] || pk;
        return expandedPk === normKw || expandedPk === expandedKw ||
               pk === normKw || pk === expandedKw ||
               // substring match for compound skills
               (normKw.length > 4 && (pk.includes(normKw) || normKw.includes(pk)));
      }) ||
      // Check synonyms of the job keyword against profile
      (SYNONYMS[normKw] || []).some((syn) => profileSet.has(normalize(syn)));

    if (isMatch) {
      matched.push({ keyword: kw, score });
    } else {
      missing.push({ keyword: kw, score });
    }
  }

  // Calculate match score
  const totalWeight = jobKeywords.reduce((sum, [, s]) => sum + s, 0);
  const matchedWeight = matched.reduce((sum, { score }) => sum + score, 0);
  const rawScore = totalWeight > 0 ? Math.round((matchedWeight / totalWeight) * 100) : 0;
  const matchScore = Math.min(95, rawScore); // cap at 95 — local analysis can't be 100% accurate

  // Build strengths from matched high-value keywords
  const strengths = matched
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ keyword }) => `${capitalize(keyword)} — found in your profile`);

  // Build missing from top unmatched keywords
  const missingSkills = missing
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ keyword }) => capitalize(keyword));

  // Derive recommendation
  let recommendation = "Consider";
  let reason = "Your profile partially matches this job's requirements.";
  if (matchScore >= 75) {
    recommendation = "Apply";
    reason = "Strong keyword match between your profile and this job posting.";
  } else if (matchScore < 40) {
    recommendation = "Skip";
    reason = "Low keyword overlap between your profile and this job's requirements.";
  }

  // Extract job title and company heuristically
  const { job_title, company, location, job_type, salary_range } = extractJobMeta(jobText);

  return {
    match_score: matchScore,
    strengths: strengths.length > 0 ? strengths : ["Profile has relevant experience"],
    missing_skills: missingSkills,
    recommendation,
    reason,
    job_title,
    company,
    key_requirements: jobKeywords.slice(0, 5).map(([kw]) => capitalize(kw)),
    experience_match: `Keyword-based match: ${matchScore}% of detected skills found in profile`,
    salary_range,
    location,
    job_type,
    _local: true, // flag to indicate this is a local analysis
  };
}

function extractTokens(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s\/\.\+\#]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function extractProfileTokens(profile) {
  const tokens = [];
  // Skills
  const skills = profile?.skills || {};
  for (const category of Object.values(skills)) {
    if (Array.isArray(category)) {
      for (const skill of category) tokens.push(...String(skill).toLowerCase().split(/[\s,\/]+/).filter(Boolean));
    }
  }
  // Skills text flat
  if (profile?.skillsText) {
    tokens.push(...profile.skillsText.toLowerCase().split(/[\s,\/]+/).filter(Boolean));
  }
  // Keywords
  if (profile?.keywords) {
    tokens.push(...profile.keywords.toLowerCase().split(/[\s,\/]+/).filter(Boolean));
  }
  // Current title
  if (profile?.currentTitle) {
    tokens.push(...profile.currentTitle.toLowerCase().split(/\s+/).filter(Boolean));
  }
  // Experience highlights and titles
  for (const exp of (profile?.experience || [])) {
    if (exp.title) tokens.push(...exp.title.toLowerCase().split(/\s+/).filter(Boolean));
    for (const h of (exp.highlights || [])) {
      tokens.push(...String(h).toLowerCase().split(/\s+/).filter(Boolean));
    }
  }
  return tokens.filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function scoreKeywords(tokens, fullText) {
  const lower = fullText.toLowerCase();

  // Count unigrams
  const counts = {};
  for (const tok of tokens) {
    counts[tok] = (counts[tok] || 0) + 1;
  }

  // Also try bigrams (e.g. "spring boot", "machine learning")
  for (let i = 0; i < tokens.length - 1; i++) {
    const bigram = `${tokens[i]} ${tokens[i + 1]}`;
    if (!STOP_WORDS.has(tokens[i]) && !STOP_WORDS.has(tokens[i + 1])) {
      counts[bigram] = (counts[bigram] || 0) + 0.5; // bigrams get half credit per occurrence
    }
  }

  // Remove very common or very rare terms
  const entries = Object.entries(counts).filter(([kw, cnt]) => {
    if (cnt < 1) return false;
    if (kw.length < 2) return false;
    if (STOP_WORDS.has(kw)) return false;
    return true;
  });

  // Score = frequency * section_weight boost
  const scored = entries.map(([kw, cnt]) => {
    let weight = 1.0;
    // Check if keyword appears near requirement-signal words
    for (const [signal, boost] of Object.entries(SECTION_WEIGHTS)) {
      const idx = lower.indexOf(kw);
      if (idx > 0) {
        const context = lower.slice(Math.max(0, idx - 80), idx + 80);
        if (context.includes(signal)) {
          weight = Math.max(weight, boost);
        }
      }
    }
    return [kw, cnt * weight];
  });

  // Sort by score descending, return top 30 keywords
  return scored
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);
}

function extractJobMeta(text) {
  const lower = text.toLowerCase();
  let job_title = "Unknown Position";
  let company = "Unknown Company";
  let location = "Not specified";
  let job_type = "Full-time";
  let salary_range = null;

  // Job type
  if (/\bpart[- ]time\b/.test(lower)) job_type = "Part-time";
  else if (/\bcontract\b/.test(lower)) job_type = "Contract";
  else if (/\binternship\b/.test(lower)) job_type = "Internship";
  else if (/\bfreelance\b/.test(lower)) job_type = "Freelance";

  // Remote detection
  if (/\bremote\b/.test(lower)) location = "Remote";
  else if (/\bhybrid\b/.test(lower)) location = "Hybrid";

  // Salary range (rough heuristic)
  const salaryMatch = text.match(/\$[\d,]+(?:\s*[-–]\s*\$[\d,]+)?(?:\s*(?:per year|\/yr|\/year|annually|k))?\b/i);
  if (salaryMatch) salary_range = salaryMatch[0];

  // Title: try first line that looks like a title
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 10)) {
    if (line.length > 5 && line.length < 100 && !/http|@|\.com/.test(line)) {
      job_title = line;
      break;
    }
  }

  return { job_title, company, location, job_type, salary_range };
}

function normalize(str) {
  return String(str || "").toLowerCase().trim().replace(/[^\w\s\.\+\#\/]/g, "").replace(/\s+/g, " ").trim();
}

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
