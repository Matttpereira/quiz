// Ensaio: coloca N jogadores falsos na partida, que respondem sozinhos.
// Uso: npm run simular -- 12 http://localhost:3000
const { io } = require('socket.io-client');

const N = Number(process.argv[2]) || 8;
const URL = process.argv[3] || 'http://localhost:3000';
const NOMES = ['Ana', 'Beto', 'Carla', 'Davi', 'Elis', 'Fábio', 'Gabi', 'Hugo', 'Iara', 'João', 'Kátia', 'Léo', 'Mari', 'Nina', 'Otto', 'Paula', 'Rafa', 'Sofia', 'Téo', 'Vivi'];

for (let i = 0; i < N; i++) {
  const nome = (NOMES[i % NOMES.length] + (i >= NOMES.length ? ' ' + Math.floor(i / NOMES.length + 1) : '')).slice(0, 16);
  const s = io(URL, { auth: { role: 'player', token: '' }, forceNew: true });
  let respondida = -1;
  s.on('connect', () => {
    if (respondida !== -1) return;
    setTimeout(() => s.emit('player:join', { name: nome, tipo: (i * 7) % 20, cor: i % 7 }, (r) => {
      if (r.error) console.log(nome, '→', r.error);
      else console.log(nome, 'entrou');
    }), i * 400);
  });
  s.on('state', (st) => {
    if (st.phase !== 'question' || respondida === st.qIndex || !st.question) return;
    respondida = st.qIndex;
    const espera = 1000 + Math.random() * (st.seconds - 3) * 1000;
    setTimeout(() => {
      const escolha = Math.floor(Math.random() * st.question.opcoes.length);
      s.emit('player:answer', { qIndex: st.qIndex, choice: escolha }, () => {});
    }, espera);
  });
}
console.log(`${N} jogadores simulados conectando em ${URL} (Ctrl+C para sair)`);
