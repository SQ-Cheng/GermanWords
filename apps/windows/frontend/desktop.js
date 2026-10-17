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
    } catch (error) { if (manual) status.textContent = '检查失败：' + String(error); }
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
    catch (error) { status.textContent = '更新失败：' + String(error); }
    finally { busy = false; document.getElementById('checkUpdates').disabled = false; }
  }
  async function loadBuiltIn() {
    if (!native) return;
    try {
      const response = await fetch('library.json');
      if (!response.ok) throw new Error('内置词库索引无法读取');
      const manifest = await response.json();
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
    } catch (error) { notify('载入词库失败：' + error.message, 'error'); }
  }
  if (native) {
    document.getElementById('checkUpdates').hidden = false;
    document.getElementById('updateStatus').textContent = '离线学习 · 清华云盘更新';
    loadBuiltIn();
    checkUpdates(false);
  }
  return {checkUpdates, installUpdate};
})();

function exportWindowsBackup() {
  try {
    const data = {format:'GermanWords-Windows', version:1,
      marks:JSON.parse(localStorage.getItem(MarkStore.key) || '{}'),
      theme:localStorage.getItem('german_theme_v1') || 'auto', rate:Playback.getRate()};
    const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'}));
    const link = document.createElement('a');
    link.href = url; link.download = 'GermanWords-backup.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { notify('导出失败：' + error.message, 'error'); }
}
function restoreWindowsBackup(raw) {
  const data = JSON.parse(raw);
  if (data.format !== 'GermanWords-Windows' || data.version !== 1 || !data.marks || typeof data.marks !== 'object' || Array.isArray(data.marks)
      || !Object.values(data.marks).every(words => Array.isArray(words) && words.every(word => typeof word === 'string'))
      || !['auto','light','dark'].includes(data.theme) || ![0.75,1,1.25,1.5].includes(data.rate)) throw new Error('备份格式不正确');
  localStorage.setItem(MarkStore.key, JSON.stringify(data.marks));
  AppTheme.setMode(data.theme);
  changePlaybackRate(data.rate);
  currentFileWords.forEach(word => { word.marked = store.marks(word.sourceBook || currentFileName).includes(word.german); });
  refreshDisplayList(true);
}
document.getElementById('backupInput').addEventListener('change', async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2097152) throw new Error('备份文件过大');
    if (!confirm('导入将替换现有星标和设置，是否继续？')) return;
    restoreWindowsBackup(await file.text()); notify('星标和设置已恢复', 'info');
  } catch (error) { notify('导入失败：' + error.message, 'error'); }
  finally { event.target.value = ''; }
});

document.getElementById('checkUpdates').onclick = () => Desktop.checkUpdates(true);
document.getElementById('installUpdate').onclick = Desktop.installUpdate;
document.getElementById('deferUpdate').onclick = () => document.getElementById('updateDialog').close();
document.getElementById('exportBackup').onclick = exportWindowsBackup;
