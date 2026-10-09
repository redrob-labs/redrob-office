/**
 * The shell window's own title bar controls, for Windows and Linux, where the
 * window has no OS title bar or menu bar and the tab strip stands in for both.
 * macOS keeps its traffic lights and its menu bar.
 */
export type WindowPlatform = 'darwin' | 'win32' | 'linux'

export interface WindowState {
  maximized: boolean
}

export interface WindowApi {
  /** the OS the shell runs on, so the strip knows which controls to draw */
  platform: WindowPlatform
  minimize(): Promise<void>
  /** maximise, or restore when already maximised */
  toggleMaximize(): Promise<void>
  close(): Promise<void>
  state(): Promise<WindowState>
  /** subscribe to maximise/restore however it happens (button, Win+Up, edge snap); returns unsubscribe */
  onStateChanged(handler: (state: WindowState) => void): () => void
  /**
   * pop up the active tab's application menu (File, Edit, View, ...) at (x, y)
   * in window CSS coordinates. Native, because the editor views below the
   * strip would cover a DOM dropdown, and because the menu is rebuilt per tab
   * and per language in the main process.
   */
  showAppMenu(x: number, y: number): Promise<void>
  /**
   * focus the active editor's own tool search (EditorFrame's CommandSearch),
   * as its Alt+Q shortcut does. Does nothing on Home.
   */
  focusSearch(): Promise<void>
}

export const WINDOW_CHANNELS = {
  minimize: 'window:minimize',
  toggleMaximize: 'window:toggle-maximize',
  close: 'window:close',
  state: 'window:state',
  stateChanged: 'window:state-changed',
  showAppMenu: 'window:show-app-menu',
  focusSearch: 'window:focus-search',
} as const
