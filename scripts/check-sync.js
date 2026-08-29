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

/** Every locale both clients ship. `mn` is the fallback and the source of truth. */
const LOCALES = ['mn', 'en', 'zh', 'ru'];

/** Load an i18n locale module (ESM default export) and flatten it to dotted keys. */
const Module = require('module');
const loadLocale = (p) => {
  const abs = path.join(ROOT, p);
  const m = new Module(abs);
  m._compile(fs.readFileSync(abs, 'utf8').replace(/^\s*export\s+default\s+/m, 'module.exports='), abs);
  return flat(m.exports);
};

/**
 * Lift a single `const name = (args) => { ... }` out of a source file and rebuild
 * it with `scope` supplying whatever it closes over. Comparing two clients'
 * source text would be noise — they are written in different styles — so every
 * behavioural contract below lifts both sides and runs them over shared fixtures.
 */
function liftArrow(contract, src, name, scope, where) {
  const i = src.search(new RegExp(`(?:export\\s+)?const\\s+${name}\\s*=`));
  if (i === -1) return fail(contract, `no ${name} in ${where}`), null;

  // Take the parameter list verbatim rather than re-declaring it. Rebuilding it
  // from names alone silently dropped the defaults — `validatePhone(phone,
  // minLength = 8, maxLength = 15)` came back with both bounds undefined, so
  // every comparison was false on both sides and the contract passed vacuously.
  const eq = src.indexOf('=', i);
  const arrow = src.indexOf('=>', eq);
  let params;
  const open = src.slice(eq + 1, arrow).indexOf('(');
  if (open === -1) {
    params = src.slice(eq + 1, arrow).trim();          // single param, no parens
  } else {
    const from = eq + 1 + open;
    let depth = 0, k = from;
    for (; k < arrow; k++) {
      if (src[k] === '(') depth++;
      else if (src[k] === ')') { depth--; if (depth === 0) break; }
    }
    params = src.slice(from + 1, k);
  }

  const bodyStart = src.indexOf('{', arrow);
  let depth = 0, j = bodyStart;
  for (; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) { j++; break; } }
  }
  const names = Object.keys(scope);
  try {
    return new Function(...names, `return (${params}) => ${src.slice(bodyStart, j)}`)(...names.map((n) => scope[n]));
  } catch (e) {
    return fail(contract, `could not lift ${name} from ${where}: ${e.message}`), null;
  }
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

// ── 5b. Report reasons ───────────────────────────────────────────────────────
// The engine's closed list is the authority (`GET /reports/reasons`), but both
// clients keep a copy so the sheet can paint before the network answers. A
// reason added only on the engine would be accepted but never offered.
{
  const list = (src, re) => { const m = src.match(re); return m ? [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]) : null; };
  agree('report reasons', [
    { name: 'engine', value: list(read('zuuchmap_engine/src/enums/report.ts'), /REPORT_REASONS\s*=\s*\[([\s\S]*?)\]/) },
    { name: 'web',    value: list(read('zuuchmap_web/src/lib/api.js'), /REPORT_REASONS\s*=\s*\[([\s\S]*?)\]/) },
    { name: 'app',    value: list(read('zuuchmap_app/src/services/api/reportService.js'), /REPORT_REASONS\s*=\s*\[([\s\S]*?)\]/) },
  ]);
}

// ── 6. Shared translations ───────────────────────────────────────────────────
// App and web keep separate trees on purpose — each has ~280 keys the other has
// no screen for. What must not drift is the overlap: a key present in BOTH has
// to say the same thing, or the same product speaks with two voices.
{
  for (const locale of LOCALES) {
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

// ── 6b. Locale completeness ──────────────────────────────────────────────────
// Every locale must carry exactly the key set of `en` on its own side. i18next
// falls back to mn for a missing key, so a string added only to mn/en would not
// crash — it would render one Mongolian line in the middle of a Chinese screen,
// and nothing else would notice. Plural suffixes are stripped before comparing:
// Russian legitimately has `_few`/`_many` forms that English does not.
{
  const C = 'i18n completeness';
  checks.push(C);
  const base = (k) => k.replace(/_(zero|one|two|few|many|other)$/, '');
  for (const [client, dir] of [['web', 'zuuchmap_web/src/i18n'], ['app', 'zuuchmap_app/src/i18n/locales']]) {
    const en = new Set(Object.keys(loadLocale(`${dir}/en.js`)).map(base));
    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      const keys = new Set(Object.keys(loadLocale(`${dir}/${locale}.js`)).map(base));
      const missing = [...en].filter((k) => !keys.has(k));
      const extra = [...keys].filter((k) => !en.has(k));
      if (missing.length) fail(C, `${client}/${locale}: ${missing.length} key(s) in en but not ${locale}: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ', …' : ''}`);
      if (extra.length) fail(C, `${client}/${locale}: ${extra.length} key(s) in ${locale} but not en: ${extra.slice(0, 10).join(', ')}${extra.length > 10 ? ', …' : ''}`);
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

// ── 9. Map clustering ────────────────────────────────────────────────────────
// Both clients group map pins into screen-space grid cells so a dense district
// reads as one badge. The rule is geometric, so any drift in GRID_CELLS, the
// cell maths or the dominant-category tally makes the same city look different
// on phone and web — one badge here, nine pins there. Checked behaviourally
// like postHealth: the app's `gridCluster` is lifted out of its screen (it is
// pure and closes over nothing but GRID_CELLS), the web's is loaded as a
// module, and both run over shared fixtures at several zoom levels.
{
  checks.push('mapCluster');

  const appSrc = read('zuuchmap_app/src/screens/customer/CustomerMapView.jsx');
  const start = appSrc.indexOf('const gridCluster =');
  const end = appSrc.indexOf('const CustomerMapView =');
  let appFn = null;
  let webFn = null;

  if (start < 0 || end < 0 || end < start) {
    fail('mapCluster', 'could not find gridCluster in CustomerMapView.jsx — did it move or get renamed?');
  } else {
    const cellsMatch = appSrc.match(/const GRID_CELLS = (\d+)/);
    if (!cellsMatch) fail('mapCluster', 'GRID_CELLS not found in CustomerMapView.jsx');
    try {
      appFn = new Function('GRID_CELLS', `${appSrc.slice(start, end)}\nreturn gridCluster;`)(Number(cellsMatch?.[1]));
    } catch (e) {
      fail('mapCluster', `could not evaluate the app's gridCluster: ${e.message}`);
    }
  }

  try {
    const webSrc = read('zuuchmap_web/src/lib/mapCluster.js').replace(/^export\s+/gm, '');
    webFn = new Function(`${webSrc}\nreturn gridCluster;`)();
  } catch (e) {
    fail('mapCluster', `could not evaluate zuuchmap_web/src/lib/mapCluster.js: ${e.message}`);
  }

  // Two tight knots plus scattered outliers — the shape that separates a real
  // clusterer from one that just buckets by rounding.
  const RAW = [
    { id: 1, category: 'toolrent', latitude: 47.9184, longitude: 106.9177 },
    { id: 2, category: 'toolrent', latitude: 47.9186, longitude: 106.9179 },
    { id: 3, category: 'machineryrent', latitude: 47.9188, longitude: 106.9181 },
    { id: 4, category: 'jobvacancy', latitude: 47.9300, longitude: 106.9400 },
    { id: 5, category: 'jobvacancy', latitude: 47.9302, longitude: 106.9402 },
    { id: 6, category: 'transport', latitude: 49.6548, longitude: 100.2329 },
    { id: 7, category: 'sos', latitude: 43.5708, longitude: 104.4250 },
    // Coordinates that must be skipped rather than clustered at (0,0).
    { id: 8, category: 'toolrent', latitude: null, longitude: 106.9 },
    { id: 9, category: 'toolrent', latitude: 'not-a-number', longitude: 106.9 },
  ];
  // The app reads coordinates off `post.coordinates` and the category off
  // `post_type`; the web reads the raw columns. Same posts, each shaped for
  // its own client.
  const appPosts = RAW.map((p) => ({
    ...p,
    post_type: p.category,
    // `parseFloat`, mirroring how mapService builds `coordinates` — the
    // difference from Number() is exactly what keeps a null coordinate off (0,0).
    coordinates: { latitude: parseFloat(p.latitude), longitude: parseFloat(p.longitude) },
  }));

  const VIEWPORTS = [
    ['default region', 0.0922, 0.0421],
    ['street level', 0.01, 0.02],
    ['province level', 2.5, 5],
    ['whole country', 9, 18],
  ];

  // Compare on what the marker actually renders: how many pins, where each
  // sits, and which category colours it.
  const shape = (c) => `${c.count}@${c.coordinate.latitude.toFixed(6)},${c.coordinate.longitude.toFixed(6)}:${c.dominant}`;

  if (appFn && webFn) {
    for (const [label, latDelta, lngDelta] of VIEWPORTS) {
      let a, w;
      try {
        a = appFn(appPosts, { latitudeDelta: latDelta, longitudeDelta: lngDelta }).map(shape).sort();
      } catch (e) { fail('mapCluster', `app threw at ${label}: ${e.message}`); continue; }
      try {
        w = webFn(RAW, { latDelta, lngDelta }).map(shape).sort();
      } catch (e) { fail('mapCluster', `web threw at ${label}: ${e.message}`); continue; }

      if (a.length !== w.length) {
        fail('mapCluster', `at ${label} the app drew ${a.length} markers and the web drew ${w.length}`);
        continue;
      }
      const differing = a.filter((v, i) => v !== w[i]);
      if (differing.length) {
        fail('mapCluster', `at ${label} the markers differ — app has ${differing.join(', ')}, web has ${w.filter((v) => !a.includes(v)).join(', ')}`);
      }
    }

    // The two bad-coordinate rows must be dropped, not clustered at (0,0).
    const total = webFn(RAW, { latDelta: 9, lngDelta: 18 }).reduce((n, c) => n + c.count, 0);
    if (total !== 7) fail('mapCluster', `posts with a missing or non-numeric coordinate must be skipped — expected 7 pins, got ${total}`);
  }
}

// ── 10. Price formatting ─────────────────────────────────────────────────────
// The price is on every card, every list row and every detail page, and each
// client formats it independently. Three rules have to hold on both: group as
// mn-MN (a bare toLocaleString followed the *viewer's* locale, so a listing read
// 250.000₮ on a de-DE machine), drop the Postgres decimal tail, and never append
// "/unit" to a TOTAL — a sale price with a recurring suffix reads as a rental.
// A fourth was already broken when this check was written: a malformed
// price_amount coerces to NaN, which the app dropped and the web rendered
// literally as "NaN₮".
{
  const C = 'formatPrice';
  checks.push(C);

  const UNITS = ['HOUR', 'MOTO_HOUR', 'DAY', 'WEEK', 'MONTH', 'PROJECT', 'UNIT', 'PIECE', 'SQM', 'TRIP', 'TOTAL'];
  // The two clients key the same labels differently — the app looks up
  // `priceUnit.HOUR`, the web `priceUnit.hour` (contract 12 pins the values).
  // Both stubs resolve a known unit to one sentinel and fall through to the raw
  // code for an unknown one, which is what i18next's defaultValue does.
  const appUnitStub = (u) => (u ? (UNITS.includes(u) ? `UNIT:${u}` : u) : '');
  const webTStub = (key, opts) => {
    const code = key ? String(key).split('.').pop().toUpperCase() : '';
    return UNITS.includes(code) ? `UNIT:${code}` : (opts && opts.defaultValue) || '';
  };

  const appSrc = read('zuuchmap_app/src/utils/displayUtils.js');
  const webSrc = read('zuuchmap_web/src/lib/utils.js');

  const appFn = liftArrow(C, appSrc, 'formatPrice', { getPriceUnitLabel: appUnitStub }, 'app/displayUtils.js');
  const webFn = liftArrow(C, webSrc, 'formatPrice', {
    PRICE_FORMAT: objectLiteral(webSrc, 'PRICE_FORMAT'),
    PRICE_UNIT_KEYS: objectLiteral(webSrc, 'PRICE_UNIT_KEYS'),
    priceValue: liftArrow(C, webSrc, 'priceValue', {}, 'web/utils.js'),
  }, 'web/utils.js');

  const FIXTURES = [
    ['whole number', 250000, 'HOUR'],
    ['postgres decimal string', '250000.00', 'DAY'],
    ['total takes no unit suffix', 250000, 'TOTAL'],
    ['millions group', 1234567, 'MOTO_HOUR'],
    ['zero', 0, 'DAY'],
    ['null amount', null, 'DAY'],
    ['undefined amount', undefined, 'DAY'],
    ['empty string amount', '', 'DAY'],
    ['non-numeric amount', 'abc', 'DAY'],
    ['NaN amount', NaN, 'DAY'],
    ['negative', -5000, 'DAY'],
    ['exponent string', '1e3', 'DAY'],
    ['unknown unit falls back to the code', 250000, 'ZZZ_UNKNOWN'],
    ['null unit', 250000, null],
    ['undefined unit', 250000, undefined],
  ];

  if (appFn && webFn) {
    for (const [label, amount, unit] of FIXTURES) {
      let a, w;
      try { a = appFn(amount, unit); } catch (e) { a = `THREW: ${e.message}`; }
      try { w = webFn(amount, unit, webTStub); } catch (e) { w = `THREW: ${e.message}`; }
      if (a !== w) fail(C, `fixture "${label}" — app returned ${JSON.stringify(a)}, web returned ${JSON.stringify(w)}`);
    }
  }
}

// ── 11. Date formatting ──────────────────────────────────────────────────────
// `YYYY.MM.DD` on both, and neither may go through Intl to get there. React
// Native's JSC ships without full ICU on Android, so a locale-driven format
// silently falls back to en-US there — which is how a booking window once read
// 2026.08.24 on the web and 2026-08-24 in the app. The web later matched by
// calling toLocaleDateString('mn-MN'), i.e. by coincidence: same string today,
// but an ICU update on either runtime could have split them again with nothing
// to catch it. Both now assemble the string by hand and are checked here.
{
  const C = 'formatDate';
  checks.push(C);

  const i18nStub = { t: (k) => `I18N:${k}` };
  const appSrc = read('zuuchmap_app/src/utils/displayUtils.js');
  const webSrc = read('zuuchmap_web/src/lib/utils.js');

  const sep = appSrc.match(/const DATE_SEPARATOR = '([^']*)'/);
  if (!sep) fail(C, 'DATE_SEPARATOR not found in app/displayUtils.js');

  const appFn = liftArrow(C, appSrc, 'formatDate', {
    parts: liftArrow(C, appSrc, 'parts', {}, 'app/displayUtils.js'),
    DATE_SEPARATOR: sep ? sep[1] : '.',
    i18n: i18nStub,
    logger: { error: () => {} },
  }, 'app/displayUtils.js');
  const webFn = liftArrow(C, webSrc, 'formatDate', { i18n: i18nStub }, 'web/utils.js');

  const FIXTURES = [
    ['date only', '2026-08-26'],
    ['iso timestamp', '2026-08-26T15:30:00Z'],
    ['single-digit month and day pad', '2026-01-05'],
    ['epoch millis', 1787758591848],
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['zero', 0],
    ['unparseable', 'garbage'],
    ['out-of-range parts', '2026-13-45'],
  ];

  // Neither side may reach for Intl: that is the drift, not just its symptom.
  for (const [file, src] of [['app/displayUtils.js', appSrc], ['web/utils.js', webSrc]]) {
    const body = src.slice(src.search(/(?:export\s+)?const\s+formatDate\s*=/));
    if (/toLocaleDateString|Intl\.DateTimeFormat/.test(body.slice(0, body.indexOf('\n}') + 2))) {
      fail(C, `${file}: formatDate goes through Intl — build YYYY.MM.DD by hand so both runtimes agree regardless of ICU`);
    }
  }

  if (appFn && webFn) {
    for (const [label, value] of FIXTURES) {
      let a, w;
      try { a = appFn(value); } catch (e) { a = `THREW: ${e.message}`; }
      try { w = webFn(value); } catch (e) { w = `THREW: ${e.message}`; }
      if (a !== w) fail(C, `fixture "${label}" — app returned ${JSON.stringify(a)}, web returned ${JSON.stringify(w)}`);
    }
  }
}

// ── 12. Price unit labels ────────────────────────────────────────────────────
// These sit in a blind spot the i18n contract cannot see: the app keys them
// `priceUnit.HOUR` and the web `priceUnit.hour`, so no key is present in both
// trees and contract 6 compares nothing. All 22 values happened to agree when
// this was written, entirely by luck — edit one side and nothing would notice.
{
  const C = 'price unit labels';
  checks.push(C);

  const units = (o) => Object.fromEntries(
    Object.entries(o)
      .filter(([k]) => k.startsWith('priceUnit.'))
      .map(([k, v]) => [k.slice('priceUnit.'.length).toUpperCase(), v]));

  for (const locale of LOCALES) {
    const a = units(loadLocale(`zuuchmap_app/src/i18n/locales/${locale}.js`));
    const w = units(loadLocale(`zuuchmap_web/src/i18n/${locale}.js`));
    const codes = [...new Set([...Object.keys(a), ...Object.keys(w)])].sort();
    if (!codes.length) { fail(C, `${locale}: no priceUnit.* labels found on either side`); continue; }
    for (const code of codes) {
      if (!(code in a)) fail(C, `${locale}: web has priceUnit ${code} (${JSON.stringify(w[code])}), the app has no such unit`);
      else if (!(code in w)) fail(C, `${locale}: app has priceUnit ${code} (${JSON.stringify(a[code])}), the web has no such unit`);
      else if (a[code] !== w[code]) fail(C, `${locale}: priceUnit ${code} — app says ${JSON.stringify(a[code])}, web says ${JSON.stringify(w[code])}`);
    }
  }
}

// ── 13. Typeface ─────────────────────────────────────────────────────────────
// Both clients set Commissioner, chosen because it carries Ө/Ү and ₮. The app
// bundles the unsubsetted TTFs; the web self-hosts one variable woff2. What must
// not come back is the web loading it from Google Fonts, which serves it as four
// unicode-range subsets — Ө/Ү land in `cyrillic-ext` and ₮ in `latin-ext`, i.e.
// in different files from the Cyrillic around them, so each is fetched
// separately and rendered in the fallback face until it lands. That put two
// letters of a Mongolian word in a different typeface mid-render.
{
  const C = 'font';
  checks.push(C);

  const FAMILY = 'Commissioner';
  const appTheme = read('zuuchmap_app/src/design/theme.js');
  const webCss = read('zuuchmap_web/src/index.css');
  const webHtml = read('zuuchmap_web/index.html');

  const appFaces = [...appTheme.matchAll(/require\('([^']*\/([\w-]+)\.ttf)'\)/g)];
  if (!appFaces.length) fail(C, `no bundled .ttf faces in app/design/theme.js — the app must ship ${FAMILY} itself`);
  for (const [, rel, name] of appFaces) {
    if (!name.startsWith(FAMILY)) fail(C, `app bundles ${name}.ttf, which is not ${FAMILY}`);
    const abs = path.join(ROOT, 'zuuchmap_app/src/design', rel);
    if (!fs.existsSync(abs)) fail(C, `app/design/theme.js requires ${rel}, which does not exist`);
  }

  const face = webCss.match(/@font-face\s*\{[^}]*\}/);
  if (!face) fail(C, 'no @font-face in web/src/index.css — the web must self-host the face, not link it');
  else {
    if (!new RegExp(`font-family:\\s*["']?${FAMILY}`).test(face[0])) fail(C, `web @font-face is not ${FAMILY}`);
    if (/unicode-range/.test(face[0])) {
      fail(C, 'web @font-face declares a unicode-range — that is the subset split that stranded Ө/Ү/₮ in a separate file; keep the face whole');
    }
    const url = face[0].match(/url\(["']?([^"')]+)["']?\)/);
    if (!url) fail(C, 'web @font-face has no src url');
    else if (!fs.existsSync(path.join(ROOT, 'zuuchmap_web/public', url[1]))) {
      fail(C, `web @font-face points at ${url[1]}, which is not in zuuchmap_web/public`);
    }
  }

  if (!new RegExp(`--font-sans:\\s*["']?${FAMILY}`).test(webCss)) fail(C, `web --font-sans does not lead with ${FAMILY}`);
  if (/fonts\.(googleapis|gstatic)\.com/.test(webHtml + webCss)) {
    fail(C, 'web references Google Fonts again — it serves Commissioner as four unicode-range subsets, which is what split Ө/Ү/₮ off from the rest of the text');
  }
}

// ── 14. Form validation ──────────────────────────────────────────────────────
// The company DTOs carry no server-side decorators, so whatever the client lets
// through is what lands in the database — which made it the one place where two
// different rule sets really did produce two different databases. The web used
// to lean on the browser: type="tel" validates nothing, type="email" accepts
// "a@b", and type="url" *rejected* the bare "example.mn" that the app quietly
// normalised to a working link. Same four rules on both sides now.
{
  const C = 'form validation';
  checks.push(C);

  const appSrc = read('zuuchmap_app/src/utils/formUtils.js');
  const webSrc = read('zuuchmap_web/src/lib/utils.js');

  const FNS = [
    ['validateEmail', [
      'provider@example.mn', 'a@b', 'no-at-sign', '  spaced@example.mn  ', 'two@@at.mn',
      'trailing@dot.', '@nolocal.mn', 'user@sub.domain.mn', '', null, undefined, 42, 'a b@c.mn',
    ]],
    ['validatePhone', [
      '99112233', '9911 22 33', '+976 9911 2233', '991122', '9911223344556677',
      'abcdefgh', '9911-2233', '', null, undefined, 99112233,
    ]],
    ['validateRequired', [
      'x', '   ', '', null, undefined, 0, 1, false, true, [], ['a'], {},
    ]],
    ['normalizeWebsiteUrl', [
      'example.mn', 'http://example.mn', 'https://example.mn', 'HTTPS://EXAMPLE.MN',
      '  example.mn  ', 'httpfoo.mn', '', '   ', null, undefined,
    ]],
  ];

  for (const [name, fixtures] of FNS) {
    const appFn = liftArrow(C, appSrc, name, {}, 'app/formUtils.js');
    const webFn = liftArrow(C, webSrc, name, {}, 'web/utils.js');
    if (!appFn || !webFn) continue;
    for (const value of fixtures) {
      let a, w;
      try { a = appFn(value); } catch (e) { a = `THREW: ${e.message}`; }
      try { w = webFn(value); } catch (e) { w = `THREW: ${e.message}`; }
      if (a !== w) fail(C, `${name}(${JSON.stringify(value)}) — app returned ${JSON.stringify(a)}, web returned ${JSON.stringify(w)}`);
    }
  }

  // The rule has six call sites between the two clients and every one of them
  // used to re-spell it inline; one of them (`startsWith('http')`) let "httpfoo"
  // through as already-qualified. Nothing may hand-roll it any more.
  const INLINE = /https\?:\\\/\\\/|startsWith\(['"]http['"]\)/;
  for (const dir of ['zuuchmap_web/src/pages', 'zuuchmap_web/src/components', 'zuuchmap_app/src/screens']) {
    const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${d}/${e.name}`) : (/\.jsx?$/.test(e.name) ? [`${d}/${e.name}`] : []));
    for (const file of walk(dir)) {
      const src = read(file);
      for (const [n, line] of src.split('\n').entries()) {
        if (INLINE.test(line) && !/basemaps|openstreetmap|carto/i.test(line)) {
          fail(C, `${file}:${n + 1} spells the https:// prefix rule out by hand — use normalizeWebsiteUrl so both clients store the same value`);
        }
      }
    }
  }
}

// ── 15. i18n key resolution ──────────────────────────────────────────────────
// Every `t('a.b')` in either client must resolve to something. When the map
// filter sheet was ported from the app to the web, `filter.minPrice` and
// `filter.maxPrice` were not ported with it, so the price filter shipped with
// the literal strings "filter.minPrice" and "filter.maxPrice" as its field
// labels. i18next renders a missing key as the key itself, which is why nothing
// crashed and nobody noticed.
{
  const C = 'i18n keys';
  checks.push(C);

  for (const [client, locale, srcDir] of [
    ['web', 'zuuchmap_web/src/i18n/mn.js', 'zuuchmap_web/src'],
    ['app', 'zuuchmap_app/src/i18n/locales/mn.js', 'zuuchmap_app/src'],
  ]) {
    const leaves = Object.keys(loadLocale(locale));
    // A key may legitimately name a whole subtree — `t('admin.reasonTypes',
    // { returnObjects: true })` hands the caller the object. Treat any prefix
    // of a real leaf as resolvable.
    const resolvable = new Set(leaves);
    for (const k of leaves) {
      const parts = k.split('.');
      for (let i = 1; i < parts.length; i++) resolvable.add(parts.slice(0, i).join('.'));
    }

    const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${d}/${e.name}`) : (/\.jsx?$/.test(e.name) ? [`${d}/${e.name}`] : []));

    for (const file of walk(srcDir)) {
      if (file.includes('/i18n/')) continue;
      const src = read(file);
      // Only literal keys can be checked; `t(variable)` is invisible here.
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z][\w]*(?:\.[\w]+)+)'/g)) {
        if (resolvable.has(m[1])) continue;
        const line = src.slice(0, m.index).split('\n').length;
        fail(C, `${client}: ${file}:${line} uses t('${m[1]}'), which is not in ${locale} — i18next will render the key itself on screen`);
      }
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
