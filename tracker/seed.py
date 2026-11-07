"""Realistic sample portfolio used for demos and first-run exploration."""

import json
from datetime import date, timedelta

from werkzeug.security import generate_password_hash

from . import db, fields

DEMO_PASSWORD = "Invest@2026"


def _in(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


MEMBERS = [
    {
        "name": "Ananya Sharma",
        "email": "ananya@example.com",
        "role": "admin",
        "pan": "ABCPD1234K",
        "aadhaar": "234567890123",
        "dob": "1986-04-12",
        "phone": "9876543210",
        "address": "12, Palm Grove, Indiranagar, Bengaluru 560038",
        "bank_name": "HDFC Bank",
        "bank_branch": "Indiranagar, Bengaluru",
        "ifsc": "HDFC0000001",
        "account_number": "50100123456789",
        "account_type": "Savings",
    },
    {
        "name": "Rohan Sharma",
        "email": "rohan@example.com",
        "role": "viewer",
        "pan": "XYZPS9876L",
        "aadhaar": "345678901234",
        "dob": "1990-09-23",
        "phone": "9812345670",
        "address": "12, Palm Grove, Indiranagar, Bengaluru 560038",
        "bank_name": "ICICI Bank",
        "bank_branch": "Koramangala, Bengaluru",
        "ifsc": "ICIC0000001",
        "account_number": "012301234567",
        "account_type": "Salary",
    },
    {
        "name": "Meera Sharma",
        "email": "meera@example.com",
        "role": "viewer",
        "pan": "LMNOP4567M",
        "aadhaar": "456789012345",
        "dob": "1959-01-08",
        "phone": "9900112233",
        "address": "7, Lake View, Jayanagar, Bengaluru 560041",
        "bank_name": "State Bank of India",
        "bank_branch": "Jayanagar, Bengaluru",
        "ifsc": "SBIN0000001",
        "account_number": "30456789123",
        "account_type": "Savings",
    },
]


DEMAT_ACCOUNTS = [
    {"owner": "ananya@example.com", "broker": "Zerodha", "client_id": "1203456789012345", "label": "Zerodha primary"},
    {"owner": "rohan@example.com", "broker": "Groww", "client_id": "G12345678", "label": "Groww"},
    {"owner": "rohan@example.com", "broker": "Zerodha", "client_id": "9020123456", "label": "Zerodha"},
    {"owner": "rohan@example.com", "broker": "Upstox", "client_id": "U45678901", "label": "Upstox"},
    {"owner": "meera@example.com", "broker": "ICICI Direct", "client_id": "152003456789", "label": "ICICI Direct"},
]


INVESTMENTS = [
    # ---------------- Equity: stocks
    {
        "owner": "ananya@example.com",
        "payload": {
            "type": "stocks", "name": "Reliance Industries", "symbol": "RELIANCE", "exchange": "NSE",
            "quantity": 120, "avg_buy_price": 2450, "ltp": 2890, "sector": "Oil & Gas",
            "broker": "Zerodha", "demat_account": "1203456789012345", "start_date": _in(-420),
        },
    },
    {
        "owner": "rohan@example.com",
        "payload": {
            "type": "stocks", "name": "HDFC Bank", "symbol": "HDFCBANK", "exchange": "NSE",
            "quantity": 200, "avg_buy_price": 1520, "ltp": 1685,
            "sector": "Banking & Financial Services", "broker": "Groww", "start_date": _in(-700),
        },
    },
    {
        "owner": "ananya@example.com",
        "payload": {
            "type": "stocks", "name": "Infosys", "symbol": "INFY", "exchange": "NSE",
            "quantity": 150, "avg_buy_price": 1410, "ltp": 1522,
            "sector": "Information Technology", "broker": "Zerodha", "start_date": _in(-260),
        },
    },
    {
        "owner": "meera@example.com",
        "payload": {
            "type": "stocks", "name": "Tata Consultancy Services", "symbol": "TCS", "exchange": "NSE",
            "quantity": 40, "avg_buy_price": 3600, "ltp": 3320,
            "sector": "Information Technology", "broker": "ICICI Direct", "start_date": _in(-540),
        },
    },
    {
        "owner": "rohan@example.com",
        "payload": {
            "type": "stocks", "name": "Titan Company", "symbol": "TITAN", "exchange": "NSE",
            "quantity": 35, "avg_buy_price": 3100, "ltp": 3520,
            "sector": "Consumer Durables", "broker": "Upstox", "start_date": _in(-330),
        },
    },
    # ---------------- Equity: mutual funds
    {
        "owner": "ananya@example.com",
        "payload": {
            "type": "mutual_funds", "name": "Parag Parikh Flexi Cap Fund", "amc": "Parag Parikh MF",
            "scheme_category": "Flexi Cap", "plan": "Direct", "option": "Growth",
            "folio_no": "123456789 / 0", "units": 412.665, "avg_nav": 62.40, "current_nav": 74.18,
            "sip_amount": 10000, "sip_date": 5, "registrar": "CAMS", "start_date": _in(-900),
        },
    },
    {
        "owner": "ananya@example.com",
        "payload": {
            "type": "mutual_funds", "name": "SBI Small Cap Fund", "amc": "SBI Mutual Fund",
            "scheme_category": "Small Cap", "plan": "Direct", "option": "Growth",
            "units": 520.11, "avg_nav": 128.50, "current_nav": 156.20, "sip_amount": 5000,
            "sip_date": 10, "registrar": "CAMS", "start_date": _in(-1200),
        },
    },
    {
        "owner": "rohan@example.com",
        "payload": {
            "type": "mutual_funds", "name": "HDFC Index Fund - Nifty 50 Plan", "amc": "HDFC Mutual Fund",
            "scheme_category": "Index Fund", "plan": "Direct", "option": "Growth",
            "units": 800, "avg_nav": 185.30, "current_nav": 198.90, "sip_amount": 7500,
            "sip_date": 1, "registrar": "CAMS", "start_date": _in(-600),
        },
    },
    {
        "owner": "meera@example.com",
        "payload": {
            "type": "mutual_funds", "name": "ICICI Prudential Bluechip Fund", "amc": "ICICI Prudential MF",
            "scheme_category": "Large Cap", "plan": "Regular", "option": "IDCW - Payout",
            "units": 1200, "avg_nav": 82.40, "current_nav": 95.70, "registrar": "KFintech",
            "start_date": _in(-1500),
        },
    },
    # ---------------- Equity: ETFs
    {
        "owner": "rohan@example.com",
        "payload": {
            "type": "etf", "name": "Nippon India Nifty 50 BeES", "symbol": "NIFTYBEES",
            "exchange": "NSE", "units": 500, "avg_price": 248.50, "current_price": 265.10,
            "underlying": "Nifty 50", "broker": "Zerodha", "start_date": _in(-800),
        },
    },
    {
        "owner": "meera@example.com",
        "payload": {
            "type": "etf", "name": "Nippon India Gold BeES", "symbol": "GOLDBEES",
            "exchange": "NSE", "units": 1000, "avg_price": 58.20, "current_price": 71.40,
            "underlying": "Gold", "broker": "ICICI Direct", "start_date": _in(-1100),
        },
    },
    # ---------------- Debt
    {
        "owner": "ananya@example.com",
        "payload": {
            "type": "fd", "name": "SBI 3-year fixed deposit", "bank": "State Bank of India",
            "account_no": "3270456123", "principal": 500000, "interest_rate": 7.10,
            "tenor_years": 3, "compounding": "Quarterly", "payout": "Cumulative",
            "start_date": _in(-680),
            "current_value": 574000,
        },
    },
    {
        "owner": "meera@example.com",
        "payload": {
            "type": "fd", "name": "HDFC senior citizen FD", "bank": "HDFC Bank",
            "account_no": "5030098765", "principal": 800000, "interest_rate": 7.75,
            "tenor_years": 5, "compounding": "Quarterly", "payout": "Cumulative",
            "start_date": _in(-1050), "current_value": 955000,
        },
    },
    {
        "owner": "rohan@example.com",
        "payload": {
            "type": "fd", "name": "Bajaj Finance FD", "bank": "Other", "account_no": "BFD778812",
            "principal": 250000, "interest_rate": 8.15, "tenor_years": 2, "tenor_months": 6,
            "compounding": "Quarterly", "payout": "Cumulative",
            "start_date": _in(-850), "current_value": 302000,
        },
    },
    {
        "owner": "rohan@example.com",
        "payload": {
            "type": "rd", "name": "HDFC 5-year recurring deposit", "bank": "HDFC Bank",
            "account_no": "RD90012345", "monthly_amount": 10000, "interest_rate": 7.00,
            "tenor_years": 5, "start_date": _in(-330),
            "invested_amount": 110000, "current_value": 114200,
        },
    },
    {
        "owner": "ananya@example.com",
        "payload": {
            "type": "bonds", "name": "7.18% GOI 2033", "issuer": "Government of India",
            "bond_kind": "Government Security (G-Sec)", "isin": "IN0020230085", "quantity": 5000,
            "purchase_price": 100, "face_value": 100, "coupon_rate": 7.18,
            "maturity_date": "2033-08-14", "credit_rating": "Sovereign",
            "interest_frequency": "Semi-annual", "taxable": True, "start_date": _in(-400),
            "current_value": 512000,
        },
    },
    {
        "owner": "meera@example.com",
        "payload": {
            "type": "bonds", "name": "IRFC tax-free bond 2031", "issuer": "Indian Railway Finance Corp",
            "bond_kind": "Tax-Free Bond", "quantity": 200, "purchase_price": 1020, "face_value": 1000,
            "coupon_rate": 8.10, "maturity_date": "2031-12-31", "credit_rating": "AAA",
            "interest_frequency": "Annual", "taxable": False, "start_date": _in(-1300),
            "current_value": 218000,
        },
    },
    {
        "owner": "rohan@example.com",
        "payload": {
            "type": "bonds", "name": "Sovereign Gold Bond 2019-20 Series IV", "issuer": "Reserve Bank of India",
            "bond_kind": "Sovereign Gold Bond", "quantity": 30, "purchase_price": 3000,
            "face_value": 3000, "coupon_rate": 2.50, "maturity_date": "2027-03-31",
            "credit_rating": "Sovereign", "interest_frequency": "Semi-annual", "taxable": True,
            "start_date": _in(-1600), "current_value": 211000,
        },
    },
    {
        "owner": "ananya@example.com",
        "payload": {
            "type": "ppf", "name": "PPF - SBI Indiranagar", "institution": "State Bank of India",
            "account_no": "12345678901", "yearly_contribution": 150000, "interest_rate": 7.10,
            "nominee": "Rohan Sharma", "start_date": _in(-1900),
            "invested_amount": 550000, "current_value": 624000,
        },
    },
    {
        "owner": "ananya@example.com",
        "payload": {
            "type": "epf", "name": "EPF - Techwave Pvt Ltd", "uan": "101234567890",
            "employer": "Techwave Pvt Ltd", "employee_contribution": 480000,
            "employer_contribution": 480000, "interest_rate": 8.25, "start_date": _in(-2200),
            "current_value": 1125000,
        },
    },
    {
        "owner": "ananya@example.com",
        "payload": {
            "type": "nps", "name": "NPS Tier I - SBI Pension", "pran": "110012345678",
            "tier": "Tier I", "scheme_preference": "Active", "fund_manager": "SBI Pension Funds",
            "employer_contribution": 120000, "annuity_pct": 40, "retirement_date": "2045-04-12",
            "start_date": _in(-1400), "invested_amount": 480000, "current_value": 561000,
        },
    },
    {
        "owner": "meera@example.com",
        "payload": {
            "type": "small_savings", "name": "NSC 2024 Series", "scheme": "National Savings Certificate (NSC)",
            "institution": "India Post", "account_no": "NSC202400123", "deposit_amount": 200000,
            "interest_rate": 7.70, "maturity_date": _in(300),
            "start_date": _in(-700), "current_value": 228000,
        },
    },
    # ---------------- Other: real estate
    {
        "owner": "ananya@example.com",
        "payload": {
            "type": "real_estate", "name": "Whitefield 3BHK apartment",
            "property_type": "Residential Apartment", "address": "Brigade Cosmopolis, Whitefield",
            "city": "Bengaluru", "area_sqft": 1450, "registration_charges": 460000,
            "ownership_pct": 50, "co_owner": "Rohan Sharma", "loan_outstanding": 3200000,
            "monthly_rent": 32000, "is_rented": True, "start_date": "2019-06-15",
            "invested_amount": 8500000, "current_value": 11200000,
        },
    },
    {
        "owner": "rohan@example.com",
        "payload": {
            "type": "real_estate", "name": "Devanahalli plot", "property_type": "Plot / Land",
            "address": "Aerospace Park layout, Devanahalli", "city": "Bengaluru", "area_sqft": 2400,
            "ownership_pct": 100, "start_date": "2021-11-02", "invested_amount": 3200000,
            "current_value": 5200000,
        },
    },
    # ---------------- Other: jewellery
    {
        "owner": "meera@example.com",
        "payload": {
            "type": "jewellery", "name": "Gold necklace set", "metal": "Gold", "purity": "22K",
            "weight_grams": 85, "jeweller": "Tanishq, Jayanagar", "bill_no": "TJ/2021/4412",
            "hallmark": "BIS Hallmarked", "storage": "Bank locker", "start_date": "2021-08-20",
            "invested_amount": 420000, "current_value": 610000,
        },
    },
    {
        "owner": "meera@example.com",
        "payload": {
            "type": "jewellery", "name": "Silver utensils set", "metal": "Silver",
            "purity": "925 Silver", "weight_grams": 1200, "storage": "Home safe",
            "start_date": "2018-03-10", "invested_amount": 95000, "current_value": 132000,
        },
    },
    # ---------------- Other: crypto
    {
        "owner": "rohan@example.com",
        "payload": {
            "type": "crypto", "name": "Bitcoin holding", "coin": "Bitcoin (BTC)", "platform": "WazirX",
            "quantity": 0.045, "avg_buy_price": 4200000, "current_price": 6850000,
            "start_date": _in(-600),
        },
    },
    {
        "owner": "rohan@example.com",
        "payload": {
            "type": "crypto", "name": "Ethereum holding", "coin": "Ethereum (ETH)", "platform": "CoinDCX",
            "quantity": 2.5, "avg_buy_price": 210000, "current_price": 265000, "start_date": _in(-480),
        },
    },
    # ---------------- Other: insurance
    {
        "owner": "ananya@example.com",
        "payload": {
            "type": "insurance", "name": "LIC Jeevan Anand", "insurer": "LIC of India",
            "policy_type": "Endowment", "policy_no": "845123456", "sum_assured": 2500000,
            "premium_amount": 48000, "premium_frequency": "Annual", "policy_term_years": 25,
            "maturity_date": "2042-04-12", "fund_value": 860000,
            "start_date": "2017-04-12", "invested_amount": 720000, "current_value": 860000,
        },
    },
    {
        "owner": "meera@example.com",
        "payload": {
            "type": "insurance", "name": "Star Health family floater", "insurer": "Star Health",
            "policy_type": "Health", "policy_no": "SH-2024-8891", "sum_assured": 1000000,
            "premium_amount": 24000, "premium_frequency": "Annual", "policy_term_years": 1,
            "maturity_date": _in(210), "start_date": _in(-120),
            "invested_amount": 96000, "current_value": 96000,
        },
    },
]


def seed_demo(actor=None):
    """Create demo members and holdings. Skips members that already exist."""
    created_members = 0
    for member in MEMBERS:
        if db.query_one("SELECT id FROM users WHERE email = ?", (member["email"],)):
            continue
        now = db.now()
        db.execute(
            """INSERT INTO users (name, email, password_hash, role, pan, aadhaar, dob, phone, address,
                                  bank_name, bank_branch, ifsc, account_number, account_type,
                                  created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                member["name"], member["email"], generate_password_hash(DEMO_PASSWORD), member["role"],
                member["pan"], member["aadhaar"], member["dob"], member["phone"], member["address"],
                member["bank_name"], member["bank_branch"], member["ifsc"], member["account_number"],
                member["account_type"], now, now,
            ),
        )
        created_members += 1

    ids = {
        row["email"]: row["id"]
        for row in db.query(
            "SELECT id, email FROM users WHERE email IN (%s)" % ",".join("?" * len(MEMBERS)),
            tuple(m["email"] for m in MEMBERS),
        )
    }
    created_by = actor["id"] if actor else ids.get(MEMBERS[0]["email"])

    demat_ids = {}
    for account in DEMAT_ACCOUNTS:
        owner_id = ids[account["owner"]]
        row = db.query_one(
            "SELECT id FROM demat_accounts WHERE owner_id = ? AND client_id = ? COLLATE NOCASE",
            (owner_id, account["client_id"]),
        )
        if row:
            account_id = row["id"]
        else:
            now = db.now()
            account_id = db.execute(
                """INSERT INTO demat_accounts (owner_id, broker, client_id, label, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (owner_id, account["broker"], account["client_id"], account["label"], now, now),
            )
        demat_ids[(owner_id, account["broker"].lower())] = account_id

    inserted = 0
    for item in INVESTMENTS:
        payload = dict(item["payload"])
        owner_id = ids[item["owner"]]
        payload["owner_id"] = owner_id
        if "broker" in payload:
            payload["demat_id"] = demat_ids.get((owner_id, str(payload["broker"]).lower()))
        payload.setdefault("notes", "Sample holding")
        data, errors = fields.validate_investment(payload)
        if errors:
            raise RuntimeError(f"Demo data invalid for {payload['name']}: {errors}")
        now = db.now()
        db.execute(
            """INSERT INTO investments (public_id, owner_id, category, type, name, invested_amount,
                                        current_value, start_date, notes, details, created_by,
                                        created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                db.new_public_id(), data["owner_id"], data["category"], data["type"], data["name"],
                data["invested_amount"], data["current_value"], data["start_date"], data["notes"],
                json.dumps(data["details"], ensure_ascii=False), created_by, now, now,
            ),
        )
        inserted += 1
    return {"members": created_members, "investments": inserted}
