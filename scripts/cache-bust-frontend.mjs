import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const frontendDir = path.join(root, "frontend");
const indexPath = path.join(frontendDir, "index.html");

let html = fs.readFileSync(indexPath, "utf8");

function hashFile(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 8);
}

html = html.replace(
  /(src|href)="([^"]+\.(?:js|jsx|css))(?:\?v=[^"]*)?"/g,
  (match, attr, assetPath) => {
    if (/^https?:\/\//.test(assetPath)) return match;

    const cleanPath = assetPath.replace(/^\.\//, "");
    const fullPath = path.join(frontendDir, cleanPath);

    if (!fs.existsSync(fullPath)) return match;

    const version = hashFile(fullPath);
    return `${attr}="${cleanPath}?v=${version}"`;
  }
);

fs.writeFileSync(indexPath, html);
console.log("Updated frontend asset versions.");
