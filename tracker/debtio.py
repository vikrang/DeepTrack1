"""Import a family's own debt workbook ("Category / Deposit / Rate / Maturity …").

People keep deposits in a spreadsheet of their own making rather than DeepTrack's
template. This reader recognises the common Indian layout — one row per deposit,
columns for category, issuer, receipt number, deposit date, rate, maturity date,
amount and maturity amount — with or without an owner column. Each row is turned
into a regular investment payload (FD, RD, bond, PPF or small savings) so the
normal validation, preview and commit pipeline applies unchanged.

Anything the sheet cannot supply (a missing rate, an RD without a monthly
amount, an NPS row without a PRAN) is reported row by row instead of guessed.
"""

import re
from datetime import date, datetime

from openpyxl import load_workbook

from . import fields
from .excelio import MAX_IMPORT_ROWS, _label_for, _norm

COLUMN_KEYS = {
    "category": "category", "type": "category", "instrument": "category",
    "deposit": "issuer", "company": "issuer", "company name": "issuer", "issuer": "issuer",
    "bank": "issuer", "institution": "issuer", "bank nbfc": "issuer", "deposited with": "issuer",
    "deposit receipt": "receipt", "deposit receipt no": "receipt", "receipt no": "receipt",
    "receipt number": "receipt", "receipt no depost account no": "receipt",
    "receipt no deposit account no": "receipt", "account no": "receipt",
    "account number": "receipt", "fd account receipt no": "receipt", "certificate no": "receipt",
    "deposit date": "deposit_date", "date of deposit": "deposit_date", "start date": "deposit_date",
    "maturity date": "maturity_date", "date of maturity": "maturity_date",
    "rate": "rate", "interest rate": "rate", "interest": "rate", "int rate": "rate",
    "depost amount": "amount", "deposit amount": "amount", "amount": "amount",
    "principal": "amount", "amount deposited": "amount",
    "maturity": "maturity_amount", "maturity amount": "maturity_amount",
    "mode": "mode", "mode of payment": "mode", "bank acct mode of payment": "mode",
    "bank account": "mode", "bank acct": "mode",
    "remarks": "remarks", "status": "remarks", "note": "remarks", "notes": "remarks",
    "name": "owner", "owner": "owner", "member": "owner", "holder": "owner", "depositor": "owner",
    "interest frequency": "frequency", "frequency": "frequency", "compounding": "frequency",
    "payout": "frequency",
}

# Longest, most specific alias first: "ICICI Home Finance" must win over "ICICI".
BANK_ALIASES = (
    ("icici home", "ICICI Home Finance"),
    ("pnb housing", "PNB Housing Finance"),
    ("pnb home", "PNB Housing Finance"),
    ("lic housing", "LIC Housing Finance"),
    ("bajaj housing", "Bajaj Housing Finance"),
    ("sundaram home", "Other"),
    ("tamil nadu power", "Tamil Nadu Power Finance"),
    ("tamilnadu power", "Tamil Nadu Power Finance"),
    ("tnpf", "Tamil Nadu Power Finance"),
    ("au sfb", "AU Small Finance Bank"),
    ("au small", "AU Small Finance Bank"),
    ("suryoday", "Suryoday Small Finance Bank"),
    ("suryodhay", "Suryoday Small Finance Bank"),
    ("utkarsh", "Utkarsh Small Finance Bank"),
    ("northeast", "North East Small Finance Bank"),
    ("north east", "North East Small Finance Bank"),
    ("slice", "slice"),
    ("bajaj finance", "Bajaj Finance"),
    ("bajaj", "Bajaj Finance"),
    ("shriram", "Shriram Finance"),
    ("sundaram finance", "Sundaram Finance"),
    ("sundaram", "Sundaram Finance"),
    ("mahindra finance", "Mahindra Finance"),
    ("mahindra", "Mahindra Finance"),
    ("iifl", "IIFL Finance"),
    ("muthoot", "Muthoot Finance"),
    ("manappuram", "Manappuram Finance"),
    ("icici", "ICICI Bank"),
    ("kotak", "Kotak Mahindra Bank"),
    ("hdfc", "HDFC Bank"),
    ("indusind", "IndusInd Bank"),
    ("indus", "IndusInd Bank"),
    ("axis", "Axis Bank"),
    ("sbi", "State Bank of India"),
    ("state bank", "State Bank of India"),
    ("idfc", "IDFC FIRST Bank"),
    ("yes bank", "Yes Bank"),
    ("federal bank", "Federal Bank"),
    ("post office", "India Post"),
    ("india post", "India Post"),
)

FREQUENCIES = {
    "annual": "Annual", "yearly": "Annual", "per annum": "Annual",
    "semi annual": "Semi-annual", "semiannual": "Semi-annual", "half yearly": "Semi-annual",
    "quarterly": "Quarterly", "cumulative": "Cumulative",
}

BOND_HINTS = ("bond", "ncd", "debenture", "g sec", "gsec", "treasury", "floating rate")

CATEGORY_TYPES = {
    "bank fd": ("fd", None), "bank fixed deposit": ("fd", None),
    "corp fd": ("fd", None), "corporate fd": ("fd", None), "company fd": ("fd", None),
    "sfb deposit": ("fd", None), "fd": ("fd", None), "fixed deposit": ("fd", None),
    "rd": ("rd", None), "recurring deposit": ("rd", None),
    "ppf": ("ppf", None),
    "sukanya samridhi": ("small_savings", "Sukanya Samriddhi Yojana (SSY)"),
    "sukanya samriddhi": ("small_savings", "Sukanya Samriddhi Yojana (SSY)"),
    "sukanya": ("small_savings", "Sukanya Samriddhi Yojana (SSY)"),
    "ssy": ("small_savings", "Sukanya Samriddhi Yojana (SSY)"),
    "mis": ("small_savings", "Post Office MIS"),
    "nsc": ("small_savings", "National Savings Certificate (NSC)"),
    "kvp": ("small_savings", "Kisan Vikas Patra (KVP)"),
    "senior citizen": ("small_savings", "Senior Citizens' Savings Scheme (SCSS)"),
    "scss": ("small_savings", "Senior Citizens' Savings Scheme (SCSS)"),
    "govt bonds": ("bonds", "Government Security (G-Sec)"),
    "govt bond": ("bonds", "Government Security (G-Sec)"),
    "government bonds": ("bonds", "Government Security (G-Sec)"),
    "g sec": ("bonds", "Government Security (G-Sec)"),
    "corp bonds": ("bonds", "Corporate Bond"),
    "corporate bonds": ("bonds", "Corporate Bond"),
    "bonds": ("bonds", "Corporate Bond"),
    "bond": ("bonds", "Corporate Bond"),
    "ncd": ("bonds", "Debenture"),
    "debenture": ("bonds", "Debenture"),
    "gold": ("bonds", "Sovereign Gold Bond"),
    "sgb": ("bonds", "Sovereign Gold Bond"),
    "sovereign gold": ("bonds", "Sovereign Gold Bond"),
}


def _text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return str(value).strip()


def _number(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = _text(value).replace(",", "").replace("₹", "").replace("%", "").strip()
    if not text or not re.fullmatch(r"-?\d+(\.\d+)?", text):
        return None
    return float(text)


def _rate(value):
    rate = _number(value)
    if rate is None or rate <= 0:
        return None
    return round(rate * 100, 4) if rate < 1 else round(rate, 4)


def _day(value):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = _text(value)
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(text[:10], fmt).date()
        except ValueError:
            continue
    return None


def _plain(value) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9% ]+", " ", str(value or "").lower())).strip()


def _title(value) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[=]+", " ", _text(value))).strip()


def _issuer_bank(issuer: str):
    text = _plain(issuer)
    for alias, canonical in BANK_ALIASES:
        if alias in text:
            return canonical
    return None


def _scheme_for(issuer: str) -> str:
    text = _plain(issuer)
    if "sukanya" in text or "ssy" in text:
        return "Sukanya Samriddhi Yojana (SSY)"
    if "senior" in text or "scss" in text:
        return "Senior Citizens' Savings Scheme (SCSS)"
    if "nsc" in text:
        return "National Savings Certificate (NSC)"
    if "kvp" in text:
        return "Kisan Vikas Patra (KVP)"
    if "mis" in text:
        return "Post Office MIS"
    if "time deposit" in text or "td" == text:
        return "Post Office Time Deposit"
    return "Other"


def _resolve_type(category: str, issuer: str):
    key = _plain(category).replace("  ", " ")
    if key in CATEGORY_TYPES:
        return CATEGORY_TYPES[key]
    compact = key.replace(" ", "")
    if compact in ("bankfd", "corpfd", "sfbdeposit", "fd"):
        return ("fd", None)
    if compact == "rd":
        return ("rd", None)
    if compact == "ppf":
        return ("ppf", None)
    if compact == "nps" or "pension" in key:
        return ("nps", None)
    if key in ("post office", "postoffice", "post") or "post office" in key:
        return ("small_savings", _scheme_for(issuer))
    text = _plain(issuer)
    if key in ("bank", "corporate", "company", "other", ""):
        if any(hint in text for hint in BOND_HINTS):
            kind = "Debenture" if "ncd" in text else "Government Security (G-Sec)" if "rbi" in text or "govt" in text else "Corporate Bond"
            return ("bonds", kind)
        if "tax free" in text:
            return ("bonds", "Tax-Free Bond")
        return ("fd", None)
    return (None, None)


def _header_columns(ws):
    """Find the header row and map column indexes to our field names."""
    limit = min(ws.max_row or 0, 25)
    for row_idx, row in enumerate(ws.iter_rows(min_row=1, max_row=limit, values_only=True), start=1):
        mapping = {}
        for idx, cell in enumerate(row):
            key = COLUMN_KEYS.get(_norm(cell))
            if key and key not in mapping:
                mapping[key] = idx
        if "category" in mapping and "amount" in mapping:
            return mapping, row_idx
    return None, 0


def _owner_lookup(members):
    by_email = {m["email"].strip().lower(): m for m in members}
    by_name = {m["name"].strip().lower(): m for m in members}
    by_first = {}
    for member in members:
        by_first.setdefault(member["name"].strip().split()[0].lower(), []).append(member)
    return by_email, by_name, by_first


def _find_member(lookup, text):
    by_email, by_name, by_first = lookup
    lowered = text.strip().lower()
    if not lowered:
        return None
    if "@" in lowered:
        return by_email.get(lowered)
    member = by_name.get(lowered)
    if member:
        return member
    candidates = by_first.get(lowered) or []
    return candidates[0] if len(candidates) == 1 else None


def parse_debt_workbook(
    stream,
    members: list[dict],
    default_owner_id: int | None,
    existing_keys: set | None = None,
    existing_serial: dict | None = None,
    existing_fallback: set | None = None,
):
    """Read a custom debt sheet. Returns (preview_rows, payloads, warnings)."""
    try:
        wb = load_workbook(stream, data_only=True, read_only=True)
    except Exception as exc:  # noqa: BLE001
        raise ValueError("Could not read this file. Upload it as .xlsx.") from exc

    lookup = _owner_lookup(members)
    owner_names = {m["id"]: m["name"] for m in members}
    default_owner = next((m for m in members if m["id"] == default_owner_id), None)

    preview, payloads, notes = [], [], []
    matched = 0
    skipped = {}
    for ws in wb.worksheets:
        columns, header_row = _header_columns(ws)
        if columns is None:
            continue
        matched += 1
        rows = []
        for row_idx, row in enumerate(
            ws.iter_rows(min_row=1, max_row=min(ws.max_row or 0, MAX_IMPORT_ROWS + 25), values_only=True),
            start=1,
        ):
            rows.append((row_idx, row))

        for row_idx, row in rows:
            if row_idx <= header_row:
                continue

            def cell(key):
                idx = columns.get(key)
                return row[idx] if idx is not None and idx < len(row) else None

            category, issuer = _text(cell("category")), _text(cell("issuer"))
            if not category and not issuer:
                continue
            if any(_plain(v) in ("total", "grand total", "sub total") for v in (category, issuer) if v):
                continue
            amount = _number(cell("amount"))
            if not amount or amount <= 0:
                skipped[ws.title] = skipped.get(ws.title, 0) + 1
                continue
            type_key, flavour = _resolve_type(category, issuer)
            if type_key == "nps":
                skipped[ws.title] = skipped.get(ws.title, 0) + 1
                notes.append(
                    f"'{ws.title}' row {row_idx}: NPS needs its PRAN — add that account under "
                    "Debt → NPS instead of the sheet."
                )
                continue
            if type_key is None:
                skipped[ws.title] = skipped.get(ws.title, 0) + 1
                notes.append(f"'{ws.title}' row {row_idx}: category '{category}' not recognised — skipped.")
                continue

            deposit_date = _day(cell("deposit_date"))
            maturity_date = _day(cell("maturity_date"))
            warnings = []
            if maturity_date and maturity_date.year < 1990:
                retry = maturity_date.replace(year=maturity_date.year + 100)
                if not deposit_date or retry > deposit_date:
                    warnings.append(
                        f"Maturity year {maturity_date.year} looks like a typo — read as {retry.year}."
                    )
                    maturity_date = retry
            if maturity_date and deposit_date and maturity_date <= deposit_date:
                warnings.append(f"Maturity date {maturity_date.isoformat()} looks wrong — left blank.")
                maturity_date = None

            rate = _rate(cell("rate"))
            receipt = _text(cell("receipt")).lstrip(",; ")
            mode = _text(cell("mode"))
            remarks = _text(cell("remarks"))
            maturity_amount = _number(cell("maturity_amount"))
            issuer_name = _title(issuer) or _title(category)
            details = {}
            name = ""

            if type_key in ("fd", "rd"):
                bank = _issuer_bank(issuer_name)
                details["bank"] = bank if bank in fields.DEPOSIT_ISSUERS else "Other"
                if details["bank"] == "Other":
                    details["company_name"] = issuer_name
                details["account_no"] = receipt or None
                details["interest_rate"] = rate
                details["maturity_date"] = maturity_date
                details["primary_depositor"] = _title(cell("owner")) or None
                if type_key == "fd":
                    details["principal"] = amount
                label = "RD" if type_key == "rd" else "FD"
                shown = details["bank"] if details["bank"] != "Other" else issuer_name
                name = " · ".join(part for part in (f"{shown} {label}", receipt) if part)
            elif type_key == "bonds":
                text = _plain(issuer_name)
                kind = flavour
                if "tax free" in text:
                    kind = "Tax-Free Bond"
                elif flavour == "Corporate Bond" and ("rbi" in text or "govt" in text or "floating" in text):
                    kind = "Government Security (G-Sec)"
                details["issuer"] = issuer_name
                details["bond_kind"] = kind
                details["isin"] = receipt or None
                details["coupon_rate"] = rate
                details["maturity_date"] = maturity_date
                details["interest_frequency"] = FREQUENCIES.get(_plain(cell("frequency")))
                if kind == "Tax-Free Bond":
                    details["taxable"] = False
                name = " · ".join(part for part in (issuer_name, receipt) if part)
            elif type_key == "ppf":
                institution = _issuer_bank(issuer_name)
                options = ["India Post", *fields.BANKS]
                details["institution"] = institution if institution in options else None
                details["account_no"] = receipt
                details["interest_rate"] = rate
                name = " · ".join(part for part in ("PPF", details["institution"], receipt) if part)
            else:  # small_savings
                institution = _issuer_bank(issuer_name) or (
                    "India Post" if "post" in _plain(issuer_name) + _plain(category) else None
                )
                options = ["India Post", *fields.BANKS]
                details["scheme"] = flavour or _scheme_for(issuer_name)
                details["institution"] = institution if institution in options else None
                details["account_no"] = receipt or None
                details["deposit_amount"] = amount
                details["interest_rate"] = rate
                details["maturity_date"] = maturity_date
                details["primary_depositor"] = _title(cell("owner")) or None
                name = " · ".join(
                    part for part in (details["scheme"], details["institution"], receipt) if part
                )

            owner_text = _text(cell("owner"))
            if owner_text:
                member = _find_member(lookup, owner_text)
                owner_id = member["id"] if member else None
                owner_error = None if member else f"No member named {owner_text}"
                owner_name = member["name"] if member else owner_text
            elif default_owner:
                owner_id = default_owner["id"]
                owner_error = None
                owner_name = default_owner["name"]
            else:
                owner_id = None
                owner_error = "Choose the owner for this file"
                owner_name = ""

            note_bits = [f"From {ws.title} row {row_idx}."]
            if category:
                note_bits.append(f"Sheet category: {category}.")
            if mode and re.search(r"[A-Za-z0-9]", mode):
                note_bits.append(f"Mode / bank: {mode}.")
            if remarks and re.search(r"[A-Za-z0-9]", remarks):
                note_bits.append(remarks.rstrip(".") + ".")
            if maturity_amount:
                note_bits.append(f"Maturity value {maturity_amount:,.0f}.")
            payload = {
                "type": type_key,
                "name": name,
                "owner_id": owner_id,
                "invested_amount": amount,
                "current_value": amount,
                "start_date": deposit_date.isoformat() if deposit_date else None,
                "notes": " ".join(note_bits)[:2000],
            }
            payload.update({key: value for key, value in details.items() if value is not None})
            data, errors = fields.validate_investment(payload)
            if owner_error:
                errors.pop("owner_id", None)
                errors["owner_email"] = owner_error
            fixes = [
                {"field": key, "column": _label_for(type_key, key),
                 "message": message}
                for key, message in errors.items()
            ]
            preview_row = {
                "sheet": ws.title,
                "row": row_idx,
                "type": type_key,
                "type_label": fields.TYPES[type_key]["label"],
                "name": name or "(no name)",
                "owner": owner_name,
                "invested": data.get("invested_amount") if data else amount,
                "current": data.get("current_value") if data else amount,
                "errors": errors,
                "fixes": fixes,
                "warnings": warnings,
                "duplicate": False,
            }
            payloads.append({
                "preview": preview_row,
                "payload": payload,
                "valid": not errors,
                "duplicate": False,
                "update_id": None,
            })
            preview.append(preview_row)

    wb.close()
    if matched == 0:
        raise ValueError(
            "No deposit table found. The sheet needs a header row with Category, "
            "Deposit / Company, Deposit date, Rate, Maturity date and Deposit amount."
        )
    notes.append(
        "Each holding is saved at its deposit amount; maturity values and the sheet's "
        "remarks are kept in the holding's notes."
    )

    seen = set()
    seen_serial = {}
    seen_fallback = set()
    for item in payloads:
        if not item["valid"]:
            continue
        data, _ = fields.validate_investment(item["payload"])
        row_keys = fields.holding_keys(data)
        owner = data.get("owner_id")
        row_serials = fields.serial_keys(data)
        fingerprint = (
            owner, data.get("type"), (data.get("name") or "").strip().lower(),
            round(float(data.get("invested_amount") or 0), 2), data.get("start_date") or "",
        )
        if not row_keys and (
            fingerprint in seen_fallback or fingerprint in (existing_fallback or set())
        ):
            item["duplicate"] = True
            item["preview"]["duplicate"] = True
            item["preview"]["warnings"].append(
                "The same deposit (owner, amount and date) is already saved — this row will be skipped"
            )
        elif any(key in seen for key in row_keys):
            item["duplicate"] = True
            item["preview"]["duplicate"] = True
            item["preview"]["warnings"].append(
                "The same holding appears earlier in this file — this row will be skipped"
            )
        elif any(key in (existing_keys or set()) for key in row_keys):
            item["duplicate"] = True
            item["preview"]["duplicate"] = True
            item["preview"]["warnings"].append(
                "Already in your portfolio — this row will be skipped"
            )
        if not item["duplicate"]:
            for serial in row_serials:
                others = [name for oid, name in (existing_serial or {}).get(serial, {}).items() if oid != owner]
                others += [name for oid, name in seen_serial.get(serial, {}).items() if oid != owner]
                if others:
                    item["duplicate"] = True
                    item["preview"]["duplicate"] = True
                    item["preview"]["warnings"].append(
                        f"The same {_label_for(serial[0], serial[1])} is already recorded for "
                        f"{others[0]} — this row will be skipped"
                    )
                    break
        seen.update(row_keys)
        seen_fallback.add(fingerprint)
        for serial in row_serials:
            seen_serial.setdefault(serial, {})[owner] = owner_names.get(owner, "another member")

    for sheet, count in skipped.items():
        notes.append(
            f"'{sheet}': {count} row{'s' if count != 1 else ''} skipped — no deposit amount, "
            "a total row, or a notes line."
        )
    return preview, payloads, notes
