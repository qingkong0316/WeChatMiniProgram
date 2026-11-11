/**
 * 串联运行全部校验脚本
 * 运行: node scripts/verify-all.js
 */

const { spawnSync } = require('child_process');
const path = require('path');

const SCRIPTS = [
  'verify-checkin-core.js',
  'verify-nearest-stations.js',
  'verify-backup.js',
  'verify-progress-stats.js',
  'verify-achievements.js',
  'verify-station-intros.js',
  'verify-metro-schematic.js',
  'verify-lines.js'
];

let failed = 0;

SCRIPTS.forEach(name => {
  const scriptPath = path.join(__dirname, name);
  console.log(`\n========== ${name} ==========`);
  const result = spawnSync(process.execPath, [scriptPath], {
    stdio: 'inherit',
    encoding: 'utf8'
  });
  if (result.status !== 0) {
    failed += 1;
    console.error(`\n[FAIL] ${name} 退出码 ${result.status}`);
  }
});

if (failed > 0) {
  console.error(`\n${failed} 个脚本未通过`);
  process.exit(1);
}

console.log(`\n全部 ${SCRIPTS.length} 个校验脚本通过`);
