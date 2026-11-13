// Teste de carga: N jogadores entram ao mesmo tempo e (com HOST_KEY) jogam a partida inteira.
// Uso:  npm run carga -- 50 https://seu-app.onrender.com
//       $env:HOST_KEY="..."; npm run carga -- 50 https://seu-app.onrender.com   (partida completa)
// Sem HOST_KEY só testa a entrada na sala. Atenção: com HOST_KEY a partida real é jogada e
// ao final volta para a sala com "Nova partida"; não rode durante uma apresentação.
const { io } = require('socket.io-client');

const N = Number(process.argv[2]) || 50;
const URL = (process.argv[3] || 'http://localhost:3000').replace(/\/+$/, '');
const HOST_KEY = process.env.HOST_KEY || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0; };
const ms = (arr) => `mediana ${pct(arr, 50)} ms · 95% ${pct(arr, 95)} ms · pior ${pct(arr, 100)} ms`;

const erros = [];
const joinLat = [];
const answerLat = [];
const phaseLag = []; // atraso entre o telão e cada celular ao mudar de fase
let desconexoes = 0;

function cliente(auth) {
  const s = io(URL, { auth, forceNew: true, reconnection: true });
  s.last = null;
  s.seen = new Map(); // "fase:pergunta" -> horário em que chegou
  s.on('state', (st) => { s.last = st; const k = st.phase + ':' + st.qIndex; if (!s.seen.has(k)) s.seen.set(k, Date.now()); });
  s.on('disconnect', (r) => { if (r !== 'io client disconnect') desconexoes++; });
  s.on('connect_error', (e) => erros.push('conexão: ' + e.message));
  s.until = async (pred, limite = 60_000) => {
    const fim = Date.now() + limite;
    while (Date.now() < fim) { if (s.last && pred(s.last)) return s.last; await sleep(25); }
    throw new Error('tempo esgotado esperando estado');
  };
  return s;
}
const emit = (s, ev, data) => new Promise((resolve) => {
  const t0 = Date.now();
  const done = (err, r) => resolve({ ...(err ? { error: "sem resposta em 15 s" } : r), ms: Date.now() - t0 });
  if (data === undefined) s.timeout(15_000).emit(ev, done); else s.timeout(15_000).emit(ev, data, done);
});

(async () => {
  console.log(`Testando ${N} jogadores em ${URL}${HOST_KEY ? ' (partida completa)' : ' (só entrada na sala)'}\n`);
  const t0 = Date.now();
  let host = null;
  if (HOST_KEY) {
    host = cliente({ role: 'host', key: HOST_KEY });
    await new Promise((resolve, reject) => { host.on('host:ok', resolve); host.on('host:denied', () => reject(new Error('HOST_KEY recusada'))); });
    const st = await host.until((s) => true);
    if (st.phase !== 'lobby') throw new Error(`A partida não está na sala de espera (fase: ${st.phase}). Clique em "Nova partida" antes.`);
  }

  // 1) Todos entram praticamente ao mesmo tempo (espalhados em 2 s, como num QR Code lido em sala).
  const tag = Math.random().toString(36).slice(2, 5);
  const players = [];
  await Promise.all(Array.from({ length: N }, async (_, i) => {
    await sleep(Math.random() * 2000);
    const s = cliente({ role: 'player', token: '' });
    players.push(s);
    await new Promise((r) => s.on('connect', r));
    const r = await emit(s, 'player:join', { name: `Teste ${tag}${i + 1}`, tipo: i % 20, cor: i % 7 });
    if (r.error) erros.push('entrada: ' + r.error); else joinLat.push(r.ms);
  }));
  console.log(`Entrada: ${joinLat.length}/${N} jogadores na sala em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(`  tempo de resposta do servidor: ${ms(joinLat)}`);
  if (host) {
    const lobby = await host.until((s) => s.players && s.players.filter((p) => p.name.startsWith('Teste ' + tag)).length === joinLat.length, 20_000)
      .catch(() => null);
    if (lobby) console.log(`  telão mostra todos os ${joinLat.length} jogadores`);
    else erros.push('o telão não mostrou todos os jogadores');
  }

  if (host) {
    // 2) Partida completa: cada celular responde num momento aleatório.
    await emit(host, 'host:advance');
    const total = host.last.total;
    let acertoTotal = 0;
    for (let q = 0; q < total; q++) {
      const st = await host.until((s) => s.phase === 'question' && s.qIndex === q);
      const tQ = Date.now();
      await Promise.all(players.map(async (p) => {
        const ps = await p.until((s) => s.phase === 'question' && s.qIndex === q);
        await sleep(500 + Math.random() * Math.min(8000, (st.seconds - 2) * 1000));
        const r = await emit(p, 'player:answer', { qIndex: q, choice: Math.floor(Math.random() * ps.question.opcoes.length) });
        if (r.error) erros.push(`resposta P${q + 1}: ${r.error}`); else answerLat.push(r.ms);
      }));
      const rev = await host.until((s) => s.phase === 'reveal' && s.qIndex === q);
      acertoTotal += rev.acertos;
      // Todos os celulares receberam o resultado?
      const res = await Promise.all(players.map((p) => p.until((s) => s.phase === 'reveal' && s.qIndex === q, 15_000).then(() => true, () => false)));
      const semResultado = res.filter((x) => !x).length;
      if (semResultado) erros.push(`P${q + 1}: ${semResultado} celulares não receberam o resultado`);
      const tHost = host.seen.get('reveal:' + q);
      players.forEach((p) => { const t = p.seen.get('reveal:' + q); if (t && tHost) phaseLag.push(Math.abs(t - tHost)); });
      console.log(`Pergunta ${q + 1}: ${rev.answered}/${rev.eligible} responderam, ${rev.acertos} acertaram (rodada em ${((Date.now() - tQ) / 1000).toFixed(1)} s)`);
      await emit(host, 'host:advance'); // ranking
      await host.until((s) => s.phase === 'rank');
      await emit(host, 'host:advance'); // próxima ou pódio
    }
    const pod = await host.until((s) => s.phase === 'podium');
    console.log(`\nPódio: ${pod.podium.map((p, i) => `${i + 1}º ${p.name} (${p.score} pts)`).join(' · ')}`);
    // Confere se a pontuação de cada celular bate com o servidor.
    const pontos = players.map((p) => p.last && p.last.me ? p.last.me.score : null);
    if (pontos.some((x) => x === null)) erros.push('algum celular ficou sem placar final');
    console.log(`Respostas: ${answerLat.length}/${N * total} registradas · ${ms(answerLat)}`);
    console.log(`Sincronia telão × celulares na revelação: ${ms(phaseLag)}`);
    await emit(host, 'host:reset');
  }

  console.log(`\nDesconexões inesperadas: ${desconexoes}`);
  console.log(erros.length ? `ERROS (${erros.length}):\n  ` + [...new Set(erros)].join('\n  ') : 'Nenhum erro.');
  players.forEach((p) => p.close());
  if (host) host.close();
  process.exit(erros.length ? 1 : 0);
})().catch((e) => { console.error('Falhou:', e.message); process.exit(1); });
