import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const skipDirs = new Set(['.git', '.run', 'node_modules']);
const files = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (skipDirs.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (name.endsWith('.mjs')) files.push(full);
  }
}
walk(join(ROOT, 'wf'));
let failed = 0;
for (const file of files.sort()) {
  const r = spawnSync(process.execPath, ['--check', file], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  if (r.status === 0) console.log('PASS ' + file.slice(ROOT.length + 1));
  else {
    failed++;
    console.log('FAIL ' + file.slice(ROOT.length + 1) + ' ' + (r.stderr || r.error?.message || '').trim());
  }
}
console.log('RESULT ' + JSON.stringify({ checked: files.length, failed }));
process.exitCode = failed ? 1 : 0;
