// server.js — Anonymous stranger-chat backend
// Handles: connection, random pairing queue, message relay, skip, disconnect,
// online count broadcast, and code-based "friend" reconnection (no accounts).

const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---- Simple static file server for the frontend ----
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(PUBLIC_DIR, filePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---- WebSocket layer ----
const wss = new WebSocket.Server({ server });

let waitingQueue = [];       // sockets waiting for a random match
const partners = new Map();  // ws -> partner ws
const names = new Map();     // ws -> display name
const codeWaiting = new Map(); // friend code -> ws waiting to be joined

function send(ws, type, payload = {}) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function broadcastOnlineCount() {
  const payload = JSON.stringify({ type: 'online_count', count: wss.clients.size });
  wss.clients.forEach((c) => {
    if (c.readyState === WebSocket.OPEN) c.send(payload);
  });
}

function removeFromQueue(ws) {
  waitingQueue = waitingQueue.filter((s) => s !== ws);
}

function removeFromCodeWaiting(ws) {
  for (const [code, sock] of codeWaiting.entries()) {
    if (sock === ws) codeWaiting.delete(code);
  }
}

function breakPair(ws, notifyPartner = true) {
  const partner = partners.get(ws);
  if (partner) {
    partners.delete(ws);
    partners.delete(partner);
    if (notifyPartner) send(partner, 'stranger_left');
  }
}

function pairUp(a, b) {
  partners.set(a, b);
  partners.set(b, a);
  send(a, 'matched', { strangerName: names.get(b) || 'Stranger' });
  send(b, 'matched', { strangerName: names.get(a) || 'Stranger' });
}

function tryMatch(ws) {
  removeFromQueue(ws);
  if (waitingQueue.length > 0) {
    const partner = waitingQueue.shift();
    if (partner.readyState !== WebSocket.OPEN) return tryMatch(ws);
    pairUp(ws, partner);
  } else {
    waitingQueue.push(ws);
    send(ws, 'waiting');
  }
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function tryConnectCode(ws, code) {
  removeFromCodeWaiting(ws);
  const waiter = codeWaiting.get(code);
  if (waiter && waiter !== ws && waiter.readyState === WebSocket.OPEN) {
    codeWaiting.delete(code);
    pairUp(ws, waiter);
  } else {
    codeWaiting.set(code, ws);
    send(ws, 'waiting_code', { code });
  }
}

function heartbeat() {
  this.isAlive = true;
}

const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

wss.on('close', () => clearInterval(heartbeatInterval));

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  names.set(ws, 'Stranger');
  broadcastOnlineCount();

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'set_name': {
        const clean = String(msg.name || '').slice(0, 24).trim();
        names.set(ws, clean || 'Stranger');
        break;
      }

      case 'find': {
        breakPair(ws);
        removeFromCodeWaiting(ws);
        tryMatch(ws);
        break;
      }

      case 'connect_code': {
        const code = String(msg.code || '').toUpperCase().slice(0, 12).trim();
        if (!code) return;
        breakPair(ws);
        removeFromQueue(ws);
        tryConnectCode(ws, code);
        break;
      }

      case 'chat_message': {
        const partner = partners.get(ws);
        const text = String(msg.text || '').slice(0, 2000);
        if (partner && text) {
          send(partner, 'chat_message', { text, from: 'stranger' });
        }
        break;
      }

      case 'typing': {
        const partner = partners.get(ws);
        if (partner) send(partner, 'typing');
        break;
      }

      case 'skip': {
        breakPair(ws);
        removeFromCodeWaiting(ws);
        tryMatch(ws);
        break;
      }

      case 'leave': {
        breakPair(ws);
        removeFromQueue(ws);
        removeFromCodeWaiting(ws);
        break;
      }

      case 'friend_request': {
        const partner = partners.get(ws);
        if (partner) send(partner, 'friend_request_received', { fromName: names.get(ws) || 'Stranger' });
        break;
      }

      case 'friend_response': {
        const partner = partners.get(ws);
        if (!partner) break;
        if (msg.accepted) {
          const code = generateCode();
          send(ws, 'friend_code', { code, strangerName: names.get(partner) || 'Stranger' });
          send(partner, 'friend_code', { code, strangerName: names.get(ws) || 'Stranger' });
        } else {
          send(partner, 'friend_response', { accepted: false });
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    breakPair(ws);
    removeFromQueue(ws);
    removeFromCodeWaiting(ws);
    names.delete(ws);
    broadcastOnlineCount();
  });
});

server.listen(PORT, () => {
  console.log(`Anonymous chat server running at http://localhost:${PORT}`);
});
