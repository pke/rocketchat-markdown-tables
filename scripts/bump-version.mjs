#!/usr/bin/env node
// Bumps @version in the userscript header based on the Conventional Commits
// in a pushed range that touch the script:
//   feat!: / fix!: / "BREAKING CHANGE"  -> major
//   feat:                               -> minor
//   anything else                       -> patch
// If @version was already raised by hand within the range, it is left alone.
//
// Usage: node scripts/bump-version.mjs <before-sha> [<after-ref>]
// Prints the resulting version and whether the file was changed as
// GitHub Actions outputs (version=…, bumped=true|false).

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const SCRIPT = 'rocketchat-gfm-tables.user.js';
const VERSION_LINE = /^(\/\/\s*@version\s+)(\d+)\.(\d+)\.(\d+)\s*$/m;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const exists = (rev) => {
  try {
    git('cat-file', '-e', `${rev}^{commit}`);
    return true;
  } catch {
    return false;
  }
};

const versionIn = (text) => {
  const match = text.match(VERSION_LINE);
  if (!match) throw new Error(`No "// @version x.y.z" line in ${SCRIPT}`);
  return match.slice(2, 5).map(Number);
};

const [before, after = 'HEAD'] = process.argv.slice(2);
// A new branch or a force push has no usable "before"; then only the last commit counts.
const range = before && !/^0+$/.test(before) && exists(before) ? `${before}..${after}` : `${after}~1..${after}`;
const base = range.split('..')[0];

const current = versionIn(readFileSync(SCRIPT, 'utf8'));
let previous = null;
try {
  previous = versionIn(git('show', `${base}:${SCRIPT}`));
} catch {
  // script did not exist before this range
}

const output = (version, bumped) => {
  const text = `version=${version}\nbumped=${bumped}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, text);
  process.stdout.write(text);
};

if (!previous || current.join('.') !== previous.join('.')) {
  output(current.join('.'), false); // set by hand (or first version): keep it
  process.exit(0);
}

const messages = git('log', '--format=%B%x1e', range, '--', SCRIPT)
  .split('\x1e')
  .map((m) => m.trim())
  .filter(Boolean);

if (!messages.length) {
  output(current.join('.'), false);
  process.exit(0);
}

const breaking = messages.some((m) => /^\w+(\([^)]*\))?!:/.test(m) || /^BREAKING[ -]CHANGE:/m.test(m));
const feature = messages.some((m) => /^feat(\([^)]*\))?:/.test(m));

let [major, minor, patch] = current;
if (breaking) [major, minor, patch] = [major + 1, 0, 0];
else if (feature) [minor, patch] = [minor + 1, 0];
else patch += 1;

const next = `${major}.${minor}.${patch}`;
const text = readFileSync(SCRIPT, 'utf8');
writeFileSync(SCRIPT, text.replace(VERSION_LINE, (_, prefix) => `${prefix}${next}`));
output(next, true);
