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
listings: dict[str, dict] = {}  # id -> listing
photos: dict[str, dict] = {}  # id -> {listing_id, owner_id, position}
reports: dict[str, dict] = {}
files: dict[str, bytes] = {}  # storage path -> bytes
conversations: dict[str, dict] = {}
messages: list[dict] = []
blocks: set[tuple[str, str]] = set()


PUBLIC_BUCKETS = ("listing-photos", "avatars")
SERVICE_KEY = "sb_secret_test"
ODOO_KEY = "odoo-test-key"
events: dict[str, dict] = {}  # id -> event (wie public.events)
listing_events: set[tuple[str, str]] = set()  # (listing_id, event_id)
checkin_codes: dict[str, str] = {}  # event_id -> code
checkins: dict[tuple[str, str], str] = {}  # (event_id, user_id) -> Zeit
sync_state = {"synced_at": None, "error": None}
odoo_calls: list[str] = []


def odoo_time(hours):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(time.time() + hours * 3600))


# Nachgebaute Odoo-Termine (Modell event.event). Über /test/odoo änderbar.
odoo_events = [
    {"id": 7, "name": "TNS Stuttgart Testabend", "subtitle": "Trade Night Show", "date_begin": odoo_time(-1), "date_end": odoo_time(5),
     "date_tz": "Europe/Berlin", "address_id": [50, "Halle West"], "is_published": True, "website_url": "/event/tns-stuttgart-7",
     "description": '<p>Tickets: <a href="https://www.eventim.de/event/tns-stuttgart-123/?affiliate=TRA&amp;x=1">EVENTIM</a></p>',
     "x_studio_eventim_link": False},
    {"id": 8, "name": "Messe Kornwestheim", "subtitle": False, "date_begin": odoo_time(24 * 10), "date_end": odoo_time(24 * 10 + 8),
     "date_tz": "Europe/Berlin", "address_id": [51, "Das K."], "is_published": True, "website_url": "/event/messe-8",
     "description": False, "x_studio_eventim_link": "https://www.eventim.de/event/messe-kornwestheim-456/"},
    {"id": 9, "name": "Interner Planungstermin", "subtitle": False, "date_begin": odoo_time(24 * 3), "date_end": odoo_time(24 * 3 + 2),
     "date_tz": "Europe/Berlin", "address_id": False, "is_published": False, "website_url": "/event/intern-9",
     "description": False, "x_studio_eventim_link": False},
]
odoo_partners = {50: {"id": 50, "name": "Halle West", "street": "Hauptstraße 1", "zip": "70173", "city": "Stuttgart"},
                 51: {"id": 51, "name": "Das K.", "street": "Stuttgarter Str. 65", "zip": "70806", "city": "Kornwestheim"}}


def parse_iso(v):
    from datetime import datetime
    return datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp()


def ev_count_listings(eid):
    return sum(1 for (lid, e) in listing_events if e == eid and lid in listings and listings[lid]["status"] in ("active", "reserved"))


def ev_public(e, uid):
    return {k: e[k] for k in ("id", "name", "subtitle", "starts_at", "ends_at", "timezone", "venue", "city", "ticket_url")} | {
        "listing_count": ev_count_listings(e["id"]),
        "checkin_count": sum(1 for (ev, _) in checkins if ev == e["id"]),
        "checked_in": (e["id"], uid) in checkins}


def visits(uid):
    return sum(1 for (_, u) in checkins if u == uid)
follows: dict[tuple[str, str], str] = {}  # (follower, following) -> pending/accepted


def can_view(viewer, owner):
    p = profiles.get(owner)
    return bool(p) and (viewer == owner or p["profile_visibility"] == "public"
                        or follows.get((viewer, owner)) == "accepted" or is_team(viewer))


def profile_by_nick(nick):
    return next((p for p in profiles.values() if (p["nickname"] or "").lower() == (nick or "").lower()), None)
file_owner: dict[str, str] = {}


def sign_token(bucket, path):
    return hmac.new(SECRET, f"{bucket}/{path}".encode(), hashlib.sha256).hexdigest()[:32]


def can_write(u, bucket, path):
    if not u:
        return False
    if bucket in ("listing-photos", "avatars"):
        return path.startswith(u["id"] + "/")
    if bucket == "chat-photos":
        c = conversations.get(path.split("/", 1)[0])
        return bool(c and u["id"] in (c["seller_id"], c["buyer_id"]))
    return False


def can_read(u, bucket, path):
    if bucket in PUBLIC_BUCKETS:
        return True
    if not u or bucket != "chat-photos":
        return False
    c = conversations.get(path.split("/", 1)[0])
    if not c:
        return False
    if u["id"] in (c["seller_id"], c["buyer_id"]):
        return True
    return is_team(u["id"]) and any(r.get("conversation_id") == c["id"] for r in reports.values())


def blocked_between(a, b):
    return (a, b) in blocks or (b, a) in blocks


def conv_for(cid, uid):
    c = conversations.get(cid)
    return c if c and uid in (c["seller_id"], c["buyer_id"]) else None


def unread_for(c, uid):
    last = c["seller_last_read_at"] if c["seller_id"] == uid else c["buyer_last_read_at"]
    return sum(1 for m in messages if m["conversation_id"] == c["id"] and m["sender_id"] != uid and (last is None or m["created_at"] > last))


def hidden_for(c, uid):
    return c["seller_hidden_at"] if c["seller_id"] == uid else c["buyer_hidden_at"]


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + f".{int(time.time() * 1e6) % 1000000:06d}Z"


def is_team(uid):
    p = profiles.get(uid or "")
    return bool(p and p["role"] in ("team", "admin"))


def visible(l, uid):
    return l["status"] in ("active", "reserved") or l["owner_id"] == uid or is_team(uid)


def listing_photos(lid):
    return [pid for pid, ph in sorted(photos.items(), key=lambda kv: kv[1]["position"]) if ph["listing_id"] == lid]


class RpcError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message


def apply_payload(l, p):
    title = (p.get("title") or "").strip()
    if len(title) < 3:
        raise RpcError(400, "23514", 'violates check constraint "listings_title_length"')
    offer = p.get("offer") or "sell"
    price = None if offer == "trade" else p.get("price_cents")
    if offer != "trade" and price is None:
        raise RpcError(400, "23514", 'violates check constraint "listings_price_for_sale"')
    if not (p.get("handover_event") or p.get("handover_pickup") or p.get("handover_shipping")):
        raise RpcError(400, "23514", 'violates check constraint "listings_handover"')
    l.update(title=title, description=p.get("description"), tcg=p["tcg"], kind=p.get("kind") or "single",
             offer=offer, price_cents=price, negotiable=bool(p.get("negotiable")), condition=p.get("condition"),
             card_language=p.get("card_language"), grading=p.get("grading"), city=p.get("city"),
             handover_event=bool(p.get("handover_event")), handover_pickup=bool(p.get("handover_pickup")),
             handover_shipping=bool(p.get("handover_shipping")), updated_at=now_iso())


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

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin") or "*")
        self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def raw_body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def send(self, status, data=None):
        payload = b"" if data is None else json.dumps(data).encode()
        self.send_response(status)
        self.cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def create_user(self, email, meta, confirmed):
        uid = str(uuid.uuid4())
        users[email] = {"id": uid, "email": email, "aud": "authenticated", "role": "authenticated",
                        "app_metadata": {}, "user_metadata": meta, "confirmed": confirmed,
                        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")}
        profiles[uid] = {"id": uid, "nickname": None, "city": None, "bio": None, "website": None,
                         "locale": meta.get("locale", "de"), "role": "member",
                         "age_confirmed_at": None, "terms_accepted_at": None,
                         "avatar_id": None, "profile_visibility": "public", "follow_approval": False,
                         "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")}
        if len(users) == 1:
            profiles[uid]["role"] = "admin"  # erster Nutzer = Admin, wie per SQL im Handbuch

    @staticmethod
    def public_user(user):
        return {k: v for k, v in user.items() if k not in ("password", "confirmed")}

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
            return self.send(200, {k: v for k, v in u.items() if k != "password"}) if u else self.send(401, {"error_code": "bad_jwt", "code": "bad_jwt", "msg": "invalid"})
        if url.path.endswith("jwks.json"):
            return self.send(200, {"keys": []})
        if url.path == "/rest/v1/profiles":
            u = self.me()
            if not u:
                return self.send(401, {"message": "permission denied"})
            q = parse_qs(url.query)
            rows = [p for p in profiles.values() if p["id"] == u["id"] or is_team(u["id"])]  # wie die Zugriffsregel
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
        if url.path.startswith("/storage/v1/object/public/") or url.path.startswith("/storage/v1/object/sign/"):
            public = url.path.startswith("/storage/v1/object/public/")
            bucket, path = url.path.split("/object/", 1)[1].split("/", 1)[1].split("/", 1)
            if public and bucket not in PUBLIC_BUCKETS:
                return self.send(400, {"message": "bucket not public"})
            if not public and parse_qs(url.query).get("token", [""])[0] != sign_token(bucket, path):
                return self.send(400, {"message": "invalid signature"})
            data = files.get(f"{bucket}/{path}")
            if data is None:
                return self.send(404, {"message": "not found"})
            self.send_response(200)
            self.cors()
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        if url.path == "/test/codes":
            return self.send(200, sent_codes)
        if url.path == "/test/odoo-calls":
            return self.send(200, odoo_calls)
        return self.send(404, {"message": "not found"})

    def do_POST(self):
        url = urlparse(self.path)
        if url.path.startswith("/storage/v1/object/list/"):
            u = self.me()
            bucket = url.path.split("/object/list/", 1)[1].strip("/")
            data = self.body()
            prefix = (data.get("prefix") or "").strip("/")
            names = [k.split("/", 2)[2] for k in files if k.startswith(f"{bucket}/{prefix}/")] if u else []
            return self.send(200, [{"name": n, "id": n} for n in names])
        if url.path.startswith("/storage/v1/object/sign/"):
            u = self.me()
            rest = url.path.split("/object/sign/", 1)[1]
            data = self.body()
            if "/" not in rest:  # mehrere Pfade auf einmal
                out = [{"path": pth, "error": None if can_read(u, rest, pth) else "not found",
                        "signedURL": f"/object/sign/{rest}/{pth}?token={sign_token(rest, pth)}" if can_read(u, rest, pth) else None}
                       for pth in data.get("paths", [])]
                return self.send(200, out)
            bucket, path = rest.split("/", 1)
            if not can_read(u, bucket, path) or f"{bucket}/{path}" not in files:
                return self.send(400, {"statusCode": "404", "error": "not_found", "message": "Object not found"})
            return self.send(200, {"signedURL": f"/object/sign/{bucket}/{path}?token={sign_token(bucket, path)}"})
        if url.path.startswith("/storage/v1/object/"):
            u = self.me()
            bucket, path = url.path.split("/storage/v1/object/", 1)[1].split("/", 1)
            body = self.raw_body()
            if not can_write(u, bucket, path):
                return self.send(403, {"statusCode": "403", "error": "Unauthorized", "message": "new row violates row-level security policy"})
            if len(body) > 2097152:
                return self.send(413, {"statusCode": "413", "error": "Payload too large", "message": "too large"})
            ctype = self.headers.get("Content-Type", "")
            if ctype.startswith("multipart/form-data"):
                # supabase-js schickt Blobs im Browser als FormData; die Datei steckt im Teil mit Bild-Typ
                boundary = ctype.split("boundary=", 1)[1].strip('"').encode()
                for part in body.split(b"--" + boundary):
                    head, _, content = part.partition(b"\r\n\r\n")
                    if b"image/" in head.lower():
                        body = content.rsplit(b"\r\n", 1)[0]
                        break
            files[f"{bucket}/{path}"] = body
            file_owner[f"{bucket}/{path}"] = u["id"]
            return self.send(200, {"Key": f"{bucket}/{path}", "Id": path})
        data = self.body()
        if url.path == "/auth/v1/otp":
            email = data["email"].lower()
            if email not in users:
                if data.get("create_user") is False:
                    return self.send(422, {"error_code": "otp_disabled", "code": "otp_disabled", "msg": "Signups not allowed for otp"})
                self.create_user(email, data.get("data") or {}, confirmed=True)
            sent_codes.append(email)
            return self.send(200, {})
        if url.path == "/auth/v1/signup":
            email = data["email"].lower()
            if email in users and users[email].get("confirmed", True):
                # wie Supabase bei aktiver E-Mail-Bestätigung: Platzhalter ohne Identitäten
                return self.send(200, {"id": str(uuid.uuid4()), "email": email, "aud": "authenticated", "identities": []})
            if email not in users:
                self.create_user(email, data.get("data") or {}, confirmed=False)
            users[email]["password"] = data.get("password")
            sent_codes.append(email)
            u = self.public_user(users[email])
            u["identities"] = [{"id": u["id"], "provider": "email"}]
            return self.send(200, u)
        if url.path == "/auth/v1/resend":
            sent_codes.append(data.get("email", ""))
            return self.send(200, {})
        if url.path == "/auth/v1/verify":
            user = users.get(data.get("email", "").lower())
            if not user or data.get("token") != CODE:
                return self.send(403, {"error_code": "otp_expired", "code": "otp_expired", "msg": "Token has expired or is invalid"})
            user["confirmed"] = True
            return self.send(200, self.session(self.public_user(user)))
        if url.path == "/auth/v1/token" and "grant_type=password" in (url.query or ""):
            user = users.get(data.get("email", "").lower())
            if not user or not user.get("password") or user["password"] != data.get("password"):
                return self.send(400, {"error_code": "invalid_credentials", "code": "invalid_credentials", "msg": "Invalid login credentials"})
            if not user.get("confirmed", True):
                return self.send(400, {"error_code": "email_not_confirmed", "code": "email_not_confirmed", "msg": "Email not confirmed"})
            return self.send(200, self.session(self.public_user(user)))
        if url.path == "/auth/v1/logout":
            return self.send(204)
        if url.path.startswith("/rest/v1/rpc/"):
            return self.rpc(url.path.rsplit("/", 1)[1], data)
        if url.path.startswith("/json/2/"):
            return self.odoo(url.path.split("/json/2/", 1)[1], data)
        if url.path == "/test/odoo":
            # Termin verschieben: {"id": 8, "hours": -1} lässt ihn jetzt beginnen
            for e in odoo_events:
                if e["id"] == data["id"]:
                    e["date_begin"] = odoo_time(data["hours"])
                    e["date_end"] = odoo_time(data["hours"] + 6)
            return self.send(200, {})
        return self.send(404, {"message": "not found"})

    def odoo(self, path, data):
        odoo_calls.append(path)
        if self.headers.get("Authorization", "") != f"bearer {ODOO_KEY}":
            return self.send(401, {"name": "odoo.exceptions.AccessDenied", "message": "Access Denied"})
        model, method = path.split("/", 1)
        if model == "event.event" and method == "fields_get":
            names = ["name", "subtitle", "date_begin", "date_end", "date_tz", "address_id", "is_published", "website_url", "description"]
            out = {n: {"type": "char", "string": n} for n in names}
            out["x_studio_eventim_link"] = {"type": "char", "string": "EVENTIM-Link"}
            return self.send(200, out)
        if model == "event.event" and method == "search_read":
            since = data["domain"][0][2]
            rows = [{k: e[k] for k in ["id", *data["fields"]] if k in e} for e in odoo_events if e["date_end"] >= since]
            return self.send(200, rows)
        if model == "res.partner" and method == "read":
            return self.send(200, [odoo_partners[i] for i in data["ids"] if i in odoo_partners])
        return self.send(404, {"message": "not found"})

    def do_PUT(self):
        url = urlparse(self.path)
        data = self.body()
        u = self.me()
        if url.path == "/auth/v1/user" and u:
            if "password" in data:
                if len(data["password"]) < 6:
                    return self.send(422, {"error_code": "weak_password", "code": "weak_password", "msg": "weak"})
                if users[u["email"]].get("password") == data["password"]:
                    return self.send(422, {"error_code": "same_password", "code": "same_password", "msg": "same"})
                users[u["email"]]["password"] = data["password"]
            return self.send(200, {k: v for k, v in users[u["email"]].items() if k != "password"})
        return self.send(401, {"message": "unauthorized"})

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

    def do_DELETE(self):
        url = urlparse(self.path)
        if url.path.startswith("/storage/v1/object/"):
            u = self.me()
            bucket = url.path.split("/storage/v1/object/", 1)[1].strip("/")
            data = self.body()
            removed = []
            for path in data.get("prefixes", []):
                key = f"{bucket}/{path}"
                if u and bucket in ("listing-photos", "avatars") and path.startswith(u["id"] + "/") and key in files:
                    files.pop(key)
                    removed.append({"name": path})
            return self.send(200, removed)
        return self.send(404, {"message": "not found"})

    def rpc(self, name, data):
        try:
            return self.rpc_inner(name, data)
        except RpcError as e:
            return self.send(e.status, {"code": e.code, "message": e.message})

    def public_rpc(self, name, data):
        me = self.me()
        uid = me["id"] if me else None
        if name == "get_listing":
            l = listings.get(data["p_id"])
            if not l or not visible(l, uid):
                return self.send(200, None)
            o = profiles[l["owner_id"]]
            return self.send(200, {"listing": l, "owner": {"nickname": o["nickname"], "role": o["role"], "member_since": o["created_at"],
                                                           "avatar_id": o["avatar_id"] if can_view(uid, o["id"]) else None},
                                   "photos": listing_photos(l["id"]), "is_owner": l["owner_id"] == uid,
                                   "can_moderate": is_team(uid)})
        if name == "get_profile":
            p = profile_by_nick(data["p_nickname"])
            if not p or not p["nickname"]:
                return self.send(200, None)
            cv = can_view(uid, p["id"])
            return self.send(200, {
                "id": p["id"], "nickname": p["nickname"], "role": p["role"], "member_since": p["created_at"],
                "is_me": p["id"] == uid, "can_view": cv, "visibility": p["profile_visibility"],
                "avatar_id": p["avatar_id"] if cv else None, "bio": p["bio"] if cv else None,
                "city": p["city"] if cv else None, "website": p["website"] if cv else None,
                "listing_count": sum(1 for l in listings.values() if l["owner_id"] == p["id"] and l["status"] in ("active", "reserved")),
                "follower_count": sum(1 for (a, b), st in follows.items() if b == p["id"] and st == "accepted"),
                "following_count": sum(1 for (a, b), st in follows.items() if a == p["id"] and st == "accepted"),
                "my_follow": follows.get((uid, p["id"]), "none"), "follows_me": follows.get((p["id"], uid)) == "accepted",
                "blocked": bool(uid) and blocked_between(uid, p["id"]),
                "badges": [b for b, ok in (("team", p["role"] in ("team", "admin")), ("founder", True),
                                           ("first_listing", any(l["owner_id"] == p["id"] for l in listings.values())),
                                           ("regular_3", 3 <= visits(p["id"]) < 10)) if ok]})
        if name == "profile_listings":
            p = profile_by_nick(data["p_nickname"])
            if not p or not can_view(uid, p["id"]):
                return self.send(200, [])
            rows = [l for l in listings.values() if l["owner_id"] == p["id"] and l["status"] in ("active", "reserved")]
            rows.sort(key=lambda l: l["created_at"], reverse=True)
            return self.send(200, [{**{k: l[k] for k in ("id", "title", "tcg", "kind", "offer", "price_cents", "negotiable", "condition",
                                                         "city", "status", "created_at", "owner_id")},
                                    "owner_nickname": p["nickname"], "cover_photo_id": (listing_photos(l["id"]) or [None])[0],
                                    "total_count": len(rows)} for l in rows])
        if name == "list_follows":
            p = profile_by_nick(data["p_nickname"])
            if not p or not can_view(uid, p["id"]):
                return self.send(200, [])
            kind = data["p_kind"]
            ids = [a for (a, b), st in follows.items() if b == p["id"] and st == "accepted"] if kind == "followers" else \
                  [b for (a, b), st in follows.items() if a == p["id"] and st == "accepted"]
            return self.send(200, [{"id": i, "nickname": profiles[i]["nickname"],
                                    "avatar_id": profiles[i]["avatar_id"] if can_view(uid, i) else None,
                                    "my_follow": follows.get((uid, i), "none"), "is_me": i == uid} for i in ids])
        q = (data.get("p_query") or "").lower()
        rows = [l for l in listings.values() if l["status"] in ("active", "reserved")]
        if q:
            rows = [l for l in rows if q in (l["title"] + " " + (l["description"] or "")).lower()]
        for key, col in (("p_tcg", "tcg"), ("p_kind", "kind")):
            if data.get(key):
                rows = [l for l in rows if l[col] == data[key]]
        if data.get("p_offer"):
            rows = [l for l in rows if l["offer"] == data["p_offer"] or (data["p_offer"] != "sell_or_trade" and l["offer"] == "sell_or_trade")]
        if data.get("p_min_cents") is not None:
            rows = [l for l in rows if l["price_cents"] is not None and l["price_cents"] >= data["p_min_cents"]]
        if data.get("p_max_cents") is not None:
            rows = [l for l in rows if l["price_cents"] is not None and l["price_cents"] <= data["p_max_cents"]]
        rows.sort(key=lambda l: l["created_at"], reverse=True)
        if data.get("p_sort") == "price_asc":
            rows.sort(key=lambda l: (l["price_cents"] is None, l["price_cents"] or 0))
        elif data.get("p_sort") == "price_desc":
            rows.sort(key=lambda l: (l["price_cents"] is None, -(l["price_cents"] or 0)))
        total = len(rows)
        off, lim = data.get("p_offset") or 0, data.get("p_limit") or 24
        out = [{**{k: l[k] for k in ("id", "title", "tcg", "kind", "offer", "price_cents", "negotiable", "condition", "city",
                                     "status", "created_at", "owner_id")},
                "owner_nickname": profiles[l["owner_id"]]["nickname"],
                "cover_photo_id": (listing_photos(l["id"]) or [None])[0], "total_count": total} for l in rows[off:off + lim]]
        return self.send(200, out)

    def rpc_inner(self, name, data):
        if name in ("sync_events", "sync_events_failed"):
            if self.headers.get("Authorization", "") != f"Bearer {SERVICE_KEY}":
                return self.send(401, {"code": "42501", "message": "permission denied for function " + name})
            return self.service_rpc(name, data)
        if name in ("search_listings", "get_listing", "get_profile", "profile_listings", "list_follows"):
            return self.public_rpc(name, data)
        if name in ("list_events", "get_event", "event_listings", "listing_event_list", "event_sync_state", "profile_events"):
            return self.event_rpc(name, data)
        return self.private_rpc(name, data)

    def service_rpc(self, name, data):
        if name == "sync_events_failed":
            sync_state.update(synced_at=now_iso(), error=data["p_error"])
            return self.send(204)
        p = data["p"]
        seen = set()
        for e in p["events"]:
            ex = next((x for x in events.values() if x["odoo_id"] == e["odoo_id"]), None)
            row = {**(ex or {"id": str(uuid.uuid4())}), **{k: e.get(k) for k in (
                "odoo_id", "name", "subtitle", "starts_at", "ends_at", "timezone", "venue", "address", "city", "ticket_url",
                "website_url", "published")}}
            events[row["id"]] = row
            seen.add(e["odoo_id"])
        for ev in events.values():
            if ev["odoo_id"] not in seen and parse_iso(ev["ends_at"]) >= parse_iso(p["since"]):
                ev["published"] = False
        sync_state.update(synced_at=now_iso(), error=None)
        return self.send(200, len(p["events"]))

    def event_rpc(self, name, data):
        me = self.me()
        uid = me["id"] if me else None
        now = time.time()
        if name == "event_sync_state":
            return self.send(200, {"synced_at": sync_state["synced_at"], "error": sync_state["error"] if is_team(uid) else None})
        if name == "list_events":
            past = data.get("p_past")
            rows = [e for e in events.values() if e["published"] and ((parse_iso(e["ends_at"]) < now) == bool(past))]
            rows.sort(key=lambda e: e["starts_at"], reverse=bool(past))
            return self.send(200, [ev_public(e, uid) for e in rows[: data.get("p_limit") or 30]])
        if name == "get_event":
            e = events.get(data["p_id"])
            if not e or not (e["published"] or is_team(uid)):
                return self.send(200, None)
            st, en = parse_iso(e["starts_at"]), parse_iso(e["ends_at"])
            return self.send(200, {**{k: v for k, v in e.items() if k != "odoo_id"}, **ev_public(e, uid),
                                   "is_past": en < now, "checkin_open": st - 7200 <= now <= en + 7200})
        if name == "event_listings":
            rows = [listings[lid] for (lid, eid) in listing_events if eid == data["p_event"] and lid in listings
                    and listings[lid]["status"] in ("active", "reserved")]
            rows.sort(key=lambda l: l["created_at"], reverse=True)
            return self.send(200, [{**{k: l[k] for k in ("id", "title", "tcg", "kind", "offer", "price_cents", "negotiable", "condition",
                                                         "city", "status", "created_at", "owner_id")},
                                    "owner_nickname": profiles[l["owner_id"]]["nickname"],
                                    "cover_photo_id": (listing_photos(l["id"]) or [None])[0], "total_count": len(rows)} for l in rows])
        if name == "listing_event_list":
            rows = [events[eid] for (lid, eid) in listing_events if lid == data["p_listing"] and eid in events
                    and events[eid]["published"] and parse_iso(events[eid]["ends_at"]) >= now]
            rows.sort(key=lambda e: e["starts_at"])
            return self.send(200, [{k: e[k] for k in ("id", "name", "starts_at", "ends_at", "city")} for e in rows])
        if name == "profile_events":
            p = profile_by_nick(data["p_nickname"])
            if not p or not can_view(uid, p["id"]):
                return self.send(200, [])
            rows = [events[eid] for (eid, u) in checkins if u == p["id"]]
            return self.send(200, [{k: e[k] for k in ("id", "name", "starts_at", "city")} for e in rows])
        return self.send(404, {"message": "unknown rpc"})

    def private_rpc(self, name, data):
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
        if name == "create_listing":
            if not me.get("nickname"):
                raise RpcError(403, "42501", "profile_incomplete")
            p = data["p"]
            lid = str(uuid.uuid4())
            l = {"id": lid, "owner_id": u["id"], "status": "active", "removed_reason": None, "created_at": now_iso()}
            apply_payload(l, p)
            if len(p.get("photos") or []) > 6:
                raise RpcError(400, "54000", "too_many_photos")
            if (p.get("kind") or "single") in ("single", "slab") and len(p.get("photos") or []) < 2:
                raise RpcError(400, "23514", "front_back_required")
            listings[lid] = l
            for i, pid in enumerate(p.get("photos") or []):
                photos[pid] = {"listing_id": lid, "owner_id": u["id"], "position": i}
            return self.send(200, lid)
        if name == "update_listing":
            l = listings.get(data["p_id"])
            if not l or l["owner_id"] != u["id"]:
                raise RpcError(404, "P0002", "not_found")
            if l["status"] == "removed":
                raise RpcError(403, "42501", "listing_removed")
            p = data["p"]
            if (p.get("kind") or "single") in ("single", "slab") and len(p.get("photos") or []) < 2:
                raise RpcError(400, "23514", "front_back_required")
            apply_payload(l, p)
            keep = p.get("photos") or []
            removed = [pid for pid in listing_photos(l["id"]) if pid not in keep]
            for pid in removed:
                photos.pop(pid)
            for i, pid in enumerate(keep):
                photos[pid] = {"listing_id": l["id"], "owner_id": u["id"], "position": i}
            return self.send(200, removed)
        if name == "set_listing_status":
            l = listings.get(data["p_id"])
            if data["p_status"] == "removed":
                raise RpcError(403, "42501", "forbidden")
            if not l or l["owner_id"] != u["id"]:
                raise RpcError(404, "P0002", "not_found")
            if l["status"] == "removed":
                raise RpcError(403, "42501", "listing_removed")
            l["status"] = data["p_status"]
            return self.send(204)
        if name == "delete_listing":
            l = listings.get(data["p_id"])
            if not l or l["owner_id"] != u["id"]:
                raise RpcError(404, "P0002", "not_found")
            gone = listing_photos(l["id"])
            for pid in gone:
                photos.pop(pid)
            listings.pop(l["id"])
            return self.send(200, gone)
        if name == "my_listings":
            rows = [{"id": l["id"], "title": l["title"], "tcg": l["tcg"], "offer": l["offer"], "price_cents": l["price_cents"],
                     "status": l["status"], "removed_reason": l["removed_reason"], "created_at": l["created_at"],
                     "cover_photo_id": (listing_photos(l["id"]) or [None])[0]}
                    for l in sorted(listings.values(), key=lambda x: x["created_at"], reverse=True) if l["owner_id"] == u["id"]]
            return self.send(200, rows)
        if name == "report_content":
            lid, pid = data.get("p_listing_id"), data.get("p_profile_id")
            if (lid and listings.get(lid, {}).get("owner_id") == u["id"]) or pid == u["id"]:
                raise RpcError(400, "22023", "cannot_report_own")
            if any(r["reporter_id"] == u["id"] and r["status"] == "open" and r["listing_id"] == lid and r["profile_id"] == pid
                   for r in reports.values()):
                raise RpcError(409, "23505", "already_reported")
            rid = str(uuid.uuid4())
            reports[rid] = {"id": rid, "reporter_id": u["id"], "listing_id": lid, "profile_id": pid, "conversation_id": None, "reason": data["p_reason"],
                            "details": data.get("p_details"), "status": "open", "created_at": now_iso()}
            return self.send(204)
        if name == "open_report_count":
            return self.send(200, sum(1 for r in reports.values() if r["status"] == "open") if is_team(u["id"]) else 0)
        if name == "list_open_reports":
            if not is_team(u["id"]):
                raise RpcError(403, "42501", "forbidden")
            open_r = sorted((r for r in reports.values() if r["status"] == "open"), key=lambda r: r["created_at"])
            rows = []
            for r in open_r:
                l = listings.get(r["listing_id"] or "")
                pr = profiles.get(r["profile_id"] or "")
                rows.append({"id": r["id"], "reason": r["reason"], "details": r["details"], "created_at": r["created_at"],
                             "reporter_nickname": profiles.get(r["reporter_id"], {}).get("nickname"),
                             "listing_id": l["id"] if l else None, "listing_title": l["title"] if l else None,
                             "listing_status": l["status"] if l else None,
                             "listing_owner_nickname": profiles[l["owner_id"]]["nickname"] if l else None,
                             "profile_id": pr["id"] if pr else None, "profile_nickname": pr["nickname"] if pr else None,
                             "conversation_id": r.get("conversation_id"),
                             "conversation_title": conversations[r["conversation_id"]]["listing_title"] if r.get("conversation_id") in conversations else None,
                             "total_count": len(open_r)})
            return self.send(200, rows)
        if name == "moderate_listing":
            if not is_team(u["id"]):
                raise RpcError(403, "42501", "forbidden")
            l = listings.get(data["p_id"])
            if not l:
                raise RpcError(404, "P0002", "not_found")
            if data["p_action"] == "remove":
                reason = (data.get("p_reason") or "").strip()
                if not reason:
                    raise RpcError(400, "22023", "reason_required")
                l.update(status="removed", removed_reason=reason)
                for r in reports.values():
                    if r["listing_id"] == l["id"] and r["status"] == "open":
                        r["status"] = "resolved"
            else:
                l.update(status="active", removed_reason=None)
            return self.send(204)
        if name == "close_report":
            if not is_team(u["id"]):
                raise RpcError(403, "42501", "forbidden")
            r = reports.get(data["p_id"])
            if not r or r["status"] != "open":
                raise RpcError(404, "P0002", "not_found")
            r["status"] = data["p_status"]
            return self.send(204)
        if name == "start_conversation":
            l = listings.get(data["p_listing_id"])
            if not me.get("nickname"):
                raise RpcError(403, "42501", "profile_incomplete")
            if not l or l["status"] not in ("active", "reserved"):
                raise RpcError(404, "P0002", "not_found")
            if l["owner_id"] == u["id"]:
                raise RpcError(400, "22023", "cannot_message_self")
            if blocked_between(u["id"], l["owner_id"]):
                raise RpcError(403, "42501", "blocked")
            for c in conversations.values():
                if c["listing_id"] == l["id"] and c["buyer_id"] == u["id"]:
                    c["buyer_hidden_at"] = None
                    return self.send(200, c["id"])
            cid = str(uuid.uuid4())
            conversations[cid] = {"id": cid, "listing_id": l["id"], "listing_title": l["title"], "seller_id": l["owner_id"],
                                  "buyer_id": u["id"], "created_at": now_iso(), "last_message_at": None,
                                  "seller_last_read_at": None, "buyer_last_read_at": None,
                                  "seller_hidden_at": None, "buyer_hidden_at": None}
            return self.send(200, cid)
        if name == "my_conversation_for_listing":
            for c in conversations.values():
                if c["listing_id"] == data["p_listing_id"] and c["buyer_id"] == u["id"]:
                    return self.send(200, c["id"])
            return self.send(200, None)
        if name == "send_message":
            c = conv_for(data["p_conversation_id"], u["id"])
            if not c:
                raise RpcError(404, "P0002", "not_found")
            other = c["buyer_id"] if c["seller_id"] == u["id"] else c["seller_id"]
            if blocked_between(u["id"], other):
                raise RpcError(403, "42501", "blocked")
            body = (data.get("p_body") or "").strip()
            photo = data.get("p_photo_id")
            if photo and file_owner.get(f"chat-photos/{c['id']}/{photo}.jpg") != u["id"]:
                raise RpcError(400, "22023", "photo_missing")
            if not (photo and len(body) <= 1000) and not 1 <= len(body) <= 1000:
                raise RpcError(400, "23514", 'violates check constraint "messages_content"')
            m = {"id": str(uuid.uuid4()), "conversation_id": c["id"], "sender_id": u["id"], "body": body,
                 "photo_id": photo, "created_at": now_iso()}
            messages.append(m)
            c.update(last_message_at=m["created_at"], seller_hidden_at=None, buyer_hidden_at=None)
            c["seller_last_read_at" if c["seller_id"] == u["id"] else "buyer_last_read_at"] = m["created_at"]
            return self.send(200, m)
        if name == "get_messages":
            c = conv_for(data["p_conversation_id"], u["id"])
            if not c:
                return self.send(200, [])
            after = data.get("p_after")
            rows = [m for m in messages if m["conversation_id"] == c["id"] and (not after or m["created_at"] > after)]
            return self.send(200, rows[-(data.get("p_limit") or 200):])
        if name == "mark_conversation_read":
            c = conv_for(data["p_conversation_id"], u["id"])
            if c:
                c["seller_last_read_at" if c["seller_id"] == u["id"] else "buyer_last_read_at"] = now_iso()
            return self.send(204)
        if name == "hide_conversation":
            c = conv_for(data["p_conversation_id"], u["id"])
            if c:
                c["seller_hidden_at" if c["seller_id"] == u["id"] else "buyer_hidden_at"] = now_iso()
            return self.send(204)
        if name == "unread_message_count":
            return self.send(200, sum(unread_for(c, u["id"]) for c in conversations.values()
                                      if u["id"] in (c["seller_id"], c["buyer_id"]) and not hidden_for(c, u["id"])))
        if name == "list_conversations":
            rows = []
            for c in conversations.values():
                if u["id"] not in (c["seller_id"], c["buyer_id"]) or not c["last_message_at"] or hidden_for(c, u["id"]):
                    continue
                other = profiles[c["buyer_id"] if c["seller_id"] == u["id"] else c["seller_id"]]
                l = listings.get(c["listing_id"] or "")
                last = [m for m in messages if m["conversation_id"] == c["id"]][-1]
                rows.append({"id": c["id"], "listing_id": c["listing_id"], "listing_title": c["listing_title"],
                             "listing_status": l["status"] if l else None, "listing_owner_id": l["owner_id"] if l else None,
                             "cover_photo_id": (listing_photos(l["id"]) or [None])[0] if l else None,
                             "other_id": other["id"], "other_nickname": other["nickname"],
                             "other_avatar_id": other["avatar_id"] if can_view(u["id"], other["id"]) else None,
                             "i_am_seller": c["seller_id"] == u["id"],
                             "last_message_at": c["last_message_at"], "last_body": last["body"], "last_has_photo": bool(last.get("photo_id")),
                             "last_from_me": last["sender_id"] == u["id"],
                             "unread": unread_for(c, u["id"]), "blocked": blocked_between(c["seller_id"], c["buyer_id"])})
            rows.sort(key=lambda r: r["last_message_at"], reverse=True)
            return self.send(200, rows)
        if name == "get_conversation":
            c = conv_for(data["p_conversation_id"], u["id"])
            if not c:
                return self.send(200, None)
            other = profiles[c["buyer_id"] if c["seller_id"] == u["id"] else c["seller_id"]]
            l = listings.get(c["listing_id"] or "")
            return self.send(200, {"id": c["id"], "listing_id": c["listing_id"] if l else None, "listing_title": c["listing_title"],
                                   "listing_status": l["status"] if l else None, "listing_owner_id": l["owner_id"] if l else None,
                                   "cover_photo_id": (listing_photos(l["id"]) or [None])[0] if l else None,
                                   "listing_price_cents": l["price_cents"] if l else None, "listing_offer": l["offer"] if l else None,
                                   "other_id": other["id"], "other_nickname": other["nickname"],
                                   "other_avatar_id": other["avatar_id"] if can_view(u["id"], other["id"]) else None,
                                   "i_am_seller": c["seller_id"] == u["id"],
                                   "i_blocked": (u["id"], other["id"]) in blocks, "blocked_me": (other["id"], u["id"]) in blocks})
        if name == "block_user":
            blocks.add((u["id"], data["p_user_id"]))
            follows.pop((u["id"], data["p_user_id"]), None)
            follows.pop((data["p_user_id"], u["id"]), None)
            return self.send(204)
        if name == "unblock_user":
            blocks.discard((u["id"], data["p_user_id"]))
            return self.send(204)
        if name == "report_conversation":
            c = conv_for(data["p_conversation_id"], u["id"])
            if not c:
                raise RpcError(404, "P0002", "not_found")
            if any(r["reporter_id"] == u["id"] and r["status"] == "open" and r.get("conversation_id") == c["id"] for r in reports.values()):
                raise RpcError(409, "23505", "already_reported")
            rid = str(uuid.uuid4())
            reports[rid] = {"id": rid, "reporter_id": u["id"], "listing_id": None, "profile_id": None, "conversation_id": c["id"],
                            "reason": data["p_reason"], "details": data.get("p_details"), "status": "open", "created_at": now_iso()}
            return self.send(204)
        if name == "moderation_conversation":
            if not is_team(u["id"]):
                raise RpcError(403, "42501", "forbidden")
            c = conversations.get(data["p_conversation_id"])
            if not c or not any(r.get("conversation_id") == c["id"] for r in reports.values()):
                raise RpcError(404, "P0002", "not_found")
            return self.send(200, {"id": c["id"], "listing_title": c["listing_title"], "seller": profiles[c["seller_id"]]["nickname"],
                                   "buyer": profiles[c["buyer_id"]]["nickname"],
                                   "messages": [{"from": profiles[m["sender_id"]]["nickname"], "body": m["body"], "photo_id": m.get("photo_id"), "created_at": m["created_at"]}
                                                for m in messages if m["conversation_id"] == c["id"]]})
        if name == "pending_follow_request_count":
            return self.send(200, sum(1 for (a, b), st in follows.items() if b == u["id"] and st == "pending"))
        if name == "my_follow_requests":
            rows = [{"id": a, "nickname": profiles[a]["nickname"], "avatar_id": profiles[a]["avatar_id"] if can_view(u["id"], a) else None,
                     "created_at": now_iso()} for (a, b), st in follows.items() if b == u["id"] and st == "pending"]
            return self.send(200, rows)
        if name == "follow_user":
            target = profiles.get(data["p_target"])
            if not target or not target["nickname"]:
                raise RpcError(404, "P0002", "not_found")
            if target["id"] == u["id"]:
                raise RpcError(400, "22023", "invalid_action")
            if blocked_between(u["id"], target["id"]):
                raise RpcError(403, "42501", "blocked")
            key = (u["id"], target["id"])
            if key not in follows:
                follows[key] = "pending" if target["follow_approval"] else "accepted"
            return self.send(200, follows[key])
        if name == "unfollow_user":
            follows.pop((u["id"], data["p_target"]), None)
            return self.send(204)
        if name == "respond_follow_request":
            key = (data["p_follower"], u["id"])
            if follows.get(key) != "pending":
                raise RpcError(404, "P0002", "not_found")
            if data["p_accept"]:
                follows[key] = "accepted"
            else:
                follows.pop(key)
            return self.send(204)
        if name == "remove_follower":
            follows.pop((data["p_follower"], u["id"]), None)
            return self.send(204)
        if name == "update_privacy":
            me.update(profile_visibility=data["p_visibility"], follow_approval=bool(data["p_follow_approval"]))
            if not data["p_follow_approval"]:
                for k, st in list(follows.items()):
                    if k[1] == u["id"] and st == "pending":
                        follows[k] = "accepted"
            return self.send(204)
        if name == "set_avatar":
            old = me["avatar_id"]
            me["avatar_id"] = data.get("p_avatar_id")
            return self.send(200, old)
        if name == "set_listing_events":
            l = listings.get(data["p_listing"])
            if not l or l["owner_id"] != u["id"]:
                return self.send(400, {"code": "P0002", "message": "not_found"})
            now = time.time()
            for key in [k for k in listing_events if k[0] == l["id"] and parse_iso(events[k[1]]["ends_at"]) >= now]:
                listing_events.discard(key)
            for eid in data["p_events"] or []:
                if eid in events and events[eid]["published"] and parse_iso(events[eid]["ends_at"]) >= now:
                    listing_events.add((l["id"], eid))
            return self.send(204)
        if name == "team_checkin_code":
            if not is_team(u["id"]):
                return self.send(403, {"code": "42501", "message": "forbidden"})
            if data["p_event"] not in checkin_codes or data.get("p_renew"):
                checkin_codes[data["p_event"]] = uuid.uuid4().hex + uuid.uuid4().hex[:8]
            return self.send(200, checkin_codes[data["p_event"]])
        if name == "team_event_overview":
            if not is_team(u["id"]):
                return self.send(403, {"code": "42501", "message": "forbidden"})
            rows = sorted(events.values(), key=lambda e: e["starts_at"])
            return self.send(200, [{k: e[k] for k in ("id", "name", "starts_at", "ends_at", "city", "published")} | {
                "has_code": e["id"] in checkin_codes, "checkin_count": sum(1 for (ev, _) in checkins if ev == e["id"])} for e in rows])
        if name == "check_in":
            if not me["nickname"]:
                return self.send(403, {"code": "42501", "message": "onboarding_required"})
            code = data["p_code"].strip().lower()
            eid = next((k for k, v in checkin_codes.items() if v == code), None)
            if not eid:
                return self.send(404, {"code": "P0002", "message": "checkin_invalid"})
            e = events[eid]
            now = time.time()
            if now < parse_iso(e["starts_at"]) - 7200:
                return self.send(400, {"code": "22023", "message": "checkin_not_open"})
            if now > parse_iso(e["ends_at"]) + 7200:
                return self.send(400, {"code": "22023", "message": "checkin_closed"})
            new = (eid, u["id"]) not in checkins
            checkins.setdefault((eid, u["id"]), now_iso())
            return self.send(200, {"event_id": eid, "name": e["name"], "starts_at": e["starts_at"], "new": new, "visits": visits(u["id"])})
        if name == "delete_own_account":
            for lid in [l["id"] for l in listings.values() if l["owner_id"] == u["id"]]:
                for pid in listing_photos(lid):
                    photos.pop(pid)
                listings.pop(lid)
            users.pop(u["email"], None)
            profiles.pop(u["id"], None)
            for key in [k for k in checkins if k[1] == u["id"]]:
                checkins.pop(key)
            return self.send(204)
        return self.send(404, {"message": "unknown rpc"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 54321
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
