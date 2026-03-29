import { debounce } from "../shared/utils.js";
import { ANALYSIS_DEBOUNCE_MS } from "../shared/constants.js";

export class PageObserver {
  constructor(onPageChange) {
    this._onPageChange = onPageChange;
    this._observer = null;
    this._lastUrl = window.location.href;
    this._debouncedCheck = debounce(() => this._checkForChanges(), ANALYSIS_DEBOUNCE_MS);
  }

  start() {
    this._observer = new MutationObserver(() => {
      this._debouncedCheck();
    });

    this._observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("popstate", () => this._debouncedCheck());
    window.addEventListener("hashchange", () => this._debouncedCheck());

    this._patchHistory();
  }

  stop() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  _checkForChanges() {
    const currentUrl = window.location.href;
    if (currentUrl !== this._lastUrl) {
      this._lastUrl = currentUrl;
      this._onPageChange();
    }
  }

  _patchHistory() {
    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;

    history.pushState = (...args) => {
      origPushState.apply(history, args);
      this._debouncedCheck();
    };

    history.replaceState = (...args) => {
      origReplaceState.apply(history, args);
      this._debouncedCheck();
    };
  }
}
