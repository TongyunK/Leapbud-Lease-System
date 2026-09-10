import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fetchNavMenus } from '@/api/menus'
import type { MenuRecord } from '@/types/menu'

function collectRouteNames(nodes: MenuRecord[], out = new Set<string>()) {
  for (const n of nodes) {
    if (n.type === 'menu' && n.routeName) out.add(n.routeName)
    if (n.children?.length) collectRouteNames(n.children, out)
  }
  return out
}

function findOpenIds(nodes: MenuRecord[], routeName: string, trail: string[] = []): string[] | null {
  for (const n of nodes) {
    const next = [...trail, n.id]
    if (n.type === 'menu' && n.routeName === routeName) return trail
    if (n.children?.length) {
      const hit = findOpenIds(n.children, routeName, next)
      if (hit) return hit
    }
  }
  return null
}

export const useNavStore = defineStore('nav', () => {
  const tree = ref<MenuRecord[]>([])
  const loading = ref(false)
  const loaded = ref(false)
  const revision = ref(0)

  const routeNames = computed(() => collectRouteNames(tree.value))

  async function loadNav() {
    loading.value = true
    try {
      const { data } = await fetchNavMenus()
      tree.value = Array.isArray(data) ? data : []
      loaded.value = true
      revision.value += 1
    } catch {
      tree.value = []
      loaded.value = false
    } finally {
      loading.value = false
    }
  }

  function clear() {
    tree.value = []
    loaded.value = false
    revision.value += 1
  }

  function openIdsForRoute(routeName: string): string[] {
    return findOpenIds(tree.value, routeName) || []
  }

  function hasRoute(routeName: string) {
    return routeNames.value.has(routeName)
  }

  return {
    tree,
    loading,
    loaded,
    revision,
    routeNames,
    loadNav,
    clear,
    openIdsForRoute,
    hasRoute,
  }
})
