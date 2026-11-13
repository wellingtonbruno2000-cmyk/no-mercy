import { Bot, Layers, Target } from 'lucide-react';
import type { BotLevel, GameMode } from '@nomercy/shared';

const LEVELS: { id: BotLevel; label: string; hint: string }[] = [
  { id: 'easy', label: 'Fácil', hint: 'erram bastante' },
  { id: 'normal', label: 'Normal', hint: 'jogam razoável' },
  { id: 'hard', label: 'Difícil', hint: 'jogam para ganhar' },
];

/** Escolha do modo de jogo, da carta especial (Roleta) e da dificuldade dos bots. */
export function ModePicker({
  mode,
  onMode,
  level,
  onLevel,
  special,
  onSpecial,
  disabled,
}: {
  mode: GameMode;
  onMode: (m: GameMode) => void;
  level: BotLevel;
  onLevel: (l: BotLevel) => void;
  special: boolean;
  onSpecial: (v: boolean) => void;
  disabled?: boolean;
}) {
  const box = (active: boolean) =>
    `flex flex-1 flex-col items-start gap-0.5 rounded-2xl p-3 text-left ring-1 transition ${
      active ? 'bg-gold/15 ring-2 ring-gold' : 'bg-black/25 ring-white/10 hover:bg-black/35'
    } ${disabled ? 'cursor-default' : ''}`;
  return (
    <div className="space-y-3">
      <div>
        <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-mist/60">Modo de jogo</p>
        <div className="flex gap-2">
          <button className={box(mode === 'classic')} disabled={disabled} onClick={() => onMode('classic')} data-testid="mode-classic">
            <span className="flex items-center gap-1.5 font-bold text-white">
              <Layers size={16} className="text-gold" /> Clássico
            </span>
            <span className="text-[11px] text-mist/70">Preveja quantas rodadas vai vencer (2 a 8)</span>
          </button>
          <button className={box(mode === 'roleta')} disabled={disabled} onClick={() => onMode('roleta')} data-testid="mode-roleta">
            <span className="flex items-center gap-1.5 font-bold text-white">
              <Target size={16} className="text-rose-400" /> Roleta Sem Piedade
            </span>
            <span className="text-[11px] text-mist/70">Blefe com cartas e roleta (2 a 6)</span>
          </button>
        </div>
        {mode === 'roleta' && (
          <label className="mt-2 flex items-center gap-2 text-xs text-mist/80">
            <input type="checkbox" checked={special} disabled={disabled} onChange={(e) => onSpecial(e.target.checked)} className="accent-gold" />
            Coringa Preto ativo (se for acusado, todos menos quem jogou giram a roleta)
          </label>
        )}
      </div>
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-mist/60">
          <Bot size={14} /> Dificuldade dos bots
        </p>
        <div className="grid grid-cols-3 gap-2">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              disabled={disabled}
              onClick={() => onLevel(l.id)}
              data-testid={`level-${l.id}`}
              className={`rounded-xl py-2 text-sm font-bold transition ${level === l.id ? 'bg-electric text-white' : 'bg-white/5 text-mist ring-1 ring-white/10'}`}
            >
              {l.label}
              <span className="block text-[10px] font-semibold opacity-70">{l.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
