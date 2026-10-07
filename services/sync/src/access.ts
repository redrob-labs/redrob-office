/**
 * Who may do what with a shared file. Roles are ordered: an owner can do
 * everything an editor can, an editor everything a commenter can, and so on.
 * Redrob's private proposals are never part of a shared file, so no role
 * grants them.
 */

export type Role = 'owner' | 'edit' | 'comment' | 'view'

export const ROLES: readonly Role[] = ['view', 'comment', 'edit', 'owner']

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLES as readonly string[]).includes(v)
}

export function atLeast(role: Role | null, needed: Role): boolean {
  return role !== null && ROLES.indexOf(role) >= ROLES.indexOf(needed)
}

export type Action = 'read' | 'comment' | 'write' | 'share' | 'delete'

const NEEDS: Record<Action, Role> = {
  read: 'view',
  comment: 'comment',
  write: 'edit',
  share: 'owner',
  delete: 'owner',
}

export function can(role: Role | null, action: Action): boolean {
  return atLeast(role, NEEDS[action])
}

/** A live session is read-only unless the person may edit; commenters write comments only through the API. */
export function liveReadOnly(role: Role): boolean {
  return !atLeast(role, 'edit')
}

/** An owner may grant any role but owner, and may not change their own role. */
export function canGrant(granter: Role | null, target: Role, self: boolean): boolean {
  return granter === 'owner' && target !== 'owner' && !self
}
