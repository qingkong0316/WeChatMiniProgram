const STORAGE_KEY = 'checkin_records';

function dedupeByName(records) {
  const byName = new Map();
  records.forEach(r => {
    const name = r.stationName;
    if (!name) return;
    const prev = byName.get(name);
    if (!prev || (r.checkInTime || 0) < (prev.checkInTime || 0)) {
      byName.set(name, r);
    }
  });
  return Array.from(byName.values());
}

function getRecords() {
  try {
    const raw = wx.getStorageSync(STORAGE_KEY) || [];
    const deduped = dedupeByName(raw);
    if (deduped.length !== raw.length) {
      wx.setStorageSync(STORAGE_KEY, deduped);
    }
    return deduped;
  } catch (e) {
    return [];
  }
}

function saveRecords(records) {
  wx.setStorageSync(STORAGE_KEY, records);
}

function isCheckedByName(stationName) {
  return getRecords().some(r => r.stationName === stationName);
}

function getRecordByName(stationName) {
  return getRecords().find(r => r.stationName === stationName) || null;
}

/** @deprecated 请使用 isCheckedByName；按 stationId 查找后转为站名判定 */
function isChecked(stationId) {
  const rec = getRecords().find(r => r.stationId === stationId);
  if (!rec) return false;
  return isCheckedByName(rec.stationName);
}

function addRecord(stationId, stationName, line) {
  const records = getRecords();
  if (records.some(r => r.stationName === stationName)) {
    return { success: false, reason: 'duplicate' };
  }
  records.push({
    stationId,
    stationName,
    line,
    checkInTime: Date.now()
  });
  saveRecords(records);
  return { success: true };
}

function removeRecord(stationId) {
  saveRecords(getRecords().filter(r => r.stationId !== stationId));
}

function removeRecordsByName(stationName) {
  saveRecords(getRecords().filter(r => r.stationName !== stationName));
}

module.exports = {
  getRecords,
  saveRecords,
  isChecked,
  isCheckedByName,
  getRecordByName,
  addRecord,
  removeRecord,
  removeRecordsByName
};
