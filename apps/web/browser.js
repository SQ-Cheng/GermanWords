// Browser-only distribution: no native bridge, background downloads or uploads.
document.getElementById('checkUpdates').hidden = false;
document.getElementById('checkUpdates').textContent = '下载新版';
document.getElementById('checkUpdates').onclick = () => window.open('https://github.com/SQ-Cheng/GermanWords/releases', '_blank', 'noopener,noreferrer');
document.getElementById('openFeedback').hidden = false;
document.getElementById('openFeedback').onclick = () => window.open('https://github.com/SQ-Cheng/GermanWords/issues/new', '_blank', 'noopener,noreferrer');

(async () => {
  if (typeof BuiltInLibrary === 'undefined') return; // Source preview supports manual import.
  try {
    new DecompressionStream('deflate-raw');
  } catch (_) {
    notify('当前浏览器不支持词表解压，请使用较新版本的 Safari、Firefox、Chrome 或 Edge。', 'error');
    return;
  }
  try {
    const files = BuiltInLibrary.map(item => ({
      name:item.name, webkitRelativePath:item.path,
      packagedUrl:new URL(item.path.split('/').map(encodeURIComponent).join('/'), location.href).href,
      async arrayBuffer() { return Uint8Array.from(atob(item.data), character => character.charCodeAt(0)).buffer; }
    }));
    await loadBuiltInFiles(files);
  } catch (_) { notify('内置词库无法读取，请完整解压后重新打开。', 'error'); }
})();
