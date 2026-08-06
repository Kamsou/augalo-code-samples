export default defineNuxtRouteMiddleware(async (to) => {
  const { isAuthenticated } = useAuthCookies()

  const publicPages = ['login', 'register', 'index', 'forgot-password', 'new-password']

  if (!isAuthenticated.value && !publicPages.includes(to.name as string)) {
    return navigateTo('/login')
  }

  if (isAuthenticated.value && ['login', 'register', 'index'].includes(to.name as string) && to.query.from !== 'teacher') {
    return navigateTo('/training')
  }
})
