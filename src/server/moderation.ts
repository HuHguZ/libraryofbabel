export const canForget = (author: string | null, guest: string, admin: boolean): boolean => author !== null && (admin || author === guest);
export class Bans {
  private readonly guests: Set<string>;
  private readonly ips: Set<string>;
  constructor(initial: { guests: string[]; ips: string[] } = { guests: [], ips: [] }) { this.guests = new Set(initial.guests); this.ips = new Set(initial.ips.filter(Boolean)); }
  add(guest: string, ip: string | null): void { this.guests.add(guest); if (ip) this.ips.add(ip); }
  has(guest: string, ip: string): boolean { return this.guests.has(guest) || (ip !== "" && this.ips.has(ip)); }
}
