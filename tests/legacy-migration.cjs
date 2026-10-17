const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

(async () => {
  const root = path.resolve(__dirname, '..');
  const folder = path.join(root, 'tmp/legacy-migration-test');
  fs.cpSync(path.join(root, 'output/windows/web'), folder, {recursive:true});
  const html = path.join(folder, 'De_words_helper.html');
  fs.writeFileSync(html, '<!doctype html><title>Existing Windows installation</title>');
  const browser = await chromium.launch({headless:true, channel:'msedge'});
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(html).href);
    const marks = {'E1_单词汇总.xlsx':['lernen', 'gut']};
    await page.evaluate(marks => {
      localStorage.setItem('german_app_memory', JSON.stringify(marks));
      localStorage.setItem('german_theme_v1', 'dark');
      localStorage.setItem('german_playback_rate_v1', '0.75');
    }, marks);
    fs.copyFileSync(path.join(root, 'output/windows/web/index.html'), html);
    await page.reload();
    const downloaded = page.waitForEvent('download');
    await page.locator('#exportBackup').click();
    const backup = JSON.parse(fs.readFileSync(await (await downloaded).path(), 'utf8'));
    assert.deepEqual(backup.marks, marks);
    assert.equal(backup.theme, 'dark');
    assert.equal(backup.rate, 0.75);
    console.log('PASS: replacing the HTML at its original file:// path preserves and exports legacy browser stars/settings');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
