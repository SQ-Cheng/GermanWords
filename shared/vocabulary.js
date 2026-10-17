// Data operations shared by both clients; no UI or platform dependencies.
const Vocabulary = (function () {
  function normalize(value) {
    return String(value || '').trim().toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
  }
  function matches(word, query) {
    const text = normalize(query);
    return !text || normalize(word.german).includes(text) || normalize(word.chinese).includes(text);
  }
  function sourceRoot(file) {
    return file.root || WordParser.normPath(file.webkitRelativePath || file.name).split('/').slice(0, -1).join('/');
  }
  function selectionKey(names) {
    return names.length === 1 ? names[0] : '@mixed:' + JSON.stringify(names);
  }
  async function readBooks(files, names, inflateRaw) {
    const words = [], warnings = [];
    for (const name of names) {
      const file = files[name];
      if (!file) throw new Error('词表不存在：' + name);
      const parsed = WordParser.parseSheets(await WordParser.read(file, inflateRaw));
      if (!parsed.words.length) throw new Error('词表中没有读到单词：' + name);
      for (const word of parsed.words) {
        words.push({...word, sourceBook:name, sourceRoot:sourceRoot(file),
          id:names.length === 1 ? word.id : JSON.stringify([name, word.id])});
      }
      warnings.push(...parsed.warnings);
    }
    return {words, warnings};
  }
  return {matches, sourceRoot, selectionKey, readBooks};
})();
