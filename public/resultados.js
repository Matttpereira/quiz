// Resultados por pergunta: só para quem organiza (precisa da chave do apresentador).
import { html, render, useState, useEffect } from '/vendor/preact.js';
import { Boneco, fmt, LETRAS, CORES_OPCAO, CADEADO } from '/shared.js';

const KEY_STORE = 'quiz.hostKey'; // a mesma chave que o telão guardou neste navegador
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

async function carregar(chave) {
  const r = await fetch('/api/resultados', { headers: { 'X-Host-Key': chave || '' }, cache: 'no-store' });
  if (r.status === 403) return { negado: true };
  if (!r.ok) throw new Error('Erro ' + r.status);
  return { dados: await r.json() };
}

const segundos = (ms) => (ms / 1000).toFixed(1).replace('.', ',');
const pessoas = (n) => n + (n === 1 ? ' pessoa' : ' pessoas');

// Primeiro quem acertou, depois quem respondeu mais rápido; quem não respondeu fica no fim.
function ordenar(respostas) {
  return respostas.slice().sort((a, b) =>
    (b.acertou - a.acertou) ||
    ((a.tempoMs ?? Infinity) - (b.tempoMs ?? Infinity)) ||
    a.name.localeCompare(b.name, 'pt-BR'));
}

// ---------- planilha ----------

// CSV no formato do Excel em português: separador ";" e BOM UTF-8 para os acentos.
function gerarCsv(dados) {
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita que um apelido vire fórmula no Excel
    return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const linhas = [['Nº da pergunta', 'Pergunta', 'Jogador', 'Opção escolhida', 'Acertou', 'Tempo (s)', 'Pontos']];
  for (const q of dados.perguntas) {
    for (const r of ordenar(q.respostas)) {
      linhas.push([
        q.num,
        q.pergunta,
        r.name,
        r.escolha === null ? 'Sem resposta' : LETRAS[r.escolha] + ') ' + q.opcoes[r.escolha],
        r.acertou ? 'sim' : 'não',
        r.tempoMs === null ? '' : segundos(r.tempoMs),
        r.pontos
      ]);
    }
  }
  return '﻿' + linhas.map((l) => l.map(esc).join(';')).join('\r\n') + '\r\n';
}

function baixar(dados) {
  const blob = new Blob([gerarCsv(dados)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  const dia = new Date(dados.startedAt || Date.now()).toISOString().slice(0, 10);
  a.href = URL.createObjectURL(blob);
  a.download = `resultados-quiz-${dia}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- telas ----------

function Negado({ errou, onChave }) {
  const [v, setV] = useState('');
  return html`<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box">
    <form onSubmit=${(e) => { e.preventDefault(); onChave(v.trim()); }} style="background:#313235;border-radius:24px;padding:32px;display:flex;flex-direction:column;gap:14px;width:100%;max-width:420px;box-sizing:border-box">
      <div style="display:flex;align-items:center;gap:10px;font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:22px">${CADEADO(22)} Sem permissão</div>
      <div style="font-size:15px;color:#A9A8AC;line-height:1.4">Os resultados individuais são só para quem organiza o quiz. Digite a chave do apresentador para ver.</div>
      <label for="k" style="font-size:13px;font-weight:800;letter-spacing:.1em;color:#A9A8AC">CHAVE DO APRESENTADOR</label>
      <input id="k" value=${v} onInput=${(e) => setV(e.currentTarget.value)} autocomplete="off" style="font-weight:700;font-size:17px;background:#232427;color:#E7E6E6;border:2px solid #44464B;border-radius:14px;padding:12px 14px" />
      ${errou && html`<div role="alert" style="color:#FF6B4A;font-weight:700;font-size:14px">Chave incorreta.</div>`}
      <button style="height:48px;border-radius:999px;border:none;background:#19EB82;color:#232427;font-weight:800;font-size:16px;cursor:pointer">Ver resultados</button>
    </form>
  </div>`;
}

function Resultados({ dados }) {
  const [sel, setSel] = useState(0);
  const [filtro, setFiltro] = useState('todos');
  const perguntas = dados.perguntas;
  const voltar = () => { if (window.opener) window.close(); else location.href = '/telao'; };

  let acertosGerais = 0, respostasGerais = 0;
  for (const q of perguntas) { acertosGerais += q.respostas.filter((r) => r.acertou).length; respostasGerais += q.respostas.length; }
  const mediaGeral = respostasGerais ? Math.round((acertosGerais / respostasGerais) * 100) : 0;
  const quando = dados.startedAt ? new Date(dados.startedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

  const cur = perguntas[Math.min(sel, perguntas.length - 1)];
  const nAcertos = cur ? cur.respostas.filter((r) => r.acertou).length : 0;
  const nTotal = cur ? cur.respostas.length : 0;
  const linhas = cur ? ordenar(cur.respostas).filter((r) => filtro === 'todos' || (filtro === 'certo' ? r.acertou : !r.acertou)) : [];
  const filtros = [['todos', `Todos (${nTotal})`], ['certo', `Acertaram (${nAcertos})`], ['errado', `Erraram (${nTotal - nAcertos})`]];

  return html`<div class="pagina">
  <div class="topo">
    <button onClick=${voltar} aria-label="Voltar ao pódio" title="Voltar ao pódio" style="width:44px;height:44px;border-radius:50%;background:#313235;color:#E7E6E6;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"></path></svg>
    </button>
    <div style="display:flex;flex-direction:column;gap:4px;flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <h1 style="margin:0;font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:24px">Resultados por pergunta</h1>
        <div style="display:flex;align-items:center;gap:6px;background:#313235;border:1px solid #44464B;border-radius:999px;padding:5px 12px;font-size:13px;font-weight:800;color:#A9A8AC">
          ${CADEADO(13)} Só para quem organiza · não aparece no telão
        </div>
      </div>
      <div style="font-size:14px;color:#A9A8AC">${dados.titulo}${quando ? ' · ' + quando : ''}</div>
    </div>
    <div class="topo-acoes">
      <div style="background:#313235;border-radius:14px;padding:8px 14px;display:flex;flex-direction:column;align-items:center">
        <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:20px">${dados.jogadores}</div>
        <div style="font-size:12px;color:#A9A8AC;font-weight:700">${dados.jogadores === 1 ? 'jogador' : 'jogadores'}</div>
      </div>
      <div style="background:#313235;border-radius:14px;padding:8px 14px;display:flex;flex-direction:column;align-items:center">
        <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:20px;color:#19EB82">${mediaGeral}%</div>
        <div style="font-size:12px;color:#A9A8AC;font-weight:700">acertos no geral</div>
      </div>
      <button onClick=${() => baixar(dados)} disabled=${!perguntas.length} style=${'height:44px;padding:0 18px;border-radius:999px;border:none;background:#19EB82;color:#232427;font-weight:800;font-size:15px;cursor:pointer;display:flex;align-items:center;gap:8px;opacity:' + (perguntas.length ? 1 : 0.5)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path></svg>
        Baixar planilha
      </button>
    </div>
  </div>

  ${!cur && html`<div style="flex:1;display:flex;align-items:center;justify-content:center;background:#313235;border-radius:24px;padding:32px;text-align:center;color:#A9A8AC;font-size:17px;font-weight:700">
    Os resultados aparecem aqui depois que a primeira pergunta for revelada.
  </div>`}

  ${cur && html`<div class="corpo">
    <nav aria-label="Perguntas" class="lista scroller">
      ${perguntas.map((q, i) => {
        const a = q.respostas.filter((r) => r.acertou).length;
        const on = q === cur;
        return html`<button key=${q.num} onClick=${() => { setSel(i); setFiltro('todos'); }} aria-current=${on ? 'true' : 'false'}
          style=${'text-align:left;cursor:pointer;border-radius:16px;padding:12px 14px;display:flex;flex-direction:column;gap:6px;color:#E7E6E6;background:' + (on ? '#44464B' : '#313235') + ';border:2px solid ' + (on ? '#19EB82' : 'transparent')}>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
            <span style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:14px">Questão ${q.num}</span>
            <span style="font-size:13px;font-weight:800">${a}/${q.respostas.length} acertos</span>
          </div>
          <span style="font-size:13px;line-height:1.3;color:#A9A8AC;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${q.pergunta}</span>
          <span style=${'display:flex;height:6px;border-radius:999px;overflow:hidden;background:' + (q.respostas.length ? '#FF6B4A' : '#44464B')} aria-hidden="true"><span style=${'display:block;height:100%;background:#19EB82;width:' + (q.respostas.length ? Math.round((a / q.respostas.length) * 100) : 0) + '%'}></span></span>
        </button>`;
      })}
      ${perguntas.length < dados.totalPerguntas && html`<div style="font-size:13px;color:#A9A8AC;padding:4px 6px">${dados.totalPerguntas - perguntas.length} pergunta(s) ainda não revelada(s).</div>`}
    </nav>

    <section class="detalhe" aria-live="polite">
      <div style="display:flex;flex-direction:column;gap:6px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:13px;font-weight:800;letter-spacing:.12em;color:#A9A8AC">QUESTÃO ${cur.num} DE ${dados.totalPerguntas}</div>
          ${cur.dobro && html`<div style="background:#14E6CD;color:#232427;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:800">Pontos em dobro</div>`}
        </div>
        <div style="font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:19px;line-height:1.3;text-wrap:pretty">${cur.pergunta}</div>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${cur.opcoes.map((texto, j) => {
          const certa = j === cur.certa;
          const qtd = cur.respostas.filter((r) => r.escolha === j).length;
          return html`<div style=${'flex:1 1 300px;min-width:0;display:flex;align-items:center;gap:10px;border-radius:14px;padding:10px 12px;background:#232427;border:2px solid ' + (certa ? '#19EB82' : '#44464B')}>
            <span style=${'width:30px;height:30px;flex-shrink:0;border-radius:9px;display:flex;align-items:center;justify-content:center;font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:14px;color:#232427;background:' + CORES_OPCAO[j][0]}>${LETRAS[j]}</span>
            <span style="flex:1;min-width:0;font-size:13px;font-weight:700;line-height:1.3">${texto}</span>
            <span style="font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:16px;white-space:nowrap">${pessoas(qtd)}</span>
            ${certa && html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#19EB82" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Resposta certa"><path d="M4 12.5 9.5 18 20 6"></path></svg>`}
          </div>`;
        })}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="display:flex;gap:8px;flex-wrap:wrap" role="group" aria-label="Filtrar jogadores">
          ${filtros.map(([k, label]) => html`<button onClick=${() => setFiltro(k)} aria-pressed=${filtro === k ? 'true' : 'false'}
            style=${'height:40px;padding:0 14px;border-radius:999px;cursor:pointer;font-weight:800;font-size:14px;border:none;background:' + (filtro === k ? '#E7E6E6' : '#232427') + ';color:' + (filtro === k ? '#232427' : '#E7E6E6')}>${label}</button>`)}
        </div>
        <div style="font-size:13px;color:#A9A8AC">Ordenado por acerto e tempo de resposta</div>
      </div>

      <div role="table" class="tabela" aria-label="Respostas dos jogadores" style="flex:1;min-height:0;display:flex;flex-direction:column;border-radius:16px;overflow:hidden;background:#232427">
        <div role="row" class="grade" style="padding:10px 16px;font-size:12px;font-weight:800;letter-spacing:.08em;color:#A9A8AC;border-bottom:1px solid #44464B">
          <span role="columnheader">JOGADOR</span>
          <span role="columnheader">RESPONDEU</span>
          <span role="columnheader">RESULTADO</span>
          <span role="columnheader">TEMPO</span>
          <span role="columnheader" style="text-align:right">PONTOS</span>
        </div>
        <div class="scroller tabela-rolagem" style="flex:1;min-height:0;overflow-y:auto">
          ${linhas.length === 0 && html`<div style="padding:20px 16px;color:#A9A8AC;font-size:14px;font-weight:700">Ninguém nesse filtro.</div>`}
          ${linhas.map((r, idx) => {
            const semResposta = r.escolha === null;
            const chip = r.acertou ? ['#19EB82', '#232427', 'Acertou'] : semResposta ? ['#44464B', '#E7E6E6', 'Sem resposta'] : ['#FF6B4A', '#232427', 'Errou'];
            return html`<div key=${cur.num + '-' + r.id} class="row grade" role="row" style=${'padding:6px 16px;align-items:center;border-bottom:1px solid #313235;animation-delay:' + Math.min(idx * 0.02, 0.6).toFixed(2) + 's'}>
              <span role="cell" style="display:flex;align-items:center;gap:10px;min-width:0">
                <span style="width:26px;height:40px;display:flex;justify-content:center;flex-shrink:0"><${Boneco} cor=${r.cor} tipo=${r.tipo} tam=${40} /></span>
                <span style="font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.name}</span>
              </span>
              <span role="cell" style="display:flex;align-items:center">
                ${semResposta
                  ? html`<span style="width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;color:#A9A8AC;background:#313235" aria-label="Sem resposta">—</span>`
                  : html`<span style=${'width:32px;height:32px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-family:Unbounded,system-ui,sans-serif;font-weight:900;font-size:15px;color:#232427;background:' + CORES_OPCAO[r.escolha][0]}>${LETRAS[r.escolha]}</span>`}
              </span>
              <span role="cell" style="display:flex;align-items:center">
                <span style=${'display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:5px 12px;font-weight:800;font-size:13px;white-space:nowrap;color:' + chip[1] + ';background:' + chip[0]}>
                  ${r.acertou && html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6"></path></svg>`}
                  ${!r.acertou && !semResposta && html`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"></path></svg>`}
                  ${chip[2]}
                </span>
              </span>
              <span role="cell" style="font-size:14px;font-weight:700;color:#A9A8AC;display:flex;align-items:center">${r.tempoMs === null ? '—' : segundos(r.tempoMs) + 's'}</span>
              <span role="cell" style="font-family:Unbounded,system-ui,sans-serif;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:flex-end">${r.pontos ? '+' + fmt(r.pontos) : '0'}</span>
            </div>`;
          })}
        </div>
      </div>
    </section>
  </div>`}
</div>`;
}

function App() {
  const [estado, setEstado] = useState({ carregando: true });
  const abrir = async (chave) => {
    try {
      const r = await carregar(chave);
      if (r.negado) setEstado({ negado: true, errou: !!chave });
      else { if (chave) store.set(KEY_STORE, chave); setEstado({ dados: r.dados }); }
    } catch (e) {
      setEstado({ erro: 'Não foi possível carregar os resultados. Confira a conexão e recarregue a página.' });
    }
  };
  useEffect(() => { abrir(store.get(KEY_STORE)); }, []);

  if (estado.carregando) return html`<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;color:#A9A8AC;font-weight:700">Carregando…</div>`;
  if (estado.erro) return html`<div role="alert" style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center;color:#FF6B4A;font-weight:700">${estado.erro}</div>`;
  if (estado.negado) return html`<${Negado} errou=${estado.errou} onChave=${abrir} />`;
  return html`<${Resultados} dados=${estado.dados} />`;
}

render(html`<${App} />`, document.getElementById('app'));
