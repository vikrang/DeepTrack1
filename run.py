"""Local development entry point: python run.py"""

import os
import sys
import threading
import urllib.request
import webbrowser

try:
    from dotenv import load_dotenv
except ImportError:
    def load_dotenv(*_args, **_kwargs):
        return False

load_dotenv()

from tracker import create_app

app = create_app()


def _open_browser(url: str) -> None:
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()


def _already_running(url: str) -> bool:
    try:
        with urllib.request.urlopen(f"{url}/api/bootstrap", timeout=1) as response:
            return response.status == 200
    except Exception:
        return False


if __name__ == "__main__":
    host = os.environ.get("DEEPTRACK_HOST", "127.0.0.1")
    port = int(os.environ.get("DEEPTRACK_PORT", "5000"))
    debug = os.environ.get("DEEPTRACK_DEBUG", "").strip().lower() in {"1", "true", "yes", "on"}
    browser = (os.environ.get("DEEPTRACK_OPEN_BROWSER") or "1").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }
    page_host = "localhost" if host in {"127.0.0.1", "0.0.0.0", "::"} else host
    url = f"http://{page_host}:{port}"
    if _already_running(url):
        if browser:
            print(f"\n  DeepTrack is already running at {url} - opening the browser.\n")
            webbrowser.open(url)
        else:
            print(f"\n  DeepTrack is already running at {url}\n")
        sys.exit(0)
    print(f"\n  DeepTrack running at {url}\n")
    if browser and (not debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true"):
        _open_browser(url)
    app.run(host=host, port=port, debug=debug)
