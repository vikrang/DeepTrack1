"""Read models shared by the JSON API: serialisation and dashboard maths."""

import json
from datetime import date, timedelta

from . import db, fields
from .validators import mask_aadhaar, mask_account, mask_pan

CATEGORY_MAP = {c["key"]: c for c in fields.CATEGORIES}


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
        o["share"] = round(o["value"] / current * 100, 1) if current else 0.0

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

    return {
        "totals": {
            "invested": invested,
            "value": current,
            "gain": gain,
            "gain_pct": gain_pct,
            "count": len(items),
            "owners": len(owner_rows),
            "members": len(member_totals()),
        },
        "categories": categories,
        "types": types,
        "owners": owner_rows,
        "top_gainers": [
            {k: i[k] for k in ("id", "name", "type_label", "owner", "invested_amount",
                               "current_value", "gain", "gain_pct", "category_color")}
            for i in top_gainers
        ],
        "top_holdings": [
            {k: i[k] for k in ("id", "name", "type_label", "owner", "current_value",
                               "gain", "gain_pct", "category_color")}
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
