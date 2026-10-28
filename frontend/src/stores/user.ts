import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { loginApi, type LoginPayload } from '@/api/auth'
import { fetchMyPermissionsApi } from '@/api/permissions'
import type { UserStatus } from '@/types/user'

const TOKEN_KEY = 'lb_token'
const USER_KEY = 'lb_user'
const PERMS_KEY = 'lb_permissions'
const ADMIN_EXCLUSIVE_KEY = 'lb_admin_exclusive_perms'

export interface UserInfo {
  id: string
  account: string
  displayName?: string
  role?: string
  roleName?: string
  roles?: string[]
  status?: UserStatus
}

function readStoredUser(): UserInfo | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as UserInfo) : null
  } catch {
    return null
  }
}

function readStoredPermissions(): string[] {
  try {
    const raw = localStorage.getItem(PERMS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

function readStoredAdminExclusive(): string[] {
  try {
    const raw = localStorage.getItem(ADMIN_EXCLUSIVE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export const useUserStore = defineStore('user', () => {
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const user = ref<UserInfo | null>(readStoredUser())
  const permissions = ref<string[]>(readStoredPermissions())
  /** 当前无任何非 superAdmin 角色拥有的权限码（仅超级管理员会话有意义，用于描边） */
  const adminExclusiveCodes = ref<string[]>(readStoredAdminExclusive())

  const isLoggedIn = computed(() => Boolean(token.value))
  const role = computed(() => (user.value?.role ? String(user.value.role) : null))
  /** 角色编码为 superAdmin（大小写不敏感）；专用于行内改字段等敏感能力 */
  const isSuperAdmin = computed(
    () => String(role.value || '').trim().toLowerCase() === 'superadmin',
  )
  /** admin 或 superAdmin：系统管理与全大厦权限 */
  const isAdmin = computed(() => {
    const r = String(role.value || '').trim().toLowerCase()
    return r === 'admin' || r === 'superadmin'
  })

  function setPermissions(codes: string[]) {
    permissions.value = [...new Set(codes.map(String))]
    localStorage.setItem(PERMS_KEY, JSON.stringify(permissions.value))
  }

  function setAdminExclusiveCodes(codes: string[]) {
    adminExclusiveCodes.value = [...new Set(codes.map(String))]
    if (adminExclusiveCodes.value.length) {
      localStorage.setItem(ADMIN_EXCLUSIVE_KEY, JSON.stringify(adminExclusiveCodes.value))
    } else {
      localStorage.removeItem(ADMIN_EXCLUSIVE_KEY)
    }
  }

  function can(code: string): boolean {
    if (!code) return false
    // 仅超级管理员默认全权限；管理员与其它角色一律看权限表
    if (isSuperAdmin.value) return true
    return permissions.value.includes(code)
  }

  /** 超级管理员登录时：该功能码目前只有 superAdmin 拥有（用于发光描边提示） */
  function isAdminExclusive(code: string): boolean {
    if (!isSuperAdmin.value || !code) return false
    return adminExclusiveCodes.value.includes(code)
  }

  function setSession(accessToken: string, userInfo: UserInfo) {
    const roleCode = userInfo.role ? String(userInfo.role) : undefined
    const normalized: UserInfo = {
      ...userInfo,
      role: roleCode,
      roles: userInfo.roles?.length ? userInfo.roles : roleCode ? [roleCode] : undefined,
    }
    token.value = accessToken
    user.value = normalized
    localStorage.setItem(TOKEN_KEY, accessToken)
    localStorage.setItem(USER_KEY, JSON.stringify(normalized))
  }

  async function loadPermissions() {
    if (!token.value) {
      setPermissions([])
      setAdminExclusiveCodes([])
      return []
    }
    try {
      const { data } = await fetchMyPermissionsApi()
      const codes = data?.codes ?? []
      setPermissions(codes)
      setAdminExclusiveCodes(isSuperAdmin.value ? (data?.adminExclusiveCodes ?? []) : [])
      return codes
    } catch {
      return permissions.value
    }
  }

  async function login(payload: LoginPayload) {
    const result = await loginApi(payload)
    setSession(result.accessToken, result.user)
    await loadPermissions()
    return result
  }

  function logout() {
    token.value = null
    user.value = null
    permissions.value = []
    adminExclusiveCodes.value = []
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(PERMS_KEY)
    localStorage.removeItem(ADMIN_EXCLUSIVE_KEY)
  }

  return {
    token,
    user,
    permissions,
    adminExclusiveCodes,
    isLoggedIn,
    role,
    isAdmin,
    isSuperAdmin,
    can,
    isAdminExclusive,
    login,
    logout,
    setSession,
    loadPermissions,
    setPermissions,
    setAdminExclusiveCodes,
  }
})
