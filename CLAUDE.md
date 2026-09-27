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

The multiplayer server must be started with `PORT=3001` — it defaults to 3000 otherwise.

```bash
cd ~/gunpey/multiplayer
PORT=3001 nohup /opt/homebrew/bin/node server.js >> ~/gunpey-server.log 2>&1 &
```

- Runs at: `http://192.168.1.117:3001`
- Logs: `~/gunpey-server.log`
- Node binary: `/opt/homebrew/bin/node` (Homebrew, not in default SSH PATH)

## Checking / Restarting

```bash
# Check if running
curl -s http://localhost:3001 | head -3

# Kill and restart
pkill -f 'node.*server.js'
cd ~/gunpey/multiplayer && PORT=3001 nohup /opt/homebrew/bin/node server.js >> ~/gunpey-server.log 2>&1 &
```

## Notes

- The server does **not** survive reboots — no launchd plist set up yet
- `node` is not in the SSH PATH; always use the full path `/opt/homebrew/bin/node`
- Music and SFX are served from the parent directory (`../music/`, `../sfx/`) by the server
- Repo: https://github.com/noble1911/gunpey
