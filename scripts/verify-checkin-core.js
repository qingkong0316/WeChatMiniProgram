/**
 * 单机打卡核心逻辑验证（Node 环境，真实调用 checkin.js）
 * 运行: node scripts/verify-checkin-core.js
 */

const path = require('path');

// Mock wx storage before requiring checkin.js
const _storage = {};
global.wx = {
  getStorageSync: (key) => _storage[key],
  setStorageSync: (key, val) => { _storage[key] = val; }
};

const { getDistance, formatDistance, isFarFromMetro } = require(path.join(
  __dirname,
  '../miniprogram/utils/geo.js'
));
const checkin = require(path.join(__dirname, '../miniprogram/utils/checkin.js'));

const CHECKIN_RADIUS = 200;

function findNearestStation(lat, lng, flat) {
  let nearest = null;
  let minDistance = Infinity;
  flat.forEach(station => {
    const distance = getDistance(lat, lng, station.latitude, station.longitude);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = station;
    }
  });
  return nearest ? { station: nearest, distance: minDistance } : null;
}

function canCheckIn(distance, stationName, records) {
  return distance <= CHECKIN_RADIUS && !records.some(r => r.stationName === stationName);
}

// 人民广场、徐家汇（来自 lines 数据格式的样例坐标）
const MOCK_FLAT = [
  { id: 113, name: '人民广场', latitude: 31.232687, longitude: 121.475108, line: '1' },
  { id: 108, name: '徐家汇', latitude: 31.195514, longitude: 121.436603, line: '1' }
];

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('OK:', msg);
  }
}

// 1. 同点距离应接近 0
const d0 = getDistance(31.232687, 121.475108, 31.232687, 121.475108);
assert(d0 < 1, `同坐标距离约 0 米 (实际 ${d0})`);

// 2. 最近站应为人民广场
const atRenmin = findNearestStation(31.232687, 121.475108, MOCK_FLAT);
assert(atRenmin.station.id === 113, '用户位于人民广场时应匹配人民广场');

// 3. 200 米门槛（与 index.js CHECKIN_RADIUS 一致）
assert(canCheckIn(atRenmin.distance, '人民广场', []), '200米内未打卡应允许打卡');
assert(
  !canCheckIn(atRenmin.distance, '人民广场', [{ stationId: 113, stationName: '人民广场' }]),
  '已打卡应禁止再次打卡'
);

const farFromRenmin = getDistance(31.195514, 121.436603, 31.232687, 121.475108);
assert(farFromRenmin > CHECKIN_RADIUS, `徐家汇到人民广场应大于 ${CHECKIN_RADIUS}m (实际 ${Math.round(farFromRenmin)})`);
assert(!canCheckIn(farFromRenmin, '人民广场', []), '远距离不应允许对人民广场打卡');

// 4. 真实 checkin.js：addRecord 返回值
checkin.saveRecords([]);

const r1 = checkin.addRecord(113, '人民广场', '1');
assert(r1.success === true, 'addRecord 首次打卡返回 success: true');
assert(checkin.isCheckedByName('人民广场'), '打卡后 isCheckedByName 为 true');

const r2 = checkin.addRecord(113, '人民广场', '1');
assert(r2.success === false && r2.reason === 'duplicate', 'addRecord 重复打卡返回 success: false, reason: duplicate');

// 5. 同名不同 ID（3/4 号线并线：金沙江路）
checkin.saveRecords([]);
checkin.addRecord(321, '金沙江路', '3');
assert(checkin.isCheckedByName('金沙江路'), '3号线打卡后按站名视为已打卡');

const r3 = checkin.addRecord(405, '金沙江路', '4');
assert(r3.success === false, '同名站不可写入第二条记录');
assert(checkin.getRecordByName('金沙江路').stationId === 321, 'getRecordByName 返回首次记录');
assert(
  !canCheckIn(0, '金沙江路', checkin.getRecords()),
  '同名换乘/并线站（4号线视角）不可再次打卡'
);

// 6. removeRecordsByName
checkin.removeRecordsByName('金沙江路');
assert(!checkin.isCheckedByName('金沙江路'), '撤销后 isCheckedByName 为 false');

// 7. dedupe 语义（保留最早 checkInTime）
checkin.saveRecords([
  { stationId: 405, stationName: '金沙江路', line: '4', checkInTime: 2000 },
  { stationId: 321, stationName: '金沙江路', line: '3', checkInTime: 1000 },
  { stationId: 1307, stationName: '金沙江路', line: '13', checkInTime: 3000 }
]);
const deduped = checkin.getRecords();
assert(deduped.length === 1, '历史同名记录去重后仅保留一条');
assert(deduped[0].stationId === 321 && deduped[0].checkInTime === 1000, '去重保留最早 checkInTime');

// 8. removeRecord by ID
checkin.saveRecords([]);
checkin.addRecord(113, '人民广场', '1');
checkin.removeRecord(113);
assert(!checkin.isCheckedByName('人民广场'), 'removeRecord 按 ID 删除后 isCheckedByName 为 false');

// 9. 距离格式化与远距离提示
assert(formatDistance(500) === '约 500 米', '500m 显示米');
assert(formatDistance(1500) === '约 1.5 公里', '1500m 显示公里');
assert(formatDistance(1160000).includes('公里'), '超远距显示公里而非六位数米');
assert(!isFarFromMetro(10000), '10km 不算远离地铁网');
assert(isFarFromMetro(60000), '60km 触发远距离提示');

// 10. 空存储安全
checkin.saveRecords([]);
assert(checkin.getRecords().length === 0, '空存储 getRecords 返回空数组');
assert(checkin.isCheckedByName('不存在的站') === false, '空存储 isCheckedByName 返回 false');
assert(checkin.getRecordByName('不存在的站') === null, '空存储 getRecordByName 返回 null');

if (failed > 0) {
  console.error(`\n${failed} 项未通过`);
  process.exit(1);
}
console.log('\n全部验证通过（距离、最近站、200m 门槛、真实 checkin.js 去重/写入/删除）');
