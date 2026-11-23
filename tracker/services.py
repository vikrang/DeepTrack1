"""Read models shared by the JSON API: serialisation and dashboard maths."""

import calendar
import json
from datetime import date, timedelta

from . import db, fields
from .validators import mask_aadhaar, mask_account, mask_pan

CATEGORY_MAP = {c["key"]: c for c in fields.CATEGORIES}


def _pick(value, fallback) -> str:
    text = str(value or "").strip()
    return text if text and text.lower() != "other" else str(fallback or "").strip()


def issuer_name(item) -> str:
    """The company, bank or fund house behind a holding, for its brand mark."""
    details = item.get("details") or {}
    if not isinstance(details, dict):
        details = {}
    type_key = item.get("type")
    name = str(item.get("name") or "").strip()
    if type_key == "mutual_funds":
        return _pick(details.get("amc"), name)
    if type_key in ("fd", "rd"):
        return _pick(details.get("bank"), name)
    if type_key == "bonds":
        return _pick(details.get("issuer"), name)
    if type_key in ("ppf", "small_savings"):
        return _pick(details.get("institution"), name)
    if type_key == "epf":
        return _pick(details.get("employer"), name)
    if type_key == "nps":
        return _pick(details.get("fund_manager"), name)
    if type_key == "insurance":
        return _pick(details.get("insurer"), name)
    if type_key == "crypto":
        return _pick(details.get("coin"), name)
    if type_key == "jewellery":
        return _pick(details.get("jeweller"), "")
    if type_key in ("stocks", "etf"):
        return name
    return ""


def _row_dict(row) -> dict:
    return dict(row) if row is not None else {}


def user_payload(row, viewer) -> dict:
    data = _row_dict(row)
    privileged = bool(viewer) and (viewer["role"] == "admin" or viewer["id"] == data["id"])
    return {
        "id": data["id"],
        "name": data["name"],
        "email": data["email"],
        "role": data["role"],
        "phone": data.get("phone") or "",
        "dob": data.get("dob") or "",
        "address": data.get("address") or "",
        "pan": (data.get("pan") or "") if privileged else mask_pan(data.get("pan") or ""),
        "aadhaar": (data.get("aadhaar") or "") if privileged else mask_aadhaar(data.get("aadhaar") or ""),
        "bank_name": data.get("bank_name") or "",
        "bank_branch": data.get("bank_branch") or "",
        "ifsc": data.get("ifsc") or "",
        "account_number": (data.get("account_number") or "") if privileged
        else mask_account(data.get("account_number") or ""),
        "account_type": data.get("account_type") or "",
        "masked": not privileged,
        "is_self": bool(viewer) and viewer["id"] == data["id"],
        "has_kyc": bool(data.get("pan") and data.get("aadhaar")),
        "created_at": data.get("created_at"),
    }


def investment_payload(row) -> dict:
    data = _row_dict(row)
    try:
        details = json.loads(data.get("details") or "{}")
    except (TypeError, ValueError):
        details = {}
    invested = float(data.get("invested_amount") or 0)
    current = float(data.get("current_value") or 0)
    gain = current - invested
    gain_pct = (gain / invested * 100) if invested else 0.0
    effective, value_note = fields.effective_value(
        data.get("type"), details, invested, current, data.get("start_date")
    )
    display = current if effective is None else float(effective)
    display_gain = display - invested
    type_meta = fields.TYPES.get(data.get("type"), {})
    category = CATEGORY_MAP.get(data.get("category"), {})
    return {
        "id": data["id"],
        "public_id": data.get("public_id") or "",
        "owner_id": data["owner_id"],
        "owner": data.get("owner_name") or "",
        "category": data.get("category"),
        "category_label": category.get("label", ""),
        "category_color": category.get("color", "#6366f1"),
        "type": data.get("type"),
        "type_label": type_meta.get("label", data.get("type")),
        "name": data.get("name"),
        "invested_amount": invested,
        "current_value": current,
        "gain": round(gain, 2),
        "gain_pct": round(gain_pct, 2),
        "display_value": round(display, 2),
        "display_gain": round(display_gain, 2),
        "display_gain_pct": round(display_gain / invested * 100, 2) if invested else 0.0,
        "value_note": value_note,
        "maturity_date": str(details.get("maturity_date") or ""),
        "start_date": data.get("start_date") or "",
        "notes": data.get("notes") or "",
        "broker": str(details.get("broker") or "").strip(),
        "details": details,
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
    }


def member_totals() -> list[dict]:
    rows = db.query(
        """
        SELECT u.id, u.name, u.email, u.role, u.pan, u.aadhaar, u.phone, u.dob, u.address,
               u.bank_name, u.bank_branch, u.ifsc, u.account_number, u.account_type,
               u.created_at, u.is_active
        FROM users u
        WHERE u.is_active = 1
        ORDER BY u.name COLLATE NOCASE
        """
    )
    totals: dict[int, dict] = {}
    for r in db.query("SELECT * FROM investments"):
        item = investment_payload(r)
        bucket = totals.setdefault(item["owner_id"], {"holdings": 0, "invested": 0.0, "value": 0.0})
        bucket["holdings"] += 1
        bucket["invested"] += item["invested_amount"]
        bucket["value"] += item["display_value"]
    result = []
    for row in rows:
        entry = dict(row)
        entry.update(totals.get(entry["id"], {"holdings": 0, "invested": 0.0, "value": 0.0}))
        result.append(entry)
    return result


def members_with_totals(viewer) -> list[dict]:
    result = []
    for row in member_totals():
        payload = user_payload(row, viewer)
        payload["holdings"] = row["holdings"]
        payload["invested"] = round(row["invested"], 2)
        payload["value"] = round(row["value"], 2)
        result.append(payload)
    return result


def demat_payload(row) -> dict:
    keys = row.keys()
    return {
        "id": row["id"],
        "owner_id": row["owner_id"],
        "owner": row["owner_name"] if "owner_name" in keys else "",
        "broker": row["broker"],
        "client_id": row["client_id"],
        "label": row["label"] or "",
        "display": fields._demat_label(row),
        "holding_count": row["holding_count"] if "holding_count" in keys else 0,
    }


def demat_accounts(owner_id=None) -> list[dict]:
    where = "WHERE d.owner_id = ?" if owner_id is not None else ""
    args = (owner_id,) if owner_id is not None else ()
    rows = db.query(
        f"""SELECT d.*, u.name AS owner_name
            FROM demat_accounts d
            JOIN users u ON u.id = d.owner_id
            {where}
            ORDER BY u.name COLLATE NOCASE, d.broker COLLATE NOCASE, d.client_id""",
        args,
    )
    counts = {}
    for item in db.query("SELECT owner_id, details FROM investments"):
        try:
            details = json.loads(item["details"] or "{}")
        except (TypeError, ValueError):
            continue
        demat_id = details.get("demat_id")
        if isinstance(demat_id, int):
            counts[demat_id] = counts.get(demat_id, 0) + 1
    result = []
    for row in rows:
        payload = demat_payload(row)
        payload["holding_count"] = counts.get(row["id"], 0)
        result.append(payload)
    return result


INCOME_SELECT = """
    SELECT inc.*, i.name AS investment_name, i.type AS investment_type, i.public_id,
           u.name AS owner_name, u.bank_name, u.bank_branch, u.ifsc,
           u.account_number, u.account_type
    FROM incomes inc
    JOIN investments i ON i.id = inc.investment_id
    JOIN users u ON u.id = inc.owner_id
"""


def fiscal_year(value) -> int | None:
    """Indian financial year, labelled by the year it ends in (2026-27 -> 2027)."""
    try:
        day = date.fromisoformat(str(value or "")[:10])
    except ValueError:
        return None
    return day.year + (1 if day.month >= 4 else 0)


def current_fiscal_year() -> int:
    return fiscal_year(date.today().isoformat())


def fiscal_year_label(year: int) -> str:
    return f"FY {year - 1}-{str(year)[-2:]}"


def income_years() -> list[int]:
    years = set()
    for row in db.query("SELECT credited_date, due_date, created_at FROM incomes"):
        value = fiscal_year(row["credited_date"] or row["due_date"] or row["created_at"])
        if value:
            years.add(value)
    years.add(current_fiscal_year())
    return sorted(years, reverse=True)


def income_payload(row, viewer) -> dict:
    data = _row_dict(row)
    privileged = bool(viewer) and (viewer["role"] == "admin" or viewer["id"] == data["owner_id"])
    kind = fields.INCOME_KIND_MAP.get(data["kind"], {})
    type_meta = fields.TYPES.get(data["investment_type"], {})
    account = data.get("account_number") or ""
    return {
        "id": data["id"],
        "investment_id": data["investment_id"],
        "investment": data["investment_name"],
        "investment_type": data["investment_type"],
        "type_label": type_meta.get("label", data["investment_type"]),
        "public_id": data.get("public_id") or "",
        "owner_id": data["owner_id"],
        "owner": data.get("owner_name") or "",
        "kind": data["kind"],
        "kind_label": kind.get("label", data["kind"].title()),
        "kind_color": kind.get("color", "#6366f1"),
        "amount": round(float(data.get("amount") or 0), 2),
        "status": data["status"],
        "due_date": data.get("due_date") or "",
        "credited_date": data.get("credited_date") or "",
        "source": data.get("source") or "",
        "notes": data.get("notes") or "",
        "bank": {
            "name": data.get("bank_name") or "",
            "branch": data.get("bank_branch") or "",
            "ifsc": data.get("ifsc") or "",
            "type": data.get("account_type") or "",
            "account": account if privileged else mask_account(account),
            "masked": not privileged,
        },
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
    }


def income_summary(year: int | None, viewer) -> dict:
    years = income_years()
    if year is None or year not in years:
        year = years[0]

    rows = db.query(
        INCOME_SELECT
        + """ ORDER BY COALESCE(inc.credited_date, inc.due_date) DESC, inc.id DESC"""
    )
    items = []
    for row in rows:
        key = fiscal_year(row["credited_date"] or row["due_date"] or row["created_at"])
        if key == year:
            items.append(income_payload(row, viewer))
    credited = round(sum(i["amount"] for i in items if i["status"] == "credited"), 2)
    pending = round(sum(i["amount"] for i in items if i["status"] == "pending"), 2)

    by_kind = []
    for kind in fields.INCOME_KINDS:
        subset = [i for i in items if i["kind"] == kind["key"] and i["status"] == "credited"]
        by_kind.append({
            **kind,
            "amount": round(sum(i["amount"] for i in subset), 2),
            "pending": round(sum(
                i["amount"] for i in items if i["kind"] == kind["key"] and i["status"] == "pending"
            ), 2),
            "count": len(subset),
        })

    by_investment = {}
    for item in items:
        bucket = by_investment.setdefault(item["investment_id"], {
            "investment_id": item["investment_id"],
            "investment": item["investment"],
            "type_label": item["type_label"],
            "owner": item["owner"],
            "dividend": 0.0,
            "interest": 0.0,
            "rent": 0.0,
            "other": 0.0,
            "total": 0.0,
            "pending": 0.0,
        })
        if item["status"] == "credited":
            bucket[item["kind"]] += item["amount"]
            bucket["total"] += item["amount"]
        else:
            bucket["pending"] += item["amount"]
    investments = []
    for bucket in by_investment.values():
        for key in ("dividend", "interest", "rent", "other", "total", "pending"):
            bucket[key] = round(bucket[key], 2)
        investments.append(bucket)
    investments.sort(key=lambda b: (b["total"] + b["pending"]), reverse=True)

    by_owner = {}
    for item in items:
        if item["status"] != "credited":
            continue
        bucket = by_owner.setdefault(item["owner_id"], {
            "owner_id": item["owner_id"], "owner": item["owner"], "amount": 0.0, "count": 0,
        })
        bucket["amount"] += item["amount"]
        bucket["count"] += 1
    owners = sorted(by_owner.values(), key=lambda b: b["amount"], reverse=True)
    for bucket in owners:
        bucket["amount"] = round(bucket["amount"], 2)
    credited_total = credited or 0.0
    for bucket in owners:
        bucket["share"] = round(bucket["amount"] / credited_total * 100, 1) if credited_total else 0.0

    checklist_rows = db.query(
        INCOME_SELECT + " WHERE inc.status = 'pending'"
        " ORDER BY COALESCE(inc.due_date, inc.created_at) ASC, inc.id ASC LIMIT 40"
    )
    checklist = []
    today = date.today()
    for row in checklist_rows:
        payload = income_payload(row, viewer)
        try:
            due = date.fromisoformat(payload["due_date"]) if payload["due_date"] else None
        except ValueError:
            due = None
        payload["days"] = (due - today).days if due else None
        checklist.append(payload)

    recorded_interest = {}
    for item in items:
        if item["kind"] == "interest" and item["status"] == "credited":
            recorded_interest[item["investment_id"]] = (
                recorded_interest.get(item["investment_id"], 0.0) + item["amount"]
            )

    return {
        "year": year,
        "year_label": fiscal_year_label(year),
        "years": [{"year": value, "label": fiscal_year_label(value)} for value in years],
        "items": items,
        "checklist": checklist,
        "estimate": income_estimate(year, recorded_interest),
        "summary": {
            "credited": credited,
            "pending": pending,
            "count": len(items),
            "credited_count": len([i for i in items if i["status"] == "credited"]),
            "pending_count": len([i for i in items if i["status"] == "pending"]),
            "by_kind": by_kind,
            "by_investment": investments,
            "by_owner": owners,
        },
    }


ESTIMATE_TYPES = {"fd", "rd", "bonds", "small_savings"}
_COUPON_MONTHS = {"Annual": 12, "Semi-annual": 6, "Quarterly": 3}
_PAYOUT_SAVINGS = {"Post Office MIS", "Senior Citizens' Savings Scheme (SCSS)"}


def _positive(value) -> float | None:
    return float(value) if isinstance(value, (int, float)) and value > 0 else None


def _inr(value) -> str:
    """Indian digit grouping: 1,125,000 -> 11,25,000."""
    whole = str(int(round(abs(float(value or 0)))))
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        whole = ",".join(parts) + "," + tail
    return ("-" if float(value or 0) < 0 else "") + whole


def _parse_day(value) -> date | None:
    try:
        return date.fromisoformat(str(value or "")[:10])
    except ValueError:
        return None


def _add_months(day: date, months: int) -> date:
    total = day.year * 12 + day.month - 1 + months
    year, month = divmod(total, 12)
    month += 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def _estimate_fd(details, start, fy_from, fy_to):
    principal = _positive(details.get("principal"))
    rate = _positive(details.get("interest_rate"))
    if not principal or not rate or not start:
        return None
    maturity = _parse_day(details.get("maturity_date"))
    if (details.get("payout") or "Cumulative") != "Cumulative":
        if start > fy_to:
            return ("past",)
        lo = max(fy_from, start)
        hi = min(fy_to, maturity) if maturity else fy_to
        days = (hi - lo).days
        if days <= 0:
            return ("past",) if maturity and maturity < fy_from else None
        amount = principal * rate / 100 * days / 365
        return amount, f"{rate:g}% paid out on ₹{_inr(principal)} for {days} days", "Interest leaves the deposit at each payout", None
    if not maturity or maturity <= start:
        return None
    if maturity < fy_from:
        return ("past",)
    if maturity > fy_to:
        return ("deferred", maturity)
    stored = _positive(details.get("maturity_amount"))
    if stored:
        interest = stored - principal
    else:
        compounding = details.get("compounding") or "Quarterly"
        years = (maturity - start).days / 365
        if compounding == "Simple":
            interest = principal * rate / 100 * years
        else:
            per_year = {"Monthly": 12, "Quarterly": 4, "Half-yearly": 2, "Annual": 1}.get(compounding, 4)
            interest = principal * (1 + rate / 100 / per_year) ** (per_year * years) - principal
    if interest <= 0:
        return None
    years = (maturity - start).days / 365
    basis = f"{rate:g}% on ₹{_inr(principal)} for {years:.1f} years"
    return interest, basis, "Interest is added to the principal and paid out with the maturity amount", maturity


def _rd_interest(monthly: float, rate: float, start: date, until: date) -> float:
    interest = 0.0
    cursor = date(start.year, start.month, 1)
    while cursor < until:
        nxt = _add_months(cursor, 1)
        seg_start = max(cursor, start)
        seg_end = min(nxt, until)
        days = (seg_end - seg_start).days
        deposited = (seg_start.year - start.year) * 12 + seg_start.month - start.month + 1
        if days > 0 and deposited > 0:
            interest += monthly * deposited * rate / 100 / 365 * days
        cursor = nxt
    return interest


def _estimate_rd(details, start, fy_from, fy_to):
    monthly = _positive(details.get("monthly_amount"))
    rate = _positive(details.get("interest_rate"))
    maturity = _parse_day(details.get("maturity_date"))
    if not monthly or not rate or not start or not maturity or maturity <= start:
        return None
    if maturity < fy_from:
        return ("past",)
    if maturity > fy_to:
        return ("deferred", maturity)
    interest = _rd_interest(monthly, rate, start, maturity)
    if interest <= 0:
        return None
    basis = f"{rate:g}% on monthly deposits of ₹{_inr(monthly)} until maturity"
    return interest, basis, "Paid out with the maturity amount; assumes every instalment was made", maturity


def _estimate_bonds(details, start, fy_from, fy_to):
    quantity = _positive(details.get("quantity"))
    face = _positive(details.get("face_value")) or _positive(details.get("purchase_price"))
    rate = _positive(details.get("coupon_rate"))
    if not quantity or not face or not rate:
        return None
    holding = quantity * face
    maturity = _parse_day(details.get("maturity_date"))
    frequency = details.get("interest_frequency")
    step = _COUPON_MONTHS.get(frequency) if frequency else None
    if step is None:
        if not maturity or not start or maturity <= start:
            return None
        if maturity < fy_from or start > fy_to:
            return ("past",)
        if maturity > fy_to:
            return ("deferred", maturity)
        days = (maturity - start).days
        amount = holding * rate / 100 * days / 365
        basis = f"{rate:g}% on ₹{_inr(holding)} for {days} days"
        return amount, basis, "Cumulative — interest is paid with the redemption amount", maturity
    if not maturity:
        return None
    if maturity < fy_from or (start and start > fy_to):
        return ("past",)
    coupon = holding * rate / 100 * step / 12
    day = maturity
    floor = start or fy_from
    count = 0
    while day >= floor:
        if fy_from <= day <= fy_to:
            count += 1
        day = _add_months(day, -step)
    if count == 0:
        return None
    per_year = 12 // step
    basis = f"{count} coupon{'s' if count != 1 else ''} of ₹{_inr(coupon)} ({rate:g}% on ₹{_inr(holding)}, {per_year}x a year)"
    return coupon * count, basis, "Coupons are credited to the bank account when they pay out", None


def _estimate_small_savings(details, start, fy_from, fy_to):
    deposit = _positive(details.get("deposit_amount"))
    rate = _positive(details.get("interest_rate"))
    if not deposit or not rate:
        return None
    maturity = _parse_day(details.get("maturity_date"))
    if details.get("scheme") in _PAYOUT_SAVINGS:
        if start and start > fy_to:
            return ("past",)
        lo = max(fy_from, start) if start else fy_from
        hi = min(fy_to, maturity) if maturity else fy_to
        days = (hi - lo).days
        if days <= 0:
            return ("past",) if maturity and maturity < fy_from else None
        amount = deposit * rate / 100 * days / 365
        basis = f"{rate:g}% on ₹{_inr(deposit)} for {days} days"
        return amount, basis, "Paid out monthly or quarterly to the bank account", None
    if not start or not maturity or maturity <= start:
        return None
    if maturity < fy_from:
        return ("past",)
    if maturity > fy_to:
        return ("deferred", maturity)
    days = (maturity - start).days
    amount = deposit * rate / 100 * days / 365
    basis = f"{rate:g}% on ₹{_inr(deposit)} for {days} days"
    return amount, basis, "Cumulative — interest is paid with the maturity value", maturity


def income_estimate(year: int, recorded: dict | None = None) -> dict:
    """Income credited in a financial year, with cumulative interest shown at maturity."""
    fy_from, fy_to = date(year - 1, 4, 1), date(year, 3, 31)
    rows = db.query(
        """SELECT i.id, i.name, i.type, i.start_date, i.details,
                  i.invested_amount, i.current_value, u.name AS owner_name
           FROM investments i JOIN users u ON u.id = i.owner_id
           WHERE i.type IN (%s)
           ORDER BY i.current_value DESC""" % ",".join("?" * len(ESTIMATE_TYPES)),
        tuple(sorted(ESTIMATE_TYPES)),
    )
    items, deferred, skipped = [], [], 0
    for row in rows:
        try:
            details = json.loads(row["details"] or "{}")
        except (TypeError, ValueError):
            details = {}
        start = _parse_day(row["start_date"])
        if row["type"] == "fd":
            found = _estimate_fd(details, start, fy_from, fy_to)
        elif row["type"] == "rd":
            found = _estimate_rd(details, start, fy_from, fy_to)
        elif row["type"] == "bonds":
            found = _estimate_bonds(details, start, fy_from, fy_to)
        else:
            found = _estimate_small_savings(details, start, fy_from, fy_to)
        if found is None:
            skipped += 1
            continue
        if found[0] == "past":
            continue
        if found[0] == "deferred":
            deferred.append({"investment": row["name"], "maturity": found[1].isoformat()})
            continue
        amount, basis, note, credited_on = found
        item = {
            "investment_id": row["id"],
            "investment": row["name"],
            "owner": row["owner_name"],
            "type": row["type"],
            "type_label": fields.TYPES.get(row["type"], {}).get("label", row["type"]),
            "kind": "interest",
            "amount": round(amount, 2),
            "basis": basis,
            "note": note,
            "credited_on": credited_on.isoformat() if credited_on else None,
        }
        if recorded:
            item["recorded"] = round(recorded.get(row["id"], 0.0), 2)
        items.append(item)
    items.sort(key=lambda item: (item["credited_on"] or "9999", item["investment"]))
    deferred.sort(key=lambda entry: entry["maturity"])
    return {
        "year": year,
        "label": fiscal_year_label(year),
        "from": fy_from.isoformat(),
        "to": fy_to.isoformat(),
        "items": items,
        "count": len(items),
        "total": round(sum(item["amount"] for item in items), 2),
        "deferred": deferred,
        "deferred_count": len(deferred),
        "skipped": skipped,
    }


def dashboard() -> dict:
    rows = db.query(
        """
        SELECT i.*, u.name AS owner_name
        FROM investments i
        JOIN users u ON u.id = i.owner_id
        ORDER BY i.current_value DESC
        """
    )
    items = [investment_payload(r) for r in rows]
    invested = round(sum(i["invested_amount"] for i in items), 2)
    current = round(sum(i["display_value"] for i in items), 2)
    gain = round(current - invested, 2)
    gain_pct = round((gain / invested * 100), 2) if invested else 0.0

    categories = []
    for cat in fields.CATEGORIES:
        subset = [i for i in items if i["category"] == cat["key"]]
        cat_invested = round(sum(i["invested_amount"] for i in subset), 2)
        cat_current = round(sum(i["display_value"] for i in subset), 2)
        categories.append({
            "key": cat["key"],
            "label": cat["label"],
            "color": cat["color"],
            "count": len(subset),
            "invested": cat_invested,
            "value": cat_current,
            "gain": round(cat_current - cat_invested, 2),
            "share": round(cat_current / current * 100, 1) if current else 0.0,
        })

    type_rows = {}
    for item in items:
        bucket = type_rows.setdefault(item["type"], {
            "key": item["type"],
            "label": item["type_label"],
            "category": item["category"],
            "color": item["category_color"],
            "count": 0,
            "invested": 0.0,
            "value": 0.0,
        })
        bucket["count"] += 1
        bucket["invested"] += item["invested_amount"]
        bucket["value"] += item["display_value"]
    types = sorted(type_rows.values(), key=lambda t: t["value"], reverse=True)
    for t in types:
        t["invested"] = round(t["invested"], 2)
        t["value"] = round(t["value"], 2)
        t["gain"] = round(t["value"] - t["invested"], 2)
        t["share"] = round(t["value"] / current * 100, 1) if current else 0.0

    owners = {}
    for item in items:
        bucket = owners.setdefault(item["owner_id"], {
            "id": item["owner_id"],
            "name": item["owner"] or "Unassigned",
            "count": 0,
            "invested": 0.0,
            "value": 0.0,
        })
        bucket["count"] += 1
        bucket["invested"] += item["invested_amount"]
        bucket["value"] += item["display_value"]
    owner_rows = sorted(owners.values(), key=lambda o: o["value"], reverse=True)
    for o in owner_rows:
        o["invested"] = round(o["invested"], 2)
        o["value"] = round(o["value"], 2)
        o["gain"] = round(o["value"] - o["invested"], 2)
        o["share"] = round(o["value"] / current * 100, 1) if current else 0.0

    broker_rows = {}
    untagged_broker_count = 0
    for item in items:
        if item["type"] not in ("stocks", "etf"):
            continue
        name = item.get("broker") or ""
        if not name:
            untagged_broker_count += 1
            continue
        bucket = broker_rows.setdefault(name, {
            "name": name,
            "count": 0,
            "invested": 0.0,
            "value": 0.0,
        })
        bucket["count"] += 1
        bucket["invested"] += item["invested_amount"]
        bucket["value"] += item["display_value"]
    broker_list = sorted(broker_rows.values(), key=lambda b: b["value"], reverse=True)
    for b in broker_list:
        b["invested"] = round(b["invested"], 2)
        b["value"] = round(b["value"], 2)
        b["gain"] = round(b["value"] - b["invested"], 2)
        b["share"] = round(b["value"] / current * 100, 1) if current else 0.0

    today = date.today()
    horizon = today + timedelta(days=365)
    maturities = []
    for item in items:
        raw = (item.get("details") or {}).get("maturity_date")
        if not raw:
            continue
        try:
            due = date.fromisoformat(raw)
        except ValueError:
            continue
        if today <= due <= horizon:
            maturities.append({
                "id": item["id"],
                "name": item["name"],
                "type": item["type_label"],
                "type_key": item["type"],
                "issuer": issuer_name(item),
                "category": item["category"],
                "color": item["category_color"],
                "owner": item["owner"],
                "date": raw,
                "days": (due - today).days,
                "value": item["display_value"],
            })
    maturities.sort(key=lambda m: m["date"])

    top_gainers = sorted(items, key=lambda i: i["display_gain"], reverse=True)[:5]
    top_holdings = sorted(items, key=lambda i: i["display_value"], reverse=True)[:6]

    fy_end = current_fiscal_year()
    fy_start = date(fy_end - 1, 4, 1).isoformat()
    fy_finish = date(fy_end, 3, 31).isoformat()
    income_year = db.query_one(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM incomes"
        " WHERE status = 'credited' AND credited_date >= ? AND credited_date <= ?",
        (fy_start, fy_finish),
    )
    pending_credits = db.query_one(
        "SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total FROM incomes WHERE status = 'pending'"
    )

    return {
        "totals": {
            "invested": invested,
            "value": current,
            "gain": gain,
            "gain_pct": gain_pct,
            "count": len(items),
            "owners": len(owner_rows),
            "members": len(member_totals()),
            "income_year": round(float(income_year["total"] or 0), 2),
            "income_year_label": fiscal_year_label(fy_end),
            "pending_credits": int(pending_credits["count"] or 0),
            "pending_credit_amount": round(float(pending_credits["total"] or 0), 2),
        },
        "categories": categories,
        "types": types,
        "owners": owner_rows,
        "brokers": broker_list,
        "untagged_broker_count": untagged_broker_count,
        "top_gainers": [
            {**{k: i[k] for k in ("id", "name", "type", "type_label", "owner", "broker", "invested_amount",
                                  "display_value", "display_gain", "display_gain_pct", "value_note",
                                  "category_color")},
             "symbol": (i.get("details") or {}).get("symbol", ""),
             "issuer": issuer_name(i)}
            for i in top_gainers
        ],
        "top_holdings": [
            {**{k: i[k] for k in ("id", "name", "type", "type_label", "owner", "broker", "display_value",
                                  "display_gain", "display_gain_pct", "value_note", "maturity_date",
                                  "category_color")},
             "symbol": (i.get("details") or {}).get("symbol", ""),
             "issuer": issuer_name(i)}
            for i in top_holdings
        ],
        "maturities": maturities[:8],
    }
