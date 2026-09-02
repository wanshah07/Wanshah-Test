# Standing rules for this repo

Read this before editing anything.

## 1. This repo is PUBLIC

It is served at https://wanshah07.github.io/Wanshah-Test/. Everything
merged to `main` is world-readable, immediately and permanently. Git
history included — a secret removed in a later commit is still in the log.

This repo is the **consumer**. The Hermes source of truth is the private
repo `malaysian-regulatory-affairs`. Nothing from there belongs here
except what `scripts/sync-hermes.py` puts here.

## 2. `src/data/hermes.json` is generated. Never hand-edit it.

It is a build-time snapshot, produced by:

    python3 scripts/sync-hermes.py ../malaysian-regulatory-affairs

Both checkouts must sit side by side for that relative path to resolve.
On Wan's machine they are `C:\Users\Muham\Wanshah-Test` and
`C:\Users\Muham\malaysian-regulatory-affairs`.

To change what the dashboard shows, change the generator, then re-run it.
Editing the JSON directly means the next sync silently reverts you.

## 3. Do not weaken the redaction

`scripts/sync-hermes.py` holds a `PRIVATE_FIELDS` deny-list and a
recursive `redact()`:

    nota, approved_by, approved_fingerprint, kelulusan_dipulihkan

These are internal operating notes — approval-withdrawal audit trails,
tooling commit SHAs, approver identity, content fingerprints. They
document how the pipeline is run, not what it published, and they must
not reach a public URL.

The redaction happens in the **generator**, deliberately. A dashboard
component that declines to render a field does not make that field
private — the JSON still ships. Do not move this filtering into the UI.

Never publishable, whatever the source: caption text, unapproved drafts,
client names, case details, anything from the private repo's
`facts.yml`, WhatsApp content.

## 4. Merging to `main` is a publishing decision

`main` is branch-protected: a PR is required. Approvals are off so Wan
can self-merge, but the PR step is not a formality — it is the last look
before content is public.

Pushing to `main` triggers `.github/workflows/deploy-pages.yml` and the
site goes live. Card images under `public/media/` are the one category
that routinely goes straight through.

Work on a branch cut from an up-to-date `main`:

    git checkout main && git pull && git checkout -b <branch>

Cutting from a stale `main` has already happened once here.

## 5. Line endings

`.gitattributes` sets `* text=auto`. If every file suddenly shows as
modified, that is CRLF, not a real change:

    git config core.autocrlf true

Do not commit it. Check with `git diff --ignore-all-space --stat` — if
that comes back empty, there is no real change.

## 6. Language

Bahasa Malaysia, never Bahasa Indonesia. `boleh` not `bisa`, `ubat` not
`obat`, `syarikat` not `perusahaan`, `kualiti` not `kualitas`.
