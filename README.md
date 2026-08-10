# tataKAI

一个网页 + 桌面双端的 Pixel 风格英雄养成挂机 RPG，用 React、TypeScript、HTML5 Canvas 做的。最多 9 名英雄同屏自动战斗，一路推 Wave 打小 BOSS/大 BOSS，边打边培养——英雄升级、分支进化、职业(8 种)+元素(6 种)克制、装备强化(含 2/4 件套)、宠物、羁绊、扭蛋抽卡(含保底)、城堡 Buff、天赋树、飞升，还有每张地图专属的背景/音乐/敌人池/剧情，以及会指着真实按钮走一遍的新手引导。

## 网页版 / 桌面版怎么选

两边跑的是同一份代码(`main` 分支每次更新，两边都会同步)，区别只是**存档各自独立**，互不共享：

- **网页版**(`https://idle-tower-defense-game.vercel.app`)——存档存在浏览器的 localStorage 里，换个浏览器/清缓存/清网站数据都会丢。适合**体验、试玩、给别人快速看一眼**，不适合当正式存档。
- **桌面版**(Windows 安装包)——存档存在本机 Electron 应用自己的存储里，跟网页版完全隔离，不联网也能玩，正式建议用这个来长期玩。

## 下载 / 试玩

**网页直接玩(无需安装，仅用于体验)：**

👉 https://idle-tower-defense-game.vercel.app

**下载 Windows 桌面版（正式游玩推荐，完全离线）：**

去本仓库的 [Releases](https://github.com/michealchua/idle-tower-defense-game/releases) 页面，下载最新的 `.exe` 安装包，双击安装即可。

> 桌面版把游戏代码完整打包进安装包，不联网也能玩。每次有新代码 push 到 `main` 分支，GitHub Actions 都会自动打包一个新版本发布到 Releases；已安装的桌面版会在启动时自动检查、下载并在下次重启后装上新版本，**不需要手动重新下载安装包**——只要保证每次改动都推送到了 GitHub，正式版就会自动追上最新代码。网页版同理，Vercel 会在每次 push 到 `main` 后自动重新部署。

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
