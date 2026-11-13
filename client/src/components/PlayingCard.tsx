import { motion } from 'framer-motion';
import { ChevronsDown, ChevronsUp, Crown } from 'lucide-react';
import { COLOR_LABEL, type Card, type CardColor, type JokerMode } from '@nomercy/shared';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE: Record<CardSize, { box: string; num: string; corner: string; icon: number }> = {
  xs: { box: 'w-8 h-11 rounded-md', num: 'text-base', corner: 'text-[8px]', icon: 12 },
  sm: { box: 'w-11 h-[62px] rounded-lg', num: 'text-xl', corner: 'text-[9px]', icon: 16 },
  md: { box: 'w-[60px] h-[86px] sm:w-[68px] sm:h-[96px] rounded-xl', num: 'text-3xl sm:text-4xl', corner: 'text-[11px]', icon: 24 },
  lg: { box: 'w-[76px] h-[108px] sm:w-[88px] sm:h-[124px] rounded-xl', num: 'text-4xl sm:text-5xl', corner: 'text-xs', icon: 30 },
};

export const CARD_STYLE: Record<CardColor, { bg: string; ink: string; ring: string }> = {
  BLACK: { bg: 'bg-gradient-to-br from-[#2b2b38] to-[#0d0d12]', ink: 'text-white', ring: 'ring-white/25' },
  BLUE: { bg: 'bg-gradient-to-br from-[#2547b0] to-[#0f1f55]', ink: 'text-white', ring: 'ring-sky-200/30' },
  RED: { bg: 'bg-gradient-to-br from-[#f04456] to-[#a3172a]', ink: 'text-white', ring: 'ring-rose-100/30' },
  GREEN: { bg: 'bg-gradient-to-br from-[#22c07a] to-[#0a6b40]', ink: 'text-white', ring: 'ring-emerald-100/30' },
  YELLOW: { bg: 'bg-gradient-to-br from-[#ffd84a] to-[#e09a00]', ink: 'text-[#2a1d00]', ring: 'ring-yellow-50/50' },
};

interface Props {
  card: Card;
  size?: CardSize;
  jokerMode?: JokerMode | null;
  selected?: boolean;
  highlight?: boolean;
  dim?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  /** Modo Roleta: desenha a carta especial "Carta do Diabo". */
  devil?: boolean;
}

/** Ícone original da Carta do Diabo: chifres e tridente. */
function DevilIcon({ size }: { size: number }) {
  return (
    <svg width={size * 1.6} height={size * 1.6} viewBox="0 0 48 48" aria-hidden>
      <path d="M10 18c-4-6-2-12 2-15 0 6 3 9 7 11z" fill="#ff3b3b" />
      <path d="M38 18c4-6 2-12-2-15 0 6-3 9-7 11z" fill="#ff3b3b" />
      <path d="M24 10v34" stroke="#ffcf6b" strokeWidth="3" strokeLinecap="round" />
      <path d="M14 14c0 7 4 10 10 10s10-3 10-10" fill="none" stroke="#ffcf6b" strokeWidth="3" strokeLinecap="round" />
      <path d="M14 14l-2-5M24 10l0-6M34 14l2-5" stroke="#ffcf6b" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PlayingCard({ card, size = 'md', jokerMode, selected, highlight, dim, onClick, disabled, title, devil }: Props) {
  if (devil) return <DevilCard size={size} selected={selected} highlight={highlight} dim={dim} onClick={onClick} disabled={disabled} cardId={card.id} />;
  const s = SIZE[size];
  const st = CARD_STYLE[card.color];
  const joker = card.value === 'JOKER';
  const label = joker ? 'Coringa' : String(card.value);
  const aria = `${label} ${COLOR_LABEL[card.color]}${jokerMode ? (jokerMode === 'MAX' ? ' maximizado' : ' minimizado') : ''}`;
  const Comp = onClick ? motion.button : motion.div;
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      title={title ?? aria}
      data-card={card.id}
      animate={{ y: selected ? -18 : 0, scale: highlight ? 1.06 : 1 }}
      whileHover={onClick && !disabled ? { y: selected ? -18 : -8 } : undefined}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className={[
        'relative shrink-0 overflow-hidden shadow-card ring-1',
        s.box,
        st.bg,
        st.ink,
        st.ring,
        selected ? 'outline outline-[3px] outline-gold' : '',
        highlight ? 'shadow-glow' : '',
        dim ? 'opacity-60 saturate-[.7]' : '',
        onClick && !disabled ? 'cursor-pointer' : '',
      ].join(' ')}
    >
      <div className="card-stripes absolute inset-0" />
      <div className="absolute inset-[3px] rounded-[inherit] ring-1 ring-white/25" />
      {size !== 'xs' && (
        <>
          <span className={`absolute left-1 top-0.5 font-display leading-none ${s.corner}`}>{joker ? '★' : label}</span>
          <span className={`absolute bottom-0.5 right-1 rotate-180 font-display leading-none ${s.corner}`}>{joker ? '★' : label}</span>
        </>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {joker ? (
          <>
            <Crown size={s.icon} strokeWidth={2.4} className="drop-shadow" />
            {size !== 'xs' && size !== 'sm' && (
              <span className="mt-0.5 text-[9px] font-extrabold uppercase tracking-widest opacity-90">Coringa</span>
            )}
          </>
        ) : (
          <span className={`font-display leading-none drop-shadow-[0_2px_0_rgba(0,0,0,.25)] ${s.num}`}>{label}</span>
        )}
      </div>
      {joker && jokerMode && (
        <span
          className={`absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 py-0.5 text-[9px] font-black uppercase ${
            jokerMode === 'MAX' ? 'bg-gold text-night' : 'bg-cyan-300 text-night'
          }`}
        >
          {jokerMode === 'MAX' ? <ChevronsUp size={10} /> : <ChevronsDown size={10} />}
          {size !== 'xs' && (jokerMode === 'MAX' ? 'Max' : 'Min')}
        </span>
      )}
    </Comp>
  );
}

function DevilCard({
  size,
  selected,
  highlight,
  dim,
  onClick,
  disabled,
  cardId,
}: {
  size: CardSize;
  selected?: boolean;
  highlight?: boolean;
  dim?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  cardId: string;
}) {
  const s = SIZE[size];
  const Comp = onClick ? motion.button : motion.div;
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={disabled}
      data-card={cardId}
      aria-label="Carta do Diabo"
      title="Carta do Diabo — se a jogada com ela for acusada, todos menos quem jogou vão para a roleta"
      animate={{ y: selected ? -18 : 0, scale: highlight ? 1.06 : 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className={[
        'relative shrink-0 overflow-hidden shadow-card ring-2 ring-red-500/70 bg-gradient-to-br from-[#3a0606] via-[#120202] to-[#000]',
        s.box,
        selected ? 'outline outline-[3px] outline-gold' : '',
        highlight ? 'shadow-[0_0_24px_rgba(255,40,40,.7)]' : '',
        dim ? 'opacity-60' : '',
        onClick && !disabled ? 'cursor-pointer' : '',
      ].join(' ')}
    >
      <div className="absolute inset-[3px] rounded-[inherit] ring-1 ring-red-400/40" />
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <DevilIcon size={s.icon} />
        {size !== 'xs' && size !== 'sm' && <span className="mt-0.5 text-[9px] font-black uppercase tracking-widest text-red-300">Diabo</span>}
      </div>
    </Comp>
  );
}

export function CardBack({ size = 'md', label, className = '' }: { size?: CardSize; label?: string; className?: string }) {
  const s = SIZE[size];
  return (
    <div
      className={`relative shrink-0 overflow-hidden shadow-card ring-1 ring-gold/40 card-back-pattern ${s.box} ${className}`}
      aria-label={label ?? 'Carta virada'}
      title={label ?? 'Carta virada'}
    >
      <div className="absolute inset-[3px] rounded-[inherit] ring-1 ring-gold/30" />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`font-display text-gold drop-shadow ${size === 'xs' ? 'text-[8px]' : size === 'sm' ? 'text-[10px]' : 'text-sm'}`}>
          NM
        </span>
      </div>
    </div>
  );
}
