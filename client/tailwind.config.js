/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Ambiente de bar clandestino: madeira escura, couro, latão e luz âmbar.
        night: '#140e0b',
        abyss: '#0b0806',
        violet: { DEFAULT: '#9b3d2a', 400: '#d0694d', 600: '#7a2c1d' },
        electric: '#2f6b5c',
        mist: '#eadcc4',
        gold: '#e3a948',
        felt: '#1f3a30',
        wood: '#3b2416',
        card: {
          black: '#1b1b24',
          blue: '#1a3484',
          red: '#d42a3c',
          green: '#11965c',
          yellow: '#f4b80b',
        },
      },
      fontFamily: {
        display: ['"Rye"', 'Georgia', 'serif'],
        sans: ['"Outfit"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 2px rgba(227,169,72,.9), 0 0 24px rgba(227,169,72,.55)',
        violet: '0 10px 30px -8px rgba(155,61,42,.7)',
        card: '0 6px 16px -4px rgba(0,0,0,.55)',
      },
      keyframes: {
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        // Pulso só com opacidade/escala (não força redesenho a cada quadro, como animar box-shadow)
        pulseRing: { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.035)' } },
        flicker: { '0%,100%': { opacity: '1' }, '92%': { opacity: '1' }, '93%': { opacity: '.72' }, '94%': { opacity: '1' }, '97%': { opacity: '.85' } },
        sway: { '0%,100%': { transform: 'translateX(-50%) rotate(-1.2deg)' }, '50%': { transform: 'translateX(-50%) rotate(1.2deg)' } },
        smoke: { '0%': { transform: 'translate(0,0) scale(1)', opacity: '0' }, '20%': { opacity: '.5' }, '100%': { transform: 'translate(80px,-160px) scale(1.8)', opacity: '0' } },
      },
      animation: {
        shimmer: 'shimmer 3s linear infinite',
        pulseRing: 'pulseRing 1.6s ease-in-out infinite',
        flicker: 'flicker 7s linear infinite',
        sway: 'sway 9s ease-in-out infinite',
        smoke: 'smoke 14s ease-out infinite',
      },
    },
  },
  plugins: [],
};
