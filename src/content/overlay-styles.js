export const overlayStyles = `
  :host {
    all: initial;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    color: #1e293b;
    line-height: 1.5;
  }

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  .ja-panel {
    position: fixed;
    bottom: 16px;
    right: 16px;
    width: 380px;
    max-height: 520px;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: ja-slide-up 200ms ease-out;
  }

  .ja-panel.ja-minimized {
    width: 56px;
    height: 56px;
    max-height: 56px;
    border-radius: 50%;
    cursor: pointer;
    animation: none;
  }

  .ja-panel.ja-minimized .ja-header,
  .ja-panel.ja-minimized .ja-content {
    display: none;
  }

  @keyframes ja-slide-up {
    from { transform: translateY(20px); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
  }

  /* Header */
  .ja-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: #6366f1;
    color: #ffffff;
    flex-shrink: 0;
  }

  .ja-title {
    font-weight: 600;
    font-size: 14px;
  }

  .ja-header-actions {
    display: flex;
    gap: 8px;
  }

  .ja-header-btn {
    background: rgba(255,255,255,0.2);
    border: none;
    color: #fff;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 150ms;
  }

  .ja-header-btn:hover {
    background: rgba(255,255,255,0.35);
  }

  /* Content */
  .ja-content {
    padding: 16px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  /* Loading */
  .ja-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 0;
    gap: 16px;
  }

  .ja-spinner {
    width: 36px;
    height: 36px;
    border: 3px solid #e2e8f0;
    border-top-color: #6366f1;
    border-radius: 50%;
    animation: ja-spin 0.8s linear infinite;
  }

  @keyframes ja-spin {
    to { transform: rotate(360deg); }
  }

  .ja-loading-text {
    color: #64748b;
    font-size: 13px;
  }

  /* Result */
  .ja-job-info {
    margin-bottom: 16px;
  }

  .ja-job-title {
    font-size: 16px;
    font-weight: 600;
    color: #1e293b;
    margin-bottom: 4px;
  }

  .ja-job-meta {
    font-size: 12px;
    color: #64748b;
  }

  .ja-salary {
    font-size: 12px;
    color: #6366f1;
    font-weight: 500;
    margin-top: 2px;
  }

  /* Score */
  .ja-score-section {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
  }

  .ja-score-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .ja-score-label {
    font-size: 12px;
    font-weight: 500;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .ja-score-value {
    font-size: 24px;
    font-weight: 700;
  }

  .ja-score-high { color: #22c55e; }
  .ja-score-medium { color: #f59e0b; }
  .ja-score-low { color: #ef4444; }

  .ja-score-bar {
    width: 100%;
    height: 6px;
    background: #e2e8f0;
    border-radius: 3px;
    overflow: hidden;
  }

  .ja-score-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.6s ease-out;
  }

  .ja-score-fill.ja-score-high { background: #22c55e; }
  .ja-score-fill.ja-score-medium { background: #f59e0b; }
  .ja-score-fill.ja-score-low { background: #ef4444; }

  /* Sections */
  .ja-section {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    margin-bottom: 8px;
    overflow: hidden;
  }

  .ja-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    background: #f8fafc;
    transition: background 150ms;
  }

  .ja-section-header:hover {
    background: #f1f5f9;
  }

  .ja-chevron {
    transition: transform 200ms;
    font-size: 12px;
    color: #94a3b8;
  }

  .ja-expanded .ja-chevron {
    transform: rotate(90deg);
  }

  .ja-section-list {
    display: none;
    padding: 8px 12px 12px 32px;
    list-style: disc;
  }

  .ja-expanded .ja-section-list {
    display: block;
  }

  .ja-section-list li {
    font-size: 13px;
    color: #475569;
    margin-bottom: 4px;
  }

  /* Missing skills interactive items */
  .ja-missing-list {
    list-style: none !important;
    padding-left: 12px !important;
  }

  .ja-missing-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 0;
    border-bottom: 1px solid #f8fafc;
  }

  .ja-missing-item:last-child {
    border-bottom: none;
  }

  .ja-missing-text {
    flex: 1;
    font-size: 13px;
    color: #475569;
  }

  .ja-missing-text::before {
    content: "\\2022 ";
    color: #ef4444;
    font-weight: 700;
    margin-right: 4px;
  }

  .ja-skill-added .ja-missing-text {
    text-decoration: line-through;
    color: #94a3b8;
  }

  .ja-skill-added .ja-missing-text::before {
    content: "\\2713 ";
    color: #22c55e;
  }

  .ja-skill-btn {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 120ms;
    flex-shrink: 0;
    font-family: inherit;
  }

  .ja-skill-add {
    background: #eef2ff;
    color: #4338ca;
    border-color: #c7d2fe;
  }

  .ja-skill-add:hover {
    background: #c7d2fe;
    border-color: #818cf8;
  }

  .ja-skill-undo {
    background: #fef2f2;
    color: #dc2626;
    border-color: #fecaca;
  }

  .ja-skill-undo:hover {
    background: #fee2e2;
    border-color: #f87171;
  }

  .ja-missing-hint {
    font-size: 11px;
    color: #94a3b8;
    padding: 8px 12px 10px;
    border-top: 1px solid #f1f5f9;
    display: none;
  }

  .ja-missing-hint strong {
    color: #64748b;
  }

  .ja-expanded .ja-missing-hint {
    display: block;
  }

  /* Recommendation */
  .ja-recommendation {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 16px;
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .ja-rec-badge {
    padding: 2px 10px;
    border-radius: 9999px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .ja-rec-apply   { background: #dcfce7; color: #166534; }
  .ja-rec-consider { background: #fef3c7; color: #92400e; }
  .ja-rec-skip     { background: #fee2e2; color: #991b1b; }

  .ja-rec-reason {
    font-size: 13px;
    color: #475569;
  }

  /* Buttons */
  .ja-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .ja-btn {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 150ms;
    flex: 1;
    text-align: center;
  }

  .ja-btn-primary {
    background: #6366f1;
    color: #ffffff;
    border-color: #6366f1;
  }

  .ja-btn-primary:hover {
    background: #4f46e5;
    border-color: #4f46e5;
  }

  .ja-btn-secondary {
    background: #ffffff;
    color: #475569;
    border-color: #e2e8f0;
  }

  .ja-btn-secondary:hover {
    background: #f8fafc;
    border-color: #cbd5e1;
  }

  /* Error */
  .ja-error {
    text-align: center;
    padding: 16px 0;
  }

  .ja-error-icon {
    font-size: 32px;
    margin-bottom: 8px;
  }

  .ja-error-title {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .ja-error-message {
    font-size: 13px;
    color: #64748b;
    margin-bottom: 16px;
  }

  /* Preview */
  .ja-preview h3 {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .ja-preview-summary {
    font-size: 12px;
    color: #64748b;
    margin-bottom: 12px;
  }

  .ja-preview-table {
    width: 100%;
    font-size: 13px;
    border-collapse: collapse;
    margin-bottom: 12px;
  }

  .ja-preview-table td {
    padding: 6px 8px;
    border-bottom: 1px solid #f1f5f9;
    vertical-align: top;
  }

  .ja-preview-table td:first-child {
    width: 24px;
    text-align: center;
  }

  .ja-preview-override {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 4px 0 6px;
    font-size: 13px;
    color: #334155;
    cursor: pointer;
    user-select: none;
  }

  .ja-preview-override input {
    margin-top: 3px;
    accent-color: #6366f1;
    flex-shrink: 0;
  }

  .ja-preview-override-hint {
    font-size: 11px;
    color: #94a3b8;
    margin: 0 0 12px;
    line-height: 1.4;
  }

  .ja-muted {
    color: #94a3b8;
    font-style: italic;
  }

  /* Fill Progress */
  .ja-fill-progress {
    text-align: center;
    padding: 24px 0;
  }

  .ja-fill-progress p {
    font-size: 13px;
    color: #475569;
    margin-bottom: 12px;
  }

  .ja-fill-status {
    text-align: center;
    padding: 24px 0;
  }

  .ja-fill-status p {
    font-size: 14px;
    color: #1e293b;
    margin-bottom: 16px;
  }

  /* Prompter */
  #ja-prompter {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ja-prompter-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.3);
  }

  .ja-prompter-dialog {
    position: relative;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15);
    width: 360px;
    overflow: hidden;
  }

  .ja-prompter-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: #6366f1;
    color: #fff;
    font-weight: 600;
    font-size: 14px;
  }

  .ja-prompter-icon {
    font-size: 18px;
  }

  .ja-prompter-body {
    padding: 16px;
  }

  .ja-prompter-question {
    font-size: 14px;
    font-weight: 500;
    color: #1e293b;
    margin-bottom: 12px;
  }

  .ja-prompter-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 14px;
    color: #1e293b;
    outline: none;
    transition: border-color 150ms;
    font-family: inherit;
  }

  .ja-prompter-input:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
  }

  .ja-prompter-select {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 14px;
    color: #1e293b;
    outline: none;
    transition: border-color 150ms;
    font-family: inherit;
    background: #fff;
  }

  .ja-prompter-select:focus {
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
  }

  .ja-prompter-remember {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 10px;
    font-size: 12px;
    color: #64748b;
    cursor: pointer;
  }

  .ja-prompter-remember input[type="checkbox"] {
    accent-color: #6366f1;
  }

  .ja-prompter-actions {
    display: flex;
    gap: 8px;
    padding: 0 16px 16px;
  }

  .ja-prompter-cover-layer {
    position: absolute;
    inset: 0;
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.35);
    padding: 16px;
  }

  .ja-prompter-cover-card {
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
    max-width: 520px;
    width: 100%;
    padding: 16px;
  }

  .ja-prompter-cover-title {
    font-weight: 600;
    font-size: 15px;
    color: #1e293b;
    margin-bottom: 10px;
  }

  .ja-prompter-cover-ta {
    width: 100%;
    min-height: 200px;
    padding: 10px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.45;
    resize: vertical;
    font-family: inherit;
    box-sizing: border-box;
  }

  .ja-prompter-cover-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .ja-prompter-cover-status {
    margin-top: 10px;
    font-size: 12px;
    color: #64748b;
    min-height: 1.2em;
  }

  .ja-cover-mode-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 0 16px 8px;
  }

  .ja-cover-mode-btn {
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    background: #f8fafc;
    font-size: 12px;
    cursor: pointer;
    color: #475569;
  }

  .ja-cover-mode-btn.active {
    border-color: #6366f1;
    background: #eef2ff;
    color: #4338ca;
    font-weight: 600;
  }

  .ja-cover-mode-hint {
    font-size: 11px;
    color: #64748b;
    padding: 0 16px 12px;
    margin: 0;
    line-height: 1.4;
  }

  /* Applied Banner */
  .ja-applied-banner {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    margin-bottom: 12px;
    font-size: 13px;
    border: 1px solid rgba(0,0,0,0.08);
  }

  .ja-applied-banner span:first-child {
    font-size: 18px;
    flex-shrink: 0;
  }

  /* Local Analysis Banner */
  .ja-local-banner {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    margin-bottom: 12px;
    font-size: 12px;
    background: #fef3c7;
    border: 1px solid #fcd34d;
  }

  .ja-link {
    color: #6366f1;
    text-decoration: underline;
    cursor: pointer;
  }

  /* No-API-key hint in error */
  .ja-nokey-hint {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
    margin: 12px 0;
    text-align: left;
    font-size: 13px;
  }

  .ja-nokey-hint p { margin-bottom: 6px; font-weight: 500; }
  .ja-nokey-hint ul { padding-left: 18px; }
  .ja-nokey-hint li { margin-bottom: 4px; }

  /* Cover Letter */
  .ja-cover-letter h3 {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  .ja-tone-selector {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .ja-tone-label {
    font-size: 12px;
    color: #64748b;
    font-weight: 500;
  }

  .ja-tone-btn {
    padding: 4px 10px;
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    font-size: 12px;
    cursor: pointer;
    background: #f8fafc;
    color: #475569;
    transition: all 150ms;
  }

  .ja-tone-btn.active {
    background: #6366f1;
    color: #fff;
    border-color: #6366f1;
  }

  .ja-cover-body {
    min-height: 100px;
  }

  .ja-cover-text {
    font-size: 13px;
    line-height: 1.7;
    color: #1e293b;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
    min-height: 120px;
    outline: none;
    white-space: pre-wrap;
    max-height: 200px;
    overflow-y: auto;
  }

  .ja-cover-text:focus {
    border-color: #6366f1;
  }

  .ja-prompt-fallback {
    font-size: 13px;
  }

  .ja-prompt-box {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px;
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 160px;
    overflow-y: auto;
    color: #475569;
    font-family: monospace;
  }

  /* Growth opportunities */
  .ja-growth .ja-section-header {
    background: #f0fdf4;
  }

  /* All skills added */
  .ja-all-skills-added {
    padding: 10px 12px;
    font-size: 13px;
    color: #16a34a;
    font-weight: 500;
  }

  /* Responsive */
  @media (max-width: 480px) {
    .ja-panel {
      width: calc(100% - 24px);
      right: 12px;
      bottom: 12px;
    }

    .ja-prompter-dialog {
      width: calc(100% - 32px);
    }
  }
`;
