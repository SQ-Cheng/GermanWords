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
