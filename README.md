# NO MERCY

Jogo de cartas estratégico e competitivo, para 2 a 8 jogadores, online com amigos e/ou bots.
A essência: **prever exatamente quantas rodadas você vai vencer**. Vencer demais também é errar.

## Estrutura

```
shared/   Motor de regras puro (TypeScript), IA dos bots, visão por jogador e tipos do protocolo
server/   Node.js + Express + Socket.IO — servidor autoritativo (salas, turnos, bots, temporizadores)
client/   React + Vite + Tailwind + Framer Motion + Lucide — interface responsiva
e2e/      Teste de fumaça da interface com Playwright
```

O servidor é **autoritativo**: o navegador envia apenas intenções (`game:bid`, `game:play`…);
o servidor valida no motor de regras e devolve a cada jogador uma **visão própria**
(`getPlayerView`). Na partida às cegas, a carta do próprio jogador nunca é enviada ao
navegador dele (nem cor, nem valor, nem id) — não é um truque de CSS. Mãos dos adversários
em partidas normais chegam apenas como contagem.

## Rodando

```bash
npm install
npm run dev          # servidor :3001 + Vite :5173 (proxy de WebSocket)
```

Abra http://localhost:5173. Para jogar com amigos na mesma rede, use o IP da máquina.

Produção (um único processo serve a interface e o WebSocket):

```bash
npm run build
npm start            # http://localhost:3001  (PORT configurável)
```

Ou com Docker: `docker build -t no-mercy . && docker run -p 3001:3001 no-mercy`.
Qualquer hospedagem com WebSocket persistente funciona (Render, Fly.io, Railway, VPS…).
Variáveis: `PORT`, `CORS_ORIGIN` (lista separada por vírgula, se o cliente estiver em outro domínio),
`VITE_SERVER_URL` (no build do cliente, se o servidor estiver em outro domínio),
`TIMING_SCALE` (ex.: `0.25` acelera bots/transições para testes).

## Publicar de graça (Render) e aparecer no Google

1. Suba este projeto para um repositório no GitHub.
2. Em https://render.com: **New + → Blueprint**, escolha o repositório (o `render.yaml` já configura tudo) — ou
   **New + → Web Service → Docker → plano Free**.
3. Quando ficar **Live**, copie o endereço (ex.: `https://no-mercy-xxxx.onrender.com`) e preencha a variável
   **SITE_URL** com ele em *Environment*. Isso gera `robots.txt`, `sitemap.xml`, link canônico e a prévia de link corretos.
4. Google: em https://search.google.com/search-console adicione a propriedade (prefixo do URL), verifique
   (método "Tag HTML" ou arquivo), envie o sitemap `SEU_SITE/sitemap.xml` e peça a indexação da página inicial.

O plano gratuito "dorme" após ~15 min sem uso (o primeiro acesso depois disso demora ~1 min) e as salas ficam em memória.

## Instalar como aplicativo (PC e celular)

O jogo é um PWA: no Chrome/Edge aparece **Instalar NO MERCY** (ícone na barra de endereço ou o botão
"Instalar app" na tela inicial), criando atalho na área de trabalho com janela própria. No Android: menu → *Instalar app*.
No iPhone: Safari → Compartilhar → *Adicionar à Tela de Início*. Requer HTTPS (o Render já fornece).

## Mesa 3D

Nas partidas de 2 a 4 jogadores a mesa vira uma cena 3D (three.js, carregada só quando necessária) com três
personagens originais criados por código. O botão **3D/2D** na barra superior alterna a qualquer momento;
sem suporte a WebGL o jogo usa automaticamente a mesa 2D.

## Testes

```bash
npm test             # Vitest: motor de regras (23) + integração multiplayer com Socket.IO (5)
npm run typecheck
npm run test:e2e     # requer servidor rodando (npm run build && npm start); FULL_GAME=1 joga até o campeão
```

Os testes cobrem: 55 cartas únicas; Fisher–Yates; hierarquia de cores e coringas (incluindo o exemplo
oficial do 1 vermelho); tabela de partidas (13/11/9/7/6); rotação de quem embaralha e do jogador
inicial; restrição do último palpite; partida às cegas (privacidade + revelação com coringas
maximizados); pontuação 10 + palpite; desempate às cegas repetido até campeão único; jogos completos
com bots para 2 a 8 jogadores; salas, código, bots, reconexão, jogador ausente e payloads inválidos.

## Regras resumidas

- 55 cartas: 5 cores (Preto › Azul-escuro › Vermelho › Verde › Amarelo), cada uma com 1–10 e um coringa.
- Coringa maximizado › 10 › … › 1 › coringa minimizado. Cor desempata apenas níveis iguais.
- De 2 a 8 jogadores. Partida *n* distribui *n* cartas; o jogo tem `floor(55 / jogadores)` partidas.
- O baralho é embaralhado (Fisher–Yates com aleatoriedade criptográfica do servidor), cortado e distribuído uma carta por vez.
- Quem embaralha avança a cada partida; o da esquerda começa os palpites e a 1ª rodada da partida.
  Nas rodadas seguintes, quem venceu a rodada anterior começa jogando. Não é obrigatório seguir cor.
- O último palpite não pode fazer a soma igual ao número de rodadas.
- 1ª partida às cegas: você vê as cartas dos outros, não a sua; coringas maximizados.
- Acertou: 10 + palpite. Errou: 0.
- Empate no topo: partida extra às cegas só entre os empatados (acertar 0 = 10, acertar 1 = 11),
  repetida até haver campeão único; histórico separado do placar principal.

## Som e voz

- **Chat de voz** (multiplayer): WebRTC direto entre os navegadores; o servidor só repassa a sinalização.
  Microfone liga/desliga a qualquer momento, troca de microfone e de saída de áudio durante a partida,
  volume e silenciar vozes. Exige HTTPS em produção (ou `localhost`). Em redes muito restritas pode
  ser preciso um servidor TURN: configure `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` no build.
- **Música** de fundo (blues de bar) e **efeitos sonoros**, gerados no navegador com Web Audio,
  cada um com liga/desliga e volume. Preferências ficam salvas no navegador.

## Bots

A IA usa apenas a visão do próprio bot (sem trapaça): estima a chance de cada carta vencer
considerando as cartas ainda desconhecidas, palpita perto do valor esperado respeitando a regra
do último, e durante as rodadas alterna entre buscar vitórias baratas e descartar cartas altas
de forma segura conforme o que ainda falta para acertar o palpite. Também assume a vez de
humanos desconectados (após 15 s) ou com tempo esgotado.
