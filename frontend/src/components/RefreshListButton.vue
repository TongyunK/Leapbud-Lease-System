<script setup lang="ts">
import { computed, ref } from 'vue'
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

const active = computed(() => props.loading || spinning.value)

function onClick() {
  if (active.value) return
  spinning.value = true
  if (spinTimer) clearTimeout(spinTimer)
  spinTimer = setTimeout(() => {
    spinning.value = false
    spinTimer = null
  }, 480)
  emit('refresh')
}
</script>

<template>
  <el-button
    class="lb-refresh-list-btn"
    :class="{ 'is-spinning': active }"
    circle
    :aria-label="t('common.refreshList')"
    :title="t('common.refreshList')"
    :disabled="active"
    @click="onClick"
  >
    <el-icon :size="15" class="lb-refresh-list-btn__icon"><Refresh /></el-icon>
  </el-button>
</template>
