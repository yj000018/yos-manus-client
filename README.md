# Y-OS Manus Client

TamperMonkey userscript that transforms [manus.im](https://manus.im) into a Y-OS branded client.

## Features

- 🗑️ **Cleanup** — Removes Meta logo, Share sidebar button, Cloud computers button
- 🎨 **Branding** — Y-OS vectorial logo (violet), Y-OS color palette, custom title
- 🔗 **Quick Links** — Notion, Lovable, n8n, GitHub, Telegram, Tana, TamperMonkey
- 🌈 **Project Colors** — Each project group gets a distinct color in the sidebar
- ⚡ **Navigation FAB** — Back to top, scroll bottom, prev/next question, export MD, print
- 💬 **Message Toolbar** — ✅/❌/⚠️ quick reactions, copy as MD, collapse long messages
- ✂️ **Select → Prompt** — Select any text → "Use as prompt" tooltip
- ⌨️ **Keyboard Shortcuts** — Alt+T/B/↑/↓/E/P

## Install

**One-click install via TamperMonkey:**

1. Install [TamperMonkey](https://www.tampermonkey.net/) on Brave/Chrome
2. Click: [Install Y-OS Manus Client](https://raw.githubusercontent.com/yannick-jolliet/yos-manus-client/main/yos-manus-client.user.js)
3. TamperMonkey will prompt → click **Install**
4. Go to `https://manus.im/app` → check console for `[Y-OS] Manus client v1.2 loaded ✓`

> **Brave users**: Ensure Brave Shield → "Block scripts" is OFF for manus.im

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

## Config

All features can be toggled in the `CFG` object at the top of the script.

## Changelog

- **v1.2.0** — Fixed navigation Q (precise DOM-based scroll), fixed message toolbar (correct markdown div selector), vectorial violet Y-OS logo, project colors, updated quick links (Lovable, Telegram, Tana, TamperMonkey)
- **v1.1.0** — Fixed blocking bug (sessions inaccessible), fixed logo selector
- **v1.0.0** — Initial release
