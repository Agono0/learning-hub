'use client'

import React from 'react'

/**
 * Online Engagement Hub: Live study rooms with pomodoro sync & chat,
 * cooperative party boss raids, community deck/course library, and accountability buddies.
 *
 * CLIENT component — core imports via SUBPATHS only (never the barrel).
 */
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  BookOpen,
  Check,
  Copy,
  Download,
  Heart,
  Key,
  MessageSquare,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Shield,
  Swords,
  Timer,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react'
import { BOSS_ROSTER } from '@learning-hub/core/boss'
import {
  type CommunityItem,
  type PartyRaidState,
  type RoomMessage,
  type StudyRoomState,
} from '@learning-hub/core/online'
import { apiGet, apiSend } from '@/lib/transport'
import { OnlineSocket, joinRefusalMessage } from '@/lib/online-socket'
import { OnlineIdentityLabel } from '@/components/OnlineIdentityLabel'
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  PageHeader,
  Panel,
  ProgressBar,
  SelectField,
  Skeleton,
  Tabs,
  TextField,
} from '@/ui'
import { ChipPicker } from '@/components/ui/chip-picker'
import { useGsapCountUp } from '@/lib/useGsapCountUp'
import { queryKeys } from '@/lib/query-keys'

type OnlineTab = 'rooms' | 'raids' | 'guilds' | 'library' | 'buddies'

interface IdentityResponse {
  ok: boolean
  identity: {
    id: number
    mode: 'device_key' | 'magic_link' | 'offline'
    userId: string
    alias: string
    pubKey: string | null
    registeredAt: string | null
  }
  prefs: {
    showOnLeaderboard: boolean
    allowBuddyRequests: boolean
    sharePresence: boolean
  }
  server: string
}

export default function OnlinePage() {
  const [activeTab, setActiveTab] = useState<OnlineTab>('rooms')

  const identityQuery = useQuery<IdentityResponse>({
    queryKey: ['online-identity'],
    queryFn: () => apiGet('/api/online/identity'),
  })

  const identity = identityQuery.data?.identity

  return (
    <div className="space-y-6">
      <PageHeader
        title="Online Engagement Hub"
        subtitle="Live study rooms, multiplayer boss raids, community deck & course library, and accountability buddies."
        actions={
          <div className="flex items-center gap-2">
            <Badge
              tone={
                identity?.mode === 'device_key'
                  ? 'success'
                  : identity?.mode === 'offline'
                    ? 'neutral'
                    : 'accent'
              }
            >
              {identity?.mode === 'device_key'
                ? 'Device Key'
                : identity?.mode === 'offline'
                  ? 'Offline Mode'
                  : 'Magic Link'}
            </Badge>
            <span className="text-xs text-tertiary font-mono">{identity?.alias ?? 'Learner'}</span>
          </div>
        }
      />

      <Tabs<OnlineTab>
        label="Online hub modes"
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'rooms', label: 'Study Rooms', icon: <Radio className="h-4 w-4" /> },
          { key: 'raids', label: 'Party Raids', icon: <Swords className="h-4 w-4" /> },
          { key: 'guilds', label: 'Study Clans', icon: <Shield className="h-4 w-4" /> },
          { key: 'library', label: 'Community Library', icon: <BookOpen className="h-4 w-4" /> },
          { key: 'buddies', label: 'Buddies & Inbox', icon: <Users className="h-4 w-4" /> },
        ]}
      />

      {activeTab === 'rooms' && <StudyRoomsSection identity={identity} />}
      {activeTab === 'raids' && <PartyRaidsSection identity={identity} />}
      {activeTab === 'guilds' && <GuildsSection identity={identity} />}
      {activeTab === 'library' && <CommunityLibrarySection />}
      {activeTab === 'buddies' && <BuddiesInboxSection identity={identity} />}
    </div>
  )
}

/* ========================================================================= */
/* 1. Live Study Rooms (Pomodoro sync & Chat)                                */
/* ========================================================================= */

function StudyRoomsSection({ identity }: { identity?: IdentityResponse['identity'] }) {
  const [joinCode, setJoinCode] = useState('')
  const [roomTitle, setRoomTitle] = useState('Deep Work Session')
  const [workMinutes, setWorkMinutes] = useState(25)
  const [activeRoom, setActiveRoom] = useState<StudyRoomState | null>(null)
  const [joinRefused, setJoinRefused] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<RoomMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [copied, setCopied] = useState(false)
  const socketRef = useRef<OnlineSocket<StudyRoomState, RoomMessage> | null>(null)

  const createRoomMutation = useMutation({
    mutationFn: (data: { title: string; pomodoroWorkMinutes: number }) =>
      apiSend<{
        ok: boolean
        code: string
        room: StudyRoomState
        wsUrl: string
        joinAssertion?: unknown
      }>('/api/online/rooms', 'POST', data),
    onSuccess: (data) => {
      setActiveRoom(data.room)
      connectRoomSocket(data.wsUrl, data.room, data.joinAssertion)
    },
  })

  const joinRoomMutation = useMutation({
    mutationFn: (code: string) =>
      apiGet<{
        ok: boolean
        room: StudyRoomState
        server: string
        joinAssertion?: unknown
      }>(`/api/online/rooms?code=${code}`),
    onSuccess: (data) => {
      if (data.room) {
        setActiveRoom(data.room)
        const wsUrl = `${data.server.replace(/^http/, 'ws')}/api/v1/rooms/${data.room.code}/ws`
        connectRoomSocket(wsUrl, data.room, data.joinAssertion)
      }
    },
  })

  const connectRoomSocket = (wsUrl: string, _room: StudyRoomState, assertion?: unknown) => {
    socketRef.current?.disconnect()

    const socket = new OnlineSocket<StudyRoomState, RoomMessage>({
      url: wsUrl,
      onState: (state) => setActiveRoom(state),
      onChat: (msg) => setChatMessages((prev) => [...prev.slice(-40), msg]),
      onRefused: (code) => {
        setJoinRefused(joinRefusalMessage(code))
        setActiveRoom(null)
      },
    })
    setJoinRefused(null)

    socket.connect()
    socketRef.current = socket

    // Send join packet
    setTimeout(() => {
      socket.send({
        type: 'join',
        ...(assertion ? { assertion } : {}),
        participant: {
          id: identity?.userId ?? `usr_${Date.now()}`,
          alias: identity?.alias ?? 'Learner',
          status: 'studying',
          streak: 1,
          cardsReviewed: 0,
        },
      })
    }, 300)
  }

  useEffect(() => {
    return () => {
      socketRef.current?.disconnect()
    }
  }, [])

  const handleLeave = () => {
    socketRef.current?.disconnect()
    socketRef.current = null
    setActiveRoom(null)
    setChatMessages([])
  }

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || !socketRef.current) return
    socketRef.current.send({
      type: 'chat',
      content: chatInput.trim(),
    })
    setChatInput('')
  }

  const handleCopyCode = () => {
    if (!activeRoom) return
    void navigator.clipboard.writeText(activeRoom.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleToggleTimer = () => {
    socketRef.current?.send({ type: 'timer_toggle' })
  }

  return (
    <div className="space-y-6">
      {!activeRoom ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Create Room */}
          <Panel className="space-y-4">
            <h3 className="font-bold flex items-center gap-2">
              <Plus className="h-4 w-4" /> Create Study Room
            </h3>
            <p className="text-xs text-tertiary">
              Host a synchronized pomodoro room with real-time participant presence and focused room
              chat.
            </p>
            <div className="space-y-3">
              <TextField
                label="Room Title"
                value={roomTitle}
                onChange={(e) => setRoomTitle(e.target.value)}
                placeholder="e.g. Focus Sprint"
              />
              <SelectField
                label="Work Interval"
                value={String(workMinutes)}
                onChange={(e) => setWorkMinutes(Number(e.target.value))}
              >
                <option value="15">15 Minutes</option>
                <option value="25">25 Minutes (Standard Pomodoro)</option>
                <option value="45">45 Minutes (Deep Work)</option>
                <option value="60">60 Minutes (Intensive)</option>
              </SelectField>
              <Button
                variant="primary"
                className="w-full"
                disabled={!roomTitle.trim() || createRoomMutation.isPending}
                onClick={() =>
                  createRoomMutation.mutate({
                    title: roomTitle.trim(),
                    pomodoroWorkMinutes: workMinutes,
                  })
                }
              >
                <Radio className="h-4 w-4" /> Create Room
              </Button>
            </div>
          </Panel>

          {/* Join Room */}
          <Panel className="space-y-4">
            <h3 className="font-bold flex items-center gap-2">
              <Key className="h-4 w-4" /> Join Existing Room
            </h3>
            <p className="text-xs text-tertiary">
              Enter a 6-character room code from your study buddy or group.
            </p>
            <div className="space-y-3">
              <TextField
                label="Room Code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. 7K4W9M"
                maxLength={6}
              />
              <Button
                variant="primary"
                className="w-full"
                disabled={joinCode.trim().length !== 6 || joinRoomMutation.isPending}
                onClick={() => joinRoomMutation.mutate(joinCode.trim())}
              >
                <Users className="h-4 w-4" /> Join Room
              </Button>
              {joinRefused && (
                <p role="alert" className="text-xs text-danger-text">
                  {joinRefused}
                </p>
              )}
            </div>
          </Panel>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Room Header & Timer */}
          <Panel className="space-y-4 border-indigo-500/30">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold">{activeRoom.title}</h2>
                  <Badge tone={activeRoom.isBreak ? 'accent' : 'success'}>
                    {activeRoom.isBreak ? 'BREAK TIME' : 'FOCUS SPRINT'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-faint mt-1">
                  <span>Room Code:</span>
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-1 font-mono font-bold text-indigo-400 hover:underline"
                  >
                    {activeRoom.code}
                    {copied ? (
                      <Check className="h-3 w-3 text-status-success-text" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={handleToggleTimer}>
                  <Timer className="h-4 w-4" /> Toggle Break / Work
                </Button>
                <Button variant="danger" onClick={handleLeave}>
                  Leave Room
                </Button>
              </div>
            </div>

            {/* Participants Bar */}
            <div className="border-t border-neutral-200 pt-3 dark:border-(--hub-border)">
              <div className="label mb-2">
                Active Participants ({activeRoom.participants?.length || 1})
              </div>
              <div className="flex flex-wrap gap-2">
                {(activeRoom.participants || []).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-100 px-3 py-1.5 text-xs dark:border-(--hub-border) dark:bg-(--hub-panel)"
                  >
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <OnlineIdentityLabel alias={p.alias} verified={p.verified} />
                    <span className="text-tertiary">({p.cardsReviewed} cards)</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Room Chat & Activity */}
          <Panel className="space-y-4">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Room Chat & Motivations
            </h3>

            <div className="h-48 overflow-y-auto space-y-2 rounded-lg bg-neutral-100 p-3 text-xs dark:bg-(--hub-sunken)">
              {chatMessages.length === 0 ? (
                <div className="text-tertiary text-center py-12">
                  No messages yet. Say hello or share what you are studying!
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="flex flex-col">
                    <div className="flex items-center gap-1 text-xs text-tertiary">
                      <OnlineIdentityLabel
                        alias={msg.senderAlias}
                        verified={msg.senderVerified}
                        className="font-semibold text-secondary"
                      />
                      <span>·</span>
                      <span>{new Date(msg.sentAt).toLocaleTimeString()}</span>
                    </div>
                    <div className="mt-0.5 text-secondary">{msg.content}</div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendChat} className="flex gap-2">
              <div className="flex-1">
                <TextField
                  label=""
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Send a supportive message or check-in..."
                  maxLength={500}
                />
              </div>
              <Button variant="primary" disabled={!chatInput.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </Panel>
        </div>
      )}
    </div>
  )
}

/* ========================================================================= */
/* 2. Multiplayer Party Boss Raids                                           */
/* ========================================================================= */

function PartyRaidsSection({ identity }: { identity?: IdentityResponse['identity'] }) {
  const [selectedBoss, setSelectedBoss] = useState('chronos')
  const [activeRaid, setActiveRaid] = useState<PartyRaidState | null>(null)
  const [raidLive, setRaidLive] = useState(false)
  const raidSocketRef = useRef<OnlineSocket<PartyRaidState> | null>(null)

  const createRaidMutation = useMutation({
    mutationFn: (bossKey: string) =>
      apiSend<{
        ok: boolean
        offline: boolean
        raidId?: string
        raid?: PartyRaidState | null
        wsUrl?: string
        reason?: string
      }>('/api/online/raids', 'POST', { bossKey }),
    onSuccess: (res) => {
      const boss = BOSS_ROSTER[selectedBoss] ?? BOSS_ROSTER['chronos']!

      if (res.offline || !res.raidId || !res.wsUrl) {
        // Honest offline fallback: clearly-labelled local simulation until the
        // worker is deployed (`npm run worker:deploy`).
        setRaidLive(false)
        const initial: PartyRaidState = {
          id: `raid_${Date.now()}`,
          bossKey: boss.key,
          bossName: boss.name,
          bossHp: boss.maxHp * 3,
          bossMaxHp: boss.maxHp * 3,
          partyHp: 400,
          partyMaxHp: 400,
          status: 'fighting',
          members: [
            {
              id: identity?.userId ?? 'usr_self',
              alias: identity?.alias ?? 'You',
              damageDealt: 0,
              isAlive: true,
            },
          ],
          combatLog: [
            `OFFLINE SIMULATION — the engagement worker is unreachable. Launch it with \`npm run worker:deploy\` for real multiplayer.`,
            `Local raid against ${boss.name} started.`,
          ],
        }
        setActiveRaid(initial)
        return
      }

      // Real raid: connect the Durable Object WebSocket and join as ourselves.
      setRaidLive(true)
      const socket = new OnlineSocket<PartyRaidState>({
        url: res.wsUrl,
        onState: (state) => {
          if (state && typeof state === 'object' && 'bossHp' in state) {
            setActiveRaid(state as PartyRaidState)
          }
        },
      })
      raidSocketRef.current?.close()
      raidSocketRef.current = socket
      socket.connect()
      socket.send({
        type: 'join',
        member: { id: identity?.userId ?? 'usr_self', alias: identity?.alias ?? 'You' },
      })

      const seeded: PartyRaidState =
        res.raid ??
        ({
          id: res.raidId,
          bossKey: boss.key,
          bossName: boss.name,
          bossHp: boss.maxHp * 2,
          bossMaxHp: boss.maxHp * 2,
          partyHp: 500,
          partyMaxHp: 500,
          status: 'waiting',
          members: [],
          combatLog: [`Raid ${res.raidId} created on the live worker.`],
        } as PartyRaidState)
      setActiveRaid(seeded)
    },
  })

  const handleSyncPartyDamage = () => {
    if (!activeRaid) return

    // Live raid: every strike is broadcast to the Durable Object and echoed
    // back through onState — the server is the source of truth.
    if (raidLive && raidSocketRef.current) {
      raidSocketRef.current.send({
        type: 'attack',
        damage: 10 + Math.min(40, Math.floor((identity?.userId.length ?? 4) * 2)),
      })
      return
    }

    const damage = Math.floor(Math.random() * 25) + 15
    const newBossHp = Math.max(0, activeRaid.bossHp - damage)
    const isVictory = newBossHp === 0

    setActiveRaid({
      ...activeRaid,
      bossHp: newBossHp,
      status: isVictory ? 'victory' : activeRaid.status,
      members: activeRaid.members.map((m) =>
        m.id === (identity?.userId ?? 'usr_self')
          ? { ...m, damageDealt: m.damageDealt + damage }
          : m,
      ),
      combatLog: [
        ...activeRaid.combatLog,
        `${identity?.alias ?? 'You'} scored critical reviews dealing ${damage} damage!`,
        ...(isVictory ? [`🏆 Victory! The party vanquished ${activeRaid.bossName}!`] : []),
      ].slice(-20),
    })
  }

  return (
    <div className="space-y-6">
      {!activeRaid ? (
        <div className="space-y-4">
          <Panel className="space-y-3">
            <h3 className="font-bold flex items-center gap-2">
              <Swords className="h-4 w-4" /> Cooperative Party Boss Raids
            </h3>
            <p className="text-xs text-tertiary">
              Form a party of learners to take down massive world bosses. Every card reviewed by
              party members deals combined damage to the boss!
            </p>

            <div className="pt-2">
              <ChipPicker<string>
                label="Raid boss"
                items={Object.values(BOSS_ROSTER).map((boss) => ({
                  value: boss.key,
                  label: boss.name,
                  hint: `${boss.title} · ${boss.maxHp * 3} HP`,
                  icon: (
                    <span className="text-lg leading-none" aria-hidden="true">
                      {boss.avatar}
                    </span>
                  ),
                }))}
                value={selectedBoss}
                onChange={setSelectedBoss}
              />
            </div>

            <Button
              variant="primary"
              className="mt-4"
              disabled={createRaidMutation.isPending}
              onClick={() => createRaidMutation.mutate(selectedBoss)}
            >
              <Swords className="h-4 w-4" /> Launch Party Raid
            </Button>
          </Panel>
        </div>
      ) : (
        <Panel className="space-y-6 border-indigo-500/30">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Swords className="h-5 w-5 text-indigo-400" />
                Party Raid: {activeRaid.bossName}
              </h2>
              <p className="text-xs text-tertiary">
                Multiplayer encounter: coordinate review sprints with party members.
                {raidLive ? ' · LIVE (real worker)' : ' · OFFLINE SIMULATION'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Badge
                tone={
                  activeRaid.status === 'victory'
                    ? 'success'
                    : activeRaid.status === 'defeat'
                      ? 'danger'
                      : 'accent'
                }
              >
                {activeRaid.status.toUpperCase()}
              </Badge>
              {activeRaid.status === 'fighting' && (
                <Button variant="primary" onClick={handleSyncPartyDamage}>
                  <RefreshCw className="h-4 w-4" /> Deal Review Damage
                </Button>
              )}
              <Button variant="ghost" onClick={() => setActiveRaid(null)}>
                End Raid
              </Button>
            </div>
          </div>

          {/* Health Bars */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
              <div className="flex justify-between text-xs font-medium text-danger-text">
                <span className="flex items-center gap-1">
                  <Swords className="h-3.5 w-3.5" /> Colossus Boss HP
                </span>
                <span>
                  {activeRaid.bossHp} / {activeRaid.bossMaxHp} HP
                </span>
              </div>
              <ProgressBar
                value={activeRaid.bossHp / (activeRaid.bossMaxHp || 1)}
                className="[&>div]:bg-rose-500"
              />
            </div>

            <div className="space-y-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex justify-between text-xs font-medium text-status-success-text">
                <span className="flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5" /> Party Shared Health
                </span>
                <span>
                  {activeRaid.partyHp} / {activeRaid.partyMaxHp} HP
                </span>
              </div>
              <ProgressBar
                value={activeRaid.partyHp / (activeRaid.partyMaxHp || 1)}
                className="[&>div]:bg-emerald-500"
              />
            </div>
          </div>

          {/* Members */}
          <div className="space-y-2">
            <div className="label">Party Members</div>
            <div className="grid gap-2 sm:grid-cols-4">
              {activeRaid.members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg bg-neutral-100 p-2.5 text-xs dark:bg-(--hub-panel)"
                >
                  <OnlineIdentityLabel alias={m.alias} />
                  <span className="text-status-warning-text font-mono">+{m.damageDealt} dmg</span>
                </div>
              ))}
            </div>
          </div>

          {/* Combat Log */}
          <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-(--hub-border)">
            <div className="label">Raid Combat Log</div>
            <div className="max-h-36 overflow-y-auto space-y-1 text-xs text-faint">
              {activeRaid.combatLog.map((log, i) => (
                <div key={i} className="rounded bg-neutral-100 p-1.5 dark:bg-(--hub-sunken)">
                  {log}
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}
    </div>
  )
}

/* ========================================================================= */
/* 3. Community Library (Decks & Courses Browser)                            */
/* ========================================================================= */

function CommunityLibrarySection() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [importedId, setImportedId] = useState<string | null>(null)

  const libraryQuery = useQuery<{ ok: boolean; items: CommunityItem[] }>({
    queryKey: ['community-library', search, filterType],
    queryFn: () => {
      const p = new URLSearchParams()
      if (search) p.set('q', search)
      if (filterType) p.set('type', filterType)
      return apiGet(`/api/online/library?${p.toString()}`)
    },
  })

  const importMutation = useMutation({
    mutationFn: (item: CommunityItem) =>
      apiSend('/api/share/import', 'POST', { payload: item.shareString }),
    onSuccess: (_data, item) => {
      setImportedId(item.id)
      setTimeout(() => setImportedId(null), 3000)
      void qc.invalidateQueries({ queryKey: queryKeys.decks })
      void qc.invalidateQueries({ queryKey: ['curriculum-courses'] })
    },
  })

  const items = libraryQuery.data?.items ?? []

  return (
    <div className="space-y-6">
      <Panel className="space-y-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-bold">Community Library</h3>
            <p className="text-xs text-tertiary">
              Discover, download, and share community-curated decks and LHCF courses with 1-click
              import.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <TextField
              label="Search library"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, subject, or tag..."
            />
          </div>
          <SelectField
            label="Type Filter"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">All Materials</option>
            <option value="deck">Flashcard Decks</option>
            <option value="course">LHCF Curricula / Courses</option>
          </SelectField>
        </div>
      </Panel>

      {/* Items Grid */}
      {libraryQuery.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-hidden="true">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : libraryQuery.isError ? (
        <Callout tone="danger" title="Library unavailable">
          The community library could not be reached. Try refining your search or come back later.
        </Callout>
      ) : items.length === 0 ? (
        <EmptyState icon={<BookOpen className="h-8 w-8" />} title="Nothing in the library yet">
          No community materials match. Clear the search or share your own deck from the Library
          share panel.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <Panel key={item.id} className="flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <Badge tone={item.type === 'deck' ? 'accent' : 'success'}>
                    {item.type === 'deck' ? 'Deck' : 'Course'}
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-tertiary">
                    By{' '}
                    <OnlineIdentityLabel
                      alias={item.author}
                      verified={item.authorVerified}
                      className="text-xs text-tertiary"
                    />
                  </span>
                </div>
                <h4 className="mt-2 text-base font-bold">{item.title}</h4>
                <p className="mt-1 text-xs text-faint line-clamp-2">
                  {item.description || 'No description provided.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {item.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-tertiary dark:bg-(--hub-panel)"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-neutral-200 pt-3 dark:border-(--hub-border)">
                <span className="flex items-center gap-1 text-xs text-tertiary">
                  <Download className="h-3.5 w-3.5" /> {item.downloads} downloads
                </span>
                <Button
                  variant={importedId === item.id ? 'ghost' : 'primary'}
                  disabled={importMutation.isPending}
                  onClick={() => importMutation.mutate(item)}
                >
                  {importedId === item.id ? (
                    <>
                      <Check className="h-4 w-4 text-status-success-text" /> Imported!
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" /> Import to Library
                    </>
                  )}
                </Button>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}

/* ========================================================================= */
/* 4. Accountability Buddies & Inbox                                         */
/* ========================================================================= */

function BuddiesInboxSection(_props: { identity?: IdentityResponse['identity'] }) {
  const qc = useQueryClient()
  const [targetAlias, setTargetAlias] = useState('')
  const [customMsg, setCustomMsg] = useState('')

  const inboxQuery = useQuery<{
    ok: boolean
    messages: Array<{
      id: number
      kind: 'nudge' | 'invite' | 'achievement'
      senderAlias: string
      content: string
      read: boolean
      receivedAt: string
    }>
  }>({
    queryKey: ['online-inbox'],
    queryFn: () => apiGet('/api/online/buddies'),
  })

  const sendNudgeMutation = useMutation({
    mutationFn: (data: { action: 'nudge' | 'invite'; targetAlias: string; message: string }) =>
      apiSend('/api/online/buddies', 'POST', data),
    onSuccess: () => {
      setTargetAlias('')
      setCustomMsg('')
      void qc.invalidateQueries({ queryKey: ['online-inbox'] })
    },
  })

  const markReadMutation = useMutation({
    mutationFn: (id: number) => apiSend('/api/online/buddies', 'POST', { action: 'mark_read', id }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['online-inbox'] })
    },
  })

  const messages = inboxQuery.data?.messages ?? []

  return (
    <div className="space-y-6">
      {/* Send Nudge Form */}
      <Panel className="space-y-4">
        <h3 className="font-bold flex items-center gap-2">
          <UserCheck className="h-4 w-4" /> Accountability Buddy Nudges
        </h3>
        <p className="text-xs text-tertiary">
          Support your study partners with friendly streak reminders or room study invites.
        </p>

        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!targetAlias.trim()) return
            sendNudgeMutation.mutate({
              action: 'nudge',
              targetAlias: targetAlias.trim(),
              message: customMsg.trim(),
            })
          }}
        >
          <TextField
            label="Buddy Alias"
            value={targetAlias}
            onChange={(e) => setTargetAlias(e.target.value)}
            placeholder="e.g. Alice"
          />
          <TextField
            label="Custom Cheer / Note (Optional)"
            value={customMsg}
            onChange={(e) => setCustomMsg(e.target.value)}
            placeholder="Keep your daily streak going!"
          />
          <div className="flex items-end">
            <Button
              variant="primary"
              className="w-full"
              disabled={!targetAlias.trim() || sendNudgeMutation.isPending}
            >
              <Send className="h-4 w-4" /> Send Study Nudge
            </Button>
          </div>
        </form>
      </Panel>

      {/* Inbox */}
      <Panel className="space-y-3">
        <h4 className="font-bold text-sm flex items-center gap-2">
          <Bell className="h-4 w-4" /> Inbox & Study Nudges
        </h4>

        {inboxQuery.isPending ? (
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : inboxQuery.isError ? (
          <Callout tone="danger" title="Inbox unavailable">
            Nudges and invitations could not be loaded.
          </Callout>
        ) : messages.length === 0 ? (
          <EmptyState icon={<Bell className="h-8 w-8" />} title="Inbox zero">
            No nudges or invitations received yet. Send a study nudge to a buddy above.
          </EmptyState>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-(--hub-border)">
            {messages.map((msg) => (
              <div key={msg.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone={msg.kind === 'nudge' ? 'warning' : 'accent'}>
                      {msg.kind.toUpperCase()}
                    </Badge>
                    <span className="font-semibold">{msg.senderAlias}</span>
                    <span className="text-tertiary">
                      {new Date(msg.receivedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 text-secondary">{msg.content}</p>
                </div>

                {!msg.read && (
                  <Button variant="ghost" onClick={() => markReadMutation.mutate(msg.id)}>
                    Mark Read
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

/* ========================================================================= */
/* 5. Study Clans & Guild Houses (Pooled Clan XP & Level Perks)              */
/* ========================================================================= */

interface GuildItem {
  id: number
  name: string
  tag: string
  description?: string
  totalXp: number
  level: number
  avatarEmoji: string
}

function GuildsSection({ identity }: { identity?: IdentityResponse['identity'] }) {
  const qc = useQueryClient()
  const [selectedGuildId, setSelectedGuildId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [description, setDescription] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const guildsQuery = useQuery<{ ok: boolean; guilds: GuildItem[] }>({
    queryKey: ['guilds-list'],
    queryFn: () => apiGet<{ ok: boolean; guilds: GuildItem[] }>('/api/social/guilds'),
  })

  const guildDetailQuery = useQuery<{
    ok: boolean
    guild: GuildItem
    members: Array<{ id: number; alias: string; role: string; xpContributed: number }>
  }>({
    queryKey: ['guild-detail', selectedGuildId],
    queryFn: () => apiGet(`/api/social/guilds?id=${selectedGuildId}`),
    enabled: selectedGuildId !== null,
  })

  const createMutation = useMutation({
    mutationFn: () =>
      apiSend('/api/social/guilds', 'POST', {
        action: 'create',
        name: name.trim(),
        tag: tag.trim().toUpperCase(),
        description: description.trim() || undefined,
        leaderAlias: identity?.alias || 'Leader',
      }),
    onSuccess: () => {
      setName('')
      setTag('')
      setDescription('')
      setShowCreate(false)
      void qc.invalidateQueries({ queryKey: ['guilds-list'] })
    },
  })

  const joinMutation = useMutation({
    mutationFn: (guildId: number) =>
      apiSend('/api/social/guilds', 'POST', {
        action: 'join',
        guildId,
        alias: identity?.alias || 'Learner',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['guilds-list'] })
      void qc.invalidateQueries({ queryKey: ['guild-detail'] })
    },
  })

  const contributeMutation = useMutation({
    mutationFn: (guildId: number) =>
      apiSend('/api/social/guilds', 'POST', {
        action: 'contribute',
        guildId,
        alias: identity?.alias || 'Learner',
        xp: 100,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['guilds-list'] })
      void qc.invalidateQueries({ queryKey: ['guild-detail'] })
    },
  })

  const guilds = guildsQuery.data?.guilds ?? []
  // GSAP moment: the selected clan's pooled XP counts up when its banner opens
  // (SSR renders the final number; reduced-motion keeps it static).
  const clanXp = guildDetailQuery.data?.guild.totalXp ?? 0
  const clanXpRef = useGsapCountUp(clanXp)

  return (
    <div className="space-y-6">
      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Study Clans & Guild Houses</h2>
            <p className="text-xs text-faint">
              Form or join a study clan. Pool recall XP to level up your clan and unlock
              collaborative study perks.
            </p>
          </div>
          <Button onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4" /> {showCreate ? 'Close Form' : 'Found New Clan'}
          </Button>
        </div>

        {showCreate && (
          <div className="space-y-3 rounded-xl border border-(--hub-border) bg-(--hub-panel-2) p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
              Found a Study Clan
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                label="Clan Name"
                placeholder="e.g. Oxford Scholars"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <TextField
                label="Clan Tag (2-6 letters)"
                placeholder="e.g. OXF"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
              />
            </div>
            <TextField
              label="Mission Description"
              placeholder="Daily deliberate recall practice in STEM & literature"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Button
              disabled={!name.trim() || !tag.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Found Clan
            </Button>
          </div>
        )}

        {/* Guilds List */}
        {guildsQuery.isPending ? (
          <div className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : guildsQuery.isError ? (
          <Callout tone="danger" title="Clans unavailable">
            The clan roster could not be loaded. Founding a clan still works once the service is
            back.
          </Callout>
        ) : guilds.length === 0 ? (
          <EmptyState icon={<Shield className="h-8 w-8" />} title="No clans yet">
            Found the first study clan and invite your buddies to pool XP.
          </EmptyState>
        ) : (
          <div className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-3">
            {guilds.map((g) => (
              <div
                key={g.id}
                onClick={() => setSelectedGuildId(g.id)}
                className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                  selectedGuildId === g.id
                    ? 'border-indigo-500 bg-indigo-500/10'
                    : 'border-(--hub-border) bg-(--hub-panel-2) hover:border-indigo-400'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{g.avatarEmoji}</span>
                    <div>
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        <span>{g.name}</span>
                        <span className="rounded bg-(--hub-border) px-1.5 py-0.5 font-mono text-xs text-tertiary">
                          [{g.tag}]
                        </span>
                      </div>
                      <div className="text-xs text-faint">Level {g.level} Clan</div>
                    </div>
                  </div>
                  <Badge tone="accent">+{g.level * 2}% XP</Badge>
                </div>

                {g.description && (
                  <p className="mt-2 text-xs text-faint line-clamp-2">{g.description}</p>
                )}

                <div className="mt-3 flex items-center justify-between text-xs text-tertiary">
                  <span>{g.totalXp.toLocaleString()} Total XP</span>
                  <span className="text-hub-accent">View Roster →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* Selected Guild Detail Modal / Banner */}
      {selectedGuildId && guildDetailQuery.data?.guild && (
        <Panel className="space-y-4 border-indigo-500/40 bg-hub-accent/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{guildDetailQuery.data.guild.avatarEmoji}</span>
              <div>
                <div className="flex items-center gap-2 text-lg font-bold">
                  <span>{guildDetailQuery.data.guild.name}</span>
                  <Badge tone="accent">[{guildDetailQuery.data.guild.tag}]</Badge>
                </div>
                <p className="text-xs text-faint">
                  Level {guildDetailQuery.data.guild.level} Clan ·{' '}
                  <span ref={clanXpRef} className="tabular-nums">
                    {guildDetailQuery.data.guild.totalXp}
                  </span>{' '}
                  Cumulative Study XP
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => contributeMutation.mutate(selectedGuildId)}
                disabled={contributeMutation.isPending}
              >
                <Zap className="h-3.5 w-3.5 text-status-warning-text" /> Contribute 100 XP
              </Button>
              <Button
                onClick={() => joinMutation.mutate(selectedGuildId)}
                disabled={joinMutation.isPending}
              >
                <Shield className="h-3.5 w-3.5" /> Join Clan
              </Button>
            </div>
          </div>

          {/* Members Table */}
          <div className="pt-2 space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-faint">
              Clan Roster ({guildDetailQuery.data.members?.length ?? 0} Scholars)
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {(guildDetailQuery.data.members ?? []).map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-(--hub-border) bg-(--hub-panel-2) p-2.5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-strong">{m.alias}</span>
                    <span className="rounded bg-(--hub-border) px-1.5 py-0.5 uppercase text-tertiary">
                      {m.role}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-hub-accent">
                    {m.xpContributed.toLocaleString()} XP
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}
    </div>
  )
}
