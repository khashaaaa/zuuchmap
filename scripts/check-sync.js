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

/**
 * Every client source file, as [display label, repo-relative path].
 *
 * Used by the Intl ban, which has to sweep both trees whole rather than a list
 * of the files a bug was last found in.
 */
function walkClientSources() {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(child);
      else if (/\.(js|jsx)$/.test(e.name) && !/\.test\.|\.spec\./.test(e.name)) out.push([child, child]);
    }
  };
  walk('zuuchmap_web/src');
  walk('zuuchmap_app/src');
  return out;
}

/**
 * The two helper modules are where the rule is *stated*, so they are the two
 * files allowed to name it. Everything else imports from them.
 */
const ALLOWED_INTL = [
  'zuuchmap_web/src/lib/utils.js',
  'zuuchmap_app/src/utils/displayUtils.js',
];

/** Drop line and block comments so a rule written *about* Intl doesn't trip the ban on it. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

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

/**
 * The locales each client ships. These deliberately differ. The app serves all
 * four; the web ships mn/en only, because a browser visitor who reads neither
 * is far rarer than an app user who does, and two fewer trees is two fewer
 * places for a string to rot.
 *
 * `mn` is the fallback and the source of truth on both sides.
 *
 * Cross-client contracts (shared keys, price-unit labels) can only compare what
 * both ship, so they iterate SHARED_LOCALES. Per-client contracts (completeness)
 * iterate that client's own list via CLIENT_LOCALES.
 *
 * Note this is NOT the list of locales a category schema carries: `labels` on
 * CategorySchema stays {mn,en,zh,ru} because the app renders all four, and the
 * web admin is the only place to edit them. See SCHEMA_LOCALES in
 * zuuchmap_web/src/i18n/index.js.
 */
const APP_LOCALES = ['mn', 'en', 'zh', 'ru'];
const WEB_LOCALES = ['mn', 'en'];
const SHARED_LOCALES = APP_LOCALES.filter((l) => WEB_LOCALES.includes(l));
const CLIENT_LOCALES = { app: APP_LOCALES, web: WEB_LOCALES };

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
  // Read from `PRICE_UNITS`, the array that mirrors the engine enum. This used
  // to scrape the keys of `PRICE_UNIT_KEYS`, a lookup table whose only job was
  // to lowercase a code into an i18n key — so the codes were a side effect of a
  // translation detail. Both clients now key `priceUnit.<CODE>` directly and
  // that table is gone.
  const webKeys = objectLiteral(read('zuuchmap_web/src/lib/utils.js'), 'PRICE_UNITS');
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
  for (const locale of SHARED_LOCALES) {
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
    for (const locale of CLIENT_LOCALES[client]) {
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

  // Both sides now compose the same three helpers; lift them too rather than
  // stubbing, so the fixtures exercise the real grouping on both.
  const appGroup = liftArrow(C, appSrc, 'groupThousands', {}, 'app/displayUtils.js');
  const webGroup = liftArrow(C, webSrc, 'groupThousands', {}, 'web/utils.js');
  const appScope = {
    getPriceUnitLabel: appUnitStub,
    groupThousands: appGroup,
    priceValue: liftArrow(C, appSrc, 'priceValue', {}, 'app/displayUtils.js'),
    wholeTugriks: liftArrow(C, appSrc, 'wholeTugriks', { groupThousands: appGroup }, 'app/displayUtils.js'),
  };
  const webScope = {
    PRICE_UNIT_KEYS: objectLiteral(webSrc, 'PRICE_UNIT_KEYS'),
    groupThousands: webGroup,
    priceValue: liftArrow(C, webSrc, 'priceValue', {}, 'web/utils.js'),
    wholeTugriks: liftArrow(C, webSrc, 'wholeTugriks', { groupThousands: webGroup }, 'web/utils.js'),
  };

  const appFn = liftArrow(C, appSrc, 'formatPrice', appScope, 'app/displayUtils.js');
  const webFn = liftArrow(C, webSrc, 'formatPrice', webScope, 'web/utils.js');

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
    ['decimal tail rounds, never truncates', '250000.60', 'DAY'],
    ['sub-tugrik amount', '0.40', 'DAY'],
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

  // ── 10b. formatPriceParts ──────────────────────────────────────────────────
  // The same price, split so a screen can set the amount large and the unit
  // quiet. It carries one rule the string form also has and a caller cannot be
  // trusted to remember: a TOTAL price has **no** unit. The app's listing
  // detail built this split inline and labelled a sale price with its unit,
  // where the web suppressed it — the same listing, priced once, described two
  // ways.
  {
    const CP = 'formatPriceParts';
    checks.push(CP);
    const appParts = liftArrow(CP, appSrc, 'formatPriceParts', appScope, 'app/displayUtils.js');
    const webParts = liftArrow(CP, webSrc, 'formatPriceParts', webScope, 'web/utils.js');
    if (appParts && webParts) {
      for (const [label, amount, unit] of FIXTURES) {
        let a, w;
        try { a = appParts(amount, unit); } catch (e) { a = `THREW: ${e.message}`; }
        try { w = webParts(amount, unit, webTStub); } catch (e) { w = `THREW: ${e.message}`; }
        if (JSON.stringify(a) !== JSON.stringify(w)) {
          fail(CP, `fixture "${label}" — app returned ${JSON.stringify(a)}, web returned ${JSON.stringify(w)}`);
        }
      }
      // Spelled out rather than left to the fixtures: this is the rule that
      // gets re-broken, and a fixture only proves the two agree, not that they
      // agree on the right thing.
      const total = appParts(250000, 'TOTAL');
      if (!total || total.unit !== null) {
        fail(CP, `a TOTAL price must carry no unit — got ${JSON.stringify(total)}`);
      }
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

// ── 11b. formatTime ──────────────────────────────────────────────────────────
// The same contract as formatDate, for the same reason and after the same bug.
// The messaging and notification screens each built their own clock inline; the
// web's went through `toLocaleTimeString` and rendered `08:47 PM` where the app
// rendered `20:47`, with `toLocaleDateString(locale, {month:'short'})` beside it
// printing the English "Aug" into a Mongolian inbox. Both are helpers now so
// there is something to check.
{
  const C = 'formatTime';
  checks.push(C);

  const i18nStub = { t: (k) => `I18N:${k}` };
  const appSrc = read('zuuchmap_app/src/utils/displayUtils.js');
  const webSrc = read('zuuchmap_web/src/lib/utils.js');

  const appFn = liftArrow(C, appSrc, 'formatTime', {
    i18n: i18nStub,
    logger: { error: () => {} },
  }, 'app/displayUtils.js');
  const webFn = liftArrow(C, webSrc, 'formatTime', { i18n: i18nStub }, 'web/utils.js');

  const FIXTURES = [
    ['midnight', '2026-08-26T00:00:00'],
    ['noon', '2026-08-26T12:00:00'],
    ['afternoon needs 24h', '2026-08-26T20:47:00'],
    ['single-digit pad', '2026-08-26T09:05:00'],
    ['epoch millis', 1787758591848],
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['zero', 0],
    ['unparseable', 'garbage'],
  ];

  // Neither side may reach for Intl: that is the drift, not just its symptom.
  for (const [file, src] of [['app/displayUtils.js', appSrc], ['web/utils.js', webSrc]]) {
    const at = src.search(/(?:export\s+)?const\s+formatTime\s*=/);
    const body = at === -1 ? '' : src.slice(at, at + 700);
    if (/toLocaleTimeString|Intl\.DateTimeFormat/.test(body)) {
      fail(C, `${file}: formatTime goes through Intl — build HH:MM by hand so both runtimes agree regardless of ICU`);
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

// ── 11c. formatDateTime ──────────────────────────────────────────────────────
// `YYYY.MM.DD HH:MM` — formatDate and formatTime in one string, for the places
// that need the clock beside the day. The admin report queue is one, and it had
// grown its own on each client: the web read `11 Sep, 14:32` through
// toLocaleDateString where the app read `2026.09.11 14:32`, for the same report
// row in the same queue.
{
  const C = 'formatDateTime';
  checks.push(C);

  const i18nStub = { t: (k) => `I18N:${k}` };
  const appSrc = read('zuuchmap_app/src/utils/displayUtils.js');
  const webSrc = read('zuuchmap_web/src/lib/utils.js');

  const appParts = liftArrow(C, appSrc, 'parts', {}, 'app/displayUtils.js');
  const sep = appSrc.match(/const DATE_SEPARATOR = '([^']*)'/);
  const appFn = liftArrow(C, appSrc, 'formatDateTime', {
    parts: appParts,
    DATE_SEPARATOR: sep ? sep[1] : '.',
    i18n: i18nStub,
    logger: { error: () => {} },
  }, 'app/displayUtils.js');
  const webFn = liftArrow(C, webSrc, 'formatDateTime', {
    i18n: i18nStub,
    formatDate: liftArrow(C, webSrc, 'formatDate', { i18n: i18nStub }, 'web/utils.js'),
    formatTime: liftArrow(C, webSrc, 'formatTime', { i18n: i18nStub }, 'web/utils.js'),
  }, 'web/utils.js');

  const FIXTURES = [
    ['iso timestamp', '2026-08-26T20:47:00'],
    ['midnight', '2026-08-26T00:00:00'],
    ['single-digit everything', '2026-01-05T09:05:00'],
    ['date only', '2026-08-26'],
    ['epoch millis', 1787758591848],
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['zero', 0],
    ['unparseable', 'garbage'],
  ];

  if (appFn && webFn) {
    for (const [label, value] of FIXTURES) {
      let a, w;
      try { a = appFn(value); } catch (e) { a = `THREW: ${e.message}`; }
      try { w = webFn(value); } catch (e) { w = `THREW: ${e.message}`; }
      if (a !== w) fail(C, `fixture "${label}" — app returned ${JSON.stringify(a)}, web returned ${JSON.stringify(w)}`);
    }
  }
}

// ── 11d. formatRelativeAge ───────────────────────────────────────────────────
// "just now" · "5 min ago" · "3 h ago" · "2 d ago", for the draft-resume banner.
// Not a clock but the same class of fact: how old the stored draft is. The app
// said "5 минутын өмнө" and the web said "09/11, 14:32" for the same draft, so
// one device did the subtraction for you and the other made you do it.
//
// Compared by the i18n key and count each side chooses rather than by a
// rendered string, which is the actual decision — the wording is then pinned by
// the shared-key contract.
{
  const C = 'formatRelativeAge';
  checks.push(C);

  const appSrc = read('zuuchmap_app/src/utils/displayUtils.js');
  const webSrc = read('zuuchmap_web/src/lib/utils.js');
  const appFn = liftArrow(C, appSrc, 'formatRelativeAge', {}, 'app/displayUtils.js');
  const webFn = liftArrow(C, webSrc, 'formatRelativeAge', {}, 'web/utils.js');

  // Records the call instead of translating it.
  const tSpy = (key, opts) => `${key}${opts && opts.count !== undefined ? `:${opts.count}` : ''}`;

  const MIN = 60 * 1000;
  const now = Date.now();
  const FIXTURES = [
    ['just saved', now],
    ['30 seconds', now - 30 * 1000],
    ['exactly a minute', now - MIN],
    ['59 minutes', now - 59 * MIN],
    ['an hour', now - 60 * MIN],
    ['23 hours', now - 23 * 60 * MIN],
    ['a day', now - 24 * 60 * MIN],
    ['nine days', now - 9 * 24 * 60 * MIN],
    ['a future timestamp clamps to zero', now + 10 * MIN],
    ['null', null],
    ['undefined', undefined],
    ['zero', 0],
    ['unparseable', 'garbage'],
    ['a Date object', new Date(now - 5 * MIN)],
  ];

  if (appFn && webFn) {
    for (const [label, value] of FIXTURES) {
      let a, w;
      try { a = appFn(value, tSpy); } catch (e) { a = `THREW: ${e.message}`; }
      try { w = webFn(value, tSpy); } catch (e) { w = `THREW: ${e.message}`; }
      if (a !== w) fail(C, `fixture "${label}" — app returned ${JSON.stringify(a)}, web returned ${JSON.stringify(w)}`);
    }
  }
}

// ── 11e. Inbox and notification stamps ───────────────────────────────────────
// Two compositions *of* the contracted helpers, which is the gap the ban above
// cannot see: every half was already shared and correct, and the assembly was
// still written out twice. The inbox one carries a real rule — the time for
// today, the date for anything older, so a list of "14:32" rows still tells you
// which conversations have gone cold — and that rule lived in two files, with
// the same comment copied into both.
{
  const C = 'inbox/notification stamps';
  checks.push(C);

  const i18nStub = { t: (k) => `I18N:${k}` };
  const appSrc = read('zuuchmap_app/src/utils/displayUtils.js');
  const webSrc = read('zuuchmap_web/src/lib/utils.js');
  const sep = appSrc.match(/const DATE_SEPARATOR = '([^']*)'/);

  const appBase = {
    i18n: i18nStub,
    logger: { error: () => {} },
    parts: liftArrow(C, appSrc, 'parts', {}, 'app/displayUtils.js'),
    DATE_SEPARATOR: sep ? sep[1] : '.',
  };
  appBase.formatDate = liftArrow(C, appSrc, 'formatDate', appBase, 'app/displayUtils.js');
  appBase.formatTime = liftArrow(C, appSrc, 'formatTime', appBase, 'app/displayUtils.js');

  const webBase = { i18n: i18nStub };
  webBase.formatDate = liftArrow(C, webSrc, 'formatDate', webBase, 'web/utils.js');
  webBase.formatTime = liftArrow(C, webSrc, 'formatTime', webBase, 'web/utils.js');

  const now = new Date();
  const todayAt = (h, m) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).toISOString();
  const FIXTURES = [
    ['this morning', todayAt(9, 5)],
    ['this evening', todayAt(20, 47)],
    ['midnight today', todayAt(0, 0)],
    ['yesterday', new Date(now.getTime() - 24 * 3600 * 1000).toISOString()],
    ['last month', '2026-01-05T09:05:00'],
    ['epoch millis', 1787758591848],
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['zero', 0],
    ['unparseable', 'garbage'],
  ];

  for (const name of ['formatInboxStamp', 'formatNotificationStamp']) {
    const appFn = liftArrow(C, appSrc, name, appBase, 'app/displayUtils.js');
    const webFn = liftArrow(C, webSrc, name, webBase, 'web/utils.js');
    if (!appFn || !webFn) continue;
    for (const [label, value] of FIXTURES) {
      let a, w;
      try { a = appFn(value); } catch (e) { a = `THREW: ${e.message}`; }
      try { w = webFn(value); } catch (e) { w = `THREW: ${e.message}`; }
      if (a !== w) fail(C, `${name} fixture "${label}" — app returned ${JSON.stringify(a)}, web returned ${JSON.stringify(w)}`);
    }
  }

  // The rule the branch exists for, asserted rather than left to the fixtures:
  // a fixture only proves the two agree, not that they agree on the right thing.
  const appInbox = liftArrow(C, appSrc, 'formatInboxStamp', appBase, 'app/displayUtils.js');
  if (appInbox) {
    const today = appInbox(todayAt(14, 32));
    const older = appInbox('2026-01-05T14:32:00');
    if (!/^\d{2}:\d{2}$/.test(today)) fail(C, `an inbox row from today must read as a time, got ${JSON.stringify(today)}`);
    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(older)) fail(C, `an older inbox row must read as a date, got ${JSON.stringify(older)}`);
  }
}

// ── 11f. The Intl ban ────────────────────────────────────────────────────────
// Nothing outside the two helper modules may format a date, a time or a number
// through Intl.
//
// This started as a list of the six messaging and notification screens the
// first bug was found in, which is the shape of check that finds a bug once. It
// missed the provider billing pages, the admin report queue, the availability
// strip, the draft banner, the landing counters and the map filter — every one
// of which had independently grown its own on the web while the app used a
// helper, or the reverse. So it sweeps both clients whole.
//
// The rule is not "prefer the helper". React Native's JSC ships without full
// ICU on Android: `toLocaleString('mn-MN')` there silently resolves to en-US.
// Every behavioural fixture in this file runs under Node's full ICU, so two
// sides that both call Intl agree *here* and can still disagree on a phone —
// which makes an Intl call invisible to every other contract in this file. That
// is why it is banned outright rather than checked.
{
  const C = 'Intl ban';
  checks.push(C);

  for (const [label, file] of walkClientSources()) {
    if (ALLOWED_INTL.includes(label)) continue;
    const src = stripComments(read(file));
    const hit = src.match(/toLocaleDateString|toLocaleTimeString|toLocaleString|localeCompare|Intl\.[A-Za-z]/);
    if (hit) {
      fail(C, `${label}: reaches for Intl (${hit[0]}) — use formatDate / formatTime / formatDateTime / formatPrice / groupThousands from ${label.startsWith('zuuchmap_app') ? 'utils/displayUtils' : 'lib/utils'} instead`);
    }
  }
}

// ── 12. Price unit label coverage ────────────────────────────────────────────
// The *values* used to be checked here, because the app keyed them
// `priceUnit.HOUR` and the web `priceUnit.hour`, so no key was present in both
// trees and the shared-i18n contract compared nothing. Both clients now key
// `priceUnit.<CODE>`, so that contract compares them directly and exactly,
// which is stronger than the case-insensitive special case this was.
//
// What it cannot do is notice a *missing* one: it compares the keys the two
// trees have in common, so a unit labelled on neither side, or on only one, is
// simply outside it. An unlabelled code renders as "MOTO_HOUR" on a price. So
// this is now a coverage check against the enum itself, which is also more than
// the old version did — it only ever compared the union of what happened to
// exist.
{
  const C = 'price unit labels';
  checks.push(C);

  const CODES = objectLiteral(read('zuuchmap_web/src/lib/utils.js'), 'PRICE_UNITS') || [];
  if (!CODES.length) fail(C, 'could not read PRICE_UNITS from web/utils.js');

  const TREES = {
    app: (l) => `zuuchmap_app/src/i18n/locales/${l}.js`,
    web: (l) => `zuuchmap_web/src/i18n/${l}.js`,
  };

  for (const [client, pathFor] of Object.entries(TREES)) {
    for (const locale of CLIENT_LOCALES[client]) {
      const tree = loadLocale(pathFor(locale));
      for (const code of CODES) {
        const label = tree[`priceUnit.${code}`];
        if (!label) {
          fail(C, `${client}/${locale}: no label for priceUnit.${code} — a price would render the raw code`);
        }
      }
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

// ── 16. Thumbnail naming ─────────────────────────────────────────────────────
// The engine writes a card-sized copy of every post photo beside the original,
// and both clients ask for it by name — `<key>.jpg` → `<key>_thumb.jpg`. It is
// a convention rather than a column so `images` stays the `string[]` that three
// clients and every cached response already agree on, which is exactly what
// makes it drift-prone: nothing but this check connects the three regexes.
//
// Behavioural, because the rule is a regex and only the output matters. Each
// implementation is lifted out and run over the same URLs, including the ones
// that broke naive versions — a query string, an uppercase extension, a path
// with dots in it.
{
  const C = 'thumbnail naming';
  checks.push(C);

  const SOURCES = [
    ['engine', 'zuuchmap_engine/src/utils/uploader.ts', /export function thumbUrl\(url: string\): string \{([\s\S]*?)\n\}/],
    ['web', 'zuuchmap_web/src/lib/utils.js', /export const getThumbUrl = \(v\) => \{([\s\S]*?)\n\}/],
    ['app', 'zuuchmap_app/src/config/api.config.js', /export const getPostThumbUrl = \(filename\) => \{([\s\S]*?)\n\}/],
  ];

  const CASES = [
    'https://img.zuuchmap.com/posts/abc.jpg',
    'https://img.zuuchmap.com/posts/a.b.c.jpg',
    'https://img.zuuchmap.com/posts/abc.JPG',
    'https://img.zuuchmap.com/posts/abc.jpg?v=2',
    'https://img.zuuchmap.com/posts/abc.webp',
  ];

  const lifted = [];
  for (const [name, file, re] of SOURCES) {
    const m = read(file).match(re);
    if (!m) { fail(C, `${name}: could not find the thumbnail rule in ${file}`); continue; }
    // Each body reduces to "take the URL, splice _thumb in before the
    // extension" once its own url-resolving helper is stubbed to identity.
    // Stub each file's own url-resolving helper to identity — they differ, and
    // none of them is what this contract is about.
    const body = m[1]
      .replace(/getImageUrl\(v\)/g, 'v')
      .replace(/getPostImageUrl\(filename\)/g, 'filename');
    // The clients bind the URL to a local; the engine takes it as a parameter
    // named `url`. Give the latter the same local so one lift covers both.
    const preamble = /\b(?:const|let|var)\s+url\b/.test(body) ? '' : 'const url = v;\n';
    try {
      lifted.push([name, new Function('v', 'filename', 'THUMB_SUFFIX', preamble + body)]);
    } catch (err) {
      fail(C, `${name}: thumbnail rule could not be lifted — ${err.message}`);
    }
  }

  // The suffix itself, read rather than assumed — the engine builds object keys
  // from it, so a change there silently orphans every thumbnail the clients ask
  // for.
  const suffix = (read('zuuchmap_engine/src/utils/uploader.ts')
    .match(/export const THUMB_SUFFIX = '([^']+)'/) ?? [])[1];
  if (!suffix) fail(C, 'engine: THUMB_SUFFIX not found in utils/uploader.ts');

  if (lifted.length === SOURCES.length && suffix) {
    for (const input of CASES) {
      const seen = lifted.map(([name, fn]) => {
        try { return [name, fn(input, input, suffix)]; } catch (err) { return [name, `threw: ${err.message}`]; }
      });
      const values = [...new Set(seen.map(([, v]) => v))];
      if (values.length > 1) {
        fail(C, `${input} → ${seen.map(([n, v]) => `${n}: ${JSON.stringify(v)}`).join(', ')}`);
      } else if (!String(values[0]).includes(suffix)) {
        fail(C, `${input} → ${JSON.stringify(values[0])}, which does not carry ${suffix}`);
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
