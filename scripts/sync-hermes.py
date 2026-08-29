#!/usr/bin/env python3
"""Regenerate src/data/hermes.json from a Hermes checkout.

The dashboard is a static site: it cannot read the Hermes repo at runtime,
and that repo is private anyway. So the state is snapshotted into the
bundle at build time by this script.

    python3 scripts/sync-hermes.py ../malaysian-regulatory-affairs

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

start = datetime.date.fromisoformat(str(calendar["cycle_start"]))
today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).date()
cycle_len = calendar["cycle_length_days"]
today_index = ((today - start).days % cycle_len) + 1

slots = [{**s, "title": pillar_titles.get(s["pillar"], s["pillar"])}
         for s in calendar["slots"]]

# Credit projection. Visuals default to rendered diagrams, which cost
# nothing, so the calendar's projected spend is zero unless the default is
# switched back to generated photos.
img_days = sum(1 for s in slots if s["format"] != "text_only")
per_image = budget["image"]["cost_per_image"]
visual_default = budget.get("visual", {}).get("default", "foto")
projected = 0 if visual_default == "rajah" else round(img_days / cycle_len * 30) * per_image
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
    "schedule": {"cron_utc": "45 13 * * *", "local": "9:45 malam",
                 "timezone": brands["meta"]["timezone"]},
    "cycle": {"start": start.isoformat(), "length_days": cycle_len,
              "today": today.isoformat(), "today_index": today_index},
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
    "today_draft": draft,
    "ledger": ledger["entries"][-30:],
}

dest = pathlib.Path(__file__).resolve().parent.parent / "src" / "data" / "hermes.json"
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
print(f"wrote {dest.relative_to(dest.parent.parent.parent)}")
print(f"  day {today_index}/{cycle_len} · projected {projected}/{cap} credits "
      f"· draft: {draft['status'] if draft else 'none'}")
