const { allLines } = require('../data/lines.js');
const { getStationIntro, getStationHighlight } = require('../data/stationIntros.js');
const stationGraph = require('./stationGraph.js');
const { formatLineLabel, formatLineList } = require('./lineLabels.js');

function formatCheckTime(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildCheckedNameSet(records) {
  return new Set(records.map(r => r.stationName));
}

function getTransferMap() {
  return stationGraph.buildTransferMap(allLines);
}

function getStationDetail(name, records, transferMap) {
  const related = records.filter(r => r.stationName === name);
  const info = transferMap[name];
  const lines = info ? [...info.lines].sort((a, b) => {
    const aNum = parseInt(a, 10);
    const bNum = parseInt(b, 10);
    const aIsNum = !isNaN(aNum);
    const bIsNum = !isNaN(bNum);
    if (aIsNum && bIsNum) return aNum - bNum;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return a.localeCompare(b);
  }) : [];

  if (related.length === 0) {
    return {
      name,
      checked: false,
      lines,
      lineText: formatLineList(lines),
      checkTimeText: '',
      memo: '',
      intro: getStationIntro(name)
    };
  }

  const earliest = related.reduce(
    (min, r) => (r.checkInTime < min.checkInTime ? r : min),
    related[0]
  );
  const memoRecord = related.find(r => (r.memo || '').trim());

  return {
    name,
    checked: true,
    lines,
    lineText: formatLineList(lines),
    checkTimeText: formatCheckTime(earliest.checkInTime),
    memo: memoRecord ? memoRecord.memo : '',
    intro: getStationIntro(name)
  };
}

module.exports = {
  buildCheckedNameSet,
  formatLineLabel,
  formatLineList,
  getTransferMap,
  getStationDetail,
  getStationIntro,
  getStationHighlight,
  formatCheckTime
};
