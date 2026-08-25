/**
 * Learner Action Panel shell (Batch 07.1) — responsive drawer/sheet with tab scaffold.
 * DOM id: #platform-control-panel. User-facing label: Action Panel.
 */
(function () {
  var SWIPE_DISMISS_PX = 80;
  var TAB_IDS = ['notes', 'tools', 'settings'];
  var initialized = false;
  var isOpen = false;
  var activeTab = 'notes';
  var triggerEl = null;
  var panelEl = null;
  var backdropEl = null;
  var surfaceEl = null;
  var handleEl = null;
  var closeBtnEl = null;
  var tabButtons = {};
  var tabPanels = {};
  var focusBeforeOpen = null;
  var revealKeyboardWasEnabled = true;
  var closeListeners = [];

  function notifyClosed() {
    closeListeners.forEach(function (fn) {
      try {
        fn();
      } catch (e) {
        /* ignore listener errors */
      }
    });
  }
  var touchStartY = null;
  var touchStartTime = null;
  var htmlObserver = null;
  var mediaQuery = null;

  function getParams() {
    return new URLSearchParams(window.location.search);
  }

  function decodeTokenClaims(token) {
    return PlatformTokenUtils.decodeTokenClaims(token);
  }

  function isSessionDeck() {
    var p = getParams();
    return p.has('session') && p.has('token');
  }

  function getTokenRole() {
    var p = getParams();
    var claims = decodeTokenClaims(p.get('token') || '');
    if (claims.role === 'instructor' || claims.role === 'learner') {
      return claims.role;
    }
    return 'learner';
  }

  function isBlockingOverlayActive() {
    var html = document.documentElement;
    return (
      html.classList.contains('platform-lobby-active') ||
      html.classList.contains('platform-session-ended-active')
    );
  }

  function isMobileLayout() {
    if (mediaQuery) return mediaQuery.matches;
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function updateLayoutClass() {
    var html = document.documentElement;
    html.classList.toggle('platform-control-panel-mobile', isMobileLayout());
    html.classList.toggle('platform-control-panel-desktop', !isMobileLayout());
  }

  function shouldShowPanel() {
    if (!isSessionDeck()) return false;
    if (getTokenRole() === 'instructor') return false;
    if (isBlockingOverlayActive()) return false;
    return true;
  }

  function getFocusableElements(root) {
    if (!root) return [];
    return Array.prototype.slice
      .call(
        root.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      .filter(function (el) {
        return el.offsetParent !== null || el === document.activeElement;
      });
  }

  function ensureTrigger() {
    if (triggerEl) return triggerEl;
    triggerEl = document.createElement('button');
    triggerEl.id = 'platform-control-panel-trigger';
    triggerEl.type = 'button';
    triggerEl.className = 'platform-control-panel-trigger';
    triggerEl.setAttribute('aria-label', 'Open Action Panel');
    triggerEl.setAttribute('aria-expanded', 'false');
    triggerEl.setAttribute('aria-controls', 'platform-control-panel');
    triggerEl.innerHTML =
      '<span class="platform-control-panel-trigger-icon" aria-hidden="true"></span>' +
      '<span class="platform-control-panel-trigger-label">Action Panel</span>';
    triggerEl.addEventListener('click', function () {
      open();
    });
    document.body.appendChild(triggerEl);
    return triggerEl;
  }

  function ensurePanel() {
    if (panelEl) return panelEl;

    panelEl = document.createElement('div');
    panelEl.id = 'platform-control-panel';
    panelEl.setAttribute('role', 'dialog');
    panelEl.setAttribute('aria-modal', 'true');
    panelEl.setAttribute('aria-label', 'Action Panel');
    panelEl.setAttribute('aria-hidden', 'true');

    backdropEl = document.createElement('button');
    backdropEl.type = 'button';
    backdropEl.id = 'platform-control-panel-backdrop';
    backdropEl.className = 'platform-control-panel-backdrop';
    backdropEl.setAttribute('aria-label', 'Close Action Panel');
    backdropEl.addEventListener('click', function () {
      close();
    });

    surfaceEl = document.createElement('div');
    surfaceEl.className = 'platform-control-panel-surface';

    handleEl = document.createElement('div');
    handleEl.className = 'platform-control-panel-handle';
    handleEl.setAttribute('aria-hidden', 'true');
    handleEl.innerHTML = '<span class="platform-control-panel-handle-bar"></span>';
    bindSwipeDismiss(handleEl);

    var header = document.createElement('header');
    header.className = 'platform-control-panel-header';

    var title = document.createElement('h2');
    title.className = 'platform-control-panel-title';
    title.id = 'platform-control-panel-title';
    title.textContent = 'Action Panel';
    panelEl.setAttribute('aria-labelledby', 'platform-control-panel-title');

    closeBtnEl = document.createElement('button');
    closeBtnEl.type = 'button';
    closeBtnEl.className = 'platform-control-panel-close';
    closeBtnEl.setAttribute('aria-label', 'Close Action Panel');
    closeBtnEl.textContent = 'Close';
    closeBtnEl.addEventListener('click', function () {
      close();
    });

    header.appendChild(title);
    header.appendChild(closeBtnEl);

    var tablist = document.createElement('div');
    tablist.className = 'platform-control-panel-tabs';
    tablist.setAttribute('role', 'tablist');
    tablist.setAttribute('aria-label', 'Action Panel sections');

    var panelsWrap = document.createElement('div');
    panelsWrap.className = 'platform-control-panel-panels';

    TAB_IDS.forEach(function (tabId) {
      var tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.className = 'platform-control-panel-tab';
      tabBtn.id = 'platform-control-panel-tab-' + tabId;
      tabBtn.setAttribute('role', 'tab');
      tabBtn.setAttribute('aria-controls', 'platform-control-panel-panel-' + tabId);
      tabBtn.setAttribute('data-tab', tabId);
      tabBtn.textContent =
        tabId === 'settings'
          ? 'Settings'
          : tabId === 'tools'
            ? 'Tools'
            : 'Notes';
      tabBtn.addEventListener('click', function () {
        setActiveTab(tabId);
      });
      tablist.appendChild(tabBtn);
      tabButtons[tabId] = tabBtn;

      var panel = document.createElement('div');
      panel.id = 'platform-control-panel-panel-' + tabId;
      panel.className = 'platform-control-panel-panel';
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabBtn.id);
      panel.setAttribute('data-tab', tabId);
      if (tabId === 'settings') {
        panel.innerHTML = '';
      } else {
        panel.innerHTML = '';
      }
      panelsWrap.appendChild(panel);
      tabPanels[tabId] = panel;
    });

    surfaceEl.appendChild(handleEl);
    surfaceEl.appendChild(header);
    surfaceEl.appendChild(tablist);
    surfaceEl.appendChild(panelsWrap);
    bindSwipeDismiss(surfaceEl);

    panelEl.appendChild(backdropEl);
    panelEl.appendChild(surfaceEl);

    panelEl.addEventListener('keydown', onPanelKeydown);

    document.body.appendChild(panelEl);
    setActiveTab(activeTab);
    if (
      tabPanels.notes &&
      window.PlatformControlPanelNotes &&
      typeof PlatformControlPanelNotes.mount === 'function'
    ) {
      PlatformControlPanelNotes.mount(tabPanels.notes);
    }
    if (
      tabPanels.settings &&
      window.PlatformControlPanelSettings &&
      typeof PlatformControlPanelSettings.mount === 'function'
    ) {
      PlatformControlPanelSettings.mount(tabPanels.settings);
    }
    if (
      tabPanels.tools &&
      window.PlatformControlPanelTools &&
      typeof PlatformControlPanelTools.mount === 'function'
    ) {
      PlatformControlPanelTools.mount(tabPanels.tools);
    }
    return panelEl;
  }

  function bindSwipeDismiss(el) {
    el.addEventListener(
      'touchstart',
      function (e) {
        if (!isOpen || !isMobileLayout()) return;
        if (e.touches.length !== 1) return;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
      },
      { passive: true }
    );
    el.addEventListener(
      'touchend',
      function (e) {
        if (!isOpen || touchStartY === null) return;
        var touch = e.changedTouches[0];
        if (!touch) return;
        var deltaY = touch.clientY - touchStartY;
        var elapsed = Date.now() - (touchStartTime || Date.now());
        var velocity = deltaY / Math.max(elapsed, 1);
        if (deltaY > SWIPE_DISMISS_PX || velocity > 0.6) {
          close();
        }
        touchStartY = null;
        touchStartTime = null;
      },
      { passive: true }
    );
  }

  function setRevealKeyboardEnabled(enabled) {
    if (typeof Reveal === 'undefined' || typeof Reveal.configure !== 'function') return;
    Reveal.configure({ keyboard: enabled });
  }

  function open() {
    if (!shouldShowPanel() || isOpen) return;
    ensurePanel();
    focusBeforeOpen = document.activeElement;
    isOpen = true;
    panelEl.setAttribute('aria-hidden', 'false');
    triggerEl.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('platform-control-panel-open');

    if (typeof Reveal !== 'undefined' && typeof Reveal.getConfig === 'function') {
      var cfg = Reveal.getConfig();
      revealKeyboardWasEnabled = cfg ? cfg.keyboard !== false : true;
    }
    setRevealKeyboardEnabled(false);

    var focusables = getFocusableElements(surfaceEl);
    if (focusables.length) {
      focusables[0].focus();
    } else {
      surfaceEl.setAttribute('tabindex', '-1');
      surfaceEl.focus();
    }

    if (
      window.PlatformSlideNotes &&
      typeof PlatformSlideNotes.refreshSyncState === 'function'
    ) {
      PlatformSlideNotes.refreshSyncState();
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    if (panelEl) panelEl.setAttribute('aria-hidden', 'true');
    if (triggerEl) triggerEl.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('platform-control-panel-open');
    setRevealKeyboardEnabled(revealKeyboardWasEnabled);

    if (focusBeforeOpen && typeof focusBeforeOpen.focus === 'function') {
      focusBeforeOpen.focus();
    } else if (triggerEl) {
      triggerEl.focus();
    }
    focusBeforeOpen = null;
    if (
      window.PlatformSlideNotes &&
      typeof PlatformSlideNotes.flushPending === 'function'
    ) {
      PlatformSlideNotes.flushPending();
    }
    if (
      window.PlatformSlideNotes &&
      typeof PlatformSlideNotes.syncEditingToDeck === 'function'
    ) {
      PlatformSlideNotes.syncEditingToDeck();
    }
    notifyClosed();
  }

  function onPanelKeydown(e) {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    var focusables = getFocusableElements(surfaceEl);
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function setActiveTab(tabId) {
    if (TAB_IDS.indexOf(tabId) === -1) return;
    activeTab = tabId;
    TAB_IDS.forEach(function (id) {
      var selected = id === tabId;
      if (tabButtons[id]) {
        tabButtons[id].setAttribute('aria-selected', selected ? 'true' : 'false');
        tabButtons[id].tabIndex = selected ? 0 : -1;
      }
      if (tabPanels[id]) {
        tabPanels[id].hidden = !selected;
      }
    });
  }

  function refreshVisibility() {
    updateLayoutClass();
    var show = shouldShowPanel();
    document.documentElement.classList.toggle('platform-control-panel-visible', show);

    if (!show) {
      close();
      if (triggerEl) triggerEl.style.display = 'none';
      if (panelEl) panelEl.style.display = 'none';
      return;
    }

    ensureTrigger();
    ensurePanel();
    if (triggerEl) triggerEl.style.display = '';
    if (panelEl) panelEl.style.display = '';
  }

  function observeHtmlClasses() {
    if (htmlObserver) return;
    htmlObserver = new MutationObserver(function () {
      refreshVisibility();
    });
    htmlObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  function init() {
    if (initialized) {
      refreshVisibility();
      return;
    }
    initialized = true;
    mediaQuery = window.matchMedia('(max-width: 768px)');
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', refreshVisibility);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(refreshVisibility);
    }
    document.addEventListener('keydown', function (e) {
      if (!isOpen || e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    });
    observeHtmlClasses();
    refreshVisibility();
  }

  window.PlatformControlPanel = {
    init: init,
    open: open,
    close: close,
    isOpen: function () {
      return isOpen;
    },
    onClose: function (listener) {
      if (typeof listener !== 'function') return function () {};
      closeListeners.push(listener);
      return function () {
        closeListeners = closeListeners.filter(function (fn) {
          return fn !== listener;
        });
      };
    },
    setActiveTab: setActiveTab,
    shouldShowPanel: shouldShowPanel,
    refreshVisibility: refreshVisibility,
  };
})();
