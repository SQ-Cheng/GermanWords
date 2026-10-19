// Shared form only. Device metadata and network access belong to the native hosts.
const Feedback = (() => {
  const dialog = document.createElement('dialog');
  dialog.id = 'feedbackDialog';
  dialog.setAttribute('aria-labelledby', 'feedbackTitle');
  dialog.innerHTML = '<form id="feedbackForm"><h2 id="feedbackTitle" tabindex="-1" autofocus>意见反馈</h2>' +
    '<label for="feedbackMessage">请描述遇到的问题或建议</label>' +
    '<textarea id="feedbackMessage" rows="6" maxlength="4000" required></textarea>' +
    '<p id="feedbackDescription">请勿填写密码等敏感信息。</p>' +
    '<p id="feedbackStatus" role="status"></p><div class="feedback-actions">' +
    '<button type="button" id="feedbackCancel">关闭</button><button id="feedbackSubmit" type="submit">提交</button></div></form>';
  document.body.appendChild(dialog);
  const message = document.getElementById('feedbackMessage');
  const status = document.getElementById('feedbackStatus');
  let busy = false;
  let send;
  function complete(success) {
    busy = false;
    document.getElementById('feedbackSubmit').disabled = false;
    message.disabled = false;
    if (success) message.value = '';
    status.textContent = success ? '反馈已提交，谢谢。' : '提交失败，内容已保留，请检查网络后重试。';
  }
  document.getElementById('feedbackCancel').onclick = () => dialog.close();
  document.getElementById('feedbackForm').onsubmit = async event => {
    event.preventDefault();
    const text = message.value.trim();
    if (busy) return;
    if (!text || text.length > 4000) { status.textContent = '请输入 1～4000 字的反馈。'; return; }
    busy = true;
    document.getElementById('feedbackSubmit').disabled = true;
    message.disabled = true;
    status.textContent = '正在提交…';
    try {
      await send(text);
      complete(true);
    } catch (_) { complete(false); }
  };
  return {
    open() {
      if (!busy) status.textContent = '';
      dialog.showModal();
    },
    setSender(sender) { send = sender; },
    back() { if (!dialog.open) return false; dialog.close(); return true; }
  };
})();
