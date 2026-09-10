<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  ImportPhase,
  ImportResultTone,
  ImportStatKey,
} from '@/composables/useImportProgress'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    phase: ImportPhase
    fileName: string
    total: number
    current: number
    percentage: number
    statusKey: 'preparing' | 'processing' | 'finishing'
    stats: Record<ImportStatKey, number>
    resultTone: ImportResultTone
    resultMessage: string
    resultStatKeys: ImportStatKey[]
  }>(),
  {
    phase: 'idle',
    fileName: '',
    total: 0,
    current: 0,
    percentage: 0,
    statusKey: 'preparing',
    resultTone: 'success',
    resultMessage: '',
    resultStatKeys: () => ['created', 'updated', 'skipped', 'failed'],
  },
)

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()

const title = computed(() => {
  if (props.phase === 'result') {
    if (props.resultTone === 'error') return t('common.importUi.resultFailedTitle')
    return t('common.importUi.resultTitle')
  }
  return t('common.importUi.progressTitle')
})

const statusText = computed(() => {
  if (props.statusKey === 'preparing') return t('common.importUi.preparing')
  if (props.statusKey === 'finishing') return t('common.importUi.finishing')
  if (props.total > 0) {
    return t('common.importUi.processing', {
      current: props.current,
      total: props.total,
    })
  }
  return t('common.importUi.processingUnknown')
})

const progressStatus = computed(() => {
  if (props.percentage >= 100 && props.statusKey === 'finishing') return 'success'
  return undefined
})

const liveStatKeys = computed(() =>
  props.resultStatKeys.filter((k) => k in props.stats),
)

const resultIconClass = computed(() => {
  if (props.resultTone === 'error') return 'is-error'
  if (props.resultTone === 'warning') return 'is-warning'
  return 'is-success'
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
    width="440px"
    :show-close="phase === 'result'"
    :close-on-click-modal="phase === 'result'"
    :close-on-press-escape="phase === 'result'"
    :before-close="handleBeforeClose"
    class="import-progress-dialog"
    @closed="emit('close')"
  >
    <div v-if="phase === 'progress'" class="import-progress">
      <p class="import-file">
        <span class="import-file-label">{{ t('common.importUi.file') }}</span>
        <span class="import-file-name" :title="fileName">{{ fileName || '—' }}</span>
      </p>
      <el-progress
        :percentage="percentage"
        :stroke-width="12"
        :status="progressStatus"
        striped
        striped-flow
      />
      <p class="import-status">{{ statusText }}</p>
      <dl class="import-stats">
        <div v-for="key in liveStatKeys" :key="key" class="import-stat">
          <dt>{{ t(`common.importUi.stats.${key}`) }}</dt>
          <dd>{{ stats[key] ?? 0 }}</dd>
        </div>
      </dl>
    </div>

    <div v-else-if="phase === 'result'" class="import-result">
      <div class="import-result-banner" :class="resultIconClass">
        <span class="import-result-dot" />
        <p class="import-result-lead">
          {{
            resultTone === 'error'
              ? t('common.importUi.resultFailedLead')
              : t('common.importUi.resultLead')
          }}
        </p>
      </div>
      <p v-if="fileName" class="import-file result-file">
        <span class="import-file-label">{{ t('common.importUi.file') }}</span>
        <span class="import-file-name" :title="fileName">{{ fileName }}</span>
      </p>
      <dl v-if="resultTone !== 'error' || liveStatKeys.some((k) => (stats[k] ?? 0) > 0)" class="import-stats result-stats">
        <div v-for="key in liveStatKeys" :key="key" class="import-stat">
          <dt>{{ t(`common.importUi.stats.${key}`) }}</dt>
          <dd>{{ stats[key] ?? 0 }}</dd>
        </div>
      </dl>
      <p v-if="resultMessage" class="import-result-msg">{{ resultMessage }}</p>
    </div>

    <template v-if="phase === 'result'" #footer>
      <div class="dialog-footer">
        <el-button type="primary" class="lb-btn-primary" @click="onClose">
          {{ t('common.importUi.close') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.import-progress,
.import-result {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.import-file {
  display: flex;
  gap: 8px;
  align-items: baseline;
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.4;
}

.import-file-label {
  flex-shrink: 0;
  color: var(--lb-muted, #6a7a70);
}

.import-file-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.import-status {
  margin: 0;
  font-size: 0.9rem;
  color: var(--lb-muted, #6a7a70);
}

.import-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.import-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--el-fill-color-light) 80%, transparent);
}

.import-stat dt {
  margin: 0;
  font-size: 0.82rem;
  color: var(--lb-muted, #6a7a70);
}

.import-stat dd {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.import-result-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--el-color-success) 12%, transparent);
}

.import-result-banner.is-warning {
  background: color-mix(in srgb, var(--el-color-warning) 14%, transparent);
}

.import-result-banner.is-error {
  background: color-mix(in srgb, var(--el-color-danger) 12%, transparent);
}

.import-result-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--el-color-success);
  flex-shrink: 0;
}

.is-warning .import-result-dot {
  background: var(--el-color-warning);
}

.is-error .import-result-dot {
  background: var(--el-color-danger);
}

.import-result-lead {
  margin: 0;
  font-weight: 600;
}

.import-result-msg {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--lb-muted, #6a7a70);
  white-space: pre-wrap;
}

.result-file {
  margin-top: -4px;
}
</style>
