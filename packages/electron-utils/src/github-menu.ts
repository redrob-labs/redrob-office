/** the public open-source repository; also the target of every in-app star CTA */
export const GITHUB_REPO_URL = 'https://github.com/redrob-labs/redrob-office'

/** repo shown/opened in the UI as "owner/name", derived from GITHUB_REPO_URL so the
 *  displayed label and the opened link never drift apart */
export const GITHUB_REPO_SLUG = GITHUB_REPO_URL.replace(/^https?:\/\/github\.com\//, '')
