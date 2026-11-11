const { allLines } = require('../data/lines.js');
const metroMapState = require('./metroMapState.js');
const stationGraph = require('./stationGraph.js');
const { ACHIEVEMENT_META } = require('./achievementMeta.js');
const { normalizeStationName } = stationGraph;

function isStationChecked(records, name) {
  const norm = normalizeStationName(name);
  return records.some(r => normalizeStationName(r.stationName) === norm);
}

function uncheckedStations(records, stations) {
  return stations.filter(name => !isStationChecked(records, name));
}

function formatStationList(names, max = 3) {
  if (!names.length) return '';
  if (names.length <= max) return names.map(n => `「${n}」`).join('、');
  return `${names.slice(0, max).map(n => `「${n}」`).join('、')}等`;
}

function getOrderNextIndex(records, stations) {
  const sorted = [...records].sort((a, b) => a.checkInTime - b.checkInTime);
  const normStations = stations.map(normalizeStationName);
  let idx = 0;
  sorted.forEach(r => {
    if (idx >= normStations.length) return;
    if (normalizeStationName(r.stationName) === normStations[idx]) idx += 1;
  });
  return idx;
}

function countUncheckedOnLine(checkedSet, lineKey) {
  const stations = allLines[lineKey];
  if (!stations || !stations.length) return 0;
  return stationGraph.countUncheckedUniqueOnLine(checkedSet, stations);
}

function getRemainingHint(achievementId, ctx) {
  const meta = ACHIEVEMENT_META[achievementId];
  if (!meta) return '';

  const records = ctx.records || [];

  switch (meta.type) {
    case 'count': {
      const need = meta.threshold - ctx.count;
      if (need <= 0) return '';
      return `还差 ${need} 站`;
    }
    case 'progress': {
      const need = meta.threshold - ctx.globalProgress;
      if (need <= 0) return '';
      return `全线路进度还差 ${need}%`;
    }
    case 'lineComplete': {
      const checkedSet = new Set(records.map(r => r.stationName));
      const remaining = countUncheckedOnLine(checkedSet, meta.lineKey);
      if (remaining <= 0) return '';
      const label = metroMapState.formatLineLabel(meta.lineKey);
      return `${label}还差 ${remaining} 站`;
    }
    case 'has': {
      const missing = uncheckedStations(records, meta.stations);
      if (!missing.length) return '';
      return `还差打卡${formatStationList(missing)}`;
    }
    case 'hasAny': {
      if (meta.stations.some(name => isStationChecked(records, name))) return '';
      return `还差打卡其中一站：${formatStationList(meta.stations)}`;
    }
    case 'hasAll': {
      const missing = uncheckedStations(records, meta.stations);
      if (!missing.length) return '';
      return `还差 ${missing.length} 站：${formatStationList(missing)}`;
    }
    case 'compound': {
      const parts = [];
      const anyDone = meta.anyOf.some(name => isStationChecked(records, name));
      if (!anyDone) {
        parts.push(`任选一站：${formatStationList(meta.anyOf)}`);
      }
      const missingAll = uncheckedStations(records, meta.allOf);
      if (missingAll.length) {
        parts.push(`必打：${formatStationList(missingAll)}`);
      }
      if (!parts.length) return '';
      return `还差 ${parts.join('；')}`;
    }
    case 'lateCheckin': {
      return `${meta.hour}:00 后在「张江高科」或「漕河泾开发区」打卡并写备注`;
    }
    case 'completeLineCount': {
      const done = typeof ctx.completeLineCount === 'function'
        ? ctx.completeLineCount()
        : 0;
      const need = meta.threshold - done;
      if (need <= 0) return '';
      return `还差完成 ${need} 条线路`;
    }
    case 'consecutive': {
      const max = typeof ctx.maxConsecutive === 'function'
        ? ctx.maxConsecutive()
        : 0;
      const need = meta.threshold - max;
      if (need <= 0) return '';
      return `最长连续段还差 ${need} 站`;
    }
    case 'transferHubs': {
      const done = typeof ctx.checkedTransferHubs === 'function'
        ? ctx.checkedTransferHubs(2)
        : 0;
      const need = meta.threshold - done;
      if (need <= 0) return '';
      return `还差 ${need} 个换乘站`;
    }
    case 'checkOrder': {
      const nextIdx = getOrderNextIndex(records, meta.stations);
      if (nextIdx >= meta.stations.length) return '';
      const next = meta.stations[nextIdx];
      if (nextIdx === 0) {
        return `从「${next}」开始按顺序打卡`;
      }
      return `下一步建议打卡「${next}」`;
    }
    case 'sameDayCount': {
      const max = typeof ctx.maxSameDayCheckins === 'function'
        ? ctx.maxSameDayCheckins()
        : 0;
      const need = meta.threshold - max;
      if (need <= 0) return '';
      return `同一天内再打卡 ${need} 站`;
    }
    case 'adjacentPair':
      return '在同一线路上打卡相邻两站';
    case 'sameDayMultiLine':
      return '同一天内在不同线路上各打卡一次';
    case 'mainLines': {
      const done = typeof ctx.checkedMainLines === 'function'
        ? ctx.checkedMainLines()
        : 0;
      const need = meta.threshold - done;
      if (need <= 0) return '';
      return `还差 ${need} 条主线`;
    }
    case 'allLines': {
      const done = typeof ctx.checkedAllLines === 'function'
        ? ctx.checkedAllLines()
        : 0;
      const need = meta.threshold - done;
      if (need <= 0) return '';
      return `还差 ${need} 条线路`;
    }
    case 'memo': {
      const done = typeof ctx.memoCount === 'function'
        ? ctx.memoCount()
        : 0;
      const need = meta.threshold - done;
      if (need <= 0) return '';
      return `还差 ${need} 条备注`;
    }
    case 'weekend':
      return '周末打卡一次即可';
    default:
      return '';
  }
}

function attachRemainingHints(achievementList, ctx) {
  return achievementList.map(a => {
    if (a.unlocked) {
      return { ...a, remainingHint: '' };
    }
    return {
      ...a,
      remainingHint: getRemainingHint(a.id, ctx)
    };
  });
}

module.exports = {
  getRemainingHint,
  attachRemainingHints,
  ACHIEVEMENT_META
};
