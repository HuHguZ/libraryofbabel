export const FOG_BITS = 1024;
const BYTES = FOG_BITS / 8;
export const emptyFog = (): Uint8Array => new Uint8Array(BYTES);
const validBit = (bit: number) => Number.isInteger(bit) && bit >= 0 && bit < FOG_BITS;
export const hasBit = (bits: Uint8Array, bit: number): boolean => validBit(bit) && (bits[bit >> 3] & (1 << (bit & 7))) !== 0;
export function setBit(bits: Uint8Array, bit: number): void { if (validBit(bit)) bits[bit >> 3] |= 1 << (bit & 7); }
export function fogToBase64(bits: Uint8Array): string { return btoa(String.fromCharCode(...bits)); }
export function fogFromBase64(value: string): Uint8Array {
  const bits = emptyFog();
  try {
    const raw = atob(value);
    for (let i = 0; i < Math.min(raw.length, BYTES); i++) bits[i] = raw.charCodeAt(i);
  } catch { /* Broken transport data stays unexplored. */ }
  return bits;
}
/** Postgres bit strings start at bit zero, while each uint8 stores it in its low bit. */
export function fogToBitString(bits: Uint8Array): string { return Array.from({ length: FOG_BITS }, (_, i) => hasBit(bits, i) ? "1" : "0").join(""); }
export function fogFromBitString(value: string): Uint8Array {
  const bits = emptyFog();
  for (let i = 0; i < Math.min(value.length, FOG_BITS); i++) if (value[i] === "1") setBit(bits, i);
  return bits;
}
