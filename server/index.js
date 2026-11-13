// Servidor do quiz: entrega as páginas (telão e celular), gera o QR Code e
// mantém todos os dispositivos sincronizados pelo Socket.IO.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { Game } = require('./game');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const QUIZ_FILE = process.env.QUIZ_FILE || path.join(ROOT, 'quiz.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Chave do apresentador: só quem tem a chave controla a partida no telão.
function hostKey() {
  if (process.env.HOST_KEY) return process.env.HOST_KEY;
  const f = path.join(DATA_DIR, 'host-key.txt');
  try { return fs.readFileSync(f, 'utf8').trim(); } catch {}
  const k = crypto.randomBytes(9).toString('base64url');
  fs.writeFileSync(f, k);
  return k;
}
const HOST_KEY = hostKey();
// Comparação em tempo constante, para não vazar a chave pelo tempo de resposta.
const KEY_HASH = crypto.createHash('sha256').update(HOST_KEY).digest();
const isHostKey = (k) => typeof k === 'string' && crypto.timingSafeEqual(crypto.createHash('sha256').update(k).digest(), KEY_HASH);

const quiz = JSON.parse(fs.readFileSync(QUIZ_FILE, 'utf8'));

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10_000, pingTimeout: 8_000 });

// ---------- sincronização ----------

let flushTimer = null;
let saveTimer = null;
const game = new Game(quiz, {
  onChange() {
    if (!flushTimer) flushTimer = setTimeout(flush, 40);
    if (!saveTimer) saveTimer = setTimeout(save, 500);
  }
});

try {
  game.restore(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
  console.log(`Partida restaurada (fase: ${game.phase}, jogadores: ${game.players.size}).`);
} catch {}

function flush() {
  flushTimer = null;
  const hostView = game.hostView();
  for (const s of io.of('/').sockets.values()) {
    if (s.data.role === 'host') s.emit('state', hostView);
    else if (s.data.role === 'denied') continue;
    else if (s.data.playerId) {
      const p = game.players.get(s.data.playerId);
      if (p) s.emit('state', game.playerView(p));
      else { s.data.playerId = null; s.emit('player:unknown'); }
    } else s.emit('state', game.baseView());
  }
}

function save() {
  saveTimer = null;
  const tmp = STATE_FILE + '.tmp';
  fs.writeFile(tmp, JSON.stringify(game.snapshot()), (err) => {
    if (!err) fs.rename(tmp, STATE_FILE, () => {});
  });
}

const reply = (cb, payload) => { if (typeof cb === 'function') cb(payload); };

io.on('connection', (socket) => {
  const auth = socket.handshake.auth || {};
  socket.data.role = auth.role === 'host' ? 'host' : 'player';

  socket.on('time', (cb) => reply(cb, Date.now()));

  if (socket.data.role === 'host') {
    if (!isHostKey(auth.key)) {
      socket.emit('host:denied');
      socket.data.role = 'denied';
      return;
    }
    socket.emit('host:ok');
    socket.emit('state', game.hostView());
    // O retorno (ack) é sempre o último argumento, venha ou não um dado antes dele.
    const run = (fn) => (...args) => reply(args[args.length - 1], { error: fn() || null });
    socket.on('host:advance', run(() => game.advance()));
    socket.on('host:back', run(() => game.back()));
    socket.on('host:reset', run(() => { game.reset(); return null; }));
    return;
  }

  // Jogador: reconecta pelo token salvo no aparelho, sem criar duplicata.
  const known = game.byToken(auth.token);
  if (known) {
    socket.data.playerId = known.id;
    game.connect(known);
    socket.emit('state', game.playerView(known));
  } else {
    if (auth.token) socket.emit('player:unknown');
    socket.emit('state', game.baseView());
  }

  socket.on('player:checkName', (name, cb) => reply(cb, { error: game.checkName(name, socket.data.playerId) }));

  socket.on('player:join', (data, cb) => {
    const wasJoined = !!socket.data.playerId;
    const r = game.join(data || {}, socket.data.playerId);
    if (r.error) return reply(cb, { error: r.error });
    if (!wasJoined) {
      socket.data.playerId = r.player.id;
      game.connect(r.player);
    }
    reply(cb, { token: r.player.token, id: r.player.id });
  });

  socket.on('player:answer', (data, cb) => {
    if (!socket.data.playerId) return reply(cb, { error: 'Entre na sala primeiro.' });
    const d = data || {};
    reply(cb, { error: game.answer(socket.data.playerId, d.qIndex, d.choice) });
  });

  socket.on('disconnect', () => {
    const p = socket.data.playerId && game.players.get(socket.data.playerId);
    if (p) game.disconnect(p);
  });
});

// ---------- páginas e QR Code ----------

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return null;
}

// Endereço que os celulares devem abrir. PUBLIC_URL tem prioridade; sem ela,
// usa o endereço pelo qual o telão foi aberto (trocando localhost pelo IP da rede).
function joinUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '') + '/';
  let host = req.get('host') || `localhost:${PORT}`;
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host)) {
    const ip = lanAddress();
    if (ip) host = host.replace(/^(localhost|127\.0\.0\.1|\[::1\])/, ip);
  }
  return `${req.protocol}://${host}/`;
}

app.get('/api/join-info', async (req, res) => {
  const url = joinUrl(req);
  const svg = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#120B2E', light: '#FFF8EC' } });
  res.set('Cache-Control', 'no-store').json({ url, svg });
});

app.get('/healthz', (req, res) => res.json({ ok: true, phase: game.phase, players: game.players.size }));

// Resultados individuais: só com a chave do apresentador (no cabeçalho, nunca na URL).
app.get('/api/resultados', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!isHostKey(req.get('X-Host-Key'))) {
    return res.status(403).json({ error: 'Sem permissão: só quem organiza o quiz pode ver os resultados individuais.' });
  }
  res.json(game.results());
});

app.get('/vendor/preact.js', (req, res) => res.sendFile(path.join(ROOT, 'node_modules', 'htm', 'preact', 'standalone.module.js')));
app.get('/telao', (req, res) => res.sendFile(path.join(ROOT, 'public', 'telao.html')));
app.get('/resultados', (req, res) => res.sendFile(path.join(ROOT, 'public', 'resultados.html')));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'public', 'celular.html')));
app.use(express.static(path.join(ROOT, 'public'), { index: false }));

server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`A porta ${PORT} já está em uso (o quiz já está aberto em outro terminal?).`);
  console.error('Feche o outro servidor (Ctrl+C) ou use outra porta, ex.: $env:PORT=3001; npm start');
  process.exit(1);
});

server.listen(PORT, () => {
  const base = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/+$/, '') : `http://localhost:${PORT}`;
  console.log(`Quiz rodando na porta ${PORT}`);
  console.log(`Telão (apresentador): ${base}/telao?key=${process.env.HOST_KEY ? '<HOST_KEY>' : HOST_KEY}`);
  console.log(`Celulares:            ${base}/`);
});
