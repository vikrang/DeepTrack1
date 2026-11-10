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


def _data_dir_mounted() -> bool:
    """True when the data directory is a mounted disk/volume (Linux hosts)."""
    try:
        target = str(DATA_DIR.resolve())
        with open("/proc/mounts", encoding="utf-8") as handle:
            for line in handle:
                parts = line.split()
                if len(parts) >= 2 and parts[1] == target:
                    return True
    except OSError:
        pass
    return False


def storage_status() -> dict:
    """Where the portfolio lives, and whether that spot survives a restart."""
    path = str(DATABASE_PATH)
    if os.name == "nt":
        return {"mode": "local", "persistent": True, "path": path}
    if _data_dir_mounted():
        return {"mode": "cloud", "persistent": True, "path": path}
    container = Path("/.dockerenv").exists() or bool(
        os.environ.get("RENDER_SERVICE_ID") or os.environ.get("RENDER")
    )
    if container:
        return {"mode": "temporary", "persistent": False, "path": path}
    return {"mode": "local", "persistent": True, "path": path}
