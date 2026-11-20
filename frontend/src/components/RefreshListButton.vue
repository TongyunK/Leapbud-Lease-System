<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    loading?: boolean
  }>(),
  { loading: false },
)

const emit = defineEmits<{
  refresh: []
}>()

const { t } = useI18n()

/** 本地旋转：保证点击后至少有短暂动效，避免请求太快时「像没点到」 */
const spinning = ref(false)
let spinTimer: ReturnType<typeof setTimeout> | null = null
let spinStartedAt = 0
const MIN_SPIN_MS = 480

const active = computed(() => props.loading || spinning.value)

function clearSpinTimer() {
  if (spinTimer) {
    clearTimeout(spinTimer)
    spinTimer = null
  }
}

function stopSpinAfterMin() {
  clearSpinTimer()
  const elapsed = Date.now() - spinStartedAt
  const wait = Math.max(0, MIN_SPIN_MS - elapsed)
  spinTimer = setTimeout(() => {
    spinning.value = false
    spinTimer = null
  }, wait)
}

watch(
  () => props.loading,
  (loading) => {
    if (loading) {
      spinning.value = true
      if (!spinStartedAt) spinStartedAt = Date.now()
      clearSpinTimer()
      return
    }
    if (spinning.value) stopSpinAfterMin()
  },
)

function onClick() {
  if (active.value) return
  spinning.value = true
  spinStartedAt = Date.now()
  clearSpinTimer()
  spinTimer = setTimeout(() => {
    if (!props.loading) {
      spinning.value = false
      spinTimer = null
      spinStartedAt = 0
    }
  }, MIN_SPIN_MS)
  emit('refresh')
}

onBeforeUnmount(() => {
  clearSpinTimer()
})
</script>

<template>
  <button
    type="button"
    class="lb-refresh-list-btn"
    :class="{ 'is-spinning': active }"
    :aria-label="t('common.refreshList')"
    :title="t('common.refreshList')"
    :aria-busy="active ? 'true' : 'false'"
    :disabled="active"
    @click="onClick"
  >
    <span class="lb-refresh-list-btn__icon" aria-hidden="true">
      <el-icon :size="15"><Refresh /></el-icon>
    </span>
  </button>
</template>
