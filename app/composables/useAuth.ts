/**
 * 客户端认证状态管理
 *
 * 提供当前用户信息和登录/登出操作
 */

/** 用户信息 */
export interface AuthState {
  bilibiliUid: string
  bilibiliUname: string
  bilibiliFace: string | null
}

/** 全局认证状态（模块级单例） */
const user = ref<AuthState | null>(null)
const loading = ref(false)

/** 获取当前用户信息 */
export function useAuth() {
  /** 初始化：从服务端获取用户状态 */
  async function fetchUser() {
    if (loading.value) return
    loading.value = true
    try {
      const data = await $fetch<{ user: AuthState | null }>('/api/auth/user')
      user.value = data.user
    } catch {
      user.value = null
    } finally {
      loading.value = false
    }
  }

  /** 退出登录 */
  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  /** 登录成功后刷新状态 */
  async function onLoginSuccess() {
    await fetchUser()
  }

  return {
    user: readonly(user),
    loading: readonly(loading),
    isLoggedIn: computed(() => !!user.value),
    fetchUser,
    logout,
    onLoginSuccess,
  }
}
