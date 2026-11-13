/**
 * Ambiente de bar: lâmpada pendurada balançando, cone de luz âmbar, fumaça subindo e granulação.
 * Tudo feito com CSS (sem imagens externas).
 */
export function BarAmbience({ table = false, tiebreak = false }: { table?: boolean; tiebreak?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Mesa (só em telas maiores; no celular o feltro fica no centro) */}
      {table && (
        <div
          className={`bar-table absolute left-1/2 top-[56%] hidden h-[62%] w-[74%] max-w-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] md:block ${
            tiebreak ? 'bar-table-tiebreak' : ''
          }`}
        >
          <div className="grain absolute inset-0 rounded-[50%] opacity-20" />
        </div>
      )}

      {/* Lâmpada pendurada */}
      <div className="absolute left-1/2 top-0 origin-top animate-sway" style={{ transform: 'translateX(-50%)' }}>
        <div className="mx-auto h-10 w-px bg-black/80 sm:h-14" />
        <div className="relative mx-auto h-5 w-16 rounded-t-full bg-gradient-to-b from-[#2a2a2a] to-[#0c0c0c] shadow-lg sm:h-6 sm:w-20" />
        <div className="mx-auto -mt-1 h-3 w-6 animate-flicker rounded-b-full bg-[#ffd68a] shadow-[0_0_30px_12px_rgba(255,190,90,.55)]" />
      </div>
      <div
        className="absolute left-1/2 top-12 h-[85%] w-[110%] -translate-x-1/2 animate-flicker sm:top-16"
        style={{
          background: tiebreak
            ? 'radial-gradient(ellipse 45% 70% at 50% 0%, rgba(255,120,80,.16), transparent 70%)'
            : 'radial-gradient(ellipse 45% 70% at 50% 0%, rgba(255,200,120,.16), transparent 70%)',
        }}
      />

      {/* Fumaça */}
      {[
        { l: '12%', b: '10%', d: '0s', s: 260 },
        { l: '70%', b: '18%', d: '5s', s: 320 },
        { l: '40%', b: '5%', d: '9s', s: 280 },
      ].map((p, i) => (
        <div
          key={i}
          className="absolute animate-smoke rounded-full will-change-transform"
          style={{
            left: p.l,
            bottom: p.b,
            width: p.s,
            height: p.s,
            animationDelay: p.d,
            background: 'radial-gradient(circle, rgba(220,210,190,.08) 0%, rgba(220,210,190,.04) 35%, transparent 70%)',
          }}
        />
      ))}

      {/* Granulação e vinheta */}
      <div className="grain absolute inset-0 opacity-[0.07]" />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(0,0,0,.6) 100%)' }} />
    </div>
  );
}
