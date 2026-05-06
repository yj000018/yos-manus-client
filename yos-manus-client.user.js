// ==UserScript==
// @name         Y-OS Manus Client
// @namespace    https://yos.ai
// @version      1.5.0
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
 * v1.5.0 — Ultra-deferred init
 *
 * ROOT CAUSE of partial render (only menus visible):
 * - chatSC() called getBoundingClientRect() at boot, before React hydration
 * - MutationObserver on messages container tried to find deep DOM path too early
 * - Both could interrupt React's hydration cycle
 *
 * FIX v1.5:
 * - CSS injected immediately (safe, no DOM reads)
 * - ALL other code starts only after window.load + 2500ms minimum
 * - chatSC() never calls getBoundingClientRect() — uses position-based heuristic only
 * - Toolbar: slow setInterval (4s) that self-stops after 20 passes — zero observers
 * - No MutationObserver anywhere except <title> (ultra-lightweight)
 * - colorProjects: 3 deferred passes only, no observers
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

  // ─── CSS — injected immediately, no DOM reads ─────────────────
  function injectCSS() {
    const css = `
      /* Cleanup */
      nav > div > div:last-child div[class*="flex-col"][class*="items-start"] { display:none!important; }
      nav > div > div:last-child > div:first-child > button { display:none!important; }
      button[hint="My Computer"] { display:none!important; }

      /* Branding */
      nav { background-color:${C.bgNav}!important; }
      ::-webkit-scrollbar { width:4px; height:4px; }
      ::-webkit-scrollbar-track { background:transparent; }
      ::-webkit-scrollbar-thumb { background:${C.accentDim}; border-radius:2px; }
      ::-webkit-scrollbar-thumb:hover { background:${C.accent}; }

      /* FAB */
      #yos-fab{position:fixed;right:14px;bottom:100px;z-index:9999;display:flex;flex-direction:column;gap:5px;pointer-events:none;}
      .yb{width:32px;height:32px;border-radius:50%;background:${C.bgNav};border:1px solid ${C.border};color:${C.text};font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;pointer-events:all;transition:all .15s;box-shadow:0 2px 8px rgba(0,0,0,.6);opacity:.65;user-select:none;font-family:system-ui,sans-serif;line-height:1;}
      .yb:hover{background:${C.accentDim};border-color:${C.accent};opacity:1;transform:scale(1.12);}
      .yb.wide{border-radius:8px;width:38px;font-size:9px;font-weight:700;}
      .yb-hidden{opacity:0!important;pointer-events:none!important;}

      /* Message toolbar */
      .yos-mw{position:relative;}
      .yos-tb{display:none;position:absolute;top:-34px;right:0;background:${C.bgNav};border:1px solid ${C.border};border-radius:8px;padding:3px 6px;gap:2px;align-items:center;z-index:1000;box-shadow:0 2px 12px rgba(0,0,0,.6);white-space:nowrap;}
      .yos-mw:hover .yos-tb{display:flex!important;}
      .ytb{background:transparent;border:none;color:${C.textDim};font-size:13px;cursor:pointer;padding:2px 5px;border-radius:4px;transition:all .1s;line-height:1.2;font-family:system-ui,sans-serif;}
      .ytb:hover{background:rgba(124,58,237,.15);color:${C.text};}
      .ytb.ok:hover{color:${C.ok};} .ytb.no:hover{color:${C.no};} .ytb.wn:hover{color:${C.warn};}
      .ysep{width:1px;height:14px;background:${C.border};margin:0 3px;display:inline-block;}
      .yos-col{max-height:80px;overflow:hidden;position:relative;}
      .yos-col::after{content:'';position:absolute;bottom:0;left:0;right:0;height:32px;background:linear-gradient(transparent,#111318);pointer-events:none;}

      /* Print */
      @media print {
        nav, #yos-fab, #yos-tip { display:none!important; }
        body { background:#fff!important; color:#000!important; }
      }
    `;
    const s = document.createElement('style');
    s.id = 'yos-styles';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  // ─── UTILS ───────────────────────────────────────────────────
  function throttle(fn, ms) {
    let t = null;
    return (...args) => { if (!t) { t = setTimeout(() => { t = null; fn(...args); }, ms); } };
  }

  // chatSC — NO getBoundingClientRect, uses scrollWidth heuristic
  function chatSC() {
    const all = document.querySelectorAll('.simplebar-content-wrapper');
    let best = null;
    // The chat scroll container is wider than the nav (>260px)
    all.forEach(el => {
      const r = el.offsetLeft;
      if (r >= 200) best = el;
    });
    return best || document.querySelector('main') || document.documentElement;
  }

  function getMessages() {
    try {
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
    } catch (e) { return []; }
  }

  function isUserMsg(el) {
    try { return !!el.querySelector('[class*="items-end"][class*="justify-end"]'); }
    catch (e) { return false; }
  }

  function getMDDiv(el) {
    try {
      return el.querySelector('[class*="max-w-none"]') ||
             el.querySelector('[class*="prose"]') ||
             el.querySelector('[class*="leading-"][class*="text-[var"]');
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

  // ─── BRANDING — runs deferred ─────────────────────────────────
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

  function colorProjects() {
    try {
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
    } catch (e) {}
  }

  // ─── FAB NAVIGATION ──────────────────────────────────────────
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

    // Scroll listener — passive, throttled, attached late
    setTimeout(() => {
      const sc = chatSC();
      if (sc) sc.addEventListener('scroll', throttle(() => {
        btnTop.classList.toggle('yb-hidden', sc.scrollTop <= 300);
      }, 300), { passive: true });
    }, 1000);
  }

  function navQ(dir) {
    try {
      const sc = chatSC();
      if (!sc) return;
      const msgs = getMessages().filter(isUserMsg);
      if (!msgs.length) return;
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
    } catch (e) {}
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
    } catch (e) {}
  }

  // ─── MESSAGE TOOLBAR — slow polling, self-stopping ───────────
  // setInterval at 4s, stops after 20 passes (80s total coverage)
  // Then re-arms once on scroll to catch new messages
  function initMsgToolbar() {
    let passes = 0;
    const MAX = 20;

    const run = () => {
      try {
        passes++;
        getMessages().forEach(msg => {
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
      } catch (e) {}
    };

    // Start slow polling — 4s interval, stops after MAX passes
    const timer = setInterval(() => {
      run();
      if (passes >= MAX) {
        clearInterval(timer);
        // Re-arm on scroll (one-time, throttled) to catch new messages after stop
        const sc = chatSC();
        if (sc) sc.addEventListener('scroll', throttle(run, 2000), { passive: true, once: false });
      }
    }, 4000);

    // First run at 3s after init
    setTimeout(run, 3000);
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
  }

  // ─── BOOT SEQUENCE ───────────────────────────────────────────
  // Phase 1: CSS only — immediate, no DOM reads
  injectCSS();

  // Phase 2: All interactive features — after window.load + 2500ms
  // This guarantees React has fully hydrated before we touch the DOM
  function launchFeatures() {
    try {
      if (CFG.yosTitle) patchTitle();
      if (CFG.yosLogo) injectLogo();
      if (CFG.yosQuickLinks) injectLinks();
      if (CFG.projectColors) colorProjects();
      if (CFG.fabNav) initFAB();
      if (CFG.msgToolbar) initMsgToolbar();
      if (CFG.selectToPrompt) initSelectToPrompt();
      if (CFG.keyboard) initKeyboard();
      console.log('[Y-OS] Manus client v1.5 loaded ✓');
    } catch (e) {
      console.warn('[Y-OS] Boot error:', e);
    }
  }

  // Phase 3: Retry branding injections at 6s and 12s (SPA route changes)
  function scheduleRetries() {
    [6000, 12000].forEach(d => setTimeout(() => {
      try {
        if (CFG.yosLogo) injectLogo();
        if (CFG.yosQuickLinks) injectLinks();
        if (CFG.projectColors) colorProjects();
      } catch (e) {}
    }, d));
  }

  // Entry point — wait for full page load + 2.5s
  if (document.readyState === 'complete') {
    setTimeout(() => { launchFeatures(); scheduleRetries(); }, 2500);
  } else {
    window.addEventListener('load', () => {
      setTimeout(() => { launchFeatures(); scheduleRetries(); }, 2500);
    });
  }

})();
