import { sendMessage } from "../../shared/utils.js";
import { MSG } from "../../shared/constants.js";
import { extractJobText } from "../extractor.js";

export function createPrompterUI(shadowRoot) {
  const container = document.createElement("div");
  container.id = "ja-prompter";
  container.innerHTML = `
    <div class="ja-prompter-backdrop"></div>
    <div class="ja-prompter-dialog">
      <div class="ja-prompter-header">
        <span class="ja-prompter-icon">&#129302;</span>
        <span>AI Assistant</span>
      </div>
      <div class="ja-prompter-body">
        <p class="ja-prompter-question"></p>
        <input type="text" class="ja-prompter-input" placeholder="Type your answer..." />
        <select class="ja-prompter-select" style="display:none"></select>
        <label class="ja-prompter-remember">
          <input type="checkbox" checked />
          <span>Remember this answer</span>
        </label>
      </div>
      <div class="ja-prompter-actions">
        <button class="ja-btn ja-btn-primary ja-prompter-save">Save & Fill</button>
        <button class="ja-btn ja-btn-secondary ja-prompter-skip">Skip Field</button>
      </div>
    </div>
  `;
  container.style.display = "none";
  shadowRoot.appendChild(container);
  return container;
}

export function promptForField(prompterEl, field) {
  return new Promise((resolve) => {
    const questionEl = prompterEl.querySelector(".ja-prompter-question");
    const inputEl = prompterEl.querySelector(".ja-prompter-input");
    const selectEl = prompterEl.querySelector(".ja-prompter-select");
    const rememberEl = prompterEl.querySelector('.ja-prompter-remember input[type="checkbox"]');
    const saveBtn = prompterEl.querySelector(".ja-prompter-save");
    const skipBtn = prompterEl.querySelector(".ja-prompter-skip");

    const isSelect = field?.element?.tagName?.toLowerCase?.() === "select";
    // SF and other ATS use <input role="combobox" aria-owns="..."> instead of native <select>.
    // Try to extract options from the aria-owned list so we can show a proper dropdown.
    const comboboxLabels = !isSelect ? extractAriaOwnedOptions(field?.element) : null;
    const useSelectUI = isSelect || (comboboxLabels != null && comboboxLabels.length > 0);

    const optionsPreview = isSelect
      ? buildSelectOptionsPreview(field.element)
      : comboboxLabels
        ? buildOptionsPreviewFromLabels(comboboxLabels)
        : "";

    const questionText = field.label
      ? field.label.endsWith("?")
        ? field.label
        : useSelectUI
          ? `Please select your ${field.label.toLowerCase()}.${optionsPreview}`
          : `What is your ${field.label.toLowerCase()}?`
      : useSelectUI
        ? `Please select a value for this field.${optionsPreview}`
        : "Please provide a value for this field:";

    questionEl.textContent = questionText;

    // Swap input/select UI depending on actual field type.
    inputEl.value = "";
    inputEl.style.display = useSelectUI ? "none" : "block";
    inputEl.placeholder = field.placeholder || "Type your answer...";

    selectEl.style.display = useSelectUI ? "block" : "none";
    if (isSelect) {
      populateSelectControl(selectEl, field.element);
    } else if (comboboxLabels) {
      populateSelectFromLabels(selectEl, comboboxLabels);
    } else {
      selectEl.innerHTML = "";
    }

    // If Smart Form Fill provided a suggested value, prefill it for easy confirm/edit.
    const suggested = String(field?.suggestedValue ?? "").trim();
    if (suggested) {
      if (useSelectUI) {
        trySelectSuggested(selectEl, suggested);
      } else {
        inputEl.value = suggested;
      }
    }

    rememberEl.checked = true;
    prompterEl.style.display = "flex";

    (useSelectUI ? selectEl : inputEl).focus();

    function cleanup() {
      saveBtn.removeEventListener("click", onSave);
      skipBtn.removeEventListener("click", onSkip);
      inputEl.removeEventListener("keydown", onKeyDown);
      selectEl.removeEventListener("keydown", onKeyDown);
      prompterEl.style.display = "none";
    }

    function onSave() {
      const value = useSelectUI ? getSelectValue(selectEl) : inputEl.value.trim();
      if (!value) return;

      if (rememberEl.checked) {
        const key = normalizeKey(field.answerKey || field.label || field.fieldType);
        sendMessage(MSG.SAVE_ANSWER, { key, value, label: field.label || field.fieldType });
      }

      cleanup();
      resolve(value);
    }

    function onSkip() {
      cleanup();
      resolve(null);
    }

    function onKeyDown(e) {
      if (e.key === "Enter") onSave();
      if (e.key === "Escape") onSkip();
    }

    saveBtn.addEventListener("click", onSave);
    skipBtn.addEventListener("click", onSkip);
    inputEl.addEventListener("keydown", onKeyDown);
    selectEl.addEventListener("keydown", onKeyDown);
  });
}

function trySelectSuggested(selectEl, suggested) {
  try {
    const s = String(suggested || "").trim();
    if (!s) return;
    const lower = s.toLowerCase();
    const opts = Array.from(selectEl.options || []);
    const exactValue = opts.findIndex((o) => String(o.value || "").trim().toLowerCase() === lower);
    if (exactValue >= 0) {
      selectEl.selectedIndex = exactValue;
      return;
    }
    const exactLabel = opts.findIndex((o) => String(o.textContent || "").trim().toLowerCase() === lower);
    if (exactLabel >= 0) {
      selectEl.selectedIndex = exactLabel;
      return;
    }
  } catch {
    // ignore
  }
}

function populateSelectControl(selectControlEl, sourceSelectEl) {
  const options = Array.from(sourceSelectEl?.options || []).map((o) => {
    return {
      value: String(o?.value ?? ""),
      label: String(o?.textContent ?? "").trim(),
      disabled: Boolean(o?.disabled),
      selected: Boolean(o?.selected),
    };
  });

  selectControlEl.innerHTML = "";
  for (const opt of options) {
    const optionEl = document.createElement("option");
    optionEl.value = opt.value;
    optionEl.textContent = opt.label || opt.value;
    optionEl.disabled = opt.disabled;
    if (opt.selected) optionEl.selected = true;
    selectControlEl.appendChild(optionEl);
  }

  // If nothing is selected, default to the first non-disabled option.
  if (selectControlEl.selectedIndex < 0) {
    const first = Array.from(selectControlEl.options).findIndex((o) => !o.disabled);
    if (first >= 0) selectControlEl.selectedIndex = first;
  }
}

function getSelectValue(selectControlEl) {
  const idx = selectControlEl?.selectedIndex ?? -1;
  const opt = idx >= 0 ? selectControlEl.options[idx] : null;
  if (!opt || opt.disabled) return "";

  // Prefer the exact platform value; fall back to visible label if value is blank.
  const raw = String(opt.value ?? "");
  if (raw.trim()) return raw.trim();
  return String(opt.textContent ?? "").trim();
}

/**
 * Extract option labels from a combobox input's aria-owned list (e.g. SF paginatedPicklist).
 * Returns an array of label strings, or null if no list/options are found.
 */
function extractAriaOwnedOptions(el) {
  if (!el) return null;
  try {
    const listId = el.getAttribute && el.getAttribute("aria-owns");
    if (!listId) return null;
    const listEl = document.getElementById(listId);
    if (!listEl) return null;
    const items = Array.from(listEl.querySelectorAll('[role="option"], .fd-list__item, li'));
    if (items.length === 0) return null;
    const labels = items.map((item) => String(item.textContent || "").trim()).filter(Boolean);
    return labels.length > 0 ? labels : null;
  } catch {
    return null;
  }
}

/** Populate the prompter's <select> from an array of label strings (for combobox fields). */
function populateSelectFromLabels(selectControlEl, labels) {
  selectControlEl.innerHTML = "";
  for (const label of labels) {
    const optionEl = document.createElement("option");
    optionEl.value = label;
    optionEl.textContent = label;
    selectControlEl.appendChild(optionEl);
  }
  if (selectControlEl.options.length > 0) selectControlEl.selectedIndex = 0;
}

function buildOptionsPreviewFromLabels(labels) {
  try {
    const shown = labels.filter((t) => t.length <= 60).slice(0, 8);
    if (shown.length === 0) return "";
    const more = labels.length > shown.length ? "…" : "";
    return ` Options: ${shown.join(", ")}${more}`;
  } catch {
    return "";
  }
}

function buildSelectOptionsPreview(selectEl) {
  try {
    const options = Array.from(selectEl?.options || [])
      .map((o) => String(o?.textContent || "").trim())
      .filter(Boolean);

    const unique = [];
    for (const opt of options) {
      const key = opt.toLowerCase();
      if (!unique.some((x) => x.toLowerCase() === key)) unique.push(opt);
      if (unique.length >= 8) break;
    }

    const shown = unique.filter((t) => t.length <= 60);
    if (shown.length === 0) return "";

    const more = options.length > shown.length ? "…" : "";
    return ` Options: ${shown.join(", ")}${more}`;
  } catch {
    return "";
  }
}

/**
 * Cover letter field: textarea + standard/smart generation (uses cached or live job analysis).
 */
export function promptCoverLetterField(prompterEl, field) {
  return new Promise((resolve) => {
    const jobText = extractJobText();
    const pageUrl = window.location.href;

    const layer = document.createElement("div");
    layer.className = "ja-prompter-cover-layer";
    layer.innerHTML = `
      <div class="ja-prompter-cover-card">
        <div class="ja-prompter-cover-title"></div>
        <textarea class="ja-prompter-cover-ta" rows="12" placeholder="Generate with AI or paste your own letter..."></textarea>
        <div class="ja-prompter-cover-actions">
          <button type="button" class="ja-btn ja-btn-secondary ja-pc-std">Standard AI</button>
          <button type="button" class="ja-btn ja-btn-primary ja-pc-smart">Smart AI</button>
          <button type="button" class="ja-btn ja-btn-primary ja-pc-fill">Fill with text above</button>
          <button type="button" class="ja-btn ja-btn-secondary ja-pc-skip">Skip</button>
        </div>
        <div class="ja-prompter-cover-status"></div>
      </div>
    `;

    layer.querySelector(".ja-prompter-cover-title").textContent =
      `Cover letter — ${field.label || "Cover letter"}`;

    const ta = layer.querySelector(".ja-prompter-cover-ta");
    const statusEl = layer.querySelector(".ja-prompter-cover-status");

    function cleanup() {
      layer.remove();
      prompterEl.style.display = "none";
    }

    let jobAnalysisPromise = (async () => {
      const cached = await sendMessage(MSG.GET_CACHED_ANALYSIS, { jobText, pageUrl });
      if (cached.success && cached.data) return cached.data;
      if (jobText.length >= 100) {
        const fresh = await sendMessage(MSG.ANALYZE_JOB, { jobText, pageUrl, forceLocal: false });
        if (fresh.success) return fresh.data;
      }
      return null;
    })();

    prompterEl.appendChild(layer);
    prompterEl.style.display = "flex";
    ta.focus();

    layer.querySelector(".ja-pc-skip").addEventListener("click", () => {
      cleanup();
      resolve(null);
    });

    layer.querySelector(".ja-pc-fill").addEventListener("click", () => {
      const value = ta.value.trim();
      if (!value) {
        statusEl.textContent = "Add text or run AI generation first.";
        return;
      }
      sendMessage(MSG.SAVE_ANSWER, {
        key: normalizeKey(field.label || "cover_letter"),
        value,
        label: field.label || "Cover letter",
      });
      cleanup();
      resolve(value);
    });

    async function runGen(smart) {
      statusEl.textContent = "Preparing analysis…";
      const jobAnalysis = await jobAnalysisPromise;
      if (!jobAnalysis) {
        statusEl.textContent =
          "Could not analyze this page (need more job text). Paste your letter manually, or run analysis from the toolbar.";
        return;
      }
      statusEl.textContent = smart ? "Generating smart letter (may take a moment)…" : "Generating…";
      const resp = await sendMessage(MSG.GENERATE_COVER_LETTER, {
        jobAnalysis,
        tone: "professional",
        smart,
        jobPostingText: jobText.slice(0, 15000),
      });
      if (resp.success) {
        ta.value = resp.data;
        statusEl.textContent = "Done — review and tap “Fill with text above”.";
      } else {
        statusEl.textContent = resp.error || "Generation failed.";
      }
    }

    layer.querySelector(".ja-pc-std").addEventListener("click", () => runGen(false));
    layer.querySelector(".ja-pc-smart").addEventListener("click", () => runGen(true));
  });
}

function normalizeKey(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 50);
}
