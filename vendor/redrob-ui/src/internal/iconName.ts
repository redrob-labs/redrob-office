import { icons, IconName } from '../icons';

/**
 * Narrows a name that arrives as data (an option's `icon: 'route'`) to a glyph in the set, so a lookup
 * by string needs no cast and an unknown name renders nothing instead of throwing.
 */
export function isIconName(name: string | undefined): name is IconName {
  return !!name && Object.prototype.hasOwnProperty.call(icons, name);
}
