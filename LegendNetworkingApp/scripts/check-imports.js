// Pre-flight for cloud builds: EAS builds from the git archive on a
// case-sensitive filesystem, so an import can resolve fine on Windows and
// still fail there — either because the file is untracked (gitignored by
// accident) or because its case differs. Reports both.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.argv[2] || path.resolve(__dirname, "..");
const dirs = ['src', 'app'];
const exts = ['.ts', '.tsx', '.js', '.jsx', '.json'];

const tracked = new Set(
  execSync('git ls-files', { cwd: root, maxBuffer: 1 << 28 })
    .toString()
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean),
);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Resolve a relative import the way Metro would, returning the real path. */
function resolve(fromFile, spec) {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    ...exts.map((e) => base + e),
    ...exts.map((e) => path.join(base, 'index' + e)),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/** True when every path segment matches the on-disk casing exactly. */
function casingMatches(file) {
  let dir = path.dirname(file);
  let name = path.basename(file);
  while (true) {
    const entries = fs.readdirSync(dir);
    if (!entries.includes(name)) return false;
    const parent = path.dirname(dir);
    if (parent === dir) return true;
    name = path.basename(dir);
    dir = parent;
    if (dir.length < root.length) return true;
  }
}

const problems = [];
for (const d of dirs) {
  const abs = path.join(root, d);
  if (!fs.existsSync(abs)) continue;
  for (const file of walk(abs)) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /(?:from|require\()\s*['"](\.[^'"]+)['"]/g;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1];
      const resolved = resolve(file, spec);
      const rel = path.relative(root, file).replace(/\\/g, '/');
      if (!resolved) {
        problems.push(`MISSING   ${rel} -> ${spec}`);
        continue;
      }
      const relResolved = path.relative(root, resolved).replace(/\\/g, '/');
      if (!tracked.has(relResolved)) {
        problems.push(`UNTRACKED ${rel} -> ${spec}  (${relResolved} not in git)`);
      }
      if (!casingMatches(resolved)) {
        problems.push(`CASE      ${rel} -> ${spec}`);
      }
    }
  }
}

if (problems.length === 0) {
  console.log('OK: every relative import resolves, is tracked by git, and matches on-disk casing.');
} else {
  for (const p of problems) console.log(p);
  console.log(`\n${problems.length} problem(s) that would break a cloud build.`);
  process.exitCode = 1;
}
