import { Headphones, MessageCircle, Mic, MicOff, Music, PhoneOff, Settings2, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { RoomView } from '@nomercy/shared';
import { updateAudioSettings, useAudioSettings } from '../lib/audio';
import { pickPhrase, speak, useNarratorVoices } from '../lib/taunts';
import {
  changeMicDevice,
  joinVoice,
  leaveVoice,
  refreshDevices,
  setMic,
  supportsOutputSelection,
  useDevices,
  useVoice,
} from '../lib/voice';
import { Modal } from './Modal';

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-violet' : 'bg-white/15'}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

function Slider({ value, onChange, disabled, label }: { value: number; onChange: (v: number) => void; disabled?: boolean; label: string }) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      value={Math.round(value * 100)}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
      className="h-2 w-full cursor-pointer accent-gold disabled:opacity-30"
    />
  );
}

function Row({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-2xl bg-black/20 p-3 ring-1 ring-white/5">
      <div className="flex items-center gap-2 text-sm font-bold text-white">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

/** Painel de som: chat de voz (microfone/alto-falante), música e efeitos. Pode ser aberto a qualquer momento. */
export function AudioPanel({ open, onClose, room }: { open: boolean; onClose: () => void; room: RoomView | null }) {
  const s = useAudioSettings();
  const voice = useVoice();
  const devices = useDevices();
  const voices = useNarratorVoices();
  const others = room?.players.filter((p) => !p.isBot && p.id !== room.you) ?? [];
  const voiceAvailable = !!room && others.length > 0;

  useEffect(() => {
    if (open) void refreshDevices();
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Som e voz">
      <div className="space-y-3">
        <Row icon={<Headphones size={18} className="text-electric" />} title="Chat de voz">
          {!voiceAvailable ? (
            <p className="text-xs text-mist/60">Disponível em salas com outros jogadores humanos.</p>
          ) : !voice.active ? (
            <button className="btn-primary w-full py-2.5 text-sm" disabled={voice.joining} onClick={() => void joinVoice()} data-testid="voice-join">
              <Mic size={16} /> {voice.joining ? 'Conectando…' : 'Entrar no chat de voz'}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={`btn py-2.5 text-sm ${voice.micOn ? 'bg-emerald-600 text-white' : 'bg-rose-600/80 text-white'}`}
                  onClick={() => void setMic(!voice.micOn)}
                  data-testid="voice-mic"
                >
                  {voice.micOn ? <Mic size={16} /> : <MicOff size={16} />}
                  {voice.micOn ? 'Microfone ligado' : 'Microfone mudo'}
                </button>
                <button className="btn-ghost py-2.5 text-sm" onClick={() => leaveVoice()}>
                  <PhoneOff size={16} /> Sair da voz
                </button>
              </div>
              <p className="text-xs text-mist/60">
                Na voz:{' '}
                {room!.players
                  .filter((p) => p.voice)
                  .map((p) => (p.id === room!.you ? 'você' : p.name))
                  .join(', ')}
              </p>
            </div>
          )}

          <label className="block pt-1">
            <span className="mb-1 block text-xs font-semibold text-mist/70">Microfone</span>
            <select
              className="w-full rounded-xl bg-black/40 px-3 py-2 text-sm text-white ring-1 ring-white/10"
              value={s.micDeviceId}
              onChange={(e) => void changeMicDevice(e.target.value)}
            >
              <option value="">Padrão do sistema</option>
              {devices.inputs
                .filter((d) => d.deviceId && d.deviceId !== 'default')
                .map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Microfone ${i + 1}`}
                  </option>
                ))}
            </select>
          </label>

          {supportsOutputSelection && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-mist/70">Saída de áudio (fone / alto-falante)</span>
              <select
                className="w-full rounded-xl bg-black/40 px-3 py-2 text-sm text-white ring-1 ring-white/10"
                value={s.outputDeviceId}
                onChange={(e) => updateAudioSettings({ outputDeviceId: e.target.value })}
              >
                <option value="">Padrão do sistema</option>
                {devices.outputs
                  .filter((d) => d.deviceId && d.deviceId !== 'default')
                  .map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Saída ${i + 1}`}
                    </option>
                  ))}
              </select>
            </label>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              className="rounded-lg p-1 text-mist/80 hover:bg-white/10"
              onClick={() => updateAudioSettings({ voiceMuted: !s.voiceMuted })}
              aria-label={s.voiceMuted ? 'Ouvir vozes' : 'Silenciar vozes'}
              title={s.voiceMuted ? 'Ouvir vozes' : 'Silenciar vozes'}
            >
              {s.voiceMuted ? <VolumeX size={18} className="text-rose-300" /> : <Volume2 size={18} />}
            </button>
            <span className="w-24 shrink-0 text-xs text-mist/70">Volume das vozes</span>
            <Slider label="Volume das vozes" value={s.voiceVolume} disabled={s.voiceMuted} onChange={(v) => updateAudioSettings({ voiceVolume: v })} />
          </div>
        </Row>

        <Row icon={<Music size={18} className="text-gold" />} title="Música">
          <div className="flex items-center gap-3">
            <Toggle label="Música" on={s.musicOn} onChange={(v) => updateAudioSettings({ musicOn: v })} />
            <Slider label="Volume da música" value={s.musicVolume} disabled={!s.musicOn} onChange={(v) => updateAudioSettings({ musicVolume: v })} />
          </div>
        </Row>

        <Row icon={<MessageCircle size={18} className="text-gold" />} title="Frases engraçadas">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-mist/70">Balões com provocações ("Toma essa, pilantra!")</span>
            <Toggle label="Frases engraçadas" on={s.tauntsOn} onChange={(v) => updateAudioSettings({ tauntsOn: v })} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-mist/70">Narrador falando as frases (voz do aparelho)</span>
            <Toggle label="Narrador" on={s.tauntVoiceOn && s.tauntsOn} onChange={(v) => updateAudioSettings({ tauntVoiceOn: v })} />
          </div>
          {voices.length > 0 && (
            <div className="flex items-center gap-2">
              <select
                className="min-w-0 flex-1 rounded-xl bg-black/40 px-3 py-2 text-sm text-white ring-1 ring-white/10"
                value={s.narratorVoice}
                onChange={(e) => updateAudioSettings({ narratorVoice: e.target.value })}
                aria-label="Voz do narrador"
              >
                <option value="">Voz automática (melhor disponível)</option>
                {voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </select>
              <button className="btn-ghost px-3 py-2 text-xs" onClick={() => speak(pickPhrase('handHit', String(Date.now())), 0)}>
                Ouvir
              </button>
            </div>
          )}
        </Row>

        <Row icon={<Sparkles size={18} className="text-violet-400" />} title="Efeitos sonoros">
          <div className="flex items-center gap-3">
            <Toggle label="Efeitos sonoros" on={s.sfxOn} onChange={(v) => updateAudioSettings({ sfxOn: v })} />
            <Slider label="Volume dos efeitos" value={s.sfxVolume} disabled={!s.sfxOn} onChange={(v) => updateAudioSettings({ sfxVolume: v })} />
          </div>
        </Row>
      </div>
    </Modal>
  );
}

/** Botões rápidos (barra superior): microfone, música e painel de som. */
export function AudioButtons({ room }: { room: RoomView | null }) {
  const [open, setOpen] = useState(false);
  const s = useAudioSettings();
  const voice = useVoice();
  const voiceAvailable = !!room && room.players.some((p) => !p.isBot && p.id !== room.you);
  const btn = 'relative rounded-xl p-2 text-mist/80 hover:bg-white/10';
  return (
    <>
      {voiceAvailable && (
        <button
          className={`${btn} ${voice.active ? (voice.micOn ? 'text-emerald-300' : 'text-rose-300') : ''}`}
          onClick={() => (voice.active ? void setMic(!voice.micOn) : void joinVoice())}
          aria-label={voice.active ? (voice.micOn ? 'Desligar microfone' : 'Ligar microfone') : 'Entrar no chat de voz'}
          title={voice.active ? (voice.micOn ? 'Desligar microfone' : 'Ligar microfone') : 'Entrar no chat de voz'}
          data-testid="mic-button"
        >
          {voice.active && !voice.micOn ? <MicOff size={20} /> : <Mic size={20} />}
          {voice.active && voice.micOn && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-emerald-400" />}
        </button>
      )}
      <button
        className={btn}
        onClick={() => updateAudioSettings({ musicOn: !s.musicOn })}
        aria-label={s.musicOn ? 'Desligar música' : 'Ligar música'}
        title={s.musicOn ? 'Desligar música' : 'Ligar música'}
      >
        <Music size={20} className={s.musicOn ? '' : 'opacity-40'} />
        {!s.musicOn && <span className="absolute left-1/2 top-1/2 h-0.5 w-6 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-rose-400" />}
      </button>
      <button className={btn} onClick={() => setOpen(true)} aria-label="Som e voz" title="Som e voz" data-testid="audio-settings">
        <Settings2 size={20} />
      </button>
      <AudioPanel open={open} onClose={() => setOpen(false)} room={room} />
    </>
  );
}
