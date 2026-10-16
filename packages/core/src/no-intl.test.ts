import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// React Native's Android engine has no full ICU; locale calls silently go en-US.
const BANNED = [['Intl', '\\.'], ['toLocale', 'String'], ['toLocale', 'DateString'], ['toLocale', 'TimeString'], ['locale', 'Compare']]
  .map(([a, b]) => (a === 'Intl' ? /\bIntl\b/ : new RegExp(a + b)));

const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : []);

test('src never uses Intl / toLocale* / localeCompare', () => {
  const files = walk(srcDir);
  assert.ok(files.length > 10, 'src not found');
  for (const f of files) {
    if (f.endsWith('no-intl.test.ts')) continue; // names the banned identifiers by construction
    const text = readFileSync(f, 'utf8');
    for (const re of BANNED) assert.ok(!re.test(text), `${f} matches ${re}`);
  }
});
