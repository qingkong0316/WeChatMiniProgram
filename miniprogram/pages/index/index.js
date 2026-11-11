const { allLines } = require('../../data/lines.js');
const { metroAchievements } = require('../../data/achievements.js');
const checkin = require('../../utils/checkin.js');
const stationGraph = require('../../utils/stationGraph.js');
const metroMapState = require('../../utils/metroMapState.js');
const achievementProgress = require('../../utils/achievementProgress.js');
const progressStats = require('../../utils/progressStats.js');
const nearestStationsUtil = require('../../utils/nearestStations.js');
const { getDistance, formatDistance, isFarFromMetro } = require('../../utils/geo.js');
const { formatLineLabel } = require('../../utils/lineLabels.js');
const backupUtil = require('../../utils/backup.js');
const { evaluateUnlockedIds } = require('../../utils/achievementRules.js');
const { statsSheetMethods } = require('./statsSheet.js');
const { schematicStations } = require('../../data/metroSchematic.js');

const CHECKIN_RADIUS = 200;
const CHECKIN_STORAGE_KEY = 'checkin_records';
const ACHIEVEMENT_STORAGE_KEY = 'achievement_unlocked';
const ACHIEVEMENT_TOTAL = 100;
const MEMO_MAX_LEN = 30;
const BACKUP_MODAL_CLOSE_MS = 300;
const ACHIEVEMENT_CATEGORIES = [
  { id: 'landmark', title: '魔都地标篇', minId: 1, maxId: 10 },
  { id: 'fun', title: '趣味联动篇', minId: 11, maxId: 20 },
  { id: 'campus', title: '高校青葱篇', minId: 21, maxId: 30 },
  { id: 'commute', title: '狂暴通勤篇', minId: 31, maxId: 40 },
  { id: 'milestone', title: '探索里程碑', minId: 41, maxId: 50 },
  { id: 'line', title: '线路征服篇', minId: 51, maxId: 60 },
  { id: 'transfer', title: '换乘枢纽篇', minId: 61, maxId: 70 },
  { id: 'region', title: '区域联动篇', minId: 71, maxId: 80 },
  { id: 'journey', title: '旅程拓扑篇', minId: 81, maxId: 90 },
  { id: 'advanced', title: '进阶探索篇', minId: 91, maxId: 100 }
];
const ACHIEVEMENT_PANEL_CLOSE_MS = 400;
const DEVELOPER_MODAL_CLOSE_MS = 300;
const CHECKIN_SUCCESS_MODAL_CLOSE_MS = 300;
const ACHIEVEMENT_UNLOCK_CLOSE_MS = 300;
// 填入 WPS 分享链接即开通意见箱；留空 '' 则显示「暂未上线」
const FEEDBACK_FORM_URL = '';

function isFeedbackEnabled() {
  const url = (FEEDBACK_FORM_URL || '').trim();
  return url.length > 0 && /^https?:\/\//i.test(url);
}

function formatCheckTime(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getRecordByNameMap() {
  const map = {};
  checkin.getRecords().forEach(r => {
    map[r.stationName] = r;
  });
  return map;
}

function saveMemo(stationName, memo) {
  try {
    const records = checkin.getRecords();
    const idx = records.findIndex(r => r.stationName === stationName);
    if (idx < 0) return;
    records[idx].memo = memo.slice(0, MEMO_MAX_LEN);
    checkin.saveRecords ? checkin.saveRecords(records) : wx.setStorageSync(CHECKIN_STORAGE_KEY, records);
  } catch (e) {
    // ignore storage errors
  }
}

function pickNextAchievement(achievementList) {
  const item = achievementList.find(a => a.almostDone && !a.unlocked);
  if (!item) return { id: 0, hint: '' };
  return {
    id: item.id,
    hint: item.remainingHint ? `${item.name}：${item.remainingHint}` : item.name
  };
}

function findCategoryIdForAchievement(achievementId) {
  const cat = ACHIEVEMENT_CATEGORIES.find(
    c => achievementId >= c.minId && achievementId <= c.maxId
  );
  return cat ? cat.id : '';
}

function resolveStationLineKey(name, preferredLine) {
  if (preferredLine) return preferredLine;
  const st = schematicStations.find(s => s.name === name);
  return st && st.lines.length ? st.lines[0] : '';
}

function sortLineKeys(keys) {
  return keys.sort((a, b) => {
    const aNum = parseInt(a, 10);
    const bNum = parseInt(b, 10);
    const aIsNum = !isNaN(aNum);
    const bIsNum = !isNaN(bNum);
    if (aIsNum && bIsNum) return aNum - bNum;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return a.localeCompare(b);
  });
}

function getUniqueStationNames(allLines) {
  const names = new Set();
  Object.values(allLines).forEach(list => list.forEach(s => names.add(s.name)));
  return names;
}

function computeGlobalProgress(allLines) {
  const allNames = getUniqueStationNames(allLines);
  const checkedNames = new Set(checkin.getRecords().map(r => r.stationName));
  const globalTotalCount = allNames.size;
  const globalCheckedCount = checkedNames.size;
  const globalProgress = globalTotalCount > 0
    ? Math.round((globalCheckedCount / globalTotalCount) * 100)
    : 0;
  return { globalCheckedCount, globalTotalCount, globalProgress };
}

function buildAchievementContext(records, global, lines) {
  const graph = stationGraph.createGraphHelpers(records, lines);
  const normNames = records.map(r => stationGraph.normalizeStationName(r.stationName));
  return {
    records,
    count: new Set(records.map(r => r.stationName)).size,
    globalProgress: global.globalProgress,
    has: name => {
      const norm = stationGraph.normalizeStationName(name);
      return normNames.some(n => n === norm);
    },
    hasAny: list => list.some(name => {
      const norm = stationGraph.normalizeStationName(name);
      return normNames.some(n => n === norm);
    }),
    hasAll: list => list.every(name => {
      const norm = stationGraph.normalizeStationName(name);
      return normNames.some(n => n === norm);
    }),
    ...graph
  };
}

function getStoredUnlockedIds() {
  try {
    const stored = wx.getStorageSync(ACHIEVEMENT_STORAGE_KEY);
    return (stored && stored.unlockedIds) || [];
  } catch (e) {
    return [];
  }
}

function buildAchievementList(unlockedIds) {
  const set = new Set(unlockedIds);
  return metroAchievements.map(a => {
    const unlocked = set.has(a.id);
    const secret = !!a.secret;
    return {
      id: a.id,
      emoji: unlocked || !secret ? a.emoji : '❓',
      unlocked,
      secret,
      almostDone: false,
      name: unlocked ? a.name : (secret ? '隐藏成就' : a.name),
      desc: unlocked ? a.desc : (secret ? '达成特殊条件后揭晓' : a.desc)
    };
  });
}

function isAlmostDoneHint(hint) {
  if (!hint) return false;
  return /还差 1 站|还差完成 1 条|还差 1 个|下一步建议|还差 1%|再打卡 1 站|还差 1 条备注/.test(hint);
}

function buildAchievementCategories(achievementList, expandedCategoryId) {
  return ACHIEVEMENT_CATEGORIES.map(cat => {
    const items = achievementList.filter(
      a => a.id >= cat.minId && a.id <= cat.maxId
    );
    return {
      ...cat,
      expanded: expandedCategoryId === cat.id,
      items,
      totalInSection: items.length,
      unlockedInSection: items.filter(a => a.unlocked).length
    };
  });
}

function extractIntroQuote(name) {
  const highlight = metroMapState.getStationHighlight
    ? metroMapState.getStationHighlight(name)
    : '';
  if (highlight) {
    const text = highlight.trim();
    if (text.length <= 36) return text;
    return `${text.slice(0, 36)}…`;
  }
  const intro = metroMapState.getStationIntro(name);
  if (!intro) return '';
  const firstSentence = intro.split(/[。！？\n]/)[0];
  const text = (firstSentence || intro).trim();
  if (text.length <= 36) return text;
  return `${text.slice(0, 36)}…`;
}

Page({
  ...statsSheetMethods,

  data: {
    stations: [],
    currentLine: '1',
    currentLineLabel: '1号线',
    lineKeys: [],
    checkedCount: 0,
    totalCount: 0,
    progress: 0,
    globalCheckedCount: 0,
    globalTotalCount: 0,
    globalProgress: 0,
    nearestStation: null,
    nearestDistance: null,
    nearestStations: [],
    canCheckIn: false,
    locating: false,
    achievementList: [],
    unlockedCount: 0,
    achievementTotal: ACHIEVEMENT_TOTAL,
    showAchievementPage: false,
    achievementOverlayVisible: false,
    expandedCategoryId: '',
    achievementCategories: [],
    showDeveloperModal: false,
    developerOverlayVisible: false,
    showFeedbackModal: false,
    feedbackOverlayVisible: false,
    feedbackEnabled: false,
    showCheckinSuccessModal: false,
    checkinSuccessOverlayVisible: false,
    checkinSuccessStation: '',
    checkinSuccessQuote: '',
    checkinSuccessUnlocks: '',
    locationFailed: false,
    locationFarAway: false,
    checkinButtonText: '请靠近站点（200米内）',
    stationSearchQuery: '',
    globalSearchScope: 'line',
    nextAchievementHint: '',
    nextAchievementId: 0,
    highlightAchievementId: 0,
    achievementScrollTop: 0,
    achievementScrollAnimate: true,
    achievementPreparing: false,
    showBackupModal: false,
    backupOverlayVisible: false,
    stationScrollIntoView: '',
    monthCheckinCount: 0,
    lastCheckinStation: '暂无',
    exploreStreakDays: 0,
    unlockOverlayVisible: false,
    showUnlockModal: false,
    unlockAchievement: null,
    showStationSheet: false,
    stationSheetData: null,
    stationSheetLine: '',
    statsSheetVisible: false,
    statsSheetOpen: false,
    activeStatsSheet: '',
    statsSheetTitle: '',
    statsSheetSubtitle: '',
    statsSheetList: [],
    statsSheetSections: [],
    statsCalendar: null,
    weekDayLabels: ['日', '一', '二', '三', '四', '五', '六'],
    developerPrefaceTitle: '开发者序言',
    developerPrefaceContent: `一切想法的开端，不过是地铁站里一张普通的线路图。

和朋友驻足其间，对着星罗棋布的站点，细数我们走过的轨迹。那些站台串联起无数日常，故事的细节渐渐漫漶，可踏足此地的感受，却始终清晰。

「不如在毕业前，集齐上海所有地铁站吧？」朋友的一句玩笑，轻轻落在心底。

我不知道答案会是什么，只知道这是一份值得奔赴的期许。

「如果有一天，我们现在所经历的也会消失在回忆里，我希望它能以别的方式被记住。」

Qingkong
2026.5.31
在华东师范大学图书馆`
  },

  openMetroMap() {
    wx.navigateTo({ url: '/pages/metro-map/metro-map' });
  },

  onLoad() {
    this.allLines = allLines;
    this._flatStations = null;
    this._transferMap = metroMapState.getTransferMap();
    this._skipNextOnShowRefresh = true;
    this.setData({ lineKeys: sortLineKeys(Object.keys(allLines)), feedbackEnabled: isFeedbackEnabled() });
    checkin.getRecords();
    this.loadLineData('1');
    this.refreshNearestStation();
    this.checkAchievements(true);
  },

  onShow() {
    if (this._skipNextOnShowRefresh) {
      this._skipNextOnShowRefresh = false;
      return;
    }
    const app = getApp();
    const pending = app.globalData.pendingNav;
    if (pending && pending.line) {
      app.globalData.pendingNav = null;
      this.focusLineAndStation(pending.line, pending.stationName || '');
      this.refreshNearestStation();
      const alreadyChecked = pending.stationName && checkin.isCheckedByName(pending.stationName);
      wx.showToast({
        title: alreadyChecked ? '该站已打卡' : '请在200米内打卡',
        icon: 'none'
      });
      return;
    }
    if (this.allLines) {
      this.loadLineData(this.data.currentLine);
      this.refreshNearestStation();
      this.refreshStatsSheetData();
    }
  },

  getLocation() {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: resolve,
        fail: reject
      });
    });
  },

  flattenAllStations() {
    if (this._flatStations) return this._flatStations;
    const flat = [];
    Object.keys(this.allLines).forEach(line => {
      this.allLines[line].forEach(station => {
        flat.push({ ...station, line });
      });
    });
    this._flatStations = flat;
    return flat;
  },

  findNearestStations(lat, lng, limit = 3) {
    const ranked = nearestStationsUtil.rankStationsByDistance(
      this.flattenAllStations(),
      lat,
      lng,
      getDistance
    );
    return nearestStationsUtil.pickNearestStations(
      ranked,
      name => checkin.isCheckedByName(name),
      limit
    );
  },

  updateNearestFromCoords(lat, lng) {
    const rawNearest = this.findNearestStations(lat, lng, 3);
    const nearestStations = rawNearest.map(s => ({
      ...s,
      checked: checkin.isCheckedByName(s.name),
      lineLabel: formatLineLabel(s.line),
      distanceText: formatDistance(s.distance)
    }));
    if (!nearestStations.length) {
      this.setData({
        nearestStations: [],
        nearestStation: null,
        nearestDistance: null,
        canCheckIn: false,
        locating: false,
        locationFailed: false,
        locationFarAway: false,
        checkinButtonText: '请靠近站点（200米内）'
      });
      this.refreshStatsSheetData();
      return;
    }

    const first = nearestStations[0];
    const canCheckIn = nearestStations.some(
      s => s.distance <= CHECKIN_RADIUS && !checkin.isCheckedByName(s.name)
    );
    const checkInTarget = nearestStations.find(
      s => s.distance <= CHECKIN_RADIUS && !s.checked
    );
    const checkinButtonText = checkInTarget
      ? `打卡 ${checkInTarget.name}`
      : (canCheckIn ? '打卡' : '请靠近站点（200米内）');

    this.setData({
      nearestStations,
      nearestStation: {
        id: first.id,
        name: first.name,
        latitude: first.latitude,
        longitude: first.longitude,
        line: first.line
      },
      nearestDistance: first.distance,
      canCheckIn,
      locating: false,
      locationFailed: false,
      locationFarAway: isFarFromMetro(first.distance),
      checkinButtonText
    });
    this.refreshStatsSheetData();
  },

  refreshNearestStation() {
    this._locRefreshToken = (this._locRefreshToken || 0) + 1;
    const token = this._locRefreshToken;
    this.setData({ locating: true, locationFailed: false });
    this.getLocation()
      .then(res => {
        if (token !== this._locRefreshToken) return;
        this._lastLocation = { latitude: res.latitude, longitude: res.longitude };
        this.updateNearestFromCoords(res.latitude, res.longitude);
      })
      .catch(() => {
        if (token !== this._locRefreshToken) return;
        this.setData({
          locating: false,
          locationFailed: true,
          nearestStations: [],
          nearestStation: null,
          nearestDistance: null,
          canCheckIn: false
        });
      });
  },

  openLocationSettings() {
    wx.openSetting({
      success: (res) => {
        if (res.authSetting && res.authSetting['scope.userLocation']) {
          this.refreshNearestStation();
        }
      }
    });
  },

  onStatsSheetItemTap(event) {
    const name = event.currentTarget.dataset.name;
    const line = event.currentTarget.dataset.line || this.data.currentLine;
    if (!name) return;
    const detail = metroMapState.getStationDetail(
      name,
      checkin.getRecords(),
      this._transferMap
    );
    this.setData({
      showStationSheet: true,
      stationSheetData: detail,
      stationSheetLine: line
    });
  },

  openStatsSheetItemInMap(event) {
    const name = event.currentTarget.dataset.name;
    const line = resolveStationLineKey(
      name,
      event.currentTarget.dataset.line || ''
    ) || this.data.currentLine;
    if (!name) return;
    this.closeStatsSheet();
    wx.navigateTo({
      url: `/pages/metro-map/metro-map?focus=${encodeURIComponent(name)}&line=${encodeURIComponent(line)}`
    });
  },

  onNextAchievementTap() {
    const id = this.data.nextAchievementId;
    if (!id) {
      this.toggleAchievementPage();
      return;
    }
    this._openAchievementWithFocus(id);
  },

  _openAchievementWithFocus(achievementId) {
    const categoryId = findCategoryIdForAchievement(achievementId);
    if (this.data.statsSheetVisible || this.data.statsSheetOpen) {
      this._closeStatsSheet();
    }
    if (this._highlightClearTimer) {
      clearTimeout(this._highlightClearTimer);
      this._highlightClearTimer = null;
    }
    if (this._achievementCloseTimer) {
      clearTimeout(this._achievementCloseTimer);
      this._achievementCloseTimer = null;
    }

    this.setData({
      achievementOverlayVisible: true,
      achievementPreparing: true,
      showAchievementPage: false,
      expandedCategoryId: categoryId,
      highlightAchievementId: achievementId,
      achievementScrollTop: 0,
      achievementScrollAnimate: false
    }, () => {
      this.refreshAchievementCategories();
      wx.nextTick(() => {
        wx.nextTick(() => {
          this._scrollAchievementIntoCenter(achievementId, () => {
            this.setData({
              achievementPreparing: false,
              showAchievementPage: true
            }, () => {
              wx.nextTick(() => {
                this.setData({ achievementScrollAnimate: true });
              });
            });
          });
        });
      });
      this._highlightClearTimer = setTimeout(() => {
        this.setData({ highlightAchievementId: 0 });
        this._highlightClearTimer = null;
      }, 4500);
    });
  },

  _scrollAchievementIntoCenter(achievementId, callback) {
    const targetId = `#achievement-${achievementId}`;
    const query = wx.createSelectorQuery().in(this);
    query.select('.achievement-panel-scroll').boundingClientRect();
    query.select('.achievement-panel-scroll').scrollOffset();
    query.select(targetId).boundingClientRect();
    query.exec((res) => {
      const scrollView = res[0];
      const scrollOffset = res[1];
      const target = res[2];
      if (!scrollView || !target || !scrollView.height) {
        if (callback) callback();
        return;
      }

      const currentTop = scrollOffset ? scrollOffset.scrollTop : 0;
      const targetTopInScroll = target.top - scrollView.top + currentTop;
      const centeredTop = targetTopInScroll - (scrollView.height / 2) + (target.height / 2);
      const scrollTop = Math.max(0, Math.round(centeredTop));

      this.setData({ achievementScrollTop: scrollTop }, callback);
    });
  },

  tapBackupBox() {
    this.toggleBackupModal();
  },

  toggleBackupModal() {
    if (this.data.showBackupModal) {
      this._closeBackupModal();
      return;
    }
    if (this._backupCloseTimer) {
      clearTimeout(this._backupCloseTimer);
      this._backupCloseTimer = null;
    }
    this.setData({ backupOverlayVisible: true, showBackupModal: false }, () => {
      wx.nextTick(() => this.setData({ showBackupModal: true }));
    });
  },

  _closeBackupModal() {
    this.setData({ showBackupModal: false });
    if (this._backupCloseTimer) clearTimeout(this._backupCloseTimer);
    this._backupCloseTimer = setTimeout(() => {
      this.setData({ backupOverlayVisible: false });
      this._backupCloseTimer = null;
    }, BACKUP_MODAL_CLOSE_MS);
  },

  closeBackupModal() {
    if (!this.data.showBackupModal) return;
    this._closeBackupModal();
  },

  exportBackupData() {
    const json = backupUtil.exportBackupJson();
    wx.setClipboardData({
      data: json,
      success: () => {
        wx.showModal({
          title: '备份已复制',
          content: '打卡与成就数据已复制到剪贴板，请粘贴保存到备忘录或文件。',
          showCancel: false
        });
      }
    });
  },

  importBackupMerge() {
    this._promptImportBackup('merge');
  },

  importBackupReplace() {
    wx.showModal({
      title: '覆盖恢复',
      content: '将用备份完全替换当前打卡与成就数据，此操作不可撤销。确定继续？',
      success: (res) => {
        if (res.confirm) this._promptImportBackup('replace');
      }
    });
  },

  _promptImportBackup(mode) {
    wx.showModal({
      title: mode === 'replace' ? '粘贴备份（覆盖）' : '粘贴备份（合并）',
      editable: true,
      placeholderText: '粘贴此前导出的 JSON',
      success: (res) => {
        if (!res.confirm) return;
        const text = (res.content || '').trim();
        if (!text) {
          wx.showToast({ title: '内容为空', icon: 'none' });
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          wx.showToast({ title: 'JSON 格式无效', icon: 'none' });
          return;
        }
        const result = backupUtil.applyBackup(parsed, mode);
        if (!result.ok) {
          wx.showToast({ title: result.error || '导入失败', icon: 'none' });
          return;
        }
        this.checkAchievements(true);
        this.loadLineData(this.data.currentLine);
        this.refreshNearestStation();
        this._closeBackupModal();
        wx.showToast({
          title: `已恢复 ${result.recordCount} 站`,
          icon: 'success'
        });
      }
    });
  },

  onLastStationTap() {
    const name = this.data.lastCheckinStation;
    if (!name || name === '暂无') return;
    const detail = metroMapState.getStationDetail(
      name,
      checkin.getRecords(),
      this._transferMap
    );
    this.setData({
      showStationSheet: true,
      stationSheetData: detail,
      stationSheetLine: this.data.currentLine
    });
  },

  switchLine(event) {
    const lineNum = event.currentTarget.dataset.line;
    if (lineNum === this.data.currentLine) return;
    this.setData({
      showStationSheet: false,
      stationSheetData: null,
      stationSearchQuery: '',
      stationScrollIntoView: ''
    });
    this.loadLineData(lineNum);
  },

  onStationSearchInput(event) {
    const query = (event.detail.value || '').trim();
    this.setData({ stationSearchQuery: query });
    this.loadLineData(this.data.currentLine, { searchQuery: query });
  },

  toggleSearchScope(event) {
    const scope = event.currentTarget.dataset.scope;
    if (!scope || scope === this.data.globalSearchScope) return;
    this.setData({ globalSearchScope: scope });
    this.loadLineData(this.data.currentLine, { searchQuery: this.data.stationSearchQuery || '' });
  },

  clearStationSearch() {
    this.setData({ stationSearchQuery: '' });
    this.loadLineData(this.data.currentLine, { searchQuery: '' });
  },

  focusLineAndStation(lineNum, stationName) {
    const opts = stationName
      ? { scrollToName: stationName, searchQuery: '' }
      : { searchQuery: '' };
    if (lineNum && lineNum !== this.data.currentLine) {
      this.setData({ stationSearchQuery: '', stationScrollIntoView: '' });
      this.loadLineData(lineNum, opts);
      return;
    }
    if (stationName) {
      this.setData({ stationSearchQuery: '' });
      this.loadLineData(this.data.currentLine, opts);
    }
  },

  loadLineData(lineNum, options = {}) {
    const global = computeGlobalProgress(this.allLines);
    const searchQuery = options.searchQuery !== undefined
      ? options.searchQuery
      : (this.data.stationSearchQuery || '');
    const globalSearch = this.data.globalSearchScope === 'global';

    if (globalSearch && searchQuery) {
      const recordByName = getRecordByNameMap();
      const seen = new Set();
      let stations = [];
      Object.keys(this.allLines).forEach(lineKey => {
        (this.allLines[lineKey] || []).forEach(s => {
          if (seen.has(s.name)) return;
          seen.add(s.name);
          const rec = recordByName[s.name];
          const checked = !!rec;
          stations.push({
            id: s.id,
            name: s.name,
            lineKey,
            lineLabel: formatLineLabel(lineKey),
            latitude: s.latitude,
            longitude: s.longitude,
            checked,
            checkTimeText: checked ? formatCheckTime(rec.checkInTime) : '',
            memo: checked ? (rec.memo || '') : ''
          });
        });
      });
      const q = searchQuery.toLowerCase();
      stations = stations.filter(s => s.name.toLowerCase().includes(q));
      stations.sort((a, b) => {
        if (a.checked === b.checked) return a.name.localeCompare(b.name, 'zh-CN');
        return a.checked ? 1 : -1;
      });

      const stats = progressStats.computeProgressStats(checkin.getRecords());
      const source = this.allLines[lineNum] || [];
      const checkedCount = source.filter(s => recordByName[s.name]).length;
      const totalCount = source.length;
      const progress = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

      this.setData({
        stations,
        currentLine: lineNum,
        currentLineLabel: formatLineLabel(lineNum),
        checkedCount,
        totalCount,
        progress,
        stationScrollIntoView: '',
        isGlobalSearchResult: true,
        ...global,
        ...stats
      });
      this.refreshStatsSheetData();
      return;
    }

    const source = this.allLines[lineNum];
    if (!source || source.length === 0) {
      const stats = progressStats.computeProgressStats(checkin.getRecords());
      this.setData({
        stations: [],
        currentLine: lineNum,
        currentLineLabel: formatLineLabel(lineNum),
        checkedCount: 0,
        totalCount: 0,
        progress: 0,
        stationScrollIntoView: '',
        ...global,
        ...stats
      });
      this.refreshStatsSheetData();
      return;
    }

    const recordByName = getRecordByNameMap();
    let stations = source.map(s => {
      const rec = recordByName[s.name];
      const checked = !!rec;
      return {
        id: s.id,
        name: s.name,
        latitude: s.latitude,
        longitude: s.longitude,
        checked,
        checkTimeText: checked ? formatCheckTime(rec.checkInTime) : '',
        memo: checked ? (rec.memo || '') : ''
      };
    });

    const checkedCount = stations.filter(s => s.checked).length;
    const totalCount = stations.length;
    const progress = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      stations = stations.filter(s => s.name.toLowerCase().includes(q));
    }

    stations.sort((a, b) => {
      if (a.checked === b.checked) return 0;
      return a.checked ? 1 : -1;
    });

    const stats = progressStats.computeProgressStats(checkin.getRecords());
    let stationScrollIntoView = '';
    if (options.scrollToName) {
      const target = stations.find(s => s.name === options.scrollToName);
      if (target) stationScrollIntoView = `station-${target.id}`;
    }

    this.setData({
      stations,
      currentLine: lineNum,
      currentLineLabel: formatLineLabel(lineNum),
      checkedCount,
      totalCount,
      progress,
      stationScrollIntoView,
      isGlobalSearchResult: false,
      ...global,
      ...stats
    });

    this.refreshStatsSheetData();

    if (stationScrollIntoView) {
      setTimeout(() => {
        this.setData({ stationScrollIntoView: '' });
      }, 400);
    }
  },

  checkAchievements(silent = false) {
    const prevIds = getStoredUnlockedIds();
    const records = checkin.getRecords();
    const global = computeGlobalProgress(this.allLines);
    const ctx = buildAchievementContext(records, global, this.allLines);

    const unlockedIds = evaluateUnlockedIds(ctx);

    const newlyUnlocked = unlockedIds.filter(id => !prevIds.includes(id));

    try {
      wx.setStorageSync(ACHIEVEMENT_STORAGE_KEY, { unlockedIds });
    } catch (e) {
      // ignore storage errors
    }

    const achievementList = achievementProgress.attachRemainingHints(
      buildAchievementList(unlockedIds),
      ctx
    ).map(a => ({
      ...a,
      almostDone: !a.unlocked && isAlmostDoneHint(a.remainingHint)
    }));

    const next = pickNextAchievement(achievementList);

    this.setData({
      achievementList,
      unlockedCount: unlockedIds.length,
      nextAchievementId: next.id,
      nextAchievementHint: next.hint
    });
    this.refreshAchievementCategories();

    if (!silent && newlyUnlocked.length) {
      this._showAchievementUnlockQueue(newlyUnlocked);
    }

    return { unlockedIds, newlyUnlocked };
  },

  refreshAchievementCategories() {
    const { achievementList, expandedCategoryId } = this.data;
    this.setData({
      achievementCategories: buildAchievementCategories(
        achievementList,
        expandedCategoryId
      )
    });
  },

  toggleAchievementPage() {
    if (this.data.showAchievementPage) {
      this._closeAchievementPanel();
      return;
    }
    if (this.data.statsSheetVisible || this.data.statsSheetOpen) {
      this._closeStatsSheet();
    }
    if (this._achievementCloseTimer) {
      clearTimeout(this._achievementCloseTimer);
      this._achievementCloseTimer = null;
    }
    this.setData({
      achievementOverlayVisible: true,
      showAchievementPage: false,
      expandedCategoryId: ''
    }, () => {
      this.refreshAchievementCategories();
      wx.nextTick(() => {
        this.setData({ showAchievementPage: true });
      });
    });
  },

  _closeAchievementPanel() {
    if (this._highlightClearTimer) {
      clearTimeout(this._highlightClearTimer);
      this._highlightClearTimer = null;
    }
    this.setData({
      showAchievementPage: false,
      achievementPreparing: false,
      highlightAchievementId: 0,
      achievementScrollTop: 0,
      achievementScrollAnimate: true
    });
    if (this._achievementCloseTimer) {
      clearTimeout(this._achievementCloseTimer);
    }
    this._achievementCloseTimer = setTimeout(() => {
      this.setData({ achievementOverlayVisible: false });
      this._achievementCloseTimer = null;
    }, ACHIEVEMENT_PANEL_CLOSE_MS);
  },

  closeAchievementPage() {
    if (!this.data.showAchievementPage) return;
    this._closeAchievementPanel();
  },

  toggleCategory(event) {
    const id = event.currentTarget.dataset.id;
    const nextId = this.data.expandedCategoryId === id ? '' : id;
    this.setData({ expandedCategoryId: nextId }, () => {
      this.refreshAchievementCategories();
    });
  },

  noop() {},

  tapDeveloperModal() {
    this.toggleDeveloperModal();
  },

  toggleDeveloperModal() {
    if (this.data.showDeveloperModal) {
      this._closeDeveloperModal();
      return;
    }
    if (this._developerCloseTimer) {
      clearTimeout(this._developerCloseTimer);
      this._developerCloseTimer = null;
    }
    this.setData({ developerOverlayVisible: true, showDeveloperModal: false }, () => {
      wx.nextTick(() => this.setData({ showDeveloperModal: true }));
    });
  },

  _closeDeveloperModal() {
    this.setData({ showDeveloperModal: false });
    if (this._developerCloseTimer) clearTimeout(this._developerCloseTimer);
    this._developerCloseTimer = setTimeout(() => {
      this.setData({ developerOverlayVisible: false });
      this._developerCloseTimer = null;
    }, DEVELOPER_MODAL_CLOSE_MS);
  },

  closeDeveloperModal() {
    if (!this.data.showDeveloperModal) return;
    this._closeDeveloperModal();
  },

  tapFeedbackBox() {
    this.toggleFeedbackModal();
  },

  toggleFeedbackModal() {
    if (this.data.showFeedbackModal) {
      this._closeFeedbackModal();
      return;
    }
    if (this._feedbackCloseTimer) {
      clearTimeout(this._feedbackCloseTimer);
      this._feedbackCloseTimer = null;
    }
    this.setData({
      feedbackEnabled: isFeedbackEnabled(),
      feedbackOverlayVisible: true,
      showFeedbackModal: false
    }, () => {
      wx.nextTick(() => this.setData({ showFeedbackModal: true }));
    });
  },

  _closeFeedbackModal() {
    this.setData({ showFeedbackModal: false });
    if (this._feedbackCloseTimer) clearTimeout(this._feedbackCloseTimer);
    this._feedbackCloseTimer = setTimeout(() => {
      this.setData({ feedbackOverlayVisible: false });
      this._feedbackCloseTimer = null;
    }, DEVELOPER_MODAL_CLOSE_MS);
  },

  closeFeedbackModal() {
    if (!this.data.showFeedbackModal) return;
    this._closeFeedbackModal();
  },

  openFeedbackForm() {
    if (!isFeedbackEnabled()) {
      wx.showToast({ title: '意见箱暂未开放', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: FEEDBACK_FORM_URL.trim(),
      success: () => {
        wx.showModal({
          title: '链接已复制',
          content: '在浏览器或 WPS 里粘贴打开，就能写下你的想法啦 ✨',
          showCancel: false
        });
      }
    });
  },

  copyFeedbackContext() {
    if (!isFeedbackEnabled()) {
      wx.showToast({ title: '意见箱暂未开放', icon: 'none' });
      return;
    }
    const sys = wx.getSystemInfoSync();
    const lines = [
      '上海地铁打卡 · 反馈参考',
      `已打卡 ${this.data.globalCheckedCount}/${this.data.globalTotalCount} 站`,
      `连续探索 ${this.data.exploreStreakDays} 天`,
      `本月打卡 ${this.data.monthCheckinCount} 站`,
      `设备 ${sys.model || '未知'} · 微信 ${sys.version || ''} · 基础库 ${sys.SDKVersion || ''}`
    ];
    wx.setClipboardData({
      data: lines.join('\n'),
      success: () => {
        wx.showToast({ title: '参考信息已复制，可贴进表单', icon: 'none' });
      }
    });
  },

  _showAchievementUnlockQueue(newIds) {
    this._unlockQueue = [...newIds];
    this._showNextAchievementUnlock();
  },

  _showNextAchievementUnlock() {
    if (!this._unlockQueue || !this._unlockQueue.length) {
      this._unlockQueue = null;
      return;
    }
    const id = this._unlockQueue.shift();
    const ach = metroAchievements.find(a => a.id === id);
    if (!ach) {
      this._showNextAchievementUnlock();
      return;
    }
    if (this._unlockCloseTimer) {
      clearTimeout(this._unlockCloseTimer);
      this._unlockCloseTimer = null;
    }
    try {
      wx.vibrateShort({ type: 'medium' });
    } catch (e) {
      // ignore
    }
    this.setData({
      unlockOverlayVisible: true,
      showUnlockModal: false,
      unlockAchievement: {
        emoji: ach.emoji,
        name: ach.name,
        desc: ach.desc
      }
    }, () => {
      wx.nextTick(() => this.setData({ showUnlockModal: true }));
    });
  },

  closeAchievementUnlockModal() {
    if (!this.data.showUnlockModal) return;
    this.setData({ showUnlockModal: false });
    if (this._unlockCloseTimer) clearTimeout(this._unlockCloseTimer);
    this._unlockCloseTimer = setTimeout(() => {
      this.setData({ unlockOverlayVisible: false, unlockAchievement: null });
      this._unlockCloseTimer = null;
      this._showNextAchievementUnlock();
    }, ACHIEVEMENT_UNLOCK_CLOSE_MS);
  },

  _showCheckinSuccessModal(stationName, newlyUnlocked = []) {
    if (this._checkinSuccessCloseTimer) {
      clearTimeout(this._checkinSuccessCloseTimer);
      this._checkinSuccessCloseTimer = null;
    }
    const unlockNames = newlyUnlocked
      .map(id => metroAchievements.find(a => a.id === id))
      .filter(Boolean)
      .map(a => a.name);
    const checkinSuccessUnlocks = unlockNames.length
      ? `同时解锁：${unlockNames.slice(0, 3).join('、')}${unlockNames.length > 3 ? '…' : ''}`
      : '';
    try {
      wx.vibrateShort({ type: 'light' });
    } catch (e) {
      // ignore vibrate errors
    }
    this.setData({
      checkinSuccessStation: stationName,
      checkinSuccessQuote: extractIntroQuote(stationName),
      checkinSuccessUnlocks,
      checkinSuccessOverlayVisible: true,
      showCheckinSuccessModal: false
    }, () => {
      wx.nextTick(() => this.setData({ showCheckinSuccessModal: true }));
    });
  },

  _closeCheckinSuccessModal() {
    this.setData({ showCheckinSuccessModal: false });
    if (this._checkinSuccessCloseTimer) clearTimeout(this._checkinSuccessCloseTimer);
    this._checkinSuccessCloseTimer = setTimeout(() => {
      this.setData({
        checkinSuccessOverlayVisible: false,
        checkinSuccessStation: '',
        checkinSuccessQuote: '',
        checkinSuccessUnlocks: ''
      });
      this._checkinSuccessCloseTimer = null;
      if (this._pendingAchievementUnlock && this._pendingAchievementUnlock.length) {
        const queue = this._pendingAchievementUnlock;
        this._pendingAchievementUnlock = null;
        this._showAchievementUnlockQueue(queue);
      }
    }, CHECKIN_SUCCESS_MODAL_CLOSE_MS);
  },

  closeCheckinSuccessModal() {
    if (!this.data.showCheckinSuccessModal) return;
    this._closeCheckinSuccessModal();
  },

  handleCheckIn() {
    if (this._checkinBusy) return;
    this._checkinBusy = true;
    try {
      const { nearestStation, nearestStations, canCheckIn } = this.data;
      if (!nearestStation || !nearestStations.length) {
        wx.showToast({ title: '正在定位，请稍候', icon: 'none' });
        return;
      }

      const target = nearestStations.find(
        s => s.distance <= CHECKIN_RADIUS && !checkin.isCheckedByName(s.name)
      );

      if (!target) {
        const hint = nearestStations.find(s => !checkin.isCheckedByName(s.name)) || nearestStation;
        if (checkin.isCheckedByName(hint.name)) {
          wx.showToast({ title: '该站已打卡', icon: 'none' });
          return;
        }
        if (!canCheckIn) {
          wx.showModal({
            title: '无法打卡',
            content: `你距离${hint.name}${formatDistance(hint.distance)}，请靠近至${CHECKIN_RADIUS}米内再试。`,
            showCancel: false
          });
        }
        return;
      }

      const result = checkin.addRecord(target.id, target.name, target.line);
      if (!result.success) {
        wx.showToast({ title: '该站已打卡', icon: 'none' });
        return;
      }
      const { newlyUnlocked } = this.checkAchievements(true);
      this._pendingAchievementUnlock = newlyUnlocked;
      this._showCheckinSuccessModal(target.name, newlyUnlocked);
      this.focusLineAndStation(target.line, target.name);
      if (this._lastLocation) {
        this.updateNearestFromCoords(this._lastLocation.latitude, this._lastLocation.longitude);
      } else {
        this.refreshNearestStation();
      }
    } finally {
      this._checkinBusy = false;
    }
  },

  onNearestCardTap(event) {
    const name = event.currentTarget.dataset.name;
    const line = event.currentTarget.dataset.line || this.data.currentLine;
    if (!name) return;

    this.focusLineAndStation(line, name);

    const detail = metroMapState.getStationDetail(
      name,
      checkin.getRecords(),
      this._transferMap
    );
    this.setData({
      showStationSheet: true,
      stationSheetData: detail,
      stationSheetLine: line
    });
  },

  onStationCardTap(event) {
    const stationId = Number(event.currentTarget.dataset.id);
    const station = this.data.stations.find(s => s.id === stationId);
    if (!station) return;

    const line = station.lineKey || this.data.currentLine;
    if (station.lineKey && station.lineKey !== this.data.currentLine) {
      this.focusLineAndStation(station.lineKey, station.name);
      return;
    }

    const detail = metroMapState.getStationDetail(
      station.name,
      checkin.getRecords(),
      this._transferMap
    );
    this.setData({
      showStationSheet: true,
      stationSheetData: detail,
      stationSheetLine: line
    });
  },

  closeStationSheet() {
    this.setData({ showStationSheet: false, stationSheetLine: '' });
  },

  onViewMapFromSheet() {
    const { stationSheetData, stationSheetLine } = this.data;
    if (!stationSheetData) return;
    const line = stationSheetLine || this.data.currentLine;
    this.setData({ showStationSheet: false });
    wx.navigateTo({
      url: `/pages/metro-map/metro-map?focus=${encodeURIComponent(stationSheetData.name)}&line=${encodeURIComponent(line)}`
    });
  },

  onUndoFromSheet() {
    const { stationSheetData } = this.data;
    if (!stationSheetData || !stationSheetData.checked) return;

    wx.showModal({
      title: '撤销打卡',
      content: `确定撤销 ${stationSheetData.name} 的所有线路打卡记录吗？`,
      success: (res) => {
        if (!res.confirm) return;
        checkin.removeRecordsByName(stationSheetData.name);
        this.checkAchievements();
        this.setData({ showStationSheet: false, stationSheetData: null });
        this.loadLineData(this.data.currentLine);
        if (this._lastLocation) {
          this.updateNearestFromCoords(this._lastLocation.latitude, this._lastLocation.longitude);
        }
        wx.showToast({ title: '撤销成功' });
      }
    });
  },

  onCheckedCardTap(event) {
    this.onStationCardTap(event);
  },

  handleMemo(event) {
    const stationId = Number(event.currentTarget.dataset.id);
    const station = this.data.stations.find(s => s.id === stationId);
    if (!station) return;

    if (station.memo) {
      wx.showModal({
        title: `${station.name} 备注`,
        content: station.memo,
        showCancel: false
      });
      return;
    }

    wx.showModal({
      title: '添加备注',
      editable: true,
      placeholderText: '最多30字',
      success: (res) => {
        if (!res.confirm) return;
        const memo = (res.content || '').trim().slice(0, MEMO_MAX_LEN);
        if (!memo) return;
        saveMemo(station.name, memo);
        this.loadLineData(this.data.currentLine);
      }
    });
  },

  confirmDelete(event) {
    const stationId = Number(event.currentTarget.dataset.id);
    const station = this.data.stations.find(s => s.id === stationId);
    if (!station) return;

    wx.showModal({
      title: '取消打卡',
      content: `确定要删除 ${station.name} 的打卡记录吗？`,
      success: (res) => {
        if (res.confirm) {
          checkin.removeRecordsByName(station.name);
          this.checkAchievements();
          wx.showToast({ title: '撤销成功' });
          this.loadLineData(this.data.currentLine);
          if (this._lastLocation) {
            this.updateNearestFromCoords(this._lastLocation.latitude, this._lastLocation.longitude);
          }
        }
      }
    });
  }
});
