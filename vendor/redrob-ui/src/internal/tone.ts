import { icons, IconComponent } from '../icons';

export type Tone = 'info' | 'success' | 'warning' | 'danger';

/**
 * The glyph that goes with each tone.
 *
 * One icon per tone, everywhere, so the shape carries the meaning alongside the colour. A message that
 * distinguishes success from failure by hue alone is a message some readers cannot read.
 */
export const TONE_ICON: Record<Tone, IconComponent> = {
  info: icons.info,
  success: icons.success,
  warning: icons.warning,
  danger: icons.danger,
};
