"""Application configuration and shared paths."""

import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = Path(os.environ.get("DEEPTRACK_DATA_DIR", BASE_DIR / "data"))

DATABASE_PATH = Path(os.environ.get("DEEPTRACK_DB", DATA_DIR / "tracker.db"))
IMPORT_DIR = DATA_DIR / "imports"

COOKIE_NAME = "deeptrack_session"
SESSION_HOURS = 12
MAX_UPLOAD_BYTES = 12 * 1024 * 1024


def env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def secret_key() -> str:
    """Stable local secret; override with DEEPTRACK_SECRET_KEY in production."""
    env = os.environ.get("DEEPTRACK_SECRET_KEY")
    if env:
        return env
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "secret.key"
    if path.exists():
        value = path.read_text(encoding="utf-8").strip()
        if value:
            return value
    value = secrets.token_hex(32)
    path.write_text(value, encoding="utf-8")
    return value


def ensure_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    IMPORT_DIR.mkdir(parents=True, exist_ok=True)
