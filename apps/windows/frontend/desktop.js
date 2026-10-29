Feedback.setSender(message => window.__TAURI__.core.invoke('submit_feedback', {message, userAgent:navigator.userAgent}));
document.getElementById('openFeedback').onclick = () => {
  closeLibrary();
  pauseStudyAudio();
  Feedback.open();
};

// Platform integration stays outside the learning engine.
const Desktop = (function () {
  const native = window.__TAURI__;
  const channelSelect = document.getElementById('updateChannel');
  const channelDialog = document.getElementById('updateChannelDialog');
  let channel = 'stable', channelConfirmed = false;
  try {
    const saved = localStorage.getItem('german_update_channel');
    if (saved === 'stable' || saved === 'beta') {
      channel = saved;
      channelConfirmed = localStorage.getItem('german_update_channel_confirmed') === 'true';
    }
  } catch (_) {}
  channelSelect.value = channel;
  let busy = false;
  async function checkUpdates(manual) {
    if (!native || busy) return;
    if (!channelConfirmed) { if (!channelDialog.open) channelDialog.showModal(); return; }
    try {
      if (!manual && Date.now() - Number(localStorage.getItem('german_update_check_' + channel) || 0) < 86400000) return;
    } catch (_) {}
    busy = true;
    const button = document.getElementById('checkUpdates');
    const status = document.getElementById('updateStatus');
    button.disabled = true;
    channelSelect.disabled = true;
    if (manual) status.textContent = '正在检查更新…';
    try {
      const update = await native.core.invoke('check_update', {channel});
      try { localStorage.setItem('german_update_check_' + channel, String(Date.now())); } catch (_) {}
      if (!update) { if (manual) status.textContent = channel === 'stable' ? '当前无需升级正式版' : '当前无需升级'; return; }
      status.textContent = '发现新版本 ' + update.version;
      const dialog = document.getElementById('updateDialog');
      document.getElementById('updateNotes').textContent = update.version + '\n\n' + update.notes;
      dialog.showModal();
    } catch (error) { if (manual) status.textContent = '暂时无法检查更新，请稍后重试'; }
    finally { busy = false; button.disabled = false; channelSelect.disabled = false; }
  }
  async function installUpdate() {
    if (!native || busy) return;
    busy = true;
    channelSelect.disabled = true;
    const status = document.getElementById('updateStatus');
    document.getElementById('updateDialog').close();
    document.getElementById('checkUpdates').disabled = true;
    status.textContent = '正在下载更新，完成后将关闭应用并安装，请稍候…';
    try { await native.core.invoke('install_update'); }
    catch (error) { status.textContent = '更新未完成，请检查网络后重试'; }
    finally { busy = false; document.getElementById('checkUpdates').disabled = false; channelSelect.disabled = false; }
  }
  function selectChannel(selected) {
    if (busy || !['stable', 'beta'].includes(selected)) { channelSelect.value = channel; return; }
    try {
      localStorage.setItem('german_update_channel', selected);
      localStorage.setItem('german_update_channel_confirmed', 'true');
    }
    catch (_) { channelSelect.value = channel; notify('无法保存更新设置，请检查存储空间', 'warn'); return; }
    channel = selected;
    channelConfirmed = true;
    channelSelect.value = channel;
    channelDialog.close();
    document.getElementById('updateDialog').close();
    checkUpdates(true);
  }
  channelSelect.onchange = () => selectChannel(channelSelect.value);
  document.getElementById('declineBetaUpdates').onclick = () => selectChannel('stable');
  document.getElementById('acceptBetaUpdates').onclick = () => selectChannel('beta');
  async function loadBuiltIn() {
    if (!native) return;
    try {
      const files = BuiltInLibrary.map(item => ({
        name: item.name, webkitRelativePath: item.path,
        packagedUrl: new URL(item.path.split('/').map(encodeURIComponent).join('/'), location.href).href,
        async arrayBuffer() {
          const data = await fetch(this.packagedUrl);
          if (!data.ok) throw new Error('词表无法读取');
          return data.arrayBuffer();
        }
      }));
      await loadBuiltInFiles(files);
    } catch (error) { notify('载入词库失败：' + error.message, 'error'); }
  }
  if (native) {
    document.getElementById('updateChannelSetting').hidden = false;
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
