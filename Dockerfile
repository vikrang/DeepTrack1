FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEEPTRACK_HOST=0.0.0.0 \
    DEEPTRACK_PORT=8080 \
    DEEPTRACK_DATA_DIR=/var/data

WORKDIR /app
# /var/data is where hosts mount a persistent disk; without a mount the
# container filesystem is ephemeral and the portfolio resets on redeploy.
RUN mkdir -p /var/data
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY run.py .
COPY tracker ./tracker
COPY static ./static

EXPOSE 8080
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 1 --threads 8 --timeout 120 run:app"]
