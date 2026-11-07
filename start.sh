#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x ".venv/bin/python" ]; then
  python3 -m venv .venv
  .venv/bin/python -m pip install --upgrade pip
fi
.venv/bin/python -m pip install --quiet --disable-pip-version-check -r requirements.txt

echo "Starting DeepTrack at http://localhost:5000"
exec .venv/bin/python run.py
