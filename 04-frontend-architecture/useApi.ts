let isLoggingOut = false

export function useApi() {
  const config = useRuntimeConfig()
  const { isAuthenticated, userId, userToken } = useAuthCookies()

  function getBaseUrl() {
    return config.public.baseUrl as string
  }

  function getAuthHeaders() {
    return {
      Authorization: `Bearer ${userToken.value || ''}`,
    }
  }

  async function handleUnauthorized() {
    if (isLoggingOut)
      return
    isLoggingOut = true
    try {
      isAuthenticated.value = null
      userId.value = null
      userToken.value = null
      await navigateTo('/login')
    }
    finally {
      setTimeout(() => {
        isLoggingOut = false
      }, 2000)
    }
  }

  async function apiFetch<T = unknown>(path: string, options: Parameters<typeof $fetch>[1] = {}): Promise<T> {
    const baseUrl = getBaseUrl()
    const url = path.startsWith('http') ? path : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`

    try {
      return await $fetch<T>(url, {
        ...options,
        headers: {
          ...getAuthHeaders(),
          ...options.headers,
        },
      })
    }
    catch (error: unknown) {
      const err = error as { statusCode?: number, status?: number }
      if (err?.statusCode === 401 || err?.status === 401) {
        await handleUnauthorized()
      }
      throw error
    }
  }

  return {
    getBaseUrl,
    getAuthHeaders,
    apiFetch,
  }
}
