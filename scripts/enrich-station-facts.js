/**
 * 清理并扩充偏短的联网调研句（每站唯一，不追加线路通用套话）
 * 运行: node scripts/enrich-station-facts.js
 */
const fs = require('fs');
const path = require('path');
const { allLines } = require('../miniprogram/data/lines.js');
const { loadPoiMap } = require('./parse-maigoo-poi.js');

const FACT_FILES = [
  'station-facts-line1.js',
  'station-facts-lines2-6.js',
  'station-facts-lines7-11.js',
  'station-facts-lines12-18.js',
];

const LINE_TAGS = {
  1: '南北大动脉',
  2: '浦西浦东东西骨干',
  3: '北段与4号线共线',
  4: '环线南段',
  5: '闵行纵向通勤',
  6: '港城方向骨干',
  7: '跨江纵贯',
  8: '浦东南北向',
  9: '松江至浦东',
  10: '虹桥至新天地',
  11: '迪士尼与花桥方向',
  12: '横贯东西',
  13: '江桥至张江',
  14: '8编组全自动运行',
  15: '西部纵向',
  16: '龙阳路至临港',
  17: '虹桥至浦东',
  18: '全自动无人驾驶',
  Special21: '磁浮示范线',
  Special22: 'APM胶轮捷运',
  Special23: '空铁联络线',
};

/** 联网检索补充（维基 / 百科，每站唯一） */
const WEB_EXTRA = {
  封浜: '地下岛式站台6个出入口，配套封浜车辆段，14号线西端折返基地',
  乐秀路: '江桥大型社区通勤节点，2025年试点闸机常开门',
  临洮路: '曹安公路与临洮路交叉口，4出入口，衔接多条嘉定公交',
  桂桥路: '14号线东端终点，邻近金桥出口加工区，与9、12号线共用车场',
  下沙: '周浦沪南公路与鹤立路交叉口，地下二层岛式3出入口，2020年12月26日启用',
  鹤涛路: '航头镇沪南公路与鹤涛路，4出入口，接驳航头5路、浦东34路',
  沈梅路: '周浦沪南公路与沈梅路，连接航头定修段，部分列车小交路终点',
  航头: '18号线南端起讫站，沪南公路3出入口，站内配有折返线',
  东城一路: '浦江线高架侧式站，双向付费区不连通，上错方向需出站重来',
  汇臻路: '浦江线南端终点，地上三层岛式站后折返，汇臻路与鲁南路交叉口',
  浦航路: '沿三鲁公路高架敷设，服务浦江镇中部，APM全自动运行',
  曹路: '9号线东端终点，金海路金钻路交叉口，2017年12月30日开通，6出入口',
  民雷路: '金海路与民雷路交叉口，曹路西侧相邻站，4出入口',
  迪士尼: '2016年4月26日11号线迪士尼支线通车，周末排队进站是常态，出站步行可达星愿公园',
  惠南东: '16号线东延伸段，服务惠南镇东部大型社区',
  嘉怡路: '14号线嘉定段，服务江桥北侧居住与商业',
  市光路: '8号线北端起点，市光路与嫩江路交叉口，服务杨浦北部工人新村',
  祁连山南路: '13号线北段，2012年12月30日随北段开通，邻近长征镇居住区',
  祁安路: '15号线站点，服务普陀桃浦南部大型社区',
  陈春路: '13号线北蔡与陈春路沿线，成山路附近大型社区通勤口',
  南大路: '15号线站点，服务普陀南大路沿线物流与居住混合区',
  双柏路: '15号线站点，服务闵行马桥与颛桥交界区域',
  锦秋路: '7号线北延伸，服务宝山锦秋路沿线高校与社区',
  丰翔路: '15号线站点，邻近桃浦科技智慧城开发片区',
  漕盈路: '17号线西延伸段，青浦西部漕盈路沿线',
  丹阳路: '18号线北段，杨浦丹阳路附近，2025年底随北段开通',
  金京路: '12号线东段，金桥出口加工区北侧产业园区通勤',
  华鹏路: '13号线站点，服务北蔡华鹏路沿线社区',
  下南路: '13号线站点，北蔡下南路沿线成熟居住区',
};

const GENERIC_PART = /(?:首通|开通)[，,][^；]{4,30}(?:大动脉|骨干|共线|全自动|沿线站点|迪士尼与花桥|南北大动脉|横贯东西)/;
const GENERIC_TAIL = /^(?:\d{4}年[\d月日随]+(?:开通|首通)|(?:迪士尼|8编组|APM|空铁|磁浮)[^；]{0,20}(?:沿线站点|方向))/;

function dedupeParts(parts) {
  const uniq = [];
  parts.forEach(p => {
    const t = p.trim();
    if (!t) return;
    const hit = uniq.findIndex(u => {
      if (u.includes(t) || t.includes(u)) return true;
      const pre = t.slice(0, 10);
      return pre.length >= 8 && u.slice(0, 10) === pre;
    });
    if (hit === -1) uniq.push(t);
    else if (t.length > uniq[hit].length) uniq[hit] = t;
  });
  return uniq;
}

function stripGenericParts(parts) {
  return parts.filter(p => {
    if (/方向沿线站点$/.test(p)) return false;
    if (/首通，市区至迪士尼与花桥/.test(p)) return false;
    if (/^20\d{2}年[\d月日]+(?:首通|随[^；]+开通)，(?:上海地铁|市区至)/.test(p)) return false;
    if (/^(?:8编组全自动运行|上海地铁南北大动脉|迪士尼与花桥方向)/.test(p)) return false;
    return true;
  });
}

function cleanupFact(fact) {
  return dedupeParts(
    stripGenericParts(
      fact
        .replace(/。+/g, '。')
        .replace(/；+/g, '；')
        .replace(/。；/g, '；')
        .split('；')
        .map(s => s.replace(/。$/, '').trim())
        .filter(Boolean)
    )
  ).join('；');
}

function lineKeyFor(name) {
  for (const [key, stations] of Object.entries(allLines)) {
    if (stations.some(s => s.name === name)) return key;
  }
  return null;
}

const LINE_SNIPPET = {
  1: '1号线1993年南段观光试运行，上海地铁南北大动脉',
  2: '2号线2000年6月开通，连接浦西浦东的东西骨干',
  5: '5号线2003年开通，闵行纵向通勤线',
  7: '7号线2009年开通，跨江纵贯浦西浦东',
  8: '8号线2007年开通，浦东南北向骨干',
  9: '9号线2017年三期东延伸贯通曹路，松江至浦东骨干',
  11: '11号线2016年迪士尼支线通车，可直达国际旅游度假区',
  12: '12号线2013年东段首通，横贯闵行徐汇杨浦浦东',
  13: '13号线2012年北段首通，纵贯江桥至张江科学城',
  14: '14号线2021年12月30日开通，上海首条8编组全自动运行线',
  15: '15号线2021年1月23日首通，上海西部纵向通勤线',
  16: '16号线2013年12月29日开通，龙阳路至临港新城',
  17: '17号线2017年12月30日开通，虹桥枢纽至浦东',
  18: '18号线2020年12月26日南段开通，GoA4全自动无人驾驶',
  Special22: '浦江线2018年3月31日开通，上海首条APM胶轮捷运',
  Special23: '机场联络线2024年12月27日开通，虹桥与浦东机场空铁联运',
};

function enrichFact(name, fact, pois) {
  const base = cleanupFact(fact);
  if (base.length >= 100) return base;

  const parts = base.split('；');
  const joined = parts.join('');

  if (WEB_EXTRA[name] && !joined.includes(WEB_EXTRA[name].slice(0, 10))) {
    const extra = WEB_EXTRA[name];
    const dup = parts.some(p => p.includes(extra.slice(0, 12)) || extra.includes(p.slice(0, 12)));
    if (!dup) parts.push(extra);
  }

  if (pois && pois.length) {
    const slice = pois.filter(p => !joined.includes(p)).slice(0, 2);
    if (slice.length) {
      parts.push(`周边以${slice.join('、')}较为知名`);
    }
  }

  let result = dedupeParts(parts.filter(Boolean)).join('；');
  const lk = lineKeyFor(name);
  const snippet = lk && (LINE_SNIPPET[lk] || LINE_SNIPPET[parseInt(lk, 10)]);
  const yearInFact = result.match(/20\d{2}年/);
  const yearInSnippet = snippet && snippet.match(/20\d{2}年/);
  const skipSnippet = yearInFact && yearInSnippet && yearInFact[0] === yearInSnippet[0];
  if (result.length < 72 && snippet && !skipSnippet && !result.includes(snippet.slice(0, 8))) {
    result = `${result}；${snippet}`;
  }
  return dedupeParts(result.split('；')).join('；');
}

let totalUpdated = 0;
FACT_FILES.forEach(file => {
  const fp = path.join(__dirname, file);
  delete require.cache[require.resolve(fp)];
  const facts = require(fp);
  const pois = loadPoiMap();
  const out = {};
  Object.entries(facts).forEach(([name, fact]) => {
    const cleaned = cleanupFact(fact);
    const enriched = enrichFact(name, cleaned, pois[name]);
    if (enriched !== fact) totalUpdated += 1;
    out[name] = enriched;
  });

  const body = Object.entries(out)
    .map(([k, v]) => {
      const key = /^[\u4e00-\u9fa5·]+$/.test(k) ? k : `'${k}'`;
      return `  ${key}: '${v.replace(/'/g, "\\'")}',`;
    })
    .join('\n');

  fs.writeFileSync(fp, `module.exports = {\n${body}\n};\n`, 'utf8');
});

console.log(`✅ 已清理/扩充 ${totalUpdated} 条调研句`);
