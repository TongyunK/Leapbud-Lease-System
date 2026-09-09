import { onMounted, onUnmounted, ref } from 'vue'

export function useMediaQuery(query: string) {
  const matches = ref(false)
  let mql: MediaQueryList | null = null

  function onChange(event: MediaQueryListEvent | MediaQueryList) {
    matches.value = event.matches
  }

  onMounted(() => {
    mql = window.matchMedia(query)
    matches.value = mql.matches
    mql.addEventListener('change', onChange)
  })

  onUnmounted(() => {
    mql?.removeEventListener('change', onChange)
  })

  return matches
}

/** < 960px：手机/小平板 → 抽屉导航 + 卡片列表 */
export function useIsMobile() {
  return useMediaQuery('(max-width: 959.98px)')
}

/** < 1280px：14 寸等小笔记本 → 默认收起侧栏、精简表格列 */
export function useIsCompact() {
  return useMediaQuery('(max-width: 1279.98px)')
}

/** 视口高度偏矮（常见 14 寸 768p / 缩放后） */
export function useIsShortViewport() {
  return useMediaQuery('(max-height: 820px)')
}
