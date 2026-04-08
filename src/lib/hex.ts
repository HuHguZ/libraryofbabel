const DIGS = "0123456789abcdefghijklmnopqrstuvwxyz";

export function generateRandomHex(length: number): string {
  let hex = "";
  for (let i = 0; i < length; i++) {
    hex += DIGS[Math.floor(Math.random() * DIGS.length)];
  }
  return hex;
}
