import { FIELD_PATTERNS } from "../../shared/field-patterns.js";

/** Workday / FKit: group keys like workExperience-4, ordered by first field in document order → 0..n */
function buildWorkExperienceGroupIndexMap(fields, profile) {
  const keys = new Set();
  for (const el of fields) {
    const m = (el.id || "").match(/^(workExperience-\d+)--/i);
    if (m) keys.add(m[1]);
  }

  const domOrderMap = sortGroupKeysByDomOrder(keys, fields, /^workExperience-\d+--/i);
  const experience = Array.isArray(profile?.experience) ? profile.experience : [];
  if (experience.length <= 1 || domOrderMap.size <= 1) return domOrderMap;

  // Try to map Workday blocks to profile.experience entries using already-filled values in the DOM.
  // This avoids "block order != resume order" issues when multiple experiences exist and some fields are missing.
  const groupSignals = collectWorkdayExperienceGroupSignals(fields, [...keys]);
  const assignments = assignGroupsToExperiences(groupSignals, experience);

  // Merge: use match-based mapping when we have a confident assignment, else fallback to DOM order.
  const out = new Map();
  for (const [groupKeyLower, domIdx] of domOrderMap.entries()) {
    const assigned = assignments.get(groupKeyLower);
    out.set(groupKeyLower, Number.isFinite(assigned) ? assigned : domIdx);
  }
  return out;
}

function buildEducationGroupIndexMap(fields) {
  const keys = new Set();
  for (const el of fields) {
    const m = (el.id || "").match(/^(education-\d+)--/i);
    if (m) keys.add(m[1]);
  }
  return sortGroupKeysByDomOrder(keys, fields, /^education-\d+--/i);
}

function sortGroupKeysByDomOrder(groupKeys, fields, idPrefixRegex) {
  const map = new Map();
  const sorted = [...groupKeys].sort((a, b) => {
    const elA = fields.find((f) => idPrefixRegex.test(f.id || "") && (f.id || "").startsWith(`${a}--`));
    const elB = fields.find((f) => idPrefixRegex.test(f.id || "") && (f.id || "").startsWith(`${b}--`));
    if (!elA || !elB) return 0;
    const pos = elA.compareDocumentPosition(elB);
    if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });
  sorted.forEach((g, i) => map.set(g.toLowerCase(), i));
  return map;
}

function normalizeToken(v) {
  return String(v || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function getFieldValue(field) {
  if (!field) return "";
  const tag = String(field.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return String(field.value || "").trim();
  if (field.getAttribute?.("contenteditable") === "true") return String(field.textContent || "").trim();
  return String(field.value || field.textContent || "").trim();
}

function collectWorkdayExperienceGroupSignals(fields, groupKeys) {
  const byGroup = new Map();
  for (const groupKey of groupKeys) {
    byGroup.set(groupKey.toLowerCase(), { company: "", title: "", startYear: "", endYear: "" });
  }

  for (const el of fields) {
    const id = el.id || "";
    const m = id.match(/^(workExperience-\d+)--/i);
    if (!m) continue;
    const groupLower = m[1].toLowerCase();
    const sig = byGroup.get(groupLower);
    if (!sig) continue;

    if (/--companyname$/i.test(id)) sig.company = getFieldValue(el);
    else if (/--jobtitle$/i.test(id)) sig.title = getFieldValue(el);
    else if (/--startDate-dateSectionYear-input$/i.test(id)) sig.startYear = getFieldValue(el);
    else if (/--endDate-dateSectionYear-input$/i.test(id)) sig.endYear = getFieldValue(el);
  }

  return byGroup;
}

function scoreExperienceMatch(signal, exp) {
  const sCompany = normalizeToken(signal.company);
  const sTitle = normalizeToken(signal.title);
  const sStartYear = normalizeToken(signal.startYear);
  const sEndYear = normalizeToken(signal.endYear);

  const eCompany = normalizeToken(exp?.company);
  const eTitle = normalizeToken(exp?.title);
  const eStartYear = normalizeToken(exp?.startYear);
  const eEndYear = normalizeToken(exp?.endYear);

  let score = 0;
  let matchedSignals = 0;

  if (sCompany) {
    matchedSignals++;
    if (sCompany === eCompany) score += 6;
    else if (eCompany && (eCompany.includes(sCompany) || sCompany.includes(eCompany))) score += 4;
    else score -= 1;
  }

  if (sTitle) {
    matchedSignals++;
    if (sTitle === eTitle) score += 4;
    else if (eTitle && (eTitle.includes(sTitle) || sTitle.includes(eTitle))) score += 2;
    else score -= 1;
  }

  if (sStartYear) {
    matchedSignals++;
    if (sStartYear === eStartYear) score += 2;
    else if (eStartYear && (eStartYear.includes(sStartYear) || sStartYear.includes(eStartYear))) score += 1;
    else score -= 1;
  }

  if (sEndYear) {
    matchedSignals++;
    if (sEndYear === eEndYear) score += 2;
    else if (eEndYear && (eEndYear.includes(sEndYear) || sEndYear.includes(eEndYear))) score += 1;
    else score -= 1;
  }

  return { score, matchedSignals };
}

function assignGroupsToExperiences(groupSignals, experiences) {
  const candidates = [];
  for (const [groupKeyLower, sig] of groupSignals.entries()) {
    const sigTok = {
      company: normalizeToken(sig.company),
      title: normalizeToken(sig.title),
      startYear: normalizeToken(sig.startYear),
      endYear: normalizeToken(sig.endYear),
    };
    const hasAnySignal = !!(sigTok.company || sigTok.title || sigTok.startYear || sigTok.endYear);
    if (!hasAnySignal) continue;

    for (let i = 0; i < experiences.length; i++) {
      const { score, matchedSignals } = scoreExperienceMatch(sig, experiences[i]);
      candidates.push({ groupKeyLower, expIndex: i, score, matchedSignals });
    }
  }

  // Greedy one-to-one assignment by best score first.
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.matchedSignals !== a.matchedSignals) return b.matchedSignals - a.matchedSignals;
    return a.expIndex - b.expIndex;
  });

  const usedGroups = new Set();
  const usedExp = new Set();
  const out = new Map();

  for (const c of candidates) {
    if (usedGroups.has(c.groupKeyLower) || usedExp.has(c.expIndex)) continue;
    // Require at least some positive evidence; otherwise let DOM order decide.
    if (c.score < 3) continue;
    usedGroups.add(c.groupKeyLower);
    usedExp.add(c.expIndex);
    out.set(c.groupKeyLower, c.expIndex);
  }

  return out;
}

/**
 * Workday repeating work experience blocks: map IDs to profile.experience[index].
 */
function classifyWorkdayWorkExperience(field, weIndexMap) {
  if (!weIndexMap?.size) return null;
  const id = field.id || "";
  const idLower = id.toLowerCase();

  const group = id.match(/^(workExperience-\d+)--/i);
  if (!group) return null;
  const groupKey = group[1].toLowerCase();
  const expIndex = weIndexMap.get(groupKey);
  if (expIndex === undefined) return null;

  if (/--jobtitle$/i.test(id)) {
    return { type: "workday_exp", confidence: 0.95, sourceType: "workday", expIndex, expKind: "title" };
  }
  if (/--companyname$/i.test(id)) {
    return { type: "workday_exp", confidence: 0.95, sourceType: "workday", expIndex, expKind: "company" };
  }
  if (/--location$/i.test(id) && /workExperience-/i.test(id)) {
    return { type: "workday_exp", confidence: 0.95, sourceType: "workday", expIndex, expKind: "location" };
  }
  if (/--roledescription$/i.test(id)) {
    return { type: "workday_exp", confidence: 0.95, sourceType: "workday", expIndex, expKind: "description" };
  }
  if (/--currentlyworkhere$/i.test(id)) {
    return { type: "workday_exp", confidence: 0.95, sourceType: "workday", expIndex, expKind: "current" };
  }

  let m = id.match(/--(startDate|endDate)-dateSectionMonth-input$/i);
  if (m) {
    const kind = m[1].toLowerCase() === "startdate" ? "startMonth" : "endMonth";
    return { type: "workday_exp", confidence: 0.95, sourceType: "workday", expIndex, expKind: kind };
  }
  m = id.match(/--(startDate|endDate)-dateSectionYear-input$/i);
  if (m) {
    const kind = m[1].toLowerCase() === "startdate" ? "startYear" : "endYear";
    return { type: "workday_exp", confidence: 0.95, sourceType: "workday", expIndex, expKind: kind };
  }

  return null;
}

/**
 * Workday repeating education blocks: map to profile.education[index].
 */
function classifyWorkdayEducation(field, eduIndexMap) {
  if (!eduIndexMap?.size) return null;
  const id = field.id || "";

  const group = id.match(/^(education-\d+)--/i);
  if (!group) return null;
  const groupKey = group[1].toLowerCase();
  const eduIndex = eduIndexMap.get(groupKey);
  if (eduIndex === undefined) return null;

  if (/--schoolname$/i.test(id)) {
    return { type: "workday_edu", confidence: 0.95, sourceType: "workday", eduIndex, eduKind: "institution" };
  }
  if (/--fieldofstudy$/i.test(id)) {
    return { type: "workday_edu", confidence: 0.95, sourceType: "workday", eduIndex, eduKind: "field" };
  }
  if (/--gradeaverage$/i.test(id)) {
    return { type: "workday_edu", confidence: 0.95, sourceType: "workday", eduIndex, eduKind: "gpa" };
  }
  if (/--degree$/i.test(id)) {
    return { type: "workday_edu", confidence: 0.95, sourceType: "workday", eduIndex, eduKind: "degree" };
  }
  if (/--firstyearattended-datesectionyear-input$/i.test(id)) {
    return { type: "workday_edu", confidence: 0.95, sourceType: "workday", eduIndex, eduKind: "startYear" };
  }
  if (/--lastyearattended-datesectionyear-input$/i.test(id)) {
    return { type: "workday_edu", confidence: 0.95, sourceType: "workday", eduIndex, eduKind: "endYear" };
  }

  return null;
}

function parseMonthToNumber(month) {
  if (month == null || month === "") return null;
  const s = String(month).trim().toLowerCase();
  if (/^\d{1,2}$/.test(s)) {
    const n = parseInt(s, 10);
    return n >= 1 && n <= 12 ? n : null;
  }
  const names = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  for (let i = 0; i < names.length; i++) {
    if (names[i] === s || names[i].startsWith(s) || s.length >= 3 && names[i].startsWith(s.slice(0, 3))) {
      return i + 1;
    }
  }
  return null;
}

function resolveWorkdayExperienceValue(classification, profile) {
  const { expIndex, expKind } = classification;
  const exp = profile.experience?.[expIndex];
  if (!exp) return null;

  switch (expKind) {
    case "title":
      return exp.title || null;
    case "company":
      return exp.company || null;
    case "location":
      return exp.location || null;
    case "description": {
      const h = exp.highlights;
      if (Array.isArray(h) && h.length) return h.join("\n");
      return null;
    }
    case "current":
      return exp.isCurrentCompany ? "yes" : "no";
    case "startMonth": {
      const n = parseMonthToNumber(exp.startMonth);
      return n != null ? String(n) : null;
    }
    case "endMonth": {
      if (exp.isCurrentCompany) return null;
      const n = parseMonthToNumber(exp.endMonth);
      return n != null ? String(n) : null;
    }
    case "startYear":
      return exp.startYear != null && exp.startYear !== "" ? String(exp.startYear) : null;
    case "endYear":
      if (exp.isCurrentCompany) return null;
      return exp.endYear != null && exp.endYear !== "" ? String(exp.endYear) : null;
    default:
      return null;
  }
}

function resolveWorkdayEducationValue(classification, profile) {
  const { eduIndex, eduKind } = classification;
  const edu = profile.education?.[eduIndex];
  if (!edu) return null;

  switch (eduKind) {
    case "institution":
      return edu.institution || null;
    case "field":
      return edu.field || null;
    case "gpa":
      return edu.gpa || null;
    case "degree":
      return edu.degree || null;
    case "startYear":
      return edu.startYear != null && edu.startYear !== ""
        ? String(edu.startYear)
        : edu.year != null && edu.year !== ""
          ? String(edu.year)
          : null;
    case "endYear":
      return edu.endYear != null && edu.endYear !== "" ? String(edu.endYear) : null;
    default:
      return null;
  }
}

export function extractLabel(field) {
  // Lever "Additional Questions" use inputs named like: cards[<uuid>][field0]
  // The human-visible question text lives in a hidden baseTemplate JSON field:
  // cards[<uuid>][baseTemplate] → { fields: [ { text: "Question?" }, ... ] }
  const leverCardLabel = tryExtractLeverCardLabel(field);
  if (leverCardLabel) return leverCardLabel;

  const sources = [
    () => {
      if (field.id) {
        const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
        if (label) return label.textContent.trim();
      }
    },
    () => {
      const parent = field.closest("label");
      if (parent) {
        const clone = parent.cloneNode(true);
        clone.querySelectorAll("input, select, textarea").forEach((el) => el.remove());
        return clone.textContent.trim();
      }
    },
    () => {
      // Lever/Momentum-style markup: label is often a sibling div, not a <label>.
      const q = field.closest(".application-question, li, div");
      const labelEl = q?.querySelector?.(".application-label .text, .application-label");
      const text = labelEl?.textContent?.trim();
      if (text && text.length < 200) return text;
    },
    () => field.getAttribute("aria-label"),
    () => {
      const id = field.getAttribute("aria-labelledby");
      if (id) return document.getElementById(id)?.textContent.trim();
    },
    () => field.placeholder,
    () => {
      const name = field.name;
      if (name) return name.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").trim();
    },
    () => {
      const prev = field.previousElementSibling;
      if (prev && ["LABEL", "SPAN", "P", "DIV"].includes(prev.tagName)) {
        const text = prev.textContent.trim();
        if (text.length < 200) return text;
      }
    },
  ];

  for (const source of sources) {
    const result = source();
    if (result && result.length > 0 && result.length < 200) return result;
  }

  return "";
}

function tryExtractLeverCardLabel(field) {
  const name = field?.getAttribute?.("name") || "";
  const m = name.match(/^cards\[([0-9a-f-]{36})\]\[field(\d+)\]$/i);
  if (!m) return null;
  const cardId = m[1];
  const fieldIndex = parseInt(m[2], 10);
  if (!Number.isFinite(fieldIndex) || fieldIndex < 0) return null;

  const baseTemplate = document.querySelector(`input[type="hidden"][name="cards[${CSS.escape(cardId)}][baseTemplate]"]`);
  const raw = baseTemplate?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const question = parsed?.fields?.[fieldIndex]?.text;
    const text = typeof question === "string" ? question.trim() : "";
    return text && text.length < 200 ? text : null;
  } catch {
    return null;
  }
}

export function classifyField(field, ctx = {}) {
  const wdExp = classifyWorkdayWorkExperience(field, ctx.weIndexMap);
  if (wdExp) return wdExp;
  const wdEdu = classifyWorkdayEducation(field, ctx.eduIndexMap);
  if (wdEdu) return wdEdu;

  // Avoid misclassifying "Phone Device Type" (Mobile/Landline) dropdowns as actual phone number fields.
  if (field?.tagName?.toLowerCase() === "select") {
    try {
      const label = extractLabel(field).toLowerCase();
      const name = (field.name || "").toLowerCase();
      const id = (field.id || "").toLowerCase();
      const placeholder = (field.placeholder || "").toLowerCase();
      const autocomplete = (field.getAttribute("autocomplete") || "").toLowerCase();
      const signals = `${label} ${name} ${id} ${placeholder} ${autocomplete}`;
      const optionText = Array.from(field.options || []).map((o) => (o.textContent || "").toLowerCase()).join(" ");
      const hasDeviceTypeSignal = /device\s*type/.test(signals);
      const hasMobileLandline = /\bmobile\b/.test(optionText) && /\blandline\b/.test(optionText);
      if (hasDeviceTypeSignal && hasMobileLandline) {
        return { type: "unknown", confidence: 0, sourceType: null, sourceKey: null, transform: null };
      }
    } catch {
      // ignore classifier heuristics failures
    }
  }

  const label = extractLabel(field).toLowerCase();
  const name = (field.name || "").toLowerCase();
  const id = (field.id || "").toLowerCase();
  // Unhandled Workday education-*--* fields must not match generic /education/ (educationText blob).
  if (/education-\d+--/i.test(id)) {
    return { type: "unknown", confidence: 0, sourceType: null, sourceKey: null, transform: null };
  }
  // Unhandled workExperience-*--* must not match generic patterns (e.g. location → home address).
  if (/workExperience-\d+--/i.test(id)) {
    return { type: "unknown", confidence: 0, sourceType: null, sourceKey: null, transform: null };
  }
  const placeholder = (field.placeholder || "").toLowerCase();
  const type = (field.type || "text").toLowerCase();
  const autocomplete = (field.getAttribute("autocomplete") || "").toLowerCase();

  const signals = `${label} ${name} ${id} ${placeholder} ${autocomplete}`;

  if (type === "email") return result("email", 0.95, "email", "profileKey");
  if ((type === "text" || type === "tel" || type === "number") && /\b(ext|extension|extn)\b/i.test(signals) && /\b(phone|tel|mobile|contact)\b/i.test(signals)) {
    return result("phone_extension", 0.92, "phone", "profileKey");
  }
  if (type === "tel") return result("phone", 0.95, "phone", "profileKey");
  if (type === "file") return result("resume_upload", 0.8, null, null);
  if (type === "url" && /linkedin/i.test(signals)) return result("linkedin", 0.9, "linkedinUrl", "profileKey");

  for (const pattern of FIELD_PATTERNS) {
    if (pattern.regex.test(signals)) {
      const sourceType = pattern.profileKey ? "profileKey" : pattern.answerKey ? "answerKey" : null;
      const sourceKey = pattern.profileKey || pattern.answerKey || null;
      return {
        type: pattern.type,
        confidence: calculateConfidence(signals, pattern.regex),
        sourceType,
        sourceKey,
        transform: pattern.transform || null,
      };
    }
  }

  return { type: "unknown", confidence: 0, sourceType: null, sourceKey: null, transform: null };
}

export function resolveValue(classification, profile, answers) {
  const { type, sourceType, sourceKey, transform } = classification;

  if (type === "workday_exp") {
    return resolveWorkdayExperienceValue(classification, profile);
  }
  if (type === "workday_edu") {
    return resolveWorkdayEducationValue(classification, profile);
  }

  if (transform === "firstName" && profile.name) {
    return profile.name.split(" ")[0];
  }
  if (transform === "lastName" && profile.name) {
    const parts = String(profile.name || "").trim().split(/\s+/).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : "";
  }

  if (sourceType === "profileKey" && sourceKey && profile[sourceKey]) {
    if (type === "phone") {
      const parsed = parsePhoneAndExtension(profile[sourceKey]);
      // If the page has a separate extension field, only fill the base 10-digit phone number here.
      if (answers?._pageHasPhoneExtensionField === true) return parsed.base10 || parsed.phone || null;
      return parsed.phone || null;
    }
    if (type === "phone_extension") {
      const parsed = parsePhoneAndExtension(profile[sourceKey]);
      return parsed.ext || null;
    }
    return profile[sourceKey];
  }

  if (sourceType === "answerKey" && sourceKey && answers[sourceKey]) {
    return answers[sourceKey].value;
  }

  return null;
}

export function buildFillPlan(fields, profile, answers, options = {}) {
  const overrideFilled = options.overrideFilled === true;
  const pageHasPhoneExtensionField = fields.some((el) => {
    try {
      const t = (el.type || "text").toLowerCase();
      if (t === "hidden") return false;
      if (!["text", "tel", "number"].includes(t)) return false;
      const label = extractLabel(el).toLowerCase();
      const name = (el.name || "").toLowerCase();
      const id = (el.id || "").toLowerCase();
      const placeholder = (el.placeholder || "").toLowerCase();
      const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase();
      const signals = `${label} ${name} ${id} ${placeholder} ${autocomplete}`;
      return /\b(ext|extension|extn)\b/i.test(signals) && /\b(phone|tel|mobile|contact)\b/i.test(signals);
    } catch {
      return false;
    }
  });

  const plan = {
    totalFields: fields.length,
    knownFields: [],
    unknownFields: [],
    skippedFields: [],
    fileFields: [],
  };

  const ctx = {
    weIndexMap: buildWorkExperienceGroupIndexMap(fields, profile),
    eduIndexMap: buildEducationGroupIndexMap(fields),
  };

  for (const element of fields) {
    const classification = classifyField(element, ctx);
    const label = extractLabel(element);

    if (element.type === "file") {
      const accept = (element.getAttribute("accept") || "").toLowerCase();
      const isResumeUpload = /resume|cv|curriculum/i.test(
        `${label} ${element.name || ""} ${element.id || ""}`
      ) || /\.pdf|application\/pdf/i.test(accept) || !accept;
      if (isResumeUpload) {
        plan.fileFields.push({ element, fieldType: "resume_upload", label });
      } else {
        plan.skippedFields.push({ element, reason: "file_upload_other", label });
      }
      continue;
    }

    if (element.type === "hidden") {
      plan.skippedFields.push({ element, reason: "hidden", label: "" });
      continue;
    }

    if (!overrideFilled && element.value && element.value.trim().length > 0) {
      plan.skippedFields.push({ element, reason: "already_filled", label });
      continue;
    }

    const mergedAnswers = { ...(answers || {}), _pageHasPhoneExtensionField: pageHasPhoneExtensionField };
    const value = resolveValue(classification, profile, mergedAnswers);

    if (value !== null) {
      const source =
        classification.sourceType === "profileKey"
          ? "profile"
          : classification.sourceType === "answerKey"
            ? "answers"
            : classification.sourceType === "workday"
              ? "profile"
              : "answers";
      plan.knownFields.push({
        element,
        fieldType: classification.type,
        label,
        value,
        confidence: classification.confidence,
        source,
      });
    } else if (classification.type === "middle_name" && !profile?.middleName) {
      // If middle name is not provided, explicitly leave the field empty
      // (even if it is marked required) instead of prompting the user.
      plan.skippedFields.push({ element, reason: "middle_name_empty", label });
    } else if (classification.type !== "unknown" || element.required || element.getAttribute("aria-required") === "true") {
      plan.unknownFields.push({
        element,
        fieldType: classification.type,
        label,
        placeholder: element.placeholder || "",
        isRequired: element.required || element.getAttribute("aria-required") === "true",
      });
    }
  }

  return plan;
}

function result(type, confidence, key, sourceType) {
  return { type, confidence, sourceType, sourceKey: key, transform: null };
}

function parsePhoneAndExtension(raw) {
  const s = String(raw || "").trim();
  if (!s) return { phone: "", base10: "", ext: "" };

  // Common extension formats: "x123", "ext 123", "extension: 123", "#123" (rare).
  const extMatch = s.match(/(?:\bext(?:ension)?\b|extn\b|x|#)\s*[:.\-]?\s*(\d{1,8})\b/i);
  const ext = extMatch ? extMatch[1] : "";

  const mainPart = extMatch ? s.slice(0, extMatch.index) : s;
  const digits = mainPart.replace(/\D/g, "");

  // Prefer last 10 digits (US-style) when length is longer due to country code.
  const base10 = digits.length >= 10 ? digits.slice(-10) : digits;
  return { phone: digits, base10, ext };
}

function calculateConfidence(signals, regex) {
  const parts = signals.split(/\s+/);
  let matchCount = 0;
  for (const part of parts) {
    if (regex.test(part)) matchCount++;
  }
  if (matchCount >= 3) return 0.95;
  if (matchCount >= 2) return 0.85;
  return 0.7;
}
