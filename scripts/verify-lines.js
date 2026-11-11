/**
 * 校验 lines.js 中所有线路均无重复站名与重复 ID
 * 运行: node scripts/verify-lines.js
 */

const { allLines } = require('../miniprogram/data/lines.js');

let failed = 0;
function fail(msg) {
  console.error('FAIL:', msg);
  failed += 1;
}
function ok(msg) {
  console.log('OK:', msg);
}

Object.entries(allLines).forEach(([lineKey, stations]) => {
  const nameSet = new Set();
  const idSet = new Set();
  stations.forEach(s => {
    if (nameSet.has(s.name)) {
      fail(`线路 ${lineKey} 存在重复站名: ${s.name}`);
    }
    nameSet.add(s.name);
    if (idSet.has(s.id)) {
      fail(`线路 ${lineKey} 存在重复 ID: ${s.id}`);
    }
    idSet.add(s.id);
  });
});

const totalStations = Object.values(allLines).reduce((sum, list) => sum + list.length, 0);
const uniqueNames = new Set();
Object.values(allLines).forEach(list => list.forEach(s => uniqueNames.add(s.name)));

ok(`总站次 ${totalStations}，唯一站名 ${uniqueNames.size}`);
ok(`线路数 ${Object.keys(allLines).length}`);

if (failed > 0) {
  console.error(`\n${failed} 项未通过`);
  process.exit(1);
}
console.log('\n全部验证通过（无同线重复站名/ID）');
