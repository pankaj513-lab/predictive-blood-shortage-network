"""
PBSN — Secure Backend Server (Python 3.15 stdlib HTTP + SQLite + Signed Token Auth)
Provides:
  - Static serving for D:\\pbsn-blood-network (blocking /backend, .db, and raw /uploads)
  - Admin Auth: POST /api/admin/login, /api/admin/setup, /api/admin/logout, GET /api/admin/me, /api/admin/status
  - Admin Reports CRUD: GET/POST /api/admin/reports, PUT/DELETE /api/admin/reports/{id}
  - Secure Document Upload & Download: POST /api/admin/reports/upload, GET /api/admin/documents, GET /api/documents/{id}/download
  - Public Published Reports: GET /api/reports, GET /api/reports/{id}
  - Existing PBSN Endpoints: POST /api/predict-shortage, GET /api/inventory, GET /api/blood-banks, POST /api/blood-requests, POST/GET /api/inquiries
"""
import argparse
import base64
import email.parser
import email.policy
import hmac
import hashlib
import json
import mimetypes
import os
import re
import secrets
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from db import (
    REPORT_CATEGORIES,
    UPLOAD_DIR,
    get_conn,
    hash_password,
    init_db,
    utc_now_iso,
    verify_password,
)
from model import predict_shortage_risk

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_ROOT = os.path.dirname(BASE_DIR)

# Ephemeral-or-env HMAC secret for signing session tokens (never exposed to frontend)
SECRET_KEY_PATH = os.path.join(BASE_DIR, ".session_secret")


def load_secret() -> bytes:
    env_sec = os.environ.get("PBSN_SESSION_SECRET")
    if env_sec:
        return env_sec.encode("utf-8")
    if os.path.exists(SECRET_KEY_PATH):
        with open(SECRET_KEY_PATH, "rb") as f:
            return f.read()
    sec = secrets.token_bytes(32)
    with open(SECRET_KEY_PATH, "wb") as f:
        f.write(sec)
    return sec


SESSION_SECRET = load_secret()
REVOKED_TOKENS: set[str] = set()

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".xlsx", ".xls", ".csv", ".png", ".jpg", ".jpeg", ".webp"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


def create_token(admin_id: int, email_addr: str, full_name: str, ttl_sec: int = 8 * 3600) -> str:
    payload = {
        "sub": admin_id,
        "email": email_addr,
        "name": full_name,
        "exp": int(time.time()) + ttl_sec,
        "jti": secrets.token_hex(8),
    }
    raw = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")
    sig = hmac.new(SESSION_SECRET, raw.encode("ascii"), hashlib.sha256).hexdigest()
    return f"{raw}.{sig}"


def verify_token(token: str | None) -> dict | None:
    if not token or "." not in token or token in REVOKED_TOKENS:
        return None
    try:
        raw, sig = token.split(".", 1)
        expected = hmac.new(SESSION_SECRET, raw.encode("ascii"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        payload = json.loads(base64.urlsafe_b64decode(raw.encode("ascii")).decode("utf-8"))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


def safe_filename(name: str) -> str:
    base = os.path.basename(name or "document")
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._")
    return cleaned or "document"


def row_to_report(row: dict) -> dict:
    r = dict(row)
    if not r.get("cover_image_url") and r.get("cover_doc_id"):
        r["cover_image_url"] = f"/api/documents/{r['cover_doc_id']}/download"
    return r


DEMO_BANKS = [
    {"id": "aiims-delhi", "name": "AIIMS Main Blood Bank", "city": "New Delhi", "lat": 28.5672, "lng": 77.2100},
    {"id": "kem-mumbai", "name": "KEM Hospital Blood Centre", "city": "Mumbai", "lat": 19.0022, "lng": 72.8419},
    {"id": "manipal-blr", "name": "Manipal Hospital Blood Bank", "city": "Bengaluru", "lat": 12.9584, "lng": 77.6489},
    {"id": "apollo-chn", "name": "Apollo Hospitals Blood Centre", "city": "Chennai", "lat": 13.0631, "lng": 80.2516},
]


class PBSNHandler(BaseHTTPRequestHandler):
    server_version = "PBSN-Server/1.0"

    def log_message(self, format: str, *args) -> None:
        # Clean concise logging
        print(f"[PBSN] {self.address_string()} - {format % args}")

    def send_cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def send_json(self, status: int, data: dict) -> None:
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json_body(self) -> dict | None:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > 2 * 1024 * 1024:
            return None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception:
            return None

    def get_bearer_token(self) -> str | None:
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:].strip()
        return None

    def require_admin(self) -> dict | None:
        tok = self.get_bearer_token()
        user = verify_token(tok)
        if not user:
            self.send_json(401, {"error": "Unauthorized. Valid admin authentication required."})
            return None
        return user

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        # ── Public Runtime Supabase Config (reads .env; NEVER exposes service_role) ──
        if path == "/api/config":
            cfg = {
                "VITE_SUPABASE_URL": os.environ.get("VITE_SUPABASE_URL", ""),
                "VITE_SUPABASE_ANON_KEY": os.environ.get("VITE_SUPABASE_ANON_KEY", ""),
            }
            env_file = os.path.join(WEB_ROOT, ".env")
            if os.path.isfile(env_file):
                with open(env_file, "r", encoding="utf-8") as ef:
                    for raw_line in ef:
                        line = raw_line.strip()
                        if not line or line.startswith("#") or "=" not in line:
                            continue
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k in ("VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY") and v:
                            cfg[k] = v
            return self.send_json(200, cfg)

        # ── Admin Status & Session ───────────────────────────────────────
        if path == "/api/admin/status":
            with get_conn() as conn:
                count = conn.execute("SELECT COUNT(*) FROM admins").fetchone()[0]
            return self.send_json(200, {"hasAdmin": count > 0, "categories": REPORT_CATEGORIES})

        if path == "/api/admin/me":
            admin = self.require_admin()
            if not admin:
                return
            return self.send_json(200, {"admin": {"id": admin["sub"], "email": admin["email"], "name": admin["name"]}})

        # ── Admin Reports List & Stats ───────────────────────────────────
        if path == "/api/admin/reports":
            admin = self.require_admin()
            if not admin:
                return
            q = (qs.get("q", [""])[0]).strip().lower()
            category = (qs.get("category", ["ALL"])[0]).strip()
            status = (qs.get("status", ["ALL"])[0]).strip()
            sort = (qs.get("sort", ["newest"])[0]).strip()

            with get_conn() as conn:
                rows = conn.execute(
                    """
                    SELECT r.*, d.original_name AS attachment_name, d.size_bytes AS attachment_size, d.doc_kind AS attachment_kind
                    FROM reports r
                    LEFT JOIN documents d ON r.attachment_doc_id = d.id
                    """
                ).fetchall()
                reports = [row_to_report(r) for r in rows]
                doc_count = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
                activity = [
                    dict(a)
                    for a in conn.execute("SELECT * FROM activity_log ORDER BY id DESC LIMIT 12").fetchall()
                ]

            stats = {
                "totalReports": len(reports),
                "publishedReports": sum(1 for r in reports if r["status"] == "published"),
                "draftReports": sum(1 for r in reports if r["status"] == "draft"),
                "uploadedDocuments": doc_count,
            }

            filtered = []
            for r in reports:
                if q and q not in r["title"].lower() and q not in r["short_description"].lower() and q not in r["region"].lower():
                    continue
                if category != "ALL" and r["category"] != category:
                    continue
                if status != "ALL" and r["status"] != status:
                    continue
                filtered.append(r)

            if sort == "oldest":
                filtered.sort(key=lambda x: (x["report_date"], x["id"]))
            elif sort == "title":
                filtered.sort(key=lambda x: x["title"].lower())
            else:
                filtered.sort(key=lambda x: (x["report_date"], x["id"]), reverse=True)

            return self.send_json(200, {"reports": filtered, "stats": stats, "activity": activity})

        # ── Admin Document Vault ─────────────────────────────────────────
        if path == "/api/admin/documents":
            admin = self.require_admin()
            if not admin:
                return
            q = (qs.get("q", [""])[0]).strip().lower()
            with get_conn() as conn:
                docs = [dict(d) for d in conn.execute("SELECT * FROM documents ORDER BY created_at DESC").fetchall()]
            if q:
                docs = [d for d in docs if q in d["original_name"].lower() or q in d["doc_kind"].lower()]
            return self.send_json(200, {"documents": docs})

        # ── Public Published Reports Only ────────────────────────────────
        if path == "/api/reports":
            with get_conn() as conn:
                rows = conn.execute(
                    """
                    SELECT r.*, d.original_name AS attachment_name, d.size_bytes AS attachment_size, d.doc_kind AS attachment_kind
                    FROM reports r
                    LEFT JOIN documents d ON r.attachment_doc_id = d.id
                    WHERE r.status = 'published'
                    ORDER BY r.report_date DESC, r.id DESC
                    """
                ).fetchall()
            return self.send_json(200, {"reports": [row_to_report(r) for r in rows]})

        m_pub = re.fullmatch(r"/api/reports/(\d+)", path)
        if m_pub:
            rid = int(m_pub.group(1))
            with get_conn() as conn:
                row = conn.execute(
                    """
                    SELECT r.*, d.original_name AS attachment_name, d.size_bytes AS attachment_size
                    FROM reports r
                    LEFT JOIN documents d ON r.attachment_doc_id = d.id
                    WHERE r.id = ?
                    """,
                    (rid,),
                ).fetchone()
            if not row:
                return self.send_json(404, {"error": "Report not found."})
            rep = row_to_report(row)
            if rep["status"] != "published":
                admin = verify_token(self.get_bearer_token())
                if not admin:
                    return self.send_json(403, {"error": "Access denied. Draft reports are private."})
            return self.send_json(200, {"report": rep})

        # ── Secure Document Download (Enforces Draft vs Published Permissions) ──
        m_doc = re.fullmatch(r"/api/documents/([A-Za-z0-9_-]+)/download", path)
        if m_doc:
            doc_id = m_doc.group(1)
            tok = self.get_bearer_token() or (qs.get("token", [None])[0])
            admin = verify_token(tok)

            with get_conn() as conn:
                doc = conn.execute("SELECT * FROM documents WHERE id = ?", (doc_id,)).fetchone()
                if not doc:
                    return self.send_json(404, {"error": "Document not found."})
                # Allow public download ONLY if linked to at least one published report
                pub_linked = conn.execute(
                    """
                    SELECT id FROM reports
                    WHERE status = 'published' AND (attachment_doc_id = ? OR cover_doc_id = ?)
                    """,
                    (doc_id, doc_id),
                ).fetchone()

            if not pub_linked and not admin:
                return self.send_json(403, {"error": "Forbidden. This document is private or attached to a draft report."})

            file_path = os.path.join(UPLOAD_DIR, doc["stored_name"])
            if not os.path.isfile(file_path):
                return self.send_json(404, {"error": "Stored file missing on disk."})

            with open(file_path, "rb") as f:
                data = f.read()

            inline = qs.get("inline", ["0"])[0] == "1"
            disp = "inline" if inline else "attachment"
            self.send_response(200)
            self.send_cors_headers()
            self.send_header("Content-Type", doc["mime_type"])
            self.send_header("Content-Disposition", f'{disp}; filename="{doc["original_name"]}"')
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        # ── Existing PBSN GET Endpoints ──────────────────────────────────
        if path == "/api/inventory":
            return self.send_json(200, {"status": "demo", "banks": DEMO_BANKS})
        if path == "/api/blood-banks":
            return self.send_json(200, {"count": len(DEMO_BANKS), "blood_banks": DEMO_BANKS})
        if path == "/api/inquiries":
            with get_conn() as conn:
                rows = [dict(r) for r in conn.execute("SELECT * FROM inquiries ORDER BY id DESC LIMIT 50").fetchall()]
            return self.send_json(200, {"count": len(rows), "inquiries": rows})

        # ── Static Frontend Files (Protected from backend/uploads) ───────
        if path == "/":
            path = "/index.html"
        rel = urllib.parse.unquote(path.lstrip("/")).replace("/", os.sep)
        # Security: block backend/, .db, hidden dotfiles
        first_seg = rel.split(os.sep)[0].lower()
        if first_seg in {"backend", ".git"} or rel.startswith(".") or rel.endswith(".db") or rel.endswith(".py"):
            return self.send_json(403, {"error": "Forbidden path."})

        full_path = os.path.abspath(os.path.join(WEB_ROOT, rel))
        if not full_path.startswith(os.path.abspath(WEB_ROOT)) or not os.path.isfile(full_path):
            return self.send_json(404, {"error": "Not found."})

        ctype, _ = mimetypes.guess_type(full_path)
        with open(full_path, "rb") as f:
            content = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        # ── One-Time First-Run Admin Setup (only when 0 admins exist) ────
        if path == "/api/admin/setup":
            body = self.read_json_body()
            if not body:
                return self.send_json(400, {"error": "Invalid JSON body."})
            email_addr = (body.get("email") or "").strip().lower()
            full_name = (body.get("fullName") or "PBSN Administrator").strip()
            password = body.get("password") or ""
            if "@" not in email_addr or len(password) < 8:
                return self.send_json(400, {"error": "Valid email and password (min 8 chars) required."})

            with get_conn() as conn:
                existing = conn.execute("SELECT COUNT(*) FROM admins").fetchone()[0]
                if existing > 0:
                    return self.send_json(403, {"error": "Admin account already initialized. Please sign in."})
                cur = conn.execute(
                    "INSERT INTO admins (email, full_name, password_hash, created_at) VALUES (?, ?, ?, ?)",
                    (email_addr, full_name, hash_password(password), utc_now_iso()),
                )
                admin_id = cur.lastrowid
                conn.execute(
                    "INSERT INTO activity_log (actor_email, action, target_title, created_at) VALUES (?, ?, ?, ?)",
                    (email_addr, "Initialized admin account", full_name, utc_now_iso()),
                )
                conn.commit()
            token = create_token(admin_id, email_addr, full_name)
            return self.send_json(201, {"token": token, "admin": {"id": admin_id, "email": email_addr, "name": full_name}})

        # ── Admin Login ──────────────────────────────────────────────────
        if path == "/api/admin/login":
            body = self.read_json_body()
            if not body:
                return self.send_json(400, {"error": "Invalid JSON body."})
            email_addr = (body.get("email") or "").strip().lower()
            password = body.get("password") or ""
            with get_conn() as conn:
                row = conn.execute("SELECT * FROM admins WHERE email = ?", (email_addr,)).fetchone()
            if not row or not verify_password(password, row["password_hash"]):
                return self.send_json(401, {"error": "Invalid email or password."})
            token = create_token(row["id"], row["email"], row["full_name"])
            with get_conn() as conn:
                conn.execute(
                    "INSERT INTO activity_log (actor_email, action, target_title, created_at) VALUES (?, ?, ?, ?)",
                    (row["email"], "Admin login", "Session started", utc_now_iso()),
                )
                conn.commit()
            return self.send_json(
                200,
                {"token": token, "admin": {"id": row["id"], "email": row["email"], "name": row["full_name"]}},
            )

        if path == "/api/admin/logout":
            tok = self.get_bearer_token()
            if tok:
                REVOKED_TOKENS.add(tok)
            return self.send_json(200, {"loggedOut": True})

        # ── Create Report ────────────────────────────────────────────────
        if path == "/api/admin/reports":
            admin = self.require_admin()
            if not admin:
                return
            body = self.read_json_body()
            if not body:
                return self.send_json(400, {"error": "Invalid JSON payload."})

            title = (body.get("title") or "").strip()
            category = (body.get("category") or "").strip()
            short_desc = (body.get("short_description") or "").strip()
            content = (body.get("content") or "").strip()
            report_date = (body.get("report_date") or "").strip()
            region = (body.get("region") or "").strip()
            blood_group = (body.get("blood_group") or "N/A").strip()
            status = body.get("status", "draft")
            cover_doc_id = body.get("cover_doc_id") or None
            cover_image_url = (body.get("cover_image_url") or "").strip() or None
            attachment_doc_id = body.get("attachment_doc_id") or None

            if len(title) < 3 or len(short_desc) < 5 or len(content) < 10 or not report_date or not region:
                return self.send_json(400, {"error": "Title, description, content, date, and region are required."})
            if category not in REPORT_CATEGORIES:
                return self.send_json(400, {"error": "Invalid report category."})
            if status not in {"draft", "published"}:
                return self.send_json(400, {"error": "Status must be 'draft' or 'published'."})

            now = utc_now_iso()
            with get_conn() as conn:
                cur = conn.execute(
                    """
                    INSERT INTO reports (
                        title, category, short_description, content, report_date,
                        region, blood_group, status, cover_doc_id, cover_image_url,
                        attachment_doc_id, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        title, category, short_desc, content, report_date,
                        region, blood_group, status, cover_doc_id, cover_image_url,
                        attachment_doc_id, now, now,
                    ),
                )
                rid = cur.lastrowid
                conn.execute(
                    "INSERT INTO activity_log (actor_email, action, target_title, created_at) VALUES (?, ?, ?, ?)",
                    (admin["email"], f"Created report ({status})", title, now),
                )
                row = conn.execute("SELECT * FROM reports WHERE id = ?", (rid,)).fetchone()
                conn.commit()
            return self.send_json(201, {"report": row_to_report(row)})

        # ── Secure Document Upload (Multipart Form-Data via Python 3.15 stdlib) ──
        if path == "/api/admin/reports/upload":
            admin = self.require_admin()
            if not admin:
                return
            ctype = self.headers.get("Content-Type", "")
            length = int(self.headers.get("Content-Length", "0"))
            if "multipart/form-data" not in ctype:
                return self.send_json(400, {"error": "Expected multipart/form-data upload."})
            if length <= 0 or length > MAX_UPLOAD_BYTES + 65536:
                return self.send_json(413, {"error": "File exceeds maximum 10 MB upload limit."})

            raw_body = self.rfile.read(length)
            raw_msg = f"Content-Type: {ctype}\r\nMIME-Version: 1.0\r\n\r\n".encode("latin-1") + raw_body
            msg = email.parser.BytesParser(policy=email.policy.default).parsebytes(raw_msg)
            if not msg.is_multipart():
                return self.send_json(400, {"error": "Malformed multipart upload."})

            file_part = None
            doc_kind = "attachment"
            for part in msg.iter_parts():
                cd_name = part.get_param("name", header="content-disposition")
                if cd_name == "kind":
                    doc_kind = part.get_content().strip() or "attachment"
                elif cd_name == "file":
                    file_part = part

            if not file_part or not file_part.get_filename():
                return self.send_json(400, {"error": "No file included in upload."})

            orig_name = safe_filename(file_part.get_filename())
            ext = os.path.splitext(orig_name)[1].lower()
            if ext not in ALLOWED_EXTENSIONS:
                return self.send_json(
                    400,
                    {"error": f"Unsupported file type '{ext}'. Allowed: PDF, DOCX, XLSX/XLS, CSV, PNG/JPG/WEBP."},
                )
            if doc_kind == "cover" and ext not in IMAGE_EXTENSIONS:
                return self.send_json(400, {"error": "Cover image must be PNG, JPG, JPEG, or WEBP."})

            file_bytes = file_part.get_payload(decode=True) or b""
            if len(file_bytes) == 0 or len(file_bytes) > MAX_UPLOAD_BYTES:
                return self.send_json(400, {"error": "File is empty or exceeds 10 MB size limit."})

            doc_id = secrets.token_hex(8)
            stored_name = f"{doc_id}_{orig_name}"
            dest = os.path.join(UPLOAD_DIR, stored_name)
            with open(dest, "wb") as f:
                f.write(file_bytes)

            mime_type = file_part.get_content_type() or mimetypes.guess_type(orig_name)[0] or "application/octet-stream"
            now = utc_now_iso()
            with get_conn() as conn:
                conn.execute(
                    """
                    INSERT INTO documents (id, original_name, stored_name, mime_type, size_bytes, doc_kind, uploaded_by, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (doc_id, orig_name, stored_name, mime_type, len(file_bytes), doc_kind, admin["email"], now),
                )
                conn.execute(
                    "INSERT INTO activity_log (actor_email, action, target_title, created_at) VALUES (?, ?, ?, ?)",
                    (admin["email"], f"Uploaded {doc_kind}", orig_name, now),
                )
                conn.commit()

            return self.send_json(
                201,
                {
                    "document": {
                        "id": doc_id,
                        "original_name": orig_name,
                        "mime_type": mime_type,
                        "size_bytes": len(file_bytes),
                        "doc_kind": doc_kind,
                        "download_url": f"/api/documents/{doc_id}/download",
                        "created_at": now,
                    }
                },
            )

        # ── Existing PBSN POST Endpoints ─────────────────────────────────
        if path == "/api/predict-shortage":
            body = self.read_json_body()
            if not body:
                return self.send_json(400, {"error": "Invalid JSON body."})
            return self.send_json(200, predict_shortage_risk(body))

        if path == "/api/blood-requests":
            body = self.read_json_body()
            if not body:
                return self.send_json(400, {"error": "Invalid JSON body."})
            now = utc_now_iso()
            with get_conn() as conn:
                conn.execute(
                    "INSERT INTO emergency_requests (ref_id, blood_group, units, hospital, city, urgency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (body.get("refId", ""), body.get("group", ""), int(body.get("units", 1)), body.get("hospital", ""), body.get("city", ""), body.get("urgency", "Urgent"), now),
                )
                conn.commit()
            return self.send_json(201, {"accepted": True, "request": body})

        if path == "/api/inquiries":
            body = self.read_json_body()
            if not body:
                return self.send_json(400, {"error": "Invalid JSON body."})
            now = utc_now_iso()
            with get_conn() as conn:
                conn.execute(
                    "INSERT INTO inquiries (inquiry_type, subject, blood_group, units, city, contact, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (body.get("inquiryType", ""), body.get("subject", ""), body.get("group", "ALL"), int(body.get("units", 0)), body.get("city", ""), body.get("contact", ""), body.get("notes", ""), now),
                )
                conn.commit()
            return self.send_json(201, {"accepted": True, "inquiry": body})

        return self.send_json(404, {"error": "Endpoint not found."})

    def do_PUT(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        m = re.fullmatch(r"/api/admin/reports/(\d+)", parsed.path)
        if not m:
            return self.send_json(404, {"error": "Endpoint not found."})

        admin = self.require_admin()
        if not admin:
            return
        rid = int(m.group(1))
        body = self.read_json_body()
        if not body:
            return self.send_json(400, {"error": "Invalid JSON body."})

        with get_conn() as conn:
            existing = conn.execute("SELECT * FROM reports WHERE id = ?", (rid,)).fetchone()
            if not existing:
                return self.send_json(404, {"error": "Report not found."})

            title = (body.get("title", existing["title"]) or "").strip()
            category = (body.get("category", existing["category"]) or "").strip()
            short_desc = (body.get("short_description", existing["short_description"]) or "").strip()
            content = (body.get("content", existing["content"]) or "").strip()
            report_date = (body.get("report_date", existing["report_date"]) or "").strip()
            region = (body.get("region", existing["region"]) or "").strip()
            blood_group = (body.get("blood_group", existing["blood_group"]) or "N/A").strip()
            status = body.get("status", existing["status"])
            cover_doc_id = body["cover_doc_id"] if "cover_doc_id" in body else existing["cover_doc_id"]
            cover_image_url = body["cover_image_url"] if "cover_image_url" in body else existing["cover_image_url"]
            attachment_doc_id = body["attachment_doc_id"] if "attachment_doc_id" in body else existing["attachment_doc_id"]

            if status not in {"draft", "published"} or category not in REPORT_CATEGORIES:
                return self.send_json(400, {"error": "Invalid status or category."})

            now = utc_now_iso()
            conn.execute(
                """
                UPDATE reports SET
                    title=?, category=?, short_description=?, content=?, report_date=?,
                    region=?, blood_group=?, status=?, cover_doc_id=?, cover_image_url=?,
                    attachment_doc_id=?, updated_at=?
                WHERE id=?
                """,
                (
                    title, category, short_desc, content, report_date,
                    region, blood_group, status, cover_doc_id, cover_image_url,
                    attachment_doc_id, now, rid,
                ),
            )
            conn.execute(
                "INSERT INTO activity_log (actor_email, action, target_title, created_at) VALUES (?, ?, ?, ?)",
                (admin["email"], f"Updated report ({status})", title, now),
            )
            updated = conn.execute("SELECT * FROM reports WHERE id = ?", (rid,)).fetchone()
            conn.commit()
        return self.send_json(200, {"report": row_to_report(updated)})

    def do_DELETE(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        m = re.fullmatch(r"/api/admin/reports/(\d+)", parsed.path)
        if not m:
            return self.send_json(404, {"error": "Endpoint not found."})

        admin = self.require_admin()
        if not admin:
            return
        rid = int(m.group(1))
        with get_conn() as conn:
            existing = conn.execute("SELECT title FROM reports WHERE id = ?", (rid,)).fetchone()
            if not existing:
                return self.send_json(404, {"error": "Report not found."})
            conn.execute("DELETE FROM reports WHERE id = ?", (rid,))
            conn.execute(
                "INSERT INTO activity_log (actor_email, action, target_title, created_at) VALUES (?, ?, ?, ?)",
                (admin["email"], "Deleted report", existing["title"], utc_now_iso()),
            )
            conn.commit()
        return self.send_json(200, {"deleted": True, "id": rid})


def run_server(port: int = 8000) -> None:
    init_db()
    server = ThreadingHTTPServer(("127.0.0.1", port), PBSNHandler)
    print(f"[PBSN] Server running at http://127.0.0.1:{port} (SQLite: {os.path.join(BASE_DIR, 'pbsn.db')})")
    server.serve_forever()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PBSN Backend Server")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    run_server(args.port)
