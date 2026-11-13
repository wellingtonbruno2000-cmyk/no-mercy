import { AnimatePresence, motion } from 'framer-motion';

/** Monte de cartas recolhidas: um "baralhinho" para cada rodada vencida na partida. */
export function TrickPile({ count, size = 'sm', label = true }: { count: number; size?: 'xs' | 'sm' | 'md'; label?: boolean }) {
  const dims = size === 'xs' ? { w: 18, h: 26, step: 3 } : size === 'sm' ? { w: 24, h: 34, step: 4 } : { w: 32, h: 46, step: 5 };
  const shown = Math.min(count, 8);
  const width = dims.w + Math.max(0, shown - 1) * dims.step;
  return (
    <div
      className="flex items-center gap-1.5"
      title={`${count} ${count === 1 ? 'rodada feita' : 'rodadas feitas'}`}
      aria-label={`${count} ${count === 1 ? 'rodada feita' : 'rodadas feitas'}`}
      data-testid="trick-pile"
    >
      <div className="relative" style={{ width: count ? width : dims.w, height: dims.h }}>
        {count === 0 && (
          <div className="absolute inset-0 rounded-[4px] border border-dashed border-white/15" />
        )}
        <AnimatePresence initial={false}>
          {Array.from({ length: shown }).map((_, i) => (
            <motion.div
              key={i}
              initial={{ y: -40, opacity: 0, rotate: -20, scale: 1.4 }}
              animate={{ y: 0, opacity: 1, rotate: (i % 2 ? 4 : -3) + i, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="card-back-pattern absolute top-0 rounded-[4px] shadow-card ring-1 ring-gold/60"
              style={{ left: i * dims.step, width: dims.w, height: dims.h }}
            />
          ))}
        </AnimatePresence>
      </div>
      {label && (
        <motion.span
          key={count}
          initial={{ scale: 1.6 }}
          animate={{ scale: 1 }}
          className={`font-display leading-none ${count ? 'text-gold' : 'text-mist/40'} ${size === 'md' ? 'text-lg' : 'text-xs'}`}
        >
          {count}
        </motion.span>
      )}
    </div>
  );
}
