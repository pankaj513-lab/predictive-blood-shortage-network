"""
PBSN — Lightweight Frontend Static Dev Server
Serves the browser-native HTML/CSS/JS application and exposes /api/config
from .env (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) without starting a
separate local database/backend server.
"""
import argparse
import json
import mimetypes
import os
import socket
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))


def load_public_env() -> dict:
    cfg = {
        "VITE_SUPABASE_URL": os.environ.get("VITE_SUPABASE_URL", ""),
        "VITE_SUPABASE_ANON_KEY": os.environ.get("VITE_SUPABASE_ANON_KEY", ""),
    }
    env_path = os.path.join(ROOT_DIR, ".env")
    if os.path.isfile(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for raw in f:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k in ("VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY") and v:
                    cfg[k] = v
    return cfg


def pick_available_port(preferred: int = 5173) -> int:
    for port in [preferred, *range(5174, 5200)]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return preferred


class FrontendDevHandler(BaseHTTPRequestHandler):
    server_version = "PBSN-DevServer/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[PBSN-DEV] {self.address_string()} - {fmt % args}")

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/config":
            body = json.dumps(load_public_env()).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path == "/":
            path = "/index.html"

        rel = urllib.parse.unquote(path.lstrip("/")).replace("/", os.sep)
        first_seg = rel.split(os.sep)[0].lower()
        if first_seg in {"backend", ".git"} or rel.startswith(".") or rel.endswith(".py") or rel.endswith(".db"):
            self.send_error(403, "Forbidden")
            return

        full = os.path.abspath(os.path.join(ROOT_DIR, rel))
        if not full.startswith(os.path.abspath(ROOT_DIR)) or not os.path.isfile(full):
            self.send_error(404, "Not Found")
            return

        ctype, _ = mimetypes.guess_type(full)
        with open(full, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", ctype or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PBSN Frontend Dev Server")
    parser.add_argument("--port", type=int, default=5173)
    args = parser.parse_args()
    chosen_port = pick_available_port(args.port)
    srv = ThreadingHTTPServer(("127.0.0.1", chosen_port), FrontendDevHandler)
    print(f"[PBSN-DEV] Serving frontend at http://localhost:{chosen_port}/")
    srv.serve_forever()
