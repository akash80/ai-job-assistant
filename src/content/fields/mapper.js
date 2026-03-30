import { FIELD_PATTERNS } from "../../shared/field-patterns.js";

/** Workday / FKit: group keys like workExperience-4, ordered by first field in document order → 0..n */
function buildWorkExperienceGroupIndexMap(fields) {
  const keys = new Set();
  for (const el of fields) {
    const m = (el.id || "").match(/^(workExperience-\d+)--/i);
    if (m) keys.add(m[1]);
  }
  return sortGroupKeysByDomOrder(keys, fields, /^workExperience-\d+--/i);
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

export function classifyField(field, ctx = {}) {
  const wdExp = classifyWorkdayWorkExperience(field, ctx.weIndexMap);
  if (wdExp) return wdExp;
  const wdEdu = classifyWorkdayEducation(field, ctx.eduIndexMap);
  if (wdEdu) return wdEdu;

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
    return profile.name.split(" ").slice(1).join(" ");
  }

  if (sourceType === "profileKey" && sourceKey && profile[sourceKey]) {
    return profile[sourceKey];
  }

  if (sourceType === "answerKey" && sourceKey && answers[sourceKey]) {
    return answers[sourceKey].value;
  }

  return null;
}

export function buildFillPlan(fields, profile, answers) {
  const plan = {
    totalFields: fields.length,
    knownFields: [],
    unknownFields: [],
    skippedFields: [],
    fileFields: [],
  };

  const ctx = {
    weIndexMap: buildWorkExperienceGroupIndexMap(fields),
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

    if (element.value && element.value.trim().length > 0) {
      plan.skippedFields.push({ element, reason: "already_filled", label });
      continue;
    }

    const value = resolveValue(classification, profile, answers);

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
