import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const source=fs.readFileSync(new URL('../shared/playback.js',import.meta.url),'utf8');
function fixture(saved,blocked=false) {
  const storage=new Map([['german_playback_rate_v1',saved]]);
  const localStorage={getItem:key=>{if(blocked)throw Error();return storage.get(key);},setItem:(key,value)=>{if(blocked)throw Error();storage.set(key,value);}};
  const playback=vm.runInNewContext(source+'\nPlayback;',{localStorage});
  return {playback,storage};
}
assert.equal(fixture().playback.getRate(),1);
for(const rate of [0.75,1,1.25,1.5]) {
  const f=fixture();assert.equal(f.playback.setRate(rate),rate);
  assert.equal(fixture(f.storage.get('german_playback_rate_v1')).playback.getRate(),rate);
}
for(const value of ['bad',0,-1,2,Infinity,NaN])assert.equal(fixture(value).playback.getRate(),1);
assert.equal(fixture(undefined,true).playback.setRate(0.75),0.75);
console.log('PASS: supported speeds, persistence, invalid values and storage-unavailable fallback.');
