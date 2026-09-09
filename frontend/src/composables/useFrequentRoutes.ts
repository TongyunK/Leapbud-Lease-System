import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

const STORAGE_KEY = 'lb_frequent_routes'
const DISMISS_KEY = 'lb_frequent_dismissed'
const MAX_ITEMS = 6

export type FrequentRouteName = 'buildings' | 'rooms' | 'users' | 'roomConfigs' | 'roomTypes'



interface FrequentEntry {
  name: FrequentRouteName
  count: number
  lastVisited: number
}

const TRACKABLE = new Set<FrequentRouteName>(['buildings', 'rooms', 'users', 'roomConfigs', 'roomTypes'])

function loadEntries(): FrequentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FrequentEntry[]
    return Array.isArray(parsed)
      ? parsed.filter((e) => TRACKABLE.has(e.name))
      : []
  } catch {
    return []
  }
}

function loadDismissed(): Set<FrequentRouteName> {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((n): n is FrequentRouteName => TRACKABLE.has(n as FrequentRouteName))
        : [],
    )
  } catch {
    return new Set()
  }
}

function saveEntries(list: FrequentEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

function saveDismissed(set: Set<FrequentRouteName>) {
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...set]))
}

const entries = ref<FrequentEntry[]>(loadEntries())
const dismissed = ref<Set<FrequentRouteName>>(loadDismissed())

function recordVisit(name: string) {
  if (!TRACKABLE.has(name as FrequentRouteName)) return
  const routeName = name as FrequentRouteName
  const now = Date.now()

  // 再次进入已移除的页面时，重新纳入常用
  if (dismissed.value.has(routeName)) {
    const nextDismiss = new Set(dismissed.value)
    nextDismiss.delete(routeName)
    dismissed.value = nextDismiss
    saveDismissed(nextDismiss)
  }

  const list = [...entries.value]
  const idx = list.findIndex((e) => e.name === routeName)
  if (idx >= 0) {
    list[idx] = {
      ...list[idx],
      count: list[idx].count + 1,
      lastVisited: now,
    }
  } else {
    list.push({ name: routeName, count: 1, lastVisited: now })
  }
  entries.value = list
  saveEntries(list)
}

function removeShortcut(name: FrequentRouteName) {
  entries.value = entries.value.filter((e) => e.name !== name)
  saveEntries(entries.value)
  const nextDismiss = new Set(dismissed.value)
  nextDismiss.add(name)
  dismissed.value = nextDismiss
  saveDismissed(nextDismiss)
}

/** 按访问次数优先，次数相同看最近访问 */
export function useFrequentRoutes() {
  const route = useRoute()

  watch(
    () => route.name,
    (name) => {
      if (typeof name === 'string') recordVisit(name)
    },
    { immediate: true },
  )

  const shortcuts = computed(() => {
    const sorted = [...entries.value]
      .filter((e) => !dismissed.value.has(e.name))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        return b.lastVisited - a.lastVisited
      })
    return sorted.map((e) => e.name).slice(0, MAX_ITEMS)
  })

  return { shortcuts, removeShortcut }
}
