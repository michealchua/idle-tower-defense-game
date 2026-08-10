# Electron packaging guide (V1.0)

This folder is the Electron **shell** for tataKAI - a thin native wrapper that
opens a `BrowserWindow` pointed at the actual game, bundled as static files
(the Vite production build of the project root's `index.html` + `src/`).
The shell itself has almost no code: `main.cjs` creates the window and loads
either the bundled build or (in dev) a live dev-server URL, and wires up
`electron-updater` to self-update from GitHub Releases.

## How the pieces fit together

```
project root/
  index.html          <- the actual game (React app, src/main.tsx)
  package.json         <- "build" block = electron-builder config (this file's subject)
  dist/                 <- `npm run build`'s output; bundled into the packaged
                            app via `extraResources` (see below) - not committed
  build/
    icon.png            <- 256x256 source icon; electron-builder derives the
                            Windows .ico from this automatically
  electron/
    main.cjs             <- creates the BrowserWindow, loads dist/ (or a dev
                              URL), triggers electron-updater on startup
    gameUrl.cjs           <- resolves the dev-server URL, if any, from argv
    package.json           <- the *packaged app's* manifest (name/main/version
                              + electron-updater dependency - this is what
                              "directories.app" below points at)
    README.md               <- you are here
  .github/workflows/
    release.yml            <- builds + publishes a GitHub Release on every
                               push to main (what actually ships updates)
  release/                <- electron-builder's local output (.exe/installer) - gitignored
```

Two different `package.json` files matter here, and it's easy to mix them up:

- **Root `package.json`** - has the `"build"` key electron-builder reads for
  *packaging* config (appId, icon, nsis options, output directory,
  extraResources, publish target). This is the file this guide is about.
- **`electron/package.json`** - the manifest of the *packaged app itself*
  (its `main` field points at `main.cjs`, its `version` is what
  `app.getVersion()` and electron-updater compare against). electron-builder
  only looks at this one for the app's own name/entry point/version/runtime
  dependencies, because `directories.app` in the root config is set to
  `"electron"`.

## Fully offline, self-updating via GitHub Releases

The packaged app bundles the actual game and never needs the network to run.
Two pieces make that work:

1. **`extraResources`** in root `package.json`'s `build` config copies the
   project root's `dist/` (the `vite build` output) into
   `resources/dist/` inside the packaged app. `main.cjs`'s
   `resolveIndexPath()` does `win.loadFile(path.join(process.resourcesPath,
   'dist', 'index.html'))` when `app.isPackaged` is true - a local file load,
   no network round trip.
2. **`electron-updater`** (a runtime dependency of `electron/package.json`,
   since that's what's bundled into the app) checks the `publish` feed
   (GitHub Releases on this repo, per the `publish` block in root
   `package.json`) on every startup via
   `autoUpdater.checkForUpdatesAndNotify()` in `main.cjs`, downloads any newer
   release in the background, and installs it the next time the app restarts.

`npm run electron:dev` still passes the local Vite dev server's URL as a CLI
arg (`electron electron/main.cjs http://localhost:4728`), which
`gameUrl.cjs` picks up via `devUrl` - `main.cjs` uses `loadURL()` for that
case instead, and skips the updater entirely (`app.isPackaged` is false).

New releases ship automatically: `.github/workflows/release.yml` runs on
every push to `main`, sets the version to `1.0.<run number>` (a simple
monotonic scheme so electron-updater always sees a newer version than the
last release, without needing to commit version bumps back to the repo),
builds, and runs `electron-builder --win --publish always` to upload the
installer + update metadata (`latest.yml`) as a new GitHub Release. That's
the actual "push to GitHub -> installed app updates itself" pipeline - no
manual packaging/upload step needed day to day.

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
  "extraResources": [
    { "from": "dist", "to": "dist" }
  ],
  "publish": {
    "provider": "github",
    "owner": "michealchua",
    "repo": "idle-tower-defense-game"
  },
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
  packaged app's actual contents.
- **`directories.output: "release"`** - where the finished installer/`.exe`
  lands after a build.
- **`directories.buildResources: "build"`** - where electron-builder looks
  for icons (and, if you add them later, background images/license files for
  the installer UI). Defaults to `build/` already, listed explicitly here so
  it's not a hidden convention.
- **`extraResources`** - copies the root `dist/` folder into
  `resources/dist/` inside the packaged app, which is what makes the app
  offline-capable (see the section above).
- **`publish`** - the GitHub repo electron-builder uploads releases to (used
  by `electron-builder --publish always` in CI) and the feed
  `electron-updater` polls at runtime to check for newer versions.
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

`autoHideMenuBar` also removes the normal View > Reload menu item, so
`main.cjs` separately wires **Ctrl+R / Cmd+R / F5** to force-reload the
window (bypassing any HTTP cache) - handy if the renderer gets into a stuck
state, though since the packaged app loads local files there's no stale
network cache to fight, unlike the old URL-loading design.

The game itself (`src/index.css`'s `.battle-layer`/`.hud-layer`) is a
full-viewport responsive layout, not a fixed pixel size - `BattleScreen.tsx`'s
canvas rescales to whatever space it's given via `ResizeObserver`, and HUD
widgets/modals float in corners rather than reserving a fixed strip. `width`/
`height`/`minWidth`/`minHeight` above are just a reasonable default window
size and a floor that keeps corner HUD widgets from overlapping each other,
not a hard requirement the way the old fixed-DOM layout used to be.

## Building the Windows installer

One command, from the project root:

```bash
npm run build:win
```

This runs `npm run build` (type-checks with `tsc -b`, then produces a
production `dist/` via `vite build` - this is the exact folder that gets
bundled into the packaged app, see `extraResources` above) and then
`electron-builder --win`, which produces the installer under `release/`,
e.g. `release/tataKAI Setup 1.0.0.exe`.

Run it, then hand that one `.exe` to anyone with Windows - installing it adds
Desktop/Start Menu shortcuts (per the `nsis` config above) that launch
`tataKAI`, which runs the bundled game fully offline in its own window, full
desktop chrome and browser UI hidden.

In practice you rarely need to run this locally - `.github/workflows/release.yml`
does it on every push to `main` and publishes the result. It's mainly useful
for testing a packaging change before pushing it (add `--publish never` to
skip uploading to GitHub Releases: `npx electron-builder --win --publish never`).

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
