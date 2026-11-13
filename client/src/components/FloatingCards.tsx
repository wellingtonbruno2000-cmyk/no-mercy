import { motion } from 'framer-motion';
import type { Card } from '@nomercy/shared';
import { CardBack, PlayingCard } from './PlayingCard';

const CARDS: { card: Card | null; x: string; y: string; r: number; d: number }[] = [
  { card: { id: 'f1', color: 'RED', value: 10 }, x: '6%', y: '12%', r: -18, d: 0 },
  { card: { id: 'f2', color: 'BLUE', value: 'JOKER' }, x: '84%', y: '8%', r: 14, d: 0.6 },
  { card: { id: 'f3', color: 'YELLOW', value: 7 }, x: '88%', y: '62%', r: -10, d: 1.2 },
  { card: null, x: '4%', y: '68%', r: 12, d: 0.3 },
  { card: { id: 'f4', color: 'GREEN', value: 3 }, x: '16%', y: '40%', r: 22, d: 0.9 },
  { card: { id: 'f5', color: 'BLACK', value: 1 }, x: '74%', y: '36%', r: -24, d: 1.5 },
  { card: null, x: '50%', y: '86%', r: -6, d: 1.8 },
];

export function FloatingCards() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {CARDS.map((c, i) => (
        <motion.div
          key={i}
          className="absolute opacity-60 sm:opacity-80"
          style={{ left: c.x, top: c.y }}
          initial={{ opacity: 0, rotate: c.r, y: 30 }}
          animate={{ opacity: 0.75, rotate: [c.r, c.r + 6, c.r], y: [0, -16, 0] }}
          transition={{ duration: 6 + i, repeat: Infinity, ease: 'easeInOut', delay: c.d }}
        >
          {c.card ? <PlayingCard card={c.card} size="md" /> : <CardBack size="md" />}
        </motion.div>
      ))}
    </div>
  );
}
