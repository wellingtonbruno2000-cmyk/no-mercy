import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useStore } from '../lib/store';

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            role="status"
            className={`pointer-events-auto flex max-w-md items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl ring-1 ${
              t.kind === 'error'
                ? 'bg-rose-600/95 text-white ring-rose-300/30'
                : t.kind === 'success'
                  ? 'bg-emerald-600/95 text-white ring-emerald-300/30'
                  : 'bg-night/95 text-mist ring-white/15'
            }`}
          >
            {t.kind === 'error' ? <AlertTriangle size={18} /> : t.kind === 'success' ? <CheckCircle2 size={18} /> : <Info size={18} />}
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
