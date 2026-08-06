# tataKAI (Idle Tower Defense)

一个网页 + 桌面双端的放置塔防 / 英雄养成游戏，用 React、TypeScript、HTML5 Canvas 做的。英雄自动战斗打波次(1-1 到 1-10，含小 BOSS/大 BOSS)，边打边升级、扭蛋抽卡、强化装备、升星、升华。

## 下载 / 试玩

**网页直接玩(推荐，无需安装)：**

👉 https://idle-tower-defense-game.vercel.app

**下载 Windows 桌面版：**

去本仓库的 [Releases](https://github.com/michealchua/idle-tower-defense-game/releases) 页面，下载最新的 `.exe` 安装包，双击安装即可。

> 桌面版本质上是打开一个窗口去加载上面那个网页版地址，所以**不需要手动检查更新**——只要网页版部署了新版本，重新打开桌面程序看到的就自动是最新的，不用重新下载安装包。只有 `electron/` 里"壳"本身的代码改了才需要重新打包发新安装包。

## Tech stack

- React + TypeScript
- HTML5 Canvas for rendering
- Zustand for state management
- Vite for dev/build tooling
- Electron (desktop shell that loads the deployed web build)

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL in a browser.

### Desktop shell (Electron)

```bash
npm run electron:dev    # opens a desktop window pointed at the local dev server
npm run electron:build  # packages a Windows installer into release/, pointed at
                         # the deployed URL in electron/gameUrl.cjs
```

## Project structure

- `src/engine/` — framework-agnostic game logic (systems, entities, core game loop). No React or rendering code lives here.
- `src/data/` — config-driven game data (stats, costs, unlock conditions, etc.), separated from logic so balance changes rarely require touching code.
- `src/render/` — Canvas rendering, reads engine state and draws it.
- `src/store/` — Zustand store bridging the engine simulation to React.
- `src/components/` — React UI.
- `src/locales/` — UI text, kept separate from code for localization.
- `electron/` — the desktop shell: a minimal Electron app (its own `package.json`,
  no game dependencies) that just opens a window loading the deployed game URL.

A `DebugPanel` component is included for development/testing (spawning enemies, unlocking skills, adjusting game speed, etc.) and is meant to stay in the build during active development.
