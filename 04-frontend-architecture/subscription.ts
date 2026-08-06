import type {
  GetPacksAPIResponse,
  GetSubscriptionAccessAPIResponse,
  PackDto,
  SubscriptionAccessDto,
} from '@/types/subscription'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type ActivePack = Pick<PackDto, '_id' | 'name' | 'year'> & Partial<PackDto>

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

export const useSubscriptionStore = defineStore('subscription', () => {
  const access = ref<SubscriptionAccessDto | null>(null)
  const availablePacks = ref<PackDto[]>([])
  const availableTiers = ref<PackDto[]>([])
  const pending = ref(0)
  const error = ref<string | null>(null)

  const isLoading = computed(() => pending.value > 0)

  const isPremium = computed((): boolean => {
    return access.value?.hasActiveSubscription || false
  })

  const isLifetime = computed((): boolean => {
    return access.value?.isLifetime || false
  })

  const subscriptionType = computed((): string | null => {
    return access.value?.subscriptionType || null
  })

  const classScope = computed(() => access.value?.classScope || null)

  const activePacks = computed((): ActivePack[] => {
    if (!access.value)
      return []
    return access.value.packs
      .filter(pack => pack.isActive)
      .map((userPack) => {
        const fullPack = availablePacks.value.find(p => p._id === userPack.packId)
          || availableTiers.value.find(p => p._id === userPack.packId)
        return fullPack || {
          _id: userPack.packId,
          name: userPack.packName,
          year: userPack.year,
        }
      })
  })

  const expiresAt = computed((): string | null => {
    return access.value?.expiresAt || null
  })

  const consecutivePurchases = computed((): number => {
    return access.value?.consecutivePurchases || 0
  })

  const hasClubhouseAccess = computed((): boolean => {
    return access.value?.hasClubhouseAccess || false
  })

  const packsForPurchase = computed((): PackDto[] => {
    return availablePacks.value.filter(pack => pack.isActive)
  })

  async function fetchMyAccess(force = false) {
    if (!force && access.value)
      return

    pending.value++
    error.value = null

    try {
      const { apiFetch } = useApi()
      const response = await apiFetch<GetSubscriptionAccessAPIResponse>('/subscriptions/my-access')

      if (response && response.data) {
        access.value = response.data
      }
    }
    catch (err: unknown) {
      console.error('Failed to fetch subscription access:', err)
      error.value = messageOf(err, 'Failed to fetch subscription access')

      access.value = {
        hasActiveSubscription: false,
        isLifetime: false,
        packs: [],
      }
    }
    finally {
      pending.value--
    }
  }

  async function fetchAvailablePacks(force = false) {
    if (!force && availablePacks.value.length > 0)
      return

    pending.value++
    error.value = null

    try {
      const { apiFetch } = useApi()

      const response = await apiFetch<PackDto[] | GetPacksAPIResponse>('/packs/active', {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // Handle both array response and object with data property
      if (Array.isArray(response)) {
        availablePacks.value = response
      }
      else if (response && response.data) {
        availablePacks.value = response.data
      }
    }
    catch (err: unknown) {
      console.error('Failed to fetch available packs:', err)
      error.value = messageOf(err, 'Failed to fetch available packs')
      availablePacks.value = []
    }
    finally {
      pending.value--
    }
  }

  async function fetchAvailableTiers(force = false) {
    if (!force && availableTiers.value.length > 0)
      return

    pending.value++

    try {
      const { apiFetch } = useApi()

      const response = await apiFetch<PackDto[] | GetPacksAPIResponse>('/packs/tiers', {
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (Array.isArray(response))
        availableTiers.value = response
      else if (response && response.data)
        availableTiers.value = response.data
    }
    catch (err: unknown) {
      console.error('Failed to fetch available tiers:', err)
      error.value = messageOf(err, 'Failed to fetch available tiers')
      availableTiers.value = []
    }
    finally {
      pending.value--
    }
  }

  function hasPackAccess(packId: string): boolean {
    if (!access.value)
      return false

    return access.value.packs.some(
      pack => pack.packId === packId && pack.isActive,
    )
  }

  function reset() {
    access.value = null
    availablePacks.value = []
    availableTiers.value = []
    pending.value = 0
    error.value = null
  }

  return {
    access,
    availablePacks,
    availableTiers,
    isLoading,
    error,

    isPremium,
    isLifetime,
    subscriptionType,
    classScope,
    activePacks,
    expiresAt,
    consecutivePurchases,
    hasClubhouseAccess,
    packsForPurchase,

    fetchMyAccess,
    fetchAvailablePacks,
    fetchAvailableTiers,
    hasPackAccess,
    reset,
  }
})
