const { formatLineLabel } = require('./lineLabels.js');

function dateKey(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isSameMonth(ts, refDate) {
  const d = new Date(ts);
  return d.getFullYear() === refDate.getFullYear()
    && d.getMonth() === refDate.getMonth();
}

function formatCheckTime(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getMonthCheckinCount(records, refDate = new Date()) {
  const names = new Set();
  records.forEach(r => {
    if (isSameMonth(r.checkInTime, refDate)) {
      names.add(r.stationName);
    }
  });
  return names.size;
}

function getLastCheckinStation(records) {
  if (!records.length) return '暂无';
  const latest = records.reduce(
    (max, r) => (r.checkInTime > max.checkInTime ? r : max),
    records[0]
  );
  return latest.stationName;
}

function getExploreStreakDays(records, refDate = new Date()) {
  if (!records.length) return 0;

  const daySet = new Set(records.map(r => dateKey(r.checkInTime)));
  const todayKey = dateKey(refDate.getTime());
  const cursor = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());

  // 当天未打卡时从昨天起算，当天结束前仍有机会续上；昨天也未打才清零
  if (!daySet.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
    if (!daySet.has(dateKey(cursor.getTime()))) return 0;
  }

  let streak = 0;
  while (daySet.has(dateKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function computeProgressStats(records, refDate = new Date()) {
  return {
    monthCheckinCount: getMonthCheckinCount(records, refDate),
    lastCheckinStation: getLastCheckinStation(records),
    exploreStreakDays: getExploreStreakDays(records, refDate)
  };
}

/** 已打卡站点列表，按打卡时间降序（同名只保留一条） */
function getCheckedStationList(records) {
  const byName = new Map();
  records.forEach(r => {
    if (!r.stationName) return;
    const prev = byName.get(r.stationName);
    if (!prev || (r.checkInTime || 0) > (prev.checkInTime || 0)) {
      byName.set(r.stationName, r);
    }
  });
  return Array.from(byName.values())
    .sort((a, b) => (b.checkInTime || 0) - (a.checkInTime || 0))
    .map(r => ({
      name: r.stationName,
      line: r.line || '',
      lineLabel: formatLineLabel(r.line || ''),
      checkInTime: r.checkInTime || 0,
      checkTimeText: r.checkInTime ? formatCheckTime(r.checkInTime) : ''
    }));
}

/** 当前线路已打 / 未打分区 */
function getLineProgressDetail(allLines, lineKey, records) {
  const source = (allLines && allLines[lineKey]) || [];
  const checkedNames = new Set(records.map(r => r.stationName));
  const recordByName = new Map();
  records.forEach(r => {
    if (!r.stationName) return;
    const prev = recordByName.get(r.stationName);
    if (!prev || (r.checkInTime || 0) < (prev.checkInTime || 0)) {
      recordByName.set(r.stationName, r);
    }
  });

  const checked = [];
  const unchecked = [];
  source.forEach(s => {
    if (checkedNames.has(s.name)) {
      const rec = recordByName.get(s.name);
      checked.push({
        name: s.name,
        checkInTime: rec ? rec.checkInTime : 0,
        checkTimeText: rec && rec.checkInTime ? formatCheckTime(rec.checkInTime) : ''
      });
    } else {
      unchecked.push({ name: s.name });
    }
  });

  const totalCount = source.length;
  const checkedCount = checked.length;
  const progress = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

  return {
    lineKey,
    lineLabel: formatLineLabel(lineKey),
    checkedCount,
    totalCount,
    progress,
    checked,
    unchecked
  };
}

/** 本月打卡站点（站名去重，保留本月内最近一次时间） */
function getMonthCheckedStations(records, refDate = new Date()) {
  const byName = new Map();
  records.forEach(r => {
    if (!r.stationName || !isSameMonth(r.checkInTime, refDate)) return;
    const prev = byName.get(r.stationName);
    if (!prev || (r.checkInTime || 0) > (prev.checkInTime || 0)) {
      byName.set(r.stationName, r);
    }
  });
  return Array.from(byName.values())
    .sort((a, b) => (b.checkInTime || 0) - (a.checkInTime || 0))
    .map(r => ({
      name: r.stationName,
      line: r.line || '',
      lineLabel: formatLineLabel(r.line || ''),
      checkInTime: r.checkInTime || 0,
      checkTimeText: r.checkInTime ? formatCheckTime(r.checkInTime) : ''
    }));
}

/**
 * 当月简易日历
 * days: 含月初补齐的空白格，便于 7 列网格渲染
 */
function buildMonthCalendar(refDate = new Date(), records = []) {
  const year = refDate.getFullYear();
  const month = refDate.getMonth(); // 0-based
  const daySet = new Set(records.map(r => dateKey(r.checkInTime)));
  const todayKey = dateKey(refDate.getTime());
  const streakDays = getExploreStreakDays(records, refDate);

  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];

  for (let i = 0; i < firstDow; i += 1) {
    days.push({ day: 0, inMonth: false, isToday: false, hasCheckin: false });
  }

  for (let d = 1; d <= daysInMonth; d += 1) {
    const key = dateKey(new Date(year, month, d).getTime());
    days.push({
      day: d,
      inMonth: true,
      isToday: key === todayKey,
      hasCheckin: daySet.has(key)
    });
  }

  return {
    year,
    month: month + 1,
    streakDays,
    days
  };
}

module.exports = {
  computeProgressStats,
  getMonthCheckinCount,
  getLastCheckinStation,
  getExploreStreakDays,
  getCheckedStationList,
  getLineProgressDetail,
  getMonthCheckedStations,
  buildMonthCalendar,
  formatLineLabel,
  dateKey
};
