import { motion } from 'framer-motion';
import { Bot, BookOpen, Download, RotateCcw, Share, DoorOpen, Loader2, Plus, Users, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { APP_VERSION, MAX_PLAYERS, MIN_PLAYERS, maxHandsFor } from '@nomercy/shared';
import { discardSavedGame, forgetLastRoom, getSavedName, resumeGame, returnToLastRoom, saveName, send, useStore } from '../lib/store';
import { FloatingCards } from './FloatingCards';
import { BarAmbience } from './BarAmbience';
import { Logo } from './Logo';
import { Modal } from './Modal';
import { Rules } from './Rules';
import { AudioButtons } from './AudioPanel';
import { isIOS, promptInstall, useInstall } from '../lib/install';

export function Home() {
  const { connected, savedGame, resuming, lastRoom } = useStore();
  const initialCode = new URLSearchParams(window.location.search).get('sala')?.toUpperCase() ?? '';
  const [name, setName] = useState(getSavedName());
  const [code, setCode] = useState(initialCode);
  const [mode, setMode] = useState<'none' | 'solo' | 'join'>(initialCode ? 'join' : 'none');
  const [players, setPlayers] = useState(4);
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState(false);
  const [iosTip, setIosTip] = useState(false);
  const install = useInstall();

  const cleanName = name.trim();
  const needName = cleanName.length === 0;

  const run = async (fn: () => Promise<unknown>) => {
    if (needName) return;
    saveName(cleanName);
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-full flex-col items-center justify-center px-4 py-10">
      <div className="fixed inset-0">
        <BarAmbience />
      </div>
      <FloatingCards />
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-8">
        <Logo />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="panel w-full space-y-4 p-5 sm:p-6"
        >
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-mist/60">Seu nome</span>
            <input
              className="input"
              value={name}
              maxLength={16}
              placeholder="Como quer ser chamado?"
              onChange={(e) => setName(e.target.value)}
              autoComplete="nickname"
            />
          </label>

          {savedGame && (
            <div className="rounded-2xl bg-gold/10 p-3 ring-1 ring-gold/40" data-testid="saved-game">
              <button className="btn-gold w-full text-lg" disabled={!connected || resuming} onClick={() => void resumeGame(false)} data-testid="resume-game">
                {resuming ? <Loader2 className="animate-spin" size={20} /> : <RotateCcw size={20} />} Voltar à partida
              </button>
              <p className="mt-1.5 text-center text-xs text-mist/70">
                Sala {savedGame.code} · salva às {new Date(savedGame.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                <button className="underline hover:text-white" onClick={discardSavedGame}>
                  descartar
                </button>
              </p>
            </div>
          )}

          {!savedGame && lastRoom && (
            <div className="rounded-2xl bg-white/5 p-3 ring-1 ring-gold/30" data-testid="last-room">
              <button
                className="btn-gold w-full"
                disabled={needName || busy || !connected}
                onClick={() => run(() => returnToLastRoom(cleanName))}
                data-testid="return-room"
              >
                <DoorOpen size={20} /> Voltar para a sala {lastRoom.code}
              </button>
              <p className="mt-1.5 text-center text-xs text-mist/60">
                O link de convite continua o mesmo ·{' '}
                <button className="underline hover:text-white" onClick={forgetLastRoom}>
                  esquecer
                </button>
              </p>
            </div>
          )}

          <button className="btn-primary w-full text-lg" disabled={needName || busy} onClick={() => setMode('solo')}>
            <Bot size={22} /> Jogar contra bots
          </button>
          <div className="grid grid-cols-2 gap-3">
            <button
              className="btn-gold"
              disabled={needName || busy || !connected}
              onClick={() => run(() => send('room:create', { name: cleanName }))}
            >
              {busy ? <Loader2 className="animate-spin" size={20} /> : <Plus size={20} />} Criar sala
            </button>
            <button className="btn-ghost" disabled={needName || busy} onClick={() => setMode('join')}>
              <DoorOpen size={20} /> Entrar
            </button>
          </div>
          {needName && <p className="text-center text-xs text-mist/50">Digite seu nome para começar.</p>}
        </motion.div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-mist/60">
          <button className="flex items-center gap-1.5 hover:text-white" onClick={() => setRules(true)}>
            <BookOpen size={16} /> Como jogar
          </button>
          {!install.installed && (install.canInstall || isIOS) && (
            <button
              className="flex items-center gap-1.5 font-semibold text-gold hover:brightness-110"
              onClick={() => (install.canInstall ? void promptInstall() : setIosTip(true))}
              data-testid="install-app"
            >
              <Download size={16} /> Instalar app
            </button>
          )}
          <span className="flex items-center">
            <AudioButtons room={null} />
          </span>
          <span className="flex items-center gap-1.5">
            {connected ? <Wifi size={16} className="text-emerald-400" /> : <WifiOff size={16} className="text-rose-400" />}
            {connected ? 'Online' : 'Conectando…'}
          </span>
          <span className="text-xs text-mist/40" data-testid="version">v{APP_VERSION}</span>
        </div>
      </div>

      <Modal open={mode === 'solo'} onClose={() => setMode('none')} title="Jogar contra bots">
        <p className="mb-3 text-sm text-mist/70">Quantos jogadores na mesa (você + bots)?</p>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => (
            <button
              key={n}
              onClick={() => setPlayers(n)}
              className={`rounded-2xl py-3 font-display text-xl transition ${
                players === n ? 'bg-violet text-white shadow-violet' : 'bg-white/5 text-mist ring-1 ring-white/10 hover:bg-white/10'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-2 text-sm text-mist/60">
          <Users size={16} /> {players - 1} {players - 1 === 1 ? 'bot' : 'bots'} · {maxHandsFor(players)} partidas{players <= 4 ? ' · mesa 3D' : ''}
        </p>
        <button
          className="btn-primary mt-5 w-full"
          disabled={busy || !connected}
          onClick={() => run(() => send('room:create', { name: cleanName, solo: true, botCount: players - 1 }))}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Bot />} Começar
        </button>
      </Modal>

      <Modal open={mode === 'join'} onClose={() => setMode('none')} title="Entrar em uma sala">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => send('room:join', { code: code.trim(), name: cleanName }));
          }}
        >
          <input
            className="input text-center font-display text-3xl tracking-[0.4em] uppercase"
            value={code}
            maxLength={5}
            placeholder="CÓDIGO"
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            autoFocus
          />
          {needName && <p className="mt-2 text-sm text-rose-300">Digite seu nome na tela inicial antes de entrar.</p>}
          <button className="btn-primary mt-4 w-full" disabled={code.length < 5 || busy || needName || !connected}>
            {busy ? <Loader2 className="animate-spin" /> : <DoorOpen />} Entrar
          </button>
        </form>
      </Modal>

      <Rules open={rules} onClose={() => setRules(false)} />
      <Modal open={iosTip} onClose={() => setIosTip(false)} title="Instalar no iPhone/iPad">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-mist/80">
          <li>
            Toque no botão <Share size={14} className="inline" /> <b>Compartilhar</b> do Safari.
          </li>
          <li>
            Escolha <b>Adicionar à Tela de Início</b>.
          </li>
          <li>Pronto: o NO MERCY aparece como um app no seu aparelho.</li>
        </ol>
      </Modal>
    </div>
  );
}
