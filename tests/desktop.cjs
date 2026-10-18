// Run against the actual Tauri WebView2, launched with a local CDP port for testing.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.connectOverCDP(process.argv[2] || 'http://127.0.0.1:9223');
  try {
    const page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('tauri.localhost'));
    assert.ok(page, 'Actual Tauri window is required');
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => typeof currentFileWords !== 'undefined' && currentFileWords.length > 0);
    assert.equal(await page.evaluate(() => !!window.__TAURI__), true);
    assert.equal(await page.evaluate(() => window.__TAURI__.app.getVersion()), require('../shared/app-config.json').versionName);
    assert.equal(await page.locator('#appVersion').textContent(), ' · ' + require('../shared/app-config.json').versionName);
    const initial = await page.evaluate(() => ({marks:localStorage.getItem(MarkStore.key), theme:localStorage.getItem('german_theme_v1'), rate:Playback.getRate()}));
    try {
      const totals = await page.evaluate(async () => {
        let words = 0, audio = 0;
        for (const name of Object.keys(fileMap)) {
          await loadFile(name);
          words += currentFileWords.length;
          audio += currentFileWords.filter(word => findAudioFile(word)).length;
        }
        await loadFile(Object.keys(fileMap)[0]);
        return {words, audio};
      });
      assert.deepEqual(totals, {words:460, audio:460});
      await page.locator('#themeSelect').selectOption('dark');
      await page.locator('#playbackRate').selectOption('1.25');
      await page.evaluate(() => { if (displayWords[currentIndex].marked) toggleCurrentMark(); });
      await page.locator('.star-mark').click();
      await page.locator('#cardView').click();
      await page.waitForFunction(() => currentAudio && !currentAudio.paused && currentAudio.readyState >= 2);
      assert.equal(await page.evaluate(() => currentAudio.playbackRate), 1.25);
      await page.evaluate(() => pauseStudyAudio());
      const download = page.waitForEvent('download');
      await page.locator('#exportBackup').click();
      const file = await download;
      await file.saveAs(require('node:path').resolve(__dirname, '../tmp/desktop-backup.json'));
      const backup = JSON.parse(require('node:fs').readFileSync(await file.path(), 'utf8'));
      assert.equal(backup.format, 'GermanWords-Windows');
      assert.equal(backup.theme, 'dark');
      assert.equal(backup.rate, 1.25);
      assert.equal(Object.values(backup.marks).some(words => words.length > 0), true);
      const before = await page.evaluate(() => localStorage.getItem(MarkStore.key));
      await page.evaluate(() => {
        window.assertBackupRejected = false;
        try { restoreWindowsBackup('{"format":"GermanWords-Windows","version":1,"marks":{"E1":[42]},"theme":"light","rate":1}'); }
        catch (_) { window.assertBackupRejected = true; }
      });
      assert.equal(await page.evaluate(() => assertBackupRejected), true);
      assert.equal(await page.evaluate(() => localStorage.getItem(MarkStore.key)), before);
      await page.evaluate(raw => {
        localStorage.setItem(MarkStore.key, '{}');
        restoreWindowsBackup(raw);
      }, JSON.stringify(backup));
      assert.equal(await page.evaluate(() => localStorage.getItem(MarkStore.key)), before);
      await page.reload();
      await page.waitForFunction(() => currentFileWords.length > 0);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
      assert.equal(await page.locator('#playbackRate').inputValue(), '1.25');
      assert.equal(await page.evaluate(() => localStorage.getItem(MarkStore.key)), before);
      await page.locator('#themeSelect').selectOption('light');
      for (const width of [1120, 800, 640, 480]) {
        await page.setViewportSize({width, height:720});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.equal(await page.evaluate(() => ['.star-mark','.pronounce-icon','.nav-btn'].every(selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return Math.abs(r.width-r.height) <= 1;
        })), true);
        if (width <= 800) {
          await page.locator('#openLibrary').click();
          await page.locator('#themeSelect').selectOption('dark');
          await page.locator('#closeLibrary').click();
          assert.equal(await page.evaluate(() => document.body.classList.contains('library-open')), false);
        }
        await page.screenshot({path:require('node:path').resolve(__dirname, `../artifacts/desktop-${width}.png`)});
      }
      await page.locator('#openLibrary').click();
      await page.locator('#openFeedback').click();
      assert.equal(await page.locator('#feedbackDialog').evaluate(el => el.open), true);
      assert.equal(await page.evaluate(() => document.body.classList.contains('library-open')), false);
      await page.locator('#feedbackCancel').click();
      assert.deepEqual(errors, []);
      console.log('PASS: real Tauri WebView2, built-in 460 words/audio, backup download/validation/restore, retained data after reload, themes, 480–1120px, drawer, circular controls');
    } finally {
      await page.evaluate(value => {
        if (value.marks === null) localStorage.removeItem(MarkStore.key); else localStorage.setItem(MarkStore.key, value.marks);
        AppTheme.setMode(value.theme || 'auto');
        changePlaybackRate(value.rate);
        pauseStudyAudio();
      }, initial);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
