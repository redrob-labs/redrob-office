import { defineConfig } from 'vitest/config'

/** Against the Docker Compose stack: SYNC_URL, DATABASE_URL and S3_* must point at it. */
export default defineConfig({
  test: {
    include: ['tests/**/*.integration.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
})
