import { icon } from "./icons.js";
import { donutChart } from "./charts.js";

/* ============================================================
   Utilities
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));

const nf = (digits = 0) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
const inr = (n) => "₹" + nf(0).format(Math.round(Number(n) || 0));
const inr2 = (n) => "₹" + nf(2).format(Number(n) || 0);

function compactMoney(n) {
  const value = Number(n) || 0;
  const abs = Math.abs(value);
  if (abs >= 1e7) return `₹${nf(2).format(value / 1e7)} Cr`;
  if (abs >= 1e5) return `₹${nf(2).format(value / 1e5)} L`;
  if (abs >= 1e3) return `₹${nf(1).format(value / 1e3)} K`;
  return `₹${nf(0).format(value)}`;
}

const pctText = (n) => {
  const v = Number(n) || 0;
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${nf(2).format(Math.abs(v))}%`;
};

function fmtDate(iso) {
  if (!iso) return "—";
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return esc(iso);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function shortDate(iso) {
  if (!iso) return { day: "—", month: "" };
  const date = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return { day: "—", month: "" };
  return {
    day: date.toLocaleDateString("en-IN", { day: "2-digit" }),
    month: date.toLocaleDateString("en-IN", { month: "short" }),
  };
}

function timeAgo(iso) {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max((Date.now() - then) / 1000, 0);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return fmtDate(iso);
}

const COLORS = ["#6366f1", "#0ea5e9", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6"];
const AVATAR_COLORS = ["#5b5bd6", "#0e7490", "#b45309", "#047857", "#be185d", "#6d28d9", "#b91c1c", "#0f766e"];

function hashOf(text) {
  let hash = 0;
  for (const ch of String(text)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}
function initials(name) {
  return String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
}
function avatar(name, cls = "") {
  const color = AVATAR_COLORS[hashOf(name) % AVATAR_COLORS.length];
  return `<div class="avatar ${cls}" style="background:${color}" aria-hidden="true">${esc(initials(name))}</div>`;
}
function safeColor(color, fallback = "#6366f1") {
  return /^#[0-9a-fA-F]{6}$/.test(color || "") ? color : fallback;
}
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ============================================================
   State + API
   ============================================================ */

const state = {
  me: null,
  meta: null,
  members: [],
  investments: [],
  dashboard: null,
  view: "dashboard",
  filters: { q: "", category: "", type: "", owner: "", sort: "updated", dir: "desc" },
  importPreview: null,
  importResult: null,
  marketStatus: null,
  marketLoading: false,
  storageStatus: null,
  selected: new Set(),
  modalResolver: null,
};

const firebaseState = {
  enabled: false,
  allowPassword: true,
  config: null,
  auth: null,
  mod: null,
};

async function api(path, { method = "GET", body, form } = {}) {
  const options = { method, credentials: "same-origin", headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  if (form) options.body = form;

  const response = await fetch(`/api${path}`, options);
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const error = new Error((payload && payload.error) || "Something went wrong. Please try again.");
    error.status = response.status;
    error.data = payload || {};
    throw error;
  }
  return payload;
}

function isAdmin() {
  return state.me && state.me.role === "admin";
}

function typeMeta(key) {
  return (state.meta?.types || []).find((t) => t.key === key);
}
function categoryMeta(key) {
  return (state.meta?.categories || []).find((c) => c.key === key) || {};
}

/* ============================================================
   Toasts, modal, drawer
   ============================================================ */

function toast(message, kind = "info") {
  const root = $("#toast-root");
  const node = document.createElement("div");
  node.className = `toast ${kind}`;
  const icons = { ok: "checkCircle", error: "xCircle", warn: "alert", info: "info" };
  node.innerHTML = `${icon(icons[kind] || "info")}<span>${esc(message)}</span>`;
  root.appendChild(node);
  setTimeout(() => {
    node.classList.add("leaving");
    setTimeout(() => node.remove(), 220);
  }, kind === "error" ? 6000 : 3800);
}

function openModal({ title, subtitle = "", body, footer = "", size = "", onMount }) {
  closeModal();
  const root = $("#modal-root");
  root.innerHTML = `
    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head">
          <div class="mh-main">
            <h3 id="modal-title">${title}</h3>
            ${subtitle ? `<p>${subtitle}</p>` : ""}
          </div>
          <button class="icon-btn" type="button" data-close aria-label="Close">${icon("close")}</button>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
      </div>
    </div>`;
  const backdrop = root.firstElementChild;
  const close = () => {
    if (state.modalResolver) {
      const resolve = state.modalResolver;
      state.modalResolver = null;
      resolve(false);
    }
    closeModal();
  };
  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) close();
  });
  $$("[data-close]", backdrop).forEach((btn) => btn.addEventListener("click", close));
  onMount?.(backdrop, close);
  document.body.style.overflow = "hidden";
  setTimeout(() => {
    const focusable = backdrop.querySelector("input, select, textarea, button:not([data-close])");
    focusable?.focus({ preventScroll: true });
  }, 60);
}

function closeModal() {
  $("#modal-root").innerHTML = "";
  document.body.style.overflow = "";
}

function confirmDialog({ title, message, confirmLabel = "Delete", danger = true }) {
  return new Promise((resolve) => {
    state.modalResolver = resolve;
    openModal({
      title,
      size: "modal-sm",
      body: `<p style="font-size:13.5px;line-height:1.65;color:var(--ink-2)">${message}</p>`,
      footer: `
        <button class="btn btn-secondary" type="button" data-close>Cancel</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" type="button" data-confirm>${esc(confirmLabel)}</button>`,
      onMount(backdrop) {
        backdrop.querySelector("[data-confirm]").addEventListener("click", () => {
          state.modalResolver = null;
          closeModal();
          resolve(true);
        });
      },
    });
  });
}

function openDrawer(html, onMount) {
  closeDrawer();
  const root = $("#drawer-root");
  root.innerHTML = `<div class="drawer-backdrop" data-drawer-close></div><aside class="drawer" role="dialog" aria-modal="true">${html}</aside>`;
  root.querySelector("[data-drawer-close]").addEventListener("click", closeDrawer);
  $$("[data-drawer-close]", root.querySelector(".drawer")).forEach((el) => el.addEventListener("click", closeDrawer));
  document.body.style.overflow = "hidden";
  onMount?.(root.querySelector(".drawer"));
}

function closeDrawer() {
  const root = $("#drawer-root");
  if (!root.innerHTML) return;
  root.innerHTML = "";
  if (!$("#modal-root").innerHTML) document.body.style.overflow = "";
}

/* ============================================================
   Theme + chrome
   ============================================================ */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("deeptrack-theme", theme);
  const btn = $("#theme-toggle");
  if (btn) {
    btn.querySelector(".theme-icon").innerHTML = icon(theme === "dark" ? "sun" : "moon");
    btn.querySelector(".theme-label").textContent = theme === "dark" ? "Light mode" : "Dark mode";
  }
}

function hydrateIcons(root = document) {
  $$("[data-icon]", root).forEach((el) => {
    const name = el.dataset.icon;
    if (name) el.innerHTML = icon(name);
  });
}

function renderUserChrome() {
  const me = state.me;
  if (!me) return;
  $("#sidebar-user").innerHTML = `
    ${avatar(me.name)}
    <div class="meta">
      <div class="name">${esc(me.name)}</div>
      <div class="role">${me.role === "admin" ? "Admin" : "Viewer"}</div>
    </div>`;
  const top = $("#topbar-user");
  top.textContent = initials(me.name);
  top.style.background = AVATAR_COLORS[hashOf(me.name) % AVATAR_COLORS.length];
  $$("[data-admin-only]").forEach((el) => el.classList.toggle("hidden", !isAdmin()));
  $("#quick-add").classList.toggle("hidden", !isAdmin());
}

/* ============================================================
   Boot / auth
   ============================================================ */

function showAuth(mode) {
  closeModal();
  closeDrawer();
  $("#boot")?.classList.add("hidden");
  $("#app").classList.add("hidden");
  $("#auth").classList.remove("hidden");
  $("#login-form").classList.toggle("hidden", mode !== "login");
  $("#setup-form").classList.toggle("hidden", mode !== "setup");
  const first = mode === "setup"
    ? $("#setup-form input[name=name]")
    : firebaseState.enabled
      ? $("#login-oauth button")
      : $("#login-form input[name=email]");
  setTimeout(() => first?.focus(), 80);
}

function showFormError(id, message) {
  const box = $(id);
  if (!box) return;
  if (!message) {
    box.classList.add("hidden");
    box.textContent = "";
    return;
  }
  box.textContent = message;
  box.classList.remove("hidden");
}

async function boot() {
  applyTheme(localStorage.getItem("deeptrack-theme") || "light");
  hydrateIcons();
  bindAuthForms();
  bindGlobalEvents();
  await setupAuthOptions();

  try {
    const data = await api("/bootstrap");
    if (data.user) {
      state.me = data.user;
      await startApp();
    } else if (!(await restoreFirebaseSession())) {
      if (data.needs_setup && !data.firebase_enabled) {
        showAuth("setup");
      } else {
        if (data.needs_setup) {
          $("#login-title").textContent = "Create your workspace";
          $("#login-sub").textContent = "Continue with Google to create the family workspace — you will be the admin.";
          $$("[data-password-field], [data-or-password]").forEach((el) => el.classList.add("hidden"));
        }
        showAuth("login");
      }
    }
  } catch (error) {
    showAuth("login");
    toast(error.message || "Could not reach the server", "error");
  }
  $("#boot")?.classList.add("hidden");
}

async function setupAuthOptions() {
  try {
    const cfg = await api("/auth/firebase-config");
    firebaseState.enabled = !!cfg.enabled;
    firebaseState.allowPassword = cfg.allow_password !== false;
    firebaseState.config = cfg.config || null;
  } catch {
    firebaseState.enabled = false;
  }

  const oauth = $("#login-oauth");
  oauth?.classList.toggle("hidden", !firebaseState.enabled);
  const showPassword = firebaseState.allowPassword || !firebaseState.enabled;
  $$("[data-password-field], [data-or-password]").forEach((el) => el.classList.toggle("hidden", !showPassword));
  if (!firebaseState.enabled) return;

  try {
    const appSdk = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const authSdk = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    const app = appSdk.initializeApp(firebaseState.config, "deeptrack");
    const auth = authSdk.getAuth(app);
    await authSdk.setPersistence(auth, authSdk.browserLocalPersistence);
    firebaseState.auth = auth;
    firebaseState.mod = authSdk;
  } catch (error) {
    console.error("Firebase SDK failed to load", error);
    firebaseState.enabled = false;
    oauth?.classList.add("hidden");
    $$("[data-password-field]").forEach((el) => el.classList.remove("hidden"));
  }
}

async function exchangeFirebaseUser(user) {
  const token = await user.getIdToken();
  return api("/auth/firebase", { method: "POST", body: { id_token: token } });
}

async function restoreFirebaseSession() {
  if (!firebaseState.auth) return false;
  try {
    if (firebaseState.auth.authStateReady) await firebaseState.auth.authStateReady();
    const user = firebaseState.auth.currentUser;
    if (!user) return false;
    const data = await exchangeFirebaseUser(user);
    state.me = data.user;
    await startApp();
    return true;
  } catch {
    return false;
  }
}

async function signInWithGoogle(button) {
  if (!firebaseState.auth) return;
  showFormError("#login-error", "");
  button.disabled = true;
  try {
    const provider = new firebaseState.mod.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const result = await firebaseState.mod.signInWithPopup(firebaseState.auth, provider);
    const data = await exchangeFirebaseUser(result.user);
    state.me = data.user;
    await startApp();
    toast(`Welcome, ${data.user.name.split(" ")[0]}`, "ok");
  } catch (error) {
    if (["auth/popup-closed-by-user", "auth/cancelled-popup-request"].includes(error?.code)) return;
    if (error?.data) await firebaseState.mod.signOut(firebaseState.auth).catch(() => {});
    const friendly = {
      "auth/popup-blocked": "Your browser blocked the sign-in popup. Allow pop-ups for this site and try again.",
      "auth/unauthorized-domain": "This domain is not authorised for Google sign-in in the Firebase console.",
      "auth/operation-not-allowed": "Google sign-in is not enabled in the Firebase console.",
      "auth/internal-error": "Google sign-in could not complete. Check the Firebase settings for this site and try again.",
    }[error?.code];
    showFormError("#login-error", error?.data?.error || friendly || error?.message || "Google sign-in failed.");
  } finally {
    button.disabled = false;
  }
}

function bindAuthForms() {
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector("button[type=submit]");
    showFormError("#login-error", "");
    submit.disabled = true;
    try {
      const data = await api("/login", {
        method: "POST",
        body: {
          email: form.email.value.trim(),
          password: form.password.value,
        },
      });
      state.me = data.user;
      form.reset();
      await startApp();
    } catch (error) {
      showFormError("#login-error", error.message);
    } finally {
      submit.disabled = false;
    }
  });

  $("#setup-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    showFormError("#setup-error", "");
    if (form.password.value !== form.confirm.value) {
      showFormError("#setup-error", "The two passwords do not match.");
      return;
    }
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      const data = await api("/setup", {
        method: "POST",
        body: {
          name: form.name.value.trim(),
          email: form.email.value.trim(),
          password: form.password.value,
        },
      });
      state.me = data.user;
      form.reset();
      await startApp();
      toast("Workspace created. Welcome!", "ok");
    } catch (error) {
      const fields = error.data?.errors;
      const first = fields ? Object.values(fields)[0] : error.message;
      showFormError("#setup-error", first || error.message);
    } finally {
      submit.disabled = false;
    }
  });

  $$("[data-reveal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = btn.parentElement.querySelector("input");
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });

  $$("[data-google-signin]").forEach((btn) => {
    btn.addEventListener("click", () => signInWithGoogle(btn));
  });
}

async function startApp() {
  $("#auth").classList.add("hidden");
  $("#app").classList.remove("hidden");
  await refreshData();
  renderUserChrome();
  if (!location.hash) location.hash = "#/dashboard";
  route();
}

async function refreshData() {
  const [meta, members, dashboard, investments] = await Promise.all([
    api("/meta"),
    api("/members"),
    api("/dashboard"),
    api("/investments"),
  ]);
  state.meta = meta;
  state.me = meta.me;
  state.members = members.members;
  state.dashboard = dashboard.dashboard;
  state.investments = investments.items;
}

async function refreshAndRender() {
  await refreshData();
  renderUserChrome();
  route(true);
}

/* ============================================================
   Routing
   ============================================================ */

const ROUTES = {
  dashboard: { title: "Dashboard", sub: "Family portfolio overview", render: renderDashboard },
  investments: { title: "Investments", sub: "Every holding in one ledger", render: renderInvestments },
  members: { title: "Members", sub: "People with access and their KYC", render: renderMembers },
  masters: { title: "Masters", sub: "Broker and demat accounts", render: renderMasters },
  market: { title: "Market data", sub: "NSE scrip master, bhavcopy and prices", render: renderMarket },
  import: { title: "Import & export", sub: "Move portfolios in and out of Excel", render: renderImport },
  profile: { title: "My profile", sub: "Your details, KYC and bank account", render: renderProfile },
};

function route(force = false) {
  let key = (location.hash || "#/dashboard").replace(/^#\/?/, "") || "dashboard";
  if (!ROUTES[key]) key = "dashboard";
  if ((key === "import" || key === "market") && !isAdmin()) {
    location.hash = "#/dashboard";
    return;
  }
  state.view = key;
  $$(".nav-item").forEach((el) => el.classList.toggle("active", el.dataset.nav === key));
  const meta = ROUTES[key];
  $("#page-title").textContent = meta.title;
  $("#page-sub").textContent = meta.sub;
  document.title = `${meta.title} · DeepTrack`;
  meta.render();
  closeSidebar();
  if (force) $("#view").scrollTop = 0;
}

function closeSidebar() {
  $("#app").classList.remove("menu-open");
  $("#scrim").classList.add("hidden");
}

/* ============================================================
   Dashboard
   ============================================================ */

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function gainPill(value, pct, compact = false) {
  const positive = value >= 0;
  const text = `${positive ? "+" : "−"}${compact ? compactMoney(Math.abs(value)) : inr(Math.abs(value))} (${pctText(pct)})`;
  return `<span class="pill ${positive ? "pill-ok" : "pill-bad"}">${icon(positive ? "trendUp" : "trendDown")}${text}</span>`;
}

function renderDashboard() {
  const dash = state.dashboard;
  if (!dash) {
    $("#view").innerHTML = `<div class="card card-pad"><div class="skeleton" style="height:220px"></div></div>`;
    return;
  }
  const totals = dash.totals;
  const firstName = (state.me?.name || "there").split(" ")[0];
  const sipItems = state.investments.filter((i) => i.type === "mutual_funds" && Number(i.details.sip_amount) > 0);
  const sipTotal = sipItems.reduce((sum, i) => sum + Number(i.details.sip_amount), 0);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  const view = $("#view");
  view.innerHTML = `
    <div class="page-head">
      <div>
        <h2>${greeting()}, ${esc(firstName)}</h2>
        <p>${esc(today)} · ${totals.count} holding${totals.count === 1 ? "" : "s"} across ${totals.owners} member${totals.owners === 1 ? "" : "s"}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-action="export">${icon("download")} Export</button>
        ${isAdmin() ? `<button class="btn btn-primary btn-sm" type="button" data-action="add-investment">${icon("plus")} Add investment</button>` : ""}
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi kpi-primary">
        <div class="kpi-label">${icon("wallet")} Portfolio value</div>
        <div class="kpi-value" title="${inr2(totals.value)}">${compactMoney(totals.value)}</div>
        <div class="kpi-foot">${gainPill(totals.gain, totals.gain_pct, true)}<span>since invested</span></div>
      </div>
      <div class="kpi">
        <div class="kpi-label">${icon("rupee")} Amount invested</div>
        <div class="kpi-value" title="${inr2(totals.invested)}">${compactMoney(totals.invested)}</div>
        <div class="kpi-foot">Across ${totals.count} holdings</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">${icon("trendUp")} Unrealised gain</div>
        <div class="kpi-value" style="color:${totals.gain >= 0 ? "var(--ok)" : "var(--bad)"}" title="${inr2(totals.gain)}">
          ${totals.gain >= 0 ? "+" : "−"}${compactMoney(Math.abs(totals.gain))}
        </div>
        <div class="kpi-foot">${pctText(totals.gain_pct)} overall return</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">${icon("refresh")} Monthly SIPs</div>
        <div class="kpi-value" title="${inr2(sipTotal)}">${compactMoney(sipTotal)}</div>
        <div class="kpi-foot">${sipItems.length ? `${sipItems.length} active SIP${sipItems.length === 1 ? "" : "s"}` : "No SIPs recorded yet"}</div>
      </div>
    </div>

    ${totals.count === 0 ? emptyDashboard() : `
    <div class="dash-grid">
      ${allocationCard(dash)}
      ${mixCard(dash)}
      ${holdingsCard(dash)}
      ${ownersCard(dash)}
      ${maturitiesCard(dash)}
      ${activityCard(dash)}
    </div>`}
  `;
  hydrateIcons(view);
}

function emptyDashboard() {
  return `
    <div class="card card-pad">
      <div class="empty">
        <div class="empty-icon">${icon("sparkles")}</div>
        <h3>Your portfolio is a blank slate</h3>
        <p>Add your first holding, import a filled Excel template, or load a sample family portfolio to explore how everything works.</p>
        <div class="actions">
          ${isAdmin() ? `
            <button class="btn btn-primary" type="button" data-action="add-investment">${icon("plus")} Add investment</button>
            <button class="btn btn-secondary" type="button" data-action="load-demo">${icon("sparkles")} Load sample portfolio</button>
            <a class="btn btn-secondary" href="#/import">${icon("upload")} Import from Excel</a>` : `
            <span class="muted" style="font-size:13px">Ask an admin to add the first holdings.</span>`}
        </div>
      </div>
    </div>`;
}

function allocationCard(dash) {
  const total = dash.totals.value || 0;
  const segments = dash.categories.map((c) => ({ label: c.label, value: c.value, color: safeColor(c.color) }));
  return `
    <section class="card card-pad span-5 allocation">
      <div class="card-head">
        <div>
          <div class="card-title">Asset allocation</div>
          <div class="card-sub">By asset class</div>
        </div>
        <button class="card-action" type="button" data-nav="investments">View all ${icon("chevronRight", "sm")}</button>
      </div>
      <div class="allocation-body">
        <div class="donut-wrap">
          ${donutChart(segments, { size: 176, stroke: 24 })}
          <div class="donut-center">
            <div class="dc-label">Total</div>
            <div class="dc-value">${compactMoney(total)}</div>
          </div>
        </div>
        <div class="legend">
          ${dash.categories.map((c) => `
            <div class="legend-row">
              <span class="dot" style="background:${safeColor(c.color)}"></span>
              <span class="lbl">${esc(c.label)}</span>
              <span class="val">${compactMoney(c.value)}</span>
              <span class="pct">${nf(1).format(c.share)}%</span>
            </div>`).join("")}
        </div>
      </div>
    </section>`;
}

function mixCard(dash) {
  const types = dash.types.slice(0, 6);
  const max = Math.max(...types.map((t) => t.value), 1);
  return `
    <section class="card card-pad span-7">
      <div class="card-head">
        <div>
          <div class="card-title">Where the money sits</div>
          <div class="card-sub">Current value by instrument type</div>
        </div>
        <span class="pill pill-muted">${dash.types.length} types</span>
      </div>
      ${types.length ? `<div class="bar-list">
        ${types.map((t) => `
          <div class="bar-row">
            <div class="top">
              <div class="name"><span class="cat-dot" style="background:${safeColor(t.color)}"></span><span class="t">${esc(t.label)}</span></div>
              <div class="value">${compactMoney(t.value)}</div>
            </div>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.max((t.value / max) * 100, 2)}%;background:${safeColor(t.color)}"></div></div>
          </div>`).join("")}
      </div>` : `<p class="muted" style="font-size:13px">No holdings yet.</p>`}
    </section>`;
}

function holdingsCard(dash) {
  const rows = dash.top_holdings;
  return `
    <section class="card card-pad span-7">
      <div class="card-head">
        <div>
          <div class="card-title">Largest holdings</div>
          <div class="card-sub">Tap a row for the full picture</div>
        </div>
        <button class="card-action" type="button" data-nav="investments">All holdings ${icon("chevronRight", "sm")}</button>
      </div>
      ${rows.length ? `<table class="mini-table">
        <thead><tr><th>Holding</th><th>Owner</th><th>Value</th></tr></thead>
        <tbody>
          ${rows.map((h) => `
            <tr data-investment-id="${h.id}">
              <td>
                <div class="cell-name">${esc(h.name)}</div>
                <div class="cell-sub">${esc(h.type_label)}</div>
              </td>
              <td class="hide-sm" style="font-size:12px;color:var(--muted)">${esc(h.owner)}</td>
              <td class="num">${inr(h.current_value)}<div class="cell-sub" style="color:${h.gain >= 0 ? "var(--ok)" : "var(--bad)"}">${pctText(h.gain_pct)}</div></td>
            </tr>`).join("")}
        </tbody>
      </table>` : `<p class="muted" style="font-size:13px">No holdings yet.</p>`}
    </section>`;
}

function ownersCard(dash) {
  const total = dash.totals.value || 1;
  return `
    <section class="card card-pad span-5">
      <div class="card-head">
        <div>
          <div class="card-title">By member</div>
          <div class="card-sub">Share of the family portfolio</div>
        </div>
        <button class="card-action" type="button" data-nav="members">Members ${icon("chevronRight", "sm")}</button>
      </div>
      <div class="owner-list">
        ${dash.owners.map((owner) => `
          <div class="owner-row">
            ${avatar(owner.name, "sm")}
            <div class="meta">
              <div class="name">${esc(owner.name)}</div>
              <div class="sub">${owner.count} holding${owner.count === 1 ? "" : "s"} · ${nf(1).format((owner.value / total) * 100)}%</div>
            </div>
            <div class="amt">${compactMoney(owner.value)}<div class="sub">${compactMoney(owner.invested)} in</div></div>
          </div>`).join("")}
      </div>
    </section>`;
}

function maturitiesCard(dash) {
  return `
    <section class="card card-pad span-6">
      <div class="card-head">
        <div>
          <div class="card-title">Upcoming maturities</div>
          <div class="card-sub">Next 12 months</div>
        </div>
        <span class="pill pill-muted">${dash.maturities.length}</span>
      </div>
      ${dash.maturities.length ? `<div class="maturity-list">
        ${dash.maturities.map((m) => {
          const d = shortDate(m.date);
          return `<div class="maturity-row">
            <div class="maturity-date"><div class="d">${d.day}</div><div class="m">${d.month}</div></div>
            <div class="maturity-main">
              <div class="name">${esc(m.name)}</div>
              <div class="sub">${esc(m.type)} · ${esc(m.owner)}</div>
            </div>
            <div class="maturity-val">${compactMoney(m.value)}<div class="sub">${m.days === 0 ? "today" : `in ${m.days} days`}</div></div>
          </div>`;
        }).join("")}
      </div>` : `<p class="muted" style="font-size:13px;padding:8px 0">No maturities in the next year.</p>`}
    </section>`;
}

function activityCard(dash) {
  const iconFor = { created: "plus", updated: "edit", deleted: "trash", imported: "upload" };
  return `
    <section class="card card-pad span-6">
      <div class="card-head">
        <div>
          <div class="card-title">Recent activity</div>
          <div class="card-sub">What changed in this workspace</div>
        </div>
      </div>
      ${dash.activity.length ? `<div class="feed">
        ${dash.activity.map((a) => `
          <div class="feed-row">
            <div class="feed-dot">${icon(iconFor[a.action] || "list", "sm")}</div>
            <div class="feed-main">
              <div class="txt"><strong>${esc(a.user)}</strong> · ${esc(a.summary)}</div>
              <div class="time">${timeAgo(a.created_at)}</div>
            </div>
          </div>`).join("")}
      </div>` : `<p class="muted" style="font-size:13px;padding:8px 0">Actions will show up here as the family updates the portfolio.</p>`}
    </section>`;
}

/* ============================================================
   Investments list
   ============================================================ */

function filteredInvestments() {
  const f = state.filters;
  let items = state.investments.slice();
  if (f.category) items = items.filter((i) => i.category === f.category);
  if (f.type) items = items.filter((i) => i.type === f.type);
  if (f.owner) items = items.filter((i) => String(i.owner_id) === String(f.owner));
  if (f.q) {
    const needle = f.q.toLowerCase();
    items = items.filter((i) => {
      const haystack = [i.name, i.owner, i.type_label, i.notes, ...Object.values(i.details || {})]
        .join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }
  const sorters = {
    name: (i) => i.name.toLowerCase(),
    invested: (i) => i.invested_amount,
    current: (i) => i.current_value,
    gain: (i) => i.gain,
    date: (i) => i.start_date || "",
    owner: (i) => i.owner.toLowerCase(),
    updated: (i) => i.updated_at || "",
  };
  items.sort((a, b) => {
    const fn = sorters[f.sort] || sorters.updated;
    const x = fn(a);
    const y = fn(b);
    if (x === y) return 0;
    return (x > y ? 1 : -1) * (f.dir === "asc" ? 1 : -1);
  });
  return items;
}

function renderInvestments() {
  const all = state.investments;
  const counts = { "": all.length, equity: 0, debt: 0, other: 0 };
  all.forEach((i) => { counts[i.category] = (counts[i.category] || 0) + 1; });
  const f = state.filters;
  const owners = new Set(all.map((i) => i.owner_id)).size;
  const presentTypes = state.meta.types.filter((t) => all.some((i) => i.type === t.key));

  $("#view").innerHTML = `
    <div class="page-head">
      <div>
        <h2>Investments</h2>
        <p>${all.length} holding${all.length === 1 ? "" : "s"} across ${owners} member${owners === 1 ? "" : "s"}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-action="export">${icon("download")} Export Excel</button>
        ${isAdmin() ? `<button class="btn btn-primary btn-sm" type="button" data-action="add-investment">${icon("plus")} Add investment</button>` : ""}
      </div>
    </div>

    <div class="toolbar">
      <div class="search">
        ${icon("search")}
        <input id="inv-search" type="search" placeholder="Search by name, owner, folio…" value="${esc(f.q)}" aria-label="Search investments">
      </div>
      <div class="segmented" role="group" aria-label="Filter by category">
        ${["", "equity", "debt", "other"].map((key) => {
          const label = key ? categoryMeta(key).label : "All";
          return `<button class="seg ${f.category === key ? "active" : ""}" type="button" data-action="filter-category" data-category="${key}">
            ${esc(label)} <span class="count">${counts[key] || 0}</span>
          </button>`;
        }).join("")}
      </div>
      <div class="toolbar-right">
        <select class="select-compact" id="inv-type" data-filter="type" aria-label="Filter by type">
          <option value="">All types</option>
          ${presentTypes.map((t) => `<option value="${t.key}" ${f.type === t.key ? "selected" : ""}>${esc(t.label)}</option>`).join("")}
        </select>
        <select class="select-compact" id="inv-owner" data-filter="owner" aria-label="Filter by member">
          <option value="">Everyone</option>
          ${state.members.map((m) => `<option value="${m.id}" ${String(f.owner) === String(m.id) ? "selected" : ""}>${esc(m.name)}</option>`).join("")}
        </select>
        <select class="select-compact" id="inv-sort" data-filter="sort" aria-label="Sort holdings">
          <option value="updated" ${f.sort === "updated" ? "selected" : ""}>Recently updated</option>
          <option value="current" ${f.sort === "current" ? "selected" : ""}>Highest value</option>
          <option value="gain" ${f.sort === "gain" ? "selected" : ""}>Highest gain</option>
          <option value="invested" ${f.sort === "invested" ? "selected" : ""}>Most invested</option>
          <option value="name" ${f.sort === "name" ? "selected" : ""}>Name A–Z</option>
          <option value="date" ${f.sort === "date" ? "selected" : ""}>Purchase date</option>
        </select>
      </div>
    </div>

    <div id="bulk-bar" class="bulk-bar hidden" role="status"></div>

    <div class="card table-card">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              ${isAdmin() ? `<th class="select-cell"><input type="checkbox" id="select-all" aria-label="Select all holdings"></th>` : ""}
              <th class="sortable" data-action="sort" data-sort="name">Holding ${sortIndicator("name")}</th>
              <th class="hide-sm">Key details</th>
              <th class="hide-sm sortable" data-action="sort" data-sort="owner">Owner ${sortIndicator("owner")}</th>
              <th class="num sortable" data-action="sort" data-sort="invested">Invested ${sortIndicator("invested")}</th>
              <th class="num sortable" data-action="sort" data-sort="current">Current ${sortIndicator("current")}</th>
              <th class="num sortable" data-action="sort" data-sort="gain">Gain ${sortIndicator("gain")}</th>
              <th class="actions-cell"></th>
            </tr>
          </thead>
          <tbody id="inv-body"></tbody>
        </table>
      </div>
      <div class="table-foot" id="inv-foot"></div>
    </div>
  `;
  hydrateIcons($("#view"));
  updateInvestmentsTable();
}

function sortIndicator(key) {
  if (state.filters.sort !== key) return "";
  return `<span class="sort-ind">${state.filters.dir === "asc" ? "↑" : "↓"}</span>`;
}

function updateInvestmentsTable() {
  const items = filteredInvestments();
  const body = $("#inv-body");
  if (!body) return;
  if (!items.length) {
    body.innerHTML = `<tr><td colspan="${isAdmin() ? 8 : 7}">
      <div class="empty" style="padding:44px 16px">
        <div class="empty-icon">${icon("search")}</div>
        <h3>No holdings match</h3>
        <p>Try a different search or clear the filters.</p>
        <div class="actions"><button class="btn btn-secondary btn-sm" type="button" data-action="clear-filters">Clear filters</button></div>
      </div>
    </td></tr>`;
  } else {
    body.innerHTML = items.map((item) => {
      const admin = isAdmin();
      const selected = state.selected.has(item.id);
      return `
        <tr data-investment-id="${item.id}" class="${selected ? "selected" : ""}">
          ${admin ? `<td class="select-cell"><input type="checkbox" data-select-id="${item.id}" ${selected ? "checked" : ""} aria-label="Select ${esc(item.name)}"></td>` : ""}
          <td class="name-cell">
            <strong>${esc(item.name)}</strong>
            <div class="sub"><span class="cat-dot cat-${item.category}"></span>${esc(item.type_label)}</div>
          </td>
          <td class="details-cell hide-sm">${detailSummary(item)}</td>
          <td class="hide-sm">
            <div style="display:flex;align-items:center;gap:8px">
              ${avatar(item.owner, "sm")}
              <span style="font-size:12.5px">${esc(item.owner)}</span>
            </div>
          </td>
          <td class="num">${inr(item.invested_amount)}</td>
          <td class="num">${inr(item.current_value)}</td>
          <td class="num">${gainPill(item.gain, item.gain_pct, true)}</td>
          <td class="actions-cell">
            ${admin ? `
              <button class="icon-btn" type="button" data-action="edit-investment" data-id="${item.id}" title="Edit ${esc(item.name)}" aria-label="Edit ${esc(item.name)}">${icon("edit", "sm")}</button>
              <button class="icon-btn danger" type="button" data-action="delete-investment" data-id="${item.id}" title="Delete ${esc(item.name)}" aria-label="Delete ${esc(item.name)}">${icon("trash", "sm")}</button>
            ` : `<span class="row-chev">${icon("chevronRight", "sm")}</span>`}
          </td>
        </tr>`;
    }).join("");
  }
  hydrateIcons(body);
  syncSelectionBar(items);

  const invested = items.reduce((s, i) => s + i.invested_amount, 0);
  const current = items.reduce((s, i) => s + i.current_value, 0);
  const gain = current - invested;
  $("#inv-foot").innerHTML = `
    <span>Showing <strong>${items.length}</strong> of ${state.investments.length} holdings</span>
    <span>Invested <strong>${inr(invested)}</strong> · Value <strong>${inr(current)}</strong> · Gain
      <strong style="color:${gain >= 0 ? "var(--ok)" : "var(--bad)"}">${gain >= 0 ? "+" : "−"}${inr(Math.abs(gain))}</strong>
    </span>`;
}

function syncSelectionBar(items) {
  const valid = new Set(state.investments.map((i) => i.id));
  [...state.selected].forEach((id) => { if (!valid.has(id)) state.selected.delete(id); });

  const visible = items || filteredInvestments();
  const selectAll = $("#select-all");
  if (selectAll) {
    const visibleIds = visible.map((i) => i.id);
    const chosen = visibleIds.filter((id) => state.selected.has(id)).length;
    selectAll.checked = visibleIds.length > 0 && chosen === visibleIds.length;
    selectAll.indeterminate = chosen > 0 && chosen < visibleIds.length;
  }

  const bar = $("#bulk-bar");
  if (!bar) return;
  if (!isAdmin() || !state.selected.size) {
    bar.classList.add("hidden");
    bar.innerHTML = "";
    return;
  }
  bar.classList.remove("hidden");
  bar.innerHTML = `
    <span class="bulk-count"><strong>${state.selected.size}</strong> holding${state.selected.size === 1 ? "" : "s"} selected</span>
    <button class="btn btn-ghost btn-sm" type="button" data-action="clear-selection">Clear</button>
    <button class="btn btn-danger btn-sm" type="button" data-action="bulk-delete">${icon("trash")} Delete selected</button>`;
  hydrateIcons(bar);
}

function detailSummary(item) {
  const meta = typeMeta(item.type);
  if (!meta) return `<span class="muted">—</span>`;
  const tableFields = meta.fields.filter((f) => f.table).slice(0, 2);
  if (!tableFields.length) {
    return `<span>${esc(fmtDate(item.start_date))}</span>`;
  }
  return tableFields.map((f) => {
    const value = item.details?.[f.key];
    if (value === undefined || value === null || value === "") {
      return `<span class="muted">${esc(f.label)} —</span>`;
    }
    return `<span>${esc(f.label)} <strong style="color:var(--ink-2)">${esc(formatFieldValue(f, value))}</strong></span>`;
  }).join("");
}

function formatFieldValue(field, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (field.input === "boolean") return value ? "Yes" : "No";
  if (field.input === "date") return fmtDate(value);
  if (field.input === "number") {
    const num = Number(value);
    if (field.unit === "₹") return inr(num);
    if (field.unit === "%") return `${nf(2).format(num)}%`;
    return nf(2).format(num).replace(/\.00$/, "");
  }
  return String(value);
}

/* ============================================================
   Investment drawer
   ============================================================ */

function openInvestmentDrawer(id) {
  const item = state.investments.find((i) => i.id === id);
  if (!item) return;
  const meta = typeMeta(item.type);
  const admin = isAdmin();
  const details = (meta?.fields || []).filter((f) => f.key !== "demat_id").map((f) => {
    const value = item.details?.[f.key];
    const wide = f.wide || String(value || "").length > 36;
    return `<div class="dl-item ${wide ? "wide" : ""}">
      <div class="k">${esc(f.label)}</div>
      <div class="v">${esc(formatFieldValue(f, value))}</div>
    </div>`;
  }).join("");

  openDrawer(`
    <div class="drawer-head">
      <div class="dh-main">
        <h3>${esc(item.name)}</h3>
        <div class="dh-sub"><span class="chip"><span class="cat-dot cat-${item.category}"></span>${esc(item.type_label)}</span>
        <span>${esc(item.owner)}</span></div>
      </div>
      <button class="icon-btn" type="button" data-drawer-close aria-label="Close">${icon("close")}</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-hero">
        <div class="dh-label">Current value</div>
        <div class="dh-value">${inr2(item.current_value)}</div>
        <div class="dh-row">
          <div class="dh-item"><div class="k">Invested</div><div class="v">${inr2(item.invested_amount)}</div></div>
          <div class="dh-item"><div class="k">Gain / loss</div><div class="v" style="color:${item.gain >= 0 ? "var(--ok)" : "var(--bad)"}">${item.gain >= 0 ? "+" : "−"}${inr2(Math.abs(item.gain))}</div></div>
          <div class="dh-item"><div class="k">Return</div><div class="v" style="color:${item.gain >= 0 ? "var(--ok)" : "var(--bad)"}">${pctText(item.gain_pct)}</div></div>
        </div>
      </div>
      <div class="section-label">Holding details</div>
      <div class="dl">
        ${details || `<div class="dl-item wide"><div class="v muted">No extra details recorded.</div></div>`}
        <div class="dl-item"><div class="k">Owner</div><div class="v">${esc(item.owner)}</div></div>
        <div class="dl-item"><div class="k">Purchase / start date</div><div class="v">${fmtDate(item.start_date)}</div></div>
        <div class="dl-item"><div class="k">Record ID</div><div class="v mono">${esc(item.public_id || "—")}</div></div>
        <div class="dl-item wide"><div class="k">Last updated</div><div class="v">${timeAgo(item.updated_at)}</div></div>
      </div>
    </div>
    <div class="drawer-foot">
      ${admin ? `
        <button class="btn btn-secondary" type="button" data-action="edit-investment" data-id="${item.id}">${icon("edit")} Edit</button>
        <button class="btn btn-danger" type="button" data-action="delete-investment" data-id="${item.id}">${icon("trash")} Delete</button>
      ` : `<button class="btn btn-secondary btn-block" type="button" data-drawer-close>Close</button>`}
    </div>
  `);
}

/* ============================================================
   Investment form
   ============================================================ */

function openInvestmentModal(id = null) {
  if (!isAdmin()) return;
  const existing = id ? state.investments.find((i) => i.id === id) : null;
  const categories = state.meta.categories;
  let selectedCategory = existing ? existing.category : "";
  let selectedType = existing ? existing.type : "";
  let step = existing ? "fields" : "type";

  const pickerHtml = () => {
    const cat = selectedCategory || categories[0].key;
    selectedCategory = cat;
    return `
      <div class="type-picker">
        <div class="cat-tabs">
          ${categories.map((c) => `<button class="cat-tab ${cat === c.key ? "active" : ""}" type="button" data-action="pick-category" data-category="${c.key}">
            <span class="cat-dot cat-${c.key}"></span>${esc(c.label)}
          </button>`).join("")}
        </div>
        <div class="type-grid">
          ${state.meta.types.filter((t) => t.category === cat).map((t) => `
            <button class="type-tile ${selectedType === t.key ? "active" : ""}" type="button" data-action="pick-type" data-type="${t.key}">
              <span class="tt-dot" style="background:${safeColor(categoryMeta(t.category).color)}"></span>
              <span class="tt-label">${esc(t.label)}</span>
            </button>`).join("")}
        </div>
      </div>`;
  };

  const bodyFor = () => `
    <div data-step="type">${step === "type" ? pickerHtml() : ""}</div>
    <div data-step="fields" class="${step === "fields" ? "" : "hidden"}">
      <div class="type-picker">
        <div class="cat-tabs">
          ${state.meta.types.map((t) => `
            <button class="cat-tab ${selectedType === t.key ? "active" : ""}" type="button" data-action="pick-type" data-type="${t.key}" data-compact="1">
              <span class="tt-dot" style="background:${safeColor(categoryMeta(t.category).color)}"></span>${esc(t.label)}
            </button>`).join("")}
        </div>
      </div>
      <div id="inv-form-fields" style="margin-top:20px"></div>
    </div>`;

  openModal({
    title: existing ? "Edit investment" : "Add an investment",
    subtitle: existing ? "Update the holding and its current value." : "Pick what you own, then fill in the details.",
    size: "",
    body: bodyFor(),
    footer: `
      <button class="btn btn-secondary" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="button" data-save>${icon("check")} ${existing ? "Save changes" : "Add investment"}</button>`,
    onMount(backdrop, close) {
      const renderFields = () => {
        if (!selectedType) return;
        const host = backdrop.querySelector("#inv-form-fields");
        const meta = typeMeta(selectedType);
        host.innerHTML = investmentFormHtml(meta, existing);
        hydrateIcons(host);
        const form = backdrop.querySelector("#inv-investment-form");
        wireInvestmentForm(form, meta, existing);
      };
      if (step === "fields") renderFields();

      backdrop.querySelector("[data-save]").addEventListener("click", async () => {
        if (!selectedType) {
          toast("Choose an investment type first", "warn");
          return;
        }
        const form = backdrop.querySelector("#inv-investment-form");
        if (!form) return;
        await submitInvestmentForm(form, typeMeta(selectedType), existing, close);
      });

      // Delegated picker clicks
      backdrop.addEventListener("click", (event) => {
        const catBtn = event.target.closest('[data-action="pick-category"]');
        if (catBtn) {
          selectedCategory = catBtn.dataset.category;
          backdrop.querySelector('[data-step="type"]').innerHTML = pickerHtml();
          hydrateIcons(backdrop);
          return;
        }
        const typeBtn = event.target.closest('[data-action="pick-type"]');
        if (typeBtn) {
          const next = typeBtn.dataset.type;
          selectedType = next;
          selectedCategory = typeMeta(next).category;
          step = "fields";
          const typeStep = backdrop.querySelector('[data-step="type"]');
          const fieldsStep = backdrop.querySelector('[data-step="fields"]');
          typeStep.classList.add("hidden");
          typeStep.innerHTML = "";
          fieldsStep.classList.remove("hidden");
          fieldsStep.querySelector(".type-picker").innerHTML = pickerHtml();
          hydrateIcons(fieldsStep);
          renderFields();
          return;
        }
        if (event.target.closest("[data-compact]")) {
          // handled above by pick-type
        }
      });
    },
  });
}

function investmentFormHtml(meta, existing) {
  const details = existing?.details || {};
  const common = state.meta.common_fields;
  const field = (key) => common.find((f) => f.key === key) || {};
  const nameField = field("name");
  const investField = field("invested_amount");
  const valueField = field("current_value");

  const members = state.members;
  const selectedOwner = String(existing?.owner_id || state.me?.id || members[0]?.id || "");
  const ownerOptions = members.map((m) => `<option value="${m.id}" ${selectedOwner === String(m.id) ? "selected" : ""}>${esc(m.name)}</option>`).join("");
  const ownerId = existing?.owner_id || state.me?.id || members[0]?.id || "";

  const singleSource = meta.derive?.invested?.fields?.length === 1;
  const sourceLabel = singleSource
    ? meta.fields.find((f) => f.key === meta.derive.invested.fields[0])?.label || "the details above"
    : "";
  const deriveHint = singleSource
    ? `<span class="help">Filled from ${esc(sourceLabel)} above.</span>`
    : meta.derive
      ? `<span class="help">Auto-calculated from the details above. Type here to override.</span>`
      : "";

  return `
    <form id="inv-investment-form" novalidate>
      <div class="form-section">
        <div class="form-section-head"><h4>Holding</h4><p>${esc(meta.blurb || "")}</p></div>
        <div class="grid-2">
          <label class="field span-2">
            <span>${esc(meta.name_label || nameField.label || "Name")}<span class="req">*</span></span>
            <input type="text" name="name" maxlength="160" placeholder="${esc(meta.name_placeholder || "")}" value="${esc(existing?.name || "")}">
            <span class="err" data-err="name"></span>
          </label>
          <label class="field">
            <span>Owner<span class="req">*</span></span>
            <select name="owner_id">${ownerOptions}</select>
            <span class="err" data-err="owner_id"></span>
          </label>
          <label class="field">
            <span>Purchase / start date</span>
            <input type="date" name="start_date" value="${esc(existing?.start_date || "")}">
            <span class="err" data-err="start_date"></span>
          </label>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-head"><h4>${esc(meta.label)} details</h4><p>Fields marked * are required.</p></div>
        <div class="grid-2">
          ${meta.fields.map((f) => renderFormField(f, details[f.key], ownerId)).join("")}
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-head"><h4>Valuation</h4><p>All amounts in Indian rupees.</p></div>
        <div class="grid-2">
          <label class="field">
            <span>${esc(meta.invested_label || investField.label)} (₹)${singleSource ? "" : '<span class="req">*</span>'}</span>
            <span class="input-affix"><span class="affix">₹</span><input type="number" step="0.01" min="0" inputmode="decimal" name="invested_amount" value="${existing ? existing.invested_amount : ""}" placeholder="0"${singleSource ? " readonly" : ""}></span>
            <span class="err" data-err="invested_amount"></span>
            ${deriveHint}
          </label>
          <label class="field">
            <span>${esc(meta.value_label || valueField.label)} (₹)</span>
            <span class="input-affix"><span class="affix">₹</span><input type="number" step="0.01" min="0" inputmode="decimal" name="current_value" value="${existing ? existing.current_value : ""}" placeholder="Same as invested if blank"></span>
            <span class="err" data-err="current_value"></span>
          </label>
        </div>
      </div>
    </form>`;
}

function dematOptionHtml(ownerId, selected) {
  const accounts = (state.meta?.demat_accounts || []).filter(
    (a) => !ownerId || String(a.owner_id) === String(ownerId)
  );
  if (!accounts.length) return `<option value="">No demat account saved under Masters yet</option>`;
  const options = accounts.map((a) => `<option value="${a.id}" ${String(a.id) === String(selected) ? "selected" : ""}>${esc(a.display)}</option>`);
  return `<option value="">Select…</option>${options.join("")}`;
}

function renderFormField(field, value, ownerId) {
  const id = `f-${field.key}`;
  const required = field.required && !field.auto ? '<span class="req">*</span>' : "";
  const help = field.auto
    ? `<span class="help">${field.input === "number" ? "Fetched from market data." : "Filled in automatically."}</span>`
    : field.computed
      ? `<span class="help">Calculated automatically.</span>`
      : field.help
        ? `<span class="help">${esc(field.help)}</span>`
        : field.key === "symbol"
          ? `<span class="help">Type 3+ letters to search NSE scrips</span>`
          : field.options_from
            ? `<span class="help">Manage demat accounts under Masters.</span>`
            : "";
  const err = `<span class="err" data-err="${field.key}"></span>`;
  let control = "";

  if (field.input === "select") {
    if (field.auto) {
      control = `<input type="text" name="${field.key}" id="${id}" value="${esc(value || "")}" placeholder="Auto" readonly>`;
    } else if (field.options_from === "demat_accounts") {
      control = `<select name="${field.key}" id="${id}" data-demat-select>${dematOptionHtml(ownerId, value)}</select>`;
    } else {
      const options = field.options || [];
      const current = value ?? field.default ?? "";
      control = `<select name="${field.key}" id="${id}">
      <option value="">Select…</option>
      ${options.map((opt) => `<option value="${esc(opt)}" ${String(current) === String(opt) ? "selected" : ""}>${esc(opt)}</option>`).join("")}
    </select>`;
    }
  } else if (field.input === "boolean") {
    control = `<div class="switch">
      <input type="checkbox" name="${field.key}" id="${id}" ${value ? "checked" : ""}>
      <label class="track" for="${id}"></label>
      <span class="switch-label">${value ? "Yes" : "No"}</span>
    </div>`;
  } else if (field.input === "date") {
    control = `<input type="date" name="${field.key}" id="${id}" value="${esc(value || "")}"${field.computed ? " readonly" : ""}>`;
  } else if (field.input === "number") {
    const affix = field.unit ? `<span class="affix">${esc(field.unit)}</span>` : "";
    const cls = field.unit ? "input-affix" : "";
    const min = field.min !== undefined ? `min="${field.min}"` : "";
    const max = field.max !== undefined ? `max="${field.max}"` : "";
    control = `<span class="${cls}">${affix}<input type="number" step="0.01" ${min} ${max} inputmode="decimal" name="${field.key}" id="${id}" value="${value ?? ""}" placeholder="${field.auto ? "Auto" : "0"}"${field.computed || field.auto ? " readonly" : ""}></span>`;
  } else {
    const suggest = field.key === "symbol"
      ? ' autocomplete="off" spellcheck="false" aria-autocomplete="list" aria-expanded="false"'
      : "";
    control = `<input type="text" name="${field.key}" id="${id}" maxlength="300" value="${esc(value || "")}" placeholder="${esc(field.placeholder || "")}"${field.auto ? " readonly" : ""}${suggest}>`;
    if (field.key === "symbol") {
      control = `<div class="scrip-picker">${control}<div class="scrip-suggest" data-suggest hidden></div></div>`;
    }
  }

  return `<label class="field ${field.wide ? "span-2" : ""}" data-field="${field.key}">
    <span>${esc(field.label)}${required}</span>
    ${control}
    ${help}
    ${err}
  </label>`;
}

const TENOR_FIELDS = ["tenor_years", "tenor_months", "tenor_days"];

function formNumber(form, name) {
  const el = form.querySelector(`[name="${name}"]`);
  if (!el || el.value === "") return null;
  const value = Number(el.value);
  return Number.isFinite(value) ? value : null;
}

function addTenorTo(startStr, years, months, days) {
  const start = new Date(`${startStr}T00:00:00`);
  if (!startStr || Number.isNaN(start.getTime())) return null;
  const total = start.getMonth() + years * 12 + months;
  const year = start.getFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const result = new Date(year, month, Math.min(start.getDate(), lastDay));
  result.setDate(result.getDate() + days);
  return result;
}

function isoOfDate(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function leapDaysBetween(start, end) {
  let count = 0;
  for (let year = start.getFullYear(); year <= end.getFullYear(); year += 1) {
    const feb29 = new Date(year, 1, 29);
    if (feb29.getMonth() === 1 && feb29 > start && feb29 <= end) count += 1;
  }
  return count;
}

function maturityFromForm(form, meta, useTypedMaturity = false) {
  const startStr = form.querySelector('[name="start_date"]')?.value || "";
  if (!startStr) return null;
  const tenor = TENOR_FIELDS.map((key) => formNumber(form, key) || 0);
  let end;
  if (useTypedMaturity) {
    const typed = form.querySelector('[name="maturity_date"]')?.value || "";
    if (!typed) return null;
    end = new Date(`${typed}T00:00:00`);
    if (Number.isNaN(end.getTime())) return null;
  } else {
    if (!tenor.some(Boolean)) return null;
    end = addTenorTo(startStr, ...tenor);
    if (!end) return null;
  }
  const rate = formNumber(form, "interest_rate");
  if (rate === null) return { date: isoOfDate(end), amount: null };
  const start = new Date(`${startStr}T00:00:00`);
  const days = (end - start) / 86400000 - leapDaysBetween(start, end);
  const years = days / 365;

  let amount = null;
  if (meta.key === "fd") {
    const principal = formNumber(form, "principal");
    if (principal === null) return { date: isoOfDate(end), amount: null };
    const payout = form.querySelector('[name="payout"]')?.value || "Cumulative";
    if (payout !== "Cumulative") {
      amount = principal;
    } else {
      const compounding = form.querySelector('[name="compounding"]')?.value || "Quarterly";
      const perYear = { Monthly: 12, Quarterly: 4, "Half-yearly": 2, Annual: 1 }[compounding] || 4;
      amount = compounding === "Simple"
        ? principal * (1 + rate / 100 * years)
        : principal * (1 + rate / 100 / perYear) ** (perYear * years);
    }
  } else if (meta.key === "rd") {
    const monthly = formNumber(form, "monthly_amount");
    if (monthly === null) return { date: isoOfDate(end), amount: null };
    const months = tenor.some(Boolean) ? tenor[0] * 12 + tenor[1] + tenor[2] / 30 : years * 12;
    const monthlyRate = rate / 100 / 12;
    amount = monthlyRate === 0
      ? monthly * months
      : monthly * (((1 + monthlyRate) ** months - 1) / monthlyRate) * (1 + monthlyRate);
  }
  return { date: isoOfDate(end), amount };
}

function wireMaturityPreview(form, meta) {
  const dateField = form.querySelector('[name="maturity_date"]');
  const amountField = form.querySelector('[name="maturity_amount"]');
  if (!dateField && !amountField) return;
  if (dateField && !dateField.value) dateField.dataset.auto = "1";
  dateField?.addEventListener("input", () => { delete dateField.dataset.auto; });
  const recalc = () => {
    const typed = Boolean(dateField && dateField.value && !dateField.dataset.auto);
    const result = maturityFromForm(form, meta, typed);
    if (!result) return;
    if (dateField && !typed) {
      dateField.value = result.date;
      dateField.dataset.auto = "1";
    }
    if (amountField) amountField.value = result.amount === null ? "" : round2(result.amount);
  };
  form.addEventListener("input", recalc);
  form.addEventListener("change", recalc);
  recalc();
}

function wireInvestmentForm(form, meta, existing) {
  if (!form) return;
  const touched = { invested: false, current: false };
  const invested = form.querySelector('[name="invested_amount"]');
  const current = form.querySelector('[name="current_value"]');
  invested?.addEventListener("input", () => { touched.invested = true; });
  current?.addEventListener("input", () => { touched.current = true; });

  if (meta.derive) {
    const sourceKeys = new Set([
      ...(meta.derive.invested?.fields || []),
      ...(meta.derive.value?.fields || []),
    ]);
    const getValue = (key) => {
      const el = form.querySelector(`[name="${key}"]`);
      if (!el) return NaN;
      const raw = el.value;
      return raw === "" ? NaN : Number(raw);
    };
    const compute = (spec) => {
      if (!spec) return null;
      const values = spec.fields.map(getValue);
      if (values.some((v) => !Number.isFinite(v))) return null;
      return spec.op === "sum" ? values.reduce((a, b) => a + b, 0) : values.reduce((a, b) => a * b, 1);
    };
    const recalc = () => {
      if (!touched.invested) {
        const value = compute(meta.derive.invested);
        if (value !== null) invested.value = round2(value);
      }
      if (!touched.current) {
        const value = compute(meta.derive.value);
        if (value !== null) current.value = round2(value);
      }
    };
    form.addEventListener("input", (event) => {
      if (!sourceKeys.has(event.target.name)) return;
      recalc();
    });
    if (!existing) recalc();
  }

  form.querySelectorAll(".switch input").forEach((input) => {
    input.addEventListener("change", () => {
      const label = input.parentElement.querySelector(".switch-label");
      if (label) label.textContent = input.checked ? "Yes" : "No";
    });
  });

  wireMaturityPreview(form, meta);
  const ownerSelect = form.querySelector('[name="owner_id"]');
  const dematSelect = form.querySelector("[data-demat-select]");
  if (ownerSelect && dematSelect) {
    ownerSelect.addEventListener("change", () => {
      dematSelect.innerHTML = dematOptionHtml(ownerSelect.value, dematSelect.value);
    });
  }
  if (meta.key === "stocks" || meta.key === "etf") wireScripLookup(form, meta);
}

function wireScripLookup(form, meta) {
  const input = form.querySelector('[name="symbol"]');
  const box = form.querySelector("[data-suggest]");
  if (!input || !box) return;

  let timer = null;
  let requestSeq = 0;
  let items = [];
  let active = -1;

  const hide = () => {
    box.hidden = true;
    box.innerHTML = "";
    items = [];
    active = -1;
    input.setAttribute("aria-expanded", "false");
  };

  const paint = () => {
    input.setAttribute("aria-expanded", "true");
    box.hidden = false;
    if (!items.length) {
      box.innerHTML = `<div class="suggest-empty">No match — load NSE files under Market data.</div>`;
      return;
    }
    box.innerHTML = items.map((item, index) => `
      <button type="button" class="suggest-item ${index === active ? "active" : ""}" data-suggest-index="${index}" role="option">
        <span class="ss-sym">${esc(item.symbol)}</span>
        <span class="ss-name">${esc(item.name)}</span>
        <span class="ss-ltp">${item.ltp != null ? inr2(item.ltp) : "—"}</span>
      </button>`).join("");
  };

  const choose = (item) => {
    input.value = item.symbol;
    const nameInput = form.querySelector('[name="name"]');
    if (nameInput) nameInput.value = item.name;
    const exchange = form.querySelector('[name="exchange"]');
    if (exchange) exchange.value = "NSE";
    hide();
  };

  input.addEventListener("input", () => {
    const term = input.value.trim();
    clearTimeout(timer);
    if (term.length < 3) {
      hide();
      return;
    }
    const seq = ++requestSeq;
    timer = setTimeout(async () => {
      try {
        const data = await api(`/scrips?q=${encodeURIComponent(term)}`);
        if (seq !== requestSeq) return;
        items = data.items || [];
        active = -1;
        paint();
      } catch {
        if (seq === requestSeq) hide();
      }
    }, 220);
  });

  input.addEventListener("keydown", (event) => {
    if (box.hidden) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      active = Math.min(active + 1, items.length - 1);
      paint();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      active = Math.max(active - 1, 0);
      paint();
    } else if (event.key === "Enter" && active >= 0 && items[active]) {
      event.preventDefault();
      choose(items[active]);
    } else if (event.key === "Escape") {
      hide();
    }
  });

  box.addEventListener("mousedown", (event) => {
    const button = event.target.closest("[data-suggest-index]");
    if (!button) return;
    event.preventDefault();
    const item = items[Number(button.dataset.suggestIndex)];
    if (item) choose(item);
  });

  input.addEventListener("blur", () => setTimeout(hide, 140));
}

function collectInvestmentPayload(form, meta) {
  const payload = {
    type: meta.key,
    owner_id: Number(form.querySelector('[name="owner_id"]')?.value) || null,
    name: form.querySelector('[name="name"]')?.value.trim() || "",
    start_date: form.querySelector('[name="start_date"]')?.value || null,
    invested_amount: form.querySelector('[name="invested_amount"]')?.value ?? "",
    current_value: form.querySelector('[name="current_value"]')?.value ?? "",
  };
  meta.fields.forEach((f) => {
    if (f.computed || f.auto) return;
    const el = form.querySelector(`[name="${f.key}"]`);
    if (!el) return;
    if (f.input === "boolean") payload[f.key] = el.checked;
    else payload[f.key] = el.value;
  });
  return payload;
}

function applyFormErrors(form, errors) {
  $$("[data-field]", form).forEach((label) => {
    label.classList.remove("invalid");
    const err = label.querySelector("[data-err]");
    if (err) err.textContent = "";
  });
  let first = null;
  Object.entries(errors || {}).forEach(([key, message]) => {
    const errEl = form.querySelector(`[data-err="${key}"]`);
    if (errEl) {
      errEl.textContent = message;
      const wrapper = errEl.closest(".field");
      wrapper?.classList.add("invalid");
      if (!first) first = wrapper;
    } else {
      const direct = form.querySelector(`[data-err="${key}"]`) || form.querySelector(`[name="${key}"]`);
      if (!first && direct) first = direct.closest(".field") || direct;
    }
  });
  if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function submitInvestmentForm(form, meta, existing, close) {
  const payload = collectInvestmentPayload(form, meta);
  const errors = {};
  if (!payload.name) errors.name = "Give this investment a name";
  if (!payload.owner_id) errors.owner_id = "Choose an owner";
  if (Object.keys(errors).length) {
    applyFormErrors(form, errors);
    return;
  }
  const button = $("[data-save]", $("#modal-root"));
  if (button) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> Saving…`;
  }
  try {
    if (existing) await api(`/investments/${existing.id}`, { method: "PUT", body: payload });
    else await api("/investments", { method: "POST", body: payload });
    close();
    closeDrawer();
    toast(existing ? "Holding updated" : "Holding added", "ok");
    await refreshAndRender();
  } catch (error) {
    if (error.status === 422 && error.data?.errors) applyFormErrors(form, error.data.errors);
    else toast(error.message, "error");
    if (button) {
      button.disabled = false;
      button.innerHTML = `${icon("check")} ${existing ? "Save changes" : "Add investment"}`;
    }
  }
}

async function deleteInvestment(id) {
  const item = state.investments.find((i) => i.id === id);
  if (!item) return;
  const ok = await confirmDialog({
    title: "Delete this holding?",
    message: `<strong>${esc(item.name)}</strong> will be removed from the portfolio. This cannot be undone.`,
    confirmLabel: "Delete holding",
  });
  if (!ok) return;
  try {
    await api(`/investments/${id}`, { method: "DELETE" });
    closeDrawer();
    toast("Holding deleted", "ok");
    await refreshAndRender();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function bulkDeleteInvestments() {
  const ids = [...state.selected];
  if (!ids.length) return;
  const ok = await confirmDialog({
    title: `Delete ${ids.length} holding${ids.length === 1 ? "" : "s"}?`,
    message: `<strong>${ids.length}</strong> selected holding${ids.length === 1 ? "" : "s"} will be removed from the portfolio. This cannot be undone.`,
    confirmLabel: `Delete ${ids.length}`,
  });
  if (!ok) return;
  try {
    const result = await api("/investments/bulk-delete", { method: "POST", body: { ids } });
    state.selected.clear();
    closeDrawer();
    toast(`Deleted ${result.deleted} holding${result.deleted === 1 ? "" : "s"}`, "ok");
    await refreshAndRender();
  } catch (error) {
    toast(error.message, "error");
  }
}

/* ============================================================
   Members
   ============================================================ */

function memberCanEdit(member) {
  return isAdmin() || member.is_self;
}

function renderMembers() {
  const members = state.members;
  $("#view").innerHTML = `
    <div class="page-head">
      <div>
        <h2>Members</h2>
        <p>Everyone shares one portfolio. Admins can edit, viewers have read-only access.</p>
      </div>
      <div class="page-actions">
        ${isAdmin() ? `<button class="btn btn-primary btn-sm" type="button" data-action="add-member">${icon("plus")} Add member</button>` : ""}
      </div>
    </div>

    <div class="info-strip" style="margin-bottom:18px">
      ${icon("lock")}
      <span>PAN, Aadhaar and bank account numbers are masked for viewers. Only the member and admins can see them in full.</span>
    </div>

    <div class="members-grid">
      ${members.map((m) => memberCard(m)).join("")}
    </div>
  `;
  hydrateIcons($("#view"));
}

function memberCard(member) {
  const edit = memberCanEdit(member);
  const hasKyc = member.pan || member.aadhaar;
  const lock = member.masked ? ` ${icon("lock", "sm")}` : "";
  return `
    <article class="card member-card">
      <div class="member-head">
        ${avatar(member.name, "lg")}
        <div class="meta">
          <div class="name">${esc(member.name)}
            <span class="badge ${member.role === "admin" ? "badge-admin" : "badge-viewer"}">${member.role === "admin" ? "Admin" : "Viewer"}</span>
            ${member.is_self ? `<span class="badge badge-brand">You</span>` : ""}
          </div>
          <div class="email">${esc(member.email)}</div>
        </div>
      </div>
      <div class="member-totals">
        <div class="member-total">
          <div class="lbl">Portfolio value</div>
          <div class="val" title="${inr2(member.value)}">${compactMoney(member.value)}</div>
        </div>
        <div class="member-total">
          <div class="lbl">Holdings</div>
          <div class="val">${member.holdings}</div>
        </div>
      </div>
      <div class="member-details">
        <div class="detail-line"><span class="k">PAN</span><span class="v masked">${esc(member.pan || "Not added")}${member.pan ? lock : ""}</span></div>
        <div class="detail-line"><span class="k">Aadhaar</span><span class="v masked">${esc(member.aadhaar || "Not added")}${member.aadhaar ? lock : ""}</span></div>
        <div class="detail-line"><span class="k">Bank</span><span class="v">${member.bank_name ? esc(member.bank_name) : "Not added"}${member.bank_branch ? `<span class="sub">${esc(member.bank_branch)}</span>` : ""}</span></div>
        <div class="detail-line"><span class="k">Account</span><span class="v masked">${member.account_number ? esc(member.account_number) : "Not added"}${member.account_number ? lock : ""}${member.account_type ? `<span class="sub">${esc(member.account_type)}</span>` : ""}</span></div>
        <div class="detail-line"><span class="k">IFSC</span><span class="v">${esc(member.ifsc || "Not added")}</span></div>
        <div class="detail-line"><span class="k">Phone</span><span class="v">${esc(member.phone || "Not added")}</span></div>
      </div>
      <div class="member-foot">
        ${edit ? `<button class="btn btn-secondary btn-sm" type="button" data-action="edit-member" data-id="${member.id}">${icon("edit", "sm")} Edit profile</button>` : ""}
        ${edit ? `<button class="btn btn-ghost btn-sm" type="button" data-action="member-password" data-id="${member.id}">${icon("lock", "sm")} Password</button>` : ""}
        ${isAdmin() && !member.is_self ? `<button class="icon-btn danger" type="button" data-action="delete-member" data-id="${member.id}" aria-label="Remove ${esc(member.name)}">${icon("trash")}</button>` : ""}
        ${!hasKyc && edit ? `<span class="pill pill-warn" style="margin-left:auto">KYC incomplete</span>` : ""}
      </div>
    </article>`;
}

function openMemberModal(id = null) {
  const existing = id ? state.members.find((m) => m.id === id) : null;
  if (existing && !memberCanEdit(existing)) {
    toast("You can only edit your own profile", "warn");
    return;
  }
  const admin = isAdmin();
  const roleLocked = !admin;

  openModal({
    title: existing ? "Edit member" : "Add a member",
    subtitle: existing ? "Keep KYC and bank details up to date." : "Members share this portfolio. Admins can edit, viewers cannot.",
    body: `
      <form id="member-form" novalidate>
        <div class="form-section">
          <div class="form-section-head"><h4>Identity</h4><p>Who is this member?</p></div>
          <div class="grid-2">
            <label class="field"><span>Full name<span class="req">*</span></span>
              <input type="text" name="name" maxlength="100" value="${esc(existing?.name || "")}" placeholder="e.g. Ananya Sharma">
              <span class="err" data-err="name"></span></label>
            <label class="field"><span>Email<span class="req">*</span></span>
              <input type="email" name="email" value="${esc(existing?.email || "")}" placeholder="member@example.com">
              <span class="err" data-err="email"></span></label>
            <label class="field"><span>Role</span>
              <select name="role" ${roleLocked ? "disabled" : ""}>
                <option value="viewer" ${(existing?.role || "viewer") === "viewer" ? "selected" : ""}>Viewer — read-only</option>
                <option value="admin" ${existing?.role === "admin" ? "selected" : ""}>Admin — can edit everything</option>
              </select>
              <span class="err" data-err="role"></span></label>
            <label class="field"><span>Mobile number</span>
              <input type="tel" name="phone" maxlength="13" value="${esc(existing?.phone || "")}" placeholder="10-digit mobile">
              <span class="err" data-err="phone"></span></label>
            <label class="field"><span>Date of birth</span>
              <input type="date" name="dob" value="${esc(existing?.dob || "")}">
              <span class="err" data-err="dob"></span></label>
            ${existing ? "" : `<label class="field"><span>Initial password<span class="req">*</span></span>
              <input type="password" name="password" autocomplete="new-password" placeholder="At least 8 characters">
              <span class="err" data-err="password"></span></label>`}
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-head"><h4>KYC</h4><p>Stored securely on this machine and masked for viewers.</p></div>
          <div class="grid-2">
            <label class="field"><span>PAN</span>
              <input type="text" name="pan" maxlength="10" style="text-transform:uppercase" value="${esc(existing?.pan || "")}" placeholder="ABCDE1234F">
              <span class="err" data-err="pan"></span></label>
            <label class="field"><span>Aadhaar</span>
              <input type="text" name="aadhaar" maxlength="14" inputmode="numeric" value="${esc(existing?.aadhaar || "")}" placeholder="12-digit Aadhaar">
              <span class="err" data-err="aadhaar"></span></label>
            <label class="field span-2"><span>Address</span>
              <textarea name="address" maxlength="500" placeholder="Flat, street, city, PIN">${esc(existing?.address || "")}</textarea>
              <span class="err" data-err="address"></span></label>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section-head"><h4>Bank account</h4><p>Type an IFSC to fetch the bank and branch automatically.</p></div>
          <div class="grid-2">
            <label class="field"><span>IFSC code</span>
              <span class="input-wrap">
                <input type="text" name="ifsc" maxlength="11" style="text-transform:uppercase" value="${esc(existing?.ifsc || "")}" placeholder="HDFC0001234">
                <button type="button" class="reveal" data-ifsc-lookup>Fetch</button>
              </span>
              <span class="help" data-ifsc-help>We use the free Razorpay IFSC directory.</span>
              <span class="err" data-err="ifsc"></span></label>
            <label class="field"><span>Account type</span>
              <select name="account_type">
                <option value="">Select…</option>
                ${(state.meta.account_types || []).map((t) => `<option value="${esc(t)}" ${existing?.account_type === t ? "selected" : ""}>${esc(t)}</option>`).join("")}
              </select>
              <span class="err" data-err="account_type"></span></label>
            <label class="field"><span>Bank name</span>
              <input type="text" name="bank_name" maxlength="120" value="${esc(existing?.bank_name || "")}" placeholder="Auto-filled from IFSC">
              <span class="err" data-err="bank_name"></span></label>
            <label class="field"><span>Branch</span>
              <input type="text" name="bank_branch" maxlength="160" value="${esc(existing?.bank_branch || "")}" placeholder="Auto-filled from IFSC">
              <span class="err" data-err="bank_branch"></span></label>
            <label class="field span-2"><span>Account number</span>
              <input type="text" name="account_number" maxlength="20" inputmode="numeric" value="${esc(existing?.account_number || "")}" placeholder="6-20 digits">
              <span class="err" data-err="account_number"></span></label>
          </div>
        </div>
      </form>`,
    footer: `
      <button class="btn btn-secondary" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="button" data-save>${icon("check")} ${existing ? "Save member" : "Add member"}</button>`,
    onMount(backdrop, close) {
      const form = backdrop.querySelector("#member-form");
      const help = backdrop.querySelector("[data-ifsc-help]");

      backdrop.querySelector("[data-ifsc-lookup]").addEventListener("click", async (event) => {
        const button = event.currentTarget;
        const code = form.ifsc.value.trim().toUpperCase();
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) {
          help.textContent = "Enter a valid IFSC like HDFC0001234.";
          help.style.color = "var(--bad)";
          return;
        }
        button.textContent = "…";
        button.disabled = true;
        try {
          const bank = await api(`/ifsc/${code}`);
          form.bank_name.value = bank.bank || form.bank_name.value;
          form.bank_branch.value = bank.branch || form.bank_branch.value;
          help.textContent = `${bank.bank} · ${bank.branch}${bank.city ? `, ${bank.city}` : ""}`;
          help.style.color = "var(--ok)";
          toast("Bank details fetched", "ok");
        } catch (error) {
          help.textContent = error.message;
          help.style.color = "var(--bad)";
        } finally {
          button.textContent = "Fetch";
          button.disabled = false;
        }
      });

      form.ifsc.addEventListener("blur", () => {
        form.ifsc.value = form.ifsc.value.trim().toUpperCase();
      });
      form.pan.addEventListener("blur", () => {
        form.pan.value = form.pan.value.trim().toUpperCase();
      });

      backdrop.querySelector("[data-save]").addEventListener("click", async () => {
        const payload = {
          name: form.name.value.trim(),
          email: form.email.value.trim(),
          role: roleLocked ? (existing?.role || "viewer") : form.role.value,
          phone: form.phone.value.trim(),
          dob: form.dob.value,
          pan: form.pan.value.trim().toUpperCase(),
          aadhaar: form.aadhaar.value.replace(/\s/g, ""),
          address: form.address.value.trim(),
          ifsc: form.ifsc.value.trim().toUpperCase(),
          bank_name: form.bank_name.value.trim(),
          bank_branch: form.bank_branch.value.trim(),
          account_number: form.account_number.value.trim(),
          account_type: form.account_type.value,
        };
        if (!existing) payload.password = form.password.value;
        const button = backdrop.querySelector("[data-save]");
        button.disabled = true;
        button.innerHTML = `<span class="spinner"></span> Saving…`;
        try {
          if (existing) await api(`/members/${existing.id}`, { method: "PUT", body: payload });
          else await api("/members", { method: "POST", body: payload });
          close();
          toast(existing ? "Member updated" : "Member added", "ok");
          await refreshAndRender();
        } catch (error) {
          if (error.status === 422 && error.data?.errors) {
            $$("[data-field]", form).forEach((el) => el.classList.remove("invalid"));
            Object.entries(error.data.errors).forEach(([key, message]) => {
              const err = form.querySelector(`[data-err="${key}"]`);
              if (err) {
                err.textContent = message;
                err.closest(".field")?.classList.add("invalid");
              }
            });
          } else {
            toast(error.message, "error");
          }
          button.disabled = false;
          button.innerHTML = `${icon("check")} ${existing ? "Save member" : "Add member"}`;
        }
      });
    },
  });
}

function openPasswordModal(member) {
  const target = member || state.members.find((m) => m.is_self);
  if (!target) return;
  const self = target.is_self;
  openModal({
    title: self ? "Change your password" : `Reset password for ${target.name}`,
    size: "modal-sm",
    body: `
      <form id="password-form" class="form-section" novalidate>
        ${self ? `<label class="field"><span>Current password</span>
          <input type="password" name="current_password" autocomplete="current-password" placeholder="Current password">
          <span class="err" data-err="current_password"></span></label>` : ""}
        <label class="field"><span>New password</span>
          <input type="password" name="new_password" autocomplete="new-password" placeholder="At least 8 characters, letters and numbers">
          <span class="err" data-err="new_password"></span></label>
        <label class="field"><span>Confirm new password</span>
          <input type="password" name="confirm" autocomplete="new-password" placeholder="Repeat new password">
          <span class="err" data-err="confirm"></span></label>
      </form>`,
    footer: `
      <button class="btn btn-secondary" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="button" data-save>${icon("check")} Update password</button>`,
    onMount(backdrop, close) {
      const form = backdrop.querySelector("#password-form");
      backdrop.querySelector("[data-save]").addEventListener("click", async () => {
        const errors = {};
        if (form.new_password.value !== form.confirm.value) errors.confirm = "Passwords do not match";
        if (Object.keys(errors).length) {
          form.querySelector('[data-err="confirm"]').textContent = errors.confirm;
          return;
        }
        const button = backdrop.querySelector("[data-save]");
        button.disabled = true;
        try {
          await api(`/members/${target.id}/password`, {
            method: "POST",
            body: {
              current_password: self ? form.current_password.value : undefined,
              new_password: form.new_password.value,
            },
          });
          close();
          toast("Password updated", "ok");
        } catch (error) {
          if (error.status === 422 && error.data?.errors) {
            Object.entries(error.data.errors).forEach(([key, message]) => {
              const err = form.querySelector(`[data-err="${key}"]`);
              if (err) err.textContent = message;
            });
          } else {
            toast(error.message, "error");
          }
          button.disabled = false;
        }
      });
    },
  });
}

async function deleteMember(id) {
  const member = state.members.find((m) => m.id === id);
  if (!member) return;
  const ok = await confirmDialog({
    title: "Remove this member?",
    message: `<strong>${esc(member.name)}</strong> will lose access. Holdings they own must be reassigned first.`,
    confirmLabel: "Remove member",
  });
  if (!ok) return;
  try {
    await api(`/members/${id}`, { method: "DELETE" });
    toast("Member removed", "ok");
    await refreshAndRender();
  } catch (error) {
    toast(error.message, "error");
  }
}

/* ============================================================
   Profile
   ============================================================ */

function renderProfile() {
  const me = state.members.find((m) => m.is_self) || state.me;
  $("#view").innerHTML = `
    <div class="page-head">
      <div>
        <h2>${esc(me.name)}</h2>
        <p>${esc(me.email)} · <span class="badge ${me.role === "admin" ? "badge-admin" : "badge-viewer"}">${me.role === "admin" ? "Admin" : "Viewer"}</span></p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-action="edit-member" data-id="${me.id}">${icon("edit")} Edit profile</button>
        <button class="btn btn-primary btn-sm" type="button" data-action="member-password" data-id="${me.id}">${icon("lock")} Change password</button>
      </div>
    </div>

    <div class="dash-grid">
      <section class="card card-pad span-7">
        <div class="card-head">
          <div>
            <div class="card-title">Personal & KYC details</div>
            <div class="card-sub">Only you and workspace admins can see this</div>
          </div>
          ${me.has_kyc ? `<span class="pill pill-ok">KYC complete</span>` : `<span class="pill pill-warn">KYC incomplete</span>`}
        </div>
        <div class="dl">
          <div class="dl-item"><div class="k">Full name</div><div class="v">${esc(me.name)}</div></div>
          <div class="dl-item"><div class="k">Email</div><div class="v">${esc(me.email)}</div></div>
          <div class="dl-item"><div class="k">PAN</div><div class="v masked">${esc(me.pan || "Not added")}</div></div>
          <div class="dl-item"><div class="k">Aadhaar</div><div class="v masked">${esc(me.aadhaar || "Not added")}</div></div>
          <div class="dl-item"><div class="k">Date of birth</div><div class="v">${me.dob ? fmtDate(me.dob) : "Not added"}</div></div>
          <div class="dl-item"><div class="k">Mobile</div><div class="v">${esc(me.phone || "Not added")}</div></div>
          <div class="dl-item wide"><div class="k">Address</div><div class="v">${esc(me.address || "Not added")}</div></div>
        </div>
        <div class="section-label">Bank account</div>
        <div class="dl">
          <div class="dl-item"><div class="k">Bank</div><div class="v">${esc(me.bank_name || "Not added")}</div></div>
          <div class="dl-item"><div class="k">Branch</div><div class="v">${esc(me.bank_branch || "Not added")}</div></div>
          <div class="dl-item"><div class="k">Account number</div><div class="v masked">${esc(me.account_number || "Not added")}</div></div>
          <div class="dl-item"><div class="k">IFSC</div><div class="v">${esc(me.ifsc || "Not added")}</div></div>
          <div class="dl-item"><div class="k">Account type</div><div class="v">${esc(me.account_type || "Not added")}</div></div>
        </div>
      </section>

      <section class="card card-pad span-5">
        <div class="card-head">
          <div>
            <div class="card-title">Your holdings</div>
            <div class="card-sub">Investments owned by you</div>
          </div>
        </div>
        <div class="divider" style="margin-top:0"></div>
        <div class="dl">
          <div class="dl-item"><div class="k">Holdings</div><div class="v">${me.holdings ?? 0}</div></div>
          <div class="dl-item"><div class="k">Portfolio value</div><div class="v">${compactMoney(me.value || 0)}</div></div>
          <div class="dl-item"><div class="k">Amount invested</div><div class="v">${compactMoney(me.invested || 0)}</div></div>
          <div class="dl-item"><div class="k">Member since</div><div class="v">${fmtDate(me.created_at)}</div></div>
        </div>
        <div class="info-strip" style="margin-top:18px">${icon("shield")}
          <span>Access is role-based. Admins can add or edit every holding; viewers can browse but not change data.</span>
        </div>
      </section>
    </div>
  `;
  hydrateIcons($("#view"));
}

/* ============================================================
   Masters — brokers and demat accounts
   ============================================================ */

function renderMasters() {
  const accounts = state.meta?.demat_accounts || [];
  const admin = isAdmin();
  $("#view").innerHTML = `
    <div class="page-head">
      <div>
        <h2>Masters</h2>
        <p>Broker and demat accounts you own. Pick one by name while adding a stock or ETF.</p>
      </div>
      <div class="page-actions">
        ${admin ? `<button class="btn btn-primary btn-sm" type="button" data-action="add-demat">${icon("plus")} Add demat account</button>` : ""}
      </div>
    </div>

    <div class="info-strip" style="margin-bottom:18px">
      ${icon("shield")}
      <span>Sector, current price and broker are filled automatically. Save each demat account once here, then select it from the dropdown in the holding form.</span>
    </div>

    ${accounts.length ? `
      <div class="card">
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th>Demat account</th><th>Owner</th><th>Broker / DP</th><th>Client ID</th>
              <th class="num">Holdings</th>${admin ? "<th></th>" : ""}
            </tr></thead>
            <tbody>
              ${accounts.map((a) => `<tr>
                <td><div style="font-weight:650;font-size:12.5px">${esc(a.label || a.broker)}</div><div class="cell-sub">${esc(a.display)}</div></td>
                <td style="font-size:12px;color:var(--muted)">${esc(a.owner || "—")}</td>
                <td style="font-size:12px;color:var(--muted)">${esc(a.broker)}</td>
                <td style="font-size:12px;color:var(--muted)">${esc(a.client_id)}</td>
                <td class="num">${a.holding_count}</td>
                ${admin ? `<td class="num">
                  <button class="icon-btn" type="button" data-action="edit-demat" data-id="${a.id}" aria-label="Edit ${esc(a.display)}">${icon("edit")}</button>
                  <button class="icon-btn danger" type="button" data-action="delete-demat" data-id="${a.id}" aria-label="Delete ${esc(a.display)}">${icon("trash")}</button>
                </td>` : ""}
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>` : `
      <div class="card card-pad"><div class="empty">
        <div class="empty-icon">${icon("wallet")}</div>
        <h3>No demat accounts yet</h3>
        <p>${admin ? "Add a broker and client ID to pick it while adding holdings." : "Ask a workspace admin to add your demat account."}</p>
      </div></div>`}
  `;
  hydrateIcons($("#view"));
}

function openDematModal(id = null) {
  if (!isAdmin()) return;
  const accounts = state.meta?.demat_accounts || [];
  const existing = id ? accounts.find((a) => a.id === id) : null;
  const brokers = state.meta.brokers || [];
  const members = state.members;
  openModal({
    title: existing ? "Edit demat account" : "Add demat account",
    subtitle: "Saved once here; the holding form shows it in a dropdown.",
    body: `
      <form id="demat-form" novalidate>
        <div class="grid-2">
          <label class="field"><span>Member<span class="req">*</span></span>
            <select name="owner_id">
              ${members.map((m) => `<option value="${m.id}" ${String(existing?.owner_id ?? state.me?.id) === String(m.id) ? "selected" : ""}>${esc(m.name)}</option>`).join("")}
            </select>
            <span class="err" data-err="owner_id"></span></label>
          <label class="field"><span>Broker / DP<span class="req">*</span></span>
            <select name="broker">
              <option value="">Select…</option>
              ${brokers.map((b) => `<option value="${esc(b)}" ${existing?.broker === b ? "selected" : ""}>${esc(b)}</option>`).join("")}
            </select>
            <span class="err" data-err="broker"></span></label>
          <label class="field"><span>Client ID<span class="req">*</span></span>
            <input type="text" name="client_id" maxlength="24" value="${esc(existing?.client_id || "")}" placeholder="e.g. 1203456789">
            <span class="help">4-24 letters, digits or hyphens.</span>
            <span class="err" data-err="client_id"></span></label>
          <label class="field"><span>Nickname</span>
            <input type="text" name="label" maxlength="60" value="${esc(existing?.label || "")}" placeholder="e.g. Zerodha primary">
            <span class="err" data-err="label"></span></label>
        </div>
      </form>`,
    footer: `
      <button class="btn btn-secondary" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="button" data-save>${icon("check")} ${existing ? "Save account" : "Add account"}</button>`,
    onMount(backdrop, close) {
      const form = backdrop.querySelector("#demat-form");
      const button = backdrop.querySelector("[data-save]");
      button.addEventListener("click", async () => {
        const payload = {
          owner_id: Number(form.owner_id.value) || null,
          broker: form.broker.value,
          client_id: form.client_id.value.trim().toUpperCase(),
          label: form.label.value.trim(),
        };
        button.disabled = true;
        button.innerHTML = `<span class="spinner"></span> Saving…`;
        try {
          if (existing) await api(`/demat-accounts/${existing.id}`, { method: "PUT", body: payload });
          else await api("/demat-accounts", { method: "POST", body: payload });
          close();
          toast(existing ? "Demat account updated" : "Demat account added", "ok");
          await refreshAndRender();
        } catch (error) {
          if (error.status === 422 && error.data?.errors) {
            Object.entries(error.data.errors).forEach(([key, message]) => {
              const err = form.querySelector(`[data-err="${key}"]`);
              if (err) {
                err.textContent = message;
                err.closest(".field")?.classList.add("invalid");
              }
            });
          } else {
            toast(error.message, "error");
          }
          button.disabled = false;
          button.innerHTML = `${icon("check")} ${existing ? "Save account" : "Add account"}`;
        }
      });
    },
  });
}

async function deleteDematAccount(id) {
  const account = (state.meta?.demat_accounts || []).find((a) => a.id === id);
  if (!account) return;
  const ok = await confirmDialog({
    title: "Remove this demat account?",
    message: `<strong>${esc(account.display)}</strong> will disappear from the dropdown. Holdings keep their broker details.`,
    confirmLabel: "Remove account",
  });
  if (!ok) return;
  try {
    await api(`/demat-accounts/${id}`, { method: "DELETE" });
    toast("Demat account removed", "ok");
    await refreshAndRender();
  } catch (error) {
    toast(error.message, "error");
  }
}

/* ============================================================
   Market data
   ============================================================ */

function localISODate() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

function renderMarket() {
  if (!isAdmin()) {
    $("#view").innerHTML = `<div class="card card-pad"><div class="empty">
      <div class="empty-icon">${icon("lock")}</div>
      <h3>Admins only</h3>
      <p>Ask a workspace admin to load NSE market data.</p>
    </div></div>`;
    return;
  }
  const s = state.marketStatus;
  const ready = Boolean(s && s.prices);

  $("#view").innerHTML = `
    <div class="page-head">
      <div>
        <h2>Market data</h2>
        <p>Load NSE files once, then refresh stock and ETF valuations with real closing prices.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-action="market-reload">${icon("refresh")} Refresh status</button>
        <button class="btn btn-primary btn-sm" type="button" data-action="update-prices" ${ready && s.matched ? "" : "disabled"}>
          ${icon("trendUp")} Update prices
        </button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">${icon("list")} Scrips loaded</div>
        <div class="kpi-value">${s ? nf(0).format(s.scrips) : "—"}</div>
        <div class="kpi-foot">${s?.equity_list_updated_at ? `Equity list ${timeAgo(s.equity_list_updated_at)}` : "Upload EQUITY_L.csv"}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">${icon("market")} Price rows</div>
        <div class="kpi-value">${s ? nf(0).format(s.prices) : "—"}</div>
        <div class="kpi-foot">${s?.bhavcopy_updated_at ? `Bhavcopy ${timeAgo(s.bhavcopy_updated_at)}` : "No bhavcopy yet"}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">${icon("calendar")} Last trade date</div>
        <div class="kpi-value" style="font-size:22px">${s?.trade_date ? fmtDate(s.trade_date) : "—"}</div>
        <div class="kpi-foot">Closing prices in the database</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">${icon("checkCircle")} Matched holdings</div>
        <div class="kpi-value">${s ? `${s.matched}<span style="font-size:15px;color:var(--muted);font-weight:650"> / ${s.holdings}</span>` : "—"}</div>
        <div class="kpi-foot">Stocks and ETFs with a live price</div>
      </div>
    </div>

    <div class="import-grid">
      <section class="card card-pad">
        <div class="step-card">
          <div class="step-num">1</div>
          <div style="flex:1;min-width:0">
            <h4>Download from NSE</h4>
            <p>The equity list powers the 3-letter scrip search. The bhavcopy carries the day's closing prices.</p>
            <div class="actions">
              <button class="btn btn-primary btn-sm" type="button" data-action="download-equity">${icon("download")} EQUITY_L.csv</button>
            </div>
            <div class="divider"></div>
            <div class="download-row">
              <label class="field">
                <span>Bhavcopy date</span>
                <input type="date" id="bhav-date" value="${localISODate()}" max="${localISODate()}">
              </label>
              <button class="btn btn-primary btn-sm" type="button" data-action="download-bhavcopy">${icon("download")} Bhavcopy</button>
            </div>
            <p style="margin-top:10px">NSE only publishes on trading days. If today is a holiday or the archive is unavailable, pick an earlier date.</p>
          </div>
        </div>
      </section>

      <section class="card card-pad">
        <div class="step-card">
          <div class="step-num">2</div>
          <div style="flex:1;min-width:0">
            <h4>Upload the files</h4>
            <p>Drop either file here. The format is detected automatically, so upload the equity list and bhavcopy in any order.</p>
            <div class="dropzone" id="market-dropzone" tabindex="0" role="button" aria-label="Upload NSE market data file">
              <div class="dz-icon">${icon("upload")}</div>
              <h4>Drop EQUITY_L.csv or bhavcopy</h4>
              <p>or click to browse files</p>
              <span class="file-hint">.csv or .zip · NSE cash segment</span>
            </div>
            <input type="file" id="market-file" accept=".csv,.zip,.txt" class="hidden">
          </div>
        </div>
      </section>
    </div>

    <section class="card card-pad">
      <div class="card-head">
        <div>
          <div class="card-title">Update current prices</div>
          <div class="card-sub">Applies the stored close to each stock and ETF holding</div>
        </div>
        <span class="pill ${s?.matched ? "pill-ok" : "pill-muted"}">${s ? `${s.matched} matched` : "Loading"}</span>
      </div>
      <p style="font-size:12.5px;color:var(--muted);line-height:1.65">
        Each holding's <strong>Symbol</strong> is matched against the bhavcopy. The price field (LTP for stocks,
        current price for ETFs) and the current value are recalculated from quantity. Invested amounts stay untouched.
      </p>
      ${s && !s.prices ? `<div class="info-strip warn" style="margin-top:14px">${icon("info")}
        <span>No bhavcopy loaded yet. Download one above or upload a file you already have.</span></div>` : ""}
      ${s && s.prices && !s.matched ? `<div class="info-strip warn" style="margin-top:14px">${icon("alert")}
        <span>No holdings match the loaded prices. Add stock or ETF holdings with NSE symbols, then try again.</span></div>` : ""}
      ${s && s.matched ? `<div class="info-strip ok" style="margin-top:14px">${icon("checkCircle")}
        <span>${s.matched} holding${s.matched === 1 ? "" : "s"} can be revalued with the prices from ${s.trade_date ? fmtDate(s.trade_date) : "the latest bhavcopy"}.</span></div>` : ""}
      <div class="actions" style="margin-top:16px">
        <button class="btn btn-primary btn-sm" type="button" data-action="update-prices" ${ready && s.matched ? "" : "disabled"}>
          ${icon("trendUp")} Update current prices
        </button>
      </div>
    </section>
  `;
  hydrateIcons($("#view"));
  wireMarketDropzone();

  if (!s && !state.marketLoading) {
    state.marketLoading = true;
    api("/market/status")
      .then((data) => { state.marketStatus = data.status; })
      .catch((error) => toast(error.message, "error"))
      .finally(() => {
        state.marketLoading = false;
        if (state.view === "market") renderMarket();
      });
  }
}

function wireMarketDropzone() {
  const zone = $("#market-dropzone");
  const input = $("#market-file");
  if (!zone || !input) return;
  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
  });
  input.addEventListener("change", () => {
    if (input.files?.[0]) uploadMarketFile(input.files[0]);
  });
  ["dragenter", "dragover"].forEach((type) => zone.addEventListener(type, (event) => {
    event.preventDefault();
    zone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach((type) => zone.addEventListener(type, (event) => {
    event.preventDefault();
    zone.classList.remove("dragover");
  }));
  zone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) uploadMarketFile(file);
  });
}

async function uploadMarketFile(file) {
  if (!/\.(csv|zip|txt)$/i.test(file.name)) {
    toast("Upload the NSE .csv or .zip file", "error");
    return;
  }
  const zone = $("#market-dropzone");
  zone?.classList.add("busy");
  const heading = zone?.querySelector("h4");
  const caption = zone?.querySelector("p");
  if (heading) heading.textContent = "Reading the NSE file…";
  if (caption) caption.textContent = file.name;
  const form = new FormData();
  form.append("file", file);
  try {
    const data = await api("/market/upload", { method: "POST", form });
    state.marketStatus = data.status;
    const result = data.result;
    const suffix = result.trade_date ? ` for ${fmtDate(result.trade_date)}` : "";
    toast(`${result.label}${suffix} loaded · ${nf(0).format(result.symbols)} scrips`, "ok");
    renderMarket();
  } catch (error) {
    toast(error.message, "error");
    zone?.classList.remove("busy");
    if (heading) heading.textContent = "Drop EQUITY_L.csv or bhavcopy";
    if (caption) caption.textContent = "or click to browse files";
  }
}

async function downloadMarketFile(kind) {
  const isBhav = kind === "bhavcopy";
  const button = isBhav
    ? $('[data-action="download-bhavcopy"]')
    : $('[data-action="download-equity"]');
  const original = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> Downloading…`;
  }
  const path = isBhav
    ? `/api/market/download/bhavcopy?date=${encodeURIComponent($("#bhav-date")?.value || "")}`
    : "/api/market/download/equity-list";
  try {
    const response = await fetch(path, { credentials: "same-origin" });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || "The NSE download failed. Try a different date or upload the file manually.");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    const fallback = isBhav ? "bhavcopy.csv.zip" : "EQUITY_L.csv";
    downloadBlob(blob, match ? decodeURIComponent(match[1]) : fallback);
    const tradeDate = response.headers.get("X-Trade-Date");
    toast(tradeDate ? `Bhavcopy for ${fmtDate(tradeDate)} downloaded` : "Equity list downloaded", "ok");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    if (button) {
      button.disabled = false;
      button.innerHTML = original;
    }
  }
}

async function reloadMarketStatus(announce = false) {
  try {
    const data = await api("/market/status");
    state.marketStatus = data.status;
    if (state.view === "market") renderMarket();
    if (announce) toast("Market status refreshed", "ok");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function updateMarketPrices() {
  const status = state.marketStatus;
  if (!status?.prices) {
    toast("Upload a bhavcopy before updating prices", "warn");
    return;
  }
  const ok = await confirmDialog({
    title: "Update market prices?",
    message: `Applies the latest NSE close to <strong>${status.matched}</strong> matched stock and ETF holding${status.matched === 1 ? "" : "s"}, then recalculates their current value. Invested amounts stay as they are.`,
    confirmLabel: "Update prices",
    danger: false,
  });
  if (!ok) return;
  const button = $('[data-action="update-prices"]');
  const original = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> Updating…`;
  }
  try {
    const data = await api("/market/refresh-prices", { method: "POST" });
    state.marketStatus = data.status;
    const result = data.result;
    const parts = [`${result.updated} holding${result.updated === 1 ? "" : "s"} updated`];
    if (result.price_only) parts.push(`${result.price_only} price-only`);
    if (result.skipped) parts.push(`${result.skipped} unmatched`);
    toast(parts.join(" · "), result.updated ? "ok" : "warn");
    if (result.updated) await refreshData();
    if (state.view === "market") renderMarket();
  } catch (error) {
    toast(error.message, "error");
    if (button) {
      button.disabled = false;
      button.innerHTML = original;
    }
  }
}

/* ============================================================
   Import / export
   ============================================================ */

function storageCardHtml() {
  const s = state.storageStatus;
  if (!s) return "";
  if (s.mode === "firebase") {
    const err = s.cloud && s.cloud.last_error;
    if (err) {
      return `<div class="info-strip warn" style="margin-bottom:18px">${icon("alert")}
        <span><strong>Firebase cloud is set up, but the last sync failed.</strong> Changes are saved locally and will retry on the next change. Check the service-account credentials and Firestore. <span class="mono">${esc(err)}</span></span>
      </div>`;
    }
    return `<div class="info-strip ok" style="margin-bottom:18px">${icon("checkCircle")}
      <span><strong>Stored in the Firebase cloud.</strong> Every change is written to Firestore, so the portfolio always lives in the cloud and is reachable from any device${s.cloud && s.cloud.synced_at ? ` · last synced <span class="mono">${esc(s.cloud.synced_at)}</span>` : ""}.</span>
    </div>`;
  }
  if (s.mode === "cloud") {
    return `<div class="info-strip ok" style="margin-bottom:18px">${icon("checkCircle")}
      <span><strong>Stored in the cloud.</strong> The portfolio lives on this host's persistent disk (<span class="mono">${esc(s.path)}</span>) and survives restarts and redeployments. Everyone who signs in here sees the same data.</span>
    </div>`;
  }
  if (s.mode === "temporary") {
    return `<div class="info-strip warn" style="margin-bottom:18px">${icon("alert")}
      <span><strong>Warning: this copy is not saved to the cloud.</strong> The host keeps the portfolio on temporary storage (<span class="mono">${esc(s.path)}</span>) that is wiped on every restart or redeploy. Attach a persistent disk at <span class="mono">/var/data</span> and set <span class="mono">DEEPTRACK_DATA_DIR=/var/data</span> — see the deployment guide in the repo.</span>
    </div>`;
  }
  return `<div class="info-strip" style="margin-bottom:18px">${icon("info")}
    <span><strong>Stored on this computer only.</strong> The portfolio lives in <span class="mono">${esc(s.path)}</span> on the machine running DeepTrack — it is not in the cloud. To keep it in the cloud, host the app (for example on Render with a persistent disk), then <strong>Export portfolio</strong> here and import that file on the hosted site.</span>
  </div>`;
}

function renderImport() {
  if (!isAdmin()) {
    $("#view").innerHTML = `<div class="card card-pad"><div class="empty">
      <div class="empty-icon">${icon("lock")}</div>
      <h3>Admins only</h3>
      <p>Ask a workspace admin to import or export portfolio data.</p>
    </div></div>`;
    return;
  }
  const preview = state.importPreview;
  $("#view").innerHTML = `
    <div class="page-head">
      <div>
        <h2>Import & export</h2>
        <p>Bulk-load holdings from Excel, or take a snapshot of the portfolio.</p>
      </div>
    </div>

    ${storageCardHtml()}

    ${state.importResult ? `
      <div class="import-result" style="margin-bottom:18px">
        ${icon("checkCircle")}
        <span>Imported ${state.importResult.imported} holding${state.importResult.imported === 1 ? "" : "s"}${state.importResult.duplicates ? ` · ${state.importResult.duplicates} already there` : ""}${state.importResult.skipped ? ` · ${state.importResult.skipped} skipped` : ""}.</span>
        <span style="margin-left:auto"><button class="btn btn-ghost btn-sm" type="button" data-action="dismiss-import-result">Dismiss</button></span>
      </div>` : ""}

    <div class="import-grid">
      <section class="card card-pad">
        <div class="step-card">
          <div class="step-num">1</div>
          <div style="flex:1;min-width:0">
            <h4>Download the template</h4>
            <p>Fourteen tabs, one per instrument type, each with validated dropdowns for Indian banks, AMCs, insurers, exchanges and more.</p>
            <div class="actions">
              <button class="btn btn-primary btn-sm" type="button" data-action="download-template">${icon("sheet")} Download Excel template</button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:14px">
              ${state.meta.types.map((t) => `<span class="pill pill-muted" style="font-weight:600">${esc(t.label)}</span>`).join("")}
            </div>
          </div>
        </div>
      </section>

      <section class="card card-pad">
        <div class="step-card">
          <div class="step-num">2</div>
          <div style="flex:1;min-width:0">
            <h4>Fill it in</h4>
            <p>Add one row per holding. Required columns are marked with *. Amounts auto-calculate from units and price when left blank.</p>
            <div class="info-strip" style="margin-top:12px">${icon("info")}
              <span>Pick a member from the <strong>Owner</strong> dropdown to split the portfolio, or leave it blank to assign holdings to yourself. Deposit tabs name themselves from the bank or scheme and reference number.</span>
            </div>
            <div class="divider"></div>
            <h4 style="font-size:13px">Or export what you already have</h4>
            <p style="margin-bottom:10px">Get a workbook in the same format, handy for backups or offline edits.</p>
            <button class="btn btn-secondary btn-sm" type="button" data-action="export">${icon("download")} Export portfolio</button>
          </div>
        </div>
      </section>
    </div>

    <section class="card card-pad" style="margin-bottom:18px">
      <div class="card-head">
        <div>
          <div class="card-title">Upload your workbook</div>
          <div class="card-sub">We validate every row before saving anything</div>
        </div>
        <span class="pill pill-muted">.xlsx</span>
      </div>
      <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Upload Excel workbook">
        <div class="dz-icon">${icon("upload")}</div>
        <h4>Drop your filled template here</h4>
        <p>or click to browse files</p>
        <span class="file-hint">Only .xlsx workbooks created from the DeepTrack template</span>
      </div>
      <input type="file" id="import-file" accept=".xlsx,.xlsm" class="hidden">
    </section>

    <div id="import-preview">${preview ? importPreviewHtml(preview) : ""}</div>
  `;
  hydrateIcons($("#view"));
  wireDropzone();

  if (!state.storageStatus) {
    api("/storage")
      .then((data) => { state.storageStatus = data; })
      .catch(() => {})
      .finally(() => { if (state.view === "import") renderImport(); });
  }
}

function wireDropzone() {
  const zone = $("#dropzone");
  const input = $("#import-file");
  if (!zone || !input) return;
  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
  });
  input.addEventListener("change", () => {
    if (input.files?.[0]) uploadImport(input.files[0]);
  });
  ["dragenter", "dragover"].forEach((type) => zone.addEventListener(type, (event) => {
    event.preventDefault();
    zone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach((type) => zone.addEventListener(type, (event) => {
    event.preventDefault();
    zone.classList.remove("dragover");
  }));
  zone.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) uploadImport(file);
  });
}

async function uploadImport(file) {
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
    toast("Please upload an .xlsx file", "error");
    return;
  }
  const zone = $("#dropzone");
  zone?.classList.add("busy");
  if (zone) {
    zone.querySelector("h4").textContent = "Reading your workbook…";
    zone.querySelector("p").textContent = file.name;
  }
  const form = new FormData();
  form.append("file", file);
  try {
    const data = await api("/import/preview", { method: "POST", form });
    state.importPreview = data;
    state.importResult = null;
    renderImport();
    toast(`${data.valid} of ${data.rows} rows ready to import`, data.invalid ? "warn" : "ok");
  } catch (error) {
    toast(error.message, "error");
    zone?.classList.remove("busy");
    if (zone) {
      zone.querySelector("h4").textContent = "Drop your filled template here";
      zone.querySelector("p").textContent = "or click to browse files";
    }
  }
}

function importPreviewHtml(data) {
  const rows = data.preview || [];
  const issues = (row) => {
    const fixes = (row.fixes || []).map(
      (fix) => `<div class="issue err"><b>${esc(fix.column)}</b> — ${esc(fix.message)}</div>`
    );
    const errs = fixes.length
      ? fixes
      : Object.entries(row.errors || {}).map(([, v]) => `<div class="issue err">${esc(v)}</div>`);
    const warns = (row.warnings || []).map((w) => `<div class="issue warn">${esc(w)}</div>`);
    return [...errs, ...warns].join("");
  };
  return `
    <section class="card table-card">
      <div class="card-head" style="padding:20px 22px 0">
        <div>
          <div class="card-title">Review before importing</div>
          <div class="card-sub">${esc(data.filename || "Workbook")} · ${data.rows} row${data.rows === 1 ? "" : "s"} found</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="pill pill-ok">${data.valid} ready</span>
          ${data.duplicates ? `<span class="pill pill-warn">${data.duplicates} already imported</span>` : ""}
          ${data.invalid ? `<span class="pill pill-bad">${data.invalid} need fixing</span>` : ""}
          ${data.invalid ? `<button class="btn btn-secondary btn-sm" type="button" data-action="download-fix-sheet">${icon("download")} Rows to fix</button>` : ""}
          <button class="btn btn-ghost btn-sm" type="button" data-action="discard-import">Discard</button>
          <button class="btn btn-primary btn-sm" type="button" data-action="commit-import" ${data.valid ? "" : "disabled"}>
            ${icon("upload")} Import ${data.valid} row${data.valid === 1 ? "" : "s"}
          </button>
        </div>
      </div>
      ${(data.sheet_warnings || []).length ? `<div style="padding:14px 22px 0">
        <div class="info-strip warn">${icon("alert")}<span>${data.sheet_warnings.map(esc).join("<br>")}</span></div>
      </div>` : ""}
      <div class="table-wrap" style="margin-top:14px">
        <table class="table" style="min-width:820px">
          <thead><tr>
            <th>Tab / row</th><th>Holding</th><th>Type</th>
            <th class="num">Invested</th><th class="num">Current</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${rows.map((row) => {
              const hasErrors = Object.keys(row.errors || {}).length > 0;
              const hasWarnings = (row.warnings || []).length > 0;
              const status = hasErrors
                ? `<span class="pill pill-bad">Needs fixing</span>`
                : row.duplicate
                  ? `<span class="pill pill-warn">Already imported — skipped</span>`
                  : hasWarnings
                    ? `<span class="pill pill-warn">Check</span>`
                    : `<span class="pill pill-ok">Ready</span>`;
              return `<tr>
                <td><div style="font-size:12px;font-weight:600">${esc(row.sheet)}</div><div class="cell-sub">Row ${row.row}</div></td>
                <td><div style="font-weight:650;font-size:12.5px">${esc(row.name)}</div></td>
                <td style="font-size:12px;color:var(--muted)">${esc(row.type_label)}</td>
                <td class="num">${row.invested != null ? inr(row.invested) : "—"}</td>
                <td class="num">${row.current != null ? inr(row.current) : "—"}</td>
                <td>${status}<div class="issue-list">${issues(row)}</div></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div class="table-foot">
        <span>${data.preview_truncated ? `Showing the first ${rows.length} rows.` : "All rows shown."} Rows marked as already imported are skipped, so you can re-upload a corrected file safely.</span>
        <span>Owner defaults to you when left blank.</span>
      </div>
    </section>`;
}

async function downloadFixSheet() {
  const token = state.importPreview?.token;
  if (!token) return;
  try {
    const response = await fetch("/api/import/fix-workbook", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "Could not prepare the rows to fix");
    }
    downloadBlob(await response.blob(), "deeptrack-rows-to-fix.xlsx");
  } catch (error) {
    toast(error.message, "error");
  }
}

async function commitImport() {
  if (!state.importPreview?.token) return;
  const button = $('[data-action="commit-import"]');
  if (button) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> Importing…`;
  }
  try {
    const result = await api("/import/commit", {
      method: "POST",
      body: { token: state.importPreview.token },
    });
    state.importPreview = null;
    state.importResult = result;
    await refreshData();
    renderUserChrome();
    route();
    toast(`Imported ${result.imported} holding${result.imported === 1 ? "" : "s"}`, "ok");
  } catch (error) {
    toast(error.message, "error");
    if (button) {
      button.disabled = false;
      button.innerHTML = `${icon("upload")} Retry import`;
    }
  }
}

async function downloadFile(path, fallbackName) {
  try {
    const response = await fetch(path, { credentials: "same-origin" });
    if (!response.ok) throw new Error("Download failed");
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    downloadBlob(blob, match ? decodeURIComponent(match[1]) : fallbackName);
  } catch {
    toast("Could not download the file. Please try again.", "error");
  }
}

/* ============================================================
   Global events
   ============================================================ */

function bindGlobalEvents() {
  $("#theme-toggle")?.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark");
  });

  $("#logout-btn")?.addEventListener("click", async () => {
    try { await api("/logout", { method: "POST" }); } catch { /* ignore */ }
    try { if (firebaseState.auth) await firebaseState.mod.signOut(firebaseState.auth); } catch { /* ignore */ }
    state.me = null;
    state.dashboard = null;
    state.investments = [];
    state.members = [];
    state.importPreview = null;
    state.marketStatus = null;
    state.storageStatus = null;
    state.selected.clear();
    location.hash = "";
    showAuth("login");
    toast("Signed out", "ok");
  });

  $("#quick-add")?.addEventListener("click", () => openInvestmentModal());
  $("#topbar-user")?.addEventListener("click", () => { location.hash = "#/profile"; });

  $("#menu-btn")?.addEventListener("click", () => {
    const open = $("#app").classList.toggle("menu-open");
    $("#scrim").classList.toggle("hidden", !open);
  });
  $("#scrim")?.addEventListener("click", closeSidebar);

  window.addEventListener("hashchange", () => route());

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDrawer();
      closeModal();
      closeSidebar();
    }
  });

  document.addEventListener("change", (event) => {
    const el = event.target;
    if (el.dataset?.filter) {
      state.filters[el.dataset.filter] = el.value;
      if (el.dataset.filter === "sort") state.filters.dir = "desc";
      updateInvestmentsTable();
      return;
    }
    if (el.id === "select-all") {
      const ids = filteredInvestments().map((item) => item.id);
      if (el.checked) ids.forEach((id) => state.selected.add(id));
      else ids.forEach((id) => state.selected.delete(id));
      updateInvestmentsTable();
      return;
    }
    if (el.dataset?.selectId) {
      const id = Number(el.dataset.selectId);
      if (el.checked) state.selected.add(id);
      else state.selected.delete(id);
      updateInvestmentsTable();
    }
  });

  let searchTimer = null;
  document.addEventListener("input", (event) => {
    if (event.target.id === "inv-search") {
      const value = event.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.filters.q = value;
        updateInvestmentsTable();
      }, 140);
    }
  });

  document.addEventListener("click", handleClick);
}

async function handleClick(event) {
  if (event.target.closest(".select-cell, #select-all, [data-select-id]")) return;

  const nav = event.target.closest("[data-nav]");
  if (nav) {
    location.hash = `#/${nav.dataset.nav}`;
    return;
  }

  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) {
    const row = event.target.closest("[data-investment-id]");
    if (row) openInvestmentDrawer(Number(row.dataset.investmentId));
    return;
  }

  const action = actionEl.dataset.action;
  const id = actionEl.dataset.id ? Number(actionEl.dataset.id) : null;

  switch (action) {
    case "add-investment":
      openInvestmentModal();
      break;
    case "edit-investment":
      closeDrawer();
      openInvestmentModal(id);
      break;
    case "delete-investment":
      closeDrawer();
      await deleteInvestment(id);
      break;
    case "bulk-delete":
      await bulkDeleteInvestments();
      break;
    case "clear-selection":
      state.selected.clear();
      updateInvestmentsTable();
      break;
    case "sort": {
      const key = actionEl.dataset.sort;
      if (state.filters.sort === key) {
        state.filters.dir = state.filters.dir === "asc" ? "desc" : "asc";
      } else {
        state.filters.sort = key;
        state.filters.dir = key === "name" ? "asc" : "desc";
      }
      renderInvestments();
      break;
    }
    case "filter-category":
      state.filters.category = actionEl.dataset.category;
      renderInvestments();
      break;
    case "clear-filters":
      state.filters = { q: "", category: "", type: "", owner: "", sort: "updated", dir: "desc" };
      renderInvestments();
      break;
    case "export":
      await downloadFile("/api/export", "deeptrack-portfolio.xlsx");
      break;
    case "download-template":
      await downloadFile("/api/template", "deeptrack-import-template.xlsx");
      break;
    case "market-reload":
      await reloadMarketStatus(true);
      break;
    case "download-equity":
      await downloadMarketFile("equity");
      break;
    case "download-bhavcopy":
      await downloadMarketFile("bhavcopy");
      break;
    case "update-prices":
      await updateMarketPrices();
      break;
    case "load-demo": {
      const ok = await confirmDialog({
        title: "Load a sample portfolio?",
        message: "Adds three demo members and 30 realistic Indian holdings so you can explore the dashboard. Your own account stays untouched.",
        confirmLabel: "Load sample data",
        danger: false,
      });
      if (!ok) break;
      try {
        const result = await api("/demo", { method: "POST" });
        toast(`Sample portfolio loaded · ${result.investments} holdings`, "ok");
        await refreshAndRender();
      } catch (error) {
        toast(error.message, "error");
      }
      break;
    }
    case "add-member":
      openMemberModal();
      break;
    case "edit-member":
      closeDrawer();
      openMemberModal(id);
      break;
    case "member-password": {
      const member = state.members.find((m) => m.id === id) || state.me;
      openPasswordModal(member);
      break;
    }
    case "delete-member":
      await deleteMember(id);
      break;
    case "add-demat":
      openDematModal();
      break;
    case "edit-demat":
      openDematModal(id);
      break;
    case "delete-demat":
      await deleteDematAccount(id);
      break;
    case "commit-import":
      await commitImport();
      break;
    case "download-fix-sheet":
      await downloadFixSheet();
      break;
    case "discard-import":
      state.importPreview = null;
      renderImport();
      break;
    case "dismiss-import-result":
      state.importResult = null;
      renderImport();
      break;
    default:
      break;
  }
}

document.addEventListener("DOMContentLoaded", boot);
