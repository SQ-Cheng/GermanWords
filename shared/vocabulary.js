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
  // Keep unstarred words visible until navigation, then retain the intended neighbour.
  function navigate(words, current, target, markedOnly) {
    const position = Math.max(0, Math.min(words.length - 1, target));
    let selected = words[position];
    const visible = markedOnly ? words.filter(word => word.marked) : words;
    if (markedOnly && selected && !selected.marked) {
      const step = target < current ? -1 : 1;
      selected = null;
      for (const direction of [step, -step]) {
        for (let index = position; index >= 0 && index < words.length; index += direction) {
          if (words[index].marked) { selected = words[index]; break; }
        }
        if (selected) break;
      }
    }
    return {words:visible, index:Math.max(0, visible.indexOf(selected))};
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
  return {matches, sourceRoot, selectionKey, readBooks, navigate};
})();
