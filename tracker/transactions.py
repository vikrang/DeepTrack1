"""Per-scrip broker transaction reports.

Kotak Neo exports one workbook per scrip ("Portfolio Transactions"), with the
scrip name in a header block and a table of Date / Trade / Quantity rows below.
This module turns that export into normalised buy/sell rows.
"""

import csv
import hashlib
from datetime import date, datetime
from io import BytesIO, StringIO

DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y", "%d-%b-%Y", "%d %b %Y")

DATE_KEYS = ("date", "trade date", "transaction date")
KIND_KEYS = ("trade", "buy/sell", "transaction type", "trade type")
PRODUCT_KEYS = ("product type", "product")
TYPE_KEYS = ("type", "order type", "trade category")
QUANTITY_KEYS = ("quantity", "qty", "units", "qty.")
PRICE_KEYS = ("avg unit cost", "average price", "avg price", "price", "rate", "trade price")
VALUE_KEYS = ("value", "amount", "net amount", "value in inr")

SCRIP_KEYS = ("scrip name", "script name", "scrip", "symbol", "trading symbol")

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


def parse_transactions(blob: bytes, filename: str) -> dict:
    name = (filename or "").lower()
    if name.endswith((".xlsx", ".xlsm")):
        rows = _sheet_rows(blob)
    elif name.endswith(".csv"):
        rows = _csv_rows(blob)
    else:
        raise ValueError("Upload the broker's .xlsx or .csv transactions report")

    header_index, labels = _find_header(rows)
    if header_index is None:
        raise ValueError(
            "This doesn't look like a per-scrip transactions report — no Date / Trade / Quantity columns found. "
            "In Kotak Neo open the scrip's Portfolio Transactions and download the .xlsx."
        )

    used = set()
    columns = {}
    for key, keys in (
        ("date", DATE_KEYS), ("kind", KIND_KEYS), ("product", PRODUCT_KEYS),
        ("trade_type", TYPE_KEYS), ("quantity", QUANTITY_KEYS),
        ("price", PRICE_KEYS), ("value", VALUE_KEYS),
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

    result = []
    skipped = 0
    fingerprints = {}
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
        base = "|".join([
            trade_date.isoformat(), kind, f"{quantity:.4f}", f"{price:.4f}",
            f"{abs(value):.2f}", trade_type.lower(),
        ])
        fingerprints[base] = fingerprints.get(base, 0) + 1
        result.append({
            "trade_date": trade_date.isoformat(),
            "kind": kind,
            "quantity": round(quantity, 4),
            "price": round(price, 4),
            "value": round(value, 2),
            "product": product,
            "trade_type": trade_type,
            "fingerprint": hashlib.sha1(f"{base}|{fingerprints[base]}".encode()).hexdigest()[:40],
        })

    if not result:
        raise ValueError("No buy or sell rows were found in this report.")

    return {"scrip": _find_scrip(rows), "rows": result, "skipped": skipped}
