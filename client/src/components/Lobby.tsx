import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Copy, Crown, LogOut, Mic, MicOff, Play, Plus, Share2, Timer, UserPlus, WifiOff, X } from 'lucide-react';
import { MAX_PLAYERS, MIN_PLAYERS, TURN_SECONDS_OPTIONS, maxHandsFor, type RoomView } from '@nomercy/shared';
import { leaveRoom, send, toast } from '../lib/store';
import { Logo } from './Logo';
import { Avatar } from './Avatar';
import { BarAmbience } from './BarAmbience';
import { AudioButtons } from './AudioPanel';

export function Lobby({ room }: { room: RoomView }) {
  const isHost = room.hostId === room.you;
  const count = room.players.length;
  const link = `${window.location.origin}${window.location.pathname}?sala=${room.code}`;

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(msg, 'success');
    } catch {
      toast('Não foi possível copiar. Copie manualmente: ' + text, 'info');
    }
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'NO MERCY', text: `Entre na minha sala do NO MERCY: ${room.code}`, url: link });
        return;
      } catch {
        /* cancelado */
      }
    }
    void copy(link, 'Link copiado!');
  };

  return (
    <div className="relative min-h-full">
      <div className="fixed inset-0">
        <BarAmbience />
      </div>
    <div className="relative mx-auto flex min-h-full w-full max-w-2xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between">
        <Logo size="sm" />
        <div className="flex items-center gap-1">
          <AudioButtons room={room} />
        <button className="btn-ghost px-3 py-2 text-sm" onClick={leaveRoom}>
          <LogOut size={16} /> Sair
        </button>
        </div>
      </header>

      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="panel p-5 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-mist/60">Código da sala</p>
        <button
          onClick={() => copy(room.code, 'Código copiado!')}
          className="mt-1 font-display text-5xl tracking-[0.25em] text-gold transition hover:brightness-110 sm:text-6xl"
          aria-label="Copiar código da sala"
          data-testid="room-code"
        >
          {room.code}
        </button>
        <div className="mt-4 flex justify-center gap-2">
          <button className="btn-ghost px-4 py-2 text-sm" onClick={() => copy(room.code, 'Código copiado!')}>
            <Copy size={16} /> Código
          </button>
          <button className="btn-primary px-4 py-2 text-sm" onClick={share}>
            <Share2 size={16} /> Convidar
          </button>
        </div>
      </motion.section>

      <section className="panel p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg text-white">
            Jogadores <span className="text-mist/50">{count}/{MAX_PLAYERS}</span>
          </h2>
          {count >= MIN_PLAYERS && <span className="chip bg-violet/30 text-violet-400">{maxHandsFor(count)} partidas</span>}
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {room.players.map((p, i) => (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`flex items-center gap-3 rounded-2xl bg-black/20 p-2.5 ring-1 ${p.id === room.you ? 'ring-violet/70' : 'ring-white/5'}`}
              >
                <Avatar name={p.name} seat={i} isBot={p.isBot} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-white">
                    {p.name} {p.id === room.you && <span className="text-xs font-semibold text-violet-400">(você)</span>}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-mist/60">
                    {p.id === room.hostId && (
                      <>
                        <Crown size={12} className="text-gold" /> Anfitrião
                      </>
                    )}
                    {p.isBot && (
                      <>
                        <Bot size={12} /> Bot
                      </>
                    )}
                    {!p.isBot && !p.connected && (
                      <>
                        <WifiOff size={12} className="text-rose-400" /> Desconectado
                      </>
                    )}
                    {!p.isBot && p.connected && p.id !== room.hostId && 'Pronto'}
                    {p.voice && (
                      <span className={`ml-1 inline-flex items-center gap-0.5 ${p.micOn ? 'text-emerald-300' : 'text-rose-300'}`}>
                        · {p.micOn ? <Mic size={12} /> : <MicOff size={12} />} voz
                      </span>
                    )}
                  </p>
                </div>
                {isHost && p.id !== room.you && (
                  <button
                    className="rounded-full p-1.5 text-mist/50 hover:bg-white/10 hover:text-rose-300"
                    onClick={() => send('room:removePlayer', { playerId: p.id })}
                    aria-label={`Remover ${p.name}`}
                  >
                    <X size={16} />
                  </button>
                )}
              </motion.li>
            ))}
            {Array.from({ length: Math.max(0, MIN_PLAYERS - count) }).map((_, i) => (
              <li key={`empty-${i}`} className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-white/10 p-2.5 text-mist/40">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
                  <UserPlus size={18} />
                </span>
                Aguardando jogador…
              </li>
            ))}
          </AnimatePresence>
        </ul>

        {isHost ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="btn-ghost text-sm" disabled={count >= MAX_PLAYERS} onClick={() => send('room:addBot')}>
              <Plus size={16} /> Adicionar bot
            </button>
            <button className="btn-ghost text-sm" disabled={count >= 4} onClick={() => send('room:fillBots')}>
              <Bot size={16} /> Completar até 4
            </button>
          </div>
        ) : (
          <p className="mt-4 text-center text-sm text-mist/60">Aguardando o anfitrião iniciar a partida…</p>
        )}
      </section>

      <section className="panel p-4 sm:p-5">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-white">
          <Timer size={18} /> Tempo por jogada
        </h2>
        <div className="grid grid-cols-4 gap-2">
          {TURN_SECONDS_OPTIONS.map((s) => (
            <button
              key={s}
              disabled={!isHost}
              onClick={() => send('room:settings', { turnSeconds: s })}
              className={`rounded-xl py-2 text-sm font-bold transition ${
                room.settings.turnSeconds === s ? 'bg-electric text-white' : 'bg-white/5 text-mist ring-1 ring-white/10'
              } ${isHost ? 'hover:brightness-110' : 'cursor-default'}`}
            >
              {s === 0 ? 'Livre' : `${s}s`}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-mist/50">Ao esgotar o tempo, o sistema joga automaticamente pelo jogador.</p>
      </section>

      {isHost && (
        <button className="btn-gold sticky bottom-4 py-4 text-lg" disabled={count < MIN_PLAYERS} onClick={() => send('game:start')}>
          <Play size={22} fill="currentColor" />
          {count < MIN_PLAYERS ? `Falta ${MIN_PLAYERS - count} jogador` : `Iniciar jogo (${count} jogadores${count <= 4 ? ' · mesa 3D' : ''})`}
        </button>
      )}
    </div>
    </div>
  );
}
