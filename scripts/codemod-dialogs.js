#!/usr/bin/env node
/*
 * One-shot codemod: replace blocking window.confirm/prompt/alert with the
 * in-app promise-based uiConfirm/uiPrompt/uiAlert (see src/shared.jsx).
 *
 *   window.confirm(ARGS)  ->  (await uiConfirm(ARGS))
 *   window.prompt(ARGS)   ->  (await uiPrompt(ARGS))
 *   window.alert(ARGS)    ->  uiAlert(ARGS)
 *
 * and marks the nearest enclosing function `async` (confirm/prompt only), which
 * preserves every existing control-flow shape verbatim — guard-returns,
 * inline `if`s, and `const x = window.prompt(...)` capture all keep working.
 *
 * Uses @babel/parser for correct span detection (messages contain template
 * literals with nested ${} and parens that regex cannot balance). Applies edits
 * back-to-front so byte offsets stay valid, then the caller re-parses to verify.
 *
 *   node scripts/codemod-dialogs.js <file> [--apply]
 * Without --apply it only prints what it would do.
 */
const fs = require('fs');
const parser = require('@babel/parser');

const file = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!file) { console.error('usage: codemod-dialogs.js <file> [--apply]'); process.exit(2); }

const src = fs.readFileSync(file, 'utf8');
const ast = parser.parse(src, {
  sourceType: 'module',
  plugins: ['jsx'],
});

const FN_TYPES = new Set(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression','ObjectMethod','ClassMethod']);
const edits = [];        // {start,end,text}
const asyncFns = new Map(); // fn.start -> fn node (dedupe)
const hits = { confirm:0, prompt:0, alert:0 };

function isWindowCall(node, name){
  if(node.type!=='CallExpression') return false;
  const c=node.callee;
  return c && c.type==='MemberExpression' && !c.computed
    && c.object && c.object.type==='Identifier' && c.object.name==='window'
    && c.property && c.property.type==='Identifier' && c.property.name===name;
}

// Manual recursive walk keeping a stack of enclosing function nodes, since
// @babel/traverse isn't installed.
function walk(node, fnStack){
  if(!node || typeof node.type!=='string') return;
  const isFn = FN_TYPES.has(node.type);
  if(isFn) fnStack = fnStack.concat(node);

  let kind=null;
  if(isWindowCall(node,'confirm')) kind='confirm';
  else if(isWindowCall(node,'prompt')) kind='prompt';
  else if(isWindowCall(node,'alert')) kind='alert';

  if(kind){
    hits[kind]++;
    const args = src.slice(node.callee.end, node.end); // "(ARGS)" verbatim
    if(kind==='alert'){
      edits.push({start:node.start,end:node.end,text:'uiAlert'+args});
    }else{
      const fn = kind==='confirm'?'uiConfirm':'uiPrompt';
      edits.push({start:node.start,end:node.end,text:'(await '+fn+args+')'});
      const enc = fnStack[fnStack.length-1];
      if(enc && !enc.async) asyncFns.set(enc.start, enc);
    }
  }

  for(const key of Object.keys(node)){
    if(key==='loc'||key==='start'||key==='end'||key==='range'||key==='leadingComments'||key==='trailingComments'||key==='innerComments') continue;
    const child=node[key];
    if(Array.isArray(child)) child.forEach(c=>c&&walk(c,fnStack));
    else if(child&&typeof child.type==='string') walk(child,fnStack);
  }
}
walk(ast, []);

// Insert `async ` at the start of each enclosing function that needs it.
for(const fn of asyncFns.values()){
  edits.push({start:fn.start,end:fn.start,text:'async '});
}

// Apply back-to-front.
edits.sort((a,b)=> b.start-a.start || b.end-a.end);
let out=src;
for(const e of edits){
  out = out.slice(0,e.start) + e.text + out.slice(e.end);
}

console.log(`hits: confirm=${hits.confirm} prompt=${hits.prompt} alert=${hits.alert}`);
console.log(`functions marked async: ${asyncFns.size}`);
console.log(`total edits: ${edits.length}`);

if(APPLY){
  // Verify the transformed source still parses before writing.
  try{
    parser.parse(out,{sourceType:'module',plugins:['jsx']});
  }catch(err){
    console.error('REFUSING TO WRITE — transformed source failed to parse:\n', err.message);
    process.exit(1);
  }
  fs.writeFileSync(file, out);
  console.log('applied and re-parsed OK ->', file);
}else{
  console.log('(dry run — pass --apply to write)');
}
