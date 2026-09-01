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
   1. Config
   -------------------------------------------------------------------------- */
const CONFIG = {
  // Paste the Web App URL you get after deploying google-apps-script.gs
  // (Deploy > New deployment > Web app). See README.md for the full steps.
  SCRIPT_URL: "https://script.google.com/macros/s/AKfycbwYLQJ9wU960BWfDvrH5Smdt0zFLYc3RiaJgNjPK9qVfKNuLo_NCgpm3EF_qY6p5VQK/exec",

  // Cache bucket names locally so the sheet opens instantly on repeat visits,
  // even before the network call to Google Sheets resolves.
  BUCKETS_CACHE_KEY: "expenseLogger.buckets.v1",
};

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
    const url = `${CONFIG.SCRIPT_URL}?action=getBuckets`;
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
    chip.innerHTML = <span>${escapeHtml(name)}</span>;
    chip.addEventListener("click", () => selectBucket(name));
    els.buckets.appendChild(chip);
   //<span class="emoji">${bucketEmoji(name)}</span>
     
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

// Small, purely cosmetic emoji map with a sensible fallback.
// Buckets themselves always come from the Sheet — this never gates what's selectable.
function bucketEmoji(name) {
  const map = {
    food: "🍔",
    fuel: "⛽",
    transport: "🚗",
    shopping: "🛒",
    entertainment: "🎬",
    rent: "🏠",
    investments: "📈",
    misc: "📦",
  };
  return map[name.trim().toLowerCase()] || "🏷️";
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
  els.toastText.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 1600);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();
