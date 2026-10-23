<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { uploadAttachmentApi } from '@/api/uploads'
import {
  attachmentFileName,
  attachmentPublicUrl,
  isImageAttachment,
  isPdfAttachment,
} from '@/utils/attachmentUrl'

const model = defineModel<string>({ default: '' })

const { t } = useI18n()
const inputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const imageViewerVisible = ref(false)

const hasFile = computed(() => Boolean(model.value?.trim()))
const displayName = computed(() => attachmentFileName(model.value) || model.value)
const publicUrl = computed(() => attachmentPublicUrl(model.value))
const isPdf = computed(() => isPdfAttachment(model.value))
const isImage = computed(() => isImageAttachment(model.value))
const canPreview = computed(() => Boolean(publicUrl.value))

function triggerPick() {
  inputRef.value?.click()
}

async function onPick(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const ok =
    /\.(pdf|jpe?g|png|gif|webp|bmp)$/i.test(file.name) ||
    file.type.startsWith('image/') ||
    file.type === 'application/pdf'
  if (!ok) {
    ElMessage.warning(t('attachment.typeHint'))
    return
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.warning(t('attachment.tooLarge'))
    return
  }

  uploading.value = true
  try {
    const { data } = await uploadAttachmentApi(file)
    model.value = data.storageKey
  } catch {
    /* interceptor */
  } finally {
    uploading.value = false
  }
}

function clearFile() {
  model.value = ''
}

function onPreview() {
  if (!publicUrl.value) return
  if (isImage.value) {
    imageViewerVisible.value = true
    return
  }
  window.open(publicUrl.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="attachment-field">
    <input
      ref="inputRef"
      type="file"
      class="attachment-field__input"
      accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,application/pdf,image/*"
      @change="onPick"
    />

    <div v-if="hasFile" class="attachment-field__chip-wrap">
      <button
        type="button"
        class="attachment-field__chip"
        :class="{ 'attachment-field__chip--clickable': canPreview }"
        :title="canPreview ? t('attachment.preview') : undefined"
        @click="onPreview"
      >
        <span
          class="attachment-field__icon"
          :class="isPdf ? 'attachment-field__icon--pdf' : 'attachment-field__icon--img'"
        >
          {{ isPdf ? 'PDF' : 'IMG' }}
        </span>
        <span class="attachment-field__name">{{ displayName }}</span>
      </button>
      <button
        type="button"
        class="attachment-field__remove"
        :title="t('common.delete')"
        :disabled="uploading"
        @click="clearFile"
      >
        ×
      </button>
    </div>

    <el-button v-else :loading="uploading" @click="triggerPick">
      {{ t('attachment.choose') }}
    </el-button>

    <el-image-viewer
      v-if="imageViewerVisible && publicUrl"
      :url-list="[publicUrl]"
      teleported
      hide-on-click-modal
      @close="imageViewerVisible = false"
    />
  </div>
</template>

<style scoped>
.attachment-field__input {
  display: none;
}

.attachment-field__chip-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
}

.attachment-field__chip {
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

.attachment-field__chip--clickable {
  cursor: pointer;
}

.attachment-field__chip--clickable:hover .attachment-field__name {
  color: var(--el-color-primary);
  text-decoration: underline;
}

.attachment-field__icon {
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
}

.attachment-field__icon--pdf {
  background: #c0392b;
}

.attachment-field__icon--img {
  background: #2a6b4d;
}

.attachment-field__name {
  min-width: 0;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.attachment-field__remove {
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

.attachment-field__remove:hover {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}
</style>
