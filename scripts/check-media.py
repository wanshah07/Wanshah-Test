#!/usr/bin/env python3
"""Fail if src/data/hermes.json points at card images that are not there.

    python3 scripts/check-media.py [path/to/hermes.json]

The bundle references card images two different ways, and they break for
two different reasons:

  1. SITE-RELATIVE  "media/preview/2026-09-12/card-1.png"
     Served by this site out of public/. If the file is not committed, the
     dashboard renders a broken thumbnail. `vite build` does not care —
     public/ is copied wholesale and nothing checks that what the bundle
     asks for is in there.

  2. RAW.GITHUBUSERCONTENT URL pinned to a ref in THIS repo
     Not served by this site at all. Meta fetches these by URL when a card
     is delivered, so they must resolve for anyone, forever.

     A URL pinned to refs/heads/<branch> lives exactly as long as that
     branch does. Deleting a "stale" branch is normally free; deleting one
     of these takes live public images down with it. That is worth a loud
     warning, because nothing else in the repo says so.

Exits non-zero if any reference cannot be resolved, so it can gate a
build. Run by .github/workflows/ci.yml and by scripts/sync-hermes.py.
"""
import json, pathlib, re, subprocess, sys

REPO = pathlib.Path(__file__).resolve().parent.parent
BUNDLE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / "src" / "data" / "hermes.json"

# Only this repo's own raw URLs are checkable — a foreign host is somebody
# else's uptime and this script does not make network calls.
RAW = re.compile(
    r"^https://raw\.githubusercontent\.com/wanshah07/Wanshah-Test/(?P<ref>.+?)/public/(?P<path>media/.+)$"
)


def strings(o):
    """Every string anywhere in the bundle, at any depth."""
    if isinstance(o, dict):
        for v in o.values():
            yield from strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from strings(v)
    elif isinstance(o, str):
        yield o


def git(*args):
    return subprocess.run(["git", "-C", str(REPO), *args],
                          capture_output=True, text=True)


def resolve(ref: str) -> str | None:
    """A ref as this checkout can name it, or None if it is not here.

    A URL says refs/heads/<branch>, which a fresh clone does not have —
    it has refs/remotes/origin/<branch>. Try both, plus the bare SHA.
    """
    candidates = [ref]
    if ref.startswith("refs/heads/"):
        candidates.append("refs/remotes/origin/" + ref[len("refs/heads/"):])
    for c in candidates:
        if git("rev-parse", "--verify", "--quiet", c + "^{commit}").returncode == 0:
            return c
    return None


def main() -> int:
    if not BUNDLE.is_file():
        print(f"check-media: no bundle at {BUNDLE}", file=sys.stderr)
        return 1

    bundle = json.loads(BUNDLE.read_text(encoding="utf-8"))
    refs = sorted({s for s in strings(bundle) if "media/" in s})

    shallow = git("rev-parse", "--is-shallow-repository").stdout.strip() == "true"
    errors, warnings, checked = [], [], 0

    for ref in refs:
        m = RAW.match(ref)

        if m is None:
            if ref.startswith("http"):
                continue  # someone else's host, not ours to verify
            checked += 1
            if not (REPO / "public" / ref).is_file():
                errors.append(f"missing from public/: {ref}")
            continue

        git_ref, path = m.group("ref"), m.group("path")
        checked += 1

        if git_ref.startswith("refs/heads/"):
            branch = git_ref[len("refs/heads/"):]
            if branch != "main":
                warnings.append(
                    f"pinned to branch {branch!r}, so deleting that branch "
                    f"breaks a live public image: {path}")

        resolved = resolve(git_ref)
        if resolved is None:
            msg = f"ref {git_ref!r} not in this checkout, cannot verify: {path}"
            (warnings if shallow else errors).append(msg)
            continue

        if git("cat-file", "-e", f"{resolved}:public/{path}").returncode != 0:
            errors.append(f"not at {git_ref}: public/{path}")

    for w in warnings:
        print(f"check-media: warning: {w}")
    for e in errors:
        print(f"check-media: ERROR: {e}", file=sys.stderr)

    if shallow and warnings:
        print("check-media: shallow clone — fetch all branches to verify "
              "pinned refs (git fetch --unshallow, or fetch-depth: 0 in CI)")

    if errors:
        print(f"\ncheck-media: {len(errors)} broken reference(s) "
              f"of {checked} checked", file=sys.stderr)
        return 1

    print(f"check-media: {checked} media reference(s) OK"
          + (f", {len(warnings)} warning(s)" if warnings else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
