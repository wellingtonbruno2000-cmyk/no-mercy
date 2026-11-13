import { WifiOff } from 'lucide-react';
import { useEffect } from 'react';
import { useStore } from './lib/store';
import { useAudioSettings } from './lib/audio';
import { useGameSounds } from './lib/useGameSounds';
import { applyVoiceOutput, syncVoiceWithRoom } from './lib/voice';
import { Game } from './components/Game';
import { Home } from './components/Home';
import { Lobby } from './components/Lobby';
import { Toasts } from './components/Toasts';

export default function App() {
  const { room, connected } = useStore();
  const audio = useAudioSettings();
  useGameSounds(room);
  useEffect(() => syncVoiceWithRoom(room), [room]);
  useEffect(() => applyVoiceOutput(), [audio]);
  return (
    <>
      {!room ? <Home /> : room.status === 'LOBBY' ? <Lobby room={room} /> : <Game room={room} />}
      {room && !connected && (
        <div className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-rose-600 py-1.5 text-sm font-bold text-white">
          <WifiOff size={16} /> Conexão perdida — reconectando…
        </div>
      )}
      <Toasts />
    </>
  );
}
