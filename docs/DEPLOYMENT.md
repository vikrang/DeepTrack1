# DeepTrack — Firebase and GitHub setup

Two separate jobs:

1. **Firebase** proves who someone is (Google account) and lets you allow only chosen Gmail IDs.
2. **GitHub Pages** hosts the small landing page; the app itself runs on a Python host because it needs Flask, SQLite and NSE downloads.

Complete Firebase first, test locally, then deploy and point GitHub Pages at it.

---

## 1. Firebase (Google sign-in)

### 1.1 Create the project

1. Open <https://console.firebase.google.com> and sign in with the Google account that should own the project.
2. **Create a project** → name it `DeepTrack` → continue. Google Analytics is optional.

### 1.2 Enable Google as a sign-in method

1. Left sidebar: **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Google** → toggle **Enable**.
3. Pick a support email → **Save**.

### 1.3 Register the web app and copy the config

1. **Project settings** (gear icon) → **General** → **Your apps** → **Web** (`</>`).
2. App nickname: `DeepTrack web` → **Register app**.
3. Copy the `firebaseConfig` values shown:
   - `apiKey`
   - `authDomain` (usually `your-project-id.firebaseapp.com`)
   - `projectId`
   - `appId` (optional)

These are public values — they are meant to ship in a web client. Access control comes from the server-side allowlist, not from hiding the key.

### 1.4 Authorise the domains that will serve the app

1. **Authentication → Settings → Authorized domains**.
2. `localhost` is already listed (for local testing).
3. Add the hostname of the deployed app once you have it, for example `deeptrack.onrender.com`. Add the custom domain too if you use one.
4. You do **not** add the GitHub Pages hostname: sign-in happens on the app host, not on the landing page.

### 1.5 Fill in `.env` locally

In the project folder (next to `run.py`):

```bash
cp .env.example .env
```

Edit `.env`:

```ini
DEEPTRACK_FIREBASE_PROJECT=your-project-id
DEEPTRACK_FIREBASE_API_KEY=AIzaSy...
DEEPTRACK_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
DEEPTRACK_ALLOWED_EMAILS=you@gmail.com,partner@gmail.com
DEEPTRACK_ADMIN_EMAILS=you@gmail.com
```

Rules:

- **Every** allowed account must be in `DEEPTRACK_ALLOWED_EMAILS`, comma-separated, lower-case is safest.
- `DEEPTRACK_ADMIN_EMAILS` must be a subset of the allowlist; those accounts always get the admin role.
- With an empty allowlist, Google sign-in stays off and nothing breaks — the normal password screen remains.

### 1.6 Start and verify

```bash
python run.py
```

- The login screen shows **Continue with Google**.
- On an empty workspace the card reads **Create your workspace** and shows Google only. There is no password setup: `POST /api/setup` returns `403 Use Google sign-in to create the workspace.`
- Sign in with an allowlisted Gmail → you enter the workspace. On an empty workspace the first one becomes admin.
- Sign in with any other Gmail → `This Google account is not on the access list.`
- Remove someone from the allowlist → they are blocked on their next sign-in; deactivating them in **Members** blocks them immediately.

For a hosted instance also set `DEEPTRACK_PASSWORD_LOGIN=0` so the password form disappears entirely.

---

## 2. Local GitHub repository

The app is not a git repository yet. From the project folder:

```bash
git init
git add .
git commit -m "DeepTrack investment tracker"
git branch -M main
```

`.gitignore` already excludes `data/`, `.env`, `.venv/` and ZIP files, so your portfolio database and secrets are not committed. Confirm with `git status` before committing.

Create an empty repository on GitHub named `deeptrack` (no README), then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/deeptrack.git
git push -u origin main
```

---

## 3. Host the Flask app

GitHub Pages cannot run Flask or SQLite. Use a host with a persistent disk. **Render** is the least fiddly:

1. <https://render.com> → **New → Web Service** → connect the GitHub repo.
2. Runtime **Python 3**, Build command:
   `pip install -r requirements.txt gunicorn`
3. Start command:
   `gunicorn --workers 1 --threads 8 --bind 0.0.0.0:$PORT run:app`
4. Add a **Disk**: name `data`, mount path `/var/data`, size 1 GB (disks require a paid instance; free instances also sleep and lose the disk).
5. Environment variables:

   ```ini
   DEEPTRACK_DATA_DIR=/var/data
   DEEPTRACK_DB=/var/data/tracker.db
   DEEPTRACK_HTTPS=1
   DEEPTRACK_OPEN_BROWSER=0
   DEEPTRACK_PASSWORD_LOGIN=0
   DEEPTRACK_FIREBASE_PROJECT=...
   DEEPTRACK_FIREBASE_API_KEY=...
   DEEPTRACK_FIREBASE_AUTH_DOMAIN=...
   DEEPTRACK_ALLOWED_EMAILS=...
   DEEPTRACK_ADMIN_EMAILS=...
   ```

   Use **one worker only**: SQLite allows a single writer and every user must share the same database file.
6. Deploy, then add the Render hostname to Firebase **Authorized domains**.

**Fly.io** works the same way with a volume mounted at `/app/data`. **Cloud Run** is possible but its filesystem is ephemeral — mount a Cloud Storage bucket for `/app/data`, or the portfolio resets on every deploy.

The Dockerfile in the repo can be used on any container host:

```bash
docker build -t deeptrack .
docker run -p 8080:8080 -v "$PWD/data:/app/data" --env-file .env deeptrack
```

---

## 4. GitHub Pages (landing page)

1. Open `docs/index.html` and set the deployed app URL:

   ```html
   <meta name="app-url" content="https://deeptrack.onrender.com">
   ```

2. Commit and push.
3. Repository **Settings → Pages** → **Deploy from a branch** → Branch **main**, folder **/docs** → **Save**.
4. Pages publishes at `https://YOUR-USERNAME.github.io/deeptrack/`. The **Open DeepTrack** button leads to the Flask app, where Google sign-in happens.

Optional: add a custom domain under **Settings → Pages → Custom domain**.

---

## 5. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| No Google button | Missing `DEEPTRACK_FIREBASE_PROJECT`, `DEEPTRACK_FIREBASE_API_KEY` or allowlist; or `google-auth` not installed | Fill `.env`, run `pip install -r requirements.txt`, restart |
| `This Google account is not on the access list` | Email missing from `DEEPTRACK_ALLOWED_EMAILS` | Add it (exact spelling) and restart |
| `This domain is not authorised...` | App hostname missing in Firebase | Authentication → Settings → Authorized domains |
| Popup blocked | Browser blocks the sign-in window | Allow pop-ups for the site |
| Signed in via Google but role is viewer | Not in `DEEPTRACK_ADMIN_EMAILS` | Add the email or promote in **Members** |
| Login works, then "Please sign in" on refresh | Cookie not stored because `DEEPTRACK_HTTPS=1` on plain HTTP | Remove the flag locally; keep it on HTTPS hosts |
| All data gone after redeploy | SQLite on an ephemeral filesystem | Mount a persistent disk at the data directory |
