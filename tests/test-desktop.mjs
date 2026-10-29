import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
function fixture(native = false, options = {}) {
  const saved = new Map(options.saved || []), calls = [];
  let blocked = false, backup, resolveFile, rejectFile;
  const builtIn = [], requests = [];
  const elements = new Map();
  const get = id => {
    if (!elements.has(id)) elements.set(id, {dataset:{default:'beta'},addEventListener(){}, close(){this.open=false;}, showModal(){this.open=true;}, disabled:false});
    return elements.get(id);
  };
  const localStorage = {getItem:key => saved.get(key) || null,
    setItem(key, value) { if (blocked) throw Error('quota'); saved.set(key, value); }};
  const context = vm.createContext({Feedback:{setSender(){}},window:{__TAURI__:native ? {core:{invoke:async (name,args) => {calls.push({name,args});return options.invoke ? options.invoke(name,args) : null;}}} : undefined},
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
  return {context, get, saved, builtIn, requests, calls, block:value => blocked=value, backup:() => backup,
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

const settle=()=>new Promise(resolve=>setImmediate(resolve));
const channels=fixture(true,{saved:[['german_update_channel','beta'],['german_update_channel_confirmed','true']]});
await settle();
assert.equal(channels.get('updateChannelSetting').hidden,false);
assert.equal(channels.calls[0].args.channel,'beta');
assert.equal(channels.saved.get('german_update_channel'),'beta');
channels.get('updateChannel').value='stable';
channels.get('updateChannel').onchange();
await settle();
assert.equal(channels.calls.at(-1).args.channel,'stable');
assert.equal(channels.saved.get('german_update_channel'),'stable');
assert.ok(channels.saved.has('german_update_check_beta') && channels.saved.has('german_update_check_stable'));
assert.equal(channels.get('updateStatus').textContent,'当前无需升级正式版');
channels.block(true);
channels.get('updateChannel').value='beta';
channels.get('updateChannel').onchange();
assert.equal(channels.get('updateChannel').value,'stable','failed persistence does not silently switch channel');
const savedChannel=fixture(true,{saved:[['german_update_channel','stable'],['german_update_channel_confirmed','true'],['german_update_check_stable',String(Date.now())]]});
await settle();
assert.equal(savedChannel.get('updateChannel').value,'stable');
assert.equal(savedChannel.calls.length,0,'a successful check is throttled only for its own channel');
const prompted=fixture(true,{saved:[['german_update_channel','beta'],['german_update_channel_confirmed','true']],invoke:async()=>({version:'4.2.1',notes:'test'})});
await settle();
assert.equal(prompted.get('updateDialog').open,true);
prompted.get('updateChannel').value='stable';
prompted.get('updateChannel').onchange();
assert.equal(prompted.get('updateDialog').open,false,'switching closes the previous channel prompt');
await settle();
assert.equal(prompted.calls.at(-1).args.channel,'stable');
console.log('PASS: native update channel selection, persistence, per-channel throttling and prompt invalidation.');

for(const existing of [[],[['german_update_channel','beta']]]) {
  for(const [button,expected] of [['acceptBetaUpdates','beta'],['declineBetaUpdates','stable']]) {
    const first=fixture(true,{saved:existing});
    await settle();
    assert.equal(first.calls.length,0,'no update check before an explicit initial choice');
    assert.equal(first.get('updateChannelDialog').open,true,'new installs and old implicit defaults both ask once');
    first.get(button).onclick();
    await settle();
    assert.equal(first.get('updateChannelDialog').open,false);
    assert.equal(first.saved.get('german_update_channel'),expected);
    assert.equal(first.saved.get('german_update_channel_confirmed'),'true');
    assert.equal(first.calls[0].args.channel,expected);
    const restarted=fixture(true,{saved:[...first.saved]});
    await settle();
    assert.notEqual(restarted.get('updateChannelDialog').open,true,'explicit choice is not asked again after restart');
    assert.equal(restarted.get('updateChannel').value,expected);
  }
}
const failedChoice=fixture(true);
failedChoice.block(true);
failedChoice.get('acceptBetaUpdates').onclick();
await settle();
assert.equal(failedChoice.get('updateChannelDialog').open,true,'failed persistence leaves the question open');
assert.equal(failedChoice.calls.length,0);
failedChoice.get('updateChannelDialog').close();
assert.equal(failedChoice.saved.has('german_update_channel_confirmed'),false,'dismissing the question does not confirm a channel');
await vm.runInContext('Desktop.checkUpdates(true)',failedChoice.context);
assert.equal(failedChoice.get('updateChannelDialog').open,true,'manual checking offers the unanswered question again');
assert.equal(failedChoice.calls.length,0);
console.log('PASS: first-use yes/no prompt, migration from implicit defaults, no network before consent, persistence and failed-save retry.');
