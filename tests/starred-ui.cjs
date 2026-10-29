const assert = require('node:assert/strict');

module.exports = async function checkDeferredStars(page) {
  const saved = await page.evaluate(() => ({marks:store.readAll(), flags:currentFileWords.map(word=>word.marked),
    filter:isFilterActive, index:currentIndex, view:currentView}));
  try {
    const ids = await page.evaluate(() => {
      store.replaceAll({});
      currentFileWords.forEach((word,index) => {
        word.marked=index<3;
        if(word.marked)store.setMark(word.sourceBook||currentFileName,word.german,true);
      });
      isFilterActive=true;
      switchView('card');refreshDisplayList();navigateTo(1);
      return displayWords.map(word=>word.id);
    });
    await page.locator('.star-mark').click();
    assert.deepEqual(await page.evaluate(()=>({id:displayWords[currentIndex].id,count:displayWords.length,
      marked:displayWords[currentIndex].marked,saved:store.marks(displayWords[currentIndex].sourceBook||currentFileName).includes(displayWords[currentIndex].german)})),
      {id:ids[1],count:3,marked:false,saved:false});
    await page.locator('.star-mark').click();
    assert.equal(await page.evaluate(()=>displayWords.length),3,'re-starring before leaving keeps the card');
    await page.locator('.star-mark').click();
    await page.locator('#btnNextCard').click();
    assert.deepEqual(await page.evaluate(()=>({id:displayWords[currentIndex].id,count:displayWords.length})),{id:ids[2],count:2});
    await page.locator('#btnPrevCard').click();
    assert.equal(await page.evaluate(()=>displayWords[currentIndex].id),ids[0]);
    await page.locator('.star-mark').click();
    await page.locator('#btnNextCard').click();
    assert.equal(await page.evaluate(()=>displayWords.length),1);
    await page.locator('.star-mark').click();
    assert.equal(await page.locator('#btnNextCard').isEnabled(),true);
    await page.locator('#btnNextCard').click();
    assert.equal(await page.evaluate(()=>displayWords.length),0,'the last card leaves an empty star list safely');
    assert.equal(await page.locator('#studyProgress').isDisabled(),true);
  } finally {
    await page.evaluate(saved => {
      store.replaceAll(saved.marks);
      currentFileWords.forEach((word,index)=>word.marked=saved.flags[index]);
      isFilterActive=saved.filter;
      switchView(saved.view);refreshDisplayList();navigateTo(saved.index);
    },saved);
  }
};
