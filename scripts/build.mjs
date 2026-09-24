// Validates everything in data/ and stories/, then builds the website into dist/.
//   node scripts/build.mjs          -> check + build
//   node scripts/build.mjs --check  -> check only
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { marked } from 'marked';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const DIST = path.join(ROOT, 'dist');
const CHECK_ONLY = process.argv.includes('--check');
const THIS_YEAR = new Date().getFullYear();

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

// ---------- load ----------

function readYaml(file) {
  try {
    return YAML.parse(fs.readFileSync(file, 'utf8')) ?? {};
  } catch (e) {
    err(path.relative(ROOT, file), `not valid YAML — ${e.message.split('\n')[0]}`);
    return null;
  }
}

function loadDir(dir) {
  const out = {};
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort()) {
    const file = path.join(dir, name);
    const where = path.relative(ROOT, file);
    const obj = readYaml(file);
    if (!obj) continue;
    const expected = name.replace(/\.yaml$/, '');
    if (obj.id !== expected) err(where, `id "${obj.id}" must match the file name "${expected}"`);
    if (out[obj.id]) err(where, `duplicate id ${obj.id}`);
    out[obj.id] = { ...obj, _file: where };
  }
  return out;
}

const people = loadDir(path.join(DATA, 'people'));
const families = loadDir(path.join(DATA, 'families'));
const places = readYaml(path.join(DATA, 'places.yaml')) ?? {};
const sources = readYaml(path.join(DATA, 'sources.yaml')) ?? {};

// ---------- validate ----------

const PERSON_KEYS = new Set(['id', 'name', 'alias', 'gender', 'born', 'died', 'deceased', 'birthplace',
  'sahi', 'occupation', 'note', 'sources', 'photo', 'married_into']);
const FAMILY_KEYS = new Set(['id', 'partners', 'children', 'married', 'note', 'sources']);
// Guard against personal data that must never be published.
const SENSITIVE = /phone|mobile|aadha?ar|e-?mail|address|^pan(_|$)|bank|account|password|voter/i;

function checkKeys(obj, allowed, where) {
  for (const k of Object.keys(obj)) {
    if (k === '_file') continue;
    if (SENSITIVE.test(k)) err(where, `"${k}" looks like sensitive personal data — Paida Roots never stores this`);
    else if (!allowed.has(k)) err(where, `unknown field "${k}" (allowed: ${[...allowed].join(', ')})`);
  }
}

function checkDate(d, where, field, { living = false } = {}) {
  if (d == null) return;
  if (typeof d !== 'object') return err(where, `${field} must look like { year: 1950 }`);
  const { year, month, day, approx } = d;
  for (const k of Object.keys(d)) {
    if (!['year', 'month', 'day', 'approx'].includes(k)) err(where, `${field} has unknown part "${k}"`);
  }
  if (!Number.isInteger(year) || year < 1600 || year > THIS_YEAR) err(where, `${field}.year must be a year between 1600 and ${THIS_YEAR}`);
  if (month != null && !(Number.isInteger(month) && month >= 1 && month <= 12)) err(where, `${field}.month must be 1–12`);
  if (day != null && !(Number.isInteger(day) && day >= 1 && day <= 31)) err(where, `${field}.day must be 1–31`);
  if (approx != null && typeof approx !== 'boolean') err(where, `${field}.approx must be true or false`);
  if (living && (month != null || day != null)) err(where, `${field}: for living people record the year only, never the full date`);
}

const isLiving = (p) => !p.died && !p.deceased;
const refList = (v) => (Array.isArray(v) ? v : v == null ? [] : null);

for (const p of Object.values(people)) {
  const w = p._file;
  checkKeys(p, PERSON_KEYS, w);
  if (!p.name || typeof p.name !== 'object' || !p.name.en) err(w, 'name.en (English name) is required');
  if (p.gender != null && !['M', 'F', 'U'].includes(p.gender)) err(w, 'gender must be M, F or U (unknown)');
  checkDate(p.born, w, 'born', { living: isLiving(p) });
  checkDate(p.died, w, 'died');
  if (p.born?.year && p.died?.year && p.died.year < p.born.year) err(w, 'died before being born');
  if (isLiving(p) && p.born?.year && THIS_YEAR - p.born.year > 105) {
    warn(w, `born ${p.born.year} and no death recorded — add "died: { year: … }" or "deceased: true"`);
  }
  if (p.birthplace != null && !places[p.birthplace]) err(w, `birthplace "${p.birthplace}" is not in data/places.yaml`);
  if (p.married_into != null && !places[p.married_into]) err(w, `married_into "${p.married_into}" is not in data/places.yaml`);
  const srcs = refList(p.sources);
  if (srcs === null) err(w, 'sources must be a list, e.g. [S001]');
  else for (const s of srcs) if (!sources[s]) err(w, `source "${s}" is not in data/sources.yaml`);
  if (p.alias != null && !Array.isArray(p.alias)) err(w, 'alias must be a list, e.g. [Hari Bhai]');
  if (p.photo && !fs.existsSync(path.join(ROOT, 'media', p.photo))) err(w, `photo "media/${p.photo}" does not exist`);
}

const parentFamilyOf = {}; // personId -> familyId
const familiesOf = {}; // personId -> [familyId] where they are a partner

for (const f of Object.values(families)) {
  const w = f._file;
  checkKeys(f, FAMILY_KEYS, w);
  checkDate(f.married, w, 'married');
  const partners = refList(f.partners);
  const children = refList(f.children);
  if (!partners || partners.length < 1 || partners.length > 2) err(w, 'partners must list 1 or 2 person ids');
  if (children === null) err(w, 'children must be a list (use [] for none)');
  for (const id of partners ?? []) {
    if (!people[id]) { err(w, `partner ${id} does not exist in data/people/`); continue; }
    (familiesOf[id] ??= []).push(f.id);
    const p = people[id];
    if (f.married?.year && p.died?.year && f.married.year > p.died.year + (f.married.approx || p.died.approx ? 5 : 0)) {
      err(w, `married in ${f.married.year}, but partner ${id} died in ${p.died.year}`);
    }
  }
  if (partners?.length === 2) {
    const pair = [...partners].sort().join('+');
    const dup = Object.values(families).find((o) => o.id < f.id && o.partners?.length === 2 && [...o.partners].sort().join('+') === pair);
    if (dup) err(w, `${partners.join(' and ')} already have a family file (${dup.id}) — put all their children there`);
  }
  for (const id of children ?? []) {
    if (!people[id]) { err(w, `child ${id} does not exist in data/people/`); continue; }
    if (partners?.includes(id)) err(w, `${id} cannot be both a partner and a child`);
    if (parentFamilyOf[id]) err(w, `${id} is already a child in ${parentFamilyOf[id]}`);
    parentFamilyOf[id] = f.id;
    const child = people[id];
    for (const pid of partners ?? []) {
      const parent = people[pid];
      if (!parent || !child.born?.year || !parent.born?.year) continue;
      const gap = child.born.year - parent.born.year;
      const fuzzy = child.born.approx || parent.born.approx;
      if (gap < (fuzzy ? 5 : 12)) err(w, `${id} (born ${child.born.year}) is too close in age to parent ${pid} (born ${parent.born.year})`);
      if (parent.died?.year && child.born.year > parent.died.year + 1) {
        warn(w, `${id} born ${child.born.year}, after parent ${pid} died in ${parent.died.year}`);
      }
    }
  }
  f.partners = partners ?? [];
  f.children = children ?? [];
}

// A person's marriages in order: by marriage year, then by family id.
for (const list of Object.values(familiesOf)) {
  list.sort((a, b) => (families[a].married?.year ?? 9999) - (families[b].married?.year ?? 9999) || a.localeCompare(b));
}

// No one can be their own ancestor.
{
  const state = {};
  const visit = (id, trail) => {
    if (state[id] === 'done') return;
    if (state[id] === 'active') return err('data/families', `family loop: ${[...trail, id].join(' → ')}`);
    state[id] = 'active';
    for (const fid of familiesOf[id] ?? []) for (const c of families[fid].children) visit(c, [...trail, id]);
    state[id] = 'done';
  };
  for (const id of Object.keys(people)) visit(id, []);
}

for (const id of Object.keys(people)) {
  if (!parentFamilyOf[id] && !familiesOf[id]) warn(people[id]._file, 'not connected to any family yet');
}

// ---------- derive ----------

// Generation 1 = the oldest known ancestors. People who married in take their spouse's generation.
const generation = {};
function genOf(id, seen = new Set()) {
  if (generation[id]) return generation[id];
  if (seen.has(id)) return 1;
  seen.add(id);
  let g = 1;
  const pf = parentFamilyOf[id];
  if (pf) {
    g = 1 + Math.max(...families[pf].partners.map((p) => genOf(p, seen)));
  } else {
    for (const fid of familiesOf[id] ?? []) {
      for (const other of families[fid].partners) {
        if (other !== id && parentFamilyOf[other]) g = Math.max(g, genOf(other, seen));
      }
    }
  }
  return (generation[id] = g);
}
if (!errors.length) Object.keys(people).forEach((id) => genOf(id));

function loadStories() {
  const dir = path.join(ROOT, 'stories');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().map((file) => {
    const md = fs.readFileSync(path.join(dir, file), 'utf8');
    const title = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? file;
    return { slug: file.replace(/^\d+-/, '').replace(/\.md$/, ''), title, html: marked.parse(md.replace(/^#\s+.+$/m, '')) };
  });
}

// ---------- GEDCOM (standard family-tree format, opens in Gramps, FamilySearch, Ancestry) ----------

function gedDate(d) {
  if (!d?.year) return null;
  const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const parts = [d.day, d.month && M[d.month - 1], d.year].filter(Boolean).join(' ');
  return (d.approx ? 'ABT ' : '') + parts;
}

function toGedcom() {
  const L = ['0 HEAD', '1 SOUR PAIDA_ROOTS', '2 NAME Paida Roots', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8', `1 DATE ${gedDate({ year: THIS_YEAR, month: new Date().getMonth() + 1, day: new Date().getDate() })}`];
  const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();
  for (const p of Object.values(people)) {
    const words = p.name.en.trim().split(/\s+/);
    const surname = words.length > 1 ? words.pop() : '';
    L.push(`0 @${p.id}@ INDI`, `1 NAME ${words.join(' ')} /${surname}/`);
    if (p.name.or) L.push(`1 NAME ${oneLine(p.name.or)}`, '2 TYPE aka');
    for (const a of p.alias ?? []) L.push(`1 NAME ${oneLine(a)}`, '2 TYPE aka');
    if (p.gender) L.push(`1 SEX ${p.gender}`);
    const birt = gedDate(p.born);
    const place = p.birthplace && places[p.birthplace]?.en;
    if (birt || place) {
      L.push('1 BIRT');
      if (birt) L.push(`2 DATE ${birt}`);
      if (place) L.push(`2 PLAC ${place}`);
    }
    if (p.died || p.deceased) {
      L.push('1 DEAT' + (gedDate(p.died) ? '' : ' Y'));
      if (gedDate(p.died)) L.push(`2 DATE ${gedDate(p.died)}`);
    }
    if (p.occupation) L.push(`1 OCCU ${oneLine(p.occupation)}`);
    if (p.note) L.push(`1 NOTE ${oneLine(p.note)}`);
    if (p.married_into) L.push(`1 NOTE Married into ${places[p.married_into].en}`);
    if (parentFamilyOf[p.id]) L.push(`1 FAMC @${parentFamilyOf[p.id]}@`);
    for (const f of familiesOf[p.id] ?? []) L.push(`1 FAMS @${f}@`);
  }
  for (const f of Object.values(families)) {
    L.push(`0 @${f.id}@ FAM`);
    const [a, b] = f.partners;
    const husbFirst = people[a]?.gender !== 'F';
    const [h, w] = husbFirst ? [a, b] : [b, a];
    if (h) L.push(`1 HUSB @${h}@`);
    if (w) L.push(`1 WIFE @${w}@`);
    for (const c of f.children) L.push(`1 CHIL @${c}@`);
    if (gedDate(f.married)) L.push('1 MARR', `2 DATE ${gedDate(f.married)}`);
  }
  L.push('0 TRLR');
  return L.join('\n') + '\n';
}

// ---------- report + write ----------

for (const w of warnings) console.warn(`  warning  ${w}`);
for (const e of errors) console.error(`  ERROR    ${e}`);
if (errors.length) {
  console.error(`\n✗ ${errors.length} error(s). Fix them and run again.`);
  process.exit(1);
}
console.log(`✓ ${Object.keys(people).length} people, ${Object.keys(families).length} families, ` +
  `${Math.max(0, ...Object.values(generation))} generations — all checks passed.`);
if (CHECK_ONLY) process.exit(0);

const strip = ({ _file, ...rest }) => rest;
const data = {
  generated: new Date().toISOString().slice(0, 10),
  people: Object.fromEntries(Object.values(people).map((p) => [p.id, {
    ...strip(p),
    living: isLiving(p),
    generation: generation[p.id],
    parentFamily: parentFamilyOf[p.id] ?? null,
    families: familiesOf[p.id] ?? [],
  }])),
  families: Object.fromEntries(Object.values(families).map((f) => [f.id, strip(f)])),
  places,
  sources,
  stories: loadStories(),
};

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'site'), DIST, { recursive: true });
fs.cpSync(path.join(ROOT, 'media'), path.join(DIST, 'media'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'data.json'), JSON.stringify(data));
fs.writeFileSync(path.join(DIST, 'paida-roots.ged'), toGedcom());
console.log(`✓ Website built in dist/ (open with: npm run serve)`);
