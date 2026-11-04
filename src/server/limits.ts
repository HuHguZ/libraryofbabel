export class Bucket {
  private tokens: number;
  private at: number;
  constructor(private readonly perSecond: number, private readonly burst: number, private readonly now: () => number = Date.now) { this.tokens = burst; this.at = now(); }
  take(): boolean {
    const t = Math.max(this.at, this.now());
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.at) / 1000) * this.perSecond);
    this.at = t;
    if (this.tokens < 1) return false;
    this.tokens--;
    return true;
  }
}
const RATES = { pose: [12, 12], profile: [0.2, 1], watch: [4, 8], chat: [0.5, 5], note: [10 / 3600, 3], mark: [1, 10], paint: [10, 10], mod: [1, 5] } as const;
/** Buckets belong to identities and IPs, so opening another tab does not reset them. */
export class RateLimits {
  private readonly buckets = new Map<string, { bucket: Bucket; at: number }>();
  constructor(private readonly now: () => number = Date.now) {}
  take(kind: keyof typeof RATES, guest: string, ip: string): boolean {
    let accepted = true;
    for (const key of [`g:${guest}:${kind}`, `ip:${ip}:${kind}`]) {
      let entry = this.buckets.get(key);
      if (!entry) {
        const [rate, burst] = RATES[kind];
        this.buckets.set(key, entry = { bucket: new Bucket(rate, burst, this.now), at: this.now() });
      }
      entry.at = this.now();
      if (!entry.bucket.take()) accepted = false;
    }
    return accepted;
  }
  prune(): void {
    // The slowest bucket refills in 18 minutes; idle identities need no longer retention.
    for (const [key, entry] of this.buckets) if (this.now() - entry.at > 3600_000) this.buckets.delete(key);
  }
}
