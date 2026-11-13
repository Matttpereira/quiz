// Peças usadas pelo telão e pelo celular: conexão, relógio do servidor e o Boneco.
import { html, useState, useEffect } from '/vendor/preact.js';
import { BONECOS } from '/boneco-data.js';

export const CORES = ['#FF6B4A', '#3D8BFF', '#FFC43D', '#2EC4A6', '#B88CFF', '#FF8FC7', '#C6F432'];
export const LETRAS = ['A', 'B', 'C', 'D'];
export const CORES_OPCAO = [['#19EB82', '#0FA35B'], ['#14E6CD', '#0EA392'], ['#E7E6E6', '#A9A8AC'], ['#00A578', '#006B4E']];
export const fmt = (n) => Number(n || 0).toLocaleString('pt-BR');
export const CADEADO = (w) => html`<svg width=${w} height=${w} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path></svg>`;

// Diferença entre o relógio do servidor e o do aparelho. Todo cronômetro é
// calculado a partir do horário do servidor, então todos veem o mesmo tempo.
let offset = 0;
export const serverNow = () => Date.now() + offset;

export function syncClock(socket) {
  let best = Infinity;
  const ping = () => {
    const t0 = Date.now();
    socket.timeout(5000).emit('time', (err, srv) => {
      if (err) return;
      const t1 = Date.now();
      const rtt = t1 - t0;
      if (rtt <= best * 1.5) { best = Math.min(best, rtt); offset = srv - (t0 + t1) / 2; }
    });
  };
  socket.on('connect', () => { best = Infinity; for (let i = 0; i < 3; i++) setTimeout(ping, i * 400); });
  setInterval(ping, 30_000);
}

// Re-renderiza periodicamente (cronômetros e animação dos bonecos).
export function useNow(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => { const iv = setInterval(() => set((x) => x + 1), ms); return () => clearInterval(iv); }, [ms]);
  return serverNow();
}

export function secondsLeft(endsAt) {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - serverNow()) / 1000));
}

// Componente "Boneco" do design (23 personagens em SVG).
export function Boneco({ cor = '#FFC43D', tipo = 0, tam = 160 }) {
  const t = Math.abs(Number(tipo) || 0) % 23;
  const h = Number(tam);
  const inner = '<ellipse cx="20" cy="62" rx="12" ry="1.8" fill="#000000" opacity=".3"></ellipse>' + BONECOS[t].replaceAll('__COR__', cor);
  return html`<div style=${`width:${Math.round(h * 0.625)}px;height:${h}px;flex-shrink:0`}>
    <svg class="boneco" width="100%" height="100%" viewBox="0 0 40 64" aria-hidden="true" style="display:block;overflow:visible" dangerouslySetInnerHTML=${{ __html: inner }}></svg>
  </div>`;
}
