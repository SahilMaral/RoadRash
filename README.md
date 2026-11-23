# Road Rash Online

A browser-based adaptation of Road Rash that runs locally with a Node.js server. It includes single-player racing, career/progression features, bike selection/upgrades, and local multiplayer relay support.

## Features

- Playable in the browser from a local server
- Five tracks and career-style progression (as described by the game build)
- Bike/shop and race gameplay assets bundled in the project
- Local leaderboard and race-ticket API endpoints served by the local server
- In-memory local multiplayer room relay over WebSocket (`/mano`)
- PWA assets/manifest included

## Requirements

- [Node.js](https://nodejs.org/) (recommended: recent LTS)
- A modern desktop browser

## Getting started

1. Clone or download this repository.
2. Open a terminal in the project folder.
3. Start the server:

```bash
npm start
```

Or run directly:

```bash
node server.js
```

On Windows, you can also use [start.bat](start.bat).

4. Open the URL shown in the terminal (default: `http://localhost:3000`).

The server serves static game files, provides local API routes (`/api/race`, `/api/board`), and hosts the local multiplayer WebSocket endpoint at `/mano`.

## Project structure

- [index.html](index.html) – main game page and UI shell
- [app.js](app.js), [app-startup.js](app-startup.js) – app/bootstrap logic
- [race*.js](race.js), [race-*.js](race-startup.js) – race/gameplay modules
- [server.js](server.js) – local HTTP server, static file serving, local APIs, and multiplayer relay
- [assets/](assets/) – fonts, images, audio/video, and other game assets
- [data/](data/) – track, bike, vehicle, scenery, and gameplay data files
- [ui.css](ui.css), [css/](css/) – styles

## Notes

- This project is intended to run locally; by default the server listens on port `3000` (or `PORT` if set).
- Static asset aliases and fallback handling (e.g. `.webp` to `.png`) are implemented in [server.js](server.js).
- Multiplayer rooms are stored in memory and are reset when the server restarts.

## Development

There is no build step configured in [package.json](package.json). Run the server and refresh the browser after changes. If you modify service worker/cached assets, you may need a hard refresh to pick up updates.