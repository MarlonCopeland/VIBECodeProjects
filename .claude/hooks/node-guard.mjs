// PreToolUse guard for the two Node-toolchain mistakes this repo has actually
// suffered:
//   1. `npm install` run from a directory with no package.json, which silently
//      creates a stray root package.json + node_modules that shadows the real
//      one.
//   2. Running on a Node older than the target app's .nvmrc. This never fails
//      loudly — Node 20 here just skips every test needing node:sqlite, so the
//      suite looks green while a whole file never ran.
//
// Emits JSON only when something is wrong. Silence means "checked, fine".

import { readFileSync, existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const TOOLS = /^(npm|npx|node|yarn|pnpm|expo|eas)$/;
const PACKAGE_MANAGERS = /^(npm|yarn|pnpm)$/;

/**
 * Binaries invoked in COMMAND POSITION, not merely mentioned. Substring
 * matching fired on anything that quoted the word "npm" (a heredoc, an echo),
 * and a guard that cries wolf is a guard you learn to ignore.
 */
function invokedBinaries(command) {
  const found = [];
  for (const segment of command.split(/\n|&&|\|\||;|\|/)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    // Step past leading env assignments: FOO=bar npm test
    const first = tokens.find((t) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(t));
    if (!first) continue;
    const bare = basename(first).replace(/[.](exe|cmd)$/, '');
    if (TOOLS.test(bare)) found.push(bare);
  }
  return found;
}

/** Git Bash hands us /c/repo/... ; Node needs C:/repo/... */
function toNativePath(p) {
  const m = /^\/([a-zA-Z])\/(.*)$/.exec(p);
  return m ? `${m[1].toUpperCase()}:/${m[2]}` : p;
}

function findUp(startDir, filename) {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, filename))) return join(dir, filename);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function majorOf(text) {
  const m = /(\d+)/.exec(String(text || '').trim());
  return m ? Number(m[1]) : null;
}

function emit(message) {
  process.stdout.write(
    JSON.stringify({
      systemMessage: message,
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: message },
    }),
  );
}

let command = '';
try {
  command = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command ?? '';
} catch {
  process.exit(0); // never break a tool call over a parse failure
}

const binaries = invokedBinaries(command);
if (binaries.length === 0) process.exit(0);

// The command usually cds into the app first; honor that over the session cwd.
let targetDir = process.cwd();
const cdMatch = /(?:^|[;&|]\s*)cd\s+"?([^"&;|]+?)"?\s*(?:&&|;|\||$)/.exec(command);
if (cdMatch) {
  const arg = toNativePath(cdMatch[1].trim());
  targetDir = /^([a-zA-Z]:|\/)/.test(arg) ? arg : join(process.cwd(), arg);
}
if (!existsSync(targetDir)) process.exit(0); // let the shell report a bad path

const pkgPath = findUp(targetDir, 'package.json');
if (!pkgPath) {
  // Only package managers can create a stray package tree; `node -e` from an
  // arbitrary directory is perfectly normal.
  if (binaries.some((b) => PACKAGE_MANAGERS.test(b))) {
    emit(
      `Node guard: this resolves to ${targetDir}, which has no package.json above it. ` +
        `Running a package manager here creates a stray package.json + node_modules that ` +
        `shadows the real one. cd into the app directory first.`,
    );
  }
  process.exit(0);
}

const appDir = dirname(pkgPath);
const nvmrcPath = join(appDir, '.nvmrc');
if (!existsSync(nvmrcPath)) process.exit(0);

const want = majorOf(readFileSync(nvmrcPath, 'utf8'));
const have = majorOf(process.versions.node);
if (want === null || have === null || have >= want) process.exit(0);

emit(
  `Node guard: shell is on Node ${process.versions.node} but ${appDir} pins Node ${want} ` +
    `(.nvmrc). Mismatches here fail silently rather than loudly — Node <22 skips tests that ` +
    `need node:sqlite. Run "nvm use ${want}" first, and tell the user, since nvm switches ` +
    `globally on Windows.`,
);
