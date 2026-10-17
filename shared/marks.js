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
    return {
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
        memory = JSON.stringify(all);
        if (usable) {
          try { localStorage.setItem(key, memory); return; }
          catch (_) { usable = false; }
        }
        onStorageError();
      }
    };
  }
  return {key, create};
})();
