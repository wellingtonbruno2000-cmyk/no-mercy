import { useEffect, useState } from 'react';
import { serverNow } from './store';

export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const h = () => setMatch(m.matches);
    m.addEventListener('change', h);
    h();
    return () => m.removeEventListener('change', h);
  }, [query]);
  return match;
}

export function useWindowWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return w;
}

/** Segundos restantes até um prazo do servidor (atualiza a cada 250ms). */
export function useCountdown(deadline: number | null): { seconds: number; fraction: number } | null {
  const [now, setNow] = useState(serverNow());
  const [start, setStart] = useState<number | null>(null);
  useEffect(() => {
    if (!deadline) return;
    setStart(serverNow());
    const t = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline || start === null) return null;
  const left = Math.max(0, deadline - now);
  const total = Math.max(1, deadline - start);
  return { seconds: Math.ceil(left / 1000), fraction: Math.min(1, left / total) };
}
