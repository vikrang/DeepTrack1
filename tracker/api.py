"""JSON API for DeepTrack."""

import json
import re
import secrets
import threading
import time
from datetime import date, datetime, timedelta, timezone
from functools import wraps
from io import BytesIO
from urllib.parse import urlsplit

import requests
from flask import Blueprint, g, jsonify, request, send_file, session
from werkzeug.security import check_password_hash, generate_password_hash

from . import config, db, excelio, fields, firebase, market, seed, services
from .validators import (
    parse_date,
    validate_account_number,
    validate_aadhaar,
    validate_email,
    validate_ifsc,
    validate_pan,
    validate_phone,
)

bp = Blueprint("api", __name__, url_prefix="/api")

ALLOWED_ROLES = ("admin", "viewer")


def _existing_record_ids() -> set:
    return {row["public_id"] for row in db.query("SELECT public_id FROM investments WHERE public_id IS NOT NULL")}


def _existing_identity():
    """Everything already saved: per-member identities plus serials held by another member."""
    keys = set()
    serial = {}
    names = {row["id"]: row["name"] for row in db.query("SELECT id, name FROM users")}
    for row in db.query("SELECT owner_id, type, name, details FROM investments"):
        try:
            details = json.loads(row["details"] or "{}")
        except (TypeError, ValueError):
            details = {}
        data = {
            "owner_id": row["owner_id"],
            "type": row["type"],
            "name": row["name"],
            "details": details,
        }
        keys.update(fields.holding_keys(data))
        for key in fields.serial_keys(data):
            serial.setdefault(key, {})[row["owner_id"]] = names.get(row["owner_id"], "another member")
    return keys, serial


TOKEN_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")
ATTEMPT_LIMIT = 8
ATTEMPT_WINDOW = 600
_attempts: dict[str, tuple[int, float]] = {}
_attempt_lock = threading.Lock()


# ---------------------------------------------------------------- helpers


def current_user():
    uid = session.get("uid")
    if not uid:
        return None
    if "user" not in g:
        g.user = db.query_one("SELECT * FROM users WHERE id = ?", (uid,))
        if g.user is None:
            session.clear()
    return g.user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user():
            return jsonify(error="Please sign in to continue"), 401
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify(error="Please sign in to continue"), 401
        if user["role"] != "admin":
            return jsonify(error="Only admins can make this change"), 403
        return fn(*args, **kwargs)

    return wrapper


@bp.before_request
def block_cross_site_writes():
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        origin = request.headers.get("Origin")
        if origin and urlsplit(origin).netloc != request.host:
            return jsonify(error="Cross-site request blocked"), 403
    return None


def body() -> dict:
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def password_problem(password: str):
    if not password or len(password) < 8:
        return "Use at least 8 characters"
    if not any(ch.isalpha() for ch in password) or not any(ch.isdigit() for ch in password):
        return "Include at least one letter and one number"
    return None


def _attempt_key() -> str:
    return request.remote_addr or "local"


def _rate_status() -> tuple[bool, int]:
    now = time.time()
    with _attempt_lock:
        count, first = _attempts.get(_attempt_key(), (0, now))
        if now - first > ATTEMPT_WINDOW:
            count, first = 0, now
        if count >= ATTEMPT_LIMIT:
            return False, int(ATTEMPT_WINDOW - (now - first))
        _attempts[_attempt_key()] = (count + 1, first)
    return True, 0


def _rate_reset() -> None:
    with _attempt_lock:
        _attempts.pop(_attempt_key(), None)


def _owner_exists(owner_id) -> bool:
    if owner_id is None:
        return False
    return db.query_one("SELECT id FROM users WHERE id = ? AND is_active = 1", (owner_id,)) is not None


# ---------------------------------------------------------------- auth


@bp.get("/bootstrap")
def bootstrap():
    total = db.query_one("SELECT COUNT(*) AS c FROM users")["c"]
    user = current_user()
    return jsonify(
        needs_setup=total == 0,
        firebase_enabled=firebase.ready(),
        user=services.user_payload(user, user) if user else None,
    )


@bp.post("/setup")
def setup():
    total = db.query_one("SELECT COUNT(*) AS c FROM users")["c"]
    if total:
        return jsonify(error="This workspace already has members. Please sign in."), 409
    if firebase.ready():
        return jsonify(error="Use Google sign-in to create the workspace."), 403
    data = body()
    name = str(data.get("name") or "").strip()
    errors = {}
    if len(name) < 2:
        errors["name"] = "Enter your full name"
    try:
        email = validate_email(data.get("email"))
    except ValueError as exc:
        errors["email"] = str(exc)
        email = None
    problem = password_problem(str(data.get("password") or ""))
    if problem:
        errors["password"] = problem
    if errors:
        return jsonify(errors=errors), 422

    now = db.now()
    user_id = db.execute(
        """INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
           VALUES (?, ?, ?, 'admin', ?, ?)""",
        (name, email, generate_password_hash(data["password"]), now, now),
    )
    session.clear()
    session.permanent = True
    session["uid"] = user_id
    db.log_activity(user_id, "created", "Created the workspace", "member", user_id)
    row = db.query_one("SELECT * FROM users WHERE id = ?", (user_id,))
    return jsonify(user=services.user_payload(row, row)), 201


@bp.post("/login")
def login():
    if not firebase.password_login_enabled():
        return jsonify(error="Password sign-in is disabled. Continue with Google."), 403
    allowed, retry_after = _rate_status()
    if not allowed:
        return jsonify(error=f"Too many attempts. Try again in {retry_after // 60 + 1} minutes."), 429
    data = body()
    email = str(data.get("email") or "").strip().lower()
    password = str(data.get("password") or "")
    row = db.query_one("SELECT * FROM users WHERE email = ?", (email,))
    if row is None or not check_password_hash(row["password_hash"], password):
        return jsonify(error="Email or password is incorrect"), 401
    _rate_reset()
    session.clear()
    session.permanent = True
    session["uid"] = row["id"]
    return jsonify(user=services.user_payload(row, row))


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@bp.get("/auth/firebase-config")
def firebase_config():
    enabled = firebase.ready()
    return jsonify(
        enabled=enabled,
        allow_password=firebase.password_login_enabled(),
        config=firebase.client_config() if enabled else None,
    )


@bp.post("/auth/firebase")
def firebase_login():
    allowed, retry_after = _rate_status()
    if not allowed:
        return jsonify(error=f"Too many attempts. Try again in {retry_after // 60 + 1} minutes."), 429
    if not firebase.ready():
        return jsonify(error="Google sign-in is not configured on this server."), 503

    token = str(body().get("id_token") or "")
    try:
        claims = firebase.verify(token)
    except firebase.FirebaseError as exc:
        return jsonify(error=str(exc)), 401

    email = str(claims.get("email") or "").strip().lower()
    if not email or not claims.get("email_verified"):
        return jsonify(error="Use a Google account with a verified email address."), 403
    if not firebase.is_allowed(email):
        return jsonify(error=f"This Google account ({email}) is not on the access list."), 403

    row = db.query_one("SELECT * FROM users WHERE email = ?", (email,))
    if row is not None and not row["is_active"]:
        return jsonify(error="This account has been deactivated."), 403

    if row is None:
        total = db.query_one("SELECT COUNT(*) AS c FROM users")["c"]
        role = "admin" if (firebase.is_admin_email(email) or total == 0) else "viewer"
        name = str(claims.get("name") or email.split("@")[0]).strip()[:100] or email
        now = db.now()
        user_id = db.execute(
            """INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (name, email, generate_password_hash(secrets.token_urlsafe(32)), role, now, now),
        )
        db.log_activity(user_id, "joined", "Joined with Google", "member", user_id)
        row = db.query_one("SELECT * FROM users WHERE id = ?", (user_id,))

    _rate_reset()
    session.clear()
    session.permanent = True
    session["uid"] = row["id"]
    return jsonify(user=services.user_payload(row, row))


@bp.get("/me")
@login_required
def me():
    user = current_user()
    return jsonify(user=services.user_payload(user, user))


# ---------------------------------------------------------------- meta


@bp.get("/meta")
@login_required
def meta():
    user = current_user()
    payload = fields.meta()
    payload["me"] = services.user_payload(user, user)
    payload["members"] = [
        {"id": m["id"], "name": m["name"], "email": m["email"], "role": m["role"]}
        for m in services.member_totals()
    ]
    payload["demat_accounts"] = services.demat_accounts(
        None if user["role"] == "admin" else user["id"]
    )
    return jsonify(payload)


# ---------------------------------------------------------------- members


def _clean_member(data: dict, existing=None, *, actor, is_new: bool):
    errors = {}
    base = dict(existing) if existing else {}

    def pick(key):
        return data[key] if key in data else base.get(key)

    name = str(pick("name") or "").strip()
    if len(name) < 2:
        errors["name"] = "Enter the member's full name"
    elif len(name) > 100:
        errors["name"] = "Keep the name under 100 characters"

    try:
        email = validate_email(pick("email"))
    except ValueError as exc:
        errors["email"] = str(exc)
        email = None

    role = str(pick("role") or "viewer").strip().lower()
    if role not in ALLOWED_ROLES:
        errors["role"] = "Choose admin or viewer"
    if not is_new and actor["role"] != "admin" and role != base.get("role"):
        errors["role"] = "Only admins can change roles"

    try:
        pan = validate_pan(pick("pan"))
    except ValueError as exc:
        errors["pan"] = str(exc)
        pan = None
    try:
        aadhaar = validate_aadhaar(pick("aadhaar"))
    except ValueError as exc:
        errors["aadhaar"] = str(exc)
        aadhaar = None
    try:
        phone = validate_phone(pick("phone"))
    except ValueError as exc:
        errors["phone"] = str(exc)
        phone = None
    try:
        ifsc = validate_ifsc(pick("ifsc"))
    except ValueError as exc:
        errors["ifsc"] = str(exc)
        ifsc = None
    try:
        account_number = validate_account_number(pick("account_number"))
    except ValueError as exc:
        errors["account_number"] = str(exc)
        account_number = None

    dob = None
    raw_dob = pick("dob")
    if raw_dob:
        try:
            dob = parse_date(raw_dob)
            if dob and (dob >= date.today().isoformat() or dob < "1900-01-01"):
                errors["dob"] = "Enter a valid date of birth"
        except ValueError as exc:
            errors["dob"] = str(exc)

    address = str(pick("address") or "").strip()[:500]
    bank_name = str(pick("bank_name") or "").strip()[:120]
    bank_branch = str(pick("bank_branch") or "").strip()[:160]
    account_type = str(pick("account_type") or "").strip()
    if account_type and account_type not in fields.ACCOUNT_TYPES:
        errors["account_type"] = "Choose a valid account type"

    if email:
        clash = db.query_one("SELECT id FROM users WHERE email = ?", (email,))
        if clash and (not existing or clash["id"] != existing["id"]):
            errors["email"] = "Another member already uses this email"
    if pan:
        clash = db.query_one("SELECT id FROM users WHERE pan = ?", (pan,))
        if clash and (not existing or clash["id"] != existing["id"]):
            errors["pan"] = "Another member already uses this PAN"
    if aadhaar:
        clash = db.query_one("SELECT id FROM users WHERE aadhaar = ?", (aadhaar,))
        if clash and (not existing or clash["id"] != existing["id"]):
            errors["aadhaar"] = "Another member already uses this Aadhaar"

    values = {
        "name": name,
        "email": email,
        "role": role,
        "pan": pan,
        "aadhaar": aadhaar,
        "dob": dob,
        "phone": phone,
        "address": address or None,
        "bank_name": bank_name or None,
        "bank_branch": bank_branch or None,
        "ifsc": ifsc,
        "account_number": account_number,
        "account_type": account_type or None,
    }
    return values, errors


@bp.get("/members")
@login_required
def list_members():
    user = current_user()
    return jsonify(members=services.members_with_totals(user))


@bp.post("/members")
@admin_required
def create_member():
    actor = current_user()
    data = body()
    values, errors = _clean_member(data, actor=actor, is_new=True)
    problem = password_problem(str(data.get("password") or ""))
    if problem:
        errors["password"] = problem
    if errors:
        return jsonify(errors=errors), 422
    now = db.now()
    try:
        member_id = db.execute(
            """INSERT INTO users (name, email, password_hash, role, pan, aadhaar, dob, phone,
                                  address, bank_name, bank_branch, ifsc, account_number,
                                  account_type, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                values["name"], values["email"], generate_password_hash(data["password"]),
                values["role"], values["pan"], values["aadhaar"], values["dob"], values["phone"],
                values["address"], values["bank_name"], values["bank_branch"], values["ifsc"],
                values["account_number"], values["account_type"], now, now,
            ),
        )
    except Exception:  # noqa: BLE001 - unique constraints guard race conditions
        return jsonify(error="A member with these details already exists"), 409
    db.log_activity(actor["id"], "created", f"Added member {values['name']}", "member", member_id)
    row = db.query_one("SELECT * FROM users WHERE id = ?", (member_id,))
    return jsonify(member=services.user_payload(row, actor)), 201


@bp.put("/members/<int:member_id>")
@login_required
def update_member(member_id: int):
    actor = current_user()
    if actor["role"] != "admin" and actor["id"] != member_id:
        return jsonify(error="You can only edit your own profile"), 403
    existing = db.query_one("SELECT * FROM users WHERE id = ?", (member_id,))
    if existing is None:
        return jsonify(error="Member not found"), 404
    data = body()
    if actor["role"] != "admin" and "role" in data and data["role"] != existing["role"]:
        return jsonify(errors={"role": "Only admins can change roles"}), 422

    values, errors = _clean_member(data, existing, actor=actor, is_new=False)

    if existing["role"] == "admin" and values.get("role") == "viewer":
        admins = db.query_one("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")["c"]
        if admins <= 1:
            errors["role"] = "Keep at least one admin in the workspace"
    if existing["role"] == "admin" and "role" in data and data["role"] != "admin" and actor["id"] == member_id:
        admins = db.query_one("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")["c"]
        if admins <= 1:
            errors["role"] = "You are the only admin — promote someone else first"

    if errors:
        return jsonify(errors=errors), 422
    try:
        db.execute(
            """UPDATE users SET name = ?, email = ?, role = ?, pan = ?, aadhaar = ?, dob = ?,
                   phone = ?, address = ?, bank_name = ?, bank_branch = ?, ifsc = ?,
                   account_number = ?, account_type = ?, updated_at = ?
               WHERE id = ?""",
            (
                values["name"], values["email"], values["role"], values["pan"], values["aadhaar"],
                values["dob"], values["phone"], values["address"], values["bank_name"],
                values["bank_branch"], values["ifsc"], values["account_number"],
                values["account_type"], db.now(), member_id,
            ),
        )
    except Exception:  # noqa: BLE001
        return jsonify(error="A member with these details already exists"), 409
    db.log_activity(actor["id"], "updated", f"Updated member {values['name']}", "member", member_id)
    row = db.query_one("SELECT * FROM users WHERE id = ?", (member_id,))
    return jsonify(member=services.user_payload(row, actor))


@bp.post("/members/<int:member_id>/password")
@login_required
def change_password(member_id: int):
    actor = current_user()
    if actor["role"] != "admin" and actor["id"] != member_id:
        return jsonify(error="You can only change your own password"), 403
    existing = db.query_one("SELECT * FROM users WHERE id = ?", (member_id,))
    if existing is None:
        return jsonify(error="Member not found"), 404
    data = body()
    if actor["id"] == member_id:
        current = str(data.get("current_password") or "")
        if not check_password_hash(existing["password_hash"], current):
            return jsonify(errors={"current_password": "Current password is incorrect"}), 422
    problem = password_problem(str(data.get("new_password") or ""))
    if problem:
        return jsonify(errors={"new_password": problem}), 422
    if actor["id"] == member_id and data.get("current_password") == data.get("new_password"):
        return jsonify(errors={"new_password": "Choose a password you have not used here"}), 422
    db.execute(
        "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
        (generate_password_hash(data["new_password"]), db.now(), member_id),
    )
    db.log_activity(actor["id"], "updated", f"Changed password for {existing['name']}", "member", member_id)
    return jsonify(ok=True)


@bp.delete("/members/<int:member_id>")
@admin_required
def delete_member(member_id: int):
    actor = current_user()
    existing = db.query_one("SELECT * FROM users WHERE id = ?", (member_id,))
    if existing is None:
        return jsonify(error="Member not found"), 404
    if actor["id"] == member_id:
        return jsonify(error="You cannot remove your own account"), 409
    holdings = db.query_one("SELECT COUNT(*) AS c FROM investments WHERE owner_id = ?", (member_id,))["c"]
    if holdings:
        return jsonify(error=f"{existing['name']} still owns {holdings} holding(s). Reassign or delete them first."), 409
    if existing["role"] == "admin":
        admins = db.query_one("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")["c"]
        if admins <= 1:
            return jsonify(error="Keep at least one admin in the workspace"), 409
    db.execute("DELETE FROM users WHERE id = ?", (member_id,))
    db.log_activity(actor["id"], "deleted", f"Removed member {existing['name']}", "member", member_id)
    return jsonify(ok=True)


# ---------------------------------------------------------------- demat master


def _demat_payload_row(row):
    return services.demat_payload(row)


def _clean_demat(data: dict, existing=None, *, actor):
    errors = {}
    owner_id = data.get("owner_id", existing["owner_id"] if existing else actor["id"])
    try:
        owner_id = int(owner_id)
    except (TypeError, ValueError):
        owner_id = None
    if owner_id is None or not _owner_exists(owner_id):
        errors["owner_id"] = "Choose a member"
    elif actor["role"] != "admin" and owner_id != actor["id"]:
        errors["owner_id"] = "You can only add accounts for yourself"

    broker = str(data.get("broker", existing["broker"] if existing else "") or "").strip()
    if broker not in fields.BROKERS:
        errors["broker"] = "Pick the broker or DP from the list"

    client_id = str(data.get("client_id", existing["client_id"] if existing else "") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9-]{4,24}", client_id):
        errors["client_id"] = "Enter the 4-24 character client ID"

    label = str(data.get("label", existing["label"] if existing else "") or "").strip()[:60]

    if owner_id and client_id:
        clash = db.query_one(
            "SELECT id FROM demat_accounts WHERE owner_id = ? AND client_id = ? COLLATE NOCASE",
            (owner_id, client_id),
        )
        if clash and (not existing or clash["id"] != existing["id"]):
            errors["client_id"] = "This client ID is already saved for that member"
    return {"owner_id": owner_id, "broker": broker, "client_id": client_id, "label": label or None}, errors


@bp.get("/demat-accounts")
@login_required
def list_demat_accounts():
    actor = current_user()
    return jsonify(accounts=services.demat_accounts(None if actor["role"] == "admin" else actor["id"]))


@bp.post("/demat-accounts")
@admin_required
def create_demat_account():
    actor = current_user()
    values, errors = _clean_demat(body(), actor=actor)
    if errors:
        return jsonify(errors=errors), 422
    now = db.now()
    account_id = db.execute(
        """INSERT INTO demat_accounts (owner_id, broker, client_id, label, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (values["owner_id"], values["broker"], values["client_id"], values["label"], now, now),
    )
    db.log_activity(actor["id"], "created", f"Added demat account {values['client_id']}", "demat", account_id)
    row = db.query_one("SELECT * FROM demat_accounts WHERE id = ?", (account_id,))
    return jsonify(account=_demat_payload_row(row)), 201


@bp.put("/demat-accounts/<int:account_id>")
@admin_required
def update_demat_account(account_id: int):
    actor = current_user()
    existing = db.query_one("SELECT * FROM demat_accounts WHERE id = ?", (account_id,))
    if existing is None:
        return jsonify(error="Demat account not found"), 404
    values, errors = _clean_demat(body(), existing=existing, actor=actor)
    if errors:
        return jsonify(errors=errors), 422
    db.execute(
        """UPDATE demat_accounts SET owner_id = ?, broker = ?, client_id = ?, label = ?,
                                    updated_at = ? WHERE id = ?""",
        (values["owner_id"], values["broker"], values["client_id"], values["label"], db.now(), account_id),
    )
    db.log_activity(actor["id"], "updated", f"Updated demat account {values['client_id']}", "demat", account_id)
    row = db.query_one("SELECT * FROM demat_accounts WHERE id = ?", (account_id,))
    return jsonify(account=_demat_payload_row(row))


@bp.delete("/demat-accounts/<int:account_id>")
@admin_required
def delete_demat_account(account_id: int):
    actor = current_user()
    existing = db.query_one("SELECT * FROM demat_accounts WHERE id = ?", (account_id,))
    if existing is None:
        return jsonify(error="Demat account not found"), 404
    used = []
    for row in db.query("SELECT details FROM investments"):
        try:
            details = json.loads(row["details"] or "{}")
        except (TypeError, ValueError):
            continue
        if details.get("demat_id") == account_id:
            used.append(row)
    if used:
        return jsonify(error=f"{len(used)} holding(s) use this demat account. Edit them first."), 409
    db.execute("DELETE FROM demat_accounts WHERE id = ?", (account_id,))
    db.log_activity(actor["id"], "deleted", "Removed a demat account", "demat", account_id)
    return jsonify(ok=True)


# ---------------------------------------------------------------- IFSC


@bp.get("/ifsc/<code>")
@login_required
def ifsc_lookup(code: str):
    try:
        ifsc = validate_ifsc(code)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    cached = db.query_one("SELECT * FROM ifsc_cache WHERE ifsc = ?", (ifsc,))
    if cached:
        return jsonify(_ifsc_payload(cached, "cache"))

    try:
        response = requests.get(f"https://ifsc.razorpay.com/{ifsc}", timeout=6)
    except requests.RequestException:
        return jsonify(
            error="Bank lookup is unreachable right now. You can still type the bank and branch manually."
        ), 502
    if response.status_code == 404:
        return jsonify(error="That IFSC code was not found. Please check it and try again."), 404
    if response.status_code != 200:
        return jsonify(error="Bank lookup failed. Enter the branch details manually."), 502
    try:
        data = response.json()
    except ValueError:
        return jsonify(error="Bank lookup returned an unexpected response."), 502

    db.execute(
        """INSERT OR REPLACE INTO ifsc_cache
           (ifsc, bank, branch, address, city, state, contact, micr, upi, neft, rtgs, imps, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            ifsc, data.get("BANK"), data.get("BRANCH"), data.get("ADDRESS"), data.get("CITY"),
            data.get("STATE"), data.get("CONTACT"), data.get("MICR"),
            int(bool(data.get("UPI"))), int(bool(data.get("NEFT"))), int(bool(data.get("RTGS"))),
            int(bool(data.get("IMPS"))), db.now(),
        ),
    )
    cached = db.query_one("SELECT * FROM ifsc_cache WHERE ifsc = ?", (ifsc,))
    return jsonify(_ifsc_payload(cached, "live"))


def _ifsc_payload(row, source):
    return {
        "ifsc": row["ifsc"],
        "bank": row["bank"] or "",
        "branch": row["branch"] or "",
        "address": row["address"] or "",
        "city": row["city"] or "",
        "state": row["state"] or "",
        "contact": row["contact"] or "",
        "micr": row["micr"] or "",
        "upi": bool(row["upi"]),
        "neft": bool(row["neft"]),
        "rtgs": bool(row["rtgs"]),
        "source": source,
    }


# ---------------------------------------------------------------- market data


@bp.get("/scrips")
@login_required
def search_scrips():
    term = request.args.get("q", "").strip()
    if len(term) < market.SEARCH_MIN:
        return jsonify(items=[], hint="Type at least 3 characters")
    return jsonify(items=market.search(term))


@bp.get("/market/status")
@login_required
def market_status():
    return jsonify(status=market.status())


@bp.get("/market/download/equity-list")
@admin_required
def download_equity_list():
    try:
        payload = market.fetch_equity_list()
    except market.MarketError as exc:
        return jsonify(error=str(exc)), 502
    return send_file(
        BytesIO(payload),
        mimetype="text/csv",
        as_attachment=True,
        download_name="EQUITY_L.csv",
    )


@bp.get("/market/download/bhavcopy")
@admin_required
def download_bhavcopy():
    raw = request.args.get("date", "").strip()
    try:
        day = date.fromisoformat(raw) if raw else date.today()
    except ValueError:
        return jsonify(error="Choose a valid date"), 400
    if day > date.today():
        return jsonify(error="Pick today or an earlier trading date"), 400
    try:
        payload, filename, actual = market.fetch_bhavcopy(day)
    except market.MarketError as exc:
        return jsonify(error=str(exc)), 502
    response = send_file(
        BytesIO(payload),
        mimetype="application/zip" if payload[:2] == b"PK" else "text/csv",
        as_attachment=True,
        download_name=filename,
    )
    response.headers["X-Trade-Date"] = actual.isoformat()
    return response


@bp.post("/market/upload")
@admin_required
def market_upload():
    actor = current_user()
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return jsonify(error="Choose an EQUITY_L.csv or bhavcopy file to upload"), 400
    name = upload.filename.lower()
    if not name.endswith((".csv", ".zip", ".txt")):
        return jsonify(error="Upload the NSE .csv or .zip file"), 400
    data = upload.stream.read()
    if not data:
        return jsonify(error="That file is empty"), 400
    try:
        result = market.ingest(data, upload.filename)
    except ValueError as exc:
        return jsonify(error=str(exc)), 422
    if result["kind"] == "bhavcopy":
        summary = f"Uploaded NSE bhavcopy for {result['trade_date']} ({result['symbols']} scrips)"
    else:
        summary = f"Uploaded NSE equity list ({result['symbols']} scrips)"
    db.log_activity(actor["id"], "imported", summary, "market", None)
    return jsonify(result=result, status=market.status())


@bp.post("/market/refresh-prices")
@admin_required
def market_refresh():
    actor = current_user()
    if not db.query_one("SELECT COUNT(*) AS c FROM market_prices")["c"]:
        return jsonify(error="Upload a bhavcopy before updating market prices"), 409
    result = market.refresh_prices()
    if result["updated"]:
        db.log_activity(
            actor["id"], "updated",
            f"Updated market prices on {result['updated']} holding(s)", "market", None,
        )
    return jsonify(result=result, status=market.status())


# ---------------------------------------------------------------- investments


def _investment_rows(where="", args=()):
    return db.query(
        f"""SELECT i.*, u.name AS owner_name
            FROM investments i JOIN users u ON u.id = i.owner_id
            {where}
            ORDER BY i.updated_at DESC, i.id DESC""",
        args,
    )


@bp.get("/investments")
@login_required
def list_investments():
    items = [services.investment_payload(r) for r in _investment_rows()]
    category = request.args.get("category", "").strip()
    type_key = request.args.get("type", "").strip()
    owner = request.args.get("owner", "").strip()
    search = request.args.get("q", "").strip().lower()
    sort = request.args.get("sort", "updated").strip()
    direction = request.args.get("dir", "desc").strip().lower()

    if category:
        items = [i for i in items if i["category"] == category]
    if type_key:
        items = [i for i in items if i["type"] == type_key]
    if owner:
        items = [i for i in items if str(i["owner_id"]) == owner]
    if search:
        def matches(item):
            haystack = " ".join(
                [item["name"], item["owner"], item["type_label"], item["notes"]]
                + [str(v) for v in (item.get("details") or {}).values()]
            ).lower()
            return search in haystack

        items = [i for i in items if matches(i)]

    key_map = {
        "name": lambda i: i["name"].lower(),
        "invested": lambda i: i["invested_amount"],
        "current": lambda i: i["current_value"],
        "gain": lambda i: i["gain"],
        "date": lambda i: i["start_date"] or "",
        "owner": lambda i: i["owner"].lower(),
        "updated": lambda i: i["updated_at"] or "",
    }
    key = key_map.get(sort, key_map["updated"])
    items.sort(key=key, reverse=(direction != "asc"))

    invested = round(sum(i["invested_amount"] for i in items), 2)
    current = round(sum(i["current_value"] for i in items), 2)
    return jsonify(
        items=items,
        totals={
            "invested": invested,
            "value": current,
            "gain": round(current - invested, 2),
            "gain_pct": round((current - invested) / invested * 100, 2) if invested else 0,
            "count": len(items),
        },
    )


@bp.get("/investments/<int:item_id>")
@login_required
def get_investment(item_id: int):
    rows = _investment_rows("WHERE i.id = ?", (item_id,))
    if not rows:
        return jsonify(error="Investment not found"), 404
    return jsonify(investment=services.investment_payload(rows[0]))


@bp.post("/investments")
@admin_required
def create_investment():
    actor = current_user()
    data, errors = fields.validate_investment(body())
    if not _owner_exists(data.get("owner_id")) and "owner_id" not in errors:
        errors["owner_id"] = "Choose who owns this investment"
    if errors:
        return jsonify(errors=errors), 422
    now = db.now()
    item_id = db.execute(
        """INSERT INTO investments (public_id, owner_id, category, type, name, invested_amount, current_value,
                                    start_date, notes, details, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            db.new_public_id(), data["owner_id"], data["category"], data["type"], data["name"],
            data["invested_amount"], data["current_value"], data["start_date"], data["notes"],
            json.dumps(data["details"], ensure_ascii=False), actor["id"], now, now,
        ),
    )
    db.log_activity(
        actor["id"], "created", f"Added {data['name']}", "investment", item_id
    )
    rows = _investment_rows("WHERE i.id = ?", (item_id,))
    return jsonify(investment=services.investment_payload(rows[0])), 201


@bp.put("/investments/<int:item_id>")
@admin_required
def update_investment(item_id: int):
    actor = current_user()
    existing = db.query_one("SELECT * FROM investments WHERE id = ?", (item_id,))
    if existing is None:
        return jsonify(error="Investment not found"), 404
    data, errors = fields.validate_investment(body())
    if not _owner_exists(data.get("owner_id")) and "owner_id" not in errors:
        errors["owner_id"] = "Choose who owns this investment"
    if errors:
        return jsonify(errors=errors), 422
    db.execute(
        """UPDATE investments SET owner_id = ?, category = ?, type = ?, name = ?,
               invested_amount = ?, current_value = ?, start_date = ?, notes = ?, details = ?,
               updated_at = ?
           WHERE id = ?""",
        (
            data["owner_id"], data["category"], data["type"], data["name"],
            data["invested_amount"], data["current_value"], data["start_date"], data["notes"],
            json.dumps(data["details"], ensure_ascii=False), db.now(), item_id,
        ),
    )
    db.log_activity(actor["id"], "updated", f"Updated {data['name']}", "investment", item_id)
    rows = _investment_rows("WHERE i.id = ?", (item_id,))
    return jsonify(investment=services.investment_payload(rows[0]))


@bp.delete("/investments/<int:item_id>")
@admin_required
def delete_investment(item_id: int):
    actor = current_user()
    existing = db.query_one("SELECT name FROM investments WHERE id = ?", (item_id,))
    if existing is None:
        return jsonify(error="Investment not found"), 404
    db.execute("DELETE FROM investments WHERE id = ?", (item_id,))
    db.log_activity(actor["id"], "deleted", f"Deleted {existing['name']}", "investment", item_id)
    return jsonify(ok=True)


@bp.post("/investments/bulk-delete")
@admin_required
def bulk_delete_investments():
    actor = current_user()
    raw_ids = body().get("ids")
    if not isinstance(raw_ids, list) or not raw_ids:
        return jsonify(error="Select at least one holding to delete"), 400
    ids = []
    for value in raw_ids:
        try:
            item_id = int(value)
        except (TypeError, ValueError):
            continue
        if item_id > 0 and item_id not in ids:
            ids.append(item_id)
    if not ids:
        return jsonify(error="Select at least one holding to delete"), 400
    if len(ids) > 500:
        return jsonify(error="Delete up to 500 holdings at a time"), 400

    placeholders = ",".join("?" for _ in ids)
    rows = db.query(f"SELECT id, name FROM investments WHERE id IN ({placeholders})", ids)
    if not rows:
        return jsonify(error="Those holdings no longer exist"), 404
    db.execute(f"DELETE FROM investments WHERE id IN ({placeholders})", ids)
    names = [row["name"] for row in rows]
    preview = ", ".join(names[:3]) + (f" and {len(names) - 3} more" if len(names) > 3 else "")
    db.log_activity(
        actor["id"], "deleted",
        f"Deleted {len(rows)} holding(s): {preview}", "investment", None,
    )
    return jsonify(deleted=len(rows), ids=[row["id"] for row in rows])


@bp.get("/dashboard")
@login_required
def dashboard():
    return jsonify(dashboard=services.dashboard())


@bp.get("/activity")
@login_required
def activity():
    limit = min(max(int(request.args.get("limit", 30)), 1), 200)
    rows = db.query(
        """SELECT a.*, u.name AS user_name FROM activity a
           LEFT JOIN users u ON u.id = a.user_id
           ORDER BY a.id DESC LIMIT ?""",
        (limit,),
    )
    return jsonify(activity=[
        {
            "id": r["id"],
            "user": r["user_name"] or "Someone",
            "action": r["action"],
            "summary": r["summary"],
            "created_at": r["created_at"],
            "entity_type": r["entity_type"],
        }
        for r in rows
    ])


# ---------------------------------------------------------------- excel


@bp.get("/storage")
@admin_required
def storage_status():
    from . import cloud
    info = config.storage_status()
    info["cloud"] = cloud.status()
    if cloud.enabled():
        info["mode"] = "firebase"
        info["persistent"] = True
    return jsonify(info)


@bp.get("/template")
@login_required
def download_template():
    payload = excelio.template_bytes()
    return send_file(
        BytesIO(payload),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name="deeptrack-import-template.xlsx",
    )


@bp.get("/export")
@login_required
def export_portfolio():
    rows = db.query(
        """SELECT i.*, u.email AS owner_email, u.name AS owner_name
           FROM investments i JOIN users u ON u.id = i.owner_id
           ORDER BY u.name, i.type, i.name"""
    )
    export_rows = []
    for row in rows:
        try:
            details = json.loads(row["details"] or "{}")
        except (TypeError, ValueError):
            details = {}
        export_rows.append({
            "public_id": row["public_id"],
            "type": row["type"],
            "name": row["name"],
            "details": details,
            "invested_amount": row["invested_amount"],
            "current_value": row["current_value"],
            "start_date": row["start_date"],
            "notes": row["notes"],
            "owner_email": row["owner_email"],
            "owner_name": row["owner_name"],
        })
    payload = excelio.export_bytes(export_rows)
    return send_file(
        BytesIO(payload),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=f"deeptrack-portfolio-{date.today().isoformat()}.xlsx",
    )


@bp.post("/import/preview")
@admin_required
def import_preview():
    actor = current_user()
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return jsonify(error="Choose an Excel file to upload"), 400
    filename = upload.filename.lower()
    if not filename.endswith((".xlsx", ".xlsm")):
        return jsonify(error="Only .xlsx workbooks are supported. Download the template and fill it in."), 400

    members = [
        {"id": m["id"], "name": m["name"], "email": m["email"]}
        for m in services.member_totals()
    ]
    existing, existing_serial = _existing_identity()
    try:
        preview_rows, payloads, warnings = excelio.parse_workbook(
            upload.stream, members, actor["id"], existing, existing_serial, _existing_record_ids()
        )
    except ValueError as exc:
        return jsonify(error=str(exc)), 422

    token = secrets.token_urlsafe(18)
    store = {
        "user_id": actor["id"],
        "created_at": db.now(),
        "rows": [
            {"payload": p["payload"], "preview": p["preview"], "valid": p["valid"], "duplicate": p["duplicate"]}
            for p in payloads
        ],
    }
    (config.IMPORT_DIR / f"{token}.json").write_text(
        json.dumps(store, default=str), encoding="utf-8"
    )

    ready = sum(1 for p in payloads if p["valid"] and not p["duplicate"])
    duplicates = sum(1 for p in payloads if p["valid"] and p["duplicate"])
    invalid = sum(1 for p in payloads if not p["valid"])
    return jsonify(
        token=token,
        preview=preview_rows[:500],
        preview_truncated=len(preview_rows) > 500,
        rows=len(preview_rows),
        valid=ready,
        duplicates=duplicates,
        invalid=invalid,
        sheet_warnings=warnings,
        filename=upload.filename,
    )


def _import_store(actor):
    """Load the pending import session for this admin, or return an error response."""
    token = str(body().get("token") or "")
    if not TOKEN_RE.match(token):
        return None, None, (jsonify(error="This import session is invalid. Upload the file again."), 400)
    path = config.IMPORT_DIR / f"{token}.json"
    if not path.exists():
        return None, None, (jsonify(error="This import session has expired. Upload the file again."), 410)
    try:
        store = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None, None, (jsonify(error="Could not read this import session. Upload the file again."), 410)
    created = datetime.fromisoformat(store["created_at"])
    if created.tzinfo is None:
        created = created.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - created > timedelta(hours=2):
        path.unlink(missing_ok=True)
        return None, None, (jsonify(error="This import session has expired. Upload the file again."), 410)
    if store.get("user_id") != actor["id"]:
        return None, None, (jsonify(error="This import session belongs to another member"), 403)
    return store, path, None


@bp.post("/import/fix-workbook")
@admin_required
def import_fix_workbook():
    actor = current_user()
    store, _path, problem = _import_store(actor)
    if problem:
        return problem
    broken = [entry for entry in store.get("rows", []) if not entry.get("valid")]
    if not broken:
        return jsonify(error="Every row is ready to import, so there is nothing to fix."), 400
    payload = excelio.fix_report_bytes(broken)
    return send_file(
        BytesIO(payload),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name="deeptrack-rows-to-fix.xlsx",
    )


@bp.post("/import/commit")
@admin_required
def import_commit():
    actor = current_user()
    store, path, problem = _import_store(actor)
    if problem:
        return problem

    seen, seen_serial = _existing_identity()
    existing_ids = _existing_record_ids()
    names = {row["id"]: row["name"] for row in db.query("SELECT id, name FROM users")}
    now = db.now()
    imported = skipped = duplicates = 0
    conn = db.get_db()
    for entry in store.get("rows", []):
        if not entry.get("valid"):
            skipped += 1
            continue
        data, errors = fields.validate_investment(entry["payload"])
        if errors or not _owner_exists(data.get("owner_id")):
            skipped += 1
            continue
        owner = data.get("owner_id")
        record_id = str(entry["payload"].get("public_id") or "").strip().upper()
        row_keys = fields.holding_keys(data)
        row_serials = fields.serial_keys(data)
        already_mine = bool(record_id and record_id in existing_ids) or any(
            key in seen for key in row_keys
        )
        held_elsewhere = any(
            other != owner
            for serial in row_serials
            for other in seen_serial.get(serial, {})
        )
        if already_mine or held_elsewhere:
            duplicates += 1
            continue
        conn.execute(
            """INSERT INTO investments (public_id, owner_id, category, type, name, invested_amount,
                                        current_value, start_date, notes, details, created_by,
                                        created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                record_id or db.new_public_id(), data["owner_id"], data["category"], data["type"],
                data["name"], data["invested_amount"], data["current_value"], data["start_date"],
                data["notes"], json.dumps(data["details"], ensure_ascii=False), actor["id"], now, now,
            ),
        )
        if record_id:
            existing_ids.add(record_id)
        seen.update(row_keys)
        for serial in row_serials:
            seen_serial.setdefault(serial, {})[owner] = names.get(owner, "another member")
        imported += 1
    conn.commit()
    path.unlink(missing_ok=True)
    if imported:
        db.log_activity(actor["id"], "imported", f"Imported {imported} holding(s) from Excel", "investment", None)
    return jsonify(imported=imported, skipped=skipped, duplicates=duplicates)


@bp.post("/demo")
@admin_required
def load_demo():
    actor = current_user()
    existing = db.query_one("SELECT COUNT(*) AS c FROM investments")["c"]
    if existing:
        return jsonify(error="Demo data can only be loaded into an empty portfolio"), 409
    counts = seed.seed_demo(actor)
    db.log_activity(actor["id"], "imported", f"Loaded {counts['investments']} sample holdings", "workspace", None)
    return jsonify(**counts)
