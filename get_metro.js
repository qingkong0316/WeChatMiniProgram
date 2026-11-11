const https = require('https');
const fs = require('fs');
const path = require('path');

console.log('🚄 正在从高德地图抓取上海地铁全线数据...');

const url = 'https://map.amap.com/service/subway?_1707368894338&srhdata=3100_drw_shanghai.json';
const LINES_OUT = path.join(__dirname, 'miniprogram', 'data', 'lines.js');
const SCHEMATIC_OUT = path.join(__dirname, 'miniprogram', 'data', 'metroSchematic.js');

function parsePoint(pStr) {
  const parts = String(pStr).trim().split(/\s+/);
  return [parseFloat(parts[0]), parseFloat(parts[1])];
}

function normalizeColor(cl) {
  if (!cl) return '#888888';
  const hex = String(cl).replace('#', '');
  return hex.length === 6 ? `#${hex}` : '#888888';
}

function escapeStr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      let fileContent = `// 该文件由脚本自动生成，包含上海全境地铁线路及精准 GCJ-02 坐标\n\n`;
      const exportLines = [];
      const schematicLines = [];
      const stationMap = new Map();
      const lineStationsMap = new Map();

      json.l.forEach((line, lineIndex) => {
        const lineIdMatch = line.kn.match(/\d+/);
        const lineId = lineIdMatch ? lineIdMatch[0] : `Special${lineIndex}`;
        const idPrefix = lineIdMatch ? parseInt(lineId, 10) : 90 + lineIndex;
        const color = normalizeColor(line.cl);
        const linePoints = [];

        const stations = line.st.map((st, stIndex) => {
          const coords = st.sl.split(',');
          const [x, y] = parsePoint(st.p);
          linePoints.push([x, y]);

          if (!stationMap.has(st.n)) {
            stationMap.set(st.n, { name: st.n, x, y, lines: new Set() });
          }
          const entry = stationMap.get(st.n);
          entry.lines.add(lineId);
          if (entry.x !== x || entry.y !== y) {
            entry.x = Math.round((entry.x + x) / 2);
            entry.y = Math.round((entry.y + y) / 2);
          }

          const existing = lineStationsMap.get(lineId) || [];
          const stationIndex = existing.length;
          existing.push({
            id: idPrefix * 100 + (stationIndex + 1),
            name: st.n,
            latitude: parseFloat(coords[1]),
            longitude: parseFloat(coords[0]),
            checked: false
          });
          lineStationsMap.set(lineId, existing);

          return {
            id: idPrefix * 100 + (stIndex + 1),
            name: st.n,
            latitude: parseFloat(coords[1]),
            longitude: parseFloat(coords[0]),
            checked: false
          };
        });

        schematicLines.push({ key: lineId, color, points: linePoints });
      });

      lineStationsMap.forEach((stations, lineId) => {
        const varName = `line${lineId}Stations`;
        fileContent += `export const ${varName} = [\n`;
        stations.forEach(s => {
          fileContent += `  { id: ${s.id}, name: "${escapeStr(s.name)}", latitude: ${s.latitude}, longitude: ${s.longitude}, checked: false },\n`;
        });
        fileContent += `];\n\n`;
        exportLines.push(`  '${lineId}': ${varName}`);
      });

      fileContent += `export const allLines = {\n${exportLines.join(',\n')}\n};\n`;
      fs.writeFileSync(LINES_OUT, fileContent, 'utf8');
      console.log(`✅ 已生成 ${LINES_OUT}`);

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      stationMap.forEach(s => {
        minX = Math.min(minX, s.x);
        minY = Math.min(minY, s.y);
        maxX = Math.max(maxX, s.x);
        maxY = Math.max(maxY, s.y);
      });

      const schematicStations = [...stationMap.values()]
        .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
        .map(s => ({
          name: s.name,
          x: s.x,
          y: s.y,
          lines: [...s.lines].sort((a, b) => {
            const aNum = parseInt(a, 10);
            const bNum = parseInt(b, 10);
            const aIsNum = !isNaN(aNum);
            const bIsNum = !isNaN(bNum);
            if (aIsNum && bIsNum) return aNum - bNum;
            if (aIsNum) return -1;
            if (bIsNum) return 1;
            return a.localeCompare(b);
          })
        }));

      let schematicContent = `// 该文件由 get_metro.js 自动生成，包含上海地铁示意图布局数据\n\n`;
      schematicContent += `export const schematicBounds = { minX: ${minX}, minY: ${minY}, maxX: ${maxX}, maxY: ${maxY} };\n\n`;
      schematicContent += `export const schematicLines = [\n`;
      schematicLines.forEach(l => {
        const pts = l.points.map(p => `[${p[0]}, ${p[1]}]`).join(', ');
        schematicContent += `  { key: '${l.key}', color: '${l.color}', points: [${pts}] },\n`;
      });
      schematicContent += `];\n\n`;
      schematicContent += `export const schematicStations = [\n`;
      schematicStations.forEach(s => {
        const linesStr = s.lines.map(k => `'${k}'`).join(', ');
        schematicContent += `  { name: "${escapeStr(s.name)}", x: ${s.x}, y: ${s.y}, lines: [${linesStr}] },\n`;
      });
      schematicContent += `];\n`;

      fs.writeFileSync(SCHEMATIC_OUT, schematicContent, 'utf8');
      console.log(`✅ 已生成 ${SCHEMATIC_OUT}`);
      console.log(`   线路 ${schematicLines.length} 条，物理站点 ${schematicStations.length} 个`);

    } catch (e) {
      console.error('❌ 解析数据失败', e);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('❌ 网络请求失败:', err.message);
  process.exit(1);
});
