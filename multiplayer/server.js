const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

// ── Static file server ──────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.mp3':  'audio/mpeg',
  '.ogg':  'audio/ogg',
  '.wav':  'audio/wav',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // Serve music/ from the parent directory
  let filePath;
  if (urlPath.startsWith('/music/')) {
    filePath = path.join(__dirname, '..', urlPath);
  } else {
    filePath = path.join(__dirname, urlPath);
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
});

// ── Room management ─────────────────────────────────────────────────────────
const rooms = new Map();  // code → Room
let nextPlayerId = 1;

// Avoid ambiguous chars: 0/O/1/I/L
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function makeCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  } while (rooms.has(code));
  return code;
}

function makeGarbageRow() {
  const TILE_TYPES = ['/', '\\', '^', 'v'];
  const row = [];
  const empty = Math.floor(Math.random() * 5);
  for (let c = 0; c < 5; c++) {
    row.push(c === empty ? null : TILE_TYPES[Math.floor(Math.random() * 4)]);
  }
  return row;
}

function encodeGarbageRow(row) {
  return row.map(t => t || '.').join('');
}

class Room {
  constructor(code, host) {
    this.code = code;
    this.state = 'lobby';  // lobby → playing → finished
    this.players = new Map();  // id → Player
    this.hostId = host.id;
    this.placements = [];  // [{id, name, placement}] — last eliminated = worst
    this.aliveCount = 0;
  }

  broadcast(msg, excludeId) {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.id !== excludeId && p.ws.readyState === 1) {
        p.ws.send(data);
      }
    }
  }

  playerList() {
    return [...this.players.values()].map(p => ({
      id: p.id, name: p.name, alive: p.alive,
    }));
  }

  getAliveIds() {
    return [...this.players.values()].filter(p => p.alive).map(p => p.id);
  }
}

class Player {
  constructor(id, name, ws) {
    this.id = id;
    this.name = name;
    this.ws = ws;
    this.roomCode = null;
    this.alive = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.grid = '';
  }
}

// ── WebSocket server ────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  const playerId = String(nextPlayerId++);
  let player = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      case 'create': {
        const code = makeCode();
        player = new Player(playerId, msg.name || 'Player', ws);
        player.roomCode = code;
        const room = new Room(code, player);
        room.players.set(playerId, player);
        rooms.set(code, room);
        send(ws, { type: 'created', code, playerId });
        send(ws, { type: 'lobby', players: room.playerList() });
        break;
      }

      case 'join': {
        const code = (msg.code || '').toUpperCase();
        const room = rooms.get(code);
        if (!room) { send(ws, { type: 'error', msg: 'Room not found' }); break; }
        if (room.state !== 'lobby') { send(ws, { type: 'error', msg: 'Game already in progress' }); break; }
        if (room.players.size >= 100) { send(ws, { type: 'error', msg: 'Room is full' }); break; }
        player = new Player(playerId, msg.name || 'Player', ws);
        player.roomCode = code;
        room.players.set(playerId, player);
        send(ws, { type: 'joined', playerId, players: room.playerList() });
        room.broadcast({ type: 'lobby', players: room.playerList() }, playerId);
        break;
      }

      case 'list': {
        const roomList = [];
        for (const [code, room] of rooms) {
          if (room.state === 'lobby') {
            roomList.push({ code, playerCount: room.players.size, host: room.players.get(room.hostId)?.name || '?' });
          }
        }
        send(ws, { type: 'roomList', rooms: roomList });
        break;
      }

      case 'start': {
        if (!player) break;
        const room = rooms.get(player.roomCode);
        if (!room || room.hostId !== player.id || room.state !== 'lobby') break;
        room.state = 'playing';
        room.aliveCount = room.players.size;
        for (const p of room.players.values()) p.alive = true;
        const seed = Math.floor(Math.random() * 2147483647);
        room.broadcast({ type: 'gameStart', players: room.playerList(), seed });
        break;
      }

      case 'state': {
        if (!player) break;
        const room = rooms.get(player.roomCode);
        if (!room || room.state !== 'playing') break;
        player.score = msg.score || 0;
        player.lines = msg.lines || 0;
        player.level = msg.level || 1;
        player.grid  = msg.grid || '';
        room.broadcast({
          type: 'playerState', id: player.id,
          name: player.name,
          score: player.score, lines: player.lines,
          level: player.level, grid: player.grid,
        }, player.id);
        break;
      }

      case 'attack': {
        if (!player) break;
        const room = rooms.get(player.roomCode);
        if (!room || room.state !== 'playing') break;
        const numLines = msg.lines || 0;
        if (numLines <= 0) break;
        // Pick a random alive opponent
        const alive = room.getAliveIds().filter(id => id !== player.id);
        if (!alive.length) break;
        const targetId = alive[Math.floor(Math.random() * alive.length)];
        const target = room.players.get(targetId);
        if (!target || target.ws.readyState !== 1) break;
        // Generate garbage rows server-side
        const garbageRows = [];
        for (let i = 0; i < numLines; i++) {
          garbageRows.push(encodeGarbageRow(makeGarbageRow()));
        }
        send(target.ws, { type: 'attacked', fromName: player.name, garbageRows });
        break;
      }

      case 'dead': {
        if (!player) break;
        const room = rooms.get(player.roomCode);
        if (!room || room.state !== 'playing' || !player.alive) break;
        player.alive = false;
        room.aliveCount--;
        const placement = room.aliveCount + 1;
        room.placements.push({ id: player.id, name: player.name, placement });
        room.broadcast({
          type: 'playerDead', id: player.id, name: player.name,
          placement, aliveCount: room.aliveCount,
        });
        // Check for game end
        if (room.aliveCount <= 1) {
          const winner = [...room.players.values()].find(p => p.alive);
          if (winner) {
            room.placements.push({ id: winner.id, name: winner.name, placement: 1 });
          }
          room.state = 'finished';
          room.broadcast({
            type: 'gameEnd',
            winner: winner ? { id: winner.id, name: winner.name } : null,
            placements: room.placements.sort((a, b) => a.placement - b.placement),
          });
          // Return everyone to lobby after 8 seconds
          room.returnTimer = setTimeout(() => {
            room.state = 'lobby';
            room.placements = [];
            room.aliveCount = 0;
            for (const p of room.players.values()) {
              p.alive = true;
              p.score = 0;
              p.lines = 0;
              p.level = 1;
              p.grid = '';
            }
            room.broadcast({ type: 'returnToLobby', players: room.playerList() });
          }, 8000);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (!player || !player.roomCode) return;
    const room = rooms.get(player.roomCode);
    if (!room) return;

    if (room.state === 'lobby') {
      room.players.delete(player.id);
      if (room.players.size === 0) {
        rooms.delete(room.code);
      } else {
        // Transfer host if needed
        if (room.hostId === player.id) {
          room.hostId = room.players.keys().next().value;
        }
        room.broadcast({ type: 'lobby', players: room.playerList() });
      }
    } else if (room.state === 'playing' && player.alive) {
      // Treat disconnect as death
      player.alive = false;
      room.aliveCount--;
      const placement = room.aliveCount + 1;
      room.placements.push({ id: player.id, name: player.name, placement });
      room.broadcast({
        type: 'playerDead', id: player.id, name: player.name,
        placement, aliveCount: room.aliveCount,
      });
      if (room.aliveCount <= 1) {
        const winner = [...room.players.values()].find(p => p.alive);
        if (winner) {
          room.placements.push({ id: winner.id, name: winner.name, placement: 1 });
        }
        room.state = 'finished';
        room.broadcast({
          type: 'gameEnd',
          winner: winner ? { id: winner.id, name: winner.name } : null,
          placements: room.placements.sort((a, b) => a.placement - b.placement),
        });
        room.returnTimer = setTimeout(() => {
          room.state = 'lobby';
          room.placements = [];
          room.aliveCount = 0;
          for (const p of room.players.values()) {
            p.alive = true;
            p.score = 0;
            p.lines = 0;
            p.level = 1;
            p.grid = '';
          }
          room.broadcast({ type: 'returnToLobby', players: room.playerList() });
        }, 8000);
      }
    }
    room.players.delete(player.id);
    // If room is now empty after disconnect, clean it up
    if (room.players.size === 0) {
      if (room.returnTimer) clearTimeout(room.returnTimer);
      rooms.delete(room.code);
    }
  });
});

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

server.listen(PORT, () => {
  console.log(`Gunpey multiplayer server running on http://localhost:${PORT}`);
});
