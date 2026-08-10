# Electron packaging guide (V1.0)

This folder is the Electron **shell** for tataKAI - a thin native wrapper that
opens a `BrowserWindow` pointed at the actual game (the Canvas/TypeScript
engine under `src/combat/`, served from the project root's `index.html`).
The shell itself has almost no code: `main.cjs` creates the window,
`gameUrl.cjs` decides which URL it loads.

## How the pieces fit together

```
project root/
  index.html          <- the actual game (Canvas engine, src/combat/main.ts)
  package.json         <- "build" block = electron-builder config (this file's subject)
  build/
    icon.png            <- 256x256 source icon; electron-builder derives the
                            Windows .ico from this automatically
  electron/
    main.cjs             <- creates the BrowserWindow, sets its size/menu bar
    gameUrl.cjs           <- decides which URL the window loads
    package.json           <- the *packaged app's* manifest (name/main only -
                              this is what "directories.app" below points at)
    README.md               <- you are here
  release/                <- electron-builder's output (.exe/installer) - gitignored
```

Two different `package.json` files matter here, and it's easy to mix them up:

- **Root `package.json`** - has the `"build"` key electron-builder reads for
  *packaging* config (appId, icon, nsis options, output directory). This is
  the file this guide is about.
- **`electron/package.json`** - the manifest of the *packaged app itself*
  (its `main` field points at `main.cjs`). electron-builder only looks at
  this one for the app's own name/entry point, because `directories.app` in
  the root config is set to `"electron"`.

## Why the packaged app loads a URL instead of bundling `dist/`

`gameUrl.cjs` is deliberately simple:

```js
const DEPLOYED_GAME_URL = 'https://idle-tower-defense-game.vercel.app';
module.exports = { gameUrl: process.argv[2] || DEPLOYED_GAME_URL };
```

The packaged `.exe` always opens `DEPLOYED_GAME_URL` (a real deployed copy of
`index.html`), not a local file. This is an intentional, existing design
choice, not an oversight: it means every time you `git push` and the site
redeploys, every already-installed copy of the desktop app picks up the new
version the next time someone opens it - no reinstalling, no auto-updater
needed. The tradeoff is the packaged app needs internet access to actually
load the game (it's a native *window*, not an offline bundle).

`npm run electron:dev` instead passes the local Vite dev server's URL as a
CLI arg (`electron electron/main.cjs http://localhost:4728`), so `gameUrl.cjs`
uses that instead of the deployed URL - see the `argv[2] ||` fallback above.

If you ever want a fully offline-capable build instead, that's a bigger
change (bundle `dist/` into the packaged app via `extraResources`, and have
`main.cjs` do `win.loadFile()` against it instead of `loadURL()`) - out of
scope for this guide since it changes the update model described above.

## The electron-builder config (root `package.json`'s `"build"` key)

```json
"build": {
  "appId": "com.michealchua.tatakai",
  "productName": "tataKAI",
  "directories": {
    "app": "electron",
    "output": "release",
    "buildResources": "build"
  },
  "icon": "build/icon.png",
  "win": {
    "target": "nsis",
    "icon": "build/icon.png"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "tataKAI"
  }
}
```

Field by field:

- **`appId`** - reverse-DNS style unique identifier Windows uses to tell this
  app apart from every other installed app (registry keys, uninstall entry).
  Change this if you ever fork the project into a genuinely separate product.
- **`productName`** - the human-readable name shown in the installer, Start
  Menu, and taskbar.
- **`directories.app: "electron"`** - "the app to package lives in
  `electron/`" - this is what makes `electron/package.json` + `main.cjs` the
  packaged app's actual contents, and is *why* the root `dist/` folder is
  never bundled (see the section above).
- **`directories.output: "release"`** - where the finished installer/`.exe`
  lands after a build.
- **`directories.buildResources: "build"`** - where electron-builder looks
  for icons (and, if you add them later, background images/license files for
  the installer UI). Defaults to `build/` already, listed explicitly here so
  it's not a hidden convention.
- **`icon` / `win.icon`** - source icon electron-builder converts into the
  Windows `.ico` embedded in the `.exe` and installer. A single 256x256+ PNG
  is enough - electron-builder generates every size the `.ico` format needs.
  `build/icon.png` was generated for this project (see `public/icon.svg` for
  the same mark as a web favicon).
- **`win.target: "nsis"`** - produces a standard Windows installer (not a
  portable `.exe` or an MSI) - the most common choice for a desktop app like
  this.
- **`nsis.*`** - installer behavior:
  - `oneClick: false` - shows the normal "choose install location, click
    Next" wizard instead of a silent one-click install.
  - `allowToChangeInstallationDirectory: true` - lets the installing user
    pick a different folder than the default.
  - `createDesktopShortcut` / `createStartMenuShortcut` - self-explanatory;
    both on by default here.
  - `shortcutName` - what the created shortcuts are labeled.

### Window size and the hidden menu bar

These are **not** electron-builder/`package.json` concerns - they're
`BrowserWindow` constructor options, set in `electron/main.cjs`:

```js
new BrowserWindow({
  width: 1024,
  height: 900,
  minWidth: 1000,
  minHeight: 700,
  title: 'tataKAI',
  autoHideMenuBar: true, // hides the File/Edit/... menu bar
});
```

`width`/`height` are sized to comfortably fit `index.html`'s fixed 960px-wide
layout (canvas + HUD + build panel + inventory panel stacked underneath) with
some breathing room; `minWidth`/`minHeight` stop the window from being
resized small enough to clip that layout. If you change the game's canvas
size or add more UI below it, revisit these numbers together with
`index.html`'s CSS.

## Building the Windows installer

One command, from the project root:

```bash
npm run build:win
```

This runs `npm run build` (type-checks with `tsc -b`, then produces a
production `dist/` via `vite build` - a sanity check that the web app itself
is sound; the packaged app doesn't consume `dist/` directly, per the
URL-loading design above) and then `electron-builder --win`, which produces
the installer under `release/`, e.g. `release/tataKAI Setup 0.0.1.exe`.

Run it, then hand that one `.exe` to anyone with Windows - installing it adds
Desktop/Start Menu shortcuts (per the `nsis` config above) that launch
`tataKAI`, which opens the deployed game URL in its own window, full desktop
chrome and browser UI hidden.

### Other useful commands

- `npm run electron:dev` - runs the Electron shell against your local Vite
  dev server (`npm run dev` in another terminal first) - the fast loop for
  iterating on `main.cjs`/`gameUrl.cjs` themselves without a full package
  step.
- `npm run electron:build` - same as `build:win` but uses electron-builder's
  own default target for whatever OS you're running it on, instead of
  forcing `--win`. On a non-Windows machine this produces that platform's own
  package format instead (and NSIS/Windows builds generally need to run on
  Windows, or Wine on Linux/macOS, to produce a valid `.exe`).

### Prerequisites

- Node.js + the project's `devDependencies` installed (`npm install`) -
  `electron` and `electron-builder` are both already listed there.
- Building the actual Windows `.exe`/NSIS installer needs to run on Windows
  (or Linux/macOS with Wine installed) - this is an `electron-builder`/NSIS
  requirement, not specific to this project.
