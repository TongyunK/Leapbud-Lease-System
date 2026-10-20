import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fetchBuildings } from '@/api/buildings'
import type { BuildingRecord } from '@/types/building'

export const BUILDING_SCOPE_KEY = 'lb_current_building'

export const useBuildingScopeStore = defineStore('buildingScope', () => {
  const buildings = ref<BuildingRecord[]>([])
  const selectedId = ref<string | null>(localStorage.getItem(BUILDING_SCOPE_KEY))
  const loaded = ref(false)

  const options = computed(() =>
    buildings.value.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')),
  )
  const locked = computed(() => options.value.length <= 1)
  const viewKey = computed(() => selectedId.value || 'all')

  function persist(id: string | null) {
    selectedId.value = id
    if (id) localStorage.setItem(BUILDING_SCOPE_KEY, id)
    else localStorage.removeItem(BUILDING_SCOPE_KEY)
  }

  function alignSelection() {
    const ids = new Set(options.value.map((b) => b.id))
    if (options.value.length === 1) {
      persist(options.value[0]!.id)
      return
    }
    if (selectedId.value && !ids.has(selectedId.value)) persist(null)
  }

  async function load() {
    const { data } = await fetchBuildings()
    buildings.value = data.items ?? []
    alignSelection()
    loaded.value = true
  }

  function select(id: string | null) {
    if (locked.value) return
    if (id && !options.value.some((b) => b.id === id)) return
    persist(id)
  }

  function clear() {
    buildings.value = []
    loaded.value = false
    persist(null)
  }

  return {
    buildings,
    options,
    selectedId,
    loaded,
    locked,
    viewKey,
    load,
    select,
    clear,
  }
})
