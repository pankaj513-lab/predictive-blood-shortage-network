"""
PBSN — SQLite Persistent Database Layer (PostgreSQL/MySQL schema-compatible)
Handles admins, reports, uploaded documents metadata, and recent admin activity.
"""
import os
import sqlite3
import hashlib
import secrets
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "pbsn.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

REPORT_CATEGORIES = [
    "AI Blood Shortage Prediction Reports",
    "Blood Inventory Reports",
    "Blood Demand Forecast Reports",
    "Regional Blood Availability Reports",
    "Emergency Blood Request Reports",
    "Hospital Network Reports",
    "Research and Project Reports",
    "General Reports",
]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def hash_password(password: str, salt_hex: str | None = None) -> str:
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return f"{salt.hex()}${dk.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_hex, dk_hex = stored_hash.split("$", 1)
        expected = hash_password(password, salt_hex)
        return secrets.compare_digest(expected, stored_hash)
    except Exception:
        return False


def init_db() -> None:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                full_name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                doc_kind TEXT NOT NULL,
                uploaded_by TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                short_description TEXT NOT NULL,
                content TEXT NOT NULL,
                report_date TEXT NOT NULL,
                region TEXT NOT NULL,
                blood_group TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('draft', 'published')),
                cover_doc_id TEXT,
                cover_image_url TEXT,
                attachment_doc_id TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (cover_doc_id) REFERENCES documents(id) ON DELETE SET NULL,
                FOREIGN KEY (attachment_doc_id) REFERENCES documents(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor_email TEXT NOT NULL,
                action TEXT NOT NULL,
                target_title TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS emergency_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ref_id TEXT NOT NULL,
                blood_group TEXT NOT NULL,
                units INTEGER NOT NULL,
                hospital TEXT NOT NULL,
                city TEXT NOT NULL,
                urgency TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS inquiries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                inquiry_type TEXT NOT NULL,
                subject TEXT NOT NULL,
                blood_group TEXT NOT NULL,
                units INTEGER NOT NULL,
                city TEXT NOT NULL,
                contact TEXT NOT NULL,
                notes TEXT,
                created_at TEXT NOT NULL
            );
            """
        )

        # Optional initial admin via environment variables only (never hardcoded in frontend)
        env_email = os.environ.get("PBSN_ADMIN_EMAIL", "").strip().lower()
        env_pass = os.environ.get("PBSN_ADMIN_PASSWORD", "")
        if env_email and len(env_pass) >= 8:
            exists = conn.execute("SELECT id FROM admins WHERE email = ?", (env_email,)).fetchone()
            if not exists:
                conn.execute(
                    "INSERT INTO admins (email, full_name, password_hash, created_at) VALUES (?, ?, ?, ?)",
                    (env_email, "PBSN Administrator", hash_password(env_pass), utc_now_iso()),
                )

        # Seed realistic demo reports (2 published, 1 private draft) if reports table is empty
        count = conn.execute("SELECT COUNT(*) FROM reports").fetchone()[0]
        if count == 0:
            now = utc_now_iso()
            seed = [
                (
                    "National O-Negative Critical Buffer & Monsoon Forecast (Q3)",
                    "AI Blood Shortage Prediction Reports",
                    "7-day predictive risk assessment highlighting O-negative supply pressure across New Delhi and Mumbai trauma centers during seasonal dips.",
                    "Executive Summary:\nTime-series demand modeling across 8 metropolitan blood centres indicates a 22% seasonal dip in voluntary whole-blood collections paired with elevated emergency demand at AIIMS New Delhi and KEM Hospital Mumbai.\n\nRecommended Actions:\n1. Pre-position 16 units of O-negative RBCs from Manipal Hospital Bengaluru and Ruby Hall Clinic Pune.\n2. Trigger targeted consent-protected donor alerts across North India and West India corridors.\n3. Enforce FEFO rotation for units within 5 days of expiry.",
                    "2026-11-24",
                    "New Delhi & Mumbai",
                    "O-",
                    "published",
                    None,
                    "./assets/images/lab-mumbai.jpg",
                    None,
                    now,
                    now,
                ),
                (
                    "Platelet 5-Day Expiry & Regional Wastage Audit",
                    "Blood Inventory Reports",
                    "Cross-hospital inventory analysis detailing cold-chain turnover and FEFO redistribution opportunities for short-shelf-life platelets.",
                    "Summary Findings:\nPlatelets remain viable for 5 days post-collection, making regional imbalance the leading cause of preventable component wastage.\n\nInter-Bank Optimization:\nAutomated matching pairs surplus apheresis units in Bengaluru and Pune with high-turnover oncology and trauma departments in Hyderabad and Chennai within a 4-hour dispatch window.",
                    "2026-11-20",
                    "Bengaluru, Pune & Hyderabad",
                    "B+",
                    "published",
                    None,
                    "./assets/images/blood-bags.jpg",
                    None,
                    now,
                    now,
                ),
                (
                    "Internal Draft: Q4 Trauma Surge Stress-Test Parameters",
                    "Research and Project Reports",
                    "Internal draft calibration notes for holiday highway trauma multipliers and cold-chain reserve thresholds.",
                    "CONFIDENTIAL ADMIN DRAFT:\nEvaluating +55% acute trauma demand multipliers for O- and O+ blood groups across North and West India highway corridors. Pending clinical sign-off before public release.",
                    "2026-11-26",
                    "All India",
                    "O+",
                    "draft",
                    None,
                    "./assets/images/lab-techs.jpg",
                    None,
                    now,
                    now,
                ),
            ]
            conn.executemany(
                """
                INSERT INTO reports (
                    title, category, short_description, content, report_date,
                    region, blood_group, status, cover_doc_id, cover_image_url,
                    attachment_doc_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                seed,
            )
            conn.execute(
                "INSERT INTO activity_log (actor_email, action, target_title, created_at) VALUES (?, ?, ?, ?)",
                ("system", "Seeded initial PBSN reports", "2 published, 1 draft", now),
            )
        conn.commit()
