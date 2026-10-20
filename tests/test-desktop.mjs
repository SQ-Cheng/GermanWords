import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
function fixture(native = false) {
  const saved = new Map();
  let blocked = false, backup, resolveIndex, rejectIndex;
  const elements = new Map(), imports = [], notices = [];
  const get = id => {
    if (!elements.has(id)) elements.set(id, {addEventListener(){}, close(){}, showModal(){}, disabled:false});
    return elements.get(id);
  };
  const localStorage = {getItem:key => saved.get(key) || null,
    setItem(key, value) { if (blocked) throw Error('quota'); saved.set(key, value); }};
  const context = vm.createContext({Feedback:{setSender(){}},window:{__TAURI__:native ? {core:{invoke:async () => null}} : undefined},
    localStorage, document:{getElementById:get, createElement:() => ({click(){}})},
    Blob:class {constructor(parts) { backup = JSON.parse(parts[0]); }},
    URL:class extends URL {static createObjectURL() {return 'blob:backup';} static revokeObjectURL(){}},
    setTimeout(){}, location:{href:'http://tauri.localhost/'},
    fetch:() => new Promise((resolve,reject) => {resolveIndex=resolve;rejectIndex=reject;}),
    notify:message => notices.push(message), currentFileWords:[], currentFileName:'E1', loadSequence:0,
    handleFiles(files) {imports.push(files[0].name);context.loadSequence++;context.fileMap={[files[0].name]:files[0]};},
    loadFile:async () => {}, refreshDisplayList(){}, changePlaybackRate(){},
    AppTheme:{getMode:() => 'dark', setMode(){}}, Playback:{getRate:() => 1.25}});
  vm.runInContext(source('shared/marks.js') + '\nconst store = MarkStore.create(() => {});', context);
  vm.runInContext(source('apps/web/backup.js'), context);
  vm.runInContext(source('apps/windows/frontend/desktop.js'), context);
  return {context, imports, notices, get, saved, block:value => blocked=value, backup:() => backup,
    resolve:() => resolveIndex({ok:true,json:async () => [{name:'built-in.xlsx',path:'words/built-in.xlsx'}]}),
    reject:() => rejectIndex(Error('late failure'))};
}

const f = fixture();
f.block(true);
vm.runInContext("store.setMark('E1','new',true);exportStudyBackup()", f.context);
assert.deepEqual(f.backup().marks, {E1:['new']});
assert.equal(f.backup().theme, 'dark');
assert.equal(f.backup().rate, 1.25);
f.block(false);
const backup = JSON.stringify({format:'GermanWords-Windows',version:1,marks:{E1:['restored']},theme:'auto',rate:1});
f.context.backup = backup;
vm.runInContext('restoreStudyBackup(backup)', f.context);
assert.equal(vm.runInContext("store.marks('E1')[0]",f.context),'restored');
assert.equal(JSON.parse(f.saved.get('german_app_memory')).E1[0], 'restored');
assert.throws(() => vm.runInContext('restoreStudyBackup(backup.replace("auto","invalid"))', f.context));
assert.equal(vm.runInContext("store.marks('E1')[0]",f.context),'restored');

for (const failure of [false,true]) {
  const f = fixture(true);
  f.context.handleFiles([{name:'user.xlsx'}]);
  if (failure) f.reject(); else f.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.imports,['user.xlsx']);
  assert.deepEqual(f.notices,[]);
}
const initial = fixture(true);
assert.equal(initial.get('openFeedback').hidden, false, 'Native host exposes feedback');
initial.resolve();
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(initial.imports,['built-in.xlsx']);
console.log('PASS: desktop backups use fallback storage; stale built-in success/failure cannot replace user imports.');
