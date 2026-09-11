<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  count: number
}>()

defineEmits<{
  clear: []
}>()

const { t } = useI18n()
</script>

<template>
  <button
    v-if="count > 0"
    type="button"
    class="lb-clear-filters-btn"
    :title="t('tableColumn.clearAllFilters')"
    @click="$emit('clear')"
  >
    <span class="lb-clear-filters-btn__icon" aria-hidden="true">
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none">
        <path
          d="M2.2 3.2h11.6L9.4 8.2v3.5L6.6 13.2V8.2L2.2 3.2Z"
          stroke="currentColor"
          stroke-width="1.45"
          stroke-linejoin="round"
        />
      </svg>
    </span>
    <span class="lb-clear-filters-btn__label">{{ t('tableColumn.clearAllFilters') }}</span>
    <span class="lb-clear-filters-btn__count">{{ count }}</span>
  </button>
</template>
