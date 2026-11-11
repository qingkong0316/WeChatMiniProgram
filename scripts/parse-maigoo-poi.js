/**
 * 从 maigoo 地铁旅游攻略文本解析「站点 → 周边景点」映射
 * 数据来源: https://www.maigoo.com/goomai/222024.html
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'agent-tools/maigoo-metro-poi.txt');

function parseMaigooPoi(content) {
  const map = {};
  const lines = content.split('\n');
  lines.forEach(line => {
    const m = line.match(/\|\s*([^|]+?)站\s*\|\s*([^|]+?)\s*\|/);
    if (!m) return;
    const name = m[1].trim();
    const poi = m[2].trim();
    if (!name || !poi || poi === '景点' || poi === '站点') return;
    if (!map[name]) map[name] = [];
    if (!map[name].includes(poi)) map[name].push(poi);
  });
  return map;
}

function loadPoiMap() {
  try {
    const content = fs.readFileSync(SRC, 'utf8');
    return parseMaigooPoi(content);
  } catch (e) {
    return {};
  }
}

module.exports = { parseMaigooPoi, loadPoiMap };
