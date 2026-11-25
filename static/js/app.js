import { icon } from "./icons.js?v=20261124c";

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
const TXN_TYPES = new Set(["stocks", "etf", "mutual_funds"]);

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

function fmtDateTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return esc(iso);
  return date.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
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
function autoLogoUrl(name) {
  const label = String(name || "").trim();
  if (!label || label.toLowerCase() === "other") return "";
  return `/api/logo?name=${encodeURIComponent(label)}`;
}
function markBadge(label, mark, options = {}) {
  const { bg, fg, cls = "", extra = "", fallback = "#64748b", auto } = options;
  const background = safeColor(bg, MARK_COLORS[hashOf(label) % MARK_COLORS.length] || fallback);
  const src = auto === false ? "" : (typeof auto === "string" ? auto : autoLogoUrl(label));
  const style = `background:${background};color:${fg || "#fff"}`;
  if (!src) {
    return `<span class="bmark ${cls}" style="${style}" title="${esc(label)}" aria-label="${esc(label)}">${esc(mark)}</span>`;
  }
  return `<span class="bmark ${cls} ${extra}" style="${style}" title="${esc(label)}" aria-label="${esc(label)}" data-logo-name="${esc(label)}"><span class="bmark-initials">${esc(mark)}</span><img src="${esc(src)}" alt="" decoding="async" data-auto-logo></span>`;
}
function pickLogoFile(name) {
  if (!name) return;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".jpg,.jpeg,.png,.webp,.gif,.svg,.ico,.pdf,image/*,application/pdf";
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("name", name);
    form.append("file", file);
    try {
      const response = await fetch("/api/logo", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save the logo.");
      const url = `${data.url || autoLogoUrl(name)}&v=${Date.now()}`;
      const key = brandSlug(name);
      if (state.meta && key) {
        state.meta.logos = { ...(state.meta.logos || {}), [key]: url };
        state.meta.custom_logos = { ...(state.meta.custom_logos || {}), [key]: url };
      }
      applyLogo(name, url);
      toast(`Logo saved for ${name}`, "ok");
    } catch (error) {
      toast(error.message || "Could not save the logo.", "error");
    }
  });
  input.click();
}
function applyLogo(name, url) {
  document.querySelectorAll(".bmark[data-logo-name]").forEach((badge) => {
    if (!sameLogoName(badge.dataset.logoName, name)) return;
    let img = badge.querySelector("img[data-auto-logo]");
    if (!img) {
      if (!badge.querySelector(".bmark-initials")) {
        const span = document.createElement("span");
        span.className = "bmark-initials";
        span.textContent = badge.textContent;
        badge.textContent = "";
        badge.appendChild(span);
      }
      img = document.createElement("img");
      img.setAttribute("data-auto-logo", "");
      img.alt = "";
      img.decoding = "async";
      badge.appendChild(img);
    }
    badge.classList.remove("no-logo");
    badge.title = `${name} — click to change logo`;
    img.src = url;
  });
}
const BROKER_BRANDS = {
  "Zerodha": { bg: "#387ed1", mark: "Z" },
  "Groww": { bg: "#00b386", mark: "G" },
  "Upstox": { bg: "#5a2a8f", mark: "U" },
  "ICICI Direct": { bg: "#f26e21", mark: "I" },
  "HDFC Securities": { bg: "#004c8f", mark: "H" },
  "Kotak Securities": { bg: "#ed1c24", mark: "K" },
  "Angel One": { bg: "#f58220", mark: "A" },
  "Motilal Oswal": { bg: "#f2b600", mark: "MO", fg: "#1f2937" },
  "Sharekhan": { bg: "#f2a900", mark: "S", fg: "#1f2937" },
  "5paisa": { bg: "#ff6f00", mark: "5" },
  "Axis Direct": { bg: "#97144d", mark: "A" },
  "SBI Securities": { bg: "#2d5ba9", mark: "SBI" },
  "Dhan": { bg: "#00b899", mark: "D" },
  "INDmoney": { bg: "#1b1f3b", mark: "IN" },
  "Other": { bg: "#64748b", mark: "O" },
};
function brokerBadge(name, cls = "") {
  const label = String(name || "").trim();
  if (!label) return "";
  const brand = BROKER_BRANDS[label] || {};
  return markBadge(label, brand.mark || initials(label), {
    bg: brand.bg, fg: brand.fg, cls, auto: label === "Other" ? false : undefined,
  });
}
const TYPE_BRANDS = {
  stocks: { bg: "#6366f1", mark: "EQ" },
  mutual_funds: { bg: "#7c3aed", mark: "MF" },
  etf: { bg: "#4f46e5", mark: "ET" },
  fd: { bg: "#0ea5e9", mark: "FD" },
  rd: { bg: "#0284c7", mark: "RD" },
  bonds: { bg: "#0369a1", mark: "BD" },
  ppf: { bg: "#059669", mark: "PF" },
  epf: { bg: "#047857", mark: "EP" },
  nps: { bg: "#0d9488", mark: "NP" },
  small_savings: { bg: "#0891b2", mark: "PO" },
  real_estate: { bg: "#f59e0b", mark: "RE" },
  jewellery: { bg: "#d97706", mark: "GL" },
  crypto: { bg: "#f97316", mark: "CR" },
  insurance: { bg: "#e11d48", mark: "IN" },
};
function typeBadge(item, cls = "") {
  const key = typeof item === "string" ? item : item?.type;
  if (!key) return "";
  const meta = (state.meta?.types || []).find((t) => t.key === key);
  const brand = TYPE_BRANDS[key] || {};
  const label = meta?.label || key;
  return `<span class="bmark tmark ${cls}" style="background:${safeColor(brand.bg)};color:${brand.fg || "#fff"}" title="${esc(label)}" aria-label="${esc(label)}">${esc(brand.mark || initials(label))}</span>`;
}
const ISSUER_BRANDS = {
  "HDFC Bank": { bg: "#004c8f", mark: "H" },
  "ICICI Bank": { bg: "#f26e21", mark: "I" },
  "State Bank of India": { bg: "#2d5ba9", mark: "SBI" },
  "Axis Bank": { bg: "#97144d", mark: "A" },
  "Kotak Mahindra Bank": { bg: "#ed1c24", mark: "K" },
  "Bajaj Finance": { bg: "#0b5cad", mark: "B" },
  "Reliance Industries": { bg: "#0b3d91", mark: "R" },
  "Titan Company": { bg: "#5b2a86", mark: "T" },
  "Bharti Airtel": { bg: "#e40000", mark: "A" },
  "Infosys": { bg: "#007cc3", mark: "IN" },
  "Tata Consultancy Services": { bg: "#1d3d78", mark: "TCS" },
  "ITC": { bg: "#1e4b8f", mark: "ITC" },
  "Hindustan Unilever": { bg: "#1f5fa9", mark: "HU" },
  "Larsen & Toubro": { bg: "#f5a623", mark: "LT", fg: "#1f2937" },
  "Asian Paints": { bg: "#e2231a", mark: "AP" },
  "Maruti Suzuki": { bg: "#e30613", mark: "M" },
  "Wipro": { bg: "#341c6c", mark: "W" },
  "HCL Technologies": { bg: "#0f4c81", mark: "HCL" },
  "Sun Pharmaceutical Industries": { bg: "#f58220", mark: "S" },
  "SBI Mutual Fund": { bg: "#2d5ba9", mark: "SBI" },
  "HDFC Mutual Fund": { bg: "#004c8f", mark: "H" },
  "ICICI Prudential MF": { bg: "#f26e21", mark: "I" },
  "Axis Mutual Fund": { bg: "#97144d", mark: "A" },
  "Kotak Mahindra MF": { bg: "#ed1c24", mark: "K" },
  "UTI Mutual Fund": { bg: "#00539f", mark: "UTI" },
  "Nippon India MF": { bg: "#c8102e", mark: "N" },
  "Mirae Asset MF": { bg: "#ffb100", mark: "M", fg: "#1f2937" },
  "Parag Parikh MF": { bg: "#0f766e", mark: "PP" },
  "LIC of India": { bg: "#00539f", mark: "LIC" },
  "HDFC Life": { bg: "#004c8f", mark: "H" },
  "SBI Life": { bg: "#2d5ba9", mark: "SBI" },
  "ICICI Prudential Life": { bg: "#f26e21", mark: "I" },
  "Star Health": { bg: "#e11d48", mark: "SH" },
  "Niva Bupa": { bg: "#00a3e0", mark: "NB" },
  "India Post": { bg: "#b91c1c", mark: "IP" },
  "Bajaj Allianz Life": { bg: "#0b5cad", mark: "B" },
  "Bitcoin (BTC)": { bg: "#f7931a", mark: "BTC" },
  "Ethereum (ETH)": { bg: "#627eea", mark: "ETH" },
  "Tether (USDT)": { bg: "#26a17b", mark: "U" },
  "Solana (SOL)": { bg: "#14f195", mark: "SOL", fg: "#0b1f16" },
};
const MARK_COLORS = ["#6366f1", "#0ea5e9", "#059669", "#d97706", "#e11d48", "#7c3aed",
  "#0284c7", "#f97316", "#0d9488", "#4f46e5", "#b45309", "#be123c"];
function issuerChoice(value, fallback) {
  const text = String(value || "").trim();
  const usable = text && text.toLowerCase() !== "other";
  return usable ? text : (fallback || "");
}
function issuerName(item) {
  const d = item?.details || {};
  switch (item?.type) {
    case "mutual_funds": return issuerChoice(d.amc, item.name);
    case "fd":
    case "rd": return issuerChoice(d.bank, issuerChoice(d.company_name) || item.name);
    case "bonds": return issuerChoice(d.issuer, item.name);
    case "ppf":
    case "small_savings": return issuerChoice(d.institution, item.name);
    case "epf": return issuerChoice(d.employer, item.name);
    case "nps": return issuerChoice(d.fund_manager, item.name);
    case "insurance": return issuerChoice(d.insurer, item.name);
    case "crypto": return issuerChoice(d.coin, item.name);
    case "jewellery": return issuerChoice(d.jeweller, "");
    case "stocks":
    case "etf": return item.name || "";
    default: return "";
  }
}
function issuerMark(name) {
  const words = String(name || "")
    .replace(/\b(Limited|Ltd|Private|Pvt|Mutual Fund|Company|Industries|Corporation|Services|India|Bank|and)\b/gi, " ")
    .split(/\s+/).filter(Boolean);
  if (!words.length) return initials(name);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
const LOGO_ALIASES = {
  "axisamc-goldaxis": "axis-mf",
  "motilalamc-modefence": "motilal-oswal-mf",
  "nip-ind-etf-gold-bees": "nippon-india-mf",
  "reserve-bank-of-india": "rbi",
  "sivereign-gold": "rbi",
  "sovereign-gold-bond": "rbi",
  "state-bank-of-india": "sbi",
  "icici-bank-ppf": "icici-bank",
  "hdfc-life-insurance": "hdfc-life",
  "btc": "bitcoin",
  "eth": "ethereum",
  "usdt": "tether",
  "sol": "solana",
  "hindustan-unilever": "hul",
  "kotak-mahindra-bank": "kotak-bank",
  "kotak-mahindra": "kotak-bank",
  "larsen-toubro": "lnt",
  "larsen-and-toubro": "lnt",
  "kaveri-seed": "kaveri-seeds",
  "kwality-wall-s": "kwality-walls",
  "kwality-wall-s-india-l": "kwality-walls",
  "north-east-small-finance-bank": "north-east-sfb",
  "utkarsh": "utkarshbnk",
  "utkarsh-small-finance-bank": "utkarshbnk",
  "suryoday": "suryoday-sfb",
  "suryodhay": "suryoday-sfb",
  "suryoday-small-finance-bank": "suryoday-sfb",
  "equitas": "equitas-sfb",
  "equitas-small-finance-bank": "equitas-sfb",
  "slice-sfb": "slice",
  "slice-small-finance-bank": "slice",
  "tamil-nadu-power-fin": "tamil-nadu-power-finance",
  "tamilnadu-power-finance": "tamil-nadu-power-finance",
  "tamil-nadu-power-finance-and-infrastructure": "tamil-nadu-power-finance",
  "tamil-nadu-power-finance-and-infrastructure-corporation": "tamil-nadu-power-finance",
  "tamil-nadu-power-finance-and-infrastructure-development-corporation": "tamil-nadu-power-finance",
  "tata-consultancy-serv": "tcs",
  "tata-consultancy-serv-lt": "tcs",
  "tata-consultancy-services": "tcs",
  "brainbees": "firstcry",
  "brainbees-solutions": "firstcry",
  "computer-age-mngt-ser": "cams",
  "computer-age-management-services": "cams",
  "dr-reddy-s-laboratories": "dr-reddys",
  "dr-reddys-laboratories": "dr-reddys",
  "jio-fin": "jio-financial",
  "jio-fin-services": "jio-financial",
  "tanla-platforms": "tanla",
  "hindustan-aeronautics": "hal",
  "h-g-infra": "hg-infra",
  "h-g-infra-engineering": "hg-infra",
  "narayana-hrudayalaya": "narayana-health",
  "andra-pradesh-cda": "apcrda",
  "andhra-pradesh-cda": "apcrda",
  "ap-cda": "apcrda",
  "crda": "apcrda",
  "andhra-pradesh-crda": "apcrda",
  "ap-crda": "apcrda",
  "andhra-pradesh-capital-region-development-authority": "apcrda",
  "amaravati": "apcrda",
  "up-power": "uppcl",
  "up-power-corporation": "uppcl",
  "up-power-corporation-ltd": "uppcl",
  "uttar-pradesh-power-corporation": "uppcl",
  "uttar-pradesh-power-corporation-ltd": "uppcl",
  "up-power-corp": "uppcl",
};
const LEGAL_TAIL = /-(limited|ltd|co|company|corp|corporation|inc|plc|pvt|private|india|enterprises|holdings)$/;
function logoFor(name) {
  return lookupLogo(state.meta?.logos, name);
}
function lookupLogo(map, name) {
  const logos = map || {};
  const keys = Object.keys(logos);
  if (!keys.length) return "";
  let slug = brandSlug(name);
  if (!slug) return "";
  const seen = new Set();
  for (let i = 0; i < 4; i += 1) {
    if (!slug || seen.has(slug)) break;
    seen.add(slug);
    if (logos[slug]) return logos[slug];
    const alias = LOGO_ALIASES[slug];
    if (alias && logos[alias]) return logos[alias];
    slug = slug.replace(LEGAL_TAIL, "");
  }
  const padded = `-${slug}-`;
  let best = "";
  for (const key of keys) {
    if (key.length > best.length && padded.includes(`-${key}-`) && key.length >= 3) best = key;
  }
  return best ? logos[best] : "";
}
function customLogoFor(name) {
  return lookupLogo(state.meta?.custom_logos, name);
}
function sameLogoName(a, b) {
  const norm = (value) => brandSlug(value).replace(LEGAL_TAIL, "");
  if (a === b) return true;
  const left = norm(a);
  return Boolean(left) && left === norm(b);
}
function issuerBadgeFromName(name, cls = "") {
  const label = String(name || "").trim();
  if (!label) return "";
  const logo = logoFor(label) || autoLogoUrl(label);
  if (logo) return logoMark(label, logo, cls);
  const known = ISSUER_BRANDS[label] || {};
  return markBadge(label, known.mark || issuerMark(label), {
    bg: known.bg, fg: known.fg, cls, extra: "tmark", auto: false,
  });
}
function brandSlug(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function stockSymbol(item) {
  if (!item || (item.type !== "stocks" && item.type !== "etf")) return "";
  return String(item.symbol || item.details?.symbol || "").trim();
}
function symbolLogo(item) {
  const symbol = stockSymbol(item);
  return symbol ? state.meta?.logos?.[brandSlug(symbol)] || "" : "";
}
function logoMark(label, logo, cls) {
  return markBadge(label, issuerMark(label), { cls, auto: logo });
}
function issuerBadge(item, cls = "") {
  const name = item?.issuer || issuerName(item);
  const uploaded = name ? customLogoFor(name) : "";
  if (uploaded) return logoMark(name, uploaded, cls);
  const symbol = symbolLogo(item);
  if (symbol) return logoMark(name || item?.symbol || "", symbol, `${cls} bsym`);
  return name ? issuerBadgeFromName(name, cls) : typeBadge(item, cls);
}
function holdingBadge(item) {
  return issuerBadge(item);
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
  income: null,
  incomeCal: { zoom: "year", month: null, day: null },
  corporate: null,
  activity: null,
  activityLoading: false,
  view: "dashboard",
  filters: { q: "", category: [], type: [], owner: [], broker: [], sort: "updated", dir: "desc" },
  layout: "flat",
  importPreview: null,
  importResult: null,
  importUpdateExisting: false,
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

function toast(message, kind = "info", action = null) {
  const root = $("#toast-root");
  const node = document.createElement("div");
  node.className = `toast ${kind}${action ? " has-action" : ""}`;
  const icons = { ok: "checkCircle", error: "xCircle", warn: "alert", info: "info" };
  node.innerHTML = `${icon(icons[kind] || "info")}<span>${esc(message)}</span>${
    action ? `<button class="toast-action" type="button">${esc(action.label)}</button>` : ""
  }`;
  root.appendChild(node);
  if (action) {
    node.querySelector(".toast-action")?.addEventListener("click", () => {
      action.run();
      node.classList.add("leaving");
      setTimeout(() => node.remove(), 220);
    });
  }
  setTimeout(() => {
    node.classList.add("leaving");
    setTimeout(() => node.remove(), 220);
  }, kind === "error" ? 6000 : action ? 9000 : 3800);
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
  clearLockScreen();
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
    await startApp({ skipLock: true });
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
      await startApp({ skipLock: true });
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
      await startApp({ skipLock: true });
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

/* ============================================================
   App lock — 4-digit PIN + biometrics, per device
   ============================================================ */

const PIN_ITERATIONS = 150000;
const LOCK_STORAGE = "deeptrack-applock:";
const LOCK_TIMEOUTS = [
  { key: "immediate", label: "Immediately" },
  { key: "60000", label: "After 1 minute" },
  { key: "300000", label: "After 5 minutes" },
  { key: "never", label: "Only when reopened" },
];
const lockBio = { supported: null };
let lockView = null;
let lockHiddenAt = 0;

const secureCryptoAvailable = () => Boolean(window.isSecureContext && window.crypto?.subtle);

function lockStorageKey() {
  return state.me?.id ? `${LOCK_STORAGE}${state.me.id}` : "";
}

function readLock() {
  const key = lockStorageKey();
  if (!key) return null;
  try {
    const data = JSON.parse(localStorage.getItem(key) || "null");
    return data && data.pin?.hash && data.pin?.salt ? data : null;
  } catch {
    return null;
  }
}

function writeLock(data) {
  const key = lockStorageKey();
  if (!key) return;
  if (data) localStorage.setItem(key, JSON.stringify(data));
  else localStorage.removeItem(key);
}

function bytes64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function from64(text) {
  const base = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = base + "=".repeat((4 - (base.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
}

async function pinHash(pin, salt, iterations) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: from64(salt), iterations: Number(iterations) || PIN_ITERATIONS, hash: "SHA-256" },
    material,
    256,
  );
  return bytes64(bits);
}

async function verifyPin(store, pin) {
  if (!store || !/^\d{4}$/.test(String(pin || ""))) return false;
  try {
    return (await pinHash(pin, store.pin.salt, store.pin.iterations)) === store.pin.hash;
  } catch {
    return false;
  }
}

async function probeBiometric() {
  if (lockBio.supported !== null) return lockBio.supported;
  try {
    lockBio.supported = Boolean(
      window.isSecureContext &&
      window.PublicKeyCredential &&
      (await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()),
    );
  } catch {
    lockBio.supported = false;
  }
  return lockBio.supported;
}

function wirePinInputs(root) {
  $$(".pin-field", root).forEach((input) => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D+/g, "").slice(0, 4);
    });
  });
}

async function addBiometricUnlock() {
  const store = readLock();
  if (!store) {
    toast("Set a 4-digit PIN first — biometrics unlock the same device", "warn");
    return;
  }
  if (!(await probeBiometric())) {
    toast("This browser or address can't use biometrics. The PIN still works.", "warn");
    return;
  }
  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: "DeepTrack", id: location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: state.me?.email || "member",
          displayName: state.me?.name || "DeepTrack member",
        },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60000,
        attestation: "none",
      },
    });
    if (!credential) return;
    writeLock({ ...store, biometric: { id: bytes64(credential.rawId), added: new Date().toISOString() } });
    toast("Fingerprint / face unlock added for this device", "ok");
    renderLockCard();
  } catch (error) {
    if (error?.name === "NotAllowedError") toast("Biometric setup was cancelled", "warn");
    else toast("Biometrics could not be set up here. The PIN still works.", "error");
  }
}

async function removeBiometricUnlock() {
  const store = readLock();
  if (!store?.biometric) return;
  const ok = await confirmDialog({
    title: "Remove biometric unlock?",
    message: "DeepTrack will unlock with the 4-digit PIN only on this device. You can add biometrics again any time.",
    confirmLabel: "Remove",
  });
  if (!ok) return;
  writeLock({ ...store, biometric: null });
  toast("Biometric unlock removed", "ok");
  renderLockCard();
}

function lockScreenHtml(store) {
  const me = state.me || {};
  const first = String(me.name || "").trim().split(/\s+/)[0] || "Welcome back";
  return `
    <section class="lock-screen" role="dialog" aria-modal="true" aria-label="DeepTrack is locked">
      <div class="lock-card">
        <div class="lock-brand"><img src="/static/favicon.svg" alt="" width="30" height="30"><span>DeepTrack</span></div>
        ${avatar(me.name || "DeepTrack", "lock-avatar")}
        <h2 class="lock-hi">${esc(first)}</h2>
        <p class="lock-sub">Enter your 4-digit PIN to unlock</p>
        <div class="lock-dots" data-lock-dots aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="lock-msg" data-lock-msg role="alert"></div>
        <div class="lock-pad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button class="lock-key" type="button" data-lock-key="${d}">${d}</button>`).join("")}
          ${store.biometric
            ? `<button class="lock-key lock-bio" type="button" data-lock-bio aria-label="Unlock with fingerprint or face">${icon("fingerprint")}</button>`
            : `<span class="lock-key lock-key-ghost" aria-hidden="true"></span>`}
          <button class="lock-key" type="button" data-lock-key="0">0</button>
          <button class="lock-key lock-key-soft" type="button" data-lock-key="back" aria-label="Delete last digit">${icon("backspace")}</button>
        </div>
        <button class="lock-alt" type="button" data-lock-signout>Use password instead</button>
        <p class="lock-foot">Locked on this device${store.biometric ? " · PIN or biometrics" : ""}</p>
      </div>
    </section>`;
}

function bindLockScreen(section) {
  section?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const key = target.closest("[data-lock-key]");
    if (key) {
      event.preventDefault();
      lockKeyPress(key.dataset.lockKey);
      return;
    }
    if (target.closest("[data-lock-bio]")) {
      event.preventDefault();
      biometricUnlock();
      return;
    }
    if (target.closest("[data-lock-signout]")) {
      event.preventDefault();
      leaveLockScreen();
    }
  });
}

function showLockScreen(store, { overlay = false } = {}) {
  clearLockScreen();
  document.body.classList.add("is-locked");
  if (!overlay) $("#boot")?.classList.add("hidden");
  const root = $("#lock-root");
  if (!root) return Promise.resolve(true);
  root.innerHTML = lockScreenHtml(store);
  return new Promise((resolve) => {
    lockView = { store, overlay, buffer: "", failures: 0, cooldownUntil: 0, busy: false, resolve };
    bindLockScreen(root.firstElementChild);
    paintLockDots();
  });
}

function ensureUnlocked() {
  const store = readLock();
  if (!store) return Promise.resolve(true);
  if (lockView) return Promise.resolve(false);
  return showLockScreen(store);
}

function clearLockScreen() {
  lockView = null;
  const root = $("#lock-root");
  if (root) root.innerHTML = "";
  document.body.classList.remove("is-locked");
}

function setLockMsg(text) {
  const box = $("[data-lock-msg]");
  if (box) box.textContent = text || "";
}

function paintLockDots() {
  const filled = lockView ? lockView.buffer.length : 0;
  $$("[data-lock-dots] i").forEach((dot, index) => dot.classList.toggle("full", index < filled));
}

function lockKeyPress(key) {
  if (!lockView || lockView.busy) return;
  if (key === "back") {
    lockView.buffer = lockView.buffer.slice(0, -1);
    setLockMsg("");
    paintLockDots();
    return;
  }
  if (!/^\d$/.test(String(key)) || lockView.buffer.length >= 4) return;
  lockView.buffer += key;
  setLockMsg("");
  paintLockDots();
  if (lockView.buffer.length === 4) setTimeout(checkLockPin, 130);
}

async function checkLockPin() {
  if (!lockView || lockView.busy) return;
  if (lockView.buffer.length !== 4) return;
  if (Date.now() < lockView.cooldownUntil) {
    const secs = Math.ceil((lockView.cooldownUntil - Date.now()) / 1000);
    setLockMsg(`Try again in ${secs} second${secs === 1 ? "" : "s"}.`);
    lockView.buffer = "";
    paintLockDots();
    return;
  }
  lockView.busy = true;
  const ok = await verifyPin(lockView.store, lockView.buffer);
  if (!lockView) return;
  lockView.busy = false;
  if (ok) {
    completeUnlock();
    return;
  }
  lockView.failures += 1;
  lockView.buffer = "";
  paintLockDots();
  const dots = $("[data-lock-dots]");
  if (dots) {
    dots.classList.remove("shake");
    void dots.offsetWidth;
    dots.classList.add("shake");
  }
  navigator.vibrate?.(40);
  if (lockView.failures >= 5) {
    lockView.failures = 0;
    lockView.cooldownUntil = Date.now() + 30000;
    setLockMsg("Too many wrong PINs. Wait 30 seconds, or use your password below.");
  } else {
    const left = 5 - lockView.failures;
    setLockMsg(`Incorrect PIN — ${left} attempt${left === 1 ? "" : "s"} left.`);
  }
}

async function biometricUnlock() {
  if (!lockView || lockView.busy || !lockView.store.biometric) return;
  lockView.busy = true;
  setLockMsg("");
  try {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        allowCredentials: [{ type: "public-key", id: from64(lockView.store.biometric.id) }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    if (assertion && lockView) completeUnlock();
  } catch (error) {
    if (!lockView) return;
    if (error?.name === "NotAllowedError") setLockMsg("Biometric unlock was cancelled — use your PIN.");
    else setLockMsg("Biometrics are unavailable here — use your PIN.");
  } finally {
    if (lockView) lockView.busy = false;
  }
}

function completeUnlock() {
  if (!lockView) return;
  const resolve = lockView.resolve;
  clearLockScreen();
  resolve?.(true);
}

async function leaveLockScreen() {
  const resolve = lockView?.resolve;
  clearLockScreen();
  await signOut({ announce: false });
  resolve?.(false);
}

function lockNow() {
  if (lockView) return;
  const store = readLock();
  if (!store) {
    toast("Set a 4-digit app PIN first", "warn");
    return;
  }
  closeDrawer();
  closeModal();
  closeSidebar();
  showLockScreen(store, { overlay: true });
}

function handleVisibilityChange() {
  if (document.visibilityState === "hidden") {
    if (state.me && !lockView) lockHiddenAt = Date.now();
    return;
  }
  const since = lockHiddenAt;
  lockHiddenAt = 0;
  if (!since || lockView || !state.me) return;
  const store = readLock();
  if (!store || store.autoLock === "never") return;
  const wait = store.autoLock === "immediate" ? 0 : Number(store.autoLock) || 0;
  if (Date.now() - since >= wait) lockNow();
}

function lockCardHtml() {
  const store = readLock();
  const on = Boolean(store);
  const bio = Boolean(store?.biometric);
  const secure = secureCryptoAvailable();
  const supported = lockBio.supported;
  const timeout = store?.autoLock || "60000";
  return `
    <section class="card card-pad span-12" data-lock-card>
      <div class="card-head">
        <div>
          <div class="card-title">App lock</div>
          <div class="card-sub">A 4-digit PIN${bio ? " and biometrics" : ""} on this device — the portfolio stays behind it</div>
        </div>
        <span class="pill ${on ? "pill-ok" : ""}">${on ? "On" : "Off"}</span>
      </div>
      <div class="divider" style="margin-top:0"></div>
      <div class="lock-grid">
        <div class="lock-item">
          <div class="lock-item-icon">${icon("lock")}</div>
          <div class="lock-item-main">
            <div class="lock-item-title">4-digit PIN</div>
            <div class="lock-item-sub">${on ? "Asked every time DeepTrack opens on this device" : "Add a PIN so DeepTrack asks for it when it opens"}</div>
          </div>
          <div class="lock-item-act">${on
            ? `<button class="btn btn-secondary btn-sm" type="button" data-action="lock-change-pin">Change</button>`
            : `<button class="btn btn-primary btn-sm" type="button" data-action="lock-set-pin" ${secure ? "" : "disabled"}>Set PIN</button>`}</div>
        </div>
        <div class="lock-item">
          <div class="lock-item-icon">${icon("fingerprint")}</div>
          <div class="lock-item-main">
            <div class="lock-item-title">Face ID / fingerprint</div>
            <div class="lock-item-sub">${bio
              ? "Unlock with this device's biometrics"
              : supported === false
                ? "Not available in this browser or on this address"
                : "Use this device's fingerprint or face instead of the PIN"}</div>
          </div>
          <div class="lock-item-act">${bio
            ? `<button class="btn btn-secondary btn-sm" type="button" data-action="lock-bio-remove">Remove</button>`
            : `<button class="btn btn-secondary btn-sm" type="button" data-action="lock-bio-add" ${on && supported ? "" : "disabled"}>Add</button>`}</div>
        </div>
        <div class="lock-item">
          <div class="lock-item-icon">${icon("clock")}</div>
          <div class="lock-item-main">
            <div class="lock-item-title">Ask again</div>
            <div class="lock-item-sub">When you come back to the app after leaving it</div>
          </div>
          <div class="lock-item-act">
            <select data-lock-timeout aria-label="When to ask for the PIN" ${on ? "" : "disabled"}>
              ${LOCK_TIMEOUTS.map((t) => `<option value="${t.key}" ${timeout === t.key ? "selected" : ""}>${t.label}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
      <div class="lock-foot-row">
        ${on
          ? `<button class="btn btn-secondary btn-sm" type="button" data-action="lock-now">${icon("lock")} Lock now</button>
             <button class="btn btn-ghost btn-sm" type="button" data-action="lock-off">Turn off app lock</button>`
          : `<span class="muted lock-note">${secure
              ? "Only a one-way hash of the PIN is stored, and only on this device. Forgot it? Use “Use password instead” on the lock screen."
              : "App lock needs the secure https address (or localhost). Open DeepTrack's hosted link to use it."}</span>`}
      </div>
    </section>`;
}

function renderLockCard() {
  if (state.view !== "profile") return;
  const card = $("[data-lock-card]");
  if (!card) return;
  card.outerHTML = lockCardHtml();
  hydrateIcons($("[data-lock-card]"));
}

function openPinModal(mode = "set") {
  const store = readLock();
  const changing = mode === "change" && Boolean(store);
  if (!secureCryptoAvailable()) {
    toast("App lock needs the secure https address (or localhost).", "warn");
    return;
  }
  openModal({
    title: changing ? "Change app PIN" : "Set app PIN",
    subtitle: "Four digits. Only a one-way hash is stored on this device — the PIN never reaches the server.",
    size: "modal-sm",
    body: `
      <form id="pin-form" novalidate>
        ${changing ? `<label class="field"><span>Current PIN</span>
          <input class="pin-field" type="password" inputmode="numeric" autocomplete="off" maxlength="4" name="current" placeholder="••••">
        </label>` : ""}
        <label class="field"><span>${changing ? "New PIN" : "PIN"}</span>
          <input class="pin-field" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4" name="pin" placeholder="••••">
        </label>
        <label class="field"><span>Confirm PIN</span>
          <input class="pin-field" type="password" inputmode="numeric" autocomplete="new-password" maxlength="4" name="confirm" placeholder="••••">
        </label>
        <div class="form-error hidden" data-pin-error role="alert"></div>
      </form>`,
    footer: `
      <button class="btn btn-secondary" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="button" data-save>${icon("lock")} Save PIN</button>`,
    onMount(backdrop, close) {
      const form = backdrop.querySelector("#pin-form");
      const button = backdrop.querySelector("[data-save]");
      wirePinInputs(form);
      const fail = (message) => {
        const box = backdrop.querySelector("[data-pin-error]");
        box.textContent = message;
        box.classList.remove("hidden");
      };
      button.addEventListener("click", async () => {
        if (changing && !(await verifyPin(store, form.current.value))) {
          fail("The current PIN is incorrect.");
          return;
        }
        if (!/^\d{4}$/.test(form.pin.value)) {
          fail("Enter exactly 4 digits.");
          return;
        }
        if (form.pin.value !== form.confirm.value) {
          fail("The two PINs do not match.");
          return;
        }
        button.disabled = true;
        button.innerHTML = `<span class="spinner"></span> Saving…`;
        try {
          const salt = bytes64(crypto.getRandomValues(new Uint8Array(16)));
          const hash = await pinHash(form.pin.value, salt, PIN_ITERATIONS);
          writeLock({
            ...(store || {}),
            version: 1,
            pin: { salt, hash, iterations: PIN_ITERATIONS },
            autoLock: store?.autoLock || "60000",
            updatedAt: new Date().toISOString(),
          });
          close();
          toast("App PIN saved — DeepTrack will ask for it next time it opens", "ok");
          renderLockCard();
        } catch {
          button.disabled = false;
          button.innerHTML = `${icon("lock")} Save PIN`;
          fail("The PIN could not be saved on this device.");
        }
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        button.click();
      });
    },
  });
}

function askPinDialog({ title, message, confirmLabel = "Continue" }) {
  return new Promise((resolve) => {
    state.modalResolver = () => resolve(null);
    openModal({
      title,
      subtitle: message,
      size: "modal-sm",
      body: `
        <label class="field"><span>4-digit PIN</span>
          <input class="pin-field" type="password" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="••••">
        </label>
        <div class="form-error hidden" data-pin-error role="alert"></div>`,
      footer: `
        <button class="btn btn-secondary" type="button" data-close>Cancel</button>
        <button class="btn btn-primary" type="button" data-ok>${esc(confirmLabel)}</button>`,
      onMount(backdrop) {
        const input = backdrop.querySelector(".pin-field");
        const box = backdrop.querySelector("[data-pin-error]");
        wirePinInputs(backdrop);
        const submit = () => {
          if (!/^\d{4}$/.test(input.value)) {
            box.textContent = "Enter the 4-digit PIN.";
            box.classList.remove("hidden");
            return;
          }
          const value = input.value;
          state.modalResolver = null;
          closeModal();
          resolve(value);
        };
        backdrop.querySelector("[data-ok]").addEventListener("click", submit);
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") submit();
        });
      },
    });
  });
}

async function disableAppLock() {
  const store = readLock();
  if (!store) return;
  const pin = await askPinDialog({
    title: "Turn off app lock?",
    message: "DeepTrack will open without asking for a PIN or biometrics on this device.",
    confirmLabel: "Turn off",
  });
  if (!pin) return;
  if (!(await verifyPin(store, pin))) {
    toast("That PIN is incorrect", "error");
    return;
  }
  writeLock(null);
  toast("App lock turned off on this device", "ok");
  renderLockCard();
}

async function signOut({ announce = true } = {}) {
  try { await api("/logout", { method: "POST" }); } catch { /* ignore */ }
  try { if (firebaseState.auth) await firebaseState.mod.signOut(firebaseState.auth); } catch { /* ignore */ }
  state.me = null;
  state.dashboard = null;
  state.income = null;
  state.corporate = null;
  state.investments = [];
  state.members = [];
  state.importPreview = null;
  state.marketStatus = null;
  state.storageStatus = null;
  state.selected.clear();
  location.hash = "";
  showAuth("login");
  if (announce) toast("Signed out", "ok");
}

async function startApp({ skipLock = false } = {}) {
  if (!skipLock && !(await ensureUnlocked())) return;
  $("#auth").classList.add("hidden");
  $("#app").classList.remove("hidden");
  await refreshData();
  renderUserChrome();
  if (!location.hash) location.hash = "#/dashboard";
  route();
}

async function refreshData() {
  const incomePath = state.income?.year ? `/incomes?year=${encodeURIComponent(state.income.year)}` : "/incomes";
  const [meta, members, dashboard, investments, income] = await Promise.all([
    api("/meta"),
    api("/members"),
    api("/dashboard"),
    api("/investments"),
    api(incomePath),
  ]);
  state.meta = meta;
  state.me = meta.me;
  state.members = members.members;
  state.dashboard = dashboard.dashboard;
  state.investments = investments.items;
  state.income = income.income;
}

async function refreshDashboard() {
  await refreshData();
  renderUserChrome();
  if (state.view === "dashboard") renderDashboard();
  else if (state.view === "income") renderIncome();
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
  income: { title: "Income", sub: "Dividends, interest and rent by financial year", render: renderIncome },
  activity: { title: "Activity", sub: "Every change, kept in order", render: renderActivity },
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
  if (key === "activity") loadActivity(true);
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

function gainCell(value, pct) {
  const positive = value >= 0;
  const color = positive ? "var(--ok)" : "var(--bad)";
  return `<div class="gain-cell" style="color:${color}">
    <span class="gain-num">${positive ? "+" : "−"}${inr(Math.abs(value))}</span>
    <span class="gain-meta">${icon(positive ? "trendUp" : "trendDown", "sm")}${pctText(pct)}</span>
  </div>`;
}

function gainPill(value, pct, compact = false) {
  const positive = value >= 0;
  const text = `${positive ? "+" : "−"}${compact ? compactMoney(Math.abs(value)) : inr(Math.abs(value))} (${pctText(pct)})`;
  return `<span class="pill ${positive ? "pill-ok" : "pill-bad"}">${icon(positive ? "trendUp" : "trendDown")}${text}</span>`;
}

function fyLabel(year) {
  const value = Number(year) || new Date().getFullYear();
  return `FY ${value - 1}-${String(value).slice(-2)}`;
}

function fiscalYearEnding(now = new Date()) {
  return now.getFullYear() + (now.getMonth() >= 3 ? 1 : 0);
}

function renderDashboard() {
  const dash = state.dashboard;
  if (!dash) {
    $("#view").innerHTML = `<div class="card card-pad"><div class="skeleton" style="height:220px"></div></div>`;
    return;
  }
  const totals = dash.totals;
  const firstName = (state.me?.name || "there").split(" ")[0];
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const pendingText = totals.pending_credits
    ? `${totals.pending_credits} credit${totals.pending_credits === 1 ? "" : "s"} worth ${compactMoney(totals.pending_credit_amount)} awaiting bank credit`
    : totals.income_year
      ? `${compactMoney(totals.income_year)} credited this financial year`
      : "Open Income for expected interest estimates";

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
      <div class="kpi kpi-primary kpi-link" data-drill="investments" role="button" tabindex="0" title="View all holdings">
        <div class="kpi-label">${icon("wallet")} Portfolio value</div>
        <div class="kpi-value" title="${inr2(totals.value)}">${compactMoney(totals.value)}</div>
        <div class="kpi-foot">${gainPill(totals.gain, totals.gain_pct, true)}<span>since invested</span></div>
      </div>
      <div class="kpi kpi-link" data-drill="investments" data-sort="invested" role="button" tabindex="0" title="View holdings sorted by invested amount">
        <div class="kpi-label">${icon("rupee")} Amount invested</div>
        <div class="kpi-value" title="${inr2(totals.invested)}">${compactMoney(totals.invested)}</div>
        <div class="kpi-foot">Across ${totals.count} holdings</div>
      </div>
      <div class="kpi kpi-link" data-drill="investments" data-sort="gain" role="button" tabindex="0" title="View holdings sorted by gain">
        <div class="kpi-label">${icon("trendUp")} Unrealised gain</div>
        <div class="kpi-value" style="color:${totals.gain >= 0 ? "var(--ok)" : "var(--bad)"}" title="${inr2(totals.gain)}">
          ${totals.gain >= 0 ? "+" : "−"}${compactMoney(Math.abs(totals.gain))}
        </div>
        <div class="kpi-foot">${pctText(totals.gain_pct)} overall return</div>
      </div>
      <div class="kpi kpi-link" data-nav="income" role="button" tabindex="0" title="Open income, checklist and estimates">
        <div class="kpi-label">${icon("calendar")} Income · ${esc(totals.income_year_label || fyLabel())}</div>
        <div class="kpi-value" title="${inr2(totals.income_year)}">${compactMoney(totals.income_year)}</div>
        <div class="kpi-foot">${esc(pendingText)}</div>
      </div>
    </div>

    ${totals.count === 0 ? emptyDashboard() : `
    <div class="dash-grid">
      ${assetClassCard(dash)}
      ${ownersCard(dash)}
      ${brokersCard(dash)}
      ${holdingsCard(dash)}
      ${maturitiesCard(dash)}
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

function incomeKind(key) {
  return (state.meta?.income_kinds || []).find((k) => k.key === key) || { label: key, color: "#6366f1" };
}

function amountCell(value) {
  const amount = Number(value) || 0;
  return amount ? inr(amount) : `<span class="muted">—</span>`;
}

function bankLine(source) {
  const bank = source?.bank || source;
  const name = bank?.bank_name || bank?.name || "";
  const account = bank?.account_number || bank?.account || "";
  if (!name) return `<span class="text-warn">Bank details not added</span>`;
  return `${esc(name)}${account ? ` · ${esc(account)}` : ""}`;
}

function assetClassCard(dash) {
  return `
    <section class="card card-pad span-7">
      <div class="card-head">
        <div>
          <div class="card-title">Asset class spread</div>
          <div class="card-sub">Current value, invested and gain by class</div>
        </div>
        <button class="card-action" type="button" data-nav="investments">All holdings ${icon("chevronRight", "sm")}</button>
      </div>
      <div class="spread-list">
        ${dash.categories.map((cat) => {
          const types = dash.types.filter((t) => t.category === cat.key && t.value > 0);
          const gain = Number(cat.gain) || 0;
          return `<div class="spread-row">
            <div class="spread-hit drillable" data-drill="investments" data-category="${cat.key}" role="button" tabindex="0" title="View ${esc(cat.label)} holdings">
              <div class="spread-head">
                <div class="spread-title">
                  <span class="cat-dot" style="background:${safeColor(cat.color)}"></span>
                  <span>${esc(cat.label)}</span>
                  <span class="spread-count">${cat.count} holding${cat.count === 1 ? "" : "s"}</span>
                </div>
                <div class="spread-figures">
                  <strong>${compactMoney(cat.value)}</strong>
                  <span>${nf(1).format(cat.share)}%</span>
                </div>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.max(cat.share, cat.value ? 1.5 : 0)}%;background:${safeColor(cat.color)}"></div></div>
              <div class="spread-meta">
                <span>Invested ${compactMoney(cat.invested)}</span>
                <span style="color:${gain >= 0 ? "var(--ok)" : "var(--bad)"}">${gain >= 0 ? "+" : "−"}${compactMoney(Math.abs(gain))} gain</span>
              </div>
            </div>
            ${types.length ? `<div class="spread-types">
              ${types.map((t) => `
                <button class="spread-type drillable" type="button" data-drill="investments" data-type="${t.key}" title="View ${esc(t.label)} holdings">
                  <span class="st-name">${esc(t.label)}</span>
                  <span class="st-share">${nf(1).format(t.share)}%</span>
                  <span class="st-val">${compactMoney(t.value)}</span>
                  <span class="st-go">${icon("chevronRight", "sm")}</span>
                </button>`).join("")}
            </div>` : ""}
          </div>`;
        }).join("")}
      </div>
      <div class="spread-total drillable" data-drill="investments" role="button" tabindex="0" title="View all holdings">
        <span>Total portfolio</span>
        <strong>${compactMoney(dash.totals.value)}</strong>
      </div>
    </section>`;
}

function ownersCard(dash) {
  const total = dash.totals.value || 0;
  const members = state.members
    .slice()
    .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0) || a.name.localeCompare(b.name));
  return `
    <section class="card card-pad span-5">
      <div class="card-head">
        <div>
          <div class="card-title">Member-wise investment</div>
          <div class="card-sub">Value and share by family member</div>
        </div>
        <button class="card-action" type="button" data-nav="members">Members ${icon("chevronRight", "sm")}</button>
      </div>
      ${members.length ? `<div class="table-wrap">
        <table class="mini-table member-table">
          <thead><tr><th>Member</th><th class="num">Invested</th><th class="num">Value</th><th class="num hide-sm">Share</th></tr></thead>
          <tbody>
            ${members.map((member) => {
              const value = Number(member.value) || 0;
              const invested = Number(member.invested) || 0;
              const share = total ? (value / total) * 100 : 0;
              const gain = value - invested;
              return `<tr class="drillable" data-drill="investments" data-owner="${member.id}" title="View ${esc(member.name)}'s holdings">
                <td>
                  <div class="cell-person">
                    ${avatar(member.name, "sm")}
                    <div>
                      <div class="cell-name">${esc(member.name)}</div>
                      <div class="cell-sub">${member.holdings} holding${member.holdings === 1 ? "" : "s"}</div>
                    </div>
                  </div>
                </td>
                <td class="num">${compactMoney(invested)}</td>
                <td class="num">${compactMoney(value)}<div class="cell-sub" style="color:${gain >= 0 ? "var(--ok)" : "var(--bad)"}">${gain >= 0 ? "+" : "−"}${compactMoney(Math.abs(gain))}</div></td>
                <td class="num hide-sm">
                  <div class="share-cell">
                    <span>${nf(1).format(share)}%</span>
                    <div class="mini-bar"><span style="width:${Math.max(share, value ? 1.5 : 0)}%"></span></div>
                  </div>
                </td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>` : `<p class="muted" style="font-size:13px">No members yet.</p>`}
    </section>`;
}

function brokersCard(dash) {
  const brokers = dash.brokers || [];
  const untagged = Number(dash.untagged_broker_count) || 0;
  return `
    <section class="card card-pad span-12">
      <div class="card-head">
        <div>
          <div class="card-title">Investments by broker</div>
          <div class="card-sub">Stocks and ETFs placed through each broker or DP</div>
        </div>
        ${brokers.length ? `<button class="card-action" type="button" data-nav="investments">All holdings ${icon("chevronRight", "sm")}</button>` : ""}
      </div>
      ${brokers.length ? `<div class="broker-grid">
        ${brokers.map((b) => {
          const gain = Number(b.gain) || 0;
          return `<button class="broker-tile" type="button" data-drill="investments" data-search="${esc(b.name)}" title="View ${esc(b.name)} holdings">
            ${brokerBadge(b.name, "lg")}
            <span class="broker-main">
              <span class="broker-name">${esc(b.name)}</span>
              <span class="broker-sub">${b.count} holding${b.count === 1 ? "" : "s"} · ${nf(1).format(b.share)}% of portfolio</span>
            </span>
            <span class="broker-figs">
              <strong>${compactMoney(b.value)}</strong>
              <span style="color:${gain >= 0 ? "var(--ok)" : "var(--bad)"}">${gain >= 0 ? "+" : "−"}${compactMoney(Math.abs(gain))}</span>
            </span>
          </button>`;
        }).join("")}
      </div>` : `<div class="empty compact" style="padding:24px 12px">
        <div class="broker-strip" aria-hidden="true">${(state.meta?.brokers || []).map((name) => brokerBadge(name)).join("")}</div>
        <h3>No broker tagged yet</h3>
        <p>Choose a broker on any stock or ETF, or select several under Investments and tag them together.</p>
        <div class="actions"><button class="btn btn-secondary btn-sm" type="button" data-nav="investments">${icon("building")} Open holdings</button></div>
      </div>`}
      ${untagged ? `<p class="card-foot">${untagged} stock/ETF holding${untagged === 1 ? " is" : "s are"} not tagged to a broker yet.</p>` : ""}
    </section>`;
}

function incomeCard() {
  const inc = state.income;
  if (!inc) {
    return `<section class="card card-pad span-7"><div class="skeleton" style="height:220px"></div></section>`;
  }
  const summary = inc.summary;
  const years = (inc.years || []).map((y) => (typeof y === "object" ? y : { year: y, label: fyLabel(y) }));
  const rows = summary.by_investment || [];
  const label = inc.year_label || fyLabel(inc.year);
  return `
    <section class="card card-pad span-7 income-card">
      <div class="card-head">
        <div>
          <div class="card-title">Income earned</div>
          <div class="card-sub">Dividend, interest, rent and other income by investment</div>
        </div>
        <div class="card-head-tools">
          <select class="select-compact" data-income-year aria-label="Income year">
            ${years.map((y) => `<option value="${y.year}" ${y.year === inc.year ? "selected" : ""}>${esc(y.label)}</option>`).join("")}
          </select>
          ${isAdmin() ? `<button class="btn btn-secondary btn-sm" type="button" data-action="record-income">${icon("plus")} Record</button>` : ""}
        </div>
      </div>
      <div class="income-strip">
        <div><span>Credited</span><strong>${compactMoney(summary.credited)}</strong></div>
        <div><span>Pending credit</span><strong>${compactMoney(summary.pending)}</strong></div>
        <div><span>Entries</span><strong>${summary.count}</strong></div>
      </div>
      <div class="kind-chips">
        ${(summary.by_kind || []).map((kind) => `
          <span class="kind-chip">
            <i style="background:${safeColor(kind.color)}"></i>
            ${esc(kind.label)}
            <strong>${compactMoney(kind.amount)}</strong>
          </span>`).join("")}
      </div>
      ${rows.length ? `<div class="table-wrap">
        <table class="mini-table income-table">
          <thead>
            <tr><th>Investment</th><th class="num">Dividend</th><th class="num hide-sm">Interest</th><th class="num hide-sm">Rent</th><th class="num hide-sm">Other</th><th class="num">Total</th><th class="num">Pending</th></tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr class="drillable" data-investment-id="${row.investment_id}" title="Open ${esc(row.investment)}">
                <td>
                  <div class="cell-name">${esc(row.investment)}</div>
                  <div class="cell-sub hide-sm">${esc(row.owner)} · ${esc(row.type_label)}</div>
                </td>
                <td class="num">${amountCell(row.dividend)}</td>
                <td class="num hide-sm">${amountCell(row.interest)}</td>
                <td class="num hide-sm">${amountCell(row.rent)}</td>
                <td class="num hide-sm">${amountCell(row.other)}</td>
                <td class="num"><strong>${amountCell(row.total)}</strong></td>
                <td class="num">${amountCell(row.pending)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty compact">
        <div class="empty-icon">${icon("rupee")}</div>
        <h3>No credited income in ${esc(label)}</h3>
        <p>Record a dividend, FD interest or rent receipt, or fetch dividends for your shares.</p>
        ${isAdmin() ? `<div class="actions">
          <button class="btn btn-secondary btn-sm" type="button" data-action="record-income">${icon("plus")} Record income</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="fetch-corporate">${icon("refresh")} Fetch dividends</button>
        </div>` : ""}
      </div>`}
      ${inc.items.length ? `<details class="income-entries">
        <summary>${inc.items.length} entr${inc.items.length === 1 ? "y" : "ies"} in ${esc(label)}</summary>
        <div class="entry-list">
          ${inc.items.map((item) => `
            <div class="entry-row drillable" data-investment-id="${item.investment_id}" title="Open ${esc(item.investment)}">
              <span class="entry-kind" style="background:${safeColor(item.kind_color)}22;color:${safeColor(item.kind_color)}">${esc(item.kind_label)}</span>
              <div class="entry-main">
                <span class="entry-name">${esc(item.investment)}</span>
                <span class="entry-meta">${esc(item.owner)} · ${item.status === "credited" ? `credited ${fmtDate(item.credited_date)}` : `expected ${fmtDate(item.due_date)}`}</span>
              </div>
              <span class="entry-amt">${inr2(item.amount)}</span>
              ${isAdmin() ? `<button class="icon-btn danger" type="button" data-action="delete-income" data-id="${item.id}" title="Delete entry" aria-label="Delete income entry">${icon("trash", "sm")}</button>` : ""}
            </div>`).join("")}
        </div>
      </details>` : ""}
      <p class="card-foot">Indian financial year, April to March. Pending entries wait for the bank credit.</p>
    </section>`;
}

function creditChecklistCard() {
  if (!state.income) {
    return `<section class="card card-pad span-5"><div class="skeleton" style="height:220px"></div></section>`;
  }
  const items = state.income.checklist || [];
  return `
    <section class="card card-pad span-5">
      <div class="card-head">
        <div>
          <div class="card-title">Credit checklist</div>
          <div class="card-sub">Income expected in a member's bank account</div>
        </div>
        <span class="pill ${items.length ? "pill-warn" : "pill-ok"}">${items.length ? `${items.length} pending` : "All clear"}</span>
      </div>
      ${items.length ? `<div class="credit-list">
        ${items.map((item) => {
          const days = item.days;
          const dueClass = days !== null && days < 0 ? "overdue" : days !== null && days <= 7 ? "soon" : "";
          const dueText = days === null ? "No expected date"
            : days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
            : days === 0 ? "Expected today"
            : `Expected in ${days} day${days === 1 ? "" : "s"}`;
          const bank = item.bank || {};
          return `<div class="credit-row ${dueClass}">
            <input type="checkbox" data-credit-id="${item.id}" ${isAdmin() ? "" : "disabled"} aria-label="Mark ${esc(item.investment)} ${esc(item.kind_label.toLowerCase())} as received">
            <div class="credit-main drillable" data-investment-id="${item.investment_id}" role="button" tabindex="0" title="Open ${esc(item.investment)}">
              <div class="credit-title">${esc(item.investment)} <span class="kind-tag" style="color:${safeColor(item.kind_color)}">${esc(item.kind_label)}</span></div>
              <div class="credit-sub">${esc(item.owner)} · ${bankLine(item)}</div>
              <div class="credit-due">${dueText}${item.due_date ? ` · ${fmtDate(item.due_date)}` : ""}</div>
            </div>
            <div class="credit-amt">${inr(item.amount)}</div>
          </div>`;
        }).join("")}
      </div>` : `<div class="empty compact">
        <div class="empty-icon">${icon("checkCircle")}</div>
        <h3>Nothing awaiting credit</h3>
        <p>Dividends and interest you apply or record will appear here until the bank credit is confirmed.</p>
      </div>`}
      <div class="checklist-foot">
        <span>${isAdmin() ? "Tick an item once the money reaches the bank." : "Admins can confirm bank credits."}</span>
        <button class="card-action" type="button" data-nav="members">Bank details ${icon("chevronRight", "sm")}</button>
      </div>
    </section>`;
}

function bankCard() {
  const members = state.members.slice().sort((a, b) => a.name.localeCompare(b.name));
  const missing = members.filter((m) => !m.bank_name || !m.account_number).length;
  return `
    <section class="card card-pad ${isAdmin() ? "span-7" : "span-12"}">
      <div class="card-head">
        <div>
          <div class="card-title">Member bank details</div>
          <div class="card-sub">Where dividends, interest and rent should land</div>
        </div>
        <span class="pill ${missing ? "pill-warn" : "pill-ok"}">${missing ? `${missing} incomplete` : "All linked"}</span>
      </div>
      <div class="table-wrap">
        <table class="mini-table bank-table">
          <thead><tr><th>Member</th><th>Bank</th><th class="hide-sm">Account</th><th class="hide-sm">IFSC</th></tr></thead>
          <tbody>
            ${members.map((member) => `
              <tr class="drillable" data-member-open="${member.id}" title="${isAdmin() ? `Edit ${esc(member.name)}'s details` : "Open members"}">
                <td>
                  <div class="cell-person">
                    ${avatar(member.name, "sm")}
                    <div><div class="cell-name">${esc(member.name)}</div><div class="cell-sub">${member.role === "admin" ? "Admin" : "Viewer"}</div></div>
                  </div>
                </td>
                <td>
                  <div class="cell-name">${member.bank_name ? esc(member.bank_name) : `<span class="muted">Not added</span>`}</div>
                  <div class="cell-sub">${esc(member.bank_branch || "")}</div>
                </td>
                <td class="mono hide-sm">${member.account_number ? esc(member.account_number) : `<span class="pill pill-warn">Missing</span>`}</td>
                <td class="mono hide-sm">${member.ifsc ? esc(member.ifsc) : `<span class="muted">—</span>`}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <p class="card-foot">${isAdmin() ? "Update bank details from the Members page." : "Account numbers are masked for other members."}</p>
    </section>`;
}

function corporateCard() {
  const holdings = state.investments.filter((i) => i.type === "stocks" || i.type === "etf");
  const endFy = fiscalYearEnding();
  const windows = [
    `${endFy}:1|${fyLabel(endFy)} · this financial year`,
    `${endFy - 1}:1|${fyLabel(endFy - 1)} · previous financial year`,
    `${endFy}:3|Last 3 FYs · ${fyLabel(endFy - 2)} to ${fyLabel(endFy)}`,
    `${endFy}:5|Last 5 FYs · ${fyLabel(endFy - 4)} to ${fyLabel(endFy)}`,
  ];
  return `
    <section class="card card-pad span-5 corp-card">
      <div class="card-head">
        <div>
          <div class="card-title">Dividends &amp; bonus</div>
          <div class="card-sub">Auto-fetch corporate actions for shares and ETFs</div>
        </div>
        <span class="pill pill-muted">${holdings.length} eligible</span>
      </div>
      <div class="corp-illustration">
        <div class="corp-badge">${icon("rupee")}</div>
        <div>
          <strong>Dividend cash and bonus shares</strong>
          <p>NSE is checked first, with Yahoo Finance as a fallback. Dividend credits are added to the checklist; bonus or split actions update the quantity and average cost.</p>
        </div>
      </div>
      <ul class="corp-points">
        <li>${icon("check", "sm")} Only actions after each holding's start date</li>
        <li>${icon("check", "sm")} Already-applied actions are skipped</li>
        <li>${icon("check", "sm")} Review and tick before anything is applied</li>
      </ul>
      <div class="corp-controls">
        <select class="select-compact" id="corp-window" aria-label="Financial year window">
          ${windows.map((entry) => {
            const [value, label] = entry.split("|");
            return `<option value="${value}">${esc(label)}</option>`;
          }).join("")}
        </select>
        <button class="btn btn-primary btn-sm" type="button" data-action="fetch-corporate" ${holdings.length ? "" : "disabled"}>
          ${icon("refresh")} Fetch actions
        </button>
      </div>
      <p class="card-foot">Windows follow the Indian financial year, 1 April to 31 March.</p>
      ${holdings.length ? "" : `<p class="card-foot">Add a stock or ETF with a symbol first.</p>`}
    </section>`;
}

/* ============================================================
   Income page
   ============================================================ */

function renderIncome() {
  const view = $("#view");
  if (!state.income) {
    view.innerHTML = `<div class="card card-pad"><div class="skeleton" style="height:220px"></div></div>`;
    return;
  }
  view.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Income · ${esc(state.income.year_label)}</h2>
        <p>Dividends, interest and rent actually paid into an account — upcoming payments by financial year and the payment calendar.</p>
      </div>
    </div>
    <div class="dash-grid">
      ${incomeCard()}
      ${creditedInterestCard()}
      ${incomeCalendarCard()}
      ${upcomingInterestCard()}
      ${cumulativeCard()}
      ${creditChecklistCard()}
      ${bankCard()}
      ${isAdmin() ? corporateCard() : ""}
    </div>`;
  hydrateIcons(view);
}

function creditedInterestCard() {
  const est = state.income?.estimate;
  if (!est) {
    return `<section class="card card-pad span-5"><div class="skeleton" style="height:220px"></div></section>`;
  }
  const items = est.items || [];
  const recorded = items.reduce((sum, item) => sum + (Number(item.recorded) || 0), 0);
  return `
    <section class="card card-pad span-5 estimate-card">
      <div class="card-head">
        <div>
          <div class="card-title">Interest credited · ${esc(est.label)}</div>
          <div class="card-sub">Cash payouts due up to ${esc(fmtDate(est.cutoff))} — later payments are listed by financial year</div>
        </div>
        <span class="pill pill-muted">${items.length} deposit${items.length === 1 ? "" : "s"}</span>
      </div>
      <div class="income-strip">
        <div><span>Credited to date</span><strong>${compactMoney(est.total)}</strong></div>
        <div><span>Recorded</span><strong>${compactMoney(recorded)}</strong></div>
        <div><span>Deposits</span><strong>${items.length}</strong></div>
      </div>
      ${items.length ? `<div class="estimate-list">
        ${items.map((item) => {
          const when = item.credited_on ? `credited ${fmtDate(item.credited_on)}`
            : item.period ? `${esc(item.period)}` : "";
          const meta = [when, item.recorded ? `recorded ${inr(item.recorded)}` : ""].filter(Boolean).join(" · ");
          return `<div class="estimate-row drillable" data-investment-id="${item.investment_id}" role="button" tabindex="0" title="Open ${esc(item.investment)}">
            <div class="estimate-main">
              <div class="estimate-name">${esc(item.investment)}</div>
              <div class="estimate-basis">${esc(item.basis)}${meta ? ` · ${meta}` : ""}</div>
              <div class="estimate-note">${esc(item.note)}</div>
            </div>
            <div class="estimate-amt">${inr2(item.amount)}</div>
          </div>`;
        }).join("")}
      </div>` : `<div class="empty compact">
        <div class="empty-icon">${icon("trendUp")}</div>
        <h3>Nothing credited in ${esc(est.label)} yet</h3>
        <p>Only real payments are counted: coupons and interest payouts as they fall due, and maturity values when the instruction is payout.</p>
      </div>`}
      <p class="card-foot">Counts cash interest actually paid out. Cumulative deposits count once, on their maturity date, when the maturity instruction is Payout — renewals are kept as reminders and never counted as income.${est.skipped ? ` ${est.skipped} debt holding${est.skipped === 1 ? "" : "s"} skipped for missing rate or amount.` : ""}</p>
    </section>`;
}

function upcomingInterestCard() {
  const est = state.income?.estimate;
  if (!est) {
    return `<section class="card card-pad span-12"><div class="skeleton" style="height:220px"></div></section>`;
  }
  const groups = est.upcoming || [];
  return `
    <section class="card card-pad span-12 upcoming-card">
      <div class="card-head">
        <div>
          <div class="card-title">Upcoming credits</div>
          <div class="card-sub">After ${esc(fmtDate(est.cutoff))}, financial year by financial year</div>
        </div>
        <span class="pill pill-muted">${compactMoney(est.upcoming_total || 0)}</span>
      </div>
      ${groups.length ? groups.map((group) => {
        const shown = group.items.slice(0, 10);
        const rest = group.items.length - shown.length;
        return `<div class="fy-block">
          <div class="fy-head"><strong>${esc(group.label)}</strong><span>${group.count} credit${group.count === 1 ? "" : "s"} · <b>${compactMoney(group.total)}</b>${group.reminder_count ? ` · ${group.reminder_count} renewal${group.reminder_count === 1 ? "" : "s"}` : ""}</span></div>
          ${shown.map((item) => {
            const when = item.date ? fmtDate(item.date) : item.period || "";
            return `<div class="estimate-row drillable${item.reminder ? " is-reminder" : ""}" data-investment-id="${item.investment_id}" role="button" tabindex="0" title="Open ${esc(item.investment)}">
              <div class="estimate-main">
                <div class="estimate-name">${esc(item.investment)}${item.reminder ? ` <span class="pill pill-warn">Auto Renewal</span>` : ""}</div>
                <div class="estimate-basis">${esc(when)} · ${esc(item.basis)}</div>
                <div class="estimate-note">${esc(item.note)}</div>
              </div>
              <div class="estimate-amt">${inr2(item.amount)}</div>
            </div>`;
          }).join("")}
          ${rest > 0 ? `<div class="fy-more">+${rest} more in ${esc(group.label)}</div>` : ""}
        </div>`;
      }).join("") : `<div class="empty compact">
        <div class="empty-icon">${icon("calendar")}</div>
        <h3>No credits scheduled</h3>
        <p>Fill the rate and dates on fixed deposits, RDs and bonds to project the rest of the year and later years.</p>
      </div>`}
      <p class="card-foot">Only cash payments count towards the total. A maturity marked Renew is shown as an Auto Renewal reminder (dashed) and is not paid out.${est.renewal_total ? ` ${compactMoney(est.renewal_total)} will roll over instead.` : ""}</p>
    </section>`;
}

function cumulativeCard() {
  const est = state.income?.estimate;
  if (!est) {
    return `<section class="card card-pad span-12"><div class="skeleton" style="height:220px"></div></section>`;
  }
  const list = est.cumulative || [];
  return `
    <section class="card card-pad span-12 cumulative-card">
      <div class="card-head">
        <div>
          <div class="card-title">Cumulative deposits · maturity value</div>
          <div class="card-sub">Principal plus interest, settled as per the maturity instruction</div>
        </div>
        <span class="pill pill-muted">${compactMoney(est.cumulative_total || 0)}</span>
      </div>
      ${list.length ? `<div class="table-wrap">
        <table class="mini-table cumulative-table">
          <thead><tr><th>Deposit</th><th class="num">Principal</th><th class="num">Interest</th><th class="num">Maturity value</th><th>Matures</th></tr></thead>
          <tbody>
            ${list.map((entry) => `
              <tr class="drillable" data-investment-id="${entry.investment_id}" title="Open ${esc(entry.investment)}">
                <td>
                  <div class="cell-name">${esc(entry.investment)}</div>
                  <div class="cell-sub">${esc(entry.owner)} · ${esc(entry.type_label)}</div>
                </td>
                <td class="num">${amountCell(entry.principal)}</td>
                <td class="num">${amountCell(entry.interest)}</td>
                <td class="num"><strong>${amountCell(entry.maturity_amount)}</strong></td>
                <td>
                  <div class="cell-name">${fmtDate(entry.maturity_date)}</div>
                  <div class="cell-sub">${entry.matured ? "Matured" : fyLabel(fyEndFromIso(entry.maturity_date))}</div>
                  ${entry.action === "renew"
                    ? `<span class="pill pill-warn">Auto renewal</span>`
                    : `<span class="pill pill-ok">Payout</span>`}
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<div class="empty compact">
        <div class="empty-icon">${icon("wallet")}</div>
        <h3>No cumulative deposits yet</h3>
        <p>Cumulative fixed deposits, RDs, NSC and similar balances appear here with the maturity value once principal, rate, start and maturity dates are filled.</p>
      </div>`}
      <p class="card-foot">Maturity value = principal + interest${est.cumulative_total ? `; ${compactMoney(est.cumulative_total)} is due as payout` : ""}${est.cumulative_renewal_total ? `, and ${compactMoney(est.cumulative_renewal_total)} is marked Auto renewal (a reminder only, nothing is paid out)` : ""}. Where the bank's maturity amount is saved it is used as-is.</p>
    </section>`;
}

function fyEndFromIso(iso) {
  const day = new Date(`${String(iso).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(day.getTime())) return new Date().getFullYear();
  return day.getFullYear() + (day.getMonth() >= 3 ? 1 : 0);
}

/* ---------- Income calendar ---------- */

const CAL_WEEK = ["M", "T", "W", "T", "F", "S", "S"];
const CAL_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad2 = (n) => String(n).padStart(2, "0");

function fyMonths(year) {
  const months = [];
  for (let i = 0; i < 12; i++) {
    const offset = 3 + i;
    months.push({ y: year - 1 + Math.floor(offset / 12), m: offset % 12 });
  }
  return months;
}

function calDefaultMonth(cal) {
  if (!cal) return `${new Date().getFullYear()}-${pad2(new Date().getMonth() + 1)}`;
  const today = cal.today || todayIso();
  if (today >= cal.from && today <= cal.to) return today.slice(0, 7);
  const keys = Object.keys(cal.days || {}).sort();
  return (keys[0] || cal.from).slice(0, 7);
}

function calGridHtml(year, month, days, max, mini) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const count = new Date(year, month + 1, 0).getDate();
  const today = state.income?.calendar?.today || todayIso();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(`<span class="cal-blank"></span>`);
  for (let dayNo = 1; dayNo <= count; dayNo++) {
    const iso = `${year}-${pad2(month + 1)}-${pad2(dayNo)}`;
    const slot = days[iso] || {};
    const total = (Number(slot.credited) || 0) + (Number(slot.expected) || 0);
    const level = total ? Math.min(100, Math.max(10, Math.round(Math.sqrt(total / max) * 100))) : 0;
    const cls = ["cal-cell"];
    if (total) cls.push("has-income");
    if (level >= 55) cls.push("is-deep");
    if (iso > today) cls.push("is-projected");
    if (iso === today) cls.push("is-today");
    const title = `${fmtDate(iso)} · ${total ? inr2(total) : "No income"}`;
    const style = total ? ` style="--cal-level:${level}"` : "";
    cells.push(mini
      ? `<span class="${cls.join(" ")}"${style} title="${esc(title)}"></span>`
      : `<button class="${cls.join(" ")}" type="button" data-action="cal-day" data-day="${iso}"${style} title="${esc(title)}" aria-label="${esc(title)}">${dayNo}</button>`);
  }
  return `<div class="cal-grid${mini ? " is-mini" : " is-full"}">
    <div class="cal-week">${CAL_WEEK.map((letter) => `<span>${letter}</span>`).join("")}</div>
    ${cells.join("")}
  </div>`;
}

function calDayPanel(cal, iso) {
  const slot = cal.days[iso] || {};
  const credited = Number(slot.credited) || 0;
  const expected = Number(slot.expected) || 0;
  const events = (cal.events || []).filter((event) => event.date === iso);
  const lumps = (cal.lumps || []).filter((row) => row.date === iso);
  const renewals = (cal.renewals || []).filter((row) => row.date === iso);
  const rows = [
    ...events.map((event) => ({
      label: event.kind_label, name: event.investment, amount: event.amount,
      state: event.state, investment_id: event.investment_id, sub: null,
    })),
    ...lumps.map((row) => ({
      label: row.label, name: row.investment, amount: row.amount,
      state: row.state, investment_id: row.investment_id,
      sub: row.interest != null
        ? `principal ${inr2(row.principal)} + interest ${inr2(row.interest)}`
        : null,
    })),
    ...renewals.map((row) => ({
      label: row.label, name: row.investment, amount: row.amount,
      state: "renewal", investment_id: row.investment_id, sub: null,
    })),
  ];
  const cash = credited + expected;
  const renewalTotal = renewals.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  return `<div class="cal-day-panel">
    <div class="cal-day-head">
      <strong>${fmtDate(iso)}</strong>
      <span>${cash ? compactMoney(cash) : "No payout"}</span>
      <button class="icon-btn" type="button" data-action="cal-day-close" aria-label="Close day detail">${icon("close", "sm")}</button>
    </div>
    ${rows.length ? `<div class="cal-day-rows">
      ${rows.map((row) => `
        <div class="cal-day-row${row.investment_id ? " drillable" : ""}${row.state === "renewal" ? " is-reminder" : ""}"${row.investment_id ? ` data-investment-id="${row.investment_id}" role="button" tabindex="0"` : ""}>
          <span class="kind-tag">${esc(row.label)}</span>
          <span class="cal-day-main">
            <span class="cal-day-name">${esc(row.name)}</span>
            ${row.sub ? `<span class="cal-day-sub">${esc(row.sub)}</span>` : ""}
          </span>
          <span class="pill ${row.state === "renewal" ? "pill-warn" : row.state === "expected" ? "pill-muted" : "pill-ok"}">${row.state === "renewal" ? "not paid" : row.state === "expected" ? "projected" : "credited"}</span>
          <strong>${inr2(row.amount)}</strong>
        </div>`).join("")}
    </div>` : `<p class="muted cal-day-empty">No payment recorded or expected on this date.</p>`}
    ${renewalTotal ? `<p class="cal-day-foot muted">Matures and renews automatically — ${compactMoney(renewalTotal)} is not paid out.</p>` : ""}
  </div>`;
}

function incomeCalendarCard() {
  const cal = state.income?.calendar;
  if (!cal) {
    return `<section class="card card-pad span-12"><div class="skeleton" style="height:240px"></div></section>`;
  }
  const zoom = state.incomeCal.zoom === "month" ? "month" : "year";
  const days = cal.days || {};
  const totals = Object.values(days).map((slot) => (Number(slot.credited) || 0) + (Number(slot.expected) || 0));
  const max = Math.max(1, ...totals);
  let body = "";
  if (zoom === "year") {
    const months = fyMonths(cal.year).map((month) => {
      const key = `${month.y}-${pad2(month.m + 1)}`;
      const total = Object.keys(days).filter((iso) => iso.startsWith(key))
        .reduce((sum, iso) => sum + (Number(days[iso].credited) || 0) + (Number(days[iso].expected) || 0), 0);
      return `<div class="cal-month" role="button" tabindex="0" data-action="cal-open-month" data-month="${key}" title="Open ${CAL_MONTHS[month.m]} ${month.y}">
        <div class="cal-month-head"><strong>${CAL_MONTHS[month.m]} ${String(month.y).slice(-2)}</strong><span>${total ? compactMoney(total) : "—"}</span></div>
        ${calGridHtml(month.y, month.m, days, max, true)}
      </div>`;
    }).join("");
    body = `<div class="cal-months">${months}</div>`;
  } else {
    const key = state.incomeCal.month || calDefaultMonth(cal);
    const [year, monthNo] = key.split("-").map(Number);
    const monthDate = new Date(year, monthNo - 1, 1);
    const label = monthDate.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    const fromKey = cal.from.slice(0, 7);
    const toKey = cal.to.slice(0, 7);
    const prev = new Date(year, monthNo - 2, 1);
    const next = new Date(year, monthNo, 1);
    const prevKey = `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}`;
    const nextKey = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}`;
    const nav = `<div class="cal-nav">
      <button class="icon-btn" type="button" data-action="cal-nav" data-dir="-1" ${prevKey < fromKey || key <= fromKey ? "disabled" : ""} aria-label="Previous month">‹</button>
      <strong>${esc(label)}</strong>
      <button class="icon-btn" type="button" data-action="cal-nav" data-dir="1" ${nextKey > toKey || key >= toKey ? "disabled" : ""} aria-label="Next month">›</button>
    </div>`;
    const detail = state.incomeCal.day ? calDayPanel(cal, state.incomeCal.day) : "";
    body = `${nav}
      <div class="cal-month-view">
        ${calGridHtml(year, monthNo - 1, days, max, false)}
        ${detail || `<p class="cal-hint muted">Tap a day to see what was paid — or is projected — that day. Renewals show as reminders.</p>`}
      </div>`;
  }
  return `
    <section class="card card-pad span-12 income-calendar-card" id="income-calendar">
      <div class="card-head">
        <div>
          <div class="card-title">Payment calendar · ${esc(cal.label)}</div>
          <div class="card-sub">Cash actually credited to an account — interest, coupons, dividends and payouts; zoom from the year to a month, then tap a day</div>
        </div>
        <div class="card-head-tools cal-tools">
          <div class="segmented" role="group" aria-label="Calendar zoom">
            <button class="seg ${zoom === "year" ? "active" : ""}" type="button" data-action="cal-zoom" data-zoom="year">Year</button>
            <button class="seg ${zoom === "month" ? "active" : ""}" type="button" data-action="cal-zoom" data-zoom="month">Month</button>
          </div>
        </div>
      </div>
      <div class="cal-legend">
        <span>Low</span>
        <i class="cal-swatch" style="--cal-level:10"></i>
        <i class="cal-swatch" style="--cal-level:38"></i>
        <i class="cal-swatch" style="--cal-level:66"></i>
        <i class="cal-swatch" style="--cal-level:100"></i>
        <span>High</span>
        <span class="cal-legend-note"><i class="cal-swatch is-projected"></i> projected</span>
        <span class="cal-legend-note"><i class="cal-swatch is-reminder"></i> renewal reminder — not paid out</span>
      </div>
      ${body}
    </section>`;
}

function paintIncomeCalendar() {
  const host = $("#income-calendar");
  if (!host) return;
  host.outerHTML = incomeCalendarCard();
  hydrateIcons($("#income-calendar"));
}

/* ============================================================
   Activity page
   ============================================================ */

function renderActivity() {
  const view = $("#view");
  const act = state.activity;
  if (!act) {
    view.innerHTML = `<div class="card card-pad"><div class="skeleton" style="height:220px"></div></div>`;
    loadActivity(true);
    return;
  }
  view.innerHTML = `
    <div class="page-head">
      <div>
        <h2>Activity log</h2>
        <p>Every change is kept — ${act.total.toLocaleString("en-IN")} entr${act.total === 1 ? "y" : "ies"} recorded so far.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-action="activity-refresh">${icon("refresh")} Refresh</button>
      </div>
    </div>
    <div class="dash-grid">
      <section class="card card-pad span-12">
        ${act.items.length ? `<div class="table-wrap">
          <table class="mini-table activity-table">
            <thead><tr><th>When</th><th>Who</th><th>What changed</th><th class="hide-sm">Area</th></tr></thead>
            <tbody>
              ${act.items.map((item) => `
                <tr>
                  <td>
                    <div class="cell-name">${fmtDateTime(item.created_at)}</div>
                    <div class="cell-sub">${timeAgo(item.created_at)}</div>
                  </td>
                  <td>${esc(item.user)}</td>
                  <td><div class="cell-name">${esc(item.summary)}</div></td>
                  <td class="hide-sm"><span class="pill pill-muted">${esc(item.entity_type || item.action)}</span></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>` : `<div class="empty compact">
          <div class="empty-icon">${icon("clock")}</div>
          <h3>No activity yet</h3>
          <p>Every add, edit, import and income confirmation will be listed here and kept.</p>
        </div>`}
        <div class="activity-foot">
          <span class="muted">Showing ${act.items.length} of ${act.total}</span>
          ${act.has_more
            ? `<button class="btn btn-secondary btn-sm" type="button" data-action="activity-more">Load older ${icon("chevronDown", "sm")}</button>`
            : `<span class="muted">Start of the log</span>`}
        </div>
      </section>
      ${isAdmin() ? trashCard() : ""}
    </div>`;
  hydrateIcons(view);
}

const TRASH_LABELS = {
  investment: "Holding",
  transaction: "Trade",
  income: "Income entry",
  demat: "Demat account",
  member: "Member",
};

function trashCard() {
  const trash = state.trash;
  if (!trash) {
    return `<section class="card card-pad span-12">
      <div class="card-head"><div><div class="card-title">Recently deleted</div>
      <div class="card-sub">Restore anything removed in the last 30 days</div></div></div>
      <div class="skeleton" style="height:70px"></div>
    </section>`;
  }
  const items = trash.items || [];
  return `
    <section class="card card-pad span-12">
      <div class="card-head">
        <div>
          <div class="card-title">Recently deleted</div>
          <div class="card-sub">Restore anything removed in the last ${trash.days} days · ${items.length} item${items.length === 1 ? "" : "s"}</div>
        </div>
      </div>
      ${items.length ? `<div class="table-wrap">
        <table class="mini-table activity-table">
          <thead><tr><th>Deleted</th><th>What</th><th style="text-align:right">Actions</th></tr></thead>
          <tbody>
            ${items.map((item) => `
              <tr>
                <td>
                  <div class="cell-name">${fmtDateTime(item.deleted_at)}</div>
                  <div class="cell-sub">${timeAgo(item.deleted_at)}${item.deleted_by ? ` · ${esc(item.deleted_by)}` : ""}</div>
                </td>
                <td>
                  <div class="cell-name">${esc(item.label)}</div>
                  <div class="cell-sub">${esc(TRASH_LABELS[item.entity] || item.entity)}${item.detail ? ` · ${esc(item.detail)}` : ""}</div>
                </td>
                <td style="white-space:nowrap;text-align:right">
                  <button class="btn btn-secondary btn-sm" type="button" data-action="trash-restore" data-trash-id="${item.id}">${icon("refresh")} Restore</button>
                  <button class="btn btn-ghost btn-sm" type="button" data-action="trash-purge" data-trash-id="${item.id}">Delete forever</button>
                </td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>` : `<p class="muted" style="font-size:13px;padding:6px 0 2px">Nothing deleted recently. Removed holdings, trades, income entries, demat accounts and members wait here so a wrong click can be put right.</p>`}
    </section>`;
}

function undoAction(trashIds) {
  const ids = (Array.isArray(trashIds) ? trashIds : [trashIds]).filter(Boolean);
  if (!ids.length) return null;
  return {
    label: "Undo",
    run: async () => {
      let restored = 0;
      let problem = "";
      for (const trashId of ids) {
        try {
          await api(`/trash/${trashId}/restore`, { method: "POST" });
          restored += 1;
        } catch (error) {
          problem = error.message;
        }
      }
      if (restored) {
        toast(`${restored} record${restored === 1 ? "" : "s"} restored`, "ok");
        state.trash = null;
        await refreshAndRender();
        if (state.view === "activity") await loadActivity(true);
      }
      if (problem) toast(problem, "error");
    },
  };
}

async function restoreTrashItem(trashId) {
  try {
    const result = await api(`/trash/${trashId}/restore`, { method: "POST" });
    toast(`Restored ${result.label || "the record"}`, "ok");
    state.activity = null;
    await refreshData();
    await loadActivity(true);
  } catch (error) {
    toast(error.message, "error");
  }
}

async function purgeTrashItem(trashId) {
  const item = (state.trash?.items || []).find((t) => t.id === trashId);
  const ok = await confirmDialog({
    title: "Delete permanently?",
    message: item
      ? `<strong>${esc(item.label)}</strong> (${esc((TRASH_LABELS[item.entity] || item.entity).toLowerCase())}) will be gone for good. This cannot be undone.`
      : "This record will be gone for good. This cannot be undone.",
    confirmLabel: "Delete forever",
  });
  if (!ok) return;
  try {
    await api(`/trash/${trashId}`, { method: "DELETE" });
    toast("Deleted for good", "ok");
    state.trash = null;
    await loadTrash();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function loadTrash() {
  if (!isAdmin() || state.trashLoading) return;
  state.trashLoading = true;
  try {
    state.trash = await api("/trash");
    if (state.view === "activity") renderActivity();
  } catch (error) {
    state.trash = state.trash || { days: 30, items: [] };
  } finally {
    state.trashLoading = false;
  }
}

async function loadActivity(reset = false) {
  if (state.activityLoading) return;
  state.activityLoading = true;
  const offset = reset || !state.activity ? 0 : state.activity.items.length;
  try {
    const data = await api(`/activity?limit=100&offset=${offset}`);
    if (reset || !state.activity) {
      state.activity = { items: [...data.activity], total: data.total, has_more: data.has_more };
    } else {
      state.activity.items.push(...data.activity);
      state.activity.total = data.total;
      state.activity.has_more = data.has_more;
    }
    if (state.view === "activity") renderActivity();
    if (isAdmin()) loadTrash();
  } catch (error) {
    toast(error.message, "error");
    if (state.view === "activity" && state.activity) renderActivity();
  } finally {
    state.activityLoading = false;
  }
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
        <thead><tr><th>Holding</th><th class="hide-sm">Owner</th><th>Value</th></tr></thead>
        <tbody>
          ${rows.map((h) => `
            <tr data-investment-id="${h.id}">
              <td>
                <div class="holding-name">${holdingBadge(h)}<strong>${esc(h.name)}</strong></div>
                <div class="cell-sub">${esc(h.type_label)}${h.broker ? ` · <span class="sub-broker">${brokerBadge(h.broker, "sm")}${esc(h.broker)}</span>` : ""}</div>
              </td>
              <td class="hide-sm" style="font-size:12px;color:var(--muted)">${esc(h.owner)}</td>
              <td class="num">${inr(h.display_value)}<div class="cell-sub" style="color:${h.display_gain >= 0 ? "var(--ok)" : "var(--bad)"}">${pctText(h.display_gain_pct)}</div></td>
            </tr>`).join("")}
        </tbody>
      </table>` : `<p class="muted" style="font-size:13px">No holdings yet.</p>`}
    </section>`;
}

function maturitiesCard(dash) {
  return `
    <section class="card card-pad span-5">
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
          return `<div class="maturity-row drillable" data-investment-id="${m.id}" role="button" tabindex="0" title="Open ${esc(m.name)}">
            <div class="maturity-date"><div class="d">${d.day}</div><div class="m">${d.month}</div></div>
            <div class="maturity-main">
              <div class="name">${issuerBadge({ issuer: m.issuer, type: m.type_key, name: m.name }, "sm")}<span>${esc(m.name)}</span></div>
              <div class="sub">${esc(m.type)} · ${esc(m.owner)}</div>
            </div>
            <div class="maturity-val">${compactMoney(m.value)}<div class="sub">${m.days === 0 ? "today" : `in ${m.days} days`}</div></div>
          </div>`;
        }).join("")}
      </div>` : `<p class="muted" style="font-size:13px;padding:8px 0">No maturities in the next year.</p>`}
    </section>`;
}

/* ============================================================
   Income + corporate actions
   ============================================================ */

function openIncomeModal(preselectId = null) {
  if (!isAdmin()) return;
  const investments = state.investments.slice().sort((a, b) => a.name.localeCompare(b.name));
  if (!investments.length) {
    toast("Add an investment before recording income", "warn");
    return;
  }
  const selectedId = investments.some((item) => item.id === Number(preselectId))
    ? Number(preselectId)
    : investments[0].id;
  const kinds = state.meta?.income_kinds || [{ key: "dividend", label: "Dividend" }];
  const today = todayIso();

  openModal({
    title: "Record income",
    subtitle: "Add a dividend, interest, rent or other receipt to the shared ledger.",
    size: "modal-md",
    body: `
      <form id="income-form" novalidate>
        <label class="field">
          <span>Investment</span>
          <select name="investment_id">
            ${investments.map((item) => `
              <option value="${item.id}" ${item.id === selectedId ? "selected" : ""}>
                ${esc(item.name)} · ${esc(item.owner)}${item.type !== "real_estate" && item.details?.symbol ? ` (${esc(item.details.symbol)})` : ""}
              </option>`).join("")}
          </select>
        </label>
        <div class="grid-2">
          <label class="field">
            <span>Income type</span>
            <select name="kind">
              ${kinds.map((kind) => `<option value="${esc(kind.key)}">${esc(kind.label)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Amount<span class="req">*</span></span>
            <input type="number" name="amount" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00">
          </label>
        </div>
        <div class="grid-2">
          <label class="field">
            <span>Status</span>
            <select name="status">
              <option value="credited">Received in bank</option>
              <option value="pending">Expected, not yet credited</option>
            </select>
          </label>
          <label class="field" data-credited-field>
            <span>Credited on</span>
            <input type="date" name="credited_date" value="${today}">
          </label>
          <label class="field hidden" data-pending-field>
            <span>Expected credit date</span>
            <input type="date" name="due_date" value="${today}">
          </label>
        </div>
        <label class="field">
          <span>Notes</span>
          <textarea name="notes" maxlength="500" placeholder="e.g. Q2 dividend, FD interest for Apr-Jun"></textarea>
        </label>
        <div class="form-error hidden" data-income-error role="alert"></div>
      </form>`,
    footer: `
      <button class="btn btn-secondary" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="button" data-save-income>Save income</button>`,
    onMount(backdrop, close) {
      const form = backdrop.querySelector("#income-form");
      const status = form.elements.status;
      const errorBox = backdrop.querySelector("[data-income-error]");
      const creditedField = backdrop.querySelector("[data-credited-field]");
      const pendingField = backdrop.querySelector("[data-pending-field]");
      const saveButton = backdrop.querySelector("[data-save-income]");
      const syncDates = () => {
        const credited = status.value === "credited";
        creditedField.classList.toggle("hidden", !credited);
        pendingField.classList.toggle("hidden", credited);
      };
      status.addEventListener("change", syncDates);
      syncDates();

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        saveButton.click();
      });
      saveButton.addEventListener("click", async () => {
        errorBox.classList.add("hidden");
        const payload = {
          investment_id: Number(form.elements.investment_id.value),
          kind: form.elements.kind.value,
          amount: form.elements.amount.value,
          status: status.value,
          credited_date: status.value === "credited" ? form.elements.credited_date.value : "",
          due_date: status.value === "pending" ? form.elements.due_date.value : "",
          notes: form.elements.notes.value,
        };
        saveButton.disabled = true;
        saveButton.innerHTML = `<span class="spinner"></span> Saving…`;
        try {
          await api("/incomes", { method: "POST", body: payload });
          close();
          toast("Income entry saved", "ok");
          await refreshDashboard();
        } catch (error) {
          const errors = error.data?.errors;
          errorBox.textContent = errors ? Object.values(errors).join(" · ") : error.message;
          errorBox.classList.remove("hidden");
          saveButton.disabled = false;
          saveButton.textContent = "Save income";
        }
      });
    },
  });
}

async function markIncomeCredited(id) {
  try {
    const data = await api(`/incomes/${id}/status`, { method: "POST", body: { status: "credited" } });
    toast(`${inr2(data.income.amount)} marked as received`, "ok");
    await refreshDashboard();
  } catch (error) {
    toast(error.message, "error");
    await refreshDashboard();
  }
}

async function deleteIncomeEntry(id) {
  const item = (state.income?.items || []).find((row) => row.id === id);
  const ok = await confirmDialog({
    title: "Delete this income entry?",
    message: item
      ? `Removes the ${esc(item.kind_label.toLowerCase())} entry of ${inr2(item.amount)} for ${esc(item.investment)}. The holding itself is not changed.`
      : "This income entry will be removed. The holding itself is not changed.",
  });
  if (!ok) return;
  try {
    const result = await api(`/incomes/${id}`, { method: "DELETE" });
    toast("Income entry deleted — 30 days in Recently deleted", "ok", undoAction(result?.trash_id));
    await refreshDashboard();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function loadIncomeYear(year) {
  const select = $("[data-income-year]");
  if (select) select.disabled = true;
  try {
    const data = await api(`/incomes?year=${encodeURIComponent(year)}`);
    state.income = data.income;
    state.incomeCal = { zoom: "year", month: null, day: null };
    if (state.view === "dashboard") renderDashboard();
    else if (state.view === "income") renderIncome();
  } catch (error) {
    toast(error.message, "error");
    if (select) select.disabled = false;
  }
}

async function fetchCorporateActions() {
  if (!isAdmin()) return;
  const [fy, span] = ($("#corp-window")?.value || "").split(":").map(Number);
  const query = fy && span ? `?fy=${fy}&span=${span}` : "";
  const button = $('[data-action="fetch-corporate"]');
  if (button) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> Checking NSE…`;
  }
  try {
    const data = await api(`/corporate-actions${query}`);
    state.corporate = data.result;
    if (!data.result.items.length) {
      toast(data.result.message || "No new dividend or bonus actions found", "warn");
      (data.result.errors || []).slice(0, 1).forEach((message) => toast(message, "warn"));
      return;
    }
    openCorporateModal(data.result);
  } catch (error) {
    toast(error.message, "error");
  } finally {
    if (button && document.body.contains(button)) {
      button.disabled = false;
      button.innerHTML = `${icon("refresh")} Fetch actions`;
    }
  }
}

function openCorporateModal(result) {
  const items = result.items || [];
  const range = result.window || {};
  const warnings = result.errors || [];
  openModal({
    title: "Review corporate actions",
    subtitle: `${items.length} action${items.length === 1 ? "" : "s"} found between ${fmtDate(range.from)} and ${fmtDate(range.to)}.`,
    body: `
      <div class="corp-summary">
        <div><span>Dividend credits</span><strong>${result.dividend_count} · ${inr2(result.dividend_amount)}</strong></div>
        <div><span>Bonus / splits</span><strong>${result.bonus_count}</strong></div>
        <div><span>Lookback</span><strong>${esc(range.label || "This financial year")}</strong></div>
      </div>
      ${warnings.length ? `<div class="info-strip warn" style="margin-bottom:12px">${icon("alert", "sm")}<span>${warnings.map(esc).join(" · ")}</span></div>` : ""}
      <div class="corp-list-head">
        <label class="check-inline"><input type="checkbox" data-corp-all checked> Select all</label>
        <span class="muted">Dividends go to the checklist. Bonus and split actions change quantity immediately.</span>
      </div>
      <div class="table-wrap corp-pick-wrap">
        <table class="mini-table corp-table">
          <thead><tr><th></th><th>Holding</th><th>Action</th><th>Ex-date</th><th class="num">Effect</th><th>Source</th></tr></thead>
          <tbody>
            ${items.map((item, index) => `
              <tr>
                <td><input type="checkbox" data-corp-pick="${index}" checked aria-label="Apply ${esc(item.label)} for ${esc(item.investment)}"></td>
                <td>
                  <div class="cell-name">${esc(item.investment)}</div>
                  <div class="cell-sub">${esc(item.owner)} · ${nf(2).format(item.quantity)} ${item.type === "etf" ? "units" : "shares"} · ${esc(item.symbol)}</div>
                </td>
                <td>
                  <span class="pill ${item.kind === "dividend" ? "pill-ok" : "pill-warn"}">${esc(item.label)}</span>
                  <div class="cell-sub">${esc(item.detail)}</div>
                </td>
                <td>${fmtDate(item.ex_date)}</td>
                <td class="num">${item.kind === "dividend"
                  ? `${inr2(item.effect)}<div class="cell-sub">cash credit</div>`
                  : `${nf(2).format(item.quantity)} → ${nf(2).format(item.new_quantity)}<div class="cell-sub">new quantity</div>`}</td>
                <td><span class="pill pill-muted">${esc(item.source)}</span></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>
      <div class="info-strip" style="margin-top:12px">${icon("info", "sm")}<span>Bonus shares already reflected in your brokerage holdings should be left unticked. Dividends stay pending until you confirm the bank credit.</span></div>`,
    footer: `
      <button class="btn btn-secondary" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="button" data-apply-corp>Apply selected</button>`,
    onMount(backdrop, close) {
      const applyButton = backdrop.querySelector("[data-apply-corp]");
      const selectAll = backdrop.querySelector("[data-corp-all]");
      const picks = () => $$("[data-corp-pick]", backdrop);
      const chosen = () => picks().filter((box) => box.checked);
      const sync = () => {
        const count = chosen().length;
        applyButton.disabled = count === 0;
        applyButton.textContent = count ? `Apply ${count} action${count === 1 ? "" : "s"}` : "Apply selected";
        selectAll.checked = count === picks().length;
        selectAll.indeterminate = count > 0 && count < picks().length;
      };
      selectAll.addEventListener("change", () => {
        picks().forEach((box) => { box.checked = selectAll.checked; });
        sync();
      });
      picks().forEach((box) => box.addEventListener("change", sync));
      sync();

      applyButton.addEventListener("click", async () => {
        const selected = chosen().map((box) => items[Number(box.dataset.corpPick)]);
        if (!selected.length) return;
        applyButton.disabled = true;
        applyButton.innerHTML = `<span class="spinner"></span> Applying…`;
        try {
          const data = await api("/corporate-actions/apply", { method: "POST", body: { items: selected } });
          const result = data.result;
          const parts = [];
          if (result.dividends) parts.push(`${result.dividends} dividend${result.dividends === 1 ? "" : "s"} (${inr2(result.dividend_amount)})`);
          if (result.bonuses) parts.push(`${result.bonuses} bonus/split${result.bonuses === 1 ? "" : "s"}`);
          close();
          toast(parts.length ? `Applied ${parts.join(" and ")}` : "Nothing new to apply", parts.length ? "ok" : "warn");
          await refreshDashboard();
        } catch (error) {
          toast(error.message, "error");
          applyButton.disabled = false;
          applyButton.textContent = "Apply selected";
        }
      });
    },
  });
}

/* ============================================================
   Investments list
   ============================================================ */

function fxList(value) {
  if (Array.isArray(value)) return value.map(String).filter((v) => v !== "");
  if (value === undefined || value === null || value === "") return [];
  return [String(value)];
}
function fxMatch(value, selected) {
  const list = fxList(selected);
  return !list.length || list.includes(String(value ?? ""));
}
function fxBrokerMatch(item, selected) {
  const list = fxList(selected);
  if (!list.length) return true;
  const broker = item.broker || "";
  return broker ? list.includes(broker) : list.includes("__none__");
}
function fxActive(key) {
  return fxList(state.filters[key]).length > 0;
}
function fxActiveCount() {
  return ["category", "type", "owner", "broker"].filter(fxActive).length;
}
function fxSearchHit(item, needle) {
  const haystack = [item.name, item.owner, item.type_label, item.notes, ...Object.values(item.details || {})]
    .join(" ").toLowerCase();
  return haystack.includes(needle);
}
function fxFacetMatch(item, skip = []) {
  const f = state.filters;
  if (!skip.includes("category") && !fxMatch(item.category, f.category)) return false;
  if (!skip.includes("type") && !fxMatch(item.type, f.type)) return false;
  if (!skip.includes("owner") && !fxMatch(item.owner_id, f.owner)) return false;
  if (!skip.includes("broker") && !fxBrokerMatch(item, f.broker)) return false;
  return true;
}

function filteredInvestments() {
  const f = state.filters;
  let items = state.investments.slice();
  items = items.filter((i) => fxFacetMatch(i));
  if (f.q) {
    const needle = f.q.toLowerCase();
    items = items.filter((i) => fxSearchHit(i, needle));
  }
  const sorters = {
    name: (i) => i.name.toLowerCase(),
    invested: (i) => i.invested_amount,
    current: (i) => i.display_value,
    gain: (i) => i.display_gain,
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

function fxButton(key, label) {
  const active = key === "all"
    ? fxActiveCount() > 0
    : (key === "details"
      ? fxActive("category") || fxActive("type")
      : fxActive(key));
  return `<button class="fx-btn ${active ? "is-active" : ""}" type="button" data-action="open-filter" data-fcol="${key}" title="Filter by ${label}" aria-label="Filter by ${label}" aria-haspopup="dialog">${icon("filter", "sm")}</button>`;
}

function renderInvestments() {
  closeHeaderFilter();
  const all = state.investments;
  const f = state.filters;
  const owners = new Set(all.map((i) => i.owner_id)).size;
  const active = fxActiveCount();

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
        <input id="inv-search" type="search" placeholder="Search by name, owner, broker…" value="${esc(f.q)}" aria-label="Search investments">
      </div>
      <div class="toolbar-right">
        <button class="btn btn-secondary btn-sm fx-top ${active ? "is-active" : ""}" type="button" data-action="open-filter" data-fcol="all">${icon("filter")} Filters${active ? ` <span class="fx-count">${active}</span>` : ""}</button>
        <div class="segmented" role="group" aria-label="Group holdings">
          <button class="seg ${state.layout === "flat" ? "active" : ""}" type="button" data-action="layout" data-layout="flat">All holdings</button>
          <button class="seg ${state.layout === "member" ? "active" : ""}" type="button" data-action="layout" data-layout="member">By member</button>
        </div>
        <select class="select-compact" id="inv-sort" data-filter="sort" aria-label="Sort holdings">
          <option value="updated" ${f.sort === "updated" ? "selected" : ""}>Recently updated</option>
          <option value="current" ${f.sort === "current" ? "selected" : ""}>Highest value</option>
          <option value="gain" ${f.sort === "gain" ? "selected" : ""}>Highest gain</option>
          <option value="invested" ${f.sort === "invested" ? "selected" : ""}>Most invested</option>
          <option value="name" ${f.sort === "name" ? "selected" : ""}>Name A–Z</option>
          <option value="date" ${f.sort === "date" ? "selected" : ""}>Purchase date</option>
        </select>
        ${active ? `<button class="btn btn-ghost btn-sm" type="button" data-action="clear-filters">Clear filters</button>` : ""}
      </div>
    </div>

    <div id="bulk-bar" class="bulk-bar hidden" role="status"></div>

    ${folioPanelHtml(collectFolios(all))}

    <div class="card table-card inv-table-card">
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              ${isAdmin() ? `<th class="select-cell"><input type="checkbox" id="select-all" aria-label="Select all holdings"></th>` : ""}
              <th class="sortable" data-action="sort" data-sort="name">Holding ${sortIndicator("name")}${fxButton("broker", "broker")}</th>
              <th class="hide-sm">Key details${fxButton("details", "type or category")}</th>
              <th class="hide-sm sortable" data-action="sort" data-sort="owner">Owner ${sortIndicator("owner")}${fxButton("owner", "member")}</th>
              <th class="num sortable" data-action="sort" data-sort="invested">Invested ${sortIndicator("invested")}</th>
              <th class="num sortable" data-action="sort" data-sort="current">Current ${sortIndicator("current")}</th>
              <th class="num sortable" data-action="sort" data-sort="gain">Gain ${sortIndicator("gain")}</th>
              <th class="actions-cell"></th>
            </tr>
          </thead>
          <tbody id="inv-body"></tbody>
        </table>
      </div>
      <div class="inv-cards" id="inv-cards"></div>
      <div class="table-foot" id="inv-foot"></div>
      <p class="ledger-note">Current value includes interest accrued to date for cumulative deposits and bonds; holdings that pay interest out show the principal only.</p>
    </div>
  `;
  hydrateIcons($("#view"));
  updateInvestmentsTable();
}

const FX_COLUMNS = {
  broker: { title: "Holding", groups: ["broker"] },
  details: { title: "Key details", groups: ["category", "type"] },
  owner: { title: "Owner", groups: ["owner"] },
  all: { title: "All filters", groups: ["category", "type", "owner", "broker"] },
};

let fxPop = null;

function fxGroupsFor(keys) {
  const base = state.investments.filter((i) => fxFacetMatch(i, keys))
    .filter((i) => !state.filters.q || fxSearchHit(i, state.filters.q.toLowerCase()));
  const meta = state.meta || {};
  const groups = [];
  if (keys.includes("category")) {
    const order = ["equity", "debt", "other"];
    const present = order.filter((key) => base.some((i) => i.category === key));
    groups.push({
      key: "category",
      title: "Category",
      values: present.map((key) => ({
        value: key,
        label: categoryMeta(key).label,
        count: base.filter((i) => i.category === key).length,
      })),
    });
  }
  if (keys.includes("type")) {
    const types = (meta.types || []).map((t) => t.key);
    const values = types
      .map((key) => ({
        value: key,
        label: (meta.types.find((t) => t.key === key) || {}).label || key,
        count: base.filter((i) => i.type === key).length,
      }))
      .filter((v) => v.count > 0);
    groups.push({ key: "type", title: "Type", values });
  }
  if (keys.includes("owner")) {
    const values = (state.members || [])
      .map((m) => ({
        value: String(m.id),
        label: m.name,
        count: base.filter((i) => String(i.owner_id) === String(m.id)).length,
      }))
      .filter((v) => v.count > 0);
    groups.push({ key: "owner", title: "Member", values });
  }
  if (keys.includes("broker")) {
    const names = [...new Set(base.map((i) => i.broker || ""))].sort((a, b) =>
      (a || "~").localeCompare(b || "~"));
    const values = names.map((name) => ({
      value: name || "__none__",
      label: name || "No broker",
      count: base.filter((i) => (i.broker || "") === name).length,
    }));
    groups.push({ key: "broker", title: "Broker", values });
  }
  return groups.filter((group) => group.values.length);
}

function closeHeaderFilter() {
  if (fxPop) {
    fxPop.remove();
    fxPop = null;
  }
  document.querySelectorAll(".fx-btn.is-open").forEach((btn) => btn.classList.remove("is-open"));
}

function fxGroupHtml(group) {
  const selected = fxList(state.filters[group.key]).map(String);
  const rows = group.values.map((v) => `
    <label class="fx-row" data-text="${esc(String(v.label).toLowerCase())}">
      <input type="checkbox" data-fx-val="${esc(v.value)}" ${selected.includes(String(v.value)) ? "checked" : ""}>
      <span>${esc(v.label)}</span><em>${v.count}</em>
    </label>`).join("");
  const all = group.values.every((v) => selected.includes(String(v.value)));
  return `
    <div class="fx-group" data-key="${group.key}">
      ${group.title ? `<div class="fx-group-title">${esc(group.title)}</div>` : ""}
      <label class="fx-all"><input type="checkbox" data-fx-all ${all ? "checked" : ""}><span>Select all</span><em>${group.values.reduce((n, v) => n + v.count, 0)}</em></label>
      <div class="fx-list">${rows}</div>
    </div>`;
}

function fxSyncAll(groupEl) {
  const boxes = [...groupEl.querySelectorAll(".fx-row:not(.hidden) input[data-fx-val]")];
  const all = groupEl.querySelector("input[data-fx-all]");
  if (!boxes.length || !all) return;
  const checked = boxes.filter((box) => box.checked).length;
  all.checked = checked === boxes.length;
  all.indeterminate = checked > 0 && checked < boxes.length;
}

function openHeaderFilter(button) {
  const key = button.dataset.fcol || "all";
  const conf = FX_COLUMNS[key] || FX_COLUMNS.all;
  closeHeaderFilter();
  const groups = fxGroupsFor(conf.groups);
  fxPop = document.createElement("div");
  fxPop.className = "fx-pop";
  fxPop.dataset.col = key;
  fxPop.setAttribute("role", "dialog");
  fxPop.setAttribute("aria-label", `Filter ${conf.title}`);
  fxPop.innerHTML = `
    <div class="fx-head">
      <strong>Filter · ${esc(conf.title)}</strong>
      <button class="fx-x" type="button" aria-label="Close">${icon("close", "sm")}</button>
    </div>
    <label class="fx-search">${icon("search", "sm")}<input type="search" placeholder="Search values…" aria-label="Search filter values"></label>
    ${groups.length ? groups.map(fxGroupHtml).join("") : `<p class="fx-empty muted">No values to filter here.</p>`}
    <div class="fx-foot">
      <button class="btn btn-ghost btn-sm" type="button" data-fx-clear>Clear</button>
      <button class="btn btn-primary btn-sm" type="button" data-fx-apply>Apply</button>
    </div>`;
  document.body.appendChild(fxPop);
  hydrateIcons(fxPop);
  button.classList.add("is-open");

  const rect = button.getBoundingClientRect();
  const width = fxPop.offsetWidth;
  const height = fxPop.offsetHeight;
  fxPop.style.left = `${Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8))}px`;
  const below = rect.bottom + 6;
  const top = below + height > window.innerHeight - 8
    ? Math.max(8, window.innerHeight - height - 8)
    : below;
  fxPop.style.top = `${top}px`;
  fxPop.style.maxHeight = `${Math.max(180, window.innerHeight - top - 8)}px`;

  fxPop.querySelectorAll(".fx-group").forEach(fxSyncAll);
  fxPop.querySelector(".fx-x").addEventListener("click", closeHeaderFilter);
  const search = fxPop.querySelector(".fx-search input");
  search.addEventListener("input", () => {
    const needle = search.value.trim().toLowerCase();
    fxPop.querySelectorAll(".fx-group").forEach((groupEl) => {
      groupEl.querySelectorAll(".fx-row").forEach((row) => {
        row.classList.toggle("hidden", Boolean(needle) && !row.dataset.text.includes(needle));
      });
      fxSyncAll(groupEl);
    });
  });
  fxPop.querySelectorAll(".fx-group").forEach((groupEl) => {
    groupEl.querySelector("input[data-fx-all]").addEventListener("change", (event) => {
      groupEl.querySelectorAll(".fx-row:not(.hidden) input[data-fx-val]").forEach((box) => {
        box.checked = event.target.checked;
      });
      fxSyncAll(groupEl);
    });
    groupEl.querySelectorAll("input[data-fx-val]").forEach((box) => {
      box.addEventListener("change", () => fxSyncAll(groupEl));
    });
  });
  fxPop.querySelector("[data-fx-apply]").addEventListener("click", () => {
    groups.forEach((group) => {
      state.filters[group.key] = [...fxPop.querySelectorAll(`.fx-group[data-key="${group.key}"] input[data-fx-val]:checked`)]
        .map((box) => box.dataset.fxVal);
    });
    renderInvestments();
  });
  fxPop.querySelector("[data-fx-clear]").addEventListener("click", () => {
    groups.forEach((group) => { state.filters[group.key] = []; });
    renderInvestments();
  });
  search.focus({ preventScroll: true });
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
  } else if (state.layout === "member") {
    const cols = isAdmin() ? 8 : 7;
    body.innerHTML = investmentsByMember(items).map((group) => groupHtml(group, cols)).join("");
  } else {
    body.innerHTML = items.map((item) => investmentRowHtml(item)).join("");
  }
  hydrateIcons(body);

  const cards = $("#inv-cards");
  if (cards) {
    if (!items.length) {
      cards.innerHTML = `
        <div class="empty" style="padding:36px 12px">
          <h3>No holdings match</h3>
          <p>Try a different search or clear the filters.</p>
          <div class="actions"><button class="btn btn-secondary btn-sm" type="button" data-action="clear-filters">Clear filters</button></div>
        </div>`;
    } else if (state.layout === "member") {
      cards.innerHTML = investmentsByMember(items).map(investmentCardGroupHtml).join("");
    } else {
      cards.innerHTML = items.map(investmentCardHtml).join("");
    }
    hydrateIcons(cards);
  }
  syncSelectionBar(items);

  const invested = items.reduce((s, i) => s + i.invested_amount, 0);
  const current = items.reduce((s, i) => s + i.display_value, 0);
  const gain = current - invested;
  $("#inv-foot").innerHTML = `
    <span>Showing <strong>${items.length}</strong> of ${state.investments.length} holdings</span>
    <span>Invested <strong>${inr(invested)}</strong> · Value <strong>${inr(current)}</strong> · Gain
      <strong style="color:${gain >= 0 ? "var(--ok)" : "var(--bad)"}">${gain >= 0 ? "+" : "−"}${inr(Math.abs(gain))}</strong>
    </span>`;
}

function investmentRowHtml(item) {
  const admin = isAdmin();
  const selected = state.selected.has(item.id);
  return `
    <tr data-investment-id="${item.id}" class="${selected ? "selected" : ""}">
      ${admin ? `<td class="select-cell"><input type="checkbox" data-select-id="${item.id}" ${selected ? "checked" : ""} aria-label="Select ${esc(item.name)}"></td>` : ""}
      <td class="name-cell">
        <div class="holding-name">${holdingBadge(item)}<strong>${esc(item.name)}</strong></div>
        <div class="sub"><span class="cat-dot cat-${item.category}"></span>${esc(item.type_label)}${item.broker ? ` · <span class="sub-broker">${brokerBadge(item.broker, "sm")}${esc(item.broker)}</span>` : ""}</div>
      </td>
      <td class="details-cell hide-sm">${detailSummary(item)}</td>
      <td class="hide-sm">
        <div style="display:flex;align-items:center;gap:8px">
          ${avatar(item.owner, "sm")}
          <span style="font-size:12.5px">${esc(item.owner)}</span>
        </div>
      </td>
      <td class="num">${inr(item.invested_amount)}</td>
      <td class="num">${inr(item.display_value)}</td>
      <td class="num">${gainCell(item.display_gain, item.display_gain_pct)}</td>
      <td class="actions-cell">
        ${admin ? `
          <button class="icon-btn" type="button" data-action="edit-investment" data-id="${item.id}" title="Edit ${esc(item.name)}" aria-label="Edit ${esc(item.name)}">${icon("edit", "sm")}</button>
          <button class="icon-btn danger" type="button" data-action="delete-investment" data-id="${item.id}" title="Delete ${esc(item.name)}" aria-label="Delete ${esc(item.name)}">${icon("trash", "sm")}</button>
        ` : `<span class="row-chev">${icon("chevronRight", "sm")}</span>`}
      </td>
    </tr>`;
}

function investmentCardHtml(item) {
  const positive = item.display_gain >= 0;
  return `
    <article class="inv-card" data-investment-id="${item.id}" role="button" tabindex="0" aria-label="Open ${esc(item.name)}">
      <div class="inv-card-top">
        <div class="inv-card-name">
          <span class="inv-card-title">${issuerBadge(item)}<strong>${esc(item.name)}</strong></span>
          <span class="inv-card-type"><span class="cat-dot cat-${item.category}"></span>${esc(item.type_label)}</span>
        </div>
        <div class="inv-card-value">
          <strong>${inr(item.display_value)}</strong>
          <span class="pill ${positive ? "pill-ok" : "pill-bad"}">${pctText(item.display_gain_pct)}</span>
        </div>
      </div>
      <div class="inv-card-meta">
        <span class="inv-card-owner">${avatar(item.owner, "sm")}${esc(item.owner)}</span>
        ${item.broker ? `<span class="inv-broker">${brokerBadge(item.broker)}${esc(item.broker)}</span>` : ""}
        <span>Invested ${inr(item.invested_amount)}</span>
        ${item.maturity_date ? `<span>Matures ${fmtDate(item.maturity_date)}</span>` : ""}
        <span style="color:${positive ? "var(--ok)" : "var(--bad)"};font-weight:650">${positive ? "+" : "−"}${inr(Math.abs(item.display_gain))}</span>
      </div>
    </article>`;
}

function investmentCardGroupHtml(group) {
  const invested = group.items.reduce((sum, item) => sum + (Number(item.invested_amount) || 0), 0);
  const value = group.items.reduce((sum, item) => sum + (Number(item.display_value) || 0), 0);
  const gain = value - invested;
  return `
    <section class="inv-group">
      <header class="inv-group-head group-head">
        <div class="cell-person">
          ${avatar(group.member.name, "sm")}
          <div>
            <div class="cell-name">${esc(group.member.name)}</div>
            <div class="cell-sub">${group.items.length} holding${group.items.length === 1 ? "" : "s"}</div>
          </div>
        </div>
        <div class="group-figures">
          <span>Invested <strong>${compactMoney(invested)}</strong></span>
          <span>Value <strong>${compactMoney(value)}</strong></span>
          <span style="color:${gain >= 0 ? "var(--ok)" : "var(--bad)"}">${gain >= 0 ? "+" : "−"}${compactMoney(Math.abs(gain))}</span>
        </div>
      </header>
      ${group.items.length
        ? group.items.map(investmentCardHtml).join("")
        : `<p class="muted inv-group-empty">No holdings match for this member.</p>`}
    </section>`;
}

function investmentsByMember(items) {
  const ownerFilter = fxList(state.filters.owner).map(String);
  const buckets = new Map();
  state.members.forEach((member) => {
    if (!member) return;
    const id = String(member.id);
    if (ownerFilter.length && !ownerFilter.includes(id)) return;
    buckets.set(id, { member, items: [] });
  });
  items.forEach((item) => {
    const id = String(item.owner_id);
    if (!buckets.has(id)) {
      buckets.set(id, { member: { id: item.owner_id, name: item.owner }, items: [] });
    }
    buckets.get(id).items.push(item);
  });
  const valueOf = (group) => group.items.reduce((sum, item) => sum + (Number(item.display_value) || 0), 0);
  const groups = [...buckets.values()].filter((group) => group.items.length || ownerFilter.includes(String(group.member.id)));
  return groups.sort(
    (a, b) => valueOf(b) - valueOf(a) || String(a.member.name).localeCompare(String(b.member.name)),
  );
}

function groupHtml(group, cols) {
  const invested = group.items.reduce((sum, item) => sum + (Number(item.invested_amount) || 0), 0);
  const value = group.items.reduce((sum, item) => sum + (Number(item.display_value) || 0), 0);
  const gain = value - invested;
  return `
    <tr class="group-row">
      <td colspan="${cols}">
        <div class="group-head">
          <div class="cell-person">
            ${avatar(group.member.name, "sm")}
            <div>
              <div class="cell-name">${esc(group.member.name)}</div>
              <div class="cell-sub">${group.items.length} holding${group.items.length === 1 ? "" : "s"}</div>
            </div>
          </div>
          <div class="group-figures">
            <span>Invested <strong>${compactMoney(invested)}</strong></span>
            <span>Value <strong>${compactMoney(value)}</strong></span>
            <span style="color:${gain >= 0 ? "var(--ok)" : "var(--bad)"}">${gain >= 0 ? "+" : "−"}${compactMoney(Math.abs(gain))}</span>
          </div>
        </div>
      </td>
    </tr>
    ${group.items.length
      ? group.items.map((item) => investmentRowHtml(item)).join("")
      : `<tr class="group-empty"><td colspan="${cols}"><span class="muted">No holdings match for this member.</span></td></tr>`}`;
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
    <button class="btn btn-secondary btn-sm" type="button" data-action="bulk-broker">${icon("building")} Set broker</button>
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

/* ---- Customer folios: deposits a company maps to one customer ID ---- */

function collectFolios(items) {
  const groups = new Map();
  (items || []).forEach((item) => {
    const customerId = String(item.details?.customer_id || "").trim();
    if (!customerId) return;
    const company = String(item.details?.company_name || item.details?.bank || "").trim();
    const key = `${company.toLowerCase()}::${customerId.toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, { key, customerId, company, items: [], invested: 0, value: 0 });
    }
    const group = groups.get(key);
    group.items.push(item);
    group.invested += Number(item.invested_amount) || 0;
    group.value += Number(item.display_value) || 0;
  });
  return [...groups.values()].sort((a, b) => b.value - a.value);
}

function folioPanelHtml(folios) {
  if (!folios.length) return "";
  return `
    <section class="card card-pad folio-card">
      <div class="card-head">
        <div>
          <div class="card-title">Customer folios</div>
          <div class="card-sub">Deposits grouped under one customer ID — open a folio for the breakup</div>
        </div>
      </div>
      <div class="folio-grid">
        ${folios.map((folio) => `
          <button type="button" class="folio-tile" data-action="open-folio" data-folio="${esc(folio.key)}">
            <span class="folio-id">${esc(folio.customerId)}</span>
            <span class="folio-company">${esc(folio.company || "—")}</span>
            <span class="folio-meta">${folio.items.length} deposit${folio.items.length === 1 ? "" : "s"} · ${compactMoney(folio.value)}</span>
            <span class="folio-sub">Invested ${compactMoney(folio.invested)}</span>
          </button>`).join("")}
      </div>
    </section>`;
}

function openFolioDrawer(key) {
  const folio = collectFolios(state.investments).find((f) => f.key === key);
  if (!folio) return;
  const gain = folio.value - folio.invested;
  const gainPct = folio.invested ? (gain / folio.invested) * 100 : 0;
  const rows = folio.items.slice()
    .sort((a, b) => String(a.start_date || "").localeCompare(String(b.start_date || "")))
    .map((item) => `
      <tr data-investment-id="${item.id}">
        <td class="name-cell">
          <strong>${esc(item.name)}</strong>
          <div class="sub">${esc(item.type_label)} · ${esc(item.owner)}</div>
        </td>
        <td>${fmtDate(item.start_date)}</td>
        <td class="num">${inr(item.invested_amount)}</td>
        <td class="num">${inr(item.display_value)}</td>
      </tr>`).join("");
  openDrawer(`
    <div class="drawer-head">
      <div class="dh-logo">${issuerBadgeFromName(folio.company || "", "xl")}</div>
      <div class="dh-main">
        <h3>Customer ID ${esc(folio.customerId)}</h3>
        <div class="dh-sub"><span class="chip">${esc(folio.company || "—")}</span><span>${folio.items.length} deposit${folio.items.length === 1 ? "" : "s"}</span></div>
      </div>
      <button class="icon-btn" type="button" data-drawer-close aria-label="Close">${icon("close")}</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-hero">
        <div class="dh-label">Value under this folio</div>
        <div class="dh-value">${inr2(folio.value)}</div>
        <div class="dh-row">
          <div class="dh-item"><div class="k">Invested</div><div class="v">${inr2(folio.invested)}</div></div>
          <div class="dh-item"><div class="k">Gain / loss</div><div class="v" style="color:${gain >= 0 ? "var(--ok)" : "var(--bad)"}">${gain >= 0 ? "+" : "−"}${inr2(Math.abs(gain))}</div></div>
          <div class="dh-item"><div class="k">Return</div><div class="v" style="color:${gain >= 0 ? "var(--ok)" : "var(--bad)"}">${pctText(gainPct)}</div></div>
        </div>
      </div>
      <div class="section-label">Breakup</div>
      <div class="table-wrap">
        <table class="table" style="min-width:0">
          <thead><tr><th>Deposit</th><th>Date</th><th class="num">Principal</th><th class="num">Value</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="muted" style="font-size:12px;margin-top:8px">Each deposit stands on its own — a fresh contribution is added as a separate deposit, never merged into an existing one.</p>
    </div>`);
}


/* ============================================================
   Investment drawer
   ============================================================ */

function investmentIncomeHtml(item) {
  const inc = state.income;
  if (!inc) return "";
  const items = (inc.items || []).filter((row) => row.investment_id === item.id);
  const credited = items.filter((row) => row.status === "credited").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const pending = items.filter((row) => row.status === "pending");
  const label = inc.year_label || fyLabel(inc.year);
  return `
    <div class="section-label">Income · ${esc(label)}</div>
    <div class="drawer-income">
      <div class="drawer-income-stats">
        <div><span>Credited</span><strong>${inr2(credited)}</strong></div>
        <div><span>Pending</span><strong>${inr2(pending.reduce((sum, row) => sum + Number(row.amount || 0), 0))}</strong></div>
      </div>
      ${items.length ? `<div class="drawer-income-list">
        ${items.slice(0, 6).map((row) => `
          <div class="drawer-income-row">
            <span class="entry-kind" style="background:${safeColor(row.kind_color)}22;color:${safeColor(row.kind_color)}">${esc(row.kind_label)}</span>
            <span class="dim">${row.status === "credited" ? `credited ${fmtDate(row.credited_date)}` : `expected ${fmtDate(row.due_date)}`}</span>
            <strong>${inr2(row.amount)}</strong>
          </div>`).join("")}
      </div>` : `<p class="muted small">No income recorded for this holding yet.</p>`}
      ${isAdmin() ? `<button class="btn btn-secondary btn-block" type="button" data-action="record-income" data-id="${item.id}" style="margin-top:10px">${icon("plus")} Record income</button>` : ""}
    </div>`;
}

function transactionsSectionHtml(item) {
  if (!TXN_TYPES.has(item.type)) return "";
  const rows = item.transactions || [];
  const admin = isAdmin();
  const signed = (value) => value == null ? "—" : `${value >= 0 ? "+" : "−"}${inr2(Math.abs(value))}`;
  const tone = (value) => value == null ? "inherit" : value >= 0 ? "var(--ok)" : "var(--bad)";
  const actions = admin ? `
    <div class="txn-actions">
      <button class="btn btn-secondary btn-block btn-sm" type="button" data-action="txn-import" data-id="${item.id}">${icon("upload")} Import broker trade report</button>
      <input type="file" id="txn-file-${item.id}" accept=".xlsx,.xlsm,.csv,.pdf" hidden>
    </div>` : "";
  const hint = `<p class="txn-hint">Kotak Neo → <strong>Transaction Statement</strong> as <strong>CSV</strong> or <strong>PDF</strong> (covers every scrip at once) or <strong>Portfolio Tracker</strong> per holding as <strong>Excel</strong>, or ICICI Direct → <strong>Transaction Statement</strong> as <strong>PDF</strong>. Use a date range that covers every trade. Re-importing is safe — duplicate rows are skipped, even if they came in from the other format. To file a whole statement in one go, use Import &amp; export → <strong>Import a broker trade statement</strong>.</p>`;
  if (!rows.length) {
    return `<div class="section-label">Transactions</div>
      <div class="txn-card">
        <p class="muted small" style="margin:0">Import a broker trade report — Kotak "Transaction Statement" CSV or PDF, "Portfolio Tracker" Excel, or ICICI "Transaction Statement" PDF — to see every trade here, with realised (FIFO) and unrealised gains.</p>
        ${actions}
        ${hint}
      </div>`;
  }
  const list = rows.map((row) => {
    const sell = row.kind === "sell";
    return `<div class="txn-row">
      <div class="txn-main">
        <span class="txn-chip ${sell ? "sell" : "buy"}">${sell ? "SELL" : "BUY"}</span>
        <span class="txn-date">${fmtDate(row.trade_date)}</span>
        <span class="txn-qty">${nf(4).format(row.quantity)} × ${inr2(row.price)}</span>
      </div>
      <div class="txn-side">
        <span class="txn-value">${inr2(row.value)}</span>
        ${sell ? `<span class="txn-realized" style="color:${tone(row.realized)}">${signed(row.realized)}</span>` : ""}
        ${admin ? `<button class="icon-btn txn-del" type="button" data-action="txn-delete" data-id="${row.id}" data-investment="${item.id}" title="Remove this transaction" aria-label="Remove this transaction">${icon("trash")}</button>` : ""}
      </div>
    </div>`;
  }).join("");
  return `<div class="section-label">Transactions <span class="section-count">${rows.length}</span></div>
    <div class="txn-card">
      <div class="txn-summary">
        <div><span>Realised · FIFO</span><strong style="color:${tone(item.realized_gain)}">${signed(item.realized_gain)}</strong></div>
        <div><span>Unrealised</span><strong style="color:${tone(item.unrealized_gain)}">${signed(item.unrealized_gain)}</strong></div>
        ${item.txn_remaining_qty != null ? `<div><span>Units in history</span><strong>${nf(4).format(item.txn_remaining_qty)}</strong></div>` : ""}
      </div>
      ${!item.txn_qty_matches ? `<div class="txn-warn">History holds ${nf(4).format(item.txn_remaining_qty || 0)} units but the holding records ${item.txn_held_qty == null ? "no quantity" : nf(4).format(item.txn_held_qty)}. Unrealised gain is shown only when they agree.</div>` : ""}
      ${item.txn_incomplete ? `<div class="txn-warn">A sell exceeds the units bought in this history, so realised gain covers only the matched lots.</div>` : ""}
      <div class="txn-list">${list}</div>
      ${actions}
      ${hint}
    </div>`;
}

function openInvestmentDrawer(id) {
  const item = state.investments.find((i) => i.id === id);
  if (!item) return;
  const meta = typeMeta(item.type);
  const admin = isAdmin();
  const folio = item.details?.customer_id
    ? collectFolios(state.investments).find((f) => f.items.some((x) => x.id === item.id))
    : null;
  const hasTxns = (item.transactions_count || 0) > 0;
  const signedMoney = (value) => value == null ? "—" : `${value >= 0 ? "+" : "−"}${inr2(Math.abs(value))}`;
  const moneyColor = (value) => value >= 0 ? "var(--ok)" : "var(--bad)";
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
      <div class="dh-logo">${issuerBadge(item, "xl")}</div>
      <div class="dh-main">
        <h3>${esc(item.name)}</h3>
        <div class="dh-sub"><span class="chip">${typeBadge(item, "sm")}${esc(item.type_label)}</span>
        ${item.broker ? `<span class="dh-broker">${brokerBadge(item.broker)}${esc(item.broker)}</span>` : ""}
        <span>${esc(item.owner)}</span></div>
      </div>
      <button class="icon-btn" type="button" data-drawer-close aria-label="Close">${icon("close")}</button>
    </div>
    <div class="drawer-body">
      <div class="drawer-hero">
        <div class="dh-label">Current value</div>
        <div class="dh-value">${inr2(item.display_value)}</div>
        ${item.maturity_date ? `<div class="dh-maturity">
          <span>Matures ${fmtDate(item.maturity_date)}</span>
          ${item.maturity_value != null ? `<span class="dot">·</span><span>Maturity value <strong>${inr(item.maturity_value)}</strong></span>` : ""}
          <span class="dot">·</span><span>${esc(item.details?.maturity_instructions || "Payout")}</span>
        </div>` : ""}
        <div class="dh-row">
          <div class="dh-item"><div class="k">Invested</div><div class="v">${inr2(item.invested_amount)}</div></div>
          ${hasTxns ? `
          <div class="dh-item"><div class="k">Realised · FIFO</div><div class="v" style="color:${moneyColor(item.realized_gain)}">${signedMoney(item.realized_gain)}</div></div>
          <div class="dh-item"><div class="k">Unrealised</div><div class="v" style="color:${item.unrealized_gain == null ? "inherit" : moneyColor(item.unrealized_gain)}">${signedMoney(item.unrealized_gain)}</div></div>
          ` : `
          <div class="dh-item"><div class="k">Gain / loss</div><div class="v" style="color:${moneyColor(item.display_gain)}">${item.display_gain >= 0 ? "+" : "−"}${inr2(Math.abs(item.display_gain))}</div></div>
          `}
          <div class="dh-item"><div class="k">Return</div><div class="v" style="color:${moneyColor(item.display_gain)}">${pctText(item.display_gain_pct)}</div></div>
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
      ${investmentIncomeHtml(item)}
      ${transactionsSectionHtml(item)}
      ${folio && folio.items.length > 1 ? `
        <button class="btn btn-secondary btn-block" type="button" data-action="open-folio" data-folio="${esc(folio.key)}" style="margin-top:14px">
          View all ${folio.items.length} deposits under ${esc(folio.customerId)}
        </button>` : ""}
      ${item.type === "ppf" ? ppfLedgerHtml(item) : ""}
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
  const ownerId = existing?.owner_id || "";
  const ownerOptions = [
    `<option value="" ${ownerId ? "" : "selected"}>Select member…</option>`,
    ...members.map((m) => `<option value="${m.id}" ${String(ownerId) === String(m.id) ? "selected" : ""}>${esc(m.name)}</option>`),
  ].join("");

  const singleSource = meta.derive?.invested?.fields?.length === 1;
  const sourceLabel = singleSource
    ? meta.fields.find((f) => f.key === meta.derive.invested.fields[0])?.label || "the details above"
    : "";
  const deriveHint = singleSource
    ? `<span class="help">Filled from ${esc(sourceLabel)} above.</span>`
    : meta.derive
      ? `<span class="help">Auto-calculated from the details above. Type here to override.</span>`
      : meta.key === "ppf"
        ? `<span class="help">Auto-calculated from the contribution list below. Type here to override.</span>`
        : "";
  const valueHint = meta.key === "ppf"
    ? `<span class="help">Contributions plus interest at the rate above, credited on 31 March each year. Type here to override.</span>`
    : "";

  // Some types (mutual funds) name themselves only after the AMC/plan/option
  // selectors are chosen, so the name input is rendered inside the details grid.
  const inlineName = meta.name_after && meta.fields.some((f) => f.key === meta.name_after)
    ? meta.name_after
    : null;
  const nameLookup = meta.key === "mutual_funds" ? "scheme" : meta.key === "etf" ? "scrip" : "";
  const nameHint = nameLookup === "scheme"
    ? `<span class="help">Type 3+ letters to search AMFI's scheme list — pick Direct or Regular and Growth or IDCW in one click.</span>`
    : nameLookup === "scrip"
      ? `<span class="help">Type 3+ letters to search NSE ETF names — picking one fills the symbol.</span>`
      : "";
  const nameInputHtml = `
          <label class="field span-2">
            <span>${esc(meta.name_label || nameField.label || "Name")}<span class="req">*</span></span>
            ${nameLookup ? '<div class="scrip-picker">' : ""}
            <input type="text" name="name" maxlength="160" placeholder="${esc(meta.name_placeholder || "")}" value="${esc(existing?.name || "")}"${nameLookup ? ' autocomplete="off" spellcheck="false" aria-autocomplete="list" aria-expanded="false"' : ""}>
            ${nameLookup ? `<div class="scrip-suggest${nameLookup === "scheme" ? " scheme-suggest" : ""}" data-name-suggest hidden></div></div>` : ""}
            <span class="err" data-err="name"></span>
            ${nameHint}
          </label>`;

  return `
    <form id="inv-investment-form" novalidate>
      <div class="form-section">
        <div class="form-section-head"><h4>Holding</h4><p>${esc(meta.blurb || "")}</p></div>
        <div class="grid-2">
          ${inlineName ? "" : nameInputHtml}
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
          ${meta.fields.map((f) => renderFormField(f, details[f.key]) + (inlineName === f.key ? nameInputHtml : "")).join("")}
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
            ${valueHint}
          </label>
        </div>
      </div>
      ${meta.key === "ppf" ? `
      <div class="form-section">
        <div class="form-section-head"><h4>Contributions</h4><p>Each deposit earns interest from the month it lands; paid after the 5th, from the next month.</p></div>
        <div id="ppf-rows" class="ppf-rows"></div>
        <button class="btn btn-secondary btn-sm" type="button" id="ppf-add-row">${icon("plus")} Add contribution</button>
        <input type="hidden" name="transactions">
        <span class="err" data-err="transactions"></span>
      </div>` : ""}
    </form>`;
}

function dematOptionHtml(selected) {
  const accounts = state.meta?.demat_accounts || [];
  if (!accounts.length) return `<option value="">No demat account saved under Masters yet</option>`;
  const options = accounts.map((a) => {
    const label = a.owner ? `${a.owner} · ${a.display}` : a.display;
    return `<option value="${a.id}" ${String(a.id) === String(selected) ? "selected" : ""}>${esc(label)}</option>`;
  });
  return `<option value="">Select…</option>${options.join("")}`;
}

function renderFormField(field, value) {
  const id = `f-${field.key}`;
  const required = field.required && !field.auto ? '<span class="req">*</span>' : "";
  const help = field.auto
    ? `<span class="help">${field.input === "number" ? "Fetched from market data." : "Filled in automatically."}</span>`
    : field.computed
      ? `<span class="help">Calculated automatically.</span>`
      : field.help
        ? `<span class="help">${esc(field.help)}</span>`
        : field.key === "symbol"
          ? `<span class="help">Type 3+ letters to search NSE — stocks, ETFs and every other listed product</span>`
          : field.options_from
            ? `<span class="help">Manage demat accounts under Masters.</span>`
            : "";
  const err = `<span class="err" data-err="${field.key}"></span>`;
  let control = "";

  if (field.input === "select") {
    if (field.auto) {
      control = `<input type="text" name="${field.key}" id="${id}" value="${esc(value || "")}" placeholder="Auto" readonly>`;
    } else if (field.options_from === "demat_accounts") {
      control = `<select name="${field.key}" id="${id}">${dematOptionHtml(value)}</select>`;
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

function wirePayoutLock(form) {
  const payout = form.querySelector('[name="payout"]');
  const compounding = form.querySelector('[name="compounding"]');
  if (!payout || !compounding) return;
  const field = compounding.closest(".field");
  const help = field?.querySelector(".help");
  const original = help ? help.textContent : "";
  const apply = () => {
    const cumulative = (payout.value || "Cumulative") === "Cumulative";
    compounding.disabled = cumulative;
    field?.classList.toggle("is-locked", cumulative);
    if (help) {
      help.textContent = cumulative
        ? "Not applicable — interest compounds and is paid with the maturity amount."
        : original;
    }
  };
  payout.addEventListener("change", apply);
  apply();
}

function isoDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// One deposit per year on the start-date anniversary, capped at 15 years.
function ppfRowsFromSchedule(startStr, yearlyContribution) {
  if (!startStr) return [];
  const start = new Date(`${startStr}T00:00:00`);
  if (Number.isNaN(start.getTime())) return [];
  const yearly = Number(yearlyContribution);
  if (!Number.isFinite(yearly) || yearly <= 0) return [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start > today) return [];
  const rows = [];
  for (let k = 0; k < 15; k += 1) {
    const d = new Date(start.getFullYear() + k, start.getMonth(), start.getDate());
    if (d.getMonth() !== start.getMonth()) d.setDate(0);
    if (d > today) break;
    rows.push({ date: isoDay(d), amount: yearly });
  }
  return rows;
}

// Date-wise PPF ledger: deposits plus interest credited on 31 March each year.
// A deposit earns from the month it lands when paid by the 5th, otherwise from
// the next month — the passbook rule. Without explicit transactions the yearly
// schedule stands in, so older holdings keep working.
function ppfLedger(startStr, yearlyContribution, interestRate, transactions) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let deposits;
  let start;
  if (Array.isArray(transactions)) {
    deposits = transactions
      .map((t) => ({ date: new Date(`${String(t.date).slice(0, 10)}T00:00:00`), amount: Number(t.amount) }))
      .filter((t) => !Number.isNaN(t.date.getTime()) && Number.isFinite(t.amount) && t.amount > 0 && t.date <= today)
      .sort((a, b) => a.date - b.date);
    if (!deposits.length) return { events: [], principal: 0, interest: 0, balance: 0 };
    start = deposits[0].date;
  } else {
    const rows = ppfRowsFromSchedule(startStr, yearlyContribution);
    if (!rows.length) return null;
    deposits = rows.map((r) => ({ date: new Date(`${r.date}T00:00:00`), amount: Number(r.amount) }));
    start = deposits[0].date;
  }

  const rate = Number(interestRate) > 0 ? Number(interestRate) : 0;
  const byMonth = new Map();
  deposits.forEach((d) => {
    const key = `${d.date.getFullYear()}-${d.date.getMonth()}`;
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(d);
  });

  const events = [];
  let balance = 0;
  let totalInterest = 0;
  let fiscalInterest = 0;
  let y = start.getFullYear();
  let m = start.getMonth();
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  while (y < todayY || (y === todayY && m <= todayM)) {
    const completed = y < todayY || m < todayM;
    const monthDeposits = (byMonth.get(`${y}-${m}`) || []).slice().sort((a, b) => a.date - b.date);
    monthDeposits.filter((d) => d.date.getDate() <= 5).forEach((d) => {
      balance += d.amount;
      events.push({ date: isoDay(d.date), kind: "deposit", amount: round2(d.amount), balance: round2(balance) });
    });
    if (completed && rate) fiscalInterest += (balance * rate) / 1200;
    monthDeposits.filter((d) => d.date.getDate() > 5).forEach((d) => {
      balance += d.amount;
      events.push({ date: isoDay(d.date), kind: "deposit", amount: round2(d.amount), balance: round2(balance) });
    });
    if (completed && m === 2) {
      if (fiscalInterest) {
        const posted = round2(fiscalInterest);
        balance += posted;
        totalInterest += posted;
        events.push({ date: `${y}-03-31`, kind: "interest", amount: posted, balance: round2(balance) });
      }
      fiscalInterest = 0;
    }
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return {
    events,
    principal: round2(deposits.reduce((sum, d) => sum + d.amount, 0)),
    interest: round2(totalInterest),
    balance: round2(balance),
  };
}

function ppfRowHtml(row = {}) {
  const today = isoDay(new Date());
  return `<div class="ppf-row">
    <input type="date" class="ppf-date" value="${esc(row.date || today)}" max="${today}" aria-label="Contribution date">
    <span class="input-affix"><span class="affix">₹</span><input type="number" class="ppf-amount" min="0" step="0.01" inputmode="decimal" value="${row.amount ?? ""}" placeholder="0" aria-label="Contribution amount"></span>
    <button class="icon-btn" type="button" data-ppf-remove aria-label="Remove contribution">${icon("close")}</button>
  </div>`;
}

function ppfLedgerHtml(item) {
  const transactions = Array.isArray(item.details?.transactions) ? item.details.transactions : null;
  const ledger = ppfLedger(item.start_date, item.details?.yearly_contribution, item.details?.interest_rate, transactions);
  if (!ledger || !ledger.events.length) return "";
  const rows = ledger.events.slice().reverse().map((event) => `
    <tr>
      <td>${fmtDate(event.date)}</td>
      <td>${event.kind === "interest" ? "Interest credited" : "Contribution"}</td>
      <td class="num">${inr2(event.amount)}</td>
      <td class="num">${inr2(event.balance)}</td>
    </tr>`).join("");
  return `
    <div class="section-label" style="margin-top:20px">Contributions and interest</div>
    <div class="table-wrap">
      <table class="table" style="min-width:0">
        <thead><tr><th>Date</th><th>Entry</th><th class="num">Amount</th><th class="num">Balance</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="muted" style="font-size:12px;margin-top:8px">Interest is credited on 31 March each year; a deposit paid after the 5th earns from the next month.</p>`;
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

  const dematSelect = form.querySelector('[name="demat_id"]');
  const brokerSelect = form.querySelector('[name="broker"]');
  if (dematSelect && brokerSelect) {
    dematSelect.addEventListener("change", () => {
      const account = (state.meta?.demat_accounts || []).find(
        (a) => String(a.id) === String(dematSelect.value),
      );
      if (account?.broker) brokerSelect.value = account.broker;
    });
  }

  if (meta.key === "ppf") {
    const startEl = form.querySelector('[name="start_date"]');
    const yearlyEl = form.querySelector('[name="yearly_contribution"]');
    const rateEl = form.querySelector('[name="interest_rate"]');
    const rowsHost = form.querySelector("#ppf-rows");
    const addBtn = form.querySelector("#ppf-add-row");
    const txInput = form.querySelector('[name="transactions"]');

    const readRows = () => (rowsHost ? [...rowsHost.querySelectorAll(".ppf-row")].map((row) => ({
      date: row.querySelector(".ppf-date").value,
      amount: Number(row.querySelector(".ppf-amount").value),
    })).filter((r) => r.date && Number.isFinite(r.amount) && r.amount > 0) : []);

    const renderRows = (rows) => {
      if (!rowsHost) return;
      rowsHost.innerHTML = rows.map((r) => ppfRowHtml(r)).join("");
      hydrateIcons(rowsHost);
    };

    const syncPpf = () => {
      const rows = readRows();
      const schedule = ppfRowsFromSchedule(startEl?.value, yearlyEl?.value);
      const onSchedule = rows.length === schedule.length && rows.every((row, i) => (
        row.date === schedule[i].date && Number(row.amount) === Number(schedule[i].amount)
      ));
      if (txInput) txInput.value = onSchedule ? "[]" : JSON.stringify(rows);
      const ledger = ppfLedger(startEl?.value, yearlyEl?.value, rateEl?.value, rows);
      if (!ledger) return;
      if (!touched.invested && invested) invested.value = round2(ledger.principal);
      if (!touched.current && current) current.value = round2(ledger.balance);
    };

    if (rowsHost) {
      const stored = Array.isArray(existing?.details?.transactions) ? existing.details.transactions : [];
      renderRows(stored.length ? stored : ppfRowsFromSchedule(existing?.start_date || "", existing?.details?.yearly_contribution));
      if (txInput) txInput.value = JSON.stringify(stored);
      let rowsTouched = stored.length > 0;

      rowsHost.addEventListener("input", () => { rowsTouched = true; syncPpf(); });
      rowsHost.addEventListener("click", (event) => {
        if (!event.target.closest("[data-ppf-remove]")) return;
        event.target.closest(".ppf-row")?.remove();
        rowsTouched = true;
        syncPpf();
      });
      addBtn?.addEventListener("click", () => {
        rowsHost.insertAdjacentHTML("beforeend", ppfRowHtml());
        hydrateIcons(rowsHost);
        rowsTouched = true;
        syncPpf();
      });

      const rebuildSchedule = () => {
        if (rowsTouched) return;
        renderRows(ppfRowsFromSchedule(startEl?.value, yearlyEl?.value));
        syncPpf();
      };
      ["input", "change"].forEach((evt) => {
        startEl?.addEventListener(evt, rebuildSchedule);
        yearlyEl?.addEventListener(evt, rebuildSchedule);
        rateEl?.addEventListener(evt, syncPpf);
      });
      if (!existing) syncPpf();
    }
  }

  form.querySelectorAll(".switch input").forEach((input) => {
    input.addEventListener("change", () => {
      const label = input.parentElement.querySelector(".switch-label");
      if (label) label.textContent = input.checked ? "Yes" : "No";
    });
  });

  wireMaturityPreview(form, meta);
  wirePayoutLock(form);
  if (form.querySelector('[name="symbol"]')) wireScripLookup(form, meta);
  if (meta.key === "mutual_funds") wireSchemeLookup(form);
  if (meta.key === "etf") wireEtfNameLookup(form);
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
      box.innerHTML = `<div class="suggest-empty">No match — NSE data is imported automatically under Market data.</div>`;
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

function wireSchemeLookup(form) {
  const input = form.querySelector('[name="name"]');
  const box = form.querySelector("[data-name-suggest]");
  if (!input || !box) return;

  let timer = null;
  let requestSeq = 0;
  let groups = [];
  let choices = [];
  let active = -1;

  const hide = () => {
    box.hidden = true;
    box.innerHTML = "";
    groups = [];
    choices = [];
    active = -1;
    input.setAttribute("aria-expanded", "false");
  };

  const paint = () => {
    input.setAttribute("aria-expanded", "true");
    box.hidden = false;
    if (!groups.length) {
      box.innerHTML = `<div class="suggest-empty">No scheme matched. The AMFI list downloads automatically — try again in a few minutes.</div>`;
      return;
    }
    let index = -1;
    box.innerHTML = groups.map((group) => `
      <div class="scheme-group">
        <div class="scheme-head">
          <span class="scheme-title">${esc(group.name)}</span>
          <span class="scheme-meta">${esc([group.amc, group.category].filter(Boolean).join(" · "))}</span>
        </div>
        <div class="scheme-variants">
          ${group.variants.map((variant) => {
            index += 1;
            return `<button type="button" class="scheme-chip ${index === active ? "active" : ""}" data-pick="${index}">
              <span class="sv-plan">${esc(variant.plan)} · ${esc(variant.option)}</span>
              <span class="sv-nav">${variant.nav != null ? inr2(variant.nav) : "—"}</span>
            </button>`;
          }).join("")}
        </div>
      </div>`).join("");
  };

  const setSelect = (name, value) => {
    const el = form.querySelector(`[name="${name}"]`);
    if (!el || !value) return;
    if (![...el.options].some((option) => option.value === value)) return;
    el.value = value;
  };

  const choose = (choice) => {
    if (!choice) return;
    const { group, variant } = choice;
    input.value = `${group.name} - ${variant.plan} - ${variant.option}`;
    setSelect("amc", group.amc);
    setSelect("scheme_category", group.category);
    setSelect("plan", variant.plan);
    setSelect("option", variant.option);
    const navInput = form.querySelector('[name="current_nav"]');
    if (navInput && variant.nav != null) navInput.value = variant.nav;
    hide();
    form.dispatchEvent(new Event("input", { bubbles: true }));
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
        const data = await api(`/schemes?q=${encodeURIComponent(term)}`);
        if (seq !== requestSeq) return;
        groups = data.items || [];
        choices = groups.flatMap((group) => group.variants.map((variant) => ({ group, variant })));
        active = -1;
        paint();
      } catch {
        if (seq === requestSeq) hide();
      }
    }, 240);
  });

  input.addEventListener("keydown", (event) => {
    if (box.hidden) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      active = Math.min(active + 1, choices.length - 1);
      paint();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      active = Math.max(active - 1, 0);
      paint();
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(choices[active]);
    } else if (event.key === "Escape") {
      hide();
    }
  });

  box.addEventListener("mousedown", (event) => {
    const button = event.target.closest("[data-pick]");
    if (!button) return;
    event.preventDefault();
    choose(choices[Number(button.dataset.pick)]);
  });

  input.addEventListener("blur", () => setTimeout(hide, 140));
}

function wireEtfNameLookup(form) {
  const input = form.querySelector('[name="name"]');
  const box = form.querySelector("[data-name-suggest]");
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
      box.innerHTML = `<div class="suggest-empty">No match — NSE data is imported automatically under Market data.</div>`;
      return;
    }
    box.innerHTML = items.map((item, index) => `
      <button type="button" class="suggest-item ${index === active ? "active" : ""}" data-pick="${index}" role="option">
        <span class="ss-sym">${esc(item.symbol)}</span>
        <span class="ss-name">${esc(item.name)}</span>
        <span class="ss-ltp">${item.ltp != null ? inr2(item.ltp) : "—"}</span>
      </button>`).join("");
  };

  const choose = (item) => {
    if (!item) return;
    input.value = item.name || item.symbol;
    const symbol = form.querySelector('[name="symbol"]');
    if (symbol) symbol.value = item.symbol;
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
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      choose(items[active]);
    } else if (event.key === "Escape") {
      hide();
    }
  });

  box.addEventListener("mousedown", (event) => {
    const button = event.target.closest("[data-pick]");
    if (!button) return;
    event.preventDefault();
    choose(items[Number(button.dataset.pick)]);
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
  if (meta.key === "ppf") {
    const tx = form.querySelector('[name="transactions"]');
    if (tx) payload.transactions = tx.value || "[]";
  }
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
    message: `<strong>${esc(item.name)}</strong> moves to Recently deleted on the Activity page, where you can restore it for 30 days.`,
    confirmLabel: "Delete holding",
  });
  if (!ok) return;
  try {
    const result = await api(`/investments/${id}`, { method: "DELETE" });
    closeDrawer();
    toast("Holding deleted — 30 days in Recently deleted", "ok", undoAction(result?.trash_id));
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
    message: `<strong>${ids.length}</strong> selected holding${ids.length === 1 ? "" : "s"} move to Recently deleted on the Activity page, where you can restore them for 30 days.`,
    confirmLabel: `Delete ${ids.length}`,
  });
  if (!ok) return;
  try {
    const result = await api("/investments/bulk-delete", { method: "POST", body: { ids } });
    state.selected.clear();
    closeDrawer();
    toast(
      `Deleted ${result.deleted} holding${result.deleted === 1 ? "" : "s"} — 30 days in Recently deleted`,
      "ok",
      undoAction(result?.trash_ids),
    );
    await refreshAndRender();
  } catch (error) {
    toast(error.message, "error");
  }
}

function openBrokerBulkModal() {
  if (!isAdmin() || !state.selected.size) return;
  const ids = [...state.selected];
  const brokers = state.meta?.brokers || [];
  openModal({
    title: "Tag broker",
    subtitle: `${ids.length} selected holding${ids.length === 1 ? "" : "s"}. Only stocks and ETFs are changed.`,
    body: `
      <form id="bulk-broker-form" novalidate>
        <label class="field"><span>Broker / DP<span class="req">*</span></span>
          <select name="broker">
            <option value="">Select…</option>
            ${brokers.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join("")}
          </select>
          <span class="help">Value and gain through this broker will appear on the dashboard.</span>
          <span class="err" data-err="broker"></span></label>
      </form>`,
    footer: `
      <button class="btn btn-secondary" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="button" data-save>${icon("check")} Tag broker</button>`,
    onMount(backdrop, close) {
      const form = backdrop.querySelector("#bulk-broker-form");
      const button = backdrop.querySelector("[data-save]");
      button.addEventListener("click", async () => {
        const broker = form.broker.value;
        if (!broker) {
          form.querySelector('[data-err="broker"]').textContent = "Choose a broker";
          return;
        }
        button.disabled = true;
        button.innerHTML = `<span class="spinner"></span> Tagging…`;
        try {
          const result = await api("/investments/bulk-broker", { method: "POST", body: { ids, broker } });
          state.selected.clear();
          close();
          if (result.updated) toast(`Tagged ${result.updated} holding${result.updated === 1 ? "" : "s"} to ${broker}`, "ok");
          else toast("Only stocks and ETFs can carry a broker", "warn");
          await refreshAndRender();
        } catch (error) {
          toast(error.message, "error");
          button.disabled = false;
          button.innerHTML = `${icon("check")} Tag broker`;
        }
      });
    },
  });
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
    message: `<strong>${esc(member.name)}</strong> will lose access and move to Recently deleted, where an admin can restore them for 30 days. Holdings they own must be reassigned first.`,
    confirmLabel: "Remove member",
  });
  if (!ok) return;
  try {
    const result = await api(`/members/${id}`, { method: "DELETE" });
    toast("Member removed — 30 days in Recently deleted", "ok", undoAction(result?.trash_id));
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

      ${lockCardHtml()}
    </div>
  `;
  hydrateIcons($("#view"));
  probeBiometric().then(() => {
    if (state.view === "profile") renderLockCard();
  });
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
        <p>Broker and demat accounts saved for the family. Any of them can be picked while adding a stock or ETF.</p>
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
              <th>Demat account</th><th class="hide-sm">Owner</th><th class="hide-sm">Broker / DP</th><th class="hide-sm">Client ID</th>
              <th class="num">Holdings</th>${admin ? "<th></th>" : ""}
            </tr></thead>
            <tbody>
              ${accounts.map((a) => `<tr>
                <td><div style="font-weight:650;font-size:12.5px">${esc(a.label || a.broker)}</div><div class="cell-sub">${esc(a.display)}</div></td>
                <td class="hide-sm" style="font-size:12px;color:var(--muted)">${esc(a.owner || "—")}</td>
                <td class="hide-sm" style="font-size:12px;color:var(--muted)">${esc(a.broker)}</td>
                <td class="hide-sm" style="font-size:12px;color:var(--muted)">${esc(a.client_id)}</td>
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
              <option value="" ${existing?.owner_id ? "" : "selected"}>Select member…</option>
              ${members.map((m) => `<option value="${m.id}" ${String(existing?.owner_id ?? "") === String(m.id) ? "selected" : ""}>${esc(m.name)}</option>`).join("")}
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
    message: `<strong>${esc(account.display)}</strong> will disappear from the dropdown and move to Recently deleted for 30 days. Holdings keep their broker details.`,
    confirmLabel: "Remove account",
  });
  if (!ok) return;
  try {
    const result = await api(`/demat-accounts/${id}`, { method: "DELETE" });
    toast("Demat account removed — restore from Activity for 30 days", "ok", undoAction(result?.trash_id));
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
  const equityDate = s?.equity_list_date ? fmtDate(s.equity_list_date) : null;
  const bhavDate = s?.trade_date ? fmtDate(s.trade_date) : null;

  $("#view").innerHTML = `
    <div class="page-head">
      <div>
        <h2>Market data</h2>
        <p>The NSE equity list and bhavcopy are imported automatically — no file upload needed.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary btn-sm" type="button" data-action="market-reload">${icon("refresh")} Refresh status</button>
        <button class="btn btn-primary btn-sm" type="button" data-action="market-sync">${icon("download")} Sync from NSE</button>
        <button class="btn btn-primary btn-sm" type="button" data-action="update-prices" ${ready && s.matched ? "" : "disabled"}>
          ${icon("trendUp")} Update prices
        </button>
      </div>
    </div>

    <div class="info-strip ok" style="margin-bottom:16px">${icon("calendar")}
      <span><strong>Data in use —</strong>
        NSE equity list: ${equityDate ? `as of ${equityDate}` : "not loaded yet"} ·
        Bhavcopy prices: ${bhavDate ? `for ${bhavDate}` : "not loaded yet"}.</span>
    </div>

    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">${icon("list")} Scrips loaded</div>
        <div class="kpi-value">${s ? nf(0).format(s.scrips) : "—"}</div>
        <div class="kpi-foot">${equityDate ? `Equity list as of ${equityDate}` : "Not imported yet"}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">${icon("market")} Price rows</div>
        <div class="kpi-value">${s ? nf(0).format(s.prices) : "—"}</div>
        <div class="kpi-foot">${bhavDate ? `Bhavcopy for ${bhavDate}` : "No bhavcopy yet"}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">${icon("calendar")} Last trade date</div>
        <div class="kpi-value" style="font-size:22px">${bhavDate || "—"}</div>
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
            <h4>Import from NSE automatically</h4>
            <p>Downloads the equity master and the latest bhavcopy — stocks, ETFs and all other listed cash-market products — straight into DeepTrack. No upload needed.</p>
            <div class="download-row">
              <label class="field">
                <span>Bhavcopy as-of date</span>
                <input type="date" id="sync-bhav-date" value="${localISODate()}" max="${localISODate()}">
              </label>
              <button class="btn btn-primary btn-sm" type="button" data-action="market-sync">${icon("download")} Sync now</button>
            </div>
            <p style="margin-top:10px">NSE publishes on trading days only. If today is a holiday, the app automatically uses the latest available day.</p>
          </div>
        </div>
      </section>

      <section class="card card-pad">
        <div class="step-card">
          <div class="step-num">?</div>
          <div style="flex:1;min-width:0">
            <h4>If the sync is blocked</h4>
            <p>Some networks block NSE. Drop an EQUITY_L.csv or bhavcopy you already have — the format is detected automatically.</p>
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
        <span>No bhavcopy yet. Click <strong>Sync from NSE</strong> to import it.</span></div>` : ""}
      ${s && s.prices && !s.matched ? `<div class="info-strip warn" style="margin-top:14px">${icon("alert")}
        <span>No holdings match the loaded prices. Add stock or ETF holdings with NSE symbols, then try again.</span></div>` : ""}
      ${s && s.matched ? `<div class="info-strip ok" style="margin-top:14px">${icon("checkCircle")}
        <span>${s.matched} holding${s.matched === 1 ? "" : "s"} can be revalued with the prices from ${bhavDate || "the latest bhavcopy"}.</span></div>` : ""}
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

async function syncMarket() {
  const buttons = $$('[data-action="market-sync"]');
  const originals = buttons.map((b) => b.innerHTML);
  buttons.forEach((b) => {
    b.disabled = true;
    b.innerHTML = `<span class="spinner"></span> Syncing…`;
  });
  try {
    const day = $("#sync-bhav-date")?.value || "";
    const data = await api("/market/sync", { method: "POST", body: { date: day } });
    state.marketStatus = data.status;
    const equity = data.result?.equity_list;
    const bhav = data.result?.bhavcopy;
    const parts = [];
    if (equity) parts.push(`equity list (${nf(0).format(equity.symbols)} scrips)`);
    if (bhav) parts.push(`bhavcopy for ${fmtDate(bhav.trade_date)} (${nf(0).format(bhav.symbols)} scrips)`);
    toast(`Synced ${parts.join(" · ") || "NSE data"}`, "ok");
    renderMarket();
  } catch (error) {
    toast(error.message, "error");
    buttons.forEach((b, i) => {
      b.disabled = false;
      b.innerHTML = originals[i];
    });
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
    toast("Sync NSE data before updating prices", "warn");
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
      <span><strong>Stored in the Firebase cloud.</strong> Every change is written to Firestore — holdings, activity and uploaded company logos — so everything lives in the cloud and is reachable from any device${s.cloud && s.cloud.synced_at ? ` · last synced <span class="mono">${esc(s.cloud.synced_at)}</span>` : ""}.</span>
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

function importOwnerOptions() {
  return [
    `<option value="" selected>Select member…</option>`,
    ...state.members.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`),
  ].join("");
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
        <span>Imported ${state.importResult.imported} holding${state.importResult.imported === 1 ? "" : "s"}${state.importResult.updated ? ` · ${state.importResult.updated} updated` : ""}${state.importResult.duplicates ? ` · ${state.importResult.duplicates} already there` : ""}${state.importResult.skipped ? ` · ${state.importResult.skipped} skipped` : ""}.</span>
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
              <span>Pick the member in each row's <strong>Owner</strong> column. Rows left without an owner are held back until you choose one — nothing is ever assigned to whoever uploads the file. Deposit tabs name themselves from the bank or scheme and reference number.</span>
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
      <label class="check-inline" style="font-size:13px">
        <input type="checkbox" id="import-update-existing" ${state.importUpdateExisting ? "checked" : ""}>
        Update holdings whose quantity or average cost changed
      </label>
      <p class="muted" style="margin:8px 0 0;font-size:12.5px;line-height:1.55">
        When a row matches a holding you already have, its units, average cost and amounts are
        updated in place instead of the row being skipped — the preview shows the old → new
        values first. Leave this off to only add new holdings. Applies to both uploads below.
      </p>
    </section>

    <section class="card card-pad" style="margin-bottom:18px">
      <div class="card-head">
        <div>
          <div class="card-title">Upload a broker report</div>
          <div class="card-sub">No re-typing — holdings from ICICI Direct and Kotak Securities map straight to your portfolio</div>
        </div>
        <span class="pill pill-muted">ICICI Direct · Kotak</span>
      </div>
      <label class="field" style="max-width:340px;margin-bottom:14px">
        <span>Whose broker report is this?<span class="req">*</span></span>
        <select id="broker-owner">${importOwnerOptions()}</select>
        <span class="help">Every holding found in the report is assigned to this member.</span>
      </label>
      <div class="dropzone" id="broker-dropzone" tabindex="0" role="button" aria-label="Upload broker report">
        <div class="dz-icon">${icon("upload")}</div>
        <h4>Drop your broker's holdings export here</h4>
        <p>or click to browse files</p>
        <span class="file-hint">Holdings only — Excel (.xlsx, .xls) or CSV from ICICI Direct / Kotak Securities</span>
      </div>
      <input type="file" id="broker-file" accept=".xlsx,.xlsm,.xls,.csv" class="hidden">
      <p class="muted small" style="margin:10px 0 0">Buying and selling history? Use the trade statement box below, or open one holding under Instruments and choose <strong>Import broker trade report</strong>.</p>
    </section>

    <section class="card card-pad" style="margin-bottom:18px">
      <div class="card-head">
        <div>
          <div class="card-title">Import a broker trade statement</div>
          <div class="card-sub">One period, every scrip — trades are filed against your holdings, and scrips you don't hold yet are created</div>
        </div>
        <span class="pill pill-muted">ICICI · Kotak</span>
      </div>
      <div class="dropzone" id="statement-dropzone" tabindex="0" role="button" aria-label="Upload trade statement">
        <div class="dz-icon">${icon("upload")}</div>
        <h4>Drop a trade statement here</h4>
        <p>or click to browse files</p>
        <span class="file-hint">ICICI or Kotak Transaction Statement (.pdf), or Kotak Transaction Statement (.csv)</span>
      </div>
      <input type="file" id="statement-file" accept=".pdf,.csv,.xlsx,.xlsm" class="hidden">
      <p class="muted small" style="margin:10px 0 0">Trades are matched to stocks, ETFs and equity funds by scrip name or ISIN. Scrips you don't hold yet are offered as new holdings in the preview — pick whose they are, and their quantity and average cost come from this statement's trades. Blank broker, sector and demat details on matched holdings are filled too, existing values are kept, and the client code in the file name is saved as a demat account under Masters. Duplicates are ignored.</p>
    </section>

    <section class="card card-pad" style="margin-bottom:18px">
      <div class="card-head">
        <div>
          <div class="card-title">Upload a filled template</div>
          <div class="card-sub">We validate every row before saving anything</div>
        </div>
        <span class="pill pill-muted">.xlsx</span>
      </div>
      <label class="field" style="max-width:340px;margin-bottom:14px">
        <span>Owner for rows with no Owner column</span>
        <select id="import-owner">${importOwnerOptions()}</select>
        <span class="help">Rows that already name an owner keep theirs. Everything else — for example a family member's sheet with no Name column — goes to this owner, so pick that member before dropping the file.</span>
      </label>
      <div class="dropzone" id="dropzone" tabindex="0" role="button" aria-label="Upload Excel workbook">
        <div class="dz-icon">${icon("upload")}</div>
        <h4>Drop your filled template here</h4>
        <p>or click to browse files</p>
        <span class="file-hint">Only .xlsx workbooks created from the DeepTrack template</span>
      </div>
      <input type="file" id="import-file" accept=".xlsx,.xlsm" class="hidden">
    </section>

    <section class="card card-pad" style="margin-bottom:18px">
      <div class="card-head">
        <div>
          <div class="card-title">Import your own debt sheet</div>
          <div class="card-sub">FDs, RDs, bonds, PPF and post office schemes — one row per deposit</div>
        </div>
        <span class="pill pill-muted">Your layout</span>
      </div>
      <div class="dropzone" id="debt-dropzone" tabindex="0" role="button" aria-label="Upload deposit sheet">
        <div class="dz-icon">${icon("upload")}</div>
        <h4>Drop your deposit sheet here</h4>
        <p>or click to browse files</p>
        <span class="file-hint">.xlsx with Category, Deposit, Deposit date, Rate, Maturity date and Deposit amount columns</span>
      </div>
      <input type="file" id="debt-file" accept=".xlsx,.xlsm" class="hidden">
      <p class="muted small" style="margin:10px 0 0">Each row becomes an FD, RD, bond, PPF or small savings holding based on its category. Rows that name a member keep that owner; the rest go to the owner chosen above. Rows that can't be read (a missing rate, an RD without a monthly amount) are listed in the preview, and a re-upload skips what is already saved.</p>
    </section>

    <div id="import-preview">${preview ? importPreviewHtml(preview) : ""}</div>
  `;
  hydrateIcons($("#view"));
  wireDropzone();
  wireBrokerDropzone();
  wireStatementDropzone();
  wireDropzone("debt-dropzone", "debt-file", uploadDebtSheet);
  $("#import-update-existing")?.addEventListener("change", (event) => {
    state.importUpdateExisting = event.target.checked;
  });

  if (!state.storageStatus) {
    api("/storage")
      .then((data) => { state.storageStatus = data; })
      .catch(() => {})
      .finally(() => { if (state.view === "import") renderImport(); });
  }
}

function wireDropzone(zoneId = "dropzone", inputId = "import-file", onFile = uploadImport) {
  const zone = $(`#${zoneId}`);
  const input = $(`#${inputId}`);
  if (!zone || !input) return;
  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      input.click();
    }
  });
  input.addEventListener("change", () => {
    if (input.files?.[0]) onFile(input.files[0]);
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
    if (file) onFile(file);
  });
}

function wireBrokerDropzone() {
  wireDropzone("broker-dropzone", "broker-file", uploadBroker);
}

function wireStatementDropzone() {
  wireDropzone("statement-dropzone", "statement-file", uploadStatement);
}

function resetStatementZone() {
  const zone = $("#statement-dropzone");
  zone?.classList.remove("busy");
  const title = zone?.querySelector("h4");
  const sub = zone?.querySelector("p");
  if (title) title.textContent = "Drop a trade statement here";
  if (sub) sub.textContent = "or click to browse files";
}

async function uploadStatement(file) {
  if (!/\.(pdf|csv|xlsx|xlsm)$/i.test(file.name)) {
    toast("Upload the statement as .pdf, .csv or .xlsx", "error");
    return;
  }
  const zone = $("#statement-dropzone");
  zone?.classList.add("busy");
  const title = zone?.querySelector("h4");
  const sub = zone?.querySelector("p");
  if (title) title.textContent = "Reading the statement…";
  if (sub) sub.textContent = file.name;
  const form = new FormData();
  form.append("file", file);
  try {
    const data = await api("/transactions/import", { method: "POST", form });
    resetStatementZone();
    openStatementPreview(file, data);
  } catch (error) {
    resetStatementZone();
    toast(error.message, "error");
  }
}

function openStatementPreview(file, data) {
  const holdings = data.holdings || [];
  const creations = data.create || [];
  const ready = creations.filter((c) => c.status === "ready");
  const skippedCreations = creations.filter((c) => c.status !== "ready");
  const total = data.new || 0;
  const holdingRows = holdings.map((h) => `
    <div class="txn-preview-row">
      <strong style="flex:1;min-width:0">${esc(h.name)}</strong>
      <span class="muted small">${esc(h.owner)}</span>
      <span class="txn-qty">${h.rows} trade${h.rows === 1 ? "" : "s"}</span>
      <strong class="txn-value">${h.new ? `${h.new} new` : "all imported"}</strong>
    </div>`).join("");
  const creationRows = ready.map((c) => `
    <div class="txn-preview-row">
      <strong style="flex:1;min-width:0">${esc(c.name)}</strong>
      <span class="muted small mono">${esc(c.symbol)}${c.type === "etf" ? " · ETF" : ""}</span>
      <span class="txn-qty">${nf(4).format(Number(c.quantity) || 0)} × ${inr2(c.avg_cost)}</span>
      <strong class="txn-value">${c.rows} trade${c.rows === 1 ? "" : "s"}</strong>
    </div>`).join("");
  const ambiguous = data.ambiguous || [];
  const conflicts = data.conflicts || [];
  const filledHoldings = holdings.filter((h) => (h.fills || []).length);
  const me = state.members.find((m) => m.is_self) || state.members[0];
  const brokerNote = data.broker
    ? `${esc(data.broker)} statement${data.client_id ? ` · client ID ${esc(data.client_id)}` : ""}`
    : "";
  const fillNote = filledHoldings.length
    ? `Fills blank details: ${filledHoldings.map((h) => `<strong>${esc(h.name)}</strong> — ${esc(h.fills.join(", "))}`).join(" · ")}.`
    : "";
  const dematNote = data.client_id && data.broker
    ? `The demat account ${esc(data.client_id)} (${esc(data.broker)}) is saved under Masters for the member you pick, and linked to the new holdings.`
    : "";
  const ownerSelect = ready.length ? `
    <label class="field" style="margin-top:14px;max-width:340px">
      <span>Create the new holdings under</span>
      <select id="statement-create-owner">
        ${state.members.map((m) => `<option value="${m.id}" ${me && m.id === me.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")}
      </select>
      <span class="help">Quantity and average cost are worked out from this statement's trades, so a statement that starts mid-year can understate what is held.${dematNote ? ` ${dematNote}` : ""}</span>
    </label>` : "";
  const body = `
    ${brokerNote ? `<p class="muted small">${brokerNote}</p>` : ""}
    <div class="txn-import-facts">
      <div><span>Trades in statement</span><strong>${data.rows}</strong></div>
      <div><span>Holdings matched</span><strong>${holdings.length}</strong></div>
      <div><span>New trades</span><strong>${total}</strong></div>
      <div><span>Already imported</span><strong>${data.duplicates}</strong></div>
    </div>
    ${fillNote ? `<p class="muted small">${fillNote}</p>` : ""}
    ${holdingRows ? `<div class="txn-preview-list">${holdingRows}</div>` : ""}
    ${creationRows ? `
      <div class="section-label" style="margin-top:16px">New holdings · ${ready.length}</div>
      <div class="txn-preview-list">${creationRows}</div>
      ${ownerSelect}` : ""}
    ${skippedCreations.length ? `<p class="muted small">${esc(skippedCreations.map((c) => `${c.name} — ${c.reason}`).join("; "))} — those scrips are not imported.</p>` : ""}
    ${ambiguous.length ? `<p class="muted small">${esc(ambiguous.map((a) => `${a.security} (${a.holdings.join(" / ")})`).join("; "))} — held by more than one member, so those rows are skipped. Import that scrip from the holding's own drawer instead.</p>` : ""}
    ${conflicts.length ? `<div class="form-error">Skipped ${conflicts.length} holding${conflicts.length === 1 ? "" : "s"} — ${esc(conflicts.map((c) => `${c.name} is ${c.reason}`).join("; "))}. A ${esc(data.broker || "broker")} statement only posts to holdings tagged to that broker and account; import those scrips from the right broker's statement.</div>` : ""}
    ${data.blank ? `<p class="muted small">${data.blank} row${data.blank === 1 ? "" : "s"} skipped — no scrip name in the statement.</p>` : ""}
    ${data.skipped ? `<p class="muted small">${data.skipped} row${data.skipped === 1 ? "" : "s"} skipped — intraday, F&amp;O or missing data.</p>` : ""}
    ${!total ? `<p class="muted small">${filledHoldings.length ? "No new trades — the details below are still filled on import." : "Every trade in this statement is already imported, or nothing can be imported from it."}</p>` : ""}
  `;
  const bits = [];
  if (total) bits.push(`Import ${total} trade${total === 1 ? "" : "s"}`);
  if (ready.length) bits.push(`create ${ready.length} holding${ready.length === 1 ? "" : "s"}`);
  const label = bits.length
    ? bits.join(" · ")
    : filledHoldings.length ? "Fill missing details" : "Nothing new to import";
  openModal({
    title: "Import a trade statement",
    subtitle: esc(file.name),
    size: "md",
    body,
    footer: `<button class="btn btn-secondary" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="button" id="statement-commit" ${total || filledHoldings.length ? "" : "disabled"}>${label}</button>`,
    onMount: (backdrop, close) => {
      backdrop.querySelector("#statement-commit")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = "Importing…";
        const form = new FormData();
        form.append("file", file);
        form.append("commit", "1");
        if (ready.length) {
          form.append("create_missing", "1");
          form.append("create_owner", backdrop.querySelector("#statement-create-owner")?.value || "");
        }
        try {
          const result = await api("/transactions/import", { method: "POST", form });
          close();
          const across = (result.holdings || []).length + (result.created || []).length;
          const fresh = (result.created || []).length;
          const filledNow = (result.filled || []).length;
          const parts = [];
          if (result.imported) {
            parts.push(`${result.imported} trade${result.imported === 1 ? "" : "s"} imported across ${across} holding${across === 1 ? "" : "s"}`);
          }
          if (fresh) parts.push(`${fresh} new holding${fresh === 1 ? "" : "s"} created`);
          if (filledNow) parts.push(`details filled on ${filledNow}`);
          if (result.demat?.created) parts.push(`demat ${result.demat.client_id} saved to Masters`);
          toast(parts.join(" · ") || "Nothing new to import", "ok");
          await refreshData();
        } catch (error) {
          toast(error.message, "error");
          button.disabled = false;
          button.textContent = label;
        }
      });
    },
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
  const ownerId = $("#import-owner")?.value || "";
  if (ownerId) form.append("owner_id", ownerId);
  form.append("update_existing", state.importUpdateExisting ? "1" : "0");
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

async function uploadBroker(file) {
  if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) {
    toast("Upload the broker's Excel or CSV export", "error");
    return;
  }
  const ownerId = $("#broker-owner")?.value || "";
  if (!ownerId) {
    toast("Choose whose broker report this is first", "warn");
    $("#broker-file").value = "";
    return;
  }
  const zone = $("#broker-dropzone");
  zone?.classList.add("busy");
  if (zone) {
    zone.querySelector("h4").textContent = "Reading the broker report…";
    zone.querySelector("p").textContent = file.name;
  }
  const form = new FormData();
  form.append("file", file);
  form.append("owner_id", ownerId);
  form.append("update_existing", state.importUpdateExisting ? "1" : "0");
  try {
    const data = await api("/import/broker", { method: "POST", form });
    state.importPreview = data;
    state.importResult = null;
    renderImport();
    $("#import-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast(`${data.valid} of ${data.rows} holding${data.rows === 1 ? "" : "s"} ready to import`, data.invalid ? "warn" : "ok");
  } catch (error) {
    toast(error.message, "error");
    zone?.classList.remove("busy");
    if (zone) {
      zone.querySelector("h4").textContent = "Drop your broker's holdings export here";
      zone.querySelector("p").textContent = "or click to browse files";
    }
  }
}

async function uploadDebtSheet(file) {
  if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
    toast("Upload the sheet as .xlsx", "error");
    return;
  }
  const zone = $("#debt-dropzone");
  zone?.classList.add("busy");
  if (zone) {
    zone.querySelector("h4").textContent = "Reading your deposit sheet…";
    zone.querySelector("p").textContent = file.name;
  }
  const form = new FormData();
  form.append("file", file);
  const ownerId = $("#import-owner")?.value || "";
  if (ownerId) form.append("owner_id", ownerId);
  try {
    const data = await api("/import/custom", { method: "POST", form });
    state.importPreview = data;
    state.importResult = null;
    renderImport();
    $("#import-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast(`${data.valid} of ${data.rows} deposit rows ready to import`, data.invalid ? "warn" : "ok");
  } catch (error) {
    toast(error.message, "error");
    zone?.classList.remove("busy");
    if (zone) {
      zone.querySelector("h4").textContent = "Drop your deposit sheet here";
      zone.querySelector("p").textContent = "or click to browse files";
    }
  }
}

function pickTransactionFile(id) {
  const input = $(`#txn-file-${id}`);
  if (!input) return;
  input.onchange = () => {
    const file = input.files?.[0];
    input.value = "";
    if (file) previewTransactionImport(id, file);
  };
  input.click();
}

async function previewTransactionImport(id, file) {
  if (!/\.(xlsx|xlsm|csv|pdf)$/i.test(file.name)) {
    toast("Choose the broker's .xlsx, .csv or .pdf report", "error");
    return;
  }
  const form = new FormData();
  form.append("file", file);
  try {
    const data = await api(`/investments/${id}/transactions/import`, { method: "POST", form });
    openTransactionPreview(id, file, data);
  } catch (error) {
    toast(error.message, "error");
  }
}

function openTransactionPreview(id, file, data) {
  const item = state.investments.find((i) => i.id === id);
  const total = data.new || 0;
  const rows = (data.preview || []).map((row) => `
    <div class="txn-preview-row">
      <span class="txn-chip ${row.kind}">${row.kind === "sell" ? "SELL" : "BUY"}</span>
      <span class="txn-date">${fmtDate(row.trade_date)}</span>
      <span class="txn-qty">${nf(4).format(row.quantity)} × ${inr2(row.price)}</span>
      <strong class="txn-value">${inr2(row.value)}</strong>
    </div>`).join("");
  const scrips = data.matched_scrips?.length
    ? data.matched_scrips
    : data.scrips?.length ? data.scrips : (data.scrip ? [data.scrip] : []);
  const scripLabel = scrips.length > 2
    ? `${scrips.slice(0, 2).join(", ")} +${scrips.length - 2} more`
    : scrips.join(", ");
  const body = `
    <div class="txn-import-facts">
      <div><span>Scrip in report</span><strong>${esc(scripLabel || "—")}</strong></div>
      <div><span>Trades for this holding</span><strong>${data.rows}</strong></div>
      <div><span>New</span><strong>${total}</strong></div>
      <div><span>Already imported</span><strong>${data.duplicates}</strong></div>
    </div>
    ${data.warning ? `<div class="form-error">${esc(data.warning)}</div>` : ""}
    ${data.other_rows ? `<p class="muted small">${data.other_rows} row${data.other_rows === 1 ? "" : "s"} for other scrips in this statement ${data.other_rows === 1 ? "is" : "are"} ignored.</p>` : ""}
    ${data.skipped ? `<p class="muted small">${data.skipped} row${data.skipped === 1 ? "" : "s"} skipped — intraday, F&amp;O or missing data.</p>` : ""}
    ${data.rows ? `<p class="muted small">${data.buys} buy · ${data.sells} sell · ${fmtDate(data.first_date)} to ${fmtDate(data.last_date)}</p>` : `<p class="muted small">No transactions were found in this file.</p>`}
    ${(data.fills || []).length ? `<p class="muted small">Fills blank details: ${esc(data.fills.join(", "))}.</p>` : ""}
    ${data.demat ? `<p class="muted small">Demat account ${esc(data.demat.client_id)} (${esc(data.demat.broker)}) ${data.demat.saved ? "is already saved under Masters." : `is saved under Masters${item?.owner ? ` for ${esc(item.owner)}` : ""} and linked to this holding.`}</p>` : ""}
    ${rows ? `<div class="txn-preview-list">${rows}</div>` : ""}
    ${total > (data.preview || []).length ? `<p class="muted small">Showing the first ${(data.preview || []).length} of ${total} new rows.</p>` : ""}
  `;
  const fillCount = (data.fills || []).length;
  const dematAction = Boolean(data.demat && !data.demat.saved && data.matches);
  const label = total
    ? `Import ${total} transaction${total === 1 ? "" : "s"}`
    : fillCount ? "Fill missing details" : dematAction ? "Save demat account" : "Nothing to import";
  openModal({
    title: "Import transactions",
    subtitle: `${esc(item?.name || "Holding")} — ${esc(file.name)}`,
    size: "md",
    body,
    footer: `<button class="btn btn-secondary" type="button" data-close>Cancel</button>
      <button class="btn btn-primary" type="button" id="txn-commit" ${(total || fillCount || dematAction) && data.matches ? "" : "disabled"}>${label}</button>`,
    onMount: (backdrop, close) => {
      backdrop.querySelector("#txn-commit")?.addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = "Importing…";
        const form = new FormData();
        form.append("file", file);
        form.append("commit", "1");
        try {
          const result = await api(`/investments/${id}/transactions/import`, { method: "POST", form });
          close();
          const bits = [];
          if (result.imported) bits.push(`${result.imported} transaction${result.imported === 1 ? "" : "s"} imported`);
          const details = (result.filled || []).filter((text) => !text.startsWith("demat "));
          if (details.length) bits.push(`details filled (${details.join(", ")})`);
          if (result.demat?.created) bits.push(`demat ${result.demat.client_id} saved to Masters`);
          toast(bits.join(" · ") || "Nothing to import", "ok");
          await refreshData();
          openInvestmentDrawer(id);
        } catch (error) {
          toast(error.message, "error");
          button.disabled = false;
          button.textContent = label;
        }
      });
    },
  });
}

async function deleteTransactionEntry(transactionId, investmentId) {
  const item = state.investments.find((i) => i.id === investmentId);
  const row = (item?.transactions || []).find((t) => t.id === transactionId);
  const message = row && item
    ? `Removes the ${row.kind.toUpperCase()} of ${nf(4).format(row.quantity)} on ${fmtDate(row.trade_date)} from ${esc(item.name)}. Realised and unrealised gains recalculate.`
    : "This transaction will be removed and gains recalculated.";
  const ok = await confirmDialog({ title: "Remove this transaction?", message });
  if (!ok) return;
  try {
    const result = await api(`/transactions/${transactionId}`, { method: "DELETE" });
    toast("Transaction removed — restore from Activity for 30 days", "ok", undoAction(result?.trash_id));
    await refreshData();
    openInvestmentDrawer(investmentId);
  } catch (error) {
    toast(error.message, "error");
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
          <div class="card-sub">${data.broker ? `${esc(data.broker)} · ` : ""}${esc(data.filename || "Workbook")} · ${data.rows} row${data.rows === 1 ? "" : "s"} found</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span class="pill pill-ok">${data.valid} ready</span>
          ${data.updates ? `<span class="pill pill-warn">${data.updates} will update</span>` : ""}
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
        <table class="table" style="min-width:920px">
          <thead><tr>
            <th>Tab / row</th><th>Holding</th><th>Owner</th><th>Type</th>
            <th class="num">Invested</th><th class="num">Current</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${rows.map((row) => {
              const hasErrors = Object.keys(row.errors || {}).length > 0;
              const hasWarnings = (row.warnings || []).length > 0;
              const status = hasErrors
                ? `<span class="pill pill-bad">Needs fixing</span>`
                : row.update
                  ? `<span class="pill pill-warn">Will update</span>`
                  : row.duplicate
                    ? `<span class="pill pill-warn">Already imported — skipped</span>`
                    : hasWarnings
                      ? `<span class="pill pill-warn">Check</span>`
                      : `<span class="pill pill-ok">Ready</span>`;
              return `<tr>
                <td><div style="font-size:12px;font-weight:600">${esc(row.sheet)}</div><div class="cell-sub">Row ${row.row}</div></td>
                <td><div style="font-weight:650;font-size:12.5px">${esc(row.name)}</div></td>
                <td style="font-size:12px">${row.owner ? esc(row.owner) : `<span class="pill pill-warn">Not chosen</span>`}</td>
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
        <span>${data.preview_truncated ? `Showing the first ${rows.length} rows.` : "All rows shown."} Rows marked as already imported are skipped, so you can re-upload a corrected file safely. Rows marked will update change the holding you already have.</span>
        <span>Rows without a chosen owner are not imported.</span>
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
    const parts = [];
    if (result.imported) parts.push(`Imported ${result.imported} holding${result.imported === 1 ? "" : "s"}`);
    if (result.updated) parts.push(`updated ${result.updated}`);
    toast(parts.join(" · ") || "Nothing new to import", "ok");
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

  $("#logout-btn")?.addEventListener("click", () => signOut());

  document.addEventListener("visibilitychange", handleVisibilityChange);

  $("#quick-add")?.addEventListener("click", () => openInvestmentModal());
  $("#topbar-user")?.addEventListener("click", () => { location.hash = "#/profile"; });

  $("#menu-btn")?.addEventListener("click", () => {
    const open = $("#app").classList.toggle("menu-open");
    $("#scrim").classList.toggle("hidden", !open);
  });
  $("#scrim")?.addEventListener("click", closeSidebar);

  window.addEventListener("hashchange", () => route());

  document.addEventListener("keydown", (event) => {
    if (lockView) {
      if (/^\d$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        lockKeyPress(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        lockKeyPress("back");
      } else if (event.key === "Enter") {
        event.preventDefault();
        checkLockPin();
      }
      return;
    }
    if (event.key === "Escape") {
      closeDrawer();
      closeModal();
      closeSidebar();
      return;
    }
    if (event.key === "Enter" && event.target.matches?.("[data-drill], [data-member-open], [data-investment-id], [data-action='cal-open-month']")) {
      event.preventDefault();
      event.target.click();
    }
  });

  document.addEventListener("change", (event) => {
    const el = event.target;
    if (el.hasAttribute?.("data-lock-timeout")) {
      const store = readLock();
      if (store) writeLock({ ...store, autoLock: el.value });
      return;
    }
    if (el.matches?.("[data-income-year]")) {
      loadIncomeYear(el.value);
      return;
    }
    if (el.dataset?.creditId) {
      if (el.checked) {
        el.disabled = true;
        markIncomeCredited(Number(el.dataset.creditId));
      }
      return;
    }
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

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const badge = target?.closest(".bmark[data-logo-name]");
    if (!badge) return;
    event.preventDefault();
    event.stopPropagation();
    pickLogoFile(badge.dataset.logoName);
  }, true);

  document.addEventListener("load", (event) => {
    const img = event.target;
    if (img instanceof HTMLImageElement && img.hasAttribute("data-auto-logo")) {
      const badge = img.closest(".bmark");
      badge?.classList.add("has-logo");
      if (badge?.dataset.logoName) badge.title = `${badge.dataset.logoName} — click to change logo`;
    }
  }, true);
  document.addEventListener("error", (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.hasAttribute("data-auto-logo")) return;
    const badge = img.closest(".bmark");
    img.remove();
    if (!badge) return;
    badge.classList.remove("has-logo");
    if (badge.dataset.logoName) {
      badge.classList.add("no-logo");
      badge.title = `${badge.dataset.logoName} — no logo found; click to add one`;
    }
  }, true);

  document.addEventListener("pointerdown", (event) => {
    if (!fxPop) return;
    if (fxPop.contains(event.target)) return;
    if (event.target instanceof Element && event.target.closest(".fx-btn")) return;
    closeHeaderFilter();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && fxPop) closeHeaderFilter();
  });
  window.addEventListener("resize", () => closeHeaderFilter());
  window.addEventListener("scroll", () => closeHeaderFilter(), { passive: true });
}

async function handleClick(event) {
  if (lockView) return;
  if (event.target.closest(".select-cell, #select-all, [data-select-id]")) return;

  const nav = event.target.closest("[data-nav]");
  if (nav) {
    location.hash = `#/${nav.dataset.nav}`;
    return;
  }

  const drill = event.target.closest("[data-drill]");
  if (drill) {
    state.filters = {
      q: drill.dataset.search || "",
      category: fxList(drill.dataset.category),
      type: fxList(drill.dataset.type),
      owner: fxList(drill.dataset.owner),
      broker: [],
      sort: drill.dataset.sort || "updated",
      dir: "desc",
    };
    state.layout = "flat";
    if (state.view === "investments") renderInvestments();
    location.hash = "#/investments";
    return;
  }

  const memberOpen = event.target.closest("[data-member-open]");
  if (memberOpen) {
    const memberId = Number(memberOpen.dataset.memberOpen);
    if (isAdmin()) openMemberModal(memberId);
    else location.hash = "#/members";
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
    case "lock-set-pin":
      openPinModal("set");
      break;
    case "lock-change-pin":
      openPinModal("change");
      break;
    case "lock-off":
      await disableAppLock();
      break;
    case "lock-now":
      lockNow();
      break;
    case "lock-bio-add":
      await addBiometricUnlock();
      break;
    case "lock-bio-remove":
      await removeBiometricUnlock();
      break;
    case "add-investment":
      openInvestmentModal();
      break;
    case "edit-investment":
      closeDrawer();
      openInvestmentModal(id);
      break;
    case "open-folio":
      openFolioDrawer(actionEl.dataset.folio);
      break;
    case "delete-investment":
      closeDrawer();
      await deleteInvestment(id);
      break;
    case "bulk-delete":
      await bulkDeleteInvestments();
      break;
    case "bulk-broker":
      openBrokerBulkModal();
      break;
    case "record-income":
      openIncomeModal(id);
      break;
    case "txn-import":
      pickTransactionFile(id);
      break;
    case "txn-delete":
      await deleteTransactionEntry(id, Number(actionEl.dataset.investment));
      break;
    case "fetch-corporate":
      await fetchCorporateActions();
      break;
    case "activity-more":
      actionEl.disabled = true;
      await loadActivity();
      break;
    case "activity-refresh":
      state.activity = null;
      state.trash = null;
      await loadActivity(true);
      break;
    case "trash-restore":
      await restoreTrashItem(Number(actionEl.dataset.trashId));
      break;
    case "trash-purge":
      await purgeTrashItem(Number(actionEl.dataset.trashId));
      break;
    case "delete-income":
      await deleteIncomeEntry(id);
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
    case "open-filter":
      if (fxPop && fxPop.dataset.col === actionEl.dataset.fcol) {
        closeHeaderFilter();
      } else {
        openHeaderFilter(actionEl);
      }
      break;
    case "cal-zoom": {
      const cal = state.income?.calendar;
      if (!cal) break;
      state.incomeCal.zoom = actionEl.dataset.zoom === "month" ? "month" : "year";
      if (state.incomeCal.zoom === "month" && !state.incomeCal.month) {
        state.incomeCal.month = calDefaultMonth(cal);
      }
      state.incomeCal.day = null;
      paintIncomeCalendar();
      break;
    }
    case "cal-open-month": {
      const cal = state.income?.calendar;
      if (!cal) break;
      state.incomeCal.zoom = "month";
      state.incomeCal.month = actionEl.dataset.month || calDefaultMonth(cal);
      state.incomeCal.day = null;
      paintIncomeCalendar();
      break;
    }
    case "cal-nav": {
      const cal = state.income?.calendar;
      if (!cal) break;
      const current = state.incomeCal.month || calDefaultMonth(cal);
      const [year, month] = current.split("-").map(Number);
      const next = new Date(year, month - 1 + (Number(actionEl.dataset.dir) || 0), 1);
      const key = `${next.getFullYear()}-${pad2(next.getMonth() + 1)}`;
      if (key < cal.from.slice(0, 7) || key > cal.to.slice(0, 7)) break;
      state.incomeCal.month = key;
      state.incomeCal.day = null;
      paintIncomeCalendar();
      break;
    }
    case "cal-day":
      if (!actionEl.dataset.day) break;
      state.incomeCal.day = state.incomeCal.day === actionEl.dataset.day ? null : actionEl.dataset.day;
      paintIncomeCalendar();
      break;
    case "cal-day-close":
      state.incomeCal.day = null;
      paintIncomeCalendar();
      break;
    case "layout":
      state.layout = actionEl.dataset.layout === "member" ? "member" : "flat";
      renderInvestments();
      break;
    case "clear-filters":
      state.filters = { q: "", category: [], type: [], owner: [], broker: [], sort: "updated", dir: "desc" };
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
    case "market-sync":
      await syncMarket();
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

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update().catch(() => {}))
      .catch(() => {});
  });
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
}
