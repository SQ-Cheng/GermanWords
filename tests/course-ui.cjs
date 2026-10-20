const assert=require('node:assert/strict');
const fs=require('node:fs');

// Same user-facing course and backup checks for browsers and actual WebView2.
module.exports=async function checkCourses(page) {
  const previous=await page.evaluate(()=>({course:library.current().id,marks:store.readAll()}));
  async function menu() {
    if (!await page.locator('#courseSelect').isVisible()) await page.locator('#openLibrary').click();
  }
  async function select(course) {
    await menu(); await page.locator('#courseSelect').selectOption(course);
    await page.waitForFunction(id=>library.current().id===id && currentBookNames.length===1 && fileMap[currentBookNames[0]].course===id,course);
  }
  async function restore(data) {
    await menu(); page.once('dialog',dialog=>dialog.accept());
    await page.locator('#backupInput').setInputFiles({name:'course-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
    await page.waitForFunction(id=>library.current().id===id && currentFileWords.length>0,data.course||'german1');
  }
  try {
    await page.evaluate(()=>store.replaceAll({}));
    await select('german2');
    assert.equal(await page.evaluate(()=>currentFileWords.length),37);
    assert.equal(await page.locator('#lessonTitle').innerText(),'E1');
    assert.equal(await page.locator('#courseName').innerText(),'德语（2）');
    const total=await page.evaluate(async()=>{
      const names=Object.keys(fileMap).filter(name=>fileMap[name].course==='german2');
      await loadBooks(names); pauseStudyAudio();
      return {books:names.length,words:currentFileWords.length,ids:new Set(currentFileWords.map(word=>word.id)).size,
        audio:currentFileWords.filter(word=>findAudioFile(word)).length,examples:currentFileWords.filter(word=>word.example).length};
    });
    assert.deepEqual(total,{books:9,words:381,ids:381,audio:0,examples:0});
    await menu(); await page.locator('.file-item').filter({hasText:'虚词大盘点2'}).click();
    await page.waitForFunction(()=>displayWords[0]?.german==='und');
    assert.equal(await page.locator('#pronounceIcon').isVisible(),false,'another course cannot supply missing built-in audio');
    await page.locator('.star-mark').click();
    await menu(); const download=page.waitForEvent('download'); await page.locator('#exportBackup').click();
    const backup=JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));
    assert.equal(backup.course,'german2');
    assert.ok(backup.marks['@course:german2:虚词大盘点2.xlsx'].includes('und'));
    await select('german1');
    await menu(); await page.locator('.file-item').filter({hasText:'虚词大盘点'}).click();
    await page.waitForFunction(()=>currentFileName==='虚词大盘点.xlsx');
    assert.equal(await page.evaluate(()=>currentFileWords.some(word=>word.german==='und' && word.marked)),false);
    await restore(backup);
    await page.reload();
    await page.waitForFunction(()=>currentFileWords.length===37 && library.current().id==='german2');
    assert.equal(await page.evaluate(()=>store.marks('@course:german2:虚词大盘点2.xlsx').includes('und')),true);
    const legacy={...backup}; delete legacy.course;
    await restore(legacy);
    await page.waitForFunction(()=>currentFileWords.length===65 && library.current().id==='german1');
    console.log('PASS: course selector, 381 German 2 words, mixed IDs, course stars/audio isolation, restart and new/legacy course backups.');
  } finally {
    await page.evaluate(async saved=>{store.replaceAll(saved.marks);await changeCourse(saved.course);pauseStudyAudio();},previous);
  }
};
