import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
function fixture(native = false) {
  const saved = new Map();
  let blocked = false, backup, resolveFile, rejectFile;
  const builtIn = [], requests = [];
  const elements = new Map();
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
    BuiltInLibrary:[{name:'built-in.xlsx',path:'words/german1/built-in.xlsx'}],
    fetch:url => { requests.push(url);return new Promise((resolve,reject) => {resolveFile=resolve;rejectFile=reject;}); },
    loadBuiltInFiles:async files => {builtIn.push(...files);},
    notify(){}, currentFileWords:[], currentFileName:'E1',
    refreshDisplayList(){}, changePlaybackRate(){},
    AppTheme:{getMode:() => 'dark', setMode(){}}, Playback:{getRate:() => 1.25}});
  vm.runInContext(source('shared/marks.js') + '\nconst store = MarkStore.create(() => {});', context);
  vm.runInContext(source('shared/library.js') + '\nconst library = StudyLibrary.create();', context);
  vm.runInContext(source('apps/web/backup.js'), context);
  vm.runInContext(source('apps/windows/frontend/desktop.js'), context);
  return {context, get, saved, builtIn, requests, block:value => blocked=value, backup:() => backup,
    resolve:() => resolveFile({ok:true,arrayBuffer:async () => new ArrayBuffer(3)}),
    reject:() => rejectFile(Error('read failed'))};
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
  assert.equal(f.get('openFeedback').hidden,false);
  assert.equal(f.requests.length,0,'the built-in catalogue is synchronous, with no startup fetch race');
  assert.equal(f.builtIn.length,1);
  const pending=f.builtIn[0].arrayBuffer();
  assert.equal(f.requests[0],'http://tauri.localhost/words/german1/built-in.xlsx');
  if (failure) {f.reject();await assert.rejects(pending,/read failed/);}
  else {f.resolve();assert.equal((await pending).byteLength,3);}
}
assert.throws(()=>vm.runInContext('restoreStudyBackup(backup.replace(' + JSON.stringify('"rate":1') + ',' + JSON.stringify('"rate":1,"course":"invalid"') + '))',f.context));
assert.equal(vm.runInContext("store.marks('E1')[0]",f.context),'restored');
console.log('PASS: desktop backups retain fallback storage/legacy format, validate courses; native catalogue has no asynchronous index race.');
