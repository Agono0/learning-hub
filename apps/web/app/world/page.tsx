'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  Coins,
  Compass,
  Flame,
  Hourglass,
  Landmark,
  Maximize2,
  Minimize2,
  PawPrint,
  Pause,
  Play,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  TreePine,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { apiGet, apiSend } from '@/lib/transport'
import { usePalette } from '@/components/ThemeSync'
import {
  Badge,
  Callout,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  Skeleton,
  Tabs,
  useToast,
} from '@/ui'
import { ChipPicker } from '@/components/ui/chip-picker'
import { useGsapCountUp } from '@/lib/useGsapCountUp'
import type { WorldCanvasHandle } from '@/ui/WorldCanvas'
import { ItemPreviewModal } from '@/ui/ItemPreviewModal'

// three.js is heavy — load the canvas chunk after first paint (same pattern as
// the knowledge graph's react-force-graph-2d, per ENGINE-REFERENCE).
const WorldCanvas = dynamic(() => import('@/ui/WorldCanvas').then((m) => m.WorldCanvas), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center text-sm text-faint">Loading world…</div>
  ),
})

interface WorldState {
  avatar: {
    characterId: string
    equippedHead: string | null
    equippedHand: string | null
    equippedCompanion: string | null
    equippedSkin: string
    unlockedCharacters: string[]
    unlockedItems: string[]
    unlockedTrees: string[]
  }
  balance: number
  plots: Array<{
    id: number
    treeType: string
    growthStage: string
    posX: number
    posY: number
    posZ: number
    durationMinutes: number
    createdAt: string
  }>
  settings: {
    viewMode: 'diorama' | 'third_person' | 'hybrid'
    timerTheme: 'tree' | 'hourglass' | 'campfire' | 'clockwork' | 'crystal'
    integrationMode: 'dedicated' | 'focus_embedded' | 'hud_modal'
    soundscape: 'none' | 'birds' | 'rain' | 'fire' | 'wind'
    lowPolyQuality: 'high' | 'medium' | 'low'
  }
}

interface MarketItem {
  id: string
  category: 'character' | 'accessory' | 'tree' | 'timer_theme' | 'companion' | 'decor'
  name: string
  description: string
  priceCoins: number
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  isDefault: boolean
}

const CATEGORY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'character', label: 'Scholars' },
  { key: 'companion', label: 'Companions' },
  { key: 'accessory', label: 'Gear' },
  { key: 'tree', label: 'Trees' },
  { key: 'decor', label: 'Decor' },
  { key: 'timer_theme', label: 'Timers' },
] as const

const CATEGORY_ICON: Record<MarketItem['category'], typeof User> = {
  character: User,
  companion: PawPrint,
  accessory: ShoppingBag,
  tree: TreePine,
  decor: Landmark,
  timer_theme: Hourglass,
}

/** Rarity-tinted card glow — echoes the 3D preview pedestal ring. */
const RARITY_CARD: Record<MarketItem['rarity'], string> = {
  common: 'border-(--hub-border) hover:border-indigo-400/60',
  rare: 'border-sky-500/30 hover:border-sky-400/60',
  epic: 'border-indigo-500/30 hover:border-indigo-400/60',
  legendary: 'border-amber-500/30 hover:border-amber-400/60',
}

const RARITY_THUMB: Record<MarketItem['rarity'], string> = {
  common: 'from-slate-700/40 to-slate-900 text-secondary',
  rare: 'from-sky-600/25 to-slate-900 text-status-info-text',
  epic: 'from-indigo-600/25 to-slate-900 text-indigo-300',
  legendary: 'from-amber-500/25 to-slate-900 text-status-warning-text',
}

export default function WorldPage() {
  const [activeTab, setActiveTab] = useState<'world' | 'market' | 'plots'>('world')
  const [worldState, setWorldState] = useState<WorldState | null>(null)
  const [catalog, setCatalog] = useState<MarketItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [categoryFilter, setCategoryFilter] =
    useState<(typeof CATEGORY_FILTERS)[number]['key']>('all')
  const [previewItem, setPreviewItem] = useState<MarketItem | null>(null)

  // Timer state
  const [plannedMinutes, setPlannedMinutes] = useState(25)
  const [secondsLeft, setSecondsLeft] = useState(25 * 60)
  const [timerRunning, setTimerRunning] = useState(false)
  const [selectedTheme, setSelectedTheme] = useState<
    'tree' | 'hourglass' | 'campfire' | 'clockwork' | 'crystal'
  >('tree')
  const [viewMode, setViewMode] = useState<'diorama' | 'third_person' | 'hybrid'>('hybrid')
  const [soundscape, setSoundscape] = useState<'none' | 'birds' | 'rain' | 'fire' | 'wind'>('none')
  const [heartbeats, setHeartbeats] = useState(0)

  const canvasRef = useRef<WorldCanvasHandle | null>(null)
  // The app palette drives the world's sky/light mood (calm → morning, midnight → night…).
  const palette = usePalette()

  // Fetch world state & catalog
  useEffect(() => {
    let mounted = true
    async function loadData() {
      try {
        const stateRes = await apiGet<WorldState & { ok: boolean }>('/api/world/state')
        const marketRes = await apiGet<{ catalog: MarketItem[]; ok: boolean }>('/api/world/market')
        if (mounted && stateRes && stateRes.ok) {
          setWorldState(stateRes)
          setSelectedTheme(stateRes.settings.timerTheme)
          setViewMode(stateRes.settings.viewMode)
          setSoundscape(stateRes.settings.soundscape)
        }
        if (mounted && marketRes && marketRes.ok) {
          setCatalog(marketRes.catalog)
        }
      } catch (err) {
        console.error('Failed to load world data:', err)
        if (mounted) setLoadError(true)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    loadData()
    return () => {
      mounted = false
    }
  }, [])

  // Timer ticker
  useEffect(() => {
    if (!timerRunning) return

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          setTimerRunning(false)
          handleSessionComplete()
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // Heartbeat ticker for anti-cheat verification
    const hb = setInterval(() => {
      setHeartbeats((h) => h + 1)
    }, 60000)

    return () => {
      clearInterval(timer)
      clearInterval(hb)
    }
  }, [timerRunning])

  // Update canvas progress
  const totalSeconds = plannedMinutes * 60
  const progress = Math.max(0, Math.min(1, (totalSeconds - secondsLeft) / totalSeconds))

  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.setProgress(progress)
    }
  }, [progress])

  const { toast } = useToast()

  const unlockedDecor = useMemo(
    () => worldState?.avatar.unlockedItems.filter((id) => id.startsWith('decor_')) ?? [],
    [worldState?.avatar.unlockedItems],
  )

  async function handleSessionComplete() {
    try {
      // 1. Submit verified focus session for study coins
      const res = await apiSend<{
        valid: boolean
        coinsAwarded: number
        balance: number
        reason: string
      }>('/api/world/verify/focus', 'POST', {
        plannedMinutes,
        actualSeconds: plannedMinutes * 60,
        heartbeatsCount: Math.max(1, heartbeats),
        completedWithoutExit: true,
      })

      // 2. Plant a tree in the 3D forest
      const treeSpecies = worldState?.avatar.unlockedTrees[0] || 'tree_oak'
      await apiSend('/api/world/plots', 'POST', {
        treeType: treeSpecies,
        durationMinutes: plannedMinutes,
      })

      // 3. Refresh world state
      const stateRes = await apiGet<WorldState & { ok: boolean }>('/api/world/state')
      if (stateRes && stateRes.ok) {
        setWorldState(stateRes)
      }

      toast({
        title: 'Focus block complete',
        description: `You earned +${res.coinsAwarded} Study Coins and planted a new tree in the Forest.`,
        tone: 'success',
      })
    } catch (err) {
      console.error('Session complete error:', err)
    }
  }

  function handleStartTimer() {
    setTimerRunning(true)
  }

  function handlePauseTimer() {
    setTimerRunning(false)
  }

  function handleResetTimer() {
    setTimerRunning(false)
    setSecondsLeft(plannedMinutes * 60)
    setHeartbeats(0)
  }

  function handleSelectDuration(mins: number) {
    setPlannedMinutes(mins)
    setSecondsLeft(mins * 60)
    setTimerRunning(false)
    setHeartbeats(0)
  }

  async function handlePurchase(itemId: string) {
    try {
      const res = await apiSend<{
        ok: boolean
        balance: number
        avatar: WorldState['avatar']
        error?: string
      }>('/api/world/market', 'POST', { itemId })

      if (res && res.ok && worldState) {
        setWorldState({
          ...worldState,
          avatar: res.avatar,
          balance: res.balance,
        })
      }
    } catch (err) {
      toast({
        title: 'Purchase failed',
        description: (err as Error).message || 'Try again in a moment.',
        tone: 'danger',
      })
    }
  }

  async function handleEquipCharacter(charId: string) {
    try {
      const res = await apiSend<{ ok: boolean; avatar: WorldState['avatar'] }>(
        '/api/world/avatar',
        'POST',
        { characterId: charId },
      )
      if (res && res.ok && worldState) {
        setWorldState({ ...worldState, avatar: res.avatar })
      }
    } catch (err) {
      console.error('Failed to equip character:', err)
    }
  }

  async function handleEquipCompanion(companionId: string | null) {
    try {
      const res = await apiSend<{ ok: boolean; avatar: WorldState['avatar'] }>(
        '/api/world/avatar',
        'POST',
        { equippedCompanion: companionId },
      )
      if (res && res.ok && worldState) {
        setWorldState({ ...worldState, avatar: res.avatar })
      }
    } catch (err) {
      console.error('Failed to equip companion:', err)
    }
  }

  async function handleEquipAccessory(slot: 'head' | 'hand', accessoryId: string | null) {
    try {
      const res = await apiSend<{ ok: boolean; avatar: WorldState['avatar'] }>(
        '/api/world/avatar',
        'POST',
        {
          ...(slot === 'head' ? { equippedHead: accessoryId } : { equippedHand: accessoryId }),
        },
      )
      if (res && res.ok && worldState) {
        setWorldState({ ...worldState, avatar: res.avatar })
      }
    } catch (err) {
      console.error('Failed to equip accessory:', err)
    }
  }

  /** Dispatch an equip action based on the item's category. */
  async function handleEquipItem(item: MarketItem) {
    if (item.category === 'character') return handleEquipCharacter(item.id)
    if (item.category === 'companion') return handleEquipCompanion(item.id)
    if (item.category === 'accessory') {
      const slot = item.id.startsWith('head_') ? 'head' : 'hand'
      return handleEquipAccessory(slot, item.id)
    }
  }

  async function handleChangeTheme(theme: typeof selectedTheme) {
    setSelectedTheme(theme)
    if (canvasRef.current) {
      canvasRef.current.setTimerTheme(theme)
    }
    apiSend('/api/world/settings', 'POST', { timerTheme: theme }).catch(() => {})
  }

  async function handleChangeViewMode(mode: typeof viewMode) {
    setViewMode(mode)
    if (canvasRef.current) {
      canvasRef.current.setViewMode(mode)
    }
    apiSend('/api/world/settings', 'POST', { viewMode: mode }).catch(() => {})
  }

  const isItemUnlocked = (item: MarketItem): boolean =>
    Boolean(
      item.isDefault ||
      (item.category === 'character' && worldState?.avatar.unlockedCharacters.includes(item.id)) ||
      ((item.category === 'accessory' ||
        item.category === 'companion' ||
        item.category === 'decor') &&
        worldState?.avatar.unlockedItems.includes(item.id)) ||
      (item.category === 'tree' && worldState?.avatar.unlockedTrees.includes(item.id)),
    )

  const isItemEquipped = (item: MarketItem): boolean =>
    Boolean(
      (item.category === 'character' && worldState?.avatar.characterId === item.id) ||
      (item.category === 'companion' && worldState?.avatar.equippedCompanion === item.id) ||
      (item.category === 'accessory' &&
        (worldState?.avatar.equippedHead === item.id ||
          worldState?.avatar.equippedHand === item.id)),
    )

  const filteredCatalog =
    categoryFilter === 'all' ? catalog : catalog.filter((i) => i.category === categoryFilter)

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // GSAP moment: the Study Coins balance counts up when the world loads
  // (SSR-safe — the final number renders normally; reduced-motion keeps it).
  const balance = worldState?.balance ?? 0
  const balanceRef = useGsapCountUp(balance)

  if (loading) {
    return (
      <div className="space-y-6" aria-hidden="true">
        <Skeleton className="h-16 w-full max-w-xl" />
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-56 w-full md:col-span-2" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Forest of Focus & 3D Timers"
          subtitle="Immersive low-poly study sanctuary. Grow trees with verified focus, customize your scholar, and spend study coins in the marketplace."
        />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-status-warning-text font-medium">
            <Coins className="w-5 h-5 text-status-warning-text" />
            <span ref={balanceRef} className="tabular-nums">
              {balance}
            </span>
            <span className="text-xs text-status-warning-text/80 uppercase tracking-wider font-semibold">
              Coins
            </span>
          </div>
        </div>
      </div>

      {loadError && (
        <Callout tone="danger" title="World data unavailable">
          The forest state and marketplace could not be loaded. Controls below still work and sync
          once the backend is reachable.
        </Callout>
      )}

      <Tabs
        label="3D World Navigation"
        value={activeTab}
        onChange={(t) => setActiveTab(t)}
        items={[
          { key: 'world', label: '3D Forest & Timers' },
          { key: 'market', label: 'Marketplace' },
          { key: 'plots', label: `Planted Forest (${worldState?.plots.length ?? 0})` },
        ]}
      />

      {activeTab === 'world' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main 3D Canvas Viewport */}
          <div className="lg:col-span-2 relative min-h-[480px] lg:min-h-[640px] bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl">
            <WorldCanvas
              ref={canvasRef}
              viewMode={viewMode}
              timerTheme={selectedTheme}
              characterId={worldState?.avatar.characterId}
              equippedHead={worldState?.avatar.equippedHead}
              equippedHand={worldState?.avatar.equippedHand}
              equippedCompanion={worldState?.avatar.equippedCompanion}
              equippedSkin={worldState?.avatar.equippedSkin}
              soundscape={soundscape}
              lowPolyQuality={worldState?.settings.lowPolyQuality ?? 'high'}
              mood={palette}
              plantedPlots={worldState?.plots}
              unlockedDecor={unlockedDecor}
              progress={progress}
            />

            {/* In-Canvas Top Overlay Controls */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
              <div className="flex items-center gap-2 pointer-events-auto bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700/50 text-xs text-slate-300">
                <Compass className="w-4 h-4 text-status-success-text" />
                <span className="capitalize">{viewMode.replace('_', ' ')} Mode</span>
              </div>

              <div className="flex items-center gap-2 pointer-events-auto">
                <button
                  onClick={() =>
                    handleChangeViewMode(viewMode === 'diorama' ? 'third_person' : 'diorama')
                  }
                  className="btn-ghost bg-slate-900/80 backdrop-blur-md border border-slate-700/50 text-xs px-2.5 py-1.5 flex items-center rounded-lg"
                >
                  {viewMode === 'diorama' ? (
                    <Maximize2 className="w-3.5 h-3.5 mr-1" />
                  ) : (
                    <Minimize2 className="w-3.5 h-3.5 mr-1" />
                  )}
                  {viewMode === 'diorama' ? 'Third-Person (WASD)' : 'Orbit Diorama'}
                </button>
                <IconButton
                  label={soundscape === 'none' ? 'Enable soundscape' : 'Mute soundscape'}
                  onClick={() => setSoundscape(soundscape === 'none' ? 'birds' : 'none')}
                  className="border border-slate-700/50 bg-slate-900/80 backdrop-blur-md"
                >
                  {soundscape === 'none' ? (
                    <VolumeX className="w-3.5 h-3.5 text-faint" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-status-success-text" />
                  )}
                </IconButton>
              </div>
            </div>

            {/* In-Canvas Bottom Floating HUD */}
            <div className="absolute bottom-4 left-4 right-4 pointer-events-none flex justify-center">
              <div className="pointer-events-auto flex items-center gap-4 bg-slate-900/90 backdrop-blur-md px-6 py-3 rounded-2xl border border-slate-700/60 shadow-xl">
                <div className="text-3xl font-mono font-bold tracking-wider text-status-success-text">
                  {formatTime(secondsLeft)}
                </div>

                <div className="flex items-center gap-2">
                  {!timerRunning ? (
                    <button
                      onClick={handleStartTimer}
                      className="btn bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-3 py-2 flex items-center gap-1 rounded-lg"
                    >
                      <Play className="w-4 h-4 mr-1.5" /> Start
                    </button>
                  ) : (
                    <button
                      onClick={handlePauseTimer}
                      className="btn-ghost border border-amber-500/50 text-status-warning-text text-xs px-3 py-2 flex items-center gap-1 rounded-lg"
                    >
                      <Pause className="w-4 h-4 mr-1.5" /> Pause
                    </button>
                  )}
                  <IconButton
                    label="Reset focus timer"
                    onClick={handleResetTimer}
                    className="border border-slate-700 text-faint"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </IconButton>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Controls & Settings */}
          <div className="space-y-6">
            <Panel
              title={
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-status-warning-text" /> 3D Timer Theme
                </div>
              }
            >
              <ChipPicker<string>
                className="mt-3"
                label="3D timer theme"
                items={[
                  { id: 'tree', label: 'Growing Tree', icon: <TreePine /> },
                  { id: 'hourglass', label: 'Hourglass', icon: <Hourglass /> },
                  { id: 'campfire', label: 'Campfire', icon: <Flame /> },
                  { id: 'clockwork', label: 'Clockwork', icon: <Compass /> },
                  { id: 'crystal', label: 'Mystic Crystal', icon: <Sparkles /> },
                ].map(({ id, label, icon }) => ({ value: id, label, icon }))}
                value={selectedTheme}
                onChange={(theme) => handleChangeTheme(theme as typeof selectedTheme)}
              />
            </Panel>

            <Panel
              title={
                <div className="flex items-center gap-2">
                  <TreePine className="w-5 h-5 text-status-success-text" /> Study Sprints
                </div>
              }
            >
              <ChipPicker<string>
                className="mt-3"
                label="Focus sprint duration"
                items={[
                  { label: 'Pomodoro (25m)', mins: 25 },
                  { label: 'Deep Focus (50m)', mins: 50 },
                  { label: 'Sprint (15m)', mins: 15 },
                  { label: 'Power Hour (60m)', mins: 60 },
                ].map((dur) => ({ value: String(dur.mins), label: dur.label }))}
                value={String(plannedMinutes)}
                onChange={(v) => handleSelectDuration(Number(v))}
              />
              <p className="text-xs text-faint mt-3 leading-relaxed">
                Completing a verified study block earns{' '}
                <strong className="text-status-warning-text">+30 Study Coins</strong> and plants a
                permanent tree in your 3D sanctuary.
              </p>
            </Panel>

            <Panel
              title={
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-indigo-400" /> Active Scholar
                </div>
              }
            >
              <div className="space-y-3 mt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-faint">Character:</span>
                  <span className="font-semibold text-strong capitalize">
                    {worldState?.avatar.characterId.replace('char_', '')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-faint">Headwear:</span>
                  <span className="font-semibold text-strong capitalize">
                    {worldState?.avatar.equippedHead
                      ? worldState.avatar.equippedHead.replace('head_', '').replace('_', ' ')
                      : 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-faint">Handheld:</span>
                  <span className="font-semibold text-strong capitalize">
                    {worldState?.avatar.equippedHand
                      ? worldState.avatar.equippedHand.replace('hand_', '')
                      : 'None'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-faint">Companion:</span>
                  {worldState?.avatar.equippedCompanion ? (
                    <button
                      className="font-semibold text-status-success-text capitalize hover:text-emerald-200"
                      onClick={() => handleEquipCompanion(null)}
                      title="Dismiss companion"
                    >
                      {worldState.avatar.equippedCompanion.replace('comp_', '')} ×
                    </button>
                  ) : (
                    <span className="font-semibold text-strong capitalize">None</span>
                  )}
                </div>
                <button
                  className="btn-ghost w-full rounded-lg border border-(--hub-border) py-2 mt-2 text-xs"
                  onClick={() => setActiveTab('market')}
                >
                  <ShoppingBag className="w-3.5 h-3.5 mr-1.5" /> Open Marketplace
                </button>
              </div>
            </Panel>
          </div>
        </div>
      )}

      {activeTab === 'market' && (
        <div className="space-y-5">
          {/* Category filters — kit ChipPicker (choose-one) */}
          <ChipPicker<(typeof CATEGORY_FILTERS)[number]['key']>
            label="Marketplace category"
            items={CATEGORY_FILTERS.map((f) => {
              const count =
                f.key === 'all'
                  ? catalog.length
                  : catalog.filter((i) => i.category === f.key).length
              return { value: f.key, label: `${f.label} (${count})` }
            })}
            value={categoryFilter}
            onChange={setCategoryFilter}
          />

          {filteredCatalog.length === 0 ? (
            <EmptyState icon={<ShoppingBag className="h-8 w-8" />} title="Nothing in this aisle">
              The marketplace has no items in this category yet.
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredCatalog.map((item) => {
                const Icon = CATEGORY_ICON[item.category] ?? Sparkles
                const isUnlocked = isItemUnlocked(item)
                const isEquipped = isItemEquipped(item)
                const canAfford = (worldState?.balance ?? 0) >= item.priceCoins

                return (
                  <div
                    key={item.id}
                    className={`border ${RARITY_CARD[item.rarity]} rounded-2xl overflow-hidden flex flex-col bg-(--hub-panel) shadow-sm transition-colors`}
                  >
                    {/* Thumbnail — tap to open the 3D preview portal */}
                    <button
                      onClick={() => setPreviewItem(item)}
                      className={`relative h-28 w-full bg-gradient-to-br ${RARITY_THUMB[item.rarity]} flex items-center justify-center group cursor-pointer`}
                      aria-label={`Preview ${item.name} in 3D`}
                    >
                      <Icon className="w-10 h-10 opacity-70 group-hover:scale-110 transition-transform" />
                      <span className="absolute bottom-2 right-2 rounded bg-slate-950/60 px-1.5 py-0.5 text-xs uppercase tracking-wider font-bold opacity-80">
                        {item.rarity}
                      </span>
                      <span className="absolute bottom-2 left-2 rounded bg-slate-950/60 px-1.5 py-0.5 text-xs uppercase tracking-wider font-bold opacity-80">
                        {item.category.replace('_', ' ')}
                      </span>
                    </button>

                    <div className="flex flex-1 flex-col justify-between space-y-3 p-4">
                      <div className="space-y-1.5">
                        <h3 className="text-sm font-semibold text-strong">{item.name}</h3>
                        <p className="text-xs leading-relaxed text-faint">{item.description}</p>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-(--hub-border) pt-2">
                        <div className="flex items-center gap-1.5 text-sm font-bold text-status-warning-text">
                          <Coins className="w-4 h-4" />
                          {item.priceCoins === 0 ? 'Free' : item.priceCoins}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => setPreviewItem(item)}
                            className="btn-ghost rounded-lg border border-(--hub-border) px-2.5 py-1.5 text-xs"
                          >
                            Preview
                          </button>
                          {isEquipped ? (
                            <Badge tone="success">Equipped</Badge>
                          ) : isUnlocked ? (
                            item.category !== 'tree' &&
                            item.category !== 'decor' &&
                            item.category !== 'timer_theme' ? (
                              <button
                                className="btn-ghost rounded-lg border border-(--hub-border) px-3 py-1.5 text-xs"
                                onClick={() => handleEquipItem(item)}
                              >
                                Equip
                              </button>
                            ) : (
                              <Badge tone="neutral">Owned</Badge>
                            )
                          ) : (
                            <button
                              disabled={!canAfford}
                              onClick={() => handlePurchase(item.id)}
                              className="btn rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                            >
                              Buy
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'plots' && (
        <div className="space-y-4">
          {worldState?.plots.length === 0 ? (
            <EmptyState
              title="No trees planted yet"
              icon={<TreePine className="w-12 h-12 text-tertiary" />}
            >
              <p>Complete verified focus sessions in the 3D World to grow your forest sanctuary.</p>
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {worldState?.plots.map((plot) => (
                <div key={plot.id} className="panel space-y-2 rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-status-success-text font-medium text-sm capitalize">
                      {plot.treeType.replace('tree_', '').replace('_', ' ')}
                    </span>
                    <Badge tone="success">{plot.growthStage}</Badge>
                  </div>
                  <div className="text-xs text-faint">Duration: {plot.durationMinutes} mins</div>
                  <div className="text-xs text-tertiary">
                    Planted: {new Date(plot.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ItemPreviewModal
        item={previewItem}
        onClose={() => setPreviewItem(null)}
        isUnlocked={previewItem ? isItemUnlocked(previewItem) : false}
        isEquipped={previewItem ? isItemEquipped(previewItem) : false}
        canAfford={previewItem ? (worldState?.balance ?? 0) >= previewItem.priceCoins : false}
        onBuy={(itemId) => handlePurchase(itemId)}
        onEquip={(itemId) => {
          const item = catalog.find((c) => c.id === itemId)
          if (item) void handleEquipItem(item)
        }}
      />
    </div>
  )
}
