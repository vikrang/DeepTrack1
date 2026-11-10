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

    from .api import bp

    app.register_blueprint(bp)

    @app.get("/")
    def index():
        response = send_from_directory(config.STATIC_DIR, "index.html")
        response.headers["Cache-Control"] = "no-store"
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
            "img-src 'self' data: https://*.googleusercontent.com; "
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
