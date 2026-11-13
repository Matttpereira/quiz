// Testes das regras do jogo com relógio falso (sem rede).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Game } = require('../server/game');

const QUIZ = {
  titulo: 'Teste', segundosPorPergunta: 20, segundosContagem: 3, dobroNaUltima: true, revelarQuandoTodosResponderem: true,
  perguntas: [
    { pergunta: 'P1', opcoes: ['a', 'b'], certa: 1 },
    { pergunta: 'P2', opcoes: ['a', 'b', 'c', 'd'], certa: 2 }
  ]
};

function setup(quiz = QUIZ) {
  let clock = 1_000_000;
  let timers = [];
  const g = new Game(quiz, {
    now: () => clock,
    setTimer: (fn, ms) => { const t = { fn, at: clock + ms }; timers.push(t); return t; },
    clearTimer: (t) => { timers = timers.filter((x) => x !== t); }
  });
  const tick = (ms) => {
    const end = clock + ms;
    for (;;) {
      const next = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      timers = timers.filter((t) => t !== next);
      clock = next.at;
      next.fn();
    }
    clock = end;
  };
  return { g, tick };
}

function join(g, name, tipo = 0, cor = 0) {
  const r = g.join({ name, tipo, cor });
  assert.ok(r.player, r.error);
  g.connect(r.player);
  return r.player;
}

test('valida apelidos: vazio, longo e duplicado (sem diferenciar maiúsculas/acentos)', () => {
  const { g } = setup();
  assert.match(g.join({ name: '   ', tipo: 0, cor: 0 }).error, /apelido/);
  assert.match(g.join({ name: 'x'.repeat(17), tipo: 0, cor: 0 }).error, /16/);
  join(g, 'João');
  assert.match(g.join({ name: '  joao ', tipo: 1, cor: 1 }).error, /já está na sala/);
  assert.match(g.join({ name: 'Ana', tipo: 99, cor: 0 }).error, /Personagem/);
  assert.equal(g.join({ name: '<b>Bia</b>', tipo: 1, cor: 1 }).player.name, 'bBia/b');
});

test('não começa sem jogadores e segue o fluxo completo', () => {
  const { g, tick } = setup();
  assert.match(g.start(), /Ninguém/);
  const a = join(g, 'Ana'), b = join(g, 'Beto'), c = join(g, 'Caio');
  assert.equal(g.advance(), null);
  assert.equal(g.phase, 'countdown');
  assert.match(g.answer(a.id, 0, 1), /não está aberta/); // antes de liberar
  tick(3000);
  assert.equal(g.phase, 'question');
  assert.equal(g.playerView(a).question.certa, null); // resposta certa não vaza

  tick(5000); // 15 s restantes
  assert.equal(g.answer(a.id, 0, 1), null);
  assert.match(g.answer(a.id, 0, 0), /já respondeu/);
  tick(5000); // 10 s restantes
  assert.equal(g.answer(b.id, 0, 0), null); // errada
  assert.equal(g.phase, 'question'); // Caio ainda não respondeu
  tick(10_400); // tempo acaba, Caio sem resposta
  assert.equal(g.phase, 'reveal');
  assert.match(g.answer(c.id, 0, 1), /não está aberta/);

  assert.equal(a.score, 500 + Math.round(500 * 15 / 20));
  assert.equal(b.score, 0);
  const hv = g.hostView();
  assert.equal(hv.acertos, 1);
  assert.equal(hv.erros, 2);
  assert.equal(hv.question.certa, 1);
  assert.equal(g.playerView(c).me.result.semResposta, true);
  assert.equal(g.playerView(a).me.result.posicao, 1);

  g.advance(); assert.equal(g.phase, 'rank');
  g.back(); assert.equal(g.phase, 'reveal');
  g.advance(); g.advance(); assert.equal(g.phase, 'countdown'); assert.equal(g.qIndex, 1);
  tick(3000);
  // Última pergunta vale o dobro; todos respondem → revela sem esperar o tempo.
  g.answer(a.id, 1, 2); g.answer(b.id, 1, 2);
  assert.equal(g.phase, 'question');
  g.answer(c.id, 1, 2);
  assert.equal(g.phase, 'reveal');
  assert.equal(a.streak, 2);
  assert.equal(c.score, 2000); // respondeu no instante 0 → 1000 × 2
  g.advance(); g.advance();
  assert.equal(g.phase, 'podium');
  assert.equal(g.hostView().podium.length, 3);
  assert.equal(g.hostView().podium[0].name, 'Ana');
});

test('resposta enviada após o fim do tempo é recusada', () => {
  const { g, tick } = setup();
  const a = join(g, 'Ana');
  join(g, 'Beto');
  g.start(); tick(3000);
  tick(20_000 + 350);
  // O timer de revelação dispara com 300 ms de tolerância; depois disso, nada entra.
  assert.equal(g.phase, 'reveal');
  assert.match(g.answer(a.id, 0, 1), /não está aberta/);
});

test('reconexão pelo token não duplica jogador e nova partida zera pontos', () => {
  const { g, tick } = setup();
  const a = join(g, 'Ana');
  g.disconnect(a);
  assert.equal(g.byToken(a.token), a);
  g.connect(a);
  assert.equal(g.players.size, 1);
  g.start(); tick(3000); g.answer(a.id, 0, 1);
  assert.ok(a.score > 0);
  g.reset();
  assert.equal(g.phase, 'lobby');
  assert.equal(a.score, 0);
  assert.equal(g.players.size, 1);
});

test('snapshot/restore retoma a pergunta em andamento', () => {
  const { g, tick } = setup();
  const a = join(g, 'Ana');
  join(g, 'Beto');
  g.start(); tick(3000); g.answer(a.id, 0, 1);
  const snap = JSON.parse(JSON.stringify(g.snapshot()));
  const { g: g2, tick: tick2 } = setup();
  g2.restore(snap);
  assert.equal(g2.phase, 'question');
  assert.equal(g2.byToken(a.token).answers[0].choice, 1);
  tick2(25_000);
  assert.equal(g2.phase, 'reveal');
});

test('quem saiu da sala antes do início não entra no ranking', () => {
  const { g, tick } = setup();
  const a = join(g, 'Ana');
  const b = join(g, 'Beto');
  g.disconnect(b);
  tick(46_000); // passou a janela de presença
  assert.equal(g.start(), null);
  assert.deepEqual([...g.players.keys()], [a.id]);
});

test('resultados por pergunta: escolha, tempo, pontos e "sem resposta"', () => {
  const { g, tick } = setup();
  const a = join(g, 'Ana'), b = join(g, 'Beto'), c = join(g, 'Caio');
  assert.deepEqual(g.results().perguntas, []); // nada revelado ainda
  g.start(); tick(3000);
  tick(4000); g.answer(a.id, 0, 1); // certa, 4 s
  tick(2000); g.answer(b.id, 0, 0); // errada, 6 s
  tick(20_000); // Caio não respondeu
  const r = g.results();
  assert.equal(r.jogadores, 3);
  assert.equal(r.perguntas.length, 1);
  const [q] = r.perguntas;
  assert.equal(q.certa, 1);
  const por = Object.fromEntries(q.respostas.map((x) => [x.name, x]));
  assert.deepEqual([por.Ana.escolha, por.Ana.acertou, por.Ana.tempoMs, por.Ana.pontos], [1, true, 4000, a.score]);
  assert.deepEqual([por.Beto.escolha, por.Beto.acertou, por.Beto.tempoMs, por.Beto.pontos], [0, false, 6000, 0]);
  assert.deepEqual([por.Caio.escolha, por.Caio.tempoMs], [null, null]);
  // O telão continua recebendo só os totais, sem respostas individuais.
  const hv = JSON.stringify(g.hostView());
  assert.ok(!hv.includes('"escolha"') && !hv.includes('tempoMs'));
  // Sobrevive a reinício e some na nova partida.
  const { g: g2 } = setup();
  g2.restore(JSON.parse(JSON.stringify(g.snapshot())));
  assert.equal(g2.results().perguntas[0].respostas.length, 3);
  g.reset();
  assert.deepEqual(g.results().perguntas, []);
});
