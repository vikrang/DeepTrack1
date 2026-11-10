"""NSE market data: scrip master, bhavcopy ingestion, search and price refresh.

Files are fetched from NSE's public archive or uploaded manually. Both the
current UDiFF bhavcopy and the older ``cm*MMMYYYYbhav.csv`` layout are accepted.
"""

import csv
import io
import json
import re
import zipfile
from datetime import date, datetime, timedelta

import requests

from . import db

NSE_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    "Accept": "text/csv,application/zip,application/octet-stream,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/",
}

EQUITY_LIST_URL = "https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv"
UDIFF_URL = "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_{stamp}_F_0000.csv.zip"
LEGACY_URL = "https://nsearchives.nseindia.com/content/historical/EQUITIES/{year}/{month}/cm{stamp}bhav.csv.zip"

MAX_UNCOMPRESSED = 40 * 1024 * 1024
SEARCH_MIN = 3
STOCK_TYPES = ("stocks", "etf")


class MarketError(Exception):
    """Raised when NSE cannot be reached or returns no usable file."""


# ---------------------------------------------------------------- downloads


def fetch_equity_list() -> bytes:
    try:
        response = requests.get(EQUITY_LIST_URL, headers=NSE_HEADERS, timeout=25)
    except requests.RequestException:
        raise MarketError(
            "Could not reach the NSE archive. Check the internet connection and try again."
        ) from None
    if response.status_code != 200 or not response.content:
        raise MarketError(
            "NSE did not return the equity list. Download EQUITY_L.csv manually and upload it here."
        )
    return response.content


def fetch_bhavcopy(day: date):
    """Return (bytes, filename, actual trade date), walking back recent days."""
    network_error = False
    skipped = []
    for offset in range(0, 11):
        candidate = day - timedelta(days=offset)
        if candidate.weekday() >= 5:
            continue
        skipped.append(candidate)
        stamp = candidate.strftime("%Y%m%d")
        urls = [(UDIFF_URL.format(stamp=stamp), f"BhavCopy_NSE_CM_{stamp}.csv.zip")]
        if offset < 3:
            urls.append((
                LEGACY_URL.format(year=stamp[:4], month=candidate.strftime("%b").upper(), stamp=stamp),
                f"cm{candidate.strftime('%d%b%Y').upper()}bhav.csv.zip",
            ))
        for url, filename in urls:
            try:
                response = requests.get(url, headers=NSE_HEADERS, timeout=25)
            except requests.RequestException:
                network_error = True
                continue
            if response.status_code == 200 and response.content:
                return response.content, filename, candidate
    if network_error and len(skipped) <= 1:
        raise MarketError(
            "Could not reach the NSE archive. Check the internet connection, pick another date, "
            "or upload a bhavcopy you downloaded manually."
        )
    raise MarketError(
        f"NSE has no bhavcopy for {day.isoformat()} or the previous trading days. "
        "Pick an earlier date or upload a file you downloaded manually."
    )


# ---------------------------------------------------------------- parsing


def _decode(data: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", "replace")


def _unzip(data: bytes) -> bytes:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise ValueError("This ZIP file could not be opened.") from None
    for info in archive.infolist():
        if info.is_dir() or not info.filename.lower().endswith(".csv"):
            continue
        if info.file_size > MAX_UNCOMPRESSED:
            raise ValueError("The CSV inside this ZIP is too large to process.")
        return archive.read(info)
    raise ValueError("This ZIP does not contain a CSV file.")


def _header(name: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (name or "").upper())


def _table(data: bytes):
    text = _decode(data)
    if not text.strip():
        raise ValueError("This file is empty.")
    head = text.splitlines()[0]
    try:
        dialect = csv.Sniffer().sniff(head, delimiters=",;|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    keys = {name: _header(name) for name in (reader.fieldnames or []) if name}
    rows = []
    for raw in reader:
        row = {}
        for name, value in raw.items():
            key = keys.get(name)
            if key:
                row[key] = value.strip() if isinstance(value, str) else value
        if any(row.values()):
            rows.append(row)
    return set(keys.values()), rows


def _num(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "").replace("₹", "")
    if not text or text in {"-", "--", "NA", "N/A", "NULL"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _int(value):
    number = _num(value)
    return int(number) if number is not None else None


def _iso_date(value):
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%d-%b-%Y", "%d-%m-%Y", "%d/%m/%Y", "%d%b%Y"):
        try:
            return datetime.strptime(text.upper(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _text(value, limit=160):
    text = str(value or "").strip()
    return text[:limit] or None


# ---------------------------------------------------------------- ingestion


def _upsert_scrip(conn, symbol, name, series, isin, listing_date, face_value, market_lot, ts):
    conn.execute(
        """INSERT INTO scrips (symbol, name, series, isin, listing_date, face_value,
                               market_lot, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(symbol) DO UPDATE SET
               name = CASE WHEN excluded.name IS NOT NULL AND excluded.name <> ''
                           THEN excluded.name ELSE scrips.name END,
               series = COALESCE(excluded.series, scrips.series),
               isin = COALESCE(excluded.isin, scrips.isin),
               listing_date = COALESCE(excluded.listing_date, scrips.listing_date),
               face_value = COALESCE(excluded.face_value, scrips.face_value),
               market_lot = COALESCE(excluded.market_lot, scrips.market_lot),
               updated_at = excluded.updated_at""",
        (symbol, name or symbol, series, isin, listing_date, face_value, market_lot, ts),
    )


def _upsert_price(conn, symbol, trade_date, series, values, ts):
    conn.execute(
        """INSERT INTO market_prices (symbol, trade_date, series, open_price, high_price,
                                      low_price, close_price, prev_close, volume, turnover,
                                      updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(symbol) DO UPDATE SET
               trade_date = excluded.trade_date,
               series = excluded.series,
               open_price = excluded.open_price,
               high_price = excluded.high_price,
               low_price = excluded.low_price,
               close_price = excluded.close_price,
               prev_close = excluded.prev_close,
               volume = excluded.volume,
               turnover = excluded.turnover,
               updated_at = excluded.updated_at
           WHERE excluded.trade_date >= market_prices.trade_date""",
        (
            symbol, trade_date, series, values["open"], values["high"], values["low"],
            values["close"], values["prev_close"], values["volume"], values["turnover"], ts,
        ),
    )


def _set_meta(conn, key, value, ts):
    conn.execute(
        """INSERT INTO market_meta (key, value, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at""",
        (key, str(value), ts),
    )


def _ingest_equity_list(conn, rows, ts):
    seen = 0
    for row in rows:
        symbol = _text(row.get("SYMBOL"), 32)
        if not symbol:
            continue
        symbol = symbol.upper()
        _upsert_scrip(
            conn,
            symbol,
            _text(row.get("NAMEOFCOMPANY"), 200),
            _text(row.get("SERIES"), 8),
            _text(row.get("ISINNUMBER"), 20),
            _iso_date(row.get("DATEOFLISTING")),
            _num(row.get("PAIDUPVALUE")),
            _int(row.get("MARKETLOT")),
            ts,
        )
        seen += 1
    if not seen:
        raise ValueError("No scrips were found in this file. Is it the NSE EQUITY_L.csv file?")
    _set_meta(conn, "equity_list_count", seen, ts)
    _set_meta(conn, "equity_list_updated_at", ts, ts)
    return {"kind": "equity_list", "label": "NSE equity list", "rows": seen, "symbols": seen}


def _ingest_bhavcopy(conn, rows, *, udiff: bool, ts):
    prices = {}
    for row in rows:
        if udiff:
            segment = (row.get("SGMT") or "").upper()
            instrument = (row.get("FININSTRMTP") or "").upper()
            if segment and segment != "CM":
                continue
            if instrument and instrument != "STK":
                continue
            symbol = _text(row.get("TCKRSYMB"), 32)
            trade_date = _iso_date(row.get("TRADDT"))
            series = _text(row.get("SCTYSRS"), 8)
            close = _num(row.get("CLSPRIC"))
            values = {
                "open": _num(row.get("OPNPRIC")),
                "high": _num(row.get("HGHPRIC")),
                "low": _num(row.get("LWPRIC")),
                "close": close,
                "prev_close": _num(row.get("PRVSCLSPRIC")),
                "volume": _int(row.get("TTLTRADGVOL")),
                "turnover": _num(row.get("TTLTRFVAL")),
            }
            name = _text(row.get("FININSTRMNM"), 200)
            isin = _text(row.get("ISIN"), 20)
        else:
            symbol = _text(row.get("SYMBOL"), 32)
            trade_date = _iso_date(row.get("DATE1"))
            series = _text(row.get("SERIES"), 8)
            close = _num(row.get("CLOSEPRICE"))
            turnover = _num(row.get("TURNOVERLACS"))
            values = {
                "open": _num(row.get("OPENPRICE")),
                "high": _num(row.get("HIGHPRICE")),
                "low": _num(row.get("LOWPRICE")),
                "close": close,
                "prev_close": _num(row.get("PREVCLOSE")),
                "volume": _int(row.get("TTLTRDQNTY")),
                "turnover": turnover * 100000 if turnover is not None else None,
            }
            name = None
            isin = None

        if not symbol or not trade_date or close is None or close <= 0:
            continue
        symbol = symbol.upper()
        existing = prices.get(symbol)
        if existing and existing["series"] == "EQ" and series != "EQ":
            continue
        prices[symbol] = {
            "trade_date": trade_date, "series": series, "values": values,
            "name": name, "isin": isin,
        }

    if not prices:
        raise ValueError("No cash-segment equity prices were found in this file.")

    for symbol, entry in prices.items():
        _upsert_scrip(
            conn, symbol, entry["name"], entry["series"], entry["isin"], None, None, None, ts
        )
        _upsert_price(conn, symbol, entry["trade_date"], entry["series"], entry["values"], ts)

    trade_date = max(entry["trade_date"] for entry in prices.values())
    _set_meta(conn, "bhavcopy_trade_date", trade_date, ts)
    _set_meta(conn, "bhavcopy_count", len(prices), ts)
    _set_meta(conn, "bhavcopy_updated_at", ts, ts)
    return {
        "kind": "bhavcopy",
        "label": "NSE bhavcopy",
        "rows": len(prices),
        "symbols": len(prices),
        "trade_date": trade_date,
    }


def ingest(data: bytes, filename: str = "") -> dict:
    """Auto-detect an equity master or bhavcopy file and store it."""
    name = (filename or "").lower()
    if name.endswith(".zip") or data[:2] == b"PK":
        data = _unzip(data)
    headers, rows = _table(data)
    ts = db.now()
    conn = db.get_db()
    try:
        if {"TCKRSYMB", "CLSPRIC"} <= headers:
            result = _ingest_bhavcopy(conn, rows, udiff=True, ts=ts)
        elif "SYMBOL" in headers and ("NAMEOFCOMPANY" in headers or "ISINNUMBER" in headers):
            result = _ingest_equity_list(conn, rows, ts)
        elif {"SYMBOL", "CLOSEPRICE"} <= headers:
            result = _ingest_bhavcopy(conn, rows, udiff=False, ts=ts)
        else:
            raise ValueError(
                "This file is not an NSE EQUITY_L.csv or bhavcopy. Download it from NSE "
                "using the buttons above, or pick the original .csv/.zip file."
            )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    result["filename"] = filename
    return result


# ---------------------------------------------------------------- queries


def _like(text: str) -> str:
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def search(term: str, limit: int = 20) -> list[dict]:
    term = (term or "").strip()
    if len(term) < SEARCH_MIN:
        return []
    needle = _like(term.upper())
    rows = db.query(
        """SELECT s.symbol, s.name, s.series, s.isin,
                  p.close_price AS ltp, p.trade_date
           FROM scrips s
           LEFT JOIN market_prices p ON p.symbol = s.symbol
           WHERE s.symbol LIKE ? ESCAPE '\\' OR s.name LIKE ? ESCAPE '\\'
           ORDER BY
               CASE WHEN s.symbol = ? THEN 0
                    WHEN s.symbol LIKE ? ESCAPE '\\' THEN 1
                    ELSE 2 END,
               CASE WHEN s.series = 'EQ' THEN 0 ELSE 1 END,
               s.symbol
           LIMIT ?""",
        (needle + "%", "%" + needle + "%", term.upper(), needle + "%", limit),
    )
    return [
        {
            "symbol": r["symbol"],
            "name": r["name"] or r["symbol"],
            "series": r["series"] or "",
            "isin": r["isin"] or "",
            "ltp": round(r["ltp"], 2) if r["ltp"] is not None else None,
            "trade_date": r["trade_date"],
        }
        for r in rows
    ]


def _meta_value(key):
    row = db.query_one("SELECT value, updated_at FROM market_meta WHERE key = ?", (key,))
    if row is None:
        return None, None
    return row["value"], row["updated_at"]


def status() -> dict:
    scrip_count = db.query_one("SELECT COUNT(*) AS c FROM scrips")["c"]
    price_row = db.query_one(
        "SELECT COUNT(*) AS c, MAX(trade_date) AS d, MAX(updated_at) AS u FROM market_prices"
    )
    _, equity_updated = _meta_value("equity_list_updated_at")
    _, bhav_updated = _meta_value("bhavcopy_updated_at")

    holdings = db.query("SELECT type, details FROM investments WHERE type IN ('stocks', 'etf')")
    symbols = {
        r["symbol"] for r in db.query("SELECT symbol FROM market_prices")
    }
    matched = 0
    for row in holdings:
        try:
            details = json.loads(row["details"] or "{}")
        except (TypeError, ValueError):
            continue
        symbol = str(details.get("symbol") or "").strip().upper()
        if symbol and symbol in symbols:
            matched += 1

    return {
        "scrips": scrip_count,
        "prices": price_row["c"],
        "trade_date": price_row["d"],
        "prices_updated_at": price_row["u"],
        "equity_list_updated_at": equity_updated,
        "bhavcopy_updated_at": bhav_updated,
        "holdings": len(holdings),
        "matched": matched,
    }


def _as_number(value):
    if isinstance(value, (int, float)):
        return float(value)
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace(",", ""))
    except ValueError:
        return None


def refresh_prices() -> dict:
    """Apply stored closes to stock and ETF holdings, recomputing current value."""
    quotes = {r["symbol"]: r for r in db.query("SELECT * FROM market_prices")}
    rows = db.query("SELECT id, type, name, details FROM investments WHERE type IN ('stocks', 'etf')")
    updated = price_only = skipped = 0
    used_dates = []
    missing = []
    conn = db.get_db()
    now = db.now()
    for row in rows:
        try:
            details = json.loads(row["details"] or "{}")
        except (TypeError, ValueError):
            details = {}
        symbol = str(details.get("symbol") or "").strip().upper()
        quote = quotes.get(symbol)
        if quote is None:
            skipped += 1
            if symbol:
                missing.append(symbol)
            continue
        close = float(quote["close_price"])
        if row["type"] == "stocks":
            quantity = _as_number(details.get("quantity"))
            details["ltp"] = round(close, 2)
        else:
            quantity = _as_number(details.get("units"))
            details["current_price"] = round(close, 2)

        if quantity is None:
            price_only += 1
            conn.execute(
                "UPDATE investments SET details = ?, updated_at = ? WHERE id = ?",
                (json.dumps(details, ensure_ascii=False), now, row["id"]),
            )
            continue
        conn.execute(
            "UPDATE investments SET details = ?, current_value = ?, updated_at = ? WHERE id = ?",
            (json.dumps(details, ensure_ascii=False), round(quantity * close, 2), now, row["id"]),
        )
        updated += 1
        used_dates.append(quote["trade_date"])
    conn.commit()
    return {
        "updated": updated,
        "price_only": price_only,
        "skipped": skipped,
        "missing_symbols": sorted(set(missing))[:12],
        "trade_date": max(used_dates) if used_dates else None,
    }
