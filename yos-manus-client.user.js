// ==UserScript==
// @name         Y-OS Manus Client
// @namespace    https://yos.ai
// @version      1.2.0
// @description  Y-OS custom client for manus.im — cleanup, branding, navigation, message toolbar
// @author       Yannick Jolliet / Y-OS
// @match        https://manus.im/*
// @grant        GM_addStyle
// @grant        GM_setClipboard
// @grant        GM_download
// @updateURL    https://raw.githubusercontent.com/yannick-jolliet/yos-manus-client/main/yos-manus-client.user.js
// @downloadURL  https://raw.githubusercontent.com/yannick-jolliet/yos-manus-client/main/yos-manus-client.user.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const CFG = {
    hideMetaLogo:        true,
    hideShareSidebar:    true,
    hideCloudComputers:  true,
    yosLogoEnabled:      true,
    yosColors:           true,
    yosTitle:            true,
    yosQuickLinks:       true,
    projectColors:       true,
    fabBackToTop:        true,
    fabScrollBottom:     true,
    fabNavQ:             true,
    exportMarkdown:      true,
    printView:           true,
    keyboardShortcuts:   true,
    msgToolbar:          true,
    selectToPrompt:      true,
    copyAsMarkdown:      true,
    collapseMessages:    true,
  };

  // ============================================================
  // Y-OS DESIGN TOKENS
  // ============================================================
  const YOS = {
    bgNav:       '#0d0f14',
    bgMain:      '#111318',
    accent:      '#7c3aed',   // violet
    accentDim:   '#4c1d95',
    accentHover: '#8b5cf6',
    textPrimary: '#e8eaf0',
    textSecond:  '#8b90a0',
    border:      '#1e2230',
    success:     '#22c55e',
    danger:      '#ef4444',
    warn:        '#f59e0b',

    // Project colors — cycling palette (10 colors)
    projectPalette: [
      '#7c3aed', // violet
      '#2563eb', // blue
      '#059669', // green
      '#d97706', // amber
      '#dc2626', // red
      '#0891b2', // cyan
      '#7c3aed', // violet (repeat)
      '#db2777', // pink
      '#65a30d', // lime
      '#9333ea', // purple
    ],

    quickLinks: [
      { label: '🧠 Notion',       url: 'https://notion.so' },
      { label: '🚀 Lovable',      url: 'https://lovable.dev' },
      { label: '🔄 n8n',          url: 'https://n8n.io' },
      { label: '🐙 GitHub',       url: 'https://github.com/yannick-jolliet' },
      { label: '✈️ Telegram',     url: 'https://web.telegram.org' },
      { label: '🌿 Tana',         url: 'https://tana.inc' },
      { label: '🐵 TamperMonkey', url: 'chrome-extension://dhdgffkkebhmkfjojejmpbldmpobfkfo/options.html#nav=dashboard' },
    ],
  };

  // ============================================================
  // UTILITIES
  // ============================================================
  function injectCSS(id, css) {
    const existing = document.getElementById(id);
    if (existing) { existing.textContent = css; return; }
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  function waitFor(fn, callback, timeout = 8000) {
    // fn = function that returns an element or null
    const el = fn();
    if (el) { callback(el); return; }
    const start = Date.now();
    const obs = new MutationObserver(() => {
      const found = fn();
      if (found) { obs.disconnect(); callback(found); }
      else if (Date.now() - start > timeout) obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // Chat scroll container = the simplebar-content-wrapper at x >= 280 (not sidebar)
  function getChatScrollContainer() {
    const all = document.querySelectorAll('.simplebar-content-wrapper');
    let best = null;
    all.forEach(sc => {
      const rect = sc.getBoundingClientRect();
      if (rect.left >= 280) best = sc;
    });
    return best || document.querySelector('main') || document.documentElement;
  }

  // Get the message list container
  // Structure: simplebar-content-wrapper > .simplebar-content > div.relative.flex.flex-col.h-full > div.mx-auto > div.w-full.pb-[16px] > div (outerMsg) > [messages]
  function getMessageListEl() {
    const sc = getChatScrollContainer();
    if (!sc) return null;
    const content = sc.querySelector('.simplebar-content');
    if (!content) return null;
    const mainDiv = content.firstElementChild;
    if (!mainDiv) return null;
    // children[1] = the mx-auto content div (not the sticky header)
    const mxAuto = mainDiv.children[1];
    if (!mxAuto) return null;
    const pbDiv = mxAuto.children[0]; // w-full pb-[16px]
    if (!pbDiv) return null;
    return pbDiv.firstElementChild; // the outerMsg with direct message children
  }

  // Get all message wrapper elements (direct children of outerMsg)
  function getAllMessages() {
    const outer = getMessageListEl();
    if (!outer) return [];
    return [...outer.children];
  }

  // Is a message a user message? User messages have items-end in their structure
  function isUserMessage(msgEl) {
    // User messages contain a div with class including "items-end" and "justify-end"
    return !!msgEl.querySelector('[class*="items-end"][class*="justify-end"]');
  }

  // Is a message a Manus response? Has the markdown content div
  function isManusMessage(msgEl) {
    return !!msgEl.querySelector('[class*="max-w-none"][class*="text-[16px]"]') ||
           !!msgEl.querySelector('[class*="leading-[1.5]"][class*="text-[var(--text-primary)]"]');
  }

  // Get the markdown content div of a Manus message
  function getMarkdownDiv(msgEl) {
    return msgEl.querySelector('[class*="max-w-none"][class*="text-[16px]"]') ||
           msgEl.querySelector('[class*="leading-[1.5]"]');
  }

  // Get user prompt elements for navigation
  function getUserPromptElements() {
    return getAllMessages().filter(isUserMessage);
  }

  // Get textarea input
  function getChatInput() {
    return document.querySelector('textarea');
  }

  function sendMessage(text) {
    const input = getChatInput();
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(input, text);
    else input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
    setTimeout(() => {
      const sendBtn = [...document.querySelectorAll('button')].find(b => {
        const svg = b.querySelector('svg');
        return svg && (b.getAttribute('aria-label') || '').toLowerCase().includes('send') ||
               b.closest('form');
      });
      if (sendBtn) sendBtn.click();
      else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    }, 100);
  }

  function prefillInput(text) {
    const input = getChatInput();
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(input, text);
    else input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }

  // ============================================================
  // MODULE 1 — CLEANUP
  // ============================================================
  function initCleanup() {
    injectCSS('yos-cleanup', `
      /* Meta logo — bottom section of nav (last child of navMain) */
      nav > div > div:last-child div[class*="flex-col"][class*="items-start"] {
        display: none !important;
      }
      /* Share Manus button — bottom section only */
      nav > div > div:last-child button,
      nav > div > div:last-child > div:first-child {
        display: none !important;
      }
      /* Cloud computers button */
      button[hint="My Computer"] {
        display: none !important;
      }
    `);
  }

  // ============================================================
  // MODULE 2 — BRANDING
  // ============================================================
  function initBranding() {
    if (CFG.yosColors) {
      injectCSS('yos-colors', `
        nav { background-color: ${YOS.bgNav} !important; }
        nav div[class*="rounded-[10px]"]:hover,
        nav div[class*="rounded-[8px]"]:hover {
          background-color: rgba(124, 58, 237, 0.1) !important;
        }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${YOS.accentDim}; border-radius: 2px; }
        ::-webkit-scrollbar-thumb:hover { background: ${YOS.accent}; }
      `);
    }

    if (CFG.yosLogoEnabled) injectLogoYOS();
    if (CFG.yosTitle) initTitle();
    if (CFG.yosQuickLinks) injectQuickLinks();
    if (CFG.projectColors) initProjectColors();
  }

  function injectLogoYOS() {
    // The Manus logo SVG is in nav > firstChild (navMain) > firstChild (header row) > first SVG
    waitFor(() => {
      const nav = document.querySelector('nav');
      if (!nav) return null;
      const navMain = nav.firstElementChild;
      if (!navMain) return null;
      const headerRow = navMain.firstElementChild;
      if (!headerRow) return null;
      const svg = headerRow.querySelector('svg');
      return svg ? headerRow : null;
    }, (headerRow) => {
      if (headerRow.querySelector('#yos-logo')) return;

      // Hide original Manus SVG + any "manus" text
      const manusSVG = headerRow.querySelector('svg');
      if (manusSVG) manusSVG.style.display = 'none';
      [...headerRow.querySelectorAll('span, div')].forEach(el => {
        if (el.children.length === 0 && el.textContent.trim().toLowerCase() === 'manus') {
          el.style.display = 'none';
        }
      });

      // Inject Y-OS SVG logo (vectoriel, violet)
      const logo = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      logo.id = 'yos-logo';
      logo.setAttribute('viewBox', '0 0 72 24');
      logo.setAttribute('width', '72');
      logo.setAttribute('height', '24');
      logo.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      logo.style.cssText = 'cursor:pointer;flex-shrink:0;';
      logo.title = 'Y-OS Cognitive Operating System';
      logo.innerHTML = `
        <defs>
          <linearGradient id="yos-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#a78bfa"/>
            <stop offset="100%" style="stop-color:#7c3aed"/>
          </linearGradient>
        </defs>
        <!-- Y -->
        <path d="M2 4 L9 13 L9 20 L12 20 L12 13 L19 4 L15.5 4 L10.5 11 L5.5 4 Z" fill="url(#yos-grad)"/>
        <!-- - -->
        <rect x="22" y="11" width="6" height="2.5" rx="1.25" fill="#a78bfa"/>
        <!-- O -->
        <path d="M32 4 C27 4 24 7.5 24 12 C24 16.5 27 20 32 20 C37 20 40 16.5 40 12 C40 7.5 37 4 32 4 Z M32 7 C35 7 37 9 37 12 C37 15 35 17 32 17 C29 17 27 15 27 12 C27 9 29 7 32 7 Z" fill="url(#yos-grad)"/>
        <!-- S -->
        <path d="M43 4 L43 7 L51 7 C52.5 7 53.5 7.8 53.5 9 C53.5 10.2 52.5 11 51 11 L46 11 C43.5 11 42 12.8 42 15 C42 17.2 43.5 20 47 20 L55 20 L55 17 L47 17 C45.5 17 45 16.2 45 15 C45 13.8 45.8 14 47 14 L51 14 C54 14 56.5 12 56.5 9 C56.5 6 54 4 51 4 Z" fill="url(#yos-grad)"/>
      `;

      manusSVG.parentElement.insertBefore(logo, manusSVG);
    });
  }

  function initTitle() {
    const update = () => {
      if (!document.title.startsWith('Y-OS')) {
        document.title = document.title.replace(/\bManus\b/g, 'Y-OS');
      }
    };
    update();
    const titleEl = document.querySelector('title');
    if (titleEl) new MutationObserver(update).observe(titleEl, { childList: true });
  }

  function injectQuickLinks() {
    waitFor(() => {
      const nav = document.querySelector('nav');
      if (!nav) return null;
      const navMain = nav.firstElementChild;
      if (!navMain || navMain.children.length < 2) return null;
      return navMain.children[1]; // nav menu section
    }, (navMenuSection) => {
      if (document.getElementById('yos-quick-links')) return;
      const section = document.createElement('div');
      section.id = 'yos-quick-links';
      section.style.cssText = 'padding:4px 8px 0;flex-shrink:0;';
      section.innerHTML = `
        <div style="padding:8px 4px 4px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${YOS.textSecond};">Y-OS Tools</div>
        ${YOS.quickLinks.map(link => `
          <a href="${link.url}" target="_blank" rel="noopener" style="display:flex;align-items:center;padding:5px 8px;border-radius:8px;font-size:12px;color:${YOS.textPrimary};text-decoration:none;gap:6px;transition:background 0.15s;"
            onmouseover="this.style.background='rgba(124,58,237,0.12)'"
            onmouseout="this.style.background='transparent'"
          >${link.label}</a>
        `).join('')}
        <div style="height:1px;background:${YOS.border};margin:6px 4px 0;"></div>
      `;
      navMenuSection.insertBefore(section, navMenuSection.firstChild);
    });
  }

  // ============================================================
  // MODULE 2b — PROJECT COLORS
  // ============================================================
  function initProjectColors() {
    // Projects are in nav > navMain > children[1] (navMenuSection)
    // Inside: div.flex-col.gap-px.pt-[3px] > items
    // Each project group header: div.group.flex.items-center.justify-between...
    // We color the left border / text of each project group
    const applyColors = debounce(() => {
      const nav = document.querySelector('nav');
      if (!nav) return;

      // Find all project group headers (they have a disclosure triangle and project name)
      // Pattern: div[class*="group"][class*="flex"][class*="items-center"][class*="justify-between"]
      // that are direct children of the flex-col gap-px container
      const projectContainers = [...nav.querySelectorAll('[class*="flex-col"][class*="gap-px"][class*="pt-[3px]"]')];

      projectContainers.forEach(container => {
        const items = [...container.children];
        items.forEach((item, idx) => {
          if (item.dataset.yosColored) return;
          item.dataset.yosColored = '1';

          const color = YOS.projectPalette[idx % YOS.projectPalette.length];

          // Add left border color indicator
          item.style.cssText += `border-left: 2px solid ${color}; padding-left: 6px; border-radius: 0 6px 6px 0; margin-bottom: 1px;`;

          // Color the project name text
          const nameEl = item.querySelector('[class*="flex-1"][class*="min-w-0"]') ||
                         item.querySelector('[class*="truncate"]') ||
                         item.firstElementChild?.firstElementChild;
          if (nameEl) {
            const textEl = nameEl.querySelector('span, div') || nameEl;
            if (textEl && textEl.children.length === 0) {
              textEl.style.color = color;
              textEl.style.fontWeight = '600';
            }
          }
        });
      });

      // Also color individual task items in sidebar with subtle left accent
      const taskItems = [...nav.querySelectorAll('[role="button"][class*="rounded"]')].filter(
        el => !el.dataset.yosColored && el.textContent.trim().length > 3 && el.textContent.trim().length < 200
      );
      // Don't color task items — too risky for session navigation
    }, 500);

    applyColors();
    const obs = new MutationObserver(applyColors);
    const nav = document.querySelector('nav');
    if (nav) obs.observe(nav, { childList: true, subtree: true });
  }

  // ============================================================
  // MODULE 3 — NAVIGATION FAB
  // ============================================================
  function initNavControls() {
    injectCSS('yos-fab', `
      #yos-fab {
        position: fixed;
        right: 14px;
        bottom: 100px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 5px;
        pointer-events: none;
      }
      .yos-fab-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: ${YOS.bgNav};
        border: 1px solid ${YOS.border};
        color: ${YOS.textPrimary};
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: all;
        transition: all 0.15s;
        box-shadow: 0 2px 8px rgba(0,0,0,0.6);
        opacity: 0.6;
        user-select: none;
        font-family: system-ui, sans-serif;
        line-height: 1;
      }
      .yos-fab-btn:hover {
        background: ${YOS.accentDim};
        border-color: ${YOS.accent};
        opacity: 1;
        transform: scale(1.12);
      }
      .yos-fab-btn.wide {
        border-radius: 8px;
        width: 38px;
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .yos-fab-btn[data-hidden="true"] {
        opacity: 0 !important;
        pointer-events: none !important;
        transform: scale(0.7) !important;
      }
      @media print {
        nav, #yos-fab, #yos-select-tip { display: none !important; }
        body { background: white !important; color: black !important; }
      }
    `);

    const fab = document.createElement('div');
    fab.id = 'yos-fab';

    if (CFG.fabBackToTop) {
      const btn = makeFabBtn('↑', 'Back to top  (Alt+T)');
      btn.dataset.hidden = 'true';
      btn.addEventListener('click', () => scrollChatTo(0));
      fab.appendChild(btn);
      // Show/hide based on scroll position
      setTimeout(() => {
        const sc = getChatScrollContainer();
        const onScroll = () => { btn.dataset.hidden = (sc.scrollTop > 300) ? 'false' : 'true'; };
        if (sc) sc.addEventListener('scroll', onScroll, { passive: true });
      }, 2000);
    }

    if (CFG.fabScrollBottom) {
      const btn = makeFabBtn('↓', 'Scroll to bottom  (Alt+B)');
      btn.addEventListener('click', () => {
        const sc = getChatScrollContainer();
        if (sc) sc.scrollTop = sc.scrollHeight;
      });
      fab.appendChild(btn);
    }

    if (CFG.fabNavQ) {
      const btnUp = makeFabBtn('⬆', 'Previous question  (Alt+↑)');
      btnUp.style.fontSize = '10px';
      btnUp.addEventListener('click', () => navigateQuestion(-1));
      fab.appendChild(btnUp);

      const btnDn = makeFabBtn('⬇', 'Next question  (Alt+↓)');
      btnDn.style.fontSize = '10px';
      btnDn.addEventListener('click', () => navigateQuestion(1));
      fab.appendChild(btnDn);
    }

    if (CFG.exportMarkdown) {
      const btn = makeFabBtn('↓MD', 'Export as Markdown  (Alt+E)');
      btn.classList.add('wide');
      btn.addEventListener('click', exportMarkdown);
      fab.appendChild(btn);
    }

    if (CFG.printView) {
      const btn = makeFabBtn('🖨', 'Print  (Alt+P)');
      btn.addEventListener('click', () => window.print());
      fab.appendChild(btn);
    }

    document.body.appendChild(fab);
  }

  function makeFabBtn(text, title) {
    const btn = document.createElement('button');
    btn.className = 'yos-fab-btn';
    btn.textContent = text;
    btn.title = title;
    return btn;
  }

  function scrollChatTo(top) {
    const sc = getChatScrollContainer();
    if (sc && sc !== document.documentElement) {
      sc.scrollTo({ top, behavior: 'smooth' });
    } else {
      window.scrollTo({ top, behavior: 'smooth' });
    }
  }

  function navigateQuestion(dir) {
    // FIX v1.2: use the actual message elements, not text-based search
    // Scroll the chat container to the target user message
    const sc = getChatScrollContainer();
    if (!sc) return;

    const userMsgs = getUserPromptElements();
    if (!userMsgs.length) return;

    const scRect = sc.getBoundingClientRect();
    const currentScrollTop = sc.scrollTop;

    // Find which user message to scroll to
    let target = null;

    if (dir === -1) {
      // Previous: find last user message whose top is above current viewport
      for (let i = userMsgs.length - 1; i >= 0; i--) {
        const msgRect = userMsgs[i].getBoundingClientRect();
        const msgTopRelative = msgRect.top - scRect.top + currentScrollTop;
        if (msgTopRelative < currentScrollTop - 40) {
          target = userMsgs[i];
          break;
        }
      }
      // Fallback: go to first
      if (!target) target = userMsgs[0];
    } else {
      // Next: find first user message whose top is below current viewport top
      for (let i = 0; i < userMsgs.length; i++) {
        const msgRect = userMsgs[i].getBoundingClientRect();
        const msgTopRelative = msgRect.top - scRect.top + currentScrollTop;
        if (msgTopRelative > currentScrollTop + 60) {
          target = userMsgs[i];
          break;
        }
      }
      // Fallback: go to last
      if (!target) target = userMsgs[userMsgs.length - 1];
    }

    if (!target) return;

    // Scroll the chat container to the target message
    const targetRect = target.getBoundingClientRect();
    const targetTopRelative = targetRect.top - scRect.top + currentScrollTop;
    sc.scrollTo({ top: targetTopRelative - 20, behavior: 'smooth' });
  }

  function exportMarkdown() {
    const title = document.title.replace(/ - (Manus|Y-OS).*$/, '').trim();
    const date = new Date().toISOString().split('T')[0];
    let md = `# ${title}\n\n*Exported from Y-OS Manus Client — ${date}*\n\n---\n\n`;

    const msgs = getAllMessages();
    if (!msgs.length) {
      // Fallback: grab all text from chat area
      const sc = getChatScrollContainer();
      md += sc ? (sc.innerText || sc.textContent) : 'No content found.';
    } else {
      msgs.forEach(msg => {
        if (isUserMessage(msg)) {
          // User message: get the text content of the bubble
          const bubble = msg.querySelector('[class*="rounded"][class*="bg-[var(--fill"]') ||
                         msg.querySelector('[class*="items-end"]');
          const txt = (bubble || msg).textContent.trim();
          if (txt) md += `**You:** ${txt}\n\n`;
        } else if (isManusMessage(msg)) {
          const mdDiv = getMarkdownDiv(msg);
          if (mdDiv) {
            md += `**Manus:**\n\n`;
            // Extract structured content
            const els = [...mdDiv.querySelectorAll('h1,h2,h3,h4,p,li,pre,blockquote,div[class*="whitespace-pre"]')];
            if (els.length) {
              els.forEach(el => {
                const t = el.textContent.trim();
                if (!t) return;
                const tag = el.tagName.toLowerCase();
                if (tag === 'h1') md += `# ${t}\n\n`;
                else if (tag === 'h2') md += `## ${t}\n\n`;
                else if (tag === 'h3') md += `### ${t}\n\n`;
                else if (tag === 'h4') md += `#### ${t}\n\n`;
                else if (tag === 'li') md += `- ${t}\n`;
                else if (tag === 'pre') md += `\`\`\`\n${t}\n\`\`\`\n\n`;
                else if (tag === 'blockquote') md += `> ${t}\n\n`;
                else md += `${t}\n\n`;
              });
            } else {
              md += mdDiv.textContent.trim() + '\n\n';
            }
            md += `---\n\n`;
          }
        }
      });
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yos-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase().substring(0, 40)}-${date}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ============================================================
  // MODULE 4 — MESSAGE TOOLBAR
  // ============================================================
  function initMessageToolbar() {
    if (!CFG.msgToolbar) return;

    injectCSS('yos-toolbar', `
      .yos-mw { position: relative; }
      .yos-tb {
        display: none;
        position: absolute;
        top: -34px;
        right: 0;
        background: ${YOS.bgNav};
        border: 1px solid ${YOS.border};
        border-radius: 8px;
        padding: 3px 6px;
        gap: 2px;
        align-items: center;
        z-index: 1000;
        box-shadow: 0 2px 12px rgba(0,0,0,0.6);
        white-space: nowrap;
        pointer-events: all;
      }
      .yos-mw:hover .yos-tb { display: flex !important; }
      .yos-tb-b {
        background: transparent;
        border: none;
        color: ${YOS.textSecond};
        font-size: 13px;
        cursor: pointer;
        padding: 2px 5px;
        border-radius: 4px;
        transition: all 0.1s;
        line-height: 1.2;
        font-family: system-ui, sans-serif;
      }
      .yos-tb-b:hover { background: rgba(124,58,237,0.15); color: ${YOS.textPrimary}; }
      .yos-tb-b.ok:hover  { color: ${YOS.success}; }
      .yos-tb-b.no:hover  { color: ${YOS.danger}; }
      .yos-tb-b.meh:hover { color: ${YOS.warn}; }
      .yos-sep { width:1px; height:14px; background:${YOS.border}; margin:0 3px; display:inline-block; }
      .yos-collapsed { max-height: 80px; overflow: hidden; position: relative; }
      .yos-collapsed::after {
        content:''; position:absolute; bottom:0; left:0; right:0; height:32px;
        background: linear-gradient(transparent, #111318); pointer-events:none;
      }
    `);

    const obs = new MutationObserver(debounce(injectToolbars, 500));
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(injectToolbars, 2500);
  }

  function injectToolbars() {
    if (!CFG.msgToolbar) return;
    const msgs = getAllMessages();

    msgs.forEach(msg => {
      if (!isManusMessage(msg)) return;
      const mdDiv = getMarkdownDiv(msg);
      if (!mdDiv) return;
      if (mdDiv.dataset.yosTb) return;
      mdDiv.dataset.yosTb = '1';

      // Wrap the markdown div
      mdDiv.classList.add('yos-mw');

      const tb = document.createElement('div');
      tb.className = 'yos-tb';

      // ✅ Validate
      tb.appendChild(mkBtn('✅', 'ok', 'OK — continue', () => sendMessage('✅ OK, continue.')));
      // ❌ Invalidate
      tb.appendChild(mkBtn('❌', 'no', 'Incorrect — fix this', () => prefillInput('❌ Non, corrige ce point : ')));
      // ⚠️ Nuance
      tb.appendChild(mkBtn('⚠️', 'meh', 'Partially correct', () => prefillInput('⚠️ Partiellement correct, précise : ')));

      tb.appendChild(mkSep());

      // 📋 Copy as Markdown
      if (CFG.copyAsMarkdown) {
        const cp = mkBtn('📋', '', 'Copy as Markdown', () => {
          const text = mdDiv.innerText || mdDiv.textContent;
          try { GM_setClipboard(text, 'text'); }
          catch(e) { navigator.clipboard.writeText(text).catch(() => {}); }
          cp.textContent = '✓';
          setTimeout(() => { cp.textContent = '📋'; }, 1500);
        });
        tb.appendChild(cp);
      }

      // ⤢ Collapse (only for long messages)
      if (CFG.collapseMessages && (mdDiv.textContent || '').trim().length > 600) {
        let collapsed = false;
        const cl = mkBtn('⤢', '', 'Collapse', () => {
          collapsed = !collapsed;
          mdDiv.classList.toggle('yos-collapsed', collapsed);
          cl.textContent = collapsed ? '⤡' : '⤢';
          cl.title = collapsed ? 'Expand' : 'Collapse';
        });
        tb.appendChild(cl);
      }

      mdDiv.appendChild(tb);
    });
  }

  function mkBtn(icon, cls, title, onClick) {
    const b = document.createElement('button');
    b.className = `yos-tb-b ${cls}`;
    b.textContent = icon;
    b.title = title;
    b.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); onClick(); });
    return b;
  }

  function mkSep() {
    const s = document.createElement('span');
    s.className = 'yos-sep';
    return s;
  }

  // ============================================================
  // MODULE 4b — SELECT TO PROMPT
  // ============================================================
  function initSelectToPrompt() {
    if (!CFG.selectToPrompt) return;

    const tip = document.createElement('div');
    tip.id = 'yos-select-tip';
    tip.style.cssText = `
      position: fixed; z-index: 99999; display: none;
      background: ${YOS.bgNav}; border: 1px solid ${YOS.accent};
      color: ${YOS.textPrimary}; font-size: 12px; padding: 5px 12px;
      border-radius: 6px; cursor: pointer; user-select: none;
      box-shadow: 0 2px 14px rgba(124,58,237,0.4);
      font-family: system-ui, sans-serif;
      transition: opacity 0.1s;
    `;
    tip.textContent = '→ Use as prompt';
    document.body.appendChild(tip);

    let selText = '';

    document.addEventListener('mouseup', e => {
      if (e.target.closest('nav') || e.target.closest('textarea') || e.target.id === 'yos-select-tip') return;
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text && text.length > 8) {
        selText = text;
        const range = sel.getRangeAt(0).getBoundingClientRect();
        tip.style.left = Math.min(range.left, window.innerWidth - 170) + 'px';
        tip.style.top = (range.bottom + window.scrollY + 6) + 'px';
        tip.style.display = 'block';
      } else {
        tip.style.display = 'none';
        selText = '';
      }
    });

    tip.addEventListener('click', () => {
      if (selText) {
        prefillInput(`> "${selText}"\n\n`);
        tip.style.display = 'none';
        window.getSelection()?.removeAllRanges();
      }
    });

    document.addEventListener('mousedown', e => {
      if (e.target !== tip) tip.style.display = 'none';
    });
  }

  // ============================================================
  // MODULE 5 — KEYBOARD SHORTCUTS
  // ============================================================
  function initKeyboard() {
    if (!CFG.keyboardShortcuts) return;
    document.addEventListener('keydown', e => {
      if (!e.altKey) return;
      if (e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') return;
      switch (e.key) {
        case 't': case 'T': e.preventDefault(); scrollChatTo(0); break;
        case 'b': case 'B': e.preventDefault(); { const sc = getChatScrollContainer(); if (sc) sc.scrollTop = sc.scrollHeight; } break;
        case 'ArrowUp': e.preventDefault(); navigateQuestion(-1); break;
        case 'ArrowDown': e.preventDefault(); navigateQuestion(1); break;
        case 'e': case 'E': e.preventDefault(); exportMarkdown(); break;
        case 'p': case 'P': e.preventDefault(); window.print(); break;
      }
    });
  }

  // ============================================================
  // ROUTE OBSERVER (SPA Next.js)
  // ============================================================
  function initRouteObserver() {
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(() => {
          initCleanup();
          if (CFG.yosTitle) initTitle();
          if (CFG.yosLogoEnabled) injectLogoYOS();
          if (CFG.yosQuickLinks) injectQuickLinks();
          if (CFG.projectColors) initProjectColors();
          // Re-run toolbar injection after route change
          setTimeout(injectToolbars, 1500);
        }, 500);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ============================================================
  // BOOT
  // ============================================================
  function boot() {
    initCleanup();
    initBranding();
    initNavControls();
    initKeyboard();
    initMessageToolbar();
    initSelectToPrompt();
    initRouteObserver();
    console.log('[Y-OS] Manus client v1.2 loaded ✓');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
