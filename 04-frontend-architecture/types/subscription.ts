export interface PackDto {
  _id: string
  year: number
  name: string
  startDate: string
  endDate: string
  price: number
  stripeProductId?: string
  stripePriceId?: string
  appleProductId?: string
  androidProductId?: string
  gallops?: number[]
  isActive: boolean
  isLegacy: boolean
  createdAt?: string
  updatedAt?: string
}

export interface UserPackAccessDto {
  packId: string
  packName: string
  year: number
  expiresAt: string | null
  isActive: boolean
}

export enum SubscriptionType {
  LEGACY_LIFETIME = 'LEGACY_LIFETIME',
  EARLY_BIRD_LIFETIME = 'EARLY_BIRD_LIFETIME',
  LOYALTY_LIFETIME = 'LOYALTY_LIFETIME',
  ANNUAL = 'ANNUAL',
}

export interface ClassScopeDto {
  gallops: number[]
  knowledges: number[]
}

export interface SubscriptionAccessDto {
  hasActiveSubscription: boolean
  isLifetime: boolean
  subscriptionType?: SubscriptionType | null
  packs: UserPackAccessDto[]
  classScope?: ClassScopeDto | null
  expiresAt?: string | null
  consecutivePurchases?: number
  hasClubhouseAccess?: boolean
}

export interface GetPacksAPIResponse {
  message: string
  data: PackDto[]
}

export interface GetSubscriptionAccessAPIResponse {
  message: string
  data: SubscriptionAccessDto
}
