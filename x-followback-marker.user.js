// ==UserScript==
// @name         X Followback Marker - 手动互关清理标记
// @namespace    https://codex.local/meme-tools
// @version      0.4.0
// @description  在 X/Twitter 的关注列表中标记“已回关/未回关”。只做颜色标记，不自动关注/取关。
// @author       Codex
// @match        https://x.com/*
// @match        https://twitter.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'codex_x_followback_marker_enabled';
  const SCRIPT_VERSION = 'v0.4.0';
  const DEFAULT_ENABLED = true;

  const TEXT = {
    followBackZh: ['关注了你', '也关注了你', '跟随了你'],
    followBackEn: ['Follows you'],
  };

  const COLORS = {
    mutualBorder: '#16a34a',
    mutualBg: 'rgba(22, 163, 74, 0.08)',
    nonMutualBorder: '#ef4444',
    nonMutualBg: 'rgba(239, 68, 68, 0.10)',
    blue: '#1d9bf0',
    panelBg: 'rgba(15, 23, 42, 0.92)',
  };

  let observer = null;
  let scanTimer = null;

  function isEnabled() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_ENABLED;
    return raw === '1';
  }

  function setEnabled(value) {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    updatePanel();
    scheduleScan();
  }

  function isTargetPage() {
    const path = location.pathname;
    return (
      /\/following\/?$/.test(path) ||
      /\/followers\/?$/.test(path) ||
      /\/verified_followers\/?$/.test(path) ||
      /\/followers_you_follow\/?$/.test(path)
    );
  }

  function getPageMode() {
    const path = location.pathname;
    if (/\/following\/?$/.test(path)) return 'following';
    if (/\/followers\/?$/.test(path)) return 'followers';
    if (/\/verified_followers\/?$/.test(path)) return 'followers';
    if (/\/followers_you_follow\/?$/.test(path)) return 'followers_you_follow';
    return 'unknown';
  }

  function includesAny(text, needles) {
    return needles.some((needle) => text.includes(needle));
  }

  function hasFollowBackBadge(cell) {
    const text = normalizeText(cell.innerText || '');
    return includesAny(text, TEXT.followBackZh) || includesAny(text, TEXT.followBackEn);
  }

  function youAreFollowing(cell) {
    const text = normalizeText(cell.innerText || '');

    // 中文页面：你已关注对方时，按钮通常是“正在关注”。
    // 英文页面：按钮通常是 “Following”。
    // 注意：在“关注者/认证关注者”页面里，“关注了你 / Follows you”只代表对方关注你，
    // 不能当成互关。这里故意不看 followBack 文案。
    if (/(^|\s)正在关注($|\s)/.test(text)) return true;
    if (/(^|\s)Following($|\s)/.test(text)) return true;

    // “回关 / Follow back / 关注 / Follow”表示你还没关注对方。
    if (/(^|\s)回关($|\s)/.test(text)) return false;
    if (/(^|\s)Follow back($|\s)/i.test(text)) return false;
    if (/(^|\s)关注($|\s)/.test(text)) return false;
    if (/(^|\s)Follow($|\s)/i.test(text)) return false;

    return false;
  }

  function getRelationshipStatus(cell) {
    const mode = getPageMode();

    if (mode === 'following') {
      return hasFollowBackBadge(cell) ? 'mutual' : 'non_mutual';
    }

    if (mode === 'followers' || mode === 'followers_you_follow') {
      return youAreFollowing(cell) ? 'mutual' : 'not_following_back';
    }

    return hasFollowBackBadge(cell) ? 'mutual' : 'non_mutual';
  }

  function normalizeText(text) {
    return text.replace(/\s+/g, ' ').trim();
  }

  function hasVerifiedIcon(cell) {
    if (cell.querySelector('[data-testid="icon-verified"]')) return true;
    const svgLabels = [...cell.querySelectorAll('svg[aria-label]')].map((svg) =>
      (svg.getAttribute('aria-label') || '').toLowerCase()
    );
    return svgLabels.some((label) =>
      label.includes('verified') || label.includes('认证') || label.includes('已验证')
    );
  }

  function getUserHandle(cell) {
    const links = [...cell.querySelectorAll('a[href^="/"]')];
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const match = href.match(/^\/([A-Za-z0-9_]{1,20})(?:$|\?)/);
      if (match && !['home', 'explore', 'notifications', 'messages', 'i'].includes(match[1])) {
        return `@${match[1]}`;
      }
    }
    return '';
  }

  function findUserCells() {
    const main = getPrimaryColumn();

    // X 的 following 页面真实结构：
    // 中间主栏 data-testid="primaryColumn" 内有很多 data-testid="UserCell"。
    // 右侧推荐关注在 data-testid="sidebarColumn" 内，也叫 UserCell。
    // 所以这里第一优先级只取 primaryColumn 内的 UserCell，不再做复杂猜测。
    const exact = [...main.querySelectorAll('[data-testid="UserCell"]')]
      .filter((node) => !node.closest('[data-testid="sidebarColumn"]'));
    if (exact.length) return exact;

    // Fallback：X 改 DOM 时，尽量只抓列表里的用户卡片，避免误扫推文。
    return [...main.querySelectorAll('[role="listitem"]')].filter((node) => {
      if (!isInPrimaryTimeline(node)) return false;
      const text = normalizeText(node.innerText || '');
      const hasProfileLink = !!node.querySelector('a[href^="/"][role="link"]');
      const hasFollowButton = /正在关注|Following|关注|Follow/.test(text);
      return hasProfileLink && hasFollowButton && text.length < 1200;
    });
  }

  function getPrimaryColumn() {
    // X 的三栏布局里：
    // - data-testid="primaryColumn" 是中间主列表
    // - data-testid="sidebarColumn" 是右侧推荐/趋势
    // 直接锁主栏，比用坐标猜更稳。
    return (
      document.querySelector('[data-testid="primaryColumn"]') ||
      document.querySelector('main[role="main"]') ||
      document.querySelector('main') ||
      document
    );
  }

  function isInPrimaryTimeline(node) {
    // 排除右侧栏：推荐关注、趋势、搜索等区域通常在 aside 或 complementary landmark 里。
    if (node.closest('aside')) return false;
    if (node.closest('[role="complementary"]')) return false;
    if (node.closest('[data-testid="sidebarColumn"]')) return false;

    const primary = document.querySelector('[data-testid="primaryColumn"]');
    if (primary && !primary.contains(node)) return false;

    const rect = node.getBoundingClientRect();
    if (rect.width < 260) return false;

    return true;
  }

  function removeOldBadge(cell) {
    const old = cell.querySelector(':scope > .codex-followback-badge');
    if (old) old.remove();
  }

  function makeBadge({ status, verified, handle }) {
    const mutual = status === 'mutual';
    const label = status === 'not_following_back' ? '❌ 待回关' : (mutual ? '✅ 已回关' : '❌ 未回关');
    const badge = document.createElement('div');
    badge.className = 'codex-followback-badge';
    badge.textContent = `${label}${verified ? ' · 蓝V' : ''}${handle ? ` · ${handle}` : ''}`;
    badge.style.cssText = [
      'position:absolute',
      'right:72px',
      'top:10px',
      'z-index:20',
      'font-size:12px',
      'line-height:18px',
      'padding:2px 8px',
      'border-radius:999px',
      `color:${mutual ? '#14532d' : '#7f1d1d'}`,
      `background:${mutual ? 'rgba(187,247,208,.96)' : 'rgba(254,202,202,.96)'}`,
      `border:1px solid ${mutual ? '#86efac' : '#fca5a5'}`,
      'pointer-events:none',
      'font-weight:700',
      'box-shadow:0 2px 8px rgba(0,0,0,.12)',
      'max-width:260px',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
    ].join(';');
    return badge;
  }

  function markCell(cell) {
    if (!cell || cell.dataset.codexFollowbackMarked === '1') return;

    const status = getRelationshipStatus(cell);
    const mutual = status === 'mutual';
    const verified = hasVerifiedIcon(cell);
    const handle = getUserHandle(cell);

    cell.dataset.codexFollowbackMarked = '1';
    cell.dataset.codexFollowbackStatus = status;
    cell.dataset.codexFollowbackVerified = verified ? '1' : '0';

    cell.style.position = 'relative';
    cell.style.borderLeft = `6px solid ${mutual ? COLORS.mutualBorder : COLORS.nonMutualBorder}`;
    cell.style.background = mutual ? COLORS.mutualBg : COLORS.nonMutualBg;
    cell.style.boxShadow = verified && !mutual ? `inset 0 0 0 2px ${COLORS.blue}` : '';

    removeOldBadge(cell);
    cell.appendChild(makeBadge({ status, verified, handle }));
  }

  function clearMarks() {
    for (const cell of findUserCells()) {
      if (cell.dataset.codexFollowbackMarked !== '1') continue;
      delete cell.dataset.codexFollowbackMarked;
      delete cell.dataset.codexFollowbackStatus;
      delete cell.dataset.codexFollowbackVerified;
      cell.style.borderLeft = '';
      cell.style.background = '';
      cell.style.boxShadow = '';
      removeOldBadge(cell);
    }
    updatePanelCounts(0, 0, 0);
  }

  function scan() {
    try {
      if (!isTargetPage() || !isEnabled()) {
        clearMarks();
        return;
      }

      const cells = findUserCells();
      for (const cell of cells) {
        // X 是无限滚动页面；这里只标记新加载出来的卡片，避免脚本重画 DOM 后被 MutationObserver 反复触发。
        // 如果页面语言/状态变化导致判断不准，点右下角“重新扫描”即可强制重算。
        markCell(cell);
      }

      const mutual = cells.filter((cell) => cell.dataset.codexFollowbackStatus === 'mutual').length;
      const nonMutual = cells.filter((cell) => cell.dataset.codexFollowbackStatus === 'non_mutual').length;
      const notFollowingBack = cells.filter((cell) => cell.dataset.codexFollowbackStatus === 'not_following_back').length;
      const blueNonMutual = cells.filter(
        (cell) =>
          (cell.dataset.codexFollowbackStatus === 'non_mutual' ||
            cell.dataset.codexFollowbackStatus === 'not_following_back') &&
          cell.dataset.codexFollowbackVerified === '1'
      ).length;
      updatePanelCounts(mutual, nonMutual, blueNonMutual, cells.length, notFollowingBack);
    } catch (error) {
      updatePanelError(error);
      console.error('[X Followback Marker] scan failed:', error);
    }
  }

  function scheduleScan() {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 300);
  }

  function createPanel() {
    if (document.getElementById('codex-followback-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'codex-followback-panel';
    panel.innerHTML = `
      <div class="codex-title">互关标记 ${SCRIPT_VERSION}</div>
      <div class="codex-counts">等待扫描…</div>
      <button class="codex-toggle" type="button"></button>
      <button class="codex-rescan" type="button">重新扫描</button>
    `;
    panel.style.cssText = [
      'position:fixed',
      'right:18px',
      'bottom:88px',
      'z-index:2147483647',
      `background:${COLORS.panelBg}`,
      'color:white',
      'font-size:12px',
      'border-radius:14px',
      'padding:10px',
      'width:156px',
      'box-shadow:0 8px 24px rgba(0,0,0,.28)',
      'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');

    const style = document.createElement('style');
    style.textContent = `
      #codex-followback-panel .codex-title { font-weight: 800; margin-bottom: 6px; }
      #codex-followback-panel .codex-counts { color: #dbeafe; line-height: 1.55; margin-bottom: 8px; }
      #codex-followback-panel button {
        width: 100%;
        border: 0;
        border-radius: 999px;
        padding: 6px 8px;
        margin-top: 6px;
        cursor: pointer;
        font-weight: 700;
      }
      #codex-followback-panel .codex-toggle { background: #e0f2fe; color: #075985; }
      #codex-followback-panel .codex-rescan { background: #fef3c7; color: #92400e; }
    `;

    document.documentElement.appendChild(style);
    document.documentElement.appendChild(panel);

    panel.querySelector('.codex-toggle').addEventListener('click', () => {
      setEnabled(!isEnabled());
    });
    panel.querySelector('.codex-rescan').addEventListener('click', () => {
      clearMarks();
      scheduleScan();
    });

    updatePanel();
  }

  function updatePanel() {
    const panel = document.getElementById('codex-followback-panel');
    if (!panel) return;
    const toggle = panel.querySelector('.codex-toggle');
    toggle.textContent = isEnabled() ? '已开启，点击关闭' : '已关闭，点击开启';
    toggle.style.background = isEnabled() ? '#dcfce7' : '#fee2e2';
    toggle.style.color = isEnabled() ? '#166534' : '#991b1b';
  }

  function updatePanelCounts(mutual, nonMutual, blueNonMutual, total = 0, notFollowingBack = 0) {
    const panel = document.getElementById('codex-followback-panel');
    if (!panel) return;
    const counts = panel.querySelector('.codex-counts');
    if (!isTargetPage()) {
      counts.innerHTML = '只在关注/粉丝列表页生效';
      return;
    }
    if (!isEnabled()) {
      counts.innerHTML = '当前已关闭';
      return;
    }
    counts.innerHTML = [
      `扫描卡片：${total}`,
      `✅ 已回关：${mutual}`,
      `❌ 未回关：${nonMutual}`,
      `↩️ 待回关：${notFollowingBack}`,
      `🔵 蓝V未回关：${blueNonMutual}`,
    ].join('<br>');
  }

  function updatePanelError(error) {
    const panel = document.getElementById('codex-followback-panel');
    if (!panel) return;
    const counts = panel.querySelector('.codex-counts');
    counts.innerHTML = `脚本报错：<br>${String(error && error.message ? error.message : error).slice(0, 120)}`;
  }

  function start() {
    createPanel();
    scheduleScan();

    observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.body, { childList: true, subtree: true });

    let lastPath = location.pathname;
    window.setInterval(() => {
      if (location.pathname !== lastPath) {
        lastPath = location.pathname;
        clearMarks();
        scheduleScan();
      }
    }, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
