import { createHash } from "node:crypto";

export interface EncoderCacheEntry {
  hash: string;
  createdAt: Date;
  tensorBytes?: Buffer;
}

export class VisionEncoderCache {
  private readonly entries = new Map<string, EncoderCacheEntry>();

  get(imageBytes: Buffer): EncoderCacheEntry | undefined {
    return this.entries.get(this.hash(imageBytes));
  }

  set(imageBytes: Buffer, tensorBytes?: Buffer): EncoderCacheEntry {
    const hash = this.hash(imageBytes);
    const entry: EncoderCacheEntry = {
      hash,
      createdAt: new Date(),
      ...(tensorBytes === undefined ? {} : { tensorBytes }),
    };
    this.entries.set(hash, entry);
    return entry;
  }

  clear(): void {
    this.entries.clear();
  }

  private hash(imageBytes: Buffer): string {
    return createHash("sha256").update(imageBytes).digest("hex");
  }
}
