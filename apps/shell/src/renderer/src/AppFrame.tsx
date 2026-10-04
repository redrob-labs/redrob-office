import { useEffect, useState } from 'react'
import { Home } from './Home'
import { Launch } from './Launch'
import { StarPromptCard } from './StarPromptCard'
import { TabBar } from './TabBar'

interface AppFrameProps {
  /** resolved before first paint (main.tsx) */
  initialOnboardingSeen: boolean
  /** the launch screen plays this session (main decides: once per app session) */
  initialLaunch?: boolean
}

export function AppFrame({ initialOnboardingSeen, initialLaunch = false }: AppFrameProps) {
  const [homeActive, setHomeActive] = useState(true)
  const [showLaunch, setShowLaunch] = useState(initialLaunch)
  const [starPromptDocOpens, setStarPromptDocOpens] = useState<number | null>(null)

  useEffect(() => {
    const applyTabs = (tabs: Awaited<ReturnType<typeof window.aiOfficeTabs.list>>) => {
      const active = tabs.find((tab) => tab.active)
      setHomeActive(!active || active.kind === 'home')
    }
    void window.aiOfficeTabs.list().then(applyTabs)
    return window.aiOfficeTabs.onChanged(applyTabs)
  }, [])

  // The "star us" invitation is decided (and counted as shown) by the main
  // process; ask once per session, never over the launch screen.
  useEffect(() => {
    if (showLaunch) return
    let alive = true
    void window.aiOffice.starPromptShouldShow?.().then((result) => {
      if (alive && result.show) setStarPromptDocOpens(result.docOpens)
    })
    return () => {
      alive = false
    }
  }, [showLaunch])

  const finishLaunch = () => {
    setShowLaunch(false)
    // the launch screen is the first-run welcome now; the toolbar tip in the
    // editor carries what the old onboarding pages said
    if (!initialOnboardingSeen) void window.aiOffice.setOnboardingSeen().catch(() => false)
  }

  return (
    <div className="app-frame">
      <TabBar />
      {/* docs/sheets tabs render as WebContentsView children of this window, positioned
       * by the main process to cover this area; only Home paints its own content here. */}
      <div className="app-frame-content" style={{ visibility: homeActive ? 'visible' : 'hidden' }}>
        <Home />
      </div>
      {/* editor WebContentsViews paint above ALL shell DOM; the launch screen
       * plays at startup, before any editor tab exists */}
      {showLaunch && homeActive && <Launch onDone={finishLaunch} />}
      {starPromptDocOpens !== null && !showLaunch && homeActive && (
        <StarPromptCard docOpens={starPromptDocOpens} onClose={() => setStarPromptDocOpens(null)} />
      )}
    </div>
  )
}
