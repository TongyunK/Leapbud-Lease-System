import { computed, reactive } from 'vue'

export type BatchPhase = 'idle' | 'progress' | 'result'
export type BatchResultTone = 'success' | 'warning' | 'error'

export function useBatchProgress() {
  const state = reactive({
    visible: false,
    phase: 'idle' as BatchPhase,
    total: 0,
    current: 0,
    ok: 0,
    fail: 0,
    resultTone: 'success' as BatchResultTone,
  })

  const percentage = computed(() => {
    if (state.total <= 0) return state.phase === 'progress' ? 8 : 100
    return Math.min(100, Math.round((state.current / state.total) * 100))
  })

  const running = computed(() => state.phase === 'progress')

  function begin(total: number) {
    state.total = Math.max(0, total)
    state.current = 0
    state.ok = 0
    state.fail = 0
    state.resultTone = 'success'
    state.phase = 'progress'
    state.visible = true
  }

  function setProgress(p: { current: number; ok: number; fail: number }) {
    state.current = p.current
    state.ok = p.ok
    state.fail = p.fail
  }

  function finish(ok: number, fail: number) {
    state.ok = ok
    state.fail = fail
    state.current = state.total
    state.resultTone = fail === 0 ? 'success' : ok === 0 ? 'error' : 'warning'
    state.phase = 'result'
    state.visible = true
  }

  function close() {
    if (state.phase === 'progress') return
    state.visible = false
    state.phase = 'idle'
  }

  return {
    state,
    percentage,
    running,
    begin,
    setProgress,
    finish,
    close,
  }
}

export type BatchProgressController = ReturnType<typeof useBatchProgress>
