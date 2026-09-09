<script setup lang="ts">
import { computed } from 'vue'
import { normalizeRoomTypeTone } from '@/constants/roomTypes'

const props = defineProps<{
  value?: string | null
  tone?: string | null
}>()

const label = computed(() => (props.value || '').trim())
const resolvedTone = computed(() => normalizeRoomTypeTone(props.tone, label.value))
</script>

<template>
  <span v-if="label" class="lb-room-type" :class="`lb-room-type--${resolvedTone}`">{{ label }}</span>
  <span v-else class="lb-room-type lb-room-type--empty">—</span>
</template>
