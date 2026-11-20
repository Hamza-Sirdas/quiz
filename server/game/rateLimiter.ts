import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  timestamps: number[];
}

export class SlidingWindowLimiter {
  private readonly buckets = new Map<string, Bucket>();

  check(key: string, windowMs: number, max: number): boolean {
    const now = Date.now();
    const cutoff = now - windowMs;
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { timestamps: [] };
      this.buckets.set(key, bucket);
    }

    bucket.timestamps = bucket.timestamps.filter((ts) => ts > cutoff);

    if (bucket.timestamps.length >= max) {
      return false;
    }

    bucket.timestamps.push(now);

    if (this.buckets.size > 5000) {
      this.prune(cutoff);
    }

    return true;
  }

  private prune(cutoff: number): void {
    for (const [key, bucket] of this.buckets.entries()) {
      const active = bucket.timestamps.filter((ts) => ts > cutoff);
      if (active.length === 0) {
        this.buckets.delete(key);
      } else {
        bucket.timestamps = active;
      }
    }
  }
}

export function createHttpRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
}) {
  const limiter = new SlidingWindowLimiter();

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    if (!limiter.check(ip, options.windowMs, options.max)) {
      res.status(429).json({ message: options.message });
      return;
    }
    next();
  };
}
