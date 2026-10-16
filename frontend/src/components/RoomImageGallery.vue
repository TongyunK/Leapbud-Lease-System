<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchRoomImageBlob } from '@/api/rooms'
import type { RoomImageRecord } from '@/types/room'

const props = defineProps<{
  roomId: string
  images: RoomImageRecord[]
}>()

const { t } = useI18n()
const urlById = ref<Record<string, string>>({})
const objectUrls: string[] = []
const scrollerEl = ref<HTMLElement | null>(null)
const leftHidden = ref(0)
const rightHidden = ref(0)
let ro: ResizeObserver | null = null

const sortedImages = computed(() =>
  [...(props.images || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
)

const previewList = computed(() =>
  sortedImages.value.map((img) => urlById.value[img.id]).filter(Boolean) as string[],
)

async function loadAll() {
  for (const u of objectUrls) URL.revokeObjectURL(u)
  objectUrls.length = 0
  const next: Record<string, string> = {}
  await Promise.all(
    sortedImages.value.map(async (img) => {
      if (img.publicUrl) {
        next[img.id] = img.publicUrl
        return
      }
      try {
        const blob = await fetchRoomImageBlob(props.roomId, img.id)
        const url = URL.createObjectURL(blob)
        objectUrls.push(url)
        next[img.id] = url
      } catch {
        /* skip */
      }
    }),
  )
  urlById.value = next
  await nextTick()
  bindScrollerObserver()
  syncOverflow()
}

function bindScrollerObserver() {
  const el = scrollerEl.value
  if (!el || typeof ResizeObserver === 'undefined') return
  ro?.disconnect()
  ro = new ResizeObserver(() => syncOverflow())
  ro.observe(el)
}

function syncOverflow() {
  const el = scrollerEl.value
  if (!el) {
    leftHidden.value = 0
    rightHidden.value = 0
    return
  }
  const tiles = Array.from(el.querySelectorAll<HTMLElement>('[data-room-image-tile]'))
  const viewLeft = el.scrollLeft
  const viewRight = viewLeft + el.clientWidth
  let left = 0
  let right = 0
  for (const tile of tiles) {
    const tLeft = tile.offsetLeft
    const tRight = tLeft + tile.offsetWidth
    if (tRight <= viewLeft + 4) left += 1
    else if (tLeft >= viewRight - 4) right += 1
  }
  leftHidden.value = left
  rightHidden.value = right
}

function scrollByPage(dir: -1 | 1) {
  const el = scrollerEl.value
  if (!el) return
  const step = Math.max(160, Math.floor(el.clientWidth * 0.7))
  el.scrollBy({ left: dir * step, behavior: 'smooth' })
}

function onWheel(e: WheelEvent) {
  const el = scrollerEl.value
  if (!el) return
  const dominant = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (dominant === 0) return
  if (el.scrollWidth <= el.clientWidth + 1) return
  e.preventDefault()
  el.scrollLeft += dominant
  syncOverflow()
}

function previewIndex(img: RoomImageRecord) {
  const url = urlById.value[img.id]
  if (!url) return 0
  const idx = previewList.value.indexOf(url)
  return idx >= 0 ? idx : 0
}

watch(
  () => [props.roomId, sortedImages.value.map((i) => `${i.id}:${i.publicUrl || ''}`).join('|')] as const,
  () => {
    void loadAll()
  },
  { immediate: true },
)

onMounted(() => {
  bindScrollerObserver()
  syncOverflow()
})

onBeforeUnmount(() => {
  ro?.disconnect()
  for (const u of objectUrls) URL.revokeObjectURL(u)
})
</script>

<template>
  <div v-if="sortedImages.length" class="room-image-gallery">
    <div class="room-image-gallery__frame">
      <button
        v-show="leftHidden > 0"
        type="button"
        class="room-image-gallery__mask room-image-gallery__mask--left"
        :aria-label="t('room.imagesMore', { n: leftHidden })"
        @click="scrollByPage(-1)"
      >
        +{{ leftHidden }}
      </button>
      <div
        ref="scrollerEl"
        class="room-image-gallery__scroller"
        @scroll.passive="syncOverflow"
        @wheel="onWheel"
      >
        <el-image
          v-for="img in sortedImages"
          :key="img.id"
          data-room-image-tile
          class="room-image-gallery__item"
          :src="urlById[img.id]"
          :alt="img.fileName"
          fit="cover"
          :preview-src-list="previewList"
          :initial-index="previewIndex(img)"
          preview-teleported
          hide-on-click-modal
        >
          <template #error>
            <div class="room-image-gallery__error">—</div>
          </template>
          <template #placeholder>
            <div class="room-image-gallery__error">…</div>
          </template>
        </el-image>
      </div>
      <button
        v-show="rightHidden > 0"
        type="button"
        class="room-image-gallery__mask room-image-gallery__mask--right"
        :aria-label="t('room.imagesMore', { n: rightHidden })"
        @click="scrollByPage(1)"
      >
        +{{ rightHidden }}
      </button>
    </div>
  </div>
  <el-empty v-else :description="t('room.noImages')" :image-size="64" />
</template>

<style scoped>
.room-image-gallery__frame {
  position: relative;
}

.room-image-gallery__scroller {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
  scroll-behavior: smooth;
  scrollbar-width: thin;
}

.room-image-gallery__item {
  flex: 0 0 120px;
  width: 120px;
  height: 90px;
  border-radius: 10px;
  border: 1px solid var(--lb-border);
  overflow: hidden;
  background: #f5f7f6;
  cursor: zoom-in;
}

.room-image-gallery__item :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.room-image-gallery__error {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--lb-muted);
  background: #f5f7f6;
}

.room-image-gallery__mask {
  position: absolute;
  top: 0;
  bottom: 2px;
  z-index: 2;
  width: 56px;
  border: none;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
  cursor: pointer;
}

.room-image-gallery__mask--left {
  left: 0;
  border-radius: 10px 0 0 10px;
  background: linear-gradient(90deg, rgba(60, 70, 66, 0.78), rgba(60, 70, 66, 0.15));
}

.room-image-gallery__mask--right {
  right: 0;
  border-radius: 0 10px 10px 0;
  background: linear-gradient(270deg, rgba(60, 70, 66, 0.78), rgba(60, 70, 66, 0.15));
}
</style>
