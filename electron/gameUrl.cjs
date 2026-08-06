// Point this at your deployed game once it's hosted (e.g. the URL Vercel/
// Netlify gives you after connecting the GitHub repo). Every time you push
// new code and it redeploys, opening the desktop app again loads the new
// version automatically - no reinstalling.
//
// `npm run electron:dev` passes the local Vite dev server URL as a CLI arg
// instead (see package.json), so this default is only used by the packaged
// build (`npm run electron:build`).
const DEPLOYED_GAME_URL = 'https://idle-tower-defense-game.vercel.app';

module.exports = {
  gameUrl: process.argv[2] || DEPLOYED_GAME_URL,
};
