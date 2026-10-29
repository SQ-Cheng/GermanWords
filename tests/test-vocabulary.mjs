import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../shared/vocabulary.js',import.meta.url),'utf8');
const vocabulary=vm.runInNewContext(source+'\nVocabulary;');
const word={german:'GRÜẞEN',chinese:'问候'};
for(const query of ['', ' grussen ', 'GRÜSS', 'gru\u0308', '问候'])assert.ok(vocabulary.matches(word,query),query);
assert.equal(vocabulary.matches(word,'lernen'),false);
assert.equal(vocabulary.matches({german:'<b>literal</b>'},'<b>'),true);
console.log('PASS: German/Chinese search, case, whitespace, decomposed Unicode, umlauts and sharp s.');

const parser={
  normPath:value=>value.toLowerCase(),
  read:async file=>file.words,
  parseSheets:words=>({words,warnings:[]})
};
const mixed=vm.runInNewContext(source+'\nVocabulary;',{WordParser:parser});
const files={A:{name:'A.xlsx',root:'one',words:[{id:'Sheet#1',german:'lernen'}]},B:{name:'B.xlsx',root:'two',words:[{id:'Sheet#1',german:'lernen'}]}};
const single=await mixed.readBooks(files,['A']);
assert.equal(single.words[0].id,'Sheet#1','single-book IDs remain compatible with existing progress');
const result=await mixed.readBooks(files,['A','B']);
assert.equal(new Set(result.words.map(w=>w.id)).size,2);
assert.deepEqual(Array.from(result.words,w=>w.sourceBook),['A','B']);
assert.deepEqual(Array.from(result.words,w=>w.sourceRoot),['one','two']);
assert.equal(files.A.words[0].sourceBook,undefined,'source parser output is not mutated');
assert.equal(mixed.selectionKey(['A']),'A');
assert.notEqual(mixed.selectionKey(['A','B']),mixed.selectionKey(['AB']));
await assert.rejects(()=>mixed.readBooks(files,['A','missing']),/不存在/);
await assert.rejects(()=>mixed.readBooks({Empty:{name:'empty.xlsx',words:[]}},['Empty']),/没有读到单词/);
console.log('PASS: mixed-book identity/source isolation, legacy single-book IDs, non-mutating enrichment and invalid-book errors.');

const a={id:'a',marked:true}, b={id:'b',marked:false}, c={id:'c',marked:true};
for(const [words,current,target,expected,expectedIndex] of [
  [[a,b,c],1,2,[a,c],1],
  [[a,b,c],1,0,[a,c],0],
  [[b,c],0,1,[c],0],
  [[a,b],1,2,[a],0],
  [[b],0,1,[],0],
  [[a,b,c],0,1,[a,c],1],
]) {
  const result=vocabulary.navigate(words,current,target,true);
  assert.deepEqual(Array.from(result.words),expected);
  assert.equal(result.index,expectedIndex);
}
assert.equal(vocabulary.navigate([a,b,c],0,1,false).words.length,3,'normal mode retains unstarred words');
assert.equal(vocabulary.navigate([a,b,c],0,1,false).index,1);
console.log('PASS: deferred star removal retains next/previous identity, skips unstarred targets and handles the last card.');
