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

export async function typeFast(element, text, options = {}) {
  const {
    minDelay = 5,
    maxDelay = 18,
    pauseAfterComma = 30,
    pauseAfterPeriod = 45,
  } = options;

  element.scrollIntoView({ behavior: "smooth", block: "center" });
  await sleep(randomBetween(40, 90));

  element.classList.add(FILL_ACTIVE_CLASS);
  element.focus();
  element.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  await sleep(randomBetween(10, 30));

  clearFieldValue(element);

  const s = String(text ?? "");
  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    await typeChar(element, char, minDelay, maxDelay);
    if (char === ",") await sleep(pauseAfterComma + Math.random() * 20);
    if (char === ".") await sleep(pauseAfterPeriod + Math.random() * 30);
  }

  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));
  element.classList.remove(FILL_ACTIVE_CLASS);
}

export async function fillBot(element, value) {
  element.scrollIntoView({ behavior: "auto", block: "center" });
  element.classList.add(FILL_ACTIVE_CLASS);
  element.focus();
  element.dispatchEvent(new FocusEvent("focus", { bubbles: true }));

  setNativeValue(element, String(value ?? ""));
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true }));

  element.classList.remove(FILL_ACTIVE_CLASS);
  return true;
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
  const base = Array.isArray(radioGroup) ? radioGroup : Array.from(radioGroup);
  let radios = base;
  if (base.length === 1 && base[0]?.name) {
    radios = Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(base[0].name)}"]`));
  }
  radios = radios.filter((r) => !r.disabled && isVisibleLike(r));
  const target = normalizeToken(targetValue);

  const match =
    radios.find((r) => normalizeToken(r.value) === target) ||
    radios.find((r) => normalizeToken(getLabelText(r)) === target) ||
    radios.find((r) => isBooleanEquivalent(target, normalizeToken(r.value), normalizeToken(getLabelText(r)))) ||
    radios.find((r) => {
      const valueTok = normalizeToken(r.value);
      const labelTok = normalizeToken(getLabelText(r));
      return valueTok.includes(target) || target.includes(valueTok) || labelTok.includes(target) || target.includes(labelTok);
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
  if (isHumanOnlyCheckbox(checkbox)) return false;
  if ((shouldCheck && !checkbox.checked) || (!shouldCheck && checkbox.checked)) {
    checkbox.scrollIntoView({ behavior: "smooth", block: "center" });
    await sleep(randomBetween(200, 500));
    checkbox.focus();
    checkbox.click();
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return true;
}

export async function fillFileInput(fileInput, base64Data, fileName, mimeType) {
  try {
    const byteChars = atob(base64Data);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const file = new File([byteArray], fileName, { type: mimeType });
    const targetInput = await resolveFileInputTarget(fileInput);
    if (!targetInput) return false;

    const dt = new DataTransfer();
    dt.items.add(file);
    targetInput.files = dt.files;

    targetInput.dispatchEvent(new Event("change", { bubbles: true }));
    targetInput.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  } catch (err) {
    console.error("Failed to fill file input:", err);
    return false;
  }
}

export async function fillField(element, value) {
  return fillFieldWithMode(element, value, "fast");
}

export async function fillFieldWithMode(element, value, fillMode = "fast") {
  if (Array.isArray(element)) {
    // Radio groups: Smart Form Fill passes the whole group to select the correct option.
    const first = element[0];
    const type = (first?.type || "text").toLowerCase();
    if (type === "radio") return fillRadio(element, value);
    return false;
  }
  const tagName = element.tagName.toLowerCase();
  const type = (element.type || "text").toLowerCase();

  if (tagName === "select") return fillSelect(element, value);
  if (type === "radio") return fillRadio([element], value);
  if (type === "checkbox") {
    const shouldCheck = /^(yes|true|1|y|checked)$/i.test(value);
    return fillCheckbox(element, shouldCheck);
  }

  if (element.getAttribute("contenteditable") === "true") {
    if (fillMode === "bot") {
      element.scrollIntoView({ behavior: "auto", block: "center" });
      element.focus();
      element.textContent = String(value ?? "");
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return fillContentEditableWithMode(element, value, fillMode);
  }

  if (isComboboxInput(element)) {
    return fillCombobox(element, value);
  }

  if (fillMode === "bot") return fillBot(element, value);
  if (fillMode === "fast") return typeFast(element, value);
  return typeHuman(element, value);
}

export async function executeFillPlan(plan, callbacks = {}, fillOptions = {}) {
  const { onFieldStart, onFieldComplete, onUnknownField, onComplete } = callbacks;
  const fillMode = fillOptions?.fillMode || "fast";
  let filled = 0;
  let skipped = 0;
  let errors = 0;
  const total = plan.knownFields.length + plan.unknownFields.length;

  for (let i = 0; i < plan.knownFields.length; i++) {
    const field = plan.knownFields[i];
    onFieldStart?.(field, filled, total);

    try {
      const ok = await fillFieldWithMode(field.element, field.value, fillMode);
      if (ok === false) {
        skipped++;
      } else {
        filled++;
      }
    } catch (err) {
      console.error(`Fill failed for ${field.fieldType}:`, err);
      errors++;
    }

    onFieldComplete?.(field, filled, total);
    if (fillMode === "bot") await sleep(randomBetween(0, 25));
    else if (fillMode === "fast") await sleep(randomBetween(40, 120));
    else await sleep(randomBetween(300, 800));
  }

  for (const field of plan.unknownFields) {
    const answer = await onUnknownField?.(field);
    if (answer) {
      try {
        const ok = await fillFieldWithMode(field.element, answer, fillMode);
        if (ok === false) {
          skipped++;
        } else {
          filled++;
        }
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

async function fillContentEditableWithMode(element, value, fillMode = "human") {
  element.scrollIntoView({ behavior: "smooth", block: "center" });
  if (fillMode === "fast") await sleep(randomBetween(30, 60));
  else await sleep(randomBetween(200, 400));
  element.focus();
  element.textContent = "";

  const s = String(value ?? "");
  for (const char of s) {
    document.execCommand("insertText", false, char);
    if (fillMode === "fast") await sleep(randomBetween(5, 16));
    else await sleep(randomBetween(30, 90));
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
  const options = Array.from(selectElement.options).filter((o) => !o.disabled);
  const target = normalizeToken(targetValue);
  const candidateOptions = options.filter((o) => !isPlaceholderOption(o));
  const pool = candidateOptions.length > 0 ? candidateOptions : options;

  let match = pool.find(
    (o) => normalizeToken(o.value) === target || normalizeToken(o.textContent) === target,
  );
  if (match) return match;

  match = pool.find(
    (o) =>
      normalizeToken(o.textContent).includes(target) ||
      target.includes(normalizeToken(o.textContent)),
  );
  if (match) return match;

  match = pool.find((o) => isBooleanEquivalent(target, normalizeToken(o.value), normalizeToken(o.textContent)));
  if (match) return match;

  // Fuzzy score: token overlap for "United States" vs "USA", "Immediate" vs "As soon as possible", etc.
  let best = null;
  let bestScore = 0;
  for (const o of pool) {
    const s = scoreOptionMatch(target, `${normalizeToken(o.value)} ${normalizeToken(o.textContent)}`);
    if (s > bestScore) {
      best = o;
      bestScore = s;
    }
  }
  if (best && bestScore >= 0.45) {
    return best;
  }

  return null;
}

function normalizeToken(v) {
  return String(v || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function isHumanOnlyCheckbox(checkbox) {
  try {
    const label = getLabelText(checkbox);
    const ariaLabel = checkbox.getAttribute("aria-label") || "";
    const ariaLabelledBy = checkbox.getAttribute("aria-labelledby") || "";
    const describedBy = checkbox.getAttribute("aria-describedby") || "";

    const labelledByText = ariaLabelledBy
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent || "")
      .join(" ");

    const describedByText = describedBy
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent || "")
      .join(" ");

    const containerText =
      checkbox.closest("label, .field, .form-field, .application-field, .application-question, li, div, td, form")?.textContent ||
      "";

    const haystack = normalizeToken([label, ariaLabel, labelledByText, describedByText, containerText].filter(Boolean).join(" "));

    // Never auto-click acknowledgements / legal consent / marketing opt-ins; users should confirm those manually.
    return /(privacy\s+notice|privacy\s+policy|terms\s+of\s+use|terms\s+and\s+conditions|consent|i\s+agree|i\s+have\s+read|acknowledge|attest|certif|authorize|opt\s*in|receive\s+(transactional|marketing)|marketing\s+(text|sms|email)|text\s+messages|sms\s+messages|email\s+messages|employment\s+opportunit)/.test(
      haystack,
    );
  } catch {
    return false;
  }
}

function isPlaceholderOption(option) {
  const val = normalizeToken(option.value);
  const txt = normalizeToken(option.textContent);
  if (!val) return true;
  return /^(select|choose|--|please select|pick one)$/.test(txt);
}

function isBooleanEquivalent(target, optionValue, optionLabel) {
  const yesSet = new Set(["yes", "y", "true", "1", "authorized", "allowed", "available"]);
  const noSet = new Set(["no", "n", "false", "0", "not authorized", "not available"]);
  if (yesSet.has(target)) {
    return yesSet.has(optionValue) || yesSet.has(optionLabel);
  }
  if (noSet.has(target)) {
    return noSet.has(optionValue) || noSet.has(optionLabel);
  }
  return false;
}

function scoreOptionMatch(target, candidate) {
  if (!target || !candidate) return 0;
  const t = new Set(target.split(" ").filter(Boolean));
  const c = new Set(candidate.split(" ").filter(Boolean));
  if (t.size === 0 || c.size === 0) return 0;
  let overlap = 0;
  for (const tok of t) {
    if (c.has(tok)) overlap++;
  }
  return overlap / Math.max(t.size, c.size);
}

function isVisibleLike(el) {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return !(el.offsetParent === null && style.position !== "fixed");
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

async function resolveFileInputTarget(element) {
  if (element?.tagName?.toLowerCase() === "input" && (element.type || "").toLowerCase() === "file") {
    return element;
  }

  // Try nearby first.
  const nearby = findNearbyFileInput(element);
  if (nearby) return nearby;

  // Trigger custom uploader and then look for revealed/created file input.
  const before = new Set(Array.from(document.querySelectorAll('input[type="file"]')));
  try {
    element?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    await sleep(randomBetween(120, 240));
    element?.click?.();
    element?.dispatchEvent?.(new Event("click", { bubbles: true }));
  } catch {
    // ignore click failures
  }

  for (let i = 0; i < 8; i++) {
    await sleep(120);
    const candidate = findNearbyFileInput(element) || findNewFileInput(before);
    if (candidate) return candidate;
  }
  return null;
}

function findNearbyFileInput(element) {
  const root = element?.closest?.(".attachmentField, .attachWrapper, form, td, div") || element?.parentElement || document;
  const inRoot = root.querySelector?.('input[type="file"]:not([disabled])');
  if (inRoot) return inRoot;
  return null;
}

function findNewFileInput(beforeSet) {
  const all = Array.from(document.querySelectorAll('input[type="file"]:not([disabled])'));
  const created = all.find((el) => !beforeSet.has(el));
  if (created) return created;
  return all.find((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== "none" || style.visibility !== "hidden";
  }) || null;
}

function isComboboxInput(el) {
  const role = (el.getAttribute("role") || "").toLowerCase();
  const hasOwnedList = !!el.getAttribute("aria-owns");
  const cls = (el.className || "").toLowerCase();
  const dqa = (el.getAttribute("data-qa") || "").toLowerCase();
  if (role === "combobox" || hasOwnedList || cls.includes("paginatedselect")) return true;
  // Greenhouse / Momentum-style location: typeahead + hidden JSON backing field
  if (cls.includes("location-input") || dqa === "location-input") return true;
  if (hasSelectedLocationHiddenSibling(el)) return true;
  return false;
}

/** True when a hidden selectedLocation (or #selected-location) lives in the same field block as this input. */
function hasSelectedLocationHiddenSibling(input) {
  const t = (input.type || "").toLowerCase();
  if (t !== "text" && t !== "search") return false;
  const scope = input.closest(".application-field, .application-question, form, li, div") || input.parentElement;
  if (!scope) return false;
  return !!scope.querySelector(
    "input#selected-location[type=\"hidden\"], input[type=\"hidden\"][name=\"selectedLocation\"]",
  );
}

async function fillCombobox(input, targetValue) {
  const target = String(targetValue || "").trim();
  if (!target) return false;

  input.scrollIntoView({ behavior: "smooth", block: "center" });
  await sleep(randomBetween(150, 300));
  input.classList.add(FILL_ACTIVE_CLASS);
  input.focus();
  input.click();

  const openBtn = findLinkedComboboxButton(input);
  if (openBtn) {
    openBtn.click();
    await sleep(randomBetween(120, 250));
  }

  // SuccessFactors paginatedPicklist: the input's onkeydown/onkeyup both fire juic's _click
  // handler which toggles/resets the dropdown on every keypress. Typing would close the dropdown
  // before options can be selected. Instead, just wait for the pre-loaded option list.
  const isSFPicklist = (input.className || "").toLowerCase().includes("rcmpaginatedselectinput");
  if (!isSFPicklist) {
    // Type query so remote/paginated picklists can load candidate options.
    // NOTE: Lever/Momentum-style typeaheads often don't react to only setNativeValue + Event("input").
    // We simulate more realistic typing to trigger their listeners.
    await typeComboboxQuery(input, target);
    await sleep(randomBetween(220, 420));
  } else {
    // Give SF's juic framework time to open the dropdown and render options.
    await sleep(randomBetween(400, 700));
  }

  // Async location search widgets need time for .dropdown-results to populate.
  let options = await waitForComboboxOptions(input, target, 6500);

  // Try explicit option click first.
  const best = findBestComboboxOption(options, target);
  if (best) {
    best.scrollIntoView({ block: "nearest" });
    clickLikeUser(best);
    best.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(randomBetween(120, 260));
  } else {
    // Fallback keyboard selection for widgets that don't expose options accessibly.
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowDown", bubbles: true }));
    await sleep(randomBetween(80, 180));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    await sleep(randomBetween(120, 260));
  }

  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
  input.classList.remove(FILL_ACTIVE_CLASS);

  // Success if hidden backing field got value OR the visible input changed from empty/placeholder.
  const hidden = findLinkedHiddenField(input);
  if (hidden && String(hidden.value || "").trim()) return true;
  const current = String(input.value || "").trim().toLowerCase();
  return !!current && current !== "no selection";
}

function clickLikeUser(el) {
  try {
    el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  } catch {
    // ignore
  }
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  el.click();
}

async function typeComboboxQuery(input, text) {
  input.focus();
  input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
  clearFieldValue(input);

  const s = String(text ?? "");
  for (let i = 0; i < s.length; i++) {
    const char = s[i];
    input.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true }));

    setNativeValue(input, input.value + char);

    // Some widgets key off InputEvent details; fall back to Event if unsupported.
    try {
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: char, inputType: "insertText" }));
    } catch {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    input.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
    await sleep(randomBetween(8, 20));
  }
}

async function waitForComboboxOptions(input, targetValue, maxMs) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const opts = getComboboxOptions(input);
    if (opts.length > 0) {
      if (findBestComboboxOption(opts, targetValue)) return opts;
      // Location APIs often return one primary row.
      if (opts.length === 1) return opts;
      // Multiple rows: brief pause for list/network to finish, then use latest nodes.
      await sleep(220);
      const settled = getComboboxOptions(input);
      if (settled.length > 0) return settled;
    }
    await sleep(140);
  }
  return getComboboxOptions(input);
}

function findLinkedComboboxButton(input) {
  if (input.id) {
    const guessed = document.getElementById(input.id.replace("_input", "_selectButton"));
    if (guessed) return guessed;
  }
  const container = input.closest(".paginatedPicklistContainer, .fd-input-group, td, div");
  return container?.querySelector("button.rcmpaginatedselectbutton, button[aria-label], button.fd-select__button") || null;
}

function getComboboxOptions(input) {
  const listId = input.getAttribute("aria-owns");
  const listEl = listId ? document.getElementById(listId) : null;
  const fieldRoot = input.closest(".application-field, .application-question, form, li") || input.parentElement;
  const localDropdown = fieldRoot?.querySelector(".dropdown-results");

  if (listEl) {
    return collectComboboxOptionElements(listEl);
  }
  if (localDropdown) {
    return Array.from(localDropdown.children).filter((el) => normalizeToken(el.textContent).length > 0);
  }
  return collectComboboxOptionElements(document);
}

function collectComboboxOptionElements(root) {
  return Array.from(
    root.querySelectorAll(
      '[role="option"], li[role="option"], .fd-list__item, .ui-select-list-item, li, div[aria-selected]',
    ),
  ).filter((el) => normalizeToken(el.textContent).length > 0);
}

function findBestComboboxOption(options, targetValue) {
  const target = normalizeToken(targetValue);
  let match = options.find((o) => normalizeToken(o.textContent) === target);
  if (match) return match;
  match = options.find((o) => normalizeToken(o.textContent).includes(target) || target.includes(normalizeToken(o.textContent)));
  if (match) return match;

  let best = null;
  let bestScore = 0;
  for (const o of options) {
    const s = scoreOptionMatch(target, normalizeToken(o.textContent));
    if (s > bestScore) {
      bestScore = s;
      best = o;
    }
  }
  return bestScore >= 0.45 ? best : null;
}

function findLinkedHiddenField(input) {
  const cell = input.closest(".application-field, td, .sfCascadingPicklist, .paginatedPicklistContainer, div");
  if (!cell) return null;
  const preferred = cell.querySelector(
    "input#selected-location[type=\"hidden\"], input[type=\"hidden\"][name=\"selectedLocation\"]",
  );
  if (preferred) return preferred;
  // SuccessFactors/SF often mirrors combobox to hidden input used on submit.
  return cell.querySelector('input[type="hidden"][name^="tor__f"], input[type="hidden"][name], input[type="hidden"]');
}
