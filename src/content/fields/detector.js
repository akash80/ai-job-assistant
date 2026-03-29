import { FIELD_SELECTORS, FILE_INPUT_SELECTOR } from "../../shared/field-patterns.js";

export function detectFields() {
  const elements = document.querySelectorAll(FIELD_SELECTORS);
  return Array.from(elements).filter(isVisible).filter(isInteractable);
}

export function detectFileInputs() {
  const fileInputs = document.querySelectorAll(FILE_INPUT_SELECTOR);
  return Array.from(fileInputs).filter((el) => !el.disabled);
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
