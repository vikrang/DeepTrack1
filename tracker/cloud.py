"""Firebase Firestore as the cloud source of truth for the portfolio.

SQLite stays the local query engine (every existing SQL query keeps working), but
the durable copy of the family's data lives in Firestore. On startup the cloud copy
is loaded back into SQLite; after every successful change the current state is pushed
up again. The result: data always lives and is updated in the cloud, whichever machine
runs the app.

Only the family's own records are synced (members, holdings, demat accounts and the
activity log), plus any company logos someone uploaded by hand — these are chunked
into Firestore documents so they come back even on a host with no persistent disk.
Re-downloadable caches (NSE scrips/prices, IFSC lookups, auto-fetched logos) stay local.

The layer is inert until a Firebase service account is configured, so a plain local
install behaves exactly as before.
"""

import base64
import hashlib
import json
import os
import threading
from datetime import datetime

from . import db

# Tables that hold the family's real data, in dependency order for restore.
CORE_TABLES = ("users", "investments", "demat_accounts", "activity", "trash")

# Column whitelist per table (matches db.SCHEMA). Guards the restore against any
# unexpected keys and keeps the INSERT column list explicit.
COLUMNS = {
    "users": (
        "id", "name", "email", "password_hash", "role", "pan", "aadhaar", "dob",
        "phone", "address", "bank_name", "bank_branch", "ifsc", "account_number",
        "account_type", "created_at", "updated_at", "is_active",
    ),
    "investments": (
        "id", "public_id", "owner_id", "category", "type", "name", "invested_amount",
        "current_value", "start_date", "notes", "details", "created_by",
        "created_at", "updated_at",
    ),
    "demat_accounts": (
        "id", "owner_id", "broker", "client_id", "label", "created_at", "updated_at",
    ),
    "activity": (
        "id", "user_id", "action", "summary", "entity_type", "entity_id", "created_at",
    ),
    "trash": (
        "id", "entity", "label", "detail", "payload", "deleted_by", "deleted_at",
    ),
}

COLLECTION = "deeptrack_sync"
LOGO_COLLECTION = "deeptrack_logos"
LOGO_CHUNK = 400_000  # base64 characters per document, well under Firestore's 1 MiB
ACTIVITY_LIMIT = 500
TRASH_CLOUD_LIMIT = 100
SCHEMA_VERSION = 1

_state = {
    "client": None, "app": None, "synced_at": None, "last_error": None,
    "logo_sigs": {},
}
_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Configuration / availability
# ---------------------------------------------------------------------------

def _credential_info() -> dict | None:
    inline = os.environ.get("DEEPTRACK_FIREBASE_CREDENTIALS_JSON", "").strip()
    if inline:
        try:
            return json.loads(inline)
        except ValueError:
            return None
    path = os.environ.get("DEEPTRACK_FIREBASE_CREDENTIALS", "").strip()
    if path and os.path.isfile(path):
        try:
            with open(path, encoding="utf-8") as handle:
                return json.load(handle)
        except (OSError, ValueError):
            return None
    return None


def configured() -> bool:
    """True when a project and a service-account credential are present."""
    from . import firebase
    return bool(firebase.project_id() and _credential_info())


def enabled() -> bool:
    """True when cloud sync can actually run (configured + SDK importable)."""
    if not configured():
        return False
    try:
        import firebase_admin  # noqa: F401
        from firebase_admin import credentials  # noqa: F401
    except ImportError:
        return False
    return True


def _firestore():
    with _lock:
        if _state["client"] is not None:
            return _state["client"]
        import firebase_admin
        from firebase_admin import credentials, firestore

        info = _credential_info()
        if not info:
            raise RuntimeError("Firebase service account is not configured.")
        if not _state["app"]:
            cred = credentials.Certificate(info)
            _state["app"] = firebase_admin.initialize_app(
                cred, {"projectId": info.get("project_id")}
            )
        _state["client"] = firestore.client(_state["app"])
        return _state["client"]


# ---------------------------------------------------------------------------
# Pure serialize / restore (SQLite only — unit-testable without Firebase)
# ---------------------------------------------------------------------------

def _serialize(conn) -> dict:
    data = {}
    for table in CORE_TABLES:
        rows = [dict(row) for row in conn.execute(f"SELECT * FROM {table} ORDER BY id")]
        if table == "activity":
            rows = rows[-ACTIVITY_LIMIT:]
        elif table == "trash":
            rows = rows[-TRASH_CLOUD_LIMIT:]
        data[table] = rows
    return data


def _restore(conn, data: dict) -> None:
    """Replace the local core tables with the cloud copy, preserving ids/foreign keys."""
    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        for table in reversed(CORE_TABLES):
            conn.execute(f"DELETE FROM {table}")
        for table in CORE_TABLES:
            cols = COLUMNS[table]
            col_list = ", ".join(cols)
            placeholders = ", ".join("?" for _ in cols)
            for row in data.get(table, []):
                values = [row.get(col) for col in cols]
                conn.execute(
                    f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})", values
                )
        conn.commit()
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def _local_has_data(conn) -> bool:
    users = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()["c"]
    items = conn.execute("SELECT COUNT(*) AS c FROM investments").fetchone()["c"]
    return bool(users or items)


# ---------------------------------------------------------------------------
# Firestore I/O
# ---------------------------------------------------------------------------

def _has_snapshot(client) -> bool:
    return client.collection(COLLECTION).document("meta").get().exists


def _push(conn, client) -> None:
    data = _serialize(conn)
    stamp = db.now()
    batch = client.batch()
    for table in CORE_TABLES:
        ref = client.collection(COLLECTION).document(table)
        batch.set(ref, {"rows": data[table], "count": len(data[table]), "updated_at": stamp})
    meta = {
        "schema_version": SCHEMA_VERSION,
        "synced_at": stamp,
        "counts": {table: len(data[table]) for table in CORE_TABLES},
    }
    batch.set(client.collection(COLLECTION).document("meta"), meta)
    batch.commit()
    _state["synced_at"] = stamp
    _state["last_error"] = None


def _pull(client) -> dict:
    data = {}
    for table in CORE_TABLES:
        doc = client.collection(COLLECTION).document(table).get()
        payload = doc.to_dict() if doc.exists else None
        data[table] = (payload or {}).get("rows", []) if payload else []
    return data


# ---------------------------------------------------------------------------
# Uploaded logos (hand-picked images only — auto fetches can be redone)
# ---------------------------------------------------------------------------

def _stamp(value) -> datetime | None:
    try:
        stamp = datetime.fromisoformat(str(value or ""))
    except ValueError:
        return None
    return stamp


def _logo_meta(client) -> dict:
    doc = client.collection(COLLECTION).document("logos").get()
    payload = doc.to_dict() if getattr(doc, "exists", False) else None
    items = (payload or {}).get("items")
    return dict(items) if isinstance(items, dict) else {}


def _logo_chunks(client, slug: str, count: int) -> bytes | None:
    parts = []
    for index in range(count):
        doc = client.collection(LOGO_COLLECTION).document(f"{slug}~{index}").get()
        if not getattr(doc, "exists", False):
            return None
        data = (doc.to_dict() or {}).get("data")
        if not isinstance(data, str):
            return None
        parts.append(data)
    try:
        return base64.b64decode("".join(parts), validate=True)
    except Exception:  # noqa: BLE001 - a corrupted chunk just leaves the local logo alone
        return None


def _restore_logos(client) -> int:
    """Bring hand-picked logos down from Firestore when local copies are missing or older."""
    from . import logos

    try:
        items = _logo_meta(client)
    except Exception as exc:  # noqa: BLE001
        _state["last_error"] = str(exc)
        return 0
    if not items:
        return 0
    local = logos.entries()
    restored = 0
    for slug, meta in items.items():
        if not isinstance(meta, dict):
            continue
        count = int(meta.get("chunks") or 0)
        name = str(meta.get("name") or "").strip()
        if not count or not name:
            continue
        cloud_stamp = _stamp(meta.get("saved"))
        entry = local.get(slug) or {}
        if entry.get("custom") and entry.get("file"):
            local_stamp = _stamp(entry.get("saved"))
            if local_stamp and cloud_stamp and local_stamp > cloud_stamp:
                continue  # local upload is newer; the next push sends it up
            path = logos.folder() / entry["file"]
            if path.is_file() and meta.get("sha1"):
                digest = hashlib.sha1(path.read_bytes()).hexdigest()
                if digest == meta["sha1"]:
                    _state["logo_sigs"][slug] = digest
                    continue
        blob = _logo_chunks(client, slug, count)
        if not blob:
            continue
        digest = hashlib.sha1(blob).hexdigest()
        if meta.get("sha1") and digest != meta["sha1"]:
            continue
        stored = logos.restore(name, blob, saved=meta.get("saved"))
        if stored:
            _state["logo_sigs"][slug] = digest
            restored += 1
    return restored


def _push_logos(client, force: bool = False) -> int:
    """Upload changed hand-picked logos; untouched ones cost only a local hash."""
    from . import logos

    custom = {key: entry for key, entry in logos.entries().items() if entry.get("custom")}
    pending = {}
    for slug, entry in custom.items():
        path = logos.folder() / entry["file"]
        try:
            blob = path.read_bytes()
        except OSError:
            continue
        digest = hashlib.sha1(blob).hexdigest()
        if not force and _state["logo_sigs"].get(slug) == digest:
            continue
        pending[slug] = (entry, blob, digest)
    removed = [slug for slug in list(_state["logo_sigs"]) if slug not in custom]
    if not pending and not removed:
        return 0
    items = _logo_meta(client)
    changed = 0
    for slug, (entry, blob, digest) in pending.items():
        payload = base64.b64encode(blob).decode("ascii")
        parts = [payload[at:at + LOGO_CHUNK] for at in range(0, len(payload), LOGO_CHUNK)]
        old_count = int((items.get(slug) or {}).get("chunks") or 0)
        for index, part in enumerate(parts):
            client.collection(LOGO_COLLECTION).document(f"{slug}~{index}").set(
                {"slug": slug, "chunk": index, "data": part}
            )
        for index in range(len(parts), old_count):
            client.collection(LOGO_COLLECTION).document(f"{slug}~{index}").delete()
        items[slug] = {
            "name": entry.get("name") or slug,
            "file": entry["file"],
            "saved": entry.get("saved") or "",
            "chunks": len(parts),
            "sha1": digest,
            "bytes": len(blob),
        }
        _state["logo_sigs"][slug] = digest
        changed += 1
    for slug in removed:
        old_count = int((items.get(slug) or {}).get("chunks") or 0)
        for index in range(old_count):
            client.collection(LOGO_COLLECTION).document(f"{slug}~{index}").delete()
        items.pop(slug, None)
        _state["logo_sigs"].pop(slug, None)
    if changed or removed or force:
        client.collection(COLLECTION).document("logos").set(
            {"items": items, "count": len(items), "updated_at": db.now()}
        )
    return changed


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

def reconcile(conn) -> None:
    """At startup: load the cloud copy if present, otherwise migrate local data up."""
    if not enabled():
        return
    try:
        client = _firestore()
        if _has_snapshot(client):
            _restore(conn, _pull(client))
        elif _local_has_data(conn):
            _push(conn, client)
        restored = _restore_logos(client)
        if restored:
            print(f"[cloud] restored {restored} uploaded logo(s)", flush=True)
        _push_logos(client)
    except Exception as exc:  # noqa: BLE001 - never block startup on a network issue
        _state["last_error"] = str(exc)
        print(f"DeepTrack cloud sync unavailable at startup: {exc}", flush=True)


def push_current() -> None:
    """Write-through after a successful change. Never raises into the request."""
    if not enabled():
        return
    try:
        _push(db.get_db(), _firestore())
    except Exception as exc:  # noqa: BLE001
        _state["last_error"] = str(exc)
        print(f"DeepTrack cloud sync failed: {exc}", flush=True)
    try:
        _push_logos(_firestore())
    except Exception as exc:  # noqa: BLE001
        _state["last_error"] = str(exc)
        print(f"DeepTrack logo sync failed: {exc}", flush=True)


def status() -> dict:
    return {
        "enabled": enabled(),
        "synced_at": _state["synced_at"],
        "last_error": _state["last_error"],
    }


def setup(app) -> None:
    """Register startup reconcile and the write-through hook, if cloud is enabled."""
    if not enabled():
        return
    with app.app_context():
        reconcile(db.get_db())

    from flask import request

    skip = {"/api/logout", "/api/import/preview", "/api/import/fix-workbook"}

    @app.after_request
    def _cloud_sync(response):
        if (
            request.path.startswith("/api/")
            and request.path not in skip
            and request.method in {"POST", "PUT", "PATCH", "DELETE"}
            and response.status_code < 300
        ):
            push_current()
        return response