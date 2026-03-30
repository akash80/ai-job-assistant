import { FIELD_PATTERNS } from "../../shared/field-patterns.js";

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

export function classifyField(field) {
  const label = extractLabel(field).toLowerCase();
  const name = (field.name || "").toLowerCase();
  const id = (field.id || "").toLowerCase();
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

  for (const element of fields) {
    const classification = classifyField(element);
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
      plan.knownFields.push({
        element,
        fieldType: classification.type,
        label,
        value,
        confidence: classification.confidence,
        source: classification.sourceType === "profileKey" ? "profile" : "answers",
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
