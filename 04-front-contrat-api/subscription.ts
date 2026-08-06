import type {
  GetPacksAPIResponse,
  GetSubscriptionAccessAPIResponse,
  PackDto,
  SubscriptionAccessDto,
} from '@/types/subscription'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export const useSubscriptionStore = defineStore('subscription', () => {
  const access = ref<SubscriptionAccessDto | null>(null)
  const availablePacks = ref<PackDto[]>([])
  const availableTiers = ref<PackDto[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Rétro-compatibilité : retourne true si l'utilisateur a un accès premium actif
   */
  const isPremium = computed((): boolean => {
    return access.value?.hasActiveSubscription || false
  })

  /**
   * Vérifie si l'utilisateur a un accès à vie
   */
  const isLifetime = computed((): boolean => {
    return access.value?.isLifetime || false
  })

  /**
   * Type de subscription (LEGACY_LIFETIME, EARLY_BIRD_LIFETIME, etc.)
   */
  const subscriptionType = computed((): string | null => {
    return access.value?.subscriptionType || null
  })

  const classScope = computed(() => access.value?.classScope || null)

  /**
   * Packs actifs auxquels l'utilisateur a accès
   */
  const activePacks = computed((): PackDto[] => {
    if (!access.value)
      return []
    return access.value.packs
      .filter(pack => pack.isActive)
      .map((userPack) => {
        // Trouver le pack correspondant (globaux dans availablePacks, paliers dans
        // availableTiers) pour avoir toutes les infos, dont gallops.
        const fullPack = availablePacks.value.find(p => p._id === userPack.packId)
          || availableTiers.value.find(p => p._id === userPack.packId)
        return fullPack || ({
          _id: userPack.packId,
          name: userPack.packName,
          year: userPack.year,
        } as PackDto)
      })
  })

  /**
   * Date d'expiration de l'accès (null si lifetime)
   */
  const expiresAt = computed((): string | null => {
    return access.value?.expiresAt || null
  })

  /**
   * Nombre d'achats consécutifs (pour progression vers lifetime)
   */
  const consecutivePurchases = computed((): number => {
    return access.value?.consecutivePurchases || 0
  })

  const hasClubhouseAccess = computed((): boolean => {
    return (access.value as any)?.hasClubhouseAccess || false
  })

  /**
   * Packs disponibles à l'achat (actifs)
   */
  const packsForPurchase = computed((): PackDto[] => {
    return availablePacks.value.filter(pack => pack.isActive)
  })

  /**
   * Récupère le statut d'accès de l'utilisateur
   */
  async function fetchMyAccess(force = false) {
    // Ne pas refetch si déjà chargé (sauf si force = true)
    if (!force && access.value)
      return

    isLoading.value = true
    error.value = null

    try {
      const { apiFetch } = useApi()
      const response = await apiFetch<GetSubscriptionAccessAPIResponse>('/subscriptions/my-access')

      if (response && response.data) {
        access.value = response.data
      }
    }
    catch (err: any) {
      console.error('Failed to fetch subscription access:', err)
      error.value = err.message || 'Failed to fetch subscription access'

      // En cas d'erreur, mettre un état par défaut (non premium)
      access.value = {
        hasActiveSubscription: false,
        isLifetime: false,
        packs: [],
      }
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * Récupère les packs disponibles à l'achat
   */
  async function fetchAvailablePacks(force = false) {
    // Ne pas refetch si déjà chargé (sauf si force = true)
    if (!force && availablePacks.value.length > 0)
      return

    isLoading.value = true
    error.value = null

    try {
      const config = useRuntimeConfig()

      const response = await $fetch<PackDto[] | GetPacksAPIResponse>(
        `${config.public.baseUrl}/packs/active`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )

      // Handle both array response and object with data property
      if (Array.isArray(response)) {
        availablePacks.value = response
      }
      else if (response && response.data) {
        availablePacks.value = response.data
      }
    }
    catch (err: any) {
      console.error('Failed to fetch available packs:', err)
      error.value = err.message || 'Failed to fetch available packs'
      availablePacks.value = []
    }
    finally {
      isLoading.value = false
    }
  }

  async function fetchAvailableTiers(force = false) {
    if (!force && availableTiers.value.length > 0)
      return

    try {
      const config = useRuntimeConfig()

      const response = await $fetch<PackDto[] | GetPacksAPIResponse>(
        `${config.public.baseUrl}/packs/tiers`,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      )

      if (Array.isArray(response))
        availableTiers.value = response
      else if (response && response.data)
        availableTiers.value = response.data
    }
    catch (err: any) {
      console.error('Failed to fetch available tiers:', err)
      availableTiers.value = []
    }
  }

  /**
   * Vérifie si l'utilisateur a accès à un pack spécifique
   */
  function hasPackAccess(packId: string): boolean {
    if (!access.value)
      return false

    return access.value.packs.some(
      pack => pack.packId === packId && pack.isActive,
    )
  }

  /**
   * Reset le store (utile pour logout)
   */
  function reset() {
    access.value = null
    availablePacks.value = []
    availableTiers.value = []
    isLoading.value = false
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
