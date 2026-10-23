import { emptyFog, hasBit, setBit } from "@/lib/online/fog";
import { cellBit, chunkKeyOf, type Cell } from "@/lib/world";
type Pending = { lang: string; chunk: string; bits: Uint8Array };
export class FogBook {
  private readonly seen = new Map<string, Uint8Array>();
  private readonly pending = new Map<string, Pending>();
  mark(lang: string, cell: Cell): { key: string; bit: number } | null {
    const key = chunkKeyOf(cell), bit = cellBit(cell), id = `${lang} ${key}`;
    let seen = this.seen.get(id);
    if (!seen) this.seen.set(id, seen = emptyFog());
    if (hasBit(seen, bit)) return null;
    setBit(seen, bit);
    let pending = this.pending.get(id);
    if (!pending) this.pending.set(id, pending = { lang, chunk: key, bits: emptyFog() });
    setBit(pending.bits, bit);
    return { key, bit };
  }
  mergeSeen(lang: string, chunk: string, bits: Uint8Array): Uint8Array {
    const out = bits.slice(), seen = this.seen.get(`${lang} ${chunk}`);
    if (seen) for (let i = 0; i < out.length; i++) out[i] |= seen[i];
    return out;
  }
  takePending(): Pending[] { const out = [...this.pending.values()]; this.pending.clear(); return out; }
  async flush(save: (lang: string, chunk: string, bits: Uint8Array) => Promise<void>): Promise<void> {
    let error: unknown;
    for (const entry of this.takePending()) {
      try { await save(entry.lang, entry.chunk, entry.bits); }
      catch (failure) {
        const id = `${entry.lang} ${entry.chunk}`, newer = this.pending.get(id);
        if (newer) for (let i = 0; i < entry.bits.length; i++) entry.bits[i] |= newer.bits[i];
        this.pending.set(id, entry); error = failure;
      }
    }
    if (error) throw error;
  }
}
