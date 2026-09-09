import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loginApi, type LoginPayload } from '@/api/auth'
import type { UserRole } from '@/types/user'

const TOKEN_KEY = 'lb_token'
const USER_KEY = 'lb_user'

export interface UserInfo {
  id: string
  account: string
  displayName?: string
  role?: UserRole | string
  roles?: string[]
}

function readStoredUser(): UserInfo | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as UserInfo) : null
  } catch {
    return null
  }
}

function resolveRole(user: UserInfo | null): UserRole | null {
  if (!user) return null
  if (user.role === 'admin' || user.role === 'user') return user.role
  const fromRoles = user.roles?.find((r) => r === 'admin' || r === 'user')
  return (fromRoles as UserRole | undefined) || null
}

export const useUserStore = defineStore('user', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<UserInfo | null>(readStoredUser())

  const isLoggedIn = computed(() => Boolean(token.value))
  const role = computed(() => resolveRole(user.value))
  /** 工程师/管理员：可访问系统管理、用户管理 */
  const isAdmin = computed(() => role.value === 'admin')

  function setSession(accessToken: string, userInfo: UserInfo) {
    const normalized: UserInfo = {
      ...userInfo,
      role: resolveRole(userInfo) || undefined,
      roles: userInfo.roles?.length
        ? userInfo.roles
        : userInfo.role
          ? [String(userInfo.role)]
          : undefined,
    }
    token.value = accessToken
    user.value = normalized
    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(USER_KEY, JSON.stringify(normalized))
  }

  async function login(payload: LoginPayload) {
    const result = await loginApi(payload)
    setSession(result.accessToken, result.user)
    return result
  }

  function logout() {
    token.value = null
    user.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  return {
    token,
    user,
    isLoggedIn,
    role,
    isAdmin,
    login,
    logout,
    setSession,
  }
})
