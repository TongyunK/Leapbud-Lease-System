<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchRefundOrderAttachmentBlob } from '@/api/refund-orders'
import type { RefundOrderAttachmentRecord } from '@/types/refund-order'
import {
  attachmentPublicUrl,
  isImageAttachment,
  isPdfAttachment,
} from '@/utils/attachmentUrl'

const props = defineProps<{
  refundOrderId: string
  attachments: RefundOrderAttachmentRecord[]
}>()

const { t } = useI18n()
const urlById = ref<Record<string, string>>({})
const objectUrls: string[] = []
const imageViewerVisible = ref(false)
const imageViewerList = ref<string[]>([])
const imageViewerIndex = ref(0)

const sorted = computed(() =>
  [...(props.attachments || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
)

function extLabel(fileName: string) {
  const ext = (fileName.split('.').pop() || '').toUpperCase()
  if (!ext || ext.length > 5) return 'FILE'
  return ext
}

function iconClass(fileName: string) {
  if (isPdfAttachment(fileName)) return 'ro-att__icon--pdf'
  if (isImageAttachment(fileName)) return 'ro-att__icon--img'
  return 'ro-att__icon--file'
}

async function resolveUrl(att: RefundOrderAttachmentRecord): Promise<string> {
  if (att.publicUrl) return att.publicUrl
  if (urlById.value[att.id]) return urlById.value[att.id]
  try {
    const blob = await fetchRefundOrderAttachmentBlob(props.refundOrderId, att.id)
    const url = URL.createObjectURL(blob)
    objectUrls.push(url)
    urlById.value = { ...urlById.value, [att.id]: url }
    return url
  } catch {
    return ''
  }
}

async function preload() {
  for (const u of objectUrls) URL.revokeObjectURL(u)
  objectUrls.length = 0
  urlById.value = {}
  await Promise.all(
    sorted.value.map(async (att) => {
      if (att.publicUrl) {
        urlById.value = { ...urlById.value, [att.id]: att.publicUrl }
        return
      }
      if (isImageAttachment(att.fileName)) {
        await resolveUrl(att)
      }
    }),
  )
}

async function onOpen(att: RefundOrderAttachmentRecord) {
  const url =
    att.publicUrl ||
    urlById.value[att.id] ||
    attachmentPublicUrl(att.publicUrl) ||
    (await resolveUrl(att))
  if (!url) return
  if (isImageAttachment(att.fileName)) {
    const images = sorted.value.filter((a) => isImageAttachment(a.fileName))
    const urls: string[] = []
    for (const img of images) {
      const u = img.publicUrl || urlById.value[img.id] || (await resolveUrl(img))
      if (u) urls.push(u)
    }
    imageViewerList.value = urls
    imageViewerIndex.value = Math.max(0, urls.indexOf(url))
    imageViewerVisible.value = true
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

watch(
  () =>
    [
      props.refundOrderId,
      sorted.value.map((a) => `${a.id}:${a.publicUrl || ''}`).join('|'),
    ] as const,
  () => {
    void preload()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  for (const u of objectUrls) URL.revokeObjectURL(u)
})
</script>

<template>
  <div v-if="sorted.length" class="ro-att">
    <button
      v-for="att in sorted"
      :key="att.id"
      type="button"
      class="ro-att__chip"
      :title="t('attachment.preview')"
      @click="onOpen(att)"
    >
      <span class="ro-att__icon" :class="iconClass(att.fileName)">
        {{ extLabel(att.fileName) }}
      </span>
      <span class="ro-att__name">{{ att.fileName }}</span>
    </button>
    <AttachmentImageViewer
      v-if="imageViewerVisible && imageViewerList.length"
      :url-list="imageViewerList"
      :initial-index="imageViewerIndex"
      @close="imageViewerVisible = false"
    />
  </div>
  <el-empty v-else :description="t('refundOrder.noAttachments')" :image-size="56" />
</template>

<style scoped>
.ro-att {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ro-att__chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  margin: 0;
  padding: 6px 10px;
  border: 1px solid var(--lb-border, #d8e0db);
  border-radius: 8px;
  background: #f7faf8;
  font: inherit;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.ro-att__chip:hover {
  border-color: var(--lb-brand, #0f4a32);
  background: #eef6f1;
}

.ro-att__icon {
  flex: 0 0 auto;
  min-width: 32px;
  height: 20px;
  padding: 0 5px;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  color: #fff;
  background: #5a6a62;
}

.ro-att__icon--pdf {
  background: #c0392b;
}

.ro-att__icon--img {
  background: #2a6b4d;
}

.ro-att__icon--file {
  background: #4a5d72;
}

.ro-att__name {
  min-width: 0;
  word-break: break-all;
  font-size: 0.88rem;
  color: var(--el-text-color-regular);
}
</style>
