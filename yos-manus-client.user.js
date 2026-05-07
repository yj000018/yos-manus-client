// ==UserScript==
// @name         Y-OS Manus Client
// @namespace    https://yos.ai
// @version      1.7.0
// @description  Y-OS custom client for manus.im — cleanup, branding, navigation, message toolbar
// @author       Yannick Jolliet / Y-OS
// @match        https://manus.im/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @updateURL    https://raw.githubusercontent.com/yj000018/yos-manus-client/main/yos-manus-client.user.js
// @downloadURL  https://raw.githubusercontent.com/yj000018/yos-manus-client/main/yos-manus-client.user.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

/**
 * v1.7.0 — Rewrite with robust selectors + debug logging
 *
 * KEY CHANGES vs v1.6:
 * - CSS cleanup: content-based selectors (SVG viewBox, text content) instead of fragile structural chains
 * - Logo: injected as fixed overlay on nav, not inside React-managed DOM
 * - Messages: broad selector scan (prose/markdown classes) with fallback
 * - chatSC(): multiple fallback strategies
 * - Full debug logging: every step logged to console
 * - All features individually guarded with try/catch + log
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
    fabNav:           true,
    exportMD:         true,
    msgToolbar:       true,
    selectToPrompt:   true,
    keyboard:         true,
  };

  // ─── DESIGN TOKENS ───────────────────────────────────────────
  const C = {
    bgNav:    '#0d0f14',
    accent:   '#7c3aed',
    accentDim:'#4c1d95',
    text:     '#e8eaf0',
    textDim:  '#8b90a0',
    border:   '#1e2230',
    ok:       '#22c55e',
    no:       '#ef4444',
    warn:     '#f59e0b',
    palette:  ['#7c3aed','#2563eb','#059669','#d97706','#dc2626',
               '#0891b2','#db2777','#65a30d','#9333ea','#0d9488'],
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

  // ─── CSS ─────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('yos-styles')) return;
    const css = `
      /* === CLEANUP === */
      /* Meta logo: SVG with viewBox 0 0 107 12 — hide its container */
      svg[viewBox="0 0 107 12"] { display:none!important; }
      /* "from" text next to Meta logo */
      svg[viewBox="0 0 107 12"] ~ * { display:none!important; }
      /* Parent wrapper of Meta logo */
      :has(> svg[viewBox="0 0 107 12"]) { display:none!important; }

      /* Share sidebar button — hide button containing "Share Manus" text */
      /* We target via a broad approach: any button in nav bottom area */
      nav button[class*="rounded"][class*="gap"] { display:none!important; }

      /* Cloud computers button */
      button[data-testid="cloud-computers-button"],
      button[aria-label*="Cloud"],
      button[aria-label*="computer"] { display:none!important; }

      /* === BRANDING === */
      nav { background-color:${C.bgNav}!important; }
      ::-webkit-scrollbar { width:4px; height:4px; }
      ::-webkit-scrollbar-track { background:transparent; }
      ::-webkit-scrollbar-thumb { background:${C.accentDim}; border-radius:2px; }
      ::-webkit-scrollbar-thumb:hover { background:${C.accent}; }

      /* === FAB === */
      #yos-fab{position:fixed;right:14px;bottom:100px;z-index:9999;display:flex;flex-direction:column;gap:5px;pointer-events:none;}
      .yb{width:32px;height:32px;border-radius:50%;background:${C.bgNav};border:1px solid ${C.border};color:${C.text};font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:all;transition:all .15s;box-shadow:0 2px 8px rgba(0,0,0,.6);opacity:.65;user-select:none;font-family:system-ui,sans-serif;line-height:1;}
      .yb:hover{background:${C.accentDim};border-color:${C.accent};opacity:1;transform:scale(1.12);}
      .yb.wide{border-radius:8px;width:38px;font-size:9px;font-weight:700;}
      .yb-hidden{opacity:0!important;pointer-events:none!important;}

      /* === MESSAGE TOOLBAR === */
      .yos-mw{position:relative;}
      .yos-tb{display:none;position:absolute;top:-36px;right:0;background:${C.bgNav};border:1px solid ${C.border};border-radius:8px;padding:3px 6px;gap:2px;align-items:center;z-index:1000;box-shadow:0 2px 12px rgba(0,0,0,.6);white-space:nowrap;}
      .yos-mw:hover .yos-tb{display:flex!important;}
      .ytb{background:transparent;border:none;color:${C.textDim};font-size:13px;cursor:pointer;padding:2px 5px;border-radius:4px;transition:all .1s;line-height:1.2;font-family:system-ui,sans-serif;}
      .ytb:hover{background:rgba(124,58,237,.15);color:${C.text};}
      .ytb.ok:hover{color:${C.ok};} .ytb.no:hover{color:${C.no};} .ytb.wn:hover{color:${C.warn};}
      .ysep{width:1px;height:14px;background:${C.border};margin:0 3px;display:inline-block;}
      .yos-col{max-height:80px;overflow:hidden;position:relative;}
      .yos-col::after{content:'';position:absolute;bottom:0;left:0;right:0;height:32px;background:linear-gradient(transparent,#111318);pointer-events:none;}

      /* === PRINT === */
      @media print {
        nav, #yos-fab, #yos-tip { display:none!important; }
        body { background:#fff!important; color:#000!important; }
      }
    `;
    const s = document.createElement('style');
    s.id = 'yos-styles';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
    LOG('CSS injected');
  }

  // ─── UTILS ───────────────────────────────────────────────────
  function throttle(fn, ms) {
    let t = null;
    return (...args) => { if (!t) { t = setTimeout(() => { t = null; fn(...args); }, ms); } };
  }

  // chatSC — multiple fallback strategies, no getBoundingClientRect
  let _sc = null;
  function chatSC() {
    if (_sc && document.contains(_sc)) return _sc;
    // Strategy 1: simplebar with offsetLeft > 200 (main content area)
    const sbAll = document.querySelectorAll('.simplebar-content-wrapper');
    for (const el of sbAll) {
      if (el.offsetLeft >= 200) { _sc = el; return _sc; }
    }
    // Strategy 2: any simplebar that's not the nav
    for (const el of sbAll) {
      if (!el.closest('nav')) { _sc = el; return _sc; }
    }
    // Strategy 3: main element
    const main = document.querySelector('main');
    if (main) { _sc = main; return _sc; }
    // Strategy 4: documentElement
    _sc = document.documentElement;
    return _sc;
  }

  // Message detection — broad approach
  function getMessages() {
    try {
      const sc = chatSC();
      if (!sc) return [];
      // Try to find the message container via multiple strategies
      const content = sc.querySelector('.simplebar-content') || sc;

      // Strategy 1: look for elements with role="listitem" or data-message
      const byRole = content.querySelectorAll('[role="listitem"]');
      if (byRole.length > 0) return [...byRole];

      // Strategy 2: look for direct children of the main message wrapper
      // Find the deepest container that has multiple children (messages)
      const candidates = content.querySelectorAll('div > div > div > div');
      for (const c of candidates) {
        if (c.children.length >= 3 && c.clientHeight > 200) {
          return [...c.children];
        }
      }

      // Strategy 3: fallback — find all prose/markdown divs and go up 2 levels
      const proseEls = content.querySelectorAll('[class*="prose"],[class*="markdown"],[class*="max-w-none"]');
      if (proseEls.length > 0) {
        const parents = new Set();
        proseEls.forEach(el => {
          const p = el.parentElement?.parentElement;
          if (p) parents.add(p);
        });
        return [...parents];
      }
      return [];
    } catch (e) { ERR('getMessages', e); return []; }
  }

  function isUserMsg(el) {
    try {
      // User messages typically have right-aligned content
      return !!el.querySelector('[class*="items-end"]') ||
             !!el.querySelector('[class*="justify-end"]') ||
             el.textContent.trim().length < 500; // heuristic: user msgs are short
    } catch (e) { return false; }
  }

  // Find the markdown/prose div in a message
  function getMDDiv(el) {
    try {
      return el.querySelector('[class*="max-w-none"]') ||
             el.querySelector('[class*="prose"]') ||
             el.querySelector('[class*="markdown"]') ||
             el.querySelector('[class*="leading-"]') ||
             null;
    } catch (e) { return null; }
  }

  function prefillInput(text) {
    try {
      const inp = document.querySelector('textarea');
      if (!inp) return;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) setter.call(inp, text); else inp.value = text;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    } catch (e) {}
  }

  function sendMsg(text) {
    prefillInput(text);
    setTimeout(() => {
      try {
        const inp = document.querySelector('textarea');
        if (inp) inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
      } catch (e) {}
    }, 150);
  }

  // ─── BRANDING ────────────────────────────────────────────────
  function injectLogo() {
    if (document.getElementById('yos-logo')) return;
    const nav = document.querySelector('nav');
    if (!nav) { ERR('injectLogo: no nav'); return; }

    // Hide original Manus logo SVGs (not the Meta one — that's handled by CSS)
    // Target the first SVG in nav that's NOT the Meta logo
    const svgs = nav.querySelectorAll('svg');
    let manusLogoSVG = null;
    for (const svg of svgs) {
      const vb = svg.getAttribute('viewBox') || '';
      // Skip Meta logo (107x12), skip tiny icons
      if (vb === '0 0 107 12') continue;
      const w = parseFloat(svg.getAttribute('width') || '0');
      const h = parseFloat(svg.getAttribute('height') || '0');
      if (w > 20 && h > 10) { manusLogoSVG = svg; break; }
    }

    if (manusLogoSVG) {
      manusLogoSVG.style.display = 'none';
      LOG('injectLogo: original SVG hidden');
    } else {
      LOG('injectLogo: no original SVG found, injecting overlay');
    }

    // Inject Y-OS logo as a fixed overlay at top-left of nav
    const logo = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    logo.id = 'yos-logo';
    logo.setAttribute('viewBox', '0 0 72 24');
    logo.setAttribute('width', '72');
    logo.setAttribute('height', '24');
    logo.style.cssText = 'position:absolute;top:14px;left:14px;z-index:100;cursor:pointer;display:block;';
    logo.innerHTML = `
      <defs>
        <linearGradient id="yg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#a78bfa"/>
          <stop offset="100%" style="stop-color:#7c3aed"/>
        </linearGradient>
      </defs>
      <path d="M2 4L9 13v7h3v-7l7-9h-3.5l-5 7-5-7Z" fill="url(#yg)"/>
      <rect x="22" y="11" width="6" height="2.5" rx="1.25" fill="#a78bfa"/>
      <path d="M32 4c-5 0-8 3.5-8 8s3 8 8 8 8-3.5 8-8-3-8-8-8zm0 3c3 0 5 2 5 5s-2 5-5 5-5-2-5-5 2-5 5-5z" fill="url(#yg)"/>
      <path d="M43 4v3h8c1.5 0 2.5.8 2.5 2s-1 2-2.5 2h-5c-2.5 0-4 1.8-4 4s1.5 5 5 5h8v-3h-8c-1.5 0-2-.8-2-2s.8-1 2-1h4c3 0 5.5-2 5.5-5s-2.5-5-5.5-5z" fill="url(#yg)"/>
    `;

    // Make nav position:relative so absolute positioning works
    nav.style.position = 'relative';
    nav.appendChild(logo);
    LOG('injectLogo: Y-OS logo injected');
  }

  // patchTitle — re-entrant safe
  function patchTitle() {
    let _patching = false;
    const fix = () => {
      if (_patching) return;
      if (document.title.startsWith('Y-OS')) return;
      _patching = true;
      document.title = document.title.replace(/\bManus\b/g, 'Y-OS');
      _patching = false;
    };
    fix();
    const t = document.querySelector('title');
    if (t) new MutationObserver(fix).observe(t, { childList: true });
    LOG('patchTitle done');
  }

  // injectLinks — stable parent check
  function injectLinks() {
    const existing = document.getElementById('yos-links');
    if (existing && document.contains(existing)) return;

    const nav = document.querySelector('nav');
    if (!nav) { ERR('injectLinks: no nav'); return; }

    const navMain = nav.firstElementChild;
    if (!navMain) { ERR('injectLinks: no navMain'); return; }

    // Find the menu section (second child of navMain typically)
    let menuSection = null;
    if (navMain.children.length >= 2) {
      menuSection = navMain.children[1];
    } else {
      menuSection = navMain; // fallback: inject directly into navMain
    }

    const wrap = document.createElement('div');
    wrap.id = 'yos-links';
    wrap.style.cssText = 'padding:4px 8px 0;flex-shrink:0;';
    wrap.innerHTML = `
      <div style="padding:8px 4px 4px;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${C.textDim};">Y-OS Tools</div>
      ${C.links.map(l => `<a href="${l.url}" target="_blank" rel="noopener"
        style="display:flex;align-items:center;padding:5px 8px;border-radius:8px;font-size:12px;color:${C.text};text-decoration:none;gap:6px;transition:background .15s;"
        onmouseover="this.style.background='rgba(124,58,237,.12)'"
        onmouseout="this.style.background='transparent'">${l.label}</a>`).join('')}
      <div style="height:1px;background:${C.border};margin:6px 4px 0;"></div>
    `;
    menuSection.insertBefore(wrap, menuSection.firstChild);
    LOG('injectLinks done, section children:', menuSection.children.length);
  }

  function colorProjects() {
    try {
      const nav = document.querySelector('nav');
      if (!nav) return;
      // Broad selector: any vertical list in nav that looks like project groups
      const lists = nav.querySelectorAll('[class*="flex-col"][class*="gap"]');
      let colored = 0;
      lists.forEach(c => {
        if (c.children.length < 2) return;
        [...c.children].forEach((item, i) => {
          if (item.dataset.yc) return;
          item.dataset.yc = '1';
          const col = C.palette[i % C.palette.length];
          item.style.cssText += `border-left:2px solid ${col};padding-left:6px;border-radius:0 6px 6px 0;margin-bottom:1px;`;
          const txt = item.querySelector('[class*="truncate"]') || item.querySelector('[class*="flex-1"]');
          if (txt) { txt.style.color = col; txt.style.fontWeight = '600'; }
          colored++;
        });
      });
      if (colored > 0) LOG('colorProjects:', colored, 'items colored');
    } catch (e) { ERR('colorProjects', e); }
  }

  // ─── FAB ─────────────────────────────────────────────────────
  function initFAB() {
    if (document.getElementById('yos-fab')) return;
    const fab = document.createElement('div');
    fab.id = 'yos-fab';

    const mkBtn = (txt, title, fn) => {
      const b = document.createElement('button');
      b.className = 'yb'; b.textContent = txt; b.title = title;
      b.addEventListener('click', fn);
      return b;
    };

    const btnTop = mkBtn('↑', 'Back to top (Alt+T)', () => {
      const s = chatSC(); if (s) s.scrollTo({ top: 0, behavior: 'smooth' });
    });
    btnTop.classList.add('yb-hidden');
    fab.appendChild(btnTop);

    fab.appendChild(mkBtn('↓', 'Scroll to bottom (Alt+B)', () => {
      const s = chatSC(); if (s) s.scrollTop = s.scrollHeight;
    }));
    fab.appendChild(mkBtn('⬆', 'Prev question (Alt+↑)', () => navQ(-1)));
    fab.appendChild(mkBtn('⬇', 'Next question (Alt+↓)', () => navQ(1)));

    if (CFG.exportMD) {
      const b = mkBtn('↓MD', 'Export Markdown (Alt+E)', exportMD);
      b.classList.add('wide'); fab.appendChild(b);
    }
    fab.appendChild(mkBtn('🖨', 'Print (Alt+P)', () => window.print()));
    document.body.appendChild(fab);

    setTimeout(() => {
      const sc = chatSC();
      if (sc) sc.addEventListener('scroll', throttle(() => {
        btnTop.classList.toggle('yb-hidden', sc.scrollTop <= 300);
      }, 300), { passive: true });
    }, 1000);
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
    tip.style.cssText = `position:fixed;z-index:99999;display:none;background:${C.bgNav};border:1px solid ${C.accent};color:${C.text};font-size:12px;padding:5px 12px;border-radius:6px;cursor:pointer;user-select:none;box-shadow:0 2px 14px rgba(124,58,237,.4);font-family:system-ui,sans-serif;`;
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
      }
    });
    LOG('keyboard shortcuts init');
  }

  // ─── BOOT ────────────────────────────────────────────────────
  // Phase 1: CSS immediately
  injectCSS();

  // Phase 2: All features after load + 2500ms
  function launchFeatures() {
    LOG('launching features...');
    try { if (CFG.yosTitle) patchTitle(); } catch(e) { ERR('patchTitle', e); }
    try { if (CFG.yosLogo) injectLogo(); } catch(e) { ERR('injectLogo', e); }
    try { if (CFG.yosQuickLinks) injectLinks(); } catch(e) { ERR('injectLinks', e); }
    try { if (CFG.projectColors) colorProjects(); } catch(e) { ERR('colorProjects', e); }
    try { if (CFG.fabNav) initFAB(); } catch(e) { ERR('initFAB', e); }
    try { if (CFG.msgToolbar) initMsgToolbar(); } catch(e) { ERR('initMsgToolbar', e); }
    try { if (CFG.selectToPrompt) initSelectToPrompt(); } catch(e) { ERR('initSelectToPrompt', e); }
    try { if (CFG.keyboard) initKeyboard(); } catch(e) { ERR('initKeyboard', e); }
    LOG('Y-OS Manus client v1.7 loaded ✓');
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
