import {
  advance,
  createGame,
  currentActorId,
  decideBid,
  decidePlay,
  GameError,
  getPlayerView,
  MAX_PLAYERS,
  MIN_PLAYERS,
  placeBid,
  playCard,
  TURN_SECONDS_OPTIONS,
  type GameState,
  type JokerMode,
  type RandomInt,
  type RoomPlayer,
  type RoomSettings,
  type RoomStatus,
  type RoomView,
} from '@nomercy/shared';

export interface Timings {
  botDelayMin: number;
  botDelayMax: number;
  roundResultMs: number;
  blindResultMs: number;
  handResultMs: number;
  /** Pausa no início de cada partida para a animação de embaralhar/cortar/distribuir. */
  dealMs: number;
  /** Tempo de espera antes de jogar automaticamente por um humano desconectado. */
  disconnectGraceMs: number;
  /** Tempo sem humanos conectados até a sala ser removida. */
  emptyRoomTtlMs: number;
}

export const DEFAULT_TIMINGS: Timings = {
  botDelayMin: 800,
  botDelayMax: 1600,
  roundResultMs: 2300,
  blindResultMs: 4200,
  handResultMs: 7000,
  dealMs: 1900,
  disconnectGraceMs: 15000,
  emptyRoomTtlMs: 10 * 60 * 1000,
};

export interface Room {
  code: string;
  hostId: string;
  members: RoomPlayer[];
  settings: RoomSettings;
  status: RoomStatus;
  game: GameState | null;
  timer: ReturnType<typeof setTimeout> | null;
  deadline: number | null;
  emptySince: number | null;
  botCounter: number;
}

export interface SavedRoom {
  v: 1;
  savedAt: number;
  code: string;
  hostId: string;
  members: RoomPlayer[];
  settings: RoomSettings;
  status: RoomStatus;
  game: GameState | null;
  botCounter: number;
}

export interface RoomHooks {
  onChange(room: Room): void;
  onClosed(room: Room, playerIds: string[], reason: string): void;
}

const BOT_NAMES = [
  'Faísca', 'Trovão', 'Navalha', 'Cometa', 'Pimenta', 'Ciclone', 'Raposa', 'Coruja',
  'Vulcão', 'Granito', 'Zefir', 'Neon', 'Turbina', 'Sombra',
];

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export class RoomError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomError';
  }
}

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Jogador';
  const clean = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return clean || 'Jogador';
}

export class RoomManager {
  readonly rooms = new Map<string, Room>();
  /** playerId -> código da sala */
  readonly playerRoom = new Map<string, string>();
  private sweeper: ReturnType<typeof setInterval>;

  constructor(
    private hooks: RoomHooks,
    private randomInt: RandomInt,
    private timings: Timings = DEFAULT_TIMINGS,
  ) {
    this.sweeper = setInterval(() => this.sweep(), 30_000);
    this.sweeper.unref?.();
  }

  dispose() {
    clearInterval(this.sweeper);
    for (const room of this.rooms.values()) this.clearTimer(room);
    this.rooms.clear();
  }

  roomOf(playerId: string): Room | undefined {
    const code = this.playerRoom.get(playerId);
    return code ? this.rooms.get(code) : undefined;
  }

  private requireRoom(playerId: string): Room {
    const room = this.roomOf(playerId);
    if (!room) throw new RoomError('Você não está em uma sala.');
    return room;
  }

  private requireHost(playerId: string): Room {
    const room = this.requireRoom(playerId);
    if (room.hostId !== playerId) throw new RoomError('Somente o anfitrião pode fazer isso.');
    return room;
  }

  private newCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < 5; i++) code += CODE_ALPHABET[this.randomInt(CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  /** Cria uma sala. Se `preferredCode` estiver livre (ex.: sala perdida num reinício), reutiliza o mesmo código. */
  create(playerId: string, name: string, preferredCode?: string): Room {
    if (this.roomOf(playerId)) this.leave(playerId);
    const wanted = String(preferredCode ?? '').trim().toUpperCase();
    const reuse = /^[A-Z2-9]{5}$/.test(wanted) && !this.rooms.has(wanted);
    const room: Room = {
      code: reuse ? wanted : this.newCode(),
      hostId: playerId,
      members: [{ id: playerId, name: sanitizeName(name), isBot: false, connected: true, autopilot: false, voice: false, micOn: false }],
      settings: { turnSeconds: 0 },
      status: 'LOBBY',
      game: null,
      timer: null,
      deadline: null,
      emptySince: null,
      botCounter: 0,
    };
    this.rooms.set(room.code, room);
    this.playerRoom.set(playerId, room.code);
    this.hooks.onChange(room);
    return room;
  }

  join(rawCode: string, playerId: string, name: string): Room {
    const code = String(rawCode ?? '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new RoomError('Sala não encontrada. Confira o código.');
    const existing = room.members.find((m) => m.id === playerId);
    if (existing && !existing.autopilot) {
      existing.connected = true;
      if (room.status === 'LOBBY') existing.name = sanitizeName(name);
      this.playerRoom.set(playerId, code);
      room.emptySince = null;
      this.hooks.onChange(room);
      this.schedule(room);
      return room;
    }
    if (room.status !== 'LOBBY') throw new RoomError('Esta partida já começou.');
    if (room.members.length >= MAX_PLAYERS) throw new RoomError('A sala está cheia (máximo de 8 jogadores).');
    const current = this.roomOf(playerId);
    if (current && current !== room) this.leave(playerId);
    room.members.push({ id: playerId, name: sanitizeName(name), isBot: false, connected: true, autopilot: false, voice: false, micOn: false });
    this.playerRoom.set(playerId, code);
    room.emptySince = null;
    this.hooks.onChange(room);
    return room;
  }

  leave(playerId: string) {
    const room = this.roomOf(playerId);
    if (!room) return;
    this.playerRoom.delete(playerId);
    const member = room.members.find((m) => m.id === playerId);
    if (!member) return;
    member.voice = false;
    member.micOn = false;
    if (room.status === 'PLAYING') {
      member.connected = false;
      member.autopilot = true;
      member.name = member.name.endsWith(' (auto)') ? member.name : `${member.name} (auto)`;
      if (room.game) {
        const gp = room.game.players.find((p) => p.id === playerId);
        if (gp) gp.name = member.name;
      }
    } else {
      room.members = room.members.filter((m) => m.id !== playerId);
    }
    const activeHumans = room.members.filter((m) => !m.isBot && !m.autopilot);
    if (activeHumans.length === 0) {
      this.close(room, 'Todos os jogadores humanos saíram.');
      return;
    }
    if (room.hostId === playerId) {
      room.hostId = (activeHumans.find((m) => m.connected) ?? activeHumans[0]).id;
    }
    this.hooks.onChange(room);
    this.schedule(room);
  }

  private close(room: Room, reason: string) {
    this.clearTimer(room);
    this.rooms.delete(room.code);
    const ids = room.members.filter((m) => !m.isBot).map((m) => m.id);
    for (const id of ids) if (this.playerRoom.get(id) === room.code) this.playerRoom.delete(id);
    this.hooks.onClosed(room, ids, reason);
  }

  setConnected(playerId: string, connected: boolean) {
    const room = this.roomOf(playerId);
    if (!room) return;
    const member = room.members.find((m) => m.id === playerId);
    if (!member) return;
    member.connected = connected;
    if (!connected) {
      member.voice = false;
      member.micOn = false;
    }
    if (connected) room.emptySince = null;
    else if (!room.members.some((m) => !m.isBot && m.connected)) room.emptySince = Date.now();
    if (!connected && room.status === 'LOBBY' && room.hostId === playerId) {
      const other = room.members.find((m) => !m.isBot && m.connected);
      if (other) room.hostId = other.id;
    }
    this.hooks.onChange(room);
    this.schedule(room);
  }

  addBot(playerId: string) {
    const room = this.requireHost(playerId);
    this.addBotTo(room);
    this.hooks.onChange(room);
  }

  private addBotTo(room: Room) {
    if (room.status !== 'LOBBY') throw new RoomError('Só é possível adicionar bots antes da partida.');
    if (room.members.length >= MAX_PLAYERS) throw new RoomError('A sala está cheia.');
    const used = new Set(room.members.map((m) => m.name));
    const available = BOT_NAMES.filter((n) => !used.has(`Bot ${n}`));
    const base = available.length ? available[this.randomInt(available.length)] : `${room.botCounter + 1}`;
    room.botCounter += 1;
    room.members.push({
      id: `bot-${room.code}-${room.botCounter}`,
      name: `Bot ${base}`,
      isBot: true,
      connected: true,
      autopilot: false,
      voice: false,
      micOn: false,
    });
  }

  /** Completa a mesa com bots (padrão: até 4 jogadores). */
  fillBots(playerId: string, target = 4) {
    const room = this.requireHost(playerId);
    const goal = Math.min(MAX_PLAYERS, Math.max(target, MIN_PLAYERS));
    while (room.members.length < goal) this.addBotTo(room);
    this.hooks.onChange(room);
  }

  removePlayer(hostId: string, targetId: string) {
    const room = this.requireHost(hostId);
    if (room.status !== 'LOBBY') throw new RoomError('Só é possível remover jogadores antes da partida.');
    if (targetId === hostId) throw new RoomError('Use "Sair" para deixar a sala.');
    const target = room.members.find((m) => m.id === targetId);
    if (!target) throw new RoomError('Jogador não encontrado.');
    room.members = room.members.filter((m) => m.id !== targetId);
    if (!target.isBot) {
      this.playerRoom.delete(targetId);
      this.hooks.onClosed(room, [targetId], 'Você foi removido da sala pelo anfitrião.');
    }
    this.hooks.onChange(room);
  }

  /** Entra no chat de voz; retorna os jogadores que já estão nele (o novo participante inicia as conexões). */
  voiceJoin(playerId: string, micOn: boolean): string[] {
    const room = this.requireRoom(playerId);
    const me = room.members.find((m) => m.id === playerId);
    if (!me || me.isBot) throw new RoomError('Jogador não encontrado.');
    me.voice = true;
    me.micOn = !!micOn;
    this.hooks.onChange(room);
    return room.members.filter((m) => m.voice && m.id !== playerId && !m.isBot && m.connected).map((m) => m.id);
  }

  voiceLeave(playerId: string) {
    const room = this.roomOf(playerId);
    const me = room?.members.find((m) => m.id === playerId);
    if (!room || !me) return;
    me.voice = false;
    me.micOn = false;
    this.hooks.onChange(room);
  }

  voiceMic(playerId: string, micOn: boolean) {
    const room = this.requireRoom(playerId);
    const me = room.members.find((m) => m.id === playerId);
    if (!me?.voice) throw new RoomError('Você não está no chat de voz.');
    me.micOn = !!micOn;
    this.hooks.onChange(room);
  }

  /** Jogadores humanos (conectados) da mesma sala, exceto o próprio — destino do movimento do mouse. */
  lookTargets(playerId: string): string[] {
    const room = this.roomOf(playerId);
    if (!room || room.status === 'LOBBY') return [];
    return room.members.filter((m) => !m.isBot && m.connected && m.id !== playerId && this.playerRoom.get(m.id) === room.code).map((m) => m.id);
  }

  /** Só permite sinalização entre dois membros da mesma sala que estão no chat de voz. */
  canSignal(from: string, to: string): boolean {
    const room = this.roomOf(from);
    if (!room || this.playerRoom.get(to) !== room.code || from === to) return false;
    const a = room.members.find((m) => m.id === from);
    const b = room.members.find((m) => m.id === to);
    return !!a?.voice && !!b?.voice && !b.isBot;
  }

  updateSettings(playerId: string, patch: Partial<RoomSettings>) {
    const room = this.requireHost(playerId);
    if (room.status !== 'LOBBY') throw new RoomError('As configurações só podem mudar antes da partida.');
    if (patch.turnSeconds !== undefined) {
      if (!(TURN_SECONDS_OPTIONS as readonly number[]).includes(patch.turnSeconds)) {
        throw new RoomError('Tempo por jogada inválido.');
      }
      room.settings.turnSeconds = patch.turnSeconds;
    }
    this.hooks.onChange(room);
  }

  rename(playerId: string, name: string) {
    const room = this.requireRoom(playerId);
    if (room.status !== 'LOBBY') throw new RoomError('O nome só pode mudar antes da partida.');
    const m = room.members.find((x) => x.id === playerId);
    if (m) m.name = sanitizeName(name);
    this.hooks.onChange(room);
  }

  start(playerId: string) {
    const room = this.requireHost(playerId);
    if (room.status !== 'LOBBY') throw new RoomError('A partida já começou.');
    if (room.members.length < MIN_PLAYERS) {
      throw new RoomError(`São necessários pelo menos ${MIN_PLAYERS} jogadores. Complete com bots.`);
    }
    room.game = createGame(
      room.members.map((m) => ({ id: m.id, name: m.name, isBot: m.isBot })),
      { randomInt: this.randomInt },
    );
    room.status = 'PLAYING';
    this.hooks.onChange(room);
    this.schedule(room);
  }

  rematch(playerId: string) {
    const room = this.requireHost(playerId);
    if (room.status !== 'FINISHED') throw new RoomError('O jogo ainda não terminou.');
    room.members = room.members.filter((m) => !m.autopilot && (m.isBot || this.playerRoom.get(m.id) === room.code));
    room.status = 'LOBBY';
    room.game = null;
    room.deadline = null;
    this.clearTimer(room);
    this.hooks.onChange(room);
  }

  bid(playerId: string, value: number) {
    const room = this.requireRoom(playerId);
    if (!room.game) throw new RoomError('Nenhuma partida em andamento.');
    if (typeof value !== 'number') throw new RoomError('Palpite inválido.');
    room.game = placeBid(room.game, playerId, value);
    this.afterAction(room);
  }

  play(playerId: string, cardId: string, jokerMode: JokerMode | null) {
    const room = this.requireRoom(playerId);
    if (!room.game) throw new RoomError('Nenhuma partida em andamento.');
    if (typeof cardId !== 'string') throw new RoomError('Carta inválida.');
    room.game = playCard(room.game, playerId, cardId, jokerMode ?? null);
    this.afterAction(room);
  }

  private afterAction(room: Room) {
    if (room.game?.phase === 'GAME_OVER') room.status = 'FINISHED';
    this.schedule(room);
    this.hooks.onChange(room);
  }

  private clearTimer(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    room.deadline = null;
  }

  private setTimer(room: Room, ms: number, fn: () => void, showDeadline: boolean) {
    room.deadline = showDeadline ? Date.now() + ms : null;
    room.timer = setTimeout(() => {
      room.timer = null;
      room.deadline = null;
      if (!this.rooms.has(room.code)) return;
      try {
        fn();
      } catch (err) {
        console.error(`[room ${room.code}] erro em ação automática`, err);
      }
      this.afterAction(room);
    }, ms);
    room.timer.unref?.();
  }

  /** Agenda a próxima ação automática (bots, transições, tempo esgotado, desconexão). */
  schedule(room: Room) {
    this.clearTimer(room);
    const game = room.game;
    if (!game || room.status !== 'PLAYING') return;
    const t = this.timings;
    if (game.phase === 'ROUND_RESULT') {
      const ms = game.blind ? t.blindResultMs : game.roundNumber < game.cardsPerPlayer ? t.roundResultMs : t.roundResultMs + 400;
      this.setTimer(room, ms, () => { room.game = advance(room.game!, this.randomInt); }, false);
      return;
    }
    if (game.phase === 'HAND_RESULT') {
      this.setTimer(room, t.handResultMs, () => { room.game = advance(room.game!, this.randomInt); }, true);
      return;
    }
    const actorId = currentActorId(game);
    if (!actorId) return;
    const member = room.members.find((m) => m.id === actorId);
    const act = () => this.autoAct(room, actorId);
    const dealing = game.phase === 'BIDDING' && Object.keys(game.bids).length === 0 ? t.dealMs : 0;
    if (!member || member.isBot || member.autopilot) {
      const delay = dealing + t.botDelayMin + Math.floor(Math.random() * Math.max(1, t.botDelayMax - t.botDelayMin));
      this.setTimer(room, delay, act, false);
    } else if (!member.connected) {
      const ms = room.settings.turnSeconds > 0
        ? Math.min(t.disconnectGraceMs, room.settings.turnSeconds * 1000)
        : t.disconnectGraceMs;
      this.setTimer(room, ms, act, true);
    } else if (room.settings.turnSeconds > 0) {
      this.setTimer(room, room.settings.turnSeconds * 1000, act, true);
    }
  }

  /** Executa a jogada do bot (ou de um humano ausente) com a IA, usando somente a visão desse jogador. */
  private autoAct(room: Room, actorId: string) {
    const game = room.game!;
    if (currentActorId(game) !== actorId) return;
    const view = getPlayerView(game, actorId);
    if (game.phase === 'BIDDING') {
      let value: number;
      try {
        value = decideBid(view);
      } catch {
        value = view.allowedBids![0];
      }
      try {
        room.game = placeBid(game, actorId, value);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        room.game = placeBid(game, actorId, view.allowedBids![0]);
      }
    } else if (game.phase === 'PLAYING') {
      try {
        const d = decidePlay(view);
        room.game = playCard(game, actorId, d.cardId, d.jokerMode);
      } catch (e) {
        if (!(e instanceof GameError) && !(e instanceof Error)) throw e;
        const card = game.hands[actorId][0];
        room.game = playCard(game, actorId, card.id, card.value === 'JOKER' ? 'MAX' : null);
      }
    }
  }

  /** Dados da sala para a cópia de segurança (sem temporizadores). */
  exportRoom(room: Room): SavedRoom {
    return {
      v: 1,
      savedAt: Date.now(),
      code: room.code,
      hostId: room.hostId,
      members: room.members.map((m) => ({ ...m })),
      settings: { ...room.settings },
      status: room.status,
      game: room.game,
      botCounter: room.botCounter,
    };
  }

  /**
   * Recria uma sala a partir da cópia de segurança devolvida por um jogador (após o servidor reiniciar).
   * Retorna a sala (nova ou já existente) se o jogador fizer parte dela.
   */
  restoreRoom(saved: SavedRoom, playerId: string): Room | null {
    if (!saved || saved.v !== 1 || !saved.game || saved.status !== 'PLAYING') return null;
    if (Date.now() - saved.savedAt > 48 * 60 * 60 * 1000) return null; // cópias com mais de 48 h expiram
    const member = saved.members.find((m) => m.id === playerId && !m.isBot);
    if (!member || member.autopilot) return null;
    const existing = this.rooms.get(saved.code);
    if (existing) {
      // Outro jogador já restaurou: só reconecta este.
      if (!existing.members.some((m) => m.id === playerId)) return null;
      this.playerRoom.set(playerId, existing.code);
      this.setConnected(playerId, true);
      return existing;
    }
    if (this.roomOf(playerId)) return null;
    const room: Room = {
      code: saved.code,
      hostId: saved.hostId,
      members: saved.members.map((m) => ({
        ...m,
        connected: m.isBot || m.id === playerId,
        voice: false,
        micOn: false,
      })),
      settings: { ...saved.settings },
      status: 'PLAYING',
      game: saved.game,
      timer: null,
      deadline: null,
      emptySince: null,
      botCounter: saved.botCounter,
    };
    this.rooms.set(room.code, room);
    for (const m of room.members) if (!m.isBot && !m.autopilot) this.playerRoom.set(m.id, room.code);
    this.hooks.onChange(room);
    this.schedule(room);
    return room;
  }

  viewFor(room: Room, playerId: string): RoomView {
    return {
      code: room.code,
      hostId: room.hostId,
      you: playerId,
      players: room.members.map((m) => ({ ...m })),
      settings: { ...room.settings },
      status: room.status,
      game: room.game ? getPlayerView(room.game, playerId) : null,
      deadline: room.deadline,
      serverTime: Date.now(),
    };
  }

  private sweep() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      if (room.emptySince && now - room.emptySince > this.timings.emptyRoomTtlMs) {
        this.close(room, 'Sala encerrada por inatividade.');
      }
    }
  }
}
