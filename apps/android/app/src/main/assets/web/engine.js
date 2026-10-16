
      const { normPath, parseSheets } = WordParser;

      // === 全局变量 ===
      let currentFileWords = []; // 当前文件的全部词条
      let orderedWords = []; // 完整词表的当前顺序，筛选不改变它
      let isShuffled = false;
      const revealedListIds = new Set();
      let displayWords = []; // 当前展示列表（受筛选 / 乱序影响）
      let currentIndex = 0;
      let isFilterActive = false;
      let currentView = "card";
      let currentFileName = "";
      let currentMode = "normal"; // 'normal', 'test-zh', 'test-de'
      let currentAudio = null; // 当前正在播放的音频实例
      let isRevealed = false; // 自测模式下是否已显示答案
      let fileMap = Object.create(null);
      let loadSequence = 0;
      let audioIndex = {
        byFull: new Map(),
        byTail: new Map(),
        byBase: new Map(),
        byStem: new Map(),
      };
      let blobUrls = new Map(); // File -> blob: URL（同一个文件只创建一次）
      let autoPlayTimer = null; // 自动朗读的延时器（切卡时要先取消）
      let lastAutoKey = null; // 上一次已自动朗读过的“卡片状态”
      let audioUnlocked = false; // 用户是否已经交互过（浏览器自动播放策略）
      const STORAGE_KEY = "german_app_memory";

      // === 统一的消息提示（替代原来只写 console / 弹 alert 的做法） ===
      function notify(message, kind) {
        const box = document.getElementById("notice");
        if (!box) return;
        // Only suppress duplicates while the message is visible; later retries still report errors.
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

      // 兼容变音字符、不同 Unicode 形式及解压工具改过的文件名。
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

      // === 进度存储：localStorage 不可用时降级到内存，并明确告知用户 ===
      const store = (function () {
        const memory = Object.create(null);
        let usable = false;
        try {
          window.localStorage.setItem("__probe__", "1");
          window.localStorage.removeItem("__probe__");
          usable = true;
        } catch (e) {
          usable = false;
        }

        function readAll() {
          try {
            const raw = usable
              ? window.localStorage.getItem(STORAGE_KEY)
              : memory[STORAGE_KEY];
            if (!raw) return {};
            const data = JSON.parse(raw);
            return data && typeof data === "object" && !Array.isArray(data) ? data : {};
          } catch (e) {
            return {};
          }
        }

        function writeAll(data) {
          const raw = JSON.stringify(data);
          if (usable) {
            try {
              window.localStorage.setItem(STORAGE_KEY, raw);
              return true;
            } catch (e) {
              usable = false;
            }
          }
          memory[STORAGE_KEY] = raw;
          return false;
        }

        return {
          marks: function (fileName) {
            const list = readAll()[fileName];
            return Array.isArray(list) ? list : [];
          },
          setMark: function (fileName, word, isMarked) {
            const all = readAll();
            if (!Array.isArray(all[fileName])) all[fileName] = [];
            const list = all[fileName];
            const at = list.indexOf(word);
            if (isMarked && at === -1) list.push(word);
            else if (!isMarked && at !== -1) list.splice(at, 1);
            if (!writeAll(all)) {
              notify(
                "无法保存星标，请检查手机存储空间。",
                "warn"
              );
            }
          },
        };
      })();

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

      // === 音频索引：按文件夹里的真实文件建索引，用来修正路径大小写等问题 ===
      // 老师自己录的音频可能是 m4a / wav 等格式，这里一并接受
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

      function buildAudioIndex(files) {
        for (const url of blobUrls.values()) URL.revokeObjectURL(url);
        blobUrls = new Map();
        audioIndex = makeAudioIndex(files);
        audioIndex.byRoot = new Map();
        const groups = new Map();
        for (const file of files) if (file.root) {
          if (!groups.has(file.root)) groups.set(file.root, []);
          groups.get(file.root).push(file);
        }
        for (const [root, members] of groups) audioIndex.byRoot.set(root, makeAudioIndex(members));
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
        return pickFrom((index || audioIndex).byBase.get(base), word);
      }

      function pickByStem(stem, word, index) {
        return pickFrom((index || audioIndex).byStem.get(stem), word);
      }

      function pickByFold(name, word, index) {
        return pickFrom((index || audioIndex).byFold.get(foldName(name)), word);
      }

      function findAudioFile(word, index) {
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
        return index !== audioIndex ? findAudioFile(word, audioIndex) : null;
      }

      function hasAudio(word) {
        return !!findAudioFile(word);
      }

      function audioSource(word) {
        const file = findAudioFile(word);
        if (file) {
          if (file.url) return { url: file.url, label: file.name };
          if (!blobUrls.has(file)) blobUrls.set(file, URL.createObjectURL(file));
          return { url: blobUrls.get(file), label: file.name };
        }
        // 没有拿到文件夹里的文件时，退回按相对路径播放（HTML 与 words 同级时可用）
        if (word.pronounce) {
          return { url: String(word.pronounce), label: String(word.pronounce) };
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
        if (window.Android) { Android.play(new URL(src.url, location.href).href); return; }
        const audio = new Audio(src.url);
        audio.addEventListener(
          "error",
          function () {
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
          played.catch(function () {
            notify("浏览器拦截了自动播放，点一下卡片或 🔊 即可播放", "warn");
          });
        }
      }

      // === 核心逻辑 ===
      function handleFiles(files) {
        const all = Array.from(files);
        buildAudioIndex(all);

        const bookFiles = all
          .filter(function (f) {
            return /\.xlsx$/i.test(f.name);
          })
          .sort(function (a, b) {
            // 按文件名里的第一个数字排（E1…E7），没有数字的（虚词大盘点）放最后
            const na = (a.name.match(/[0-9]+/) || [Number.MAX_SAFE_INTEGER])[0];
            const nb = (b.name.match(/[0-9]+/) || [Number.MAX_SAFE_INTEGER])[0];
            if (na !== nb) return Number(na) - Number(nb);
            return a.name.localeCompare(b.name, "zh");
          });
        const legacy = all.filter(function (f) {
          return /\.xls$/i.test(f.name);
        });

        fileMap = Object.create(null);
        const fileListEl = document.getElementById("fileList");
        fileListEl.innerHTML = "";
        for (const file of bookFiles) {
          let key = file.name;
          if (fileMap[key]) key = file.name + " · " + (file.webkitRelativePath || "导入词表");
          fileMap[key] = file;
          const li = document.createElement("li");
          li.className = "file-item";
          li.dataset.fileName = key;
          li.textContent = key;
          li.onclick = function () {
            loadFile(key);
          };
          fileListEl.appendChild(li);
        }

        if (bookFiles.length === 0) {
          fileListEl.innerHTML =
            '<li style="padding:20px;text-align:center;color:#d32f2f;">没找到 .xlsx 词表<br>请选中包含 words 的整个文件夹</li>';
          notify(
            "没找到 .xlsx 词表。请点「导入文件夹」，选中装有 words 的那个文件夹。",
            "error"
          );
          return;
        }
        if (legacy.length) {
          notify(
            "已忽略 " +
              legacy.length +
              " 个旧版 .xls 文件：只支持 .xlsx，请在 Excel/WPS 里另存为 .xlsx。",
            "warn"
          );
        }
        // 导入结果写在侧边栏底部，不再弹提示条（每次都弹太吵）
        const statusEl = document.getElementById("sidebarStatus");
        if (statusEl) {
          statusEl.textContent =
            "已导入 " +
            bookFiles.length +
            " 个词表 · " +
            Math.max(0, all.length - bookFiles.length - legacy.length) +
            " 个音频文件";
        }
      }

      async function loadFile(fileName) {
        const sequence = ++loadSequence;
        pauseStudyAudio();
        restoring = true;
        let success = false;
        try {
          const sheets = await WordParser.read(fileMap[fileName], window.Android ? inflateXlsx : undefined);
          if (sequence !== loadSequence) return;
          const parsed = parseSheets(sheets);
          if (parsed.words.length === 0) {
            notify(
              "「" +
                fileName +
                "」里没读到单词。请确认第一行是表头（德语 / 汉语 / 词性…）。",
              "error"
            );
            return;
          }
          currentFileName = fileName;
          processData(parsed.words, preferences.books[fileName]);
          document.querySelectorAll(".file-item").forEach(el => {
            el.classList.toggle("active", el.dataset.fileName === fileName);
          });
          closeLibrary();
          success = true;
          parsed.warnings.forEach(function (w) {
            notify(w, "warn");
          });
          return success;
        } catch (err) {
          if (sequence !== loadSequence) return;
          notify(
            "读取「" + fileName + "」失败：" + (err && err.message ? err.message : err),
            "error"
          );
        } finally {
          if (sequence === loadSequence) {
            restoring = false;
            if (success) saveStudy();
          }
        }
      }

      function processData(words, saved) {
        currentFileWords = words;
        const source = fileMap[currentFileName];
        currentFileWords.forEach(w => w.sourceRoot = source && source.root);
        const savedMarks = store.marks(currentFileName);
        currentFileWords.forEach(function (w) {
          w.marked = savedMarks.indexOf(w.german) !== -1;
        });
        orderedWords = currentFileWords.slice();
        isShuffled = !!(saved && saved.shuffled);
        // Migrate the 1.0.0 saved order, including incomplete lists saved during a star filter.
        if (saved && Array.isArray(saved.order)) {
          const ranks = new Map(saved.order.map((id, i) => [id, i]));
          if (saved.shuffled === undefined) {
            isShuffled = saved.order.length === words.length && saved.order.some((id, i) => id !== words[i].id);
          }
          if (isShuffled) orderedWords.sort((a, b) =>
            (ranks.has(a.id) ? ranks.get(a.id) : Infinity) - (ranks.has(b.id) ? ranks.get(b.id) : Infinity));
        }
        revealedListIds.clear();
        document.getElementById("emptyState").style.display = "none";
        currentIndex = 0;
        isRevealed = false;
        lastAutoKey = null;
        refreshDisplayList(false, saved && saved.word);
      }

      // === 列表管理（筛选与排序） ===
      // keepIndex：在“只看星标”里取消星标时不要跳回第一张
      function refreshDisplayList(keepIndex, selectedId) {
        pauseStudyAudio();
        let baseList = orderedWords.slice();

        // 筛选
        if (isFilterActive) {
          baseList = baseList.filter(function (w) {
            return w.marked;
          });
        }

        displayWords = baseList;
        currentIndex = keepIndex
          ? Math.min(currentIndex, Math.max(0, displayWords.length - 1))
          : 0;
        const selected = selectedId ? displayWords.findIndex(w => w.id === selectedId) : -1;
        if (selected >= 0) currentIndex = selected;
        isRevealed = false;
        lastAutoKey = null;
        updateUI();
      }

      function shuffleCurrentList() {
        if (currentFileWords.length === 0) return;
        isShuffled = !isShuffled;
        orderedWords = currentFileWords.slice();
        if (isShuffled) {
          for (let i = orderedWords.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [orderedWords[i], orderedWords[j]] = [orderedWords[j], orderedWords[i]];
          }
        }
        revealedListIds.clear();
        refreshDisplayList();
      }

      // === 模式与视图 ===
      function changeMode() {
        pauseStudyAudio();
        currentMode = document.getElementById("modeSelect").value;
        isRevealed = false; // 切换模式时重置显示状态
        revealedListIds.clear();
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

      function switchView(view) {
        pauseStudyAudio();
        lastAutoKey = null;
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
        if (currentMode === "normal" || !displayWords.length) return;
        if (currentView === "list") { toggleListReveal(displayWords[currentIndex]); return; }
        isRevealed = !isRevealed;
        updateUI();
      }

      function getBgClass(word) {
        if (word.type.includes("名词")) {
          if (word.gender === "der") return "bg-der";
          if (word.gender === "die") return "bg-die";
          if (word.gender === "das") return "bg-das";
        }
        return "bg-other";
      }

      function updateUI() {
        const markedCount = currentFileWords.filter((w) => w.marked).length;
        document.getElementById(
          "btnFilter"
        ).innerText = `只看星标 (${markedCount})`;

        const cardCont = document.getElementById("cardViewContainer");
        const listCont = document.getElementById("listViewContainer");
        const emptyEl = document.getElementById("emptyState");
        emptyEl.style.display = "none";
        if (displayWords.length === 0) {
          if (isFilterActive && currentFileWords.length > 0) {
            cardCont.style.display = currentView === "card" ? "flex" : "none";
            listCont.style.display = currentView === "list" ? "flex" : "none";
            renderEmptyView();
          } else {
            cardCont.style.display = "none";
            listCont.style.display = "none";
            emptyEl.style.display = "flex";
          }
        } else if (currentView === "card") {
          cardCont.style.display = "flex";
          listCont.style.display = "none";
          renderCard();
        } else {
          cardCont.style.display = "none";
          listCont.style.display = "flex";
          renderList();
        }
        paintStudy();
        saveStudy();
      }

      function renderEmptyView() {
        if (currentView === "card") {
          const cardEl = document.getElementById("cardView");
          cardEl.className = "card bg-other";
          document.getElementById("germanArea").classList.remove("hidden-content");
          document.getElementById("cardGerman").innerText = "没有星标单词";
          document.getElementById("chineseArea").style.visibility = "hidden";
          document.getElementById("metaArea").style.visibility = "hidden";
          document.getElementById("cardIndexInfo").innerText = "";
          document.getElementById("pronounceIcon").style.display = "none";
          document.getElementById("exampleArea").style.display = "none";
          document.getElementById("clickHint").style.opacity = "0";
          document.getElementById("clickHint").hidden = true;
          cardEl.classList.remove("marked");
        } else {
          const cols = document.querySelectorAll("#wordTable thead th").length || 5;
          document.querySelector("#wordTable tbody").innerHTML =
            '<tr><td colspan="' +
            cols +
            '" style="text-align:center;padding:30px;color:#999;">没有星标单词</td></tr>';
        }
      }

      function renderCard() {
        const word = displayWords[currentIndex];
        if (!word) return;
        const cardEl = document.getElementById("cardView");
        const wordKey = currentFileName + "#" + word.id;
        if (cardEl.dataset.word !== wordKey) {
          document.querySelector('.card-body').scrollTop = 0;
          cardEl.dataset.word = wordKey;
        }

        // 1. 设置背景色 (核心修改逻辑)
        // 如果不是普通模式，且答案未揭晓，强制使用白色背景 (bg-other)
        let bgClass = getBgClass(word);
        if (currentMode !== "normal" && !isRevealed) {
          bgClass = "bg-other";
        }

        cardEl.className = `card ${bgClass}`;
        if (word.marked) cardEl.classList.add("marked");
        else cardEl.classList.remove("marked");

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
        chineseArea.style.visibility = "";
        metaArea.style.visibility = "";
        hintText.style.opacity = "0";
        hintText.hidden = currentMode === "normal" || isRevealed;

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
        pronounceIcon.style.display = germanVisible && hasAudio(word) ? "inline-flex" : "none";
        const autoKey =
          currentFileName +
          "#" +
          word.id +
          "#" +
          currentMode +
          "#" +
          (germanVisible ? "visible" : "hidden");
        if (autoKey !== lastAutoKey) {
          pauseStudyAudio();
          lastAutoKey = autoKey;
          if (autoPlayEnabled && germanVisible && hasAudio(word) && audioUnlocked) {
            autoPlayTimer = setTimeout(function () {
              autoPlayTimer = null;
              playPronounce(word);
            }, 120);
          }
        }

        document.getElementById("cardIndexInfo").innerText = `${
          currentIndex + 1
        } / ${displayWords.length}`;
      }

      function renderList() {
        const tbody = document.querySelector("#wordTable tbody");
        const scroll = document.querySelector(".table-scroll");
        const scrollTop = scroll.scrollTop;
        tbody.innerHTML = "";
        document.querySelector(".list-tip").textContent = currentMode === "normal"
          ? "轻点词条切换星标，点 ♪ 听发音" : "轻点词条查看答案，点 ☆ 切换星标";
        displayWords.forEach(function (word, index) {
          const tr = document.createElement("tr");
          const revealed = currentMode === "normal" || revealedListIds.has(word.id);
          const showGerman = currentMode !== "test-zh" || revealed;
          const showChinese = currentMode !== "test-de" || revealed;
          tr.className = revealed ? getBgClass(word) : "bg-other";
          tr.dataset.wordId = word.id;
          tr.tabIndex = 0;
          tr.onfocus = function () { currentIndex = index; };
          if (word.marked) tr.classList.add("marked");

          const displayG =
            word.type.includes("名词") &&
            ["der", "die", "das"].includes(word.gender)
              ? word.gender + " " + word.german
              : word.german;

          // 逐格用 textContent 填充：词条里出现 < > & 也不会把表格结构弄坏
          [
            showGerman ? displayG : "",
            showChinese ? word.chinese : "",
            showGerman ? word.type : "",
            showGerman ? word.plural || "" : "",
            revealed ? word.example || "" : "",
          ].forEach(
            function (text) {
              const td = document.createElement("td");
              td.textContent = text;
              tr.appendChild(td);
            }
          );

          const tdPronounce = document.createElement("td");
          tdPronounce.className = "pronounce-cell";
          const star = document.createElement("button");
          star.className = "list-star";
          star.textContent = word.marked ? "★" : "☆";
          star.setAttribute("aria-label", "星标 " + (showGerman ? word.german : word.chinese));
          star.setAttribute("aria-pressed", String(word.marked));
          star.onclick = function (e) { e.stopPropagation(); currentIndex = index; toggleMark(word); };
          tdPronounce.appendChild(star);
          if (showGerman && hasAudio(word)) {
            const audio = document.createElement("button");
            audio.className = "list-audio";
            audio.textContent = "♪";
            audio.setAttribute("aria-label", "播放发音");
            audio.onclick = function (e) { e.stopPropagation(); currentIndex = index; playPronounce(word); };
            tdPronounce.appendChild(audio);
          }
          tr.appendChild(tdPronounce);
          if (currentMode !== "normal") {
            const answerCell = document.createElement("td");
            answerCell.className = "list-answer";
            const answer = document.createElement("button");
            answer.textContent = revealed ? "隐藏答案" : "显示答案";
            answer.setAttribute("aria-expanded", String(revealed));
            answer.onclick = function (e) { e.stopPropagation(); currentIndex = index; toggleListReveal(word); };
            answerCell.appendChild(answer);
            tr.appendChild(answerCell);
          }
          tr.onclick = function () {
            currentIndex = index;
            if (currentMode === "normal") toggleMark(word); else toggleListReveal(word);
          };
          tr.onkeydown = function (e) {
            if (e.target !== tr || !["Enter", " "].includes(e.key)) return;
            e.preventDefault(); e.stopPropagation(); currentIndex = index;
            if (e.key === " " || currentMode === "normal") toggleMark(word); else toggleListReveal(word);
          };
          tbody.appendChild(tr);
        });
        scroll.scrollTop = scrollTop;
      }

      function toggleListReveal(word) {
        if (currentMode === "normal" || !word) return;
        pauseStudyAudio();
        const revealed = !revealedListIds.has(word.id);
        if (revealed) revealedListIds.add(word.id); else revealedListIds.delete(word.id);
        updateUI();
        if (revealed && currentMode === "test-zh" && autoPlayEnabled && hasAudio(word)) playPronounce(word);
      }

      // === 交互操作 ===
      function nextCard() {
        if (currentIndex < displayWords.length - 1) {
          currentIndex++;
          isRevealed = false;
          updateUI();
        }
      }

      function prevCard() {
        if (currentIndex > 0) {
          currentIndex--;
          isRevealed = false;
          updateUI();
        }
      }

      function toggleCurrentMark() {
        if (displayWords.length > 0) toggleMark(displayWords[currentIndex]);
      }

      function toggleMark(wordObj) {
        wordObj.marked = !wordObj.marked;

        currentFileWords.forEach(w => { if (w.german === wordObj.german) w.marked = wordObj.marked; });

        store.setMark(currentFileName, wordObj.german, wordObj.marked);

        if (isFilterActive && !wordObj.marked) {
          refreshDisplayList(true);
        } else {
          updateUI();
        }
      }

      // === 键盘事件 ===
      document.addEventListener("keydown", function (e) {
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
