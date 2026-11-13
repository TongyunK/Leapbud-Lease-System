<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { uploadAttachmentApi } from '@/api/uploads'
import {
  attachmentFileName,
  attachmentPublicUrl,
  isImageAttachment,
  isPdfAttachment,
} from '@/utils/attachmentUrl'

const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    /** 只读：可预览，不可上传/删除 */
    disabled?: boolean
  }>(),
  { disabled: false },
)

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
const fileCountLabel = computed(() =>
  t('attachment.count', { current: hasFile.value ? 1 : 0, max: 1 }),
)

function triggerPick() {
  if (props.disabled || uploading.value) return
  inputRef.value?.click()
}

async function onPick(ev: Event) {
  if (props.disabled) return
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
  if (props.disabled) return
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

    <div v-if="!hasFile && !disabled" class="attachment-field__trigger-row">
      <button
        type="button"
        class="attachment-field__trigger"
        :disabled="uploading"
        :aria-busy="uploading"
        @click="triggerPick"
      >
        <el-icon class="attachment-field__cloud" :size="18">
          <UploadFilled />
        </el-icon>
        <span class="attachment-field__trigger-text">
          {{ uploading ? t('common.loading') : t('attachment.upload') }}
        </span>
        <span class="attachment-field__count">{{ fileCountLabel }}</span>
      </button>
    </div>

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
        v-if="!disabled"
        type="button"
        class="attachment-field__remove"
        :title="t('common.delete')"
        :disabled="uploading"
        @click="clearFile"
      >
        ×
      </button>
    </div>
    <p v-else class="attachment-field__empty">{{ t('attachment.empty') }}</p>

    <AttachmentImageViewer
      v-if="imageViewerVisible && publicUrl"
      :url-list="[publicUrl]"
      @close="imageViewerVisible = false"
    />
  </div>
</template>

<style scoped>
.attachment-field {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}

.attachment-field__input {
  display: none;
}

.attachment-field__trigger-row {
  display: flex;
  align-items: center;
}

.attachment-field__trigger {
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

.attachment-field__trigger:hover:not(:disabled) .attachment-field__trigger-text {
  text-decoration: underline;
}

.attachment-field__trigger:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.attachment-field__cloud {
  flex: 0 0 auto;
  color: #3a7bd5;
}

.attachment-field__trigger-text {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.attachment-field__count {
  font-weight: 550;
  text-decoration: none;
}

.attachment-field__empty {
  margin: 0;
  color: #8a9690;
  font-size: 0.82rem;
  line-height: 1.4;
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
  color: var(--lb-brand, #0f4a32);
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
