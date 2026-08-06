import type { PackDto, SubscriptionAccessDto, UserPackAccessDto } from '@/types/subscription'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSubscriptionStore } from './subscription'

const tierPack = (overrides: Partial<PackDto> = {}): PackDto => ({
  _id: 'pack_g34',
  year: 2026,
  name: 'Pack Galops 3-4 2026-2027',
  startDate: '2026-09-01',
  endDate: '2027-08-31',
  price: 19.99,
  gallops: [3, 4],
  isActive: true,
  isLegacy: false,
  ...overrides,
})

const userPack = (overrides: Partial<UserPackAccessDto> = {}): UserPackAccessDto => ({
  packId: 'pack_g34',
  packName: 'Pack Galops 3-4',
  year: 2026,
  expiresAt: null,
  isActive: true,
  ...overrides,
})

const access = (overrides: Partial<SubscriptionAccessDto> = {}): SubscriptionAccessDto => ({
  hasActiveSubscription: true,
  isLifetime: false,
  packs: [],
  ...overrides,
})

describe('useSubscriptionStore : état dérivé', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('activePacks : un pack de palier conserve ses galops après reconstitution', () => {
    const store = useSubscriptionStore()
    store.availableTiers = [tierPack()]
    store.access = access({ packs: [userPack()] })

    expect(store.activePacks).toHaveLength(1)
    expect(store.activePacks[0]?.gallops).toEqual([3, 4])
  })

  it('activePacks : un pack absent du catalogue reste dans la liste, en dégradé', () => {
    const store = useSubscriptionStore()
    store.access = access({
      packs: [userPack({ packId: 'pack_2019', packName: 'Pack 2019', year: 2019 })],
    })

    expect(store.activePacks).toHaveLength(1)
    expect(store.activePacks[0]?.name).toBe('Pack 2019')
    expect(store.activePacks[0]?.gallops).toBeUndefined()
  })

  it('reset : aucun droit ne survit à une déconnexion', () => {
    const store = useSubscriptionStore()
    store.availableTiers = [tierPack()]
    store.access = access({
      isLifetime: true,
      hasClubhouseAccess: true,
      packs: [userPack()],
    })
    expect(store.isPremium).toBe(true)

    store.reset()

    expect(store.isPremium).toBe(false)
    expect(store.isLifetime).toBe(false)
    expect(store.hasClubhouseAccess).toBe(false)
    expect(store.activePacks).toEqual([])
  })
})
