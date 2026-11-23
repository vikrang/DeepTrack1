"""Read models shared by the JSON API: serialisation and dashboard maths."""

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
               u.created_at, u.is_active,
               COUNT(i.id) AS holdings,
               COALESCE(SUM(i.invested_amount), 0) AS invested,
               COALESCE(SUM(i.current_value), 0) AS value
        FROM users u
        LEFT JOIN investments i ON i.owner_id = u.id
        WHERE u.is_active = 1
        GROUP BY u.id
        ORDER BY u.name COLLATE NOCASE
        """
    )
    return [dict(r) for r in rows]


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

    return {
        "year": year,
        "year_label": fiscal_year_label(year),
        "years": [{"year": value, "label": fiscal_year_label(value)} for value in years],
        "items": items,
        "checklist": checklist,
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
    current = round(sum(i["current_value"] for i in items), 2)
    gain = round(current - invested, 2)
    gain_pct = round((gain / invested * 100), 2) if invested else 0.0

    categories = []
    for cat in fields.CATEGORIES:
        subset = [i for i in items if i["category"] == cat["key"]]
        cat_invested = round(sum(i["invested_amount"] for i in subset), 2)
        cat_current = round(sum(i["current_value"] for i in subset), 2)
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
        bucket["value"] += item["current_value"]
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
        bucket["value"] += item["current_value"]
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
        bucket["value"] += item["current_value"]
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
                "value": item["current_value"],
            })
    maturities.sort(key=lambda m: m["date"])

    activity_rows = db.query(
        """
        SELECT a.*, u.name AS user_name
        FROM activity a LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.id DESC LIMIT 8
        """
    )

    top_gainers = sorted(items, key=lambda i: i["gain"], reverse=True)[:5]
    top_holdings = sorted(items, key=lambda i: i["current_value"], reverse=True)[:6]

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
                                  "current_value", "gain", "gain_pct", "category_color")},
             "symbol": (i.get("details") or {}).get("symbol", ""),
             "issuer": issuer_name(i)}
            for i in top_gainers
        ],
        "top_holdings": [
            {**{k: i[k] for k in ("id", "name", "type", "type_label", "owner", "broker", "current_value",
                                  "gain", "gain_pct", "category_color")},
             "symbol": (i.get("details") or {}).get("symbol", ""),
             "issuer": issuer_name(i)}
            for i in top_holdings
        ],
        "maturities": maturities[:8],
        "activity": [
            {
                "id": r["id"],
                "user": r["user_name"] or "Someone",
                "action": r["action"],
                "summary": r["summary"],
                "created_at": r["created_at"],
            }
            for r in activity_rows
        ],
    }
