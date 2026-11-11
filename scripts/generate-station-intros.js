/**
 * 批量生成站点介绍（约 180 字/站）
 * 资料来源：分线路联网调研 scripts/station-facts-*.js + maigoo 沿线景点
 * 运行: node scripts/generate-station-intros.js
 */
const fs = require('fs');
const path = require('path');
const { allLines } = require('../miniprogram/data/lines.js');
const { loadPoiMap } = require('./parse-maigoo-poi.js');

const OUT = path.join(__dirname, '../miniprogram/data/stationIntros.js');
const TARGET_LEN = 180;
const MIN_LEN = 175;
const MAX_LEN = 280;

const ALL_WEB_FACTS = {
  ...require('./station-facts-line1.js'),
  ...require('./station-facts-lines2-6.js'),
  ...require('./station-facts-lines7-11.js'),
  ...require('./station-facts-lines12-18.js'),
};

const STATION_POIS = loadPoiMap();
const { CURATED, HIGHLIGHTS = {} } = require('./station-intro-curated.js');

function stableHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(arr, seed) {
  if (!arr.length) return undefined;
  const idx = ((seed % arr.length) + arr.length) % arr.length;
  return arr[idx];
}

function formatLineLabel(key) {
  const special = { Special21: '磁浮线', Special22: '浦江线', Special23: '机场联络线' };
  if (special[key]) return special[key];
  const num = parseInt(key, 10);
  return isNaN(num) ? key : `${num}号线`;
}

function getAdjacentName(stations, idx, step) {
  let i = idx + step;
  const self = stations[idx].name;
  while (i >= 0 && i < stations.length && stations[i].name === self) {
    i += step;
  }
  if (i < 0 || i >= stations.length) return null;
  return stations[i].name;
}

function buildLinePosition(lineKey, stations, idx) {
  const name = stations[idx].name;
  let prev = getAdjacentName(stations, idx, -1);
  let next = getAdjacentName(stations, idx, 1);
  if (next && prev && next === prev) next = null;
  const isFirst = prev === null;
  const isLast = next === null;
  return {
    index: idx,
    total: stations.length,
    isFirst,
    isLast,
    prev,
    next,
  };
}

function shouldReplacePosition(existing, candidate) {
  if (!existing) return true;
  const existingTerminal = existing.isFirst || existing.isLast;
  const candidateTerminal = candidate.isFirst || candidate.isLast;
  if (candidateTerminal && !existingTerminal) return true;
  if (existingTerminal && !candidateTerminal) return false;
  if (candidate.total !== existing.total) {
    return candidate.total < existing.total;
  }
  return candidate.index < existing.index;
}

function buildStationMeta() {
  const map = new Map();
  Object.entries(allLines).forEach(([lineKey, stations]) => {
    stations.forEach((s, idx) => {
      if (!map.has(s.name)) {
        map.set(s.name, { name: s.name, lines: new Set(), positions: {} });
      }
      const entry = map.get(s.name);
      entry.lines.add(lineKey);
      const pos = buildLinePosition(lineKey, stations, idx);
      if (shouldReplacePosition(entry.positions[lineKey], pos)) {
        entry.positions[lineKey] = pos;
      }
    });
  });
  return map;
}

function linesText(lineKeys) {
  const sorted = [...lineKeys].sort((a, b) => {
    const an = parseInt(a, 10);
    const bn = parseInt(b, 10);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    if (!isNaN(an)) return -1;
    if (!isNaN(bn)) return 1;
    return a.localeCompare(b);
  });
  return sorted.map(formatLineLabel).join('、');
}

function normalizeText(text) {
  return text.replace(/\s+/g, '').replace(/。+/g, '。').replace(/；+/g, '；').replace(/。；/g, '；');
}

function enrichFact(name, fact, pois) {
  const base = cleanupFact(fact);
  if (base.length >= 100) return base;
  const parts = base.split('；');
  const joined = parts.join('');
  if (pois && pois.length) {
    const slice = pois.filter(p => !joined.includes(p)).slice(0, 2);
    if (slice.length) {
      parts.push(`步行圈有${slice.join('、')}等去处`);
    }
  }
  return dedupeParts(parts).join('；');
}

function dedupeParts(parts) {
  const uniq = [];
  parts.forEach(p => {
    const t = p.trim();
    if (!t) return;
    const hit = uniq.findIndex(u => u.includes(t) || t.includes(u));
    if (hit === -1) uniq.push(t);
    else if (t.length > uniq[hit].length) uniq[hit] = t;
  });
  return uniq;
}

function stripGenericParts(parts) {
  return parts.filter(p => {
    if (/方向沿线站点$/.test(p)) return false;
    if (/首通，市区至迪士尼与花桥/.test(p)) return false;
    if (/^20\d{2}年[\d月日]+(?:首通|随[^；]+开通)，(?:上海地铁|市区至)/.test(p)) return false;
    if (/^(?:8编组全自动运行|上海地铁南北大动脉|迪士尼与花桥方向)/.test(p)) return false;
    return true;
  });
}

function cleanupFact(fact) {
  const parts = fact.replace(/。+/g, '。').replace(/；+/g, '；').split('；')
    .map(s => s.replace(/。$/, '').trim()).filter(Boolean);
  return dedupeParts(stripGenericParts(parts)).join('；');
}

function dedupeParts(parts) {
  const uniq = [];
  parts.forEach(p => {
    const t = p.trim();
    if (!t) return;
    const hit = uniq.findIndex(u => u.includes(t) || t.includes(u));
    if (hit === -1) uniq.push(t);
    else if (t.length > uniq[hit].length) uniq[hit] = t;
  });
  return uniq;
}

function buildLinePercent(name, lineKey, pos, seed) {
  if (!pos || pos.total <= 1) return '';
  const label = formatLineLabel(lineKey);
  const pct = Math.round(((pos.index + 1) / pos.total) * 100);
  const half = pct <= 50 ? '前半段' : '后半段';
  return pick([
    `${name}约在${label}全程${pct}%处，属${half}。`,
    `从${label}全局看，${name}排在${pos.index + 1}/${pos.total}，偏${half}。`,
  ], seed >>> 10);
}

function buildPoiSentence(name, seed, factText) {
  const pois = STATION_POIS[name];
  if (!pois || !pois.length) return '';
  if (pois.some(p => factText.includes(p))) return '';
  const chosen = [];
  const pool = [...pois];
  let s = seed;
  while (chosen.length < 2 && pool.length) {
    const item = pick(pool, s);
    chosen.push(item);
    pool.splice(pool.indexOf(item), 1);
    s >>>= 3;
  }
  return pick([
    `步行圈有${chosen.join('、')}等去处。`,
    `出站可顺路看看${chosen.join('、')}。`,
    `周边景点包括${chosen.join('、')}。`,
  ], seed >>> 4);
}

function buildCommuteHint(pos, seed) {
  if (!pos || pos.total <= 3) return '';
  const fromStart = pos.index;
  const toEnd = pos.total - 1 - pos.index;
  if (pos.isFirst) {
    return pick([
      `全线共${pos.total}站，由此始发。`,
      `全线${pos.total}站，这里是第一站。`,
    ], seed >>> 6);
  }
  if (pos.isLast) {
    return pick([
      `全线共${pos.total}站，末站到此为止。`,
      `全线${pos.total}站，终点站在此。`,
    ], seed >>> 6);
  }
  return pick([
    `从起点数来第${fromStart + 1}站，距终点还有${toEnd}站。`,
    `全线${pos.total}站中排第${fromStart + 1}，不算头尾的中段站。`,
  ], seed >>> 6);
}

function buildSecondaryLineHint(lineKeys, positions, primaryLine, seed) {
  if (lineKeys.length < 2) return '';
  const others = lineKeys.filter(k => k !== primaryLine);
  const lineKey = pick(others, seed >>> 8);
  const pos = positions[lineKey];
  if (!pos) return '';
  const label = formatLineLabel(lineKey);
  const n = pos.index + 1;
  const t = pos.total;
  if (pos.isFirst && pos.isLast) {
    return `${label}上仅一站即${pos.total === 1 ? '此站' : '唯此一站'}。`;
  }
  if (pos.isFirst) {
    return `${label}上为第${n}/${t}站，属该线起点。`;
  }
  if (pos.isLast) {
    return `${label}上为第${n}/${t}站，属该线终点。`;
  }
  return `${label}上排第${n}/${t}站。`;
}

function buildLineRoleHint(name, lineKey, pos, seed) {
  if (!pos || pos.isFirst || pos.isLast) return '';
  const label = formatLineLabel(lineKey);
  if (pos.isFirst && pos.next) {
    return pick([
      `${label}从${name}开出，下一站${pos.next}。`,
      `作为${label}始发站，往${pos.next}方向发车。`,
    ], seed >>> 9);
  }
  if (pos.isLast && pos.prev) {
    return pick([
      `${label}到此为止，上一站${pos.prev}。`,
      `作为${label}终点站，上一站${pos.prev}。`,
    ], seed >>> 9);
  }
  return '';
}

function ensurePeriod(s) {
  if (!s) return '';
  return /[。！？]$/.test(s) ? s : `${s}。`;
}

function trimIntro(text) {
  return normalizeText(text);
}

function pickPrimaryLine(lines, positions) {
  const list = [...lines];
  const terminals = list.filter(k => {
    const p = positions[k];
    return p && (p.isFirst || p.isLast);
  });
  if (terminals.length) {
    return terminals.sort((a, b) => positions[a].total - positions[b].total)[0];
  }
  return list.sort((a, b) => (positions[a]?.total || 999) - (positions[b]?.total || 999))[0];
}

function buildPositionBlock(name, lineKey, pos) {
  if (!pos) return `${name}（${formatLineLabel(lineKey)}）。`;
  const label = formatLineLabel(lineKey);
  const n = pos.index + 1;
  const t = pos.total;
  const nextName = pos.next === name ? null : pos.next;

  if (pos.isFirst && pos.isLast) {
    return `${name}是${label}全线唯一车站。`;
  }
  if (pos.isFirst) {
    return `${name}为${label}起点（${n}/${t}），${nextName ? `下一站${nextName}` : '由此出发'}。`;
  }
  if (pos.isLast) {
    return `${name}为${label}终点（${n}/${t}），上一站${pos.prev}。`;
  }
  if (nextName) {
    return `${name}在${label}第${n}/${t}站，介于${pos.prev}与${nextName}之间。`;
  }
  return `${name}在${label}第${n}/${t}站，上一站${pos.prev}。`;
}

function buildNeighborColor(name, pos, seed) {
  if (!pos || pos.isFirst || pos.isLast) return '';
  const prev = pos.prev;
  const next = pos.next === name ? null : pos.next;
  if (!prev && !next) return '';
  const opts = [];
  if (prev && next) {
    opts.push(`与${prev}、${next}两站构成一段连续区间。`);
    opts.push(`夹在${prev}和${next}中间，是沿线通勤常经的一站。`);
  } else if (prev) {
    opts.push(`紧挨${prev}，两站间距在全线里算近邻。`);
  } else if (next) {
    opts.push(`下一站是${next}，往市区方向常从这里上车。`);
  }
  return pick(opts, seed >>> 7) || '';
}

function padToTarget(text, name, lineKey, lineKeys, positions, pos, seed, stopAtMin = false) {
  let s = text;
  // 非精编站少补「排在 X/Y」类套话，优先通勤邻站信息
  const parts = [
    buildCommuteHint(pos, seed),
    buildNeighborColor(name, pos, seed),
  ].filter(Boolean);

  for (const p of parts) {
    if (stopAtMin && s.length >= MIN_LEN) break;
    if (!stopAtMin && s.length >= TARGET_LEN) break;
    s += ensurePeriod(p);
  }
  return s;
}

function generateIntro(name, linesSet, metaEntry) {
  const lineKeys = [...linesSet];
  const positions = metaEntry.positions;
  const primaryLine = pickPrimaryLine(lineKeys, positions);
  const pos = positions[primaryLine];
  const h = stableHash(name);
  const rawFact = ALL_WEB_FACTS[name] || `${name}是上海轨道交通网络中的一站。`;
  const pois = STATION_POIS[name];
  const fact = enrichFact(name, rawFact, pois);

  if (CURATED[name]) {
    let text = CURATED[name];
    if (text.length < MIN_LEN) {
      text = ensurePeriod(buildPositionBlock(name, primaryLine, pos)) + text;
    }
    if (text.length < MIN_LEN) {
      text = padToTarget(text, name, primaryLine, lineKeys, positions, pos, h, true);
    }
    return trimIntro(text);
  }

  let text = ensurePeriod(buildPositionBlock(name, primaryLine, pos));
  if (lineKeys.length > 1) {
    text += `可换乘${linesText(lineKeys)}。`;
  }
  text += ensurePeriod(fact);

  const poi = buildPoiSentence(name, h >>> 2, fact);
  if (poi) text += ensurePeriod(poi);

  if (text.length < MIN_LEN) {
    text = padToTarget(text, name, primaryLine, lineKeys, positions, pos, h, true);
  }
  return trimIntro(text);
}

function escapeStr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const meta = buildStationMeta();
const intros = {};
const names = [...meta.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'));

names.forEach(name => {
  intros[name] = generateIntro(name, meta.get(name).lines, meta.get(name));
});

const values = Object.values(intros);
const uniq = new Set(values);
const dupCount = values.length - uniq.size;
if (dupCount > 0) {
  const freq = {};
  values.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
  const dups = Object.entries(freq).filter(([, c]) => c > 1);
  console.error(`❌ 发现 ${dupCount} 条重复简介`);
  console.error(dups.slice(0, 2));
  process.exit(1);
}

let content = '// 由 scripts/generate-station-intros.js 自动生成（联网调研资料 + 线路位置 + 沿线 POI）\n\n';
content += 'export const stationIntros = {\n';
Object.entries(intros).forEach(([name, intro]) => {
  content += `  "${escapeStr(name)}": "${escapeStr(intro)}",\n`;
});
content += '};\n\n';
content += 'export const stationHighlights = {\n';
Object.entries(HIGHLIGHTS).forEach(([name, tip]) => {
  content += `  "${escapeStr(name)}": "${escapeStr(tip)}",\n`;
});
content += '};\n\n';
content += 'export function getStationIntro(name) {\n';
content += '  return stationIntros[name] || "上海轨道交通站点，欢迎打卡探索。";\n';
content += '}\n\n';
content += 'export function getStationHighlight(name) {\n';
content += '  return stationHighlights[name] || "";\n';
content += '}\n';

fs.writeFileSync(OUT, content, 'utf8');

const lengths = values.map(t => t.length);
const avg = Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length);
console.log(`✅ 已生成 ${values.length} 条站点介绍 → ${OUT}`);
console.log(`   联网资料: ${Object.keys(ALL_WEB_FACTS).length} 站，POI 数据: ${Object.keys(STATION_POIS).length} 站`);
console.log(`   精编: ${Object.keys(CURATED).length} 站，亮点句: ${Object.keys(HIGHLIGHTS).length}`);
console.log(`   平均字数: ${avg}，范围: ${Math.min(...lengths)}–${Math.max(...lengths)}，重复: ${dupCount}`);
