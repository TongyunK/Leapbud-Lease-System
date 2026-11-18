import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fetchRoleMenuMatrixApi } from '@/api/roles'

export type MenuAccessRole = {
  id: string
  code: string
  name: string
}

/** SuperAdmin 侧栏：菜单 → 已开放角色（来自菜单权限矩阵） */
export const useMenuRoleAccessStore = defineStore('menuRoleAccess', () => {
  const loaded = ref(false)
  const loading = ref(false)
  const rolesByMenuId = ref<Record<string, MenuAccessRole[]>>({})

  const ready = computed(() => loaded.value)

  function rolesOf(menuId: string): MenuAccessRole[] {
    return rolesByMenuId.value[menuId] || []
  }

  function countOf(menuId: string): number {
    return rolesOf(menuId).length
  }

  async function load(force = false) {
    if (loading.value) return
    if (loaded.value && !force) return
    loading.value = true
    try {
      const { data } = await fetchRoleMenuMatrixApi()
      const roles = data?.roles || []
      const roleMap = new Map(roles.map((r) => [r.id, r]))
      const grants = data?.grants || {}
      const next: Record<string, MenuAccessRole[]> = {}

      for (const [roleId, menuIds] of Object.entries(grants)) {
        const role = roleMap.get(roleId)
        if (!role) continue
        const item: MenuAccessRole = {
          id: role.id,
          code: role.code,
          name: role.name || role.code,
        }
        for (const menuId of menuIds || []) {
          if (!menuId) continue
          const list = (next[menuId] ||= [])
          if (!list.some((x) => x.id === item.id)) list.push(item)
        }
      }

      for (const list of Object.values(next)) {
        list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
      }
      rolesByMenuId.value = next
      loaded.value = true
    } catch {
      /* 无菜单读权限时静默；侧栏不显示徽章 */
      rolesByMenuId.value = {}
      loaded.value = false
    } finally {
      loading.value = false
    }
  }

  async function reload() {
    await load(true)
  }

  function clear() {
    loaded.value = false
    loading.value = false
    rolesByMenuId.value = {}
  }

  return {
    loaded,
    loading,
    ready,
    rolesByMenuId,
    rolesOf,
    countOf,
    load,
    reload,
    clear,
  }
})
