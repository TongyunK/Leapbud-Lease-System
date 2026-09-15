import { chunkArray } from '@/utils/chunk'
import { computed, nextTick, ref, type Ref } from 'vue'

type TableExpose = {
  clearSelection: () => void
  toggleRowSelection: (row: unknown, selected?: boolean) => void
}

/**
 * 表格跨页多选（配合 el-table row-key + selection 列 reserve-selection）
 */
export function useTableSelection<T extends { id: string }>() {
  const tableRef = ref<TableExpose | null>(null)
  const selectedRows = ref([]) as Ref<T[]>
  const selectedCount = computed(() => selectedRows.value.length)
  const selectedIds = computed(() => selectedRows.value.map((r) => r.id))
  const hasSelection = computed(() => selectedCount.value > 0)

  function onSelectionChange(rows: T[]) {
    selectedRows.value = rows
  }

  function clearSelection() {
    tableRef.value?.clearSelection()
    selectedRows.value = []
  }

  /** 跨页全选：传入完整行列表（含非当前页），依赖 reserve-selection 保留 */
  async function selectRows(rows: T[]) {
    selectedRows.value = [...rows]
    const table = tableRef.value
    if (!table) return
    table.clearSelection()
    await nextTick()
    for (const row of rows) {
      table.toggleRowSelection(row, true)
    }
  }

  return {
    tableRef,
    selectedRows,
    selectedCount,
    selectedIds,
    hasSelection,
    onSelectionChange,
    clearSelection,
    selectRows,
  }
}

export type BatchDeleteResult = {
  deleted: number
  failed: number
  failures?: Array<{ id: string; message: string }>
}

/** 与后端 BatchDeleteDto ArrayMaxSize(200) 对齐 */
export const BATCH_DELETE_CHUNK_SIZE = 100

/**
 * 调用服务端批量删除；按块请求以更新进度并避免超时。
 * deleteChunk 应返回 axios 响应（含 data: BatchDeleteResult）。
 */
export async function runServerBatchDelete(
  ids: string[],
  deleteChunk: (chunk: string[]) => Promise<{ data: BatchDeleteResult }>,
  onProgress?: (p: { current: number; total: number; ok: number; fail: number }) => void,
): Promise<{ ok: number; fail: number }> {
  const unique = [...new Set(ids.filter(Boolean))]
  const total = unique.length
  let ok = 0
  let fail = 0
  let processed = 0

  for (const chunk of chunkArray(unique, BATCH_DELETE_CHUNK_SIZE)) {
    try {
      const { data } = await deleteChunk(chunk)
      ok += data.deleted || 0
      fail += data.failed || 0
    } catch {
      fail += chunk.length
    }
    processed += chunk.length
    onProgress?.({ current: processed, total, ok, fail })
  }

  return { ok, fail }
}

/** 兼容逐条删除（无批量接口时使用） */
export async function runBatchDelete(
  ids: string[],
  deleteOne: (id: string) => Promise<unknown>,
  onProgress?: (p: { current: number; total: number; ok: number; fail: number }) => void,
): Promise<{ ok: number; fail: number }> {
  let ok = 0
  let fail = 0
  const total = ids.length
  for (let i = 0; i < ids.length; i += 1) {
    try {
      await deleteOne(ids[i]!)
      ok += 1
    } catch {
      fail += 1
    }
    onProgress?.({ current: i + 1, total, ok, fail })
  }
  return { ok, fail }
}
