"""SQLite access layer: connection handling, schema and small query helpers."""

import secrets
import sqlite3
from datetime import datetime, timezone

from flask import current_app, g

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    email           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash   TEXT    NOT NULL,
    role            TEXT    NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
    pan             TEXT,
    aadhaar         TEXT,
    dob             TEXT,
    phone           TEXT,
    address         TEXT,
    bank_name       TEXT,
    bank_branch     TEXT,
    ifsc            TEXT,
    account_number  TEXT,
    account_type    TEXT,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_pan
    ON users (pan) WHERE pan IS NOT NULL AND pan <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_aadhaar
    ON users (aadhaar) WHERE aadhaar IS NOT NULL AND aadhaar <> '';

CREATE TABLE IF NOT EXISTS investments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id       TEXT,
    owner_id        INTEGER NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    category        TEXT    NOT NULL CHECK (category IN ('equity', 'debt', 'other')),
    type            TEXT    NOT NULL,
    name            TEXT    NOT NULL,
    invested_amount REAL    NOT NULL DEFAULT 0,
    current_value   REAL    NOT NULL DEFAULT 0,
    start_date      TEXT,
    notes           TEXT,
    details         TEXT    NOT NULL DEFAULT '{}',
    created_by      INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at      TEXT    NOT NULL,
    updated_at      TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_investments_owner ON investments (owner_id);
CREATE INDEX IF NOT EXISTS idx_investments_category ON investments (category);
CREATE INDEX IF NOT EXISTS idx_investments_type ON investments (type);

CREATE TABLE IF NOT EXISTS transactions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    investment_id   INTEGER NOT NULL REFERENCES investments (id) ON DELETE CASCADE,
    trade_date      TEXT    NOT NULL,
    trade_time      TEXT,
    kind            TEXT    NOT NULL CHECK (kind IN ('buy', 'sell')),
    quantity        REAL    NOT NULL,
    price           REAL    NOT NULL,
    value           REAL    NOT NULL DEFAULT 0,
    product         TEXT,
    trade_type      TEXT,
    source          TEXT    NOT NULL DEFAULT 'kotak',
    fingerprint     TEXT    NOT NULL,
    created_by      INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at      TEXT    NOT NULL,
    UNIQUE (investment_id, fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_transactions_investment
    ON transactions (investment_id, trade_date);

CREATE TABLE IF NOT EXISTS activity (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER REFERENCES users (id) ON DELETE SET NULL,
    action      TEXT    NOT NULL,
    summary     TEXT    NOT NULL,
    entity_type TEXT,
    entity_id   INTEGER,
    created_at  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_created ON activity (created_at DESC);

CREATE TABLE IF NOT EXISTS ifsc_cache (
    ifsc        TEXT PRIMARY KEY,
    bank        TEXT,
    branch      TEXT,
    address     TEXT,
    city        TEXT,
    state       TEXT,
    contact     TEXT,
    micr        TEXT,
    upi         INTEGER,
    neft        INTEGER,
    rtgs        INTEGER,
    imps        INTEGER,
    fetched_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS demat_accounts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    broker      TEXT    NOT NULL,
    client_id   TEXT    NOT NULL,
    label       TEXT,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_demat_owner_client
    ON demat_accounts (owner_id, client_id COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS scrips (
    symbol       TEXT PRIMARY KEY,
    name         TEXT    NOT NULL,
    series       TEXT,
    isin         TEXT,
    listing_date TEXT,
    face_value   REAL,
    market_lot   INTEGER,
    updated_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scrips_name ON scrips (name);

CREATE TABLE IF NOT EXISTS market_prices (
    symbol       TEXT PRIMARY KEY,
    trade_date   TEXT    NOT NULL,
    series       TEXT,
    open_price   REAL,
    high_price   REAL,
    low_price    REAL,
    close_price  REAL    NOT NULL,
    prev_close   REAL,
    volume       INTEGER,
    turnover     REAL,
    updated_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_prices_date ON market_prices (trade_date);

CREATE TABLE IF NOT EXISTS market_meta (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mf_schemes (
    code        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    plan        TEXT NOT NULL,
    option      TEXT NOT NULL,
    full_name   TEXT NOT NULL,
    amc         TEXT,
    category    TEXT,
    isin_growth TEXT,
    isin_div    TEXT,
    nav         REAL,
    nav_date    TEXT,
    updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mf_schemes_name ON mf_schemes (name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS incomes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    investment_id INTEGER NOT NULL REFERENCES investments (id) ON DELETE CASCADE,
    owner_id      INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind          TEXT    NOT NULL CHECK (kind IN ('dividend', 'interest', 'rent', 'other')),
    amount        REAL    NOT NULL DEFAULT 0,
    status        TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'credited')),
    due_date      TEXT,
    credited_date TEXT,
    source        TEXT,
    source_ref    TEXT,
    notes         TEXT,
    created_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_incomes_investment ON incomes (investment_id);
CREATE INDEX IF NOT EXISTS idx_incomes_owner ON incomes (owner_id);
CREATE INDEX IF NOT EXISTS idx_incomes_status ON incomes (status);
CREATE INDEX IF NOT EXISTS idx_incomes_credited ON incomes (credited_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_incomes_source_ref
    ON incomes (source_ref) WHERE source_ref IS NOT NULL AND source_ref <> '';

CREATE TABLE IF NOT EXISTS corporate_actions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    investment_id INTEGER NOT NULL REFERENCES investments (id) ON DELETE CASCADE,
    symbol        TEXT,
    kind          TEXT    NOT NULL CHECK (kind IN ('dividend', 'bonus')),
    ex_date       TEXT    NOT NULL,
    detail        TEXT    NOT NULL DEFAULT '',
    value         REAL,
    source        TEXT,
    income_id     INTEGER REFERENCES incomes (id) ON DELETE SET NULL,
    applied_by    INTEGER REFERENCES users (id) ON DELETE SET NULL,
    applied_at    TEXT    NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_corporate_actions_unique
    ON corporate_actions (investment_id, kind, ex_date, detail);

CREATE TABLE IF NOT EXISTS import_files (
    file_hash   TEXT PRIMARY KEY,
    filename    TEXT NOT NULL,
    source      TEXT NOT NULL,
    rows        INTEGER NOT NULL DEFAULT 0,
    imported    INTEGER NOT NULL DEFAULT 0,
    updated     INTEGER NOT NULL DEFAULT 0,
    imported_by INTEGER REFERENCES users (id) ON DELETE SET NULL,
    imported_at TEXT NOT NULL
);
"""


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        conn = sqlite3.connect(current_app.config["DATABASE"], timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        g.db = conn
    return g.db


def close_db(_exc=None) -> None:
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


PUBLIC_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # no 0/O/1/I to avoid typos


def new_public_id() -> str:
    """A random, readable record key such as DT-7K4M-9QX2; the unique index stops reuse."""
    picks = "".join(secrets.choice(PUBLIC_ID_ALPHABET) for _ in range(8))
    return f"DT-{picks[:4]}-{picks[4:]}"


def _ensure_public_id(conn) -> None:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(investments)")}
    if "public_id" not in columns:
        conn.execute("ALTER TABLE investments ADD COLUMN public_id TEXT")
    missing = conn.execute(
        "SELECT id FROM investments WHERE public_id IS NULL OR public_id = ''"
    ).fetchall()
    for row in missing:
        conn.execute("UPDATE investments SET public_id = ? WHERE id = ?", (new_public_id(), row["id"]))
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_investments_public_id ON investments (public_id)"
    )


def _ensure_import_files(conn) -> None:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(import_files)")}
    if "updated" not in columns:
        conn.execute("ALTER TABLE import_files ADD COLUMN updated INTEGER NOT NULL DEFAULT 0")


def _ensure_transactions_time(conn) -> None:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(transactions)")}
    if "trade_time" not in columns:
        conn.execute("ALTER TABLE transactions ADD COLUMN trade_time TEXT")


def init_db(app) -> None:
    with app.app_context():
        conn = get_db()
        conn.executescript(SCHEMA)
        _ensure_public_id(conn)
        _ensure_import_files(conn)
        _ensure_transactions_time(conn)
        conn.commit()


def query(sql: str, args=()) -> list[sqlite3.Row]:
    return get_db().execute(sql, args).fetchall()


def query_one(sql: str, args=()):
    return get_db().execute(sql, args).fetchone()


def execute(sql: str, args=()) -> int:
    conn = get_db()
    cur = conn.execute(sql, args)
    conn.commit()
    return cur.lastrowid


def log_activity(user_id, action: str, summary: str, entity_type=None, entity_id=None) -> None:
    execute(
        "INSERT INTO activity (user_id, action, summary, entity_type, entity_id, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, action, summary, entity_type, entity_id, now()),
    )
