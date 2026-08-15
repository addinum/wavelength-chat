// server.js — Anonymous stranger-chat backend
// Handles: connection, random pairing queue, message relay, skip, disconnect.
// No accounts, no login. Usernames are just display labels, not identities.

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

  // prevent path traversal
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

let waitingQueue = [];      // sockets waiting for a match
const partners = new Map(); // ws -> partner ws
const names = new Map();    // ws -> display name

function send(ws, type, payload = {}) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function removeFromQueue(ws) {
  waitingQueue = waitingQueue.filter((s) => s !== ws);
}

function breakPair(ws, notifyPartner = true) {
  const partner = partners.get(ws);
  if (partner) {
    partners.delete(ws);
    partners.delete(partner);
    if (notifyPartner) send(partner, 'stranger_left');
  }
}

function tryMatch(ws) {
  removeFromQueue(ws);
  if (waitingQueue.length > 0) {
    const partner = waitingQueue.shift();
    if (partner.readyState !== WebSocket.OPEN) {
      return tryMatch(ws); // partner went stale, try again
    }
    partners.set(ws, partner);
    partners.set(partner, ws);
    send(ws, 'matched', { strangerName: names.get(partner) || 'Stranger' });
    send(partner, 'matched', { strangerName: names.get(ws) || 'Stranger' });
  } else {
    waitingQueue.push(ws);
    send(ws, 'waiting');
  }
}

wss.on('connection', (ws) => {
  names.set(ws, 'Stranger');

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
        tryMatch(ws);
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
        tryMatch(ws);
        break;
      }

      case 'leave': {
        breakPair(ws);
        removeFromQueue(ws);
        break;
      }
    }
  });

  ws.on('close', () => {
    breakPair(ws);
    removeFromQueue(ws);
    names.delete(ws);
  });
});

server.listen(PORT, () => {
  console.log(`Anonymous chat server running at http://localhost:${PORT}`);
});
