Drop looping BGM tracks here with these exact filenames (mp3):

- `forest.mp3`
- `desert.mp3`
- `deep-sea.mp3`
- `volcano.mp3`

Same chapter-cycle mapping as the backgrounds (see `public/backgrounds/README.md`).
Playback starts automatically after the player's first click/tap anywhere on the page (browser autoplay policy). Missing files just fail silently - no crash, no console spam beyond the usual 404.

Managed by `src/audio/AudioManager.ts`.
