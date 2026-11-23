# DeepTrack

A small, self-hosted investment tracker for Indian families. Everyone in the workspace sees the same portfolio; admins can edit and viewers get read-only access.

**New to DeepTrack? Read the [beginner user manual](docs/USER-MANUAL.md)** — every task explained step by step, from signing in to importing Excel and refreshing share prices.

## Quick start

Requires Python 3.10 or newer.

- **Windows** — double-click `start.bat`. The first run creates a local `.venv`, installs dependencies, then starts the app.
- **macOS / Linux** — run `./start.sh` (or `bash start.sh`).
- **Use it from your phone** — double-click `start-lan.bat` instead; it prints the Wi-Fi address (e.g. `http://192.168.1.5:5000`) to open on the phone. Once hosted on HTTPS, the same app installs to the home screen (Android: *Install app*; iPhone: *Share → Add to Home Screen*). See the [user manual, section 21](docs/USER-MANUAL.md#21-using-deeptrack-on-your-phone).

Or do it manually:

```bash
python -m pip install -r requirements.txt
python run.py
```

The browser opens automatically at <http://localhost:5000>. The first visit asks you to create the admin account (name, email, password). That account can then add the rest of the family from **Members**. Set `DEEPTRACK_OPEN_BROWSER=0` if you would rather open the page yourself.

With Firebase configured, the first visit instead shows **Create your workspace** with only **Continue with Google** — the first allowlisted Google account creates the workspace and becomes admin. Password setup is not offered while Google sign-in is enabled.

To explore with realistic data, open the empty dashboard and click **Load sample portfolio**. It creates three demo members and 30 holdings without touching your own account:

| Email | Role | Password |
| --- | --- | --- |
| ananya@example.com | Admin | `Invest@2026` |
| rohan@example.com | Viewer | `Invest@2026` |
| meera@example.com | Viewer | `Invest@2026` |

## What's inside

- **One shared portfolio** with role-based access:
  - **Admin** — add, edit and delete holdings, manage members, import/export.
  - **Viewer** — browse everything, edit their own profile and password. No write access to the portfolio.
- **Fourteen instrument types** across the three asset classes:
  - **Equity** — direct stocks, mutual funds, ETFs
  - **Debt** — fixed deposits, recurring deposits, bonds & G-Secs, PPF, EPF/VPF, NPS, small savings (NSC/KVP/SSY/SCSS)
  - **Other** — real estate, jewellery & bullion, crypto, insurance policies
- **India-specific fields** — broker/DP, folio, NAV, SIP amount, compounding and payout, UAN/PRAN, BIS hallmark, crypto platform, policy and fund value, loan outstanding, ownership share, and more.
- **Masters for brokers and demat accounts** — save each demat account once (member, broker/DP, client ID, nickname), then pick it from a dropdown on stocks and ETFs. Sector and current price fill in automatically; picking a demat account also fills the **Broker / DP** dropdown, which stays editable so holdings saved without an account can still be tagged to a broker.
- **KYC and bank details per member** — PAN, Aadhaar, date of birth, phone, address, IFSC, bank, branch, account number and type. Enter an IFSC and the app fills the bank and branch from the free Razorpay IFSC directory; lookups are cached locally and you can always type the details manually.
- **Privacy by default** — PAN, Aadhaar and account numbers are masked for viewers and for other members. Only the owner and admins see them in full.
- **Dashboard** — portfolio value, invested amount, unrealised gain and financial-year income KPIs (the income card opens the Income page); an asset-class spread whose class rows and instrument-type rows drill into the ledger; member-wise invested/value/share split; investments by broker with a brand mark per broker; largest holdings; upcoming maturities. Every holding carries the brand mark of the company behind it — fund house, bank/NBFC, issuer, insurer, employer or the traded company itself — with broker marks kept as a small badge on the holding's sub-line. Over 100 real company logos ship in `static/img/logos/`: stock and ETF logos come from Groww's public company-logo service keyed by NSE symbol, banks/insurers from their own site icons, and a few from Wikimedia. Names are matched loosely, so "HDFC Bank Ltd" or "FD – HDFC Bank – 123" still find their logo; SFB and company deposits are covered too (Utkarsh, Suryoday, Equitas, slice, Sundaram, Shriram, Tamil Nadu Power Finance), state issuers such as APCRDA (Amaravati) and UPPCL are included for bonds, and a deposit saved with **Other** and a company name shows that company's logo. Companies without an image keep coloured initials, and you can drop in or replace any logo yourself. KPI cards, class rows, type rows, member rows, broker tiles, maturity rows and income rows are clickable and open the ledger or the holding behind them.
- **Investments** — one ledger with search, category/type/member filters and sorting, plus an **All holdings / By member** toggle that groups holdings into member sections with subtotals. Columns are **Holding, Key details, Owner, Invested, Current, Gain**. **Current** shows principal plus interest accrued to date for cumulative deposits and bonds, and the principal only for instruments that pay interest out periodically (fixed FDs, coupon bonds, MIS/SCSS); a footnote under the table states the rule. The drill-down drawer shows the maturity date and the maturity value beside the current value. **Gain** is rounded to the rupee with a ▲/▼ trend icon and the percentage beside it. In the FD form, choosing **Type = Cumulative** disables the **Interest frequency** box, since no periodic interest is paid.
- **Trade history and the realised/unrealised split** — open a stock, ETF or equity fund and its drawer lists every trade, with **Import Kotak per-scrip report** for the Kotak Neo *Portfolio Transactions* export (one scrip per file). Trades are fingerprinted, so re-importing a file or overlapping date ranges only adds genuinely new rows, and a scrip-name check blocks attaching the wrong file. The drawer shows **Realised · FIFO** (profit booked on sells, oldest buys matched first) and **Unrealised** (current value minus the cost of the units still held), plus the realised gain on each sell. If the imported history doesn't add up to the recorded quantity, unrealised gain shows **—** with an explanation instead of a misleading number. Deleting one trade recalculates both figures.
- **Works on phones, installs like an app** — the layout adapts to small screens (slide-out menu, wrapped toolbars, sideways-scrolling tables, full-height edit sheets). A web app manifest and service worker make the hosted HTTPS address installable on Android and iPhone home screens, with an offline shell when the network drops. `start-lan.bat` serves the app to phones on the same Wi-Fi.
- **Income page** — a separate section for everything your holdings pay you. Admins record dividends, FD interest, rent or other receipts against any holding, as *received in bank* or *expected*; income is grouped by financial year (April–March) and by investment, pending entries wait in the credit checklist until an admin ticks them off, member bank details sit alongside, and the dividend/bonus fetcher lives here too. An **Interest credited** card counts only the interest actually paid out in the selected financial year — fixed-payout FD interest and bond/NCD/G-Sec/SGB coupons as they pay during the year, and cumulative deposits/bonds (FD, RD, NSC, KVP, SSY, post office TD, cumulative bonds) once, on their maturity date, with the interest already rolled into the amount. Holdings maturing later are listed as *paid at maturity · outside this year* rather than counted, and PPF/EPF/NPS accrual is left out until withdrawn. Every amount shows its basis and credit date, alongside interest already recorded; nothing is added to totals until you record the actual credit.
- **Activity log** — a separate page with the workspace's full history (adds, edits, deletes, imports, corporate actions, income records), newest first, 100 entries at a time with **Load older**. It is never trimmed and survives restarts and redeployments.
- **Dividends and bonus shares, auto-fetched** — pick an Indian financial year (1 April to 31 March: this FY, previous FY, or the last 3/5 FYs) and DeepTrack pulls corporate actions for every stock and ETF from NSE (Yahoo Finance as fallback). Dividends are turned into pending income credits (quantity × per-share amount) for review; bonus and split actions update the quantity, average cost and price directly. Nothing is applied until you tick the actions and confirm, and already-applied actions are skipped.
- **Auto-calculated amounts** — quantity × price for market-linked holdings, contributions × months for RD, yearly contributions plus interest for PPF (credited every 31 March), and similar rules. Leave *Amount invested* or *Current value* blank and the app derives them from the details.
- **NSE market data, imported automatically** — the equity master (`EQUITY_L.csv`) and the latest bhavcopy — covering equity shares, ETFs and every other listed cash-market product — are pulled straight from NSE on startup and on demand, with no file upload. The page always shows the dates the data is as of. See below.
- **Row and bulk actions** — edit or delete any holding from its row; admins can also tick several rows (or select all) and delete them in one go.
- **Google sign-in with an email allowlist** — optionally let selected Gmail/Google accounts in through Firebase Authentication, enforced on the server. See [Google sign-in and hosted access](#google-sign-in-and-hosted-access).
- **Excel import/export** — see below.

## NSE market data

Open **Market data** (admins only). The app imports NSE data by itself; you never have to download or upload files:

1. **Automatic import** — at startup, and whenever you click **Sync from NSE**, DeepTrack fetches `EQUITY_L.csv` (every listed scrip with symbol, name, ISIN and face value) and the latest bhavcopy (end-of-day prices for the whole cash-market segment: equity shares, ETFs and any other listed cash-market products). The bhavcopy date defaults to today; NSE serves the latest trading day and the app skips weekends and holidays automatically. Startup only re-fetches when the stored prices are more than 12 hours old.
2. **Data dates are shown** — the page header and KPI cards display the date the NSE equity list was loaded and the trade date of the bhavcopy in use, so you always know how fresh the prices are.
3. **Update prices** — once a bhavcopy is loaded, click **Update current prices**. For every stock and ETF holding with a matching symbol, the app copies the closing price into *LTP* (stocks) or *Current price* (ETFs) and recalculates the current value. The result shows how many holdings were updated and lists any symbols it could not find.

If your network blocks NSE, the **If the sync is blocked** card still accepts an `EQUITY_L.csv` or bhavcopy you downloaded yourself — drop it on the zone and the app recognises the file from its header row. The uppercase-series (EQ) row wins if a symbol trades in several series.

With scrips loaded, the **Symbol** field in stock and ETF forms becomes a search box — type at least three letters (for example `REL`) and pick a suggestion. The app fills the company name and exchange; sector, LTP and broker details come from the market data and Masters automatically. ETF names work as well (`NIPPON NIFTY` finds NIFTYBEES despite NSE's abbreviations).

The **Scheme name** field in the mutual fund form searches AMFI's daily NAV file and drills down: each scheme lists its Direct/Regular × Growth/IDCW variants with the latest NAV, and picking one fills the AMC, category, plan, option and current NAV. That list downloads automatically on startup, no upload needed.

NSE rate-limits and occasionally changes its archive URLs. If an automatic sync fails, the toast explains what to do, and the manual fallback (drop a file you downloaded yourself) always works.

## Excel import and export

Open **Import / export** and download the template. It contains:

- a **Read me** sheet with instructions and an example,
- a **Field guide** sheet listing every field, whether it is required and the allowed options,
- one tab per instrument type (14 tabs), each with dropdowns for Indian banks, AMCs, insurers, exchanges, crypto platforms, policy types and so on,
- a hidden `_lists` sheet that powers those dropdowns.

Every tab holds raw inputs only, apart from two calculated columns on the fixed deposit tab. The purchase/start date sits right after the quantity column. The fixed deposit tab runs **Company name**, **Type** (Fixed or Cumulative), **Reference no**, **Amount deposited**, **Date of purchase**, **Interest rate**, tenor years/months/days and **Interest frequency**, followed by **Maturity date** and **Maturity amount**, which fill themselves in and need no input, then bank details, **Primary depositor**, joint depositors and nominee. Recurring deposits and small savings follow the same order without the company and type columns. These tabs have no name column because DeepTrack names each deposit from the company, bank or scheme and reference number (for example `FD · Bajaj Finance · FD-9001`). The Demat column lists the accounts saved under **Masters**, the stocks and ETFs tabs also carry a **Broker / DP** column, and the bank dropdowns include small finance banks.

Fill one row per holding. Columns marked `*` are required. Three conveniences:

- Leave **Amount invested** and **Current value** blank and they are computed from the detail fields (for example units × average price). Recurring deposits total the monthly deposit over the tenor.
- Enter the tenor on the fixed deposit tab: the maturity date follows and, for **Type** Fixed the maturity amount equals the amount deposited, while Cumulative adds compounded interest. Type the tenor in whichever unit the bank quotes — 3 years, 36 months or 1095 days all work, any count is accepted (there is no 11-month or 31-day cap), and combinations add up. **Interest frequency** defaults to Quarterly (what AU Small Finance Bank, Suryoday and most Indian banks use; a blank cell counts as Quarterly), and the interest period counts every year as 365 days, so a Feb 29 falling inside the term is not counted — this reproduces the bank's figure to the rupee. Pick Monthly, Half-yearly, Annual or Simple when the bank compounds that way. If the bank statement only gives the maturity date, paste it and leave the tenor blank. On recurring deposits and small savings you can enter either the tenor or the maturity date.
- Every row names its **Owner** in the Owner column — the template includes a member dropdown. Rows with no owner are held back in the preview instead of being assigned to whoever uploads the file. Older files without an Owner column can be given one owner for the whole upload with the **Owner for rows with no Owner column** selector above the dropzone.

If retyping the template is too much, upload the holdings report your broker already gives you. In **ICICI Direct** (Portfolio → Holdings → **Download**) or **Kotak Securities** (Portfolio → **Export**), save the Excel/CSV file and drop it on **Upload a broker report**. DeepTrack finds the header row in each sheet, reads stocks, ETFs and mutual funds, and works out the rest itself: the exchange symbol from the ISIN or company name in the NSE master, the AMFI scheme, plan, option and AMC for funds, and amounts from quantity × price. Choose whose report it is in the **Whose broker report is this?** dropdown before dropping the file; nothing is assigned to the uploader by default. `.xlsx`, `.xlsm`, `.xls` and `.csv` are accepted — `.xls` needs the `xlrd` package, which `requirements.txt` installs. Columns are matched by their labels, so broker exports that reorder or rename a column still parse; total rows and zero-quantity rows are skipped. Kotak's **Portfolio Holdings** CSV ("Script Name", "Avg Unit Cost", "Invested Value") and its **Demat Holdings & Valuation** Excel both parse; the valuation file has no purchase cost, so its rows import with the average cost defaulted to the current price and a warning, and an existing holding keeps its saved average cost. Anything the parser cannot resolve — usually a small company missing from the NSE master, or a fund whose AMFI name is too different — is flagged in the preview with a note so you can fix just that cell before importing. The broker file goes through the same preview, duplicate check and **Import** click as the template.

Upload the filled workbook to get a **preview** of every row, including errors, computed-value notices and duplicate warnings. Every error names the tab, the row and the column to change. Click **Rows to fix** to download a workbook containing only the rows that failed, with the problem cells highlighted and a **What to fix** column explaining each one — repair those rows and upload the file again. Nothing is saved until you click **Import**, and holdings that are already in the portfolio are marked **Already imported** and skipped automatically. Repeats are recognised only by the holding's own unique identifiers — reference number, ISIN, symbol, folio, policy, UAN, PRAN, bill or survey number, or crypto coin plus platform — so a corrected re-upload only adds the rows that are genuinely new, even if you also fixed the name. Names, amounts and rates are never used for matching: two deposits from the same company can have identical amounts, and a reference left blank or entered as a placeholder (TOBEFILLED, TBD, NA) is ignored, so those rows import and can be completed later.

Quantities change when you buy more. Tick **Update holdings whose quantity or average cost changed** above the upload zones and a row that matches an existing holding (same member and identifier) is previewed as **Will update this holding — Quantity 35 → 40**, with invested and current value recomputed from the new units and prices; **Import** then edits that holding in place and reports **updated 1**. Average-cost changes with the same quantity work the same way, and a row naming a different member is never updated — it falls back to the duplicate skip. Leave the checkbox off to keep the old add-only behaviour. Either way, a file is fingerprinted by SHA-256: uploading the exact same file again is refused with the date and member of the original import, so nothing can be applied twice.

Every saved holding also gets a permanent, random **Record ID** such as `DT-7K4M-9QX2`, guaranteed unique by the database and shown in its detail panel. The template and every export carry it as the first column: leave it blank for a new holding, and keep it as-is to refer to an existing one. A row whose Record ID is already in the portfolio is skipped even if its name, reference, amount and rate were all edited; a Record ID that is not in the portfolio is flagged rather than silently added. Files without the column still fall back to the reference/ISIN/symbol matching above. Receipt, folio, policy, UAN, PRAN, bill and survey numbers are matched across the whole family, so a row already saved for another member is marked **Already recorded for <name>** and skipped rather than added twice; symbols and ISINs stay per member, because two people can legitimately hold the same stock or bond. **Export portfolio** produces the same workbook format for backups or offline editing.

## Data and configuration

Everything is stored locally:

- `data/tracker.db` — SQLite database (WAL mode)
- `data/secret.key` — generated signing key for session cookies
- `data/imports/` — temporary import previews, deleted on commit and expired after two hours

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEEPTRACK_HOST` | `127.0.0.1` | Bind address |
| `DEEPTRACK_PORT` | `5000` | Port |
| `DEEPTRACK_DEBUG` | off | Flask debug mode |
| `DEEPTRACK_DATA_DIR` | `./data` | Data directory |
| `DEEPTRACK_DB` | `data/tracker.db` | Database path |
| `DEEPTRACK_SECRET_KEY` | generated | Session signing key |
| `DEEPTRACK_OPEN_BROWSER` | on | Open the app in the default browser at start-up; set `0` to disable |
| `DEEPTRACK_HTTPS` | off | Set on hosted instances so session cookies are `Secure` |
| `DEEPTRACK_FIREBASE_PROJECT` | — | Firebase project ID; enables Google sign-in together with the two values below |
| `DEEPTRACK_FIREBASE_API_KEY` | — | Web API key from the Firebase console (public by design) |
| `DEEPTRACK_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com` | Override only for custom auth domains |
| `DEEPTRACK_FIREBASE_APP_ID` | — | Optional web app ID from the Firebase console |
| `DEEPTRACK_ALLOWED_EMAILS` | — | Comma-separated Google accounts allowed to sign in; sign-in stays off while empty |
| `DEEPTRACK_ADMIN_EMAILS` | — | Subset of the allowlist that always gets the admin role |
| `DEEPTRACK_PASSWORD_LOGIN` | on | Set `0` on hosted instances to allow Google sign-in only |
| `DEEPTRACK_FIREBASE_CREDENTIALS` | — | Path to a Firebase service-account JSON key; enables cloud storage (Firestore) |
| `DEEPTRACK_FIREBASE_CREDENTIALS_JSON` | — | Inline service-account JSON (alternative to the path above; used on Render) |

## Google sign-in and hosted access

Google sign-in proves who the user is; the app then checks the email against `DEEPTRACK_ALLOWED_EMAILS` **on the server** and creates a session. A browser never decides who gets in.

1. Create a project at <https://console.firebase.google.com>, enable **Authentication → Sign-in method → Google**, and add a web app to copy its config.
2. In **Authentication → Settings → Authorized domains**, add the domain where the app will run (localhost is pre-authorised for testing).
3. Start the server with:

```bash
export DEEPTRACK_FIREBASE_PROJECT="your-project-id"
export DEEPTRACK_FIREBASE_API_KEY="AIza..."
export DEEPTRACK_ALLOWED_EMAILS="you@gmail.com,partner@gmail.com"
export DEEPTRACK_ADMIN_EMAILS="you@gmail.com"
export DEEPTRACK_PASSWORD_LOGIN=0
python run.py
```

The login screen then shows **Continue with Google** instead of the password form. On an empty workspace the card reads **Create your workspace** and offers Google only — the first allowlisted account to sign in becomes admin; later accounts join as viewers (promote them in **Members**). The server also rejects the password setup endpoint in this mode. Removing an email from the allowlist blocks that account on its next sign-in, and deactivating a member blocks it immediately.

If any of the Firebase variables are missing, sign-in is disabled and the app keeps the local password flow, so nothing breaks for offline use.

**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) is the step-by-step walkthrough** — Firebase console clicks, the exact `.env`, Render with a persistent disk, GitHub Pages, and a troubleshooting table.

### Cloud storage — data always lives in the cloud (Firebase Firestore)

Set `DEEPTRACK_FIREBASE_CREDENTIALS` (path to a service-account JSON key) or `DEEPTRACK_FIREBASE_CREDENTIALS_JSON` (the JSON itself) and the portfolio becomes cloud-backed: on start-up the app loads the cloud copy (uploading your local data the first time if the cloud is empty), and after every successful add/edit/delete/import it writes the change straight to Firestore. SQLite stays as a fast local working copy, so the app keeps working offline and the cloud remains the source of truth. This works the same on the family computer and on any host — with it configured you no longer need a paid persistent disk to avoid losing data. The **Import / export** banner reads *"Stored in the Firebase cloud"* and shows the last sync time (or a warning if a sync failed). Setup steps and console links: `docs/DEPLOYMENT.md` → *Firebase cloud storage*; end-user explanation: `docs/USER-MANUAL.md` → section 19. Keep the key file out of git — the ignore rules already exclude it.

### Hosting the app

GitHub Pages cannot run this app: it only serves static files, while DeepTrack needs Python, SQLite, server sessions and NSE downloads. Run the Flask app on a host with a disk and point the GitHub Pages page at it.

```bash
docker build -t deeptrack .
docker run -p 8080:8080 -v "$PWD/data:/var/data" --env-file .env deeptrack
```

Add `-e DEEPTRACK_HTTPS=1` when the container is served over HTTPS so session cookies are marked `Secure`. The image uses gunicorn with **one worker** because SQLite allows a single writer; keep one instance so all users share the same file. The image stores the database in `/var/data` — on Render, Fly.io or Railway mount the persistent disk there (the repo's `render.yaml` blueprint creates a Render service with the disk already attached). **Render disks need a paid instance**: a free instance has an ephemeral filesystem, sleeps, and loses everything on redeploy. Cloud Run's filesystem is ephemeral unless you mount a storage bucket, so a redeploy there resets the portfolio. The startup log prints `DeepTrack database: <path>`, and the **Import / export** page shows a banner saying whether the portfolio is stored in the Firebase cloud, on this computer, on a cloud disk, or on temporary storage that will be wiped. To move holdings from a local copy to the cloud, export locally and import the workbook on the hosted site (Record IDs prevent duplicates).

### Publishing the landing page on GitHub Pages

The `docs/` folder is a self-contained landing page that links to the hosted app:

1. Edit `docs/index.html` and set `meta name="app-url"` to your deployed URL.
2. Push the repository to GitHub, then **Settings → Pages → Deploy from a branch → main / docs**.
3. The page shows the product and an **Open DeepTrack** button; actual sign-in (Google or password) happens on the Flask host.

## Security notes

This is a single-tenant app designed to run on your own machine or a trusted home server. Sessions are HttpOnly, SameSite=Lax cookies with a 12-hour lifetime; passwords are hashed with Werkzeug; login attempts are rate limited; unsafe API calls are checked against the request origin; and a strict Content-Security-Policy is applied.

PAN, Aadhaar and account numbers are masked in the interface but stored as plain text in the local SQLite file. If the machine is shared or the disk could be lost, use full-disk encryption. For access over a network, put the app behind a reverse proxy with HTTPS and set `DEEPTRACK_SECRET_KEY` explicitly. Do not expose the development server directly to the internet.

When Google sign-in is enabled, Firebase ID tokens are verified against Google's public keys and the project ID, then the email is checked against the allowlist. The Firebase web API key is public by design; access control comes from token verification and the allowlist, never from hiding that key. On hosted deployments set `DEEPTRACK_HTTPS=1` and `DEEPTRACK_PASSWORD_LOGIN=0`.

## Project layout

```
run.py              entry point
tracker/            Flask app
  fields.py         single field registry that drives forms, API validation,
                    tables, Excel columns, dropdowns and import mapping
  api.py            JSON API, auth, members, investments, import/export,
                    market data and bulk delete
  firebase.py       Firebase ID token verification and the email allowlist
  cloud.py          Firestore cloud sync — portfolio always lives in the cloud
  market.py         NSE download, EQUITY_L/bhavcopy parsing, scrip search,
                    price refresh
  excelio.py        template generation, import parsing, export
  transactions.py   per-scrip broker transaction reports (Kotak Neo export)
  services.py       response shaping, masking, dashboard maths, FIFO gains
  seed.py           sample family portfolio
  db.py             SQLite schema and helpers
  validators.py     Indian number/date/PAN/Aadhaar/IFSC parsing and masking
static/             no-build single-page frontend (HTML, CSS, ES modules)
docs/               static landing page for GitHub Pages
docs/DEPLOYMENT.md  Firebase + hosting + GitHub walkthrough
docs/USER-MANUAL.md beginner task-by-task user manual
Dockerfile          gunicorn image for hosted deployments
.env.example        every setting, ready to copy to .env
data/               created at runtime
```

The frontend is plain HTML, CSS and ES modules — there is no build step. Edit files under `static/` and reload the browser.
