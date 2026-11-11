/**
 * 校验 metroSchematic.js 与 lines.js 站名一致
 */
const { allLines } = require('../miniprogram/data/lines.js');
const { schematicStations } = require('../miniprogram/data/metroSchematic.js');

function getUniqueNames(allLines) {
  const names = new Set();
  Object.values(allLines).forEach(list => list.forEach(s => names.add(s.name)));
  return names;
}

const lineNames = getUniqueNames(allLines);
const schematicNames = new Set(schematicStations.map(s => s.name));

const missingInSchematic = [...lineNames].filter(n => !schematicNames.has(n));
const extraInSchematic = [...schematicNames].filter(n => !lineNames.has(n));

console.log(`lines.js 物理站: ${lineNames.size}`);
console.log(`metroSchematic.js 站: ${schematicNames.size}`);

if (missingInSchematic.length) {
  console.error('❌ lines.js 中有但示意图缺失:', missingInSchematic.slice(0, 10));
  if (missingInSchematic.length > 10) {
    console.error(`   ... 共 ${missingInSchematic.length} 个`);
  }
  process.exit(1);
}

if (extraInSchematic.length) {
  console.warn('⚠️ 示意图多余站名:', extraInSchematic.slice(0, 5));
}

console.log('✅ 站名校验通过');
