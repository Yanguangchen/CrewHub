/**
 * Reusable DOM wiring for CrewHub (and similar static apps).
 * Keeps view/tab/file-label behavior out of Firebase domain code.
 */

/**
 * Single visible "stacked" view from nav buttons carrying `data-view="<key>"`.
 * @param {object} options
 * @param {Iterable<HTMLButtonElement>} options.buttons
 * @param {Record<string, HTMLElement | null | undefined>} options.viewsByKey
 * @param {string} [options.initialKey] activate this view on init
 * @returns {{ activate: function(string): void }}
 */
export function bindStackedViews({ buttons, viewsByKey, initialKey }) {
  const list = Array.from(buttons);

  function activate(name) {
    Object.entries(viewsByKey).forEach(([key, section]) => {
      if (!section) return;
      const on = key === name;
      section.classList.toggle("is-hidden", !on);
      section.toggleAttribute("hidden", !on);
    });
    list.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.view === name);
    });
  }

  list.forEach((btn) => {
    btn.addEventListener("click", () => activate(btn.dataset.view));
  });

  if (initialKey) activate(initialKey);
  return { activate };
}

/**
 * Tablist pattern: buttons with `data-admin-tab="<key>"` toggle matching panes.
 * @param {object} options
 * @param {Iterable<HTMLButtonElement>} options.tabButtons
 * @param {Record<string, HTMLElement | null | undefined>} options.panesByKey
 * @param {string} [options.initialKey]
 * @returns {{ select: function(string): void }}
 */
export function bindTabGroup({ tabButtons, panesByKey, initialKey }) {
  const tabs = Array.from(tabButtons);

  function select(tabKey) {
    tabs.forEach((b) => {
      const active = b.dataset.adminTab === tabKey;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-selected", active ? "true" : "false");
    });
    Object.entries(panesByKey).forEach(([key, pane]) => {
      if (!pane) return;
      const on = key === tabKey;
      pane.classList.toggle("is-hidden", !on);
      pane.toggleAttribute("hidden", !on);
    });
  }

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => select(btn.dataset.adminTab));
  });

  if (initialKey) select(initialKey);
  return { select };
}

/**
 * Sync a file input's chosen filename to a text node (tap-to-upload UX).
 * @param {HTMLInputElement} input
 * @param {HTMLElement} metaElement
 * @param {string} [emptyLabel]
 * @returns {() => void} sync — call to refresh label once
 */
export function wireFileMeta(input, metaElement, emptyLabel = "No file selected") {
  function sync() {
    const f = input.files?.[0];
    metaElement.textContent = f ? f.name : emptyLabel;
  }
  input.addEventListener("change", sync);
  return sync;
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minimal hardening for href attribute values from external URLs */
export function attrSafe(url) {
  return String(url).replace(/"/g, "%22");
}

const THEME_STORAGE_KEY = "crewhub-theme";
const THEME_IDS = new Set(["ocean", "midnight", "orange"]);

const THEME_CAPTION = {
  midnight: "Midnight",
  ocean: "Ocean",
  orange: "Amber",
};

/**
 * Theme modal: gear opens `<dialog>`; Midnight / Ocean / Amber saved to localStorage on change.
 * @param {object} [options]
 * @param {HTMLElement} [options.root] defaults to document.documentElement
 * @param {string} [options.storageKey]
 */
export function initThemePicker(options = {}) {
  const root = options.root ?? document.documentElement;
  const storageKey = options.storageKey ?? THEME_STORAGE_KEY;
  const dialog = document.getElementById("crewhub-theme-dialog");
  const openBtn = document.getElementById("crewhub-theme-open");
  const closeBtn = document.getElementById("crewhub-theme-dialog-close");
  const doneBtn = document.getElementById("crewhub-theme-done");
  const group = document.getElementById("crewhub-theme-picker");
  const buttons = group ? Array.from(group.querySelectorAll("button[data-theme]")) : [];
  const canModal = dialog && typeof dialog.showModal === "function";

  function apply(theme) {
    if (!THEME_IDS.has(theme)) return;
    root.dataset.theme = theme;
    try {
      localStorage.setItem(storageKey, theme);
    } catch (_) {
      /* ignore private mode */
    }

    const name = THEME_CAPTION[theme] ?? theme;
    buttons.forEach((btn) => {
      const on = btn.dataset.theme === theme;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
      btn.title = on ? `Active theme: ${name}` : `Switch to ${THEME_CAPTION[btn.dataset.theme] ?? btn.dataset.theme}`;
    });
  }

  function openModal() {
    if (!canModal) return;
    dialog.showModal();
    openBtn?.setAttribute("aria-expanded", "true");
    const pick = buttons.find((b) => b.classList.contains("is-active")) ?? buttons[0];
    pick?.focus();
  }

  function closeModal() {
    if (!dialog) return;
    dialog.close();
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => apply(btn.dataset.theme));
  });

  if (group && buttons.length) {
    group.addEventListener("keydown", (e) => {
      if (
        e.key !== "ArrowRight" &&
        e.key !== "ArrowLeft" &&
        e.key !== "ArrowDown" &&
        e.key !== "ArrowUp"
      ) {
        return;
      }
      const focused = document.activeElement;
      const i = buttons.indexOf(focused);
      if (i < 0) return;
      e.preventDefault();
      const delta = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
      const j = (i + delta + buttons.length) % buttons.length;
      buttons[j].focus();
      apply(buttons[j].dataset.theme);
    });
  }

  openBtn?.addEventListener("click", () => openModal());

  closeBtn?.addEventListener("click", () => closeModal());
  doneBtn?.addEventListener("click", () => closeModal());

  if (canModal) {
    dialog.addEventListener("close", () => {
      openBtn?.setAttribute("aria-expanded", "false");
      openBtn?.focus();
    });

    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) closeModal();
    });
  }

  let initial = root.dataset.theme;
  if (!THEME_IDS.has(initial)) {
    try {
      const saved = localStorage.getItem(storageKey);
      if (THEME_IDS.has(saved)) initial = saved;
      else initial = "midnight";
    } catch (_) {
      initial = "midnight";
    }
  }
  apply(initial);
}

