import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, "dist");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// Copy all HTML pages and root stylesheet
for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && (entry.name.endsWith(".html") || entry.name === "styles.css")) {
    fs.copyFileSync(path.join(root, entry.name), path.join(out, entry.name));
  }
}

// Copy public frontend JS and assets
for (const dir of ["src", "assets"]) {
  const srcDir = path.join(root, dir);
  if (fs.existsSync(srcDir)) {
    fs.cpSync(srcDir, path.join(out, dir), { recursive: true });
  }
}

console.log("[PBSN build] Prepared static output in dist/");
