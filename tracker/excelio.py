"""Excel template generation, import parsing and portfolio export."""

import io
import re
from datetime import date, datetime

from openpyxl import Workbook, load_workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

from . import fields

CATEGORY_COLORS = {c["key"]: c["color"].lstrip("#") for c in fields.CATEGORIES}
HEADER_FILL = "1E293B"
MUTED = "64748B"
INR_FORMAT = '"₹ "#,##,##0.00'
PERCENT_FORMAT = '0.00"%"'
DATE_FORMAT = "DD-MMM-YYYY"
MAX_IMPORT_ROWS = 5000

COMMON_EXCEL = [
    ("invested_amount", "Amount invested", "number"),
    ("current_value", "Current value", "number"),
    ("start_date", "Purchase / start date", "date"),
]

QUANTITY_KEYS = {"quantity", "units", "weight_grams"}
AMOUNT_KEYS = {
    "principal", "deposit_amount", "monthly_amount", "premium_amount",
    "yearly_contribution", "employee_contribution", "registration_charges",
    "purchase_price", "face_value", "fund_value",
}

DEPOSIT_TYPES = {"fd", "rd", "small_savings"}
DEPOSIT_AMOUNT_KEYS = {"fd": "principal", "rd": "monthly_amount", "small_savings": "deposit_amount"}
DEPOSIT_NAME_PREFIX = {"fd": "FD", "rd": "RD", "small_savings": "Small savings"}

ALIASES = {
    "owner": "owner_email",
    "owner mail": "owner_email",
    "owner id": "owner_email",
    "member": "owner_email",
    "member email": "owner_email",
    "email": "owner_email",
    "amount": "invested_amount",
    "invested": "invested_amount",
    "amount invested": "invested_amount",
    "current": "current_value",
    "current val": "current_value",
    "start": "start_date",
    "purchase date": "start_date",
    "purchase start date": "start_date",
    "date of purchase": "start_date",
    "date of deposit": "start_date",
    "deposit date": "start_date",
    "reference no": "account_no",
    "reference number": "account_no",
    "tenure": "tenure_months",
    "tenure months": "tenure_months",
}


def _json_safe(value):
    """openpyxl hands back datetime objects for date cells; store ISO strings instead."""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _norm(value) -> str:
    text = str(value or "").lower().replace("₹", " ")
    text = re.sub(r"\(.*?\)", " ", text).replace("*", " ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return text.strip()


def _header(field, unit_override=None, label_override=None) -> str:
    label = label_override or field["label"]
    unit = unit_override or field.get("unit")
    if unit:
        label += f" ({unit})"
    if field.get("required"):
        label += " *"
    return label


def _sheet_title(type_meta) -> str:
    return type_meta["sheet"]


def _collect_lists(demat_labels=None, owner_names=None):
    """Unique dropdown lists referenced by data validation."""
    lists = []
    seen = {}
    list_for_field = {}

    def add(options):
        key = tuple(options)
        if not key:
            return None
        if key not in seen:
            seen[key] = f"List{len(lists) + 1}"
            lists.append({"key": seen[key], "options": list(options)})
        return seen[key]

    for type_meta in fields.TYPE_LIST:
        for field in type_meta["fields"]:
            if field.get("auto") or field.get("computed"):
                continue
            if field["input"] == "select":
                options = demat_labels if field.get("options_from") == "demat_accounts" else field.get("options")
                list_for_field[(type_meta["key"], field["key"])] = add(options or [])
            elif field["input"] == "boolean":
                list_for_field[(type_meta["key"], field["key"])] = add(["Yes", "No"])
    owner_list = add(owner_names or [])
    return lists, list_for_field, owner_list


def _template_fields(type_meta):
    """Raw inputs only: calculation results and auto-fetched values never sit in the sheet."""
    return [
        field for field in type_meta["fields"]
        if not (field.get("computed") or field.get("auto") or field.get("template") is False)
    ]


def _ordered_headers(type_meta, include_owner=True):
    headers = []
    for field in _template_fields(type_meta):
        headers.append((field["key"], _header(field), field["input"]))
    keys = [key for key, _label, _kind in headers]
    anchor = next((key for key in keys if key in QUANTITY_KEYS), None)
    if anchor is not None:
        position = keys.index(anchor) + 1
    else:
        position = next(
            (index for index, key in enumerate(keys) if key in AMOUNT_KEYS), len(headers)
        )
    headers.insert(position, ("start_date", "Purchase / start date", "date"))
    derive = type_meta.get("derive") or {}
    if "invested" not in derive:
        label = type_meta.get("invested_label", "Amount invested")
        headers.append(("invested_amount", f"{label} (₹)", "number"))
    if "value" not in derive:
        label = type_meta.get("value_label", "Current value")
        headers.append(("current_value", f"{label} (₹)", "number"))
    if include_owner:
        headers.append(("owner_email", "Owner", "text"))
    return headers


FD_DISPLAY_ONLY = {"maturity_date", "maturity_amount"}
FD_DISPLAY_ONLY_HELP = {
    "maturity_date": "Calculated from the date of purchase and tenor. Nothing to fill in.",
    "maturity_amount": "Calculated automatically: equals the amount deposited for a Fixed deposit, "
                       "principal plus interest for a Cumulative deposit.",
}
FD_FORMULA_ROWS = 500


def _fd_headers(type_meta, include_owner=True):
    """Fixed deposits lead with company, type, reference, amount, purchase date, rate and tenor."""
    by_key = {field["key"]: field for field in type_meta["fields"]}
    plan = [
        ("company_name", "Company name"),
        ("payout", None),
        ("account_no", "Reference no"),
        ("principal", "Amount deposited"),
        ("start_date", "Date of purchase"),
        ("interest_rate", None),
        ("tenor_years", "Tenor years"),
        ("tenor_months", "Tenor months"),
        ("tenor_days", "Tenor days"),
        ("compounding", None),
        ("maturity_date", "Maturity date"),
        ("maturity_amount", "Maturity amount"),
    ]
    headers = []
    for key, label in plan:
        if key == "start_date":
            headers.append((key, label, "date"))
            continue
        field = by_key.get(key)
        if field is None:
            continue
        if key in FD_DISPLAY_ONLY:
            kind = "date" if key == "maturity_date" else "number"
            headers.append((key, _header(field, label_override=label), kind))
            continue
        headers.append((key, _header(field, label_override=label) if label else _header(field), field["input"]))
    placed = {key for key, _label, _kind in headers}
    for field in _template_fields(type_meta):
        if field["key"] in placed:
            continue
        headers.append((field["key"], _header(field), field["input"]))
    derive = type_meta.get("derive") or {}
    if "value" not in derive:
        label = type_meta.get("value_label", "Current value")
        headers.append(("current_value", f"{label} (₹)", "number"))
    if include_owner:
        headers.append(("owner_email", "Owner", "text"))
    return headers


def _deposit_headers(type_meta, include_owner=True):
    """Deposit tabs lead with amount, reference no, deposit date, tenor, rate and maturity."""
    if type_meta["key"] == "fd":
        return _fd_headers(type_meta, include_owner=include_owner)
    by_key = {field["key"]: field for field in type_meta["fields"]}
    amount_key = DEPOSIT_AMOUNT_KEYS.get(type_meta["key"])
    headers = []
    if "company_name" in by_key:
        headers.append(("company_name", "Company name", "text"))
    if amount_key in by_key:
        amount_label = "Monthly deposit" if amount_key == "monthly_amount" else "Amount deposited"
        headers.append((amount_key, _header(by_key[amount_key], label_override=amount_label), "number"))
    if "account_no" in by_key:
        headers.append(("account_no", "Reference no", "text"))
    headers.append(("start_date", "Date of deposit", "date"))
    for key, label in (
        ("tenor_years", "Tenor years"),
        ("tenor_months", "Tenor months"),
        ("tenor_days", "Tenor days"),
    ):
        if key in by_key:
            headers.append((key, label, "number"))
    if "interest_rate" in by_key:
        headers.append(("interest_rate", _header(by_key["interest_rate"]), "number"))
    if "maturity_date" in by_key:
        headers.append(("maturity_date", "Maturity date", "date"))
    placed = {key for key, _label, _kind in headers}
    for field in _template_fields(type_meta):
        if field["key"] in placed:
            continue
        headers.append((field["key"], _header(field), field["input"]))
    derive = type_meta.get("derive") or {}
    if "value" not in derive:
        label = type_meta.get("value_label", "Current value")
        headers.append(("current_value", f"{label} (₹)", "number"))
    if include_owner:
        headers.append(("owner_email", "Owner", "text"))
    return headers


RECORD_ID_HEADER = ("public_id", "Record ID", "text")
RECORD_ID_HELP = (
    "Assigned by DeepTrack when a holding is saved, and unique across the whole portfolio. "
    "Leave it blank to add a new holding. Keep it unchanged to refer to an existing one; "
    "rows already in the portfolio are skipped on import."
)


def _sheet_headers(type_meta, include_name=True, include_owner=True):
    if type_meta["key"] in DEPOSIT_TYPES:
        headers = [("name", "Investment name", "text")] if include_name else []
        return [RECORD_ID_HEADER] + headers + _deposit_headers(type_meta, include_owner=include_owner)
    return [RECORD_ID_HEADER, ("name", "Investment name", "text")] + _ordered_headers(
        type_meta, include_owner=include_owner
    )


def _field_labels(type_meta):
    """Map field keys to the column heading the user sees on that tab."""
    headers = _sheet_headers(type_meta, include_name=type_meta["key"] not in DEPOSIT_TYPES)
    labels = {key: re.sub(r"\s*\*$", "", label) for key, label, _kind in headers}
    labels.setdefault("start_date", "Purchase / start date")
    labels["name"] = "Company name, bank or scheme" if type_meta["key"] in DEPOSIT_TYPES else "Investment name"
    labels.setdefault("owner_email", "Owner")
    return labels


FIX_FILL = "FCE4E6"


def fix_report_bytes(entries):
    """Workbook containing only the rows that failed, with each failing cell highlighted."""
    groups = {}
    for entry in entries:
        type_meta = fields.TYPES.get((entry.get("payload") or {}).get("type"))
        if type_meta is None:
            continue
        groups.setdefault(type_meta["key"], []).append(entry)

    wb = Workbook()
    wb.remove(wb.active)
    for type_key, items in groups.items():
        type_meta = fields.TYPES[type_key]
        headers = _sheet_headers(type_meta, include_name=type_key not in DEPOSIT_TYPES)
        ws = wb.create_sheet(_sheet_title(type_meta)[:31])
        color = CATEGORY_COLORS[type_meta["category"]]
        for col, (_key, label, _kind) in enumerate(headers, start=1):
            _style_header(ws.cell(row=1, column=col, value=label), color)
        fix_col = len(headers) + 1
        _style_header(ws.cell(row=1, column=fix_col, value="What to fix"), "B91C1C")

        for row_idx, entry in enumerate(items, start=2):
            payload = entry.get("payload") or {}
            preview = entry.get("preview") or {}
            fixes = preview.get("fixes") or []
            bad = {fix["field"]: fix["message"] for fix in fixes}
            for col, (key, _label, kind) in enumerate(headers, start=1):
                value = payload.get(key)
                if key == "owner_email":
                    value = preview.get("owner") or ""
                if key == "maturity_amount":
                    value = None
                cell = ws.cell(row=row_idx, column=col)
                if value is not None and str(value) != "":
                    cell.value = value
                    if kind == "number" and isinstance(value, (int, float)):
                        cell.number_format = INR_FORMAT if key in {
                            "principal", "monthly_amount", "deposit_amount", "invested_amount", "current_value",
                        } else "General"
                cell.font = Font(size=10)
                if key in bad:
                    cell.fill = PatternFill("solid", fgColor=FIX_FILL)
                    cell.font = Font(size=10, bold=True, color="9B1C1C")
                    _add_comment(cell, f"Fix this column: {bad[key]}")
            fix_cell = ws.cell(
                row=row_idx,
                column=fix_col,
                value="\n".join(f"{fix['column']}: {fix['message']}" for fix in fixes),
            )
            fix_cell.alignment = Alignment(wrap_text=True, vertical="top")
            fix_cell.font = Font(size=10)
            ws.row_dimensions[row_idx].height = max(16, 14 * max(1, len(fixes)))
        ws.column_dimensions[get_column_letter(fix_col)].width = 48
        ws.freeze_panes = "B2"

    stream = io.BytesIO()
    wb.save(stream)
    return stream.getvalue()


def _auto_deposit_name(type_key, type_meta, raw):
    parts = [DEPOSIT_NAME_PREFIX.get(type_key, type_meta["label"])]
    anchor = str(raw.get("company_name") or "").strip()
    bank = str(raw.get("bank") or "").strip()
    if not anchor and bank and bank.lower() != "other":
        anchor = bank
    anchor = anchor or raw.get("scheme") or raw.get("institution")
    if anchor:
        parts.append(str(anchor).strip())
    if raw.get("account_no"):
        parts.append(str(raw["account_no"]).strip())
    return " · ".join(parts)


def _style_header(cell, color):
    cell.font = Font(bold=True, color="FFFFFF", size=10)
    cell.fill = PatternFill("solid", fgColor=color)
    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    cell.border = Border(bottom=Side(style="thin", color="CBD5E1"))
    cell.font = Font(bold=True, color="FFFFFF", size=10)


def _add_comment(cell, text):
    if not text:
        return
    comment = Comment(text, "DeepTrack")
    comment.width = 280
    comment.height = 110
    cell.comment = comment


def _write_fd_formulas(ws, headers):
    """Pre-fill the two calculated columns so Excel shows maturity while the user types."""
    cols = {key: (idx, get_column_letter(idx)) for idx, (key, _label, _kind) in enumerate(headers, start=1)}
    needed = ("start_date", "principal", "interest_rate", "tenor_years", "tenor_months",
              "tenor_days", "payout", "compounding", "maturity_date", "maturity_amount")
    if not all(key in cols for key in needed):
        return
    maturity_idx, maturity = cols["maturity_date"]
    amount_idx, maturity_amount = cols["maturity_amount"]
    start, amount, rate, kind, freq = (cols[key][1] for key in
                                       ("start_date", "principal", "interest_rate", "payout", "compounding"))
    years, months, days = (cols[key][1] for key in ("tenor_years", "tenor_months", "tenor_days"))
    for r in range(2, FD_FORMULA_ROWS + 2):
        per_year = (f'IF({freq}{r}="Annual",1,IF({freq}{r}="Half-yearly",2,'
                    f'IF({freq}{r}="Monthly",12,4)))')
        dates = f'DATE(ROW(INDIRECT(YEAR({start}{r})&":"&YEAR({maturity}{r}))),3,0)'
        leap = (f"SUMPRODUCT((DAY({dates})=29)*({dates}>{start}{r})*({dates}<={maturity}{r}))")
        years_expr = f"(({maturity}{r}-{start}{r})-{leap})/365"
        date_formula = (
            f'=IF({start}{r}="","",IF(AND(N({years}{r})=0,N({months}{r})=0,N({days}{r})=0),"",'
            f"EDATE({start}{r},N({years}{r})*12+N({months}{r}))+N({days}{r})))"
        )
        amount_formula = (
            f'=IF(OR({start}{r}="",{maturity}{r}=""),"",IF({kind}{r}<>"Cumulative",{amount}{r},'
            f'IF({freq}{r}="Simple",{amount}{r}*(1+{rate}{r}/100*{years_expr}),'
            f"{amount}{r}*(1+{rate}{r}/100/{per_year})^({per_year}*{years_expr}))))"
        )
        date_cell = ws.cell(row=r, column=maturity_idx, value=date_formula)
        date_cell.number_format = DATE_FORMAT
        date_cell.font = Font(size=10)
        amount_cell = ws.cell(row=r, column=amount_idx, value=amount_formula)
        amount_cell.number_format = INR_FORMAT
        amount_cell.font = Font(size=10)


def _write_sheet(wb, type_meta, list_ranges, list_for_field, rows=None, owner_list=None, include_owner=True):
    """rows: list of dicts {name, details, invested_amount, current_value, start_date, notes, owner_name}"""
    ws = wb.create_sheet(_sheet_title(type_meta))
    ws.sheet_properties.tabColor = CATEGORY_COLORS[type_meta["category"]]
    headers = _sheet_headers(
        type_meta,
        include_name=bool(rows) or type_meta["key"] not in DEPOSIT_TYPES,
        include_owner=include_owner,
    )

    for col, (key, label, kind) in enumerate(headers, start=1):
        cell = ws.cell(row=1, column=col, value=label)
        _style_header(cell, CATEGORY_COLORS[type_meta["category"]])
        field_meta = next((f for f in type_meta["fields"] if f["key"] == key), None)
        if key == "public_id":
            _add_comment(cell, RECORD_ID_HELP)
        elif type_meta["key"] == "fd" and key in FD_DISPLAY_ONLY:
            _add_comment(cell, FD_DISPLAY_ONLY_HELP[key])
        elif field_meta and field_meta.get("help"):
            _add_comment(cell, field_meta["help"])
        elif field_meta and field_meta["input"] == "select":
            options = field_meta.get("options")
            if options:
                _add_comment(cell, "Options: " + ", ".join(options))
            elif field_meta.get("options_from") == "demat_accounts":
                _add_comment(cell, "Pick one of the demat accounts saved under Masters.")
        elif key == "owner_email":
            _add_comment(cell, "Pick the member who owns this investment. Leave blank to assign it to you.")
        width = max(14, min(len(label) + 4, 34))
        ws.column_dimensions[get_column_letter(col)].width = width

    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "C2" if headers and headers[0][0] == "name" else "B2"
    last_col = get_column_letter(len(headers))
    ws.auto_filter.ref = f"A1:{last_col}1"

    data_rows = rows or []
    for r_idx, row in enumerate(data_rows, start=2):
        details = row.get("details") or {}
        for col, (key, _label, kind) in enumerate(headers, start=1):
            if key == "owner_email":
                value = row.get("owner_name") or row.get("owner_email")
            elif key in ("public_id", "name", "invested_amount", "current_value", "start_date"):
                value = row.get(key)
            elif key == "demat_id":
                value = details.get("demat_label") or (
                    f"{details.get('broker')} · {details.get('demat_account')}"
                    if details.get("broker") and details.get("demat_account") else None
                )
            else:
                value = details.get(key)
            if kind == "date" and isinstance(value, str) and value:
                try:
                    value = datetime.strptime(value, "%Y-%m-%d").date()
                except ValueError:
                    pass
            cell = ws.cell(row=r_idx, column=col, value=value)
            cell.font = Font(size=10)
            if kind == "number":
                if key in ("invested_amount", "current_value") or _is_amount_field(type_meta, key):
                    cell.number_format = INR_FORMAT
                elif _is_percent_field(type_meta, key):
                    cell.number_format = PERCENT_FORMAT
            elif kind == "date":
                cell.number_format = DATE_FORMAT

    if not rows and type_meta["key"] == "fd":
        _write_fd_formulas(ws, headers)

    if rows:
        for col in range(1, len(headers) + 1):
            letter = get_column_letter(col)
            for row_idx in range(2, len(rows) + 2):
                ws.cell(row=row_idx, column=col).alignment = Alignment(vertical="center")

    # Data validation for every input column
    for col, (key, _label, kind) in enumerate(headers, start=1):
        letter = get_column_letter(col)
        rng = f"{letter}2:{letter}{MAX_IMPORT_ROWS}"
        field_meta = next((f for f in type_meta["fields"] if f["key"] == key), None)
        if type_meta["key"] == "fd" and key in FD_DISPLAY_ONLY:
            continue
        if key == "owner_email":
            if owner_list and owner_list in list_ranges:
                dv = DataValidation(type="list", formula1=list_ranges[owner_list], allow_blank=True)
                dv.error = "Pick one of the members listed."
                dv.errorTitle = "Unknown member"
                dv.showErrorMessage = True
                ws.add_data_validation(dv)
                dv.add(rng)
            continue
        if field_meta and field_meta["input"] in ("select", "boolean"):
            list_name = list_for_field.get((type_meta["key"], key))
            if list_name and list_name in list_ranges:
                dv = DataValidation(type="list", formula1=list_ranges[list_name], allow_blank=True)
                dv.error = "Pick a value from the dropdown list."
                dv.errorTitle = "Invalid choice"
                dv.showErrorMessage = True
                ws.add_data_validation(dv)
                dv.add(rng)
        elif kind == "number":
            dv = DataValidation(type="decimal", operator="greaterThanOrEqual", formula1="0", allow_blank=True)
            dv.error = "Enter a number of zero or more."
            dv.errorTitle = "Invalid number"
            dv.showErrorMessage = True
            ws.add_data_validation(dv)
            dv.add(rng)
        elif kind == "date":
            dv = DataValidation(
                type="date", operator="between", formula1="DATE(1950,1,1)", formula2="DATE(2100,12,31)",
                allow_blank=True,
            )
            dv.error = "Enter a valid date, e.g. 31-03-2026."
            dv.errorTitle = "Invalid date"
            dv.showErrorMessage = True
            ws.add_data_validation(dv)
            dv.add(rng)
    return ws


def _is_amount_field(type_meta, key):
    return key in {"principal", "monthly_amount", "deposit_amount", "premium_amount", "sum_assured",
                   "face_value", "purchase_price", "avg_buy_price", "ltp", "avg_nav", "current_nav",
                   "avg_price", "current_price", "current_value", "invested_amount", "sip_amount",
                   "yearly_contribution", "employee_contribution", "employer_contribution",
                   "registration_charges", "loan_outstanding", "monthly_rent", "fund_value"}


def _is_percent_field(_type_meta, key):
    return key in {"interest_rate", "coupon_rate", "ownership_pct", "annuity_pct"}


def _readme_sheet(wb):
    ws = wb.create_sheet("Read me", 0)
    ws.sheet_properties.tabColor = "4F46E5"
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 34
    ws.column_dimensions["C"].width = 94
    ws.merge_cells("B2:C2")
    title = ws["B2"]
    title.value = "DeepTrack — bulk import template"
    title.font = Font(size=20, bold=True, color="0F172A")
    ws.row_dimensions[2].height = 30
    ws.merge_cells("B3:C3")
    ws["B3"].value = "One row per investment. Use the tab that matches the investment type and pick values from the dropdowns."
    ws["B3"].font = Font(size=11, color=MUTED)
    ws.row_dimensions[3].height = 22

    steps = [
        ("1. Pick the right tab", "There is one tab per instrument type, colour-coded by asset class. Only fill tabs you need."),
        ("2. Fill one row per holding", "Columns marked * are required. Everything else is optional but improves reporting. Deposit tabs have no name column; DeepTrack names each deposit from the bank or scheme and reference number."),
        ("3. Use the dropdowns", "Columns with a small arrow have validated lists based on Indian banks, AMCs, insurers, exchanges and more."),
        ("4. Only raw inputs", "Calculated columns (maturity amount, derived totals) and fetched columns (sector, market price, exchange, broker) are not in this sheet; the two maturity columns on the fixed deposit tab are the exception and fill themselves in. DeepTrack recalculates on import and refreshes prices from Market data."),
        ("5. Dates", "Purchase / start date sits right after quantity. Fixed deposits run company, type, reference no, amount, date of purchase, interest rate, tenor and interest frequency. Use DD-MM-YYYY, e.g. 31-03-2026."),
        ("6. Tenor & maturity", "Enter the tenor (years, months, days). Maturity date and maturity amount are calculated columns on the fixed deposit tab — they show automatically and need no input. If the bank statement only gives the maturity date, paste it and leave the tenor blank; DeepTrack works out the tenor. On recurring deposits and small savings you can enter either the tenor or the maturity date."),
        ("7. Owner", "The blank template has no Owner column: every row is saved under the member who signs in and uploads it. Exports do include an Owner column, so backups keep each holding with its member."),
        ("8. Upload", "Save the file and upload it in DeepTrack under Import. You will see a preview before anything is saved."),
    ]
    row = 5
    for heading, body in steps:
        ws.cell(row=row, column=2, value=heading).font = Font(size=11, bold=True, color="312E81")
        cell = ws.cell(row=row, column=3, value=body)
        cell.font = Font(size=11, color="334155")
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        ws.row_dimensions[row].height = 34 if len(body) > 95 else 22
        row += 1

    row += 1
    ws.cell(row=row, column=2, value="Asset classes and tabs").font = Font(size=13, bold=True, color="0F172A")
    row += 1
    for cat in fields.CATEGORIES:
        ws.cell(row=row, column=2, value=cat["label"]).font = Font(
            size=11, bold=True, color=cat["color"].lstrip("#").upper()
        )
        types = [t["label"] for t in fields.TYPE_LIST if t["category"] == cat["key"]]
        body = ws.cell(row=row, column=3, value=", ".join(types))
        body.font = Font(size=11, color="334155")
        row += 1

    row += 1
    ws.cell(row=row, column=2, value="Example row (Mutual funds tab)").font = Font(size=13, bold=True, color="0F172A")
    row += 1
    example = [
        ("Record ID", "(leave blank — DeepTrack assigns one when the holding is saved)"),
        ("Investment name", "Parag Parikh Flexi Cap Fund"),
        ("AMC", "Parag Parikh MF"),
        ("Scheme category", "Flexi Cap"),
        ("Plan / Option", "Direct / Growth"),
        ("Units held", "412.665"),
        ("Average NAV / Current NAV", "₹ 62.40 / ₹ 74.18"),
        ("Amount invested", "₹ 25,750.00 (auto-computed if left blank)"),
    ]
    for label, value in example:
        ws.cell(row=row, column=2, value=label).font = Font(size=10, color=MUTED)
        ws.cell(row=row, column=3, value=value).font = Font(size=10, color="0F172A")
        row += 1

    row += 1
    note = ws.cell(row=row, column=2, value="Important")
    note.font = Font(size=12, bold=True, color="B91C1C")
    body = ws.cell(
        row=row, column=3,
        value="Do not rename or reorder the tabs and do not change the header row — the importer relies on both. "
              "Empty rows are ignored. Every saved holding is given a unique Record ID; keep it with the row and "
              "it is recognised exactly, so a corrected re-upload only adds the rows that are new. Leave Record ID "
              "blank for new holdings.",
    )
    body.font = Font(size=10, color="334155")
    body.alignment = Alignment(wrap_text=True, vertical="top")
    ws.row_dimensions[row].height = 46
    return ws


def _guide_sheet(wb, include_owner=True):
    ws = wb.create_sheet("Field guide", 1)
    ws.sheet_properties.tabColor = "94A3B8"
    ws.sheet_view.showGridLines = False
    headers = ["Tab", "Field", "Required", "Input", "Options / notes"]
    widths = [26, 30, 10, 12, 72]
    for idx, (label, width) in enumerate(zip(headers, widths), start=1):
        cell = ws.cell(row=1, column=idx, value=label)
        _style_header(cell, HEADER_FILL)
        ws.column_dimensions[get_column_letter(idx)].width = width
    ws.freeze_panes = "A2"
    row = 2
    for type_meta in fields.TYPE_LIST:
        include_name = type_meta["key"] not in DEPOSIT_TYPES
        for key, label, kind in _sheet_headers(
            type_meta, include_name=include_name, include_owner=include_owner
        ):
            if key == "name":
                values = [type_meta["sheet"], label, "Yes", "text", type_meta.get("name_placeholder", "")]
            elif key == "owner_email":
                values = [type_meta["sheet"], label, "", "member",
                          "Pick a member name. Blank = the importing member"]
            elif key == "invested_amount":
                values = [type_meta["sheet"], label, "", "number", "Rupees, e.g. 150000"]
            elif key == "current_value":
                values = [type_meta["sheet"], label, "", "number",
                          "Defaults to the invested amount when blank"]
            elif key == "start_date":
                values = [type_meta["sheet"], label, "", "date", "DD-MM-YYYY"]
            elif type_meta["key"] == "fd" and key in FD_DISPLAY_ONLY:
                values = [type_meta["sheet"], label, "", kind, FD_DISPLAY_ONLY_HELP[key]]
            else:
                fld = next((f for f in type_meta["fields"] if f["key"] == key), {})
                extra = " | ".join(fld.get("options") or []) or fld.get("help") or ""
                values = [type_meta["sheet"], label, "Yes" if fld.get("required") else "", kind, extra]
            for col, value in enumerate(values, start=1):
                cell = ws.cell(row=row, column=col, value=value)
                cell.font = Font(size=9, color="334155")
                cell.alignment = Alignment(vertical="top", wrap_text=col == 5)
            row += 1
        if type_meta["key"] in DEPOSIT_TYPES:
            values = [type_meta["sheet"], "Investment name (auto)", "", "text",
                      "Built from the company, bank or scheme and the reference number"]
            for col, value in enumerate(values, start=1):
                cell = ws.cell(row=row, column=col, value=value)
                cell.font = Font(size=9, color="334155")
                cell.alignment = Alignment(vertical="top", wrap_text=col == 5)
            row += 1
    return ws


def _lists_sheet(wb, lists):
    ws = wb.create_sheet("_lists")
    ws.sheet_state = "hidden"
    for idx, item in enumerate(lists, start=1):
        letter = get_column_letter(idx)
        ws.cell(row=1, column=idx, value=item["key"]).font = Font(bold=True, size=9, color="FFFFFF")
        ws.cell(row=1, column=idx).fill = PatternFill("solid", fgColor="334155")
        for r, option in enumerate(item["options"], start=2):
            ws.cell(row=r, column=idx, value=option).font = Font(size=9)
        ws.column_dimensions[letter].width = 24
    return ws


def build_workbook(rows_by_type=None, demat_labels=None, owner_names=None, include_owner=True) -> Workbook:
    lists, list_for_field, owner_list = _collect_lists(demat_labels, owner_names)
    wb = Workbook()
    wb.remove(wb.active)
    _readme_sheet(wb)
    _guide_sheet(wb, include_owner=include_owner)
    list_ranges = {}
    for item in lists:
        idx = lists.index(item) + 1
        letter = get_column_letter(idx)
        list_ranges[item["key"]] = f"_lists!${letter}$2:${letter}${len(item['options']) + 1}"
    for type_meta in fields.TYPE_LIST:
        _write_sheet(
            wb, type_meta, list_ranges, list_for_field,
            (rows_by_type or {}).get(type_meta["key"], []), owner_list,
            include_owner=include_owner,
        )
    _lists_sheet(wb, lists)
    wb.active = 0
    return wb


def _to_bytes(wb) -> bytes:
    buffer = io.BytesIO()
    wb.save(buffer)
    buffer.seek(0)
    return buffer.getvalue()


def _demat_labels():
    try:
        from . import services
        return [account["display"] for account in services.demat_accounts()]
    except RuntimeError:
        return []


def _owner_names():
    try:
        from . import db
        return [row["name"] for row in db.query("SELECT name FROM users ORDER BY name")]
    except RuntimeError:
        return []


def template_bytes(demat_labels=None, owner_names=None) -> bytes:
    labels = _demat_labels() if demat_labels is None else demat_labels
    owners = _owner_names() if owner_names is None else owner_names
    return _to_bytes(build_workbook(demat_labels=labels, owner_names=owners, include_owner=False))


def export_bytes(rows: list[dict], demat_labels=None, owner_names=None) -> bytes:
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row["type"], []).append(row)
    labels = _demat_labels() if demat_labels is None else demat_labels
    owners = _owner_names() if owner_names is None else owner_names
    return _to_bytes(build_workbook(grouped, demat_labels=labels, owner_names=owners))


def _build_header_map(type_meta) -> dict:
    mapping = {}
    for fld in type_meta["fields"]:
        mapping[_norm(fld["label"])] = fld["key"]
        mapping[_norm(_header(fld))] = fld["key"]
        mapping[_norm(fld["key"])] = fld["key"]
    mapping.update({
        "investment name": "name",
        "name": "name",
        "amount invested": "invested_amount",
        "current value": "current_value",
        "purchase start date": "start_date",
        "start date": "start_date",
        "notes": "notes",
        "owner email": "owner_email",
        "owner": "owner_email",
        "record id": "public_id",
        "deeptrack id": "public_id",
        "deeptrack record id": "public_id",
    })
    for key, label, _kind in COMMON_EXCEL:
        mapping[_norm(label)] = key
    mapping[_norm(type_meta.get("invested_label") or "Amount invested")] = "invested_amount"
    mapping[_norm(type_meta.get("value_label") or "Current value")] = "current_value"
    mapping.update(ALIASES)
    amount_key = DEPOSIT_AMOUNT_KEYS.get(type_meta["key"])
    if amount_key:
        mapping["amount deposited"] = amount_key
    return mapping


def _label_for(type_key, field):
    return _field_labels(fields.TYPES[type_key]).get(field) or str(field).replace("_", " ")


def _join_names(names):
    unique = list(dict.fromkeys(names))
    if len(unique) <= 1:
        return unique[0] if unique else "another member"
    return ", ".join(unique[:-1]) + " and " + unique[-1]


def parse_workbook(
    stream,
    members: list[dict],
    default_owner_id: int,
    existing_keys: set | None = None,
    existing_serial: dict | None = None,
    existing_ids: set | None = None,
):
    """Parse an uploaded workbook. Returns (preview_rows, payloads, warnings)."""
    try:
        wb = load_workbook(stream, data_only=True, read_only=False)
    except Exception as exc:  # noqa: BLE001
        raise ValueError("Could not read this file. Upload an .xlsx template downloaded from DeepTrack.") from exc

    by_email = {}
    by_name = {}
    by_first_name = {}
    for member in members:
        by_email[member["email"].lower()] = member
        by_name[member["name"].strip().lower()] = member
        first = member["name"].strip().split()[0].lower()
        by_first_name.setdefault(first, []).append(member)
    default_owner = next((m for m in members if m["id"] == default_owner_id), None)
    default_owner_name = default_owner["name"] if default_owner else "You"

    def find_member(text):
        lowered = text.lower()
        if "@" in lowered:
            return by_email.get(lowered)
        member = by_name.get(lowered)
        if member is None:
            candidates = {c["id"]: c for c in by_first_name.get(lowered, [])}
            if len(candidates) == 1:
                member = next(iter(candidates.values()))
        return member

    preview, payloads, sheet_warnings = [], [], []
    recognised = 0
    for ws in wb.worksheets:
        type_key = fields.SHEETS.get(ws.title)
        if not type_key:
            continue
        recognised += 1
        type_meta = fields.TYPES[type_key]
        header_map = _build_header_map(type_meta)
        labels = _field_labels(type_meta)
        headers = [header_map.get(_norm(cell.value)) for cell in ws[1]]
        if not any(headers):
            sheet_warnings.append(f"'{ws.title}' skipped: header row not recognised.")
            continue
        for row_idx, row in enumerate(
            ws.iter_rows(min_row=2, max_row=min(ws.max_row, MAX_IMPORT_ROWS + 1), values_only=True), start=2
        ):
            if row is None or all(cell is None or str(cell).strip() == "" for cell in row):
                continue
            raw = {}
            for key, value in zip(headers, row):
                if key and value is not None and str(value).strip() != "":
                    raw[key] = _json_safe(value)
            if not raw:
                continue
            if type_key == "fd":
                raw.pop("maturity_amount", None)
            record_id = str(raw.pop("public_id", "") or "").strip().upper()

            payload = {"type": type_key}
            payload.update({k: v for k, v in raw.items() if k != "owner_email"})
            if record_id:
                payload["public_id"] = record_id

            owner_raw = str(raw.get("owner_email") or "").strip()
            if owner_raw:
                member = find_member(owner_raw)
                if member:
                    payload["owner_id"] = member["id"]
                    owner_error = None
                    owner_name = member["name"]
                else:
                    payload["owner_id"] = None
                    owner_error = f"No member named {owner_raw}"
                    owner_name = owner_raw
            else:
                payload["owner_id"] = default_owner_id
                owner_error = None
                owner_name = default_owner_name

            name = str(raw.get("name") or "").strip()
            if not name and type_key in DEPOSIT_TYPES:
                name = _auto_deposit_name(type_key, type_meta, raw)
                payload["name"] = name

            demat_raw = payload.get("demat_id")
            if demat_raw not in (None, ""):
                account = fields.resolve_demat(demat_raw, payload.get("owner_id"))
                payload["demat_id"] = account["id"] if account else -1

            data, errors = fields.validate_investment(payload)
            if owner_error:
                errors["owner_email"] = owner_error
            known_id = bool(record_id) and record_id in (existing_ids or set())
            if record_id and not known_id:
                errors["public_id"] = (
                    "This record ID is not in the portfolio — clear the cell to import it as a new holding"
                )
            fixes = [
                {
                    "field": key,
                    "column": labels.get(key) or str(key).replace("_", " ").capitalize(),
                    "message": message,
                }
                for key, message in errors.items()
            ]

            preview_row = {
                "sheet": ws.title,
                "row": row_idx,
                "type": type_key,
                "type_label": type_meta["label"],
                "name": name or "(no name)",
                "owner": owner_name,
                "invested": data.get("invested_amount") if data else None,
                "current": data.get("current_value") if data else None,
                "errors": errors,
                "fixes": fixes,
                "warnings": [],
                "duplicate": False,
            }
            if not errors:
                if not raw.get("name") and type_key in DEPOSIT_TYPES:
                    preview_row["warnings"].append(f"Named automatically as {name}")
                derived_invested, derived_value = fields._derive_values(type_meta, data.get("details") or {})
                if "invested_amount" not in raw and derived_invested is not None:
                    preview_row["warnings"].append("Amount invested computed from the fields provided")
                if "current_value" not in raw:
                    if derived_value is not None:
                        preview_row["warnings"].append("Current value computed from the fields provided")
                    elif data.get("current_value") == data.get("invested_amount"):
                        preview_row["warnings"].append("Current value defaults to invested amount")
                row_keys = fields.holding_keys(data)
                if known_id:
                    preview_row["duplicate"] = True
                    preview_row["warnings"].append(
                        f"Already in your portfolio (record {record_id}) — this row will be skipped"
                    )
                elif existing_keys and any(key in existing_keys for key in row_keys):
                    preview_row["duplicate"] = True
                    preview_row["warnings"].append("Already in your portfolio — this row will be skipped")
                else:
                    for serial in fields.serial_keys(data):
                        holders = [
                            name for owner_id, name in (existing_serial or {}).get(serial, {}).items()
                            if owner_id != data.get("owner_id")
                        ]
                        if not holders:
                            continue
                        preview_row["duplicate"] = True
                        column = labels.get(serial[1]) or str(serial[1]).replace("_", " ")
                        preview_row["warnings"].append(
                            f"Already recorded for {_join_names(holders)} under the same {column} — "
                            "this row will be skipped"
                        )
                        break
            preview.append(preview_row)
            payloads.append({
                "preview": preview_row,
                "payload": payload,
                "valid": not errors,
                "duplicate": preview_row["duplicate"],
            })

    if recognised == 0:
        raise ValueError(
            "No DeepTrack tabs found. Use a template downloaded from DeepTrack and keep the tab names unchanged."
        )

    counts = {}
    for item in payloads:
        if not item["valid"]:
            continue
        data, _ = fields.validate_investment(item["payload"])
        for key in fields.holding_keys(data):
            counts[key] = counts.get(key, 0) + 1
    owner_names = {m["id"]: m["name"] for m in members}
    seen = set()
    seen_serial = {}
    seen_ids = set()
    for item in payloads:
        if not item["valid"]:
            continue
        data, _ = fields.validate_investment(item["payload"])
        row_keys = fields.holding_keys(data)
        owner = data.get("owner_id")
        row_serials = fields.serial_keys(data)
        record_id = str(item["payload"].get("public_id") or "")
        if record_id in seen_ids and not item["duplicate"]:
            item["duplicate"] = True
            item["preview"]["duplicate"] = True
            item["preview"]["warnings"].append(
                f"The record ID {record_id} appears earlier in this file — this row will be skipped"
            )
        if record_id:
            seen_ids.add(record_id)
        if any(key in seen for key in row_keys) and not item["duplicate"]:
            item["duplicate"] = True
            item["preview"]["duplicate"] = True
            item["preview"]["warnings"].append(
                "The same holding appears earlier in this file — this row will be skipped"
            )
        if not item["duplicate"]:
            for serial in row_serials:
                others = [name for oid, name in seen_serial.get(serial, {}).items() if oid != owner]
                if others:
                    item["duplicate"] = True
                    item["preview"]["duplicate"] = True
                    column = _label_for(serial[0], serial[1])
                    item["preview"]["warnings"].append(
                        f"The same {column} appears earlier in this file for {_join_names(others)} — "
                        "this row will be skipped"
                    )
                    break
        seen.update(row_keys)
        for serial in row_serials:
            seen_serial.setdefault(serial, {})[owner] = owner_names.get(owner, "another member")
        if any(counts.get(key, 0) > 1 for key in row_keys) and not item["duplicate"]:
            item["preview"]["warnings"].append("Another row in this file describes the same holding")

    return preview, payloads, sheet_warnings
