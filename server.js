const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// Path aliases for compatibility
const ALIASES = {
  '/css/ui.css': '/ui.css',
  '/js/app.js': '/app.js',
  '/images/favicon.svg': '/assets/favicon.svg',
  '/images/icon-180.png': '/assets/icon-180.png',
  '/images/og-road-rash-3.jpg': '/assets/og-road-rash-3.jpg',
  '/images/bigmeter.png': '/assets/img/dash/bigmeter.png',
  '/media/launch-reel.mp4': '/assets/launch-reel.mp4',
};

// ==========================================
// HTTP Static File Server
// ==========================================
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  let reqPath = decodeURIComponent(req.url.split('?')[0]);

  // Local Leaderboard & Race Ticket API
  if (reqPath === '/api/race' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ticket: `local_ticket_${Date.now()}` }));
    return;
  }

  if (reqPath === '/api/board') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.method === 'POST') {
      res.end(JSON.stringify({
        points: 100,
        day: { world: { rank: 1 }, city: { name: 'Local', rank: 1 }, country: { code: 'US', rank: 1 } },
        week: { world: { rank: 1 } }
      }));
    } else {
      res.end(JSON.stringify({
        day: { top: [], you: { points: 100, races: 1 }, world: { rank: 1, top: [] } },
        week: { top: [], you: { points: 100, races: 1 }, world: { rank: 1, top: [] } }
      }));
    }
    return;
  }

  if (reqPath === '/') {
    reqPath = '/index.html';
  }

  if (ALIASES[reqPath]) {
    reqPath = ALIASES[reqPath];
  }

  if (reqPath.startsWith('/fonts/')) {
    reqPath = '/assets' + reqPath;
  }

  const ext = path.extname(reqPath).toLowerCase();
  let contentType = MIME_TYPES[ext] || 'application/octet-stream';
  let filePath = path.join(ROOT, reqPath.replace(/\//g, path.sep));

  // Fallback: If .webp requested but doesn't exist, use .png if available
  if (!fs.existsSync(filePath) && reqPath.endsWith('.webp')) {
    const pngPath = filePath.slice(0, -5) + '.png';
    if (fs.existsSync(pngPath)) {
      filePath = pngPath;
      contentType = 'image/png';
    }
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': data.length,
        'Cache-Control': 'no-cache'
      });
      res.end(data);
      return;
    } catch (e) {
      console.error(`Error reading ${filePath}:`, e.message);
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`404 Not Found locally: ${reqPath}`);
});

// ==========================================
// In-Memory Multiplayer Room Relay (/mano)
// ==========================================
const rooms = new Map(); // roomCode -> roomState
let nextClientId = 1;

function sendWs(socket, data) {
  if (socket.destroyed || socket.readyState === 'closed') return;
  const payload = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len <= 65535) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  try {
    socket.write(Buffer.concat([header, payload]));
  } catch (err) {}
}

function broadcastToRoom(roomCode, msg, excludeSocket = null) {
  const room = rooms.get(roomCode);
  if (!room) return;
  for (const p of room.clients) {
    if (p.socket !== excludeSocket) {
      sendWs(p.socket, msg);
    }
  }
}

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (!url.pathname.startsWith('/mano')) {
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  const clientId = `p_${nextClientId++}`;
  const token = `tok_${crypto.randomBytes(8).toString('hex')}`;
  const initialRoomParam = url.searchParams.get('room') || url.searchParams.get('pub');

  const client = {
    id: clientId,
    token,
    name: 'Player',
    socket,
    currentRoom: null,
  };

  function leaveCurrentRoom() {
    if (!client.currentRoom) return;
    const room = rooms.get(client.currentRoom);
    if (!room) return;

    room.clients = room.clients.filter(c => c !== client);
    room.game.players = room.game.players.filter(p => p.id !== client.id);
    room.game.racers = room.game.racers.filter(id => id !== client.id);

    if (room.clients.length === 0) {
      rooms.delete(client.currentRoom);
    } else {
      if (room.game.hostId === client.id) {
        room.game.hostId = room.clients[0].id;
        room.game.host = room.clients[0].name;
      }
      broadcastToRoom(client.currentRoom, { t: 'room', game: room.game });
    }
    client.currentRoom = null;
  }

  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const b0 = buf[0];
      const opcode = b0 & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buf.length < 4) break;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) break;
        len = Number(buf.readBigUInt64BE(2));
        offset = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < offset + maskLen + len) break;
      const mask = masked ? buf.subarray(offset, offset + 4) : null;
      offset += maskLen;
      const payload = buf.subarray(offset, offset + len);
      if (masked) {
        for (let i = 0; i < len; i++) payload[i] ^= mask[i % 4];
      }
      buf = buf.subarray(offset + len);

      if (opcode === 8) {
        leaveCurrentRoom();
        socket.end();
        return;
      }
      if (opcode === 9) {
        socket.write(Buffer.from([0x8a, 0x00])); // Pong
        continue;
      }
      if (opcode === 1) {
        try {
          const m = JSON.parse(payload.toString('utf8'));
          handleMessage(m);
        } catch (e) {}
      }
    }
  });

  socket.on('close', () => leaveCurrentRoom());
  socket.on('error', () => leaveCurrentRoom());

  function handleMessage(m) {
    if (m.t === 'ping') {
      sendWs(socket, { t: 'pong' });
      return;
    }

    if (m.t === 'hello') {
      if (m.name) client.name = String(m.name).slice(0, 16);
      sendWs(socket, { t: 'you', id: client.id, token: client.token });

      // If reconnecting with a resume token into an active room
      if (m.resume && initialRoomParam) {
        const room = rooms.get(initialRoomParam);
        if (room) {
          const existing = room.game.players.find(p => p.token === m.resume || p.id === client.id);
          if (existing) {
            existing.away = false;
            client.id = existing.id;
            client.currentRoom = initialRoomParam;
            if (!room.clients.includes(client)) room.clients.push(client);
            broadcastToRoom(initialRoomParam, { t: 'room', game: room.game });
            return;
          }
        }
      }
      return;
    }

    if (m.t === 'host') {
      leaveCurrentRoom();
      const code = String(m.code || initialRoomParam || Math.floor(1000 + Math.random() * 9000));
      const game = {
        code,
        hostId: client.id,
        host: client.name,
        status: 'open',
        track: 'city',
        level: m.level || 1,
        cars: !!m.cars,
        ai: !!m.ai,
        spectate: !!m.spectate,
        players: [{ id: client.id, name: client.name, away: false, char: m.char || 0, token: client.token }],
        racers: [client.id],
        results: {},
        tally: [],
        rounds: 0
      };

      rooms.set(code, { game, clients: [client] });
      client.currentRoom = code;
      sendWs(socket, { t: 'room', game });
      return;
    }

    if (m.t === 'join') {
      const code = String(m.code || '').trim();
      joinRoom(code, m.char || 0);
      return;
    }

    if (m.t === 'quick') {
      leaveCurrentRoom();
      let found = null;
      for (const [code, r] of rooms) {
        if (r.game.status === 'open' && r.game.players.length < 8) {
          found = code;
          break;
        }
      }
      if (found) {
        joinRoom(found, m.char || 0);
      } else {
        const code = String(Math.floor(1000 + Math.random() * 9000));
        const game = {
          code,
          hostId: client.id,
          host: client.name,
          status: 'open',
          track: 'city',
          level: 1,
          cars: false,
          ai: true,
          spectate: false,
          players: [{ id: client.id, name: client.name, away: false, char: m.char || 0 }],
          racers: [client.id],
          results: {},
          tally: [],
          rounds: 0
        };
        rooms.set(code, { game, clients: [client] });
        client.currentRoom = code;
        sendWs(socket, { t: 'room', game });
      }
      return;
    }

    if (m.t === 'settings') {
      if (!client.currentRoom) return;
      const room = rooms.get(client.currentRoom);
      if (!room || room.game.hostId !== client.id) return;

      if (m.track !== undefined) room.game.track = m.track;
      if (m.level !== undefined) room.game.level = m.level;
      if (m.cars !== undefined) room.game.cars = m.cars;
      if (m.ai !== undefined) room.game.ai = m.ai;
      if (m.spectate !== undefined) room.game.spectate = m.spectate;
      if (m.resetTally) room.game.tally = [];

      broadcastToRoom(client.currentRoom, { t: 'room', game: room.game });
      return;
    }

    if (m.t === 'start') {
      if (!client.currentRoom) return;
      const room = rooms.get(client.currentRoom);
      if (!room || room.game.hostId !== client.id) return;

      room.game.status = 'racing';
      const raceId = `race_${Date.now()}`;
      const seed = Math.floor(Math.random() * 1000000);
      const order = room.game.players.map((p, idx) => ({
        id: p.id,
        name: p.name,
        char: p.char || 0
      }));

      broadcastToRoom(client.currentRoom, {
        t: 'start',
        raceId,
        track: room.game.track || 'city',
        level: room.game.level || 1,
        cars: room.game.cars || false,
        ai: room.game.ai || false,
        spectator: room.game.spectate ? room.game.hostId : null,
        order,
        seed
      });
      return;
    }

    if (m.t === 'ready' || m.t === 'state' || m.t === 'hit' || m.t === 'result') {
      if (client.currentRoom) {
        broadcastToRoom(client.currentRoom, { ...m, fromId: client.id }, socket);
      }
      return;
    }

    if (m.t === 'chat') {
      if (client.currentRoom) {
        broadcastToRoom(client.currentRoom, { t: 'chat', from: client.name, text: m.text });
      }
      return;
    }

    if (m.t === 'leave') {
      leaveCurrentRoom();
      return;
    }
  }

  function joinRoom(code, char = 0) {
    leaveCurrentRoom();
    const room = rooms.get(code);
    if (!room) {
      sendWs(socket, {
        t: 'rejected',
        reason: 'not found',
        text: `Room ${code} has closed or doesn't exist.`
      });
      return;
    }
    if (room.game.players.length >= 8) {
      sendWs(socket, {
        t: 'rejected',
        reason: 'full',
        text: `Room ${code} is full.`
      });
      return;
    }

    room.clients.push(client);
    room.game.players.push({ id: client.id, name: client.name, away: false, char });
    if (room.game.status === 'open') {
      room.game.racers.push(client.id);
    }
    client.currentRoom = code;

    broadcastToRoom(code, { t: 'room', game: room.game });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const url = `http://localhost:${PORT}`;
  console.log('====================================================');
  console.log('  Road Rash Online is running 100% LOCALLY!');
  console.log('  Single Player + Local Multiplayer (Mano-a-Mano)');
  console.log(`  Open in your browser: ${url}`);
  console.log('====================================================\n');

  if (process.platform === 'win32' && !process.env.NO_OPEN) {
    exec(`start ${url}`);
  }
});
