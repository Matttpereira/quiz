// Telão (projetor/TV): Sala de espera, Pergunta e Pódio, controlados pelo apresentador.
import { html, render, useState, useEffect, useRef, useLayoutEffect } from '/vendor/preact.js';
import { Boneco, syncClock, useNow, secondsLeft, fmt, LETRAS, CORES_OPCAO, CADEADO } from '/shared.js';

const KEY_STORE = 'quiz.hostKey';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

// A chave pode vir na URL (/telao?key=...) uma vez; depois fica salva neste computador.
const urlKey = new URLSearchParams(location.search).get('key');
if (urlKey) { store.set(KEY_STORE, urlKey); history.replaceState(null, '', '/telao'); }

const socket = window.io({ autoConnect: false, auth: { role: 'host', key: store.get(KEY_STORE) || '' } });
syncClock(socket);

const send = (ev) => new Promise((resolve) => socket.timeout(5000).emit(ev, (err, r) => resolve(err ? { error: 'Sem resposta do servidor.' } : r)));

// ---------- palco 1280×720 escalado para qualquer tela ----------

function Stage({ children, bg }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const fit = () => {
      const s = Math.min(innerWidth / 1280, innerHeight / 720);
      ref.current.style.transform = `translate(-50%,-50%) scale(${s})`;
    };
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);
  useEffect(() => { document.body.style.background = bg; }, [bg]);
  return html`<div class="stage" ref=${ref}>${children}</div>`;
}

// ---------- Telão · 1 Sala de espera ----------

const TILES = (() => {
  const anims = ['tileA', 'tileB', 'tileC', 'tileD', 'tileE'];
  const out = [];
  for (let i = 0; i < 84; i++) {
    const r = Math.floor(i / 12), c = i % 12;
    const name = anims[(r * 2 + c * 3) % 5];
    const dur = 2.2 + ((r + c) % 3) * 0.4;
    const delay = -(((r * 5 + c * 7) % 11) * 0.27).toFixed(2);
    out.push('background:#211849;animation:' + name + ' ' + dur + 's steps(1,end) ' + delay + 's infinite');
  }
  return out;
})();

// Cada jogador anda pela pista de dança como no protótipo; a lista vem do servidor.
function usePasseio(players) {
  const pos = useRef(new Map());
  const [, tick] = useState(0);
  const hop = useRef({ id: null, until: 0 });
  for (const p of players) {
    if (!pos.current.has(p.id)) pos.current.set(p.id, { x: 50 + Math.random() * 690, y: 250 + Math.random() * 360, dir: Math.random() < 0.5 ? -1 : 1, until: 0 });
  }
  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      const ids = [...pos.current.keys()];
      if (!ids.length) return;
      for (let k = 0; k < Math.min(3, ids.length); k++) {
        const p = pos.current.get(ids[Math.floor(Math.random() * ids.length)]);
        if (p.until > now) continue;
        const nx = 50 + Math.random() * 690, ny = 250 + Math.random() * 360;
        Object.assign(p, { dir: nx < p.x ? -1 : 1, x: nx, y: ny, until: now + 3000 });
      }
      if (hop.current.until < now && Math.random() < 0.35) hop.current = { id: ids[Math.floor(Math.random() * ids.length)], until: now + 900 };
      tick((x) => x + 1);
    }, 700);
    return () => clearInterval(iv);
  }, []);
  return { pos: pos.current, hop: hop.current };
}

function Lobby({ st }) {
  const [join, setJoin] = useState(null);
  const [erro, setErro] = useState('');
  const players = st.players || [];
  const { pos, hop } = usePasseio(players);
  useEffect(() => {
    fetch('/api/join-info').then((r) => r.json()).then(setJoin).catch(() => setErro('Não foi possível gerar o QR Code.'));
  }, []);
  const now = Date.now();
  const tam = players.length > 40 ? 60 : players.length > 20 ? 74 : 88;
  const start = async () => { const r = await send('host:advance'); setErro(r.error || ''); };

  return html`<div class="s-lobby" style="width:1280px;height:720px;box-sizing:border-box;position:relative;overflow:hidden;background:#120B2E;color:#FFF8EC;font-family:Manrope,system-ui,sans-serif;padding:40px 48px;display:flex;gap:48px">
  <div style="flex:1;min-width:0;position:relative;border-radius:28px;overflow:hidden">
    <div style="position:absolute;left:0;right:0;top:0;height:200px;background-color:#150E33;background-image:repeating-linear-gradient(90deg,#150E33 0 38px,#1A1240 38px 76px)"></div>
    <div role="img" aria-label="Letreiro neon: #Just DOO it" style="position:absolute;left:150px;top:6px;width:340px;height:190px">
      <div class="neonW" style="position:absolute;left:18px;top:-6px;font-size:72px;line-height:1">#Just</div>
      <div class="neonG" style="position:absolute;left:40px;top:66px;font-size:84px;line-height:1;letter-spacing:4px">DOO</div>
      <div class="neonW" style="position:absolute;left:150px;top:118px;font-size:64px;line-height:1">it</div>
    </div>
    <div aria-hidden="true" style="position:absolute;left:0;right:0;top:196px;height:8px;background:#3B2F73"></div>
    <div style="position:absolute;left:0;right:0;top:204px;bottom:0;background:#120B2E;padding:3px;box-sizing:border-box;display:grid;grid-template-columns:repeat(12,minmax(0,1fr));grid-template-rows:repeat(7,minmax(0,1fr));gap:3px">
      ${TILES.map((s) => html`<div class="tile" style=${s}></div>`)}
    </div>
    <div aria-hidden="true" style="position:absolute;inset:0;overflow:hidden;z-index:1;pointer-events:none">
      <div class="spot s1"></div><div class="spot s2"></div><div class="spot s3"></div>
      <div class="beam" style="position:absolute;left:415px;top:-24px;width:220px;height:300px;z-index:3;pointer-events:none;clip-path:polygon(43% 0,57% 0,100% 100%,0 100%);background:linear-gradient(180deg,rgba(255,248,236,.28),rgba(198,244,50,.1));mix-blend-mode:screen"></div>
    </div>
    <div aria-hidden="true" style="position:absolute;left:397px;top:199px;width:265px;z-index:230;display:flex;flex-direction:column;height:68px">
      <div style="height:22px;background:#3B2F73;border-top:3px solid #5E5596;border-radius:10px 10px 0 0;box-sizing:border-box"></div>
      <div style="height:46px;background:#2A1F5C;border-bottom:4px solid #120B2E;box-sizing:border-box;display:flex;align-items:center;justify-content:space-evenly;padding-right:16px">
        ${['bulbA', 'bulbB', 'bulbA', 'bulbB', 'bulbA', 'bulbB', 'bulbA'].map((c) => html`<span class=${c} style="width:10px;height:10px;border-radius:50%"></span>`)}
      </div>
    </div>
    <div style="position:absolute;left:526px;top:235px;z-index:236;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center" role="img" aria-label="DooDoo dançando">
      <div style="position:relative;display:flex">
        <svg class="note1" width="26" height="34" viewBox="0 0 26 34" aria-hidden="true" style="position:absolute;left:-14px;top:50px"><path d="M9 26 V4 L24 1 V22" fill="none" stroke="#FFF8EC" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path><ellipse cx="6" cy="27" rx="5.5" ry="4.5" fill="#FFF8EC"></ellipse><ellipse cx="21" cy="23" rx="5.5" ry="4.5" fill="#FFF8EC"></ellipse></svg>
        <svg class="note2" width="18" height="30" viewBox="0 0 18 30" aria-hidden="true" style="position:absolute;right:-12px;top:36px"><path d="M8 24 V2 Q14 6 16 12" fill="none" stroke="#C6F432" stroke-width="3" stroke-linecap="round"></path><ellipse cx="5.5" cy="25" rx="5.5" ry="4.5" fill="#C6F432"></ellipse></svg>
        <div class="ddDance" style="display:flex;position:relative"><${Boneco} cor="#C6F432" tipo=${19} tam=${180} /></div>
      </div>
      <div class="ddSpot" aria-hidden="true" style="width:140px;height:24px;margin-top:-14px;border-radius:50%;background:radial-gradient(closest-side,rgba(198,244,50,.75),rgba(198,244,50,0))"></div>
      <svg aria-hidden="true" width="60" height="145" viewBox="0 0 60 145" style="position:absolute;left:-15px;top:69px;z-index:240;overflow:visible">
        <ellipse cx="30" cy="140" rx="16" ry="4" fill="#120B2E"></ellipse>
        <path d="M30 140 V72 L43 26" fill="none" stroke="#8C84B8" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"></path>
        <circle cx="30" cy="72" r="3" fill="#5E5596"></circle>
        <g transform="rotate(32 44 18)">
          <rect x="38.5" y="6" width="11" height="20" rx="5.5" fill="#4B3F86" stroke="#120B2E" stroke-width="1.5"></rect>
          <path d="M38.5 11 H49.5 M38.5 15 H49.5 M38.5 19 H49.5" stroke="#9C93C9" stroke-width="1"></path>
          <rect x="38" y="20" width="12" height="3.5" rx="1.5" fill="#C6F432"></rect>
        </g>
      </svg>
    </div>
    <div class="swing" aria-hidden="true" style="position:absolute;left:600px;top:0;width:96px;display:flex;flex-direction:column;align-items:center;z-index:2">
      <div style="width:2px;height:34px;background:#8C84B8"></div>
      <div style="width:22px;height:8px;border-radius:3px;background:#5E5596"></div>
      <div style="position:relative;width:96px;height:96px">
        <div class="ball" style="position:absolute;inset:0;border-radius:50%;box-shadow:0 0 30px rgba(233,228,255,.35)"></div>
        <div class="ballrows" style="position:absolute;inset:0;border-radius:50%"></div>
        <svg class="star" width="22" height="22" viewBox="0 0 24 24" style="position:absolute;left:14px;top:10px"><path d="M12 0 14 10 24 12 14 14 12 24 10 14 0 12 10 10Z" fill="#FFFFFF"></path></svg>
        <svg class="star" width="16" height="16" viewBox="0 0 24 24" style="position:absolute;right:10px;top:44px;animation-delay:.6s"><path d="M12 0 14 10 24 12 14 14 12 24 10 14 0 12 10 10Z" fill="#FFFFFF"></path></svg>
        <svg class="star" width="12" height="12" viewBox="0 0 24 24" style="position:absolute;left:40px;bottom:8px;animation-delay:1.1s"><path d="M12 0 14 10 24 12 14 14 12 24 10 14 0 12 10 10Z" fill="#FFFFFF"></path></svg>
      </div>
    </div>

    ${players.map((p) => {
      const q = pos.get(p.id);
      const depth = 0.78 + 0.42 * ((q.y - 250) / 360);
      const anim = hop.id === p.id && hop.until > now ? 'hop' : q.until > now ? 'walk' : 'stand';
      return html`<div key=${p.id} style=${'position:absolute;left:' + Math.round(q.x) + 'px;top:' + Math.round(q.y) + 'px;z-index:' + Math.round(q.y) + ';transform:translate(-50%,-100%) scale(' + depth.toFixed(3) + ');transform-origin:bottom center;transition:left 3s linear,top 3s linear,transform 3s linear'}>
        <div class="drop" style="display:flex;flex-direction:column;align-items:center">
          <div class="tag" style=${'background:' + p.cor + ';color:#120B2E;font-weight:800;font-size:14px;padding:4px 12px;border-radius:999px;white-space:nowrap;box-shadow:0 3px 0 rgba(0,0,0,.25)'}>${p.name}</div>
          <svg width="12" height="7" viewBox="0 0 12 7" aria-hidden="true" style="display:block;margin-bottom:4px"><path d="M0 0 H12 L6 7Z" fill=${p.cor}></path></svg>
          <div class=${anim} style=${'display:flex;transition:transform .2s;transform:scaleX(' + q.dir + ')'}><${Boneco} cor=${p.cor} tipo=${p.tipo} tam=${tam} /></div>
        </div>
      </div>`;
    })}
  </div>

  <div style="width:340px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:16px">
    <div style="width:100%;display:flex;justify-content:space-between;align-items:flex-end;gap:12px">
      <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
        <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:18px;letter-spacing:.04em;color:#C6F432">${st.titulo}</div>
        <div style="font-size:14px;color:#BDB4E0;display:flex;gap:8px;align-items:center"><span class="dot" style="width:9px;height:9px;border-radius:50%;background:#FF6B4A;display:inline-block;flex-shrink:0"></span>Esperando mais gente</div>
      </div>
      <div style="display:flex;align-items:baseline;gap:8px;flex-shrink:0">
        <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:52px;line-height:1;color:#C6F432">${players.length}</div>
        <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:14px;line-height:1.15">${players.length === 1 ? 'jogador' : 'jogadores'}<br/>na sala</div>
      </div>
    </div>
    <div style="background:#1E1546;border-radius:28px;padding:20px 24px;display:flex;flex-direction:column;align-items:center;gap:14px;width:100%;box-sizing:border-box">
      <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:22px;text-align:center;line-height:1.15">Aponte a câmera<br/>pra entrar</div>
      <div style="position:relative;width:240px;height:240px;border-radius:20px;background:#FFF8EC;overflow:hidden">
        ${join
          ? html`<div class="qr" role="img" aria-label=${'QR Code para ' + join.url} style="position:absolute;inset:16px" dangerouslySetInnerHTML=${{ __html: join.svg }}></div>`
          : html`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#120B2E;font-weight:800;font-size:16px;text-align:center">${erro || 'Gerando QR Code…'}</div>`}
        <div class="scan" aria-hidden="true" style="position:absolute;left:8px;right:8px;height:4px;border-radius:4px;background:#C6F432;box-shadow:0 0 16px 4px rgba(198,244,50,.6);opacity:.8"></div>
      </div>
      <div style="font-size:15px;color:#BDB4E0;text-align:center">Seu personagem aparece na sala assim que você entrar</div>
      ${join && html`<div style="font-size:13px;color:#BDB4E0;text-align:center;margin-top:-6px">ou acesse <strong style="color:#FFF8EC;word-break:break-all">${join.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</strong></div>`}
    </div>
    ${erro && join && html`<div role="alert" style="font-size:14px;font-weight:700;color:#FF6B4A;text-align:center">${erro}</div>`}
    <button class="go" onClick=${start} disabled=${players.length === 0} style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:22px;background:#C6F432;color:#120B2E;border:none;border-radius:999px;padding:20px 40px;cursor:pointer;margin-top:auto">Começar o jogo</button>
  </div>
</div>`;
}

// ---------- Telão · 2 Pergunta (contagem, pergunta, revelação e ranking) ----------

const ARROW_L = html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>`;
const ARROW_R = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"></path></svg>`;
const CHECK = (w, sw) => html`<svg width=${w} height=${w} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width=${sw} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6"></path></svg>`;

function Pergunta({ st }) {
  useNow(250);
  const ph = st.phase;
  const q = st.question || {};
  const total = st.seconds;
  const isLastQ = st.isLast;
  const revealed = ph === 'reveal' || ph === 'rank';

  // Ranking: mostra as posições antigas e, 900 ms depois, anima para as novas.
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    setMoved(false);
    if (ph !== 'rank') return;
    const to = setTimeout(() => setMoved(true), 900);
    return () => clearTimeout(to);
  }, [ph, st.qIndex]);

  const t = ph === 'question' ? Math.min(secondsLeft(st.phaseEndsAt), total) : (ph === 'countdown' ? total : 0);
  const frac = t / total;
  const hurry = t <= 5 && ph === 'question';
  const cd = Math.max(1, secondsLeft(st.phaseEndsAt));
  const eligible = st.eligible || 0;
  const answered = st.answered || 0;

  const advance = () => send('host:advance');
  const back = () => send('host:back');
  const advanceLabel = ph === 'countdown' ? 'Pular contagem' : ph === 'question' ? 'Revelar resposta' : ph === 'reveal' ? 'Ver ranking' : 'Próxima pergunta';
  const showPodium = ph === 'rank' && isLastQ;

  const steps = Array.from({ length: st.total }, (_, i) => 'width:22px;height:8px;border-radius:999px;background:' + (i === st.qIndex ? '#19EB82' : (i < st.qIndex ? '#00A578' : '#44464B')));

  const pergunta = q.pergunta || '';
  const opcoes = (q.opcoes || []).map((texto, i) => {
    const right = revealed && i === q.certa;
    const dim = revealed && i !== q.certa;
    return html`<div key=${st.qIndex + '-' + i} class=${right ? 'ans win' : 'ans'} style=${'display:flex;align-items:center;gap:18px;background:' + CORES_OPCAO[i][0] + ';color:#232427;border-radius:20px;padding:16px 22px;min-height:88px;box-sizing:border-box;box-shadow:0 8px 0 ' + CORES_OPCAO[i][1] + ';transition:opacity .3s,filter .3s;opacity:' + (dim ? '.3' : '1') + ';filter:' + (dim ? 'grayscale(1)' : 'none') + (right ? ';outline:4px solid #E7E6E6;outline-offset:4px' : '')}>
      <div style=${'width:48px;height:48px;flex-shrink:0;border-radius:14px;background:#232427;color:' + CORES_OPCAO[i][0] + ';display:flex;align-items:center;justify-content:center;font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:22px'}>${LETRAS[i]}</div>
      <div style="font-weight:800;font-size:21px;line-height:1.25;flex:1;min-width:0">${texto}</div>
      ${right && html`<div style="width:40px;height:40px;flex-shrink:0;border-radius:50%;background:#232427;color:#19EB82;display:flex;align-items:center;justify-content:center" role="img" aria-label="Resposta certa">${CHECK(24, 3.2)}</div>`}
    </div>`;
  });

  const rk = st.ranking || [];
  const beforeOrder = rk.slice().sort((a, b) => a.posBefore - b.posBefore || a.posAfter - b.posAfter).map((r) => r.id);
  const leaderName = rk[0] ? rk[0].name : '—';
  const acertos = st.acertos || 0, erros = st.erros || 0;
  const rows = rk.map((r) => {
    const pos = moved ? r.posAfter : beforeOrder.indexOf(r.id);
    const lead = pos === 0;
    const up = moved && r.posAfter < beforeOrder.indexOf(r.id);
    const dark = '#232427';
    return html`<div key=${r.id} style=${'position:absolute;left:0;right:0;height:68px;top:' + (pos * 78) + 'px;transition:top .8s cubic-bezier(.3,1.4,.5,1),background .4s;display:flex;align-items:center;gap:16px;padding:0 24px 0 14px;border-radius:20px;box-sizing:border-box;background:' + (lead ? '#19EB82' : (up ? '#44464B' : '#313235')) + ';color:' + (lead ? dark : '#E7E6E6')}>
      <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:26px;width:36px;text-align:center">${pos + 1}</div>
      <div style="width:44px;height:70px;flex-shrink:0;display:flex;justify-content:center"><${Boneco} cor=${r.cor} tipo=${r.tipo} tam=${68} /></div>
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px">
        <div style="font-weight:800;font-size:21px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.name}</div>
        <div style=${'display:flex;gap:10px;align-items:center;font-size:14px;font-weight:700;color:' + (lead ? dark : '#A9A8AC')}>
          ${moved && r.streak >= 2 && html`<span style=${'display:flex;gap:4px;align-items:center;font-weight:800;color:' + (lead ? dark : '#14E6CD')}><span class="fire"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-3 2-5 5-5 8 0 4 3 7 7 7z"></path></svg></span>${r.streak} seguidas</span>`}
          ${up && html`<span style=${'display:flex;gap:4px;align-items:center;font-weight:800;color:' + (lead ? dark : '#19EB82')}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"></path></svg>subiu</span>`}
        </div>
      </div>
      <div style="position:relative;text-align:right">
        ${moved && r.gain > 0 && html`<div class="plus" style=${'position:absolute;right:0;top:-18px;font-weight:800;font-size:15px;color:' + (lead ? dark : '#19EB82')}>+${fmt(r.gain)}</div>`}
        <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:22px">${fmt(moved ? r.scoreAfter : r.scoreBefore)}</div>
      </div>
    </div>`;
  });

  return html`<div class="s-perg" style="width:1280px;height:720px;box-sizing:border-box;position:relative;overflow:hidden;background:#232427;color:#E7E6E6;font-family:Manrope,system-ui,sans-serif;padding:32px 56px 40px;display:flex;flex-direction:column;gap:20px">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:16px">
    <div style="display:flex;gap:16px;align-items:center">
      <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:18px;color:#A9A8AC">${ph === 'rank' ? 'Ranking depois da pergunta ' + (st.qIndex + 1) : 'Pergunta ' + (st.qIndex + 1) + ' de ' + st.total}</div>
      <div style="display:flex;gap:6px">${steps.map((s) => html`<div style=${s}></div>`)}</div>
      ${st.dobro && ph !== 'rank' && html`<div class="badge" style="display:flex;gap:8px;align-items:center;background:#14E6CD;color:#232427;border-radius:999px;padding:6px 16px;font-weight:800;font-size:15px">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"></path></svg>
        Última pergunta · pontos em dobro
      </div>`}
    </div>
    <div style="display:flex;gap:8px">
      <button class="navbtn" onClick=${back} disabled=${ph !== 'rank'} aria-label="Voltar para a resposta" title="Voltar para a resposta" style="width:44px;height:44px;border-radius:50%;border:none;background:#313235;color:#E7E6E6;cursor:pointer;display:flex;align-items:center;justify-content:center">${ARROW_L}</button>
      ${!showPodium && html`<button onClick=${advance} style="height:44px;padding:0 20px;border-radius:999px;border:none;background:#19EB82;color:#232427;cursor:pointer;font-weight:800;font-size:15px;display:flex;align-items:center;gap:6px">${advanceLabel}${ARROW_R}</button>`}
      ${showPodium && html`<button onClick=${advance} style="height:44px;padding:0 20px;border-radius:999px;border:none;background:#19EB82;color:#232427;cursor:pointer;font-weight:800;font-size:15px;display:flex;align-items:center;gap:6px">Ver pódio final${ARROW_R}</button>`}
    </div>
  </div>

  ${ph === 'countdown' && html`<div style="flex-grow:1;display:flex;align-items:center;justify-content:center;gap:56px" role="status" aria-live="polite">
    <div class="talk" style="display:flex"><${Boneco} cor="#19EB82" tipo=${19} tam=${250} /></div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:18px">
      <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:26px;color:#A9A8AC">Pergunta ${st.qIndex + 1} de ${st.total}</div>
      <div style="position:relative;width:300px;height:300px;display:flex;align-items:center;justify-content:center">
        <div class=${cd % 2 ? 'cdRingA' : 'cdRingB'} aria-hidden="true" style="position:absolute;inset:0;border-radius:50%;border:8px solid #19EB82"></div>
        <div style="position:absolute;inset:30px;border-radius:50%;background:#313235"></div>
        <div class=${cd % 2 ? 'cdA' : 'cdB'} style="position:relative;font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:160px;line-height:1;color:#19EB82">${cd}</div>
      </div>
      <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:28px">Prepare-se!</div>
    </div>
  </div>`}

  ${(ph === 'question' || ph === 'reveal') && html`<div style="display:flex;gap:24px;align-items:flex-end;flex-grow:1;min-height:0">
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;flex-shrink:0">
        ${!revealed && html`<svg aria-hidden="true" width="40" height="60" viewBox="0 0 40 60" style="position:absolute;right:-30px;top:50px">
          <path class="w1" d="M8 16 Q18 30 8 44" fill="none" stroke="#19EB82" stroke-width="3.5" stroke-linecap="round"></path>
          <path class="w2" d="M20 8 Q36 30 20 52" fill="none" stroke="#19EB82" stroke-width="3.5" stroke-linecap="round"></path>
        </svg>`}
        <div class=${revealed ? 'party' : 'talk'} style="display:flex"><${Boneco} cor="#19EB82" tipo=${19} tam=${250} /></div>
        <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:16px;color:#19EB82;margin-top:4px">DooDoo</div>
      </div>
      <div class="bubble" key=${'b' + st.qIndex} style="flex:1;min-width:0;align-self:center;position:relative;background:#E7E6E6;color:#232427;border-radius:28px;padding:26px 32px;display:flex;flex-direction:column;gap:10px;box-shadow:0 10px 0 #A9A8AC">
        <svg aria-hidden="true" width="34" height="40" viewBox="0 0 34 40" style="position:absolute;left:-28px;bottom:34px"><path d="M34 2 L0 30 L34 26Z" fill="#E7E6E6"></path></svg>
        <div style="font-size:14px;font-weight:800;letter-spacing:.12em;color:#4A4C52">${revealed ? 'DOODOO REVELA: A CERTA É A LETRA ' + LETRAS[q.certa] + '!' : 'DOODOO PERGUNTA'}</div>
        <div style=${'font-family:Unbounded,system-ui,sans-serif;font-weight:700;line-height:1.22;text-wrap:pretty;font-size:' + (pergunta.length > 95 ? '27px' : '31px')}>${pergunta}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;align-self:center;flex-shrink:0">
        <div class=${hurry ? 'hurry' : ''} style="position:relative;width:150px;height:150px">
          <svg width="150" height="150" viewBox="0 0 180 180" aria-hidden="true">
            <circle cx="90" cy="90" r="78" fill="none" stroke="#44464B" stroke-width="14"></circle>
            <circle cx="90" cy="90" r="78" fill="none" stroke=${hurry ? '#FF6B4A' : '#19EB82'} stroke-width="14" stroke-linecap="round" stroke-dasharray="490" stroke-dashoffset=${String(490 * (1 - frac))} transform="rotate(-90 90 90)" style="transition:stroke-dashoffset 1s linear,stroke .3s"></circle>
          </svg>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:52px">${t}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:170px">
          <div style="font-size:15px;color:#A9A8AC"><strong style="color:#E7E6E6;font-size:20px">${answered}</strong> de ${eligible} responderam</div>
          <div style="width:100%;height:10px;border-radius:999px;background:#44464B;overflow:hidden">
            <div style=${'height:100%;border-radius:999px;background:#19EB82;transition:width .6s;width:' + (eligible ? Math.round((answered / eligible) * 100) : 0) + '%'}></div>
          </div>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px">${opcoes}</div>`}

  ${ph === 'rank' && html`<div style="display:flex;gap:40px;flex-grow:1;min-height:0;align-items:stretch">
      <div style="width:330px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:12px">
        <div class="bubble" style="position:relative;background:#E7E6E6;color:#232427;border-radius:24px;padding:20px 24px;display:flex;flex-direction:column;gap:8px;box-shadow:0 8px 0 #A9A8AC;align-self:stretch">
          <svg aria-hidden="true" width="34" height="30" viewBox="0 0 34 30" style="position:absolute;left:140px;bottom:-24px"><path d="M2 0 L17 28 L32 0Z" fill="#E7E6E6"></path></svg>
          <div style="font-size:13px;font-weight:800;letter-spacing:.12em;color:#4A4C52">DOODOO ANUNCIA</div>
          <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:24px;line-height:1.2">${isLastQ ? 'Fim de jogo! ' + leaderName + ' terminou na frente!' : 'Olha quem tá na frente: ' + leaderName + '!'}</div>
        </div>
        <div class="party" style="display:flex;margin-top:16px"><${Boneco} cor="#19EB82" tipo=${19} tam=${250} /></div>
        <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:16px;color:#19EB82">DooDoo</div>
      </div>
      <div class="board" style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:36px">Top ${Math.min(5, rk.length) || 5}</div>
          <div style="font-size:16px;color:#A9A8AC">depois da pergunta ${st.qIndex + 1} de ${st.total}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;background:#313235;border-radius:20px;padding:14px 18px" role="group" aria-label="Resultado da pergunta">
          <div style="display:flex;gap:12px;align-items:center">
            <div style="display:flex;align-items:center;gap:10px;flex:1">
              <div style="width:34px;height:34px;border-radius:50%;background:#19EB82;color:#232427;display:flex;align-items:center;justify-content:center;flex-shrink:0">${CHECK(18, 3.2)}</div>
              <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:30px;color:#19EB82">${acertos}</div>
              <div style="font-weight:800;font-size:17px">acertaram</div>
            </div>
            <div style="display:flex;align-items:center;gap:10px;flex:1;justify-content:flex-end">
              <div style="font-weight:800;font-size:17px">erraram</div>
              <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:30px;color:#FF6B4A">${erros}</div>
              <div style="width:34px;height:34px;border-radius:50%;background:#FF6B4A;color:#232427;display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg></div>
            </div>
          </div>
          <div style=${'display:flex;height:10px;border-radius:999px;overflow:hidden;background:' + (acertos + erros ? '#FF6B4A' : '#44464B')} aria-hidden="true">
            <div style=${'height:100%;background:#19EB82;border-right:' + (acertos && erros ? '3px solid #232427' : 'none') + ';width:' + (acertos + erros ? Math.round((acertos / (acertos + erros)) * 100) : 0) + '%'}></div>
          </div>
        </div>
        <div style="position:relative;flex:1">${rows}</div>
      </div>
    </div>`}
</div>`;
}

// ---------- Telão · 3 Pódio final ----------

const CONFETTI = (() => {
  const cols = ['#19EB82', '#14E6CD', '#E7E6E6', '#00A578', '#19EB82', '#8CF5C0'];
  const out = [];
  for (let i = 0; i < 46; i++) {
    const left = (i * 137) % 1280;
    const dur = 3.2 + ((i * 7) % 10) / 4;
    const delay = -((i * 13) % 40) / 10;
    const w = 8 + (i % 3) * 4;
    const h = i % 2 ? w : w * 2;
    out.push('left:' + left + 'px;width:' + w + 'px;height:' + h + 'px;background:' + cols[i % 6] + ';border-radius:' + (i % 4 === 0 ? '50%' : '2px') + ';animation-duration:' + dur + 's;animation-delay:' + delay + 's');
  }
  return out;
})();

function Lugar({ p, cls, anim, tam, nameSize, ptsSize, ptsColor, crown }) {
  return html`<div class=${cls} style=${'display:flex;flex-direction:column;align-items:center;gap:8px;visibility:' + (p ? 'visible' : 'hidden')}>
    ${crown && html`<svg class="crown" width="52" height="39" viewBox="0 0 32 24" fill="#14E6CD" stroke="#232427" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="M3 20 1 6l8 6 7-10 7 10 8-6-2 14z"></path></svg>`}
    <div class=${anim} style="display:flex">${p && html`<${Boneco} cor=${p.cor} tipo=${p.tipo} tam=${tam} />`}</div>
    <div style=${'font-weight:800;font-size:' + nameSize + 'px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'}>${p ? p.name : '—'}</div>
    <div style=${'font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:' + ptsSize + 'px;color:' + ptsColor}>${p ? fmt(p.score) + ' pts' : ''}</div>
  </div>`;
}

function Podio({ st }) {
  const [a, b, c] = st.podium || [];
  const novaPartida = () => { if (confirm('Começar uma nova partida? A pontuação e os resultados por pergunta serão apagados (baixe a planilha antes). Os jogadores conectados continuam na sala.')) send('host:reset'); };
  // Abre numa janela à parte, para quem organiza arrastar para a tela que não está no projetor.
  const verResultados = () => { window.open('/resultados', 'quiz-resultados', 'popup,width=1280,height=760'); };
  return html`<div class="s-podio" style="width:1280px;height:720px;box-sizing:border-box;position:relative;overflow:hidden;background:#232427;color:#E7E6E6;font-family:Manrope,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;padding-top:44px">
  <div aria-hidden="true" style="position:absolute;inset:0;pointer-events:none">${CONFETTI.map((s) => html`<div class="conf" style=${s}></div>`)}</div>
  <div class="halo" aria-hidden="true" style="position:absolute;width:640px;height:640px;border-radius:50%;background:#44464B;left:320px;top:120px"></div>
  <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:8px">
    <div style="font-size:18px;font-weight:800;letter-spacing:.14em;color:#A9A8AC">FIM DE JOGO</div>
    <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:56px">${a ? 'Temos um campeão!' : 'Fim de jogo!'}</div>
  </div>
  <div style="position:relative;display:flex;align-items:flex-end;gap:20px;margin-top:auto">
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;width:250px">
      <${Lugar} p=${b} cls="w2" anim="cheer" tam=${120} nameSize=${22} ptsSize=${18} ptsColor="#A9A8AC" />
      <div class="p2" style="width:100%;height:190px;background:#313235;border-radius:20px 20px 0 0;display:flex;justify-content:center;padding-top:18px;box-sizing:border-box;font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:64px;color:#14E6CD">2</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;width:290px">
      <${Lugar} p=${a} cls="w1" anim="jump" tam=${140} nameSize=${28} ptsSize=${20} ptsColor="#19EB82" crown=${true} />
      <div class="p1" style="width:100%;height:270px;background:#19EB82;border-radius:20px 20px 0 0;display:flex;justify-content:center;padding-top:18px;box-sizing:border-box;font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:84px;color:#232427">1</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px;width:250px">
      <${Lugar} p=${c} cls="w3" anim="cheer2" tam=${110} nameSize=${22} ptsSize=${18} ptsColor="#A9A8AC" />
      <div class="p3" style="width:100%;height:130px;background:#313235;border-radius:20px 20px 0 0;display:flex;justify-content:center;padding-top:18px;box-sizing:border-box;font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:56px;color:#19EB82">3</div>
    </div>
  </div>
  <div style="position:absolute;right:36px;top:32px;z-index:5;display:flex;gap:8px">
    <button onClick=${() => send('host:back')} aria-label="Voltar para o ranking" title="Voltar para o ranking" style="width:44px;height:44px;border-radius:50%;border:none;background:#313235;color:#E7E6E6;cursor:pointer;display:flex;align-items:center;justify-content:center">${ARROW_L}</button>
    <button onClick=${novaPartida} style="height:44px;padding:0 18px;border-radius:999px;border:none;background:#313235;color:#E7E6E6;cursor:pointer;font-weight:800;font-size:15px">Nova partida</button>
    <button onClick=${verResultados} style="height:44px;padding:0 18px;border-radius:999px;border:2px solid #44464B;background:#232427;color:#E7E6E6;cursor:pointer;font-weight:800;font-size:15px;display:flex;align-items:center;gap:8px;box-sizing:border-box">
      ${CADEADO(16)}
      Ver resultados
    </button>
  </div>
</div>`;
}

// ---------- chave do apresentador e conexão ----------

function PedirChave({ errou }) {
  const [v, setV] = useState('');
  const ok = (e) => {
    e.preventDefault();
    store.set(KEY_STORE, v.trim());
    socket.auth.key = v.trim();
    socket.disconnect().connect();
  };
  return html`<div style="width:1280px;height:720px;background:#120B2E;color:#FFF8EC;font-family:Manrope,system-ui,sans-serif;display:flex;align-items:center;justify-content:center">
    <form onSubmit=${ok} style="background:#1E1546;border-radius:28px;padding:36px 40px;display:flex;flex-direction:column;gap:16px;width:440px">
      <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:26px">Telão do apresentador</div>
      <label for="k" style="font-size:14px;font-weight:800;letter-spacing:.1em;color:#BDB4E0">CHAVE DO APRESENTADOR</label>
      <input id="k" value=${v} onInput=${(e) => setV(e.currentTarget.value)} autocomplete="off" style="font-family:Manrope,system-ui,sans-serif;font-weight:700;font-size:18px;background:#120B2E;color:#FFF8EC;border:2px solid #3B2F73;border-radius:16px;padding:14px 16px" />
      ${errou && html`<div role="alert" style="color:#FF6B4A;font-weight:700;font-size:14px">Chave incorreta. Ela aparece no log do servidor quando ele inicia.</div>`}
      <button style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:18px;background:#C6F432;color:#120B2E;border:none;border-radius:999px;padding:16px;cursor:pointer">Abrir telão</button>
    </form>
  </div>`;
}

function App() {
  const [st, setSt] = useState(null);
  const [auth, setAuth] = useState('pending');
  const [online, setOnline] = useState(socket.connected);
  useEffect(() => {
    socket.on('state', setSt);
    socket.on('host:ok', () => setAuth('ok'));
    socket.on('host:denied', () => setAuth(store.get(KEY_STORE) ? 'wrong' : 'ask'));
    socket.on('connect', () => setOnline(true));
    socket.on('disconnect', () => setOnline(false));
    // Passador de slides / teclado: → avança, ← volta.
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || !window.__phase) return;
      if (['ArrowRight', 'PageDown'].includes(e.key) && !['lobby', 'podium'].includes(window.__phase)) send('host:advance');
      if (['ArrowLeft', 'PageUp'].includes(e.key)) send('host:back');
    };
    addEventListener('keydown', onKey);
    socket.connect(); // só depois de registrar os ouvintes, para não perder o primeiro estado
    return () => removeEventListener('keydown', onKey);
  }, []);
  window.__phase = st && st.phase;

  let screen, bg = '#232427';
  if (auth === 'ask' || auth === 'wrong') { screen = html`<${PedirChave} errou=${auth === 'wrong'} />`; bg = '#0B0820'; }
  else if (!st || auth !== 'ok') screen = html`<div style="width:1280px;height:720px;background:#120B2E;color:#BDB4E0;font-family:Manrope,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700">Conectando…</div>`;
  else if (st.phase === 'lobby') { screen = html`<${Lobby} st=${st} />`; bg = '#0B0820'; }
  else if (st.phase === 'podium') screen = html`<${Podio} st=${st} />`;
  else screen = html`<${Pergunta} st=${st} />`;

  return html`<${Stage} bg=${bg}>
    ${screen}
    ${!online && auth === 'ok' && html`<div role="status" style="position:absolute;left:50%;top:12px;transform:translateX(-50%);background:#FF6B4A;color:#232427;font-family:Manrope,system-ui,sans-serif;font-weight:800;font-size:15px;padding:8px 18px;border-radius:999px;z-index:9999">Reconectando ao servidor…</div>`}
  </${Stage}>`;
}

render(html`<${App} />`, document.getElementById('app'));
