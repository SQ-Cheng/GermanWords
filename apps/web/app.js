// === 全局变量 ===
let currentFileWords = []; // 当前文件的全部词条
let orderedWords = [];
let isShuffled = false;
const revealedListIds = new Set();
let displayWords = []; // 当前展示列表（受筛选 / 乱序影响）
let currentIndex = 0;
let isFilterActive = false;
let searchQuery = '';
let currentView = "card";
let currentFileName = "";
let currentBookNames = [];
let loadSequence = 0;
let currentMode = "normal"; // 'normal', 'test-zh', 'test-de'
let currentAudio = null; // 当前正在播放的音频实例
let isRevealed = false; // 自测模式下是否已显示答案
let fileMap = Object.create(null);
let audioIndex = WordAudio.build([]);
let blobUrls = new Map(); // File -> blob: URL（同一个文件只创建一次）
let autoPlayTimer = null; // 自动朗读的延时器（切卡时要先取消）
let lastAutoKey = null; // 上一次已自动朗读过的“卡片状态”
let audioUnlocked = false; // 用户是否已经交互过（浏览器自动播放策略）
const STORAGE_KEY = MarkStore.key;

// === 统一的消息提示（替代原来只写 console / 弹 alert 的做法） ===
function notify(message, kind) {
  const box = document.getElementById("notice");
  if (!box) return;
  if (Array.from(box.children).some(el => el.textContent === message)) return;
  const el = document.createElement("div");
  el.className = "toast toast-" + (kind || "info");
  el.textContent = message;
  el.title = "点击关闭";
  el.onclick = function () {
    el.remove();
  };
  box.appendChild(el);
  setTimeout(function () {
    el.remove();
  }, 10000);
}

const store = MarkStore.create(() => notify('浏览器不允许保存进度，本次星标在关闭页面后会丢失。', 'warn'));
const library = StudyLibrary.create();
for (const course of StudyLibrary.courses) {
  const option = document.createElement('option');
  option.value = course.id; option.textContent = course.name;
  document.getElementById('courseSelect').appendChild(option);
}
document.getElementById('courseSelect').value = library.current().id;
document.getElementById('courseSelect').onchange = event => changeCourse(event.target.value);

// === 绑定事件 ===
document
  .getElementById("folderInput")
  .addEventListener("change", (e) => handleFiles(e.target.files));
document
  .getElementById("fileInput")
  .addEventListener("change", (e) => handleFiles(e.target.files));

// 浏览器要求先有用户交互才允许出声；记录一次即可
["pointerdown", "touchstart", "keydown"].forEach(function (type) {
  document.addEventListener(
    type,
    function () {
      audioUnlocked = true;
    },
    { once: true, passive: true }
  );
});

function buildAudioIndex(files) {
  pauseStudyAudio();
  for (const url of blobUrls.values()) URL.revokeObjectURL(url);
  blobUrls = new Map();
  audioIndex = WordAudio.build(files);
}
function findAudioFile(word) { return WordAudio.find(word, audioIndex); }

function hasAudio(word) {
  return !!findAudioFile(word);
}

function audioSource(word) {
  const file = findAudioFile(word);
  if (file && file.packagedUrl) return { url: file.packagedUrl, label: file.name };
  if (file) {
    if (!blobUrls.has(file)) blobUrls.set(file, URL.createObjectURL(file));
    return { url: blobUrls.get(file), label: file.name };
  }
  return null;
}

function playPronounce(word) {
  if (autoPlayTimer) { clearTimeout(autoPlayTimer); autoPlayTimer = null; }
  const src = audioSource(word);
  if (!src) {
    notify("「" + word.german + "」没有找到对应的音频文件", "warn");
    return;
  }
  if (currentAudio) {
    try {
      currentAudio.pause();
    } catch (e) {
      /* 忽略 */
    }
    currentAudio = null;
  }
  const audio = new Audio(src.url);
  audio.playbackRate = Playback.getRate();
  audio.addEventListener(
    "error",
    function () {
      if (currentAudio !== audio) return;
      currentAudio = null;
      notify("音频加载失败：" + src.label + "（请确认 words 文件夹完整）", "error");
    },
    { once: true }
  );
  audio.addEventListener("ended", function () {
    if (currentAudio === audio) currentAudio = null;
  });
  currentAudio = audio;
  const played = audio.play();
  if (played && typeof played.catch === "function") {
    played.catch(function (error) {
      if (currentAudio !== audio) return;
      currentAudio = null;
      if (error.name === "AbortError") return;
      if (error.name === "NotAllowedError") {
        notify("暂时无法自动播放，请点击卡片或发音按钮。", "warn");
      } else {
        notify("音频播放失败，请重试。", "error");
      }
    });
  }
}

function changePlaybackRate(value) {
  const rate = Playback.setRate(value);
  document.getElementById('playbackRate').value = String(rate);
  if (currentAudio) currentAudio.playbackRate = rate;
}
changePlaybackRate(Playback.getRate());

// === 核心逻辑 ===
async function handleFiles(files) {
  const all = Array.from(files);
  if (!all.some(file => /\.xlsx$/i.test(file.name) || WordAudio.isAudio(file))) {
    notify('没有找到 .xlsx 词表或音频文件', 'warn');
    return;
  }
  const previous = currentBookNames.slice();
  library.setImported(all);
  refreshLibrary();
  if (all.some(file => /\.xls$/i.test(file.name))) notify('已忽略旧版 .xls 文件，请另存为 .xlsx。', 'warn');
  const first = library.entries().find(entry => entry.imported);
  const chosen = first ? [first.key] : previous.filter(name => fileMap[name]);
  return loadBooks(chosen.length ? chosen : Object.keys(fileMap).slice(0, 1));
}

function refreshLibrary() {
  ++loadSequence;
  buildAudioIndex(library.files());
  currentFileWords = [];
  orderedWords = [];
  displayWords = [];
  currentFileName = '';
  currentBookNames = [];
  currentIndex = 0;
  fileMap = Object.create(null);
  const list = document.getElementById('fileList');
  list.innerHTML = '';
  const entries = library.entries();
  let group = null;
  for (const entry of entries) {
    if (entry.imported !== group) {
      group = entry.imported;
      const heading = document.createElement('li');
      heading.className = 'library-group';
      heading.textContent = group ? '我的词表（通用）' : '内置词表';
      list.appendChild(heading);
    }
    const {key, file} = entry;
    fileMap[key] = file;
    const li = document.createElement('li');
    li.className = 'file-item';
    li.dataset.fileName = key;
    li.dataset.imported = String(entry.imported);
    li.title = entry.imported ? key : file.name;
    const label = StudyLibrary.title(file) + (entry.imported ? key.slice(file.name.length) : '');
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'book-name';
    button.textContent = label;
    li.appendChild(button);
    li.onclick = () => loadFile(key);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = key;
    checkbox.setAttribute('aria-label', '选择 ' + label + ' 用于混合学习');
    checkbox.onclick = event => event.stopPropagation();
    checkbox.onchange = updateMixSelection;
    li.appendChild(checkbox);
    list.appendChild(li);
  }
  const custom = entries.filter(entry => entry.imported).length;
  document.getElementById('sidebarStatus').textContent = (entries.length - custom) + ' 份内置词表' + (custom ? ' · ' + custom + ' 份导入' : '');
  document.getElementById('courseSelect').value = library.current().id;
  updateMixSelection();
  updateUI();
}

async function changeCourse(value) {
  library.select(value);
  searchQuery = '';
  document.getElementById('wordSearch').value = '';
  isFilterActive = false;
  document.getElementById('btnFilter').classList.remove('active');
  refreshLibrary();
  await loadFile(Object.keys(fileMap)[0]);
}

async function loadBuiltInFiles(files) {
  library.setBuiltIn(files);
  refreshLibrary();
  await loadFile(Object.keys(fileMap)[0]);
}

function updateMixSelection() {
  const count = document.querySelectorAll('#fileList input:checked').length;
  const button = document.getElementById('mixBooks');
  button.disabled = count < 2;
  button.textContent = count ? '混合学习（' + count + '）' : '混合学习';
}

function loadSelectedBooks() {
  const names = Array.from(document.querySelectorAll('#fileList input:checked'), input => input.value);
  return loadBooks(names);
}

function loadFile(fileName) { return loadBooks([fileName]); }

async function loadBooks(names) {
  names = Object.keys(fileMap).filter(name => names.includes(name));
  if (!names.length) return;
  const sequence = ++loadSequence;
  pauseStudyAudio();
  try {
    const parsed = await Vocabulary.readBooks(fileMap, names);
    if (sequence !== loadSequence) return;
    currentBookNames = names;
    currentFileName = Vocabulary.selectionKey(names);
    processData(parsed.words);
    document.querySelectorAll('.file-item').forEach(el => {
      el.classList.toggle('active', names.includes(el.dataset.fileName));
      const checkbox = el.querySelector('input');
      if (checkbox) checkbox.checked = names.includes(el.dataset.fileName);
    });
    updateMixSelection();
    closeLibrary();
    parsed.warnings.forEach(warning => notify(warning, 'warn'));
    return true;
  } catch (err) {
    if (sequence === loadSequence) notify('读取词表失败：' + err.message, 'error');
  }
}

function processData(words) {
  currentFileWords = words;
  orderedWords = words.slice();
  isShuffled = false;
  document.getElementById('btnShuffle').textContent = '乱序';
  document.getElementById('btnShuffle').classList.remove('active');
  const marks = new Map();
  currentFileWords.forEach(word => {
    word.sourceBook = word.sourceBook || currentFileName;
    if (!marks.has(word.sourceBook)) marks.set(word.sourceBook, new Set(store.marks(word.sourceBook)));
    word.marked = marks.get(word.sourceBook).has(word.german);
  });
  document.getElementById("emptyState").style.display = "none";
  currentIndex = 0;
  isRevealed = false;
  lastAutoKey = null;
  refreshDisplayList();
}

// === 列表管理（筛选与排序） ===
// keepIndex：在“只看星标”里取消星标时不要跳回第一张
function refreshDisplayList(keepIndex) {
  pauseStudyAudio();
  revealedListIds.clear();
  let baseList = orderedWords.slice();

  // 筛选
  if (isFilterActive) {
    baseList = baseList.filter(function (w) {
      return w.marked;
    });
  }

  displayWords = baseList.filter(word => Vocabulary.matches(word, searchQuery));
  currentIndex = keepIndex
    ? Math.min(currentIndex, Math.max(0, displayWords.length - 1))
    : 0;
  isRevealed = false;
  lastAutoKey = null;
  updateUI();
}

function shuffleCurrentList() {
  if (!currentFileWords.length) return;
  isShuffled = !isShuffled;
  orderedWords = currentFileWords.slice();
  if (isShuffled) {
    for (let i = orderedWords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [orderedWords[i], orderedWords[j]] = [orderedWords[j], orderedWords[i]];
    }
  }
  refreshDisplayList();
  const button = document.getElementById('btnShuffle');
  button.textContent = isShuffled ? '恢复顺序' : '乱序';
  button.classList.toggle('active', isShuffled);
}

// === 模式与视图 ===
function changeMode() {
  pauseStudyAudio();
  revealedListIds.clear();
  currentMode = document.getElementById("modeSelect").value;
  isRevealed = false; // 切换模式时重置显示状态
  lastAutoKey = null;
  updateUI();
}

function toggleFilter() {
  isFilterActive = !isFilterActive;
  document
    .getElementById("btnFilter")
    .classList.toggle("active", isFilterActive);
  refreshDisplayList();
}

function pauseStudyAudio() {
  if (autoPlayTimer) { clearTimeout(autoPlayTimer); autoPlayTimer = null; }
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
}

function searchWords(value) {
  searchQuery = value.trim();
  refreshDisplayList();
}

function switchView(view) {
  pauseStudyAudio();
  currentView = view;
  document
    .getElementById("btnCardView")
    .classList.toggle("active", view === "card");
  document
    .getElementById("btnListView")
    .classList.toggle("active", view === "list");
  updateUI();
}

function toggleReveal() {
  if (!displayWords.length) return;
  if (currentMode === "normal") {
    playPronounce(displayWords[currentIndex]);
    return;
  }
  if (currentView === 'list') { toggleListReveal(displayWords[currentIndex]); return; }
  isRevealed = !isRevealed;
  renderCard(); // 需要重新渲染卡片以更新颜色
}

function getBgClass(word) {
  if (word.type.includes("名词")) {
    if (word.gender === "der") return "bg-der";
    if (word.gender === "die") return "bg-die";
    if (word.gender === "das") return "bg-das";
  }
  return "bg-other";
}

// 翻页按钮的可用状态
function updateNav() {
  const prev = document.getElementById("btnPrevCard");
  const next = document.getElementById("btnNextCard");
  if (!prev || !next) return;
  document.getElementById("cardIndexInfo").innerText = displayWords.length ? `${currentIndex + 1} / ${displayWords.length}` : "0 / 0";
  const progress = document.getElementById('studyProgress');
  progress.max = Math.max(0, displayWords.length - 1);
  progress.value = currentIndex;
  progress.disabled = displayWords.length <= 1;
  progress.style.setProperty('--progress', (displayWords.length > 1 ? currentIndex / (displayWords.length - 1) * 100 : 0) + '%');
  progress.setAttribute('aria-valuetext', displayWords.length ? `${currentIndex + 1} / ${displayWords.length}` : '0 / 0');
  prev.disabled = currentIndex <= 0;
  next.disabled =
    displayWords.length === 0 || currentIndex >= displayWords.length - 1;
}

function updateUI() {
  document.getElementById('lessonTitle').textContent = currentBookNames.length > 1 ? '混合学习' : fileMap[currentFileName] ? StudyLibrary.title(fileMap[currentFileName]) : '德语单词';
  document.getElementById('courseName').textContent = currentBookNames.length && currentBookNames.every(name => !fileMap[name].course) ? '我的词表' : library.current().name;
  document.getElementById('lessonCount').textContent = currentFileWords.length ? currentFileWords.length + ' 词' : '离线学习';
  const markedCount = currentFileWords.filter((w) => w.marked).length;
  document.getElementById(
    "btnFilter"
  ).innerText = `只看星标 (${markedCount})`;

  const cardCont = document.getElementById("cardViewContainer");
  const listCont = document.getElementById("listViewContainer");
  const emptyEl = document.getElementById("emptyState");
  emptyEl.style.display = "none";

  if (displayWords.length === 0) {
    if ((isFilterActive || searchQuery) && currentFileWords.length > 0) {
      cardCont.style.display = currentView === "card" ? "flex" : "none";
      listCont.style.display = currentView === "list" ? "flex" : "none";
      renderEmptyView();
    } else {
      cardCont.style.display = "none";
      listCont.style.display = "none";
      emptyEl.style.display = "flex";
    }
    updateNav();
    return;
  }

  if (currentView === "card") {
    cardCont.style.display = "flex";
    listCont.style.display = "none";
    renderCard();
  } else {
    cardCont.style.display = "none";
    listCont.style.display = "flex";
    renderList();
  }
  updateNav();
}

function renderEmptyView() {
  if (currentView === "card") {
    const cardEl = document.getElementById("cardView");
    cardEl.className = "card bg-other";
    document.getElementById("germanArea").classList.remove("hidden-content");
    document.getElementById("cardGerman").innerText = searchQuery ? "未找到匹配单词" : "没有星标单词";
    document.getElementById("chineseArea").style.visibility = "hidden";
    document.getElementById("metaArea").style.visibility = "hidden";
    document.getElementById("cardIndexInfo").innerText = "";
    document.getElementById("pronounceIcon").style.display = "none";
    document.getElementById("exampleArea").style.display = "none";
    document.getElementById("clickHint").style.opacity = "0";
    cardEl.classList.remove("marked");
  } else {
    const cols = document.querySelectorAll("#wordTable thead th").length || 5;
    document.querySelector("#wordTable tbody").innerHTML =
      '<tr><td colspan="' +
      cols +
      '" style="text-align:center;padding:30px;color:var(--muted);">' + (searchQuery ? '未找到匹配单词' : '没有星标单词') + '</td></tr>';
  }
}

function renderCard(preview = false) {
  const word = displayWords[currentIndex];
  const cardEl = document.getElementById("cardView");

  // 1. 设置背景色 (核心修改逻辑)
  // 如果不是普通模式，且答案未揭晓，强制使用白色背景 (bg-other)
  let bgClass = getBgClass(word);
  if (currentMode !== "normal" && !isRevealed) {
    bgClass = "bg-other";
  }

  cardEl.className = `card ${bgClass}`;
  if (word.marked) cardEl.classList.add("marked");
  else cardEl.classList.remove("marked");
  const star = document.querySelector('.star-mark');
  star.textContent = word.marked ? '★' : '☆';
  star.setAttribute('aria-pressed', String(word.marked));

  // 2. 填充内容
  const germanEl = document.getElementById("cardGerman");
  if (
    word.type.includes("名词") &&
    ["der", "die", "das"].includes(word.gender)
  ) {
    germanEl.innerHTML = `<span class="article-hint">${word.gender}</span>`;
    germanEl.appendChild(document.createTextNode(word.german));
  } else {
    germanEl.textContent = word.german;
  }
  document.getElementById("cardChinese").innerText = word.chinese;

  document.getElementById("cardType").innerText = word.type;
  const genderEl = document.getElementById("cardGender");
  if (word.type.includes("名词") && word.gender) {
    genderEl.innerText = word.gender.toUpperCase();
    genderEl.style.display = "inline-block";
  } else {
    genderEl.style.display = "none";
  }
  document.getElementById("cardPlural").innerText =
    word.type.includes("名词") && word.plural
      ? `Plural: ${word.plural}`
      : "";

  // 例句：没有例句就整块收起，不留空白
  const exampleArea = document.getElementById("exampleArea");
  if (word.example) {
    document.getElementById("cardExample").innerText = word.example;
    exampleArea.style.display = "";
  } else {
    document.getElementById("cardExample").innerText = "";
    exampleArea.style.display = "none";
  }

  // 3. 自测模式显隐逻辑
  const germanArea = document.getElementById("germanArea");
  const chineseArea = document.getElementById("chineseArea");
  const metaArea = document.getElementById("metaArea");
  const hintText = document.getElementById("clickHint");

  // 默认全部显示
  germanArea.classList.remove("hidden-content");
  chineseArea.classList.remove("hidden-content");
  metaArea.classList.remove("hidden-content");
  exampleArea.classList.remove("hidden-content");
  hintText.style.opacity = "0";
  chineseArea.style.visibility = '';
  metaArea.style.visibility = '';

  // 例句在自测模式下必须等揭晓后才出现（例句里通常就有这个词）
  if (currentMode !== "normal" && !isRevealed && word.example) {
    exampleArea.classList.add("hidden-content");
  }

  if (currentMode === "test-zh") {
    // 中文自测：一开始只显示中文
    if (!isRevealed) {
      germanArea.classList.add("hidden-content");
      metaArea.classList.add("hidden-content");
      hintText.style.opacity = "1";
    }
  } else if (currentMode === "test-de") {
    // 德语自测：一开始只显示德语（隐藏中文）
    if (!isRevealed) {
      chineseArea.classList.add("hidden-content");
      hintText.style.opacity = "1";
    }
  }

  // ===== 发音功能 =====
  const pronounceIcon = document.getElementById("pronounceIcon");
  if (hasAudio(word)) {
    pronounceIcon.style.display = "inline";
    pronounceIcon.onclick = function (e) {
      e.stopPropagation(); // 阻止卡片整体的 toggleReveal 事件
      playPronounce(word);
    };
  } else {
    pronounceIcon.style.display = "none";
    pronounceIcon.onclick = null;
  }

  // ===== 自动朗读 =====
  // 4.0 修正：原来每次重绘都延时播放，导致快速翻卡时播出“上一张”的词、
  // 按 Q 揭晓答案时重复播放。现在只在“德语可见”且内容确实变化时播一次。
  const germanVisible =
    currentMode === "normal" || currentMode === "test-de" || isRevealed;
  pronounceIcon.style.display = germanVisible && hasAudio(word) ? 'inline-flex' : 'none';
  const autoKey =
    currentFileName +
    "#" +
    word.id +
    "#" +
    currentMode +
    "#" +
    (germanVisible ? "visible" : "hidden");
  if (!preview && autoKey !== lastAutoKey) {
    pauseStudyAudio();
    lastAutoKey = autoKey;
    if (germanVisible && hasAudio(word) && audioUnlocked) {
      autoPlayTimer = setTimeout(function () {
        autoPlayTimer = null;
        playPronounce(word);
      }, 120);
    }
  }

  document.getElementById("cardIndexInfo").innerText = `${
    currentIndex + 1
  } / ${displayWords.length}`;
  updateNav();
}

function renderList() {
  const tbody = document.querySelector("#wordTable tbody");
  tbody.innerHTML = "";

  displayWords.forEach(function (word, index) {
    const revealed = currentMode === 'normal' || revealedListIds.has(word.id);
    const germanVisible = currentMode !== 'test-zh' || revealed;
    const chineseVisible = currentMode !== 'test-de' || revealed;
    const tr = document.createElement("tr");
    tr.className = revealed ? getBgClass(word) : 'bg-other';
    if (word.marked) tr.classList.add("marked");

    const displayG =
      word.type.includes("名词") &&
      ["der", "die", "das"].includes(word.gender)
        ? word.gender + " " + word.german
        : word.german;

    // 逐格用 textContent 填充：词条里出现 < > & 也不会把表格结构弄坏
    [
      germanVisible ? displayG : '',
      chineseVisible ? word.chinese : '',
      germanVisible ? word.type : '',
      germanVisible ? word.plural || '' : '',
      revealed ? word.example || '' : '',
    ].forEach(
      function (text) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      }
    );

    const tdPronounce = document.createElement('td');
    tdPronounce.className = 'pronounce-cell';
    if (germanVisible && hasAudio(word)) {
      const audio = document.createElement('button');
      audio.textContent = '🔊';
      audio.setAttribute('aria-label', '播放发音');
      audio.onclick = event => { event.stopPropagation(); playPronounce(word); };
      tdPronounce.appendChild(audio);
    }
    const star = document.createElement('button');
    star.textContent = word.marked ? '★' : '☆';
    star.setAttribute('aria-label', '星标单词');
    star.onclick = event => { event.stopPropagation(); currentIndex=index; toggleMark(word); };
    tdPronounce.appendChild(star);
    if (currentMode !== 'normal') {
      const answer = document.createElement('button');
      answer.className = 'list-answer';
      answer.textContent = revealed ? '隐藏答案' : '显示答案';
      answer.onclick = event => { event.stopPropagation(); currentIndex=index; toggleListReveal(word); };
      tdPronounce.appendChild(answer);
    }
    tr.appendChild(tdPronounce);
    tr.tabIndex = 0;
    tr.onclick = () => {
      currentIndex=index;
      if (currentMode === 'normal') toggleMark(word); else toggleListReveal(word);
    };
    tr.onkeydown = event => {
      if (event.target !== tr || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      currentIndex=index;
      if (event.key === ' ' || currentMode === 'normal') toggleMark(word); else toggleListReveal(word);
    };
    tbody.appendChild(tr);
  });
}

function toggleListReveal(word) {
  pauseStudyAudio();
  if (revealedListIds.has(word.id)) revealedListIds.delete(word.id); else revealedListIds.add(word.id);
  renderList();
}

// === 交互操作 ===
function nextCard() {
  if (currentIndex < displayWords.length - 1) navigateTo(currentIndex + 1);
}

function prevCard() {
  if (currentIndex > 0) navigateTo(currentIndex - 1);
}

function navigateTo(index) {
  if (!Number.isInteger(index) || !displayWords.length) return;
  pauseStudyAudio();
  lastAutoKey = null;
  index = Math.max(0, Math.min(displayWords.length - 1, index));
  currentIndex = index;
  isRevealed = false;
  updateUI();
  if (currentView === 'list') document.querySelectorAll('#wordTable tbody tr')[index].scrollIntoView({block:'nearest'});
  else document.querySelector('.card-body').scrollTop = 0;
}

function previewProgress(value) {
  const index = Number(value);
  if (!Number.isInteger(index) || !displayWords.length) return;
  pauseStudyAudio();
  currentIndex = Math.max(0, Math.min(displayWords.length - 1, index));
  isRevealed = false;
  if (currentView === 'card') {
    document.querySelector('.card-body').scrollTop = 0;
    renderCard(true);
  } else document.querySelectorAll('#wordTable tbody tr')[currentIndex].scrollIntoView({block:'nearest'});
  updateNav();
}

function toggleCurrentMark() {
  if (displayWords.length > 0) toggleMark(displayWords[currentIndex]);
}

function toggleMark(wordObj) {
  wordObj.marked = !wordObj.marked;
  const book = wordObj.sourceBook || currentFileName;
  currentFileWords.forEach(word => {
    if ((word.sourceBook || currentFileName) === book && word.german === wordObj.german) word.marked = wordObj.marked;
  });
  store.setMark(book, wordObj.german, wordObj.marked);

  if (isFilterActive && !wordObj.marked) {
    refreshDisplayList(true);
  } else {
    updateUI();
  }
}

// === 键盘事件 ===
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") closeLibrary();
  if (document.querySelector("dialog[open]") || document.body.classList.contains("library-open")) return;
  if (displayWords.length === 0) return;

  // 焦点在输入控件里时不抢按键
  const tag = (e.target && e.target.tagName) || "";
  if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(tag)) return;

  const key = String(e.key || "").toLowerCase();

  if (key === "4") {
    nextCard();
  } else if (key === "2") {
    prevCard();
  } else if (key === "arrowright" && currentView === "card") {
    e.preventDefault();
    nextCard();
  } else if (key === "arrowleft" && currentView === "card") {
    e.preventDefault();
    prevCard();
  } else if (key === "q") {
    toggleReveal();
  } else if (e.code === "Space") {
    e.preventDefault();
    toggleCurrentMark();
  }
});

function focusStudy() {
  if (!document.querySelector('dialog[open]') && !document.body.classList.contains('library-open'))
    document.querySelector('.main-content').focus({preventScroll:true});
}

function closeLibrary() {
  document.body.classList.remove('library-open');
  document.getElementById('openLibrary').setAttribute('aria-expanded', 'false');
  focusStudy();
}
document.getElementById('openLibrary').onclick = () => {
  document.body.classList.add('library-open');
  document.getElementById('openLibrary').setAttribute('aria-expanded', 'true');
};
document.getElementById('closeLibrary').onclick = closeLibrary;
document.getElementById('scrim').onclick = closeLibrary;
document.getElementById('mixBooks').onclick = loadSelectedBooks;
document.getElementById('playbackRate').onchange = event => changePlaybackRate(event.target.value);
document.getElementById('themeSelect').onchange = event => AppTheme.setMode(event.target.value);
document.getElementById('wordSearch').oninput = event => searchWords(event.target.value);
document.getElementById('modeSelect').onchange = changeMode;
document.getElementById('btnShuffle').onclick = shuffleCurrentList;
document.getElementById('btnCardView').onclick = () => switchView('card');
document.getElementById('btnListView').onclick = () => switchView('list');
document.getElementById('btnFilter').onclick = toggleFilter;
document.getElementById('btnPrevCard').onclick = event => { event.stopPropagation(); prevCard(); };
document.getElementById('btnNextCard').onclick = event => { event.stopPropagation(); nextCard(); };

document.getElementById('studyProgress').oninput = event => previewProgress(event.target.value);
document.getElementById('studyProgress').onchange = event => navigateTo(Number(event.target.value));
document.getElementById('cardView').onclick = toggleReveal;
document.querySelector('.star-mark').onclick = event => { event.stopPropagation(); toggleCurrentMark(); };

// Pointer actions return to study; keyboard-operated controls keep their focus.
let pointerControl = null;
document.addEventListener('pointerdown', event => { pointerControl = event.target.closest('select, input[type="range"]'); }, true);
document.addEventListener('keydown', () => { pointerControl = null; }, true);
document.addEventListener('click', event => {
  if (event.detail > 0 && event.target.closest('button, input[type="checkbox"]') && !event.target.closest('dialog')) focusStudy();
}, true);
document.addEventListener('change', event => {
  if (event.target === pointerControl || event.target.type === 'file') { pointerControl = null; focusStudy(); }
});
document.addEventListener('close', event => { if (event.target.tagName === 'DIALOG') focusStudy(); }, true);
document.getElementById('wordSearch').onkeydown = event => {
  if (event.key === 'Enter') { event.preventDefault(); focusStudy(); }
};
