"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;

    if (a.includes("=")) {
      const [k, v] = a.slice(2).split("=", 2);
      out[k] = v;
      continue;
    }

    const k = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[k] = next;
      i++;
    } else {
      out[k] = true;
    }
  }
  return out;
}

function readUtf8NoBom(p) {
  let s = fs.readFileSync(p, "utf8");
  if (s && s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s;
}

function writeUtf8NoBom(p, s) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s, { encoding: "utf8" }); // Node writes UTF-8 no BOM
}

function sha256File(p) {
  const h = crypto.createHash("sha256");
  const fd = fs.openSync(p, "r");
  try {
    const buf = Buffer.allocUnsafe(1024 * 1024);
    while (true) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (!n) break;
      h.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest("hex");
}

function listFilesRecursive(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length) {
    const cur = stack.pop();
    const ents = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of ents) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) files.push(full);
    }
  }
  return files;
}

function safeJsonParse(filePath) {
  return JSON.parse(readUtf8NoBom(filePath));
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  const ents = fs.readdirSync(src, { withFileTypes: true });
  for (const e of ents) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isFile()) {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
    }
  }
}

function requireExifTool(repoRoot) {
  const p = path.join(repoRoot, "tools", "exiftool", "exiftool.exe");
  if (!fs.existsSync(p)) {
    throw new Error("ExifTool missing. Required at tools\\exiftool\\exiftool.exe (vendored, pinned).");
  }
  return p;
}

function run(exe, args, opts) {
  const r = spawnSync(exe, args, Object.assign({ stdio: "ignore" }, opts || {}));
  if (r.status !== 0) throw new Error("Command failed: " + exe + " " + args.join(" "));
}

function stripWrapperMetadata(exiftoolPath, deliverDir) {
  const all = listFilesRecursive(deliverDir);

  const isInPackets = (p) => {
    const rel = path.relative(deliverDir, p).replace(/\//g, "\\").toLowerCase();
    return rel.startsWith("packets\\");
  };

  const targets = all.filter(p => {
    const low = p.toLowerCase();
    const isMedia = low.endsWith(".png") || low.endsWith(".pdf");
    return isMedia && !isInPackets(p);
  });

  for (const f of targets) {
    run(exiftoolPath, ["-overwrite_original", "-all=", "--charset", "filename=utf8", f]);
  }
}

function findWrapperLeakage(deliverDir) {
  // Immutable Core: hard gate wrappers only, never fail the run because packets contain leakage.
  // Packets get fixed pre-seal in a later sprint.
  const textExt = new Set([".txt", ".json", ".csv", ".md", ".html", ".htm", ".xml", ".log", ".sha256"]);
  const files = listFilesRecursive(deliverDir).filter(p => textExt.has(path.extname(p).toLowerCase()));

  const isInPackets = (p) => {
    const rel = path.relative(deliverDir, p).replace(/\//g, "\\").toLowerCase();
    return rel.startsWith("packets\\");
  };

  // Generic Windows user-path patterns, plus your known alias needles
  const needleRegexes = [
    /[a-z]:\\users\\[^\s\\]+/ig,
    /\\users\\[^\s\\]+/ig,
    /\bskirvin\b/ig,
    /\bmskirv\b/ig,
    /\bmskir\b/ig
  ];

  const hits = [];
  for (const f of files) {
    const rel = path.relative(deliverDir, f).replace(/\//g, "\\");
    const raw = readUtf8NoBom(f);
    for (const rx of needleRegexes) {
      rx.lastIndex = 0;
      if (rx.test(raw)) {
        hits.push({ rel, needle: rx.toString(), scope: isInPackets(f) ? "PACKET_WARN" : "WRAPPER_FAIL" });
      }
    }
  }

  const wrapperFails = hits.filter(h => h.scope === "WRAPPER_FAIL");
  const packetWarns  = hits.filter(h => h.scope === "PACKET_WARN");
  return { wrapperFails, packetWarns };
}

function pickPacketsAuto(repoRoot, matterId) {
  const artifactsRoot = path.join(repoRoot, "artifacts");
  if (!fs.existsSync(artifactsRoot)) throw new Error("artifacts/ folder not found at repo root.");

  const dirs = fs.readdirSync(artifactsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith(matterId + "_"))
    .map(d => path.join(artifactsRoot, d.name));

  if (dirs.length < 2) {
    throw new Error("Could not find at least 2 packet folders under artifacts/ for " + matterId);
  }

  const scored = [];
  for (const d of dirs) {
    const mPath = path.join(d, "manifest.json");
    if (!fs.existsSync(mPath)) continue;

    let j;
    try { j = safeJsonParse(mPath); } catch { continue; }

    const vw = j && j.viewport && typeof j.viewport.width === "number" ? j.viewport.width : null;
    const kind = (vw !== null && vw <= 700) ? "mobile" : "desktop";
    const stat = fs.statSync(d);
    scored.push({ dir: d, kind, mtime: stat.mtimeMs });
  }

  const desktop = scored.filter(x => x.kind === "desktop").sort((a, b) => b.mtime - a.mtime)[0];
  const mobile  = scored.filter(x => x.kind === "mobile").sort((a, b) => b.mtime - a.mtime)[0];

  if (desktop && mobile) return { desktopDir: desktop.dir, mobileDir: mobile.dir };

  const newest = scored.sort((a, b) => b.mtime - a.mtime).slice(0, 2);
  if (newest.length < 2) throw new Error("Packet pick failed, not enough usable packet folders.");
  return { desktopDir: newest[0].dir, mobileDir: newest[1].dir };
}

function main() {
  const args = parseArgs(process.argv);

  const repoRoot = process.cwd();
  if (!fs.existsSync(path.join(repoRoot, "package.json"))) {
    throw new Error("Run from repo root, package.json not found.");
  }

  const caseRoot = args.caseRoot || args.case || null;
  if (!caseRoot) throw new Error("Missing --caseRoot <path>.");

  const caseRootAbs = path.resolve(caseRoot);
  if (!fs.existsSync(caseRootAbs)) throw new Error("caseRoot does not exist: " + caseRootAbs);

  const deliverDir = path.join(caseRootAbs, "Deliverable_Packet");
  const intakeDir = path.join(caseRootAbs, "intake");
  const caseManifestPath = path.join(caseRootAbs, "manifest.json");

  let matterId = path.basename(caseRootAbs);
  let target = null;

  if (fs.existsSync(caseManifestPath)) {
    const j = safeJsonParse(caseManifestPath);
    if (j && typeof j.matter_id === "string" && j.matter_id.trim()) matterId = j.matter_id.trim();
    if (j && typeof j.url === "string" && j.url.trim()) target = j.url.trim();
  }

  if (!target && fs.existsSync(path.join(intakeDir, "targets.txt"))) {
    const t = readUtf8NoBom(path.join(intakeDir, "targets.txt"))
      .split(/\r?\n/).map(x => x.trim()).filter(Boolean)[0];
    if (t) target = t.startsWith("http") ? t : ("https://" + t);
  }

  if (!target) throw new Error("Could not determine target URL (manifest.json or intake/targets.txt).");

  // Build Deliverable_Packet structure
  fs.mkdirSync(path.join(deliverDir, "intake"), { recursive: true });
  fs.mkdirSync(path.join(deliverDir, "packets", "desktop"), { recursive: true });
  fs.mkdirSync(path.join(deliverDir, "packets", "mobile"), { recursive: true });

  // Copy intake essentials (if present)
  const intakeFiles = [
    "complaint.txt",
    "targets.txt",
    "INTAKE_SUMMARY.txt",
    "selected_targets.txt",
    "candidates.json",
    "candidates_flat.txt"
  ];

  for (const f of intakeFiles) {
    const src = path.join(intakeDir, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(deliverDir, "intake", f));
  }

  // Copy packets into deliverable if not already there
  const existingDesk = fs.readdirSync(path.join(deliverDir, "packets", "desktop"), { withFileTypes: true })
    .some(d => d.isDirectory());
  const existingMob = fs.readdirSync(path.join(deliverDir, "packets", "mobile"), { withFileTypes: true })
    .some(d => d.isDirectory());

  if (!existingDesk || !existingMob) {
    const picked = pickPacketsAuto(repoRoot, matterId);
    const deskName = path.basename(picked.desktopDir);
    const mobName  = path.basename(picked.mobileDir);

    const deskDst = path.join(deliverDir, "packets", "desktop", deskName);
    const mobDst  = path.join(deliverDir, "packets", "mobile", mobName);

    if (!fs.existsSync(deskDst)) copyDir(picked.desktopDir, deskDst);
    if (!fs.existsSync(mobDst))  copyDir(picked.mobileDir,  mobDst);
  }

  // Validate packet minimums
  const req = ["packet_hash.txt", "manifest.json", "index.json", "journal.ndjson"];
  function mustHavePacket(packetDir) {
    for (const r of req) {
      if (!fs.existsSync(path.join(packetDir, r))) throw new Error("Missing " + r + " in " + packetDir);
    }
  }

  const deskPktDir = fs.readdirSync(path.join(deliverDir, "packets", "desktop"), { withFileTypes: true })
    .filter(d => d.isDirectory())[0];
  const mobPktDir = fs.readdirSync(path.join(deliverDir, "packets", "mobile"), { withFileTypes: true })
    .filter(d => d.isDirectory())[0];

  if (!deskPktDir || !mobPktDir) throw new Error("Deliverable_Packet missing desktop or mobile packet folder.");

  const deskPktPath = path.join(deliverDir, "packets", "desktop", deskPktDir.name);
  const mobPktPath  = path.join(deliverDir, "packets", "mobile",  mobPktDir.name);

  mustHavePacket(deskPktPath);
  mustHavePacket(mobPktPath);

  const deskHash = readUtf8NoBom(path.join(deskPktPath, "packet_hash.txt")).split(/\r?\n/)[0].trim();
  const mobHash  = readUtf8NoBom(path.join(mobPktPath,  "packet_hash.txt")).split(/\r?\n/)[0].trim();

  // CASE_SUMMARY.txt, NEVER write absolute operator paths
  const caseSummary =
`matter_id: ${matterId}
target: ${target}

desktop_packet_dir: packets\\desktop\\${deskPktDir.name}
desktop_packet_hash: ${deskHash}

mobile_packet_dir: packets\\mobile\\${mobPktDir.name}
mobile_packet_hash: ${mobHash}
`;
  writeUtf8NoBom(path.join(deliverDir, "CASE_SUMMARY.txt"), caseSummary);

  // CASE_MANIFEST.json into deliverable root if present
  if (fs.existsSync(caseManifestPath)) {
    fs.copyFileSync(caseManifestPath, path.join(deliverDir, "CASE_MANIFEST.json"));
  }

  // HARD FAIL: ExifTool required for delivery builds
  const exiftool = requireExifTool(repoRoot);

  // Strip metadata in WRAPPERS ONLY (never touch packets)
  stripWrapperMetadata(exiftool, deliverDir);

  // Hard gate: leakage in wrappers only, packets become warnings
  const leakage = findWrapperLeakage(deliverDir);
  if (leakage.wrapperFails.length) {
    console.error("\n[FAIL] Wrapper leakage detected (Immutable Core hard gate).");
    for (const h of leakage.wrapperFails) console.error(" - " + h.rel + "  " + h.needle);
    throw new Error("Hard gate: identifiers present in wrapper layer outputs.");
  }
  if (leakage.packetWarns.length) {
    console.warn("\n[WARN] Packet leakage detected (immutable core, not mutated). Pre-seal fix required next sprint.");
    for (const h of leakage.packetWarns.slice(0, 20)) console.warn(" - " + h.rel + "  " + h.needle);
    if (leakage.packetWarns.length > 20) console.warn(" - ... " + (leakage.packetWarns.length - 20) + " more");
  }

  // FILE_HASHES.sha256 (deterministic ordering, exclude itself)
  const hashListPath = path.join(deliverDir, "FILE_HASHES.sha256");
  const allFiles = listFilesRecursive(deliverDir)
    .filter(p => path.basename(p) !== "FILE_HASHES.sha256")
    .filter(p => !p.toLowerCase().endsWith(".zip"));

  const lines = allFiles.map(full => {
    const rel = path.relative(deliverDir, full).replace(/\//g, "\\");
    const h = sha256File(full);
    return `${h}  ${rel}`;
  }).sort((a, b) => a.localeCompare(b, "en"));

  writeUtf8NoBom(hashListPath, lines.join("\r\n") + "\r\n");

  // Zip at case root, refuse to overwrite unless --forceZip
  const zipName = `Deliverable_Packet_${matterId}.zip`;
  const zipPath = path.join(caseRootAbs, zipName);

  if (fs.existsSync(zipPath) && !args.forceZip) {
    throw new Error("Zip already exists. Refusing to overwrite without --forceZip. " + zipPath);
  }

  const ps = spawnSync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-Command",
    "Compress-Archive -Path 'Deliverable_Packet' -DestinationPath " +
      "'" + zipPath.replace(/'/g, "''") + "'" + " -Force"
  ], { cwd: caseRootAbs, stdio: "inherit" });

  if (ps.status !== 0) throw new Error("Compress-Archive failed, exit code " + ps.status);

  // Hash the actual zip bytes and emit the exact 4-line blurb
  const zipSha = sha256File(zipPath);

  const blurb =
`Deliverable: ${zipName}
SHA-256: ${zipSha}
Matter ID: ${matterId}
Target: ${target}
`;

  // Persist where humans and systems will always find it (outside zip, no circularity)
  writeUtf8NoBom(path.join(caseRootAbs, "HANDOFF.txt"), blurb);
  writeUtf8NoBom(path.join(caseRootAbs, zipName + ".sha256.txt"), `${zipSha}  ${zipName}\r\n`);

  // Print for copy/paste transmission
  console.log("\n" + blurb);
}

try {
  main();
} catch (e) {
  console.error("ERROR:", e && e.message ? e.message : e);
  process.exit(1);
}