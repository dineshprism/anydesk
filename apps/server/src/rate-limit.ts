type HitBucket = {
  count: number;
  resetAt: number;
};

export class SlidingWindowLimiter {
  private readonly buckets = new Map<string, HitBucket>();

  constructor(
    private readonly maxHits: number,
    private readonly windowMs: number
  ) {}

  hit(key: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt < now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    bucket.count += 1;
    return bucket.count <= this.maxHits;
  }

  sweep(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt < now) {
        this.buckets.delete(key);
      }
    }
  }
}
