/**
 * 最近三站选取（纯函数，可供 Node 单测）
 * - 距离前三含未打卡：三站均按距离排序
 * - 距离前三皆已打卡：Slot1 换为最近未打卡站，Slot2/3 按距离且排除 Slot1
 * - 全网已打完：回退为距离前三
 */

function pickNearestStations(rankedByDistance, isCheckedByName, limit = 3) {
  if (!rankedByDistance || !rankedByDistance.length) return [];

  const topByDistance = rankedByDistance.slice(0, limit);
  const hasUncheckedInTop = topByDistance.some(s => !isCheckedByName(s.name));

  if (hasUncheckedInTop) {
    return topByDistance.map(s => ({
      ...s,
      isPrimary: false,
      allCompleted: false
    }));
  }

  const unchecked = rankedByDistance.find(s => !isCheckedByName(s.name));
  if (!unchecked) {
    return topByDistance.map((s, i) => ({
      ...s,
      isPrimary: i === 0,
      allCompleted: i === 0
    }));
  }

  const result = [{ ...unchecked, isPrimary: true, allCompleted: false }];
  const excludeName = unchecked.name;
  for (const s of rankedByDistance) {
    if (s.name === excludeName) continue;
    result.push({ ...s, isPrimary: false, allCompleted: false });
    if (result.length >= limit) break;
  }
  return result;
}

/**
 * 从扁平站点列表生成按距离升序、站名去重的排名
 * getDistance(lat1, lng1, lat2, lng2) → meters
 */
function rankStationsByDistance(flatStations, lat, lng, getDistance) {
  const withDistance = flatStations.map(station => ({
    id: station.id,
    name: station.name,
    latitude: station.latitude,
    longitude: station.longitude,
    line: station.line,
    distance: Math.round(getDistance(lat, lng, station.latitude, station.longitude))
  }));
  withDistance.sort((a, b) => a.distance - b.distance);

  const seenNames = new Set();
  const ranked = [];
  for (const s of withDistance) {
    if (seenNames.has(s.name)) continue;
    seenNames.add(s.name);
    ranked.push(s);
  }
  return ranked;
}

module.exports = {
  pickNearestStations,
  rankStationsByDistance
};
