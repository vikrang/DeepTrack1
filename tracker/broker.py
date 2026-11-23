"""Broker portfolio statements → DeepTrack import rows.

ICICI Direct and Kotak Securities holdings and portfolio exports label their
columns differently and usually carry a few title rows above the table. The
parser finds the heading row by its column labels instead of fixed positions,
so a reworked export still maps cleanly. Rows are turned into the same payloads
the workbook import produces, which lets both uploads share the preview,
duplicate check and commit flow.
"""

import csv
import io
import re
from pathlib import Path

from openpyxl import load_workbook

from . import db, fields
from .validators import parse_date, parse_number

EXTENSIONS = (".xlsx", ".xlsm", ".xls", ".csv")
MAX_ROWS = 5000

BROKER_MARKS = (
    ("icici", "ICICI Direct"),
    ("kotak", "Kotak Securities"),
    ("in300214", "Kotak Securities"),
    ("in300096", "Kotak Securities"),
    ("zerodha", "Zerodha"),
    ("groww", "Groww"),
    ("upstox", "Upstox"),
    ("hdfc", "HDFC Securities"),
    ("angel", "Angel One"),
    ("motilal", "Motilal Oswal"),
    ("sharekhan", "Sharekhan"),
    ("5paisa", "5paisa"),
    ("axis", "Axis Direct"),
    ("sbi", "SBI Securities"),
    ("dhan", "Dhan"),
    ("indmoney", "INDmoney"),
)

# Normalised broker heading → DeepTrack payload key.
_HEADER_KEYS = {
    "name": (
        "company name", "name of the company", "scrip name", "script name",
        "name of the scrip", "security name", "name of security", "instrument name",
        "stock name", "scheme name", "mutual fund scheme", "fund name", "description",
        "scrip", "script", "security", "instrument", "scheme", "fund", "stock", "name",
    ),
    "symbol": (
        "symbol", "nse symbol", "nse code", "stock symbol", "scrip symbol",
        "trading symbol", "ticker", "ticker symbol",
    ),
    "isin": ("isin", "isin code", "isin no"),
    "folio_no": ("folio", "folio no", "folio number", "folio num", "scheme folio", "account folio"),
    "quantity": (
        "quantity", "qty", "quantity held", "qty held", "holding qty", "net qty",
        "net quantity", "total qty", "total quantity", "units", "unit", "units held",
        "balance", "free balance", "available balance", "current balance",
        "closing balance", "quantity available", "holdings",
    ),
    "avg_price": (
        "average buy price", "avg buy price", "average buy rate", "avg buy rate",
        "average cost price", "avg cost price", "average purchase price",
        "avg purchase price", "average cost per unit", "avg cost per unit",
        "average unit cost", "avg unit cost", "average price", "avg price",
        "average cost", "avg cost", "average rate", "avg rate", "cost price",
        "purchase price", "buy price", "buy average", "acquisition price",
        "average nav", "avg nav",
    ),
    "price": (
        "last traded price", "ltp", "current price", "market price", "closing price",
        "close price", "closing rate", "market rate", "present price", "current rate",
        "current nav", "closing nav", "latest nav", "price in", "price in rs",
        "closing price in", "price", "nav",
    ),
    "invested": (
        "invested value", "investment value", "amount invested", "invested amount",
        "total invested", "total investment", "investment", "invested", "cost value",
        "buy value", "purchase value", "total cost", "acquisition cost",
        "gross investment", "net investment", "book value", "investment amount",
        "cost of acquisition", "purchase cost", "total purchase value",
    ),
    "current": (
        "current market value", "current value", "market value", "present value",
        "current valuation", "market valuation", "valuation in", "valuation in rs",
        "market value in", "holding value", "holdings value",
        "valuation", "total value", "value",
    ),
    "asset_type": ("asset type", "asset class", "instrument type", "security type", "product type"),
    "plan": ("plan", "scheme plan"),
    "option": ("option", "scheme option", "dividend option"),
    "owner": (
        "owner", "member", "holder", "holder name", "investor", "investor name",
        "customer name", "client name", "primary holder",
    ),
    "broker": ("broker", "broker name", "dp name"),
    "client_id": ("client id", "client code", "demat account", "demat id", "dp id", "ucc", "client ucc"),
    "amc": ("amc", "fund house", "asset management company", "mutual fund company"),
    "registrar": ("registrar", "rta"),
    "exchange": ("exchange",),
    "start_date": (
        "buy date", "purchase date", "first purchase date", "date of purchase",
        "acquisition date", "date of acquisition",
    ),
}

_HEADER_LOOKUP = {}
for _key, _labels in _HEADER_KEYS.items():
    for _label in _labels:
        _HEADER_LOOKUP[_label] = _key

_IDENTITY_KEYS = {"name", "symbol", "quantity"}

_FIELD_LABELS = {
    "symbol": "Symbol / ticker",
    "exchange": "Exchange",
    "quantity": "Quantity",
    "avg_buy_price": "Average buy price",
    "ltp": "Current price (LTP)",
    "units": "Units held",
    "avg_price": "Average buy price",
    "current_price": "Current price",
    "amc": "AMC",
    "scheme_category": "Scheme category",
    "plan": "Plan",
    "option": "Option",
    "folio_no": "Folio number",
    "name": "Investment name",
    "owner_email": "Owner",
    "invested_amount": "Amount invested",
    "current_value": "Current value",
    "start_date": "Purchase / start date",
    "broker": "Broker / DP",
    "registrar": "Registrar",
}

_TOTAL_WORDS = {"total", "grand total", "portfolio total", "total value", "sub total", "subtotal"}

_CORPORATE_SUFFIXES = {"ltd", "limited", "lt", "co", "company", "corporation", "corp", "plc", "inc", "the"}

_AMC_MARKS = (
    ("aditya birla sun life", "Aditya Birla Sun Life MF"), ("aditya birla", "Aditya Birla Sun Life MF"),
    ("absl", "Aditya Birla Sun Life MF"), ("icici prudential", "ICICI Prudential MF"),
    ("nippon india", "Nippon India MF"), ("reliance mutual fund", "Nippon India MF"),
    ("franklin templeton", "Franklin Templeton MF"), ("franklin", "Franklin Templeton MF"),
    ("parag parikh", "Parag Parikh MF"), ("ppfas", "Parag Parikh MF"),
    ("motilal oswal", "Motilal Oswal MF"), ("mirae asset", "Mirae Asset MF"),
    ("kotak mahindra", "Kotak Mahindra MF"), ("kotak", "Kotak Mahindra MF"),
    ("axis", "Axis Mutual Fund"), ("sbi", "SBI Mutual Fund"), ("hdfc", "HDFC Mutual Fund"),
    ("uti", "UTI Mutual Fund"), ("quant", "Quant MF"), ("dsp", "DSP MF"), ("tata", "Tata MF"),
    ("edelweiss", "Edelweiss MF"), ("invesco", "Invesco MF"), ("hsbc", "HSBC MF"),
    ("bandhan", "Bandhan MF"), ("idfc", "Bandhan MF"), ("sundaram", "Sundaram MF"),
    ("navi", "Navi MF"), ("whiteoak", "WhiteOak MF"), ("white oak", "WhiteOak MF"),
)

_CATEGORY_MARKS = (
    ("flexi cap", "Flexi Cap"), ("flexicap", "Flexi Cap"), ("multi cap", "Multi Cap"),
    ("multicap", "Multi Cap"), ("large & mid", "Other"), ("large cap", "Large Cap"),
    ("largecap", "Large Cap"), ("bluechip", "Large Cap"), ("mid cap", "Mid Cap"),
    ("midcap", "Mid Cap"), ("small cap", "Small Cap"), ("smallcap", "Small Cap"),
    ("elss", "ELSS (Tax Saving)"), ("tax saver", "ELSS (Tax Saving)"),
    ("index", "Index Fund"), ("sectoral", "Sectoral / Thematic"), ("thematic", "Sectoral / Thematic"),
    ("balanced advantage", "Balanced Advantage"), ("dynamic asset", "Balanced Advantage"),
    ("aggressive hybrid", "Aggressive Hybrid"), ("conservative hybrid", "Conservative Hybrid"),
    ("arbitrage", "Arbitrage"), ("liquid", "Liquid"), ("overnight", "Overnight"),
    ("ultra short", "Ultra Short Duration"), ("corporate bond", "Corporate Bond"),
    ("credit risk", "Credit Risk"), ("gilt", "Gilt"), ("gold", "Gold"),
    ("international", "International / Fund of Funds"), ("fund of funds", "International / Fund of Funds"),
    ("focused", "Focused Fund"),
)


def _text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _norm(value) -> str:
    text = str(value or "").lower().replace("₹", " ")
    text = re.sub(r"\(.*?\)", " ", text).replace("*", " ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()


def _num(value):
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return parse_number(value)
    except ValueError:
        return None


def _is_isin(value) -> bool:
    return bool(re.fullmatch(r"[A-Z]{2}[A-Z0-9]{9}[0-9]", _text(value).upper()))


# ---------------------------------------------------------------- reading


def _read_csv(stream) -> list[list]:
    data = stream.read()
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            text = data.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = data.decode("utf-8", errors="replace")
    sample = text[:4096]
    delimiter = ","
    for candidate in ("\t", ";", ","):
        if sample.count(candidate) > sample.count(delimiter):
            delimiter = candidate
    return [row for row in csv.reader(io.StringIO(text), delimiter=delimiter)]


def _read_tables(stream, filename) -> list[tuple[str, list[list]]]:
    suffix = Path(filename).suffix.lower()
    if suffix == ".csv":
        return [(Path(filename).stem or "Report", _read_csv(stream))]
    if suffix in (".xlsx", ".xlsm"):
        try:
            workbook = load_workbook(stream, data_only=True, read_only=True)
        except Exception as exc:  # noqa: BLE001
            raise ValueError(
                "Could not read this file. Upload the broker's Excel or CSV export."
            ) from exc
        tables = []
        for sheet in workbook.worksheets:
            rows = [list(row) for row in sheet.iter_rows(values_only=True)]
            tables.append((sheet.title, rows))
        return tables
    if suffix == ".xls":
        try:
            import xlrd
        except ImportError as exc:
            raise ValueError(
                "This .xls report needs the xlrd package. Save it as .xlsx from Excel and upload again."
            ) from exc
        try:
            book = xlrd.open_workbook(file_contents=stream.read())
        except Exception as exc:  # noqa: BLE001
            raise ValueError("Could not read this .xls report. Save it as .xlsx and upload again.") from exc
        tables = []
        for sheet in book.sheets():
            rows = [
                [sheet.cell_value(index, column) for column in range(sheet.ncols)]
                for index in range(sheet.nrows)
            ]
            tables.append((sheet.name, rows))
        return tables
    raise ValueError("Upload the broker's .xlsx, .xls or .csv export.")


# ---------------------------------------------------------------- headings


def _map_row(row) -> dict:
    candidates: dict[str, tuple[int, int]] = {}
    for index, cell in enumerate(row):
        label = _norm(cell)
        key = _HEADER_LOOKUP.get(label)
        if not key:
            continue
        # A longer label is the more specific one ("market value" over "value").
        score = (len(label), index)
        if key not in candidates or score[0] > candidates[key][0]:
            candidates[key] = score
    return {key: score[1] for key, score in candidates.items()}


def _header_quality(mapping) -> int | None:
    if not any(key in mapping for key in ("name", "symbol")):
        return None
    if "quantity" not in mapping:
        return None
    score = sum(2 if key in _IDENTITY_KEYS else 1 for key in mapping)
    return score if score >= 6 else None


def _find_header(rows):
    best = None
    for index, row in enumerate(rows[:80]):
        mapping = _map_row(row)
        quality = _header_quality(mapping)
        if quality is None:
            continue
        if best is None or quality > best[0]:
            best = (quality, index, mapping)
    if best is None:
        return None
    return best[1], best[2]


def _section_kind(row):
    cells = [_norm(cell) for cell in row if _text(cell)]
    if len(cells) != 1:
        return None
    label = cells[0]
    if "etf" in label or "exchange traded" in label:
        return "etf"
    if "mutual fund" in label or label in {"mf", "mutual funds", "funds"}:
        return "mutual_funds"
    if "equity" in label or "stock" in label:
        return "stocks"
    return None


def _sheet_kind(title) -> str:
    label = _norm(title)
    if "etf" in label or "exchange traded" in label:
        return "etf"
    if "mutual" in label or re.search(r"\bmf\b", label):
        return "mutual_funds"
    return "stocks"


# ---------------------------------------------------------------- lookups


class ScripIndex:
    def __init__(self):
        self.by_symbol = {}
        self.by_isin = {}
        self.by_name = {}
        try:
            rows = db.query("SELECT symbol, name, isin FROM scrips")
        except RuntimeError:
            rows = []
        for row in rows:
            symbol = _text(row["symbol"]).upper()
            if not symbol:
                continue
            self.by_symbol[symbol] = row
            if row["isin"]:
                self.by_isin[_text(row["isin"]).upper()] = row
            key = self._company_key(row["name"])
            if key:
                self.by_name.setdefault(key, []).append(row)

    @staticmethod
    def _company_key(name) -> tuple:
        parts = [p for p in re.split(r"[^a-z0-9]+", _text(name).lower()) if p]
        while parts and parts[-1] in _CORPORATE_SUFFIXES:
            parts.pop()
        return tuple(parts)

    @staticmethod
    def _token_match(left, right) -> bool:
        if left == right:
            return True
        return len(left) >= 4 and len(right) >= 4 and (left.startswith(right) or right.startswith(left))

    def _fuzzy(self, name):
        wanted = self._company_key(name)
        if not wanted:
            return None
        best, best_score, tied = None, 0.0, False
        for tokens, rows in self.by_name.items():
            if not tokens:
                continue
            hits = sum(
                1 for token in wanted
                if any(self._token_match(token, other) for other in tokens)
            )
            score = hits / len(wanted)
            if score < 0.8 or hits < 2:
                continue
            if score > best_score:
                best, best_score, tied = rows, score, False
            elif score == best_score and rows is not best:
                tied = True
        if best is None or tied:
            return None
        symbols = {_text(row["symbol"]).upper() for row in best}
        return best[0] if len(symbols) == 1 else None

    def resolve(self, raw_symbol, isin, name):
        """Return (symbol, note). An empty symbol means the row needs a manual fix."""
        symbol = re.sub(r"[^A-Z0-9&-]", "", _text(raw_symbol).upper())
        if symbol and symbol in self.by_symbol:
            return symbol, None
        if _is_isin(isin):
            row = self.by_isin.get(_text(isin).upper())
            if row:
                return _text(row["symbol"]).upper(), None
        if name:
            direct = self.by_symbol.get(_text(name).upper())
            if direct:
                return _text(direct["symbol"]).upper(), None
            row = self._fuzzy(name)
            if row:
                return _text(row["symbol"]).upper(), "NSE symbol matched from the company name — check it"
        if symbol and not symbol.isdigit() and len(symbol) <= 20:
            return symbol, "This symbol is not in the NSE list yet, so the price will stay blank"
        return "", None


class SchemeCatalog:
    """AMFI variants stored by the market sync, used to complete plan, option and AMC."""

    def __init__(self):
        self.by_variant = {}
        self.by_name = {}
        self.by_isin = {}
        try:
            rows = db.query(
                "SELECT name, plan, option, full_name, amc, category, nav, isin_growth, isin_div"
                " FROM mf_schemes"
            )
        except RuntimeError:
            rows = []
        for row in rows:
            data = {
                "name": row["name"], "plan": row["plan"], "option": row["option"],
                "full_name": row["full_name"], "amc": row["amc"], "category": row["category"],
                "nav": row["nav"],
            }
            self.by_variant.setdefault(_norm(row["full_name"]), data)
            self.by_name.setdefault(_norm(row["name"]), []).append(data)
            for isin in (row["isin_growth"], row["isin_div"]):
                if isin:
                    self.by_isin[_text(isin).upper()] = data

    def match(self, name, isin, plan, option):
        if _is_isin(isin):
            row = self.by_isin.get(_text(isin).upper())
            if row:
                return row
        norm = _norm(name)
        row = self.by_variant.get(norm)
        if row:
            return row
        variants = self.by_name.get(norm)
        if not variants:
            base = _strip_variant_words(norm)
            variants = self.by_name.get(base) if base else None
        if not variants:
            return None
        for row in variants:
            if row["plan"] == plan and row["option"] == option:
                return row
        if len(variants) == 1:
            return variants[0]
        for row in variants:
            if row["option"] == option:
                return row
        return variants[0]


def _strip_variant_words(text) -> str:
    words = text.split()
    while words and words[-1] in {
        "direct", "regular", "plan", "growth", "idcw", "payout", "reinvestment",
        "dividend", "option", "scheme",
    }:
        words.pop()
    return " ".join(words)


def _infer_plan(text):
    low = _norm(text)
    if "regular" in low:
        return "Regular"
    if "direct" in low:
        return "Direct"
    return None


def _infer_option(text):
    low = _norm(text)
    if any(word in low for word in ("idcw", "dividend", "income distribution")):
        return "IDCW - Reinvestment" if "reinvest" in low else "IDCW - Payout"
    if "growth" in low:
        return "Growth"
    return None


def _canonical_choice(value, options):
    text = _norm(value)
    for option in options:
        if text == _norm(option) or _norm(option) in text:
            return option
    return None


def _infer_amc(name) -> str:
    low = _norm(name)
    for mark, amc in _AMC_MARKS:
        if mark in low:
            return amc
    return "Other"


def _infer_category(name) -> str:
    low = _norm(name)
    for mark, category in _CATEGORY_MARKS:
        if re.search(rf"\b{re.escape(mark)}\b", low):
            return category
    return "Other"


def _broker_option(*texts):
    for text in texts:
        low = _norm(text)
        if not low:
            continue
        for mark, broker in BROKER_MARKS:
            if re.search(rf"\b{re.escape(mark)}\b", low):
                return broker
    return None


def _detect_broker(filename, tables) -> str | None:
    by_file = _broker_option(Path(filename).stem)
    if by_file:
        return by_file
    for _sheet, rows in tables:
        header = _find_header(rows)
        # Only the title block above the table names the broker; holding rows
        # and footers mention other companies ("SBI Gold ETF", disclaimers).
        stop = header[0] if header else min(len(rows), 6)
        found = _broker_option(*(cell for row in rows[:stop] for cell in row[:12]))
        if found:
            return found
    return None


def _type_of(values, sheet_kind):
    hint = _norm(values.get("asset_type"))
    if "etf" in hint or "exchange traded" in hint:
        return "etf"
    if "mutual" in hint or "fund" in hint:
        return "mutual_funds"
    if _text(values.get("folio_no")):
        return "mutual_funds"
    if sheet_kind in ("mutual_funds", "etf"):
        return sheet_kind
    name = _norm(values.get("name"))
    if "etf" in name or "bees" in name or "exchange traded" in name:
        return "etf"
    return "stocks"


def _find_member(text, members):
    low = _text(text).lower()
    if not low:
        return None
    for member in members:
        if low == member["email"].lower() or low == member["name"].strip().lower():
            return member
    first = low.split()[0] if low.split() else ""
    matches = [m for m in members if m["name"].strip().split()[:1] and m["name"].strip().split()[0].lower() == first]
    return matches[0] if len(matches) == 1 else None


# ---------------------------------------------------------------- rows


def _pick(mapping, raw):
    picked = {}
    for key, index in mapping.items():
        cell = raw[index] if index < len(raw) else None
        if cell is None or _text(cell) == "":
            continue
        picked[key] = cell
    return picked


def _clean_name(value) -> str:
    return re.sub(r"\s+", " ", _text(value)).strip()


def _row_kind(sheet_kind, section, values):
    kind = _type_of(values, section or sheet_kind)
    return kind


def _build_market_payload(kind, values, broker, scrips):
    name = _clean_name(values.get("name"))
    raw_symbol = _text(values.get("symbol"))
    isin = _text(values.get("isin")).upper()
    if not _is_isin(isin) and _is_isin(name):
        isin = name.upper()
        known = scrips.by_isin.get(isin)
        name = _clean_name(known["name"]).title() if known and known["name"] else ""
    symbol, symbol_note = scrips.resolve(raw_symbol, isin, name)
    warnings = []
    if symbol_note:
        warnings.append(symbol_note)
    if not name:
        name = symbol
    elif symbol and _norm(name) == _norm(symbol):
        known = scrips.by_symbol.get(symbol)
        if known and known["name"]:
            name = _clean_name(known["name"]).title()

    quantity = _num(values.get("quantity"))
    avg = _num(values.get("avg_price"))
    price = _num(values.get("price"))
    invested = _num(values.get("invested"))
    current = _num(values.get("current"))

    if avg is None and invested is not None and quantity:
        avg = invested / quantity
    if invested is None and avg is not None and quantity is not None:
        invested = round(avg * quantity, 2)
    if price is None and current is not None and quantity:
        price = current / quantity
    if current is None and price is not None and quantity is not None:
        current = round(price * quantity, 2)

    estimated_cost = False
    if avg is None and price is not None:
        # Valuation-only exports (Kotak's Demat Holdings & Valuation) list no
        # purchase cost; borrow the price so the row can still be saved.
        avg = price
        if quantity is not None:
            invested = round(avg * quantity, 2)
        estimated_cost = True
        warnings.append(
            "Purchase cost is not in this report — Average buy price is filled from the "
            "current price; edit it after import if needed"
        )

    payload = {"type": kind, "name": name}
    if estimated_cost:
        payload["cost_estimated"] = True
    if kind == "stocks":
        payload.update({
            "symbol": symbol,
            "exchange": _canonical_choice(values.get("exchange"), fields.EXCHANGES) or "NSE",
            "quantity": quantity,
            "avg_buy_price": avg,
            "ltp": price,
        })
    else:
        payload.update({
            "symbol": symbol,
            "exchange": _canonical_choice(values.get("exchange"), fields.EXCHANGES) or "NSE",
            "units": quantity,
            "avg_price": avg,
            "current_price": price,
        })
    if invested is not None:
        payload["invested_amount"] = invested
    if current is not None:
        payload["current_value"] = current
    broker_name = _broker_option(values.get("broker")) or broker
    if broker_name:
        payload["broker"] = broker_name
    client_id = _text(values.get("client_id"))
    if client_id and client_id.lower() not in {"na", "n a", "-", "--"}:
        payload["demat_account"] = client_id
    start = _text(values.get("start_date"))
    if start:
        try:
            payload["start_date"] = parse_date(start)
        except ValueError:
            pass
    return payload, warnings


def _build_fund_payload(values, catalog, broker):
    warnings = []
    report_name = _clean_name(values.get("name"))
    isin = _text(values.get("isin")).upper()
    plan_hint = _canonical_choice(values.get("plan"), fields.PLANS) or _infer_plan(report_name)
    option_hint = None
    option_cell = _text(values.get("option"))
    if option_cell:
        option_hint = _infer_option(option_cell)
    if option_hint is None:
        option_hint = _infer_option(report_name)

    record = catalog.match(report_name, isin, plan_hint, option_hint)
    plan = plan_hint or (record["plan"] if record else None)
    option = option_hint or (record["option"] if record else None)
    if not plan:
        plan = "Direct"
        warnings.append("Plan not shown in the report — set to Direct; edit it if this is a Regular plan")
    if not option:
        option = "Growth"
        warnings.append("Growth/IDCW not shown in the report — set to Growth")

    if record:
        amc = record["amc"] if record["amc"] in fields.AMCS else _infer_amc(record["name"])
        category = record["category"] if record["category"] in fields.MF_CATEGORIES else _infer_category(record["name"])
        name = f"{record['name']} - {plan} - {option}"
    else:
        amc = _canonical_choice(values.get("amc"), fields.AMCS) or _infer_amc(report_name)
        category = _infer_category(report_name)
        name = report_name
        if amc == "Other":
            warnings.append("AMC not recognised — saved as Other; pick the right AMC after import")
        if category == "Other":
            warnings.append("Scheme category not recognised — saved as Other")

    units = _num(values.get("quantity"))
    avg_nav = _num(values.get("avg_price"))
    nav = _num(values.get("price"))
    invested = _num(values.get("invested"))
    current = _num(values.get("current"))

    if nav is None and record and record.get("nav") and units:
        nav = float(record["nav"])
    if avg_nav is None and invested is not None and units:
        avg_nav = invested / units
    if invested is None and avg_nav is not None and units is not None:
        invested = round(avg_nav * units, 2)
    if nav is None and current is not None and units:
        nav = current / units
    if current is None and nav is not None and units is not None:
        current = round(nav * units, 2)

    estimated_cost = False
    if avg_nav is None and nav is not None:
        # Valuation-only export: no purchase NAV, so use the current NAV and say so.
        avg_nav = nav
        if units is not None:
            invested = round(avg_nav * units, 2)
        estimated_cost = True
        warnings.append(
            "Purchase cost is not in this report — Average buy price is filled from the "
            "current NAV; edit it after import if needed"
        )

    folio = _text(values.get("folio_no"))
    payload = {
        "type": "mutual_funds",
        "name": name,
        "amc": amc,
        "scheme_category": category,
        "plan": plan,
        "option": option,
        "units": units,
        "avg_nav": avg_nav,
        "current_nav": nav,
    }
    if folio:
        payload["folio_no"] = folio
    else:
        warnings.append("No folio number in this report — re-uploading the same file would add duplicates")
    if invested is not None:
        payload["invested_amount"] = invested
    if current is not None:
        payload["current_value"] = current
    if estimated_cost:
        payload["cost_estimated"] = True
    registrar = _canonical_choice(values.get("registrar"), fields.REGISTRARS)
    if registrar:
        payload["registrar"] = registrar
    broker_name = _broker_option(values.get("broker")) or broker
    if broker_name and broker_name in ("ICICI Direct", "Kotak Securities", "HDFC Securities"):
        payload["broker"] = broker_name
    return payload, warnings


def _fixes(errors):
    return [
        {
            "field": key,
            "column": _FIELD_LABELS.get(key) or key.replace("_", " ").capitalize(),
            "message": message,
        }
        for key, message in errors.items()
    ]


def _parse_sheet(sheet, rows, sheet_kind, broker, members, default_owner_id, catalog, scrips):
    header = _find_header(rows)
    if header is None:
        return [], []
    header_index, mapping = header

    default_owner = next((m for m in members if m["id"] == default_owner_id), None)
    default_owner_name = default_owner["name"] if default_owner else ""

    preview, payloads = [], []
    section = None
    for offset, raw in enumerate(rows[header_index + 1: header_index + 1 + MAX_ROWS]):
        row_index = header_index + 2 + offset
        if raw is None or all(_text(cell) == "" for cell in raw):
            continue
        section_hint = _section_kind(raw)
        if section_hint:
            section = section_hint
            continue
        repeat = _map_row(raw)
        if _header_quality(repeat) is not None:
            mapping = repeat
            continue

        values = _pick(mapping, raw)
        name = _clean_name(values.get("name"))
        if name.lower().strip(". ") in _TOTAL_WORDS:
            continue
        quantity = _num(values.get("quantity"))
        if quantity is not None and quantity <= 0:
            continue
        if quantity is None and not any(
            _num(values.get(key)) is not None for key in ("invested", "price", "current")
        ):
            # Titles, disclaimers and footers carry no figures.
            continue
        if not name and not _text(values.get("symbol")):
            continue
        if not name and quantity is None:
            continue

        kind = _row_kind(sheet_kind, section, values)
        if kind == "mutual_funds":
            payload, row_warnings = _build_fund_payload(values, catalog, broker)
        else:
            payload, row_warnings = _build_market_payload(kind, values, broker, scrips)

        owner_raw = _text(values.get("owner"))
        owner_error = None
        if owner_raw:
            member = _find_member(owner_raw, members)
            if member:
                payload["owner_id"] = member["id"]
                owner_name = member["name"]
            else:
                payload["owner_id"] = None
                owner_error = f"No member named {owner_raw}"
                owner_name = owner_raw
        else:
            payload["owner_id"] = default_owner_id
            owner_name = default_owner_name
            if default_owner_id is None:
                owner_error = "Choose the member this report belongs to"

        data, errors = fields.validate_investment(payload)
        if owner_error:
            errors.pop("owner_id", None)
            errors["owner_email"] = owner_error
        symbol_error = next((w for w in row_warnings if "not in the NSE list yet" in w), None)
        if symbol_error and "symbol" in errors:
            errors["symbol"] = "Add the NSE symbol — this holding was not found in the NSE list"
            row_warnings.remove(symbol_error)
        if not payload.get("symbol") and kind in ("stocks", "etf"):
            errors["symbol"] = "Add the NSE symbol — this holding was not found in the NSE list"

        row_warnings = _with_defaults(kind, values, data, row_warnings)
        preview_row = {
            "sheet": sheet,
            "row": row_index,
            "type": kind,
            "type_label": fields.TYPES[kind]["label"],
            "name": payload.get("name") or "(no name)",
            "owner": owner_name,
            "invested": data.get("invested_amount") if data else None,
            "current": data.get("current_value") if data else None,
            "errors": errors,
            "fixes": _fixes(errors),
            "warnings": row_warnings,
            "duplicate": False,
        }
        preview.append(preview_row)
        payloads.append({
            "preview": preview_row,
            "payload": payload,
            "valid": not errors,
            "duplicate": False,
        })

    return preview, payloads


def _with_defaults(kind, values, data, warnings):
    if not data:
        return warnings
    if not warnings:
        warnings = []
    if kind in ("stocks", "etf"):
        if _num(values.get("price")) is None and _num(values.get("current")) is None:
            warnings.append("Current price missing, so the current value shows the invested amount until NSE prices sync")
    if kind == "mutual_funds":
        if _num(values.get("current")) is None and _num(values.get("price")) is None:
            warnings.append("Current NAV missing from the report")
    return warnings


def _mark_duplicates(payloads, owner_names):
    counts = {}
    for item in payloads:
        if not item["valid"]:
            continue
        data, _errors = fields.validate_investment(item["payload"])
        for key in fields.holding_keys(data):
            counts[key] = counts.get(key, 0) + 1
    seen = set()
    seen_serial = {}
    for item in payloads:
        if not item["valid"]:
            continue
        data, _errors = fields.validate_investment(item["payload"])
        row_keys = fields.holding_keys(data)
        owner = data.get("owner_id")
        row_serials = fields.serial_keys(data)
        if any(key in seen for key in row_keys):
            item["duplicate"] = True
            item["preview"]["duplicate"] = True
            item["preview"]["warnings"].append("The same holding appears earlier in this file — this row will be skipped")
        if not item["duplicate"]:
            for serial in row_serials:
                others = [name for oid, name in seen_serial.get(serial, {}).items() if oid != owner]
                if others:
                    item["duplicate"] = True
                    item["preview"]["duplicate"] = True
                    column = _FIELD_LABELS.get(serial[1]) or serial[1].replace("_", " ")
                    item["preview"]["warnings"].append(
                        f"The same {column} appears earlier in this file for "
                        f"{', '.join(others)} — this row will be skipped"
                    )
                    break
        seen.update(row_keys)
        for serial in row_serials:
            seen_serial.setdefault(serial, {})[owner] = owner_names.get(owner, "another member")
        if any(counts.get(key, 0) > 1 for key in row_keys) and not item["duplicate"]:
            item["preview"]["warnings"].append("Another row in this file describes the same holding")


def _mark_existing(
    payloads, existing_keys, existing_serial, owner_names,
    existing_lookup=None, update_existing=False,
):
    if not existing_keys and not existing_serial:
        return
    for item in payloads:
        if not item["valid"] or item["duplicate"]:
            continue
        data, _errors = fields.validate_investment(item["payload"])
        keys = fields.holding_keys(data)
        record = None
        for key in keys:
            if key in (existing_keys or set()):
                record = (existing_lookup or {}).get(key)
                break
        if record is not None:
            changes, merged = [], None
            if update_existing and record.get("owner_id") == data.get("owner_id"):
                ignore = ()
                if item["payload"].get("cost_estimated"):
                    type_keys = fields.QUANTITY_KEYS.get(data.get("type")) or ()
                    if len(type_keys) > 1:
                        ignore = (type_keys[1],)
                changes, merged = fields.quantity_changes(record, data, _FIELD_LABELS, ignore)
            if changes:
                fields.apply_quantity_change(item["payload"], record, merged)
                item["update_id"] = record["id"]
                preview = item["preview"]
                preview["update"] = {"id": record["id"], "changes": changes}
                preview["invested"] = item["payload"]["invested_amount"]
                preview["current"] = item["payload"]["current_value"]
                preview["warnings"].append(
                    "Will update this holding — "
                    + "; ".join(
                        f"{change['label']} {change['from']} → {change['to']}" for change in changes
                    )
                )
                continue
            item["duplicate"] = True
            item["preview"]["duplicate"] = True
            item["preview"]["warnings"].append("Already in your portfolio — this row will be skipped")
            continue
        for serial in fields.serial_keys(data):
            holders = [
                name for owner_id, name in (existing_serial or {}).get(serial, {}).items()
                if owner_id != data.get("owner_id")
            ]
            if not holders:
                continue
            column = _FIELD_LABELS.get(serial[1]) or serial[1].replace("_", " ")
            item["duplicate"] = True
            item["preview"]["duplicate"] = True
            item["preview"]["warnings"].append(
                f"Already recorded for {' and '.join(holders)} under the same {column} — "
                "this row will be skipped"
            )
            break


# ---------------------------------------------------------------- entry point


def _looks_like_trade_history(tables) -> bool:
    """A trade history lists every buy and sell; read as holdings it becomes
    one holding per trade, so refuse it and point at the trade-report import."""
    for _, rows in tables:
        for raw in rows[:40]:
            labels = {_norm(cell) for cell in raw if _text(cell)}
            dated = labels & {"trade date", "transaction date"}
            typed = labels & {"transaction type", "trade type", "buy/sell"}
            named = labels & {"security name", "scrip name", "script name", "symbol", "trading symbol"}
            if dated and typed and named:
                return True
    return False


def parse_broker(
    stream,
    filename,
    members,
    default_owner_id,
    existing_keys=None,
    existing_serial=None,
    existing_lookup=None,
    update_existing=False,
):
    """Parse a broker holdings export. Returns (preview, payloads, warnings, broker)."""
    tables = _read_tables(stream, filename)
    if not tables:
        raise ValueError("This file has no sheets. Upload the broker's holdings export.")
    if _looks_like_trade_history(tables):
        raise ValueError(
            "This file is a trade history — every buy and sell, not holdings. "
            "Open the holding under Instruments and choose Import broker trade report."
        )
    broker = _detect_broker(filename, tables)
    catalog = SchemeCatalog()
    scrips = ScripIndex()

    warnings = []
    preview, payloads = [], []
    for sheet, rows in tables:
        if not rows:
            continue
        sheet_kind = _sheet_kind(sheet)
        sheet_preview, sheet_payloads = _parse_sheet(
            sheet, rows, sheet_kind, broker, members, default_owner_id, catalog, scrips
        )
        if not sheet_preview and len(rows) > 1:
            warnings.append(f"'{sheet}' skipped: no holdings table found.")
        preview.extend(sheet_preview)
        payloads.extend(sheet_payloads)

    if not preview:
        raise ValueError(
            "No holdings found in this report. Upload the ICICI Direct or Kotak Securities "
            "holdings/portfolio Excel or CSV export."
        )
    if not catalog.by_variant:
        warnings.append("The AMFI scheme list is empty, so mutual fund plan details come from the report text alone")

    owner_names = {m["id"]: m["name"] for m in members}
    _mark_duplicates(payloads, owner_names)
    _mark_existing(
        payloads, existing_keys, existing_serial, owner_names,
        existing_lookup=existing_lookup, update_existing=update_existing,
    )
    if broker:
        warnings.insert(0, f"{broker} report recognised — {len(preview)} holding(s) read.")
    return preview, payloads, warnings, broker
