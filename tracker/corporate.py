"""Dividend, bonus and split actions fetched from NSE (Yahoo fallback).

NSE's corporate-actions API is the primary source: one request covers every
listed symbol and subjects carry both dividend amounts and bonus ratios. Yahoo's
chart events act as a fallback when NSE blocks or throttles the request.
"""

import json
import re
import threading
import time
from datetime import date, datetime, timedelta, timezone
from urllib.parse import quote

import requests

from . import db
from .services import fiscal_year_label
from .validators import parse_number

NSE_HOME = "https://www.nseindia.com/"
NSE_ACTIONS = "https://www.nseindia.com/api/corporates-corporateActions"
YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"

NSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-IN,en;q=0.9",
    "Referer": "https://www.nseindia.com/companies-listing/corporate-filings-actions",
}
YAHOO_HEADERS = {"User-Agent": NSE_HEADERS["User-Agent"], "Accept": "application/json"}

CACHE_SECONDS = 20 * 60
_cache: dict[tuple[str, str], tuple[float, object]] = {}
_cache_lock = threading.Lock()

_DIV_RS_RE = re.compile(r"(?:rs|re)\.?\s*([0-9]+(?:\.[0-9]+)?)", re.I)
_DIV_ALL_RE = re.compile(
    r"(?:rs|re)\.?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:/-)?\s*(?:per|each)\s+share", re.I
)
_DIV_SHARE_RE = re.compile(
    r"(?<!%)([0-9]+(?:\.[0-9]+)?)\s*(?:/-)?\s*(?:per|each)\s+share", re.I
)
_BONUS_RE = re.compile(
    r"bonus(?:\s+issue)?(?:\s+of)?\s+([0-9]+(?:\.[0-9]+)?)\s*[:/]\s*([0-9]+(?:\.[0-9]+)?)",
    re.I,
)
_SPLIT_RE = re.compile(
    r"from\s*(?:rs|re)?\.?\s*([0-9]+(?:\.[0-9]+)?)[^\d]{0,28}to\s*(?:rs|re)?\.?\s*([0-9]+(?:\.[0-9]+)?)",
    re.I | re.S,
)


class CorporateError(RuntimeError):
    pass


def _cached(key: tuple[str, str]):
    with _cache_lock:
        hit = _cache.get(key)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    return None


def _remember(key: tuple[str, str], value) -> object:
    with _cache_lock:
        _cache[key] = (time.time(), value)
    return value


def _parse_iso(value) -> date | None:
    text = str(value or "").strip()[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


def _parse_nse_date(value) -> date | None:
    text = str(value or "").strip()
    for fmt in ("%d-%b-%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def parse_action(subject: str, ex_date: date) -> dict | None:
    """Turn an NSE subject line into a dividend or bonus descriptor."""
    text = " ".join(str(subject or "").split())
    upper = text.upper()
    if not text:
        return None

    if "BONUS" in upper:
        match = _BONUS_RE.search(text)
        if match:
            new, old = float(match.group(1)), float(match.group(2))
            if new > 0 and old > 0:
                return {
                    "kind": "bonus",
                    "multiplier": 1 + new / old,
                    "detail": f"Bonus {match.group(1)}:{match.group(2)}",
                    "label": f"Bonus {match.group(1)}:{match.group(2)}",
                }
        return None

    if (
        "SPLIT" in upper
        or "SUB-DIVISION" in upper
        or "SUB DIVISION" in upper
        or "CONSOLIDATION" in upper
    ):
        match = _SPLIT_RE.search(text)
        if match:
            old, new = float(match.group(1)), float(match.group(2))
            if old > 0 and new > 0 and old != new:
                kind = "bonus"
                label = f"Split FV {old:g} to {new:g}"
                if new > old:
                    label = f"Consolidation FV {old:g} to {new:g}"
                return {
                    "kind": kind,
                    "multiplier": old / new,
                    "detail": f"FV {old:g} to {new:g}",
                    "label": label,
                }
        return None

    if "DIVIDEND" in upper or "DISTRIBUTION" in upper:
        amounts = [float(value) for value in _DIV_ALL_RE.findall(text)]
        if not amounts:
            match = _DIV_RS_RE.search(text) or _DIV_SHARE_RE.search(text)
            amounts = [float(match.group(1))] if match else []
        amount = round(sum(value for value in amounts if value > 0), 4)
        if amount > 0:
            return {
                "kind": "dividend",
                "amount": amount,
                "detail": f"Rs {amount:g} per share",
                "label": f"Dividend Rs {amount:g}/share",
            }
    return None


def _nse_actions(start: date, end: date) -> list[dict]:
    key = ("nse", f"{start.isoformat()}:{end.isoformat()}")
    hit = _cached(key)
    if hit is not None:
        return hit

    session = requests.Session()
    session.headers.update(NSE_HEADERS)
    try:
        session.get(NSE_HOME, timeout=12)
    except requests.RequestException:
        pass
    try:
        response = session.get(
            NSE_ACTIONS,
            params={
                "index": "equities",
                "from_date": start.strftime("%d-%m-%Y"),
                "to_date": end.strftime("%d-%m-%Y"),
            },
            timeout=30,
        )
    except requests.RequestException as exc:
        raise CorporateError(f"NSE request failed ({exc.__class__.__name__})") from exc
    if response.status_code != 200:
        raise CorporateError(f"NSE returned HTTP {response.status_code}")
    try:
        payload = response.json()
    except ValueError as exc:
        raise CorporateError("NSE returned an unexpected response") from exc
    if not isinstance(payload, list):
        raise CorporateError("NSE returned no action list")
    _remember(key, payload)
    return payload


def _yahoo_range(years: int) -> str:
    if years <= 1:
        return "1y"
    if years <= 3:
        return "3y"
    if years <= 5:
        return "5y"
    return "10y"


def _yahoo_actions(symbol: str, years: int, start: date, end: date) -> list[dict]:
    ticker = quote(f"{symbol}.NS", safe="")
    try:
        response = requests.get(
            YAHOO_CHART.format(ticker=ticker),
            params={"range": _yahoo_range(years), "interval": "1d", "events": "div,splits"},
            headers=YAHOO_HEADERS,
            timeout=15,
        )
    except requests.RequestException as exc:
        raise CorporateError(f"Yahoo request failed ({exc.__class__.__name__})") from exc
    if response.status_code != 200:
        raise CorporateError(f"Yahoo returned HTTP {response.status_code}")
    try:
        result = (response.json().get("chart") or {}).get("result") or []
        events = (result[0] if result else {}).get("events") or {}
    except (ValueError, AttributeError, IndexError) as exc:
        raise CorporateError("Yahoo returned an unexpected response") from exc

    actions = []
    for item in (events.get("dividends") or {}).values():
        try:
            stamp = datetime.fromtimestamp(int(item["date"]), tz=timezone.utc).date()
            amount = float(item.get("amount") or 0)
        except (KeyError, TypeError, ValueError):
            continue
        if start <= stamp <= end and amount > 0:
            actions.append(_action("dividend", stamp, f"Rs {amount:g} per share",
                                   f"Dividend Rs {amount:g}/share", amount=amount, source="Yahoo"))

    for item in (events.get("splits") or {}).values():
        try:
            stamp = datetime.fromtimestamp(int(item["date"]), tz=timezone.utc).date()
        except (KeyError, TypeError, ValueError):
            continue
        if not (start <= stamp <= end):
            continue
        ratio = None
        try:
            numerator = float(item.get("numerator") or 0)
            denominator = float(item.get("denominator") or 0)
            if numerator > 0 and denominator > 0:
                ratio = numerator / denominator
        except (TypeError, ValueError):
            ratio = None
        if ratio is None:
            text = str(item.get("splitRatio") or "")
            parts = re.split(r"[:/]", text)
            try:
                ratio = float(parts[0]) / float(parts[1])
            except (IndexError, ValueError, ZeroDivisionError):
                ratio = None
        if ratio and ratio != 1:
            label = f"Split / bonus x{ratio:g}"
            actions.append(_action("bonus", stamp, f"Quantity x{ratio:g}", label,
                                   multiplier=ratio, source="Yahoo"))
    return actions


def _action(kind, ex_date, detail, label, amount=None, multiplier=None, source="NSE") -> dict:
    return {
        "kind": kind,
        "ex_date": ex_date.isoformat(),
        "detail": detail,
        "label": label,
        "amount": amount,
        "multiplier": round(multiplier, 6) if multiplier else None,
        "source": source,
    }


def _holdings() -> list[dict]:
    rows = db.query(
        """
        SELECT i.id, i.type, i.name, i.start_date, i.details, i.owner_id,
               u.name AS owner_name
        FROM investments i
        JOIN users u ON u.id = i.owner_id
        WHERE i.type IN ('stocks', 'etf')
        ORDER BY i.name COLLATE NOCASE
        """
    )
    result = []
    for row in rows:
        try:
            details = json.loads(row["details"] or "{}")
        except (TypeError, ValueError):
            details = {}
        symbol = str(details.get("symbol") or "").strip().upper()
        if not symbol:
            continue
        result.append({
            "id": row["id"],
            "type": row["type"],
            "name": row["name"],
            "symbol": symbol,
            "owner_id": row["owner_id"],
            "owner": row["owner_name"],
            "start_date": row["start_date"],
            "details": details,
        })
    return result


def _fetch_window(symbols: set[str], start: date, end: date, years: int):
    """NSE first; fill gaps from Yahoo. Returns (actions, errors)."""
    errors = []
    by_symbol: dict[str, list[dict]] = {}
    try:
        rows = _nse_actions(start, end)
        for row in rows:
            symbol = str(row.get("symbol") or "").strip().upper()
            if symbol not in symbols:
                continue
            ex_date = _parse_nse_date(row.get("exDate"))
            if not ex_date or not (start <= ex_date <= end):
                continue
            parsed = parse_action(row.get("subject"), ex_date)
            if not parsed:
                continue
            by_symbol.setdefault(symbol, []).append(
                _action(ex_date=ex_date, source="NSE", **parsed)
            )
    except CorporateError as exc:
        errors.append(str(exc))

    missing = sorted(symbols - set(by_symbol))
    for symbol in missing:
        try:
            found = _yahoo_actions(symbol, years, start, end)
        except CorporateError as exc:
            if len(errors) < 4:
                errors.append(f"{symbol}: {exc}")
            continue
        if found:
            by_symbol[symbol] = found

    for actions in by_symbol.values():
        actions.sort(key=lambda a: a["ex_date"], reverse=True)
    return by_symbol, errors


def fiscal_year_window(fy: int | None = None, span: int = 1,
                       today: date | None = None) -> tuple[date, date, int, int]:
    """Indian financial-year fetch window: 1 April to 31 March, labelled by the closing year."""
    today = today or date.today()
    end_fy = int(fy) if fy else today.year + (1 if today.month >= 4 else 0)
    span = max(1, min(int(span or 1), 10))
    start = date(end_fy - span, 4, 1)
    end = min(date(end_fy, 3, 31), today)
    return start, end, end_fy, span


def fiscal_window_label(end_fy: int, span: int) -> str:
    if span == 1:
        return fiscal_year_label(end_fy)
    return f"{fiscal_year_label(end_fy - span + 1)} to {fiscal_year_label(end_fy)}"


def collect(fy: int | None = None, span: int = 1) -> dict:
    today = date.today()
    start, end, end_fy, span = fiscal_year_window(fy, span, today)
    label = fiscal_window_label(end_fy, span)
    history_years = max(1, -(-(today - start).days // 365))
    window = {"fy": end_fy, "span": span, "label": label,
              "from": start.isoformat(), "to": end.isoformat()}
    holdings = _holdings()
    if not holdings:
        return {
            "items": [],
            "count": 0,
            "message": "Add at least one stock or ETF holding with a symbol to fetch corporate actions.",
            "window": window,
            "errors": [],
        }

    symbols = {h["symbol"] for h in holdings}
    by_symbol, errors = _fetch_window(symbols, start, end, history_years)
    applied_rows = db.query("SELECT investment_id, kind, ex_date, detail FROM corporate_actions")
    applied = {
        (row["investment_id"], row["kind"], row["ex_date"], row["detail"]) for row in applied_rows
    }

    items = []
    skipped_quantity = 0
    for holding in holdings:
        details = holding["details"]
        qty_key = "quantity" if holding["type"] == "stocks" else "units"
        quantity = parse_number(details.get(qty_key), 0) or 0
        started = holding["start_date"]
        for action in by_symbol.get(holding["symbol"], []):
            ex_date = _parse_iso(action["ex_date"])
            if ex_date is None or ex_date > today:
                continue
            if started and action["ex_date"] < started:
                continue
            key = (holding["id"], action["kind"], action["ex_date"], action["detail"])
            if key in applied:
                continue
            if quantity <= 0:
                skipped_quantity += 1
                continue
            item = {
                "investment_id": holding["id"],
                "investment": holding["name"],
                "owner_id": holding["owner_id"],
                "owner": holding["owner"],
                "type": holding["type"],
                "symbol": holding["symbol"],
                "quantity": quantity,
                "kind": action["kind"],
                "ex_date": action["ex_date"],
                "detail": action["detail"],
                "label": action["label"],
                "amount": action.get("amount"),
                "multiplier": action.get("multiplier"),
                "source": action.get("source") or "NSE",
            }
            if action["kind"] == "dividend":
                item["effect"] = round(quantity * float(action.get("amount") or 0), 2)
                item["new_quantity"] = None
            else:
                item["effect"] = None
                item["new_quantity"] = round(quantity * float(action.get("multiplier") or 1), 4)
            items.append(item)

    items.sort(key=lambda item: (item["ex_date"], item["investment"]), reverse=True)
    dividends = [item for item in items if item["kind"] == "dividend"]
    bonuses = [item for item in items if item["kind"] == "bonus"]
    message = ""
    if not items:
        message = "No new dividend or bonus actions found for your holdings in this window."
        if skipped_quantity:
            message += f" {skipped_quantity} action(s) were skipped because quantity is zero."
    return {
        "items": items[:300],
        "count": len(items),
        "truncated": len(items) > 300,
        "dividend_count": len(dividends),
        "dividend_amount": round(sum(item["effect"] or 0 for item in dividends), 2),
        "bonus_count": len(bonuses),
        "message": message,
        "window": window,
        "errors": errors[:6],
    }


def apply_selected(items, actor) -> dict:
    if not isinstance(items, list) or not items:
        raise ValueError("Select at least one action to apply")

    today = date.today()
    cleaned = []
    for raw in items:
        if not isinstance(raw, dict):
            continue
        try:
            investment_id = int(raw.get("investment_id"))
        except (TypeError, ValueError):
            continue
        kind = str(raw.get("kind") or "")
        ex_date = _parse_iso(raw.get("ex_date"))
        detail = " ".join(str(raw.get("detail") or "").split())[:120]
        if kind not in {"dividend", "bonus"} or ex_date is None or ex_date > today or not detail:
            continue
        try:
            amount = float(raw.get("amount") or 0)
            multiplier = float(raw.get("multiplier") or 0)
        except (TypeError, ValueError):
            continue
        if kind == "dividend" and amount <= 0:
            continue
        if kind == "bonus" and (multiplier <= 0 or multiplier == 1):
            continue
        cleaned.append({
            "investment_id": investment_id,
            "kind": kind,
            "ex_date": ex_date,
            "detail": detail,
            "amount": amount,
            "multiplier": multiplier,
            "source": str(raw.get("source") or "NSE")[:20],
        })

    if not cleaned:
        raise ValueError("Those actions are incomplete or not yet effective")

    cleaned.sort(key=lambda item: (item["investment_id"], item["ex_date"]))
    conn = db.get_db()
    stamp = db.now()
    dividends = 0
    bonuses = 0
    dividend_total = 0.0
    skipped = 0
    for item in cleaned:
        row = db.query_one(
            """
            SELECT i.*, u.name AS owner_name FROM investments i
            JOIN users u ON u.id = i.owner_id WHERE i.id = ?
            """,
            (item["investment_id"],),
        )
        if row is None or row["type"] not in {"stocks", "etf"}:
            skipped += 1
            continue
        try:
            details = json.loads(row["details"] or "{}")
        except (TypeError, ValueError):
            details = {}
        qty_key = "quantity" if row["type"] == "stocks" else "units"
        quantity = parse_number(details.get(qty_key), 0) or 0
        if quantity <= 0:
            skipped += 1
            continue

        duplicate = db.query_one(
            "SELECT id FROM corporate_actions WHERE investment_id = ? AND kind = ? AND ex_date = ? AND detail = ?",
            (item["investment_id"], item["kind"], item["ex_date"].isoformat(), item["detail"]),
        )
        if duplicate:
            skipped += 1
            continue

        if item["kind"] == "dividend":
            amount = round(quantity * item["amount"], 2)
            if amount <= 0:
                skipped += 1
                continue
            due = item["ex_date"] + timedelta(days=30)
            source_ref = f"corp:{item['investment_id']}:dividend:{item['ex_date'].isoformat()}:{item['detail']}"
            exists = db.query_one("SELECT id FROM incomes WHERE source_ref = ?", (source_ref,))
            if exists:
                skipped += 1
                continue
            notes = (
                f"Ex-date {item['ex_date'].isoformat()} - Rs {item['amount']:g} per share "
                f"on {quantity:g} shares"
            )
            cursor = conn.execute(
                "INSERT INTO incomes (investment_id, owner_id, kind, amount, status, due_date,"
                " credited_date, source, source_ref, notes, created_by, created_at, updated_at)"
                " VALUES (?, ?, 'dividend', ?, 'pending', ?, NULL, ?, ?, ?, ?, ?, ?)",
                (
                    item["investment_id"], row["owner_id"], amount, due.isoformat(),
                    item["source"], source_ref, notes, actor["id"], stamp, stamp,
                ),
            )
            income_id = cursor.lastrowid
            conn.execute(
                "INSERT INTO corporate_actions (investment_id, symbol, kind, ex_date, detail,"
                " value, source, income_id, applied_by, applied_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    item["investment_id"], details.get("symbol"), item["kind"],
                    item["ex_date"].isoformat(), item["detail"], item["amount"],
                    item["source"], income_id, actor["id"], stamp,
                ),
            )
            dividends += 1
            dividend_total += amount
        else:
            new_quantity = round(quantity * item["multiplier"], 4)
            if new_quantity <= 0:
                skipped += 1
                continue
            details[qty_key] = new_quantity
            for avg_key in ("avg_buy_price", "avg_price"):
                avg = parse_number(details.get(avg_key), None)
                if avg and avg > 0:
                    details[avg_key] = round(avg / item["multiplier"], 4)
                    break
            price_key = "ltp" if row["type"] == "stocks" else "current_price"
            price = parse_number(details.get(price_key), None)
            if price and price > 0:
                details[price_key] = round(price / item["multiplier"], 4)
            history = details.get("corporate_history")
            if not isinstance(history, list):
                history = []
            history.append({
                "kind": "bonus",
                "ex_date": item["ex_date"].isoformat(),
                "detail": item["detail"],
                "multiplier": item["multiplier"],
                "from_quantity": quantity,
                "to_quantity": new_quantity,
            })
            details["corporate_history"] = history[-40:]
            conn.execute(
                "UPDATE investments SET details = ?, updated_at = ? WHERE id = ?",
                (json.dumps(details, ensure_ascii=False), stamp, item["investment_id"]),
            )
            conn.execute(
                "INSERT INTO corporate_actions (investment_id, symbol, kind, ex_date, detail,"
                " value, source, income_id, applied_by, applied_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)",
                (
                    item["investment_id"], details.get("symbol"), item["kind"],
                    item["ex_date"].isoformat(), item["detail"], item["multiplier"],
                    item["source"], actor["id"], stamp,
                ),
            )
            bonuses += 1

    conn.commit()
    applied = dividends + bonuses
    if applied:
        parts = []
        if dividends:
            parts.append(f"{dividends} dividend(s) worth Rs {dividend_total:,.2f}")
        if bonuses:
            parts.append(f"{bonuses} bonus/split action(s)")
        db.log_activity(actor["id"], "apply", "Applied " + " and ".join(parts), "corporate_action")
    return {
        "applied": applied,
        "dividends": dividends,
        "dividend_amount": round(dividend_total, 2),
        "bonuses": bonuses,
        "skipped": skipped,
    }
