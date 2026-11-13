// Teste ponta a ponta: sobe o servidor de verdade e simula o telão e vários
// celulares conectados ao mesmo tempo pelo Socket.IO.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'quiz-e2e-'));
const QUIZ = path.join(DIR, 'quiz.json');
fs.writeFileSync(QUIZ, JSON.stringify({
  titulo: 'E2E', segundosPorPergunta: 4, segundosContagem: 1, dobroNaUltima: true, revelarQuandoTodosResponderem: true,
  perguntas: [
    { pergunta: 'Q1', opcoes: ['a', 'b'], certa: 0 },
    { pergunta: 'Q2', opcoes: ['a', 'b', 'c', 'd'], certa: 3 }
  ]
}));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (s, ev, data) => new Promise((resolve) => (data === undefined ? s.emit(ev, resolve) : s.emit(ev, data, resolve)));

// Guarda o último estado recebido por cada dispositivo e permite esperar por uma condição.
function device(auth) {
  const s = io(URL, { auth, transports: ['websocket'], forceNew: true });
  s.last = null;
  s.on('state', (st) => { s.last = st; });
  s.until = async (pred, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (s.last && pred(s.last)) return s.last; await sleep(20); }
    throw new Error('tempo esgotado esperando estado; último: ' + JSON.stringify(s.last && { phase: s.last.phase, q: s.last.qIndex }));
  };
  return s;
}

let server;
test.before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT: String(PORT), HOST_KEY: 'segredo-teste', DATA_DIR: DIR, QUIZ_FILE: QUIZ, PUBLIC_URL: '' },
    stdio: ['ignore', 'pipe', 'inherit']
  });
  await new Promise((resolve) => server.stdout.on('data', (d) => { if (String(d).includes('rodando')) resolve(); }));
});
test.after(() => { server.kill(); });

test('partida completa com telão e 5 celulares', async () => {
  // Páginas e QR Code
  const cel = await fetch(URL + '/');
  assert.equal(cel.status, 200);
  assert.match(await cel.text(), /celular\.js/);
  assert.equal((await fetch(URL + '/telao')).status, 200);
  assert.equal((await fetch(URL + '/vendor/preact.js')).status, 200);
  const info = await (await fetch(URL + '/api/join-info')).json();
  assert.match(info.svg, /^<svg/);
  assert.match(info.url, new RegExp(`^http://[^/]+:${PORT}/$`));

  // Quem não tem a chave não controla a partida.
  const intruso = io(URL, { auth: { role: 'host', key: 'errada' }, transports: ['websocket'], forceNew: true });
  await new Promise((r) => intruso.on('host:denied', r));
  intruso.close();

  const host = device({ role: 'host', key: 'segredo-teste' });
  await host.until((s) => s.phase === 'lobby');

  // 5 jogadores entram ao mesmo tempo.
  const nomes = ['Ana', 'Beto', 'Caio', 'Duda', 'Edu'];
  const players = nomes.map(() => device({ role: 'player', token: '' }));
  const joins = await Promise.all(players.map((p, i) => emit(p, 'player:join', { name: nomes[i], tipo: i, cor: i })));
  joins.forEach((r) => assert.ok(r.token, r.error));
  const lobby = await host.until((s) => s.players && s.players.length === 5);
  assert.deepEqual(lobby.players.map((p) => p.name).sort(), [...nomes].sort());

  // Apelido repetido é recusado; nada é duplicado.
  const dup = device({ role: 'player', token: '' });
  assert.match((await emit(dup, 'player:join', { name: 'ana', tipo: 0, cor: 0 })).error, /já está na sala/);
  assert.match((await emit(dup, 'player:answer', { qIndex: 0, choice: 0 })).error, /Entre na sala/);
  dup.close();

  // Jogador não consegue mandar comandos do apresentador (o evento é ignorado).
  players[0].emit('host:advance');
  await sleep(150);
  assert.equal(host.last.phase, 'lobby');

  // Começa: todos passam para a contagem e depois para a pergunta.
  assert.equal((await emit(host, 'host:advance')).error, null);
  await Promise.all(players.map((p) => p.until((s) => s.phase === 'countdown' && s.qIndex === 0)));
  const q1 = await players[0].until((s) => s.phase === 'question');
  assert.equal(q1.question.certa, null);
  assert.equal(q1.question.pergunta, 'Q1');

  // Ana e Beto acertam, Caio erra, Duda tenta responder duas vezes, Edu não responde.
  assert.equal((await emit(players[0], 'player:answer', { qIndex: 0, choice: 0 })).error, null);
  await sleep(600);
  assert.equal((await emit(players[1], 'player:answer', { qIndex: 0, choice: 0 })).error, null);
  assert.equal((await emit(players[2], 'player:answer', { qIndex: 0, choice: 1 })).error, null);
  assert.equal((await emit(players[3], 'player:answer', { qIndex: 0, choice: 0 })).error, null);
  assert.match((await emit(players[3], 'player:answer', { qIndex: 0, choice: 1 })).error, /já respondeu/);
  assert.match((await emit(players[4], 'player:answer', { qIndex: 1, choice: 0 })).error, /não está aberta/);
  const parcial = await host.until((s) => s.phase === 'question' && s.answered === 4);
  assert.equal(parcial.eligible, 5);

  // O tempo acaba no servidor e todos vão para a revelação juntos.
  const rev = await host.until((s) => s.phase === 'reveal', 6000);
  assert.equal(rev.acertos, 3);
  assert.equal(rev.erros, 2);
  assert.match((await emit(players[4], 'player:answer', { qIndex: 0, choice: 0 })).error, /não está aberta/);
  const edu = await players[4].until((s) => s.phase === 'reveal');
  assert.equal(edu.me.result.semResposta, true);
  assert.equal(edu.question.certa, 0);
  const ana = await players[0].until((s) => s.phase === 'reveal');
  const beto = await players[1].until((s) => s.phase === 'reveal');
  assert.ok(ana.me.score > beto.me.score, 'quem responde antes ganha mais');
  assert.ok(ana.me.score <= 1000 && beto.me.score >= 500);
  assert.equal(ana.me.result.posicao, 1);
  assert.equal(rev.ranking[0].name, 'Ana');

  // Reconexão: Caio perde a conexão e volta com o mesmo token, sem duplicar.
  const caioToken = joins[2].token;
  players[2].close();
  const caio2 = device({ role: 'player', token: caioToken });
  const back = await caio2.until((s) => !!s.me);
  assert.equal(back.me.name, 'Caio');
  assert.equal(back.me.result.correct, false);
  players[2] = caio2;

  // Ranking → pergunta 2 (pontos em dobro). Todos respondem → revela sem esperar o tempo.
  await emit(host, 'host:advance');
  await host.until((s) => s.phase === 'rank');
  await emit(host, 'host:advance');
  await host.until((s) => s.phase === 'question' && s.qIndex === 1);
  await Promise.all(players.map((p) => p.until((s) => s.phase === 'question' && s.qIndex === 1)));
  await Promise.all(players.map((p, i) => emit(p, 'player:answer', { qIndex: 1, choice: i === 4 ? 3 : 0 })));
  const rev2 = await host.until((s) => s.phase === 'reveal' && s.qIndex === 1, 3000);
  assert.equal(rev2.acertos, 1);
  const edu2 = await players[4].until((s) => s.phase === 'reveal' && s.qIndex === 1);
  assert.ok(edu2.me.result.gain >= 1000, 'última pergunta vale o dobro');
  assert.equal(edu2.dobro, true);

  // Pódio e nova partida.
  await emit(host, 'host:advance');
  await emit(host, 'host:advance');
  const pod = await host.until((s) => s.phase === 'podium');
  assert.equal(pod.podium.length, 3);
  assert.equal(pod.podium[0].name, 'Edu');
  await Promise.all(players.map((p) => p.until((s) => s.phase === 'podium')));

  // Resultados individuais: só com a chave do apresentador.
  assert.equal((await fetch(URL + '/api/resultados')).status, 403);
  assert.equal((await fetch(URL + '/api/resultados', { headers: { 'X-Host-Key': 'errada' } })).status, 403);
  assert.equal((await fetch(URL + '/resultados')).status, 200); // a página abre, os dados não
  const res = await (await fetch(URL + '/api/resultados', { headers: { 'X-Host-Key': 'segredo-teste' } })).json();
  assert.equal(res.perguntas.length, 2);
  assert.equal(res.jogadores, 5);
  const porNome = Object.fromEntries(res.perguntas[0].respostas.map((r) => [r.name, r]));
  assert.equal(porNome.Ana.escolha, 0);
  assert.equal(porNome.Ana.acertou, true);
  assert.ok(porNome.Ana.tempoMs > 0 && porNome.Ana.tempoMs < porNome.Beto.tempoMs);
  assert.equal(porNome.Edu.escolha, null);
  assert.equal(res.perguntas[1].respostas.find((r) => r.name === 'Edu').acertou, true);
  // Nada individual vaza para os celulares nem para o telão.
  for (const st of [host.last, ...players.map((p) => p.last)]) assert.ok(!JSON.stringify(st).includes('tempoMs'));

  await emit(host, 'host:reset');
  const novo = await players[0].until((s) => s.phase === 'lobby');
  assert.equal(novo.me.score, 0);
  assert.equal((await host.until((s) => s.phase === 'lobby')).players.length, 5);

  // O estado é salvo em disco para sobreviver a um reinício do servidor.
  await sleep(700);
  const salvo = JSON.parse(fs.readFileSync(path.join(DIR, 'state.json'), 'utf8'));
  assert.equal(salvo.players.length, 5);

  players.forEach((p) => p.close());
  host.close();
});
