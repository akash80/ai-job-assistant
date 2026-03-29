import { sendMessage } from "../../shared/utils.js";
import { MSG } from "../../shared/constants.js";

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
    const rememberEl = prompterEl.querySelector('.ja-prompter-remember input[type="checkbox"]');
    const saveBtn = prompterEl.querySelector(".ja-prompter-save");
    const skipBtn = prompterEl.querySelector(".ja-prompter-skip");

    const questionText = field.label
      ? field.label.endsWith("?")
        ? field.label
        : `What is your ${field.label.toLowerCase()}?`
      : "Please provide a value for this field:";

    questionEl.textContent = questionText;
    inputEl.value = "";
    inputEl.placeholder = field.placeholder || "Type your answer...";
    rememberEl.checked = true;
    prompterEl.style.display = "flex";

    inputEl.focus();

    function cleanup() {
      saveBtn.removeEventListener("click", onSave);
      skipBtn.removeEventListener("click", onSkip);
      inputEl.removeEventListener("keydown", onKeyDown);
      prompterEl.style.display = "none";
    }

    function onSave() {
      const value = inputEl.value.trim();
      if (!value) return;

      if (rememberEl.checked) {
        const key = normalizeKey(field.label || field.fieldType);
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
  });
}

function normalizeKey(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 50);
}
