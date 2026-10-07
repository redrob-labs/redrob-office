import { CreateBucketCommand, DeleteObjectsCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { SyncConfig } from './config.ts'

/** Where file bytes live: any S3 store (SeaweedFS locally) for real, memory for tests. */
export interface BlobStore {
  put(key: string, bytes: Uint8Array): Promise<void>
  get(key: string): Promise<Uint8Array | null>
  /** removes the objects; a key that is already gone is not an error */
  delete(keys: readonly string[]): Promise<void>
  /** throws when the store or its bucket cannot be reached (readiness) */
  ping(): Promise<void>
}

export class MemoryBlobs implements BlobStore {
  private m = new Map<string, Uint8Array>()
  async put(key: string, bytes: Uint8Array) {
    this.m.set(key, bytes)
  }
  async get(key: string) {
    return this.m.get(key) ?? null
  }
  async delete(keys: readonly string[]) {
    for (const k of keys) this.m.delete(k)
  }
  async ping() {}
  /** for tests */
  keys(): string[] {
    return [...this.m.keys()]
  }
}

export class S3Blobs implements BlobStore {
  private readonly client: S3Client
  private readonly cfg: SyncConfig['s3']
  constructor(cfg: SyncConfig['s3']) {
    this.cfg = cfg
    this.client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    })
  }
  /** Creates the bucket when it is missing; the store may still be starting, so it retries for a while. */
  async ensureBucket(attempts = 30): Promise<void> {
    for (let i = 1; ; i++) {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.cfg.bucket }))
        return
      } catch (err) {
        const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        if (status === 404) {
          await this.client.send(new CreateBucketCommand({ Bucket: this.cfg.bucket }))
          return
        }
        if (i >= attempts) throw err
        await new Promise((r) => setTimeout(r, 1000))
      }
    }
  }
  async ping() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.cfg.bucket }))
  }
  async put(key: string, bytes: Uint8Array) {
    await this.client.send(new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, Body: bytes }))
  }
  async delete(keys: readonly string[]) {
    // DeleteObjects takes at most 1000 keys and does not fail on a missing one
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000)
      const out = await this.client.send(
        new DeleteObjectsCommand({ Bucket: this.cfg.bucket, Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true } }),
      )
      if (out.Errors?.length) throw new Error(`Could not delete ${out.Errors.length} stored object(s): ${out.Errors[0]?.Message ?? 'unknown'}`)
    }
  }
  async get(key: string) {
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }))
      return out.Body ? new Uint8Array(await out.Body.transformToByteArray()) : null
    } catch (err) {
      if ((err as { name?: string }).name === 'NoSuchKey') return null
      throw err
    }
  }
}
