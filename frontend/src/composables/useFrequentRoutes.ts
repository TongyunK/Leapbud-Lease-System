import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useNavStore } from '@/stores/nav'

const STORAGE_KEY = 'lb_frequent_routes'
const DISMISS_KEY = 'lb_frequent_dismissed'
const MAX_ITEMS = 8

/** 可计入 header 常用快捷的业务路由（不含登录等公共页） */
export type FrequentRouteName =
  | 'buildings'
  | 'rooms'
  | 'customers'
  | 'occupants'
  | 'customerRequirements'
  | 'contracts'
  | 'contractConfigs'
  | 'contractPeriods'
  | 'leaseTerminations'
  | 'contractOtherFees'
  | 'depositDeductions'
  | 'users'
  | 'roles'
  | 'menus'
  | 'roomConfigs'
  | 'roomTypes'
  | 'customerSources'

interface FrequentEntry {
  name: FrequentRouteName
  count: number
  lastVisited: number
}

const TRACKABLE = new Set<FrequentRouteName>([
  'buildings',
  'rooms',
  'customers',
  'occupants',
  'customerRequirements',
  'contracts',
  'contractConfigs',
  'contractPeriods',
  'leaseTerminations',
  'contractOtherFees',
  'depositDeductions',
  'users',
  'roles',
  'menus',
  'roomConfigs',
  'roomTypes',
  'customerSources',
])

function loadEntries(): FrequentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FrequentEntry[]
    if (!Array.isArray(parsed)) return []
    const list = parsed.filter((e) => TRACKABLE.has(e.name))
    if (list.length <= MAX_ITEMS) return list
    // 旧数据可能超过上限：保留最近访问的 MAX_ITEMS 个
    return [...list]
      .sort((a, b) => b.lastVisited - a.lastVisited)
      .slice(0, MAX_ITEMS)
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
    // 已在列表中：只更新访问信息，不改变排序位置
    list[idx] = {
      ...list[idx],
      count: list[idx].count + 1,
      lastVisited: now,
    }
  } else if (list.length >= MAX_ITEMS) {
    // 第 9 个：去掉最久未访问的，新项排到第一位
    let oldestIdx = 0
    for (let i = 1; i < list.length; i++) {
      if (list[i].lastVisited < list[oldestIdx].lastVisited) oldestIdx = i
    }
    list.splice(oldestIdx, 1)
    list.unshift({ name: routeName, count: 1, lastVisited: now })
  } else {
    // 未满 8 个：追加到末尾，不扰动已有顺序
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

/**
 * 数组顺序即展示顺序：
 * - 已在列表中再访问：不改位置，只更新 lastVisited（供淘汰用）
 * - 未满时新访问：追加末尾
 * - 已满时新访问：淘汰最久未访问，新项插到第一位
 * 展示时再按菜单权限过滤（保持相对顺序）。
 */
export function useFrequentRoutes() {
  const route = useRoute()
  const navStore = useNavStore()

  watch(
    () => route.name,
    (name) => {
      if (typeof name === 'string') recordVisit(name)
    },
    { immediate: true },
  )

  const shortcuts = computed(() => {
    return entries.value
      .filter((e) => !dismissed.value.has(e.name))
      .filter((e) => !navStore.loaded || navStore.hasRoute(e.name))
      .map((e) => e.name)
      .slice(0, MAX_ITEMS)
  })

  return { shortcuts, removeShortcut }
}
