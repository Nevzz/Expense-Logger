# Expense Logger

A minimal, fast expense logger for iPhone. Open the app, a bottom sheet slides
up, enter an amount, pick a category, tap **Save Expense** — done. No pages,
no menus, no login. Every expense is appended straight to a Google Sheet.

Stack: Google Sheets + Google Apps Script + plain HTML/CSS/JS. No frameworks,
no build step.

---

## 1. Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new,
   blank spreadsheet. Name it something like **Expenses**.
2. You don't need to create the tabs by hand — the Apps Script below creates
   `Transactions` and `Buckets` automatically (with sensible default
   categories) the first time it runs. If you'd rather set them up yourself:

   **Transactions** — header row: `Date | Amount | Bucket | Merchant | Notes`

   **Buckets** — header row: `Bucket | Monthly Budget`, then one category per
   row in column A (emoji shown in the app is guessed from the name — e.g.
   "Food", "Fuel", "Transport", "Shopping", "Entertainment", "Rent",
   "Investments", "Misc").

## 2. Add the Apps Script

1. In your Sheet, go to **Extensions → Apps Script**.
2. Delete any starter code and paste in the full contents of
   `google-apps-script.gs`.
3. Save the project (name it "Expense Logger Backend" or similar).

## 3. Deploy it as a Web App

1. In the Apps Script editor, click **Deploy → New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Fill in:
   - **Description:** anything, e.g. "v1"
   - **Execute as:** **Me** (your account)
   - **Who has access:** **Anyone** — this is required so the app can call
     the script from your phone without a Google login prompt. Nothing else
     in the sheet is exposed; only the two functions in the script run.
4. Click **Deploy**. The first time, Google will ask you to **Authorize
   access** — approve it (you'll see an "unverified app" warning since you're
   the developer; click **Advanced → Go to Expense Logger Backend
   (unsafe)** to proceed, this is expected for your own scripts).
5. Copy the **Web app URL** it gives you. It looks like:
   `https://script.google.com/macros/s/AKfycb.../exec`

   Keep this tab open — you'll need this URL again any time you edit the
   script and deploy a **new version** (Deploy → Manage deployments → edit →
   New version), since Apps Script URLs stay the same across versions as
   long as you edit the same deployment.

## 4. Connect the frontend to the script

1. Open `app.js`.
2. Find this line near the top:
   ```js
   SCRIPT_URL: "PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE",
   ```
3. Replace the placeholder with the Web app URL you copied in step 3.

That's the only configuration needed — no API keys, no auth.

## 5. Host the files and install on your iPhone

The app is fully static (`index.html`, `style.css`, `app.js`, `manifest.json`,
`service-worker.js`, `icons/`), so any static host works — GitHub Pages,
Cloudflare Pages, Netlify, Vercel, or your own server. It **must** be served
over `https://` for the PWA install and offline caching to work on iPhone.

Quick option — GitHub Pages:
1. Create a new GitHub repo and push all the files in this project (except
   `google-apps-script.gs`, which lives inside Apps Script, not on the host).
2. In the repo, go to **Settings → Pages**, set the source to your default
   branch, and save. GitHub gives you a URL like
   `https://yourname.github.io/expense-logger/`.

Then, on your iPhone:
1. Open that URL in **Safari** (Safari specifically — install only works
   from Safari on iOS).
2. Tap the **Share** icon → **Add to Home Screen** → **Add**.
3. Launch it from the Home Screen icon. It opens straight into the bottom
   sheet, full-screen, no browser chrome — amount field already focused.

## How it works end to end

1. You tap the Home Screen icon.
2. `app.js` calls `GET {SCRIPT_URL}?action=getBuckets` to load your category
   chips from the **Buckets** sheet (cached locally too, so repeat opens are
   instant).
3. You type an amount, tap a category chip, optionally add a merchant/note,
   and tap **Save Expense**.
4. `app.js` sends `POST {SCRIPT_URL}` with a JSON body
   (`{ action: "addExpense", amount, bucket, merchant, notes }`).
5. The Apps Script appends a row to **Transactions** with today's date filled
   in automatically, and responds `{ success: true }`.
6. The app shows a small "Expense Saved" toast, clears the form, and keeps
   the sheet open — ready for the next expense.

## Editing categories

Add or remove rows in the **Buckets** sheet's column A at any time — no code
changes needed. The app re-fetches the list every time it opens.

## Notes on the CORS approach

The Apps Script POST request is sent with `Content-Type: text/plain` instead
of `application/json`. This is intentional — it keeps the request a "simple"
CORS request so the browser skips a preflight `OPTIONS` call, which Apps
Script Web Apps don't handle. The script still parses the body as JSON on
the server side (`JSON.parse(e.postData.contents)`), so nothing about the
data format changes — this is purely about avoiding a browser/Apps Script
CORS mismatch.

## Project structure (built for future expansion)

```
index.html            → the single screen (the bottom sheet)
style.css             → all styling, organized by section, tokens at the top
app.js                → flat, sectioned: config / DOM refs / init / buckets / save / toast
google-apps-script.gs → two functions only: getBuckets(), addExpense()
manifest.json          → PWA install config
service-worker.js      → offline shell caching only
icons/                 → app icons (192px, 512px)
```

The code is intentionally flat and un-abstracted for a one-screen app. When
you're ready to add more:

- **Dashboard / monthly reports** — add a new `.html` page (or a view toggle
  inside this one) that reads from `Transactions` via a new `getExpenses()`
  function in the `.gs` file, following the same `action=` routing pattern
  already used by `getBuckets`.
- **Budget tracking** — the `Buckets` sheet already has a `Monthly Budget`
  column reserved for this; add a `getBudgets()` function when you build it.
- **Savings buckets** — same pattern, new sheet + new `action`.
- **Receipt scanning / voice input** — both just need a new input method
  that ultimately fills the same `amount` / `bucket` / `merchant` / `notes`
  fields already wired to `handleSubmit()` in `app.js`.

Nothing above requires rewriting what's already here — just adding.
