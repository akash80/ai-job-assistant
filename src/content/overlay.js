import { sendMessage } from "../shared/utils.js";
import { MSG } from "../shared/constants.js";
import { detectFields, detectFileInputs } from "./fields/detector.js";
import { buildFillPlan } from "./fields/mapper.js";
import { executeFillPlan, fillFileInput } from "./fields/filler.js";
import { createPrompterUI, promptForField } from "./fields/prompter.js";
import { overlayStyles } from "./overlay-styles.js";

let overlayHost = null;
let shadowRoot = null;
let prompterEl = null;
let currentResult = null;

export function showLoading() {
  ensureOverlay();
  const content = shadowRoot.querySelector(".ja-content");
  content.innerHTML = `
    <div class="ja-loading">
      <div class="ja-spinner"></div>
      <p class="ja-loading-text">Analyzing job posting...</p>
    </div>
  `;
  show();
}

export function showResult(result) {
  currentResult = result;
  ensureOverlay();
  const content = shadowRoot.querySelector(".ja-content");
  const scoreClass = result.match_score >= 70 ? "high" : result.match_score >= 40 ? "medium" : "low";

  content.innerHTML = `
    <div class="ja-result">
      <div class="ja-job-info">
        <h3 class="ja-job-title">${escHtml(result.job_title)}</h3>
        <p class="ja-job-meta">${escHtml(result.company)} &middot; ${escHtml(result.job_type)} &middot; ${escHtml(result.location)}</p>
        ${result.salary_range ? `<p class="ja-salary">${escHtml(result.salary_range)}</p>` : ""}
      </div>

      <div class="ja-score-section">
        <div class="ja-score-header">
          <span class="ja-score-label">Match Score</span>
          <span class="ja-score-value ja-score-${scoreClass}">${result.match_score}%</span>
        </div>
        <div class="ja-score-bar">
          <div class="ja-score-fill ja-score-${scoreClass}" style="width: ${result.match_score}%"></div>
        </div>
      </div>

      ${renderSection("Strengths", result.strengths, "ja-strengths", "&#9989;")}
      ${renderMissingSkills(result.missing_skills || [])}
      ${renderSection("Key Requirements", result.key_requirements, "ja-requirements", "&#128203;")}

      <div class="ja-recommendation">
        <div class="ja-rec-badge ja-rec-${result.recommendation.toLowerCase()}">${escHtml(result.recommendation)}</div>
        <p class="ja-rec-reason">${escHtml(result.reason)}</p>
      </div>

      <div class="ja-actions">
        <button class="ja-btn ja-btn-primary ja-btn-apply">Apply Assist</button>
        <button class="ja-btn ja-btn-secondary ja-btn-skip">Skip</button>
      </div>
    </div>
  `;

  shadowRoot.querySelector(".ja-btn-apply").addEventListener("click", handleApplyAssist);
  shadowRoot.querySelector(".ja-btn-skip").addEventListener("click", handleSkip);

  setupCollapsibles(shadowRoot);
  setupMissingSkillActions(shadowRoot);
  show();
  animateScore(shadowRoot, result.match_score, scoreClass);
}

export function showError(message, showRetry = true) {
  ensureOverlay();
  const content = shadowRoot.querySelector(".ja-content");
  content.innerHTML = `
    <div class="ja-error">
      <p class="ja-error-icon">&#9888;&#65039;</p>
      <p class="ja-error-title">Analysis Failed</p>
      <p class="ja-error-message">${escHtml(message)}</p>
      <div class="ja-actions">
        ${showRetry ? '<button class="ja-btn ja-btn-primary ja-btn-retry">Retry</button>' : ""}
        <button class="ja-btn ja-btn-secondary ja-btn-settings">Settings</button>
      </div>
    </div>
  `;

  if (showRetry) {
    shadowRoot.querySelector(".ja-btn-retry")?.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("ja-retry-analysis"));
    });
  }
  shadowRoot.querySelector(".ja-btn-settings")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage?.() || window.open(chrome.runtime.getURL("options/options.html"));
  });
  show();
}

export function removeOverlay() {
  if (overlayHost) {
    overlayHost.remove();
    overlayHost = null;
    shadowRoot = null;
    prompterEl = null;
  }
}

export function minimizeOverlay() {
  if (!overlayHost || !currentResult) return;
  const panel = shadowRoot.querySelector(".ja-panel");
  if (panel) panel.classList.add("ja-minimized");
}

function ensureOverlay() {
  if (overlayHost) return;

  overlayHost = document.createElement("div");
  overlayHost.id = "ja-extension-root";
  shadowRoot = overlayHost.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = overlayStyles;
  shadowRoot.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "ja-panel";
  panel.innerHTML = `
    <div class="ja-header">
      <span class="ja-title">AI Job Assistant</span>
      <div class="ja-header-actions">
        <button class="ja-header-btn ja-btn-minimize" title="Minimize">&#8722;</button>
        <button class="ja-header-btn ja-btn-close" title="Close">&#10005;</button>
      </div>
    </div>
    <div class="ja-content"></div>
  `;

  shadowRoot.appendChild(panel);
  prompterEl = createPrompterUI(shadowRoot);

  panel.querySelector(".ja-btn-close").addEventListener("click", removeOverlay);
  panel.querySelector(".ja-btn-minimize").addEventListener("click", minimizeOverlay);

  document.body.appendChild(overlayHost);
}

function show() {
  if (overlayHost) overlayHost.style.display = "block";
  const panel = shadowRoot?.querySelector(".ja-panel");
  if (panel) panel.classList.remove("ja-minimized");
}

async function handleApplyAssist() {
  const profileResp = await sendMessage(MSG.GET_PROFILE);
  const answersResp = await sendMessage(MSG.GET_ANSWERS);
  const profile = profileResp.success ? profileResp.data : {};
  const answers = answersResp.success ? answersResp.data : {};

  const fields = detectFields();
  const fileInputs = detectFileInputs();
  if (fields.length === 0 && fileInputs.length === 0) {
    showFillStatus("No form fields found on this page.", true);
    return;
  }

  const plan = buildFillPlan(fields, profile, answers);

  for (const el of fileInputs) {
    const label = extractFileInputLabel(el);
    plan.fileFields.push({ element: el, fieldType: "resume_upload", label });
  }

  showPreview(plan, profile, answers);
}

async function showPreview(plan, profile, answers) {
  const content = shadowRoot.querySelector(".ja-content");
  const knownHtml = plan.knownFields
    .map((f) => `<tr><td>&#9989;</td><td>${escHtml(f.label || f.fieldType)}</td><td>${escHtml(f.value)}</td></tr>`)
    .join("");
  const unknownHtml = plan.unknownFields
    .map((f) => `<tr><td>&#10067;</td><td>${escHtml(f.label || f.fieldType)}</td><td class="ja-muted">Need input</td></tr>`)
    .join("");
  const skippedHtml = plan.skippedFields
    .filter((f) => f.reason !== "hidden")
    .map((f) => `<tr><td>&#9197;</td><td>${escHtml(f.label || f.reason)}</td><td class="ja-muted">${escHtml(f.reason)}</td></tr>`)
    .join("");

  let fileHtml = "";
  if (plan.fileFields && plan.fileFields.length > 0) {
    const pdfResp = await sendMessage(MSG.GET_RESUME_PDF);
    const hasPdf = pdfResp.success && pdfResp.data;
    fileHtml = plan.fileFields.map((f) => {
      if (hasPdf) {
        return `<tr><td>&#128206;</td><td>${escHtml(f.label || "Resume Upload")}</td><td>${escHtml(pdfResp.data.fileName)}</td></tr>`;
      }
      return `<tr><td>&#9888;</td><td>${escHtml(f.label || "Resume Upload")}</td><td class="ja-muted">No PDF uploaded — upload in Settings</td></tr>`;
    }).join("");
  }

  const fileCount = plan.fileFields?.length || 0;
  content.innerHTML = `
    <div class="ja-preview">
      <h3>Fill Preview</h3>
      <p class="ja-preview-summary">
        &#9989; ${plan.knownFields.length} auto-fill &nbsp;
        ${fileCount > 0 ? `&#128206; ${fileCount} resume attach &nbsp;` : ""}
        &#10067; ${plan.unknownFields.length} need input &nbsp;
        &#9197; ${plan.skippedFields.length} skipped
      </p>
      <table class="ja-preview-table">
        <tbody>${knownHtml}${fileHtml}${unknownHtml}${skippedHtml}</tbody>
      </table>
      <div class="ja-actions">
        <button class="ja-btn ja-btn-primary ja-btn-proceed">Proceed</button>
        <button class="ja-btn ja-btn-secondary ja-btn-cancel">Cancel</button>
      </div>
    </div>
  `;

  shadowRoot.querySelector(".ja-btn-proceed").addEventListener("click", () => startFilling(plan));
  shadowRoot.querySelector(".ja-btn-cancel").addEventListener("click", () => showResult(currentResult));
}

async function startFilling(plan) {
  if (plan.fileFields && plan.fileFields.length > 0) {
    const pdfResp = await sendMessage(MSG.GET_RESUME_PDF);
    if (pdfResp.success && pdfResp.data) {
      for (const ff of plan.fileFields) {
        showFillStatus(`Attaching resume: ${ff.label || "Resume Upload"}`, false);
        await fillFileInput(ff.element, pdfResp.data.base64, pdfResp.data.fileName, pdfResp.data.mimeType);
      }
    }
  }

  const stats = await executeFillPlan(plan, {
    onFieldStart: (field, done, total) => {
      showFillStatus(`Filling: ${field.label || field.fieldType} (${done + 1}/${total})`, false);
    },
    onFieldComplete: (_field, done, total) => {
      updateProgress(done, total);
    },
    onUnknownField: (field) => promptForField(prompterEl, field),
    onComplete: (stats) => {
      const resumeAttached = plan.fileFields?.length > 0;
      const statusParts = [`${stats.filled} filled`, `${stats.skipped} skipped`, `${stats.errors} errors`];
      if (resumeAttached) statusParts.push("resume attached");
      showFillStatus(`Done! ${statusParts.join(", ")}.`, true);

      if (currentResult) {
        sendMessage(MSG.LOG_APPLICATION, {
          url: window.location.href,
          domain: window.location.hostname,
          jobTitle: currentResult.job_title,
          company: currentResult.company,
          matchScore: currentResult.match_score,
          action: "applied",
          recommendation: currentResult.recommendation,
          fieldsAutoFilled: stats.filled,
          fieldsManual: stats.skipped,
        });
      }
    },
  });
}

function showFillStatus(message, isFinal) {
  const content = shadowRoot.querySelector(".ja-content");
  if (!content) return;

  if (isFinal) {
    content.innerHTML = `
      <div class="ja-fill-status">
        <p>${escHtml(message)}</p>
        <div class="ja-actions">
          <button class="ja-btn ja-btn-secondary ja-btn-back">Back to Analysis</button>
        </div>
      </div>
    `;
    shadowRoot.querySelector(".ja-btn-back")?.addEventListener("click", () => {
      if (currentResult) showResult(currentResult);
    });
  } else {
    let statusEl = content.querySelector(".ja-fill-progress");
    if (!statusEl) {
      content.innerHTML = `
        <div class="ja-fill-progress">
          <p class="ja-fill-msg"></p>
          <div class="ja-score-bar"><div class="ja-score-fill ja-score-high" style="width:0%"></div></div>
        </div>
      `;
      statusEl = content.querySelector(".ja-fill-progress");
    }
    statusEl.querySelector(".ja-fill-msg").textContent = message;
  }
}

function updateProgress(done, total) {
  const bar = shadowRoot?.querySelector(".ja-fill-progress .ja-score-fill");
  if (bar) bar.style.width = `${Math.round((done / total) * 100)}%`;
}

async function handleSkip() {
  if (currentResult) {
    await sendMessage(MSG.LOG_APPLICATION, {
      url: window.location.href,
      domain: window.location.hostname,
      jobTitle: currentResult.job_title,
      company: currentResult.company,
      matchScore: currentResult.match_score,
      action: "skipped",
      recommendation: currentResult.recommendation,
      fieldsAutoFilled: 0,
      fieldsManual: 0,
    });
  }
  removeOverlay();
}

function renderMissingSkills(skills) {
  if (!skills || skills.length === 0) return "";
  const items = skills.map((skill, i) => `
    <li class="ja-missing-item" data-skill="${escHtml(skill)}" data-idx="${i}">
      <span class="ja-missing-text">${escHtml(skill)}</span>
      <button class="ja-skill-btn ja-skill-add" data-idx="${i}" title="Add to your profile">+ Add</button>
      <button class="ja-skill-btn ja-skill-undo" data-idx="${i}" title="Remove from profile" style="display:none">Undo</button>
    </li>
  `).join("");
  return `
    <div class="ja-section ja-collapsible ja-missing">
      <div class="ja-section-header">
        <span>&#10060; Missing Skills (${skills.length})</span>
        <span class="ja-chevron">&#9656;</span>
      </div>
      <ul class="ja-section-list ja-missing-list">${items}</ul>
      <div class="ja-missing-hint">Have a skill? Click <strong>+ Add</strong> to add it to your profile. For more, edit in <strong>Settings &gt; Profile</strong>.</div>
    </div>
  `;
}

function setupMissingSkillActions(root) {
  root.querySelectorAll(".ja-skill-add").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const li = btn.closest(".ja-missing-item");
      const skill = li.dataset.skill;
      if (!skill) return;

      const resp = await sendMessage(MSG.GET_PROFILE);
      const profile = resp.success ? resp.data || {} : {};
      const skills = profile.skills || {};

      const otherKey = Object.keys(skills).find((k) => k.toLowerCase().includes("other")) || "other";
      if (!Array.isArray(skills[otherKey])) skills[otherKey] = [];

      if (!skills[otherKey].some((s) => s.toLowerCase() === skill.toLowerCase())) {
        skills[otherKey].push(skill);
        profile.skills = skills;
        const allSkills = Object.values(skills).flat();
        profile.skillsText = allSkills.join(", ");
        await sendMessage(MSG.SAVE_PROFILE, profile);
      }

      li.classList.add("ja-skill-added");
      btn.style.display = "none";
      li.querySelector(".ja-skill-undo").style.display = "inline-flex";
    });
  });

  root.querySelectorAll(".ja-skill-undo").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const li = btn.closest(".ja-missing-item");
      const skill = li.dataset.skill;
      if (!skill) return;

      const resp = await sendMessage(MSG.GET_PROFILE);
      const profile = resp.success ? resp.data || {} : {};
      const skills = profile.skills || {};

      for (const key of Object.keys(skills)) {
        if (Array.isArray(skills[key])) {
          skills[key] = skills[key].filter((s) => s.toLowerCase() !== skill.toLowerCase());
        }
      }
      profile.skills = skills;
      const allSkills = Object.values(skills).flat();
      profile.skillsText = allSkills.join(", ");
      await sendMessage(MSG.SAVE_PROFILE, profile);

      li.classList.remove("ja-skill-added");
      btn.style.display = "none";
      li.querySelector(".ja-skill-add").style.display = "inline-flex";
    });
  });
}

function renderSection(title, items, className, icon) {
  if (!items || items.length === 0) return "";
  const listItems = items.map((item) => `<li>${escHtml(item)}</li>`).join("");
  return `
    <div class="ja-section ja-collapsible ${className}">
      <div class="ja-section-header">
        <span>${icon} ${escHtml(title)} (${items.length})</span>
        <span class="ja-chevron">&#9656;</span>
      </div>
      <ul class="ja-section-list">${listItems}</ul>
    </div>
  `;
}

function setupCollapsibles(root) {
  root.querySelectorAll(".ja-collapsible .ja-section-header").forEach((header) => {
    header.addEventListener("click", () => {
      const section = header.closest(".ja-collapsible");
      section.classList.toggle("ja-expanded");
    });
  });
}

function animateScore(root, target, scoreClass) {
  const valueEl = root.querySelector(".ja-score-value");
  const fillEl = root.querySelector(".ja-score-fill");
  if (!valueEl || !fillEl) return;

  let current = 0;
  fillEl.style.width = "0%";

  const interval = setInterval(() => {
    current += 1;
    if (current > target) {
      clearInterval(interval);
      return;
    }
    valueEl.textContent = `${current}%`;
    fillEl.style.width = `${current}%`;
  }, 12);
}

function extractFileInputLabel(el) {
  const attachmentField = el.closest?.(".attachmentField");
  if (attachmentField) {
    const label = attachmentField.querySelector("label");
    if (label?.textContent?.trim()) return label.textContent.trim();
  }
  if (el.id) {
    const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (label) return label.textContent.trim();
  }
  const parent = el.closest("label");
  if (parent) return parent.textContent.trim();
  const prev = el.previousElementSibling;
  if (prev && prev.textContent.trim().length < 100) return prev.textContent.trim();
  return "Resume Upload";
}

function escHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
