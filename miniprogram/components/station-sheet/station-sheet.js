const CLOSE_MS = 340;

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    theme: {
      type: String,
      value: 'journal'
    },
    station: {
      type: Object,
      value: null
    },
    showUndo: {
      type: Boolean,
      value: false
    },
    showMapLink: {
      type: Boolean,
      value: false
    },
    showCheckinLink: {
      type: Boolean,
      value: false
    }
  },

  data: {
    overlayVisible: false
  },

  observers: {
    visible(val) {
      if (val) {
        if (this._closeTimer) {
          clearTimeout(this._closeTimer);
          this._closeTimer = null;
        }
        this.setData({ overlayVisible: true });
      } else if (this.data.overlayVisible) {
        this._scheduleClose();
      }
    },
    station(val) {
      if (val && this.properties.visible) {
        this.setData({ overlayVisible: true });
      }
    }
  },

  lifetimes: {
    detached() {
      if (this._closeTimer) clearTimeout(this._closeTimer);
    }
  },

  methods: {
    noop() {},

    onOverlayTap() {
      this.onClose();
    },

    onClose() {
      this.triggerEvent('close');
    },

    onUndo() {
      this.triggerEvent('undo');
    },

    onViewMap() {
      this.triggerEvent('viewmap');
    },

    onCheckin() {
      this.triggerEvent('checkin');
    },

    _scheduleClose() {
      if (this._closeTimer) clearTimeout(this._closeTimer);
      this._closeTimer = setTimeout(() => {
        this.setData({ overlayVisible: false });
        this._closeTimer = null;
      }, CLOSE_MS);
    }
  }
});
