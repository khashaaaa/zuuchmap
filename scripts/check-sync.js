#!/usr/bin/env node
/**
 * Cross-repo sync check.
 *
 * Zuuchmap is three independent apps that must agree on a handful of values:
 * socket event names, category colours, the palette, location codes, price
 * units, shared translations and the post-title fallback chain. Each of those
 * lived only in prose ("keep in sync with ..."), and two of them had already
 * drifted by the time this script was written — an untitled listing showed a
 * different name in the app than on the web, and 31 translation keys had
 * diverged.
 *
 *   npm run check:sync
 *
 * Zero dependencies, plain node, no build step, so it can run from a git hook,
 * from CI, or from deploy.sh before anything is pushed.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const failures = [];
const checks = [];
const fail = (contract, msg) => failures.push({ contract, msg });

/** Pull `const NAME = { ... }` / `NAME = [ ... ]` out of a source file and eval it as data. */
function objectLiteral(src, name) {
  const start = src.search(new RegExp(`(?:const|let|var|export const|export enum)?\\s*${name}\\s*[:=]\\s*[{\\[]`));
  if (start === -1) return null;
  const open = src.search(new RegExp(`${name}\\s*[:=]\\s*`)) + src.slice(src.search(new RegExp(`${name}\\s*[:=]\\s*`))).search(/[{[]/);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) { i++; break; } }
  }
  const body = src.slice(open, i).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  try { return eval('(' + body + ')'); } catch { return null; }
}

/** Flatten a nested object to dotted keys. */
function flat(o, pre = '', out = {}) {
  for (const k of Object.keys(o || {})) {
    const v = o[k], key = pre ? `${pre}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out);
    else out[key] = v;
  }
  return out;
}

/** Compare N named value-sets; report any that disagree with the first. */
function agree(contract, sets) {
  checks.push(contract);
  const [base, ...rest] = sets;
  const j = (v) => JSON.stringify(v);
  for (const other of rest) {
    if (base.value == null) return fail(contract, `could not parse ${base.name}`);
    if (other.value == null) return fail(contract, `could not parse ${other.name}`);
    if (j(base.value) !== j(other.value)) {
      const a = base.value, b = other.value;
      let detail = '';
      if (Array.isArray(a) && Array.isArray(b)) {
        const onlyA = a.filter((x) => !b.includes(x)), onlyB = b.filter((x) => !a.includes(x));
        detail = `\n       only in ${base.name}: ${j(onlyA)}\n       only in ${other.name}: ${j(onlyB)}`;
      } else if (a && b && typeof a === 'object') {
        const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
        detail = keys.filter((k) => j(a[k]) !== j(b[k]))
          .map((k) => `\n       ${k}: ${base.name}=${j(a[k])}  ${other.name}=${j(b[k])}`).join('');
      }
      fail(contract, `${base.name} != ${other.name}${detail}`);
    }
  }
}

// ── 1. Socket event names ────────────────────────────────────────────────────
{
  const pick = (src) => {
    const o = {};
    for (const m of src.matchAll(/^\s*([A-Z_]+):\s*'([^']+)'/gm)) o[m[1]] = m[2];
    return Object.keys(o).length ? o : null;
  };
  const slice = (src) => {
    const i = src.indexOf('SOCKET_EVENTS');
    return i === -1 ? '' : src.slice(i, src.indexOf('}', i));
  };
  agree('SOCKET_EVENTS', [
    { name: 'engine', value: pick(slice(read('zuuchmap_engine/src/events/events.gateway.ts'))) },
    { name: 'web',    value: pick(slice(read('zuuchmap_web/src/lib/socket.js'))) },
    { name: 'app',    value: pick(slice(read('zuuchmap_app/src/services/socketService.js'))) },
  ]);
}

// ── 2. Category fallback colours ─────────────────────────────────────────────
{
  const engineSeed = {};
  const eng = read('zuuchmap_engine/src/post/category.service.ts');
  for (const m of eng.matchAll(/key:\s*'([a-z]+)',[\s\S]{0,400}?color:\s*'(#[0-9A-Fa-f]{6})'/g)) engineSeed[m[1]] = m[2].toUpperCase();
  const norm = (o) => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v).toUpperCase()]));
  agree('category colours', [
    { name: 'app theme.js',  value: norm(objectLiteral(read('zuuchmap_app/src/design/theme.js'), 'categoryColors')) },
    { name: 'web utils.js',  value: norm(objectLiteral(read('zuuchmap_web/src/lib/utils.js'), 'CATEGORY_COLORS')) },
    { name: 'engine seed',   value: norm(engineSeed) },
  ]);
}

// ── 3. Palette ───────────────────────────────────────────────────────────────
// Only the tokens with an unambiguous 1:1 counterpart. Deliberately excluded,
// because index.css documents them as NOT direct mirrors:
//   --color-border (an alpha base), --color-chart, --color-danger/success/
//   warning-text (they track different palette rungs per theme) and --shimmer.
{
  const theme = read('zuuchmap_app/src/design/theme.js');
  const app = {
    dark: flat(objectLiteral(theme, 'darkColors')),
    light: flat(objectLiteral(theme, 'lightColors')),
  };
  const css = read('zuuchmap_web/src/index.css');
  const block = (re) => {
    const m = css.match(re);
    if (!m) return null;
    const o = {};
    for (const t of m[1].matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) o[t[1]] = t[2].trim();
    return o;
  };
  const web = { dark: block(/@theme\s*\{([\s\S]*?)\n\}/), light: block(/html\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/) };

  //  css token            app token (dark)     app token (light)
  const MAP = [
    ['--color-primary',      'primary',          'primary'],
    ['--color-on-primary',   'onPrimary',        'onPrimary'],
    ['--color-on-color',     'text.onColor',     'text.onColor'],
    ['--color-primary-text', 'text.link',        'text.link'],
    ['--color-background',   'background',       'background'],
    ['--color-surface',      'surface',          'surface'],
    ['--color-surface2',     'surfaceElevated',  'surfaceLight'],
    ['--color-border-strong','border.dark',      'border.dark'],
    ['--color-text',         'text.primary',     'text.primary'],
    ['--color-muted',        'text.secondary',   'text.secondary'],
    ['--color-danger',       'danger',           'danger'],
    ['--color-success',      'success',          'success'],
    ['--color-warning',      'warning',          'warning'],
  ];
  checks.push('palette');
  for (const mode of ['dark', 'light']) {
    if (!web[mode]) { fail('palette', `could not parse the ${mode} block of index.css`); continue; }
    for (const [cssVar, dk, lk] of MAP) {
      const appVal = app[mode][mode === 'dark' ? dk : lk];
      const webVal = web[mode][cssVar];
      if (!appVal || !webVal) { fail('palette', `${mode}: ${cssVar} / ${mode === 'dark' ? dk : lk} missing on one side`); continue; }
      if (appVal.toUpperCase() !== webVal.toUpperCase()) {
        fail('palette', `${mode}: ${cssVar}=${webVal} but app ${mode === 'dark' ? dk : lk}=${appVal}`);
      }
    }
  }
}

// ── 4. Location codes ────────────────────────────────────────────────────────
{
  const eng = read('zuuchmap_engine/src/enums/province.ts');
  const enumVals = (name) => {
    const m = eng.match(new RegExp(`export enum ${name}\\s*\\{([\\s\\S]*?)\\}`));
    return m ? [...m[1].matchAll(/=\s*'([A-Z_0-9]+)'/g)].map((x) => x[1]).sort() : null;
  };
  const arr = (src, name) => { const v = objectLiteral(src, name); return v ? [...v].sort() : null; };
  agree('provinces', [
    { name: 'engine', value: enumVals('Province') },
    { name: 'web',    value: arr(read('zuuchmap_web/src/lib/utils.js'), 'PROVINCES') },
    { name: 'app',    value: arr(read('zuuchmap_app/src/config/app.config.js'), 'provinces') },
  ]);
  agree('districts', [
    { name: 'engine', value: enumVals('District') },
    { name: 'web',    value: arr(read('zuuchmap_web/src/lib/utils.js'), 'DISTRICTS') },
    { name: 'app',    value: arr(read('zuuchmap_app/src/config/app.config.js'), 'districts') },
  ]);
}

// ── 5. Price units ───────────────────────────────────────────────────────────
{
  const eng = read('zuuchmap_engine/src/enums/priceunit.ts');
  const engVals = [...eng.matchAll(/=\s*'([A-Z_]+)'/g)].map((m) => m[1]);
  const webKeys = (() => {
    const m = read('zuuchmap_web/src/lib/utils.js').match(/PRICE_UNIT_KEYS\s*=\s*\{([\s\S]*?)\n\}/);
    return m ? [...m[1].matchAll(/([A-Z_]+):/g)].map((x) => x[1]) : null;
  })();
  agree('price units', [
    { name: 'engine', value: engVals },
    { name: 'web',    value: webKeys },
    { name: 'app',    value: objectLiteral(read('zuuchmap_app/src/config/app.config.js'), 'PRICE_UNITS') },
  ]);
}

// ── 6. Shared translations ───────────────────────────────────────────────────
// App and web keep separate trees on purpose — each has ~280 keys the other has
// no screen for. What must not drift is the overlap: a key present in BOTH has
// to say the same thing, or the same product speaks with two voices.
{
  const Module = require('module');
  const loadLocale = (p) => {
    const abs = path.join(ROOT, p);
    const m = new Module(abs);
    m._compile(fs.readFileSync(abs, 'utf8').replace(/^\s*export\s+default\s+/m, 'module.exports='), abs);
    return flat(m.exports);
  };
  for (const locale of ['mn', 'en']) {
    checks.push(`i18n:${locale}`);
    const a = loadLocale(`zuuchmap_app/src/i18n/locales/${locale}.js`);
    const b = loadLocale(`zuuchmap_web/src/i18n/${locale}.js`);
    const drifted = Object.keys(a).filter((k) => k in b && a[k] !== b[k]);
    if (drifted.length) {
      fail(`i18n:${locale}`, `${drifted.length} shared key(s) differ between app and web:` +
        drifted.map((k) => `\n       ${k}\n         app: ${JSON.stringify(a[k])}\n         web: ${JSON.stringify(b[k])}`).join(''));
    }
  }
}

// ── 7. Post-title fallback chain ─────────────────────────────────────────────
// Behavioural, not textual. The two implementations are written in different
// styles, so comparing source would be noise. Instead each function body is
// lifted out, given identical stubs for its label helpers, and run over the
// same fixtures — the outputs must match. This is exactly the way they
// diverged before: the web had `title || categoryLabel` while the app derived
// "manufacturer model", so one untitled listing had two names.
{
  checks.push('getPostTitle');

  // Shared stubs. Both sides must resolve a *known* subcategory and leave an
  // unknown one unresolved (returning the raw value), which is what the real
  // helpers do when the value has no i18n key and no schema entry.
  const KNOWN_SUB = ['excavator', 'crane'];
  const subStub = (value) => (KNOWN_SUB.includes(value) ? `SUB:${value}` : value);
  const catStub = (key) => (key ? `CATEGORY:${key}` : key);

  const lift = (src, file, argNames, scope) => {
    const i = src.indexOf('export const getPostTitle');
    if (i === -1) return fail('getPostTitle', `no getPostTitle in ${file}`), null;
    const arrow = src.indexOf('=>', i);
    const bodyStart = src.indexOf('{', arrow);
    let depth = 0, j = bodyStart;
    for (; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) { j++; break; } }
    }
    const body = src.slice(bodyStart, j);
    const names = Object.keys(scope);
    try {
      const factory = new Function(...names, `return (${argNames.join(',')}) => ${body}`);
      return factory(...names.map((n) => scope[n]));
    } catch (e) {
      return fail('getPostTitle', `could not lift ${file}: ${e.message}`), null;
    }
  };

  const appFn = lift(read('zuuchmap_app/src/utils/postUtils.js'), 'app', ['post', 'postType', 'schema'], {
    normalizePostType: (x) => x?.toLowerCase() || null,
    getSubcategoryLabel: (v) => subStub(v),
    i18n: { t: (k) => catStub(k.replace('category.', '')) },
  });
  const webFn = lift(read('zuuchmap_web/src/lib/utils.js'), 'web', ['post', 't', 'schemas'], {
    getSubcategoryLabel: (v) => subStub(v),
    getCategoryLabel: (k) => catStub(k),
  });

  const FIXTURES = [
    ['titled', { title: 'Excavator for rent', category: 'machineryrent' }],
    ['manufacturer + model', { category: 'machineryrent', attributes: { manufacturer: 'Komatsu', model: 'PC200-8' } }],
    ['manufacturer only', { category: 'machineryrent', attributes: { manufacturer: 'Komatsu' } }],
    ['model only', { category: 'machineryrent', attributes: { model: 'PC200-8' } }],
    ['known subcategory', { category: 'machineryrent', subcategory: 'excavator' }],
    ['unknown subcategory', { category: 'machineryrent', subcategory: 'zzz_unlabelled' }],
    ['category only', { category: 'machineryrent' }],
    ['title beats everything', { title: 'X', category: 'machineryrent', subcategory: 'excavator', attributes: { manufacturer: 'K' } }],
    ['empty attributes', { category: 'jobvacancy', attributes: {} }],
    ['no category', {}],
    ['null post', null],
  ];

  if (appFn && webFn) {
    for (const [label, post] of FIXTURES) {
      let a, b;
      try { a = appFn(post, post?.category, undefined); } catch (e) { a = `THREW: ${e.message}`; }
      try { b = webFn(post, (k) => k, []); } catch (e) { b = `THREW: ${e.message}`; }
      if (a !== b) fail('getPostTitle', `fixture "${label}" — app returned ${JSON.stringify(a)}, web returned ${JSON.stringify(b)}`);
    }
  }
}

// ── 8. Listing health score ──────────────────────────────────────────────────
// Two independent copies of the same 0–100 score, shown to providers on the
// form and their post list. They had already drifted 14 points on an identical
// listing (details target 120 vs 200 chars; an unchecked switch counted as
// filled on one side only), so the same post graded differently per platform.
// Checked behaviourally: both modules are pure and import nothing, so each is
// evaluated whole and run over shared fixtures.
{
  checks.push('postHealth');

  // Both files are self-contained ESM — strip the `export` keywords and run the
  // module body, handing back the function under test.
  const loadHealth = (file) => {
    const src = read(file).replace(/^export\s+/gm, '');
    try {
      return new Function(`${src}\nreturn computePostHealth;`)();
    } catch (e) {
      return fail('postHealth', `could not evaluate ${file}: ${e.message}`), null;
    }
  };

  const webFn = loadHealth('zuuchmap_web/src/lib/postHealth.js');
  const appFn = loadHealth('zuuchmap_app/src/utils/postHealth.js');

  // A category with required + optional fields, including booleans — the exact
  // shape the drift hid in.
  const SCHEMA = {
    has_price: true,
    fields: [
      { key: 'manufacturer', type: 'text', required: true },
      { key: 'model', type: 'text', required: true },
      { key: 'with_operator', type: 'boolean', required: true },
      { key: 'delivery_available', type: 'boolean' },
      { key: 'capacity', type: 'number' },
    ],
  };
  const NO_PRICE = { has_price: false, fields: SCHEMA.fields };
  const REQ = { manufacturer: 'Komatsu', model: 'PC200-8', with_operator: true };

  const FIXTURES = [
    ['empty', { images: [], details: '', price: 0, attributes: {} }, SCHEMA],
    ['required filled, optional blank', { images: ['a', 'b', 'c', 'd', 'e'], details: 'x'.repeat(150), price: 1000, attributes: REQ }, SCHEMA],
    ['switch answered "no"', { images: ['a', 'b', 'c', 'd', 'e'], details: 'x'.repeat(150), price: 1000, attributes: { ...REQ, with_operator: false } }, SCHEMA],
    ['details just under target', { images: ['a', 'b', 'c', 'd', 'e'], details: 'x'.repeat(119), price: 1000, attributes: REQ }, SCHEMA],
    ['details at target', { images: ['a', 'b', 'c', 'd', 'e'], details: 'x'.repeat(120), price: 1000, attributes: REQ }, SCHEMA],
    ['half the photos', { images: ['a', 'b'], details: 'x'.repeat(150), price: 1000, attributes: REQ }, SCHEMA],
    ['no price in schema', { images: ['a', 'b', 'c', 'd', 'e'], details: 'x'.repeat(150), price: 0, attributes: REQ }, NO_PRICE],
    ['missing one required', { images: ['a', 'b', 'c', 'd', 'e'], details: 'x'.repeat(150), price: 1000, attributes: { manufacturer: 'K' } }, SCHEMA],
    ['no schema', { images: ['a'], details: '', price: 0, attributes: {} }, undefined],
  ];

  if (webFn && appFn) {
    for (const [label, post, schema] of FIXTURES) {
      let w, a;
      try {
        const r = webFn({ imageCount: post.images.length, attributes: post.attributes, details: post.details, price: post.price, schema });
        w = { score: r.score, hint: r.hint ?? null };
      } catch (e) { w = { score: `THREW: ${e.message}`, hint: null }; }
      try {
        const r = appFn({ images: post.images, details: post.details, price_amount: post.price, attributes: post.attributes }, schema);
        a = { score: r.score, hint: r.missing ?? null };
      } catch (e) { a = { score: `THREW: ${e.message}`, hint: null }; }

      if (w.score !== a.score) fail('postHealth', `fixture "${label}" — web scored ${w.score}, app scored ${a.score}`);
      else if (w.hint !== a.hint) fail('postHealth', `fixture "${label}" — same score ${w.score}, but web names "${w.hint}" and app names "${a.hint}"`);
    }

    // The bar must be reachable: satisfy the category and you get 100. This is
    // the bug the score shipped with — every field counted, so 12 of 13
    // categories capped at 82–94 and nagged forever.
    for (const [name, score] of [
      ['web', webFn({ imageCount: 5, attributes: REQ, details: 'x'.repeat(150), price: 1000, schema: SCHEMA }).score],
      ['app', appFn({ images: ['a', 'b', 'c', 'd', 'e'], details: 'x'.repeat(150), price_amount: 1000, attributes: REQ }, SCHEMA).score],
    ]) {
      if (score !== 100) fail('postHealth', `${name}: a listing with every required field filled scored ${score}, not 100 — optional fields must not withhold points`);
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
const uniq = [...new Set(checks)];
if (failures.length === 0) {
  console.log(`✓ cross-repo sync OK — ${uniq.length} contracts: ${uniq.join(', ')}`);
  process.exit(0);
}
console.error(`✗ cross-repo sync FAILED — ${failures.length} of ${uniq.length} contracts drifted\n`);
for (const f of failures) console.error(`  [${f.contract}] ${f.msg}\n`);
console.error('These values are duplicated across zuuchmap_engine / _web / _app by design.');
console.error('Fix the copies so they agree, then re-run: npm run check:sync');
process.exit(1);
