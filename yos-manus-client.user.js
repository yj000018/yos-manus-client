// ==UserScript==
// @name         Y-OS Manus Client
// @namespace    https://yos.ai
// @version      1.4.0
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
 * v1.4.0 — Performance fix
 * ROOT CAUSE of freeze: setInterval(800ms) calling getBoundingClientRect() on every message
 * → forced synchronous layout reflow on every tick → CPU 100% on long conversations
 *
 * FIX:
 * - Toolbar: IntersectionObserver (zero reflow, fires only when element enters viewport)
 * - colorProjects: no MutationObserver, only 3 deferred retries
 * - navQ: cached rects, no live getBoundingClientRect in loop
 * - All DOM writes batched, no reads inside write loops
 */

(function () {
  'use strict';

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

  // ─── TOKENS ──────────────────────────────────────────────────
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

  // ─── UTILS ───────────────────────────────────────────────────
  let _css = '';
  function addCSS(css) { _css += css + '\n'; }
  function flushCSS() {
    const existing = document.getElementById('yos-styles');
    if (existing) existing.remove();
    const s = document.createElement('style');
    s.id = 'yos-styles';
    s.textContent = _css;
    document.head.appendChild(s);
  }

  function throttle(fn, ms) {
    let t = null;
    return (...args) => {
      if (!t) { t = setTimeout(() => { t = null; fn(...args); }, ms); }
    };
  }

  // Chat scroll container — cached
  let _sc = null;
  function chatSC() {
    if (_sc && document.contains(_sc)) return _sc;
    const all = document.querySelectorAll('.simplebar-content-wrapper');
    let best = null;
    all.forEach(el => { if (el.getBoundingClientRect().left >= 200) best = el; });
    _sc = best || document.querySelector('main') || document.documentElement;
    return _sc;
  }

  // Get message list — reads DOM structure once
  function getMessages() {
    const sc = chatSC();
    if (!sc) return [];
    const content = sc.querySelector('.simplebar-content');
    if (!content) return [];
    const main = content.firstElementChild;
    if (!main || main.children.length < 2) return [];
    const mx = main.children[1];
    if (!mx || !mx.firstElementChild) return [];
    const outer = mx.firstElementChild.firstElementChild;
    return outer ? [...outer.children] : [];
  }

  function isUserMsg(el) {
    return !!el.querySelector('[class*="items-end"][class*="justify-end"]');
  }

  function getMDDiv(el) {
    return el.querySelector('[class*="max-w-none"]') ||
           el.querySelector('[class*="prose"]') ||
           el.querySelector('[class*="leading-"][class*="text-[var"]');
  }

  function getChatInput() { return document.querySelector('textarea'); }

  function prefillInput(text) {
    const inp = getChatInput();
    if (!inp) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(inp, text); else inp.value = text;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
  }

  function sendMsg(text) {
    prefillInput(text);
    setTimeout(() => {
      const inp = getChatInput();
      if (inp) inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    }, 120);
  }

  // ─── MODULE 1 — CLEANUP (pure CSS, zero observers) ───────────
  function initCleanup() {
    // Meta logo: the last flex-col items-start div in the nav bottom section
    addCSS(`
      nav > div > div:last-child div[class*="flex-col"][class*="items-start"] { display:none!important; }
      nav > div > div:last-child > div:first-child > button { display:none!important; }
      button[hint="My Computer"] { display:none!important; }
    `);
  }

  // ─── MODULE 2 — BRANDING ─────────────────────────────────────
  function initBranding() {
    if (CFG.yosColors) {
      addCSS(`
        nav { background-color:${C.bgNav}!important; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:${C.accentDim}; border-radius:2px; }
        ::-webkit-scrollbar-thumb:hover { background:${C.accent}; }
        @media print {
          nav, #yos-fab, #yos-tip { display:none!important; }
          body { background:#fff!important; color:#000!important; }
        }
      `);
    }
    if (CFG.yosLogo) injectLogo();
    if (CFG.yosTitle) patchTitle();
    if (CFG.yosQuickLinks) injectLinks();
    if (CFG.projectColors) colorProjects();
  }

  function injectLogo() {
    if (document.getElementById('yos-logo')) return;
    const nav = document.querySelector('nav');
    if (!nav) return;
    const headerRow = nav.firstElementChild?.firstElementChild;
    if (!headerRow) return;
    const origSVG = headerRow.querySelector('svg');
    if (!origSVG) return;

    origSVG.style.display = 'none';
    [...headerRow.querySelectorAll('span,div')].forEach(el => {
      if (!el.children.length && /^manus$/i.test(el.textContent.trim())) el.style.display = 'none';
    });

    const logo = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    logo.id = 'yos-logo';
    logo.setAttribute('viewBox', '0 0 72 24');
    logo.setAttribute('width', '72');
    logo.setAttribute('height', '24');
    logo.style.cssText = 'cursor:pointer;flex-shrink:0;display:block;';
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
    origSVG.parentElement.insertBefore(logo, origSVG);
  }

  function patchTitle() {
    const fix = () => { if (!document.title.startsWith('Y-OS')) document.title = document.title.replace(/\bManus\b/g, 'Y-OS'); };
    fix();
    const t = document.querySelector('title');
    if (t) new MutationObserver(fix).observe(t, { childList: true });
  }

  function injectLinks() {
    if (document.getElementById('yos-links')) return;
    const nav = document.querySelector('nav');
    if (!nav) return;
    const navMain = nav.firstElementChild;
    if (!navMain || navMain.children.length < 2) return;
    const menuSection = navMain.children[1];
    if (!menuSection) return;

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
  }

  // colorProjects — NO MutationObserver, only deferred retries
  function colorProjects() {
    const run = () => {
      const nav = document.querySelector('nav');
      if (!nav) return;
      nav.querySelectorAll('[class*="flex-col"][class*="gap-px"][class*="pt-[3px]"]').forEach(c => {
        [...c.children].forEach((item, i) => {
          if (item.dataset.yc) return;
          item.dataset.yc = '1';
          const col = C.palette[i % C.palette.length];
          item.style.cssText += `border-left:2px solid ${col};padding-left:6px;border-radius:0 6px 6px 0;margin-bottom:1px;`;
          const txt = item.querySelector('[class*="truncate"]') || item.querySelector('[class*="flex-1"]');
          if (txt) { txt.style.color = col; txt.style.fontWeight = '600'; }
        });
      });
    };
    // Run at 3 safe moments — no observer
    [500, 2500, 7000].forEach(d => setTimeout(run, d));
  }

  // ─── MODULE 3 — FAB NAVIGATION ───────────────────────────────
  function initFAB() {
    if (!CFG.fabNav) return;
    addCSS(`
      #yos-fab{position:fixed;right:14px;bottom:100px;z-index:9999;display:flex;flex-direction:column;gap:5px;pointer-events:none;}
      .yb{width:32px;height:32px;border-radius:50%;background:${C.bgNav};border:1px solid ${C.border};color:${C.text};font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:all;transition:all .15s;box-shadow:0 2px 8px rgba(0,0,0,.6);opacity:.6;user-select:none;font-family:system-ui,sans-serif;line-height:1;}
      .yb:hover{background:${C.accentDim};border-color:${C.accent};opacity:1;transform:scale(1.12);}
      .yb.wide{border-radius:8px;width:38px;font-size:9px;font-weight:700;}
      .yb[data-h="1"]{opacity:0!important;pointer-events:none!important;}
    `);

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
    btnTop.dataset.h = '1';
    fab.appendChild(btnTop);
    fab.appendChild(mkBtn('↓', 'Scroll to bottom (Alt+B)', () => {
      const s = chatSC(); if (s) s.scrollTop = s.scrollHeight;
    }));
    fab.appendChild(mkBtn('⬆', 'Previous question (Alt+↑)', () => navQ(-1)));
    fab.appendChild(mkBtn('⬇', 'Next question (Alt+↓)', () => navQ(1)));

    if (CFG.exportMD) {
      const b = mkBtn('↓MD', 'Export as Markdown (Alt+E)', exportMD);
      b.classList.add('wide'); fab.appendChild(b);
    }
    fab.appendChild(mkBtn('🖨', 'Print (Alt+P)', () => window.print()));
    document.body.appendChild(fab);

    // Scroll listener — passive, throttled
    setTimeout(() => {
      const sc = chatSC();
      if (sc) sc.addEventListener('scroll', throttle(() => {
        btnTop.dataset.h = sc.scrollTop > 300 ? '0' : '1';
      }, 300), { passive: true });
    }, 3000);
  }

  // navQ — NO getBoundingClientRect in loop, uses offsetTop instead
  function navQ(dir) {
    const sc = chatSC();
    if (!sc) return;
    const msgs = getMessages().filter(isUserMsg);
    if (!msgs.length) return;

    // Use offsetTop relative to scroll container — no forced reflow
    const scTop = sc.scrollTop;
    let target = null;

    if (dir === -1) {
      for (let i = msgs.length - 1; i >= 0; i--) {
        const elTop = msgs[i].offsetTop;
        if (elTop < scTop - 40) { target = msgs[i]; break; }
      }
      if (!target) target = msgs[0];
    } else {
      for (let i = 0; i < msgs.length; i++) {
        const elTop = msgs[i].offsetTop;
        if (elTop > scTop + 60) { target = msgs[i]; break; }
      }
      if (!target) target = msgs[msgs.length - 1];
    }

    if (target) sc.scrollTo({ top: target.offsetTop - 20, behavior: 'smooth' });
  }

  function exportMD() {
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
  }

  // ─── MODULE 4 — MESSAGE TOOLBAR ──────────────────────────────
  // Uses IntersectionObserver — fires ONLY when element enters viewport
  // Zero polling, zero reflow, zero CPU when not scrolling
  function initMsgToolbar() {
    if (!CFG.msgToolbar) return;

    addCSS(`
      .yos-mw{position:relative;}
      .yos-tb{display:none;position:absolute;top:-34px;right:0;background:${C.bgNav};border:1px solid ${C.border};border-radius:8px;padding:3px 6px;gap:2px;align-items:center;z-index:1000;box-shadow:0 2px 12px rgba(0,0,0,.6);white-space:nowrap;}
      .yos-mw:hover .yos-tb{display:flex!important;}
      .ytb{background:transparent;border:none;color:${C.textDim};font-size:13px;cursor:pointer;padding:2px 5px;border-radius:4px;transition:all .1s;line-height:1.2;font-family:system-ui,sans-serif;}
      .ytb:hover{background:rgba(124,58,237,.15);color:${C.text};}
      .ytb.ok:hover{color:${C.ok};} .ytb.no:hover{color:${C.no};} .ytb.wn:hover{color:${C.warn};}
      .ysep{width:1px;height:14px;background:${C.border};margin:0 3px;display:inline-block;}
      .yos-col{max-height:80px;overflow:hidden;position:relative;}
      .yos-col::after{content:'';position:absolute;bottom:0;left:0;right:0;height:32px;background:linear-gradient(transparent,#111318);pointer-events:none;}
    `);

    // IntersectionObserver: processes each message element once when it enters viewport
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const msg = entry.target;
        io.unobserve(msg); // process once only

        if (isUserMsg(msg)) return;
        const md = getMDDiv(msg);
        if (!md || md.dataset.ytb) return;
        md.dataset.ytb = '1';
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
          try { GM_setClipboard(txt, 'text'); } catch(e) { navigator.clipboard.writeText(txt).catch(() => {}); }
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
      });
    }, { threshold: 0.1 });

    // Watch for new message elements — scoped to chat container only
    // Use a lightweight MutationObserver on the messages container (not body)
    function observeMessages() {
      const msgs = getMessages();
      msgs.forEach(m => { if (!m.dataset.yio) { m.dataset.yio = '1'; io.observe(m); } });
    }

    // Initial pass + deferred for SPA
    [500, 2000, 5000].forEach(d => setTimeout(observeMessages, d));

    // Scoped MutationObserver — only on the messages container, childList only (no subtree, no attributes)
    setTimeout(() => {
      const sc = chatSC();
      if (!sc) return;
      const content = sc.querySelector('.simplebar-content');
      if (!content) return;
      const main = content.firstElementChild;
      if (!main || main.children.length < 2) return;
      const mx = main.children[1];
      if (!mx || !mx.firstElementChild) return;
      const outer = mx.firstElementChild.firstElementChild;
      if (!outer) return;

      // Only childList on the direct message container — fires when new messages added
      new MutationObserver(throttle(observeMessages, 500)).observe(outer, { childList: true });
    }, 3000);
  }

  // ─── MODULE 5 — SELECT TO PROMPT ─────────────────────────────
  function initSelectToPrompt() {
    if (!CFG.selectToPrompt) return;

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
  }

  // ─── MODULE 6 — KEYBOARD ─────────────────────────────────────
  function initKeyboard() {
    if (!CFG.keyboard) return;
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
  }

  // ─── DEFERRED RETRY (SPA route changes) ──────────────────────
  function deferredRetry() {
    [1000, 3500, 9000].forEach(delay => {
      setTimeout(() => {
        if (CFG.yosLogo) injectLogo();
        if (CFG.yosQuickLinks) injectLinks();
        if (CFG.projectColors) colorProjects();
        _sc = null; // reset cached scroll container on route change
      }, delay);
    });
  }

  // ─── BOOT ────────────────────────────────────────────────────
  function boot() {
    initCleanup();
    initBranding();
    flushCSS();
    initFAB();
    initMsgToolbar();
    initSelectToPrompt();
    initKeyboard();
    deferredRetry();
    console.log('[Y-OS] Manus client v1.4 loaded ✓');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
