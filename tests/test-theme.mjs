import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source = fs.readFileSync(new URL('../shared/theme.js', import.meta.url), 'utf8');
function fixture(saved, blocked = false) {
  const storage = new Map(saved === undefined ? [] : [['german_theme_v1', saved]]);
  const document = new EventTarget();
  document.documentElement = {dataset: {}};
  const select = {value: ''};
  document.getElementById = () => select;
  const media = new EventTarget();
  media.matches = true;
  const localStorage = {
    getItem: key => { if (blocked) throw new Error('blocked'); return storage.get(key); },
    setItem: (key, value) => { if (blocked) throw new Error('blocked'); storage.set(key, value); }
  };
  const theme = vm.runInNewContext(source + '\nAppTheme;', {document, localStorage, matchMedia: () => media, CustomEvent});
  return {theme, document, media, storage, select};
}

const f = fixture();
assert.equal(f.document.documentElement.dataset.theme, 'dark', 'default follows the dark system');
assert.equal(f.select.value, 'auto');
assert.equal(f.theme.getMode(), 'auto');
f.media.matches = false;
f.media.dispatchEvent(new Event('change'));
assert.equal(f.document.documentElement.dataset.theme, 'light');
f.theme.setMode('dark');
assert.equal(f.theme.getMode(), 'dark');
f.media.dispatchEvent(new Event('change'));
assert.equal(f.document.documentElement.dataset.theme, 'dark', 'manual choice overrides the system');
assert.equal(f.storage.get('german_theme_v1'), 'dark');
assert.equal(fixture(f.storage.get('german_theme_v1')).select.value, 'dark', 'choice survives reload');
f.theme.setMode('light');
f.theme.setSystemDark(true);
assert.equal(f.document.documentElement.dataset.theme, 'light');
f.theme.setMode('auto');
assert.equal(f.document.documentElement.dataset.theme, 'dark', 'Android system override is honored');
f.theme.setSystemDark(false);
assert.equal(f.document.documentElement.dataset.theme, 'light');
assert.equal(fixture('invalid').select.value, 'auto');
const blocked = fixture(undefined, true);
blocked.theme.setMode('light');
assert.equal(blocked.document.documentElement.dataset.theme, 'light', 'blocked storage still allows a session choice');
console.log('PASS: auto/light/dark, system changes, Android override, persistence, invalid preferences and blocked storage.');
