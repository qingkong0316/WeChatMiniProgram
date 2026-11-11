/**
 * 连续探索天等进度统计校验（Node 环境）
 * 运行: node scripts/verify-progress-stats.js
 */

const path = require('path');

const progressStats = require(path.join(__dirname, '../miniprogram/utils/progressStats.js'));

function atLocalNoon(y, m, d) {
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('OK:', msg);
  }
}

const ref = new Date(2026, 6, 14, 15, 0, 0); // 2026-07-14

assert(progressStats.getExploreStreakDays([], ref) === 0, '空记录 → 0');

const withToday = [
  { checkInTime: atLocalNoon(2026, 7, 14) },
  { checkInTime: atLocalNoon(2026, 7, 13) },
  { checkInTime: atLocalNoon(2026, 7, 12) }
];
assert(
  progressStats.getExploreStreakDays(withToday, ref) === 3,
  '今天已打卡 → streak 含今天（3）'
);

const missToday = [
  { checkInTime: atLocalNoon(2026, 7, 13) },
  { checkInTime: atLocalNoon(2026, 7, 12) },
  { checkInTime: atLocalNoon(2026, 7, 11) },
  { checkInTime: atLocalNoon(2026, 7, 10) },
  { checkInTime: atLocalNoon(2026, 7, 9) }
];
assert(
  progressStats.getExploreStreakDays(missToday, ref) === 5,
  '仅缺今天、昨天有 → 显示截至昨天的 5 天'
);

const missTwoDays = [
  { checkInTime: atLocalNoon(2026, 7, 12) },
  { checkInTime: atLocalNoon(2026, 7, 11) }
];
assert(
  progressStats.getExploreStreakDays(missTwoDays, ref) === 0,
  '今天、昨天皆无 → 0'
);

const brokenMid = [
  { checkInTime: atLocalNoon(2026, 7, 13) },
  { checkInTime: atLocalNoon(2026, 7, 11) }
];
assert(
  progressStats.getExploreStreakDays(brokenMid, ref) === 1,
  '昨天有但再往前断了 → 仅计 1'
);

// —— 已打卡列表 ——
const listRecords = [
  { stationName: '人民广场', line: '1', checkInTime: atLocalNoon(2026, 7, 10) },
  { stationName: '徐家汇', line: '1', checkInTime: atLocalNoon(2026, 7, 14) },
  { stationName: '人民广场', line: '2', checkInTime: atLocalNoon(2026, 7, 12) }
];
const checkedList = progressStats.getCheckedStationList(listRecords);
assert(checkedList.length === 2, '已打卡列表按站名去重');
assert(checkedList[0].name === '徐家汇', '已打卡列表按时间降序');
assert(checkedList[1].name === '人民广场', '同名保留较新时间');
assert(checkedList[1].checkInTime === atLocalNoon(2026, 7, 12), '人民广场取较新打卡时间');

// —— 线路进度 ——
const mockLines = {
  '1': [
    { id: 101, name: '莘庄' },
    { id: 102, name: '外环路' },
    { id: 103, name: '莲花路' }
  ]
};
const lineDetail = progressStats.getLineProgressDetail(mockLines, '1', [
  { stationName: '莘庄', line: '1', checkInTime: atLocalNoon(2026, 7, 1) }
]);
assert(lineDetail.checkedCount === 1 && lineDetail.totalCount === 3, '线路进度计数正确');
assert(lineDetail.progress === 33, '线路进度百分比正确');
assert(lineDetail.checked.length === 1 && lineDetail.unchecked.length === 2, '已打/未打分区');
assert(lineDetail.lineLabel === '1号线', '线路标签');

// —— 本月打卡 ——
const monthRecords = [
  { stationName: '陆家嘴', line: '2', checkInTime: atLocalNoon(2026, 7, 5) },
  { stationName: '陆家嘴', line: '2', checkInTime: atLocalNoon(2026, 7, 8) },
  { stationName: '静安寺', line: '2', checkInTime: atLocalNoon(2026, 6, 20) }
];
const monthList = progressStats.getMonthCheckedStations(monthRecords, ref);
assert(monthList.length === 1, '本月列表仅含本月站名（去重）');
assert(monthList[0].name === '陆家嘴', '本月列表内容');
assert(
  progressStats.getMonthCheckinCount(monthRecords, ref) === monthList.length,
  '本月列表数量与 getMonthCheckinCount 一致'
);
assert(
  progressStats.getMonthCheckedStations([], ref).length === 0,
  '本月空记录 → 空列表'
);

// —— 当月日历 ——
const calRecords = [
  { checkInTime: atLocalNoon(2026, 7, 1) },
  { checkInTime: atLocalNoon(2026, 7, 14) },
  { checkInTime: atLocalNoon(2026, 6, 30) }
];
const cal = progressStats.buildMonthCalendar(ref, calRecords);
assert(cal.year === 2026 && cal.month === 7, '日历年月');
assert(cal.streakDays === 1, '日历附带连续天数');
const day14 = cal.days.find(d => d.inMonth && d.day === 14);
const day1 = cal.days.find(d => d.inMonth && d.day === 1);
const day2 = cal.days.find(d => d.inMonth && d.day === 2);
assert(day14 && day14.hasCheckin && day14.isToday, '今天有打卡高亮');
assert(day1 && day1.hasCheckin, '月初打卡日高亮');
assert(day2 && !day2.hasCheckin, '无打卡日不高亮');
assert(cal.days.filter(d => d.inMonth).length === 31, '7 月天数完整');

if (failed > 0) {
  console.error(`\n${failed} 项未通过`);
  process.exit(1);
}
console.log('\n全部验证通过（连续探索天、已打卡列表、线路详情、本月列表、当月日历）');
