import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  // Portal: evita que ancestrais com backdrop-filter/transform prendam o modal.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-[#22170f] p-5 shadow-2xl ring-1 ring-white/10 sm:rounded-3xl sm:p-6 ${
              wide ? 'sm:max-w-4xl' : 'sm:max-w-lg'
            }`}
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            {(title || onClose) && (
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="font-display text-xl text-white">{title}</h2>
                {onClose && (
                  <button className="rounded-full p-2 text-mist/70 hover:bg-white/10" onClick={onClose} aria-label="Fechar">
                    <X size={20} />
                  </button>
                )}
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
