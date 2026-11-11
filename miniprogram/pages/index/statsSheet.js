const checkin = require('../../utils/checkin.js');
const progressStats = require('../../utils/progressStats.js');

const STATS_SHEET_CLOSE_MS = 340;

function buildStatsSheetPayload(page, type) {
  const records = checkin.getRecords();
  if (type === 'global') {
    const list = progressStats.getCheckedStationList(records);
    return {
      activeStatsSheet: 'global',
      statsSheetTitle: '整体打卡进度',
      statsSheetSubtitle: `${page.data.globalCheckedCount} / ${page.data.globalTotalCount}（${page.data.globalProgress}%）`,
      statsSheetList: list,
      statsSheetSections: [],
      statsCalendar: null
    };
  }
  if (type === 'line') {
    const detail = progressStats.getLineProgressDetail(
      page.allLines,
      page.data.currentLine,
      records
    );
    return {
      activeStatsSheet: 'line',
      statsSheetTitle: `${detail.lineLabel}进度`,
      statsSheetSubtitle: `${detail.checkedCount} / ${detail.totalCount}（${detail.progress}%）`,
      statsSheetList: [],
      statsSheetSections: [
        { id: 'checked', title: '已打卡', emptyText: '本线暂无打卡', items: detail.checked },
        { id: 'unchecked', title: '未打卡', emptyText: '本线已全部打卡', items: detail.unchecked }
      ],
      statsCalendar: null
    };
  }
  if (type === 'month') {
    const list = progressStats.getMonthCheckedStations(records);
    return {
      activeStatsSheet: 'month',
      statsSheetTitle: '本月打卡',
      statsSheetSubtitle: `${list.length} 站`,
      statsSheetList: list,
      statsSheetSections: [],
      statsCalendar: null
    };
  }
  if (type === 'streak') {
    const cal = progressStats.buildMonthCalendar(new Date(), records);
    return {
      activeStatsSheet: 'streak',
      statsSheetTitle: '连续探索天',
      statsSheetSubtitle: `当前连续 ${cal.streakDays} 天`,
      statsSheetList: [],
      statsSheetSections: [],
      statsCalendar: cal
    };
  }
  return null;
}

const statsSheetMethods = {
  buildStatsSheetPayload(type) {
    return buildStatsSheetPayload(this, type);
  },

  refreshStatsSheetData() {
    const type = this.data.activeStatsSheet;
    if (!type || !this.data.statsSheetVisible) return;
    const payload = buildStatsSheetPayload(this, type);
    if (payload) this.setData(payload);
  },

  openStatsSheet(event) {
    const type = (event && event.currentTarget && event.currentTarget.dataset.type)
      || (typeof event === 'string' ? event : '');
    if (!type) return;

    if (this.data.showAchievementPage || this.data.achievementOverlayVisible) {
      this._closeAchievementPanel();
    }

    const payload = buildStatsSheetPayload(this, type);
    if (!payload) return;

    this._statsSheetToken = (this._statsSheetToken || 0) + 1;
    const token = this._statsSheetToken;

    if (this._statsSheetCloseTimer) {
      clearTimeout(this._statsSheetCloseTimer);
      this._statsSheetCloseTimer = null;
    }

    this.setData({
      ...payload,
      statsSheetVisible: true,
      statsSheetOpen: false
    }, () => {
      wx.nextTick(() => {
        if (token !== this._statsSheetToken) return;
        this.setData({ statsSheetOpen: true });
      });
    });
  },

  _closeStatsSheet() {
    this._statsSheetToken = (this._statsSheetToken || 0) + 1;
    const token = this._statsSheetToken;

    this.setData({ statsSheetOpen: false });
    if (this._statsSheetCloseTimer) clearTimeout(this._statsSheetCloseTimer);
    this._statsSheetCloseTimer = setTimeout(() => {
      if (token !== this._statsSheetToken) return;
      this.setData({
        statsSheetVisible: false,
        activeStatsSheet: '',
        statsSheetTitle: '',
        statsSheetSubtitle: '',
        statsSheetList: [],
        statsSheetSections: [],
        statsCalendar: null
      });
      this._statsSheetCloseTimer = null;
    }, STATS_SHEET_CLOSE_MS);
  },

  closeStatsSheet() {
    if (!this.data.statsSheetOpen && !this.data.statsSheetVisible) return;
    this._closeStatsSheet();
  }
};

module.exports = {
  STATS_SHEET_CLOSE_MS,
  buildStatsSheetPayload,
  statsSheetMethods
};
