// Shared recording index and matching. No DOM, audio player or URL lifetime management.
const WordAudio = (function () {
  const { normPath } = WordParser;
  function foldName(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFC")
      .replace(/ä/g, "a")
      .replace(/ö/g, "o")
      .replace(/ü/g, "u")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]/g, "");
  }

  const AUDIO_EXT = /\.(mp3|m4a|wav|ogg|oga|opus|aac|flac)$/i;

  function makeAudioIndex(files) {

    const byFull = new Map();
    const byTail = new Map();
    const byBase = new Map();
    const byStem = new Map(); // 去掉扩展名的文件名，用于跨格式匹配
    const byFold = new Map(); // 再去掉变音符号，兜住文件名被改动过的情况
    for (const file of files) {
      if (!AUDIO_EXT.test(file.name)) continue;
      const rel = normPath(file.webkitRelativePath || file.name);
      const segs = rel.split("/");
      byFull.set(rel, file);
      byTail.set(segs.slice(-2).join("/"), file);
      const base = segs[segs.length - 1];
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push(file);
      const stem = base.replace(/\.[^.]+$/, "");
      if (!byStem.has(stem)) byStem.set(stem, []);
      byStem.get(stem).push(file);
      const fold = foldName(stem);
      if (fold) {
        if (!byFold.has(fold)) byFold.set(fold, []);
        byFold.get(fold).push(file);
      }
    }
    return {
      byFull: byFull,
      byTail: byTail,
      byBase: byBase,
      byStem: byStem,
      byFold: byFold,
    };
  }

  function build(files) {
    const audioIndex = makeAudioIndex(files);
    audioIndex.byRoot = new Map();
    audioIndex.courseRoots = new Set(files.filter(file => file.course).map(Vocabulary.sourceRoot));
    audioIndex.imported = makeAudioIndex(files.filter(file => !file.course));
    const roots = new Set(files.filter(file => /\.xlsx$/i.test(file.name)).map(Vocabulary.sourceRoot));
    for (const file of files) if (file.root) roots.add(file.root);
    for (const root of roots) {
      const members = files.filter(file => file.root ? file.root === root : !root || normPath(file.webkitRelativePath || file.name).startsWith(root + '/'));
      audioIndex.byRoot.set(root, makeAudioIndex(members));
    }
    return audioIndex;
  }
  // 发音列留空时，用德语词条猜音频文件名（去掉 * 和 /）
  function guessAudioNames(german) {
    const g = String(german || "").trim();
    const out = [];
    function add(value) {
      const s = String(value || "").trim();
      if (!s) return;
      const name = (s + ".mp3").toLowerCase();
      if (out.indexOf(name) === -1) out.push(name);
    }
    add(g);
    add(g.replace(/\*/g, ""));
    add(g.replace(/[*/]/g, ""));
    add(g.replace(/\*/g, "").replace(/\//g, ""));
    add(g.replace(/\*/g, "").replace(/\//g, " "));
    // 德语里 "/" 有两种含义：可分动词（vor/haben，去掉斜杠才是文件名）
    // 和异体写法（gern/gerne，实际文件常只取其中一段）。后一种再补两个候选。
    const parts = g.replace(/\*/g, "").split("/");
    if (parts.length > 1) {
      add(parts[0]);
      add(parts[1]);
    }
    return out;
  }

  // 同名文件有多个时，优先选「和这个单元在同一个目录」的那个
  function pickFrom(list, word) {
    if (!list || list.length === 0) return null;
    if (list.length === 1) return list[0];
    if (word && word.unitPrefix) {
      const hit = list.find(function (f) {
        return (
          normPath(f.webkitRelativePath || f.name).indexOf(
            word.unitPrefix
          ) !== -1
        );
      });
      if (hit) return hit;
    }
    return list[0];
  }

  function pickByBase(base, word, index) {
    return pickFrom(index.byBase.get(base), word);
  }

  function pickByStem(stem, word, index) {
    return pickFrom(index.byStem.get(stem), word);
  }

  function pickByFold(name, word, index) {
    return pickFrom(index.byFold.get(foldName(name)), word);
  }

  function find(word, audioIndex, index) {
    index = index || (word.sourceRoot && audioIndex.byRoot && audioIndex.byRoot.get(word.sourceRoot)) || audioIndex;
    const declared = normPath(word.pronounce);
    if (declared) {
      if (index.byFull.has(declared)) return index.byFull.get(declared);
      const segs = declared.split("/");
      const tail = segs.slice(-2).join("/");
      if (index.byTail.has(tail)) return index.byTail.get(tail);
      const hit = pickByBase(segs[segs.length - 1], word, index);
      if (hit) return hit;
    }
    const names = guessAudioNames(word.german);
    for (const name of names) {
      const hit = pickByBase(name, word, index);
      if (hit) return hit;
    }
    // 再按「不带扩展名的文件名」找一遍，这样 m4a / wav 录的也能认出来
    for (const name of names) {
      const hit = pickByStem(name.replace(/\.[^.]+$/, ""), word, index);
      if (hit) return hit;
    }
    // 最后按「去掉变音符号」再找一遍
    for (const name of names) {
      const hit = pickByFold(name.replace(/\.[^.]+$/, ""), word, index);
      if (hit) return hit;
    }
    // A missing built-in recording may use a user import, never another course.
    const fallback = audioIndex.courseRoots && audioIndex.courseRoots.has(word.sourceRoot) ? audioIndex.imported : audioIndex;
    return index !== audioIndex ? find(word, fallback, fallback) : null;
  }

  return {build, find, isAudio:file => AUDIO_EXT.test(file.name)};
})();
