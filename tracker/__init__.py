"""DeepTrack — family/office investment tracker application factory."""

from datetime import timedelta

from flask import Flask, jsonify, request, send_from_directory

from . import config
from .db import close_db, init_db


def create_app(test_config: dict | None = None) -> Flask:
    config.ensure_dirs()
    print(f"DeepTrack database: {config.DATABASE_PATH}", flush=True)
    app = Flask(__name__, static_folder=str(config.STATIC_DIR), static_url_path="/static")
    app.config.update(
        SECRET_KEY=config.secret_key(),
        DATABASE=str(config.DATABASE_PATH),
        MAX_CONTENT_LENGTH=config.MAX_UPLOAD_BYTES,
        SESSION_COOKIE_NAME=config.COOKIE_NAME,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=(config.env_flag("DEEPTRACK_HTTPS")),
        PERMANENT_SESSION_LIFETIME=timedelta(hours=config.SESSION_HOURS),
        SEND_FILE_MAX_AGE_DEFAULT=0,
        JSON_SORT_KEYS=False,
    )
    if test_config:
        app.config.update(test_config)

    init_db(app)
    app.teardown_appcontext(close_db)

    from . import cloud
    cloud.setup(app)

    from . import fields as fields_registry

    with app.app_context():
        if fields_registry.refresh_ppf_totals():
            cloud.push_current()

    from .api import bp

    app.register_blueprint(bp)

    _start_market_autosync(app, test_config)
    _start_logo_warm(app, test_config)

    @app.get("/")
    def index():
        response = send_from_directory(config.STATIC_DIR, "index.html")
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/manifest.webmanifest")
    def manifest():
        response = send_from_directory(
            config.STATIC_DIR, "manifest.webmanifest", mimetype="application/manifest+json"
        )
        response.headers["Cache-Control"] = "no-cache"
        return response

    @app.get("/sw.js")
    def service_worker():
        response = send_from_directory(config.STATIC_DIR, "sw.js", mimetype="text/javascript")
        response.headers["Cache-Control"] = "no-cache"
        response.headers["Service-Worker-Allowed"] = "/"
        return response

    @app.after_request
    def security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob: https://*.googleusercontent.com; "
            "script-src 'self' https://www.gstatic.com https://apis.google.com; "
            "connect-src 'self' https://identitytoolkit.googleapis.com "
            "https://securetoken.googleapis.com https://www.googleapis.com "
            "https://apis.google.com; "
            "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com "
            "https://apis.google.com; "
            "base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        )
        return response

    @app.errorhandler(413)
    def too_large(_err):
        return jsonify(error="File is too large. Please keep imports under 12 MB."), 413

    @app.errorhandler(404)
    def not_found(_err):
        if request.path.startswith("/api/"):
            return jsonify(error="Not found"), 404
        return send_from_directory(config.STATIC_DIR, "index.html")

    return app


def _start_market_autosync(app: Flask, test_config: dict | None) -> None:
    """Pull fresh NSE data in the background on startup, if it has gone stale.

    Best-effort and non-blocking: a network block or slow archive never delays
    startup, and manual upload stays available in the Market data page.
    """
    if test_config and test_config.get("TESTING"):
        return
    import os

    if (os.environ.get("DEEPTRACK_AUTO_MARKET") or "1").strip().lower() in {"0", "false", "no", "off"}:
        return
    import threading

    from . import market

    def _run() -> None:
        with app.app_context():
            try:
                if market.schemes_stale():
                    summary = market.sync_schemes()
                    print(
                        f"DeepTrack AMFI scheme sync complete: {summary['rows']} variants, "
                        f"NAV dated {summary.get('nav_date')}",
                        flush=True,
                    )
            except Exception as exc:  # noqa: BLE001 - scheme list is a convenience
                print(f"DeepTrack AMFI scheme sync skipped: {exc}", flush=True)
            try:
                if not market.is_stale():
                    return
                summary = market.sync_nse()
                errors = summary.get("errors") or {}
                if errors:
                    print(f"DeepTrack market auto-sync partial: {errors}", flush=True)
                else:
                    print("DeepTrack market auto-sync complete", flush=True)
            except Exception as exc:  # noqa: BLE001 - never block startup on market data
                print(f"DeepTrack market auto-sync skipped: {exc}", flush=True)

    threading.Thread(target=_run, name="market-autosync", daemon=True).start()


def _start_logo_warm(app: Flask, test_config: dict | None) -> None:
    """Fetch missing bank / issuer logos in the background after startup."""
    if test_config and test_config.get("TESTING"):
        return
    import os

    if (os.environ.get("DEEPTRACK_AUTO_LOGOS") or "1").strip().lower() in {"0", "false", "no", "off"}:
        return

    with app.app_context():
        from .api import warm_logos_async

        warm_logos_async()
