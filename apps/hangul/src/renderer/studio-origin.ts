/**
 * Resolve the rhwp-studio origin the Hangul editor embeds, as a single seam so
 * the hosting decision lives in one place.
 *
 * HOSTING DECISION (offline-first):
 * The @rhwp/editor SDK iframe-embeds rhwp-studio from an HTTP(S) origin and
 * defaults to the public CDN (https://edwardkim.github.io/rhwp/). That default
 * is an external network call, which violates GenOffice / Redrob's offline-first,
 * no-external-calls posture, so we never point at it.
 *
 * The offline-correct answer is to self-host the rhwp-studio build inside the
 * app bundle (apps/hangul/resources/rhwp-studio, built with
 * RHWP_DISABLE_EXTERNAL_WEBFONTS=1) and serve it from an app-local loopback
 * origin (the main process's studio-serve.ts) so the SDK's HTTP(S)-origin check
 * passes with no external traffic. The renderer asks the host for that origin
 * through window.hangulApi.studioOrigin(); a null result means no offline
 * studio is available and the editor shows an offline notice rather than
 * reaching the CDN.
 *
 * The exact studio build command to produce the self-hosted assets is:
 *   cd rhwp-studio && npm install && \
 *     RHWP_DISABLE_EXTERNAL_WEBFONTS=1 npx vite build
 * The built dist/ is copied to apps/hangul/resources/rhwp-studio and served
 * from the app-local origin returned here.
 */

export interface StudioOriginResult {
  /** The HTTP(S) URL to hand the SDK's studioUrl, when one is available. */
  studioUrl: string | null
  /**
   * Why no offline studio origin is available, for a clear in-app message.
   * Null when studioUrl is set.
   */
  unavailableReason: string | null
}

const OFFLINE_UNAVAILABLE =
  'The offline Hangul editor is not configured in this build. ' +
  'A self-hosted rhwp-studio origin has not been provided, and the public ' +
  'studio CDN is disabled to keep the app offline.'

/** The host slice that serves the bundled, offline studio origin. */
export interface StudioOriginHost {
  studioOrigin(): Promise<string | null>
}

/**
 * Resolve the studio origin the editor embeds by asking the host to serve the
 * self-hosted, offline studio bundle from an app-local loopback origin.
 *
 * Never reaches the public CDN: when the host provides no http(s) origin it
 * returns a null URL and the offline reason so the editor shows its offline
 * notice instead of making an external call.
 */
export async function resolveStudioOrigin(host: StudioOriginHost): Promise<StudioOriginResult> {
  try {
    const served = await host.studioOrigin()
    if (typeof served === 'string' && isHttpOrigin(served)) {
      return { studioUrl: served, unavailableReason: null }
    }
  } catch {
    // Fall through to the offline notice; never reach the CDN.
  }
  return { studioUrl: null, unavailableReason: OFFLINE_UNAVAILABLE }
}

/** The SDK only accepts http(s); file:/data:/opaque origins are rejected. */
export function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
