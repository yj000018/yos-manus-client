// ==UserScript==
// @name         Y-OS Manus Client
// @namespace    https://yos.ai
// @version      1.9.0
// @description  Y-OS custom client for manus.im — cleanup, branding, navigation, message toolbar, project navigator
// @author       Yannick Jolliet / Y-OS
// @match        https://manus.im/*
// @match        https://manus.im/app*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @updateURL    https://raw.githubusercontent.com/yj000018/yos-manus-client/main/yos-manus-client.user.js
// @downloadURL  https://raw.githubusercontent.com/yj000018/yos-manus-client/main/yos-manus-client.user.js
// @run-at       document-start
// @noframes
// ==/UserScript==

/**
 * v1.9.0 — document-start + unsafeWindow + multi-match
 *
 * NEW in v1.8:
 * - Intercepts manus.im native fetch() calls to capture project/task data
 * - Project Navigator panel: 📁 button → drawer with projects → sessions → navigate
 * - Instant client-side search across all session titles
 * - localStorage cache (1h TTL) — zero extra network calls
 * - Session title badge: [ProjectName] appended in navigator
 *
 * STABILITY (from v1.7):
 * - All features deferred 2500ms after window.load
 * - WeakSet for toolbar tracking (survives React re-renders)
 * - patchTitle: _patching flag prevents MutationObserver loop
 * - injectLinks: document.contains() check prevents re-injection loop
 * - CSS: content-based selectors only
 */

(function () {
  'use strict';

  const LOG = (...a) => console.log('[Y-OS]', ...a);
  const ERR = (...a) => console.warn('[Y-OS] ERR', ...a);

  // ─── CONFIG ──────────────────────────────────────────────────
  const CFG = {
    hideMetaLogo:     true,
    hideShareSidebar: true,
    hideCloudBtn:     true,
    yosLogo:          true,
    yosColors:        true,
    yosTitle:         true,
    yosQuickLinks:    true,
    projectColors:    true,
    projectNavigator: true,
    fabNav:           true,
    exportMD:         true,
    msgToolbar:       true,
    selectToPrompt:   true,
    keyboard:         true,
  };

  // ─── DESIGN TOKENS ───────────────────────────────────────────
  const C = {
    bgNav:    '#0d0f14',
    bgPanel:  '#111318',
    accent:   '#7c3aed',
    accentDim:'#4c1d95',
    text:     '#e8eaf0',
    textDim:  '#8b90a0',
    border:   '#1e2230',
    ok:       '#22c55e',
    no:       '#ef4444',
    warn:     '#f59e0b',
    palette:  ['#7c3aed','#2563eb','#059669','#d97706','#dc2626',
               '#0891b2','#db2777','#65a30d','#9333ea','#0d9488',
               '#7c2d12','#1e40af','#065f46','#92400e','#991b1b'],
    links: [
      { label: '🧠 Notion',       url: 'https://notion.so' },
      { label: '🚀 Lovable',      url: 'https://lovable.dev' },
      { label: '🔄 n8n',          url: 'https://n8n.io' },
      { label: '🐙 GitHub',       url: 'https://github.com/yannick-jolliet' },
      { label: '✈️ Telegram',     url: 'https://web.telegram.org' },
      { label: '🌿 Tana',         url: 'https://tana.inc' },
      { label: '🐵 TamperMonkey', url: 'chrome-extension://dhdgffkkebhmkfjojejmpbldmpobfkfo/options.html#nav=dashboard' },
    ],
  };

  // ─── UTILS ───────────────────────────────────────────────────
  function throttle(fn, ms) {
    let t = 0;
    return (...a) => { const n = Date.now(); if (n - t > ms) { t = n; fn(...a); } };
  }

  function chatSC() {
    // Strategy 1: simplebar-content-wrapper
    const sb = document.querySelector('.simplebar-content-wrapper');
    if (sb && sb.scrollHeight > sb.clientHeight) return sb;
    // Strategy 2: largest scrollable div not in nav
    const all = Array.from(document.querySelectorAll('div'));
    let best = null;
    for (const el of all) {
      if (el.closest('nav') || el.closest('aside')) continue;
      if (el.scrollHeight > el.clientHeight + 100) {
        if (!best || el.scrollHeight > best.scrollHeight) best = el;
      }
    }
    if (best) return best;
    // Strategy 3: main element
    return document.querySelector('main') || document.documentElement;
  }

  function getMessages() {
    // Strategy 1: data-message-id attributes
    const byAttr = document.querySelectorAll('[data-message-id]');
    if (byAttr.length > 0) return Array.from(byAttr);
    // Strategy 2: prose/markdown containers
    const byClass = document.querySelectorAll('[class*="prose"],[class*="markdown"],[class*="message"]');
    if (byClass.length > 0) return Array.from(byClass);
    // Strategy 3: broad scan
    return Array.from(document.querySelectorAll('div[class]')).filter(el => {
      const c = el.className;
      return (c.includes('prose') || c.includes('markdown') || c.includes('message') || c.includes('chat'));
    });
  }

  function isUserMsg(el) {
    const c = el.className || '';
    if (c.includes('user') || c.includes('human') || c.includes('right')) return true;
    const txt = el.textContent?.trim() || '';
    if (el.querySelector('[class*="prose"],[class*="markdown"]')) return false;
    return txt.length < 500 && !el.querySelector('h1,h2,h3,ul,ol,pre,code,table');
  }

  function getMDDiv(el) {
    return el.querySelector('[class*="prose"],[class*="markdown"]') ||
           (el.className?.includes('prose') || el.className?.includes('markdown') ? el : null);
  }

  function sendMsg(text) {
    const ta = document.querySelector('textarea');
    if (!ta) return;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativeInputValueSetter.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(() => {
      const btn = document.querySelector('button[type="submit"],button[aria-label*="send" i],button[aria-label*="Send" i]');
      if (btn) btn.click();
    }, 100);
  }

  function prefillInput(text) {
    const ta = document.querySelector('textarea');
    if (!ta) return;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    nativeInputValueSetter.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    ta.setSelectionRange(text.length, text.length);
  }

  // ─── CSS ─────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('yos-styles')) return;
    const css = `
      /* === CLEANUP === */
      /* Meta logo: SVG with viewBox 0 0 107 12 */
      svg[viewBox="0 0 107 12"] { display:none!important; }
      svg[viewBox="0 0 107 12"] + * { display:none!important; }
      /* Container of Meta logo — has "from" text + SVG */
      :has(> svg[viewBox="0 0 107 12"]) { display:none!important; }

      /* Share sidebar button — contains "Share Manus" text */
      button:has([class*="gift"]),
      a:has([class*="gift"]),
      div[class*="referral"],
      div[class*="share-sidebar"] { display:none!important; }

      /* Cloud computers button */
      button[class*="cloud"],
      a[class*="cloud"] { display:none!important; }

      /* === Y-OS COLORS === */
      :root {
        --yos-bg-nav: #0d0f14;
        --yos-accent: #7c3aed;
        --yos-text: #e8eaf0;
        --yos-border: #1e2230;
      }

      /* === LOGO === */
      #yos-logo-badge {
        position: absolute;
        top: 12px;
        left: 12px;
        z-index: 9999;
        pointer-events: none;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 15px;
        font-weight: 800;
        letter-spacing: -0.5px;
        background: linear-gradient(135deg, #7c3aed, #a855f7);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        user-select: none;
        line-height: 1;
      }

      /* === QUICK LINKS === */
      #yos-links {
        padding: 8px 8px 4px;
        border-top: 1px solid #1e2230;
        margin-top: 4px;
      }
      #yos-links .yos-lbl {
        font-size: 10px;
        color: #8b90a0;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        padding: 0 4px 4px;
        font-family: system-ui, sans-serif;
      }
      #yos-links a {
        display: block;
        padding: 5px 8px;
        border-radius: 6px;
        font-size: 12px;
        color: #c4c9d8;
        text-decoration: none;
        font-family: system-ui, sans-serif;
        transition: background 0.15s;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #yos-links a:hover { background: #1e2230; color: #e8eaf0; }

      /* === PROJECT NAVIGATOR === */
      #yos-proj-btn {
        position: fixed;
        bottom: 80px;
        right: 16px;
        z-index: 9998;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #1e2230;
        border: 1px solid #7c3aed;
        color: #e8eaf0;
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 12px rgba(124,58,237,.3);
        transition: transform 0.15s, background 0.15s;
      }
      #yos-proj-btn:hover { transform: scale(1.1); background: #7c3aed; }

      #yos-proj-drawer {
        position: fixed;
        top: 0;
        right: -360px;
        width: 340px;
        height: 100vh;
        background: #111318;
        border-left: 1px solid #1e2230;
        z-index: 99999;
        display: flex;
        flex-direction: column;
        transition: right 0.25s cubic-bezier(.4,0,.2,1);
        font-family: system-ui, -apple-system, sans-serif;
        box-shadow: -4px 0 24px rgba(0,0,0,.5);
      }
      #yos-proj-drawer.open { right: 0; }

      #yos-proj-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 16px 12px;
        border-bottom: 1px solid #1e2230;
        flex-shrink: 0;
      }
      #yos-proj-header h2 {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #e8eaf0;
        letter-spacing: -0.2px;
      }
      #yos-proj-close {
        background: none;
        border: none;
        color: #8b90a0;
        cursor: pointer;
        font-size: 18px;
        padding: 0 4px;
        line-height: 1;
      }
      #yos-proj-close:hover { color: #e8eaf0; }

      #yos-proj-search {
        margin: 10px 12px;
        padding: 7px 12px;
        background: #0d0f14;
        border: 1px solid #1e2230;
        border-radius: 8px;
        color: #e8eaf0;
        font-size: 12px;
        outline: none;
        flex-shrink: 0;
        font-family: system-ui, sans-serif;
      }
      #yos-proj-search:focus { border-color: #7c3aed; }

      #yos-proj-list {
        flex: 1;
        overflow-y: auto;
        padding: 0 8px 16px;
      }
      #yos-proj-list::-webkit-scrollbar { width: 4px; }
      #yos-proj-list::-webkit-scrollbar-track { background: transparent; }
      #yos-proj-list::-webkit-scrollbar-thumb { background: #1e2230; border-radius: 2px; }

      .yos-proj-group {
        margin-bottom: 8px;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid #1e2230;
      }
      .yos-proj-group-hdr {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 12px;
        cursor: pointer;
        user-select: none;
        transition: background 0.12s;
      }
      .yos-proj-group-hdr:hover { background: #1a1d26; }
      .yos-proj-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .yos-proj-name {
        flex: 1;
        font-size: 12px;
        font-weight: 600;
        color: #e8eaf0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .yos-proj-count {
        font-size: 10px;
        color: #8b90a0;
        background: #0d0f14;
        padding: 1px 6px;
        border-radius: 10px;
      }
      .yos-proj-chevron {
        font-size: 10px;
        color: #8b90a0;
        transition: transform 0.15s;
      }
      .yos-proj-group.expanded .yos-proj-chevron { transform: rotate(90deg); }

      .yos-proj-sessions {
        display: none;
        border-top: 1px solid #1e2230;
        background: #0d0f14;
      }
      .yos-proj-group.expanded .yos-proj-sessions { display: block; }

      .yos-session-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 12px 7px 28px;
        cursor: pointer;
        border-bottom: 1px solid #13151c;
        transition: background 0.1s;
      }
      .yos-session-item:last-child { border-bottom: none; }
      .yos-session-item:hover { background: #1a1d26; }
      .yos-session-title {
        flex: 1;
        font-size: 11px;
        color: #c4c9d8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.3;
      }
      .yos-session-date {
        font-size: 10px;
        color: #8b90a0;
        flex-shrink: 0;
      }
      .yos-session-item.current .yos-session-title { color: #a78bfa; font-weight: 600; }

      .yos-proj-unassigned .yos-proj-dot { background: #374151; }

      #yos-proj-footer {
        padding: 10px 12px;
        border-top: 1px solid #1e2230;
        font-size: 10px;
        color: #8b90a0;
        flex-shrink: 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      #yos-proj-refresh {
        background: none;
        border: 1px solid #1e2230;
        border-radius: 4px;
        color: #8b90a0;
        cursor: pointer;
        font-size: 10px;
        padding: 2px 8px;
      }
      #yos-proj-refresh:hover { color: #e8eaf0; border-color: #7c3aed; }

      /* === FAB === */
      #yos-fab {
        position: fixed;
        bottom: 16px;
        right: 16px;
        z-index: 9997;
        display: flex;
        flex-direction: column;
        gap: 6px;
        align-items: flex-end;
      }
      .yos-fab-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #1e2230;
        border: 1px solid #2a2f42;
        color: #c4c9d8;
        font-size: 14px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.12s, background 0.12s;
        position: relative;
      }
      .yos-fab-btn:hover { transform: scale(1.12); background: #7c3aed; color: #fff; }
      .yos-fab-btn::after {
        content: attr(data-tip);
        position: absolute;
        right: 44px;
        background: #0d0f14;
        border: 1px solid #1e2230;
        color: #e8eaf0;
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 5px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s;
        font-family: system-ui, sans-serif;
      }
      .yos-fab-btn:hover::after { opacity: 1; }

      /* === MESSAGE TOOLBAR === */
      .yos-mw { position: relative !important; }
      .yos-tb {
        position: absolute;
        top: -28px;
        right: 0;
        display: none;
        gap: 2px;
        background: #111318;
        border: 1px solid #1e2230;
        border-radius: 8px;
        padding: 3px 4px;
        z-index: 100;
        box-shadow: 0 2px 12px rgba(0,0,0,.4);
      }
      .yos-mw:hover .yos-tb { display: flex; }
      .ytb {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 13px;
        padding: 2px 5px;
        border-radius: 4px;
        transition: background 0.1s;
        line-height: 1;
      }
      .ytb:hover { background: #1e2230; }
      .ysep { width: 1px; background: #1e2230; margin: 2px 3px; }
      .yos-col { max-height: 200px; overflow: hidden; }
      .yos-col::after {
        content: '';
        position: absolute;
        bottom: 0; left: 0; right: 0;
        height: 60px;
        background: linear-gradient(transparent, #111318);
        pointer-events: none;
      }

      /* === PRINT === */
      @media print {
        nav, aside, #yos-fab, #yos-proj-btn, #yos-proj-drawer { display: none !important; }
        .yos-tb { display: none !important; }
      }
    `;
    const style = document.createElement('style');
    style.id = 'yos-styles';
    style.textContent = css;
    document.head.appendChild(style);
    LOG('CSS injected');
  }

  // ─── BRANDING ────────────────────────────────────────────────
  let _patching = false;
  function patchTitle() {
    const fix = () => {
      if (_patching) return;
      _patching = true;
      if (!document.title.startsWith('Y-OS')) {
        document.title = 'Y-OS — ' + document.title.replace(/^(Manus\s*[-–|]\s*)/i, '');
      }
      _patching = false;
    };
    fix();
    const t = document.querySelector('title');
    if (t) {
      const obs = new MutationObserver(() => { if (!_patching) fix(); });
      obs.observe(t, { childList: true });
    }
    LOG('patchTitle done');
  }

  function injectLogo() {
    if (document.getElementById('yos-logo-badge')) return;
    const nav = document.querySelector('nav');
    if (!nav) { LOG('injectLogo: nav not found'); return; }
    nav.style.position = 'relative';
    const badge = document.createElement('div');
    badge.id = 'yos-logo-badge';
    badge.textContent = 'Y-OS';
    nav.appendChild(badge);
    LOG('logo injected');
  }

  function injectLinks() {
    const existing = document.getElementById('yos-links');
    if (existing && document.contains(existing)) return;
    const nav = document.querySelector('nav');
    if (!nav) { LOG('injectLinks: nav not found'); return; }
    const wrap = document.createElement('div');
    wrap.id = 'yos-links';
    const lbl = document.createElement('div');
    lbl.className = 'yos-lbl';
    lbl.textContent = 'Y-OS Tools';
    wrap.appendChild(lbl);
    C.links.forEach(({ label, url }) => {
      const a = document.createElement('a');
      a.href = url; a.textContent = label; a.target = '_blank'; a.rel = 'noopener';
      wrap.appendChild(a);
    });
    nav.appendChild(wrap);
    LOG('quick links injected');
  }

  function colorProjects() {
    const items = document.querySelectorAll('nav a[href*="/app/"]');
    if (!items.length) { LOG('colorProjects: no items found'); return; }
    let colored = 0;
    items.forEach((el, i) => {
      if (!el.dataset.yosColor) {
        const color = C.palette[i % C.palette.length];
        el.style.borderLeft = `2px solid ${color}`;
        el.style.paddingLeft = '6px';
        el.dataset.yosColor = '1';
        colored++;
      }
    });
    if (colored > 0) LOG('colorProjects: colored', colored, 'items');
  }

  // ─── PROJECT NAVIGATOR ───────────────────────────────────────
  // Data store
  const YOS_STORE = {
    CACHE_KEY: 'yos_proj_index',
    CACHE_TTL: 60 * 60 * 1000, // 1h

    load() {
      try {
        const raw = localStorage.getItem(this.CACHE_KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (Date.now() - d.ts > this.CACHE_TTL) return null;
        return d;
      } catch { return null; }
    },

    save(projects, tasks) {
      try {
        localStorage.setItem(this.CACHE_KEY, JSON.stringify({
          ts: Date.now(),
          projects,
          tasks,
        }));
        LOG('store saved:', projects.length, 'projects,', tasks.length, 'tasks');
      } catch (e) { ERR('store save', e); }
    },

    clear() {
      localStorage.removeItem(this.CACHE_KEY);
      LOG('store cleared');
    }
  };

  // Intercept native fetch to capture project/task data
  function interceptFetch() {
    const origFetch = window.fetch.bind(window);
    window.fetch = async function (...args) {
      const res = await origFetch(...args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
        if (url.includes('/project') || url.includes('/task')) {
          const clone = res.clone();
          clone.json().then(data => {
            if (data && data.ok !== false) {
              const cached = YOS_STORE.load() || { projects: [], tasks: [] };
              if (url.includes('/project') && (data.projects || data.data)) {
                const projs = data.projects || data.data || [];
                if (projs.length > 0) {
                  YOS_STORE.save(projs, cached.tasks);
                  LOG('intercepted projects:', projs.length);
                  refreshNavigator();
                }
              }
              if (url.includes('/task') && !url.includes('/message') && (data.tasks || data.data)) {
                const tasks = data.tasks || data.data || [];
                if (tasks.length > 0) {
                  YOS_STORE.save(cached.projects, tasks);
                  LOG('intercepted tasks:', tasks.length);
                  refreshNavigator();
                }
              }
            }
          }).catch(() => {});
        }
      } catch { }
      return res;
    };
    LOG('fetch interceptor installed');
  }

  // Also intercept XHR
  function interceptXHR() {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._yosUrl = url;
      return origOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener('load', function () {
        try {
          const url = this._yosUrl || '';
          if ((url.includes('/project') || url.includes('/task')) && !url.includes('/message')) {
            const data = JSON.parse(this.responseText);
            if (data && data.ok !== false) {
              const cached = YOS_STORE.load() || { projects: [], tasks: [] };
              if (url.includes('/project') && (data.projects || data.data)) {
                const projs = data.projects || data.data || [];
                if (projs.length > 0) { YOS_STORE.save(projs, cached.tasks); refreshNavigator(); }
              }
              if (url.includes('/task') && (data.tasks || data.data)) {
                const tasks = data.tasks || data.data || [];
                if (tasks.length > 0) { YOS_STORE.save(cached.projects, tasks); refreshNavigator(); }
              }
            }
          }
        } catch { }
      });
      return origSend.apply(this, args);
    };
    LOG('XHR interceptor installed');
  }

  // Build navigator from DOM (fallback when no API data)
  function buildIndexFromDOM() {
    const projects = [];
    const tasks = [];
    const currentUrl = window.location.href;

    // Try to find project groups in sidebar
    const navLinks = document.querySelectorAll('nav a[href*="/app/"]');
    navLinks.forEach((el, i) => {
      const href = el.getAttribute('href') || '';
      const id = href.replace('/app/', '').split('/')[0];
      if (!id) return;
      const title = el.textContent?.trim() || `Session ${i + 1}`;
      tasks.push({
        id,
        title,
        task_url: `https://manus.im${href}`,
        project_id: null,
        created_at: null,
        isCurrent: currentUrl.includes(id),
      });
    });

    LOG('DOM index built:', tasks.length, 'sessions');
    return { projects, tasks };
  }

  let _drawerOpen = false;
  let _refreshNavigator = null;

  function initProjectNavigator() {
    // Install interceptors first
    try { interceptFetch(); } catch (e) { ERR('interceptFetch', e); }
    try { interceptXHR(); } catch (e) { ERR('interceptXHR', e); }

    // Create the 📁 button
    const btn = document.createElement('button');
    btn.id = 'yos-proj-btn';
    btn.title = 'Y-OS Project Navigator';
    btn.textContent = '📁';
    document.body.appendChild(btn);

    // Create the drawer
    const drawer = document.createElement('div');
    drawer.id = 'yos-proj-drawer';
    drawer.innerHTML = `
      <div id="yos-proj-header">
        <h2>📁 Projects</h2>
        <button id="yos-proj-close">✕</button>
      </div>
      <input id="yos-proj-search" type="text" placeholder="Search sessions…" autocomplete="off" />
      <div id="yos-proj-list"></div>
      <div id="yos-proj-footer">
        <span id="yos-proj-status">Loading…</span>
        <button id="yos-proj-refresh">↻ Refresh</button>
      </div>
    `;
    document.body.appendChild(drawer);

    // Toggle drawer
    btn.addEventListener('click', () => {
      _drawerOpen = !_drawerOpen;
      drawer.classList.toggle('open', _drawerOpen);
      if (_drawerOpen) renderNavigator();
    });

    document.getElementById('yos-proj-close').addEventListener('click', () => {
      _drawerOpen = false;
      drawer.classList.remove('open');
    });

    // Close on outside click
    document.addEventListener('click', e => {
      if (_drawerOpen && !drawer.contains(e.target) && e.target !== btn) {
        _drawerOpen = false;
        drawer.classList.remove('open');
      }
    });

    // Search
    document.getElementById('yos-proj-search').addEventListener('input', throttle(() => {
      renderNavigator();
    }, 200));

    // Refresh button
    document.getElementById('yos-proj-refresh').addEventListener('click', () => {
      YOS_STORE.clear();
      renderNavigator(true);
    });

    _refreshNavigator = renderNavigator;
    LOG('project navigator init');
  }

  function refreshNavigator() {
    if (_drawerOpen && _refreshNavigator) _refreshNavigator();
  }

  function renderNavigator(forceDOM = false) {
    const list = document.getElementById('yos-proj-list');
    const status = document.getElementById('yos-proj-status');
    const searchVal = (document.getElementById('yos-proj-search')?.value || '').toLowerCase().trim();
    if (!list) return;

    // Get data: cache first, then DOM
    let cached = YOS_STORE.load();
    let projects = cached?.projects || [];
    let tasks = cached?.tasks || [];

    if (tasks.length === 0 || forceDOM) {
      const dom = buildIndexFromDOM();
      if (dom.tasks.length > 0) {
        tasks = dom.tasks;
        projects = dom.projects;
      }
    }

    const currentUrl = window.location.href;

    // Filter by search
    let filteredTasks = tasks;
    if (searchVal) {
      filteredTasks = tasks.filter(t =>
        (t.title || '').toLowerCase().includes(searchVal) ||
        (t.id || '').toLowerCase().includes(searchVal)
      );
    }

    // Group by project
    const grouped = {};
    const unassigned = [];

    projects.forEach(p => { grouped[p.id] = { project: p, sessions: [] }; });

    filteredTasks.forEach(t => {
      if (t.project_id && grouped[t.project_id]) {
        grouped[t.project_id].sessions.push(t);
      } else {
        unassigned.push(t);
      }
    });

    // Render
    list.innerHTML = '';

    // Projects with sessions
    Object.values(grouped).forEach((g, gi) => {
      if (g.sessions.length === 0 && searchVal) return;
      const color = C.palette[gi % C.palette.length];
      const grp = makeProjectGroup(g.project.name || 'Project', color, g.sessions, currentUrl, gi);
      list.appendChild(grp);
    });

    // Unassigned sessions
    if (unassigned.length > 0) {
      const grp = makeProjectGroup('Unassigned', '#374151', unassigned, currentUrl, 99);
      grp.classList.add('yos-proj-unassigned');
      list.appendChild(grp);
    }

    if (filteredTasks.length === 0 && tasks.length === 0) {
      list.innerHTML = '<div style="padding:20px 12px;color:#8b90a0;font-size:12px;text-align:center;">No sessions found.<br>Navigate to a session to populate.</div>';
    }

    const updatedAgo = cached ? Math.round((Date.now() - cached.ts) / 60000) + 'm ago' : 'from DOM';
    if (status) status.textContent = `${filteredTasks.length} sessions · ${updatedAgo}`;
  }

  function makeProjectGroup(name, color, sessions, currentUrl, idx) {
    const grp = document.createElement('div');
    grp.className = 'yos-proj-group';

    const hdr = document.createElement('div');
    hdr.className = 'yos-proj-group-hdr';
    hdr.innerHTML = `
      <div class="yos-proj-dot" style="background:${color}"></div>
      <div class="yos-proj-name">${escHtml(name)}</div>
      <div class="yos-proj-count">${sessions.length}</div>
      <div class="yos-proj-chevron">▶</div>
    `;

    const sessContainer = document.createElement('div');
    sessContainer.className = 'yos-proj-sessions';

    sessions.forEach(s => {
      const item = document.createElement('div');
      item.className = 'yos-session-item';
      const isCurrent = currentUrl.includes(s.id) || s.isCurrent;
      if (isCurrent) item.classList.add('current');

      const dateStr = s.created_at ? new Date(s.created_at).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' }) : '';

      item.innerHTML = `
        <div class="yos-session-title">${escHtml(s.title || s.id)}</div>
        ${dateStr ? `<div class="yos-session-date">${dateStr}</div>` : ''}
      `;
      item.addEventListener('click', () => {
        const url = s.task_url || `https://manus.im/app/${s.id}`;
        window.location.href = url;
      });
      sessContainer.appendChild(item);
    });

    hdr.addEventListener('click', () => {
      grp.classList.toggle('expanded');
    });

    // Auto-expand if current session is in this group
    if (sessions.some(s => currentUrl.includes(s.id))) {
      grp.classList.add('expanded');
    }

    grp.appendChild(hdr);
    grp.appendChild(sessContainer);
    return grp;
  }

  function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── FAB ─────────────────────────────────────────────────────
  function initFAB() {
    if (document.getElementById('yos-fab')) return;
    const fab = document.createElement('div');
    fab.id = 'yos-fab';

    const mkB = (icon, tip, fn) => {
      const b = document.createElement('button');
      b.className = 'yos-fab-btn';
      b.textContent = icon;
      b.setAttribute('data-tip', tip);
      b.addEventListener('click', fn);
      return b;
    };

    fab.appendChild(mkB('↑', 'Top (Alt+T)', () => chatSC()?.scrollTo({ top: 0, behavior: 'smooth' })));
    fab.appendChild(mkB('↓', 'Bottom (Alt+B)', () => { const sc = chatSC(); if (sc) sc.scrollTop = sc.scrollHeight; }));
    fab.appendChild(mkB('⬆', 'Prev Q (Alt+↑)', () => navQ(-1)));
    fab.appendChild(mkB('⬇', 'Next Q (Alt+↓)', () => navQ(1)));
    fab.appendChild(mkB('⬇MD', 'Export MD (Alt+E)', () => exportMD()));
    fab.appendChild(mkB('🖨', 'Print (Alt+P)', () => window.print()));

    document.body.appendChild(fab);
    LOG('FAB injected');
  }

  function navQ(dir) {
    try {
      const sc = chatSC();
      if (!sc) return;
      const msgs = getMessages().filter(isUserMsg);
      if (!msgs.length) { LOG('navQ: no user msgs found'); return; }
      const scTop = sc.scrollTop;
      let target = null;
      if (dir === -1) {
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].offsetTop < scTop - 40) { target = msgs[i]; break; }
        }
        if (!target) target = msgs[0];
      } else {
        for (let i = 0; i < msgs.length; i++) {
          if (msgs[i].offsetTop > scTop + 60) { target = msgs[i]; break; }
        }
        if (!target) target = msgs[msgs.length - 1];
      }
      if (target) sc.scrollTo({ top: target.offsetTop - 20, behavior: 'smooth' });
    } catch (e) { ERR('navQ', e); }
  }

  function exportMD() {
    try {
      const title = document.title.replace(/ - (Manus|Y-OS).*$/, '').trim();
      const date = new Date().toISOString().split('T')[0];
      let md = `# ${title}\n\n*Y-OS Export — ${date}*\n\n---\n\n`;
      getMessages().forEach(msg => {
        if (isUserMsg(msg)) {
          const txt = msg.textContent.trim();
          if (txt) md += `**You:** ${txt}\n\n`;
        } else {
          const d = getMDDiv(msg);
          if (d) md += `**Manus:**\n\n${d.innerText || d.textContent}\n\n---\n\n`;
        }
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
      a.download = `yos-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 40)}-${date}.md`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      LOG('exportMD done');
    } catch (e) { ERR('exportMD', e); }
  }

  // ─── MESSAGE TOOLBAR ─────────────────────────────────────────
  const _tbDone = new WeakSet();

  function initMsgToolbar() {
    let passes = 0;
    const MAX = 20;

    const run = () => {
      try {
        passes++;
        const msgs = getMessages();
        LOG('toolbar run #' + passes + ', msgs found:', msgs.length);
        let injected = 0;
        msgs.forEach(msg => {
          if (isUserMsg(msg)) return;
          const md = getMDDiv(msg);
          if (!md) return;
          if (_tbDone.has(md)) return;
          _tbDone.add(md);

          md.classList.add('yos-mw');
          md.style.position = 'relative';

          const tb = document.createElement('div');
          tb.className = 'yos-tb';

          const mkB = (icon, cls, title, fn) => {
            const b = document.createElement('button');
            b.className = `ytb ${cls}`; b.textContent = icon; b.title = title;
            b.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); fn(b); });
            return b;
          };
          const sep = () => { const s = document.createElement('span'); s.className = 'ysep'; return s; };

          tb.appendChild(mkB('✅', 'ok', 'OK — continue', () => sendMsg('✅ OK, continue.')));
          tb.appendChild(mkB('❌', 'no', 'Incorrect — fix', () => prefillInput('❌ Non, corrige ce point : ')));
          tb.appendChild(mkB('⚠️', 'wn', 'Partially correct', () => prefillInput('⚠️ Partiellement correct, précise : ')));
          tb.appendChild(sep());
          tb.appendChild(mkB('📋', '', 'Copy as Markdown', (b) => {
            const txt = md.innerText || md.textContent;
            try { GM_setClipboard(txt, 'text'); } catch(e2) { navigator.clipboard.writeText(txt).catch(() => {}); }
            b.textContent = '✓'; setTimeout(() => { b.textContent = '📋'; }, 1500);
          }));
          if ((md.textContent || '').length > 600) {
            let col = false;
            tb.appendChild(mkB('⤢', '', 'Collapse', (b) => {
              col = !col; md.classList.toggle('yos-col', col);
              b.textContent = col ? '⤡' : '⤢'; b.title = col ? 'Expand' : 'Collapse';
            }));
          }
          md.appendChild(tb);
          injected++;
        });
        if (injected > 0) LOG('toolbar: injected', injected, 'toolbars');
      } catch (e) { ERR('toolbar run', e); }
    };

    // Initial run at 3s, then every 5s, hard stop at MAX
    setTimeout(run, 3000);
    const timer = setInterval(() => {
      run();
      if (passes >= MAX) {
        clearInterval(timer);
        LOG('toolbar polling stopped, re-armed on scroll');
        const sc = chatSC();
        if (sc) sc.addEventListener('scroll', throttle(run, 4000), { passive: true });
      }
    }, 5000);
  }

  // ─── SELECT TO PROMPT ────────────────────────────────────────
  function initSelectToPrompt() {
    if (document.getElementById('yos-tip')) return;
    const tip = document.createElement('div');
    tip.id = 'yos-tip';
    tip.style.cssText = `position:fixed;z-index:99999;display:none;background:#0d0f14;border:1px solid #7c3aed;color:#e8eaf0;font-size:12px;padding:5px 12px;border-radius:6px;cursor:pointer;user-select:none;box-shadow:0 2px 14px rgba(124,58,237,.4);font-family:system-ui,sans-serif;`;
    tip.textContent = '→ Use as prompt';
    document.body.appendChild(tip);

    let sel = '';
    document.addEventListener('mouseup', e => {
      if (e.target.closest('nav') || e.target.closest('textarea') || e.target === tip) return;
      const s = window.getSelection()?.toString().trim();
      if (s && s.length > 8) {
        sel = s;
        const r = window.getSelection().getRangeAt(0).getBoundingClientRect();
        tip.style.left = Math.min(r.left, window.innerWidth - 170) + 'px';
        tip.style.top = (r.bottom + window.scrollY + 6) + 'px';
        tip.style.display = 'block';
      } else { tip.style.display = 'none'; sel = ''; }
    });
    tip.addEventListener('click', () => {
      if (sel) { prefillInput(`> "${sel}"\n\n`); tip.style.display = 'none'; window.getSelection()?.removeAllRanges(); }
    });
    document.addEventListener('mousedown', e => { if (e.target !== tip) tip.style.display = 'none'; });
    LOG('selectToPrompt init');
  }

  // ─── KEYBOARD ────────────────────────────────────────────────
  function initKeyboard() {
    document.addEventListener('keydown', e => {
      if (!e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || document.activeElement?.contentEditable === 'true') return;
      const sc = chatSC();
      switch (e.key) {
        case 't': case 'T': e.preventDefault(); sc?.scrollTo({ top: 0, behavior: 'smooth' }); break;
        case 'b': case 'B': e.preventDefault(); if (sc) sc.scrollTop = sc.scrollHeight; break;
        case 'ArrowUp':   e.preventDefault(); navQ(-1); break;
        case 'ArrowDown': e.preventDefault(); navQ(1);  break;
        case 'e': case 'E': e.preventDefault(); exportMD(); break;
        case 'p': case 'P': e.preventDefault(); window.print(); break;
        case 'f': case 'F': e.preventDefault();
          const btn = document.getElementById('yos-proj-btn');
          if (btn) btn.click();
          break;
      }
    });
    LOG('keyboard shortcuts init (Alt+F = project navigator)');
  }

  // ─── BOOT ────────────────────────────────────────────────────
  // Phase 1: CSS immediately (non-blocking)
  injectCSS();

  // Phase 2: All features after load + 2500ms
  function launchFeatures() {
    LOG('launching features...');
    try { if (CFG.yosTitle) patchTitle(); } catch(e) { ERR('patchTitle', e); }
    try { if (CFG.yosLogo) injectLogo(); } catch(e) { ERR('injectLogo', e); }
    try { if (CFG.yosQuickLinks) injectLinks(); } catch(e) { ERR('injectLinks', e); }
    try { if (CFG.projectColors) colorProjects(); } catch(e) { ERR('colorProjects', e); }
    try { if (CFG.projectNavigator) initProjectNavigator(); } catch(e) { ERR('initProjectNavigator', e); }
    try { if (CFG.fabNav) initFAB(); } catch(e) { ERR('initFAB', e); }
    try { if (CFG.msgToolbar) initMsgToolbar(); } catch(e) { ERR('initMsgToolbar', e); }
    try { if (CFG.selectToPrompt) initSelectToPrompt(); } catch(e) { ERR('initSelectToPrompt', e); }
    try { if (CFG.keyboard) initKeyboard(); } catch(e) { ERR('initKeyboard', e); }
    LOG('Y-OS Manus client v1.8 loaded ✓');
  }

  // Phase 3: Retry branding at 6s and 15s for SPA route changes
  function scheduleRetries() {
    [6000, 15000].forEach(d => setTimeout(() => {
      try {
        if (CFG.yosLogo) injectLogo();
        if (CFG.yosQuickLinks) injectLinks();
        if (CFG.projectColors) colorProjects();
      } catch (e) {}
    }, d));
  }

  if (document.readyState === 'complete') {
    setTimeout(() => { launchFeatures(); scheduleRetries(); }, 2500);
  } else {
    window.addEventListener('load', () => {
      setTimeout(() => { launchFeatures(); scheduleRetries(); }, 2500);
    });
  }

})();
