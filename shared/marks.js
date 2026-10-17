// Shared star persistence. Platform clients provide their own storage warning.
const MarkStore = (function () {
  const key = 'german_app_memory';
  function create(onStorageError) {
    let usable = true;
    let memory = '{}';
    function readAll() {
      let raw = memory;
      if (usable) {
        try { raw = localStorage.getItem(key); memory = raw || '{}'; }
        catch (_) { usable = false; }
      }
      try {
        const data = JSON.parse(raw || '{}');
        return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
      } catch (_) { return {}; }
    }
    function writeAll(all) {
      memory = JSON.stringify(all);
      try { localStorage.setItem(key, memory); usable = true; }
      catch (_) { usable = false; onStorageError(); }
    }
    return {
      readAll,
      replaceAll(all) {
        if (!all || typeof all !== 'object' || Array.isArray(all)
            || !Object.values(all).every(words => Array.isArray(words) && words.every(word => typeof word === 'string'))) {
          throw new Error('星标格式不正确');
        }
        writeAll(all);
      },
      marks(book) {
        const words = readAll()[book];
        return Array.isArray(words) ? words : [];
      },
      setMark(book, word, marked) {
        const all = readAll();
        const words = Array.isArray(all[book]) ? all[book] : [];
        const index = words.indexOf(word);
        if (marked && index < 0) words.push(word);
        else if (!marked && index >= 0) words.splice(index, 1);
        Object.defineProperty(all, book, {value:words, enumerable:true, configurable:true, writable:true});
        writeAll(all);
      }
    };
  }
  return {key, create};
})();
