import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../shared/marks.js', import.meta.url), 'utf8');
let raw = '{}', blocked = false, warnings = 0;
const localStorage = {
  getItem() { if (blocked) throw Error('blocked'); return raw; },
  setItem(key, value) { if (blocked) throw Error('blocked'); raw = value; }
};
const api = vm.runInNewContext(source + '\nMarkStore;', {localStorage});
const store = api.create(() => warnings++);
store.setMark('E1', 'lernen', true);
store.setMark('E1', 'lernen', true);
assert.equal(store.marks('E1').join('|'), 'lernen');
assert.equal(store.marks('E2').length, 0);
store.setMark('E2', 'lernen', true);
store.setMark('E1', 'lernen', false);
assert.equal(store.marks('E1').length, 0);
assert.equal(store.marks('E2').join('|'), 'lernen');
raw = JSON.stringify({E1:['externally restored']});
assert.equal(store.marks('E1')[0], 'externally restored');
blocked = true;
store.setMark('E1', 'session only', true);
assert.equal(store.marks('E1').join('|'), 'externally restored|session only');
assert.equal(warnings, 1);
blocked = false;
for (const invalid of ['[]', 'null', '{bad json']) {
  raw = invalid;
  const clean = api.create(() => warnings++);
  clean.setMark('__proto__', 'safe', true);
  assert.equal(clean.marks('__proto__')[0], 'safe');
  assert.equal(Object.prototype.safe, undefined);
}
console.log('PASS: per-book stars, legacy JSON, live restore, storage failure fallback and malformed input.');
