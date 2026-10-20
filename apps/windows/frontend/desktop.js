Feedback.setSender(message => window.__TAURI__.core.invoke('submit_feedback', {message, userAgent:navigator.userAgent}));
document.getElementById('openFeedback').onclick = () => {
  closeLibrary();
  pauseStudyAudio();
  Feedback.open();
};

// Platform integration stays outside the learning engine.
const Desktop = (function () {
  const native = window.__TAURI__;
  let busy = false;
  async function checkUpdates(manual) {
    if (!native || busy) return;
    try {
      if (!manual && Date.now() - Number(localStorage.getItem('german_update_check') || 0) < 86400000) return;
    } catch (_) {}
    busy = true;
    const button = document.getElementById('checkUpdates');
    const status = document.getElementById('updateStatus');
    button.disabled = true;
    if (manual) status.textContent = '正在检查更新…';
    try {
      const update = await native.core.invoke('check_update');
      try { localStorage.setItem('german_update_check', String(Date.now())); } catch (_) {}
      if (!update) { if (manual) status.textContent = '已是最新版本'; return; }
      status.textContent = '发现新版本 ' + update.version;
      const dialog = document.getElementById('updateDialog');
      document.getElementById('updateNotes').textContent = update.version + '\n\n' + update.notes;
      dialog.showModal();
    } catch (error) { if (manual) status.textContent = '暂时无法检查更新，请稍后重试'; }
    finally { busy = false; button.disabled = false; }
  }
  async function installUpdate() {
    if (!native || busy) return;
    busy = true;
    const status = document.getElementById('updateStatus');
    document.getElementById('updateDialog').close();
    document.getElementById('checkUpdates').disabled = true;
    status.textContent = '正在下载更新，完成后将关闭应用并安装，请稍候…';
    try { await native.core.invoke('install_update'); }
    catch (error) { status.textContent = '更新未完成，请检查网络后重试'; }
    finally { busy = false; document.getElementById('checkUpdates').disabled = false; }
  }
  async function loadBuiltIn() {
    if (!native) return;
    const sequence = loadSequence;
    try {
      const response = await fetch('library.json');
      if (!response.ok) throw new Error('内置词库索引无法读取');
      const manifest = await response.json();
      if (sequence !== loadSequence) return;
      const files = manifest.map(item => ({
        name: item.name, webkitRelativePath: item.path,
        packagedUrl: new URL(item.path.split('/').map(encodeURIComponent).join('/'), location.href).href,
        async arrayBuffer() {
          const data = await fetch(this.packagedUrl);
          if (!data.ok) throw new Error('词表无法读取');
          return data.arrayBuffer();
        }
      }));
      handleFiles(files);
      await loadFile(Object.keys(fileMap)[0]);
    } catch (error) { if (sequence === loadSequence) notify('载入词库失败：' + error.message, 'error'); }
  }
  if (native) {
    document.getElementById('openFeedback').hidden = false;
    document.getElementById('checkUpdates').hidden = false;
    document.getElementById('updateStatus').textContent = '离线学习';
    loadBuiltIn();
    checkUpdates(false);
  }
  return {checkUpdates, installUpdate};
})();

document.getElementById('checkUpdates').onclick = () => Desktop.checkUpdates(true);
document.getElementById('installUpdate').onclick = Desktop.installUpdate;
document.getElementById('deferUpdate').onclick = () => document.getElementById('updateDialog').close();
