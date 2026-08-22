import assert from 'node:assert/strict';
import {existsSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT_RE = /(?:\bimport\s+(?:[^'";]*?\s+from\s*)?|\bexport\s+[^'";]*?\s+from\s*)['"]([^'"]+)['"]/g;

function readText(file, label) {
  assert.ok(existsSync(file) && statSync(file).isFile(), `${label}: ${file}`);
  return readFileSync(file, 'utf8');
}

function attributes(tag) {
  const result = {};
  const pattern = /\b([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of tag.matchAll(pattern)) {
    result[match[1].toLowerCase()] = match[2] ?? match[3];
  }
  return result;
}

function isLocal(specifier) {
  return !/^[a-z][a-z0-9+.-]*:/i.test(specifier) && !specifier.startsWith('//');
}

function releaseEntries(html) {
  const entries = [];
  for (const match of html.matchAll(/<(link|script)\b[^>]*>/gi)) {
    const tagName = match[1].toLowerCase();
    const attrs = attributes(match[0]);
    if (tagName === 'link' && attrs.rel?.split(/\s+/).includes('stylesheet') && attrs.href && isLocal(attrs.href)) {
      entries.push({kind: 'stylesheet', importer: 'index.html', specifier: attrs.href});
    }
    if (tagName === 'script' && attrs.type === 'module' && attrs.src) {
      entries.push({kind: 'module', importer: 'index.html', specifier: attrs.src});
    }
  }
  assert.equal(entries.filter(entry => entry.kind === 'stylesheet').length, 1, 'expected one stylesheet entry');
  assert.equal(entries.filter(entry => entry.kind === 'module').length, 1, 'expected one module entry');
  return entries;
}

function resolveLocal(importer, specifier) {
  assert.ok(isLocal(specifier), `external release asset is unsupported: ${specifier}`);
  const pathname = specifier.split(/[?#]/, 1)[0];
  const relative = pathname.startsWith('/')
    ? path.posix.normalize(pathname.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(importer), pathname));
  assert.ok(relative !== '..' && !relative.startsWith('../'), `asset escapes repository root: ${specifier}`);
  const token = new URL(specifier, 'https://release.invalid/').searchParams.get('v');
  return {file: relative, token};
}

function collectReleaseGraph() {
  const html = readText(path.join(ROOT, 'index.html'), 'missing index.html');
  const records = [];
  const queue = releaseEntries(html);
  const visited = new Set();

  while (queue.length) {
    const entry = queue.shift();
    const resolved = resolveLocal(entry.importer, entry.specifier);
    records.push({...entry, ...resolved});
    if (entry.kind !== 'module' || visited.has(resolved.file)) continue;
    visited.add(resolved.file);

    const absolute = path.join(ROOT, resolved.file);
    const source = readText(absolute, 'missing release asset');
    for (const match of source.matchAll(IMPORT_RE)) {
      if (!match[1].startsWith('./') && !match[1].startsWith('../')) continue;
      queue.push({kind: 'module', importer: resolved.file, specifier: match[1]});
    }
  }
  return records;
}

test('all production release assets share the APP_VER cache token', () => {
  const config = readText(path.join(ROOT, 'src', 'config.js'), 'missing src/config.js');
  const appVersion = config.match(/\bAPP_VER\s*=\s*['"]v([^'"]+)['"]/)?.[1];
  assert.ok(appVersion, 'src/config.js must export a literal v-prefixed APP_VER');

  const records = collectReleaseGraph();
  for (const record of records) {
    assert.ok(record.token, `missing cache token: ${record.importer} -> ${record.specifier}`);
    const publicVersion = record.token.match(/^(\d+\.\d+\.\d+)(?:-r\d+)?$/)?.[1];
    assert.equal(publicVersion, appVersion,
      `cache token does not match APP_VER: ${record.importer} -> ${record.specifier}`);
  }

  const tokens = [...new Set(records.map(record => record.token))].sort();
  assert.equal(tokens.length, 1, `mixed cache tokens: ${tokens.join(', ')}`);
});
