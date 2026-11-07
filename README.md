# DeepTrack

A small, self-hosted investment tracker for Indian families. Everyone in the workspace sees the same portfolio; admins can edit and viewers get read-only access.

## Quick start

Requires Python 3.10 or newer.

- **Windows** — double-click `start.bat`. The first run creates a local `.venv`, installs dependencies, then starts the app.
- **macOS / Linux** — run `./start.sh` (or `bash start.sh`).

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
- **Masters for brokers and demat accounts** — save each demat account once (member, broker/DP, client ID, nickname), then pick it from a dropdown on stocks and ETFs. Sector, broker and current price fill in automatically, so those fields are read-only in the forms and never appear as columns in the template.
- **KYC and bank details per member** — PAN, Aadhaar, date of birth, phone, address, IFSC, bank, branch, account number and type. Enter an IFSC and the app fills the bank and branch from the free Razorpay IFSC directory; lookups are cached locally and you can always type the details manually.
- **Privacy by default** — PAN, Aadhaar and account numbers are masked for viewers and for other members. Only the owner and admins see them in full.
- **Dashboard** — portfolio value, invested amount, unrealised gain, monthly SIP total, allocation donut, value by instrument type, member split, largest holdings, upcoming maturities and recent activity.
- **Auto-calculated amounts** — quantity × price for market-linked holdings, contributions × months for RD, and similar rules. Leave *Amount invested* or *Current value* blank and the app derives them from the details.
- **NSE market data** — download `EQUITY_L.csv` and the daily bhavcopy straight from NSE, upload them, then search any scrip by three letters and refresh live prices. See below.
- **Row and bulk actions** — edit or delete any holding from its row; admins can also tick several rows (or select all) and delete them in one go.
- **Google sign-in with an email allowlist** — optionally let selected Gmail/Google accounts in through Firebase Authentication, enforced on the server. See [Google sign-in and hosted access](#google-sign-in-and-hosted-access).
- **Excel import/export** — see below.

## NSE market data

Open **Market data** (admins only). The page has three parts:

1. **Download from NSE** — fetches `EQUITY_L.csv` (every listed scrip with symbol, name, ISIN and face value) and the current-day bhavcopy (end-of-day prices). The bhavcopy date defaults to today; NSE serves the latest trading day and the app skips weekends and holidays automatically. Both files land in your browser's downloads folder.
2. **Upload to the app** — drop the downloaded `.csv`, `.zip` or `.txt` file on the upload zone. The app recognises the file from its header row and imports scrips or prices into the local database. EQUITY_L takes a few seconds (~2,600 scrips); a bhavcopy adds price rows for every traded symbol.
3. **Update prices** — once a bhavcopy is loaded, click **Update current prices**. For every stock and ETF holding with a matching symbol, the app copies the closing price into *LTP* (stocks) or *Current price* (ETFs) and recalculates the current value. The result shows how many holdings were updated and lists any symbols it could not find.

You can also upload the files out of band: download them from NSE yourself and drop them on the same zone. The uppercase-series (EQ) row wins if a symbol trades in several series.

With scrips loaded, the **Symbol** field in stock and ETF forms becomes a search box — type at least three letters (for example `REL`) and pick a suggestion. The app fills the company name and exchange; sector, LTP and broker details come from the market data and Masters automatically.

NSE rate-limits and occasionally changes its archive URLs. If a download fails, the toast explains what to do; a manual download plus upload always works.

## Excel import and export

Open **Import / export** and download the template. It contains:

- a **Read me** sheet with instructions and an example,
- a **Field guide** sheet listing every field, whether it is required and the allowed options,
- one tab per instrument type (14 tabs), each with dropdowns for Indian banks, AMCs, insurers, exchanges, crypto platforms, policy types and so on,
- a hidden `_lists` sheet that powers those dropdowns.

Every tab holds raw inputs only, apart from two calculated columns on the fixed deposit tab. The purchase/start date sits right after the quantity column. The fixed deposit tab runs **Company name**, **Type** (Fixed or Cumulative), **Reference no**, **Amount deposited**, **Date of purchase**, **Interest rate**, tenor years/months/days and **Interest frequency**, followed by **Maturity date** and **Maturity amount**, which fill themselves in and need no input, then bank details, **Primary depositor**, joint depositors and nominee. Recurring deposits and small savings follow the same order without the company and type columns. These tabs have no name column because DeepTrack names each deposit from the company, bank or scheme and reference number (for example `FD · Bajaj Finance · FD-9001`). The Demat column lists the accounts saved under **Masters**, and the bank dropdowns include small finance banks.

Fill one row per holding. Columns marked `*` are required. Three conveniences:

- Leave **Amount invested** and **Current value** blank and they are computed from the detail fields (for example units × average price). Recurring deposits total the monthly deposit over the tenor.
- Enter the tenor on the fixed deposit tab: the maturity date follows and, for **Type** Fixed the maturity amount equals the amount deposited, while Cumulative adds compounded interest. **Interest frequency** defaults to Quarterly (what AU Small Finance Bank, Suryoday and most Indian banks use; a blank cell counts as Quarterly), and the interest period counts every year as 365 days, so a Feb 29 falling inside the term is not counted — this reproduces the bank's figure to the rupee. Pick Monthly, Half-yearly, Annual or Simple when the bank compounds that way. If the bank statement only gives the maturity date, paste it and leave the tenor blank. On recurring deposits and small savings you can enter either the tenor or the maturity date.
- The blank template has no **Owner** column: every imported row is saved under the member who signs in and uploads it. Exports do include Owner, so backups keep each holding with its member; an uploaded file that still has an Owner column is honoured.

Upload the filled workbook to get a **preview** of every row, including errors, computed-value notices and duplicate warnings. Every error names the tab, the row and the column to change. Click **Rows to fix** to download a workbook containing only the rows that failed, with the problem cells highlighted and a **What to fix** column explaining each one — repair those rows and upload the file again. Nothing is saved until you click **Import**, and holdings that are already in the portfolio are marked **Already imported** and skipped automatically. Repeats are recognised only by the holding's own unique identifiers — reference number, ISIN, symbol, folio, policy, UAN, PRAN, bill or survey number, or crypto coin plus platform — so a corrected re-upload only adds the rows that are genuinely new, even if you also fixed the name. Names, amounts and rates are never used for matching: two deposits from the same company can have identical amounts, and a reference left blank or entered as a placeholder (TOBEFILLED, TBD, NA) is ignored, so those rows import and can be completed later.

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

### Hosting the app

GitHub Pages cannot run this app: it only serves static files, while DeepTrack needs Python, SQLite, server sessions and NSE downloads. Run the Flask app on a host with a disk and point the GitHub Pages page at it.

```bash
docker build -t deeptrack .
docker run -p 8080:8080 -v "$PWD/data:/app/data" --env-file .env deeptrack
```

Add `-e DEEPTRACK_HTTPS=1` when the container is served over HTTPS so session cookies are marked `Secure`. The image uses gunicorn with **one worker** because SQLite allows a single writer; keep one instance so all users share the same file. Render, Fly.io and Railway all support a persistent disk — mount it at `/app/data`. Cloud Run's filesystem is ephemeral unless you mount a storage bucket, so a redeploy there resets the portfolio.

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
  market.py         NSE download, EQUITY_L/bhavcopy parsing, scrip search,
                    price refresh
  excelio.py        template generation, import parsing, export
  services.py       response shaping, masking and dashboard maths
  seed.py           sample family portfolio
  db.py             SQLite schema and helpers
  validators.py     Indian number/date/PAN/Aadhaar/IFSC parsing and masking
static/             no-build single-page frontend (HTML, CSS, ES modules)
docs/               static landing page for GitHub Pages
docs/DEPLOYMENT.md  Firebase + hosting + GitHub walkthrough
Dockerfile          gunicorn image for hosted deployments
.env.example        every setting, ready to copy to .env
data/               created at runtime
```

The frontend is plain HTML, CSS and ES modules — there is no build step. Edit files under `static/` and reload the browser.
