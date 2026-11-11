const FAR_LOCATION_METERS = 50000;

function getDistance(lat1, lng1, lat2, lng2) {
  const radLat1 = lat1 * Math.PI / 180.0;
  const radLat2 = lat2 * Math.PI / 180.0;
  const a = radLat1 - radLat2;
  const b = lng1 * Math.PI / 180.0 - lng2 * Math.PI / 180.0;
  let s = 2 * Math.asin(Math.sqrt(
    Math.pow(Math.sin(a / 2), 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(b / 2), 2)
  ));
  s = s * 6378.137;
  return Math.round(s * 10000) / 10;
}

function formatDistance(meters) {
  const m = Math.round(meters);
  if (m >= 1000) {
    const km = m / 1000;
    return km >= 100 ? `约 ${Math.round(km)} 公里` : `约 ${(Math.round(km * 10) / 10)} 公里`;
  }
  return `约 ${m} 米`;
}

function isFarFromMetro(meters) {
  return meters > FAR_LOCATION_METERS;
}

module.exports = {
  FAR_LOCATION_METERS,
  getDistance,
  formatDistance,
  isFarFromMetro
};
