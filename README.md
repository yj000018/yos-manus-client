# Y-OS Manus Client

TamperMonkey userscript that transforms [manus.im](https://manus.im) into a Y-OS branded client.

## Features

- 🗑️ **Cleanup** — Removes Meta logo, Share sidebar button, Cloud computers button
- 🎨 **Branding** — Y-OS vectorial logo (violet), Y-OS color palette, custom title
- 🔗 **Quick Links** — Notion, Lovable, n8n, GitHub, Telegram, Tana, TamperMonkey
- 🌈 **Project Colors** — Each project group gets a distinct color in the sidebar
- 📁 **Project Navigator** — `Alt+F` → drawer with all projects/sessions, instant search
- ⚡ **Navigation FAB** — Back to top, scroll bottom, prev/next question, export MD, print
- 💬 **Message Toolbar** — ✅/❌/⚠️ quick reactions, copy as MD, collapse long messages
- ✂️ **Select → Prompt** — Select any text → "Use as prompt" tooltip
- ⌨️ **Keyboard Shortcuts** — Alt+T/B/↑/↓/E/P/F

## Install

**One-click install via TamperMonkey:**

1. Install [TamperMonkey](https://www.tampermonkey.net/) on Brave/Chrome
2. Click: [Install Y-OS Manus Client](https://raw.githubusercontent.com/yj000018/yos-manus-client/main/yos-manus-client.user.js)
3. TamperMonkey will prompt → click **Install**
4. Go to `https://manus.im/app` → check console for `[Y-OS] Y-OS Manus client v1.9 loaded ✓`

> **Brave users**: Ensure Brave Shield → "Block scripts" is OFF for manus.im

> **Important**: If you have a previous version installed, **uninstall it first** from TM Dashboard before reinstalling.

## Auto-update

The script includes `@updateURL` and `@downloadURL` headers pointing to this repo.
TamperMonkey checks for updates automatically (configurable in TM settings).

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Alt+T` | Back to top |
| `Alt+B` | Scroll to bottom |
| `Alt+↑` | Previous question |
| `Alt+↓` | Next question |
| `Alt+E` | Export as Markdown |
| `Alt+P` | Print view |
| `Alt+F` | Project Navigator |

## Config

All features can be toggled in the `CFG` object at the top of the script.

## Changelog

- **v1.9.0** — Fixed @run-at to document-start, added @grant unsafeWindow, multi-match for query strings
- **v1.8.0** — Project Navigator (fetch interception + DOM fallback + localStorage cache), session renamer script
- **v1.7.0** — Content-based CSS selectors, robust logo injection, debug logging
- **v1.6.0** — Fixed 3 infinite loops (patchTitle, injectLinks, initMsgToolbar WeakSet)
- **v1.5.0** — Ultra-deferred boot (window.load + 2500ms), eliminated getBoundingClientRect at boot
- **v1.4.0** — IntersectionObserver for toolbar, eliminated setInterval+reflow pattern
- **v1.3.0** — Replaced MutationObserver with polling to fix freeze
- **v1.2.0** — Fixed navigation Q, message toolbar, vectorial violet Y-OS logo, project colors
- **v1.1.0** — Fixed blocking bug (sessions inaccessible), fixed logo selector
- **v1.0.0** — Initial release
