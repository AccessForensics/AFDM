const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function fatal(msg, code = 2) {
  console.error(msg);
  process.exit(code);
}

function sha256File(p) {
  const h = crypto.createHash("sha256");
  h.update(fs.readFileSync(p));
  return h.digest("hex");
}

function listFilesRec(dir) {
  const out = [];
  const stack = [dir];

  while (stack.length) {
    const cur = stack.pop();
    const entries = fs.readdirSync(cur, { withFileTypes: true });

    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) out.push(full);
    }
  }
  return out;
}

function toPosixRel(root, fullPath) {
  const rel = path.relative(root, fullPath);
  return rel.split(path.sep).join("/");
}

/**
 * Seals a directory by writing:
 * - index.json: deterministic, lexicographically sorted list of file hashes
 * - packet_hash.txt: sha256(index.json)
 *
 * Exclusions:
 * - packet_hash.txt is excluded from index (prevents circular hashing)
 */
function sealDir(rootDir) {
  const rootAbs = path.resolve(rootDir);
  if (!fs.existsSync(rootAbs)) fatal("[FATAL] Directory not found: " + rootAbs, 3);

  const indexPath = path.join(rootAbs, "index.json");
  const packetHashPath = path.join(rootAbs, "packet_hash.txt");

  const files = listFilesRec(rootAbs)
    .filter(p => path.basename(p) !== "packet_hash.txt")
    .map(p => ({ full: p, rel: toPosixRel(rootAbs, p) }))
    .sort((a, b) => a.rel.localeCompare(b.rel, "en"));

  const items = files.map(f => ({
    path: f.rel,
    sha256: sha256File(f.full)
  }));

  const indexObj = {
    t: "AF_INDEX",
    root: path.basename(rootAbs),
    count: items.length,
    items
  };

  fs.writeFileSync(indexPath, JSON.stringify(indexObj, null, 2) + "\n", "utf8");

  const indexHash = sha256File(indexPath);
  fs.writeFileSync(packetHashPath, indexHash + "\n", "utf8");

  console.log("[OK] sealed:", rootAbs);
  console.log("[OK] index.json:", indexPath);
  console.log("[OK] packet_hash.txt:", packetHashPath);
  console.log("[OK] packet_hash:", indexHash);
}

const target = process.argv[2];
if (!target) fatal("Usage: node tools/seal_packet.js <dir>", 1);

sealDir(target);
process.exit(0);
