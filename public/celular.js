// Celular de cada jogador: Entrar → Personagem → Espera → Responder.
import { html, render, useState, useEffect } from '/vendor/preact.js';
import { Boneco, syncClock, useNow, secondsLeft, fmt, CORES, LETRAS, CORES_OPCAO } from '/shared.js';

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};

// O token salvo no aparelho devolve o mesmo jogador depois de recarregar ou cair a conexão.
const socket = window.io({ autoConnect: false, auth: { role: 'player', token: store.get('quiz.token') || '' } });
syncClock(socket);
const send = (ev, data) => new Promise((resolve) => socket.timeout(6000).emit(ev, data, (err, r) => resolve(err ? { error: 'Sem conexão. Tente de novo.' } : r)));

const COL_NAMES = ['coral', 'azul', 'amarelo', 'verde-água', 'lilás', 'rosa', 'limão'];
const C = 'Criaturas', A = 'Animais', D = 'Desenho antigo';
const PERSONAGENS = [
  ['Ciclope', C], ['Peludo', C], ['Gato', A], ['Cachorro', A], ['Sapo', A],
  ['Molenga', D], ['Polvo', A], ['Fantasma', C], ['Coelho', A], ['Urso', A],
  ['Pinguim', A], ['Robô', C], ['Alien', C], ['Dino', A], ['Pato', A],
  ['Coruja', A], ['Porquinho', A], ['Raposa', A], ['Geleca', C], ['DooDoo', D]
];
const SETA = html`<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7"></path></svg>`;
const CTA = 'display:flex;align-items:center;justify-content:center;gap:10px;border-radius:999px;background:#19EB82;color:#232427;border:none;cursor:pointer;font-family:Unbounded,system-ui,sans-serif;font-weight:900;box-shadow:0 6px 0 #00A578;width:100%';

// ---------- Celular · 1 Entrar ----------

function Entrar({ draft, setDraft, online, erro, onNext }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(erro || '');
  useEffect(() => setMsg(erro || ''), [erro]);
  const next = async (e) => {
    e.preventDefault();
    const nome = draft.name.trim();
    if (!nome) { setMsg('Digite um apelido.'); return; }
    setBusy(true);
    const r = await send('player:checkName', nome);
    setBusy(false);
    if (r.error) { setMsg(r.error); return; }
    onNext();
  };
  const teaser = [{ c: '#B88CFF', t: 12, h: 72, cls: 'wig1' }, { c: '#FF6B4A', t: 0, h: 84, cls: 'wig2' }, { c: '#FFC43D', t: 19, h: 100, cls: 'wig1' }, { c: '#2EC4A6', t: 10, h: 84, cls: 'wig2' }, { c: '#3D8BFF', t: 7, h: 72, cls: 'wig1' }];
  return html`<form class="tela" onSubmit=${next} style="background:#232427;color:#E7E6E6;font-family:Manrope,system-ui,sans-serif;padding-left:24px;padding-right:24px;gap:28px">
  <div style="display:flex;flex-direction:column;gap:6px">
    <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:16px;letter-spacing:.04em;color:#19EB82">${window.__titulo || ''}</div>
    <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:32px;line-height:1.1">Bora jogar?</div>
  </div>
  <div style="display:flex;align-items:center;gap:12px;background:#313235;border-radius:16px;padding:14px 16px" role="status">
    <div style=${'width:36px;height:36px;border-radius:50%;background:' + (online ? '#19EB82' : '#44464B') + ';color:#232427;display:flex;align-items:center;justify-content:center;flex-shrink:0'}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6"></path></svg>
    </div>
    <div style="display:flex;flex-direction:column;gap:2px">
      <div style="font-weight:800;font-size:16px">${online ? 'Você está na sala!' : 'Conectando à sala…'}</div>
      <div style="font-size:14px;color:#A9A8AC">${online ? 'Conectado pelo QR code do telão' : 'Confira sua internet'}</div>
    </div>
  </div>
  <div style="display:flex;flex-direction:column;gap:8px">
    <label for="nick" style="font-size:14px;font-weight:800;letter-spacing:.1em;color:#A9A8AC">SEU APELIDO</label>
    <input id="nick" value=${draft.name} maxlength="16" autocomplete="nickname" enterkeyhint="next" placeholder="Como vão te chamar no telão"
      onInput=${(e) => { setDraft({ ...draft, name: e.currentTarget.value }); setMsg(''); }}
      aria-invalid=${msg ? 'true' : 'false'} aria-describedby="nick-erro"
      style=${'font-weight:700;font-size:18px;background:#313235;color:#E7E6E6;border:2px solid ' + (msg ? '#FF6B4A' : '#44464B') + ';border-radius:16px;padding:14px 16px;height:56px;box-sizing:border-box;width:100%'} />
    <div id="nick-erro" role="alert" style="min-height:20px;font-size:14px;font-weight:700;color:#FF6B4A">${msg}</div>
  </div>
  <div style="display:flex;justify-content:center;align-items:flex-end;gap:6px;margin-top:auto" aria-hidden="true">
    ${teaser.map((a) => html`<div class=${a.cls} style="display:flex"><${Boneco} cor=${a.c} tipo=${a.t} tam=${a.h} /></div>`)}
  </div>
  <button disabled=${busy || !online} style=${CTA + ';height:64px;font-size:20px;opacity:' + (busy || !online ? '.6' : '1')}>Escolher personagem ${SETA}</button>
</form>`;
}

// ---------- Celular · 2 Escolha de personagem ----------

function Personagem({ draft, setDraft, onBack, onDone, editando }) {
  const [tab, setTab] = useState('todos');
  const [flip, setFlip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const { sel, cor } = draft;
  const tabs = [['todos', 'Todos'], [C, C], [A, A], [D, D]];
  const pronto = async () => {
    setBusy(true); setMsg('');
    const r = await onDone();
    setBusy(false);
    if (r && r.error) setMsg(r.error);
  };
  return html`<div class="tela fixa" style="background:#232427;color:#E7E6E6;font-family:Manrope,system-ui,sans-serif;gap:14px">
  <div style="display:flex;justify-content:space-between;align-items:center">
    <button onClick=${onBack} aria-label="Voltar" style="width:44px;height:44px;border-radius:50%;background:#313235;color:#E7E6E6;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;padding:0">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>
    </button>
    <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:20px">Escolha seu personagem</div>
    <div style="width:44px"></div>
  </div>
  <div style="background:#313235;border-radius:24px;padding:14px 20px;display:flex;align-items:flex-end;gap:18px;height:172px;box-sizing:border-box;flex-shrink:0;position:relative;overflow:hidden">
    <div aria-hidden="true" style=${'position:absolute;left:-30px;bottom:-60px;width:200px;height:200px;border-radius:50%;opacity:.22;transition:background .3s;background:' + CORES[cor]}></div>
    <div class=${flip ? 'popA' : 'popB'} style="display:flex;position:relative"><${Boneco} cor=${CORES[cor]} tipo=${sel} tam=${144} /></div>
    <div style="display:flex;flex-direction:column;gap:6px;padding-bottom:14px;position:relative;min-width:0">
      <div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#A9A8AC">${PERSONAGENS[sel][1].toUpperCase()}</div>
      <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:28px;line-height:1.05">${PERSONAGENS[sel][0]}</div>
      <div style="font-size:13px;color:#A9A8AC">${draft.name.trim() ? draft.name.trim() + ', assim' : 'Assim'} você vai aparecer no telão</div>
    </div>
  </div>
  <div style="display:flex;gap:6px;flex-shrink:0;justify-content:space-between" role="group" aria-label="Cor do personagem">
    ${CORES.map((c, i) => html`<button onClick=${() => setDraft({ ...draft, cor: i })} aria-label=${'Cor ' + COL_NAMES[i]} aria-pressed=${cor === i ? 'true' : 'false'}
      style=${'width:44px;height:44px;border-radius:50%;cursor:pointer;padding:0;flex-shrink:0;background:' + c + ';border:3px solid ' + (cor === i ? '#E7E6E6' : '#232427') + ';box-shadow:' + (cor === i ? '0 0 0 2px ' + c : 'none')}></button>`)}
  </div>
  <div class="scroller" style="display:flex;gap:8px;overflow-x:auto;flex-shrink:0" role="group" aria-label="Filtrar personagens">
    ${tabs.map(([k, label]) => html`<button onClick=${() => setTab(k)} aria-pressed=${tab === k ? 'true' : 'false'}
      style=${'flex-shrink:0;height:44px;padding:0 16px;border-radius:999px;cursor:pointer;font-weight:800;font-size:14px;border:none;background:' + (tab === k ? '#E7E6E6' : '#313235') + ';color:' + (tab === k ? '#232427' : '#E7E6E6')}>${label}</button>`)}
  </div>
  <div class="scroller" style="flex:1;min-height:0;overflow-y:auto;margin:0 -4px;padding:4px">
    <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px">
      ${PERSONAGENS.map(([nome, cat], i) => ({ nome, cat, i })).filter((x) => tab === 'todos' || x.cat === tab).map((x) => {
        const on = sel === x.i;
        return html`<button key=${x.i} onClick=${() => { setDraft({ ...draft, sel: x.i, cor: x.i % 7 }); setFlip(!flip); }} aria-label=${x.nome} aria-pressed=${on ? 'true' : 'false'}
          style=${'height:104px;border-radius:18px;cursor:pointer;padding:6px 2px;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;color:#E7E6E6;background:' + (on ? '#44464B' : '#313235') + ';border:3px solid ' + (on ? '#19EB82' : 'transparent')}>
          <div class=${on ? 'sel' : ''} style="display:flex"><${Boneco} cor=${on ? CORES[cor] : CORES[x.i % 7]} tipo=${x.i} tam=${64} /></div>
          <span style="font-size:12px;font-weight:800">${x.nome}</span>
        </button>`;
      })}
    </div>
  </div>
  ${msg && html`<div role="alert" style="font-size:14px;font-weight:700;color:#FF6B4A;text-align:center">${msg}</div>`}
  <button onClick=${pronto} disabled=${busy} style=${CTA + ';flex-shrink:0;height:60px;font-size:19px;opacity:' + (busy ? '.6' : '1')}>${editando ? 'Salvar personagem' : 'Pronto, entrar!'} ${SETA}</button>
</div>`;
}

// ---------- Celular · 3 Responder (com a espera da sala) ----------

function Responder({ st, pending, onPick, onEdit }) {
  useNow(250);
  const me = st.me;
  const ph = st.phase;
  const q = st.question || {};
  const total = st.seconds;
  const answeredThis = me.answeredQ === st.qIndex && st.qIndex >= 0;
  const pendingThis = pending && pending.qIndex === st.qIndex;
  let view;
  if (ph === 'lobby') view = 'wait';
  else if (ph === 'countdown') view = 'count';
  else if (ph === 'question') view = answeredThis || pendingThis ? 'sent' : 'pick';
  else view = me.result && me.result.correct ? 'right' : 'wrong';
  const result = view === 'right' || view === 'wrong';
  const r = me.result || {};
  const t = ph === 'question' ? Math.min(secondsLeft(st.phaseEndsAt), total) : 0;
  const hurry = t <= 5;
  const cd = Math.max(1, secondsLeft(st.phaseEndsAt));
  const four = (q.opcoes || []).length > 2;
  const ch = answeredThis ? me.choice : pendingThis ? pending.choice : 0;
  const delta = r.posicaoAntes && r.posicao ? r.posicaoAntes - r.posicao : 0;
  const fim = ph === 'podium';
  const bg = view === 'right' ? '#19EB82' : view === 'wrong' ? '#FF6B4A' : '#232427';
  useEffect(() => { document.body.style.background = bg; }, [bg]);

  return html`<div class="tela fixa" style=${'background:' + bg + ';color:' + (result ? '#232427' : '#E7E6E6') + ';font-family:Manrope,system-ui,sans-serif;gap:16px;transition:background .4s'}>
  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
    <div style="display:flex;gap:10px;align-items:center;min-width:0">
      <${Boneco} cor=${me.cor} tipo=${me.tipo} tam=${48} />
      <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
        <div style="font-weight:800;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${me.name}</div>
        <div style="font-size:13px;font-weight:700;opacity:.75">${ph === 'lobby' ? 'Sala de espera' : 'Pergunta ' + (st.qIndex + 1) + ' de ' + st.total}</div>
      </div>
    </div>
    <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:16px;background:#313235;color:#E7E6E6;border-radius:999px;padding:8px 14px;flex-shrink:0">${fmt(me.score)} pts</div>
  </div>

  ${(view === 'pick' || view === 'sent') && html`<div style="display:flex;align-items:center;gap:10px">
    <div style="flex:1;height:10px;border-radius:999px;background:#44464B;overflow:hidden">
      <div style=${'height:100%;border-radius:999px;transition:width 1s linear;background:' + (hurry ? '#FF6B4A' : '#19EB82') + ';width:' + Math.round((t / total) * 100) + '%'}></div>
    </div>
    <div style=${'font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:16px;min-width:36px;text-align:right;color:' + (hurry ? '#FF6B4A' : '#E7E6E6')}>${t}s</div>
  </div>`}

  ${view === 'wait' && html`<div style="flex-grow:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;text-align:center" role="status">
    <div class="wig1" style="display:flex"><${Boneco} cor=${me.cor} tipo=${me.tipo} tam=${150} /></div>
    <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:28px">Você está na sala!</div>
    <div style="display:flex;gap:10px" aria-hidden="true">
      <div class="d1" style="width:14px;height:14px;border-radius:50%;background:#19EB82"></div>
      <div class="d2" style="width:14px;height:14px;border-radius:50%;background:#19EB82"></div>
      <div class="d3" style="width:14px;height:14px;border-radius:50%;background:#19EB82"></div>
    </div>
    <div style="font-size:16px;color:#A9A8AC;max-width:300px">Seu personagem já está no telão. Esperando o apresentador começar…</div>
    <button onClick=${onEdit} style="height:44px;padding:0 18px;border-radius:999px;border:none;background:#313235;color:#E7E6E6;font-weight:800;font-size:14px;cursor:pointer">Trocar personagem</button>
  </div>`}

  ${view === 'count' && html`<div style="flex-grow:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;text-align:center" role="status" aria-live="polite">
    <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:20px;color:#A9A8AC">Prepare-se!</div>
    <div style="width:200px;height:200px;border-radius:50%;background:#313235;border:6px solid #19EB82;display:flex;align-items:center;justify-content:center">
      <div class=${cd % 2 ? 'cdA' : 'cdB'} style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:110px;line-height:1;color:#19EB82">${cd}</div>
    </div>
    <div style="font-size:16px;color:#A9A8AC">A pergunta vai aparecer no telão</div>
  </div>`}

  ${view === 'pick' && html`<div style="display:flex;flex-direction:column;gap:14px;flex-grow:1;min-height:0">
    <div style="font-size:15px;font-weight:700;line-height:1.35;color:#E7E6E6;background:#313235;border-radius:16px;padding:12px 14px;max-height:30vh;overflow-y:auto">${q.pergunta}</div>
    <div style=${'display:grid;gap:12px;flex-grow:1;min-height:0;grid-template-columns:repeat(' + (four ? 2 : 1) + ',minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))'}>
      ${(q.opcoes || []).map((texto, i) => html`<button key=${st.qIndex + '-' + i} class="opt" onClick=${() => onPick(st.qIndex, i)} aria-label=${'Resposta ' + LETRAS[i] + ': ' + texto}
        style=${'border:none;border-radius:22px;background:' + CORES_OPCAO[i][0] + ';color:#232427;cursor:pointer;box-shadow:0 7px 0 ' + CORES_OPCAO[i][1] + ';display:flex;flex-direction:' + (four ? 'column' : 'row') + ';align-items:' + (four ? 'flex-start' : 'center') + ';justify-content:' + (four ? 'space-between' : 'flex-start') + ';gap:12px;padding:14px 16px;text-align:left;min-height:0;overflow:hidden'}>
        <span style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:40px;line-height:1">${LETRAS[i]}</span>
        <span style=${'font-weight:800;line-height:1.25;font-size:' + (four ? '13px' : '16px')}>${texto}</span>
      </button>`)}
    </div>
    <div style="font-size:13px;color:#A9A8AC;text-align:center">Quanto mais rápido, mais pontos</div>
  </div>`}

  ${view === 'sent' && html`<div style="flex-grow:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;text-align:center" role="status">
    <div style=${'width:120px;height:120px;border-radius:28px;background:' + CORES_OPCAO[ch][0] + ';color:#232427;display:flex;align-items:center;justify-content:center;font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:60px'}>${LETRAS[ch]}</div>
    <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:28px">${answeredThis ? 'Resposta travada!' : 'Enviando…'}</div>
    <div style="display:flex;gap:10px" aria-hidden="true">
      <div class="d1" style="width:14px;height:14px;border-radius:50%;background:#19EB82"></div>
      <div class="d2" style="width:14px;height:14px;border-radius:50%;background:#19EB82"></div>
      <div class="d3" style="width:14px;height:14px;border-radius:50%;background:#19EB82"></div>
    </div>
    <div style="font-size:16px;color:#A9A8AC">Esperando o tempo acabar…</div>
  </div>`}

  ${view === 'right' && html`<div style="flex-grow:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;color:#232427">
    <div class="stamp" style="width:150px;height:150px;border-radius:50%;background:#232427;color:#19EB82;display:flex;align-items:center;justify-content:center">
      <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6"></path></svg>
    </div>
    <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:40px">Na mosca!</div>
    <div class="cnt" style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:56px">+${fmt(r.gain)}</div>
    <div class="cnt2" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
      ${me.streak >= 2 && html`<div style="display:flex;gap:6px;align-items:center;background:#232427;color:#14E6CD;border-radius:999px;padding:8px 14px;font-weight:800;font-size:15px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 2-5 5-5 8 0 4 3 7 7 7z"></path></svg>
        ${me.streak} seguidas
      </div>`}
      ${st.dobro && html`<div style="display:flex;gap:6px;align-items:center;background:#232427;color:#19EB82;border-radius:999px;padding:8px 14px;font-weight:800;font-size:15px">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"></path></svg>
        Pontos em dobro
      </div>`}
    </div>
  </div>`}

  ${view === 'wrong' && html`<div style="flex-grow:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center">
    <div class="nope" style="width:150px;height:150px;border-radius:50%;background:#232427;color:#FF6B4A;display:flex;align-items:center;justify-content:center">
      <svg width="76" height="76" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>
    </div>
    <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:40px">${r.semResposta ? 'Tempo esgotado!' : 'Quase!'}</div>
    <div style="font-size:18px;font-weight:700">A certa era a <strong>${LETRAS[q.certa] || '?'}</strong></div>
    <div style="background:#232427;border-radius:16px;padding:12px 16px;font-size:15px;font-weight:700;color:#E7E6E6">${fim ? 'Valeu por jogar!' : 'Bora recuperar na próxima!'}</div>
  </div>`}

  ${result && html`<div style="display:flex;flex-direction:column;gap:10px">
    <div class="cnt2" style="background:#232427;color:#E7E6E6;border-radius:20px;padding:14px 18px;display:flex;align-items:center;gap:14px" role="status">
      <div style="display:flex;flex-direction:column;gap:2px;flex:1">
        <div style="font-size:12px;font-weight:800;letter-spacing:.12em;color:#A9A8AC">SUA POSIÇÃO</div>
        <div style="display:flex;align-items:baseline;gap:6px">
          <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:40px;line-height:1">${r.posicao ? r.posicao + 'º' : '—'}</div>
          <div style="font-size:15px;font-weight:700;color:#A9A8AC">de ${r.jogadores || 0}</div>
        </div>
      </div>
      <div style=${'display:flex;align-items:center;gap:6px;border-radius:999px;padding:8px 12px;font-weight:800;font-size:14px;background:#313235;color:' + (delta > 0 ? '#19EB82' : (delta < 0 ? '#FF6B4A' : '#E7E6E6'))}>
        ${delta > 0 && html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"></path></svg>`}
        ${delta < 0 && html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12l7 7 7-7"></path></svg>`}
        ${delta > 0 ? 'subiu ' + delta : delta < 0 ? 'caiu ' + (-delta) : (st.qIndex === 0 ? 'começou' : 'manteve')}
      </div>
    </div>
    <div style="font-size:14px;font-weight:800;text-align:center">${fim || st.isLast ? 'Fim de jogo! Olhe o pódio no telão' : 'Olhe o ranking no telão'}</div>
    ${!fim && html`<button disabled style="height:58px;border-radius:999px;border:none;background:#232427;color:#E7E6E6;font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:15px;opacity:.75">${st.isLast ? 'Aguardando o pódio…' : 'Aguarde a próxima pergunta…'}</button>`}
    ${fim && html`<button onClick=${onEdit} style="height:58px;border-radius:999px;border:none;background:#232427;color:#E7E6E6;font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:17px;cursor:pointer">Jogar de novo</button>`}
  </div>`}
</div>`;
}

// ---------- aplicativo ----------

function App() {
  const salvo = (() => { try { return JSON.parse(store.get('quiz.perfil')) || {}; } catch { return {}; } })();
  const inicial = Math.floor(Math.random() * 20);
  const [draft, setDraft] = useState({ name: salvo.name || '', sel: salvo.sel ?? inicial, cor: salvo.cor ?? inicial % 7 });
  const [st, setSt] = useState(null);
  const [online, setOnline] = useState(socket.connected);
  const [step, setStep] = useState('entrar'); // entrar | personagem | jogo | editar
  const [nameErr, setNameErr] = useState('');
  const [pending, setPending] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    socket.on('connect', () => setOnline(true));
    socket.on('disconnect', () => setOnline(false));
    socket.on('state', (s) => {
      window.__titulo = s.titulo;
      setSt(s);
      if (s.me) setStep((cur) => (cur === 'editar' ? cur : 'jogo'));
    });
    socket.on('player:unknown', () => {
      store.del('quiz.token');
      socket.auth.token = '';
      setStep((cur) => (cur === 'jogo' || cur === 'editar' ? 'entrar' : cur));
    });
    socket.connect(); // só depois de registrar os ouvintes, para não perder o primeiro estado
    if (socket.connected) setOnline(true);
  }, []);

  // A resposta otimista some quando o servidor confirma ou quando a pergunta muda.
  useEffect(() => {
    if (pending && st && (st.qIndex !== pending.qIndex || st.phase !== 'question' || st.me?.answeredQ === pending.qIndex)) setPending(null);
  }, [st]);
  useEffect(() => { if (!toast) return; const to = setTimeout(() => setToast(''), 3500); return () => clearTimeout(to); }, [toast]);

  const entrar = async () => {
    const r = await send('player:join', { name: draft.name, tipo: draft.sel, cor: draft.cor });
    if (r.error) {
      if (/apelido|caracteres/i.test(r.error)) { setNameErr(r.error); setStep('entrar'); return null; }
      return r;
    }
    store.set('quiz.token', r.token);
    store.set('quiz.perfil', JSON.stringify({ name: draft.name.trim(), sel: draft.sel, cor: draft.cor }));
    socket.auth.token = r.token;
    setStep('jogo');
    return null;
  };

  const responder = async (qIndex, choice) => {
    if (pending) return;
    setPending({ qIndex, choice });
    if (navigator.vibrate) navigator.vibrate(30);
    const r = await send('player:answer', { qIndex, choice });
    if (r.error) { setPending(null); setToast(r.error); }
  };

  const editar = () => {
    if (st && st.me) setDraft({ name: st.me.name, sel: st.me.tipo, cor: st.me.corIndex });
    setStep('editar');
  };

  let screen;
  if (step === 'personagem' || step === 'editar') {
    screen = html`<${Personagem} draft=${draft} setDraft=${setDraft} editando=${step === 'editar'}
      onBack=${() => setStep(step === 'editar' ? 'jogo' : 'entrar')} onDone=${entrar} />`;
  } else if (step === 'jogo' && st && st.me) {
    screen = html`<${Responder} st=${st} pending=${pending} onPick=${responder} onEdit=${editar} />`;
  } else {
    screen = html`<${Entrar} draft=${draft} setDraft=${setDraft} online=${online} erro=${nameErr} onNext=${() => { setNameErr(''); setStep('personagem'); }} />`;
  }
  if (step !== 'jogo') document.body.style.background = '#232427';

  return html`${screen}
    ${!online && step === 'jogo' && html`<div role="status" style="position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 8px);transform:translateX(-50%);background:#FF6B4A;color:#232427;font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:14px;padding:8px 16px;border-radius:999px;z-index:99;white-space:nowrap">Reconectando…</div>`}
    ${toast && html`<div role="alert" style="position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 24px);transform:translateX(-50%);background:#E7E6E6;color:#232427;font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:15px;padding:12px 18px;border-radius:16px;z-index:99;max-width:85vw;text-align:center">${toast}</div>`}`;
}

render(html`<${App} />`, document.getElementById('app'));
