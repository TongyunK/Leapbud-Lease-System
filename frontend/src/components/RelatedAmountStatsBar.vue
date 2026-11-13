<script setup lang="ts">
import type { RelatedAmountStatItem } from '@/composables/useRelatedTableAmountSummary'

defineProps<{
  items: RelatedAmountStatItem[]
  caption?: string
}>()
</script>

<template>
  <div v-if="items.length" class="related-amount-stats" role="region" :aria-label="caption || undefined">
    <div v-if="caption" class="related-amount-stats__caption">{{ caption }}</div>
    <div class="related-amount-stats__grid">
      <div v-for="it in items" :key="it.key" class="related-amount-stats__cell">
        <span class="related-amount-stats__label">{{ it.label }}</span>
        <strong class="related-amount-stats__value">{{ it.display }}</strong>
      </div>
    </div>
  </div>
</template>
