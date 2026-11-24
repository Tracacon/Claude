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
        if url.path.startswith("/storage/v1/object/public/listing-photos/"):
            path = url.path.split("/listing-photos/", 1)[1]
            data = files.get(path)
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
        return self.send(404, {"message": "not found"})

    def do_POST(self):
        url = urlparse(self.path)
        if url.path.startswith("/storage/v1/object/list/listing-photos"):
            u = self.me()
            data = self.body()
            prefix = (data.get("prefix") or "").strip("/")
            names = [k.split("/", 1)[1] for k in files if k.startswith(prefix + "/")] if u else []
            return self.send(200, [{"name": n, "id": n} for n in names])
        if url.path.startswith("/storage/v1/object/listing-photos/"):
            u = self.me()
            path = url.path.split("/listing-photos/", 1)[1]
            body = self.raw_body()
            if not u or not path.startswith(u["id"] + "/"):
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
            files[path] = body
            return self.send(200, {"Key": f"listing-photos/{path}", "Id": path})
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

    def do_DELETE(self):
        url = urlparse(self.path)
        if url.path.startswith("/storage/v1/object/listing-photos"):
            u = self.me()
            data = self.body()
            removed = []
            for path in data.get("prefixes", []):
                if u and path.startswith(u["id"] + "/") and path in files:
                    files.pop(path)
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
            return self.send(200, {"listing": l, "owner": {"nickname": o["nickname"], "role": o["role"], "member_since": o["created_at"]},
                                   "photos": listing_photos(l["id"]), "is_owner": l["owner_id"] == uid,
                                   "can_moderate": is_team(uid)})
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
        if name in ("search_listings", "get_listing"):
            return self.public_rpc(name, data)
        return self.private_rpc(name, data)

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
            reports[rid] = {"id": rid, "reporter_id": u["id"], "listing_id": lid, "profile_id": pid, "reason": data["p_reason"],
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
        if name == "delete_own_account":
            for lid in [l["id"] for l in listings.values() if l["owner_id"] == u["id"]]:
                for pid in listing_photos(lid):
                    photos.pop(pid)
                listings.pop(lid)
            users.pop(u["email"], None)
            profiles.pop(u["id"], None)
            return self.send(204)
        return self.send(404, {"message": "unknown rpc"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 54321
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
