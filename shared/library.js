// Course catalogue and file identities. No UI, parsing, playback or native APIs.
const StudyLibrary = (() => {
  const courses = [
    {id:'german1', name:'德语（1）', root:'words/german1'},
    {id:'german2', name:'德语（2）', root:'words/german2'}
  ];
  const storageKey = 'german_course_v1';
  const isBook = file => /\.xlsx$/i.test(file.name);
  function compare(a, b) {
    const number = file => Number((file.name.match(/\d+/) || [Number.MAX_SAFE_INTEGER])[0]);
    return number(a) - number(b) || a.name.localeCompare(b.name, 'zh');
  }
  function title(file) { return file.name.replace(/[ _]单词汇总\.xlsx$/i, '').replace(/\.xlsx$/i, ''); }
  function create() {
    let builtIn = [], imported = [], selected = courses[0].id;
    try {
      const saved = localStorage.getItem(storageKey);
      if (courses.some(course => course.id === saved)) selected = saved;
    } catch (_) {}
    function select(id) {
      if (!courses.some(course => course.id === id)) return;
      selected = id;
      try { localStorage.setItem(storageKey, id); } catch (_) {}
    }
    function setBuiltIn(files) {
      builtIn = Array.from(files, file => {
        const path = WordParser.normPath(file.webkitRelativePath || file.name);
        const course = courses.find(item => path.startsWith(item.root + '/'));
        if (!course) throw new Error('内置词库课程目录无效');
        return {...file, course:course.id, root:course.root};
      });
    }
    function entries() {
      const keys = new Set(), result = [];
      // Reserve every built-in identity before imports, including hidden courses.
      for (const file of builtIn.filter(isBook).sort(compare)) {
        const key = file.course === 'german1' ? file.name : '@course:' + file.course + ':' + file.name;
        keys.add(key);
        if (file.course === selected) result.push({key, file, imported:false});
      }
      for (const file of imported.filter(isBook).sort(compare)) {
        let key = file.name;
        if (keys.has(key)) key += ' · ' + (file.webkitRelativePath || '导入词表');
        const base = key;
        for (let n = 2; keys.has(key); n++) key = base + ' (' + n + ')';
        keys.add(key);
        result.push({key, file, imported:true});
      }
      return result;
    }
    return {setBuiltIn, setImported:files => { imported = Array.from(files); },
      files:() => builtIn.concat(imported), entries, select,
      current:() => courses.find(course => course.id === selected)};
  }
  return {courses, storageKey, create, title};
})();
