#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const rules = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'secret-patterns.json'), 'utf8'));
const results = [];
const check = (name, ok, detail='') => results.push({name, ok, detail});
const match = (s, r) => new RegExp(r.pattern, r.flags).test(s);

const positives = [
  'sk-' + 'proj-' + 'A'.repeat(20),
  'AKIA' + 'A'.repeat(16),
  'ghp_' + 'A'.repeat(30),
  'AIza' + 'A'.repeat(35),
  'Bearer ' + 'A'.repeat(20),
  'eyJ' + 'A'.repeat(8) + '.' + 'B'.repeat(8) + '.' + 'C'.repeat(8),
  '-----BEGIN ' + 'PRIVATE KEY-----',
  'password="' + 'abcdefghijk"',
  'token = "' + 'abcdefghijk"'
];
const negatives = [
  'sk-' + 'A'.repeat(19),
  'AKIA' + 'A'.repeat(15),
  'ghp_' + 'A'.repeat(29),
  'AIza' + 'A'.repeat(34),
  'Bearer ' + 'A'.repeat(19),
  'password="short"',
  'ordinary source code without credentials'
];

check('schema', Array.isArray(rules) && rules.length >= 8 && rules.every(r => r.name && r.pattern && typeof r.flags === 'string'));
for (const s of positives) check('positive', rules.some(r => match(s, r)));
for (const s of negatives) check('negative', !rules.some(r => match(s, r)));

const failed = results.filter(r => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ' ' + r.detail : ''}`);
console.log(JSON.stringify({total:results.length, failed:failed.length}));
process.exit(failed.length ? 1 : 0);
