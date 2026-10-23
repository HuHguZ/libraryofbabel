import type { Player, Pose, ServerMessage } from "@/lib/online/protocol";
export class World {
  readonly players = new Map<string, Player>();
  private readonly tabs = new Map<string, number>();
  private readonly moved = new Set<string>();
  join(player: Player): boolean {
    const tabs = this.tabs.get(player.id) ?? 0;
    this.tabs.set(player.id, tabs + 1);
    this.players.set(player.id, { ...player });
    this.moved.add(player.id);
    return tabs === 0;
  }
  leave(id: string): boolean {
    const tabs = (this.tabs.get(id) ?? 0) - 1;
    if (tabs > 0) { this.tabs.set(id, tabs); return false; }
    this.tabs.delete(id); this.moved.delete(id);
    return this.players.delete(id);
  }
  move(id: string, pose: Pose): void { const player = this.players.get(id); if (player) { Object.assign(player, pose); this.moved.add(id); } }
  rename(id: string, nick: string, color: string): void { const player = this.players.get(id); if (player) Object.assign(player, { nick, color }); }
  takeMoves(): ServerMessage | null {
    const list = [...this.moved].flatMap(id => { const player = this.players.get(id); return player ? [{ id, cell: player.cell, p: player.p, yaw: player.yaw, view: player.view }] : []; });
    this.moved.clear();
    return list.length ? { type: "poses", list } : null;
  }
  roster(): ServerMessage { return { type: "players", list: [...this.players.values()] }; }
}
