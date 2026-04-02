const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;

// --- In-memory meeting state ---
let meetingMessages = [];
let sseClients = [];
let meetingMeta = {
  title: 'BEXS AI 管理團隊會議',
  date: new Date().toISOString().slice(0, 10).replace(/-/g, '/'),
  day: 'Day 3',
  status: 'live'
};

const API_KEY = process.env.API_KEY || 'bexs2026';

function addSSEClient(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  const id = crypto.randomUUID();
  sseClients.push({ id, res });
  res.write(`data: ${JSON.stringify({ type: 'init', meta: meetingMeta, messages: meetingMessages })}\n\n`);
  return id;
}

function removeSSEClient(id) {
  sseClients = sseClients.filter(c => c.id !== id);
}

function broadcast(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  sseClients.forEach(c => {
    try { c.res.write(data); } catch(e) {}
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
    });
  });
}

const HTML_FILE = path.join(__dirname, 'public', 'index.html');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (url.pathname === '/' && req.method === 'GET') {
    try {
      const html = fs.readFileSync(HTML_FILE, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch(e) {
      res.writeHead(500); res.end('Error loading page');
    }
    return;
  }

  if (url.pathname === '/stream' && req.method === 'GET') {
    const clientId = addSSEClient(res);
    req.on('close', () => removeSSEClient(clientId));
    return;
  }

  if (url.pathname === '/api/message' && req.method === 'POST') {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${API_KEY}`) {
      res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    try {
      const body = await readBody(req);
      const msg = { ...body, ts: new Date().toISOString(), id: crypto.randomUUID() };
      meetingMessages.push(msg);
      broadcast({ type: 'new_message', message: msg });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: msg.id }));
    } catch(e) {
      res.writeHead(400); res.end(JSON.stringify({ error: 'Bad request' }));
    }
    return;
  }

  if (url.pathname === '/api/meta' && req.method === 'POST') {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${API_KEY}`) {
      res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    try {
      const body = await readBody(req);
      Object.assign(meetingMeta, body);
      broadcast({ type: 'meta_update', meta: meetingMeta });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    } catch(e) {
      res.writeHead(400); res.end(JSON.stringify({ error: 'Bad request' }));
    }
    return;
  }

  if (url.pathname === '/api/clear' && req.method === 'DELETE') {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${API_KEY}`) {
      res.writeHead(401); res.end(JSON.stringify({ error: 'Unauthorized' })); return;
    }
    meetingMessages = [];
    broadcast({ type: 'clear' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname === '/api/messages' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ meta: meetingMeta, messages: meetingMessages }));
    return;
  }

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Meeting server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} to view`);
  console.log(`API Key: ${API_KEY}`);
});