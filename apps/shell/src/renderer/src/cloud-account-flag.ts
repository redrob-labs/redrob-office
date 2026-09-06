/**
 * Whether the cloud-account surfaces (sign-in, cloud projects, credits) are
 * shown in the UI.
 *
 * These surfaces are the PORTED Genspark cloud-account features: the sign-in
 * flow authenticates against genspark.ai, the cloud-projects list is fetched
 * from genspark.ai, and the credit balance is a Genspark balance. Under the
 * Redrob Office product there is no Redrob auth/cloud backend wired yet, so
 * presenting these under a "Redrob" label would misrepresent where the user's
 * credentials go. Until a real Redrob auth/cloud backend exists, these surfaces
 * are hidden: the endpoint code stays in the tree (load-bearing, still unit
 * tested) but is not reachable from any Redrob-labeled control.
 *
 * Local-first functionality is unaffected: recent/starred files, open-local,
 * new documents, local projects (ProjectStore), settings, and the AI Model
 * Console-key pane all remain.
 *
 * This is a build-time constant (not a user setting) so the surfaces cannot be
 * toggled on by accident. Flip it to true only once a Redrob-branded auth/cloud
 * backend is in place.
 */
export const CLOUD_ACCOUNT_ENABLED = false as boolean
