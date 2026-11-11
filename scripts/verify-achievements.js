/**
 * 验证成就规则中的站名是否与 lines.js 匹配，并核对元数据与描述一致性
 * 运行: node scripts/verify-achievements.js
 */

const { allLines } = require('../miniprogram/data/lines.js');
const { metroAchievements } = require('../miniprogram/data/achievements.js');
const { ACHIEVEMENT_META, collectMetaStations } = require('../miniprogram/utils/achievementMeta.js');
const achievementProgress = require('../miniprogram/utils/achievementProgress.js');
const { normalizeStationName } = require('../miniprogram/utils/stationGraph.js');

const allNames = new Set();
const allNormNames = new Set();
const nameToLines = {};
Object.entries(allLines).forEach(([line, stations]) => {
  stations.forEach(s => {
    allNames.add(s.name);
    allNormNames.add(normalizeStationName(s.name));
    if (!nameToLines[s.name]) nameToLines[s.name] = [];
    if (!nameToLines[s.name].includes(line)) nameToLines[s.name].push(line);
  });
});

function stationExists(query) {
  const norm = normalizeStationName(query);
  const matches = [...allNames].filter(n => normalizeStationName(n) === norm);
  return { found: matches.length > 0, matches };
}

let failed = 0;
function fail(msg) {
  console.error('FAIL:', msg);
  failed += 1;
}
function ok(msg) {
  console.log('OK:', msg);
}

console.log('=== 元数据完整性 ===');
for (let id = 1; id <= 100; id += 1) {
  if (!ACHIEVEMENT_META[id]) fail(`ACHIEVEMENT_META 缺少成就 ${id}`);
}
if (!failed) ok('ACHIEVEMENT_META 覆盖 1–100');

console.log('\n=== 站名匹配（来自 ACHIEVEMENT_META）===');
const metaStations = new Set();
Object.values(ACHIEVEMENT_META).forEach(meta => {
  collectMetaStations(meta).forEach(n => metaStations.add(n));
});
[...metaStations].sort((a, b) => a.localeCompare(b, 'zh-CN')).forEach(q => {
  const r = stationExists(q);
  if (!r.found) fail(`站名 "${q}" 在 lines.js 中无匹配`);
  else if (r.matches.length > 1) {
    console.log('WARN:', `"${q}" 匹配多个站名:`, r.matches.join(' | '));
  }
});
if (!failed) ok(`所有元数据站名均可匹配（${metaStations.size} 个）`);

console.log('\n=== 线路 key ===');
['1', '2', '5', '10', '11', 'Special21', 'Special22', 'Special23'].forEach(k => {
  if (!allLines[k]) fail(`线路 ${k} 不存在`);
  else ok(`线路 ${k}: ${allLines[k].length} 站`);
});

console.log('\n=== 换乘枢纽数量 ===');
const hubs2 = Object.entries(nameToLines).filter(([, ls]) => ls.length >= 2);
ok(`2线及以上换乘站共 ${hubs2.length} 个`);
if (hubs2.length < 15) fail('换乘宗师(15站) 不可完成，换乘站不足15个');

console.log('\n=== 里程碑上限 ===');
ok(`唯一站名总数 ${allNames.size}`);
[300, 350].forEach(n => {
  if (n > allNames.size) fail(`count >= ${n} 不可完成（最多 ${allNames.size} 站）`);
  else ok(`count >= ${n} 可完成`);
});

console.log('\n=== achievements.js 与元数据一致 ===');
if (metroAchievements.length !== 100) {
  fail(`achievements.js 条目数 ${metroAchievements.length}，期望 100`);
}
metroAchievements.forEach(a => {
  const meta = ACHIEVEMENT_META[a.id];
  if (!meta) return;
  const stations = collectMetaStations(meta);
  if (!stations.length) return;
  // 描述应至少点到一半站名关键字（容错简称）
  const hit = stations.filter(s => a.desc.includes(s) || a.desc.includes(s.replace(/站$/, '')));
  if (hit.length === 0 && !['lateCheckin'].includes(meta.type)) {
    console.log('WARN:', `成就 ${a.id}「${a.name}」描述未包含元数据站名`, stations.join('/'));
  }
  if (a.id === 40) {
    if (!a.secret) fail('成就 40 应标记 secret: true');
    if (!/22:00|备注/.test(a.desc)) fail('成就 40 描述应写明 22:00 与备注');
    else ok('成就 40 描述与 secret 标记正确');
  }
  if (a.id === 30 && !/金沙江路|紫竹高新区/.test(a.desc)) {
    fail('成就 30 描述应包含任选高校站');
  }
  if (a.id === 90 && /1号线/.test(a.desc)) {
    fail('成就 90 描述不应再写「1号线连续三站」');
  }
});

console.log('\n=== remainingHint 覆盖率 ===');
const emptyCtx = {
  records: [],
  count: 0,
  globalProgress: 0,
  completeLineCount: () => 0,
  maxConsecutive: () => 0,
  checkedTransferHubs: () => 0,
  maxSameDayCheckins: () => 0,
  checkedMainLines: () => 0,
  checkedAllLines: () => 0,
  memoCount: () => 0
};
let hintMissing = 0;
for (let id = 1; id <= 100; id += 1) {
  const hint = achievementProgress.getRemainingHint(id, emptyCtx);
  if (!hint) {
    hintMissing += 1;
    fail(`成就 ${id} 空进度时无 remainingHint`);
  }
}
if (!hintMissing) ok('全部 100 个成就在空进度时均有 remainingHint');

console.log('\n=== 子串误匹配风险 ===');
['上海火车站', '上海南站', '上海大学'].forEach(q => {
  const r = stationExists(q);
  if (r.matches.length > 1) fail(`${q} 匹配多个站名: ${r.matches.join(' | ')}`);
  else ok(`${q} 唯一匹配`);
});

process.exit(failed ? 1 : 0);
