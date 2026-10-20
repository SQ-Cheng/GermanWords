// Exercise the extracted distribution, both directly and beneath an HTTP subdirectory.
const {chromium, firefox, webkit} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {pathToFileURL} = require('node:url');

const root = path.resolve(__dirname, '../tmp/web-unpacked/Deutsch Wörter/GermanWords');
const fileURL = pathToFileURL(path.join(root, 'index.html')).href;
const version = require('../shared/app-config.json').versionName;
const prefix = '/German Words/Ä/';
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const target = path.resolve(root, pathname.slice(prefix.length));
  if (!pathname.startsWith(prefix) || !target.startsWith(root + path.sep) || !fs.existsSync(target)) {
    response.writeHead(404).end(); return;
  }
  const mime = {'.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.mp3':'audio/mpeg'};
  response.writeHead(200, {'Content-Type':mime[path.extname(target)] || 'application/octet-stream'});
  fs.createReadStream(target).pipe(response);
});

async function ready(page) {
  await page.waitForFunction(() => typeof currentFileWords !== 'undefined' && currentFileWords.length === 65);
  await page.evaluate(() => pauseStudyAudio());
}

async function checkEdition(browser, url, offline, name) {
  const context = await browser.newContext({viewport:{width:1280,height:900}, acceptDownloads:true});
  if (offline) {
    // Playwright's Windows WebKit offline emulation also blocks file:// navigation.
    // Reject every network request instead; local files and media remain available.
    await context.route(/^https?:\/\//, route => route.abort());
    if (name !== 'webkit') await context.setOffline(true);
  }
  const page = await context.newPage();
  const errors = [], external = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    const target = new URL(request.url());
    if (target.protocol.startsWith('http') && target.hostname !== '127.0.0.1') external.push(request.url());
  });
  try {
    await page.goto(url);
    await ready(page);
    assert.equal(await page.locator('#appVersion').textContent(), ' · ' + version);
    assert.equal(await page.evaluate(() => typeof Feedback + ':' + typeof window.__TAURI__), 'undefined:undefined');
    assert.equal(await page.locator('#updateDialog').count(), 0);
    await require('./course-ui.cjs')(page);
    const totals = await page.evaluate(async () => {
      await loadBooks(Object.keys(fileMap)); pauseStudyAudio();
      return {books:currentBookNames.length, words:currentFileWords.length,
        ids:new Set(currentFileWords.map(word => word.id)).size,
        examples:currentFileWords.filter(word => word.example).length,
        audio:currentFileWords.filter(word => findAudioFile(word)).length};
    });
    assert.deepEqual(totals, {books:8,words:460,ids:460,examples:460,audio:460});
    if (name==='firefox') {
      const track=await page.locator('#studyProgress').evaluate(element=>{
        const style=getComputedStyle(element,'::-moz-range-track');return {height:style.height,background:style.backgroundImage};
      });
      assert.equal(track.height,'4px'); assert.ok(track.background.includes('linear-gradient'),'Firefox draws the progress track');
    }
    await page.locator('#wordSearch').fill(' LERNEN ');
    assert.ok(await page.evaluate(() => displayWords.length > 0 && displayWords.every(word => /lernen/i.test(word.german))));
    await page.locator('#wordSearch').fill('');
    assert.equal(await page.evaluate(() => displayWords.length),460);
    await page.evaluate(async () => { await loadFile(Object.keys(fileMap)[0]); pauseStudyAudio(); });
    await page.locator('#modeSelect').selectOption('test-zh');
    assert.equal(await page.locator('#germanArea').evaluate(el => el.classList.contains('hidden-content')),true);
    await page.locator('#cardView').click();
    assert.equal(await page.locator('#germanArea').evaluate(el => el.classList.contains('hidden-content')),false);
    await page.locator('#btnListView').click();
    const row = page.locator('#wordTable tbody tr').first();
    assert.equal(await row.locator('td').first().innerText(),'');
    await row.locator('.list-answer').click();
    assert.ok(await row.locator('td').first().innerText());
    await page.locator('#btnCardView').click();
    await page.locator('#modeSelect').selectOption('normal');

    // Real media decoding after a user gesture, including file:// and encoded paths.
    await page.evaluate(() => { document.getElementById('notice').textContent=''; });
    await page.locator('#cardView').click();
    const windowsWebKitFile = process.platform === 'win32' && name === 'webkit' && offline;
    const playback=await page.waitForFunction(() => {
      if (currentAudio && !currentAudio.paused && currentAudio.readyState >= 2) return 'playing';
      if (currentAudio === null && /音频.*失败/.test(document.getElementById('notice').textContent)) return 'failed';
    });
    const mediaWorks=await playback.jsonValue()==='playing';
    await playback.dispose();
    if (!mediaWorks) {
      // Independently reproduced with a plain <audio>: this Windows port fails
      // file media under non-ASCII paths. Keep its remaining checks; HTTP tests
      // still require real decoding. This is not a macOS Safari verification.
      assert.ok(windowsWebKitFile,`${name}: actual media must play outside the known Windows WebKit file limitation`);
      console.log('LIMIT: Windows WebKit file:// media under non-ASCII paths; actual playback checked over HTTP instead.');
    }
    await page.locator('#playbackRate').selectOption('1.25');
    if (mediaWorks) assert.equal(await page.evaluate(() => currentAudio.playbackRate),1.25);
    await page.evaluate(() => pauseStudyAudio());

    await page.emulateMedia({colorScheme:'dark'});
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.locator('#themeSelect').selectOption('light');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme),'light');
    await page.evaluate(() => { if (!displayWords[0].marked) toggleMark(displayWords[0]); });
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#exportBackup').click();
    const backup = JSON.parse(fs.readFileSync(await (await downloadEvent).path(), 'utf8'));
    assert.equal(backup.format,'GermanWords-Windows');
    assert.equal(backup.rate,1.25);
    assert.ok(Object.values(backup.marks).some(words => words.length));
    await page.reload(); await ready(page);
    assert.equal(await page.locator('#themeSelect').inputValue(),'light');
    assert.equal(await page.locator('#playbackRate').inputValue(),'1.25');
    assert.equal(await page.evaluate(() => displayWords[0].marked),true);
    await page.evaluate(() => { store.replaceAll({}); refreshDisplayList(true); });
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#backupInput').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    await page.waitForFunction(() => displayWords[0].marked);
    assert.equal(await page.evaluate(() => {
      const before=JSON.stringify(store.readAll());
      try { restoreStudyBackup('{"format":"GermanWords-Windows","version":1,"marks":{"E1":[42]},"theme":"light","rate":1}'); return false; }
      catch (_) { return before===JSON.stringify(store.readAll()); }
    }),true);

    // Mouse stays down during previews; release commits only the final word.
    await page.evaluate(() => { pauseStudyAudio(); window.plays=0; window.originalPlay=playPronounce; playPronounce=()=>plays++; });
    const slider=await page.locator('#studyProgress').boundingBox();
    await page.mouse.move(slider.x+slider.width*.2,slider.y+slider.height/2); await page.mouse.down();
    for (const fraction of [.4,.6,.8]) {
      await page.mouse.move(slider.x+slider.width*fraction,slider.y+slider.height/2,{steps:3});
      await page.waitForTimeout(180);
      assert.equal(await page.evaluate(() => plays===0 && autoPlayTimer===null && currentAudio===null),true);
      assert.equal(await page.locator('#cardChinese').innerText(),await page.evaluate(() => displayWords[currentIndex].chinese));
    }
    assert.ok(await page.evaluate(() => currentIndex>40));
    await page.mouse.up(); await page.waitForTimeout(180);
    assert.equal(await page.evaluate(() => plays),1);
    const index=await page.evaluate(() => currentIndex);
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => currentIndex),index-1);
    await page.locator('#btnNextCard').click();
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.evaluate(() => currentIndex),index-1,'pointer buttons restore shortcut focus');
    await page.evaluate(() => { pauseStudyAudio(); playPronounce=originalPlay; });

    for (const width of [1280,800,480]) {
      await page.setViewportSize({width,height:720});
      const large = await page.addStyleTag({content:'.card-german {font-size:112px;}'});
      await page.evaluate(() => { currentIndex=displayWords.reduce((best,word,index)=>word.german.length>displayWords[best].german.length?index:best,0); renderCard(true); });
      await page.waitForFunction(() => { const el=document.getElementById('cardGerman');return el.scrollWidth<=el.clientWidth+1; });
      assert.equal(await page.evaluate(() => {
        const card=document.getElementById('cardView').getBoundingClientRect(),body=document.querySelector('.card-body').getBoundingClientRect();
        const left=document.getElementById('btnPrevCard').getBoundingClientRect(),right=document.getElementById('btnNextCard').getBoundingClientRect();
        return document.documentElement.scrollWidth<=innerWidth && left.width===left.height && right.width===right.height
          && left.right<=body.left && right.left>=body.right && Math.abs(left.top+left.height/2-card.top-card.height/2)<1;
      }),true,`${name}: ${width}px layout, circular side buttons and single-line large words`);
      await large.evaluate(el => el.remove());
      await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    }
    await page.screenshot({path:path.resolve(__dirname,`../artifacts/web-${name}-${offline?'file':'http'}.png`)});
    await page.setViewportSize({width:1280,height:900});
    // The ordinary multi-file picker works even when directory selection is unavailable.
    const book=fs.readdirSync(path.join(root,'words/german1')).find(name => name.endsWith('.xlsx'));
    const audio=await page.evaluate(() => BuiltInLibrary.find(item => item.path.endsWith('.mp3')).path);
    await page.locator('#fileInput').setInputFiles([path.join(root,'words/german1',book),path.join(root,audio)]);
    await page.waitForFunction(() => Object.keys(fileMap).length===9 && currentBookNames.length===1 && !fileMap[currentBookNames[0]].course);
    assert.equal(await page.locator('.file-item[data-imported="true"]').count(),1);
    await ready(page);
    const importedKey=await page.evaluate(()=>currentBookNames[0]);
    await page.locator('.star-mark').click();
    for (const course of ['german2','german1']) {
      await page.locator('#courseSelect').selectOption(course);
      await page.waitForFunction(id=>library.current().id===id && fileMap[currentBookNames[0]]?.course===id,course);
      assert.equal(await page.locator('.file-item[data-imported="true"]').count(),1);
      assert.ok((await page.locator('.file-item[data-imported="true"] .book-name').innerText()).includes('导入词表'));
      assert.equal(await page.evaluate(key=>!!fileMap[key],importedKey),true,'import identities are independent of the course');
      if (course==='german2') await page.screenshot({path:path.resolve(__dirname,`../artifacts/web-course-${name}-${offline?'file':'http'}.png`)});
      await page.locator('.file-item[data-imported="true"]').click();
      await page.waitForFunction(key=>currentBookNames[0]===key && currentFileWords.length===65,importedKey);
      assert.equal(await page.locator('#courseName').innerText(),'我的词表');
      assert.equal(await page.evaluate(()=>displayWords[0].marked),true);
    }
    await page.reload(); await ready(page);

    await page.evaluate(() => { window.opened=[]; window.open=(...args)=>opened.push(args); });
    await page.locator('#checkUpdates').click(); await page.locator('#openFeedback').click();
    assert.deepEqual(await page.evaluate(() => opened.map(args=>args[0])),[
      'https://github.com/SQ-Cheng/GermanWords/releases','https://github.com/SQ-Cheng/GermanWords/issues/new'
    ]);
    assert.deepEqual(external,[],'learning has no network dependencies');
    assert.deepEqual(errors,[]);
    console.log(`PASS: ${name} ${offline?'offline file://':'HTTP subdirectory'}: 460 words/examples/audio matches, ${mediaWorks?'actual media':'media limit noted'}, study, backup, persistence, silent previews, import, layout and external actions`);
  } finally { await context.close(); }
}

(async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const httpURL=`http://127.0.0.1:${server.address().port}${encodeURI(prefix)}index.html`;
  try {
    const chromiumOptions=process.platform==='win32'?{channel:'msedge'}:{};
    for (const [name,engine,options] of [['chromium',chromium,chromiumOptions],['firefox',firefox,{}],['webkit',webkit,{}]]) {
      const browser=await engine.launch({headless:!process.argv.includes('--headed'),...options});
      try {
        await checkEdition(browser,fileURL,true,name);
        await checkEdition(browser,httpURL,false,name);
        const restricted=await browser.newContext();
        await restricted.addInitScript(() => { Storage.prototype.setItem=()=>{throw new DOMException('blocked','SecurityError');}; });
        const restrictedPage=await restricted.newPage(); await restrictedPage.goto(fileURL); await ready(restrictedPage);
        await restrictedPage.locator('.star-mark').click();
        await restrictedPage.locator('#themeSelect').selectOption('dark');
        await restrictedPage.locator('#playbackRate').selectOption('0.75');
        const fallbackDownload=restrictedPage.waitForEvent('download');
        await restrictedPage.locator('#exportBackup').click();
        const fallback=JSON.parse(fs.readFileSync(await (await fallbackDownload).path(),'utf8'));
        assert.ok(Object.values(fallback.marks).some(words=>words.length));
        assert.equal(fallback.theme,'dark'); assert.equal(fallback.rate,0.75);
        await restricted.close();
        const context=await browser.newContext();
        await context.addInitScript(() => { window.DecompressionStream=class {constructor(){throw new TypeError('unsupported');}}; });
        const page=await context.newPage(); await page.goto(fileURL);
        await page.waitForFunction(() => document.getElementById('notice').textContent.includes('浏览器不支持词表解压'));
        assert.equal(await page.evaluate(() => currentFileWords.length),0);
        await context.close();
        console.log(`PASS: ${name}: blocked persistent storage still exports marks/settings; unsupported decompression has an actionable message`);
      } finally { await browser.close(); }
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error=>{console.error(error);process.exitCode=1;});
