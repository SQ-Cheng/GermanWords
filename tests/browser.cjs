const {chromium} = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');

process.chdir(path.resolve(__dirname,'..'));

(async () => {
  const browser = await chromium.launch({headless:true, channel:'msedge'});
  try {
    for (const [html, words] of [
      ['apps/windows/De_words_helper.html','shared/words'],
      ['output/windows/De_words_helper.html','output/windows/words']
    ]) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.resolve(html)).href);
      assert.equal(await page.evaluate(() => typeof WordParser.read), 'function');
      await page.emulateMedia({colorScheme:'dark'});
      await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
      assert.equal(await page.locator('.sidebar').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(32, 42, 36)','dark mode also paints the actual sidebar');
      await page.locator('#themeSelect').selectOption('light');
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');
      await page.emulateMedia({colorScheme:'light'});
      await page.locator('#themeSelect').selectOption('dark');
      await page.reload();
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
      assert.equal(await page.locator('#themeSelect').inputValue(),'dark');
      await page.locator('#themeSelect').selectOption('auto');
      await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
      await page.emulateMedia({colorScheme:'dark'});
      await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');

      await page.locator('input[webkitdirectory]').setInputFiles(path.resolve(words));
      await page.waitForFunction(() => Object.keys(fileMap).length === 8);
      const totals = await page.evaluate(async () => {
        let words = 0, audio = 0;
        for (const name of Object.keys(fileMap)) {
          await loadFile(name);
          words += currentFileWords.length;
          audio += currentFileWords.filter(word => findAudioFile(word)).length;
        }
        return {words,audio};
      });
      assert.deepEqual(totals, {words:460,audio:460});
      await page.evaluate(async () => {
        await loadFile(Object.keys(fileMap)[0]);
        document.getElementById('modeSelect').value = 'test-zh';
        changeMode();
      });
      assert.equal(await page.locator('#germanArea').evaluate(el=>el.classList.contains('hidden-content')), true);
      await page.locator('#cardView').click();
      assert.equal(await page.locator('#germanArea').evaluate(el=>el.classList.contains('hidden-content')), false);
      await page.evaluate(() => { currentIndex=0; toggleCurrentMark(); toggleFilter(); });
      assert.equal(await page.evaluate(()=>displayWords.length),1);
      await page.evaluate(() => { toggleFilter(); switchView('list'); });
      assert.equal(await page.locator('#wordTable tbody tr').count(),65);
      await page.evaluate(() => switchView('card'));
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.evaluate(()=>currentIndex),1);
      const played = await page.evaluate(async () => {
        const source = audioSource(displayWords[currentIndex]);
        const player = new Audio(source.url);
        await player.play();
        const playing = !player.paused;
        player.pause();
        return playing;
      });
      assert.equal(played,true);
      assert.deepEqual(errors,[]);
      console.log(`PASS: ${html}: local scripts, folder import, 460 words/audio matches, card self-test, stars, list, keyboard, audio playback and auto/light/dark themes with persistence`);
      await page.screenshot({path:'artifacts/windows-dark.png'});
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
