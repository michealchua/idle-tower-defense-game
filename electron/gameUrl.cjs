// `npm run electron:dev` passes the local Vite dev server URL as a CLI arg
// (see package.json) so the shell hot-reloads against local source while
// iterating. A packaged build never gets that arg - it loads the game from
// the local `dist/` files electron-builder copies into resources/dist (see
// main.cjs), fully offline. New versions reach installed users through
// electron-updater checking GitHub Releases, not by loading a live URL.
module.exports = {
  devUrl: process.argv[2] || null,
};
