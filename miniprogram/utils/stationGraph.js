const MAIN_LINE_KEYS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18'
];

function buildTransferMap(allLines) {
  const map = {};
  Object.entries(allLines).forEach(([lineKey, stations]) => {
    stations.forEach(s => {
      if (!map[s.name]) {
        map[s.name] = { lines: new Set(), count: 0 };
      }
      map[s.name].lines.add(lineKey);
    });
  });
  Object.values(map).forEach(info => {
    info.count = info.lines.size;
  });
  return map;
}

function buildCheckedSet(records) {
  return new Set(records.map(r => r.stationName));
}

function countUncheckedUniqueOnLine(checkedSet, lineStations) {
  if (!lineStations || !lineStations.length) return 0;
  const uniqueNames = new Set(lineStations.map(s => s.name));
  let count = 0;
  uniqueNames.forEach(name => {
    if (!checkedSet.has(name)) count += 1;
  });
  return count;
}

function isLineComplete(checkedSet, lineStations) {
  if (!lineStations || !lineStations.length) return false;
  return lineStations.every(s => checkedSet.has(s.name));
}

function getMaxConsecutiveOnLine(checkedSet, lineStations) {
  let max = 0;
  let current = 0;
  lineStations.forEach(s => {
    if (checkedSet.has(s.name)) {
      current += 1;
      if (current > max) max = current;
    } else {
      current = 0;
    }
  });
  return max;
}

function getMaxConsecutiveOnAnyLine(checkedSet, allLines) {
  return Object.values(allLines).reduce(
    (max, line) => Math.max(max, getMaxConsecutiveOnLine(checkedSet, line)),
    0
  );
}

function hasAdjacentPairOnAnyLine(checkedSet, allLines) {
  return Object.values(allLines).some(line => {
    for (let i = 0; i < line.length - 1; i += 1) {
      if (checkedSet.has(line[i].name) && checkedSet.has(line[i + 1].name)) {
        return true;
      }
    }
    return false;
  });
}

function countCompleteLines(checkedSet, allLines) {
  return Object.keys(allLines).filter(
    lineKey => isLineComplete(checkedSet, allLines[lineKey])
  ).length;
}

function countCheckedTransferHubs(checkedSet, transferMap, minLines = 2) {
  return Object.entries(transferMap).filter(
    ([name, info]) => info.count >= minLines && checkedSet.has(name)
  ).length;
}

function countLinesWithCheckin(checkedSet, allLines, lineKeys) {
  return lineKeys.filter(lineKey => {
    const stations = allLines[lineKey];
    if (!stations) return false;
    return stations.some(s => checkedSet.has(s.name));
  }).length;
}

function normalizeStationName(name) {
  if (!name) return '';
  return name.replace(/[（(].*[)）]$/, '').trim();
}

function hasCheckinOrder(records, stationNames) {
  if (!stationNames.length) return false;
  const sorted = [...records].sort((a, b) => a.checkInTime - b.checkInTime);
  const normTargets = stationNames.map(normalizeStationName);
  let idx = 0;
  sorted.forEach(r => {
    if (idx >= normTargets.length) return;
    const target = normTargets[idx];
    if (normalizeStationName(r.stationName) === target) {
      idx += 1;
    }
  });
  return idx >= normTargets.length;
}

function getMaxSameDayCheckins(records) {
  const dayMap = {};
  records.forEach(r => {
    const d = new Date(r.checkInTime);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    dayMap[key] = (dayMap[key] || 0) + 1;
  });
  return Object.values(dayMap).reduce((max, n) => Math.max(max, n), 0);
}

function hasSameDayMultiLine(records) {
  const dayLineMap = {};
  records.forEach(r => {
    const d = new Date(r.checkInTime);
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!dayLineMap[dayKey]) dayLineMap[dayKey] = new Set();
    dayLineMap[dayKey].add(r.line);
  });
  return Object.values(dayLineMap).some(lines => lines.size >= 2);
}

function countRecordsWithMemo(records) {
  return records.filter(r => (r.memo || '').trim().length > 0).length;
}

function hasWeekendCheckin(records) {
  return records.some(r => {
    const day = new Date(r.checkInTime).getDay();
    return day === 0 || day === 6;
  });
}

function createGraphHelpers(records, allLines) {
  const checkedSet = buildCheckedSet(records);
  const transferMap = buildTransferMap(allLines);

  return {
    lineComplete(lineKey) {
      return isLineComplete(checkedSet, allLines[lineKey]);
    },
    completeLineCount() {
      return countCompleteLines(checkedSet, allLines);
    },
    maxConsecutive() {
      return getMaxConsecutiveOnAnyLine(checkedSet, allLines);
    },
    hasConsecutive(count) {
      return getMaxConsecutiveOnAnyLine(checkedSet, allLines) >= count;
    },
    hasAdjacentPair() {
      return hasAdjacentPairOnAnyLine(checkedSet, allLines);
    },
    checkedTransferHubs(minLines = 2) {
      return countCheckedTransferHubs(checkedSet, transferMap, minLines);
    },
    checkedMainLines() {
      return countLinesWithCheckin(checkedSet, allLines, MAIN_LINE_KEYS);
    },
    checkedAllLines() {
      return countLinesWithCheckin(checkedSet, allLines, Object.keys(allLines));
    },
    hasCheckOrder(stationNames) {
      return hasCheckinOrder(records, stationNames);
    },
    maxSameDayCheckins() {
      return getMaxSameDayCheckins(records);
    },
    hasSameDayMultiLine() {
      return hasSameDayMultiLine(records);
    },
    memoCount() {
      return countRecordsWithMemo(records);
    },
    hasWeekendCheckin() {
      return hasWeekendCheckin(records);
    }
  };
}

module.exports = {
  MAIN_LINE_KEYS,
  buildTransferMap,
  createGraphHelpers,
  isLineComplete,
  countUncheckedUniqueOnLine,
  getMaxConsecutiveOnAnyLine,
  normalizeStationName
};
