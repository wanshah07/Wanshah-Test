# Standing rules for this repo

Read this before editing anything.

## 1. This repo is PUBLIC

It is served at https://wanshah07.github.io/Wanshah-Test/. Everything
merged to `main` is world-readable, immediately and permanently. Git
history included — a secret removed in a later commit is still in the log.

Hermes was retired on 5 September 2026. Nothing from the private repo
`malaysian-regulatory-affairs` belongs here. The only data file is
`src/data/notes.json` (date, domain, angle, instrument, links to published
posts). Never publishable, whatever the source: caption text, unapproved
drafts, client names, case details, WhatsApp content.


## 4. Merging to `main` is a publishing decision

`main` is branch-protected: a PR is required. Approvals are off so Wan
can self-merge, but the PR step is not a formality — it is the last look
before content is public.

Pushing to `main` triggers `.github/workflows/deploy-pages.yml` and the
site goes live. 

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
