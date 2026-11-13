import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Box, Crown, LogOut, RotateCcw, Skull, Square, Target, Trophy, Volume2, VolumeX } from 'lucide-react';
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { engine, updateAudioSettings, useAudioSettings } from '../lib/audio';
import { webglAvailable } from '../lib/webgl';

const BluffTable3D = lazy(() => import('../three/BluffTable3D'));
import { claimText, COLOR_LABEL, isSpecialCard, type BluffView, type Card, type RoomView } from '@nomercy/shared';
import { useMedia } from '../lib/hooks';
import { leaveRoom, send } from '../lib/store';
import { AudioButtons } from './AudioPanel';
import { Avatar } from './Avatar';
import { BarAmbience } from './BarAmbience';
import { Logo } from './Logo';
import { Modal } from './Modal';
import { CardBack, CARD_STYLE, PlayingCard } from './PlayingCard';
import { Rules } from './Rules';
import { SpeechBubble } from './SpeechBubble';

const COLOR_BG: Record<string, string> = {
  BLUE: 'from-[#2547b0] to-[#0f1f55]',
  RED: 'from-[#f04456] to-[#a3172a]',
  GREEN: 'from-[#22c07a] to-[#0a6b40]',
  YELLOW: 'from-[#ffd84a] to-[#e09a00]',
  BLACK: 'from-[#2b2b38] to-[#0d0d12]',
};

/** Tambor do revólver de desenho (original, estilizado): 6 espaços, os usados ficam marcados. */
function Cylinder({ pulls, size = 40, spinning = false }: { pulls: number; size?: number; spinning?: boolean }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      animate={spinning ? { rotate: [0, 720] } : { rotate: 0 }}
      transition={spinning ? { duration: 1.2, ease: 'easeOut' } : { duration: 0.3 }}
      aria-label={`${pulls} de 6 espaços usados`}
    >
      <circle cx="20" cy="20" r="18" fill="#5b4a3a" stroke="#c9a86a" strokeWidth="2" />
      <circle cx="20" cy="20" r="4" fill="#2a2018" />
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const used = i < pulls;
        return <circle key={i} cx={20 + Math.cos(a) * 11} cy={20 + Math.sin(a) * 11} r="4.2" fill={used ? '#1a1410' : '#e3a948'} stroke="#2a2018" strokeWidth="1" />;
      })}
    </motion.svg>
  );
}

function names(b: BluffView) {
  const map = new Map(b.players.map((p, i) => [p.id, { name: p.name, seat: i, isBot: p.isBot }]));
  return {
    name: (id: string) => (id === b.you ? 'Você' : map.get(id)?.name ?? '?'),
    seat: (id: string) => map.get(id)?.seat ?? 0,
    isBot: (id: string) => map.get(id)?.isBot ?? false,
  };
}

function Seat({ b, id, compact }: { b: BluffView; id: string; compact?: boolean }) {
  const n = names(b);
  const alive = b.alive[id];
  const turn = b.phase === 'TURN' && b.turnId === id;
  const shooting = b.phase === 'ROULETTE' && (b.shootQueue[0] === id || b.lastShot?.playerId === id);
  const count = b.handCounts[id] ?? 0;
  return (
    <div
      className={`relative flex flex-col items-center gap-1 rounded-2xl bg-gradient-to-b from-[#3a2417]/95 to-[#170f0a]/95 p-2 ring-1 transition ${
        turn ? 'ring-2 ring-gold animate-pulseRing' : shooting ? 'ring-2 ring-rose-500' : 'ring-[#e3a948]/25'
      } ${alive ? '' : 'opacity-50 grayscale'} ${compact ? 'w-full' : 'w-[132px]'}`}
      data-testid={`bseat-${id}`}
    >
      <SpeechBubble playerId={id} className="-top-10 left-1/2 -translate-x-1/2" />
      <div className="relative">
        <Avatar name={n.name(id)} seat={n.seat(id)} isBot={n.isBot(id)} size={compact ? 'sm' : 'md'} />
        {!alive && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/70">
            <Skull size={compact ? 16 : 20} className="text-rose-300" />
          </span>
        )}
      </div>
      <p className={`max-w-full truncate font-bold text-white ${compact ? 'text-[11px]' : 'text-sm'}`}>{n.name(id)}</p>
      <div className="flex items-center gap-1.5">
        <Cylinder pulls={b.pulls[id] ?? 0} size={compact ? 22 : 28} />
        {alive ? (
          <span className="text-[10px] font-bold text-mist/70">{count} {count === 1 ? 'carta' : 'cartas'}</span>
        ) : (
          <span className="text-[10px] font-black text-rose-300">FORA</span>
        )}
      </div>
    </div>
  );
}

export function BluffGame({ room }: { room: RoomView }) {
  const b = room.bluff!;
  const n = names(b);
  const desktop = useMedia('(min-width: 768px)');
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Mesa 3D (até 4 jogadores): personagens com revólver
  const prefs = useAudioSettings();
  const [failed3d, setFailed3d] = useState(false);
  const [ready3d, setReady3d] = useState(false);
  const onFail3d = useCallback(() => setFailed3d(true), []);
  const onReady3d = useCallback(() => setReady3d(true), []);
  const can3d = b.players.length <= 4 && webglAvailable() && !failed3d;
  const use3d = can3d && prefs.view3d;
  const layout3d = use3d && ready3d;
  useEffect(() => {
    if (!use3d) setReady3d(false);
  }, [use3d]);
  // Você foi atingido: tela vermelha
  const [hitFlash, setHitFlash] = useState(false);
  const meHitKey = b.lastShot && b.lastShot.playerId === b.you && b.lastShot.hit ? `${b.round}-${b.lastShot.pull}` : '';
  useEffect(() => {
    if (!meHitKey) return;
    setHitFlash(true);
    const t = setTimeout(() => setHitFlash(false), 2600);
    return () => clearTimeout(t);
  }, [meHitKey]);
  // Suspense antes do disparo: bordas escurecem pulsando no ritmo do coração
  const [suspense, setSuspense] = useState<{ id: string; ms: number } | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ ms: number; id: string | null }>).detail;
      if (t) clearTimeout(t);
      if (!d.ms || !d.id) return setSuspense(null);
      setSuspense({ id: d.id, ms: d.ms });
      t = setTimeout(() => setSuspense(null), d.ms + 400);
    };
    window.addEventListener('nm:suspense', on);
    return () => {
      window.removeEventListener('nm:suspense', on);
      if (t) clearTimeout(t);
    };
  }, []);
  const meIdx = b.players.findIndex((p) => p.id === b.you);
  const others = [...b.players.slice(meIdx + 1), ...b.players.slice(0, meIdx)];
  const myTurn = b.phase === 'TURN' && b.turnId === b.you;
  const hand = useMemo(() => b.myHand.slice().sort((x, y) => x.color.localeCompare(y.color) || String(x.value).localeCompare(String(y.value))), [b.myHand]);
  const validSel = selected.filter((id) => hand.some((c) => c.id === id));

  const toggle = (c: Card) => {
    if (!myTurn || !b.options.canPlay) return;
    setSelected((cur) => (cur.includes(c.id) ? cur.filter((x) => x !== c.id) : cur.length >= 3 ? cur : [...cur, c.id]));
  };
  const play = async () => {
    setSending(true);
    const r = await send('bluff:play', { cardIds: validSel });
    setSending(false);
    if (r.ok) setSelected([]);
  };
  const call = async () => {
    setSending(true);
    await send('bluff:call');
    setSending(false);
  };

  const status = (() => {
    if (b.phase === 'TURN') {
      if (myTurn) return b.options.mustCall ? 'Você está sem cartas: tem que acusar!' : b.options.canCall ? 'Sua vez: jogue ou grite MENTIRA!' : 'Sua vez: jogue de 1 a 3 cartas';
      return `Vez de ${n.name(b.turnId)}`;
    }
    if (b.phase === 'REVEAL' && b.call) {
      const c = b.call;
      if (c.special) return `CARTA DO DIABO! Todos menos ${n.name(c.play.playerId)} vão para a roleta!`;
      return c.truthful ? `Era verdade! ${n.name(c.callerId)} vai para a roleta` : `Era blefe! ${n.name(c.play.playerId)} vai para a roleta`;
    }
    if (b.phase === 'ROULETTE') {
      const s = b.lastShot;
      if (s && !b.shootQueue.length) return s.hit ? `BANG! ${n.name(s.playerId)} está fora!` : `Clique... ${n.name(s.playerId)} sobreviveu!`;
      return `${n.name(b.shootQueue[0] ?? s?.playerId ?? '')} vai puxar o gatilho...`;
    }
    return 'Fim de jogo';
  })();

  // Roleta: antes do primeiro disparo mostra quem vai puxar (tambor girando); depois, o resultado do último disparo.
  const shot = b.phase === 'ROULETTE' ? b.lastShot : null;
  const nextShooter = b.phase === 'ROULETTE' ? b.shootQueue[0] ?? null : null;
  const rouletteId = shot?.playerId ?? nextShooter;

  return (
    <div className="relative flex h-full flex-col overflow-hidden felt">
      {!layout3d && <BarAmbience table />}
      {use3d && (
        <Suspense fallback={null}>
          <BluffTable3D room={room} onFail={onFail3d} onReady={onReady3d} />
        </Suspense>
      )}
      <header className="z-20 flex items-center gap-2 border-b border-white/5 bg-[#0d0805]/85 px-3 py-2">
        <div className="hidden sm:block">
          <Logo size="sm" />
        </div>
        <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          <span className="chip bg-rose-700/60 text-white" data-testid="bluff-chip">
            <Target size={12} /> Roleta Sem Piedade
          </span>
          <span className="chip bg-white/10 text-mist">Rodada {b.round}</span>
          {b.special && <span className="chip bg-red-950/80 text-red-200">Carta do Diabo ativa</span>}
          {!b.alive[b.you] && b.phase !== 'GAME_OVER' && (
            <span className="chip bg-white/15 text-white" data-testid="spectator">
              <Skull size={12} /> Espectador — você volta na revanche
            </span>
          )}
        </div>
        {can3d && (
          <button
            className={`flex items-center gap-1 rounded-xl px-2 py-2 text-xs font-black hover:bg-white/10 ${use3d ? 'text-gold' : 'text-mist/80'}`}
            onClick={() => updateAudioSettings({ view3d: !use3d })}
            data-testid="bluff-toggle-3d"
          >
            {use3d ? <Square size={18} /> : <Box size={18} />}
            {use3d ? '2D' : '3D'}
          </button>
        )}
        <button
          className={`flex items-center gap-1 rounded-xl px-2 py-2 text-xs font-black hover:bg-white/10 ${prefs.tauntVoiceOn ? 'text-mist' : 'text-rose-300'}`}
          onClick={() => {
            if (prefs.tauntVoiceOn) {
              window.speechSynthesis?.cancel();
              engine.stopVoices();
            }
            updateAudioSettings({ tauntVoiceOn: !prefs.tauntVoiceOn });
          }}
          title={prefs.tauntVoiceOn ? 'Mutar as vozes' : 'Ligar as vozes'}
          data-testid="bluff-mute-voices"
        >
          {prefs.tauntVoiceOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
          {prefs.tauntVoiceOn ? 'Vozes' : 'Mudo'}
        </button>
        <AudioButtons room={room} />
        <button className="rounded-xl p-2 text-mist/80 hover:bg-white/10" onClick={() => setShowRules(true)} aria-label="Regras" title="Regras">
          <BookOpen size={20} />
        </button>
        <button className="rounded-xl p-2 text-mist/80 hover:bg-white/10" onClick={() => setConfirmLeave(true)} aria-label="Sair" title="Sair">
          <LogOut size={20} />
        </button>
      </header>

      <main className={`relative flex min-h-0 flex-1 flex-col ${layout3d ? 'pointer-events-none' : ''}`}>
        {layout3d ? null : desktop ? (
          <div className="pointer-events-none absolute inset-0">
            {others.map((p, i) => {
              const k = others.length;
              const t = -0.06 + ((i + 0.5) / k) * 1.12;
              const theta = Math.PI + t * Math.PI;
              return (
                <div key={p.id} className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${50 + 44 * Math.cos(theta)}%`, top: `${58 + 40 * Math.sin(theta)}%` }}>
                  <Seat b={b} id={p.id} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 px-2 pt-2">
            {others.map((p) => (
              <Seat key={p.id} b={b} id={p.id} compact />
            ))}
          </div>
        )}

        <div className={`relative z-10 flex min-h-0 flex-1 flex-col items-center gap-3 px-3 ${layout3d ? 'justify-start pt-2' : 'justify-center'}`}>
          {/* Cor da mesa */}
          {!layout3d && <motion.div
            key={`${b.round}-${b.tableColor}`}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`flex items-center gap-2 rounded-2xl bg-gradient-to-br px-4 py-2 shadow-card ring-2 ring-white/20 ${COLOR_BG[b.tableColor]} ${CARD_STYLE[b.tableColor].ink}`}
            data-testid="table-color"
          >
            <span className="text-[11px] font-black uppercase tracking-widest opacity-80">Cor da mesa</span>
            <span className="font-display text-xl">{COLOR_LABEL[b.tableColor]}</span>
          </motion.div>}

          <div
            className={`rounded-full px-4 py-1.5 text-center text-sm font-bold sm:text-base ${myTurn ? 'bg-gold text-night shadow-glow' : 'bg-black/50 text-mist'}`}
            data-testid="bluff-status"
          >
            {status}
          </div>

          {/* Monte: última jogada (virada) ou a revelação — no 3D fica sobre a mesa */}
          <div className={`flex min-h-[110px] flex-col items-center gap-1.5 ${layout3d ? 'hidden' : ''}`}>
            {b.phase === 'REVEAL' && b.call ? (
              <>
                <div className="flex gap-1.5">
                  {b.call.play.cards.map((c, i) => (
                    <motion.div key={c.id} initial={{ rotateY: 180, y: -20 }} animate={{ rotateY: 0, y: 0 }} transition={{ delay: i * 0.25 }}>
                      <PlayingCard
                        card={c}
                        size="md"
                        devil={b.special && isSpecialCard(c)}
                        highlight={c.color === b.tableColor || c.value === 'JOKER'}
                        dim={!(c.color === b.tableColor || c.value === 'JOKER')}
                      />
                    </motion.div>
                  ))}
                </div>
                <span className="text-xs font-bold text-mist/70">
                  {n.name(b.call.play.playerId)} disse: {claimText(b.call.play.count, b.tableColor)}
                </span>
              </>
            ) : b.lastPlay ? (
              <>
                <div className="flex">
                  {Array.from({ length: b.lastPlay.count }).map((_, i) => (
                    <motion.div key={`${b.lastPlay!.playerId}-${b.handCounts[b.lastPlay!.playerId]}-${i}`} initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.08 }} className="-ml-4 first:ml-0" style={{ rotate: `${(i - 1) * 8}deg` }}>
                      <CardBack size="md" />
                    </motion.div>
                  ))}
                </div>
                <span className="rounded-full bg-black/50 px-3 py-0.5 text-xs font-bold text-gold" data-testid="last-claim">
                  {n.name(b.lastPlay.playerId)}: “{claimText(b.lastPlay.count, b.tableColor)}”
                </span>
              </>
            ) : (
              <span className="self-center text-xs text-mist/50">Mesa vazia — quem começa joga de 1 a 3 cartas.</span>
            )}
          </div>
        </div>
      </main>

      {/* Minha área */}
      <section className="relative z-20 border-t border-white/5 bg-[#0d0805]/85 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-2">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 pb-1">
          <div className="relative flex items-center gap-2">
            <SpeechBubble playerId={b.you} className="-top-10 left-0" />
            <Avatar name="Você" seat={n.seat(b.you)} size="sm" />
            <div>
              <p className="text-sm font-bold text-white">Você {!b.alive[b.you] && <span className="text-rose-300">(fora)</span>}</p>
              <p className="text-[11px] text-mist/60">Puxadas: {b.pulls[b.you] ?? 0}/6</p>
            </div>
            <Cylinder pulls={b.pulls[b.you] ?? 0} size={30} />
          </div>
          {myTurn && (
            <div className="flex items-center gap-2">
              {b.options.canCall && (
                <button className="btn bg-gradient-to-b from-rose-500 to-rose-800 px-4 py-2.5 text-base text-white shadow-violet" disabled={sending} onClick={call} data-testid="call-lie">
                  MENTIRA!
                </button>
              )}
              {b.options.canPlay && (
                <button className="btn-gold px-4 py-2.5 text-sm" disabled={sending || validSel.length === 0} onClick={play} data-testid="bluff-play">
                  {validSel.length === 0 ? 'Escolha 1 a 3 cartas' : `Jogar: “${claimText(validSel.length, b.tableColor)}”`}
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex min-h-[100px] items-end justify-center gap-1.5 pb-1 pt-4" data-testid="bluff-hand">
          {b.alive[b.you] ? (
            hand.length ? (
              hand.map((c) => (
                <PlayingCard
                  key={c.id}
                  card={c}
                  devil={b.special && isSpecialCard(c)}
                  size={desktop ? 'lg' : 'md'}
                  selected={validSel.includes(c.id)}
                  onClick={() => toggle(c)}
                  dim={!myTurn}
                  highlight={c.color === b.tableColor || c.value === 'JOKER'}
                />
              ))
            ) : (
              <p className="self-center text-sm text-mist/50">Sem cartas nesta rodada.</p>
            )
          ) : (
            <p className="self-center text-sm text-mist/60">Você está fora. Assista até o fim!</p>
          )}
        </div>
        {myTurn && b.options.canPlay && (
          <p className="text-center text-[11px] text-mist/60">Cartas com brilho são da cor da mesa (ou coringa). Pode blefar com as outras.</p>
        )}
      </section>

      {/* Roleta */}
      <AnimatePresence>
        {b.phase === 'ROULETTE' && rouletteId && !layout3d && (
          <motion.div
            key={`${rouletteId}-${shot?.pull ?? 0}`}
            className="pointer-events-none fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            data-testid="roulette"
          >
            {rouletteId && (
              <>
                <Avatar name={n.name(rouletteId)} seat={n.seat(rouletteId)} />
                <p className="font-display text-2xl text-white">{n.name(rouletteId)}</p>
                <Cylinder pulls={b.pulls[rouletteId] ?? 0} size={110} spinning={!shot} />
                {shot ? (
                  <motion.p
                    initial={{ scale: 2.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={`font-display text-5xl ${shot.hit ? 'text-rose-400' : 'text-emerald-300'}`}
                  >
                    {shot.hit ? 'BANG!' : 'CLIQUE...'}
                  </motion.p>
                ) : (
                  <p className="text-sm font-bold text-mist/80">Chance de 1 em {Math.max(1, 6 - (b.pulls[rouletteId] ?? 0))}...</p>
                )}
                {shot && nextShooter && <p className="text-xs text-mist/70">Próximo: {n.name(nextShooter)}</p>}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suspense: vai sair o tiro ou não? */}
      <AnimatePresence>
        {suspense && (
          <motion.div
            key={suspense.id + suspense.ms}
            data-testid="bluff-suspense"
            className="pointer-events-none fixed inset-0 z-[44]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
          >
            <motion.div
              className="absolute inset-0"
              style={{ background: 'radial-gradient(ellipse at center, transparent 35%, rgba(60,0,0,.55) 75%, rgba(0,0,0,.85) 100%)' }}
              animate={{ opacity: [0.55, 1, 0.6, 1, 0.65, 1, 0.7, 1] }}
              transition={{ duration: suspense.ms / 1000, times: [0, 0.18, 0.34, 0.5, 0.63, 0.75, 0.86, 1] }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Você foi atingido */}
      <AnimatePresence>
        {hitFlash && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-[45] flex items-center justify-center bg-red-900/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.85] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="font-display text-5xl text-white drop-shadow-[0_4px_0_rgba(0,0,0,.6)]">VOCÊ ESTÁ FORA!</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fim de jogo */}
      {b.phase === 'GAME_OVER' && b.winnerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" data-testid="bluff-over">
          <motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }} className="w-full max-w-sm rounded-3xl bg-[#22170f] p-6 text-center ring-1 ring-gold/40">
            <Trophy size={52} className="mx-auto text-gold" />
            <p className="mt-2 text-xs font-bold uppercase tracking-[0.35em] text-mist/60">Último de pé</p>
            <h2 className="font-display text-4xl text-white">{n.name(b.winnerId)}</h2>
            <ol className="mt-4 space-y-1 text-left text-sm">
              {[b.winnerId, ...b.eliminated.slice().reverse()].map((id, i) => (
                <li key={id} className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-1.5">
                  {i === 0 ? <Crown size={14} className="text-gold" /> : <Skull size={14} className="text-mist/50" />}
                  <span className="w-6 font-bold text-mist/60">{i + 1}º</span>
                  <span className="flex-1 font-semibold text-white">{n.name(id)}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 grid grid-cols-2 gap-2">
              {room.hostId === room.you ? (
                <button className="btn-gold text-sm" onClick={() => send('game:rematch')}>
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
        </div>
      )}

      <Rules open={showRules} onClose={() => setShowRules(false)} />
      <Modal open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Sair do jogo?">
        <p className="text-mist/80">O jogo continua sem você: o sistema joga no seu lugar.</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="btn-ghost" onClick={() => setConfirmLeave(false)}>
            Ficar
          </button>
          <button className="btn bg-rose-600 text-white" onClick={leaveRoom}>
            <LogOut size={18} /> Sair
          </button>
        </div>
      </Modal>
    </div>
  );
}
