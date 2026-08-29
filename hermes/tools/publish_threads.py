#!/usr/bin/env python3
"""
Hermes → Threads publisher (official Meta Threads API, no third-party).

Publishes ONLY drafts that a human has moved into hermes/out/approved/.
Each draft is a JSON file:

    {
      "text": "Kemaskini JAKIM: senarai FHCB baharu berkuat kuasa 21 Ogos 2026 ...",
      "media_type": "TEXT",              # TEXT | IMAGE | VIDEO
      "image_url": "https://.../card.png",   # public HTTPS, required for IMAGE
      "video_url": null,
      "reply_to_id": null                # optional: post as reply to own post
    }

Env vars (GitHub secrets):
    THREADS_TOKEN     long-lived user token (60 days)
    THREADS_USER_ID   numeric Threads user id (from /me)

Usage:
    python hermes/tools/publish_threads.py                 # publish all approved
    python hermes/tools/publish_threads.py --dry-run       # validate only
    python hermes/tools/publish_threads.py --file path.json

Flow per draft: check quota → create container → poll status → publish →
move draft to hermes/out/published/<date>/ with the post id + permalink.
"""
import argparse, json, os, shutil, sys, time
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError

API = "https://graph.threads.net/v1.0"
ROOT = Path(__file__).resolve().parents[1]          # hermes/
APPROVED = ROOT / "out" / "approved"
PUBLISHED = ROOT / "out" / "published"
FAILED = ROOT / "out" / "failed"
MAX_TEXT = 500                                       # Threads hard cap


def api(method, path, **params):
    params["access_token"] = TOKEN
    data = urlencode(params).encode()
    req = Request(f"{API}/{path}", data=data if method == "POST" else None,
                  method=method)
    url = req.full_url if method == "POST" else f"{API}/{path}?{urlencode(params)}"
    req = Request(url, data=data if method == "POST" else None, method=method)
    try:
        with urlopen(req, timeout=30) as r:
            return json.load(r)
    except HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"{method} {path} → HTTP {e.code}: {body}") from None


def check_quota():
    q = api("GET", f"{USER_ID}/threads_publishing_limit",
            fields="quota_usage,config")
    d = q["data"][0]
    used, limit = d["quota_usage"], d["config"]["quota_total"]
    print(f"[quota] {used}/{limit} posts used in last 24h")
    if used >= limit:
        raise RuntimeError("Threads 24h publishing quota exhausted")


def validate(draft):
    text = draft.get("text", "").strip()
    mt = draft.get("media_type", "TEXT").upper()
    if not text:
        raise ValueError("text is empty")
    if len(text) > MAX_TEXT:
        raise ValueError(f"text is {len(text)} chars (max {MAX_TEXT})")
    if "[SAHKAN:" in text:
        raise ValueError("draft still contains an unverified [SAHKAN:] fact")
    if mt == "IMAGE" and not str(draft.get("image_url", "")).startswith("https://"):
        raise ValueError("IMAGE post needs a public https image_url")
    if mt == "VIDEO" and not str(draft.get("video_url", "")).startswith("https://"):
        raise ValueError("VIDEO post needs a public https video_url")
    if mt not in ("TEXT", "IMAGE", "VIDEO"):
        raise ValueError(f"unknown media_type {mt}")
    return text, mt


def publish(draft):
    text, mt = validate(draft)
    params = {"media_type": mt, "text": text}
    if mt == "IMAGE":
        params["image_url"] = draft["image_url"]
    if mt == "VIDEO":
        params["video_url"] = draft["video_url"]
    if draft.get("reply_to_id"):
        params["reply_to_id"] = draft["reply_to_id"]

    # 1. create container
    cid = api("POST", f"{USER_ID}/threads", **params)["id"]
    print(f"[container] {cid}")

    # 2. poll until FINISHED (media needs processing; text is near-instant)
    for _ in range(20):
        st = api("GET", cid, fields="status,error_message")
        if st.get("status") == "FINISHED":
            break
        if st.get("status") == "ERROR":
            raise RuntimeError(f"container error: {st.get('error_message')}")
        time.sleep(3)
    else:
        raise RuntimeError("container never reached FINISHED")

    # 3. publish
    pid = api("POST", f"{USER_ID}/threads_publish", creation_id=cid)["id"]
    meta = api("GET", pid, fields="id,permalink,timestamp")
    print(f"[published] {meta.get('permalink')}")
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--file", help="publish a single draft file")
    a = ap.parse_args()

    files = [Path(a.file)] if a.file else sorted(APPROVED.glob("*.json"))
    if not files:
        print("nothing in hermes/out/approved/ — exiting cleanly")
        return

    if not a.dry_run:
        check_quota()

    ok = fail = 0
    for f in files:
        draft = json.loads(f.read_text(encoding="utf-8"))
        try:
            if a.dry_run:
                validate(draft)
                print(f"[valid] {f.name}")
                continue
            meta = publish(draft)
            draft["published"] = meta
            dest = PUBLISHED / date.today().isoformat()
            dest.mkdir(parents=True, exist_ok=True)
            (dest / f.name).write_text(json.dumps(draft, indent=2, ensure_ascii=False))
            f.unlink()
            ok += 1
            time.sleep(5)                     # be polite to the API
        except Exception as e:
            print(f"[FAILED] {f.name}: {e}", file=sys.stderr)
            FAILED.mkdir(parents=True, exist_ok=True)
            shutil.move(str(f), FAILED / f.name)
            fail += 1

    print(f"done — {ok} published, {fail} failed")
    sys.exit(1 if fail else 0)


if __name__ == "__main__":
    TOKEN = os.environ.get("THREADS_TOKEN")
    USER_ID = os.environ.get("THREADS_USER_ID")
    if not TOKEN or not USER_ID:
        sys.exit("THREADS_TOKEN and THREADS_USER_ID must be set")
    main()
