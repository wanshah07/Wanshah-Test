#!/usr/bin/env python3
"""
One-time token setup + 60-day refresh for the Threads API.

STEP 1 (once, on your laptop):
    export THREADS_APP_ID=...   THREADS_APP_SECRET=...
    python hermes/tools/threads_token.py auth-url
        → open the URL, log in as ws.regulab, approve, copy the ?code=... from the redirect
    python hermes/tools/threads_token.py exchange "<code>"
        → prints THREADS_USER_ID and a LONG-LIVED THREADS_TOKEN → paste both into GitHub secrets

STEP 2 (automated by threads-refresh.yml every 50 days):
    python hermes/tools/threads_token.py refresh
        → prints new token (workflow writes it back to the secret)
"""
import json, os, sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen

REDIRECT = os.environ.get("THREADS_REDIRECT_URI", "https://www.kkmhalalconsultant.com/")
SCOPES = "threads_basic,threads_content_publish"


def post(url, **p):
    with urlopen(Request(url, data=urlencode(p).encode(), method="POST"), timeout=30) as r:
        return json.load(r)


def get(url, **p):
    with urlopen(f"{url}?{urlencode(p)}", timeout=30) as r:
        return json.load(r)


def auth_url():
    q = dict(client_id=os.environ["THREADS_APP_ID"], redirect_uri=REDIRECT,
             scope=SCOPES, response_type="code")
    print("https://threads.net/oauth/authorize?" + urlencode(q))


def exchange(code):
    code = code.split("#")[0]                       # Meta appends '#_'
    short = post("https://graph.threads.net/oauth/access_token",
                 client_id=os.environ["THREADS_APP_ID"],
                 client_secret=os.environ["THREADS_APP_SECRET"],
                 grant_type="authorization_code", redirect_uri=REDIRECT, code=code)
    long_ = get("https://graph.threads.net/access_token",
                grant_type="th_exchange_token",
                client_secret=os.environ["THREADS_APP_SECRET"],
                access_token=short["access_token"])
    me = get("https://graph.threads.net/v1.0/me", fields="id,username",
             access_token=long_["access_token"])
    print(f"THREADS_USER_ID={me['id']}   (@{me['username']})")
    print(f"THREADS_TOKEN={long_['access_token']}")
    print(f"expires_in={long_['expires_in']}s (~{long_['expires_in']//86400} days)")


def refresh():
    new = get("https://graph.threads.net/refresh_access_token",
              grant_type="th_refresh_token", access_token=os.environ["THREADS_TOKEN"])
    print(new["access_token"])                       # stdout only → workflow captures it


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    {"auth-url": auth_url,
     "exchange": lambda: exchange(sys.argv[2]),
     "refresh": refresh}.get(cmd, lambda: sys.exit(__doc__))()
