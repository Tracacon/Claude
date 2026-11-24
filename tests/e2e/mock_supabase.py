"""Nachgebauter Supabase-Server für den Oberflächentest (nur lokal, nur Test).

Bildet die wenigen Endpunkte nach, die Phase 1 nutzt: Einmalcode, Prüfung,
Nutzer, Profile und die RPC-Funktionen. Die Zugriffsregeln selbst werden in
tests/db gegen echtes Postgres geprüft, nicht hier.

Start: python3 tests/e2e/mock_supabase.py 54321
Gültiger Code ist immer 123456.
"""

import base64
import hashlib
import hmac
import json
import sys
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

SECRET = b"test-secret"
CODE = "123456"
users: dict[str, dict] = {}  # email -> user
profiles: dict[str, dict] = {}  # id -> profile
sent_codes: list[str] = []


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def make_jwt(user: dict) -> str:
    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    now = int(time.time())
    payload = b64(
        json.dumps(
            {"sub": user["id"], "email": user["email"], "role": "authenticated", "aud": "authenticated",
             "iat": now, "exp": now + 3600, "session_id": str(uuid.uuid4())}
        ).encode()
    )
    sig = b64(hmac.new(SECRET, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


def user_from_token(token: str):
    try:
        header, payload, sig = token.split(".")
        expected = b64(hmac.new(SECRET, f"{header}.{payload}".encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload + "=="))
        return next((u for u in users.values() if u["id"] == data["sub"]), None)
    except Exception:
        return None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        return json.loads(raw) if raw else {}

    def send(self, status, data=None):
        payload = b"" if data is None else json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def me(self):
        auth = self.headers.get("Authorization", "")
        return user_from_token(auth.removeprefix("Bearer ").strip())

    def session(self, user):
        return {"access_token": make_jwt(user), "token_type": "bearer", "expires_in": 3600,
                "expires_at": int(time.time()) + 3600, "refresh_token": uuid.uuid4().hex, "user": user}

    # --- Auth -------------------------------------------------------------
    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/auth/v1/user":
            u = self.me()
            return self.send(200, u) if u else self.send(401, {"code": "bad_jwt", "msg": "invalid"})
        if url.path.endswith("jwks.json"):
            return self.send(200, {"keys": []})
        if url.path == "/rest/v1/profiles":
            u = self.me()
            if not u:
                return self.send(401, {"message": "permission denied"})
            q = parse_qs(url.query)
            rows = [p for p in profiles.values() if p["nickname"] or p["id"] == u["id"]]
            if "id" in q:
                rows = [p for p in rows if p["id"] == q["id"][0].removeprefix("eq.")]
            if "nickname" in q:
                needle = q["nickname"][0].removeprefix("ilike.").replace("\\", "").lower()
                rows = [p for p in rows if (p["nickname"] or "").lower() == needle]
            if "vnd.pgrst.object" in self.headers.get("Accept", ""):
                if not rows:
                    return self.send(406, {"code": "PGRST116", "message": "no rows"})
                return self.send(200, rows[0])
            return self.send(200, rows)
        if url.path == "/test/codes":
            return self.send(200, sent_codes)
        return self.send(404, {"message": "not found"})

    def do_POST(self):
        url = urlparse(self.path)
        data = self.body()
        if url.path == "/auth/v1/otp":
            email = data["email"].lower()
            if email not in users:
                uid = str(uuid.uuid4())
                users[email] = {"id": uid, "email": email, "aud": "authenticated", "role": "authenticated",
                                "app_metadata": {}, "user_metadata": data.get("data") or {},
                                "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")}
                profiles[uid] = {"id": uid, "nickname": None, "city": None, "bio": None, "website": None,
                                 "locale": (data.get("data") or {}).get("locale", "de"), "role": "member",
                                 "age_confirmed_at": None, "terms_accepted_at": None,
                                 "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")}
                if len(users) == 1:
                    profiles[uid]["role"] = "admin"  # erster Nutzer = Admin, wie per SQL im Handbuch
            sent_codes.append(email)
            return self.send(200, {})
        if url.path == "/auth/v1/verify":
            user = users.get(data.get("email", "").lower())
            if not user or data.get("token") != CODE:
                return self.send(403, {"code": "otp_expired", "msg": "Token has expired or is invalid"})
            return self.send(200, self.session(user))
        if url.path == "/auth/v1/logout":
            return self.send(204)
        if url.path.startswith("/rest/v1/rpc/"):
            return self.rpc(url.path.rsplit("/", 1)[1], data)
        return self.send(404, {"message": "not found"})

    def do_PATCH(self):
        url = urlparse(self.path)
        data = self.body()
        u = self.me()
        if url.path == "/rest/v1/profiles" and u:
            target = parse_qs(url.query)["id"][0].removeprefix("eq.")
            if target == u["id"]:
                profiles[target].update({k: v for k, v in data.items() if k in ("city", "bio", "website", "locale")})
            return self.send(204)
        return self.send(401, {"message": "permission denied"})

    def rpc(self, name, data):
        u = self.me()
        if not u:
            return self.send(401, {"code": "42501", "message": "permission denied"})
        me = profiles[u["id"]]
        if name == "complete_onboarding":
            nick = data["p_nickname"]
            if any((p["nickname"] or "").lower() == nick.lower() for p in profiles.values() if p["id"] != u["id"]) \
                    or nick.lower() == "vergeben":
                return self.send(409, {"code": "23505",
                                       "message": 'duplicate key value violates unique constraint "profiles_nickname_unique"'})
            me.update(nickname=nick, age_confirmed_at="now", terms_accepted_at="now")
            return self.send(200, me)
        if name == "admin_list_users":
            if me["role"] != "admin":
                return self.send(403, {"code": "42501", "message": "forbidden"})
            rows = [{"id": p["id"], "email": e["email"], "nickname": p["nickname"], "role": p["role"],
                     "created_at": p["created_at"], "last_sign_in_at": None}
                    for e in users.values() for p in [profiles[e["id"]]]]
            return self.send(200, rows)
        if name == "set_user_role":
            if me["role"] != "admin":
                return self.send(403, {"code": "42501", "message": "forbidden"})
            target = profiles[data["p_user_id"]]
            admins = [p for p in profiles.values() if p["role"] == "admin"]
            if data["p_role"] != "admin" and target["role"] == "admin" and len(admins) <= 1:
                return self.send(400, {"code": "22023", "message": "last_admin"})
            target["role"] = data["p_role"]
            return self.send(200, target)
        if name == "delete_own_account":
            users.pop(u["email"], None)
            profiles.pop(u["id"], None)
            return self.send(204)
        return self.send(404, {"message": "unknown rpc"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 54321
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
