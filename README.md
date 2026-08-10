# tataKAI (Idle Tower Defense)

一个网页 + 桌面双端的放置塔防 / 英雄养成游戏，用 React、TypeScript、HTML5 Canvas 做的。英雄自动战斗打波次(1-1 到 1-10，含小 BOSS/大 BOSS)，边打边升级、扭蛋抽卡、强化装备、升星、升华。

## 下载 / 试玩

**网页直接玩(推荐，无需安装)：**

👉 https://idle-tower-defense-game.vercel.app

**下载 Windows 桌面版（推荐，完全离线）：**

去本仓库的 [Releases](https://github.com/michealchua/idle-tower-defense-game/releases) 页面，下载最新的 `.exe` 安装包，双击安装即可。

> 桌面版把游戏代码完整打包进安装包，不联网也能玩。每次有新代码 push 到 `main` 分支，GitHub Actions 都会自动打包一个新版本发布到 Releases；已安装的桌面版会在启动时自动检查、下载并在下次重启后装上新版本，**不需要手动重新下载安装包**。网页版则是给不想安装任何东西、只想直接玩一把的人用的，两者相互独立。

## Tech stack

- React + TypeScript
- HTML5 Canvas for rendering
- Zustand for state management
- Vite for dev/build tooling
- Electron (desktop shell bundling the built game, self-updating via electron-updater + GitHub Releases)

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL in a browser.

### Desktop shell (Electron)

```bash
npm run electron:dev    # opens a desktop window pointed at the local dev server
npm run electron:build  # packages a Windows installer into release/, bundling
                         # the built dist/ so the app runs fully offline
```

Releases are automated: every push to `main` triggers [`.github/workflows/release.yml`](.github/workflows/release.yml), which builds and publishes a new GitHub Release. Installed copies of the app check that feed on startup (via `electron-updater`) and update themselves - see [`electron/README.md`](electron/README.md) for the full mechanics.

## Project structure

- `src/engine/` — framework-agnostic game logic (systems, entities, core game loop). No React or rendering code lives here.
- `src/data/` — config-driven game data (stats, costs, unlock conditions, etc.), separated from logic so balance changes rarely require touching code.
- `src/render/` — Canvas rendering, reads engine state and draws it.
- `src/store/` — Zustand store bridging the engine simulation to React.
- `src/components/` — React UI.
- `src/locales/` — UI text, kept separate from code for localization.
- `electron/` — the desktop shell: a minimal Electron app (its own `package.json`)
  that bundles the built game and opens a window loading it locally, self-updating
  via `electron-updater` against GitHub Releases.

A `DebugPanel` component is included for development/testing (spawning enemies, unlocking skills, adjusting game speed, etc.) and is meant to stay in the build during active development.
