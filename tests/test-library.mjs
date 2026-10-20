import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const saved = new Map();
let blocked = false;
const context = vm.createContext({TextDecoder, localStorage:{
  getItem:key => saved.get(key), setItem(key,value) { if (blocked) throw Error('blocked'); saved.set(key,value); }
}});
for (const name of ['parser','vocabulary','audio','library'])
  vm.runInContext(fs.readFileSync(new URL('../shared/'+name+'.js',import.meta.url),'utf8'),context);
const {library, audio} = vm.runInContext('({library:StudyLibrary, audio:WordAudio})',context);
const files = [];
for (const [course,names] of [['german1',['E1_单词汇总.xlsx','E2_单词汇总.xlsx']],['german2',['E1 单词汇总.xlsx','E10 单词汇总.xlsx','E2 单词汇总.xlsx','虚词大盘点2.xlsx']]])
  files.push(...names.map(name=>({name,webkitRelativePath:'words/'+course+'/'+name})));
const firstRecording={name:'und.mp3',webkitRelativePath:'words/german1/empty_words/und.mp3'};
files.push(firstRecording);
const catalogue=library.create(); catalogue.setBuiltIn(files);
assert.equal(catalogue.current().id,'german1');
assert.deepEqual(Array.from(catalogue.entries(),entry=>entry.key),['E1_单词汇总.xlsx','E2_单词汇总.xlsx']);
const custom=[
  {name:'E1_单词汇总.xlsx',webkitRelativePath:'mine/E1_单词汇总.xlsx'},
  {name:'E1 单词汇总.xlsx',webkitRelativePath:'mine/E1 单词汇总.xlsx'},
  {name:'Custom.xlsx',webkitRelativePath:'first/Custom.xlsx'},
  {name:'Custom.xlsx',webkitRelativePath:'second/Custom.xlsx'}
];
catalogue.setImported(custom);
const keys=Array.from(catalogue.entries().filter(entry=>entry.imported),entry=>entry.key);
assert.deepEqual(new Set(keys),new Set(['E1_单词汇总.xlsx · mine/E1_单词汇总.xlsx','E1 单词汇总.xlsx','Custom.xlsx','Custom.xlsx · second/Custom.xlsx']));
for (const course of ['german2','german1','german2']) {
  catalogue.select(course);
  assert.deepEqual(Array.from(catalogue.entries().filter(entry=>entry.imported),entry=>entry.key),keys);
  assert.equal(new Set(catalogue.entries().map(entry=>entry.key)).size,catalogue.entries().length);
}
assert.deepEqual(Array.from(catalogue.entries().filter(entry=>!entry.imported),entry=>entry.key),[
  '@course:german2:E1 单词汇总.xlsx','@course:german2:E2 单词汇总.xlsx','@course:german2:E10 单词汇总.xlsx','@course:german2:虚词大盘点2.xlsx'
]);
assert.equal(catalogue.entries().find(entry=>entry.key==='Custom.xlsx').file,custom[2],'native File objects retain their methods and identity');
assert.equal(library.create().current().id,'german2','selection survives restart');
catalogue.select('invalid'); assert.equal(catalogue.current().id,'german2');
blocked=true; catalogue.select('german1'); assert.equal(catalogue.current().id,'german1'); blocked=false;
assert.throws(()=>catalogue.setBuiltIn([{name:'unknown.xlsx'}]));
assert.equal(catalogue.entries().length,6,'failed resource replacement keeps the valid catalogue');
catalogue.setBuiltIn(files); assert.deepEqual(Array.from(catalogue.entries().filter(entry=>entry.imported),entry=>entry.key),keys);
const all=catalogue.files(), index=audio.build(all);
assert.equal(audio.find({german:'und',sourceRoot:'words/german1'},index).name,'und.mp3');
assert.equal(audio.find({german:'und',sourceRoot:'words/german2'},index),null,'missing recordings never borrow another built-in course');
const userRecording={name:'und.mp3',webkitRelativePath:'my-recordings/und.mp3'};
assert.equal(audio.find({german:'und',sourceRoot:'words/german2'},audio.build(all.concat(userRecording))),userRecording,'user recording imports can supplement either course');
assert.equal(library.title({name:'E10 单词汇总.xlsx'}),'E10');
saved.set(library.storageKey,'invalid'); assert.equal(library.create().current().id,'german1');
console.log('PASS: course visibility, stable legacy/import keys, collisions, restart/storage fallback, numeric unit order and isolated recording sources.');
