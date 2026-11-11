function formatLineLabel(key) {
  const special = {
    Special21: '磁浮',
    Special22: '浦江线',
    Special23: '机场联络线'
  };
  if (special[key]) return special[key];
  const num = parseInt(key, 10);
  return isNaN(num) ? String(key) : `${num}号线`;
}

function formatLineList(lines) {
  return lines.map(formatLineLabel).join(' · ');
}

module.exports = {
  formatLineLabel,
  formatLineList
};
