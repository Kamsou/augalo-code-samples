export default defineNuxtRouteMiddleware(async () => {
  const userStore = useUserStore()
  const { userToken } = useAuthCookies()

  if (!userToken.value) {
    return navigateTo('/login')
  }

  if (!userStore.user._id) {
    await userStore.fetchUser()
  }

  if (userStore.user.role !== 'teacher') {
    return navigateTo('/training')
  }
})
