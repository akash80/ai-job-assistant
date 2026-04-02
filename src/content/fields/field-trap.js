/**
 * Honeypot / anti-bot fields: leave empty for humans. Autofill must skip them.
 */

function lower(s) {
  return String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function getDescribedByText(el) {
  try {
    const raw = el.getAttribute?.("aria-describedby") || "";
    const ids = raw.split(/\s+/).filter(Boolean);
    const parts = ids.map((id) => document.getElementById(id)?.textContent || "").filter(Boolean);
    return parts.join(" ");
  } catch {
    return "";
  }
}

/**
 * Collects label-adjacent and attribute text used to spot spam-trap fields.
 */
export function getTrapDetectionHints(el) {
  const pieces = [];
  if (!el) return "";
  for (const a of ["name", "id", "class", "aria-label", "placeholder", "autocomplete", "title", "data-honeypot"]) {
    const v = el.getAttribute?.(a);
    if (v) pieces.push(v);
  }
  pieces.push(getDescribedByText(el));
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

const TRAP_HINT_REGEXES = [
  /\bfor robots only\b/,
  /\bthis input is for robots\b/,
  /\binput is for robots only\b/,
  /\bdo not enter if you'?re human\b/,
  /\bdo not fill\b.*\bif you'?re human\b/,
  /\bif you'?re human\b.*\bdo not (enter|fill)\b/,
  /\bonly for (bots?|robots?|spiders?|crawlers?)\b/,
  /\b(humans?|people)\b.*\b(leave (this )?blank|leave (this )?empty|do not (enter|fill))\b/,
  /\b(leave (this )?blank|leave (this )?empty)\b.*\b(humans?|people)\b/,
  /\bspam\s*trap\b|\bhoneypot\b|\bhp-[\w-]*trap\b/,
  /\bif you can read this\b.*\bleave (blank|empty)\b/,
  /\banti[-\s]?bot\b.*\b(field|input)\b/,
];

export function isHoneypotTrapField(el) {
  const s = getTrapDetectionHints(el);
  if (!s) return false;
  return TRAP_HINT_REGEXES.some((re) => re.test(s));
}
