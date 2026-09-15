import { computed, reactive } from 'vue'

export type ImportStatKey = 'created' | 'updated' | 'skipped' | 'failed' | 'unlinked'

export type ImportIssueStatus = 'skipped' | 'unlinked' | 'failed'

export type ImportIssue = {
  status: ImportIssueStatus
  reason: string
  keys?: Record<string, string>
}

export type ImportStats = Partial<Record<ImportStatKey, number>>

export type ImportPhase = 'idle' | 'progress' | 'result'

export type ImportResultTone = 'success' | 'warning' | 'error'

const EMPTY_STATS: Record<ImportStatKey, number> = {
  created: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  unlinked: 0,
}

export function useImportProgress() {
  const state = reactive({
    visible: false,
    phase: 'idle' as ImportPhase,
    fileName: '',
    total: 0,
    current: 0,
    statusKey: 'preparing' as 'preparing' | 'processing' | 'finishing',
    stats: { ...EMPTY_STATS } as Record<ImportStatKey, number>,
    resultTone: 'success' as ImportResultTone,
    resultMessage: '',
    resultStatKeys: ['created', 'updated', 'skipped', 'failed'] as ImportStatKey[],
    issues: [] as ImportIssue[],
  })

  const percentage = computed(() => {
    if (state.total <= 0) return state.phase === 'progress' ? 8 : 100
    return Math.min(100, Math.round((state.current / state.total) * 100))
  })

  const importing = computed(() => state.phase === 'progress')
  const hasIssues = computed(() => state.issues.length > 0)

  function resetStats(next?: ImportStats) {
    Object.assign(state.stats, EMPTY_STATS, next || {})
  }

  function begin(opts: {
    fileName: string
    total?: number
    statKeys?: ImportStatKey[]
  }) {
    state.fileName = opts.fileName
    state.total = opts.total ?? 0
    state.current = 0
    state.statusKey = 'preparing'
    resetStats()
    state.issues = []
    state.resultMessage = ''
    state.resultTone = 'success'
    if (opts.statKeys?.length) state.resultStatKeys = [...opts.statKeys]
    state.phase = 'progress'
    state.visible = true
  }

  function setTotal(n: number) {
    state.total = Math.max(0, n)
  }

  function setPreparing() {
    state.statusKey = 'preparing'
  }

  function setProcessing(rowIndex: number) {
    state.statusKey = 'processing'
    state.current = rowIndex
  }

  function bump(key: ImportStatKey, by = 1) {
    state.stats[key] = (state.stats[key] || 0) + by
  }

  function appendIssues(list?: ImportIssue[] | null) {
    if (!list?.length) return
    state.issues.push(...list)
  }

  function finish(opts?: {
    tone?: ImportResultTone
    message?: string
    stats?: ImportStats
    statKeys?: ImportStatKey[]
  }) {
    if (opts?.stats) resetStats(opts.stats)
    if (opts?.statKeys?.length) state.resultStatKeys = [...opts.statKeys]
    state.resultTone = opts?.tone ?? inferTone(state.stats)
    state.resultMessage = opts?.message ?? ''
    state.statusKey = 'finishing'
    if (state.total > 0) state.current = state.total
    state.phase = 'result'
    state.visible = true
  }

  function fail(message: string) {
    state.resultTone = 'error'
    state.resultMessage = message
    state.phase = 'result'
    state.visible = true
  }

  function close() {
    state.visible = false
    state.phase = 'idle'
  }

  return {
    state,
    percentage,
    importing,
    hasIssues,
    begin,
    setTotal,
    setPreparing,
    setProcessing,
    bump,
    appendIssues,
    finish,
    fail,
    close,
  }
}

function inferTone(stats: Record<ImportStatKey, number>): ImportResultTone {
  if (stats.failed > 0 && stats.created === 0 && stats.updated === 0) return 'error'
  if (stats.failed > 0 || stats.unlinked > 0) return 'warning'
  if (stats.created > 0 || stats.updated > 0) return 'success'
  return 'warning'
}

export type ImportProgressController = ReturnType<typeof useImportProgress>
