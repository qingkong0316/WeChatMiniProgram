/**
 * 备份导出/导入逻辑校验（Node 环境）
 * 运行: node scripts/verify-backup.js
 */

const path = require('path');
const {
  BACKUP_VERSION,
  normalizeBackup,
  mergeRecords,
  mergeUnlockedIds
} = require(path.join(__dirname, '../miniprogram/utils/backup.js'));

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('OK:', msg);
  }
}

assert(BACKUP_VERSION === 1, '备份版本号为 1');

const invalid = normalizeBackup(null);
assert(!invalid.ok && invalid.error, '空对象校验失败');

const missingRecords = normalizeBackup({ achievement_unlocked: { unlockedIds: [1] } });
assert(!missingRecords.ok, '缺少 checkin_records 应失败');

const valid = normalizeBackup({
  version: 1,
  checkin_records: [
    { stationName: '人民广场', checkInTime: 1000 },
    { stationName: '', checkInTime: 2000 },
    { stationName: '徐家汇', checkInTime: 3000 }
  ],
  achievement_unlocked: { unlockedIds: [1, 5, 999, 'x'] }
});
assert(valid.ok, '有效备份应通过校验');
assert(valid.records.length === 2, '过滤无效打卡记录');
assert(valid.unlockedIds.join(',') === '1,5', '成就 ID 过滤与去重');

const existing = [
  { stationName: '人民广场', checkInTime: 5000, line: '1' },
  { stationName: '徐家汇', checkInTime: 1000, line: '1' }
];
const incoming = [
  { stationName: '人民广场', checkInTime: 2000, line: '2' },
  { stationName: '陆家嘴', checkInTime: 4000, line: '2' }
];
const merged = mergeRecords(existing, incoming);
assert(merged.length === 3, '合并后 3 站');
const renmin = merged.find(r => r.stationName === '人民广场');
assert(renmin.checkInTime === 2000, '同名站保留更早打卡时间');
assert(mergeUnlockedIds([1, 3], [2, 3]).join(',') === '1,2,3', '成就 ID 合并去重');

if (failed > 0) {
  console.error(`\n${failed} 项未通过`);
  process.exit(1);
}
console.log('\n全部验证通过（备份校验与合并）');
