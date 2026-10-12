/**
 * Copies a props object without the named keys.
 *
 * Components take their own props plus any native attribute, so each one removes what it consumed
 * and spreads the rest onto its root element. That is what lets a consumer pass `data-testid`,
 * `aria-*` or `onFocus` to any component without the component knowing about it.
 */
export function omit<T extends object, K extends keyof T>(props: T, keys: readonly K[]): Omit<T, K> {
  const out = {} as Omit<T, K>;
  for (const key of Object.keys(props) as Array<keyof T>) {
    if ((keys as readonly (keyof T)[]).indexOf(key) === -1) {
      (out as Record<string, unknown>)[key as string] = props[key];
    }
  }
  return out;
}

export default omit;
