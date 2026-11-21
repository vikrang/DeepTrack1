"""NSE market data: scrip master, bhavcopy ingestion, search and price refresh.

Data is pulled straight from NSE's public archive (see ``sync_nse``) so nothing
has to be uploaded by hand, though a manual upload stays available as a fallback.
The bhavcopy keeps the whole cash-market segment — equity shares, ETFs and other
listed cash-market products — and both the current UDiFF layout and the older
``cm*MMMYYYYbhav.csv`` layout are accepted.

Mutual fund schemes come from AMFI's daily NAV file (see ``sync_schemes``). Each
row is one plan/option variant of a scheme (Direct/Regular, Growth/IDCW), which
is what lets the form offer a drill-down after a name search.
"""

import csv
import io
import json
import re
import zipfile
from datetime import date, datetime, timedelta, timezone

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
NAV_ALL_URL = "https://www.amfiindia.com/spages/NAVAll.txt"

MAX_UNCOMPRESSED = 40 * 1024 * 1024
SEARCH_MIN = 3
STOCK_TYPES = ("stocks", "etf")
CASH_SEGMENT = "CM"
# Startup auto-sync treats the stored prices as stale once they are this old.
STALE_HOURS = 12
SCHEME_STALE_HOURS = 20


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
            # Keep the whole cash-market segment so equity shares (STK), ETFs and
            # any other listed cash-market products are all captured. Derivatives,
            # currency and commodity segments (FO, CD, COM) are skipped.
            segment = (row.get("SGMT") or "").upper()
            if segment and segment != CASH_SEGMENT:
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


# NSE abbreviates issuer names ("NIP IND ETF NIFTY BEES"), so the search expands
# the common tokens before matching; otherwise "Nippon" finds nothing.
_SCRIP_ALIASES = {
    "NIP": "NIPPON", "NIPPONAMC": "NIPPON", "IND": "INDIA",
    "NIF": "NIFTY", "NXT": "NEXT",
    "BIRLASLAMC": "BIRLA SUN LIFE", "ADITYBIRLA": "ADITYA BIRLA",
    "ICICIPRAMC": "ICICI PRUDENTIAL", "ICICIPRUD": "ICICI PRUDENTIAL",
    "DSPAMC": "DSP", "EDELAMC": "EDELWEISS", "AXISAMC": "AXIS",
    "KOTAKMAMC": "KOTAK", "MIRAEAMC": "MIRAE", "MOTILALAMC": "MOTILAL OSWAL",
    "HSBCAMC": "HSBC", "UTIAMC": "UTI", "SBIAMC": "SBI", "SBIMFTCP": "SBI",
    "BFAM": "BAJAJ FINSERV", "BARODABNP": "BARODA BNP", "TATAAMC": "TATA",
    "INVESCOAMC": "INVESCO", "GROWWAMC": "GROWW",
}

_WORD_SPLIT = re.compile(r"[A-Z0-9]+")


def _scrip_words(text: str) -> list[str]:
    words = []
    for word in _WORD_SPLIT.findall((text or "").upper()):
        words.extend(_SCRIP_ALIASES.get(word, word).split())
    return words


def search(term: str, limit: int = 20) -> list[dict]:
    """Search NSE scrips by symbol or name, ignoring abbreviation differences.

    Every query word must appear in the symbol/name (after alias expansion), so
    "nippon nifty" finds NIP IND ETF NIFTY BEES even though neither stored field
    spells out "Nippon".
    """
    term = (term or "").strip()
    if len(term) < SEARCH_MIN:
        return []
    tokens = _scrip_words(term)
    if not tokens:
        return []
    compact = "".join(tokens)
    rows = db.query(
        """SELECT s.symbol, s.name, s.series, s.isin,
                  p.close_price AS ltp, p.trade_date
           FROM scrips s
           LEFT JOIN market_prices p ON p.symbol = s.symbol"""
    )
    ranked = []
    for row in rows:
        haystack = " ".join(_scrip_words(f"{row['symbol']} {row['name']}"))
        if not all(token in haystack for token in tokens):
            continue
        symbol = row["symbol"]
        if symbol == term.upper():
            score = 0
        elif symbol.startswith(compact):
            score = 1
        elif symbol.startswith(term.upper()):
            score = 1
        else:
            score = 2
        ranked.append((score, 0 if row["series"] == "EQ" else 1, symbol, row))
    ranked.sort(key=lambda item: item[:3])
    return [
        {
            "symbol": row["symbol"],
            "name": row["name"] or row["symbol"],
            "series": row["series"] or "",
            "isin": row["isin"] or "",
            "ltp": round(row["ltp"], 2) if row["ltp"] is not None else None,
            "trade_date": row["trade_date"],
        }
        for *_rest, row in ranked[:limit]
    ]


def _meta_value(key):
    row = db.query_one("SELECT value, updated_at FROM market_meta WHERE key = ?", (key,))
    if row is None:
        return None, None
    return row["value"], row["updated_at"]


# ---------------------------------------------------------------- MF schemes


_AMC_ALIASES = {
    "sbi mutual fund": "SBI Mutual Fund",
    "hdfc mutual fund": "HDFC Mutual Fund",
    "icici prudential mutual fund": "ICICI Prudential MF",
    "nippon india mutual fund": "Nippon India MF",
    "axis mutual fund": "Axis Mutual Fund",
    "kotak mahindra mutual fund": "Kotak Mahindra MF",
    "uti mutual fund": "UTI Mutual Fund",
    "aditya birla sun life mutual fund": "Aditya Birla Sun Life MF",
    "mirae asset mutual fund": "Mirae Asset MF",
    "ppfas mutual fund": "Parag Parikh MF",
    "parag parikh mutual fund": "Parag Parikh MF",
    "quant mutual fund": "Quant MF",
    "dsp mutual fund": "DSP MF",
    "franklin templeton mutual fund": "Franklin Templeton MF",
    "tata mutual fund": "Tata MF",
    "motilal oswal mutual fund": "Motilal Oswal MF",
    "edelweiss mutual fund": "Edelweiss MF",
    "invesco mutual fund": "Invesco MF",
    "hsbc mutual fund": "HSBC MF",
    "bandhan mutual fund": "Bandhan MF",
    "sundaram mutual fund": "Sundaram MF",
    "navi mutual fund": "Navi MF",
    "whiteoak capital mutual fund": "WhiteOak MF",
    "whiteoak mutual fund": "WhiteOak MF",
}

_MF_CATEGORY_RULES = [
    ("flexi cap", "Flexi Cap"), ("multi cap", "Multi Cap"), ("large & mid", "Other"),
    ("large cap", "Large Cap"), ("mid cap", "Mid Cap"), ("small cap", "Small Cap"),
    ("elss", "ELSS (Tax Saving)"), ("tax saving", "ELSS (Tax Saving)"),
    ("index", "Index Fund"),
    ("sectoral", "Sectoral / Thematic"), ("thematic", "Sectoral / Thematic"),
    ("balanced advantage", "Balanced Advantage"),
    ("aggressive hybrid", "Aggressive Hybrid"), ("conservative hybrid", "Conservative Hybrid"),
    ("arbitrage", "Arbitrage"), ("liquid", "Liquid"), ("overnight", "Overnight"),
    ("ultra short", "Ultra Short Duration"), ("corporate bond", "Corporate Bond"),
    ("credit risk", "Credit Risk"), ("gilt", "Gilt"), ("gold", "Gold"),
    ("international", "International / Fund of Funds"),
    ("fund of funds", "International / Fund of Funds"), ("focused", "Focused Fund"),
]

_VARIANT_ORDER = {("Direct", "Growth"): 0, ("Direct", "IDCW - Payout"): 1,
                  ("Direct", "IDCW - Reinvestment"): 2, ("Regular", "Growth"): 3,
                  ("Regular", "IDCW - Payout"): 4, ("Regular", "IDCW - Reinvestment"): 5}


def fetch_nav_all() -> bytes:
    try:
        response = requests.get(NAV_ALL_URL, headers=NSE_HEADERS, timeout=40)
    except requests.RequestException:
        raise MarketError(
            "Could not reach AMFI. Check the internet connection and try again."
        ) from None
    if response.status_code != 200 or not response.content:
        raise MarketError("AMFI did not return the scheme NAV file. Try again later.")
    return response.content


def _mf_plan(value: str) -> str:
    text = (value or "").strip().lower()
    if text.startswith("direct"):
        return "Direct"
    if text.startswith("regular"):
        return "Regular"
    return ""


def _mf_option(value: str) -> str:
    text = (value or "").strip().lower()
    if not text or text == "-":
        return ""
    if "reinvest" in text or "bonus" in text:
        return "IDCW - Reinvestment"
    if "idcw" in text or "dividend" in text or "income distribution" in text:
        return "IDCW - Payout"
    if "growth" in text:
        return "Growth"
    return ""


def _mf_category(section: str) -> str:
    text = (section or "").lower()
    for needle, label in _MF_CATEGORY_RULES:
        if needle in text:
            return label
    return "Other"


def ingest_nav_all(data: bytes) -> dict:
    """Replace the stored scheme list with AMFI's NAV file (one row per variant)."""
    text = _decode(data)
    ts = db.now()
    rows = []
    amc = "Other"
    category = "Other"
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if ";" not in line:
            low = line.lower()
            if low.startswith(("open ended schemes", "close ended schemes", "interval fund schemes")):
                inside = line[line.find("(") + 1: line.rfind(")")] if "(" in line else ""
                category = _mf_category(inside)
            elif low.endswith("mutual fund"):
                amc = _AMC_ALIASES.get(low, "Other")
            continue
        parts = [part.strip() for part in line.split(";")]
        if len(parts) < 8:
            continue
        code, isin_growth, isin_div, name = parts[0], parts[1], parts[2], parts[3]
        plan, option = _mf_plan(parts[4]), _mf_option(parts[5])
        if not code or not name or not plan or not option:
            continue
        rows.append((
            code, name, plan, option, f"{name} - {plan} - {option}", amc, category,
            None if isin_growth in {"", "-"} else isin_growth,
            None if isin_div in {"", "-"} else isin_div,
            _num(parts[6]), _iso_date(parts[7]), ts,
        ))
    if not rows:
        raise ValueError("No mutual fund schemes were found in AMFI's NAV file.")
    conn = db.get_db()
    try:
        conn.execute("DELETE FROM mf_schemes")
        conn.executemany(
            """INSERT OR REPLACE INTO mf_schemes
               (code, name, plan, option, full_name, amc, category, isin_growth,
                isin_div, nav, nav_date, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            rows,
        )
        _set_meta(conn, "mf_scheme_count", len(rows), ts)
        _set_meta(conn, "mf_schemes_updated_at", ts, ts)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    latest = max((row[10] for row in rows if row[10]), default=None)
    return {
        "kind": "mf_schemes",
        "label": "AMFI scheme list",
        "rows": len(rows),
        "schemes": len({row[1] for row in rows}),
        "nav_date": latest,
    }


def sync_schemes() -> dict:
    return ingest_nav_all(fetch_nav_all())


def schemes_stale() -> bool:
    row = db.query_one("SELECT COUNT(*) AS c, MAX(updated_at) AS u FROM mf_schemes")
    if not row or not row["c"] or not row["u"]:
        return True
    try:
        age = datetime.now(timezone.utc) - datetime.fromisoformat(row["u"])
    except ValueError:
        return True
    return age > timedelta(hours=SCHEME_STALE_HOURS)


def search_schemes(term: str, groups: int = 6) -> list[dict]:
    """Search AMFI schemes, grouped by scheme with one entry per plan/option variant."""
    term = (term or "").strip()
    if len(term) < SEARCH_MIN:
        return []
    needle = _like(term)
    rows = db.query(
        """SELECT code, name, plan, option, amc, category, isin_growth, isin_div,
                  nav, nav_date
           FROM mf_schemes
           WHERE name LIKE ? ESCAPE '\\' OR amc LIKE ? ESCAPE '\\'
           ORDER BY CASE WHEN name LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END,
                    name, nav_date DESC, nav DESC
           LIMIT 600""",
        ("%" + needle + "%", "%" + needle + "%", needle + "%"),
    )
    found: dict[tuple, dict] = {}
    ordered: list[dict] = []
    for row in rows:
        key = (row["name"].lower(), (row["amc"] or "").lower())
        group = found.get(key)
        if group is None:
            if len(ordered) >= groups:
                continue
            group = {
                "name": row["name"],
                "amc": row["amc"] or "",
                "category": row["category"] or "Other",
                "variants": [],
                "seen": set(),
            }
            found[key] = group
            ordered.append(group)
        marker = (row["plan"], row["option"])
        if marker in group["seen"]:
            continue
        group["seen"].add(marker)
        group["variants"].append({
            "code": row["code"],
            "plan": row["plan"],
            "option": row["option"],
            "nav": round(row["nav"], 4) if row["nav"] is not None else None,
            "nav_date": row["nav_date"],
            "isin": row["isin_growth"] or row["isin_div"] or "",
        })
    for group in ordered:
        group["variants"].sort(key=lambda v: _VARIANT_ORDER.get((v["plan"], v["option"]), 9))
        group.pop("seen", None)
    return ordered



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
        # Dates the market data is "as of" (shown to the user):
        "equity_list_date": (equity_updated or "")[:10] or None,
        "bhavcopy_date": price_row["d"],
        "holdings": len(holdings),
        "matched": matched,
    }


def is_stale() -> bool:
    """True when nothing is stored or the newest prices are older than STALE_HOURS."""
    row = db.query_one("SELECT COUNT(*) AS c, MAX(updated_at) AS u FROM market_prices")
    if not row or not row["c"] or not row["u"]:
        return True
    try:
        age = datetime.now(timezone.utc) - datetime.fromisoformat(row["u"])
    except ValueError:
        return True
    return age > timedelta(hours=STALE_HOURS)


def sync_nse(day: date | None = None) -> dict:
    """Fetch and store the NSE equity list and the latest bhavcopy — no upload needed.

    The equity master and the bhavcopy are pulled straight from NSE's archive into
    the database. The bhavcopy keeps the whole cash-market segment, so equity
    shares, ETFs and any other listed cash-market products are all included. Each
    dataset is independent: one failing (for example, a network block) does not
    stop the other from being imported.
    """
    day = day or date.today()
    result: dict = {"equity_list": None, "bhavcopy": None, "errors": {}}
    try:
        result["equity_list"] = ingest(fetch_equity_list(), "EQUITY_L.csv")
    except (MarketError, ValueError) as exc:
        result["errors"]["equity_list"] = str(exc)
    try:
        payload, filename, _actual = fetch_bhavcopy(day)
        result["bhavcopy"] = ingest(payload, filename)
    except (MarketError, ValueError) as exc:
        result["errors"]["bhavcopy"] = str(exc)
    return result


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
