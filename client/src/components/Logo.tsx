import { motion } from 'framer-motion';

export function Logo({ size = 'lg' }: { size?: 'sm' | 'lg' }) {
  if (size === 'sm') {
    return (
      <div className="flex items-center gap-1 font-display text-lg leading-none tracking-tight select-none">
        <span className="text-white">NO</span>
        <span className="bg-gradient-to-r from-gold to-amber-300 bg-clip-text text-transparent">MERCY</span>
      </div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 18 }}
      className="relative select-none text-center"
    >
      <div className="relative inline-block">
        <span className="absolute -left-3 -top-3 h-6 w-6 rotate-12 rounded-md bg-card-red shadow-card" />
        <span className="absolute -right-4 top-1 h-7 w-5 -rotate-12 rounded-md bg-card-blue shadow-card" />
        <h1 className="font-display text-[56px] leading-[0.85] sm:text-[88px]">
          <span className="block text-white drop-shadow-[0_6px_0_rgba(155,61,42,.95)]">NO</span>
          <span className="block bg-gradient-to-b from-[#ffe58f] via-gold to-[#d99a1e] bg-clip-text text-transparent drop-shadow-[0_6px_0_rgba(10,6,4,.9)]">
            MERCY
          </span>
        </h1>
      </div>
      <p className="mt-4 text-sm font-semibold uppercase tracking-[0.35em] text-mist/70">Preveja. Vença. Sem piedade.</p>
    </motion.div>
  );
}
