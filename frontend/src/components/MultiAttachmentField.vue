<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import {
  isImageAttachment,
  isPdfAttachment,
} from '@/utils/attachmentUrl'

export type MultiAttachmentExisting = {
  id: string
  fileName: string
  publicUrl?: string
}

export type MultiAttachmentPending = {
  key: string
  file: File
}

const props = withDefaults(
  defineProps<{
    existing?: MultiAttachmentExisting[]
    pending?: MultiAttachmentPending[]
    disabled?: boolean
    /** 已存附件预览 URL（鉴权流时由父组件拉取 blob） */
    resolveUrl?: (item: MultiAttachmentExisting) => Promise<string>
  }>(),
  {
    existing: () => [],
    pending: () => [],
    disabled: false,
  },
)

const emit = defineEmits<{
  add: [files: File[]]
  removeExisting: [id: string]
  removePending: [key: string]
}>()

const { t } = useI18n()
const inputRef = ref<HTMLInputElement | null>(null)
const imageViewerVisible = ref(false)
const imageViewerList = ref<string[]>([])
const imageViewerIndex = ref(0)
const urlCache = ref<Record<string, string>>({})
const objectUrls: string[] = []

const existingList = computed(() => props.existing || [])
const pendingList = computed(() => props.pending || [])
const totalCount = computed(() => existingList.value.length + pendingList.value.length)
const hasAny = computed(() => totalCount.value > 0)
const countLabel = computed(() => t('attachment.countOnly', { current: totalCount.value }))

function extLabel(fileName: string) {
  const ext = (fileName.split('.').pop() || '').toUpperCase()
  if (!ext || ext.length > 5) return 'FILE'
  return ext
}

function iconClass(fileName: string) {
  if (isPdfAttachment(fileName)) return 'multi-att__icon--pdf'
  if (isImageAttachment(fileName)) return 'multi-att__icon--img'
  return 'multi-att__icon--file'
}

function triggerPick() {
  if (props.disabled) return
  inputRef.value?.click()
}

async function onPick(ev: Event) {
  if (props.disabled) return
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return

  const accepted: File[] = []
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) {
      await ElMessageBox.alert(t('attachment.tooLarge'), t('attachment.upload'), {
        type: 'warning',
        confirmButtonText: t('common.confirm'),
      }).catch(() => undefined)
      continue
    }
    accepted.push(file)
  }
  if (accepted.length) emit('add', accepted)
}

async function resolveExisting(att: MultiAttachmentExisting): Promise<string> {
  if (att.publicUrl) return att.publicUrl
  if (urlCache.value[att.id]) return urlCache.value[att.id]
  if (!props.resolveUrl) return ''
  const url = await props.resolveUrl(att)
  if (!url) return ''
  if (url.startsWith('blob:')) objectUrls.push(url)
  urlCache.value = { ...urlCache.value, [att.id]: url }
  return url
}

async function previewExisting(att: MultiAttachmentExisting) {
  const url = await resolveExisting(att)
  if (!url) return
  if (isImageAttachment(att.fileName)) {
    const urls: string[] = []
    for (const item of existingList.value) {
      if (!isImageAttachment(item.fileName)) continue
      const u = await resolveExisting(item)
      if (u) urls.push(u)
    }
    for (const p of pendingList.value) {
      if (!isImageAttachment(p.file.name)) continue
      const u = URL.createObjectURL(p.file)
      objectUrls.push(u)
      urls.push(u)
    }
    imageViewerList.value = urls
    imageViewerIndex.value = Math.max(0, urls.indexOf(url))
    imageViewerVisible.value = true
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

function previewPending(p: MultiAttachmentPending) {
  const url = URL.createObjectURL(p.file)
  objectUrls.push(url)
  if (isImageAttachment(p.file.name)) {
    const urls: string[] = []
    // 先尽量带上已解析的已存图片；失败则仅预览 pending
    void (async () => {
      for (const item of existingList.value) {
        if (!isImageAttachment(item.fileName)) continue
        const u = await resolveExisting(item)
        if (u) urls.push(u)
      }
      for (const item of pendingList.value) {
        if (!isImageAttachment(item.file.name)) continue
        if (item.key === p.key) {
          urls.push(url)
          continue
        }
        const u = URL.createObjectURL(item.file)
        objectUrls.push(u)
        urls.push(u)
      }
      imageViewerList.value = urls.length ? urls : [url]
      imageViewerIndex.value = Math.max(0, imageViewerList.value.indexOf(url))
      imageViewerVisible.value = true
    })()
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

onBeforeUnmount(() => {
  for (const u of objectUrls) URL.revokeObjectURL(u)
})
</script>

<template>
  <div class="multi-att">
    <input
      ref="inputRef"
      type="file"
      class="multi-att__input"
      multiple
      @change="onPick"
    />

    <div
      v-for="att in existingList"
      :key="att.id"
      class="multi-att__chip-wrap"
    >
      <button
        type="button"
        class="multi-att__chip multi-att__chip--clickable"
        :title="t('attachment.preview')"
        @click="previewExisting(att)"
      >
        <span class="multi-att__icon" :class="iconClass(att.fileName)">
          {{ extLabel(att.fileName) }}
        </span>
        <span class="multi-att__name">{{ att.fileName }}</span>
      </button>
      <button
        v-if="!disabled"
        type="button"
        class="multi-att__remove"
        :title="t('common.delete')"
        @click="emit('removeExisting', att.id)"
      >
        ×
      </button>
    </div>

    <div
      v-for="p in pendingList"
      :key="p.key"
      class="multi-att__chip-wrap"
    >
      <button
        type="button"
        class="multi-att__chip multi-att__chip--clickable"
        :title="t('attachment.preview')"
        @click="previewPending(p)"
      >
        <span class="multi-att__icon" :class="iconClass(p.file.name)">
          {{ extLabel(p.file.name) }}
        </span>
        <span class="multi-att__name">{{ p.file.name }}</span>
      </button>
      <button
        v-if="!disabled"
        type="button"
        class="multi-att__remove"
        :title="t('common.delete')"
        @click="emit('removePending', p.key)"
      >
        ×
      </button>
    </div>

    <div v-if="!disabled" class="multi-att__trigger-row">
      <button
        type="button"
        class="multi-att__trigger"
        @click="triggerPick"
      >
        <el-icon class="multi-att__cloud" :size="18">
          <UploadFilled />
        </el-icon>
        <span class="multi-att__trigger-text">{{ t('attachment.upload') }}</span>
        <span class="multi-att__count">{{ countLabel }}</span>
      </button>
    </div>
    <p v-else-if="!hasAny" class="multi-att__empty">{{ t('attachment.empty') }}</p>

    <Teleport to="body">
      <AttachmentImageViewer
        v-if="imageViewerVisible && imageViewerList.length"
        :url-list="imageViewerList"
        :initial-index="imageViewerIndex"
        @close="imageViewerVisible = false"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.multi-att {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
  width: 100%;
}

.multi-att__input {
  display: none;
}

.multi-att__trigger-row {
  display: flex;
  align-items: center;
}

.multi-att__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #3a7bd5;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.3;
  cursor: pointer;
}

.multi-att__trigger:hover .multi-att__trigger-text {
  text-decoration: underline;
}

.multi-att__cloud {
  flex: 0 0 auto;
  color: #3a7bd5;
}

.multi-att__trigger-text {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.multi-att__count {
  font-weight: 550;
  text-decoration: none;
}

.multi-att__empty {
  margin: 0;
  color: #8a9690;
  font-size: 0.82rem;
  line-height: 1.4;
}

.multi-att__chip-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
}

.multi-att__chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  max-width: 100%;
  min-width: 0;
}

.multi-att__chip--clickable {
  cursor: pointer;
}

.multi-att__chip--clickable:hover .multi-att__name {
  color: var(--lb-brand, #0f4a32);
  text-decoration: underline;
}

.multi-att__icon {
  flex: 0 0 auto;
  min-width: 28px;
  height: 20px;
  padding: 0 4px;
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

.multi-att__icon--pdf {
  background: #c0392b;
}

.multi-att__icon--img {
  background: #2a6b4d;
}

.multi-att__icon--file {
  background: #4a5d72;
}

.multi-att__name {
  min-width: 0;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.multi-att__remove {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.multi-att__remove:hover {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}
</style>
