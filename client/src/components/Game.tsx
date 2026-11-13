import { AnimatePresence, motion } from 'framer-motion';
import {
  BookOpen,
  Box,
  Square,
  Check,
  EyeOff,
  Hand,
  Mic,
  MicOff,
  Layers,
  LogOut,
  Shuffle,
  Swords,
  Target,
  Trophy,
  WifiOff,
} from 'lucide-react';
import { Component, Suspense, lazy, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  isHiddenCard,
  playPower,
  type Card,
  type JokerMode,
  type PlayerView,
  type RoomPlayer,
  type RoomView,
} from '@nomercy/shared';
import { useCountdown, useMedia, useWindowWidth } from '../lib/hooks';
import { leaveRoom, send, toast } from '../lib/store';
import { AudioButtons } from './AudioPanel';
import { Avatar } from './Avatar';
import { BarAmbience } from './BarAmbience';
import { TrickPile } from './TrickPile';
import { useVoice } from '../lib/voice';
import { Logo } from './Logo';
import { Modal } from './Modal';
import { CardBack, PlayingCard } from './PlayingCard';
import { GameOver, HandResult, Scoreboard } from './Results';
import { Rules } from './Rules';
import { ShuffleOverlay } from './ShuffleOverlay';
import { updateAudioSettings, useAudioSettings } from '../lib/audio';
import { webglAvailable } from '../lib/webgl';

// A cena 3D (three.js) só é baixada quando for usada.
// Depois de uma publicação nova, uma aba antiga pode pedir um arquivo que não existe mais:
// nesse caso recarrega a página uma vez para pegar a versão nova.
const Table3D = lazy(() =>
  import('../three/Table3D').catch((err) => {
    try {
      if (!sessionStorage.getItem('nomercy:reloaded')) {
        sessionStorage.setItem('nomercy:reloaded', '1');
        window.location.reload();
      }
    } catch {
      /* ignora */
    }
    throw err;
  }),
);

/** Se a mesa 3D der erro, mostra a mesa 2D em vez de deixar partes da tela em branco. */
class Safe3D extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn('[3D] erro, voltando para 2D', err);
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export interface Names {
  name: (id: string) => string;
  seat: (id: string) => number;
  isBot: (id: string) => boolean;
}

function useNames(g: PlayerView): Names {
  return useMemo(() => {
    const idx = new Map(g.players.map((p, i) => [p.id, i]));
    return {
      name: (id) => g.players[idx.get(id) ?? 0]?.name ?? '?',
      seat: (id) => idx.get(id) ?? 0,
      isBot: (id) => g.players[idx.get(id) ?? 0]?.isBot ?? false,
    };
  }, [g.players]);
}

export function Game({ room }: { room: RoomView }) {
  const g = room.game!;
  const names = useNames(g);
  const [showScores, setShowScores] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const desktop = useMedia('(min-width: 768px)');
  const tiebreak = g.stage === 'TIEBREAK';

  const meSeat = g.players.findIndex((p) => p.id === g.you);
  const rotated = [...g.players.slice(meSeat), ...g.players.slice(0, meSeat)];
  const opponents = rotated.slice(1);
  const connection = new Map(room.players.map((p) => [p.id, p]));
  const prefs = useAudioSettings();
  const [failed3d, setFailed3d] = useState(false);
  const onFail3d = useCallback(() => setFailed3d(true), []);
  const can3d = g.players.length >= 2 && g.players.length <= 4 && webglAvailable() && !failed3d;
  const use3d = can3d && prefs.view3d;
  // A mesa 3D é carregada sob demanda: até ela ficar pronta, suas cartas aparecem em 2D.
  const [ready3d, setReady3d] = useState(false);
  const onReady3d = useCallback(() => setReady3d(true), []);
  useEffect(() => {
    if (!use3d) {
      setReady3d(false);
      return;
    }
    if (ready3d) return;
    // Se o 3D não carregar em 15 s (internet lenta, aparelho sem suporte), volta para a mesa 2D.
    const t = setTimeout(() => {
      setFailed3d(true);
      toast('A mesa 3D demorou para carregar. Mostrando a mesa 2D.', 'info');
    }, 15000);
    return () => clearTimeout(t);
  }, [use3d, ready3d]);
  const hand3d = use3d && prefs.hand3d && ready3d;
  /** Layout 3D só quando a cena já está pronta; até lá a mesa 2D completa continua visível. */
  const layout3d = use3d && ready3d;

  // Seleção de carta compartilhada entre a mão 2D e a mão 3D
  const [selected, setSelected] = useState<string | null>(null);
  const [hovering, setHovering] = useState(false);
  const myCards = useMemo(() => sortHand(g.myHand.filter((c): c is Card => !isHiddenCard(c))), [g.myHand]);
  const hiddenCount = g.myHand.filter(isHiddenCard).length;
  const participant = g.participants.includes(g.you);
  useEffect(() => {
    if (selected && !myCards.some((c) => c.id === selected)) setSelected(null);
  }, [myCards, selected]);
  const handState = useMemo(
    () => ({
      enabled: hand3d && participant,
      cards: myCards,
      hiddenCount,
      selectedId: selected,
      interactive: participant && myCards.length > 0,
    }),
    [hand3d, participant, myCards, hiddenCount, selected],
  );
  const onCardClick = useCallback((id: string) => setSelected((cur) => (cur === id ? null : id)), []);

  return (
    <div className={`relative flex h-full flex-col overflow-hidden ${tiebreak ? 'felt-tiebreak' : 'felt'}`}>
      {!layout3d && <BarAmbience table tiebreak={tiebreak} />}
      {use3d && (
        <Safe3D onFail={onFail3d}>
        <Suspense fallback={null}>
          <Table3D
            g={g}
            room={room}
            onFail={onFail3d}
            onReady={onReady3d}
            hand={handState}
            suspicious={hovering}
            onCardClick={onCardClick}
            onCardHover={setHovering}
          />
        </Suspense>
        </Safe3D>
      )}
      {use3d && !ready3d && (
        <div className="pointer-events-none fixed bottom-3 right-3 z-30 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-mist/70">
          Carregando mesa 3D…
        </div>
      )}
      <TopBar
        g={g}
        room={room}
        can3d={can3d}
        use3d={use3d}
        hand3d={hand3d}
        onScores={() => setShowScores(true)}
        onRules={() => setShowRules(true)}
        onLeave={() => setConfirmLeave(true)}
      />

      <main className={`relative flex min-h-0 flex-1 flex-col ${layout3d ? 'pointer-events-none' : ''}`}>
        {/* Adversários */}
        {layout3d ? null : desktop ? (
          <div className="pointer-events-none absolute inset-0">
            {opponents.map((p, i) => {
              const k = opponents.length;
              const t = -0.06 + ((i + 0.5) / k) * 1.12;
              const theta = Math.PI + t * Math.PI;
              const x = 50 + 44 * Math.cos(theta);
              const y = 58 + 40 * Math.sin(theta);
              return (
                <div
                  key={p.id}
                  className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <Seat g={g} id={p.id} names={names} rp={connection.get(p.id)} />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 px-2 pt-2">
            {opponents.map((p) => (
              <Seat key={p.id} g={g} id={p.id} names={names} compact rp={connection.get(p.id)} />
            ))}
          </div>
        )}

        {/* Centro da mesa */}
        <div className={`relative z-10 flex min-h-0 flex-1 flex-col items-center px-3 ${layout3d ? 'pointer-events-none justify-start pt-2' : 'justify-center'}`}>
          {!layout3d && <div className={`bar-table pointer-events-none absolute inset-x-5 inset-y-4 rounded-[48px] md:hidden ${tiebreak ? 'bar-table-tiebreak' : ''}`} />}
          <Center g={g} names={names} room={room} desktop={desktop} mode3d={layout3d} />
        </div>
      </main>

      <MyArea
        g={g}
        room={room}
        names={names}
        desktop={desktop}
        mode3d={layout3d}
        hand3d={hand3d}
        selected={selected}
        setSelected={setSelected}
        onHover={setHovering}
      />

      <HandResult g={g} names={names} deadline={room.deadline} />
      <ShuffleOverlay g={g} dealerName={g.dealerId === g.you ? 'Você' : names.name(g.dealerId)} />
      <TiebreakIntro g={g} names={names} />
      {g.phase === 'GAME_OVER' && <GameOver room={room} g={g} names={names} onScores={() => setShowScores(true)} />}
      <Scoreboard open={showScores} onClose={() => setShowScores(false)} g={g} names={names} />
      <Rules open={showRules} onClose={() => setShowRules(false)} />
      <Modal open={confirmLeave} onClose={() => setConfirmLeave(false)} title="Sair do jogo?">
        <p className="text-mist/80">
          {g.phase === 'GAME_OVER'
            ? 'Você voltará para a tela inicial.'
            : 'O jogo continua sem você: o sistema jogará automaticamente no seu lugar. Você não poderá voltar a esta partida.'}
        </p>
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

function TopBar({
  g,
  room,
  can3d,
  use3d,
  hand3d,
  onScores,
  onRules,
  onLeave,
}: {
  g: PlayerView;
  room: RoomView;
  can3d: boolean;
  use3d: boolean;
  hand3d: boolean;
  onScores: () => void;
  onRules: () => void;
  onLeave: () => void;
}) {
  const tiebreak = g.stage === 'TIEBREAK';
  return (
    <header className="z-20 flex items-center gap-2 border-b border-white/5 bg-black/25 px-3 py-2 backdrop-blur-md">
      <div className="hidden sm:block">
        <Logo size="sm" />
      </div>
      <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {tiebreak ? (
          <span className="chip bg-gradient-to-r from-rose-500 to-gold text-night">
            <Swords size={12} /> Desempate #{g.tiebreakNumber}
          </span>
        ) : (
          <span className="chip bg-violet/30 text-white" data-testid="hand-chip">
            <Layers size={12} /> Partida {g.handNumber}/{g.maxHands}
          </span>
        )}
        <span className="chip bg-white/10 text-mist">
          {g.cardsPerPlayer} {g.cardsPerPlayer === 1 ? 'carta' : 'cartas'}
        </span>
        {g.roundNumber > 0 && !g.blind && (
          <span className="chip bg-white/10 text-mist">
            Rodada {g.roundNumber}/{g.cardsPerPlayer}
          </span>
        )}
        {g.blind && (
          <span className="chip bg-electric/30 text-sky-200">
            <EyeOff size={12} /> Às cegas
          </span>
        )}
      </div>
      {can3d && (
        <button
          className={`flex items-center gap-1 rounded-xl px-2 py-2 text-xs font-black hover:bg-white/10 ${use3d ? 'text-gold' : 'text-mist/80'}`}
          onClick={() => updateAudioSettings({ view3d: !use3d })}
          aria-label={use3d ? 'Mudar para mesa 2D' : 'Mudar para mesa 3D'}
          title={use3d ? 'Mudar para mesa 2D' : 'Mudar para mesa 3D'}
          data-testid="toggle-3d"
        >
          {use3d ? <Square size={18} /> : <Box size={18} />}
          {use3d ? '2D' : '3D'}
        </button>
      )}
      {use3d && (
        <button
          className={`hidden items-center gap-1 rounded-xl px-2 py-2 text-xs font-black hover:bg-white/10 sm:flex ${hand3d ? 'text-gold' : 'text-mist/80'}`}
          onClick={() => updateAudioSettings({ hand3d: !hand3d })}
          aria-label={hand3d ? 'Mostrar minhas cartas em 2D' : 'Segurar minhas cartas em 3D'}
          title={hand3d ? 'Mostrar minhas cartas em 2D' : 'Segurar minhas cartas em 3D'}
          data-testid="toggle-hand3d"
        >
          <Hand size={18} />
          {hand3d ? 'Mão 2D' : 'Mão 3D'}
        </button>
      )}
      <AudioButtons room={room} />
      <button className="rounded-xl p-2 text-mist/80 hover:bg-white/10" onClick={onScores} aria-label="Placar" title="Placar">
        <Trophy size={20} />
      </button>
      <button className="rounded-xl p-2 text-mist/80 hover:bg-white/10" onClick={onRules} aria-label="Regras" title="Regras">
        <BookOpen size={20} />
      </button>
      <button className="rounded-xl p-2 text-mist/80 hover:bg-white/10" onClick={onLeave} aria-label="Sair" title="Sair">
        <LogOut size={20} />
      </button>
    </header>
  );
}

function Seat({
  g,
  id,
  names,
  compact,
  rp,
}: {
  g: PlayerView;
  id: string;
  names: Names;
  compact?: boolean;
  rp?: RoomPlayer;
}) {
  const voice = useVoice();
  const offline = rp?.connected === false;
  const auto = rp?.autopilot;
  const speaking = !!voice.speaking[id];
  const participant = g.participants.includes(id);
  const active = g.currentBidderId === id || g.currentPlayerId === id;
  const bid = g.bids[id];
  const won = g.tricksWon[id] ?? 0;
  const visible = g.visibleHands[id];
  const count = g.handCounts[id] ?? 0;
  const isDealer = g.dealerId === id;
  const played = g.currentTrick.some((p) => p.playerId === id);
  const roundWinner = g.phase === 'ROUND_RESULT' && g.lastRound?.winnerId === id;
  const hit = bid !== undefined && won === bid;

  return (
    <motion.div
      layout
      data-testid={`seat-${id}`}
      className={`relative flex flex-col items-center rounded-2xl bg-gradient-to-b from-[#3a2417]/95 to-[#170f0a]/95 shadow-[0_12px_24px_-10px_rgba(0,0,0,.9)] ring-1 transition ${
        compact ? 'gap-1 p-1.5' : 'w-[132px] gap-1.5 p-2.5'
      } ${active ? 'ring-2 ring-gold animate-pulseRing' : roundWinner ? 'ring-2 ring-emerald-400' : 'ring-[#e3a948]/25'} ${
        participant ? '' : 'opacity-40'
      }`}
    >
      <div className={`flex w-full items-center ${compact ? 'flex-col gap-0.5' : 'gap-2'}`}>
        <div className="relative">
          <span className={`block rounded-full transition ${speaking ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-night' : ''}`}>
            <Avatar name={names.name(id)} seat={names.seat(id)} isBot={names.isBot(id)} size={compact ? 'sm' : 'md'} />
          </span>
          {rp?.voice && (
            <span
              className={`absolute -bottom-1 -left-1.5 rounded-full p-0.5 text-white ${rp.micOn ? 'bg-emerald-600' : 'bg-rose-600'}`}
              title={rp.micOn ? 'No chat de voz' : 'Microfone mudo'}
            >
              {rp.micOn ? <Mic size={compact ? 9 : 11} /> : <MicOff size={compact ? 9 : 11} />}
            </span>
          )}
          {isDealer && (
            <span className="absolute -left-1.5 -top-1.5 rounded-full bg-gold p-0.5 text-night shadow" title="Embaralhou nesta partida">
              <Shuffle size={compact ? 9 : 11} />
            </span>
          )}
          {offline && (
            <span className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-600 p-0.5 text-white" title={auto ? 'Saiu — jogando automaticamente' : 'Desconectado'}>
              <WifiOff size={compact ? 9 : 11} />
            </span>
          )}
        </div>
        <div className={`min-w-0 ${compact ? 'w-full text-center' : 'flex-1'}`}>
          <p className={`truncate font-bold text-white ${compact ? 'text-[11px]' : 'text-sm'}`}>{names.name(id)}</p>
          {!compact && <p className="text-[11px] font-semibold text-gold">{g.scores[id] ?? 0} pts</p>}
        </div>
      </div>

      {participant && (
        <div className={`flex w-full items-center justify-center gap-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>
          <span className={`flex items-center gap-0.5 rounded-md px-1 py-0.5 font-bold ${bid === undefined ? 'bg-white/5 text-mist/50' : 'bg-violet/40 text-white'}`} title="Palpite">
            <Target size={compact ? 9 : 11} />
            {bid ?? (g.currentBidderId === id ? '…' : '–')}
          </span>
          {compact ? (
            <TrickPile count={won} size="xs" />
          ) : (
          <span
            className={`flex items-center gap-0.5 rounded-md px-1 py-0.5 font-bold ${
              bid !== undefined && won > bid ? 'bg-rose-500/40 text-rose-100' : hit ? 'bg-emerald-500/40 text-emerald-100' : 'bg-white/10 text-mist'
            }`}
            title="Rodadas vencidas"
          >
            <Trophy size={compact ? 9 : 11} />
            {won}
          </span>
          )}
          {compact && <span className="font-bold text-gold">{g.scores[id] ?? 0}</span>}
        </div>
      )}

      {participant && visible && visible.length > 0 && (
        <motion.div initial={{ rotateY: 90 }} animate={{ rotateY: 0 }} transition={{ delay: 0.2 }}>
          <PlayingCard card={visible[0]} size={compact ? 'xs' : 'sm'} jokerMode="MAX" />
        </motion.div>
      )}
      {participant && !g.blind && count > 0 && !compact && (
        <span className="text-[10px] font-semibold text-mist/50">
          {count} {count === 1 ? 'carta na mão' : 'cartas na mão'}
        </span>
      )}
      {participant && !compact && (
        <div className="flex w-full items-center justify-center border-t border-white/5 pt-1">
          <TrickPile count={won} size={compact ? 'xs' : 'sm'} />
        </div>
      )}
      {played && g.phase === 'PLAYING' && (
        <span className="absolute -bottom-1.5 right-1 rounded-full bg-emerald-500 p-0.5 text-white">
          <Check size={10} />
        </span>
      )}
    </motion.div>
  );
}

function statusText(g: PlayerView, names: Names): string {
  const me = g.you;
  switch (g.phase) {
    case 'BIDDING':
      if (g.currentBidderId === me) return g.blind ? 'Sua vez: você vai vencer?' : 'Sua vez de palpitar';
      return `${names.name(g.currentBidderId!)} está palpitando…`;
    case 'PLAYING':
      if (g.currentPlayerId === me) return 'Sua vez de jogar!';
      return `Vez de ${names.name(g.currentPlayerId!)}`;
    case 'ROUND_RESULT':
      if (!g.lastRound) return '';
      return g.lastRound.winnerId === me ? 'Você venceu a rodada!' : `${names.name(g.lastRound.winnerId)} venceu a rodada!`;
    case 'HAND_RESULT':
      return 'Fim da partida';
    case 'GAME_OVER':
      return 'Fim de jogo';
  }
}

function Center({ g, names, room, desktop, mode3d }: { g: PlayerView; names: Names; room: RoomView; desktop: boolean; mode3d: boolean }) {
  const myTurn = g.currentBidderId === g.you || g.currentPlayerId === g.you;
  const showDeadline = room.deadline && (g.phase === 'BIDDING' || g.phase === 'PLAYING');
  const winnerId = g.phase === 'ROUND_RESULT' ? g.lastRound?.winnerId : undefined;
  const slots = g.phase === 'ROUND_RESULT' && g.lastRound ? g.lastRound.plays.map((p) => p.playerId) : g.turnOrder;
  const trickById = new Map((g.phase === 'ROUND_RESULT' && g.lastRound ? g.lastRound.plays : g.currentTrick).map((p) => [p.playerId, p]));
  const size = desktop ? 'md' : slots.length > 5 ? 'sm' : 'md';

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-3">
      <AnimatePresence mode="wait">
        <motion.div
          key={statusText(g, names)}
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8 }}
          data-testid="status"
          className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold sm:text-base ${
            winnerId ? 'bg-emerald-500/90 text-white' : myTurn ? 'bg-gold text-night shadow-glow' : 'bg-black/40 text-mist'
          }`}
        >
          {winnerId && <Trophy size={16} />}
          {myTurn && <Hand size={16} />}
          {statusText(g, names)}
        </motion.div>
      </AnimatePresence>

      {showDeadline && <DeadlineBar deadline={room.deadline} />}

      {g.phase === 'BIDDING' && g.blind && !mode3d && (
        <div className="max-w-sm backdrop-blur rounded-2xl bg-black/30 px-4 py-3 text-center text-xs text-mist/80 ring-1 ring-white/10 sm:text-sm">
          <EyeOff size={16} className="mx-auto mb-1 text-sky-300" />
          {g.stage === 'TIEBREAK' ? 'Desempate às cegas: ' : 'Partida às cegas: '}
          você não vê sua própria carta, mas vê as dos adversários. Coringas valem como maximizados.
        </div>
      )}

      {g.phase === 'BIDDING' && !g.blind && (
        <BidSummary g={g} names={names} />
      )}

      {!mode3d && (g.phase === 'PLAYING' || g.phase === 'ROUND_RESULT') && (
        <div className="flex flex-wrap items-end justify-center gap-x-1.5 gap-y-2 sm:gap-x-2" data-testid="trick">
          {slots.map((id) => {
            const play = trickById.get(id);
            const isTurn = g.currentPlayerId === id;
            return (
              <div key={id} className="flex flex-col items-center gap-1">
                <AnimatePresence mode="popLayout">
                  {play ? (
                    <motion.div
                      key={play.card.id}
                      initial={{ opacity: 0, y: 40, rotateY: g.blind ? 180 : 0, scale: 0.8 }}
                      animate={{ opacity: 1, y: 0, rotateY: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    >
                      <PlayingCard
                        card={play.card}
                        jokerMode={play.jokerMode}
                        size={size}
                        highlight={winnerId === id}
                        dim={!!winnerId && winnerId !== id}
                      />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      className={`rounded-xl border-2 border-dashed ${isTurn ? 'border-gold/80 bg-gold/10' : 'border-white/15'} ${
                        size === 'sm' ? 'h-[62px] w-11' : 'h-[86px] w-[60px] sm:h-[96px] sm:w-[68px]'
                      }`}
                    />
                  )}
                </AnimatePresence>
                <span
                  className={`max-w-[72px] truncate text-[10px] font-bold sm:text-xs ${
                    winnerId === id ? 'text-emerald-300' : isTurn ? 'text-gold' : id === g.you ? 'text-violet-400' : 'text-mist/70'
                  }`}
                >
                  {id === g.you ? 'Você' : names.name(id)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BidSummary({ g, names }: { g: PlayerView; names: Names }) {
  const sum = Object.values(g.bids).reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-1.5">
        {g.participants.map((id) => (
          <span
            key={id}
            className={`chip ${
              g.bids[id] !== undefined ? 'bg-violet/40 text-white' : g.currentBidderId === id ? 'bg-gold text-night' : 'bg-white/5 text-mist/50'
            }`}
          >
            {id === g.you ? 'Você' : names.name(id)}: {g.bids[id] ?? (g.currentBidderId === id ? '…' : '–')}
          </span>
        ))}
      </div>
      <p className="text-xs text-mist/60">
        Soma dos palpites: <b className="text-white">{sum}</b> de {g.cardsPerPlayer} rodadas
      </p>
    </div>
  );
}

function DeadlineBar({ deadline }: { deadline: number | null }) {
  const cd = useCountdown(deadline);
  if (!cd) return null;
  return (
    <div className="flex w-48 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${cd.seconds <= 5 ? 'bg-rose-500' : 'bg-gold'}`}
          style={{ width: `${cd.fraction * 100}%` }}
        />
      </div>
      <span className={`w-8 text-right text-xs font-bold ${cd.seconds <= 5 ? 'text-rose-300' : 'text-mist/70'}`}>{cd.seconds}s</span>
    </div>
  );
}

function sortHand(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => playPower(a, a.value === 'JOKER' ? 'MAX' : null) - playPower(b, b.value === 'JOKER' ? 'MAX' : null));
}

function MyArea({
  g,
  room,
  names,
  desktop,
  mode3d,
  hand3d,
  selected,
  setSelected,
  onHover,
}: {
  g: PlayerView;
  room: RoomView;
  names: Names;
  desktop: boolean;
  mode3d: boolean;
  hand3d: boolean;
  selected: string | null;
  setSelected: (id: string | null) => void;
  onHover: (h: boolean) => void;
}) {
  const [jokerFor, setJokerFor] = useState<Card | null>(null);
  const [sending, setSending] = useState(false);
  const width = useWindowWidth();
  const participant = g.participants.includes(g.you);
  const myTurnPlay = g.phase === 'PLAYING' && g.currentPlayerId === g.you;
  const myTurnBid = g.phase === 'BIDDING' && g.currentBidderId === g.you;

  const hand = useMemo(() => sortHand(g.myHand.filter((c): c is Card => !isHiddenCard(c))), [g.myHand]);
  const hiddenCount = g.myHand.filter(isHiddenCard).length;

  useEffect(() => {
    if (!myTurnPlay) setJokerFor(null);
  }, [myTurnPlay]);

  const doPlay = async (card: Card, mode: JokerMode | null) => {
    setSending(true);
    const res = await send('game:play', { cardId: card.id, jokerMode: mode });
    setSending(false);
    if (res.ok) {
      setSelected(null);
      setJokerFor(null);
    }
  };

  const onConfirmPlay = () => {
    const card = hand.find((c) => c.id === selected);
    if (!card) return;
    if (card.value === 'JOKER') setJokerFor(card);
    else void doPlay(card, null);
  };

  const cardW = desktop && !mode3d ? 88 : width >= 640 ? 68 : 60;
  const avail = Math.min(width - (desktop ? 160 : 96), 900);
  const gap = hand.length > 1 ? Math.min(8, (avail - hand.length * cardW) / (hand.length - 1)) : 0;

  const bid = g.bids[g.you];
  const won = g.tricksWon[g.you] ?? 0;

  return (
    <section
      className={`z-20 px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-2 ${
        mode3d
          ? `absolute inset-x-0 bottom-0 ${hand3d ? 'pointer-events-none bg-gradient-to-b from-transparent to-black/50' : 'bg-gradient-to-b from-transparent via-black/40 to-black/80'}`
          : 'relative border-t border-white/5 bg-black/30 backdrop-blur-md'
      }`}
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 pb-1">
        <div className="flex items-center gap-2">
          <Avatar name={names.name(g.you)} seat={names.seat(g.you)} size="sm" />
          <div>
            <p className="text-sm font-bold text-white">
              Você {g.dealerId === g.you && <Shuffle size={12} className="ml-0.5 inline text-gold" />}
            </p>
            <p className="text-xs font-semibold text-gold">{g.scores[g.you] ?? 0} pts</p>
          </div>
        </div>
        {participant && (
          <div className="flex items-center gap-1.5 text-xs" data-testid="my-stats">
            <span className="chip bg-violet/40 text-white">
              <Target size={12} /> Palpite {bid ?? '–'}
            </span>
            <span
              className={`chip ${bid !== undefined && won > bid ? 'bg-rose-500/40 text-rose-100' : bid === won ? 'bg-emerald-500/40 text-emerald-100' : 'bg-white/10 text-mist'}`}
            >
              <Trophy size={12} /> Venceu {won}
            </span>
          </div>
        )}
      </div>

      {myTurnBid && g.allowedBids && (
        <div className="pointer-events-auto">
          <BidPanel g={g} names={names} compact={mode3d} />
        </div>
      )}

      <div
        className={`relative flex items-end justify-center pb-1 pt-5 ${
          hand3d ? 'min-h-[150px] sm:min-h-[170px]' : mode3d ? (hiddenCount > 0 ? 'min-h-[70px]' : 'min-h-[100px]') : 'min-h-[112px] sm:min-h-[140px]'
        }`}
      >
        {participant && !mode3d && (
          <div className="absolute bottom-1 left-0 z-10 flex flex-col items-center gap-0.5 sm:left-2" data-testid="my-pile">
            <TrickPile count={won} size={desktop ? 'md' : 'sm'} />
            <span className="text-[9px] font-bold uppercase tracking-wider text-mist/50">Feitas</span>
          </div>
        )}
        {hand3d && participant ? null : !participant ? (
          <p className="self-center text-center text-sm text-mist/70">
            <Swords className="mx-auto mb-1 text-gold" size={20} />
            Você está assistindo ao desempate.
          </p>
        ) : hiddenCount > 0 ? (
          <div className="flex flex-col items-center gap-1">
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
              <CardBack size={mode3d ? 'sm' : 'lg'} label="Sua carta (oculta)" />
            </motion.div>
            <span className="text-xs font-semibold text-sky-200">
              <EyeOff size={12} className="mr-1 inline" />
              Sua carta está oculta
            </span>
          </div>
        ) : hand.length === 0 ? (
          <p className="self-center text-sm text-mist/50">Sem cartas na mão.</p>
        ) : (
          <div className="flex items-end justify-center" data-testid="hand">
            <AnimatePresence initial={false}>
              {hand.map((c, i) => (
                <motion.div
                  key={c.id}
                  layout
                  initial={{ y: 80, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -80, opacity: 0, scale: 0.8 }}
                  transition={{ delay: i * 0.03 }}
                  style={{ marginLeft: i === 0 ? 0 : gap, zIndex: i }}
                  onMouseEnter={() => onHover(true)}
                  onMouseLeave={() => onHover(false)}
                >
                  <PlayingCard
                    card={c}
                    size={desktop && !mode3d ? 'lg' : 'md'}
                    selected={selected === c.id}
                    onClick={() => setSelected(selected === c.id ? null : c.id)}
                    dim={!myTurnPlay && g.phase === 'PLAYING'}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        <AnimatePresence>
          {myTurnPlay && selected && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={`pointer-events-auto absolute left-1/2 z-30 -translate-x-1/2 ${hand3d ? '-top-12' : '-top-14'}`}
            >
              <button className="btn-gold whitespace-nowrap px-6 py-3 text-base" disabled={sending} onClick={onConfirmPlay} data-testid="play-button">
                <Check size={20} /> Jogar carta
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {myTurnPlay && !selected && (
          <p
            className={`pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/50 px-3 py-1 text-xs font-semibold text-gold ${
              hand3d ? '-top-8' : '-top-9'
            }`}
          >
            {hand3d ? 'Clique em uma das suas cartas' : 'Toque em uma carta para selecionar'}
          </p>
        )}
      </div>

      <JokerChoice card={jokerFor} onCancel={() => setJokerFor(null)} onChoose={(m) => jokerFor && doPlay(jokerFor, m)} busy={sending} />
    </section>
  );
}

function BidPanel({ g, names, compact }: { g: PlayerView; names: Names; compact?: boolean }) {
  const [value, setValue] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const options = Array.from({ length: g.cardsPerPlayer + 1 }, (_, i) => i);
  const allowed = new Set(g.allowedBids ?? []);
  const sum = Object.values(g.bids).reduce((a, b) => a + b, 0);
  const isLast = g.forbiddenBid !== null || Object.keys(g.bids).length === g.participants.length - 1;

  const confirm = async () => {
    if (value === null) return;
    setSending(true);
    await send('game:bid', { value });
    setSending(false);
  };

  // Painel embutido acima da mão: suas cartas continuam visíveis enquanto você decide o palpite.
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`mx-auto mb-1 w-full rounded-2xl ${compact ? 'max-w-md opacity-95' : 'max-w-xl'} bg-gradient-to-b from-[#3a2417] to-[#1d130c] p-3 shadow-[0_10px_30px_-10px_rgba(0,0,0,.9)] ring-1 ring-gold/40`}
      data-testid="bid-panel"
    >
      <div className="mx-auto max-w-xl">
        <h3 className={`text-center font-display text-white ${compact ? 'text-sm' : 'text-base sm:text-lg'}`}>
          {g.blind ? 'Você vai vencer esta rodada?' : 'Quantas rodadas você vai vencer?'}
        </h3>
        <p className={`mt-0.5 text-center text-[11px] text-mist/70 ${compact ? 'hidden sm:block' : ''}`}>
          {g.cardsPerPlayer} {g.cardsPerPlayer === 1 ? 'rodada' : 'rodadas'} nesta partida · Soma atual dos palpites: <b className="text-white">{sum}</b>
        </p>

        {Object.keys(g.bids).length > 0 && !compact && (
          <div className="mt-1.5 flex flex-wrap justify-center gap-1">
            {g.participants
              .filter((id) => g.bids[id] !== undefined)
              .map((id) => (
                <span key={id} className="chip bg-white/10 text-mist">
                  {names.name(id)}: <b className="text-white">{g.bids[id]}</b>
                </span>
              ))}
          </div>
        )}

        <div
          className="mt-2 grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${g.blind ? 2 : Math.min(options.length, 7)}, minmax(0, 1fr))` }}
        >
          {options.map((n) => {
            const ok = allowed.has(n);
            return (
              <button
                key={n}
                disabled={!ok}
                onClick={() => setValue(n)}
                data-testid={`bid-${n}`}
                title={ok ? undefined : `Proibido: a soma dos palpites seria igual a ${g.cardsPerPlayer}`}
                className={`relative rounded-xl font-display transition ${compact ? 'py-1 text-lg' : 'py-2 text-xl'} ${
                  !ok
                    ? 'cursor-not-allowed bg-rose-950/40 text-rose-300/40 ring-1 ring-rose-500/30'
                    : value === n
                      ? 'bg-gold text-night shadow-glow'
                      : 'bg-white/5 text-white ring-1 ring-white/15 hover:bg-white/10'
                }`}
              >
                {n}
                {g.blind && <span className={`font-sans text-[11px] font-bold ${compact ? 'ml-1.5' : 'block'}`}>{n === 0 ? 'Vou perder' : 'Vou vencer'}</span>}
                {!ok && <span className="absolute inset-x-3 top-1/2 h-0.5 -rotate-12 bg-rose-400/70" />}
              </button>
            );
          })}
        </div>
        {isLast && g.forbiddenBid !== null && (
          <p className="mt-2 text-center text-xs font-semibold text-rose-300">
            Você é o último: o palpite {g.forbiddenBid} está bloqueado (a soma não pode ser {g.cardsPerPlayer}).
          </p>
        )}
        <button className={`btn-primary mt-2 w-full text-base ${compact ? 'py-2' : 'py-2.5'}`} disabled={value === null || sending} onClick={confirm} data-testid="bid-confirm">
          <Check size={20} /> Confirmar palpite {value !== null ? value : ''}
        </button>
      </div>
    </motion.div>
  );
}

function JokerChoice({
  card,
  onCancel,
  onChoose,
  busy,
}: {
  card: Card | null;
  onCancel: () => void;
  onChoose: (m: JokerMode) => void;
  busy: boolean;
}) {
  return (
    <Modal open={!!card} onClose={onCancel} title="Coringa: escolha o poder">
      {card && (
        <div className="space-y-4">
          <p className="text-sm text-mist/70">A escolha é definitiva depois de confirmada.</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              disabled={busy}
              onClick={() => onChoose('MAX')}
              data-testid="joker-max"
              className="group flex flex-col items-center gap-2 rounded-3xl bg-gradient-to-b from-gold/30 to-amber-600/10 p-4 ring-2 ring-gold/60 transition hover:ring-gold active:scale-95"
            >
              <PlayingCard card={card} jokerMode="MAX" size="md" />
              <span className="font-display text-lg text-gold">MAXIMIZAR</span>
              <span className="text-center text-xs text-mist/80">Mais forte que todas as cartas numeradas</span>
            </button>
            <button
              disabled={busy}
              onClick={() => onChoose('MIN')}
              data-testid="joker-min"
              className="group flex flex-col items-center gap-2 rounded-3xl bg-gradient-to-b from-cyan-400/25 to-sky-700/10 p-4 ring-2 ring-cyan-300/50 transition hover:ring-cyan-300 active:scale-95"
            >
              <PlayingCard card={card} jokerMode="MIN" size="md" />
              <span className="font-display text-lg text-cyan-300">MINIMIZAR</span>
              <span className="text-center text-xs text-mist/80">Mais fraco que todas as cartas numeradas</span>
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function TiebreakIntro({ g, names }: { g: PlayerView; names: Names }) {
  const [shown, setShown] = useState<number>(0);
  const visible = g.stage === 'TIEBREAK' && g.phase === 'BIDDING' && Object.keys(g.bids).length === 0 && shown !== g.tiebreakNumber;
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setShown(g.tiebreakNumber), 2800);
    return () => clearTimeout(t);
  }, [visible, g.tiebreakNumber]);
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/80 p-6 text-center backdrop-blur"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShown(g.tiebreakNumber)}
        >
          <motion.div initial={{ scale: 3, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: -3, opacity: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 12 }}>
            <Swords size={64} className="mx-auto text-gold drop-shadow-[0_0_20px_rgba(245,196,81,.8)]" />
            <h2 className="mt-2 bg-gradient-to-r from-rose-400 via-gold to-rose-400 bg-[length:200%_100%] bg-clip-text font-display text-5xl text-transparent animate-shimmer sm:text-7xl">
              DESEMPATE
            </h2>
            <p className="mt-1 font-display text-lg text-white/80">{g.tiebreakNumber > 1 ? `Rodada extra #${g.tiebreakNumber}` : 'Sem piedade.'}</p>
          </motion.div>
          <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="flex flex-wrap justify-center gap-2">
            {g.participants.map((id) => (
              <span key={id} className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 font-bold text-white ring-1 ring-gold/40">
                <Avatar name={names.name(id)} seat={names.seat(id)} size="sm" />
                {id === g.you ? 'Você' : names.name(id)}
              </span>
            ))}
          </motion.div>
          <p className="max-w-sm text-sm text-mist/70">Partida extra às cegas, uma carta, coringas maximizados. Acertar 0 vale 10; acertar 1 vale 11.</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
