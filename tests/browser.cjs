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

      await page.locator('#playbackRate').selectOption('1.25');
      await page.reload();
      assert.equal(await page.locator('#playbackRate').inputValue(),'1.25','playback rate survives reload');
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
      await page.locator('#wordSearch').fill(' LERNEN ');
      assert.ok(await page.evaluate(()=>displayWords.length>0 && displayWords.every(w=>/lernen/i.test(w.german))));
      await page.locator('#wordSearch').fill('no-such-word-123');
      assert.equal(await page.evaluate(()=>displayWords.length),0);
      assert.equal(await page.locator('#cardGerman').innerText(),'未找到匹配单词');
      await page.locator('#wordSearch').fill('');
      assert.equal(await page.evaluate(()=>displayWords.length),65);
      assert.equal(await page.locator('#chineseArea').evaluate(el=>getComputedStyle(el).visibility),'visible','clearing a search restores the complete card');
      await page.evaluate(() => {
        document.getElementById('modeSelect').value='normal';
        changeMode();
        window.manualPlays=0;
        window.originalPlay=playPronounce;
        playPronounce=word=>{window.manualPlays++;window.originalPlay(word);};
      });
      await page.locator('#cardView').click();
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(()=>window.manualPlays),1,'normal card click replays once and cancels pending automatic audio');
      assert.equal(await page.evaluate(()=>!!currentAudio && !currentAudio.paused),true);
      assert.equal(await page.evaluate(()=>currentAudio.playbackRate),1.25);
      await page.locator('#playbackRate').selectOption('0.75');
      assert.equal(await page.evaluate(()=>currentAudio.playbackRate),0.75,'changing the setting updates active playback');
      await page.evaluate(()=>{playPronounce=window.originalPlay;});
      await page.evaluate(()=>{document.getElementById('modeSelect').value='test-zh';changeMode();});
      assert.equal(await page.evaluate(()=>currentAudio===null && document.getElementById('pronounceIcon').style.display==='none'),true,'Chinese self-test stops previous audio and conceals the speaker');
      await page.evaluate(()=>{toggleReveal();toggleReveal();});
      await page.waitForTimeout(150);
      assert.equal(await page.evaluate(()=>currentAudio===null && autoPlayTimer===null),true,'hiding an answer cancels queued pronunciation');
      await page.evaluate(()=>{document.getElementById('modeSelect').value='normal';changeMode();});
      await page.evaluate(() => { currentIndex=0; toggleCurrentMark(); toggleFilter(); });
      assert.equal(await page.evaluate(()=>displayWords.length),1);
      await page.evaluate(() => { toggleFilter(); switchView('list'); });
      assert.equal(await page.locator('#wordTable tbody tr').count(),65);
      await page.evaluate(()=>{document.getElementById('modeSelect').value='test-zh';changeMode();});
      const firstRow = page.locator('#wordTable tbody tr').first();
      assert.equal(await firstRow.locator('td').nth(0).innerText(),'');
      assert.equal(await firstRow.locator('td').nth(2).innerText(),'');
      assert.equal(await firstRow.locator('button[aria-label="播放发音"]').count(),0);
      await firstRow.locator('button[aria-label="星标单词"]').click();
      assert.equal(await firstRow.locator('td').nth(0).innerText(),'','list stars must not reveal an answer');
      await firstRow.locator('.list-answer').click();
      assert.ok(await firstRow.locator('td').nth(0).innerText());
      assert.equal(await page.locator('#wordTable tbody tr').nth(1).locator('td').nth(0).innerText(),'');
      await page.evaluate(()=>{document.getElementById('modeSelect').value='test-de';changeMode();});
      assert.equal(await firstRow.locator('td').nth(1).innerText(),'');
      await firstRow.focus();
      await page.keyboard.press('Enter');
      assert.ok(await firstRow.locator('td').nth(1).innerText());
      await page.evaluate(()=>{document.getElementById('modeSelect').value='normal';changeMode();});
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
      for (const checkbox of await page.locator('#fileList input').all()) await checkbox.uncheck();
      await page.locator('#fileList input').nth(0).check();
      assert.equal(await page.locator('#mixBooks').isDisabled(),true);
      await page.locator('#fileList input').nth(1).check();
      await page.locator('#mixBooks').click();
      await page.waitForFunction(()=>currentBookNames.length===2);
      assert.equal(await page.evaluate(()=>currentFileWords.length),119);
      const mixed = await page.evaluate(async () => {
        await loadBooks(Object.keys(fileMap));
        const count=currentFileWords.length;
        const ids=new Set(currentFileWords.map(w=>w.id)).size;
        const audio=currentFileWords.filter(w=>findAudioFile(w)).length;
        localStorage.setItem(STORAGE_KEY,'{}');currentFileWords.forEach(w=>w.marked=false);
        const duplicate=currentFileWords.find(w=>currentFileWords.some(other=>other.sourceBook!==w.sourceBook && other.german===w.german));
        toggleMark(duplicate);
        const isolated=!currentFileWords.some(w=>w.sourceBook!==duplicate.sourceBook && w.german===duplicate.german && w.marked);
        const stored=store.marks(duplicate.sourceBook).includes(duplicate.german);
        shuffleCurrentList();
        const order=displayWords.map(w=>w.id).join('|');
        searchWords('lernen');searchWords('');
        const preserved=displayWords.map(w=>w.id).join('|')===order;
        shuffleCurrentList();
        const original=displayWords.map(w=>w.id).join('|')===currentFileWords.map(w=>w.id).join('|');
        await loadFile(duplicate.sourceBook);
        const star=currentFileWords.some(w=>w.german===duplicate.german && w.marked);
        return {count,ids,audio,isolated,stored,preserved,original,star};
      });
      assert.deepEqual(mixed,{count:460,ids:460,audio:460,isolated:true,stored:true,preserved:true,original:true,star:true});
      assert.equal(await page.evaluate(async()=>{
        const names=Object.keys(fileMap);
        const previous=currentFileName;
        fileMap['broken.xlsx']={name:'broken.xlsx',arrayBuffer:async()=>new ArrayBuffer(0)};
        await loadBooks([names[0],'broken.xlsx']);
        const retained=currentFileName===previous;
        let finishSlow;
        fileMap['slow.xlsx']={name:'slow.xlsx',arrayBuffer:()=>new Promise(resolve=>finishSlow=resolve)};
        const pending=loadFile('slow.xlsx');
        await loadFile(names[1]);
        finishSlow(await fileMap[names[0]].arrayBuffer());
        await pending;
        delete fileMap['broken.xlsx'];delete fileMap['slow.xlsx'];
        return retained && currentFileName===names[1];
      }),true,'failed or obsolete mixed-book reads preserve the successful selection');
      await page.locator('input[webkitdirectory]').setInputFiles(path.resolve(words));
      assert.equal(await page.evaluate(()=>currentFileWords.length===0 && currentAudio===null && autoPlayTimer===null),true,'replacing a library clears old study data and cancels playback');
      assert.equal(await page.evaluate(()=>{
        const files=['left','right'].map(root=>{
          const file=new File(['fixture'],'lernen.mp3');
          Object.defineProperty(file,'webkitRelativePath',{value:'import/'+root+'/einheit1/lernen.mp3'});
          return file;
        });
        const books=['left','right'].map(root=>({name:'E1.xlsx',webkitRelativePath:'import/'+root+'/E1.xlsx'}));
        buildAudioIndex([...files,...books]);
        return ['left','right'].every((root,index)=>findAudioFile({german:'lernen',pronounce:'words/einheit1/lernen.mp3',sourceRoot:'import/'+root})===files[index]);
      }),true,'same-name imported recordings stay within the matching source folder');
      assert.deepEqual(errors,[]);
      console.log(`PASS: ${html}: 460 words/audio, checkbox mixing, unique IDs, source-aware stars/audio, reversible shuffle/search, normal card replay, live/persisted playback speed, self-test, list, keyboard and themes`);
      await page.screenshot({path:'artifacts/windows-dark.png'});
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
