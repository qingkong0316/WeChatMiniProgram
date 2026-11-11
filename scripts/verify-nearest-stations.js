/**
 * 最近三站选取规则校验（Node 环境）
 * 运行: node scripts/verify-nearest-stations.js
 */

const path = require('path');
const {
  pickNearestStations,
  rankStationsByDistance
} = require(path.join(__dirname, '../miniprogram/utils/nearestStations.js'));
const { getDistance } = require(path.join(__dirname, '../miniprogram/utils/geo.js'));

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed += 1;
  } else {
    console.log('OK:', msg);
  }
}

const flat = [
  { id: 1, name: 'A站', latitude: 31.23, longitude: 121.47, line: '1' },
  { id: 2, name: 'B站', latitude: 31.24, longitude: 121.47, line: '1' },
  { id: 3, name: 'C站', latitude: 31.25, longitude: 121.47, line: '2' },
  { id: 4, name: 'A站', latitude: 31.23, longitude: 121.47, line: '2' },
  { id: 5, name: 'D站', latitude: 31.26, longitude: 121.47, line: '2' }
];

const userLat = 31.23;
const userLng = 121.47;
const ranked = rankStationsByDistance(flat, userLat, userLng, getDistance);

assert(ranked[0].name === 'A站', '最近站为 A');
assert(ranked.length === 4, '同名站去重后 4 站');

// 距离前三含未打卡 → 纯按距离
const noneChecked = () => false;
const resultNone = pickNearestStations(ranked, noneChecked, 3);
assert(resultNone.map(s => s.name).join(',') === 'A站,B站,C站', '含未打卡时按距离前三');
assert(!resultNone.some(s => s.isPrimary), '含未打卡时不特殊高亮第一站');

// 最近站已打卡，但前三仍有未打卡（B/C）→ 仍按距离
const checkedA = name => name === 'A站';
const resultMixed = pickNearestStations(ranked, checkedA, 3);
assert(resultMixed.map(s => s.name).join(',') === 'A站,B站,C站', '前三含未打卡时保持距离顺序');
assert(!resultMixed[0].isPrimary, '前三含未打卡时不替换第一站');

// 距离前三皆已打卡 → Slot1 换最近未打卡，Slot2/3 按距离排除 Slot1
const checkedABC = name => ['A站', 'B站', 'C站'].includes(name);
const resultSwap = pickNearestStations(ranked, checkedABC, 3);
assert(resultSwap[0].name === 'D站', '前三皆已打卡时 Slot1 为最近未打卡 D');
assert(resultSwap[0].isPrimary === true, '替换第一站时 isPrimary');
assert(resultSwap[1].name === 'A站', 'Slot2 为距离最近（排除 D）');
assert(resultSwap[2].name === 'B站', 'Slot3 为下一近站');
assert(resultSwap[0].distance > resultSwap[1].distance, 'Slot1 可远于 Slot2');

// 全网已打卡
const allChecked = () => true;
const resultAll = pickNearestStations(ranked, allChecked, 3);
assert(resultAll.map(s => s.name).join(',') === 'A站,B站,C站', '全网完成时回退距离前三');
assert(resultAll[0].allCompleted === true, '全网完成标记');

// 空列表
assert(pickNearestStations([], noneChecked, 3).length === 0, '空排名 → 空结果');

if (failed > 0) {
  console.error(`\n${failed} 项未通过`);
  process.exit(1);
}
console.log('\n全部验证通过（最近三站选取规则）');
