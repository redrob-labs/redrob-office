/**
 * Minimal GGUF KV reader for projector ↔ LM embedding checks.
 * Reads a header prefix into memory (metadata lives before tensor payloads).
 */
import { openSync, readSync, closeSync, statSync } from "node:fs";

const TYPE_SIZE: Record<number, number> = {
  0: 1,
  1: 1,
  2: 2,
  3: 2,
  4: 4,
  5: 4,
  6: 4,
  7: 1,
  10: 8,
  11: 8,
  12: 8,
};

/** Metadata is small; 64 MiB covers Qwen3.5 LM + mmproj headers. */
const HEADER_BYTES = 64 * 1024 * 1024;

function readHeaderPrefix(path: string): Buffer {
  const size = statSync(path).size;
  const n = Math.min(size, HEADER_BYTES);
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.allocUnsafe(n);
    const got = readSync(fd, buf, 0, n, 0);
    return got === n ? buf : buf.subarray(0, got);
  } finally {
    closeSync(fd);
  }
}

class Cursor {
  constructor(
    readonly buf: Buffer,
    public at = 0,
  ) {}

  need(n: number): void {
    if (this.at + n > this.buf.length) {
      throw new Error(`GGUF header truncated at ${this.at}+${n} (increase HEADER_BYTES)`);
    }
  }

  u32(): number {
    this.need(4);
    const v = this.buf.readUInt32LE(this.at);
    this.at += 4;
    return v;
  }

  u64(): bigint {
    this.need(8);
    const v = this.buf.readBigUInt64LE(this.at);
    this.at += 8;
    return v;
  }

  bytes(n: number): Buffer {
    this.need(n);
    const slice = this.buf.subarray(this.at, this.at + n);
    this.at += n;
    return slice;
  }

  str(): string {
    const n = Number(this.u64());
    if (!Number.isFinite(n) || n < 0 || n > 16_000_000) {
      throw new Error(`GGUF invalid string length ${n}`);
    }
    return this.bytes(n).toString("utf8");
  }

  skip(type: number): void {
    const fixed = TYPE_SIZE[type];
    if (fixed !== undefined) {
      this.need(fixed);
      this.at += fixed;
      return;
    }
    if (type === 8) {
      this.str();
      return;
    }
    if (type === 9) {
      const arrayType = this.u32();
      const n = Number(this.u64());
      for (let i = 0; i < n; i += 1) this.skip(arrayType);
      return;
    }
    throw new Error(`GGUF unsupported type ${type}`);
  }

  scalar(type: number): string | number | boolean | null {
    if (type === 4) return this.u32();
    if (type === 5) {
      this.need(4);
      const v = this.buf.readInt32LE(this.at);
      this.at += 4;
      return v;
    }
    if (type === 10) return Number(this.u64());
    if (type === 11) {
      this.need(8);
      const v = Number(this.buf.readBigInt64LE(this.at));
      this.at += 8;
      return v;
    }
    if (type === 6) {
      this.need(4);
      const v = this.buf.readFloatLE(this.at);
      this.at += 4;
      return v;
    }
    if (type === 7) {
      this.need(1);
      const v = this.buf[this.at] !== 0;
      this.at += 1;
      return v;
    }
    if (type === 8) return this.str();
    this.skip(type);
    return null;
  }
}

export type GgufMatchMeta = {
  architecture: string | null;
  /** LM embedding width (n_embd). */
  embeddingLength: number | null;
  /** mmproj clip.vision.projection_dim. */
  projectionDim: number | null;
};

/**
 * Read only the KV keys needed for LM↔mmproj pairing.
 */
export async function readGgufMatchMeta(path: string): Promise<GgufMatchMeta> {
  const cur = new Cursor(readHeaderPrefix(path));
  if (cur.bytes(4).toString("utf8") !== "GGUF") {
    throw new Error(`not a GGUF file: ${path}`);
  }
  cur.u32(); // version
  cur.u64(); // n_tensors
  const nKv = Number(cur.u64());
  let architecture: string | null = null;
  let embeddingLength: number | null = null;
  let projectionDim: number | null = null;

  for (let i = 0; i < nKv; i += 1) {
    const key = cur.str();
    const type = cur.u32();
    const want =
      key === "general.architecture" ||
      key.endsWith(".embedding_length") ||
      key === "clip.vision.projection_dim";
    if (!want) {
      cur.skip(type);
      continue;
    }
    const value = cur.scalar(type);
    if (key === "general.architecture" && typeof value === "string") {
      architecture = value;
    } else if (key === "clip.vision.projection_dim" && typeof value === "number") {
      projectionDim = value;
    } else if (key.endsWith(".embedding_length") && typeof value === "number" && !key.startsWith("clip.")) {
      embeddingLength = value;
    }
  }

  return { architecture, embeddingLength, projectionDim };
}

/**
 * Fail fast when mmproj projection_dim ≠ LM n_embd.
 */
export async function assertLmMmprojCompatible(lmPath: string, mmprojPath: string): Promise<void> {
  const lm = await readGgufMatchMeta(lmPath);
  const mm = await readGgufMatchMeta(mmprojPath);
  if (lm.embeddingLength == null) {
    throw new Error(`ERR_MMPROJ_MISMATCH: LM missing embedding_length (${lmPath})`);
  }
  if (mm.projectionDim == null) {
    throw new Error(`ERR_MMPROJ_MISMATCH: mmproj missing clip.vision.projection_dim (${mmprojPath})`);
  }
  if (lm.embeddingLength !== mm.projectionDim) {
    throw new Error(
      `ERR_MMPROJ_MISMATCH: LM n_embd=${lm.embeddingLength} ≠ mmproj projection_dim=${mm.projectionDim} (lm=${lmPath}; mmproj=${mmprojPath})`,
    );
  }
}
