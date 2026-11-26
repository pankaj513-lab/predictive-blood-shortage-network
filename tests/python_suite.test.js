"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");

function resolvePythonExecutable() {
  const candidates = [
    process.env.PYTHON,
    "C:\\Users\\panka\\AppData\\Local\\Python\\bin\\python.exe",
    "python",
    "python3",
  ].filter(Boolean);

  for (const cmd of candidates) {
    try {
      execFileSync(cmd, ["--version"], { stdio: "pipe" });
      return cmd;
    } catch {
      // Try next candidate.
    }
  }
  throw new Error("No Python executable found to run Python unit tests.");
}

test("Python unit test suite (dev_server.py and backend/model.py) passes completely", () => {
  const python = resolvePythonExecutable();
  const res = spawnSync(
    python,
    ["-m", "unittest", "tests/test_server_and_model.py", "-v"],
    {
      cwd: ROOT_DIR,
      encoding: "utf8",
    }
  );
  const combined = `${res.stdout || ""}\n${res.stderr || ""}`;
  assert.equal(res.status, 0, `Python tests failed:\n${combined}`);
  assert.match(combined, /Ran \d+ tests? in .*OK/s);
});
