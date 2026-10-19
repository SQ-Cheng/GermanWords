const {chromium} = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');

process.chdir(path.resolve(__dirname,'..'));

(async () => {
  const browser = await chromium.launch({headless:true, channel:'msedge'});
  try {
    for (const [html, words] of [
      ['apps/windows/frontend/index.html','shared/words'],
      ['output/windows/web/index.html','output/windows/web/words']
    ]) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.resolve(html)).href);
      assert.equal(await page.locator('#appVersion').textContent(), html.startsWith('output/') ? ' · ' + require('../shared/app-config.json').versionName : '');
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
      for (const size of [{width:1280,height:900},{width:960,height:640},{width:480,height:720}]) {
        await page.setViewportSize(size);
        const misplaced = await page.evaluate(async () => {
          const failures = [];
          for (const name of Object.keys(fileMap)) {
            await loadFile(name);
            for (currentIndex = 0; currentIndex < displayWords.length; currentIndex++) {
              renderCard();
              const card = document.getElementById('cardView');
              const bounds = card.getBoundingClientRect(), style = getComputedStyle(card);
              const top = document.getElementById('germanArea').getBoundingClientRect().top - bounds.top - parseFloat(style.borderTopWidth) - parseFloat(style.paddingTop);
              const bottom = bounds.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom) - document.getElementById('clickHint').getBoundingClientRect().bottom;
              if (card.scrollHeight <= card.clientHeight + 1 && Math.abs(top - bottom) > 2)
                failures.push(displayWords[currentIndex].german);
              if (top < -1) failures.push('clipped: ' + displayWords[currentIndex].german);
            }
          }
          pauseStudyAudio();
          return failures;
        });
        assert.deepEqual(misplaced, [], `card content stays centered and its beginning remains reachable at ${size.width}×${size.height}`);
      }
      await page.setViewportSize({width:1280,height:720});
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
      const playbackFailures = await page.evaluate(async () => {
        pauseStudyAudio();
        const NativeAudio = window.Audio, originalNotify = notify, messages = [];
        window.Audio = class {
          constructor() { this.handlers = {}; }
          addEventListener(type, handler) { this.handlers[type] = handler; }
          play() { return new Promise((resolve, reject) => { this.reject = reject; }); }
          pause() {}
        };
        notify = (message, kind) => messages.push({message, kind});
        try {
          const word = displayWords[currentIndex];
          playPronounce(word);
          const old = currentAudio;
          playPronounce(word);
          const active = currentAudio;
          old.reject(new DOMException('stale playback', 'NotAllowedError'));
          old.handlers.error();
          await Promise.resolve();
          const staleIgnored = !messages.length && currentAudio === active;
          active.reject(new DOMException('cancelled playback', 'AbortError'));
          await Promise.resolve();
          const abortIgnored = !messages.length && currentAudio === null;
          playPronounce(word);
          currentAudio.reject(new DOMException('blocked playback', 'NotAllowedError'));
          await Promise.resolve();
          const permissionHint = messages.length === 1 && messages[0].kind === 'warn' && messages[0].message.includes('点击卡片');
          messages.length = 0;
          playPronounce(word);
          currentAudio.reject(new DOMException('unsupported media', 'NotSupportedError'));
          await Promise.resolve();
          const otherFailure = messages.length === 1 && messages[0].kind === 'error' && !messages[0].message.includes('自动播放');
          messages.length = 0;
          playPronounce(word);
          const broken = currentAudio;
          broken.handlers.error();
          broken.reject(new DOMException('load failed', 'NotSupportedError'));
          await Promise.resolve();
          return {staleIgnored, abortIgnored, permissionHint, otherFailure,
            singleLoadError:messages.length === 1 && messages[0].kind === 'error'};
        } finally {
          pauseStudyAudio();
          window.Audio = NativeAudio;
          notify = originalNotify;
        }
      });
      assert.deepEqual(playbackFailures, {staleIgnored:true, abortIgnored:true, permissionHint:true, otherFailure:true, singleLoadError:true});
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
      const markedBeforeSpace = await page.evaluate(()=>currentFileWords[0].marked);
      await firstRow.focus();
      await page.keyboard.press('Space');
      assert.equal(await page.evaluate(()=>currentFileWords[0].marked),!markedBeforeSpace,'row space must toggle a star exactly once');
      assert.equal(await firstRow.locator('.list-answer').evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap','list answer labels stay on one line');
      assert.equal(await firstRow.locator('button[aria-label="星标单词"]').evaluate(el=>{const r=el.getBoundingClientRect();return r.width===r.height;}),true,'Windows list icon buttons are circular');
      await page.screenshot({path:'artifacts/windows-list-self-test.png'});
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
      await page.evaluate(async () => { await loadFile(Object.keys(fileMap)[0]); switchView('card'); currentIndex=0; updateUI(); });
      assert.equal(await page.locator('#btnPrevCard').isDisabled(),true);
      await page.locator('#btnNextCard').click();
      assert.equal(await page.evaluate(()=>currentIndex),1);
      await page.locator('#btnPrevCard').click();
      assert.equal(await page.evaluate(()=>currentIndex),0);
      await page.evaluate(()=>{currentIndex=displayWords.length-1;updateUI();});
      assert.equal(await page.locator('#btnNextCard').isDisabled(),true);
      await page.evaluate(()=>{switchView('list');prevCard();});
      assert.equal(await page.locator('#cardIndexInfo').innerText(),'64 / 65');
      await page.evaluate(()=>{
        window.feedbackCalls=[];
        Feedback.setSender(async message=>{feedbackCalls.push(message);throw new Error('private service URL');});
        document.getElementById('openFeedback').hidden = false; // Test the form with a mock native transport.
      });
      await page.locator('#openFeedback').click();
      assert.equal(await page.locator('#feedbackDescription').innerText(), '提交时会附带时间、应用版本及基本设备信息，不包含词库、学习记录或文件。请勿填写密码等敏感信息。', 'Windows feedback description remains unchanged');
      assert.equal(await page.evaluate(()=>feedbackCalls.length),0);
      await page.locator('#feedbackMessage').fill('  test feedback <b>literal</b>  ');
      await page.locator('#feedbackSubmit').click();
      await page.waitForFunction(()=>document.getElementById('feedbackStatus').textContent.includes('提交失败'));
      assert.equal(await page.locator('#feedbackMessage').inputValue(),'  test feedback <b>literal</b>  ');
      assert.equal(await page.locator('#feedbackStatus').innerText().then(text=>text.includes('private')),false);
      await page.evaluate(()=>Feedback.setSender(async message=>feedbackCalls.push(message)));
      await page.locator('#feedbackSubmit').click();
      await page.waitForFunction(()=>document.getElementById('feedbackStatus').textContent.includes('已提交'));
      assert.equal(await page.locator('#feedbackMessage').inputValue(),'');
      assert.deepEqual(await page.evaluate(()=>feedbackCalls),['test feedback <b>literal</b>','test feedback <b>literal</b>']);
      await page.locator('#feedbackCancel').click();
      await page.evaluate(()=>{window.testFonts=[...document.querySelectorAll('h1,h2,p,span,select,input,button,textarea')]
        .filter(el=>!el.matches('.nav-btn,.star-mark,.pronounce-icon,.icon-button'))
        .map(el=>[el,parseFloat(getComputedStyle(el).fontSize)]);});
      for(const zoom of [1,1.5,2]) {
        await page.setViewportSize({width:480,height:720});
        await page.evaluate(zoom=>testFonts.forEach(([el,size])=>el.style.fontSize=size*zoom+'px'),zoom);
        assert.equal(await page.locator('#btnNextCard').evaluate(el=>{const r=el.getBoundingClientRect();return Math.abs(r.width-r.height)<1 && r.bottom<=innerHeight;}),true);
        await page.evaluate(()=>Feedback.open());
        assert.equal(await page.locator('#feedbackDialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
        await page.locator('#feedbackCancel').click();
      }
      await page.evaluate(()=>testFonts.forEach(([el])=>el.style.fontSize=''));
      assert.deepEqual(errors,[]);
      console.log(`PASS: ${html}: 460 words/audio, checkbox mixing, unique IDs, source-aware stars/audio, reversible shuffle/search, normal card replay, live/persisted playback speed, self-test, list, keyboard and themes`);
      await page.screenshot({path:'artifacts/windows-dark.png'});
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
