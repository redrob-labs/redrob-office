// Contract: on Windows and Linux the 40px app chrome IS the title bar.
//
// v0.10.3 shipped the refreshed chrome under the OS title bar and menu bar on
// Windows, so the window carried two title bars. Nothing failed: the frame
// options live in a main-process function a unit test cannot execute without a
// live Electron app. What is checkable, and what broke, is whether the frame
// per platform, the menu-bar hiding, the window IPC and the chrome's own
// controls are all present and agree on the strip height.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WINDOW_CHANNELS } from '../src/shared/window-api'
import { strings } from '../src/renderer/src/strings'

const read = (rel: string): string => readFileSync(join(__dirname, '..', rel), 'utf8')
const mainSource = read('src/main/index.ts')
const preloadSource = read('src/preload/index.ts')
const tabManagerSource = read('src/main/tab-manager.ts')
const tabBarSource = read('src/renderer/src/TabBar.tsx')
const tabBarCss = read('src/renderer/src/tabbar.css')

describe('frameless app chrome on Windows and Linux', () => {
  it('hides the OS title bar on Windows and keeps real caption buttons through titleBarOverlay', () => {
    expect(mainSource).toMatch(/titleBarStyle: 'hidden',\s*titleBarOverlay: windowsCaptionOverlay\(\)/)
  })

  it('is frameless on Linux', () => {
    expect(mainSource).toMatch(/frame: false/)
  })

  it('keeps the macOS traffic lights inset', () => {
    expect(mainSource).toMatch(/titleBarStyle: 'hiddenInset'/)
  })

  it('never shows the OS menu bar off macOS (the chrome menu button pops the app menu up)', () => {
    expect(mainSource).toMatch(/setMenuBarVisibility\(false\)/)
    expect(mainSource).toMatch(/setAutoHideMenuBar\(false\)/)
    expect(mainSource).toMatch(/Menu\.getApplicationMenu\(\)\?\.popup\(/)
  })

  it('sizes the Windows caption overlay to the strip height, and the strip CSS agrees', () => {
    expect(mainSource).toMatch(/return \{ \.\.\.colors, height: TAB_STRIP_HEIGHT \}/)
    const height = /const TAB_STRIP_HEIGHT = (\d+)/.exec(tabManagerSource)?.[1]
    expect(height).toBeDefined()
    expect(tabBarCss).toContain(`--go-doctabs-height: ${height}px;`)
  })

  it('re-colours the Windows caption glyphs when the theme changes', () => {
    expect(mainSource).toMatch(/nativeTheme\.on\('updated', syncWindowsCaptionOverlay\)/)
    expect(mainSource).toMatch(/nativeTheme\.themeSource = theme\s*\n\s*syncWindowsCaptionOverlay\(\)/)
  })

  it('handles every window channel in the main process and exposes it from the preload', () => {
    for (const [name, channel] of Object.entries(WINDOW_CHANNELS)) {
      if (name === 'stateChanged') {
        expect(mainSource, name).toContain(`webContents.send(WINDOW_CHANNELS.${name}`)
        expect(preloadSource, name).toContain(`ipcRenderer.on(WINDOW_CHANNELS.${name}`)
        continue
      }
      expect(mainSource, channel).toContain(`ipcMain.handle(WINDOW_CHANNELS.${name}`)
      expect(preloadSource, channel).toContain(`WINDOW_CHANNELS.${name}`)
    }
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('aiOfficeWindow', windowApi)")
  })

  it('draws its own controls on Linux and leaves room for the OS buttons on Windows', () => {
    expect(tabBarSource).toMatch(/platform === 'linux' \? \(\s*<WindowControls/)
    expect(tabBarSource).toMatch(/platform === 'win32' \? <div className="tab-bar-caption-space" \/>/)
    expect(tabBarSource).toMatch(/platform === 'darwin'/)
    // the room is the window's own overlay width, 138px (3 x 46) as the floor
    expect(tabBarCss).toMatch(/\.tab-bar-caption-space \{[^}]*env\(titlebar-area-width/)
    expect(tabBarCss).toMatch(/\.tab-bar-caption-space \{[^}]*min-width: 138px;/)
  })

  it('names every control in English and Korean', () => {
    for (const key of ['appMenu', 'minimizeWindow', 'maximizeWindow', 'restoreWindow', 'closeWindow'] as const) {
      expect(strings.en[key], key).toBeTruthy()
      expect(strings.ko[key], key).toBeTruthy()
    }
  })
})
