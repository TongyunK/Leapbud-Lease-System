<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { fetchRoomImageBlob } from '@/api/rooms'
import type { RoomImageRecord } from '@/types/room'

const props = defineProps<{
  roomId: string
  image: RoomImageRecord
  alt?: string
}>()

const src = ref('')
let objectUrl = ''

async function load() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = ''
  }
  src.value = ''
  if (props.image.publicUrl) {
    src.value = props.image.publicUrl
    return
  }
  try {
    const blob = await fetchRoomImageBlob(props.roomId, props.image.id)
    objectUrl = URL.createObjectURL(blob)
    src.value = objectUrl
  } catch {
    src.value = ''
  }
}

watch(
  () => [props.roomId, props.image.id, props.image.publicUrl] as const,
  () => {
    void load()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (objectUrl) URL.revokeObjectURL(objectUrl)
})
</script>

<template>
  <img v-if="src" :src="src" :alt="alt || image.fileName" class="room-image-thumb" />
  <em v-else class="room-image-thumb room-image-thumb--empty">—</em>
</template>

<style scoped>
.room-image-thumb {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid var(--lb-border);
  background: #f5f7f6;
  display: block;
}

.room-image-thumb--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--lb-muted);
  font-style: normal;
}
</style>
