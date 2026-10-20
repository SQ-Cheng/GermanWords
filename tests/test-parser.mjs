import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// No DOM or Android globals: the parser must run independently of either client.
const context = vm.createContext({TextDecoder, Uint8Array, DataView, Blob, Response, DecompressionStream});
const parser = vm.runInContext(fs.readFileSync(path.join(root, 'shared/parser.js'), 'utf8') + '\nWordParser;', context);
const plain = value => JSON.parse(JSON.stringify(value));
const counts = [65, 54, 65, 71, 58, 60, 40, 47];
const books = fs.readdirSync(path.join(root, 'shared/words/german1')).filter(name => name.endsWith('.xlsx')).sort();
assert.equal(books.length, counts.length);
let total = 0;
for (const [index, name] of books.entries()) {
  const bytes = fs.readFileSync(path.join(root, 'shared/words/german1', name));
  const file = {arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)};
  const browser = parser.parseSheets(await parser.read(file));
  const native = parser.parseSheets(await parser.read(file, data => inflateRawSync(data)));
  assert.deepEqual(plain(browser), plain(native), name + ': browser/native decompression');
  assert.equal(browser.words.length, counts[index], name);
  assert.equal(browser.warnings.length, 0, name);
  total += browser.words.length;
}

const secondCourse = {'E1 单词汇总.xlsx':37, 'E2 单词汇总.xlsx':30, 'E3 单词汇总.xlsx':60,
  'E4 单词汇总.xlsx':46, 'E5 单词汇总.xlsx':34, 'E6 单词汇总.xlsx':21,
  'E9 单词汇总.xlsx':44, 'E10 单词汇总.xlsx':48, '虚词大盘点2.xlsx':61};
assert.deepEqual(fs.readdirSync(path.join(root,'shared/words/german2')).sort(), Object.keys(secondCourse).sort());
for (const [name, count] of Object.entries(secondCourse)) {
  const bytes = fs.readFileSync(path.join(root,'shared/words/german2',name));
  const file = {arrayBuffer:async () => bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  const browser = parser.parseSheets(await parser.read(file));
  const native = parser.parseSheets(await parser.read(file,data => inflateRawSync(data)));
  assert.deepEqual(plain(browser),plain(native),name);
  assert.equal(browser.words.length,count,name);
  assert.equal(browser.warnings.length,0,name);
  assert.equal(browser.words.every(word => !word.example && !word.pronounce),true);
}

// Reordered headers after a title, a blank row, multiple sheets and literal text.
const sparseRows = [
  ['Extra vocabulary'],
  ['中文', '德语', '例句', '词性', '冠词', '复数', '音频'],
  ['女孩', 'Mädchen', '<b>A & B</b>', '名词', 'DAS', '-', 'words\\E1\\Mädchen.mp3']
];
sparseRows[4] = ['', 'lernen'];
const parsed = plain(parser.parseSheets([
  {name: 'Extra', rows: sparseRows},
  {name: 'Fallback', rows: [['gehen', '走', '动词', '', '', 'einheit2/gehen.mp3']]},
  {name: 'Empty', rows: []}
]));
assert.deepEqual(parsed.words[0], {
  id: 'Extra#2', sheet: 'Extra', german: 'Mädchen', chinese: '女孩', type: '名词',
  gender: 'das', plural: '-', pronounce: 'words\\E1\\Mädchen.mp3', example: '<b>A & B</b>',
  unitPrefix: 'words/e1', marked: false
});
assert.equal(parsed.words[1].id, 'Extra#4');
assert.equal(parsed.words[1].german, 'lernen');
assert.equal(parsed.words[2].german, 'gehen');
assert.equal(parsed.words[2].chinese, '走');
assert.equal(parsed.sheets, 2);
assert.equal(parsed.warnings.length, 2);
assert.equal(parser.normPath('./WORDS\\MA\u0308DCHEN.MP3'), 'words/mädchen.mp3');
await assert.rejects(parser.read({arrayBuffer: async () => new ArrayBuffer(0)}), /不是有效的/);
await assert.rejects(parser.read({arrayBuffer: async () => new TextEncoder().encode('not a workbook').buffer}), /不是有效的/);
console.log(`PASS: ${total} words match through browser/native inflation; sparse rows, header aliases, fallback columns, multiple sheets, Unicode and invalid workbooks.`);
