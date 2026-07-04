#!/usr/bin/env node
/*
 * check-imports.js — guard against the "mkDesign is not defined" class of bug.
 *
 * When code is split across modules, a function can reference a symbol that
 * lives in ANOTHER project module without importing it. The bundler does not
 * flag free variables inside function bodies, so the build passes and the app
 * loads fine — then throws ReferenceError the moment that code path runs
 * (e.g. an Award action calling emptyProjectCard -> mkDesign).
 *
 * This script cross-references every src file: for each identifier a file
 * USES that is DEFINED (top-level) in some OTHER src file, it must either be
 * imported into this file or defined locally. Anything else is a latent
 * runtime ReferenceError. Comments and string/template literals are stripped
 * first so a name mentioned only in a comment (e.g. "// same as MyAccountPage")
 * is not a false positive.
 *
 * Usage:  node scripts/check-imports.js
 * Exit 0 = clean, Exit 1 = missing cross-module imports found.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

// Remove comments and string/template-literal contents so identifiers that only
// appear inside them are not counted as "used in code".
function stripCommentsAndStrings(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === q) { i++; break; }
        // keep newlines so line structure (and JSX between backticks) stays sane
        if (src[i] === '\n') out += '\n';
        i++;
      }
      out += ' ';
      continue;
    }
    out += c; i++;
  }
  return out;
}

const TOP_DEF = /^(?:export\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
const IMPORT_RE = /import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\*\s+as\s+([A-Za-z_$][\w$]*)\s*)?(?:\{([^}]*)\})?\s*from\s*['"][^'"]+['"]/g;

function topDefs(src) {
  const names = new Set();
  let m;
  TOP_DEF.lastIndex = 0;
  while ((m = TOP_DEF.exec(src))) names.add(m[1]);
  return names;
}

function importedNames(src) {
  const names = new Set();
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src))) {
    if (m[1]) names.add(m[1]);
    if (m[2]) names.add(m[2]);
    if (m[3]) for (const part of m[3].split(',')) {
      const t = part.trim(); if (!t) continue;
      names.add(t.split(/\s+as\s+/).pop().trim());
    }
  }
  return names;
}

// All local bindings in a file so we don't flag something that is actually
// declared locally or received as a (possibly destructured) parameter/prop —
// e.g. a component `function View({ today, sbUpsert })` legitimately uses those
// names as props, not module imports. Over-counting bindings here can only
// cause a MISSED warning, never a false alarm, so we cast a wide net:
//   const/let/var/function/class NAME, plus every identifier that appears
//   inside a parameter list or a destructuring pattern.
const ANY_DECL = /\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g;
function localDecls(code) {
  const names = new Set();
  let m;
  ANY_DECL.lastIndex = 0;
  while ((m = ANY_DECL.exec(code))) names.add(m[1]);

  // Parameter lists: `function name(...)` and `(...) =>`. The param group also
  // covers destructured props — `function View({ today, sbUpsert })` and
  // `({ today }) =>` both land their names here. This is what makes prop names
  // count as local rather than as missing imports.
  const PARAMS = /(?:function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)|\(([^)]*)\)\s*=>)/g;
  let p;
  while ((p = PARAMS.exec(code))) {
    const list = p[1] || p[2] || '';
    for (const id of list.match(/[A-Za-z_$][\w$]*/g) || []) names.add(id);
  }
  // Binding-position destructures only — must be preceded by const/let/var so
  // an object LITERAL like `{ design: mkDesign() }` (which is exactly the bug
  // shape we want to catch) is NOT swept in and masked.
  const DECL_DESTR = /(?:const|let|var)\s+[{[]([^}\]]*)[}\]]/g;
  let d;
  while ((d = DECL_DESTR.exec(code))) {
    for (const id of d[1].match(/[A-Za-z_$][\w$]*/g) || []) names.add(id);
  }
  return names;
}

const files = walk(SRC);
const raw = {};        // file -> original source
const code = {};       // file -> comment/string-stripped source
const defsByFile = {}; // file -> Set of top-level defs
const owner = new Map(); // symbol -> Set of files that top-level-define it

for (const f of files) {
  raw[f] = fs.readFileSync(f, 'utf8');
  code[f] = stripCommentsAndStrings(raw[f]);
  defsByFile[f] = topDefs(raw[f]);
  for (const s of defsByFile[f]) {
    if (!owner.has(s)) owner.set(s, new Set());
    owner.get(s).add(f);
  }
}

let problems = 0;
for (const f of files) {
  const imp = importedNames(raw[f]);
  const local = localDecls(code[f]);
  // Collect identifiers actually USED as value references — excluding property
  // accesses (`it._id`) and object-literal keys (`{ _id: ... }`), which are not
  // references to any imported/module binding.
  const src = code[f];
  const used = new Set();
  const idRe = /[A-Za-z_$][\w$]*/g;
  let u;
  while ((u = idRe.exec(src))) {
    const name = u[0];
    const before = src[u.index - 1];
    const after = src[u.index + name.length];
    if (before === '.') continue;      // member access: `obj.name`
    if (after === ':') continue;       // object-literal key / label: `name: ...`
    used.add(name);
  }
  const missing = [];
  for (const name of used) {
    const defFiles = owner.get(name);
    if (!defFiles) continue;                 // not a project symbol (JS/DOM global, etc.)
    if (defFiles.has(f)) continue;            // defined in THIS file
    if (imp.has(name)) continue;              // imported
    if (local.has(name)) continue;            // shadowed by a local decl
    // defined in some OTHER project file, used here, but not imported/local
    missing.push(`${name}  (defined in ${[...defFiles].map(x => path.relative(SRC, x)).join(', ')})`);
  }
  if (missing.length) {
    problems += missing.length;
    console.log(`\n✗ ${path.relative(SRC, f)} uses cross-module symbols it never imports:`);
    for (const s of missing.sort()) console.log(`    ${s}`);
  }
}

if (problems) {
  console.log(`\n${problems} missing cross-module import(s) — these will throw ReferenceError at runtime.`);
  process.exit(1);
}
console.log('✓ check-imports: no missing cross-module imports across ' + files.length + ' files.');
