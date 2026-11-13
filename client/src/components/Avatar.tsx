import { Bot } from 'lucide-react';

const GRADIENTS = [
  'from-violet to-electric',
  'from-rose-500 to-orange-400',
  'from-emerald-500 to-teal-400',
  'from-amber-400 to-yellow-300',
  'from-sky-500 to-cyan-300',
  'from-fuchsia-500 to-pink-400',
  'from-lime-500 to-green-400',
  'from-indigo-500 to-purple-400',
];

export function Avatar({ name, seat, isBot, size = 'md' }: { name: string; seat: number; isBot?: boolean; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-8 w-8 text-sm' : 'h-10 w-10 text-base';
  return (
    <span
      className={`relative flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-display text-white shadow ${dim} ${
        GRADIENTS[seat % GRADIENTS.length]
      }`}
      aria-hidden
    >
      {name.replace(/^Bot /, '').charAt(0).toUpperCase() || '?'}
      {isBot && (
        <span className="absolute -bottom-1 -right-1 rounded-full bg-night p-0.5 ring-1 ring-white/20">
          <Bot size={size === 'sm' ? 10 : 12} className="text-mist" />
        </span>
      )}
    </span>
  );
}
