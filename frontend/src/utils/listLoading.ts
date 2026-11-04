import { nextTick, type Ref } from 'vue'

/** 列表刷新／筛选遮罩最短展示，避免请求过快「像没刷新」 */
export const LIST_MIN_LOADING_MS = 480

/**
 * 打开 loading → 等一帧让遮罩先上屏 → 执行任务 → 至少保持 minMs。
 * 供未使用 useServerPagedList 的自定义 loadList 复用。
 */
export async function runWithListLoading(
  loading: Ref<boolean>,
  task: () => Promise<void>,
  minMs: number = LIST_MIN_LOADING_MS,
): Promise<void> {
  const started = Date.now()
  loading.value = true
  await nextTick()
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
  try {
    await task()
  } finally {
    const wait = minMs - (Date.now() - started)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    loading.value = false
  }
}
