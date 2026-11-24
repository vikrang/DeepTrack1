/* DeepTrack service worker: network-only.
 *
 * It deliberately keeps no cache of the app. When the DeepTrack server is not
 * running, a navigation shows an honest "server not running" page instead of
 * replaying a cached copy of the UI, which used to look like an old version.
 */

const VERSION = "deeptrack-v26";
const BUILD_LABEL = "2026.11.23q";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.mode !== "navigate") return;
  event.respondWith(serverOrOfflinePage(event.request));
});

async function serverOrOfflinePage(request) {
  try {
    return await fetch(request, { cache: "no-store" });
  } catch (error) {
    return new Response(offlinePage(), {
      status: 503,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
}

function offlinePage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DeepTrack - server not running</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    background: #0f172a; color: #e2e8f0; padding: 24px;
  }
  .card {
    max-width: 460px; width: 100%; background: #1e293b; border-radius: 18px;
    padding: 32px 28px; box-shadow: 0 24px 60px rgba(0, 0, 0, .45);
    text-align: center;
  }
  .dot {
    width: 54px; height: 54px; margin: 0 auto 18px; border-radius: 50%;
    background: #f59e0b; display: grid; place-items: center;
    font-size: 28px; font-weight: 700; color: #0f172a;
  }
  h1 { font-size: 20px; margin: 0 0 10px; }
  p { margin: 0 0 14px; line-height: 1.55; color: #cbd5e1; font-size: 14px; }
  code {
    background: #0f172a; padding: 2px 7px; border-radius: 6px;
    font-size: 13px; color: #93c5fd;
  }
  button {
    margin-top: 8px; padding: 11px 26px; border: 0; border-radius: 10px;
    background: #2563eb; color: #fff; font-size: 15px; font-weight: 600;
    cursor: pointer;
  }
  button:hover { background: #1d4ed8; }
  .build { margin-top: 22px; font-size: 11px; letter-spacing: .04em; color: #64748b; }
</style>
</head>
<body>
  <main class="card">
    <div class="dot">!</div>
    <h1>DeepTrack isn't running</h1>
    <p>The page you see now is a status page, not your portfolio. The DeepTrack server on the
    computer has stopped, so your data can't be loaded.</p>
    <p>Double-click <code>start.bat</code> in the DeepTrack folder, wait for
    <em>DeepTrack running</em>, then press Retry.</p>
    <button type="button" onclick="location.reload()">Retry</button>
    <div class="build">DeepTrack build ${BUILD_LABEL}</div>
  </main>
</body>
</html>`;
}
