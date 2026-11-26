"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT_DIR = path.resolve(__dirname, "..");

const EXPECTED_HTML_PAGES = [
  "index.html",
  "dashboard.html",
  "network.html",
  "requests-donors.html",
  "reports.html",
  "about.html",
  "auth.html",
  "user-dashboard.html",
  "hospital-login.html",
  "hospital-dashboard.html",
  "admin-login.html",
  "admin.html",
];

function collectLocalRefs(html) {
  const refs = [];
  const patterns = [
    /<script[^>]+src=["']([^"']+)["']/gi,
    /<link[^>]+href=["']([^"']+)["']/gi,
    /<img[^>]+src=["']([^"']+)["']/gi,
  ];
  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(html)) !== null) {
      const value = match[1].trim();
      if (
        !value ||
        value.startsWith("http://") ||
        value.startsWith("https://") ||
        value.startsWith("//") ||
        value.startsWith("data:") ||
        value.startsWith("mailto:") ||
        value.startsWith("tel:") ||
        value.startsWith("#")
      ) {
        continue;
      }
      refs.push(value.split("?")[0].split("#")[0]);
    }
  }
  return refs;
}

test("all 12 expected HTML pages exist at repository root", () => {
  for (const page of EXPECTED_HTML_PAGES) {
    assert.equal(
      fs.existsSync(path.join(ROOT_DIR, page)),
      true,
      `Missing expected HTML page: ${page}`
    );
  }
});

test("every local script, stylesheet, and image reference resolves on disk", () => {
  for (const page of EXPECTED_HTML_PAGES) {
    const html = fs.readFileSync(path.join(ROOT_DIR, page), "utf8");
    const refs = collectLocalRefs(html);
    assert.ok(refs.length > 0, `${page} should reference at least one local asset`);
    for (const ref of refs) {
      const resolved = path.resolve(ROOT_DIR, ref.replace(/^\//, ""));
      assert.equal(
        fs.existsSync(resolved),
        true,
        `${page} references missing local asset: ${ref}`
      );
    }
  }
});

test("every HTML page includes shared-header and non-shell pages include shared-footer mounts", () => {
  const fullShellPages = new Set(["admin.html"]);
  for (const page of EXPECTED_HTML_PAGES) {
    const html = fs.readFileSync(path.join(ROOT_DIR, page), "utf8");
    assert.match(html, /id=["']shared-header["']/, `${page} missing #shared-header`);
    if (!fullShellPages.has(page)) {
      assert.match(html, /id=["']shared-footer["']/, `${page} missing #shared-footer`);
    }
    assert.match(html, /src\/sharedChrome\.js/, `${page} should load src/sharedChrome.js`);
  }
});

test("no HTML or src JS file exposes service_role, sb_secret_, live publishable keys, or JWTs", () => {
  const srcFiles = fs
    .readdirSync(path.join(ROOT_DIR, "src"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join("src", name));

  const filesToScan = [...EXPECTED_HTML_PAGES, ...srcFiles];
  const forbiddenPatterns = [
    /service_role/i,
    /sb_secret_[A-Za-z0-9_-]{8,}/,
    /sb_publishable_[A-Za-z0-9_-]{12,}/,
    /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\./,
  ];

  for (const rel of filesToScan) {
    const content = fs.readFileSync(path.join(ROOT_DIR, rel), "utf8");
    for (const pattern of forbiddenPatterns) {
      assert.equal(
        pattern.test(content),
        false,
        `Potential secret pattern ${pattern} found in ${rel}`
      );
    }
  }
});

test("all src/*.js modules pass node --check syntax validation", () => {
  const srcDir = path.join(ROOT_DIR, "src");
  const jsFiles = fs.readdirSync(srcDir).filter((name) => name.endsWith(".js"));
  assert.ok(jsFiles.length >= 5);
  for (const file of jsFiles) {
    execFileSync(process.execPath, ["--check", path.join(srcDir, file)], {
      stdio: "pipe",
    });
  }
});

test("sharedChrome.js navigation links target existing HTML pages", () => {
  const chromeSource = fs.readFileSync(
    path.join(ROOT_DIR, "src", "sharedChrome.js"),
    "utf8"
  );
  const hrefMatches = [...chromeSource.matchAll(/href:\s*["']([^"']+\.html)["']/g)];
  assert.ok(hrefMatches.length >= 6, "Expected navigation links in sharedChrome.js");
  for (const match of hrefMatches) {
    const target = match[1].replace(/^\.\//, "");
    assert.equal(
      fs.existsSync(path.join(ROOT_DIR, target)),
      true,
      `sharedChrome.js links to missing page: ${target}`
    );
  }
});
