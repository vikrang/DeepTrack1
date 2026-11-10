# DeepTrack — Beginner User Manual

A step-by-step guide for the whole family. No accounting or tech knowledge needed.
Every task is written as "open this → click that → here's what you'll see."

> **How to read this manual:** find the task you want in the contents below, then follow
> the numbered steps. Words in **bold** are the exact buttons and labels you'll see on
> screen. Anything in `₹` is an example amount in Indian rupees.

---

## Contents

1. [What DeepTrack is](#1-what-deeptrack-is)
2. [Who can do what (Admin vs Viewer)](#2-who-can-do-what)
3. [Opening the app and signing in](#3-opening-the-app-and-signing-in)
4. [First-time setup](#4-first-time-setup)
5. [A quick tour of the screen](#5-a-quick-tour-of-the-screen)
6. [Understanding the Dashboard](#6-understanding-the-dashboard)
7. [Adding your first investment](#7-adding-your-first-investment)
8. [Adding each type of investment](#8-adding-each-type-of-investment)
9. [Viewing, editing and deleting a holding](#9-viewing-editing-and-deleting-a-holding)
10. [Finding holdings: search, filter and sort](#10-finding-holdings)
11. [Deleting several holdings at once](#11-deleting-several-holdings-at-once)
12. [Importing from Excel (the easy bulk way)](#12-importing-from-excel)
13. [Fixing rows that failed to import](#13-fixing-rows-that-failed-to-import)
14. [Exporting and backing up your portfolio](#14-exporting-and-backing-up)
15. [Adding and managing family members](#15-adding-and-managing-family-members)
16. [Your profile, KYC and bank details](#16-your-profile-kyc-and-bank-details)
17. [Masters: saving demat accounts](#17-masters-saving-demat-accounts)
18. [Market data: live share prices](#18-market-data-live-share-prices)
19. [Where your data lives](#19-where-your-data-lives)
20. [Troubleshooting & FAQ](#20-troubleshooting--faq)
21. [Glossary](#21-glossary)

---

## 1. What DeepTrack is

DeepTrack keeps every investment your family owns in **one shared place** — fixed
deposits, mutual funds, shares, PPF, gold, property, insurance and more. Instead of
checking ten different apps and paperwork, you see one calm total: how much you put
in, what it's worth now, and how much it has grown.

Three ideas explain everything:

- **A holding** is one investment you own — for example "₹1,00,000 FD at Bajaj Finance"
  or "50 units of a mutual fund." You add one holding at a time (or many at once from Excel).
- **The workspace** is your family's shared portfolio. Everyone signs in to the *same*
  workspace and sees the same numbers.
- **Owners.** Each holding belongs to one member (you, your spouse, a parent…). The
  dashboard can show the whole family together or split it by person.

DeepTrack does **not** move money, buy or sell anything, or connect to your bank. It is
a record-keeper: you tell it what you own, and it keeps the totals and maths correct.

---

## 2. Who can do what

There are two roles. Your role is shown as a badge next to your name in **Members**.

| Task | Admin | Viewer |
| --- | :---: | :---: |
| See the dashboard and all holdings | ✅ | ✅ |
| Export the portfolio to Excel | ✅ | ✅ |
| Edit their own profile & password | ✅ | ✅ |
| Add / edit / delete holdings | ✅ | ❌ |
| Import from Excel | ✅ | ❌ |
| Add / remove members, change roles | ✅ | ❌ |
| Load market data, manage demat masters | ✅ | ❌ |

**In plain words:** an **Admin** runs the workspace; a **Viewer** can look at everything
but can't change the portfolio. If a button is missing for you, it's usually because
you're a Viewer — ask an Admin.

> Privacy note: PAN, Aadhaar and bank account numbers are **masked** (shown as dots) for
> everyone except the person they belong to and the Admins.

---

## 3. Opening the app and signing in

### On the family computer (local)

1. Double-click **`start.bat`** (Windows) or run **`./start.sh`** (Mac/Linux).
2. A browser window opens automatically at `http://localhost:5000`.
3. You'll see the **Welcome back** card.

### Signing in with Google (if your workspace uses it)

1. Click **Continue with Google**.
2. Choose the Google account your Admin allowed.
3. You're in — a toast says **Welcome, [your name]**.

> Only Gmail addresses the Admin has approved can get in. If yours isn't on the list
> you'll see "This Google account is not on the access list" — ask the Admin to add it.

### Signing in with email and password

1. Type your **Email address** and **Password**.
2. Click **Sign in**. (Use the **Show/Hide** toggle if you need to check the password.)

To leave, click **Sign out** at the bottom of the left sidebar.

---

## 4. First-time setup

The very first time the app runs there is no workspace yet, so it asks you to create one.
The person who does this becomes the first **Admin**.

**If Google sign-in is enabled:** the card reads **Create your workspace** and offers only
**Continue with Google**. Sign in with an approved account and you become the Admin.

**If it's a local/password workspace:** you'll see a **First-time setup** badge and a
**Create your workspace** form:

1. Fill in **Your name**, **Email address**, **Password** (at least 8 characters) and
   **Confirm password**.
2. Click **Create workspace**.
3. A toast says **Workspace created. Welcome!** and you land on the Dashboard.

You can now add the rest of the family (see [section 15](#15-adding-and-managing-family-members)).

> **Just want to look around first?** On the empty Dashboard click **Load sample portfolio**.
> It adds three demo members and 30 realistic holdings so you can explore every screen
> without entering anything real. Your own account is untouched.

---

## 5. A quick tour of the screen

Once signed in you'll see three areas:

- **Left sidebar** — the main menu: **Dashboard**, **Investments**, **Members**,
  **Masters**, **Market data**, **Import / export**, **My profile**.
  (**Market data** and **Import / export** appear only for Admins.)
  At the bottom: a **Dark mode / Light mode** switch and **Sign out**.
- **Top bar** — an **Add investment** button (Admins) and your profile picture.
- **Main area** — whichever page you picked.

A few friendly habits:

- Press **Esc** to close any pop-up window or side panel.
- Click your name/avatar to jump to **My profile**.
- The sidebar note reminds you: *everyone sees the same portfolio; Admins edit, Viewers read.*

---

## 6. Understanding the Dashboard

The **Dashboard** is your home screen — "Family portfolio overview." It greets you by
name and shows the date plus "N holdings across N members."

**The four number cards at the top:**

| Card | What it means |
| --- | --- |
| **Portfolio value** | What everything is worth today. The small pill shows the gain since you invested. |
| **Amount invested** | The total money you actually put in, across all holdings. |
| **Unrealised gain** | Value minus invested, and the overall return %. "Unrealised" means it's a paper gain — you haven't sold. |
| **Monthly SIPs** | The total of all your recurring monthly mutual-fund investments. |

**The charts and lists below:**

- **Asset allocation** — a donut showing how the total splits across Equity / Debt / Other.
- **Where the money sits** — the biggest instrument types by current value.
- **Largest holdings** — your top holdings; tap a row to open its full details.
- **By member** — each person's share of the family portfolio.
- **Upcoming maturities** — deposits and bonds maturing in the next 12 months.
- **Recent activity** — the last few changes (who added/edited/imported what).

**Two buttons** top-right: **Export** (download everything to Excel) and **Add investment**.

> If the portfolio is empty you'll see **Your portfolio is a blank slate** with three
> starting points: **Add investment**, **Load sample portfolio**, or **Import from Excel**.

---

## 7. Adding your first investment

Let's add a fixed deposit as a worked example. The flow is the same for every type.

1. Click **Add investment** (top bar, or on the Dashboard/Investments page).
2. A window titled **Add an investment** opens: *"Pick what you own, then fill in the details."*
3. **Choose the category** — tabs for **Equity**, **Debt**, **Other assets**. A fixed
   deposit is **Debt**, so click that.
4. **Choose the type** — click the **Fixed deposits** tile.
5. Fill the form, which is split into three parts:
   - **Holding** — the name, the **Owner** (pick the family member from the dropdown),
     and the **Purchase / start date**.
   - **Fixed deposits details** — the specifics, e.g. bank, amount, interest rate, tenor.
     Fields marked **\*** are required.
   - **Valuation** — the money figures. *All amounts are in Indian rupees.*
6. Click **Add investment** at the bottom.
7. A toast says **Holding added** and it appears in your **Investments** list.

**Two time-savers built into the form:**

- **Leave a money box blank and DeepTrack works it out.** For example, if you enter
  quantity and price, it multiplies them for you. If **Current value** is blank it
  assumes "same as invested" until you update it.
- **Some fields fill themselves.** On shares, the sector and current price come from
  market data; the demat account comes from Masters. These show as read-only with a note
  like *"Filled in automatically."*

> Not sure what a field means? Hover or read the small helper text under it, or check
> the [type-by-type guide](#8-adding-each-type-of-investment) below.

---

## 8. Adding each type of investment

Pick the category, then the type. Here's what each one asks for and a tip for it.
**Bold** fields are the ones that matter most.

### Equity

**Direct stocks** — shares you bought yourself.
Enter **Symbol / ticker** (see the search tip below), **Quantity**, **Average buy price**,
and the **Demat account** it sits in. *Current price* fills from market data.
> Tip: in the **Symbol** box type at least 3 letters (e.g. `REL`) and pick the company
> from the suggestions — DeepTrack fills the name and exchange for you. This needs
> market data loaded once (see [section 18](#18-market-data-live-share-prices)).

**Mutual funds** — SIPs and lump-sum funds.
Enter **Scheme name**, **AMC**, **Folio number**, **Units held**, **Average NAV** and
**Current NAV**. If it's a SIP, fill **SIP amount (per month)** and **SIP debit day** —
that's what feeds the Dashboard's *Monthly SIPs* card.

**ETFs** — exchange-traded funds. Like stocks: **Symbol**, **Quantity**, prices, demat account.

### Debt

**Fixed deposits (FD)** — the most common. Enter **Bank / NBFC**, **Principal deposited**,
**Interest rate**, and the **Tenor** (years / months / days). Pick **Interest frequency**
(defaults to Quarterly, which most Indian banks use) and **Type** (Fixed or Cumulative).
> DeepTrack calculates the **Maturity date** and **Maturity amount** for you — leave them
> blank. If your bank statement only shows a maturity date, type that and leave the tenor blank.

**Recurring deposits (RD)** — Enter **Monthly deposit** and the **Tenor**. DeepTrack totals
the deposits over the months and computes maturity.

**Bonds & G-Secs** — Enter **Issuer**, **Bond type**, **ISIN**, **Coupon rate** and **Maturity date**.

**PPF** — Enter the **Account number** and **Yearly contribution**.

**EPF / VPF** — Enter your **UAN** and the monthly contributions.

**NPS** — Enter **PRAN**, **Tier** and the **Pension fund manager**.

**Small savings** — NSC, KVP, SSY, SCSS. Pick the **Scheme** and the **Institution** (post office/bank).

### Other assets

**Real estate** — Enter **Property type**, **Area (sq ft)** and your **Ownership share**
(useful when a property is jointly owned).

**Jewellery & bullion** — Enter **Metal** (gold/silver), **Purity** and **Weight (grams)**.

**Crypto assets** — Enter **Coin / token**, the **Exchange / wallet** and **Quantity**.

**Insurance policies** — Enter **Insurer**, **Policy type**, **Policy number**,
**Sum assured** and **Premium**. (This records the policy's value, e.g. its fund value.)

## 9. Viewing, editing and deleting a holding

### View the full picture

1. Go to **Investments**.
2. Click any row. A side panel (the "drawer") slides open.
3. You'll see **Current value**, **Invested**, **Gain / loss** and **Return** at the top,
   then **Holding details** — every field, the **Owner**, the purchase date, a unique
   **Record ID** (like `DT-7K4M-9QX2`) and when it was last updated.

### Edit

1. Open the holding (as above) and click **Edit** — or click the pencil icon on its row.
2. The **Edit investment** window opens with everything pre-filled.
3. Change what you need (often the **Current value** to refresh today's worth) and click
   **Save changes**. A toast says **Holding updated**.

### Delete one

1. Click the trash icon on the row (or **Delete** in the drawer).
2. A confirm asks **Delete this holding?** and warns it *cannot be undone*.
3. Click **Delete holding**. Toast: **Holding deleted**.

> Viewers see a **Close** button instead of Edit/Delete — they can look but not change.

---

## 10. Finding holdings

The **Investments** page ("Every holding in one ledger") is a searchable list.

- **Search box** — type a name, owner, folio, anything: placeholder is
  *"Search by name, owner, folio…"*. It looks across names, owners, types and notes.
- **Category tabs** — **All / Equity / Debt / Other assets**, each with a count.
- **Type dropdown** — **All types**, or narrow to (say) only Fixed deposits.
- **Owner dropdown** — **Everyone**, or just one member's holdings.
- **Sort dropdown** — **Recently updated**, **Highest value**, **Highest gain**,
  **Most invested**, **Name A–Z**, **Purchase date**. You can also click a column header
  to sort by it (an arrow ↑/↓ shows the direction).

The footer totals what you're looking at: *"Showing N of M holdings · Invested ₹X ·
Value ₹Y · Gain ±₹Z."*

If nothing matches you'll see **No holdings match** — click **Clear filters** to start over.

---

## 11. Deleting several holdings at once

*(Admins only.)*

1. In **Investments**, tick the checkbox beside each holding you want to remove. Use the
   top checkbox to **select all** currently shown.
2. A bar appears: *"N holdings selected"* with **Clear** and **Delete selected**.
3. Click **Delete selected**.
4. Confirm **Delete N holdings?** — it warns this *cannot be undone* — then click **Delete N**.
5. Toast: **Deleted N holdings**.

> Tip: filter first (e.g. show only one member, or one type), then select-all, to remove
> a whole group cleanly.

---

## 12. Importing from Excel

The fastest way to move a lot of holdings in at once — the easy bulk way. *(Admins only.)*

**The idea:** download a ready-made workbook, fill one row per holding, upload it back.
DeepTrack checks every row *before* saving anything, so you always get a preview.

### Step by step

1. Open **Import / export** in the sidebar.
2. Under **Download the template**, click **Download Excel template**. You get
   `deeptrack-import-template.xlsx`.
3. Open it in Excel. It has:
   - a **Read me** sheet with instructions and an example,
   - a **Field guide** sheet listing every field and its allowed options,
   - **14 tabs**, one per investment type, with helpful dropdowns (banks, AMCs, insurers…).
4. Fill **one row per holding** on the matching tab. Columns marked **\*** are required.
5. Back in DeepTrack, under **Upload your workbook**, drag the file onto
   **Drop your filled template here** (or click to browse). Only `.xlsx` files from the
   template are accepted.
6. You'll see **Review before importing** with three counts: **N ready**,
   **N already imported**, **N need fixing**, and a row-by-row table.
7. When you're happy, click **Import N rows**.
8. Toast: **Imported N holdings**, and a banner summarises *"N imported · N already there · N skipped."*

### Three conveniences that save typing

- **Leave money boxes blank.** *Amount invested* and *Current value* are computed from the
  details (e.g. units × price). RDs total the monthly deposit over the tenor.
- **FD maturity is automatic.** Enter the tenor and DeepTrack fills the maturity date and
  amount. Interest frequency defaults to Quarterly and counts 365-day years, matching most
  Indian banks to the rupee.
- **Owner defaults to you.** The blank template has no Owner column — rows you upload are
  saved under the member who is signed in. (Exports *do* include Owner, so backups keep
  each holding with its person.)

### Why re-uploading is safe

Nothing is saved until you click **Import**, and holdings already in the portfolio are
marked **Already imported — skipped**. DeepTrack recognises repeats only by a holding's
**unique identifiers** (reference number, ISIN, symbol, folio, policy, UAN, PRAN…) — never
by name, amount or rate. So if you fix a few rows and upload the whole file again, only the
genuinely new rows are added. A blank or placeholder reference (`TOBEFILLED`, `TBD`, `NA`)
is ignored, so those rows still import and can be completed later.

Every saved holding also gets a permanent **Record ID** in the first column. Leave it blank
for a new holding; keep it as-is to refer to an existing one.

---

## 13. Fixing rows that failed to import

If some rows have errors, don't retype the whole file — fix just the problem rows.

1. In the import preview, click **Rows to fix**. You download
   `deeptrack-rows-to-fix.xlsx` containing **only the rows that failed**.
2. Open it. The problem cells are **highlighted**, and a **What to fix** column explains
   each issue in plain language (it names the tab, row and column).
3. Correct those cells, save, and upload the file again (same upload zone).
4. The rows that now pass show as **Ready**; import them.

Every error message tells you exactly where to look, so you're never guessing.

---

## 14. Exporting and backing up

Exporting downloads your whole portfolio as an Excel workbook — handy as a **backup** or
for offline editing. It's available to **everyone**, including Viewers.

Three places do the same thing:

- **Dashboard** → **Export**
- **Investments** → **Export Excel**
- **Import / export** → **Export portfolio**

You get `deeptrack-portfolio-YYYY-MM-DD.xlsx` in the same 14-tab format, including each
holding's **Record ID** and **Owner**.

> **Make it a habit:** export once a month (or after big changes) and keep the file
> somewhere safe. Because exports carry Record IDs, you can re-import a backup later and
> DeepTrack will skip anything already present instead of duplicating it.

---

## 15. Adding and managing family members

*(Admins only.)* Open **Members** — "People with access and their KYC."

Each member card shows their name, an **Admin**/**Viewer** badge, email, portfolio value,
holding count, and masked KYC/bank details. A **KYC incomplete** pill flags missing details.

### Add a member

1. Click **Add member**.
2. In **Add a member**, fill **Identity**: **Full name**, **Email**, **Role**
   (**Viewer — read-only** or **Admin — can edit everything**), mobile, date of birth, and
   an **Initial password**.
3. Optionally fill **KYC** (PAN, Aadhaar, address) and **Bank account**.
4. Click **Add member**. Toast: **Member added**. They can now sign in.

### Edit, set a password, or remove

- **Edit profile** — change their details or role.
- **Password** — reset their password (**Update password** to save).
- **Trash icon** — remove them. You'll see **Remove this member?**.

> You **can't remove yourself**, you must keep **at least one Admin**, and a member who
> still owns holdings must have those holdings reassigned or deleted first.

---

## 16. Your profile, KYC and bank details

Open **My profile** — "Your details, KYC and bank account." Even Viewers can edit this.

- Click **Edit profile** to update your **Personal & KYC details** (PAN, Aadhaar, address,
  phone, date of birth). A **KYC complete / KYC incomplete** pill shows your status.
- The page also lists **Your holdings** and **Member since**.
- Click **Change password** to update your sign-in password.

**Bank details shortcut:** type the **IFSC code** and click **Fetch** — DeepTrack fills the
bank and branch from the free Razorpay IFSC directory. You can always type them manually.

> Only you and the Admins see your full KYC and bank numbers; everyone else sees them masked.

---

## 17. Masters: saving demat accounts

*(Admins only.)* **Masters** — "Broker and demat accounts" — lets you save each demat
account **once**, then pick it from a dropdown when adding shares or ETFs.

1. Open **Masters** and click **Add demat account**.
2. Fill **Member**, **Broker / DP**, **Client ID** and an optional **Nickname**.
3. Click **Add account**.

Now, in a stock/ETF form, the demat field is a dropdown of these saved accounts. Sector,
broker and current price fill in automatically. To remove one, use its delete button and
confirm **Remove this demat account?**.

---

## 18. Market data: live share prices

*(Admins only.)* **Market data** — "NSE scrip master, bhavcopy and prices" — is what lets
DeepTrack know today's share prices and autocomplete stock names.

It's a three-step loop:

1. **Download from NSE** — click **EQUITY_L.csv** (the list of every listed company) and
   **Bhavcopy** (the day's closing prices). Pick the **Bhavcopy date** if you need a
   specific day; weekends/holidays are skipped automatically. Both files download to your browser.
2. **Upload the files** — drop the downloaded `.csv` / `.zip` onto **Drop EQUITY_L.csv or
   bhavcopy**. DeepTrack recognises each file automatically.
3. **Update prices** — click **Update current prices**. For every stock/ETF with a matching
   symbol, it copies the closing price in and recalculates the current value. A toast tells
   you how many holdings updated and lists any symbols it couldn't find.

Once this is loaded, the **Symbol** box in share/ETF forms becomes a search box — type 3+
letters and pick a suggestion.

> Do this once to set up, then repeat steps 1–3 whenever you want fresh prices (e.g. weekly).
> If NSE blocks a download, the toast explains what to do — you can always download the file
> yourself from NSE and upload it manually.

---

## 19. Where your data lives

**The recommended setup is Firebase cloud storage.** When it is configured, every change
you make — add, edit, delete, import — is written straight to **Google Firestore**, so your
portfolio **always lives and stays updated in the cloud**, no matter which computer or
phone you use. The database file on disk (`data/tracker.db`) is just a fast local working
copy that refreshes itself from the cloud on every start.

| How you use DeepTrack | Where the data lives | In the cloud? |
| --- | --- | --- |
| **With Firebase cloud storage configured** (any device, local or hosted) | **In Firebase Firestore** | ✅ **Yes — always live and updated** |
| On the family computer (`http://localhost:5000`), no Firebase | On that computer's disk | ❌ No — only on that machine |
| Hosted (e.g. `https://deeptrack1.onrender.com`) with a persistent disk, no Firebase | On the hosting provider's disk | ✅ Yes — reachable from any device |
| Hosted **without** a persistent disk and no Firebase | Temporary container storage | ⚠️ Wiped on every restart/redeploy |

**Check it yourself:** open **Import / export**. The banner at the top tells you exactly
which one you have — *"Stored in the Firebase cloud"* (with the last sync time),
*"Stored on this computer only"*, *"Stored in the cloud"*, or a warning that the copy is on
temporary storage. If Firebase is set up but a sync failed, the banner shows a warning with
the reason instead.

### Setting up Firebase cloud storage (one-time, Admin/setup job)

This is what makes your data live in the cloud permanently. Full click-by-click steps and
console links are in `docs/DEPLOYMENT.md` → *"Firebase cloud storage"*; in short:

1. Create a **Firestore database** (Native mode) in your Firebase project.
2. Generate a **service-account key** (a JSON file) for the project.
3. Tell DeepTrack where the key is — set `DEEPTRACK_FIREBASE_CREDENTIALS` to the file's
   path (on your computer) or `DEEPTRACK_FIREBASE_CREDENTIALS_JSON` to the file's contents
   (on Render). See `.env.example`.
4. Restart the app. The first start uploads your existing portfolio to Firestore
   automatically; after that every change is pushed to the cloud instantly.
5. Open **Import / export** — the banner should now say **"Stored in the Firebase cloud"**.

From then on, every device that runs DeepTrack with the same Firebase key shares **one
live portfolio**: sign in anywhere, and you see and edit the same up-to-date data.

### Moving your data from the computer to the cloud (without Firebase)

If you're not using Firebase and your holdings are on the family computer:

1. On the **local** app, open **Import / export** → **Export portfolio**. Keep the
   downloaded workbook safe.
2. Make sure the hosted app has a **persistent disk** (an Admin/setup job — see
   `docs/DEPLOYMENT.md`; on Render this needs a paid instance).
3. Open the **hosted web address** in your browser and sign in.
4. There, open **Import / export** and upload the workbook you exported in step 1.
   Click **Import**. Record IDs make this safe — nothing gets duplicated.
5. From now on, **use the hosted address** on every device (phone, laptop…). Anyone who
   signs in sees and edits the same cloud portfolio. The local copy is just a leftover
   backup; don't keep adding to both, or they drift apart.

**Backing up is still a good habit:** use **Export** (section 14) for a readable Excel
copy, and/or copy the `data` folder somewhere safe for a full backup.

---

## 20. Troubleshooting & FAQ

**I don't see an Add / Import / Delete button.**
You're probably a **Viewer**. Only Admins can change the portfolio. Ask an Admin, or check
your badge in **Members**.

**"This Google account is not on the access list."**
Your Gmail isn't approved yet. Ask the Admin to add it to the allowlist.

**A field is greyed out and I can't type in it.**
It's filled automatically (from market data or Masters). Load market data
(section 18) or add the demat account (section 17) and it populates.

**My share's current value looks out of date.**
Run **Market data → Update current prices** (section 18), or edit the holding and type a
fresh **Current value**.

**Import says some rows "need fixing."**
Click **Rows to fix**, correct the highlighted cells using the **What to fix** column, and
re-upload (section 13).

**I re-uploaded my file and got duplicates — or didn't.**
You won't get duplicates: rows already present are marked **Already imported — skipped**.
If a row you expected was skipped, it matched an existing Record ID or identifier.

**I deleted something by mistake.**
Deletions can't be undone in the app. Restore from your latest **Export** backup by
re-importing it (section 14).

**How do I move a holding to another person?**
Edit the holding and change the **Owner** dropdown. (To remove a member who owns holdings,
reassign them this way first.)

**Can two people own the same share?**
Yes. Symbols and ISINs are matched *per member*, so two people can each hold the same stock.
But a contract number (FD reference, folio, policy, UAN…) is matched across the whole family,
so it can't be accidentally imported twice.

**My data is only on this computer — how do I get it into the cloud?**
Set up **Firebase cloud storage** (section 19) — then every change is saved to the cloud
automatically and your data is live on every device. Without Firebase, run DeepTrack on a
hosted web address with a persistent disk and move your holdings across with Export →
Import. The banner on **Import / export** always tells you where the data currently lives.
Full steps in [section 19](#19-where-your-data-lives).

**The app won't open / I see "Please sign in" after refreshing.**
Make sure the server is running (`start.bat`). If it's hosted, the session cookie settings
may need adjusting — that's in `docs/DEPLOYMENT.md`.

---

## 21. Glossary

| Term | Meaning |
| --- | --- |
| **Holding** | One investment you own (an FD, a fund, some shares…). |
| **Workspace** | Your family's shared portfolio that everyone signs into. |
| **Owner** | The member a holding belongs to. |
| **Admin / Viewer** | The two roles: Admin edits, Viewer reads. |
| **Invested** | The money you actually put in. |
| **Current value** | What it's worth today. |
| **Unrealised gain** | Current value minus invested — a paper gain, not yet sold. |
| **SIP** | Systematic Investment Plan — a fixed monthly mutual-fund investment. |
| **NAV** | Net Asset Value — the per-unit price of a mutual fund. |
| **FD / RD** | Fixed Deposit / Recurring Deposit. |
| **Tenor** | How long a deposit runs before it matures. |
| **Maturity** | When a deposit/bond ends and pays out. |
| **PPF / EPF / NPS** | Public Provident Fund / Employees' Provident Fund / National Pension System. |
| **UAN / PRAN** | Your EPF Universal Account Number / NPS Permanent Retirement Account Number. |
| **ISIN** | A unique code identifying a bond or security. |
| **Folio** | Your account number with a mutual fund. |
| **Demat account** | The electronic account that holds your shares. |
| **Bhavcopy** | NSE's daily file of closing prices for every traded share. |
| **LTP** | Last Traded Price — the most recent share price. |
| **KYC** | "Know Your Customer" — PAN, Aadhaar, address and bank details. |
| **IFSC** | A code identifying a bank branch; used to auto-fill bank details. |
| **Record ID** | A permanent unique ID (like `DT-7K4M-9QX2`) DeepTrack gives every holding. |

---

*DeepTrack — every rupee, one calm view. For setup and hosting details see the
[README](../README.md) and [Deployment guide](DEPLOYMENT.md).*