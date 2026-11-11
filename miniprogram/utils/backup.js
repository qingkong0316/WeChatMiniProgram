const BACKUP_VERSION = 1;
const CHECKIN_KEY = 'checkin_records';
const ACHIEVEMENT_KEY = 'achievement_unlocked';

function exportBackup() {
  let checkin_records = [];
  let achievement_unlocked = { unlockedIds: [] };
  try {
    checkin_records = wx.getStorageSync(CHECKIN_KEY) || [];
    achievement_unlocked = wx.getStorageSync(ACHIEVEMENT_KEY) || { unlockedIds: [] };
  } catch (e) {
    // ignore
  }
  return {
    version: BACKUP_VERSION,
    app: 'shanghai-metro-checkin',
    exportedAt: Date.now(),
    checkin_records,
    achievement_unlocked
  };
}

function validateRecord(r) {
  return r
    && typeof r.stationName === 'string'
    && r.stationName.length > 0
    && typeof r.checkInTime === 'number';
}

function normalizeBackup(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: '备份格式无效' };
  }
  if (raw.version !== undefined && raw.version !== BACKUP_VERSION) {
    return { ok: false, error: '备份版本不兼容' };
  }
  if (raw.app !== undefined && raw.app !== 'shanghai-metro-checkin') {
    return { ok: false, error: '备份来源不匹配' };
  }
  if (!Array.isArray(raw.checkin_records)) {
    return { ok: false, error: '缺少打卡记录数组' };
  }
  const seen = new Set();
  const records = [];
  raw.checkin_records.forEach(r => {
    if (!validateRecord(r)) return;
    if (seen.has(r.stationName)) return;
    seen.add(r.stationName);
    records.push(r);
  });
  let unlockedIds = [];
  if (raw.achievement_unlocked && Array.isArray(raw.achievement_unlocked.unlockedIds)) {
    unlockedIds = raw.achievement_unlocked.unlockedIds
      .filter(id => typeof id === 'number' && id >= 1 && id <= 100);
  }
  return {
    ok: true,
    records,
    unlockedIds: [...new Set(unlockedIds)].sort((a, b) => a - b)
  };
}

function mergeRecords(existing, incoming) {
  const byName = new Map();
  existing.forEach(r => {
    if (!validateRecord(r)) return;
    const prev = byName.get(r.stationName);
    if (!prev || (r.checkInTime || 0) < (prev.checkInTime || 0)) {
      byName.set(r.stationName, { ...r });
    }
  });
  incoming.forEach(r => {
    if (!validateRecord(r)) return;
    const prev = byName.get(r.stationName);
    if (!prev || (r.checkInTime || 0) < (prev.checkInTime || 0)) {
      byName.set(r.stationName, { ...r });
    }
  });
  return Array.from(byName.values());
}

function mergeUnlockedIds(a, b) {
  return [...new Set([...(a || []), ...(b || [])])].sort((x, y) => x - y);
}

function applyBackup(parsed, mode) {
  const norm = normalizeBackup(parsed);
  if (!norm.ok) return norm;

  let records;
  let unlockedIds;
  if (mode === 'replace') {
    records = norm.records;
    unlockedIds = norm.unlockedIds;
  } else {
    let existingRecords = [];
    let existingAch = { unlockedIds: [] };
    try {
      existingRecords = wx.getStorageSync(CHECKIN_KEY) || [];
      existingAch = wx.getStorageSync(ACHIEVEMENT_KEY) || { unlockedIds: [] };
    } catch (e) {
      // ignore
    }
    records = mergeRecords(existingRecords, norm.records);
    unlockedIds = mergeUnlockedIds(existingAch.unlockedIds, norm.unlockedIds);
  }

  try {
    wx.setStorageSync(CHECKIN_KEY, records);
    wx.setStorageSync(ACHIEVEMENT_KEY, { unlockedIds });
  } catch (e) {
    return { ok: false, error: '写入本地存储失败' };
  }

  return {
    ok: true,
    recordCount: records.length,
    unlockedCount: unlockedIds.length
  };
}

function exportBackupJson() {
  return JSON.stringify(exportBackup(), null, 2);
}

module.exports = {
  BACKUP_VERSION,
  exportBackup,
  exportBackupJson,
  normalizeBackup,
  mergeRecords,
  mergeUnlockedIds,
  applyBackup
};
