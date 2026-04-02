import { detectFields, detectFileInputs } from "./fields/detector.js";
import { isHoneypotTrapField } from "./fields/field-trap.js";

function normText(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function lower(s) {
  return normText(s).toLowerCase();
}

function isVisibleClickable(el) {
  if (!el || typeof el !== "object") return false;
  if (el.closest?.("#ja-extension-root,[data-ja-extension]")) return false;
  if (el.disabled) return false;
  if (el.getAttribute?.("aria-disabled") === "true") return false;
  try {
    const rect = el.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) return false;
  } catch {
    // ignore
  }
  return true;
}

function getElText(el) {
  const aria = el.getAttribute?.("aria-label");
  const title = el.getAttribute?.("title");
  const value = el.value;
  const txt = el.textContent;
  return normText(aria || title || value || txt || "");
}

export function findApplyCta() {
  const candidates = Array.from(document.querySelectorAll(
    "button, a, [role='button'], input[type='button'], input[type='submit']",
  )).filter(isVisibleClickable);

  const scored = candidates.map((el) => {
    const t = lower(getElText(el));
    if (!t) return { el, score: 0, t };
    if (t.includes("apply assist")) return { el, score: 0, t };
    if (!/\bapply\b/.test(t)) return { el, score: 0, t };

    // Prefer strong CTAs.
    let score = 5;
    if (/\bapply now\b/.test(t)) score += 2;
    if (/\bstart\b.*\bapplication\b/.test(t)) score += 2;
    if (/\bcontinue\b/.test(t)) score += 1;
    if (/\bsign in\b|\blog in\b|\bjoin\b/.test(t)) score -= 3;
    if (/\bwith linkedin\b|\bwith indeed\b|\bwith google\b/.test(t)) score -= 1;

    // Prefer actual buttons over generic links.
    const tag = String(el.tagName || "").toLowerCase();
    if (tag === "button" || (tag === "input" && (el.type === "submit" || el.type === "button"))) score += 1;

    return { el, score, t };
  }).filter((x) => x.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.el || null;
}

function getFieldHints(el) {
  const pieces = [];
  if (!el) return "";
  const attrs = ["name", "id", "aria-label", "placeholder", "autocomplete"];
  for (const a of attrs) pieces.push(el.getAttribute?.(a));
  try {
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label?.textContent) pieces.push(label.textContent);
    }
  } catch {
    // ignore
  }
  const wrapLabel = el.closest?.("label");
  if (wrapLabel?.textContent) pieces.push(wrapLabel.textContent);
  const fieldsetLegend = el.closest?.("fieldset")?.querySelector?.("legend")?.textContent;
  if (fieldsetLegend) pieces.push(fieldsetLegend);
  return lower(pieces.filter(Boolean).join(" "));
}

function isNoiseField(el, hints) {
  const type = lower(el?.type);
  const tag = lower(el?.tagName);
  const s = hints || getFieldHints(el);

  if (isHoneypotTrapField(el)) return true;

  if (type === "hidden") return true;
  if (type === "search") return true;
  if (tag === "textarea" && /\bsearch\b/.test(s)) return true;

  // Common "not an application form" inputs (newsletter, login, marketing).
  if (/\bnewsletter\b|\bsubscribe\b|\bmarketing\b|\bpromo\b|\bdiscount\b/.test(s)) return true;
  if (/\bpassword\b|\bsign in\b|\blog in\b|\bcreate account\b/.test(s)) return true;
  if (/\bcaptcha\b|\brecaptcha\b/.test(s)) return true;

  // Cookie / consent / preferences
  if (/\bcookie\b|\bconsent\b|\bprivacy\b/.test(s)) return true;

  return false;
}

function isStrongApplicationField(el, hints) {
  const type = lower(el?.type);
  const tag = lower(el?.tagName);
  const s = hints || getFieldHints(el);

  if (type === "file") return true;
  if (/\bresume\b|\bcv\b|\bcover letter\b|\bportfolio\b|\blinkedin\b|\bgithub\b|\bwebsite\b/.test(s)) return true;
  if (/\bwork experience\b|\bemployment\b|\beducation\b|\buniversity\b|\bdegree\b/.test(s)) return true;
  if (/\baddress\b|\bcity\b|\bstate\b|\bzip\b|\bpostal\b|\bcountry\b/.test(s)) return true;
  if (/\bdate\s*of\s*birth\b|\bdob\b|\bbirth\s*date\b/.test(s)) return true;
  if (/\bphone\b|\bmobile\b/.test(s)) return true;
  if (/\bsponsorship\b|\bwork authorization\b|\bvisa\b/.test(s)) return true;
  if (/\bsalary\b|\bcompensation\b|\bnotice period\b|\bavailability\b|\bstart date\b/.test(s)) return true;

  // Long freeform answers are common in real applications.
  if (tag === "textarea" && !/\bsearch\b/.test(s)) return true;

  return false;
}

export function isLikelyApplicationForm(fields, fileInputs) {
  const fs = Array.isArray(fields) ? fields : detectFields();
  const files = Array.isArray(fileInputs) ? fileInputs : detectFileInputs();
  if (files.length > 0) return true;

  let relevant = 0;
  let strong = 0;
  let emailLike = 0;

  for (const el of fs) {
    const hints = getFieldHints(el);
    if (isNoiseField(el, hints)) continue;

    const type = lower(el?.type);
    if (type === "email" || /\bemail\b/.test(hints)) emailLike += 1;

    relevant += 1;
    if (isStrongApplicationField(el, hints)) strong += 1;
  }

  // Avoid treating "email capture" and other tiny forms as job applications.
  if (relevant <= 2 && emailLike >= 1) return false;
  if (relevant <= 3 && strong === 0) return false;

  // Typical application pages have several fields OR at least a couple strong application signals.
  if (strong >= 2) return true;
  if (relevant >= 5) return true;

  return false;
}

export function detectPageState() {
  const fields = detectFields();
  const fileInputs = detectFileInputs();
  const applicationForm = isLikelyApplicationForm(fields, fileInputs);
  const applyCta = applicationForm ? null : findApplyCta();

  return {
    fields,
    fileInputs,
    applicationForm,
    applyCta,
  };
}

