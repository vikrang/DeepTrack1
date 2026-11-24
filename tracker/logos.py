"""Automatic logos for banks, issuers and other listed brands.

Bundled images in static/img/logos always win. Anything recognised by the
domain table below but missing from the bundle is fetched once from Google's
favicon service and cached in DATA_DIR/logos, so the result survives redeploys
on hosts with a persistent disk.
"""
from __future__ import annotations

import json
import re
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

import requests

from . import config

LOCK = threading.Lock()
_MISS_DAYS = 7
_MAX_BYTES = 300_000
_MAX_LOGOS = 400
_UA = "Mozilla/5.0 (compatible; DeepTrack/1.0; logo cache)"

# (keywords, domain). Every keyword must appear in the normalised label.
# Longer keyword sets are tested first so "pnb housing" beats "pnb".
_DOMAINS = [
    # Banks
    (("state bank of india", "sbi"), "sbi.co.in"),
    (("hdfc bank",), "hdfcbank.com"),
    (("icici bank",), "icicibank.com"),
    (("axis bank",), "axisbank.com"),
    (("kotak mahindra bank", "kotak bank"), "kotak.com"),
    (("punjab national bank", "pnb"), "pnbindia.in"),
    (("bank of baroda",), "bankofbaroda.in"),
    (("canara bank",), "canarabank.com"),
    (("union bank of india",), "unionbankofindia.co.in"),
    (("idfc first",), "idfcfirstbank.com"),
    (("yes bank",), "yesbank.in"),
    (("indusind",), "indusind.com"),
    (("federal bank",), "federalbank.co.in"),
    (("south indian bank",), "southindianbank.com"),
    (("indian bank",), "indianbank.in"),
    (("central bank of india",), "centralbankofindia.co.in"),
    (("bank of maharashtra",), "bankofmaharashtra.in"),
    (("au small finance bank", "au bank"), "aubank.in"),
    (("ujjivan",), "ujjivansfb.in"),
    (("equitas",), "equitasbank.com"),
    (("jana small finance", "jana bank"), "janabank.com"),
    (("esaf",), "esafbank.com"),
    (("suryoday",), "suryodaybank.com"),
    (("utkarsh",), "utkarsh.bank"),
    (("capital small finance",), "capitalsmallfinancebank.com"),
    (("north east small finance", "nesfb"), "nesfb.com"),
    (("bandhan bank",), "bandhanbank.com"),
    (("india post payments bank", "ippb"), "ippbonline.com"),
    (("india post", "post office"), "indiapost.gov.in"),
    (("paytm payments bank",), "paytm.com"),
    # Deposits / NBFCs / corporates
    (("bajaj housing",), "bajajhousing.in"),
    (("bajaj finance", "bajaj finserv"), "bajajfinserv.in"),
    (("shriram finance", "shriram"), "shriramfinance.in"),
    (("sundaram finance",), "sundaramfinance.in"),
    (("muthoot",), "muthootfinance.com"),
    (("manappuram",), "manappuram.com"),
    (("tamil nadu power finance", "tn power finance"), "tnpowerfinance.com"),
    (("iifl",), "iifl.com"),
    (("l&t finance", "l and t finance", "ltfh"), "ltfh.co.in"),
    (("mahindra finance", "mahindra and mahindra financial"), "mahindrafinance.com"),
    (("cholamandalam", "chola"), "cholamandalam.com"),
    (("pnb housing",), "pnbhousing.com"),
    (("lic housing",), "lichousing.com"),
    (("icici home finance",), "icicihfc.com"),
    (("hudco",), "hudco.org.in"),
    (("hdb financial",), "hdbfs.com"),
    (("poonawalla",), "poonawallafincorp.com"),
    (("sammaan capital",), "sammaancapital.com"),
    (("aditya birla capital",), "adityabirlacapital.com"),
    (("tata capital",), "tatacapital.com"),
    (("tata motors finance",), "tatamotorsfinance.com"),
    (("tvs credit",), "tvscredit.com"),
    (("hero fincorp",), "herofincorp.com"),
    (("smfg india", "fullerton"), "smfgindiacredit.com"),
    (("piramal",), "piramalfinance.com"),
    (("godrej",), "godrejcapital.com"),
    (("slice",), "sliceit.com"),
    (("reliance",), "ril.com"),
    (("adani",), "adani.com"),
    (("vedanta",), "vedantalimited.com"),
    (("titan",), "titancompany.in"),
    (("larsen", "l&t"), "larsentoubro.com"),
    # Bonds / government issuers
    (("indian railway finance", "irfc"), "irfc.co.in"),
    (("rural electrification", "rec limited", "rec ltd", "rec"), "recindia.nic.in"),
    (("power finance", "pfc"), "pfcindia.com"),
    (("indian renewable energy", "ireda"), "ireda.in"),
    (("national highways", "nhai"), "nhai.gov.in"),
    (("nabard", "national bank for agriculture"), "nabard.org"),
    (("sidbi", "small industries development bank"), "sidbi.in"),
    (("reserve bank of india", "reserve bank", "rbi"), "rbi.org.in"),
    (("power grid", "india grid"), "powergrid.in"),
    (("ntpc",), "ntpc.co.in"),
    (("nhpc",), "nhpcindia.com"),
    (("sjvn",), "sjvn.nic.in"),
    (("uppcl", "uttar pradesh power", "up power"), "uppcl.org"),
    (("amaravati", "apcrda"), "crda.ap.gov.in"),
    (("indian oil",), "iocl.com"),
    (("bharat petroleum", "bpcl"), "bharatpetroleum.in"),
    (("hindustan petroleum", "hpcl"), "hindustanpetroleum.com"),
    (("gail",), "gailonline.com"),
    (("ongc",), "ongcindia.com"),
    (("coal india",), "coalindia.in"),
    (("life insurance corporation", "lic of india"), "licindia.in"),
    (("employees provident", "epfo", "provident fund"), "epfindia.gov.in"),
    (("sovereign gold", "sgb"), "rbi.org.in"),
    # Mutual fund houses
    (("sbi mutual", "sbi mf"), "sbimf.com"),
    (("hdfc mutual", "hdfc mf"), "hdfcfund.com"),
    (("icici prudential mutual", "icici prudential mf", "icici mf"), "icicipruamc.com"),
    (("nippon india",), "nipponindiamf.com"),
    (("axis mutual", "axis mf"), "axismf.com"),
    (("kotak mahindra mutual", "kotak mahindra mf", "kotak mf"), "kotakmf.com"),
    (("uti mutual", "uti mf"), "utimf.com"),
    (("aditya birla sun life mutual", "aditya birla sun life mf", "aditya birla mf"), "mutualfund.adityabirlacapital.com"),
    (("mirae",), "miraeassetmf.co.in"),
    (("parag parikh", "ppfas"), "ppfas.com"),
    (("quant mutual", "quant mf"), "quantmutual.com"),
    (("dsp mutual", "dsp mf"), "dspim.com"),
    (("franklin",), "franklintempletonindia.com"),
    (("tata mutual", "tata mf"), "tatamutualfund.com"),
    (("motilal oswal mutual", "motilal oswal mf"), "motilaloswalmf.com"),
    (("edelweiss mutual", "edelweiss mf"), "edelweissmf.com"),
    (("invesco",), "invescomutualfund.com"),
    (("hsbc mutual", "hsbc mf"), "assetmanagement.hsbc.co.in"),
    (("bandhan mutual", "bandhan mf"), "bandhanmutual.com"),
    (("sundaram mutual", "sundaram mf"), "sundarammutual.com"),
    (("navi mutual", "navi mf"), "navi.com"),
    (("whiteoak", "white oak"), "whiteoakcapital.com"),
    # Insurers
    (("hdfc life",), "hdfclife.com"),
    (("icici prudential life",), "iciciprulife.com"),
    (("sbi life",), "sbilife.co.in"),
    (("max life",), "maxlifeinsurance.com"),
    (("bajaj allianz life",), "bajajallianzlife.com"),
    (("bajaj allianz general", "bajaj allianz"), "bajajallianz.com"),
    (("tata aia",), "tataaia.com"),
    (("kotak life",), "kotaklife.com"),
    (("aditya birla sun life insurance",), "adityabirlacapital.com"),
    (("pnb metlife",), "pnbmetlife.com"),
    (("star health",), "starhealth.in"),
    (("niva bupa",), "nivabupa.com"),
    (("care health",), "careinsurance.com"),
    (("new india assurance",), "newindia.co.in"),
    (("icici lombard",), "icicilombard.com"),
    (("hdfc ergo",), "hdfcergo.com"),
    (("united india",), "uiic.co.in"),
    (("oriental insurance",), "orientalinsurance.co.in"),
    (("national insurance",), "nationalinsurance.nic.co.in"),
    # Brokers and platforms
    (("zerodha",), "zerodha.com"),
    (("groww",), "groww.in"),
    (("upstox",), "upstox.com"),
    (("icici direct",), "icicidirect.com"),
    (("hdfc securities",), "hdfcsec.com"),
    (("kotak securities",), "kotaksecurities.com"),
    (("angel one", "angel broking"), "angelone.in"),
    (("motilal oswal",), "motilaloswal.com"),
    (("sharekhan",), "sharekhan.com"),
    (("5paisa",), "5paisa.com"),
    (("axis direct",), "axisdirect.in"),
    (("sbi securities",), "sbisecurities.in"),
    (("dhan",), "dhan.co"),
    (("indmoney",), "indmoney.com"),
    # Crypto platforms
    (("binance",), "binance.com"),
    (("coinbase",), "coinbase.com"),
    (("wazirx",), "wazirx.com"),
    (("coindcx",), "coindcx.com"),
    (("kraken",), "kraken.com"),
    (("mudrex",), "mudrex.com"),
    (("metamask",), "metamask.io"),
    # Listed companies (badges are keyed on the investee company name)
    (("kcp",), "kcp.co.in"),
    (("jk tyre",), "jktyre.com"),
    (("srei",), "srei.com"),
    (("karur vysya",), "karurvysyabank.com"),
    (("dcb bank", "dcb"), "dcbank.in"),
    (("karnataka bank",), "karnatakabank.com"),
    (("city union bank",), "cityunionbank.com"),
    (("tamilnad mercantile",), "tmpbank.com"),
    (("csb bank",), "csb.bank"),
    (("dhanlaxmi",), "dhanbank.com"),
    (("rbl bank",), "rblbank.com"),
    (("jammu and kashmir bank", "j and k bank", "jk bank"), "jkbank.com"),
    (("bank of india",), "bankofindia.co.in"),
    (("indian overseas bank",), "iob.in"),
    (("uco bank",), "ucobank.com"),
    (("punjab and sind",), "psbindia.com"),
    (("itc hotels",), "itchotels.com"),
    (("itc",), "itcportal.com"),
    (("nestle",), "nestle.in"),
    (("hindustan unilever", "hul"), "hul.co.in"),
    (("britannia",), "britindia.co.in"),
    (("dabur",), "dabur.com"),
    (("marico",), "marico.com"),
    (("godrej consumer",), "godrejcp.com"),
    (("godrej properties",), "godrejproperties.com"),
    (("godrej industries",), "godrejindustries.com"),
    (("colgate",), "colgatepalmolive.co.in"),
    (("asian paints",), "asianpaints.com"),
    (("berger paints",), "bergerpaints.com"),
    (("pidilite",), "pidilite.com"),
    (("kalyan jewellers",), "kalyanjewellers.net"),
    (("trent",), "trentlimited.com"),
    (("avenue supermarts", "dmart"), "dmart.in"),
    (("tata consultancy", "tcs"), "tcs.com"),
    (("infosys",), "infosys.com"),
    (("wipro",), "wipro.com"),
    (("hcl tech",), "hcltech.com"),
    (("tech mahindra",), "techmahindra.com"),
    (("ltimindtree", "ltts"), "ltimindtree.com"),
    (("mphasis",), "mphasis.com"),
    (("persistent systems",), "persistent.com"),
    (("coforge",), "coforge.com"),
    (("tata elxsi",), "tataelxsi.com"),
    (("oracle financial", "ofss"), "ofss.com"),
    (("maruti",), "marutisuzuki.com"),
    (("mahindra",), "mahindra.com"),
    (("tata motors",), "tatamotors.com"),
    (("tata steel",), "tatasteel.com"),
    (("tata power",), "tatapower.com"),
    (("tata chemicals",), "tatachemicals.com"),
    (("tata consumer",), "tataconsumer.com"),
    (("tata",), "tata.com"),
    (("bajaj auto",), "bajajauto.com"),
    (("hero motocorp", "hero honda"), "heromotocorp.com"),
    (("tvs motor",), "tvsmotor.com"),
    (("eicher", "royal enfield"), "eichermotors.com"),
    (("ashok leyland",), "ashokleyland.com"),
    (("escorts",), "escortsgroup.com"),
    (("bosch",), "bosch.in"),
    (("motherson",), "motherson.com"),
    (("mrf",), "mrftyres.com"),
    (("apollo tyres",), "apollotyres.com"),
    (("ceat",), "ceat.com"),
    (("balkrishna", "bkt"), "bkt-tires.com"),
    (("exide",), "exideindustries.com"),
    (("amara raja",), "amararajabatteries.com"),
    (("polycab",), "polycab.com"),
    (("havells",), "havells.com"),
    (("dixon",), "dixoninfo.com"),
    (("voltas",), "voltas.com"),
    (("blue star",), "bluestarindia.com"),
    (("crompton",), "crompton.co.in"),
    (("siemens",), "siemens.co.in"),
    (("cummins",), "cummins.com"),
    (("bharat electronics", "bel"), "bel-india.in"),
    (("hindustan aeronautics", "hal"), "hal-india.co.in"),
    (("bhel", "bharat heavy"), "bhel.com"),
    (("bharat forge",), "bharatforge.com"),
    (("jsw steel",), "jsw.in"),
    (("hindalco",), "hindalco.com"),
    (("nalco", "national aluminium"), "nalcoindia.com"),
    (("sail", "steel authority"), "sail.co.in"),
    (("jindal steel",), "jindalsteelpower.com"),
    (("grasim",), "grasim.com"),
    (("ultratech",), "ultratechcement.com"),
    (("ambuja",), "ambujacement.com"),
    (("shree cement",), "shreecement.com"),
    (("sun pharma",), "sunpharma.com"),
    (("dr reddy",), "drreddys.com"),
    (("cipla",), "cipla.com"),
    (("divi",), "divislabs.com"),
    (("lupin",), "lupin.com"),
    (("aurobindo",), "aurobindo.com"),
    (("apollo hospitals",), "apollohospitals.com"),
    (("max healthcare",), "maxhealthcare.in"),
    (("fortis",), "fortishealthcare.com"),
    (("zomato", "eternal"), "zomato.com"),
    (("nykaa", "fsn ecommerce"), "nykaa.com"),
    (("irctc",), "irctc.co.in"),
    (("indian hotels", "taj hotels"), "tajhotels.com"),
    (("lemon tree",), "lemontreehotels.com"),
    (("jubilant food", "dominos india"), "jubilantfoodworks.com"),
    (("varun beverages",), "varunbeverages.com"),
    (("united spirits",), "unitedspirits.in"),
    (("torrent power",), "torrentpower.com"),
    (("oil india",), "oil-india.com"),
    (("petronet",), "petronetlng.in"),
    (("indraprastha gas", "igl"), "igl.co.in"),
    (("mahanagar gas",), "mahanagargas.com"),
    (("gujarat gas",), "gujaratgas.com"),
    (("container corporation", "concor"), "concorindia.co.in"),
    (("irb infra",), "irb.co.in"),
    (("gmr",), "gmrairports.com"),
    (("indigo paints",), "indigopaints.com"),
    (("indigo", "interglobe"), "goindigo.in"),
    (("spicejet",), "spicejet.com"),
    (("reliance power",), "reliancepower.co.in"),
    (("piramal pharma",), "piramal.com"),
    (("hdfc",), "hdfcbank.com"),
    (("icici",), "icicibank.com"),
]

_SKIP = {"other", "none", "na", "n a", "self", "cash", "savings", "bank", "default"}


def _norm(label: str) -> str:
    text = (label or "").lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


# Flatten to (keyword, domain) so the longest keyword wins even when one entry
# mixes a long name with a short alias ("state bank of india" vs "sbi").
_PAIRS = sorted(
    ((_norm(kw), domain) for keywords, domain in _DOMAINS for kw in keywords),
    key=lambda pair: len(pair[0]),
    reverse=True,
)


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")


def domain_for(name: str) -> str | None:
    norm = _norm(name)
    if not norm or norm in _SKIP:
        return None
    padded = f" {norm} "
    for keyword, domain in _PAIRS:
        if f" {keyword} " in padded:
            return domain
    return None


# Words that only describe the legal form, not the brand.
_LEGAL = {
    "ltd", "limited", "co", "company", "corp", "corporation", "inc", "plc",
    "pvt", "private", "the", "and", "of", "industries", "enterprises",
    "holdings", "international", "group",
}


def _guess_domains(name: str) -> list[str]:
    """Company-name guesses used when the keyword table has no entry.

    Only multi-word names are guessed, so a single common word never maps to
    a stranger's domain. Google's favicon service 404s for domains that do not
    exist, so a wrong guess simply yields no logo.
    """
    norm = _norm(name)
    if not norm or norm in _SKIP:
        return []
    words = [word for word in norm.split() if word not in _LEGAL]
    if len(words) < 2:
        return []
    parts = []
    for take in dict.fromkeys((len(words), 3, 2)):
        if 2 <= take <= len(words):
            part = "".join(words[:take])
            if len(part) >= 6 and part not in parts:
                parts.append(part)
    domains = []
    for part in parts:
        for tld in (".com", ".co.in", ".in"):
            candidate = f"{part}{tld}"
            if candidate not in domains:
                domains.append(candidate)
    return domains


def folder() -> Path:
    path = Path(config.DATA_DIR) / "logos"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _index_path() -> Path:
    return folder() / "index.json"


def _load_index() -> dict:
    try:
        data = json.loads(_index_path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_index(index: dict) -> None:
    try:
        _index_path().write_text(json.dumps(index, indent=1), encoding="utf-8")
    except Exception:
        pass


def _sniff(blob: bytes) -> str | None:
    if len(blob) < 80:
        return None
    if blob.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if blob.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if blob[:4] == b"RIFF" and blob[8:12] == b"WEBP":
        return ".webp"
    if blob.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    head = blob[:400].lstrip()
    if head.startswith(b"<?xml") and b"<svg" in blob[:3000]:
        return ".svg"
    if head.startswith(b"<svg"):
        return ".svg"
    if blob.startswith(b"\x00\x00\x01\x00"):
        return ".ico"
    return None


def sniff(blob: bytes) -> str | None:
    return _sniff(blob)


def _download(domain: str, timeout: float = 5.0, strict: bool = False) -> tuple[bytes, str] | None:
    quoted = quote(domain)
    sources = [
        "https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON"
        f"&fallback_opts=TYPE,SIZE,URL&url=https://{quoted}&size=128",
        f"https://www.google.com/s2/favicons?domain={quoted}&sz=128",
    ]
    if not strict:
        sources.append(f"https://icon.horse/icon/{quoted}?fallback=404")
    for url in sources:
        try:
            response = requests.get(url, headers={"User-Agent": _UA}, timeout=timeout)
            if response.status_code != 200:
                continue
            blob = response.content
            if len(blob) > _MAX_BYTES:
                continue
            ext = _sniff(blob)
            if ext:
                return blob, ext
        except Exception:
            continue
    return None


def ensure(name: str, timeout: float = 6.0, skip_slugs: set | None = None) -> dict | None:
    """Return the cache entry for a name, fetching it once if needed."""
    key = slug(name)
    if not key or key in _SKIP or (skip_slugs and key in skip_slugs):
        return None
    domain = domain_for(name)
    known = bool(domain)
    domains = [domain] if domain else _guess_domains(name)
    if not domains:
        return None
    with LOCK:
        index = _load_index()
        entry = index.get(key)
        target = folder() / entry["file"] if entry and entry.get("file") else None
        if target and target.is_file():
            return entry
        if entry and entry.get("miss"):
            try:
                missed = datetime.fromisoformat(entry["miss"])
                if (datetime.now(timezone.utc) - missed).days < _MISS_DAYS:
                    return None
            except Exception:
                pass
        if len(index) > _MAX_LOGOS:
            return None
        fetched = None
        for candidate in domains:
            fetched = _download(candidate, timeout=timeout, strict=not known)
            if fetched:
                domain = candidate
                break
        if not fetched:
            index[key] = {"name": name, "domain": domain, "miss": datetime.now(timezone.utc).isoformat()}
            _save_index(index)
            return None
        blob, ext = fetched
        filename = f"{key}{ext}"
        try:
            tmp = folder() / f".{filename}.tmp"
            tmp.write_bytes(blob)
            tmp.replace(folder() / filename)
        except Exception:
            return None
        entry = {
            "name": name,
            "domain": domain,
            "file": filename,
            "saved": datetime.now(timezone.utc).isoformat(),
        }
        index[key] = entry
        _save_index(index)
        return entry


def save(name: str, blob: bytes) -> dict | None:
    """Store a logo the user picked by hand; it beats any later auto fetch."""
    key = slug(name)
    ext = _sniff(blob or b"")
    if not key or key in _SKIP or not ext:
        return None
    with LOCK:
        index = _load_index()
        old = index.get(key) or {}
        filename = f"{key}{ext}"
        try:
            tmp = folder() / f".{filename}.tmp"
            tmp.write_bytes(blob)
            tmp.replace(folder() / filename)
        except Exception:
            return None
        entry = {
            "name": name.strip(),
            "file": filename,
            "custom": True,
            "saved": datetime.now(timezone.utc).isoformat(),
        }
        index[key] = entry
        _save_index(index)
    old_file = old.get("file")
    if old_file and old_file != filename:
        try:
            (folder() / old_file).unlink()
        except OSError:
            pass
    return entry


def cached_urls(skip_slugs: set | None = None) -> dict:
    """Server-relative URLs for everything already on disk (no fetching)."""
    urls = {}
    index = _load_index()
    base = folder()
    for key, entry in index.items():
        if not isinstance(entry, dict) or not entry.get("file"):
            continue
        if skip_slugs and key in skip_slugs:
            continue
        if (base / entry["file"]).is_file():
            urls[key] = f"/api/logo?name={quote(entry.get('name') or key, safe='')}"
    return urls


def warm(names, skip_slugs: set | None = None, pause: float = 0.15) -> int:
    """Fetch logos for a batch of names in the background. Returns how many were fetched."""
    fetched = 0
    seen = set()
    for name in names:
        key = slug(name)
        if not key or key in seen:
            continue
        seen.add(key)
        if ensure(name, skip_slugs=skip_slugs):
            fetched += 1
        time.sleep(pause)
    return fetched
