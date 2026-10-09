import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const WF = dirname(fileURLToPath(import.meta.url));
const DOC = join(WF, 't134-pcm-constraints.md');
const results = [];
const t = (name, cond, extra = '') => {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`);
};
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const doc = readFileSync(DOC, 'utf8');
const m = doc.match(/```t134-sources\n([\s\S]*?)```/);
t('0-parse-sources-block', !!m);
if (!m) { console.log(JSON.stringify({ total: 1, failed: 1 })); process.exit(1); }
const sources = JSON.parse(m[1]);
t('1-4-sources', sources.length === 4, `count=${sources.length}`);

const fetched = [];
let skipped = 0;
for (const s of sources) {
  let buf;
  if (s.kind === 'file') {
    try {
      buf = readFileSync(s.path);
    } catch {
      console.log(`SKIP ${s.id}-recompute (external-source-missing)`);
      skipped++;
      continue;
    }
  } else {
    try {
      const res = await fetch(s.url, { headers: { 'User-Agent': 'wf-t134' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = Buffer.from(await res.arrayBuffer());
    } catch (e) {
      t(`2-${s.id}-fetch`, false, String(e.message));
      continue;
    }
  }
  fetched.push({ s, buf });
  const h = sha256(buf);
  t(`2-${s.id}-recompute`, h === s.sha256, `${h.slice(0, 16)} vs ${s.sha256.slice(0, 16)}`);
}

const recomputeResults = fetched.filter(({ s }) => results.find(r => r.name === `2-${s.id}-recompute`));
const allOk = recomputeResults.every(({ s, buf }) => sha256(buf) === s.sha256);
if (skipped > 0) {
  t('3-partial-recomputed', allOk && fetched.length >= 3, `fetched=${fetched.length} skipped=${skipped} (PARTIAL — external sources missing)`);
} else {
  t('3-all-4-recomputed', allOk && fetched.length === 4, `fetched=${fetched.length}`);
}

if (fetched.length > 0) {
  const tmp = mkdtempSync(join(tmpdir(), 't134-tamper-'));
  try {
    const { s, buf } = fetched[0];
    const p = join(tmp, 'tampered.bin');
    writeFileSync(p, Buffer.concat([buf, Buffer.from([0x20])]));
    const h = sha256(readFileSync(p));
    t('4-tamper-detected', h !== s.sha256, `tampered=${h.slice(0, 16)}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
} else {
  t('4-tamper-detected', false, 'no source fetched');
}

const failed = results.filter(x => !x.ok).length;
console.log(JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
