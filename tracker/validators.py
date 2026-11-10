"""Input parsing and Indian-format validation helpers."""

import re
from datetime import date, datetime

PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
PHONE_RE = re.compile(r"^[6-9]\d{9}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")


def parse_number(value, default=None):
    """Parse ints/floats and Indian or western formatted strings."""
    if value is None:
        return default
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return default
    negative = text.startswith("(") and text.endswith(")")
    text = text.replace("₹", "").replace("rs.", "").replace("rs", "")
    text = text.replace(",", "").replace("%", "").replace(" ", "")
    text = text.strip("()")
    try:
        number = float(text)
    except ValueError:
        raise ValueError("Enter a valid number")
    return -number if negative else number


def parse_date(value):
    """Return an ISO date string (YYYY-MM-DD) or raise ValueError."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value).strip()
    if not text:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d-%b-%Y", "%d %b %Y", "%d.%m.%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError("Use a date like 31-03-2026")


def normalize_pan(value):
    if not value:
        return ""
    return re.sub(r"[^A-Za-z0-9]", "", str(value)).upper()


def validate_pan(value):
    pan = normalize_pan(value)
    if not pan:
        return None
    if not PAN_RE.match(pan):
        raise ValueError("PAN should look like ABCDE1234F")
    return pan


def normalize_aadhaar(value):
    if not value:
        return ""
    return re.sub(r"\D", "", str(value))


def validate_aadhaar(value):
    digits = normalize_aadhaar(value)
    if not digits:
        return None
    if len(digits) != 12 or digits[0] in "01":
        raise ValueError("Aadhaar must be 12 digits and cannot start with 0 or 1")
    return digits


def validate_ifsc(value):
    if not value:
        return None
    code = str(value).strip().upper()
    if not IFSC_RE.match(code):
        raise ValueError("IFSC should look like HDFC0001234")
    return code


def validate_phone(value):
    if not value:
        return None
    digits = re.sub(r"\D", "", str(value))
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if not PHONE_RE.match(digits):
        raise ValueError("Enter a 10-digit Indian mobile number")
    return digits


def validate_email(value):
    text = (value or "").strip().lower()
    if not EMAIL_RE.match(text):
        raise ValueError("Enter a valid email address")
    return text


def validate_account_number(value):
    if not value:
        return None
    digits = re.sub(r"\s", "", str(value))
    if not digits.isdigit() or not 6 <= len(digits) <= 20:
        raise ValueError("Account number should be 6-20 digits")
    return digits


def mask_pan(value):
    if not value:
        return ""
    if len(value) <= 5:
        return value[:1] + "*" * max(len(value) - 1, 0)
    return value[:2] + "*" * (len(value) - 5) + value[-3:]


def mask_aadhaar(value):
    if not value:
        return ""
    return "XXXX XXXX " + value[-4:]


def mask_account(value):
    if not value:
        return ""
    return "•" * max(len(value) - 4, 0) + value[-4:]


def group_indian(number: float) -> str:
    """1234567.5 -> '12,34,567.50'"""
    negative = number < 0
    text = f"{abs(number):.2f}"
    whole, _, fraction = text.partition(".")
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        head = ",".join([head[max(0, i - 2):i] for i in range(len(head), 0, -2)][::-1])
        whole = f"{head},{tail}"
    result = f"{whole}.{fraction}"
    return f"-{result}" if negative else result
