"""Google sign-in through Firebase Authentication with a server-side allowlist.

Firebase proves who the user is; this module decides whether that identity may
use the workspace. The allowlist lives in environment variables so it is
enforced on the server, never trusted from the browser.
"""

import os
import re


class FirebaseError(Exception):
    """Token rejected by Firebase or by the workspace allowlist."""


def _split(value: str | None) -> set[str]:
    cleaned = (value or "").replace('"', " ").replace("'", " ")
    return {part.lower() for part in re.split(r"[\s,;]+", cleaned) if part}


def project_id() -> str:
    return os.environ.get("DEEPTRACK_FIREBASE_PROJECT", "").strip()


def allowed_emails() -> set[str]:
    return _split(os.environ.get("DEEPTRACK_ALLOWED_EMAILS"))


def admin_emails() -> set[str]:
    return _split(os.environ.get("DEEPTRACK_ADMIN_EMAILS"))


def is_allowed(email: str) -> bool:
    return email.strip().lower() in allowed_emails()


def is_admin_email(email: str) -> bool:
    return email.strip().lower() in admin_emails()


def sdk_available() -> bool:
    try:
        from google.oauth2 import id_token  # noqa: F401
    except ImportError:
        return False
    return True


def ready() -> bool:
    """True when Google sign-in can actually be offered."""
    return bool(project_id() and allowed_emails() and sdk_available())


def client_config() -> dict:
    """Public Firebase web config for the browser SDK."""
    project = project_id()
    config = {
        "apiKey": os.environ.get("DEEPTRACK_FIREBASE_API_KEY", "").strip(),
        "authDomain": os.environ.get("DEEPTRACK_FIREBASE_AUTH_DOMAIN", "").strip()
        or f"{project}.firebaseapp.com",
        "projectId": project,
    }
    app_id = os.environ.get("DEEPTRACK_FIREBASE_APP_ID", "").strip()
    if app_id:
        config["appId"] = app_id
    return config


def password_login_enabled() -> bool:
    value = (os.environ.get("DEEPTRACK_PASSWORD_LOGIN") or "1").strip().lower()
    return value not in {"0", "false", "no", "off"}


def verify(id_token: str) -> dict:
    """Validate a Firebase ID token and return its claims."""
    if not sdk_available():
        raise FirebaseError("Server is missing the google-auth package.")
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token as google_id_token

    if not id_token or len(id_token) > 8192:
        raise FirebaseError("Missing Google credential.")
    try:
        claims = google_id_token.verify_firebase_token(
            id_token, google_requests.Request(), audience=project_id()
        )
    except Exception as exc:  # invalid signature, expiry, wrong audience, network
        raise FirebaseError("Google credential could not be verified.") from exc
    if not isinstance(claims, dict) or not claims.get("sub"):
        raise FirebaseError("Google credential is missing its subject.")
    return claims
