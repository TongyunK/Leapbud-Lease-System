<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  attachmentFileName,
  attachmentPublicUrl,
  isImageAttachment,
  isPdfAttachment,
} from '@/utils/attachmentUrl'

const props = defineProps<{
  value?: string | null
}>()

const { t } = useI18n()
const imageViewerVisible = ref(false)

const key = computed(() => (props.value || '').trim())
const name = computed(() => attachmentFileName(key.value) || key.value)
const url = computed(() => attachmentPublicUrl(key.value))
const isPdf = computed(() => isPdfAttachment(key.value))
const isImage = computed(() => isImageAttachment(key.value))

function onOpen() {
  if (!url.value) return
  if (isImage.value) {
    imageViewerVisible.value = true
    return
  }
  window.open(url.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <span v-if="!key">—</span>
  <template v-else>
    <button type="button" class="attachment-link" @click="onOpen">
      <span
        class="attachment-link__icon"
        :class="isPdf ? 'attachment-link__icon--pdf' : 'attachment-link__icon--img'"
      >
        {{ isPdf ? 'PDF' : 'IMG' }}
      </span>
      <span>{{ name || t('attachment.open') }}</span>
    </button>
    <el-image-viewer
      v-if="imageViewerVisible && url"
      :url-list="[url]"
      teleported
      hide-on-click-modal
      @close="imageViewerVisible = false"
    />
  </template>
</template>

<style scoped>
.attachment-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--lb-brand, #0f4a32);
  font: inherit;
  text-align: left;
  cursor: pointer;
  word-break: break-all;
}

.attachment-link:hover {
  text-decoration: underline;
}

.attachment-link__icon {
  flex: 0 0 auto;
  min-width: 28px;
  height: 18px;
  padding: 0 4px;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  color: #fff;
  text-decoration: none;
}

.attachment-link__icon--pdf {
  background: #c0392b;
}

.attachment-link__icon--img {
  background: #2a6b4d;
}
</style>
