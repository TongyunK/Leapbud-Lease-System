<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BatchPhase, BatchResultTone } from '@/composables/useBatchProgress'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    phase: BatchPhase
    total: number
    current: number
    percentage: number
    ok: number
    fail: number
    resultTone: BatchResultTone
  }>(),
  {
    phase: 'idle',
    total: 0,
    current: 0,
    percentage: 0,
    ok: 0,
    fail: 0,
    resultTone: 'success',
  },
)

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const title = computed(() => {
  if (props.phase === 'result') return t('common.batchDeleteUi.resultTitle')
  return t('common.batchDeleteUi.progressTitle')
})

const statusText = computed(() => {
  if (props.total > 0) {
    return t('common.batchDeleteUi.processing', {
      current: props.current,
      total: props.total,
    })
  }
  return t('common.batchDeleteUi.processingUnknown')
})

const progressStatus = computed(() => {
  if (props.percentage >= 100 && props.phase === 'result') {
    if (props.resultTone === 'error') return 'exception'
    if (props.resultTone === 'warning') return 'warning'
    return 'success'
  }
  return undefined
})

const resultIconClass = computed(() => {
  if (props.resultTone === 'error') return 'is-error'
  if (props.resultTone === 'warning') return 'is-warning'
  return 'is-success'
})

const resultLead = computed(() => {
  if (props.resultTone === 'error') return t('common.batchDeleteUi.resultFailedLead')
  if (props.resultTone === 'warning') return t('common.batchDeleteUi.resultPartialLead')
  return t('common.batchDeleteUi.resultLead')
})

function handleBeforeClose(done: () => void) {
  if (props.phase === 'progress') return
  done()
}

function onClose() {
  visible.value = false
  emit('close')
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="420px"
    :show-close="phase === 'result'"
    :close-on-click-modal="phase === 'result'"
    :close-on-press-escape="phase === 'result'"
    :before-close="handleBeforeClose"
    class="batch-progress-dialog"
    @closed="emit('close')"
  >
    <div v-if="phase === 'progress'" class="batch-progress">
      <el-progress
        :percentage="percentage"
        :stroke-width="12"
        :status="progressStatus"
        striped
        striped-flow
      />
      <p class="batch-status">{{ statusText }}</p>
      <dl class="batch-stats">
        <div class="batch-stat">
          <dt>{{ t('common.batchDeleteUi.stats.ok') }}</dt>
          <dd>{{ ok }}</dd>
        </div>
        <div class="batch-stat">
          <dt>{{ t('common.batchDeleteUi.stats.fail') }}</dt>
          <dd>{{ fail }}</dd>
        </div>
      </dl>
    </div>

    <div v-else-if="phase === 'result'" class="batch-result">
      <div class="batch-result-banner" :class="resultIconClass">
        <span class="batch-result-dot" />
        <p class="batch-result-lead">{{ resultLead }}</p>
      </div>
      <dl class="batch-stats result-stats">
        <div class="batch-stat">
          <dt>{{ t('common.batchDeleteUi.stats.ok') }}</dt>
          <dd>{{ ok }}</dd>
        </div>
        <div class="batch-stat">
          <dt>{{ t('common.batchDeleteUi.stats.fail') }}</dt>
          <dd>{{ fail }}</dd>
        </div>
      </dl>
    </div>

    <template v-if="phase === 'result'" #footer>
      <div class="dialog-footer">
        <el-button type="primary" class="lb-btn-primary" @click="onClose">
          {{ t('common.batchDeleteUi.close') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.batch-progress,
.batch-result {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.batch-status {
  margin: 0;
  font-size: 0.9rem;
  color: var(--lb-muted, #6a7a70);
}

.batch-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.batch-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--el-fill-color-light) 80%, transparent);
}

.batch-stat dt {
  margin: 0;
  font-size: 0.82rem;
  color: var(--lb-muted, #6a7a70);
}

.batch-stat dd {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.batch-result-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--el-color-success) 12%, transparent);
}

.batch-result-banner.is-warning {
  background: color-mix(in srgb, var(--el-color-warning) 14%, transparent);
}

.batch-result-banner.is-error {
  background: color-mix(in srgb, var(--el-color-danger) 12%, transparent);
}

.batch-result-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--el-color-success);
  flex-shrink: 0;
}

.is-warning .batch-result-dot {
  background: var(--el-color-warning);
}

.is-error .batch-result-dot {
  background: var(--el-color-danger);
}

.batch-result-lead {
  margin: 0;
  font-weight: 600;
}
</style>
