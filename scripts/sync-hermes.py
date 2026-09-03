#!/usr/bin/env python3
"""Regenerate src/data/hermes.json from a Hermes checkout.

The dashboard is a static site: it cannot read the Hermes repo at runtime,
and that repo is private anyway. So the state is snapshotted into the
bundle at build time by this script.

    python3 scripts/sync-hermes.py ../malaysian-regulatory-affairs [../argus]

Written in Python rather than Node because the Hermes configs are YAML and
this repo has no YAML dependency — adding one to ship a maintenance script
is not worth it.
"""
import json, sys, pathlib, datetime, re

try:
    import yaml
except ImportError:
    sys.exit("PyYAML required:  pip install pyyaml")

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1
                    else "../malaysian-regulatory-affairs").expanduser().resolve()
H = root / "hermes"
if not H.is_dir():
    sys.exit(f"no hermes/ folder under {root}")

load = lambda p: yaml.safe_load((H / "config" / p).read_text())
brands, calendar, channels, budget = (load(f) for f in
    ("brands.yml", "calendar.yml", "channels.yml", "budget.yml"))
ledger = json.loads((H / "state" / "ledger.json").read_text())

# Read the active brand from the rotation rather than hard-coding a key —
# the brand was renamed once already and will be again when the second one
# wakes up.
active = brands["rotation"]["active_brands"][0]
brand = brands["brands"][active]
pillar_titles = {p["id"]: p["title"] for p in brand["pillars"]}

facts = yaml.safe_load((H / "config" / "facts.yml").read_text()) or {}

def fact_rows(facts: dict) -> list[dict]:
    """Flatten the verifiable entries so the dashboard can show what is
    still holding drafts back."""
    rows = []
    for section in ("yuran", "tempoh", "sistem", "dokumen"):
        for key, v in (facts.get(section) or {}).items():
            if isinstance(v, dict) and "status" in v:
                rows.append({"section": section, "key": key,
                             "status": v["status"],
                             "source": v.get("sumber", ""),
                             "checked": str(v.get("disemak", ""))})
    return rows

today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date()

# The calendar moved from a 14-slot rotation to a fixed weekday schedule on
# 2026-08-31, so there is no cycle to sit inside any more. Python's weekday()
# is Mon=0; the config keys it Mon=1..Sat=6, Sun=0, matching cron.
dow = (today.weekday() + 1) % 7
sched = calendar["jadual"]
today_slot = sched.get(dow) or sched.get(str(dow)) or {}

slots = []
for key in [1, 2, 3, 4, 5, 6, 0]:
    v = sched.get(key) or sched.get(str(key)) or {}
    slots.append({
        "dow": key,
        "hari": v.get("hari", ""),
        "domain": v.get("domain", ""),
        "folder": v.get("folder", ""),
        "format": v.get("format", ""),
        "rehat": bool(v.get("rehat")),
        "amaran": " ".join(str(v.get("amaran", "")).split()),
        "today": key == dow,
    })

# Credit projection. Visuals default to rendered diagrams, which cost
# nothing, so the calendar's projected spend is zero unless the default is
# switched back to generated photos.
img_days = sum(1 for s in slots if s["format"] and s["format"] != "text_only")
per_image = budget["image"]["cost_per_image"]
visual_default = budget.get("visual", {}).get("default", "foto")
projected = 0 if visual_default == "rajah" else round(img_days / 7 * 30) * per_image
cap = budget["monthly_credits"]

vid = budget["video"]
cheapest_clip = vid.get("when_enabled", {}).get("cost_per_clip", 300)

# Today's draft, if one has been written.
today_dir = H / "content" / today.isoformat()
draft = None
if (today_dir / "meta.json").is_file():
    draft = json.loads((today_dir / "meta.json").read_text())
    post = (today_dir / "post.md")
    draft["verify_markers"] = sorted(set(
        re.findall(r"\[SAHKAN:\s*([^\]]+)\]", post.read_text()))) if post.is_file() else []

# --- the post gallery ---------------------------------------------------
#
# Every draft Hermes has ever written, newest first, with its cover card as
# a thumbnail so the pipeline is visible at a glance rather than only via
# the repo.
#
# The cover card only. Not the whole carousel: this repo is PUBLIC and it is
# served on GitHub Pages, so anything copied into public/ is world-readable.
# Approved and posted cards are public already — they have to be, because
# Meta fetches them by URL — but a draft still waiting for approval is work
# nobody has signed off yet. Publishing five cards of it would put an
# unreviewed carousel on the open web; one cover card is the smallest thing
# that still makes the list usable.
#
# This deliberately does NOT go through publish-cards.py. That tool refuses
# anything not marked approved, and that guard is what stands between a
# draft and Meta. Preview thumbnails are a different job with a different
# risk, so they get a different path — public/media/preview/ — and the two
# never share a directory.

REPO = pathlib.Path(__file__).resolve().parent.parent
PREVIEW = REPO / "public" / "media" / "preview"


# --- post permalinks, allowlisted ---------------------------------------
#
# Added 2026-09-02 so the public site can LINK OUT to what ws.regulab has
# already published. CLAUDE.md says not to add fields to this bundle
# without checking what they expose, so: this exposes public post URLs on
# Instagram, Facebook and Threads, for posts already live on those
# platforms. Nothing else.
#
# The check matters here more than usual. `penghantaran` in the private
# meta.json also carries media ids, account ids, card SHA-256 digests and
# a `kaedah` string that names the Zapier connection_id used to deliver.
# Spreading that block into a public bundle would put delivery-path
# internals on a public URL. So this reads ONE key per channel and builds
# a two-field record. Never spread `penghantaran`.
#
# Caption text is NOT here and must not be. It is on the never-publishable
# list in CLAUDE.md, and that list holds even though the captions
# themselves are already public on Meta: this repo does not become a
# second copy of them.

_CH = {"instagram": "Instagram", "facebook_page": "Facebook Page",
       "threads": "Threads"}


def _fb_url(post_id: str) -> str:
    """Facebook returns `<page>_<post>`, never a URL. Build it."""
    if post_id and "_" in post_id:
        page, post = post_id.split("_", 1)
        return f"https://www.facebook.com/{page}/posts/{post}"
    return ""


def post_links(m: dict) -> list[dict]:
    """Public permalinks only, for posts that actually went out.

    Three shapes exist because three sessions each designed their own
    field. All three are read; a fourth would go missing in silence.
    """
    if m.get("status") != "posted":
        return []
    out, seen = [], set()

    def add(key, url):
        label = _CH.get(key)
        if label and url and url.startswith("http") and label not in seen:
            seen.add(label)
            out.append({"channel": label, "url": url})

    for key, v in (m.get("penghantaran") or {}).items():
        if key == "imej" or not isinstance(v, dict):
            continue
        add(key, v.get("permalink") or _fb_url(v.get("post_id", "")))
    for key, v in (m.get("posts") or {}).items():
        if isinstance(v, dict):
            add(key, v.get("permalink") or _fb_url(v.get("id", "")))
    for key, url in (m.get("permalinks") or {}).items():
        add(key, url if isinstance(url, str) else "")
    return out

ARGUS = pathlib.Path(sys.argv[2] if len(sys.argv) > 2
                     else "../argus").expanduser().resolve()

# Empat medan. Bukan "semua kecuali badan" — SENARAI PUTIH, kerana
# front-matter Argus tumbuh setiap larian dan senarai hitam yang
# ketinggalan satu larian menerbitkan medan yang tiada siapa semak.
ARGUS_FIELDS = ("date", "status", "posted_at", "post_url")

# Front-matter ialah blok di ANTARA dua baris yang mengandungi `---` dan
# tiada apa-apa lagi. Versi pertama fungsi ini memisahkan fail pada
# mana-mana `---`, dan itu memotong front-matter separuh jalan setiap kali
# satu nota mengandungi sempang panjang — lima daripada lapan draf gagal
# dihurai, `continue` menelan ralatnya, dan blok yang terhasil kelihatan
# sah sedangkan ia kehilangan dua pertiga barisnya.
FRONT = re.compile(r"\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\Z)", re.S)


def argus_blok() -> dict:
    """Metadata LinkedIn Argus — post yang SUDAH keluar, dan kiraan sahaja.

    KENAPA BARIS UNTUK POST YANG SUDAH KELUAR, TETAPI KIRAAN SAHAJA
    UNTUK YANG BELUM. Post yang sudah keluar sudah awam: sesiapa boleh
    membuka permalink LinkedIn itu. Draf yang menunggu kelulusan ialah
    kerja yang belum ditandatangani sesiapa, dan "unapproved drafts" ada
    dalam senarai never-publishable dalam CLAUDE.md. Jadi bilangan yang
    beratur boleh keluar; tarikh dan tajuknya tidak.

    BADAN TIDAK PERNAH DIBACA. Badan draf Argus ialah teks caption
    LinkedIn — never-publishable, tanpa pengecualian. Penghurai ini
    berhenti pada `---` penutup dan tidak pernah melihat baris selepasnya.

    Repo argus ialah repo KETIGA. Ia mungkin tiada di sebelah dua yang
    lain pada mesin sesiapa, jadi ketiadaannya menghasilkan blok kosong
    dengan available:false — bukan ralat, dan bukan juga blok yang
    kelihatan sah sedangkan ia kosong kerana laluan salah.
    """
    drafts = ARGUS / "drafts"
    if not drafts.is_dir():
        return {"available": False, "posted": [], "pending": 0, "approved": 0,
                "channel": {"label": "LinkedIn", "connected": False}}

    rows, pending, approved, degil = [], 0, 0, []
    for f in sorted(drafts.glob("*.md")):
        head = FRONT.match(f.read_text(encoding="utf-8"))
        if not head:
            degil.append(f.name)
            continue
        try:
            m = yaml.safe_load(head.group(1)) or {}
        except yaml.YAMLError:
            degil.append(f.name)
            continue
        m = {k: m.get(k) for k in ARGUS_FIELDS}
        status = m.get("status")
        if status == "posted":
            url = m.get("post_url") or ""
            rows.append({"date": str(m.get("date") or f.stem),
                         "posted_at": m.get("posted_at") or None,
                         "url": url if str(url).startswith("http") else ""})
        elif status == "ready_for_approval":
            pending += 1
        elif status == "approved":
            approved += 1

    # Draf yang tidak boleh dihurai DILAPORKAN, tidak ditelan. Kegagalan
    # senyap di sinilah yang menyembunyikan pepijat pertama fungsi ini.
    if degil:
        print(f"  AMARAN argus: {len(degil)} draf tanpa front-matter yang "
              f"boleh dihurai — {', '.join(degil)}", file=sys.stderr)

    rows.sort(key=lambda r: r["date"], reverse=True)
    return {"available": True, "posted": rows, "pending": pending,
            "approved": approved,
            # Disambung kerana ada bukti, bukan kerana fail berkata begitu:
            # satu permalink LinkedIn sebenar ialah bukti laluan itu hidup.
            "channel": {"label": "LinkedIn",
                        "connected": any(r["url"] for r in rows)}}


def collect_posts() -> list[dict]:
    import shutil
    posts = []
    content = H / "content"
    if not content.is_dir():
        return posts
    for folder in sorted(content.iterdir(), reverse=True):
        meta_f = folder / "meta.json"
        if not meta_f.is_file():
            continue
        m = json.loads(meta_f.read_text())
        cards = sorted(folder.glob("card-*.png"))
        thumb = None
        if cards:
            out_dir = PREVIEW / folder.name
            out_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(cards[0], out_dir / "card-1.png")
            thumb = f"media/preview/{folder.name}/card-1.png"
        posts.append({
            "date": m.get("date", folder.name),
            "day_index": m.get("day_index"),
            "domain": m.get("domain", ""),
            "pillar": m.get("pillar", ""),
            "angle": m.get("angle", ""),
            "format": m.get("format", ""),
            "status": m.get("status", "unknown"),
            "citation": m.get("citation", ""),
            "credits_spent": m.get("credits_spent", 0),
            "cards": len(cards),
            "thumb": thumb,
            "channels": m.get("channels", {}),
            "posted_at": m.get("posted_at"),
            "posted_to": m.get("posted_to", []),
            "links": post_links(m),
        })
    return posts

posts = collect_posts()

# Drop preview folders for posts that no longer exist, so a deleted draft
# does not leave its cover card sitting on the public site forever.
if PREVIEW.is_dir():
    import shutil as _sh
    live = {p["date"] for p in posts}
    for stale in PREVIEW.iterdir():
        if stale.is_dir() and stale.name not in live:
            _sh.rmtree(stale)

# --- public-bundle redaction -------------------------------------------
#
# This repo is PUBLIC and served on GitHub Pages, so everything that
# reaches src/data/hermes.json is world-readable the moment it is merged.
# The Hermes ledger and draft metadata carry internal operating notes —
# approval-withdrawal audit trails, tooling commit SHAs, approver identity
# and content fingerprints — which document how the pipeline is run, not
# what it published. Strip them here rather than in a dashboard component:
# a component that declines to render a field does not make that field
# private, it only makes it unrendered.
PRIVATE_FIELDS = {
    "nota",                  # internal operating commentary
    "approved_by",           # approver identity
    "approved_fingerprint",  # content fingerprints
    "kelulusan_dipulihkan",  # approval-withdrawal audit trail
}

def redact(o):
    """Drop PRIVATE_FIELDS anywhere they appear, at any depth."""
    if isinstance(o, dict):
        return {k: redact(v) for k, v in o.items() if k not in PRIVATE_FIELDS}
    if isinstance(o, list):
        return [redact(v) for v in o]
    return o

out = {
    "generated_at": datetime.datetime.now(datetime.timezone.utc)
                        .isoformat(timespec="seconds"),
    # No phone number is carried anywhere — the footnote on every design and
    # the contact line in every caption is the website.
    "brand": {"key": active, "name": brand["name"],
              "wordmark": brand.get("wordmark", brand["name"]),
              "tagline": brand.get("tagline", ""),
              "website": brand.get("website", ""),
              "email": str(brand.get("contact_email", ""))},
    "schedule": {"cron_utc": calendar.get("cron_utc", "45 13 * * 1-6"),
                 "local": calendar.get("waktu", "9:45 malam"),
                 "kadens": calendar.get("kadens", "harian"),
                 "rehat": calendar.get("hari_rehat", ["Ahad"]),
                 "timezone": brands["meta"]["timezone"]},
    "cycle": {"today": today.isoformat(), "hari": today_slot.get("hari", ""),
              "domain": today_slot.get("domain", ""),
              "rehat": bool(today_slot.get("rehat"))},
    "budget": {
        "plan": budget["plan_assumed"], "monthly_credits": cap,
        "cost_per_image": per_image, "model": budget["image"]["model"],
        "spent_this_month": ledger["credits"]["spent_this_month"],
        "images_this_month": ledger["credits"]["images_generated_this_month"],
        "image_days_per_cycle": img_days, "projected_monthly": projected,
        "visual_default": visual_default,
        "headroom": cap - projected,
        "halt_below": budget["guards"]["halt_below_credits"],
        "warn_below": budget["guards"]["warn_below_credits"],
    },
    "video": {"enabled": vid["enabled"], "reason": " ".join(vid["reason"].split()),
              "cheapest_clip_credits": cheapest_clip,
              "months_per_clip": round(cheapest_clip / cap, 2)},
    "slots": slots,
    "channels": [
        {"key": k, "label": k.replace("_", " ").title(),
         "connected": bool(v.get("connected")),
         "enabled": bool(v.get("enabled")),
         "limit": v["caption"]["hard_limit"],
         "target": v["caption"]["target"],
         "zapier": v.get("zapier_app_hint", "")}
        for k, v in channels["channels"].items()
    ],
    "facts": fact_rows(facts),
    "sources": [
        {"key": k, "label": f"OneDrive · folder {v.get('folder', '?')}"
                            if k.startswith("onedrive") else k,
         "status": v.get("status", "?"),
         "configured": not str(v.get("folder_id", "")).startswith("TODO")}
        for k, v in (facts.get("sumber_kandungan") or {}).items()
    ],
    "today_draft": redact(draft),
    "posts": posts,
    "argus": argus_blok(),
    "ledger": redact(ledger["entries"][-30:]),
}

dest = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "hermes.json"
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {dest.relative_to(dest.parent.parent.parent)}")
label = today_slot.get("hari", "?") + " · " + (
    "REHAT" if today_slot.get("rehat") else today_slot.get("domain", "?"))
print(f"  {label} · projected {projected}/{cap} credits "
      f"· draft: {draft['status'] if draft else 'none'}")
from collections import Counter
tally = Counter(p["status"] for p in posts)
print(f"  {len(posts)} post · " + " · ".join(f"{k} {v}" for k, v in sorted(tally.items())))
