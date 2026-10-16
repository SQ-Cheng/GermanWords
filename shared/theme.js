const AppTheme = (function () {
  const key = 'german_theme_v1';
  const system = matchMedia('(prefers-color-scheme: dark)');
  let mode = 'auto';
  let nativeDark = null;
  try { mode = localStorage.getItem(key) || 'auto'; } catch (_) {}
  if (!['auto', 'light', 'dark'].includes(mode)) mode = 'auto';

  function apply() {
    const dark = mode === 'dark' || (mode === 'auto' && (nativeDark === null ? system.matches : nativeDark));
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    const select = document.getElementById('themeSelect');
    if (select) select.value = mode;
    document.dispatchEvent(new CustomEvent('themechange', {detail: dark}));
  }
  function setMode(value) {
    mode = ['auto', 'light', 'dark'].includes(value) ? value : 'auto';
    try { localStorage.setItem(key, mode); } catch (_) {}
    apply();
  }
  function setSystemDark(value) {
    nativeDark = !!value;
    apply();
  }
  system.addEventListener('change', apply);
  document.addEventListener('DOMContentLoaded', apply);
  apply();
  return {setMode, setSystemDark};
})();
