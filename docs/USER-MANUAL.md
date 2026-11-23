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
7. [The Income page: recorded, pending and credited income](#7-the-income-page)
8. [The Activity log](#8-the-activity-log)
9. [Adding your first investment](#9-adding-your-first-investment)
10. [Adding each type of investment](#10-adding-each-type-of-investment)
11. [Viewing, editing and deleting a holding](#11-viewing-editing-and-deleting-a-holding)
12. [Finding holdings: search, filter and sort](#12-finding-holdings)
13. [Deleting several holdings at once](#13-deleting-several-holdings-at-once)
14. [Importing from Excel (the easy bulk way)](#14-importing-from-excel)
15. [Fixing rows that failed to import](#15-fixing-rows-that-failed-to-import)
16. [Exporting and backing up your portfolio](#16-exporting-and-backing-up)
17. [Adding and managing family members](#17-adding-and-managing-family-members)
18. [Your profile, KYC and bank details](#18-your-profile-kyc-and-bank-details)
19. [Masters: saving demat accounts](#19-masters-saving-demat-accounts)
20. [Market data: live share prices](#20-market-data-live-share-prices)
21. [Where your data lives](#21-where-your-data-lives)
22. [Troubleshooting & FAQ](#22-troubleshooting--faq)
23. [Using DeepTrack on your phone](#23-using-deeptrack-on-your-phone)
24. [Glossary](#24-glossary)

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

You can now add the rest of the family (see [section 17](#17-adding-and-managing-family-members)).

> **Just want to look around first?** On the empty Dashboard click **Load sample portfolio**.
> It adds three demo members and 30 realistic holdings so you can explore every screen
> without entering anything real. Your own account is untouched.

---

## 5. A quick tour of the screen

Once signed in you'll see three areas:

- **Left sidebar** — the main menu: **Dashboard**, **Investments**, **Income**,
  **Activity**, **Members**, **Masters**, **Market data**, **Import / export**,
  **My profile**.
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
| **Income · FY 20xx-xx** | Dividends, interest and rent credited in the current financial year (April–March). Click the card to open the Income page, which also carries the pending checklist and the year's expected interest. |

**The cards and lists below:**

- **Asset class spread** — Equity / Debt / Other with each class's value, invested amount and
  gain, and a breakdown of every instrument type inside it (stocks, ETFs, FDs, PPF…). Click a
  class row, an instrument type or the total to open the ledger filtered to it; every holding
  carries the brand mark of the company behind it (fund house, bank, insurer, issuer or the
  listed company itself), with the broker shown as a small badge under the name instead.
  Logos for the companies already in the app ship with it — banks, insurers, AMCs,
  India Post, and every listed stock (stock logos come from Groww, keyed by NSE
  symbol). Names are matched loosely, so "HDFC Bank Ltd" and "FD – Sundaram finance
  – 12345" still find the right logo. To add or replace one, drop an image into
  `static/img/logos/` named after the company or its symbol (`equitas-bank.png`,
  `utkarsh.webp`); companies without an image keep their coloured initials.
- **Member-wise investment** — each person's invested amount, current value, gain and share
  of the family portfolio.
- **Investments by broker** — stocks and ETFs grouped by the broker or DP they were bought
  through, each with a small brand mark, holding count, value, gain and share of the
  portfolio. Click a broker to open the ledger filtered to it. Holdings with no broker are
  counted in the "not tagged" note at the bottom; tag them by editing a stock/ETF or by
  selecting several under **Investments** and clicking **Set broker**.
- **Largest holdings** — your top holdings; tap a row to open its full details.
- **Upcoming maturities** — deposits and bonds maturing in the next 12 months.

Income, the credit checklist, bank details and dividend fetching live on the **Income** page
([section 7](#7-the-income-page)), and the history of every change lives on the **Activity**
page ([section 8](#8-the-activity-log)) — so the Dashboard stays focused on the portfolio.

**Drill down from the dashboard:** almost everything is clickable. Click a number card to open
all holdings (invested and gain cards sort by that column), click an asset class or an
instrument type to open the ledger filtered to it, click a member row to see only that member's
holdings, click a broker to filter by it, or click a maturity row to open the holding.
The Investments page has an **All holdings / By member** toggle: *By member* groups
the ledger into member sections with each section's invested, value and gain subtotals, while
filters and search keep working.

Each investment's drawer also shows its own income for the selected financial year, with a
**Record income** shortcut.

**Two buttons** top-right: **Export** (download everything to Excel) and **Add investment**.

> If the portfolio is empty you'll see **Your portfolio is a blank slate** with three
> starting points: **Add investment**, **Load sample portfolio**, or **Import from Excel**.

---

## 7. The Income page

Open **Income** in the sidebar, or click the **Income · FY 20xx-xx** number card on the
Dashboard. Everything about money your holdings pay you lives on this page, so the
Dashboard stays a calm portfolio overview.

The page has these cards:

- **Income earned** — pick a financial year (1 April to 31 March) from the dropdown.
  The strip shows what is **Credited**, what is still **Pending credit** and how many
  entries there are. The table groups income by holding with columns for dividend,
  interest, rent and other, and a Pending column. Admins can click **Record** to add a
  dividend, FD interest, rent or other receipt, marked *Received in bank* or *Expected,
  not yet credited*. Open the disclosure line to see and delete individual entries.
- **Interest credited** — see *How the income estimate works* below. This is a guide to
  interest your debt holdings actually pay out in the year; it is not added to any total
  until you record the credit.
- **Credit checklist** — every pending entry with the member's bank account and the
  expected date. An admin ticks an entry once the money reaches the bank; overdue items
  are red, items due within a week amber.
- **Member bank details** — where each member's dividends, interest and rent should land.
  Account numbers are masked for viewers.
- **Dividends & bonus** (Admins only) — pick a financial year window (this FY, the
  previous FY, or the last 3/5 FYs, always 1 April to 31 March) and click **Fetch actions**.
  DeepTrack reads NSE corporate actions, with Yahoo Finance as a fallback, for every stock
  and ETF holding:
  - **Dividends** become pending income entries (`shares × Rs per share`) in the checklist;
    they move to *credited* when you tick them off.
  - **Bonus / split actions** multiply the quantity and divide the average cost and current
    price in one step. Bonus shares you already hold in your brokerage should be left
    unticked.
  Already-applied actions are skipped, and nothing changes until you confirm.

### How the income estimate works

DeepTrack counts **only the interest that is actually credited in the selected financial
year** (1 April to 31 March). Interest that simply builds up inside a deposit is not
income until it is paid, so cumulative deposits and bonds are counted once — on their
maturity date — and only if that date falls inside the year:

| Instrument | What it uses | When it is counted |
| --- | --- | --- |
| **Fixed deposit — paid out** | Rate, dates | Every year of the deposit: rate × days in the year ÷ 365 on the original amount. Interest leaves the deposit, so it does not compound. |
| **Fixed deposit — cumulative** | Rate, start, maturity, compounding | Once, on the maturity date: interest grown to maturity minus the amount deposited (compounded, or simple if that is what you chose). |
| **Recurring deposit** | Monthly amount, rate, start, maturity | Once, on the maturity date: each instalment earns from its own deposit date to maturity, summed. |
| **Bonds, NCDs, G-Secs, SGB — with a frequency** | Quantity, face value, coupon rate, frequency | Each coupon whose date falls inside the year, counted separately. |
| **Bonds — cumulative (no frequency)** | Quantity, face value, rate, maturity | Once, on the maturity date: rate × amount × days held ÷ 365. |
| **Small savings — MIS, SCSS** | Deposit, rate, dates | Paid out monthly or quarterly through the year, so every year of the holding counts. |
| **Small savings — NSC, KVP, SSY, post office TD** | Deposit, rate, maturity | Once, on the maturity date: deposit × rate × days held ÷ 365. |

PPF, EPF / VPF, NPS, equity and anything with no rate set are not estimated: their
interest accrues inside the balance and is only money once withdrawn. Holdings that will
mature after the selected year appear under **Paid at maturity · outside this year** so
you know where the interest has gone — it is not counted yet.

**Worked examples for one full financial year:**

| Holding | Calculation | Counted in the year |
| --- | --- | --- |
| FD ₹1,00,000 at 7%, interest paid out | 1,00,000 × 7% × 365 ÷ 365, every year | ₹7,000 |
| FD ₹1,00,000 at 7%, 3 years cumulative, quarterly | Maturity value 1,00,000 × (1 + 0.07 ÷ 4)^12 − 1,00,000 — counted only in the maturity year | ≈ ₹23,144 that year |
| Bond 500 units, face ₹1,000, 7.18% semi-annual | 2 coupons × (5,00,000 × 7.18% ÷ 2) | ₹35,900 |
| RD ₹10,000 a month at 7% for 3 years | Each instalment × 7% × its days to maturity ÷ 365, summed — counted only in the maturity year | ≈ ₹14,400 that year |
| NSC ₹1,00,000 at 7.7% for 5 years | 1,00,000 × 7.7% × 1,826 ÷ 365 — counted only in the maturity year | ≈ ₹38,500 that year |

The card shows the **To be credited** total, the **Recorded** interest you have already
confirmed for those same holdings, and how many credits there are. Each row shows the
basis, the credit date (a maturity date, or *paid during the year* for coupons and
fixed-payout deposits) and a short note; click a row to open the holding.

---

## 8. The Activity log

The **Activity** page in the sidebar is the workspace's complete history. Every action an
admin takes is written to a log that is kept indefinitely — it is not trimmed to the
last few rows:

- adding, editing or deleting a holding;
- importing from Excel and applying corporate actions;
- recording or deleting income, and marking a credit as received;
- changes to members, brokers and market data.

Each row shows **When** (date, time and how long ago), **Who** did it, **What changed**
and the **Area** it belongs to. The page loads the newest 100 entries; click **Load older**
to fetch the next 100, and **Refresh** for anything newer. Nothing is deleted
automatically, and the log survives restarts and redeployments because it lives in the
same database as your portfolio. Viewers can read it too.

---

## 9. Adding your first investment

Let's add a fixed deposit as a worked example. The flow is the same for every type.

1. Click **Add investment** (top bar, or on the Dashboard/Investments page).
2. A window titled **Add an investment** opens: *"Pick what you own, then fill in the details."*
3. **Choose the category** — tabs for **Equity**, **Debt**, **Other assets**. A fixed
   deposit is **Debt**, so click that.
4. **Choose the type** — click the **Fixed deposits** tile.
5. Fill the form, which is split into three parts:
   - **Holding** — the name, the **Owner** (pick the family member from the dropdown;
     it starts empty and must be chosen, even if you are adding your own holding), and
     the **Purchase / start date**.
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
> the [type-by-type guide](#10-adding-each-type-of-investment) below.

---

## 10. Adding each type of investment

Pick the category, then the type. Here's what each one asks for and a tip for it.
**Bold** fields are the ones that matter most.

### Equity

**Direct stocks** — shares you bought yourself.
Enter **Symbol / ticker** (see the search tip below), **Quantity**, **Average buy price**,
the **Demat account** it sits in and, if you want the broker-wise dashboard, the
**Broker / DP** it was bought through. *Current price* fills from market data; picking a
saved demat account fills the broker automatically.
> Tip: in the **Symbol** box type at least 3 letters (e.g. `REL`) and pick the company
> from the suggestions — DeepTrack fills the name and exchange for you. This needs
> market data loaded once (see [section 20](#20-market-data-live-share-prices)).

**Mutual funds** — SIPs and lump-sum funds.
Enter **Scheme name**, **AMC**, **Folio number**, **Units held**, **Average NAV** and
**Current NAV**. If it's a SIP, fill **SIP amount (per month)** and **SIP debit day** —
that's what feeds the Dashboard's *Monthly SIPs* card.
> Tip: in **Scheme name** type at least 3 letters (`PAR`, `HDFC FLEX`) and the AMFI
> scheme list appears, grouped by scheme with every plan/option — Direct or Regular,
> Growth or IDCW (payout/reinvestment). Pick the variant and DeepTrack fills the AMC,
> category, plan, option and latest NAV for you. The list downloads automatically.

**ETFs** — exchange-traded funds. Like stocks: **Symbol**, **Quantity**, prices, demat account.
> Tip: you can type 3+ letters in either **Symbol** or **ETF name** (`NIPPON NIFTY`) —
> abbreviations are matched too — and picking a suggestion fills the symbol and exchange.

### Debt

**Fixed deposits (FD)** — the most common. Enter **Bank / NBFC**, **Principal deposited**,
**Interest rate**, and the **Tenor** (years / months / days). Pick **Interest frequency**
(defaults to Quarterly, which most Indian banks use) and **Type** (Fixed or Cumulative).
> With **Type = Cumulative** the **Interest frequency** box is disabled — interest is not
> paid periodically, it compounds and is paid with the maturity amount. Switch to **Fixed**
> to choose how often the bank credits interest.

> DeepTrack calculates the **Maturity date** and **Maturity amount** for you — leave them
> blank. If your bank statement only shows a maturity date, type that and leave the tenor blank.

> **Tenor in any unit.** Type the tenure the way the bank quotes it: 3 years, 36 months or
> 1095 days are all accepted — there is no 11-month or 31-day cap, and years + months + days
> add together. The maturity date and amount recalculate as you type.

**Recurring deposits (RD)** — Enter **Monthly deposit** and the **Tenor**. DeepTrack totals
the deposits over the months and computes maturity.

> **Customer ID / folio.** The same company often maps several deposits to one customer ID.
> Fill **Customer ID / folio** on each FD or RD and they're clubbed on the Investments page
> under *Customer folios* — open the tile to see every deposit's date, principal and value.
> Deposits never merge: a new contribution is always a separate deposit with its own row.

**Bonds & G-Secs** — Enter **Issuer**, **Bond type**, **ISIN**, **Coupon rate** and **Maturity date**.

**PPF** — Enter the **Account number** and **Interest rate**. The **Contributions** list holds
every deposit: it starts with one row per year from the start date (when you fill **Yearly
contribution**) and you can add one-off amounts, edit dates or remove rows. DeepTrack adds
interest at the rate specified, credited on 31 March each year; a deposit paid after the 5th
earns from the next month, as in a passbook. Leave the amounts blank; type your own to override.

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

## 11. Viewing, editing and deleting a holding

### View the full picture

1. Go to **Investments**.
2. Click any row. A side panel (the "drawer") slides open, with the company's logo
   shown large at the top — it scales with the screen, so it stays readable on a phone.
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

## 12. Finding holdings

The **Investments** page ("Every holding in one ledger") is a searchable list.

- **Search box** — type a name, owner, broker, folio, anything: placeholder is
  *"Search by name, owner, broker…"*. It looks across names, owners, types, brokers and notes.
- **Category tabs** — **All / Equity / Debt / Other assets**, each with a count.
- **Type dropdown** — **All types**, or narrow to (say) only Fixed deposits.
- **Owner dropdown** — **Everyone**, or just one member's holdings.
- **Sort dropdown** — **Recently updated**, **Highest value**, **Highest gain**,
  **Most invested**, **Name A–Z**, **Purchase date**. You can also click a column header
  to sort by it (an arrow ↑/↓ shows the direction).

**The columns:**

| Column | What it shows |
| --- | --- |
| **Invested** | The money you put in. |
| **Current** | What the holding is worth today. For cumulative deposits, bonds without a coupon frequency and accrued instruments it is **principal + interest accrued to date** (marked *incl. accrued interest*); for deposits and bonds that pay interest out periodically it is the **principal only** (marked *interest paid out*), because the interest has already left the deposit. Values accrue by themselves from the saved rate and dates — no refetch needed. |
| **Maturity** | The maturity date from the holding's details; "—" for holdings that don't mature. Click the row to open the drawer. |
| **Gain** | Current minus invested, rounded to the nearest rupee, with a ▲/▼ trend icon and the percentage beside it. |

The footer totals what you're looking at: *"Showing N of M holdings · Invested ₹X ·
Value ₹Y · Gain ±₹Z."*

If nothing matches you'll see **No holdings match** — click **Clear filters** to start over.

---

## 13. Deleting several holdings at once

*(Admins only.)*

1. In **Investments**, tick the checkbox beside each holding you want to remove. Use the
   top checkbox to **select all** currently shown.
2. A bar appears: *"N holdings selected"* with **Clear**, **Set broker** and
   **Delete selected**.
3. Click **Delete selected**.
4. Confirm **Delete N holdings?** — it warns this *cannot be undone* — then click **Delete N**.
5. Toast: **Deleted N holdings**.

> **Set broker** in the same bar tags the selected stocks and ETFs to one broker in a
> single step (other types are left unchanged). Use it after a bulk import to fill the
> broker-wise dashboard card.

> Tip: filter first (e.g. show only one member, or one type), then select-all, to remove
> a whole group cleanly.

---

## 14. Importing from Excel

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
6. You'll see **Review before importing** with counts: **N ready**, **N will update**
   (only when the update checkbox is on), **N already imported**, **N need fixing**,
   and a row-by-row table.
7. When you're happy, click **Import N rows**. The same file can't be imported twice — a
   second upload is refused with the date of the original import.
8. Toast: **Imported N holdings** (or **updated N**), and a banner summarises
   *"N imported · N updated · N already there · N skipped."*

### Or upload your broker's holdings report

If your broker already gives you a holdings file, you don't have to retype it into the
template. *(Admins only, same as the template upload.)*

1. Download the file from the broker:
   - **ICICI Direct:** Portfolio → Holdings → **Download** (Excel).
   - **Kotak Securities:** Portfolio → **Export** (Excel or CSV).
2. Open **Import / export** and drop it on **Upload a broker report**
   (**Drop your broker's holdings export here**). `.xlsx`, `.xlsm`, `.xls` and `.csv` work.
3. DeepTrack reads the report by its column labels. For every stock, ETF and mutual fund it
   fills in what the broker left out:
   - the **NSE symbol** from the ISIN or company name (it says "check it" when it had to
     guess from the name),
   - the **AMFI scheme**, plan, option and AMC for mutual funds,
   - **invested** and **current value** from quantity × price,
   - every holding under the member you chose in **Whose broker report is this?** before
     dropping the file — never the person who happens to be signed in.
4. Check the **Review before importing** table. Rows the parser couldn't pin down — usually a
   small company not in the NSE list or a fund name too different from AMFI's — show a note
   in the **Status** column. Fix just those, then click **Import N rows**.

Totals rows, zero-quantity rows and price-only footer rows are skipped automatically, and
re-uploading the same report is safe: holdings already in the portfolio are marked
**Already imported** and skipped.

Kotak's newer exports work too: the **Portfolio Holdings** CSV (columns *Script Name*,
*Avg Unit Cost*, *Invested Value*) and the **Demat Holdings & Valuation** Excel, whose
heading row sits a few lines down under the client name and DP ID. The valuation export
carries no purchase cost, so its rows import with **Average buy price filled from the
current price** and a warning asking you to correct the cost afterwards; if a holding
already exists, its saved average cost is kept and only units are updated.

> Older `.xls` files need the `xlrd` package. It is listed in `requirements.txt`; if you
> installed DeepTrack before this feature, run `pip install -r requirements.txt` once.

### Three conveniences that save typing

- **Leave money boxes blank.** *Amount invested* and *Current value* are computed from the
  details (e.g. units × price). RDs total the monthly deposit over the tenor.
- **FD maturity is automatic.** Enter the tenor and DeepTrack fills the maturity date and
  amount. Interest frequency defaults to Quarterly and counts 365-day years, matching most
  Indian banks to the rupee.
- **Owner is never guessed.** Pick the member in each row's **Owner** column (the template
  now includes it as a dropdown). Rows without an owner are held back in the preview and
  import only once an owner is chosen. For an older file with no Owner column, pick one
  owner for the whole upload above the dropzone — whoever is signed in is irrelevant.

### Why re-uploading is safe

Nothing is saved until you click **Import**, and holdings already in the portfolio are
marked **Already imported — skipped**. DeepTrack recognises repeats only by a holding's
**unique identifiers** (reference number, ISIN, symbol, folio, policy, UAN, PRAN…) — never
by name, amount or rate. So if you fix a few rows and upload the whole file again, only the
genuinely new rows are added. A blank or placeholder reference (`TOBEFILLED`, `TBD`, `NA`)
is ignored, so those rows still import and can be completed later.

Every saved holding also gets a permanent **Record ID** in the first column. Leave it blank
for a new holding; keep it as-is to refer to an existing one.

### Updating a holding you already have (quantity or price changed)

Suppose you already hold 35 Titan shares and buy 5 more. Upload a row with **Quantity 40**
and tick **Update holdings whose quantity or average cost changed** (above the upload
zones on the Import / export page). DeepTrack matches the row to your existing holding by
member + identifier (ISIN/symbol, folio, policy…) and shows the change before saving:

> **Will update** — Will update this holding — Quantity 35 → 40

- The preview shows the recomputed **invested** and **current value**
  (e.g. 40 × ₹3,100 = ₹1,24,000 invested; 40 × ₹3,520 = ₹1,40,800 current).
- Click **Import** and the same holding is edited in place — no duplicate row, same
  Record ID, and the update counts as **updated 1** in the toast and banner.
- Changes to **average cost/price** alone (same quantity) are picked up the same way.
- Only rows whose owner matches the existing holding are updated. If the row names a
  different member, it's treated as a duplicate and skipped.
- Leave the checkbox **off** to only add new holdings: a row that matches an existing
  holding is marked **Already imported** and skipped, exactly as before.
- The same file uploaded twice is still refused outright (the file fingerprint check),
  so nothing is ever applied twice. To make a further correction, edit the values in
  the file (any change alters its fingerprint) and upload again.

---

## 15. Fixing rows that failed to import

If some rows have errors, don't retype the whole file — fix just the problem rows.

1. In the import preview, click **Rows to fix**. You download
   `deeptrack-rows-to-fix.xlsx` containing **only the rows that failed**.
2. Open it. The problem cells are **highlighted**, and a **What to fix** column explains
   each issue in plain language (it names the tab, row and column).
3. Correct those cells, save, and upload the file again (same upload zone).
4. The rows that now pass show as **Ready**; import them.

Every error message tells you exactly where to look, so you're never guessing.

---

## 16. Exporting and backing up

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

## 17. Adding and managing family members

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

## 18. Your profile, KYC and bank details

Open **My profile** — "Your details, KYC and bank account." Even Viewers can edit this.

- Click **Edit profile** to update your **Personal & KYC details** (PAN, Aadhaar, address,
  phone, date of birth). A **KYC complete / KYC incomplete** pill shows your status.
- The page also lists **Your holdings** and **Member since**.
- Click **Change password** to update your sign-in password.

**Bank details shortcut:** type the **IFSC code** and click **Fetch** — DeepTrack fills the
bank and branch from the free Razorpay IFSC directory. You can always type them manually.

> Only you and the Admins see your full KYC and bank numbers; everyone else sees them masked.

---

## 19. Masters: saving demat accounts

*(Admins only.)* **Masters** — "Broker and demat accounts" — lets you save each demat
account **once**, then pick it from a dropdown when adding shares or ETFs.

1. Open **Masters** and click **Add demat account**.
2. Fill **Member**, **Broker / DP**, **Client ID** and an optional **Nickname**.
3. Click **Add account**.

Now, in a stock/ETF form, the demat field lists **every** saved account with its owner
(e.g. *Vikram · Kotak · 1203456789*), so you can pick any of them regardless of the
member selected as owner. Sector and current price fill in automatically, and picking an
account also fills the **Broker / DP** dropdown. That dropdown stays editable, so a
holding saved without a demat account can still be tagged to the broker it was bought
through. To remove an account, use its delete button and confirm **Remove this demat
account?**.

---

## 20. Market data: live share prices

*(Admins only.)* **Market data** — "NSE scrip master, bhavcopy and prices" — is what lets
DeepTrack know today's share prices and autocomplete stock names.

It's automatic — you don't have to download or upload anything:

1. **Imported for you** — DeepTrack fetches the NSE **equity list** (every listed company)
   and the latest **bhavcopy** (closing prices for equity shares, ETFs and every other listed
   cash-market product) by itself: once when it starts, then whenever you click **Sync from NSE**.
   Weekends/holidays are skipped automatically, and a **Bhavcopy as-of date** lets you request
   an earlier trading day.
2. **Check the dates** — the page always shows the **date the equity list was loaded** and the
   **trade date of the bhavcopy in use**, so you know how fresh the prices are.
3. **Update prices** — click **Update current prices**. For every stock/ETF with a matching
   symbol, it copies the closing price in and recalculates the current value. A toast tells
   you how many holdings updated and lists any symbols it couldn't find.

Once the equity list is loaded, the **Symbol** box in share/ETF forms becomes a search box —
type 3+ letters and pick a suggestion. ETF **names** work too: abbreviations like `NIP IND`
are matched, so `NIPPON NIFTY` finds NIFTYBEES.

The **mutual fund scheme list** comes from AMFI's daily NAV file and is refreshed the same
way. It powers the **Scheme name** drill-down (plan/option variants with their latest NAV),
so no manual download is needed there either.

> The import repeats on its own whenever the stored prices are more than 12 hours old, so you
> usually only need **Update current prices** for fresh valuations. If NSE is blocked on your
> network, the **If the sync is blocked** card lets you drop a file you downloaded yourself.

---

## 21. Where your data lives

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

## 22. Troubleshooting & FAQ

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

**I uploaded the same file twice.**
The second upload is refused outright — "This exact file was already imported on … by …".
DeepTrack keeps a fingerprint of every file that actually added holdings, so pressing
Import twice (or sharing the same file with another admin) can't double anything. Editing
the workbook changes its fingerprint, and those rows are then handled by the normal
already-imported check above. To update a quantity or average cost, change it in the file
and import with **Update holdings whose quantity or average cost changed** ticked
(section 12, "Updating a holding you already have").

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
Full steps in [section 21](#21-where-your-data-lives).

**The app won't open / I see "Please sign in" after refreshing.**
Make sure the server is running (`start.bat`). If it's hosted, the session cookie settings
may need adjusting — that's in `docs/DEPLOYMENT.md`.

**The app shows "DeepTrack isn't running" (or looks like an old version).**
Double-click `start.bat` in the DeepTrack folder and wait for *DeepTrack running*, then
press **Retry**. When the server stops, DeepTrack shows that status page instead of a
remembered old screen, so an out-of-date view can no longer appear. The tiny line at the
bottom of the sidebar (**Build 2026.11.23b**) tells you which copy is loaded; after an
update it should change. If it doesn't, refresh the page once (Ctrl+F5).

---

## 23. Using DeepTrack on your phone

DeepTrack is a responsive web app and can be installed on your phone's home screen — no
separate mobile app to maintain. Every screen adapts: the sidebar turns into a slide-out
menu, holdings become tappable cards instead of a wide table (tap one for the full
drawer), filters and the holding/member toggles wrap onto new rows, and forms open as
full-height sheets. You can read **and update** from the phone with the same login and
the same permissions.

**On the same Wi-Fi (quickest, no hosting needed)**

1. On the computer that runs DeepTrack, double-click **start-lan.bat** (instead of
   start.bat). It prints an address such as `http://192.168.1.5:5000` for every network
   adapter.
2. Open that address in the phone's browser. Keep the black window open while you use it.
3. Sign-in note: Google sign-in only accepts addresses that are authorised in your
   Firebase project. For home use the simplest fix is to enable password sign-in — set
   `DEEPTRACK_PASSWORD_LOGIN=1` in `.env`, restart, and sign in with the member's email
   and password. (Admins can set/reset passwords from **Members → Password**.)
4. Plain `http://` addresses cannot install the home-screen app (browsers require HTTPS
   for that) — the site still works normally in the phone browser. For the installable
   version use the hosted address below.

**From anywhere (recommended): the hosted address**

1. Deploy once (see `docs/DEPLOYMENT.md`; `render.yaml` is ready) and note the
   `https://…` address.
2. Sign in on the phone with Google.
3. **Android (Chrome):** menu ⋮ → **Install app** (or **Add to Home screen**).
   **iPhone (Safari):** Share → **Add to Home Screen**.
4. Launch DeepTrack from its icon — it opens full screen like a native app and keeps
   your session. The dashboard, holdings, incomes and member pages are all reachable,
   and admin actions work the same as on the computer.

Changes sync instantly through **Firebase cloud storage** if it is configured
(section 19); without it, they live on the hosting provider's disk, so use the same
address from every device.

---

## 24. Glossary

| Term | Meaning |
| --- | --- |
| **Holding** | One investment you own (an FD, a fund, some shares…). |
| **Workspace** | Your family's shared portfolio that everyone signs into. |
| **Owner** | The member a holding belongs to. |
| **Admin / Viewer** | The two roles: Admin edits, Viewer reads. |
| **Invested** | The money you actually put in. |
| **Current value** | What it's worth today. For cumulative deposits and bonds it includes interest accrued to date; for periodic-payout instruments it is the principal, since the interest has been paid out. |
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