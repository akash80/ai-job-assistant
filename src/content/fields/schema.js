import { extractLabel, classifyField } from "./mapper.js";
import { groupRadioButtons } from "./detector.js";

function normalizeText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function clampText(s, maxLen = 240) {
  const t = normalizeText(s);
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1) + "…";
}

function safeLower(s) {
  return String(s || "").toLowerCase();
}

function stableHash32(input) {
  // Simple deterministic hash for stable field ids (not cryptographic).
  const str = String(input || "");
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

function computeDomPath(el) {
  try {
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 6) {
      const tag = safeLower(node.tagName);
      let idx = 0;
      let sib = node;
      while ((sib = sib.previousElementSibling)) {
        if (safeLower(sib.tagName) === tag) idx++;
      }
      parts.unshift(`${tag}[${idx}]`);
      node = node.parentElement;
      depth++;
    }
    return parts.join(">");
  } catch {
    return "";
  }
}

function buildFieldId(field, extraSignals = "") {
  const id = normalizeText(field.id);
  if (id) return `id:${id}`;
  const name = normalizeText(field.name);
  if (name) return `name:${name}`;
  const path = computeDomPath(field);
  const label = normalizeText(extractLabel(field));
  const type = safeLower(field.type || "text");
  const sig = `${type}|${label}|${extraSignals}|${path}`;
  return `h:${stableHash32(sig)}`;
}

function getDescribedByText(field) {
  try {
    const ids = normalizeText(field.getAttribute("aria-describedby")).split(" ").filter(Boolean);
    if (ids.length === 0) return "";
    const parts = ids.map((id) => document.getElementById(id)?.textContent || "").filter(Boolean);
    return clampText(parts.join(" "));
  } catch {
    return "";
  }
}

function getNearestHintText(field) {
  try {
    const container = field.closest("fieldset, [role='group'], .form-group, .field, .field-container, .input-group") || field.parentElement;
    if (!container) return "";
    const raw = container.textContent || "";
    return clampText(raw, 260);
  } catch {
    return "";
  }
}

function extractSelectOptions(selectEl) {
  return Array.from(selectEl?.options || []).map((o) => {
    return {
      value: normalizeText(o?.value),
      label: clampText(o?.textContent || "", 120),
      disabled: Boolean(o?.disabled),
    };
  }).filter((o) => o.value || o.label);
}

function extractRadioOptions(group) {
  const out = [];
  for (const el of group) {
    const label = normalizeText(extractLabel(el)) || clampText(el.getAttribute("aria-label") || "", 120);
    const value = normalizeText(el.value);
    out.push({ value: value || label, label: label || value, disabled: Boolean(el.disabled) });
  }
  // De-dupe by case-insensitive label/value pair.
  const seen = new Set();
  const uniq = [];
  for (const opt of out) {
    const k = `${safeLower(opt.value)}|${safeLower(opt.label)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(opt);
  }
  return uniq;
}

/**
 * Build a compact, AI-friendly schema describing the form fields.
 * Returns both:
 * - schema: JSON-serializable structure safe to send to background/AI
 * - indexById: in-memory mapping of fieldId -> DOM element(s) for applying a plan
 */
export function buildSmartFormSchema(fields = []) {
  const { radioGroups, otherFields } = groupRadioButtons(fields);
  const indexById = {};
  const schemaFields = [];

  // Radio groups become a single schema field.
  for (const [name, group] of Object.entries(radioGroups || {})) {
    const first = group?.[0];
    if (!first) continue;
    const label = normalizeText(extractLabel(first));
    const options = extractRadioOptions(group);
    const fieldId = buildFieldId(first, `radio:${name}`);
    indexById[fieldId] = group;
    const classification = classifyField(first, {});
    schemaFields.push({
      fieldId,
      kind: "radio_group",
      tagName: "input",
      inputType: "radio",
      name: normalizeText(name),
      id: normalizeText(first.id),
      label: clampText(label, 140),
      placeholder: "",
      autocomplete: clampText(first.getAttribute("autocomplete") || "", 80),
      required: Boolean(first.required) || first.getAttribute("aria-required") === "true",
      describedBy: getDescribedByText(first),
      nearbyText: getNearestHintText(first),
      options,
      classification: { type: classification.type, confidence: Number(classification.confidence || 0) },
    });
  }

  for (const el of otherFields) {
    if (!el) continue;
    const tagName = safeLower(el.tagName);
    const inputType = safeLower(el.type || (tagName === "textarea" ? "textarea" : "text"));
    const label = normalizeText(extractLabel(el)) || normalizeText(el.getAttribute("aria-label"));
    const fieldId = buildFieldId(el, `${tagName}:${inputType}`);
    indexById[fieldId] = el;

    const classification = classifyField(el, {});
    const base = {
      fieldId,
      kind: tagName === "select" ? "select" : tagName === "textarea" ? "textarea" : "input",
      tagName,
      inputType,
      name: normalizeText(el.name),
      id: normalizeText(el.id),
      label: clampText(label, 140),
      placeholder: clampText(el.placeholder || "", 140),
      autocomplete: clampText(el.getAttribute("autocomplete") || "", 80),
      required: Boolean(el.required) || el.getAttribute("aria-required") === "true",
      describedBy: getDescribedByText(el),
      nearbyText: getNearestHintText(el),
      maxLength: Number(el.maxLength || 0) > 0 ? Number(el.maxLength) : null,
      classification: { type: classification.type, confidence: Number(classification.confidence || 0) },
    };

    if (tagName === "select") {
      schemaFields.push({ ...base, options: extractSelectOptions(el) });
      continue;
    }

    if (inputType === "checkbox") {
      schemaFields.push({
        ...base,
        options: [
          { value: "yes", label: "Yes", disabled: false },
          { value: "no", label: "No", disabled: false },
        ],
      });
      continue;
    }

    schemaFields.push(base);
  }

  // Keep schema stable in ordering.
  schemaFields.sort((a, b) => a.fieldId.localeCompare(b.fieldId));

  return {
    schema: {
      version: 1,
      pageUrl: window.location.href,
      fieldCount: schemaFields.length,
      fields: schemaFields,
    },
    indexById,
  };
}

