// Shared XLSX and vocabulary parsing. Platform code supplies native inflation when needed.
const WordParser = (function () {
  const utf8 = new TextDecoder("utf-8");

  function unescapeXml(s) {
    if (s.indexOf("&") < 0) return s;
    return s
      .replace(/&#x([0-9a-fA-F]+);/g, function (_m, h) {
        return String.fromCodePoint(parseInt(h, 16));
      })
      .replace(/&#([0-9]+);/g, function (_m, d) {
        return String.fromCodePoint(parseInt(d, 10));
      })
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  // 取出一段 XML 中所有 <t>…</t> 的文本（富文本会被拆成多段，需要拼接）
  function tagText(fragment) {
    let out = "";
    let m;
    const re = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g;
    while ((m = re.exec(fragment)) !== null) {
      out += m[1] ? unescapeXml(m[1]) : "";
    }
    return out;
  }

  // 解析 zip 目录，得到 名称 -> { method, compSize, dataStart }
  function zipEntries(u8) {
    const len = u8.length;
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    const min = Math.max(0, len - 22 - 65535);
    for (let i = len - 22; i >= min; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) {
      throw new Error(
        "不是有效的 .xlsx 文件（请在 Excel / WPS 里另存为 .xlsx）"
      );
    }
    const count = dv.getUint16(eocd + 10, true);
    const cdOffset = dv.getUint32(eocd + 16, true);
    const map = new Map();
    let p = cdOffset;
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const compSize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = utf8.decode(u8.subarray(p + 46, p + 46 + nameLen));
      const lNameLen = dv.getUint16(localOff + 26, true);
      const lExtraLen = dv.getUint16(localOff + 28, true);
      map.set(name, {
        method: method,
        compSize: compSize,
        localOff: localOff,
        dataStart: localOff + 30 + lNameLen + lExtraLen,
      });
      p += 46 + nameLen + extraLen + commentLen;
    }
    if (map.size === 0) throw new Error("这个文件里没有任何内容");
    // 少数写入器会把压缩后的长度写成 0，用下一个条目的位置兜底
    const list = Array.from(map.values());
    for (const entry of list) {
      if (!entry.compSize) {
        let next = cdOffset;
        for (const other of list) {
          if (other.localOff > entry.localOff && other.localOff < next) {
            next = other.localOff;
          }
        }
        entry.compSize = next - entry.dataStart;
      }
    }
    return map;
  }

  async function readEntry(u8, entry, inflateRaw) {
    const data = u8.subarray(
      entry.dataStart,
      entry.dataStart + entry.compSize
    );
    if (entry.method === 0) return data;
    if (entry.method !== 8) {
      throw new Error("不支持的压缩方式（method " + entry.method + "）");
    }
    return inflateRaw(data);
  }

  async function inflateBrowser(data) {
    const stream = new Blob([data])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  // "AB12" -> 27
  function colIndex(ref) {
    let n = 0;
    for (let i = 0; i < ref.length; i++) {
      const c = ref.charCodeAt(i);
      if (c >= 65 && c <= 90) n = n * 26 + (c - 64);
      else if (c >= 97 && c <= 122) n = n * 26 + (c - 96);
      else break;
    }
    return n - 1;
  }

  function parseSharedStrings(xml) {
    const out = [];
    const re = /<si\b[^>]*\/>|<si\b[^>]*>([\s\S]*?)<\/si>/g;
    let m;
    while ((m = re.exec(xml)) !== null) out.push(m[1] ? tagText(m[1]) : "");
    return out;
  }

  function parseSheetRows(xml, shared) {
    const rows = [];
    const rowRe = /<row\b([^>]*?)\/>|<row\b([^>]*?)>([\s\S]*?)<\/row>/g;
    let rm;
    while ((rm = rowRe.exec(xml)) !== null) {
      const rowAttrs = rm[1] !== undefined ? rm[1] : rm[2];
      const body = rm[3] || "";
      const cells = [];
      let seq = 0;
      const cellRe = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g;
      let cm;
      while ((cm = cellRe.exec(body)) !== null) {
        const attrs = cm[1] !== undefined ? cm[1] : cm[2];
        const inner = cm[3] || "";
        const rRef = /\br="([A-Za-z]+)[0-9]+"/.exec(attrs);
        const idx = rRef ? colIndex(rRef[1]) : seq;
        if (idx < 0) continue;
        seq = idx + 1;
        const tAttr = /\bt="([^"]*)"/.exec(attrs);
        const t = tAttr ? tAttr[1] : "";
        let val = "";
        if (t === "inlineStr") {
          val = tagText(inner);
        } else {
          const vm = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
          if (vm) {
            const raw = unescapeXml(vm[1]);
            if (t === "s") {
              const si = parseInt(raw, 10);
              val = isNaN(si) || shared[si] === undefined ? "" : shared[si];
            } else if (t === "b") {
              val = raw === "1" ? "TRUE" : "FALSE";
            } else if (t === "e") {
              val = "";
            } else {
              val = raw;
            }
          }
        }
        cells[idx] = val;
      }
      const rNum = /\br="([0-9]+)"/.exec(rowAttrs);
      const at = rNum ? parseInt(rNum[1], 10) - 1 : rows.length;
      if (at >= 0) rows[at] = cells;
    }
    return rows;
  }

  function parseWorkbook(xml) {
    const sheets = [];
    const re = /<sheet\b([^>]*?)\/>|<sheet\b([^>]*?)>([\s\S]*?)<\/sheet>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const attrs = m[1] !== undefined ? m[1] : m[2];
      const name = /\bname="([^"]*)"/.exec(attrs);
      const rid = /\br:id="([^"]*)"/.exec(attrs);
      sheets.push({
        name: name ? unescapeXml(name[1]) : "",
        rid: rid ? rid[1] : "",
      });
    }
    return sheets;
  }

  function parseRels(xml) {
    const map = {};
    const re = /<Relationship\b([^>]*?)\/?>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const id = /\bId="([^"]*)"/.exec(m[1]);
      const target = /\bTarget="([^"]*)"/.exec(m[1]);
      if (id && target) map[id[1]] = unescapeXml(target[1]);
    }
    return map;
  }

  function resolvePart(baseDir, target) {
    if (target.charAt(0) === "/") return target.slice(1);
    const out = [];
    const segs = (baseDir + "/" + target).split("/");
    for (const seg of segs) {
      if (!seg || seg === ".") continue;
      if (seg === "..") out.pop();
      else out.push(seg);
    }
    return out.join("/");
  }

  // 返回 [{ name: 工作表名, rows: [[单元格字符串…]…] }]
  async function read(file, inflateRaw = inflateBrowser) {
    const u8 = new Uint8Array(await file.arrayBuffer());
    const parts = zipEntries(u8);
    async function partText(name) {
      const entry = parts.get(name);
      return entry ? utf8.decode(await readEntry(u8, entry, inflateRaw)) : null;
    }
    const sharedXml = await partText("xl/sharedStrings.xml");
    const shared = sharedXml ? parseSharedStrings(sharedXml) : [];
    const wbXml = await partText("xl/workbook.xml");
    const relsXml = await partText("xl/_rels/workbook.xml.rels");
    const rels = relsXml ? parseRels(relsXml) : {};
    const declared = wbXml ? parseWorkbook(wbXml) : [];
    const out = [];
    for (const sheet of declared) {
      let path =
        sheet.rid && rels[sheet.rid]
          ? resolvePart("xl", rels[sheet.rid])
          : "";
      if (!path || !parts.has(path)) {
        path = "xl/worksheets/sheet" + (out.length + 1) + ".xml";
      }
      if (!parts.has(path)) continue;
      out.push({
        name: sheet.name || "Sheet" + (out.length + 1),
        rows: parseSheetRows(await partText(path), shared),
      });
    }
    if (out.length === 0) {
      const names = Array.from(parts.keys())
        .filter(function (n) {
          return /^xl\/worksheets\/sheet[0-9]+\.xml$/.test(n);
        })
        .sort(function (a, b) {
          return (
            parseInt(a.match(/[0-9]+/)[0], 10) -
            parseInt(b.match(/[0-9]+/)[0], 10)
          );
        });
      for (const name of names) {
        out.push({
          name: name.replace(/^.*\//, ""),
          rows: parseSheetRows(await partText(name), shared),
        });
      }
    }
    if (out.length === 0) throw new Error("这个文件里没有工作表");
    return out;
  }

  function normPath(p) {
    return String(p || "")
      .replace(/\\/g, "/")
      .replace(/^\.\//, "")
      .trim()
      .toLowerCase()
      .normalize("NFC");
  }

  const COLUMN_ALIASES = [
    { key: "german", names: ["德语", "单词", "德文", "german", "wort"] },
    { key: "chinese", names: ["汉语", "中文", "释义", "意思", "chinese"] },
    { key: "type", names: ["词性", "词类", "wortart"] },
    { key: "gender", names: ["阴阳性", "冠词", "artikel", "der"] },
    { key: "plural", names: ["复数", "plural"] },
    { key: "audio", names: ["发音", "音频", "读音", "语音", "audio", "mp3"] },
    { key: "example", names: ["例句", "例", "beispiel", "example", "satz"] },
  ];
  const FALLBACK_COLUMNS = {
    german: 0,
    chinese: 1,
    type: 2,
    gender: 3,
    plural: 4,
    audio: 5,
  };

  function normHeader(value) {
    return String(value === undefined || value === null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/[\s()（）【】[\]]/g, "");
  }

  function mapColumns(rows) {
    const limit = Math.min(rows.length, 8);
    for (let i = 0; i < limit; i++) {
      const row = rows[i] || [];
      const map = {};
      let hits = 0;
      for (let c = 0; c < row.length; c++) {
        const head = normHeader(row[c]);
        if (!head) continue;
        for (const col of COLUMN_ALIASES) {
          if (
            map[col.key] === undefined &&
            col.names.some(function (n) {
              return head.indexOf(n) !== -1;
            })
          ) {
            map[col.key] = c;
            hits++;
            break;
          }
        }
      }
      if (map.german !== undefined && hits >= 2) {
        return { headerRow: i, map: map };
      }
    }
    return null;
  }

  function cellOf(row, idx) {
    if (!row || idx === undefined || idx === null) return "";
    const value = row[idx];
    return value === undefined || value === null ? "" : String(value).trim();
  }

  // 该表里“发音”列最常见的目录，作为猜音频时的优先级提示
  function commonAudioPrefix(rows, map) {
    const tally = {};
    for (const row of rows) {
      const p = normPath(cellOf(row, map.audio));
      if (!p) continue;
      const dir = p.split("/").slice(0, -1).join("/");
      if (!dir) continue;
      tally[dir] = (tally[dir] || 0) + 1;
    }
    let best = "";
    let bestN = 0;
    for (const dir in tally) {
      if (tally[dir] > bestN) {
        bestN = tally[dir];
        best = dir;
      }
    }
    return best;
  }

  function parseSheets(sheets) {
    const words = [];
    const warnings = [];
    let used = 0;
    for (const sheet of sheets) {
      const found = mapColumns(sheet.rows);
      let map = found ? found.map : null;
      let start = found ? found.headerRow + 1 : 0;
      if (!found) {
        map = FALLBACK_COLUMNS;
        const firstRow = (sheet.rows[0] || []).join("");
        start = /德语|单词|word/i.test(firstRow) ? 1 : 0;
        warnings.push(
          "「" +
            sheet.name +
            "」没认出表头，已按默认列序（德语/汉语/词性/阴阳性/复数/发音）读取。"
        );
      }
      const unitPrefix = commonAudioPrefix(sheet.rows, map);
      let count = 0;
      for (let i = start; i < sheet.rows.length; i++) {
        const row = sheet.rows[i] || [];
        const german = cellOf(row, map.german);
        if (!german) continue;
        if (/^(德语|单词|德文|word|german)$/i.test(german)) continue;
        words.push({
          id: sheet.name + "#" + i,
          sheet: sheet.name,
          german: german,
          chinese: cellOf(row, map.chinese),
          type: cellOf(row, map.type),
          gender: cellOf(row, map.gender).toLowerCase(),
          plural: cellOf(row, map.plural),
          pronounce: cellOf(row, map.audio),
          example: cellOf(row, map.example),
          unitPrefix: unitPrefix,
          marked: false,
        });
        count++;
      }
      if (count > 0) used++;
    }
    return { words: words, sheets: used, warnings: warnings };
  }

  return { read: read, parseSheets: parseSheets, normPath: normPath };
})();
