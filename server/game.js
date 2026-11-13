// Regras do quiz. Este módulo é o estado oficial da partida: nenhum celular
// ou telão calcula tempo, acerto ou pontuação por conta própria.
const crypto = require('crypto');

const CORES = ['#FF6B4A', '#3D8BFF', '#FFC43D', '#2EC4A6', '#B88CFF', '#FF8FC7', '#C6F432'];
const TOTAL_PERSONAGENS = 20; // os 20 da tela "Escolha de personagem"
const MAX_JOGADORES = 300;
const NOME_MAX = 16;
const PRESENCA_MS = 45_000; // celular bloqueado por pouco tempo continua "na sala"
const TOLERANCIA_MS = 300; // latência aceita para resposta enviada no último instante

const FASES = ['lobby', 'countdown', 'question', 'reveal', 'rank', 'podium'];

function normalizarNome(nome) {
  return String(nome ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function chaveNome(nome) {
  return normalizarNome(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function validarQuiz(quiz) {
  if (!Array.isArray(quiz.perguntas) || quiz.perguntas.length === 0) throw new Error('quiz.json: "perguntas" vazio');
  quiz.perguntas.forEach((q, i) => {
    if (!q.pergunta || !Array.isArray(q.opcoes) || q.opcoes.length < 2 || q.opcoes.length > 4) {
      throw new Error(`quiz.json: pergunta ${i + 1} precisa de texto e de 2 a 4 opções`);
    }
    if (!Number.isInteger(q.certa) || q.certa < 0 || q.certa >= q.opcoes.length) {
      throw new Error(`quiz.json: pergunta ${i + 1} tem "certa" inválida`);
    }
  });
}

class Game {
  constructor(quiz, { now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, onChange = () => {} } = {}) {
    validarQuiz(quiz);
    this.quiz = quiz;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.onChange = onChange;
    this.timer = null;
    this.players = new Map(); // id -> jogador
    this.reset(false);
  }

  get seconds() { return this.quiz.segundosPorPergunta ?? 20; }
  get countdownSeconds() { return this.quiz.segundosContagem ?? 3; }
  get total() { return this.quiz.perguntas.length; }
  get current() { return this.quiz.perguntas[this.qIndex]; }
  isLast(q = this.qIndex) { return q === this.total - 1; }

  // ---------- jogadores ----------

  checkName(nome, exceptId) {
    const n = normalizarNome(nome);
    if (!n) return 'Digite um apelido.';
    if (n.length > NOME_MAX) return `Use no máximo ${NOME_MAX} caracteres.`;
    const k = chaveNome(n);
    for (const p of this.players.values()) {
      if (p.id !== exceptId && chaveNome(p.name) === k) return 'Esse apelido já está na sala. Escolha outro.';
    }
    return null;
  }

  join({ name, tipo, cor }, existingId) {
    const err = this.checkName(name, existingId);
    if (err) return { error: err };
    const t = Number(tipo), c = Number(cor);
    if (!Number.isInteger(t) || t < 0 || t >= TOTAL_PERSONAGENS) return { error: 'Personagem inválido.' };
    if (!Number.isInteger(c) || c < 0 || c >= CORES.length) return { error: 'Cor inválida.' };

    const existing = existingId && this.players.get(existingId);
    if (existing) {
      existing.name = normalizarNome(name);
      existing.tipo = t;
      existing.cor = c;
      this.changed();
      return { player: existing };
    }
    if (this.players.size >= MAX_JOGADORES) return { error: 'A sala está cheia.' };
    const player = {
      id: crypto.randomBytes(6).toString('hex'),
      token: crypto.randomBytes(18).toString('base64url'),
      name: normalizarNome(name),
      tipo: t,
      cor: c,
      joinedAt: this.now(),
      connected: 0, // nº de abas conectadas
      lastSeen: this.now(),
      score: 0,
      streak: 0,
      answers: {} // qIndex -> { choice, at, correct, gain }
    };
    this.players.set(player.id, player);
    this.changed();
    return { player };
  }

  byToken(token) {
    if (!token) return null;
    for (const p of this.players.values()) if (p.token === token) return p;
    return null;
  }

  connect(p) { p.connected++; p.lastSeen = this.now(); this.changed(); }
  disconnect(p) {
    p.connected = Math.max(0, p.connected - 1);
    p.lastSeen = this.now();
    this.changed();
    // Some do telão quando passa a janela de presença, se não voltar.
    this.setTimer(() => this.changed(), PRESENCA_MS + 100);
  }
  present(p) { return p.connected > 0 || this.now() - p.lastSeen < PRESENCA_MS; }

  // ---------- fluxo da partida ----------

  reset(notify = true) {
    this.clear();
    this.phase = 'lobby';
    this.qIndex = -1;
    this.phaseEndsAt = null;
    this.questionStartedAt = null;
    this.eligible = new Set();
    this.rankBefore = [];
    this.rankAfter = [];
    this.startedAt = null;
    this.questionStarts = []; // horário em que cada pergunta abriu (para o tempo de resposta)
    this.eligibleByQ = []; // quem valia em cada pergunta (para contar "Sem resposta")
    for (const p of [...this.players.values()]) {
      if (!this.present(p)) { this.players.delete(p.id); continue; }
      p.score = 0; p.streak = 0; p.answers = {};
    }
    if (notify) this.changed();
  }

  start() {
    if (this.phase !== 'lobby') return 'A partida já começou.';
    if (![...this.players.values()].some((p) => this.present(p))) return 'Ninguém entrou ainda.';
    // Quem saiu da sala antes do início não entra no ranking.
    for (const p of [...this.players.values()]) if (!this.present(p)) this.players.delete(p.id);
    this.startedAt = this.now();
    this.goCountdown(0);
    return null;
  }

  goCountdown(q) {
    this.clear();
    this.qIndex = q;
    this.phase = 'countdown';
    this.phaseEndsAt = this.now() + this.countdownSeconds * 1000;
    this.rankBefore = this.ranking();
    this.timer = this.setTimer(() => this.goQuestion(), this.countdownSeconds * 1000);
    this.changed();
  }

  goQuestion() {
    if (this.phase !== 'countdown') return;
    this.clear();
    this.phase = 'question';
    this.questionStartedAt = this.now();
    this.questionStarts[this.qIndex] = this.questionStartedAt;
    this.phaseEndsAt = this.questionStartedAt + this.seconds * 1000;
    this.eligible = new Set([...this.players.values()].filter((p) => this.present(p)).map((p) => p.id));
    this.timer = this.setTimer(() => this.goReveal(), this.seconds * 1000 + TOLERANCIA_MS);
    this.changed();
  }

  answer(playerId, qIndex, choice) {
    const p = this.players.get(playerId);
    if (!p) return 'Jogador não encontrado.';
    if (this.phase !== 'question' || qIndex !== this.qIndex) return 'Essa pergunta não está aberta.';
    const at = this.now();
    if (at > this.phaseEndsAt + TOLERANCIA_MS) return 'O tempo acabou.';
    if (p.answers[this.qIndex]) return 'Você já respondeu.';
    const c = Number(choice);
    if (!Number.isInteger(c) || c < 0 || c >= this.current.opcoes.length) return 'Opção inválida.';
    p.answers[this.qIndex] = { choice: c, at };
    this.eligible.add(p.id); // quem entrou durante a pergunta também conta
    this.changed();
    if (this.quiz.revelarQuandoTodosResponderem !== false && this.allAnswered()) this.goReveal();
    return null;
  }

  answeredCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.answers[this.qIndex]) n++;
    return n;
  }

  // Todos os jogadores conectados já responderam?
  allAnswered() {
    let pending = 0;
    for (const id of this.eligible) {
      const p = this.players.get(id);
      if (p && !p.answers[this.qIndex] && p.connected > 0) pending++;
    }
    return pending === 0 && this.answeredCount() > 0;
  }

  eligibleCount() {
    let n = 0;
    for (const id of this.eligible) {
      const p = this.players.get(id);
      if (p && (p.answers[this.qIndex] || this.present(p))) n++;
    }
    return n;
  }

  goReveal() {
    if (this.phase !== 'question') return;
    this.clear();
    const q = this.current;
    const totalMs = this.seconds * 1000;
    for (const p of this.players.values()) {
      const a = p.answers[this.qIndex];
      if (a && a.choice === q.certa) {
        const restante = Math.max(0, Math.min(totalMs, this.phaseEndsAt - a.at));
        let gain = 500 + Math.round((500 * restante) / totalMs);
        if (this.isLast() && this.quiz.dobroNaUltima !== false) gain *= 2;
        a.correct = true;
        a.gain = gain;
        p.score += gain;
        p.streak += 1;
      } else {
        if (a) { a.correct = false; a.gain = 0; }
        p.streak = 0;
      }
    }
    this.phase = 'reveal';
    this.phaseEndsAt = null;
    this.rankAfter = this.ranking();
    this.eligibleByQ[this.qIndex] = [...this.eligible];
    this.changed();
  }

  // Botão principal do apresentador: avança conforme a fase atual.
  advance() {
    switch (this.phase) {
      case 'lobby': return this.start();
      case 'countdown': this.goQuestion(); return null;
      case 'question': this.goReveal(); return null;
      case 'reveal': this.phase = 'rank'; this.changed(); return null;
      case 'rank':
        if (this.isLast()) { this.phase = 'podium'; this.changed(); }
        else this.goCountdown(this.qIndex + 1);
        return null;
      default: return 'Nada para avançar.';
    }
  }

  // Botão "voltar": só navega entre visões que não mexem na pontuação.
  back() {
    if (this.phase === 'rank') { this.phase = 'reveal'; this.changed(); return null; }
    if (this.phase === 'podium') { this.phase = 'rank'; this.changed(); return null; }
    return 'Não dá para voltar agora sem bagunçar a pontuação.';
  }

  ranking() {
    return [...this.players.values()]
      .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
      .map((p) => p.id);
  }

  clear() { if (this.timer) this.clearTimer(this.timer); this.timer = null; }
  changed() { this.onChange(); }

  // ---------- visões enviadas aos dispositivos ----------

  questionView() {
    if (this.qIndex < 0) return null;
    const q = this.current;
    const revealed = ['reveal', 'rank', 'podium'].includes(this.phase);
    return {
      pergunta: this.phase === 'countdown' ? null : q.pergunta,
      opcoes: this.phase === 'countdown' ? null : q.opcoes,
      certa: revealed ? q.certa : null // a resposta certa só sai do servidor na revelação
    };
  }

  baseView() {
    return {
      titulo: this.quiz.titulo,
      phase: this.phase,
      qIndex: this.qIndex,
      total: this.total,
      seconds: this.seconds,
      phaseEndsAt: this.phaseEndsAt,
      serverNow: this.now(),
      isLast: this.qIndex >= 0 && this.isLast(),
      dobro: this.qIndex >= 0 && this.isLast() && this.quiz.dobroNaUltima !== false,
      question: this.questionView()
    };
  }

  pub(p) {
    return { id: p.id, name: p.name, tipo: p.tipo, cor: CORES[p.cor] };
  }

  hostView() {
    const v = this.baseView();
    v.players = [...this.players.values()].filter((p) => this.present(p)).sort((a, b) => a.joinedAt - b.joinedAt).map((p) => this.pub(p));
    if (this.phase === 'question' || this.phase === 'countdown') {
      v.answered = this.phase === 'question' ? this.answeredCount() : 0;
      v.eligible = this.phase === 'question' ? Math.max(this.eligibleCount(), v.answered) : v.players.length;
    }
    if (['reveal', 'rank', 'podium'].includes(this.phase)) {
      let acertos = 0, erros = 0;
      for (const p of this.players.values()) {
        const a = p.answers[this.qIndex];
        if (a && a.correct) acertos++;
        else if (a || this.eligible.has(p.id)) erros++;
      }
      const before = new Map(this.rankBefore.map((id, i) => [id, i]));
      v.answered = this.answeredCount();
      v.eligible = Math.max(this.eligible.size, v.answered);
      v.acertos = acertos;
      v.erros = erros;
      v.ranking = this.rankAfter.slice(0, 5).map((id, i) => {
        const p = this.players.get(id);
        const a = p.answers[this.qIndex];
        const gain = a && a.correct ? a.gain : 0;
        return {
          ...this.pub(p),
          posAfter: i,
          posBefore: before.has(id) ? before.get(id) : this.rankBefore.length,
          scoreBefore: p.score - gain,
          scoreAfter: p.score,
          gain,
          streak: p.streak
        };
      });
      v.podium = this.rankAfter.slice(0, 3).map((id) => {
        const p = this.players.get(id);
        return { ...this.pub(p), score: p.score };
      });
    }
    return v;
  }

  playerView(p) {
    const v = this.baseView();
    const a = this.qIndex >= 0 ? p.answers[this.qIndex] : null;
    v.me = {
      id: p.id,
      name: p.name,
      tipo: p.tipo,
      corIndex: p.cor,
      cor: CORES[p.cor],
      score: p.score,
      streak: p.streak,
      choice: a ? a.choice : null,
      answeredQ: a ? this.qIndex : null
    };
    if (['reveal', 'rank', 'podium'].includes(this.phase)) {
      const posAfter = this.rankAfter.indexOf(p.id);
      const posBefore = this.rankBefore.indexOf(p.id);
      v.me.result = {
        correct: !!(a && a.correct),
        gain: a && a.correct ? a.gain : 0,
        semResposta: !a,
        posicao: posAfter + 1,
        posicaoAntes: posBefore >= 0 ? posBefore + 1 : null,
        jogadores: this.rankAfter.length
      };
    }
    return v;
  }

  // Respostas individuais de cada pergunta já revelada. Só vai para quem organiza:
  // telão e celulares continuam recebendo apenas os totais.
  results() {
    const perguntas = [];
    for (let q = 0; q < this.eligibleByQ.length; q++) {
      const ids = this.eligibleByQ[q];
      if (!ids) continue;
      const qq = this.quiz.perguntas[q];
      const respostas = ids.map((id) => this.players.get(id)).filter(Boolean).map((p) => {
        const a = p.answers[q];
        return {
          ...this.pub(p),
          escolha: a ? a.choice : null,
          acertou: !!(a && a.correct),
          tempoMs: a && this.questionStarts[q] ? Math.max(0, a.at - this.questionStarts[q]) : null,
          pontos: a && a.correct ? a.gain : 0
        };
      });
      perguntas.push({
        num: q + 1,
        pergunta: qq.pergunta,
        opcoes: qq.opcoes,
        certa: qq.certa,
        dobro: this.isLast(q) && this.quiz.dobroNaUltima !== false,
        respostas
      });
    }
    return {
      titulo: this.quiz.titulo,
      startedAt: this.startedAt,
      totalPerguntas: this.total,
      jogadores: new Set(this.eligibleByQ.flat()).size,
      perguntas
    };
  }

  // ---------- persistência simples (sobrevive a reinício do processo) ----------

  snapshot() {
    return {
      phase: this.phase, qIndex: this.qIndex, phaseEndsAt: this.phaseEndsAt, questionStartedAt: this.questionStartedAt,
      startedAt: this.startedAt, questionStarts: this.questionStarts, eligibleByQ: this.eligibleByQ,
      eligible: [...this.eligible], rankBefore: this.rankBefore, rankAfter: this.rankAfter,
      players: [...this.players.values()].map((p) => ({ ...p, connected: 0 }))
    };
  }

  restore(s) {
    if (!s || !FASES.includes(s.phase)) return;
    this.players = new Map((s.players || []).map((p) => [p.id, { ...p, connected: 0, lastSeen: this.now() }]));
    this.qIndex = Math.min(s.qIndex, this.total - 1);
    this.phase = s.phase;
    this.phaseEndsAt = s.phaseEndsAt;
    this.questionStartedAt = s.questionStartedAt;
    this.eligible = new Set(s.eligible || []);
    this.rankBefore = s.rankBefore || [];
    this.rankAfter = s.rankAfter || [];
    this.startedAt = s.startedAt ?? null;
    this.questionStarts = s.questionStarts || [];
    this.eligibleByQ = s.eligibleByQ || [];
    if (this.qIndex < 0 && this.phase !== 'lobby') this.phase = 'lobby';
    // Retoma o relógio de onde parou.
    const left = Math.max(0, (this.phaseEndsAt ?? 0) - this.now());
    if (this.phase === 'countdown') this.timer = this.setTimer(() => this.goQuestion(), left);
    if (this.phase === 'question') this.timer = this.setTimer(() => this.goReveal(), left + TOLERANCIA_MS);
  }
}

module.exports = { Game, CORES, normalizarNome, chaveNome, NOME_MAX };
