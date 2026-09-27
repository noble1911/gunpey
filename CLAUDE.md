# Gunpey Project

A Gunpey-inspired puzzle game with multiplayer support (Tetris 99-style).

## Project Structure

```
gunpey/
├── gunpey.html          # Solo game (standalone, open directly in browser)
├── multiplayer/
│   ├── index.html       # Multiplayer client
│   ├── server.js        # WebSocket + HTTP server
│   └── package.json
├── music/               # Background music
└── sfx/                 # Sound effects (move, line clear, win)
```

## Running the Server

On the home server it runs as a container (restarts on its own, survives reboots):

```bash
cd ~/gunpey && git pull && /usr/local/bin/docker compose up -d --build
```

- Played at **https://games.noblehaus.uk/gunpey/** (through the games gateway in the home-server
  repo, `games/`) and on the LAN at `http://192.168.1.117:3003/`.
- Logs: `docker logs gunpey`. Health: `docker ps` shows `(healthy)`.
- The client finds the server's socket next to the page, so the game works under a path as well as
  at a site's root. Keep asset URLs relative (`music/…`, `sfx/…`) for the same reason.

Without Docker (local development): `cd multiplayer && npm install && PORT=3000 node server.js`.

## Notes

- Music and SFX are served from the parent directory (`../music/`, `../sfx/`) by the server
- Repo: https://github.com/noble1911/gunpey
