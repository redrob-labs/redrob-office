/// Clamp a window's initial size to the primary display's work area, so a
/// fixed default (e.g. 1360x900) never opens larger than a small or scaled
/// screen (common on Windows laptops at 125-150% scaling). Call after
/// app ready.
import { screen } from 'electron'

export function fitToWorkArea(width: number, height: number): { width: number; height: number } {
  const area = screen.getPrimaryDisplay().workAreaSize
  return { width: Math.min(width, area.width), height: Math.min(height, area.height) }
}
