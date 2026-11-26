import io
import os
import sys
import json
import unittest
from unittest.mock import patch

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

import dev_server
from backend.model import predict_shortage_risk


class _FakeSocket:
    def __init__(self, raw_request: bytes):
        self._rfile = io.BytesIO(raw_request)
        self._wfile = io.BytesIO()

    def makefile(self, mode: str, *args, **kwargs):
        return self._rfile if "r" in mode else self._wfile

    def sendall(self, data: bytes) -> None:
        self._wfile.write(data)

    def close(self) -> None:
        pass


def _invoke_handler(raw_http_request: bytes) -> tuple[int, dict[str, str], bytes]:
    sock = _FakeSocket(raw_http_request)
    # BaseHTTPRequestHandler runs handle() in __init__ and writes the full HTTP wire response to wfile.
    dev_server.FrontendDevHandler(sock, ("127.0.0.1", 55000), server=None)
    raw = sock._wfile.getvalue()
    head, _, body = raw.partition(b"\r\n\r\n")
    lines = head.decode("iso-8859-1").split("\r\n")
    status_code = int(lines[0].split(" ", 2)[1])
    headers: dict[str, str] = {}
    for line in lines[1:]:
        if ":" in line:
            k, v = line.split(":", 1)
            headers[k.strip()] = v.strip()
    return status_code, headers, body


class DevServerSecurityAndStaticTests(unittest.TestCase):
    def test_resolve_safe_static_path_blocks_traversal_and_sensitive_files(self):
        forbidden_paths = [
            "/backend/main.py",
            "/backend/model.py",
            "/.env",
            "/.git/config",
            "/../outside.txt",
            "/src/../../secret.txt",
            "/dev_server.py",
            "/data.sqlite",
            "/app.log",
        ]
        for path in forbidden_paths:
            status, full = dev_server.FrontendDevHandler.resolve_safe_static_path(ROOT_DIR, path)
            self.assertEqual(status, 403, f"Expected 403 for {path}, got {status}")
            self.assertIsNone(full)

        status_root, full_root = dev_server.FrontendDevHandler.resolve_safe_static_path(ROOT_DIR, "/")
        self.assertEqual(status_root, 200)
        self.assertTrue(full_root and full_root.endswith("index.html"))

        status_missing, full_missing = dev_server.FrontendDevHandler.resolve_safe_static_path(
            ROOT_DIR, "/does-not-exist-12345.html"
        )
        self.assertEqual(status_missing, 404)
        self.assertIsNone(full_missing)

    def test_load_public_env_never_exposes_service_role_keys(self):
        original_url = os.environ.get("VITE_SUPABASE_URL")
        original_anon = os.environ.get("VITE_SUPABASE_ANON_KEY")
        original_sr = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        try:
            os.environ["VITE_SUPABASE_URL"] = "https://example.supabase.co"
            os.environ["VITE_SUPABASE_ANON_KEY"] = "anon_test_value"
            os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "should_never_leak"
            cfg = dev_server.load_public_env()
            self.assertEqual(set(cfg.keys()), {"VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"})
            self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", cfg)
            self.assertTrue(cfg["VITE_SUPABASE_URL"])
            self.assertTrue(cfg["VITE_SUPABASE_ANON_KEY"])
        finally:
            for key, val in [
                ("VITE_SUPABASE_URL", original_url),
                ("VITE_SUPABASE_ANON_KEY", original_anon),
                ("SUPABASE_SERVICE_ROLE_KEY", original_sr),
            ]:
                if val is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = val

    def test_pick_available_port_skips_occupied_preferred_port(self):
        class _DummySock:
            def __init__(self, *args, **kwargs):
                pass

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def connect_ex(self, addr):
                # Simulate 5173 busy (0) and 5174 free (10061)
                return 0 if addr[1] == 5173 else 10061

        with patch("dev_server.socket.socket", _DummySock):
            selected = dev_server.pick_available_port(5173)
        self.assertEqual(selected, 5174)

    def test_http_handler_endpoints_and_security_headers(self):
        # 1. /api/config returns JSON with security headers and no secrets
        status, headers, body = _invoke_handler(b"GET /api/config HTTP/1.1\r\nHost: localhost:5173\r\n\r\n")
        self.assertEqual(status, 200)
        self.assertIn("application/json", headers.get("Content-Type", ""))
        self.assertEqual(headers.get("X-Content-Type-Options"), "nosniff")
        self.assertEqual(headers.get("X-Frame-Options"), "SAMEORIGIN")
        self.assertEqual(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin")
        self.assertEqual(headers.get("Cache-Control"), "no-store")
        data = json.loads(body.decode("utf-8"))
        self.assertEqual(set(data.keys()), {"VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"})

        # 2. Root HTML serves 200 with security headers
        status_root, headers_root, body_root = _invoke_handler(b"GET / HTTP/1.1\r\nHost: localhost:5173\r\n\r\n")
        self.assertEqual(status_root, 200)
        html_root = body_root.decode("utf-8")
        self.assertIn('id="shared-header"', html_root)
        self.assertIn("PBSN", html_root)
        self.assertEqual(headers_root.get("X-Frame-Options"), "SAMEORIGIN")

        # 3. OPTIONS preflight returns 204
        status_opt, headers_opt, _ = _invoke_handler(b"OPTIONS /api/config HTTP/1.1\r\nHost: localhost:5173\r\n\r\n")
        self.assertEqual(status_opt, 204)
        self.assertEqual(headers_opt.get("Access-Control-Allow-Origin"), "*")

        # 4. Forbidden paths return 403
        for blocked in ("/dev_server.py", "/.env", "/backend/model.py", "/../secret"):
            req = f"GET {blocked} HTTP/1.1\r\nHost: localhost:5173\r\n\r\n".encode("ascii")
            status_b, _, _ = _invoke_handler(req)
            self.assertEqual(status_b, 403, f"Expected 403 for {blocked}")

        # 5. Missing page returns 404
        status_404, _, _ = _invoke_handler(b"GET /nonexistent-pbsn-page.html HTTP/1.1\r\nHost: localhost:5173\r\n\r\n")
        self.assertEqual(status_404, 404)


class BackendModelPredictionTests(unittest.TestCase):
    def test_critical_risk_for_low_inventory_negative_rh(self):
        result = predict_shortage_risk({
            "group": "O-",
            "region": "Ranchi",
            "currentInventory": 12,
            "historicalDailyDemand": 10,
            "expectedDailyDemand": 14,
            "periodDays": 7,
        })
        self.assertEqual(result["riskLevel"], "Critical Risk")
        self.assertEqual(result["group"], "O-")
        self.assertEqual(result["region"], "Ranchi")
        self.assertLessEqual(result["netProjectedBalance"], 0)
        self.assertIn("Projected Deficit", result["inventoryStatus"])

    def test_high_moderate_and_low_risk_classifications(self):
        high = predict_shortage_risk({
            "group": "A+",
            "region": "Dhanbad",
            "currentInventory": 50,
            "historicalDailyDemand": 8,
            "expectedDailyDemand": 8,
            "periodDays": 10,
        })
        self.assertEqual(high["riskLevel"], "High Risk")

        moderate = predict_shortage_risk({
            "group": "B+",
            "region": "Jamshedpur",
            "currentInventory": 70,
            "historicalDailyDemand": 8,
            "expectedDailyDemand": 8,
            "periodDays": 10,
        })
        self.assertEqual(moderate["riskLevel"], "Moderate Risk")

        low = predict_shortage_risk({
            "group": "AB+",
            "region": "Bokaro",
            "currentInventory": 200,
            "historicalDailyDemand": 8,
            "expectedDailyDemand": 8,
            "periodDays": 10,
        })
        self.assertEqual(low["riskLevel"], "Low Risk")
        self.assertIn("Projected Surplus", low["inventoryStatus"])
        self.assertEqual(low["shortagePeriod"], "No shortage projected within window")


if __name__ == "__main__":
    unittest.main()
