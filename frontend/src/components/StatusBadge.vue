<script setup lang="ts">
import { computed } from 'vue'
import type { StatusTone } from '@/constants/statusBadges'

const props = defineProps<{
  tone?: StatusTone | string | null
  label?: string | null
  /** 透传到根节点，便于整租等场景 hover 提示 */
  title?: string | null
}>()

const text = computed(() => (props.label || '').trim())
const resolvedTone = computed(() => {
  const t = (props.tone || '').trim()
  return t || 'neutral'
})
</script>

<template>
  <span
    v-if="text"
    class="lb-status"
    :class="`lb-status--${resolvedTone}`"
    :title="title || undefined"
  >{{ text }}</span>
  <span v-else class="lb-status lb-status--empty">—</span>
</template>
