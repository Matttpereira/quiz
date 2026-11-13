# Quiz ao Vivo

Quiz multiplayer para o fim da apresentação: o **telão** (projetor/TV) mostra a
sala, as perguntas, o ranking e o pódio; cada colaborador entra pelo **celular**
lendo o QR Code, sem instalar nada. Tudo fica sincronizado em tempo real por um
único servidor.

## Rodar no computador

Precisa do Node.js 18 ou mais novo.

```bash
npm install
npm start
```

O terminal mostra dois endereços:

- **Telão:** `http://localhost:3000/telao?key=<chave>`. Abra no computador ligado ao projetor (F11 para tela cheia). A chave fica salva nesse navegador.
- **Celulares:** o QR Code no telão já aponta para o endereço certo.

Rodando localmente, o QR Code usa o IP do computador na rede (ex.: `http://192.168.0.83:3000/`).
Os celulares precisam estar **no mesmo Wi‑Fi**, e o Wi‑Fi não pode isolar os aparelhos
(redes corporativas e de visitantes costumam isolar). Para uma apresentação, prefira publicar (abaixo).

## Editar o quiz

Tudo fica em [quiz.json](quiz.json). Neste repositório as perguntas e respostas originais
foram trocadas por marcadores (`[PERGUNTA 1]`, `[RESPOSTA A]`…); substitua pelo seu conteúdo.

| Campo | O que faz |
|---|---|
| `titulo` | Nome do quiz no telão e no celular (hoje está `[NOME DO QUIZ]`, igual ao design) |
| `segundosPorPergunta` | Tempo de cada pergunta (padrão 20) |
| `segundosContagem` | Contagem 3‑2‑1 antes de cada pergunta |
| `dobroNaUltima` | Última pergunta vale o dobro |
| `revelarQuandoTodosResponderem` | Revela assim que todos os conectados responderem, sem esperar o tempo |
| `perguntas` | Texto, 2 a 4 `opcoes` e o índice da `certa` (0 = A, 1 = B…) |

A resposta certa fica só no servidor e chega aos aparelhos apenas na revelação.

## Como o apresentador conduz

| Tela | Botão | Teclado / passador de slides |
|---|---|---|
| Sala de espera | **Começar o jogo** (desativado sem jogadores) | — |
| Contagem | Pular contagem | → ou PageDown |
| Pergunta | Revelar resposta (ou espera o tempo / todos responderem) | → |
| Revelação | Ver ranking | → |
| Ranking | Próxima pergunta / **Ver pódio final** · ‹ volta para a resposta | → / ← |
| Pódio | ‹ volta para o ranking · **Nova partida** (zera pontos, mantém os jogadores) | ← |

## Resultados por pergunta (só para quem organiza)

No pódio final, o botão **🔒 Ver resultados** abre uma janela separada (`/resultados`). Arraste essa janela para a tela do notebook que não está no projetor. Ela mostra, para cada pergunta, quantas pessoas escolheram cada opção e o que cada jogador respondeu, com resultado, tempo e pontos. Também tem filtros (Todos, Acertaram, Erraram).

- **Baixar planilha** gera um CSV com uma linha por jogador por pergunta. O arquivo usa `;` e acentos em UTF-8, então abre direto no Excel em português.
- Os dados vêm de `/api/resultados` e só são entregues com a chave do apresentador. Sem a chave, a página mostra "Sem permissão".
- O telão e os celulares continuam mostrando só os totais de acertos e erros.
- **Nova partida** apaga os resultados. Baixe a planilha antes.

## Pontuação (calculada no servidor)

- Acerto: `500 + 500 × (tempo restante ÷ tempo total)`, medido pelo horário em que a resposta **chegou ao servidor**.
- Última pergunta: pontos em dobro.
- Erro ou sem resposta: 0 e a sequência de acertos zera.
- Desempate no ranking: quem entrou primeiro na sala.

## Publicar com link público (recomendado)

O jeito mais simples é o [Render](https://render.com) (tem plano gratuito):

1. Suba esta pasta para um repositório no GitHub.
2. No Render: **New → Blueprint** e escolha o repositório. O [render.yaml](render.yaml) já configura tudo e gera uma `HOST_KEY` secreta.
3. Depois do deploy, abra `https://<seu-app>.onrender.com/telao?key=<HOST_KEY>`. A chave fica em *Environment* no painel do Render.
4. O QR Code passa a apontar sozinho para `https://<seu-app>.onrender.com/`.

Cuidados:

- **O plano gratuito "dorme"** depois de 15 min sem uso e leva cerca de 1 minuto para acordar. Abra o telão uns 5 minutos antes de apresentar.
- **Use uma única instância.** O estado da partida fica na memória do servidor. Ele também é gravado em `data/state.json`, mas no Render esse disco é apagado a cada novo deploy. Não faça deploy durante a partida.
- Funciona em qualquer hospedagem Node com WebSocket (Railway, Fly.io, uma VM…): `npm ci --omit=dev && npm start`, com a porta em `PORT`.

### Variáveis de ambiente

| Variável | Para quê |
|---|---|
| `HOST_KEY` | Chave do apresentador. Sem ela, o servidor gera uma e grava em `data/host-key.txt` |
| `PUBLIC_URL` | Força o endereço do QR Code (ex.: um domínio próprio) |
| `PORT` | Porta HTTP (padrão 3000) |
| `DATA_DIR` / `QUIZ_FILE` | Onde gravar o estado / qual arquivo de perguntas usar |

Nenhum segredo vai para o navegador. A `HOST_KEY` só é digitada no computador do telão.

## Ensaiar com jogadores falsos

```bash
npm run simular -- 15 http://localhost:3000
```

Coloca 15 jogadores na sala, que respondem sozinhos em momentos aleatórios. Encerre com Ctrl+C.

## Teste de carga

```bash
npm run carga -- 50 https://seu-app.onrender.com
```

Sem chave, testa só 50 pessoas entrando ao mesmo tempo. Com a chave do apresentador (`$env:HOST_KEY="..."` antes, no PowerShell), joga a partida inteira com os 50 e mede tempos e erros. A partida precisa estar na sala de espera e não pode haver ninguém jogando de verdade.

## Testes

```bash
npm test
```

- `scripts/game.test.js`: regras com relógio simulado. Cobre validação de apelido, fluxo completo, tempo esgotado, resposta duplicada ou atrasada, pontos em dobro, reconexão e restauração após reinício.
- `scripts/e2e.test.js`: sobe o servidor de verdade e joga uma partida inteira com o telão e 5 celulares simultâneos. Cobre QR Code, chave errada, apelido repetido, jogador tentando comandar o telão, reconexão no meio da partida, pódio e nova partida.

## Estrutura

```
server/game.js     regras e estado oficial da partida (sem rede, testável)
server/index.js    Express + Socket.IO: páginas, QR Code, eventos, gravação do estado
public/telao.*     Telão: Sala de espera, Pergunta (contagem/pergunta/revelação/ranking), Pódio
public/celular.*   Celular: Entrar, Personagem, Espera, Responder (resposta travada, acerto/erro, posição)
public/shared.js   relógio sincronizado com o servidor e o componente Boneco
public/boneco-data.js  os 23 personagens, extraídos do design (scripts/gen-boneco.cjs)
quiz.json          título, tempos e perguntas
```

## Adaptações em relação ao design

As telas, cores, fontes, animações e personagens são os do design. Mudou apenas o necessário para funcionar com várias pessoas:

- **Celular · Espera (nova):** o design não tinha tela entre "Pronto, entrar!" e a primeira pergunta. Ela foi montada com peças do próprio design: o personagem do jogador, "Você está na sala!" e os três pontinhos de "Resposta travada".
- **"Próxima pergunta" no celular** virou um aviso desativado ("Aguarde a próxima pergunta…"), porque só o apresentador avança. **"Jogar de novo"** abre a troca de personagem para a próxima partida.
- **Botão "voltar" do telão** só volta da tela de ranking para a de resposta, ou do pódio para o ranking. Voltar para uma pergunta já respondida bagunçaria a pontuação.
- **Pódio** ganhou um botão discreto **Nova partida**.
- **Mensagens novas**: erro de apelido, "Reconectando…", "Enviando…" e chave do apresentador.
- **QR Code** real no lugar do placeholder, com o endereço escrito embaixo para quem preferir digitar.
- "X de **18** responderam" e "de 18" usam o número real de jogadores.
