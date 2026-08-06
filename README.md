# Idle Tower Defense

A browser-based idle Tower Defense / Hero RPG built with React, TypeScript, and HTML5 Canvas. The hero auto-battles waves of enemies, earns gold and experience, and grows stronger through upgrades, skills, and equipment while the player mostly watches and manages progression.

## Tech stack

- React + TypeScript
- HTML5 Canvas for rendering
- Zustand for state management
- Vite for dev/build tooling

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL in a browser.

## Project structure

- `src/engine/` — framework-agnostic game logic (systems, entities, core game loop). No React or rendering code lives here.
- `src/data/` — config-driven game data (stats, costs, unlock conditions, etc.), separated from logic so balance changes rarely require touching code.
- `src/render/` — Canvas rendering, reads engine state and draws it.
- `src/store/` — Zustand store bridging the engine simulation to React.
- `src/components/` — React UI.
- `src/locales/` — UI text, kept separate from code for localization.

A `DebugPanel` component is included for development/testing (spawning enemies, unlocking skills, adjusting game speed, etc.) and is meant to stay in the build during active development.
