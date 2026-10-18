// Explicit opt-in: sends ONE clearly labelled test report through an installed app.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const [endpoint, platform, consent] = process.argv.slice(2);
  assert.ok(endpoint && ['android','windows'].includes(platform) && consent === '--send-test-report',
    'Usage: node tests/feedback-live.cjs CDP_ENDPOINT android|windows --send-test-report');
  const browser = await chromium.connectOverCDP(endpoint);
  try {
    const pages = browser.contexts().flatMap(c => c.pages()).filter(p =>
      p.url().includes(platform === 'windows' ? 'tauri.localhost' : 'appassets.androidplatform.net'));
    let page = pages[0];
    if (platform === 'android') {
      const targets = await (await fetch(endpoint + '/json/list')).json();
      const visible = new Set(targets.filter(t => JSON.parse(t.description || '{}').visible).map(t => t.id));
      page = undefined;
      for (const candidate of pages) {
        const session = await candidate.context().newCDPSession(candidate);
        const {targetInfo} = await session.send('Target.getTargetInfo');
        await session.detach();
        if (visible.has(targetInfo.targetId)) { page = candidate; break; }
      }
    }
    assert.ok(page, 'Installed application is required');
    const menu = page.locator(platform === 'android' ? '#libraryButton' : '#openLibrary');
    if (await menu.isVisible()) await menu.click();
    await page.locator('#openFeedback').click();
    await page.locator('#feedbackMessage').fill(`自动化验证反馈（${platform}）：验证提交入口、基本元数据和 JSON 单文件上传，可删除。测试时间 ${new Date().toISOString()}`);
    await page.locator('#feedbackSubmit').click();
    await page.waitForFunction(() => !document.getElementById('feedbackSubmit').disabled, null, {timeout:60000});
    assert.ok((await page.locator('#feedbackStatus').innerText()).includes('已提交'),
      await page.locator('#feedbackStatus').innerText());
    assert.equal(await page.locator('#feedbackMessage').inputValue(), '');
    await page.locator('#feedbackCancel').click();
    console.log(`PASS: ${platform} installed app acknowledged a real JSON feedback upload`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
