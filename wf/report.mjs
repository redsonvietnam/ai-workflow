import { readFileSync } from 'node:fs';

const LOG = 'LOG.md';
const FIXTURE = 'wf/fixtures/report-log.md';
const FIELDS = ['requestChars','replyChars','requestBytes','replyBytes'];

function parse(file) {
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    const i = line.indexOf('|');
    if (i < 0) return [];
    try { return [JSON.parse(line.slice(i + 1).trim())]; } catch { return []; }
  });
}

function aggregate(events) {
  const byTask = {}, byRelay = {}, byVerdict = {};
  const accounting = Object.fromEntries(FIELDS.map(k => [k, 0]));
  let claude_calls = 0;
  for (const e of events) {
    const task = e.task ?? 'UNKNOWN', relay = e.relay ?? 'UNKNOWN', verdict = e.verdict ?? 'UNKNOWN';
    byTask[task] = (byTask[task] ?? 0) + 1;
    byRelay[relay] = (byRelay[relay] ?? 0) + 1;
    byVerdict[verdict] = (byVerdict[verdict] ?? 0) + 1;
    for (const k of FIELDS) accounting[k] += Number(e[k] ?? 0);
    if (String(e.relay ?? '').toLowerCase() === 'claude') claude_calls++;
  }
  return { count: events.length, byTask, byRelay, byVerdict, ...accounting, claude_calls };
}

function main() {
  const fixture = aggregate(parse(FIXTURE));
  const actual = aggregate(parse(LOG));
  console.log('| Source | Count | claude_calls | requestChars | replyChars | requestBytes | replyBytes |');
  console.log('|---|---:|---:|---:|---:|---:|---:|');
  for (const [name, x] of [['fixture', fixture], ['log', actual]]) console.log(`| ${name} | ${x.count} | ${x.claude_calls} | ${x.requestChars} | ${x.replyChars} | ${x.requestBytes} | ${x.replyBytes} |`);
  console.log(JSON.stringify({ fixture, log: actual }, null, 2));
}
main();
