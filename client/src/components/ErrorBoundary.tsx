import { Component, type ReactNode } from 'react';

/** Evita tela em branco: se algo der errado na interface, oferece recarregar. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error('[NO MERCY] erro na interface', error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-display text-3xl text-gold">Ops!</p>
        <p className="max-w-sm text-mist/80">Algo deu errado ao mostrar o jogo. Recarregue a página — se você estava numa sala, volta para ela automaticamente.</p>
        <button className="btn-gold" onClick={() => window.location.reload()}>
          Recarregar
        </button>
      </div>
    );
  }
}
