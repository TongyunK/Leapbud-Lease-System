/** 导出范围：当前页 / 当前筛选结果 / 全部已加载数据 */
export type ExportScope = 'page' | 'filtered' | 'all'

export function exportScopeFromCommand(cmd: string | number): ExportScope | null {
  if (cmd === 'export-page') return 'page'
  if (cmd === 'export-filtered') return 'filtered'
  if (cmd === 'export-all') return 'all'
  return null
}

export function resolveExportRows<T>(
  scope: ExportScope,
  sources: { page: readonly T[]; filtered: readonly T[]; all: readonly T[] },
): T[] {
  if (scope === 'page') return [...sources.page]
  if (scope === 'all') return [...sources.all]
  return [...sources.filtered]
}

export function exportFileSuffix(scope: ExportScope): string {
  if (scope === 'page') return 'page'
  if (scope === 'all') return 'all'
  return 'filtered'
}
