# Hermes → Threads (official API) — setup in ~10 minutes

## 1. Create the Meta app (once)
1. https://developers.facebook.com/apps → **Create App**
2. Use case: **Access the Threads API** → Next. Name: `WS Regulab Hermes`. Create.
3. Left menu → **Use cases → Customize** → tick `threads_basic` and `threads_content_publish`.
4. **Settings → Basic**: copy **Threads App ID** and **Threads App Secret**
   (these are different from the Facebook App ID — use the *Threads* ones).
5. **Use cases → Settings**: add Redirect Callback URL `https://www.kkmhalalconsultant.com/`
   (must match `THREADS_REDIRECT_URI` exactly, trailing slash included).
6. **App roles → Roles → Add People → Threads Tester** → enter the ws.regulab Threads username.
7. Open Threads app on phone → Settings → Account → **Website permissions → Invites** → Accept.

No App Review needed: posting to your own account works in Standard Access.

## 2. Get the token (once, on your laptop)
```bash
export THREADS_APP_ID=xxxx THREADS_APP_SECRET=xxxx
python hermes/tools/threads_token.py auth-url        # open URL, log in as ws.regulab, approve
python hermes/tools/threads_token.py exchange "<code from redirect URL>"
```
Prints `THREADS_USER_ID` and a 60-day `THREADS_TOKEN`.

## 3. GitHub secrets (repo → Settings → Secrets → Actions)
| Secret | Value |
|---|---|
| `THREADS_TOKEN` | from step 2 |
| `THREADS_USER_ID` | from step 2 |
| `GH_PAT` | fine-grained PAT, this repo only, permission **Secrets: Read & write** (for auto-refresh) |

## 4. Test
1. Commit `hermes/out/approved/EXAMPLE_ujian.json` → the publish workflow fires.
2. Check Threads. Delete the test post from the app.
3. Rename/remove the example so it doesn't re-fire.

## 5. Daily operation (keeps your "never auto-publish" rule)
- Hermes drafts nightly into `hermes/out/drafts/` as before.
- **You** review and `git mv` an approved file into `hermes/out/approved/`.
- 09:00 MYT the workflow posts it, logs the permalink to `hermes/out/published/<date>/`.
- Anything with `[SAHKAN:]`, >500 chars, or a non-https image URL is refused and parked in `hermes/out/failed/`.

## Gotchas
- Image posts: `image_url` must be public HTTPS (push the Chromium card to GitHub Pages first).
- Token dies at day 60 — `threads-refresh.yml` renews on the 1st and 20th; if it ever fails, redo step 2.
- No edit endpoint on Threads: typo = delete in-app + re-approve.
