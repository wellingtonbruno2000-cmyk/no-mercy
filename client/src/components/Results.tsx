import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Crown, Dices, LogOut, Medal, RotateCcw, Swords, Trophy, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { playPower, type Card, type HandRecord, type PlayerView, type RoomView } from '@nomercy/shared';
import { PlayingCard } from './PlayingCard';
import { useCountdown } from '../lib/hooks';
import { leaveRoom, send } from '../lib/store';
import { Avatar } from './Avatar';
import type { Names } from './Game';
import { Modal } from './Modal';

function ResultTable({ rec, g, names }: { rec: HandRecord; g: PlayerView; names: Names }) {
  const order = g.players.map((p) => p.id).filter((id) => rec.participants.includes(id));
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-mist/60">
          <tr>
            <th className="px-3 py-2 text-left">Jogador</th>
            <th className="px-2 py-2">Palpite</th>
            <th className="px-2 py-2">Venceu</th>
            <th className="px-2 py-2">Pontos</th>
            {rec.totals && <th className="px-3 py-2 text-right">Total</th>}
          </tr>
        </thead>
        <tbody>
          {order.map((id, i) => {
            const pts = rec.points[id];
            const hit = pts > 0;
            return (
              <motion.tr
                key={id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * i }}
                className={`border-t border-white/5 ${id === g.you ? 'bg-violet/15' : ''}`}
              >
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2 font-semibold text-white">
                    <Avatar name={names.name(id)} seat={names.seat(id)} size="sm" />
                    <span className="truncate">{id === g.you ? 'Você' : names.name(id)}</span>
                  </span>
                </td>
                <td className="px-2 py-2 text-center font-bold">{rec.bids[id]}</td>
                <td className="px-2 py-2 text-center font-bold">{rec.tricks[id]}</td>
                <td className="px-2 py-2 text-center">
                  <span
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-black ${
                      hit ? 'bg-emerald-500/25 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {hit ? <Check size={14} /> : <X size={14} />}
                    {hit ? `+${pts}` : '0'}
                  </span>
                </td>
                {rec.totals && <td className="px-3 py-2 text-right font-display text-gold">{rec.totals[id]}</td>}
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const cardValue = (c: Card) => (c.value === 'JOKER' ? 11 : (c.value as number));

/** Cartas que cada jogador recebeu na partida (transparência do embaralhamento). */
function DealtCards({ rec, g, names }: { rec: HandRecord; g: PlayerView; names: Names }) {
  const [open, setOpen] = useState(false);
  const dealt = rec.dealt ?? {};
  const order = g.players.map((p) => p.id).filter((id) => dealt[id]);
  if (order.length === 0) return null;
  return (
    <div className="rounded-2xl bg-black/20 ring-1 ring-white/10">
      <button className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm font-bold text-mist" onClick={() => setOpen(!open)} data-testid="dealt-toggle">
        <span className="flex items-center gap-2">
          <Dices size={16} className="text-gold" /> Cartas que cada um recebeu
        </span>
        <ChevronDown size={16} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          {order.map((id) => {
            const cards = dealt[id].slice().sort((a, b) => playPower(a, a.value === 'JOKER' ? 'MAX' : null) - playPower(b, b.value === 'JOKER' ? 'MAX' : null));
            const avg = cards.reduce((a, c) => a + cardValue(c), 0) / cards.length;
            return (
              <div key={id} className="flex items-center gap-2">
                <span className="w-20 shrink-0 truncate text-xs font-semibold text-white">{id === g.you ? 'Você' : names.name(id)}</span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {cards.map((c) => (
                    <PlayingCard key={c.id} card={c} size="xs" />
                  ))}
                </div>
                <span className="shrink-0 text-[11px] font-bold text-gold" title="Valor médio (coringa = 11)">
                  média {avg.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Soma da sorte de cada jogador no jogo: prova de que o embaralhamento não favorece ninguém. */
function LuckTable({ g, names }: { g: PlayerView; names: Names }) {
  const rows = g.players.map((p) => {
    let n = 0;
    let sum = 0;
    let jokers = 0;
    let strong = 0;
    for (const h of g.handHistory) {
      for (const c of h.dealt?.[p.id] ?? []) {
        n++;
        sum += cardValue(c);
        if (c.value === 'JOKER') jokers++;
        if (cardValue(c) >= 9) strong++;
      }
    }
    return { id: p.id, n, avg: n ? sum / n : 0, jokers, strong };
  });
  if (rows.every((r) => r.n === 0)) return null;
  return (
    <div className="mt-5 space-y-2" data-testid="luck-table">
      <h3 className="flex items-center gap-2 font-display text-white">
        <Dices size={18} className="text-gold" /> Sorte nas cartas (este jogo)
      </h3>
      <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-mist/60">
            <tr>
              <th className="px-3 py-2 text-left">Jogador</th>
              <th className="px-2 py-2">Cartas</th>
              <th className="px-2 py-2">Média</th>
              <th className="px-2 py-2">9, 10 e coringas</th>
              <th className="px-2 py-2">Coringas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-white/5 ${r.id === g.you ? 'bg-violet/15' : ''}`}>
                <td className="px-3 py-1.5 font-semibold text-white">{r.id === g.you ? 'Você' : names.name(r.id)}</td>
                <td className="px-2 py-1.5 text-center">{r.n}</td>
                <td className="px-2 py-1.5 text-center font-bold text-gold">{r.avg.toFixed(2)}</td>
                <td className="px-2 py-1.5 text-center">{r.n ? Math.round((100 * r.strong) / r.n) : 0}%</td>
                <td className="px-2 py-1.5 text-center">{r.jokers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-mist/50">
        Média esperada: 6,0 (coringa = 11) · 27% de cartas fortes. Com poucas partidas a sorte varia; ao longo do jogo os números se aproximam para todos.
      </p>
    </div>
  );
}

export function HandResult({ g, names, deadline }: { g: PlayerView; names: Names; deadline: number | null }) {
  const open = g.phase === 'HAND_RESULT' && !!g.lastHandResult;
  const cd = useCountdown(open ? deadline : null);
  const rec = g.lastHandResult;
  const tiebreak = rec?.stage === 'TIEBREAK';
  const isLastMain = rec?.stage === 'MAIN' && rec.number === g.maxHands;
  return (
    <Modal
      open={open}
      title={
        rec ? (
          <span className="flex items-center gap-2">
            {tiebreak ? <Swords className="text-gold" /> : <Trophy className="text-gold" />}
            {tiebreak ? `Resultado do desempate #${rec.number}` : `Fim da partida ${rec.number}`}
          </span>
        ) : null
      }
      wide
    >
      {rec && (
        <div className="space-y-4" data-testid="hand-result">
          {rec.points[g.you] !== undefined && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`rounded-2xl p-3 text-center font-display text-lg ${
                rec.points[g.you] > 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
              }`}
            >
              {rec.points[g.you] > 0 ? `Na mosca! +${rec.points[g.you]} pontos` : 'Errou o palpite. Sem piedade: 0 pontos.'}
            </motion.div>
          )}
          <ResultTable rec={rec} g={g} names={names} />
          <DealtCards rec={rec} g={g} names={names} />
          <p className="text-center text-sm text-mist/60">
            {cd
              ? isLastMain
                ? `Resultado final em ${cd.seconds}s…`
                : tiebreak
                  ? `Resultado em ${cd.seconds}s…`
                  : `Próxima partida em ${cd.seconds}s…`
              : 'Aguarde…'}
          </p>
        </div>
      )}
    </Modal>
  );
}

export function Scoreboard({ open, onClose, g, names }: { open: boolean; onClose: () => void; g: PlayerView; names: Names }) {
  const sorted = useMemo(
    () => g.players.slice().sort((a, b) => (g.scores[b.id] ?? 0) - (g.scores[a.id] ?? 0)),
    [g.players, g.scores],
  );
  return (
    <Modal open={open} onClose={onClose} title="Placar" wide>
      <div className="scrollbar-none overflow-x-auto rounded-2xl ring-1 ring-white/10">
        <table className="w-full min-w-max text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-mist/60">
            <tr>
              <th className="sticky left-0 bg-[#2c1d13] px-3 py-2 text-left">Jogador</th>
              {g.handHistory.map((h) => (
                <th key={h.number} className="px-2 py-2" title={`Partida ${h.number} (${h.cardsPerPlayer} cartas)`}>
                  P{h.number}
                </th>
              ))}
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className={`border-t border-white/5 ${p.id === g.you ? 'bg-violet/15' : ''}`}>
                <td className="sticky left-0 bg-[#22170f] px-3 py-2 font-semibold text-white">
                  <span className="flex items-center gap-2">
                    {g.championId === p.id && <Crown size={14} className="text-gold" />}
                    {p.id === g.you ? 'Você' : names.name(p.id)}
                  </span>
                </td>
                {g.handHistory.map((h) => {
                  const pts = h.points[p.id];
                  return (
                    <td key={h.number} className="px-2 py-1.5 text-center">
                      <div className={`font-bold ${pts > 0 ? 'text-emerald-300' : 'text-rose-300/70'}`}>{pts}</div>
                      <div className="text-[10px] text-mist/50">
                        {h.bids[p.id]}/{h.tricks[p.id]}
                      </div>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right font-display text-gold">{g.scores[p.id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-mist/50">Em cada partida: pontos e palpite/vitórias.</p>
      <LuckTable g={g} names={names} />

      {g.tiebreakHistory.length > 0 && (
        <div className="mt-5 space-y-3">
          <h3 className="flex items-center gap-2 font-display text-white">
            <Swords size={18} className="text-gold" /> Desempates
          </h3>
          {g.tiebreakHistory.map((t) => (
            <div key={t.number}>
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-mist/60">Desempate #{t.number}</p>
              <ResultTable rec={t} g={g} names={names} />
            </div>
          ))}
          <p className="text-xs text-mist/50">A pontuação dos desempates não altera o placar do jogo principal.</p>
        </div>
      )}
    </Modal>
  );
}

const CONFETTI_COLORS = ['#F5C451', '#754BFF', '#397BFF', '#f04456', '#22c07a', '#ffffff'];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 60 }, (_, i) => ({
        x: Math.random() * 100,
        delay: Math.random() * 1.5,
        dur: 2.5 + Math.random() * 2.5,
        rot: Math.random() * 720 - 360,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        w: 6 + Math.random() * 6,
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-0 rounded-sm"
          style={{ left: `${p.x}%`, width: p.w, height: p.w * 1.6, background: p.color }}
          initial={{ y: -40, rotate: 0, opacity: 1 }}
          animate={{ y: '110vh', rotate: p.rot, opacity: [1, 1, 0.6] }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: 'easeIn' }}
        />
      ))}
    </div>
  );
}

export function GameOver({ room, g, names, onScores }: { room: RoomView; g: PlayerView; names: Names; onScores: () => void }) {
  const ranking = g.ranking ?? [];
  const champion = g.championId!;
  const isHost = room.hostId === room.you;
  const wonTiebreak = g.tiebreakHistory.length > 0;
  const podium = ranking.slice(0, 3);
  const heights = ['h-28', 'h-20', 'h-14'];
  const order = [1, 0, 2].filter((i) => podium[i]);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[55] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        data-testid="game-over"
      >
        <Confetti />
        <motion.div
          initial={{ scale: 0.85, y: 30 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 18 }}
          className="relative w-full max-w-lg rounded-3xl bg-[#22170f] p-6 text-center shadow-2xl ring-1 ring-gold/40"
        >
          <motion.div initial={{ rotate: -20, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}>
            <Trophy size={56} className="mx-auto text-gold drop-shadow-[0_0_24px_rgba(245,196,81,.7)]" />
          </motion.div>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.35em] text-mist/60">Campeão</p>
          <h2 className="font-display text-4xl text-white" data-testid="champion">
            {champion === g.you ? 'VOCÊ!' : names.name(champion)}
          </h2>
          {wonTiebreak && (
            <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-gold">
              <Swords size={14} /> Venceu no desempate ({g.tiebreakHistory.length}{' '}
              {g.tiebreakHistory.length === 1 ? 'partida extra' : 'partidas extras'})
            </p>
          )}

          <div className="mt-6 flex items-end justify-center gap-2">
            {order.map((i) => {
              const e = podium[i];
              return (
                <motion.div
                  key={e.playerId}
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 + i * 0.15 }}
                  className="flex w-24 flex-col items-center gap-1"
                >
                  {i === 0 && <Crown size={22} className="text-gold" />}
                  <Avatar name={names.name(e.playerId)} seat={names.seat(e.playerId)} />
                  <span className="max-w-full truncate text-sm font-bold text-white">
                    {e.playerId === g.you ? 'Você' : names.name(e.playerId)}
                  </span>
                  <div
                    className={`flex w-full flex-col items-center justify-start rounded-t-xl pt-2 ${heights[i]} ${
                      i === 0 ? 'bg-gradient-to-b from-gold to-amber-600 text-night' : i === 1 ? 'bg-slate-300/80 text-night' : 'bg-amber-700/80 text-white'
                    }`}
                  >
                    <span className="font-display text-2xl">{e.position}</span>
                    <span className="text-xs font-bold">{e.score} pts</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {ranking.length > 3 && (
            <ul className="mt-4 space-y-1 text-left">
              {ranking.slice(3).map((e) => (
                <li key={e.playerId} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-1.5 text-sm">
                  <Medal size={14} className="text-mist/50" />
                  <span className="w-5 font-bold text-mist/60">{e.position}º</span>
                  <span className="flex-1 truncate font-semibold text-white">{e.playerId === g.you ? 'Você' : names.name(e.playerId)}</span>
                  <span className="font-display text-gold">{e.score}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 grid gap-2 sm:grid-cols-3">
            <button className="btn-ghost text-sm" onClick={onScores}>
              <Trophy size={16} /> Placar
            </button>
            {isHost ? (
              <button className="btn-gold text-sm" onClick={() => send('game:rematch')} data-testid="rematch">
                <RotateCcw size={16} /> Revanche
              </button>
            ) : (
              <span className="flex items-center justify-center text-xs text-mist/60">Aguardando o anfitrião…</span>
            )}
            <button className="btn-ghost text-sm" onClick={leaveRoom}>
              <LogOut size={16} /> Sair
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
