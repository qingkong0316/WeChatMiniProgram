const { allLines } = require('../miniprogram/data/lines.js');
const { stationIntros } = require('../miniprogram/data/stationIntros.js');

const names = new Set();
Object.values(allLines).forEach(list => list.forEach(s => names.add(s.name)));

const missing = [...names].filter(n => !stationIntros[n]);
const extra = Object.keys(stationIntros).filter(n => !names.has(n));
const tooLong = Object.entries(stationIntros).filter(([, t]) => t.length > 280);

console.log(`物理站: ${names.size}, 介绍条目: ${Object.keys(stationIntros).length}`);

if (missing.length) {
  console.error('❌ 缺少介绍:', missing.slice(0, 5), missing.length > 5 ? `…共${missing.length}` : '');
  process.exit(1);
}
if (tooLong.length) {
  console.error('❌ 超长介绍:', tooLong.slice(0, 3));
  process.exit(1);
}
if (extra.length) {
  console.warn('⚠️ 多余介绍:', extra.length);
}

console.log('✅ 站点介绍校验通过');
