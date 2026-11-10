"""Instrument registry for the Indian market.

One definition drives the web forms, API validation, the investments table and
the Excel template, so all four stay in sync.
"""

import calendar
import re
from datetime import date, timedelta

from .validators import parse_date, parse_number
from . import equity

CATEGORIES = [
    {"key": "equity", "label": "Equity", "tagline": "Stocks, mutual funds, ETFs", "color": "#6366f1"},
    {"key": "debt", "label": "Debt", "tagline": "FDs, bonds, PPF, NPS, EPF", "color": "#0ea5e9"},
    {"key": "other", "label": "Other assets", "tagline": "Property, gold, crypto, insurance", "color": "#f59e0b"},
]

EXCHANGES = ["NSE", "BSE"]
PLANS = ["Direct", "Regular"]
MF_OPTIONS = ["Growth", "IDCW - Payout", "IDCW - Reinvestment"]
COMPOUNDING = ["Quarterly", "Monthly", "Half-yearly", "Annual", "Simple"]
SUMMARY_FREQUENCIES = ["Annual", "Semi-annual", "Quarterly", "Cumulative"]
ACCOUNT_TYPES = ["Savings", "Salary", "Current", "NRE", "NRO", "Jan Dhan"]

BANKS = [
    "State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank",
    "Punjab National Bank", "Bank of Baroda", "Canara Bank", "Union Bank of India",
    "IDFC FIRST Bank", "Yes Bank", "IndusInd Bank", "Federal Bank", "South Indian Bank",
    "Indian Bank", "Central Bank of India", "Bank of Maharashtra",
    "AU Small Finance Bank", "Ujjivan Small Finance Bank", "Equitas Small Finance Bank",
    "Jana Small Finance Bank", "ESAF Small Finance Bank", "Suryoday Small Finance Bank",
    "Utkarsh Small Finance Bank", "Capital Small Finance Bank", "North East Small Finance Bank",
    "Bandhan Bank", "India Post Payments Bank", "Other",
]

AMCS = [
    "SBI Mutual Fund", "HDFC Mutual Fund", "ICICI Prudential MF", "Nippon India MF",
    "Axis Mutual Fund", "Kotak Mahindra MF", "UTI Mutual Fund", "Aditya Birla Sun Life MF",
    "Mirae Asset MF", "Parag Parikh MF", "Quant MF", "DSP MF", "Franklin Templeton MF",
    "Tata MF", "Motilal Oswal MF", "Edelweiss MF", "Invesco MF", "HSBC MF",
    "Bandhan MF", "Sundaram MF", "Navi MF", "WhiteOak MF", "Other",
]

MF_CATEGORIES = [
    "Large Cap", "Mid Cap", "Small Cap", "Flexi Cap", "Multi Cap", "Focused Fund",
    "ELSS (Tax Saving)", "Index Fund", "Sectoral / Thematic", "Balanced Advantage",
    "Aggressive Hybrid", "Conservative Hybrid", "Arbitrage", "Liquid", "Overnight",
    "Ultra Short Duration", "Corporate Bond", "Gilt", "Credit Risk", "Gold",
    "International / Fund of Funds", "Other",
]

SECTORS = [
    "Banking & Financial Services", "Information Technology", "Oil & Gas", "FMCG",
    "Pharmaceuticals", "Automobile", "Metals & Mining", "Power & Utilities", "Telecom",
    "Construction & Realty", "Capital Goods", "Chemicals", "Consumer Durables", "Cement",
    "Infrastructure", "Textiles", "Media & Entertainment", "Diversified", "Other",
]

BROKERS = [
    "Zerodha", "Groww", "Upstox", "ICICI Direct", "HDFC Securities", "Kotak Securities",
    "Angel One", "Motilal Oswal", "Sharekhan", "5paisa", "Axis Direct", "SBI Securities",
    "Dhan", "INDmoney", "Other",
]

REGISTRARS = ["CAMS", "KFintech", "Franklin Templeton (in-house)", "Other"]

BOND_KINDS = [
    "Government Security (G-Sec)", "Treasury Bill", "State Development Loan",
    "Corporate Bond", "Tax-Free Bond", "Sovereign Gold Bond", "Debenture", "Other",
]

CREDIT_RATINGS = ["Sovereign", "AAA", "AA+", "AA", "AA-", "A+", "A", "BBB+", "BBB", "Unrated"]

SMALL_SAVINGS = [
    "National Savings Certificate (NSC)", "Kisan Vikas Patra (KVP)", "Post Office MIS",
    "Sukanya Samriddhi Yojana (SSY)", "Senior Citizens' Savings Scheme (SCSS)",
    "Post Office Time Deposit", "Other",
]

PENSION_FUNDS = [
    "SBI Pension Funds", "LIC Pension Fund", "UTI Retirement Solutions", "HDFC Pension",
    "ICICI Prudential Pension", "Kotak Mahindra Pension", "Aditya Birla Pension",
    "Tata Pension", "Max Life Pension", "DSP Pension",
]

INSURERS = [
    "LIC of India", "HDFC Life", "ICICI Prudential Life", "SBI Life", "Max Life",
    "Bajaj Allianz Life", "Tata AIA Life", "Kotak Life", "Aditya Birla Sun Life Insurance",
    "Axis Max Life", "PNB MetLife", "Star Health", "Niva Bupa", "Care Health",
    "New India Assurance", "ICICI Lombard", "HDFC ERGO", "Bajaj Allianz General",
    "United India Insurance", "Other",
]

PROPERTY_TYPES = [
    "Residential Apartment", "Independent House / Villa", "Plot / Land",
    "Commercial Office", "Shop / Retail", "Industrial / Warehouse", "Agricultural Land",
]

METALS = ["Gold", "Silver", "Platinum", "Diamond", "Other"]
PURITIES = ["24K", "22K", "18K", "14K", "925 Silver", "Other"]
HALLMARKS = ["BIS Hallmarked", "Certified (IGI / GIA)", "Non-hallmarked", "Not sure"]
STORAGE = ["Bank locker", "Home safe", "With family", "Other"]

CRYPTO_COINS = [
    "Bitcoin (BTC)", "Ethereum (ETH)", "Tether (USDT)", "BNB", "Solana (SOL)", "XRP",
    "Cardano (ADA)", "Dogecoin (DOGE)", "Polygon (MATIC)", "Avalanche (AVAX)",
    "Chainlink (LINK)", "Other",
]

CRYPTO_PLATFORMS = [
    "WazirX", "CoinDCX", "CoinSwitch", "Binance", "ZebPay", "Giottus", "Mudrex",
    "Ledger (self-custody)", "MetaMask (self-custody)", "Other",
]

POLICY_TYPES = [
    "Term Life", "Endowment", "ULIP", "Money Back", "Whole Life", "Health",
    "Critical Illness", "Personal Accident",
]

PREMIUM_FREQUENCIES = ["Monthly", "Quarterly", "Half-yearly", "Annual", "Single premium"]


def f(key, label, input="text", **extra):
    field = {"key": key, "label": label, "input": input}
    field.update({k: v for k, v in extra.items() if v is not None})
    return field


_TYPES = [
    {
        "key": "stocks",
        "label": "Direct stocks",
        "category": "equity",
        "sheet": "Equity - Stocks",
        "blurb": "Listed shares held in a demat account",
        "name_label": "Company name",
        "name_placeholder": "e.g. Reliance Industries",
        "invested_label": "Amount invested",
        "value_label": "Current value",
        "derive": {"invested": ("quantity", "avg_buy_price"), "value": ("quantity", "ltp")},
        "fields": [
            f("symbol", "Symbol / ticker", required=True, table=True, placeholder="RELIANCE"),
            f("exchange", "Exchange", "select", options=EXCHANGES, required=True, default="NSE", template=False),
            f("quantity", "Quantity", "number", required=True, table=True, min=0),
            f("avg_buy_price", "Average buy price", "number", unit="₹", required=True, table=True, min=0),
            f("ltp", "Current price (LTP)", "number", unit="₹", min=0, auto=True),
            f("sector", "Sector", "select", options=SECTORS, auto=True),
            f("demat_id", "Demat master account", "select", options_from="demat_accounts"),
            f("broker", "Broker / DP", "select", options=BROKERS, auto=True),
            f("demat_account", "Demat / client ID", auto=True),
        ],
    },
    {
        "key": "mutual_funds",
        "label": "Mutual funds",
        "category": "equity",
        "sheet": "Equity - Mutual Funds",
        "blurb": "SIP and lump-sum folios with any AMC",
        "name_label": "Scheme name",
        "name_placeholder": "e.g. Parag Parikh Flexi Cap Fund",
        "invested_label": "Amount invested",
        "value_label": "Current value",
        "derive": {"invested": ("units", "avg_nav"), "value": ("units", "current_nav")},
        "fields": [
            f("amc", "AMC", "select", options=AMCS, required=True),
            f("scheme_category", "Scheme category", "select", options=MF_CATEGORIES, required=True),
            f("plan", "Plan", "select", options=PLANS, required=True, default="Direct"),
            f("option", "Option", "select", options=MF_OPTIONS, required=True, default="Growth"),
            f("folio_no", "Folio number", placeholder="e.g. 123456789 / 0"),
            f("units", "Units held", "number", table=True, min=0),
            f("avg_nav", "Average NAV", "number", unit="₹", min=0),
            f("current_nav", "Current NAV", "number", unit="₹", min=0),
            f("sip_amount", "SIP amount (per month)", "number", unit="₹", min=0),
            f("sip_date", "SIP debit day", "number", min=1, max=31, help="Day of the month (1-31)"),
            f("registrar", "Registrar", "select", options=REGISTRARS),
        ],
    },
    {
        "key": "etf",
        "label": "ETFs",
        "category": "equity",
        "sheet": "Equity - ETFs",
        "blurb": "Exchange traded funds such as Nifty or gold ETFs",
        "name_label": "ETF name",
        "name_placeholder": "e.g. Nippon India Nifty 50 BeES",
        "invested_label": "Amount invested",
        "value_label": "Current value",
        "derive": {"invested": ("units", "avg_price"), "value": ("units", "current_price")},
        "fields": [
            f("symbol", "Symbol / ticker", required=True, table=True, placeholder="NIFTYBEES"),
            f("exchange", "Exchange", "select", options=EXCHANGES, required=True, default="NSE", template=False),
            f("units", "Units held", "number", required=True, table=True, min=0),
            f("avg_price", "Average buy price", "number", unit="₹", required=True, min=0),
            f("current_price", "Current price", "number", unit="₹", min=0, auto=True),
            f("underlying", "Tracks", "select", options=[
                "Nifty 50", "Nifty Next 50", "Bank Nifty", "Nifty Midcap 150", "Gold",
                "Silver", "International", "Other"]),
            f("demat_id", "Demat master account", "select", options_from="demat_accounts"),
            f("broker", "Broker / DP", "select", options=BROKERS, auto=True),
            f("demat_account", "Demat / client ID", auto=True),
        ],
    },
    {
        "key": "fd",
        "label": "Fixed deposits",
        "category": "debt",
        "sheet": "Debt - Fixed Deposits",
        "blurb": "Bank, NBFC and post office fixed deposits",
        "name_label": "Deposit name",
        "name_placeholder": "e.g. SBI 3-year FD",
        "invested_label": "Principal deposited",
        "value_label": "Current value",
        "derive": {"invested": ("principal",)},
        "fields": [
            f("bank", "Bank / NBFC", "select", options=BANKS, required=True),
            f("company_name", "Company name", placeholder="e.g. Bajaj Finance",
              help="For company or NBFC deposits: who issued the deposit"),
            f("account_no", "FD account / receipt no.", placeholder="e.g. 3270456123"),
            f("principal", "Principal", "number", unit="₹", required=True, table=True, min=0),
            f("interest_rate", "Interest rate", "number", unit="%", required=True, table=True, min=0, max=20),
            f("tenor_years", "Tenor years", "number", min=0, max=50),
            f("tenor_months", "Tenor months", "number", min=0, max=11),
            f("tenor_days", "Tenor days", "number", min=0, max=31),
            f("compounding", "Interest frequency", "select", options=COMPOUNDING, default="Quarterly",
              help="Usually Quarterly in India. Match the bank's statement; blank counts as Quarterly."),
            f("payout", "Type", "select", options=["Fixed", "Cumulative"], default="Cumulative",
              help="Fixed pays interest out and matures at the amount deposited; Cumulative reinvests it"),
            f("maturity_date", "Maturity date", "date", help="Leave blank to calculate it from the tenor"),
            f("maturity_amount", "Maturity amount", "number", unit="₹", computed=True),
            f("primary_depositor", "Primary depositor", placeholder="Name on the deposit"),
            f("joint_depositor_1", "Joint depositor 1"),
            f("joint_depositor_2", "Joint depositor 2"),
            f("nominee", "Nominee"),
        ],
    },
    {
        "key": "rd",
        "label": "Recurring deposits",
        "category": "debt",
        "sheet": "Debt - Recurring Deposits",
        "blurb": "Monthly deposit schemes at banks and post offices",
        "name_label": "Deposit name",
        "name_placeholder": "e.g. HDFC 5-year RD",
        "invested_label": "Total deposited",
        "value_label": "Current value",
        "fields": [
            f("bank", "Bank / post office", "select", options=BANKS, required=True),
            f("account_no", "RD account number"),
            f("monthly_amount", "Monthly deposit", "number", unit="₹", required=True, table=True, min=0),
            f("interest_rate", "Interest rate", "number", unit="%", required=True, min=0, max=20),
            f("tenor_years", "Tenor years", "number", min=0, max=50),
            f("tenor_months", "Tenor months", "number", min=0, max=11),
            f("tenor_days", "Tenor days", "number", min=0, max=31),
            f("maturity_date", "Maturity date", "date", help="Leave blank to calculate it from the tenor"),
            f("maturity_amount", "Maturity amount", "number", unit="₹", computed=True),
            f("primary_depositor", "Primary depositor", placeholder="Name on the deposit"),
            f("joint_depositor_1", "Joint depositor 1"),
            f("joint_depositor_2", "Joint depositor 2"),
            f("nominee", "Nominee"),
        ],
    },
    {
        "key": "bonds",
        "label": "Bonds & G-Secs",
        "category": "debt",
        "sheet": "Debt - Bonds",
        "blurb": "Government securities, corporate bonds, SGBs",
        "name_label": "Bond / security name",
        "name_placeholder": "e.g. 7.18% GOI 2033",
        "invested_label": "Amount invested",
        "value_label": "Current value",
        "derive": {"invested": ("quantity", "purchase_price")},
        "fields": [
            f("issuer", "Issuer", required=True, placeholder="Government of India / company"),
            f("bond_kind", "Bond type", "select", options=BOND_KINDS, required=True),
            f("isin", "ISIN", placeholder="IN0020230085"),
            f("quantity", "Units / quantity", "number", table=True, min=0),
            f("purchase_price", "Purchase price per unit", "number", unit="₹", min=0),
            f("face_value", "Face value per unit", "number", unit="₹", min=0),
            f("coupon_rate", "Coupon rate", "number", unit="%", table=True, min=0, max=30),
            f("maturity_date", "Maturity date", "date"),
            f("credit_rating", "Credit rating", "select", options=CREDIT_RATINGS),
            f("interest_frequency", "Interest frequency", "select", options=SUMMARY_FREQUENCIES),
            f("taxable", "Interest is taxable", "boolean"),
        ],
    },
    {
        "key": "ppf",
        "label": "PPF",
        "category": "debt",
        "sheet": "Debt - PPF",
        "blurb": "Public Provident Fund accounts",
        "name_label": "PPF account name",
        "name_placeholder": "e.g. PPF - SBI Nariman Point",
        "invested_label": "Total contributed",
        "value_label": "Current balance",
        "fields": [
            f("institution", "Bank / post office", "select", options=["India Post", *BANKS], required=True),
            f("account_no", "PPF account number", required=True),
            f("yearly_contribution", "Yearly contribution", "number", unit="₹", table=True, min=0, max=150000),
            f("interest_rate", "Interest rate", "number", unit="%", min=0, max=20),
        ],
    },
    {
        "key": "epf",
        "label": "EPF / VPF",
        "category": "debt",
        "sheet": "Debt - EPF",
        "blurb": "Employee provident fund balances",
        "name_label": "EPF account name",
        "name_placeholder": "e.g. EPF - Infosys",
        "invested_label": "Total contributions",
        "value_label": "Current balance",
        "derive": {"invested": ["employee_contribution", "employer_contribution"]},
        "fields": [
            f("uan", "UAN", required=True, placeholder="12-digit Universal Account Number"),
            f("employer", "Employer / establishment", placeholder="e.g. Infosys Ltd"),
            f("employee_contribution", "Employee contribution", "number", unit="₹", min=0),
            f("employer_contribution", "Employer contribution", "number", unit="₹", min=0),
            f("interest_rate", "Interest rate", "number", unit="%", min=0, max=20),
        ],
    },
    {
        "key": "nps",
        "label": "NPS",
        "category": "debt",
        "sheet": "Debt - NPS",
        "blurb": "National Pension System Tier I and II",
        "name_label": "NPS account name",
        "name_placeholder": "e.g. NPS Tier I - SBI Pension",
        "invested_label": "Total contributed",
        "value_label": "Current corpus",
        "fields": [
            f("pran", "PRAN", required=True, placeholder="12-digit PRAN"),
            f("tier", "Tier", "select", options=["Tier I", "Tier II"], required=True, default="Tier I"),
            f("scheme_preference", "Scheme preference", "select", options=[
                "Active", "Auto", "Aggressive (LC75)", "Moderate (LC50)", "Conservative (LC25)"]),
            f("fund_manager", "Pension fund manager", "select", options=PENSION_FUNDS),
            f("employer_contribution", "Employer contribution", "number", unit="₹", min=0),
            f("annuity_pct", "Annuity allocation", "number", unit="%", min=0, max=100),
            f("retirement_date", "Retirement date", "date"),
        ],
    },
    {
        "key": "small_savings",
        "label": "Small savings",
        "category": "debt",
        "sheet": "Debt - Small Savings",
        "blurb": "NSC, KVP, SSY, SCSS and post office MIS",
        "name_label": "Scheme name",
        "name_placeholder": "e.g. NSC 2020 Series",
        "invested_label": "Amount deposited",
        "value_label": "Current value",
        "derive": {"invested": ("deposit_amount",)},
        "fields": [
            f("scheme", "Scheme", "select", options=SMALL_SAVINGS, required=True),
            f("institution", "Institution", "select", options=["India Post", *BANKS], required=True),
            f("account_no", "Account / certificate number"),
            f("deposit_amount", "Deposit amount", "number", unit="₹", table=True, min=0),
            f("interest_rate", "Interest rate", "number", unit="%", min=0, max=20),
            f("tenor_years", "Tenor years", "number", min=0, max=50),
            f("tenor_months", "Tenor months", "number", min=0, max=11),
            f("tenor_days", "Tenor days", "number", min=0, max=31),
            f("maturity_date", "Maturity date", "date", help="Leave blank to calculate it from the tenor"),
            f("primary_depositor", "Primary depositor", placeholder="Name on the deposit"),
            f("joint_depositor_1", "Joint depositor 1"),
            f("joint_depositor_2", "Joint depositor 2"),
            f("nominee", "Nominee"),
        ],
    },
    {
        "key": "real_estate",
        "label": "Real estate",
        "category": "other",
        "sheet": "Other - Real Estate",
        "blurb": "Homes, plots and commercial property",
        "name_label": "Property name",
        "name_placeholder": "e.g. 3BHK Whitefield apartment",
        "invested_label": "Purchase price",
        "value_label": "Current valuation",
        "fields": [
            f("property_type", "Property type", "select", options=PROPERTY_TYPES, required=True),
            f("address", "Address", wide=True, placeholder="Building, street, locality"),
            f("city", "City", placeholder="e.g. Bengaluru"),
            f("area_sqft", "Area (sq ft)", "number", table=True, min=0),
            f("registration_charges", "Stamp duty & registration", "number", unit="₹", min=0),
            f("ownership_pct", "Ownership share", "number", unit="%", min=0, max=100, table=True),
            f("co_owner", "Co-owner"),
            f("loan_outstanding", "Home loan outstanding", "number", unit="₹", min=0),
            f("monthly_rent", "Monthly rent received", "number", unit="₹", min=0),
            f("survey_no", "Khata / survey number"),
            f("is_rented", "Currently rented", "boolean"),
        ],
    },
    {
        "key": "jewellery",
        "label": "Jewellery & bullion",
        "category": "other",
        "sheet": "Other - Jewellery",
        "blurb": "Physical gold, silver and diamonds",
        "name_label": "Item description",
        "name_placeholder": "e.g. Gold necklace set",
        "invested_label": "Purchase cost",
        "value_label": "Current valuation",
        "fields": [
            f("metal", "Metal", "select", options=METALS, required=True),
            f("purity", "Purity", "select", options=PURITIES, required=True),
            f("weight_grams", "Weight (grams)", "number", table=True, min=0),
            f("jeweller", "Jeweller / source"),
            f("bill_no", "Bill / invoice number"),
            f("hallmark", "Hallmarking", "select", options=HALLMARKS),
            f("storage", "Stored at", "select", options=STORAGE),
        ],
    },
    {
        "key": "crypto",
        "label": "Crypto assets",
        "category": "other",
        "sheet": "Other - Crypto",
        "blurb": "Coins and tokens held on exchanges or wallets",
        "name_label": "Holding name",
        "name_placeholder": "e.g. Bitcoin - WazirX",
        "invested_label": "Amount invested",
        "value_label": "Current value",
        "derive": {"invested": ("quantity", "avg_buy_price"), "value": ("quantity", "current_price")},
        "fields": [
            f("coin", "Coin / token", "select", options=CRYPTO_COINS, required=True),
            f("platform", "Exchange / wallet", "select", options=CRYPTO_PLATFORMS, required=True),
            f("quantity", "Quantity", "number", required=True, table=True, min=0),
            f("avg_buy_price", "Average buy price", "number", unit="₹", required=True, min=0),
            f("current_price", "Current price", "number", unit="₹", min=0),
            f("wallet_address", "Wallet address", wide=True, placeholder="Optional, for self-custody holdings"),
        ],
    },
    {
        "key": "insurance",
        "label": "Insurance policies",
        "category": "other",
        "sheet": "Other - Insurance",
        "blurb": "Life, health and ULIP policies",
        "name_label": "Policy / plan name",
        "name_placeholder": "e.g. LIC Jeevan Anand",
        "invested_label": "Premiums paid",
        "value_label": "Current fund value",
        "fields": [
            f("insurer", "Insurer", "select", options=INSURERS, required=True),
            f("policy_type", "Policy type", "select", options=POLICY_TYPES, required=True),
            f("policy_no", "Policy number", required=True),
            f("sum_assured", "Sum assured", "number", unit="₹", table=True, min=0),
            f("premium_amount", "Premium amount", "number", unit="₹", min=0),
            f("premium_frequency", "Premium frequency", "select", options=PREMIUM_FREQUENCIES),
            f("policy_term_years", "Policy term (years)", "number", min=1, max=100),
            f("maturity_date", "Maturity date", "date"),
            f("fund_value", "Fund / surrender value", "number", unit="₹", min=0),
        ],
    },
]

TYPES = {t["key"]: t for t in _TYPES}
TYPE_LIST = _TYPES
SHEETS = {t["sheet"]: t["key"] for t in _TYPES}
CATEGORY_MAP = {c["key"]: c for c in CATEGORIES}

COMMON_FIELDS = [
    {"key": "name", "label": "Investment name", "input": "text", "required": True, "wide": True},
    {"key": "invested_amount", "label": "Amount invested", "input": "number", "unit": "₹", "required": True},
    {"key": "current_value", "label": "Current value", "input": "number", "unit": "₹", "required": True},
    {"key": "start_date", "label": "Purchase / start date", "input": "date"},
]


def meta() -> dict:
    """Payload that lets the frontend render every form and table column."""
    types = []
    for type_meta in _TYPES:
        item = dict(type_meta)
        if item.get("derive"):
            item["derive"] = {
                target: {"op": "mul" if isinstance(spec, tuple) else "sum", "fields": list(spec)}
                for target, spec in item["derive"].items()
            }
        types.append(item)
    return {
        "categories": CATEGORIES,
        "types": types,
        "common_fields": COMMON_FIELDS,
        "banks": BANKS,
        "brokers": BROKERS,
        "account_types": ACCOUNT_TYPES,
        "currency": "INR",
    }


def table_fields(type_key: str) -> list[str]:
    return [fld["key"] for fld in TYPES[type_key]["fields"] if fld.get("table")]


def _canonical_option(options: list[str], value: str):
    lookup = {opt.lower(): opt for opt in options}
    return lookup.get(str(value).strip().lower())


_TRUE = {"yes", "y", "true", "1", "ja", "haan"}
_FALSE = {"no", "n", "false", "0", "nahi"}


def _parse_boolean(value):
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in _TRUE:
        return True
    if text in _FALSE:
        return False
    raise ValueError("Choose Yes or No")


def _derive_values(type_meta: dict, details: dict) -> tuple:
    invested = value = None
    rules = type_meta.get("derive") or {}
    for target, spec in rules.items():
        if isinstance(spec, tuple) and len(spec) == 2:
            first, second = (details.get(spec[0]), details.get(spec[1]))
            if isinstance(first, (int, float)) and isinstance(second, (int, float)):
                result = first * second
            else:
                result = None
        else:
            parts = [details.get(k) for k in spec]
            if all(isinstance(p, (int, float)) for p in parts) and parts:
                result = sum(parts)
            else:
                result = None
        if target == "invested":
            invested = result
        elif target == "value":
            value = result
    if invested is None and type_meta["key"] == "rd":
        monthly = details.get("monthly_amount")
        tenor_years, tenor_months, tenor_days = _tenor_parts(details)
        months = tenor_years * 12 + tenor_months + tenor_days / 30
        if isinstance(monthly, (int, float)) and months:
            invested = round(monthly * months, 2)
    return invested, value


MARKET_TYPES = {"stocks", "etf"}
PRICE_KEY = {"stocks": "ltp", "etf": "current_price"}
DEMAT_TYPES = {"stocks", "etf"}


def _db_row(sql, args=()):
    """Lookups that enrich a holding; return None outside an app context (tests, CLI)."""
    try:
        from . import db
    except ImportError:
        return None
    try:
        return db.query_one(sql, args)
    except RuntimeError:
        return None


def _demat_label(account) -> str:
    name = account["label"] or account["broker"] or "Demat"
    return f"{name} · {account['client_id']}"


def _apply_demat(account, details: dict) -> None:
    details["demat_id"] = account["id"]
    details["broker"] = account["broker"]
    details["demat_account"] = account["client_id"]
    details["demat_label"] = _demat_label(account)


def resolve_demat(value, owner_id):
    """Match a master row by id, label or client ID for the given owner."""
    if value is None or str(value).strip() == "":
        return None
    text = str(value).strip()
    if text.isdigit():
        row = _db_row("SELECT * FROM demat_accounts WHERE id = ?", (int(text),))
        if row is not None and (owner_id is None or row["owner_id"] == owner_id):
            return row
    rows = db_demat_accounts(owner_id)
    lowered = text.lower()
    for row in rows:
        if _demat_label(row).lower() == lowered or str(row["client_id"]).lower() == lowered:
            return row
    return None


def db_demat_accounts(owner_id=None):
    if owner_id is None:
        return _db_rows("SELECT * FROM demat_accounts ORDER BY broker, client_id")
    return _db_rows(
        "SELECT * FROM demat_accounts WHERE owner_id = ? ORDER BY broker, client_id", (owner_id,)
    )


def _db_rows(sql, args=()):
    try:
        from . import db
    except ImportError:
        return []
    try:
        return db.query(sql, args)
    except RuntimeError:
        return []


TENOR_TYPES = {"fd", "rd", "small_savings"}
TENOR_REQUIRED = {"fd", "rd"}
TENOR_KEYS = ("tenor_years", "tenor_months", "tenor_days")


IDENTITY_FIELDS = (
    "account_no", "uan", "pran", "policy_no", "isin", "symbol", "folio_no", "bill_no", "survey_no",
)

# Identifiers that belong to one contract, so they cannot legitimately repeat for two members.
# Symbol and ISIN are excluded: two members may hold the same stock or bond.
CROSS_OWNER_FIELDS = (
    "account_no", "uan", "pran", "policy_no", "folio_no", "bill_no", "survey_no",
)


# Filled in later by the member; these must never identify a holding.
PLACEHOLDER_VALUES = {
    "to be filled", "to be filled later", "to be updated", "tobefilled", "tbf", "tbd", "tba",
    "tofill", "fill later", "later", "pending", "na", "n a", "nil", "none", "null", "blank",
    "unknown", "not available", "not known", "0", "000", "0000",
}


def _identifier(value) -> str:
    """The comparable form of a serial number, or '' when blank or a placeholder."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    text = str(value).strip()
    if not text:
        return ""
    key = re.sub(r"[\s._/\\-]+", " ", text).strip().lower()
    if key in PLACEHOLDER_VALUES or not re.search(r"[0-9a-z]", key) or re.fullmatch(r"[x]+", key):
        return ""
    return key


def holding_keys(data: dict) -> tuple:
    """Every identity a holding can be recognised by, so corrected re-uploads stay out.

    Names, amounts and rates are deliberately excluded: the same company can hold several
    deposits with identical amounts, and names are auto-generated from the reference.
    """
    owner = data.get("owner_id")
    type_key = data.get("type")
    details = data.get("details") or {}
    keys = []
    for field in IDENTITY_FIELDS:
        value = _identifier(details.get(field))
        if value:
            keys.append((owner, type_key, field, value))
    if type_key == "crypto":
        coin = _identifier(details.get("coin"))
        platform = _identifier(details.get("platform"))
        if coin and platform:
            keys.append((owner, type_key, "coin", coin, platform))
    return tuple(keys)


def serial_keys(data: dict) -> tuple:
    """Contract identifiers matched across the whole family, whichever member imports the row."""
    type_key = data.get("type")
    details = data.get("details") or {}
    keys = []
    for field in CROSS_OWNER_FIELDS:
        value = _identifier(details.get(field))
        if value:
            keys.append((type_key, field, value))
    return tuple(keys)


def _tenor_parts(details: dict) -> tuple[int, int, int]:
    parts = []
    for key in TENOR_KEYS:
        value = details.get(key)
        parts.append(int(value) if isinstance(value, (int, float)) and value > 0 else 0)
    return tuple(parts)


def _add_tenor(start: date, years: int, months: int, days: int) -> date:
    total = start.month - 1 + years * 12 + months
    year = start.year + total // 12
    month = total % 12 + 1
    day = min(start.day, calendar.monthrange(year, month)[1])
    return date(year, month, day) + timedelta(days=days)


def _tenor_between(start: date, maturity: date) -> tuple[int, int, int]:
    years = maturity.year - start.year
    months = maturity.month - start.month
    days = maturity.day - start.day
    if days < 0:
        months -= 1
        prev_month = maturity.month - 1 or 12
        prev_year = maturity.year if maturity.month > 1 else maturity.year - 1
        days += calendar.monthrange(prev_year, prev_month)[1]
    if months < 0:
        years -= 1
        months += 12
    return max(years, 0), max(months, 0), max(days, 0)


def _leap_days(start: date, maturity: date) -> int:
    """Count Feb 29s in the period: Indian banks count every year as 365 days."""
    count = 0
    for year in range(start.year, maturity.year + 1):
        try:
            feb29 = date(year, 2, 29)
        except ValueError:
            continue
        if start < feb29 <= maturity:
            count += 1
    return count


def _maturity_amount(type_key: str, details: dict, start: date, maturity: date):
    rate = details.get("interest_rate")
    if not isinstance(rate, (int, float)):
        return None
    if type_key == "fd":
        years = ((maturity - start).days - _leap_days(start, maturity)) / 365
        principal = details.get("principal")
        if not isinstance(principal, (int, float)):
            return None
        if (details.get("payout") or "Cumulative") != "Cumulative":
            return principal
        compounding = details.get("compounding") or "Quarterly"
        if compounding == "Simple":
            return principal * (1 + rate / 100 * years)
        per_year = {"Monthly": 12, "Quarterly": 4, "Half-yearly": 2, "Annual": 1}.get(compounding, 4)
        return principal * (1 + rate / 100 / per_year) ** (per_year * years)
    if type_key == "rd":
        monthly = details.get("monthly_amount")
        if not isinstance(monthly, (int, float)):
            return None
        tenor_years, tenor_months, tenor_days = _tenor_parts(details)
        months = tenor_years * 12 + tenor_months + tenor_days / 30
        monthly_rate = rate / 100 / 12
        if monthly_rate == 0:
            return monthly * months
        return monthly * (((1 + monthly_rate) ** months - 1) / monthly_rate) * (1 + monthly_rate)
    return None


def validate_investment(payload: dict) -> tuple[dict, dict]:
    """Return (cleaned, errors). cleaned['data'] is safe to persist."""
    errors: dict[str, str] = {}
    type_key = (payload.get("type") or "").strip()
    type_meta = TYPES.get(type_key)
    if not type_meta:
        return {}, {"type": "Choose a valid investment type"}

    if type_key in MARKET_TYPES and not str(payload.get("exchange") or "").strip():
        payload = {**payload, "exchange": "NSE"}

    parsed = {}
    details = {}
    for field in type_meta["fields"]:
        if field.get("computed"):
            continue
        raw = payload.get(field["key"])
        key = field["key"]
        kind = field["input"]
        try:
            if kind == "number":
                value = parse_number(raw)
                if value is not None:
                    if field.get("min") is not None and value < field["min"]:
                        raise ValueError(f"Must be at least {field['min']}")
                    if field.get("max") is not None and value > field["max"]:
                        raise ValueError(f"Must be at most {field['max']}")
            elif kind == "date":
                value = parse_date(raw)
            elif kind == "select":
                if raw is None or str(raw).strip() == "":
                    value = None
                elif field.get("options_from"):
                    value = str(raw).strip()
                else:
                    value = _canonical_option(field.get("options", []), raw)
                    if value is None:
                        raise ValueError("Choose one of the listed options")
            elif kind == "boolean":
                value = _parse_boolean(raw)
            else:
                if raw is None:
                    value = None
                else:
                    value = str(raw).strip()
                    if value == "":
                        value = None
                    elif len(value) > 300:
                        raise ValueError("Too long (max 300 characters)")
            if field.get("required") and value is None:
                raise ValueError("This field is required")
            parsed[key] = value
        except ValueError as exc:
            errors[key] = str(exc)
            parsed[key] = None
    details = {k: v for k, v in parsed.items() if v is not None}

    name = str(payload.get("name") or "").strip()
    if not name:
        errors["name"] = "Give this investment a name"
    elif len(name) > 160:
        errors["name"] = "Keep the name under 160 characters"

    notes = str(payload.get("notes") or "").strip()
    if len(notes) > 2000:
        errors["notes"] = "Notes are limited to 2000 characters"

    try:
        start_date = parse_date(payload.get("start_date"))
    except ValueError as exc:
        errors["start_date"] = str(exc)
        start_date = None

    maturity_raw = details.get("maturity_date")
    if start_date and maturity_raw and maturity_raw < start_date:
        errors["maturity_date"] = "Maturity cannot be before the start date"

    if type_key in TENOR_TYPES:
        if not any(_tenor_parts(details)):
            try:
                legacy_months = int(parse_number(payload.get("tenure_months")) or 0)
            except ValueError:
                legacy_months = 0
            if legacy_months > 0:
                details["tenor_years"] = legacy_months // 12
                details["tenor_months"] = legacy_months % 12
        tenor = _tenor_parts(details)
        if not any(tenor) and maturity_raw:
            if not start_date and type_key in TENOR_REQUIRED:
                errors["start_date"] = "Enter the deposit date to work out the tenor"
            elif start_date and "start_date" not in errors and "maturity_date" not in errors:
                start = date.fromisoformat(start_date)
                maturity = date.fromisoformat(maturity_raw)
                if maturity <= start:
                    errors["maturity_date"] = "Maturity must be after the deposit date"
                else:
                    tenor = _tenor_between(start, maturity)
                    details["tenor_years"], details["tenor_months"], details["tenor_days"] = tenor
        elif not any(tenor) and type_key in TENOR_REQUIRED:
            errors["tenor_years"] = "Enter the tenor (or the maturity date)"
        if any(tenor) and start_date and "start_date" not in errors and "maturity_date" not in errors:
            start = date.fromisoformat(start_date)
            if details.get("maturity_date"):
                maturity = date.fromisoformat(str(details["maturity_date"]))
            else:
                maturity = _add_tenor(start, *tenor)
                details["maturity_date"] = maturity.isoformat()
            amount = _maturity_amount(type_key, details, start, maturity)
            if amount is not None:
                details["maturity_amount"] = round(amount, 2)

    try:
        owner_id = int(payload.get("owner_id"))
    except (TypeError, ValueError):
        owner_id = None
        errors["owner_id"] = "Choose who owns this investment"

    if type_key in MARKET_TYPES:
        symbol = str(details.get("symbol") or "").strip().upper()
        if symbol:
            details["symbol"] = symbol
            quote = _db_row("SELECT close_price FROM market_prices WHERE symbol = ?", (symbol,))
            if quote is not None and quote["close_price"] is not None:
                details[PRICE_KEY[type_key]] = round(float(quote["close_price"]), 2)
            if type_key == "stocks" and not details.get("sector"):
                sector = equity.sector_for(symbol)
                if sector:
                    details["sector"] = sector

    if type_key in DEMAT_TYPES:
        account = resolve_demat(details.get("demat_id"), owner_id)
        if account is not None:
            _apply_demat(account, details)
        elif details.get("demat_id") not in (None, ""):
            errors["demat_id"] = "Pick a demat account saved under Masters"
            details.pop("demat_id", None)

    derived_invested, derived_value = _derive_values(type_meta, details)
    try:
        invested = parse_number(payload.get("invested_amount"))
    except ValueError as exc:
        errors["invested_amount"] = str(exc)
        invested = None
    if invested is None:
        invested = derived_invested
    if invested is None:
        source = (type_meta.get("derive") or {}).get("invested")
        if source:
            keys = source if isinstance(source, tuple) else tuple(source)
            for key in keys:
                if details.get(key) is None and key not in errors:
                    errors[key] = "Enter this value so the amount invested can be calculated"
        else:
            errors["invested_amount"] = "Enter the amount invested"

    try:
        current = parse_number(payload.get("current_value"))
    except ValueError as exc:
        errors["current_value"] = str(exc)
        current = None
    if current is None:
        current = derived_value
    if current is None:
        current = invested

    if invested is not None and invested < 0:
        errors["invested_amount"] = "Amount cannot be negative"
    if current is not None and current < 0:
        errors["current_value"] = "Value cannot be negative"

    data = {
        "owner_id": owner_id,
        "type": type_key,
        "category": type_meta["category"],
        "name": name,
        "invested_amount": round(invested, 2) if invested is not None else 0,
        "current_value": round(current, 2) if current is not None else 0,
        "start_date": start_date,
        "notes": notes or None,
        "details": details,
    }
    return data, errors
