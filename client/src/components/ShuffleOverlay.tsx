import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { PlayerView } from '@nomercy/shared';
import { CardBack } from './PlayingCard';

/** Animação de embaralhar, cortar e distribuir no início de cada partida (apenas visual). */
export function ShuffleOverlay({ g, dealerName }: { g: PlayerView; dealerName: string }) {
  const key = `${g.stage}-${g.handNumber}-${g.tiebreakNumber}`;
  const [shownKey, setShownKey] = useState<string | null>(null);
  const fresh = g.phase === 'BIDDING' && Object.keys(g.bids).length === 0;
  const visible = fresh && shownKey !== key;

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setShownKey(key), 1900);
    return () => clearTimeout(t);
  }, [visible, key]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key={key}
          className="pointer-events-none fixed inset-0 z-[45] flex flex-col items-center justify-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-live="polite"
        >
          <div className="relative h-32 w-48">
            {/* Embaralhar: duas metades se intercalando */}
            {Array.from({ length: 10 }).map((_, i) => {
              const left = i % 2 === 0;
              return (
                <motion.div
                  key={i}
                  className="absolute left-1/2 top-1/2"
                  initial={{ x: left ? -70 : 30, y: -40, rotate: left ? -14 : 14, opacity: 0 }}
                  animate={{
                    x: [left ? -70 : 30, -20, -20, -20],
                    y: [-40, -40 - i * 0.8, -40 - i * 0.8, -40 - i * 0.8],
                    rotate: [left ? -14 : 14, 0, 0, 0],
                    opacity: [0, 1, 1, 1],
                  }}
                  transition={{ duration: 1.1, delay: i * 0.05, times: [0, 0.45, 0.8, 1] }}
                >
                  <CardBack size="sm" />
                </motion.div>
              );
            })}
            {/* Corte: a metade de cima sai para o lado e volta por baixo */}
            <motion.div
              className="absolute left-1/2 top-1/2"
              initial={{ x: -20, y: -48, opacity: 0 }}
              animate={{ x: [-20, 40, 40, -20], y: [-48, -48, -30, -36], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 0.7, delay: 1.05 }}
            >
              <CardBack size="sm" />
            </motion.div>
          </div>
          <motion.p
            initial={{ y: 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="rounded-full bg-black/60 px-4 py-1.5 text-sm font-bold text-gold ring-1 ring-gold/30"
          >
            {dealerName} embaralhou, cortou e distribuiu
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
