import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(process.cwd(), "dist");

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (entry.isFile() && (entry.name.endsWith(".html") || entry.name === "styles.css")) {
    fs.copyFileSync(path.join(root, entry.name), path.join(out, entry.name));
  }
}

for (const dir of ["src", "assets"]) {
  const srcDir = path.join(root, dir);
  if (fs.existsSync(srcDir)) {
    fs.cpSync(srcDir, path.join(out, dir), { recursive: true });
  }
}

console.log("[PBSN build] cwd:", process.cwd(), "out:", out, "items:", fs.readdirSync(out).length);
