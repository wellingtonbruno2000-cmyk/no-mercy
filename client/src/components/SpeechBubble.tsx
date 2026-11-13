import { AnimatePresence, motion } from 'framer-motion';
import { useBubbles } from '../lib/taunts';

/** Balão de fala com a frase do jogador (aparece por alguns segundos). */
export function SpeechBubble({ playerId, className = '' }: { playerId: string; className?: string }) {
  const bubbles = useBubbles();
  const b = bubbles[playerId];
  return (
    <AnimatePresence>
      {b && (
        <motion.div
          key={b.key}
          initial={{ opacity: 0, y: 8, scale: 0.6 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
          className={`pointer-events-none absolute z-40 w-max max-w-[170px] rounded-2xl bg-[#fbf3e4] px-3 py-1.5 text-center text-xs font-black leading-tight text-[#1a1008] shadow-xl ${className}`}
          data-testid={`bubble-${playerId}`}
        >
          {b.text}
          <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 bg-[#fbf3e4]" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
