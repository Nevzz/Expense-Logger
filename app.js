/* ==========================================================================
   Expense Logger — app.js
   Plain JS. Kept flat and small on purpose.

   Sections:
   1. Config
   2. DOM refs
   3. Init
   4. Buckets (load + render + select)
   5. Form submit (save expense)
   6. Toast / UI helpers
   ========================================================================== */

/* --------------------------------------------------------------------------
   1. Config — see config.js (loaded before this file in index.html)
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   2. DOM refs
   -------------------------------------------------------------------------- */
const els = {
  form: document.getElementById("expense-form"),
  amount: document.getElementById("amount"),
  buckets: document.getElementById("buckets"),
  merchant: document.getElementById("merchant"),
  notes: document.getElementById("notes"),
  saveBtn: document.getElementById("save-btn"),
  toast: document.getElementById("toast"),
  toastText: document.getElementById("toast-text"),
};

// Single source of truth for which bucket is currently selected.
let selectedBucket = null;

/* --------------------------------------------------------------------------
   3. Init
   -------------------------------------------------------------------------- */
function init() {
  // Autofocus the amount field immediately — this is the whole point of the app.
  els.amount.focus();

  // Show cached buckets instantly (if any), then refresh from the sheet.
  const cached = readCachedBuckets();
  if (cached && cached.length) {
    renderBuckets(cached);
  }
  loadBuckets();

  els.form.addEventListener("submit", handleSubmit);

  // Keep the toast visible above the iOS keyboard. Without this, a fixed
  // "bottom: 24px" toast renders underneath the keyboard once the amount
  // field is refocused after a save, since iOS positions fixed elements
  // against the full layout viewport, not the visible area above the keyboard.
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateToastOffset);
    window.visualViewport.addEventListener("scroll", updateToastOffset);
    updateToastOffset();
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      /* offline shell caching is a nice-to-have, never block the app on it */
    });
  }
}

/* --------------------------------------------------------------------------
   4. Buckets
   -------------------------------------------------------------------------- */
async function loadBuckets() {
  try {
    const url = `${CONFIG.SCRIPT_URL}?action=getBuckets&token=${encodeURIComponent(CONFIG.API_TOKEN)}`;
    const res = await fetch(url, { method: "GET" });
    const data = await res.json();

    if (!data || !data.success || !Array.isArray(data.buckets)) {
      throw new Error("Malformed response");
    }

    renderBuckets(data.buckets);
    cacheBuckets(data.buckets);
  } catch (err) {
    // If we already rendered a cached list, fail silently — the app still works.
    if (!els.buckets.children.length) {
      els.buckets.innerHTML =
        '<div class="buckets-error">Couldn\u2019t load categories. Check your connection.</div>';
    }
    console.error("loadBuckets failed:", err);
  }
}

function renderBuckets(bucketNames) {
  els.buckets.innerHTML = "";

  if (!bucketNames.length) {
    els.buckets.innerHTML = '<div class="buckets-empty">No categories set up yet.</div>';
    return;
  }

  bucketNames.forEach((name) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "bucket-chip";
    chip.setAttribute("role", "radio");
    chip.setAttribute("aria-checked", "false");
    chip.dataset.bucket = name;
    chip.innerHTML = `<span class="chip-icon">${bucketIcon(name)}</span><span>${escapeHtml(name)}</span>`;
    chip.addEventListener("click", () => selectBucket(name));
    els.buckets.appendChild(chip);
  });

  // Re-apply selection if the user had already picked one (e.g. after a refresh).
  if (selectedBucket) {
    highlightSelectedChip();
  }
}

function selectBucket(name) {
  selectedBucket = name;
  highlightSelectedChip();
}

function highlightSelectedChip() {
  Array.from(els.buckets.children).forEach((chip) => {
    const isSelected = chip.dataset.bucket === selectedBucket;
    chip.classList.toggle("selected", isSelected);
    chip.setAttribute("aria-checked", String(isSelected));
  });
}

// Single-color line icons (currentColor) so they automatically switch from
// grey to white when a chip is selected, without any extra styling. Kept as
// small hand-drawn SVGs rather than an icon library, per the no-external-
// dependencies brief. Buckets always come from the Sheet — this only
// affects which icon is shown, never what's selectable.
const ICONS = {
  food: '<path d="M6 3v6M8 3v6M10 3v6M8 9v12"/><ellipse cx="16" cy="5" rx="3" ry="4"/><path d="M16 9v12"/>',
  fuel: '<rect x="5" y="4" width="9" height="16" rx="1.5"/><line x1="5" y1="9" x2="14" y2="9"/><path d="M14 9h3a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0v-5l-2-2"/>',
  transport: '<path d="M3 17h18"/><path d="M4 17l1.3-5.5A2 2 0 0 1 7.2 10h9.6a2 2 0 0 1 1.9 1.5L20 17"/><path d="M8 10V7a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3"/><circle cx="7.5" cy="17" r="1.5"/><circle cx="16.5" cy="17" r="1.5"/>',
  shopping: '<path d="M5 9h14l-1.2 11.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 9z"/><path d="M9 9V7a3 3 0 0 1 6 0v2"/>',
  entertainment: '<rect x="3" y="8" width="18" height="12" rx="1.5"/><path d="M3 8l3-4h4l-3 4z"/><path d="M10 8l3-4h4l-3 4z"/><path d="M17 8l2-4h2v4z"/>',
  rent: '<path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/><rect x="10" y="14" width="4" height="5"/>',
  rental: '<rect x="5" y="3" width="14" height="18" rx="1"/><rect x="8" y="6" width="2.5" height="2.5"/><rect x="13.5" y="6" width="2.5" height="2.5"/><rect x="8" y="11" width="2.5" height="2.5"/><rect x="13.5" y="11" width="2.5" height="2.5"/><rect x="9.5" y="16" width="5" height="5"/>',
  electricity: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.3 1 2.5h6c0-1.2.3-1.8 1-2.5A6 6 0 0 0 12 3z"/>',
  dues: '<path d="M6 2h12v19l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5V2z"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="15" x2="13" y2="15"/>',
  investments: '<polyline points="4,17 10,11 14,15 20,7"/><polyline points="14,7 20,7 20,13"/>',
  misc: '<path d="M3 12l8-8 9 9-8 8z"/><circle cx="8" cy="9" r="1.3"/>',
};
const DEFAULT_ICON = '<rect x="4" y="4" width="16" height="16" rx="3"/>';

function bucketIcon(name) {
  const inner = ICONS[name.trim().toLowerCase()] || DEFAULT_ICON;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

function readCachedBuckets() {
  try {
    const raw = localStorage.getItem(CONFIG.BUCKETS_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cacheBuckets(bucketNames) {
  try {
    localStorage.setItem(CONFIG.BUCKETS_CACHE_KEY, JSON.stringify(bucketNames));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

/* --------------------------------------------------------------------------
   5. Form submit
   -------------------------------------------------------------------------- */
async function handleSubmit(e) {
  e.preventDefault();

  const amount = parseFloat(els.amount.value);
  if (!amount || amount <= 0) {
    els.amount.focus();
    return;
  }
  if (!selectedBucket) {
    // Nudge the buckets area so it's obvious what's missing.
    els.buckets.animate(
      [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
      { duration: 220, easing: "ease-in-out" }
    );
    return;
  }

  setSaving(true);

  const payload = {
    action: "addExpense",
    token: CONFIG.API_TOKEN,
    amount: amount,
    bucket: selectedBucket,
    merchant: els.merchant.value.trim(),
    notes: els.notes.value.trim(),
  };

  try {
    const res = await fetch(CONFIG.SCRIPT_URL, {
      method: "POST",
      // text/plain avoids a CORS preflight against the Apps Script endpoint.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!data || !data.success) {
      throw new Error((data && data.error) || "Unknown error");
    }

    showToast("Expense Saved");
    resetForm();
  } catch (err) {
    showToast("Couldn\u2019t save — try again");
    console.error("addExpense failed:", err);
  } finally {
    setSaving(false);
  }
}

function resetForm() {
  els.form.reset();
  selectedBucket = null;
  highlightSelectedChip();
  // Keep the sheet open, ready for the next expense.
  els.amount.focus();
}

function setSaving(isSaving) {
  els.saveBtn.disabled = isSaving;
  els.saveBtn.classList.toggle("loading", isSaving);
}

/* --------------------------------------------------------------------------
   6. Toast / small helpers
   -------------------------------------------------------------------------- */
let toastTimer = null;

function showToast(message) {
  updateToastOffset();
  els.toastText.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 1600);
}

// How tall the on-screen keyboard currently is (0 when it's closed).
function getKeyboardInset() {
  if (!window.visualViewport) return 0;
  const vv = window.visualViewport;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}

// Push the toast up so it always sits above the keyboard, plus a small margin.
function updateToastOffset() {
  const offset = getKeyboardInset() + 24;
  document.documentElement.style.setProperty("--toast-bottom", `${offset}px`);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();
