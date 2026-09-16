#!/usr/bin/env node
/*
 * check-schema.js — guard against the "wrong-column" class of Supabase bug.
 *
 * A *ToSb mapper (or an inline row object) can write a column the table does
 * not have. PostgREST then rejects the ENTIRE row ("Could not find the 'X'
 * column of 'Y' in the schema cache"), so the write fails — sometimes with a
 * visible toast, often silently swallowed by a `.catch(()=>{})`. This is how
 * DRF creation broke (brand_guide_link on the wrong table), how cash inflows
 * never synced (source/note vs description), and how addenda stopped syncing
 * (cost_impact / client_approved that never existed).
 *
 * This script parses the source, finds every Supabase write, resolves the row
 * columns it sends (via the mapper it uses or an inline object literal), and
 * checks each column against scripts/schema-snapshot.json (a dump of the live
 * public schema). Any column not in the table is a latent write failure.
 *
 * Regenerate the snapshot when you add columns via a migration:
 *   SELECT json_object_agg(table_name, cols ORDER BY table_name)
 *   FROM (SELECT table_name, json_agg(column_name ORDER BY column_name) cols
 *         FROM information_schema.columns WHERE table_schema='public'
 *         GROUP BY table_name) t;
 *
 * Usage:  node scripts/check-schema.js
 * Exit 0 = clean, Exit 1 = a write targets a column the table doesn't have.
 */
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'schema-snapshot.json'), 'utf8'));

// Functions whose first string arg is a table name and whose row payload we
// can resolve. Value = index of the payload arg (object literal or mapper call
// or, for the *SyncOne/syncAll pair, the mapper is a later identifier arg).
const WRITE_FNS = { sbInsert: 1, sbUpsert: 1, sbSyncOne: 1, syncAll: 1 };
// For these, the row shape comes from a mapper passed as a bare identifier at
// this arg index (sbSyncOne(table, rec, mapper) / syncAll(table, arr, mapper)).
const MAPPER_ARG = { sbSyncOne: 2, syncAll: 2 };

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

function parse(src) {
  return parser.parse(src, {
    sourceType: 'module',
    plugins: ['jsx', 'optionalChaining', 'nullishCoalescingOperator', 'objectRestSpread', 'classProperties'],
  });
}

// Recursively visit every node, calling fn(node). Enough for our needs.
function visit(node, fn) {
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    const val = node[key];
    if (Array.isArray(val)) { for (const c of val) if (c && typeof c.type === 'string') visit(c, fn); }
    else if (val && typeof val.type === 'string') visit(val, fn);
  }
}

// Pull the top-level column keys from an ObjectExpression. Returns null if the
// object spreads another value (…r) — we can't know its full key set statically,
// so we skip rather than risk a false positive.
function keysOfObject(obj) {
  const keys = [];
  for (const p of obj.properties) {
    if (p.type === 'SpreadElement' || p.type === 'SpreadProperty' || p.type === 'ExperimentalSpreadProperty') return null;
    if (p.type !== 'ObjectProperty' && p.type !== 'Property') continue;
    if (p.computed) continue;
    if (p.key.type === 'Identifier') keys.push(p.key.name);
    else if (p.key.type === 'StringLiteral') keys.push(p.key.value);
  }
  return keys;
}

// Given a function node (arrow/function), return the column keys of the object
// it produces: the returned ObjectExpression plus any `base.col = …` writes to
// a local object that is then returned. Returns null if unresolvable (spread).
function keysOfMapperFn(fn) {
  let baseKeys = null;
  const extra = new Set();
  const body = fn.body;
  if (body.type === 'ObjectExpression') {
    baseKeys = keysOfObject(body);
  } else if (body.type === 'BlockStatement') {
    // Find `return {…}` and `<id>.<col> = …` assignments.
    visit(body, (n) => {
      if (n.type === 'ReturnStatement' && n.argument && n.argument.type === 'ObjectExpression') {
        const k = keysOfObject(n.argument);
        if (k) { baseKeys = baseKeys || []; for (const x of k) baseKeys.push(x); }
        else baseKeys = null; // spread inside returned object
      }
      if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' &&
          !n.left.computed && n.left.property.type === 'Identifier') {
        extra.add(n.left.property.name);
      }
    });
  }
  if (baseKeys === null) return null;
  for (const e of extra) baseKeys.push(e);
  return baseKeys;
}

// ── Pass 1: collect every mapper (name -> column keys) across all files ──────
const files = walk(SRC);
const mappers = new Map(); // name -> string[] | null
for (const f of files) {
  let ast;
  try { ast = parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
  visit(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init &&
        (n.init.type === 'ArrowFunctionExpression' || n.init.type === 'FunctionExpression')) {
      mappers.set(n.id.name, keysOfMapperFn(n.init));
    }
    if (n.type === 'FunctionDeclaration' && n.id) {
      mappers.set(n.id.name, keysOfMapperFn(n));
    }
  });
}

// ── Pass 2: find every write call and check its columns against the schema ──
const problems = [];
const unknownTables = new Set();
for (const f of files) {
  let ast;
  try { ast = parse(fs.readFileSync(f, 'utf8')); } catch { continue; }
  visit(ast, (n) => {
    if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier') return;
    const fn = n.callee.name;
    if (!(fn in WRITE_FNS)) return;
    const tableArg = n.arguments[0];
    if (!tableArg || tableArg.type !== 'StringLiteral') return; // dynamic table (e.g. restoreFinancial) — skip
    const table = tableArg.value;

    // Resolve the columns this call writes.
    let cols = null;
    if (fn in MAPPER_ARG) {
      const m = n.arguments[MAPPER_ARG[fn]];
      if (m && m.type === 'Identifier' && mappers.has(m.name)) cols = mappers.get(m.name);
    } else {
      const payload = n.arguments[WRITE_FNS[fn]];
      if (!payload) return;
      if (payload.type === 'ObjectExpression') cols = keysOfObject(payload);
      else if (payload.type === 'CallExpression' && payload.callee.type === 'Identifier' && mappers.has(payload.callee.name)) {
        cols = mappers.get(payload.callee.name);
      }
    }
    if (cols === null || cols === undefined) return; // unresolvable (spread / indirect) — skip, never false-alarm

    if (!schema[table]) { unknownTables.add(table); return; }
    const have = new Set(schema[table]);
    const missing = cols.filter((c) => !have.has(c));
    if (missing.length) {
      problems.push({ file: path.relative(ROOT, f), line: n.loc ? n.loc.start.line : '?', table, missing: [...new Set(missing)] });
    }
  });
}

if (unknownTables.size) {
  console.log('⚠ check-schema: writes target tables not in the snapshot (regenerate snapshot if these are new):');
  for (const t of [...unknownTables].sort()) console.log(`    ${t}`);
}

if (problems.length) {
  console.log('\n✗ check-schema: Supabase writes target columns the table does not have.');
  console.log('  PostgREST rejects the whole row — these writes fail (often silently).\n');
  for (const p of problems.sort((a, b) => a.table.localeCompare(b.table))) {
    console.log(`  ${p.table}  ←  missing column(s): ${p.missing.join(', ')}`);
    console.log(`      ${p.file}:${p.line}`);
  }
  console.log(`\n${problems.length} wrong-column write(s). Fix the mapper, or add the column via a migration and regenerate scripts/schema-snapshot.json.`);
  process.exit(1);
}
console.log(`✓ check-schema: all Supabase writes match the schema snapshot (${mappers.size} mappers, ${files.length} files).`);
