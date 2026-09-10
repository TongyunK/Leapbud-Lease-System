/** 将数组按固定大小分批 */
export function chunkArray<T>(items: T[], size: number): T[][] {
  const n = Math.max(1, size)
  const out: T[][] = []
  for (let i = 0; i < items.length; i += n) {
    out.push(items.slice(i, i + n))
  }
  return out
}

/** 导入单批条数（与后端 ArrayMaxSize(200) 对齐，留余量） */
export const IMPORT_BATCH_SIZE = 100
