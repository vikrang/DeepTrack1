"""Broker transaction reports.

Four layouts are understood:

* Kotak Neo "Portfolio Transactions" — one workbook per scrip, with the scrip
  name in a header block and a Date / Trade / Quantity table below.
* Kotak Neo "Transaction Statement" CSV — every scrip traded in the period,
  with Trade Date / Security Name / Transaction Type / Quantity / Market Rate.
* Kotak Neo "Transaction Statement" PDF — the same period statement as a
  fixed-width table; rows fingerprint identically to the CSV.
* ICICI Securities "Equity Transaction Statement" (the TRX-Equity PDF) — a
  fixed-width table covering every scrip traded in the period.

All are normalised into buy/sell rows with a stable fingerprint.
"""

import csv
import hashlib
import re
from datetime import date, datetime
from io import BytesIO, StringIO

DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y", "%d-%b-%Y", "%d %b %Y")

DATE_KEYS = ("date", "trade date", "transaction date")
KIND_KEYS = ("trade", "buy/sell", "transaction type", "trade type")
TIME_KEYS = ("time", "trade time", "transaction time")
PRODUCT_KEYS = ("product type", "product")
TYPE_KEYS = ("type", "order type", "trade category")
QUANTITY_KEYS = ("quantity", "qty", "units", "qty.")
PRICE_KEYS = ("avg unit cost", "average price", "avg price", "market rate", "price", "rate", "trade price")
VALUE_KEYS = ("value", "amount", "net amount", "value in inr", "total")
EXCHANGE_KEYS = ("exchange",)

SCRIP_KEYS = (
    "scrip name", "script name", "scrip", "symbol", "trading symbol",
    "security name", "security", "instrument name",
)

SKIP_PRODUCTS = ("intraday", "mis", "f&o", "futures", "options", "commodity")


def _text(value) -> str:
    return str(value or "").strip()


def _norm(value) -> str:
    return " ".join(_text(value).lower().replace("\n", " ").split())


def _match(label: str, keys) -> bool:
    return any(label == key or label.startswith(key) for key in keys)


def _number(value):
    if isinstance(value, (int, float)):
        return float(value)
    text = _text(value).replace(",", "").replace("₹", "")
    if not text:
        return None
    brackets = text.startswith("(") and text.endswith(")")
    text = text.strip("()")
    try:
        number = float(text)
    except ValueError:
        return None
    return -number if brackets else number


def _parse_date(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = _text(value)
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _clock(value) -> str:
    match = re.match(r"^(\d{1,2}):(\d{2})(?::(\d{2}))?", _text(value))
    if not match:
        return ""
    hour, minute, second = int(match.group(1)), int(match.group(2)), int(match.group(3) or 0)
    if hour > 23 or minute > 59 or second > 59:
        return ""
    return f"{hour:02d}:{minute:02d}:{second:02d}"


def _sheet_rows(blob: bytes) -> list:
    try:
        import openpyxl
    except ImportError as exc:  # pragma: no cover - dependency is in requirements
        raise ValueError("Excel support is missing; upload a CSV export instead.") from exc
    workbook = openpyxl.load_workbook(BytesIO(blob), data_only=True)
    rows = []
    for sheet in workbook.worksheets:
        for row in sheet.iter_rows(values_only=True):
            rows.append(list(row))
    return rows


def _csv_rows(blob: bytes) -> list:
    for encoding in ("utf-8-sig", "utf-16", "latin-1"):
        try:
            text = blob.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:  # pragma: no cover - latin-1 decodes anything
        text = blob.decode("utf-8", "replace")
    return [row for row in csv.reader(StringIO(text))]


def _find_scrip(rows: list) -> str:
    for row in rows:
        labels = [_norm(cell) for cell in row]
        if any(_match(label, QUANTITY_KEYS) for label in labels) and \
                any(_match(label, DATE_KEYS) for label in labels):
            # A table header, not a scrip block (the multi-scrip CSV).
            continue
        for index, cell in enumerate(row):
            if _norm(cell) in SCRIP_KEYS:
                for later in row[index + 1:]:
                    text = _text(later)
                    if text and _norm(later) not in SCRIP_KEYS:
                        return text
    return ""


def _find_header(rows: list):
    for index, row in enumerate(rows):
        labels = [_norm(cell) for cell in row]
        if any(_match(label, DATE_KEYS) for label in labels) and \
                any(_match(label, KIND_KEYS) for label in labels) and \
                any(_match(label, QUANTITY_KEYS) for label in labels):
            return index, labels
    return None, []


def _column(labels: list, keys, used: set):
    for index, label in enumerate(labels):
        if index in used:
            continue
        if label in keys:
            return index
    for index, label in enumerate(labels):
        if index in used:
            continue
        if _match(label, keys):
            return index
    return None


ICICI_ISIN_PREFIX_RE = re.compile(r"^[A-Z]{2}[A-Z0-9]{10}\s+")

ICICI_ROW_RE = re.compile(
    r"^(?P<contract>\S+)\s+(?P<settle_no>\d+)\s+(?P<exchange>BSE|NSE)\s+"
    r"(?P<order_no>\d+)\s+(?P<order_date>\d{2}-\d{2}-\d{4})\s+"
    r"(?P<trade_no>\d+)\s+(?P<trade_date>\d{2}-\d{2}-\d{4})\s+"
    r"(?P<settle_date>\d{2}-\d{2}-\d{4})\s+"
    r"(?P<security>.+?)\s+(?P<side>BUY|SELL|B|S)\s+"
    r"(?P<qty>[\d,]+(?:\.\d+)?)\s+(?P<rate>[\d,]+\.\d{2})\s+"
    r"(?P<total>[\d,]+\.\d{2})\s+(?P<brok>[\d,]+\.\d{2})\s+"
    r"(?P<serv>[\d,]+\.\d{2})\s+(?P<net>[\d,]+\.\d{2})\s*$"
)


def _pdf_lines(blob: bytes) -> list:
    try:
        from pypdf import PdfReader
    except ImportError as exc:  # pragma: no cover - dependency is in requirements
        raise ValueError("PDF support is missing; upload the statement's Excel or CSV export instead.") from exc
    try:
        reader = PdfReader(BytesIO(blob))
        text = "\n".join(page.extract_text(extraction_mode="layout") or "" for page in reader.pages)
    except Exception as exc:
        raise ValueError("That PDF could not be read. Download the statement again and retry.") from exc
    return text.splitlines()


KOTAK_PDF_ROW_RE = re.compile(
    r"^(?P<date>\d{2}/\d{2}/\d{4})\s{2,}(?P<security>.+?)\s{2,}"
    r"(?P<isin>[A-Z]{2}[A-Z0-9]{10})\s{2,}(?P<exchange>NSE|BSE)\s{2,}"
    r"(?P<side>Buy|Sell|B|S)\s{2,}(?P<product>[A-Za-z][A-Za-z ]*?)\s{2,}"
    r"(?P<source>.+?)\s{2,}(?P<qty>[\d,]+(?:\.\d+)?)\s{2,}"
    r"(?P<rate>[\d,]+(?:\.\d+)?)\s{2,}(?P<total>[\d,]+(?:\.\d+)?)\s{2,}"
    r"(?P<charges>[\d,]+(?:\.\d+)?)\s{2,}(?P<stt>[\d,]+(?:\.\d+)?)\s*$"
)

KOTAK_PDF_TIME_RE = re.compile(r"^(?P<time>\d{2}:\d{2}:\d{2})(?:\s|$)")


def _is_icici_pdf(lines: list) -> bool:
    return any("Security" in line and "Quantity" in line and "Trade No" in line for line in lines)


def _kotak_pdf_rows(lines: list) -> dict:
    """Fixed-width Kotak periodic statement; wrapped names and times sit on the next line."""
    rows = []
    pending = None
    skipped = 0
    for line in lines:
        text = line.strip()
        match = KOTAK_PDF_ROW_RE.match(text)
        if match:
            pending = None
            quantity = _number(match.group("qty"))
            price = _number(match.group("rate"))
            product = _text(match.group("product"))
            if quantity is None or quantity <= 0 or price is None:
                skipped += 1
                continue
            if any(word in product.lower() for word in SKIP_PRODUCTS):
                continue
            pending = {
                "trade_date": None,
                "date_text": match.group("date"),
                "security": " ".join(match.group("security").split()),
                "isin": match.group("isin"),
                "kind": "buy" if match.group("side") in ("Buy", "B") else "sell",
                "quantity": quantity,
                "price": price,
                "value": _number(match.group("total")),
                "product": product,
                "exchange": match.group("exchange"),
                "trade_time": "",
            }
            rows.append(pending)
            continue
        if pending is not None and KOTAK_PDF_TIME_RE.match(text):
            parts = re.split(r"\s{2,}", text)
            clock = _clock(parts[0])
            if clock and not pending["trade_time"]:
                pending["trade_time"] = clock
            extra = " ".join(part for part in parts[1:] if part and part.lower() != "neo").strip()
            if extra:
                pending["security"] = f"{pending['security']} {extra}".strip()
            continue
        pending = None

    result = []
    fingerprints = {}
    securities = set()
    for item in rows:
        trade_date = _parse_date(item.pop("date_text"))
        if trade_date is None:
            skipped += 1
            continue
        quantity = round(item["quantity"], 4)
        price = round(item["price"], 4)
        value = item["value"] if item["value"] else quantity * price
        security = item["security"]
        securities.add(security)
        base = "|".join([
            trade_date.isoformat(), item["kind"], f"{quantity:.4f}",
            f"{price:.4f}", f"{abs(value):.2f}", "",
        ])
        base = f"{security.lower()}|{base}"
        fingerprints[base] = fingerprints.get(base, 0) + 1
        result.append({
            "trade_date": trade_date.isoformat(),
            "trade_time": item["trade_time"],
            "kind": item["kind"],
            "quantity": quantity,
            "price": price,
            "value": round(value, 2),
            "product": item["product"],
            "exchange": item["exchange"],
            "trade_type": "",
            "security": security,
            "isin": item["isin"],
            "fingerprint": hashlib.sha1(f"{base}|{fingerprints[base]}".encode()).hexdigest()[:40],
        })
    if not result:
        raise ValueError(
            "This PDF doesn't look like a Kotak or ICICI trade statement. In Kotak Neo "
            "download Reports → Transaction Statement as CSV or PDF; in ICICI Direct "
            "download the Equity Transaction Statement PDF."
        )
    return {"scrips": sorted(securities), "rows": result, "skipped": skipped, "broker": "Kotak Securities"}


def _icici_rows(lines: list) -> dict:
    header = next(
        (line for line in lines if "Security" in line and "Quantity" in line and "Trade No" in line),
        None,
    )
    if header is None:
        raise ValueError(
            "This PDF doesn't look like an ICICI Securities Transaction Statement. "
            "In ICICI Direct download the Equity Transaction Statement as a PDF (cash market)."
        )
    result = []
    scrips = []
    skipped = 0
    fingerprints = {}
    for index, line in enumerate(lines):
        match = ICICI_ROW_RE.match(line.strip())
        if not match:
            if "ISEC/" in line and re.search(r"\s[BS]\s", line):
                skipped += 1
            continue
        security = match.group("security").strip()
        following = index + 1
        while following < len(lines):
            extra = lines[following]
            if not extra.strip() or ICICI_ROW_RE.match(extra.strip()) or "ISEC/" in extra:
                break
            fragment = extra[match.start("security"):match.start("side")].strip()
            if fragment and not re.search(r"\d{2}:\d{2}", fragment):
                security = f"{security} {fragment}".strip()
            following += 1
        isin_match = ICICI_ISIN_PREFIX_RE.match(security)
        isin = isin_match.group(0).strip() if isin_match else ""
        security = ICICI_ISIN_PREFIX_RE.sub("", " ".join(security.split())).strip()
        scrips.append(security)
        quantity = _number(match.group("qty"))
        price = _number(match.group("rate"))
        value = _number(match.group("total"))
        if quantity is None or quantity <= 0 or price is None:
            skipped += 1
            continue
        kind = "buy" if match.group("side") in ("B", "BUY") else "sell"
        trade_date = _parse_date(match.group("trade_date"))
        if trade_date is None:
            skipped += 1
            continue
        base = "|".join([
            security.lower(), trade_date.isoformat(), kind, f"{quantity:.4f}",
            f"{price:.4f}", f"{abs(value or quantity * price):.2f}", match.group("exchange").lower(),
        ])
        fingerprints[base] = fingerprints.get(base, 0) + 1
        result.append({
            "trade_date": trade_date.isoformat(),
            "trade_time": "",
            "kind": kind,
            "quantity": round(quantity, 4),
            "price": round(price, 4),
            "value": round(value if value else quantity * price, 2),
            "product": match.group("exchange"),
            "exchange": match.group("exchange"),
            "trade_type": "Cash",
            "security": security,
            "isin": isin,
            "fingerprint": hashlib.sha1(f"{base}|{fingerprints[base]}".encode()).hexdigest()[:40],
        })
    if not result:
        raise ValueError(
            "No buy or sell rows were found in this statement. "
            "Use the ICICI Equity Transaction Statement for the period that contains the trades."
        )
    return {"scrips": sorted(set(scrips)), "rows": result, "skipped": skipped, "broker": "ICICI Direct"}


def parse_transactions(blob: bytes, filename: str) -> dict:
    name = (filename or "").lower()
    if name.endswith(".pdf") or blob[:4] == b"%PDF":
        lines = _pdf_lines(blob)
        if _is_icici_pdf(lines):
            return _icici_rows(lines)
        return _kotak_pdf_rows(lines)
    if name.endswith((".xlsx", ".xlsm")):
        rows = _sheet_rows(blob)
    elif name.endswith(".csv"):
        rows = _csv_rows(blob)
    else:
        raise ValueError("Upload the broker's .xlsx, .csv or .pdf transactions report")

    header_index, labels = _find_header(rows)
    if header_index is None:
        raise ValueError(
            "This doesn't look like a Kotak trade report — no Date / Trade / Quantity columns found. "
            "In Kotak Neo download either Reports → Transaction Statement (CSV, covers every scrip) "
            "or Portfolio Tracker for each holding (Excel)."
        )

    used = set()
    columns = {}
    for key, keys in (
        ("date", DATE_KEYS), ("time", TIME_KEYS), ("kind", KIND_KEYS), ("product", PRODUCT_KEYS),
        ("trade_type", TYPE_KEYS), ("quantity", QUANTITY_KEYS),
        ("price", PRICE_KEYS), ("value", VALUE_KEYS), ("security", SCRIP_KEYS),
        ("isin", ("isin",)), ("exchange", EXCHANGE_KEYS),
    ):
        index = _column(labels, keys, used)
        if index is not None:
            used.add(index)
        columns[key] = index

    if columns["date"] is None or columns["kind"] is None or columns["quantity"] is None or columns["price"] is None:
        raise ValueError("The report is missing a Date, Trade, Quantity or Price column.")

    def cell(row, key):
        index = columns.get(key)
        return row[index] if index is not None and index < len(row) else None

    scrip = _find_scrip(rows)
    result = []
    skipped = 0
    fingerprints = {}
    securities = set()
    for row in rows[header_index + 1:]:
        if not row:
            continue
        kind = _norm(cell(row, "kind"))
        if kind not in ("buy", "sell"):
            continue
        trade_date = _parse_date(cell(row, "date"))
        quantity = _number(cell(row, "quantity"))
        price = _number(cell(row, "price"))
        if trade_date is None or not quantity or quantity <= 0 or price is None or price < 0:
            skipped += 1
            continue
        product = _text(cell(row, "product"))
        if any(word in product.lower() for word in SKIP_PRODUCTS):
            continue
        value = _number(cell(row, "value"))
        if value is None or value == 0:
            value = quantity * price
        trade_type = _text(cell(row, "trade_type"))
        row_security = _text(cell(row, "security"))
        if row_security:
            securities.add(row_security)
        security = row_security or scrip
        base = "|".join([
            trade_date.isoformat(), kind, f"{quantity:.4f}", f"{price:.4f}",
            f"{abs(value):.2f}", trade_type.lower(),
        ])
        if row_security:
            base = f"{row_security.lower()}|{base}"
        fingerprints[base] = fingerprints.get(base, 0) + 1
        result.append({
            "trade_date": trade_date.isoformat(),
            "trade_time": _clock(cell(row, "time")),
            "kind": kind,
            "quantity": round(quantity, 4),
            "price": round(price, 4),
            "value": round(value, 2),
            "product": product,
            "exchange": _text(cell(row, "exchange")).upper(),
            "trade_type": trade_type,
            "security": security,
            "isin": _text(cell(row, "isin")).upper(),
            "fingerprint": hashlib.sha1(f"{base}|{fingerprints[base]}".encode()).hexdigest()[:40],
        })

    if not result:
        raise ValueError("No buy or sell rows were found in this report.")

    return {
        "scrip": scrip,
        "scrips": sorted(securities) or ([scrip] if scrip else []),
        "rows": result,
        "skipped": skipped,
        "broker": "Kotak Securities",
    }
