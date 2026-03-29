import { sleep, randomBetween } from "../../shared/utils.js";
import { KEYBOARD_NEIGHBORS } from "../../shared/field-patterns.js";

const FILL_ACTIVE_CLASS = "ja-filling-active";

export async function typeHuman(element, text, options = {}) {
  const {
    minDelay = 30,
    maxDelay = 90,
    mistakeRate = 0.02,
    pauseAfterComma = 200,
    pauseAfterPeriod = 300,
  } = options;

  element.scrollIntoView({ behavior: "smooth", block: "center" });
  await sleep(randomBetween(200, 400));

  element.classList.add(FILL_ACTIVE_CLASS);

  await sleep(randomBetween(100, 300));
  element.focus();
  element.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  await sleep(randomBetween(50, 150));

  clearFieldValue(element);

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (Math.random() < mistakeRate && i > 0 && i < text.length - 1) {
      const typo = getRandomNearbyKey(char);
      await typeChar(element, typo, minDelay, maxDelay);
      await sleep(randomBetween(100, 200));
      await deleteLastChar(element);
      await sleep(randomBetween(50, 100));
    }

    await typeChar(element, char, minDelay, maxDelay);

    if (char === ",") await sleep(pauseAfterComma + Math.random() * 100);
    if (char === ".") await sleep(pauseAfterPeriod + Math.random() * 150);
    if (Math.random() < 0.05) await sleep(randomBetween(200, 500));
  }

  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
  element.classList.remove(FILL_ACTIVE_CLASS);
}

export async function fillSelect(selectElement, targetValue) {
  const option = findBestOption(selectElement, targetValue);
  if (!option) return false;

  selectElement.scrollIntoView({ behavior: "smooth", block: "center" });
  await sleep(randomBetween(200, 400));

  selectElement.classList.add(FILL_ACTIVE_CLASS);
  selectElement.focus();
  selectElement.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  await sleep(randomBetween(200, 400));

  selectElement.value = option.value;
  selectElement.dispatchEvent(new Event("change", { bubbles: true }));
  selectElement.dispatchEvent(new Event("input", { bubbles: true }));
  selectElement.dispatchEvent(new Event("blur", { bubbles: true }));

  selectElement.classList.remove(FILL_ACTIVE_CLASS);
  return true;
}

export async function fillRadio(radioGroup, targetValue) {
  const radios = Array.isArray(radioGroup) ? radioGroup : Array.from(radioGroup);
  const target = targetValue.toLowerCase();

  const match =
    radios.find((r) => r.value.toLowerCase() === target) ||
    radios.find((r) => {
      const label = getLabelText(r).toLowerCase();
      return label.includes(target) || target.includes(label);
    });

  if (match) {
    match.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(randomBetween(200, 500));
    match.focus();
    match.click();
    match.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  return false;
}

export async function fillCheckbox(checkbox, shouldCheck) {
  if ((shouldCheck && !checkbox.checked) || (!shouldCheck && checkbox.checked)) {
    checkbox.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(randomBetween(200, 500));
    checkbox.focus();
    checkbox.click();
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

export async function fillFileInput(fileInput, base64Data, fileName, mimeType) {
  try {
    const byteChars = atob(base64Data);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const file = new File([byteArray], fileName, { type: mimeType });

    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;

    fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    fileInput.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  } catch (err) {
    console.error("Failed to fill file input:", err);
    return false;
  }
}

export async function fillField(element, value) {
  const tagName = element.tagName.toLowerCase();
  const type = (element.type || "text").toLowerCase();

  if (tagName === "select") return fillSelect(element, value);
  if (type === "radio") return fillRadio([element], value);
  if (type === "checkbox") {
    const shouldCheck = /^(yes|true|1|y|checked)$/i.test(value);
    return fillCheckbox(element, shouldCheck);
  }

  if (element.getAttribute("contenteditable") === "true") {
    return fillContentEditable(element, value);
  }

  return typeHuman(element, value);
}

export async function executeFillPlan(plan, callbacks = {}) {
  const { onFieldStart, onFieldComplete, onUnknownField, onComplete } = callbacks;
  let filled = 0;
  let skipped = 0;
  let errors = 0;
  const total = plan.knownFields.length + plan.unknownFields.length;

  for (let i = 0; i < plan.knownFields.length; i++) {
    const field = plan.knownFields[i];
    onFieldStart?.(field, filled, total);

    try {
      await fillField(field.element, field.value);
      filled++;
    } catch (err) {
      console.error(`Fill failed for ${field.fieldType}:`, err);
      errors++;
    }

    onFieldComplete?.(field, filled, total);
    await sleep(randomBetween(300, 800));
  }

  for (const field of plan.unknownFields) {
    const answer = await onUnknownField?.(field);
    if (answer) {
      try {
        await fillField(field.element, answer);
        filled++;
      } catch (err) {
        console.error(`Fill failed for unknown ${field.fieldType}:`, err);
        errors++;
      }
    } else {
      skipped++;
    }
  }

  const stats = { filled, skipped, errors, total };
  onComplete?.(stats);
  return stats;
}

async function typeChar(element, char, minDelay, maxDelay) {
  const delay = randomBetween(minDelay, maxDelay);

  element.dispatchEvent(
    new KeyboardEvent("keydown", { key: char, code: `Key${char.toUpperCase()}`, bubbles: true }),
  );
  element.dispatchEvent(
    new KeyboardEvent("keypress", { key: char, code: `Key${char.toUpperCase()}`, bubbles: true }),
  );

  setNativeValue(element, element.value + char);
  element.dispatchEvent(new Event("input", { bubbles: true }));

  element.dispatchEvent(
    new KeyboardEvent("keyup", { key: char, code: `Key${char.toUpperCase()}`, bubbles: true }),
  );

  await sleep(delay);
}

async function deleteLastChar(element) {
  element.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Backspace", code: "Backspace", bubbles: true }),
  );

  setNativeValue(element, element.value.slice(0, -1));
  element.dispatchEvent(new Event("input", { bubbles: true }));

  element.dispatchEvent(
    new KeyboardEvent("keyup", { key: "Backspace", code: "Backspace", bubbles: true }),
  );

  await sleep(randomBetween(30, 60));
}

async function fillContentEditable(element, value) {
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  await sleep(randomBetween(200, 400));
  element.focus();
  element.textContent = "";

  for (const char of value) {
    document.execCommand("insertText", false, char);
    await sleep(randomBetween(30, 90));
  }
}

function setNativeValue(element, value) {
  const proto =
    element.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

  if (nativeSetter) {
    nativeSetter.call(element, value);
  } else {
    element.value = value;
  }
}

function clearFieldValue(element) {
  if (element.value) {
    setNativeValue(element, "");
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

function findBestOption(selectElement, targetValue) {
  const options = Array.from(selectElement.options);
  const target = targetValue.toLowerCase();

  let match = options.find(
    (o) => o.value.toLowerCase() === target || o.textContent.trim().toLowerCase() === target,
  );
  if (match) return match;

  match = options.find(
    (o) =>
      o.textContent.trim().toLowerCase().includes(target) ||
      target.includes(o.textContent.trim().toLowerCase()),
  );
  if (match) return match;

  const yesRe = /^(yes|y|true|1)$/i;
  const noRe = /^(no|n|false|0)$/i;

  if (yesRe.test(target)) {
    match = options.find((o) => yesRe.test(o.value) || yesRe.test(o.textContent.trim()));
    if (match) return match;
  }
  if (noRe.test(target)) {
    match = options.find((o) => noRe.test(o.value) || noRe.test(o.textContent.trim()));
    if (match) return match;
  }

  return null;
}

function getRandomNearbyKey(char) {
  const lower = char.toLowerCase();
  const neighbors = KEYBOARD_NEIGHBORS[lower];
  if (!neighbors) return char;
  const random = neighbors[Math.floor(Math.random() * neighbors.length)];
  return char === char.toUpperCase() ? random.toUpperCase() : random;
}

function getLabelText(el) {
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.textContent.trim();
  }
  const parent = el.closest("label");
  if (parent) return parent.textContent.trim();
  return "";
}
