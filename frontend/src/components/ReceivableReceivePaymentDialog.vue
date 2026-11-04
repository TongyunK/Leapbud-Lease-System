<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { fetchCustomer } from '@/api/customers'
import { createReceiptApi, uploadReceiptAttachmentsApi } from '@/api/receipts'
import { RECEIPT_PAYMENT_METHODS } from '@/types/receipt'
import type { ReceivableRecord } from '@/types/receivable'
import SelectWithViewAction from '@/components/SelectWithViewAction.vue'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { formatMoney } from '@/utils/format'
import { isImageAttachment, isPdfAttachment } from '@/utils/attachmentUrl'

type SendWhatsappChoice = 'send' | 'skip'

const visible = defineModel<boolean>({ default: false })

const props = defineProps<{
  receivable: ReceivableRecord | null
}>()

const emit = defineEmits<{
  collected: []
  openCustomer: [id: string]
  openInvoice: [id: string]
  openContract: [id: string]
}>()

const { t } = useI18n()
const receiptPerms = useResourcePermissions('receipts')

const submitting = ref(false)
const payFileInput = ref<HTMLInputElement | null>(null)
const pendingFiles = ref<File[]>([])
const previewUrls = ref<string[]>([])
const imageViewerVisible = ref(false)
const imageViewerList = ref<string[]>([])
const imageViewerIndex = ref(0)

const form = reactive({
  paymentDate: '',
  paymentMethod: '' as string,
  amount: 0 as number | null,
  remark: '',
  sendWhatsapp: 'send' as SendWhatsappChoice,
  whatsappNumber: '',
})

const sendWhatsappOptions = computed(() => [
  { value: 'send' as const, label: t('receivable.sendWhatsappYes') },
  { value: 'skip' as const, label: t('receivable.sendWhatsappNo') },
])

const outstanding = computed(() => {
  const n = Number(props.receivable?.receivableAmount ?? 0)
  return Number.isFinite(n) ? Math.max(0, n) : 0
})

const canCollect = computed(() => outstanding.value > 0.009)

function todayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function moneyText(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

function isImageFile(file: File) {
  return file.type.startsWith('image/') || isImageAttachment(file.name)
}

function isPdfFile(file: File) {
  return file.type === 'application/pdf' || isPdfAttachment(file.name)
}

function revokePreviewUrls() {
  for (const u of previewUrls.value) URL.revokeObjectURL(u)
  previewUrls.value = []
}

function syncPreviewUrls(files: File[]) {
  revokePreviewUrls()
  previewUrls.value = files.map((f) => URL.createObjectURL(f))
}

async function loadCustomerWhatsapp(customerId: string) {
  form.whatsappNumber = ''
  if (!customerId) return
  try {
    const { data } = await fetchCustomer(customerId)
    const fromOccupant = data?.primaryOccupant?.whatsapp?.trim() || ''
    const fromCustomer = data?.mobilePhone?.trim() || ''
    form.whatsappNumber = fromOccupant || fromCustomer
  } catch {
    form.whatsappNumber = ''
  }
}

function resetForm() {
  const row = props.receivable
  form.paymentDate = todayYmd()
  form.paymentMethod = ''
  form.amount = row ? Math.round(outstanding.value * 100) / 100 : 0
  form.remark = ''
  form.sendWhatsapp = 'send'
  form.whatsappNumber = ''
  pendingFiles.value = []
  revokePreviewUrls()
  imageViewerVisible.value = false
  if (row?.customerId) void loadCustomerWhatsapp(row.customerId)
}

watch(
  () => [visible.value, props.receivable?.id] as const,
  ([open]) => {
    if (open) resetForm()
    else {
      revokePreviewUrls()
      imageViewerVisible.value = false
    }
  },
)

onBeforeUnmount(() => {
  revokePreviewUrls()
})

function onPickFiles(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length) {
    pendingFiles.value = [...pendingFiles.value, ...files]
    syncPreviewUrls(pendingFiles.value)
  }
  input.value = ''
}

function removeFile(idx: number) {
  pendingFiles.value = pendingFiles.value.filter((_, i) => i !== idx)
  syncPreviewUrls(pendingFiles.value)
}

function previewFile(idx: number) {
  const file = pendingFiles.value[idx]
  const url = previewUrls.value[idx]
  if (!file || !url) return
  if (isImageFile(file)) {
    const imageIdxs = pendingFiles.value
      .map((f, i) => (isImageFile(f) ? i : -1))
      .filter((i) => i >= 0)
    imageViewerList.value = imageIdxs.map((i) => previewUrls.value[i]!).filter(Boolean)
    const pos = imageIdxs.indexOf(idx)
    imageViewerIndex.value = Math.max(0, pos)
    imageViewerVisible.value = true
    return
  }
  // PDF / 其它：新标签打开本地 blob
  window.open(url, '_blank', 'noopener,noreferrer')
}

async function alertMsg(message: string) {
  await ElMessageBox.alert(message, t('receivable.receivePayment'), {
    type: 'warning',
    confirmButtonText: t('common.confirm'),
  })
}

async function submit() {
  const row = props.receivable
  if (!row) return
  if (!receiptPerms.create) {
    await alertMsg(t('receivable.receivePaymentNoPerm'))
    return
  }
  if (!canCollect.value) {
    await alertMsg(t('receivable.receivePaymentFullyPaid'))
    return
  }
  if (!form.paymentDate) {
    await alertMsg(t('receivable.receivePaymentNeedDate'))
    return
  }
  if (!form.paymentMethod) {
    await alertMsg(t('receivable.receivePaymentNeedMethod'))
    return
  }
  const amount = Number(form.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    await alertMsg(t('receivable.receivePaymentNeedAmount'))
    return
  }
  if (amount > outstanding.value + 0.009) {
    await alertMsg(
      t('receivable.receivePaymentAmountExceed', {
        amount: formatMoney(outstanding.value),
      }),
    )
    return
  }

  submitting.value = true
  try {
    const { data: created } = await createReceiptApi(
      {
        customerId: row.customerId,
        contractId: row.contractId || null,
        invoiceId: row.invoiceId,
        receivableId: row.id,
        paymentDate: form.paymentDate,
        paymentMethod: form.paymentMethod,
        amount: Math.round(amount * 100) / 100,
        remark: form.remark.trim() || undefined,
      },
      { silentError: true },
    )
    if (created?.id && pendingFiles.value.length) {
      try {
        await uploadReceiptAttachmentsApi(created.id, pendingFiles.value)
      } catch {
        await ElMessageBox.alert(
          t('receivable.receivePaymentAttachFailed'),
          t('receivable.receivePayment'),
          { type: 'warning', confirmButtonText: t('common.confirm') },
        )
      }
    }
    await ElMessageBox.alert(t('receivable.receivePaymentDone'), t('receivable.receivePayment'), {
      type: 'success',
      confirmButtonText: t('common.confirm'),
    })
    visible.value = false
    emit('collected')
  } catch (e: unknown) {
    const raw = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data
      ?.message
    const msg = Array.isArray(raw)
      ? raw.join('\n')
      : raw || t('receivable.receivePaymentFailed')
    await ElMessageBox.alert(String(msg), t('receivable.receivePayment'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('receivable.receivePayment')"
    width="720px"
    append-to-body
    destroy-on-close
    class="lb-dialog recv-pay-dialog"
  >
    <div v-if="receivable" class="recv-pay">
      <div class="recv-pay__summary">
        <div class="recv-pay__sum-item">
          <span class="recv-pay__sum-label">{{ t('receivable.fields.paymentDueDate') }}</span>
          <el-input :model-value="receivable.paymentDueDate || '—'" disabled />
        </div>
        <div class="recv-pay__sum-item">
          <span class="recv-pay__sum-label">{{ t('receivable.fields.invoiceAmount') }}</span>
          <el-input :model-value="moneyText(receivable.invoiceAmount)" disabled />
        </div>
        <div class="recv-pay__sum-item">
          <span class="recv-pay__sum-label">{{ t('receivable.fields.receivedAmount') }}</span>
          <el-input :model-value="moneyText(receivable.receivedAmount)" disabled />
        </div>
        <div class="recv-pay__sum-item recv-pay__sum-item--due">
          <span class="recv-pay__sum-label">{{ t('receivable.fields.receivableAmount') }}</span>
          <el-input :model-value="moneyText(receivable.receivableAmount)" disabled />
        </div>
      </div>

      <h3 class="recv-pay__section">{{ t('receivable.receivePaymentSection') }}</h3>

      <el-form label-position="top" class="recv-pay__form" @submit.prevent>
        <div class="recv-pay__grid">
          <el-form-item :label="t('receivable.fields.customerName')">
            <SelectWithViewAction
              control="input"
              :disabled="!receivable.customerId"
              @view="emit('openCustomer', receivable.customerId)"
            >
              <el-input :model-value="receivable.customerName || '—'" disabled />
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('receivable.fields.invoiceCode')">
            <SelectWithViewAction
              control="input"
              :disabled="!receivable.invoiceId"
              @view="emit('openInvoice', receivable.invoiceId)"
            >
              <el-input :model-value="receivable.invoiceCode || '—'" disabled />
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('receivable.fields.contractCode')">
            <SelectWithViewAction
              control="input"
              :disabled="!receivable.contractId"
              @view="receivable.contractId && emit('openContract', receivable.contractId)"
            >
              <el-input :model-value="receivable.contractCode || '—'" disabled />
            </SelectWithViewAction>
          </el-form-item>
          <el-form-item :label="t('receipt.fields.paymentDate')" required>
            <el-date-picker
              v-model="form.paymentDate"
              type="date"
              value-format="YYYY-MM-DD"
              style="width: 100%"
              :teleported="false"
            />
          </el-form-item>
          <el-form-item :label="t('receivable.receivePaymentAmount')" required>
            <el-input-number
              v-model="form.amount"
              :min="0.01"
              :max="Math.max(outstanding, 0.01)"
              :precision="2"
              :step="100"
              controls-position="right"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item :label="t('receipt.fields.paymentMethod')" required>
            <el-select
              v-model="form.paymentMethod"
              filterable
              clearable
              value-on-clear=""
              :placeholder="t('common.pleaseSelect')"
              style="width: 100%"
              :teleported="false"
            >
              <el-option v-for="m in RECEIPT_PAYMENT_METHODS" :key="m" :label="m" :value="m" />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item :label="t('receipt.fields.attachments')">
          <div class="recv-pay-att">
            <input
              ref="payFileInput"
              type="file"
              class="recv-pay-att__input"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
              @change="onPickFiles"
            />

            <div class="recv-pay-att__trigger-row">
              <button type="button" class="recv-pay-att__trigger" @click="payFileInput?.click()">
                <el-icon class="recv-pay-att__cloud" :size="18"><UploadFilled /></el-icon>
                <span class="recv-pay-att__trigger-text">{{ t('attachment.upload') }}</span>
                <span class="recv-pay-att__count">
                  {{ t('attachment.countOnly', { current: pendingFiles.length }) }}
                </span>
              </button>
            </div>

            <div
              v-for="(f, idx) in pendingFiles"
              :key="`${f.name}-${idx}`"
              class="recv-pay-att__chip-wrap"
            >
              <button
                type="button"
                class="recv-pay-att__chip recv-pay-att__chip--clickable"
                :title="t('attachment.preview')"
                @click="previewFile(idx)"
              >
                <span
                  class="recv-pay-att__icon"
                  :class="{
                    'recv-pay-att__icon--pdf': isPdfFile(f),
                    'recv-pay-att__icon--img': isImageFile(f),
                    'recv-pay-att__icon--file': !isPdfFile(f) && !isImageFile(f),
                  }"
                >
                  {{ isPdfFile(f) ? 'PDF' : isImageFile(f) ? 'IMG' : 'FILE' }}
                </span>
                <span class="recv-pay-att__name">{{ f.name }}</span>
              </button>
              <button
                type="button"
                class="recv-pay-att__remove"
                :title="t('common.delete')"
                @click="removeFile(idx)"
              >
                ×
              </button>
            </div>
            <p v-if="!pendingFiles.length" class="recv-pay-att__empty">
              {{ t('attachment.empty') }}
            </p>
          </div>
          <el-image-viewer
            v-if="imageViewerVisible && imageViewerList.length"
            :url-list="imageViewerList"
            :initial-index="imageViewerIndex"
            teleported
            hide-on-click-modal
            @close="imageViewerVisible = false"
          />
        </el-form-item>

        <el-form-item :label="t('receipt.fields.remark')">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>

        <div class="recv-pay__send-block">
          <h3 class="recv-pay__send-title">{{ t('receivable.sendReceiptSection') }}</h3>
          <div class="recv-pay__grid">
            <el-form-item :label="t('receivable.sendWhatsapp')">
              <el-select
                v-model="form.sendWhatsapp"
                style="width: 100%"
                :teleported="false"
              >
                <el-option
                  v-for="opt in sendWhatsappOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('receivable.whatsappNumberWithCode')">
              <el-input
                v-model="form.whatsappNumber"
                :disabled="form.sendWhatsapp !== 'send'"
                clearable
              />
            </el-form-item>
          </div>
        </div>
      </el-form>
    </div>

    <template #footer>
      <el-button :disabled="submitting" @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button
        v-admin-glow="receiptPerms.codes.create"
        type="primary"
        class="lb-btn-primary"
        :loading="submitting"
        :disabled="!canCollect"
        @click="submit"
      >
        {{ t('common.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.recv-pay {
  display: flex;
  flex-direction: column;
  gap: 14px;
  color: #1a2a22;
  font-size: 14px;
}

.recv-pay__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px 12px;
  padding: 12px 14px;
  border: 1px solid #e2e8e5;
  border-radius: 12px;
  background: linear-gradient(180deg, #f7faf8 0%, #f2f6f4 100%);
}

.recv-pay__sum-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.recv-pay__sum-label {
  font-size: 0.78rem;
  font-weight: 650;
  color: #5a6b62;
}

.recv-pay__sum-item--due :deep(.el-input__inner) {
  color: #0f4a32;
  font-weight: 700;
}

.recv-pay__section {
  margin: 2px 0 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f4a32;
}

.recv-pay__send-block {
  margin-top: 4px;
}

.recv-pay__send-title {
  margin: 0 0 10px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #eef2f0;
  font-size: 0.92rem;
  font-weight: 700;
  color: #1a2a22;
}

.recv-pay__grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 4px 16px;
}

.recv-pay-att {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.recv-pay-att__input {
  display: none;
}

.recv-pay-att__trigger-row {
  display: flex;
  align-items: center;
}

.recv-pay-att__trigger {
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

.recv-pay-att__trigger:hover .recv-pay-att__trigger-text {
  text-decoration: underline;
}

.recv-pay-att__cloud {
  flex: 0 0 auto;
  color: #3a7bd5;
}

.recv-pay-att__trigger-text {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.recv-pay-att__count {
  font-weight: 550;
  text-decoration: none;
}

.recv-pay-att__empty {
  margin: 0;
  color: #8a9690;
  font-size: 0.82rem;
  line-height: 1.4;
}

.recv-pay-att__chip-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
}

.recv-pay-att__chip {
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

.recv-pay-att__chip--clickable {
  cursor: pointer;
}

.recv-pay-att__chip--clickable:hover .recv-pay-att__name {
  color: var(--lb-brand, #0f4a32);
  text-decoration: underline;
}

.recv-pay-att__icon {
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
  background: #6a7a72;
}

.recv-pay-att__icon--pdf {
  background: #c0392b;
}

.recv-pay-att__icon--img {
  background: #2a6b4d;
}

.recv-pay-att__icon--file {
  background: #5a6b62;
}

.recv-pay-att__name {
  min-width: 0;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.recv-pay-att__remove {
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

.recv-pay-att__remove:hover {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}

@media (max-width: 720px) {
  .recv-pay__summary,
  .recv-pay__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
