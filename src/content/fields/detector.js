import { FIELD_SELECTORS, FILE_INPUT_SELECTOR } from "../../shared/field-patterns.js";

export function detectFields() {
  const elements = document.querySelectorAll(FIELD_SELECTORS);
  return Array.from(elements).filter(isVisible).filter(isInteractable);
}

export function detectFileInputs() {
  const fileInputs = Array.from(document.querySelectorAll(FILE_INPUT_SELECTOR)).filter((el) => !el.disabled);
  const customUploadTriggers = detectCustomResumeUploadTriggers();
  return dedupeElements([...fileInputs, ...customUploadTriggers]);
}

function isVisible(el) {
  if (el.type === "hidden") return false;
  if (el.offsetParent === null && getComputedStyle(el).position !== "fixed") return false;

  const style = window.getComputedStyle(el);
  if (style.display === "none") return false;
  if (style.visibility === "hidden") return false;
  if (parseFloat(style.opacity) === 0) return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;

  return true;
}

function isInteractable(el) {
  if (el.disabled) return false;
  if (el.readOnly) return false;
  if (el.getAttribute("aria-disabled") === "true") return false;
  return true;
}

function detectCustomResumeUploadTriggers() {
  const containers = Array.from(
    document.querySelectorAll(
      ".attachmentField, .attachWrapper, [class*='attachment'], [id*='attach']",
    ),
  );
  const out = [];

  for (const c of containers) {
    const text = c.textContent?.toLowerCase() || "";
    if (!/(resume|cv|curriculum\s+vitae|upload\s+a\s+cv|upload\s+resume)/i.test(text)) continue;

    const trigger =
      c.querySelector("input[type='file']") ||
      c.querySelector(".addAttachments") ||
      c.querySelector(".attachActions [role='button']") ||
      c.querySelector(".attachActions") ||
      c.querySelector(".attachmentBtn") ||
      c.querySelector(".attachmentLabel") ||
      c.querySelector("[role='button']");

    if (trigger && isVisible(trigger)) out.push(trigger);
  }

  return out;
}

function dedupeElements(elements) {
  const seen = new Set();
  const out = [];
  for (const el of elements) {
    if (!el) continue;
    if (seen.has(el)) continue;
    seen.add(el);
    out.push(el);
  }
  return out;
}

export function groupRadioButtons(fields) {
  const radios = {};
  const others = [];

  for (const el of fields) {
    if (el.type === "radio" && el.name) {
      if (!radios[el.name]) radios[el.name] = [];
      radios[el.name].push(el);
    } else {
      others.push(el);
    }
  }

  return { radioGroups: radios, otherFields: others };
}
