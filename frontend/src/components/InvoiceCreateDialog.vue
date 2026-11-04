<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Delete, Plus, Rank } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { createInvoiceApi, previewInvoiceCodeApi } from '@/api/invoices'
import {
  previewInvoiceDraftPdfApi,
  type InvoicePreviewDraft,
} from '@/api/document-templates'
import type { ContractRecord } from '@/types/contract'
import {
  CONTRACT_INVOICE_TYPES,
  DEFAULT_CONTRACT_INVOICE_TYPE,
  INVOICE_TYPE_I18N_KEY,
  type InvoiceServiceDetailRecord,
} from '@/types/invoice'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useUserStore } from '@/stores/user'
import { formatMoney } from '@/utils/format'
import SelectWithViewAction from '@/components/SelectWithViewAction.vue'

const visible = defineModel<boolean>({ default: false })

const props = defineProps<{
  /** 预填关联合约（关联发票抽屉等入口） */
  contract?: ContractRecord | null
}>()

const emit = defineEmits<{
  saved: []
  openContract: [contractId: string]
  openCustomer: [customerId: string]
  openRoom: [roomId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const userStore = useUserStore()
const dialogWidth = computed(() => (isMobile.value ? '94%' : '900px'))
const saving = ref(false)
const previewingDraft = ref(false)

type FeeFormRow = {
  uid: string
  description: string
  quantity: number
  unitAmount: number
  remark: string
  sortOrder: number
}

function todayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function newFeeUid() {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function defaultFeeRow(partial?: Partial<FeeFormRow>): FeeFormRow {
  return {
    uid: newFeeUid(),
    description: '',
    quantity: 1,
    unitAmount: 0,
    remark: '',
    sortOrder: 0,
    ...partial,
  }
}

function defaultCreateFeeRows(today: string): FeeFormRow[] {
  return [
    defaultFeeRow({ description: 'Deposit', sortOrder: 0 }),
    defaultFeeRow({
      description: `1, Charging Period\n${today}`,
      sortOrder: 1,
    }),
  ]
}

const form = reactive({
  invoiceCode: '',
  invoiceType: DEFAULT_CONTRACT_INVOICE_TYPE as string,
  invoiceDate: '',
  paymentDueDate: '',
  remark: '',
})

const feeRows = ref<FeeFormRow[]>([])
const FEE_PAGE_SIZE = 5
const feePage = ref(1)
const dragFeeUid = ref<string | null>(null)
const dragOverFeeUid = ref<string | null>(null)
const editingFeeIndexUid = ref<string | null>(null)
const editingFeeIndexDraft = ref('')
const feeIndexInputRef = ref<HTMLInputElement | null>(null)
let feeIndexCommitLock = false

const feePageCount = computed(() =>
  Math.max(1, Math.ceil(feeRows.value.length / FEE_PAGE_SIZE) || 1),
)
const pagedFeeRows = computed(() => {
  const start = (feePage.value - 1) * FEE_PAGE_SIZE
  return feeRows.value.slice(start, start + FEE_PAGE_SIZE).map((row, i) => ({
    row,
    index: start + i,
  }))
})

function feeSubtotal(row: Pick<FeeFormRow, 'quantity' | 'unitAmount'>): number {
  return Math.round(Number(row.quantity || 0) * Number(row.unitAmount || 0) * 100) / 100
}

const feeAmountTotal = computed(() =>
  Math.round(feeRows.value.reduce((s, r) => s + feeSubtotal(r), 0) * 100) / 100,
)

function typeLabel(type: string) {
  const key = INVOICE_TYPE_I18N_KEY[type]
  return key ? t(`invoice.types.${key}`) : type
}

function contractOptionLabel(c: ContractRecord) {
  const parts = [c.contractCode]
  if (c.customerName?.trim()) parts.push(c.customerName)
  if (c.roomCode?.trim()) parts.push(c.roomCode)
  return parts.filter(Boolean).join(' · ')
}

function serviceDetailsPayload(): InvoiceServiceDetailRecord[] {
  return feeRows.value
    .filter((r) => r.description.trim())
    .map((r, i) => ({
      description: r.description.trim(),
      quantity: Number(r.quantity) || 0,
      unitAmount: Number(r.unitAmount) || 0,
      subtotal: feeSubtotal(r),
      remark: r.remark.trim() || undefined,
      sortOrder: i,
    }))
}

function draftFromForm(): InvoicePreviewDraft {
  const contract = props.contract
  const details = serviceDetailsPayload()
  const roomNameText = contract
    ? [contract.roomCode, contract.roomName].filter(Boolean).join(' · ')
    : undefined
  return {
    contractId: contract?.id || undefined,
    customerId: contract?.customerId || undefined,
    roomId: contract?.roomId || undefined,
    invoiceCode: form.invoiceCode.trim() || undefined,
    invoiceType: form.invoiceType || undefined,
    description: form.invoiceType || undefined,
    amount: feeAmountTotal.value,
    invoiceDate: form.invoiceDate || null,
    paymentDueDate: form.paymentDueDate || null,
    status: '已開票',
    roomNameText,
    remark: form.remark.trim() || undefined,
    serviceDetails: details,
  }
}

async function refreshCodePreview(contractId: string) {
  try {
    const { data } = await previewInvoiceCodeApi({ contractId })
    form.invoiceCode = data?.code?.trim() || ''
  } catch {
    form.invoiceCode = ''
  }
}

function resetForm() {
  const today = todayYmd()
  form.invoiceCode = ''
  form.invoiceType = DEFAULT_CONTRACT_INVOICE_TYPE
  form.invoiceDate = today
  form.paymentDueDate = today
  form.remark = ''
  feeRows.value = defaultCreateFeeRows(today)
  feePage.value = 1
  dragFeeUid.value = null
  dragOverFeeUid.value = null
  editingFeeIndexUid.value = null
}

watch(visible, (open) => {
  if (!open) return
  resetForm()
  const id = props.contract?.id?.trim()
  if (id) void refreshCodePreview(id)
})

function addFeeRow() {
  feeRows.value.push(defaultFeeRow({ sortOrder: feeRows.value.length }))
  feePage.value = Math.ceil(feeRows.value.length / FEE_PAGE_SIZE)
}

function removeFeeRow(absoluteIdx: number) {
  feeRows.value.splice(absoluteIdx, 1)
  if (feePage.value > feePageCount.value) feePage.value = feePageCount.value
}

function onFeeDragStart(uid: string, e: DragEvent) {
  dragFeeUid.value = uid
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', uid)
  }
}

function onFeeDragOver(uid: string, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverFeeUid.value = uid
}

function onFeeDrop(targetUid: string, e: DragEvent) {
  e.preventDefault()
  const fromUid = dragFeeUid.value || e.dataTransfer?.getData('text/plain')
  dragFeeUid.value = null
  dragOverFeeUid.value = null
  if (!fromUid || fromUid === targetUid) return
  const list = feeRows.value
  const fromIdx = list.findIndex((r) => r.uid === fromUid)
  const toIdx = list.findIndex((r) => r.uid === targetUid)
  if (fromIdx < 0 || toIdx < 0) return
  const [item] = list.splice(fromIdx, 1)
  list.splice(toIdx, 0, item)
}

function onFeeDragEnd() {
  dragFeeUid.value = null
  dragOverFeeUid.value = null
}

async function startEditFeeIndex(uid: string, absoluteIdx: number) {
  if (feeRows.value.length <= 1) return
  editingFeeIndexUid.value = uid
  editingFeeIndexDraft.value = String(absoluteIdx + 1)
  await nextTick()
  feeIndexInputRef.value?.focus()
  feeIndexInputRef.value?.select()
}

function onFeeIndexDraftInput(e: Event) {
  editingFeeIndexDraft.value = (e.target as HTMLInputElement).value
}

function onFeeIndexKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitEditFeeIndex()
  } else if (e.key === 'Escape') {
    editingFeeIndexUid.value = null
  }
}

function commitEditFeeIndex() {
  if (feeIndexCommitLock) return
  feeIndexCommitLock = true
  const uid = editingFeeIndexUid.value
  editingFeeIndexUid.value = null
  const raw = editingFeeIndexDraft.value.trim()
  const target = Number.parseInt(raw, 10)
  if (uid && Number.isFinite(target) && target >= 1) {
    const list = feeRows.value
    const fromIdx = list.findIndex((r) => r.uid === uid)
    if (fromIdx >= 0) {
      const toIdx = Math.min(Math.max(target, 1), list.length) - 1
      if (toIdx !== fromIdx) {
        const [item] = list.splice(fromIdx, 1)
        list.splice(toIdx, 0, item)
        feePage.value = Math.floor(toIdx / FEE_PAGE_SIZE) + 1
      }
    }
  }
  feeIndexCommitLock = false
}

async function alertWarn(msg: string) {
  try {
    await ElMessageBox.alert(msg, t('invoice.create'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
  } catch {
    /* dismiss */
  }
}

async function onPreviewInvoiceDraft() {
  if (previewingDraft.value || saving.value) return
  const contract = props.contract
  if (!contract?.id) {
    await alertWarn(t('invoice.contractRequired'))
    return
  }
  if (!String(form.invoiceDate || '').trim()) {
    await alertWarn(t('invoice.invoiceDateRequired'))
    return
  }
  if (!String(form.paymentDueDate || '').trim()) {
    await alertWarn(t('invoice.paymentDueDateRequired'))
    return
  }
  if (!contract.customerId?.trim() || !contract.roomId?.trim()) {
    await alertWarn(t('invoice.previewNeedCustomerRoom'))
    return
  }
  previewingDraft.value = true
  try {
    await previewInvoiceDraftPdfApi(draftFromForm(), null, { silentError: true })
  } catch (e) {
    const msg =
      e instanceof Error && e.message ? e.message : t('invoice.printInvoiceFailed')
    try {
      await ElMessageBox.alert(msg, t('invoice.create'), {
        type: 'error',
        confirmButtonText: t('common.confirm'),
      })
    } catch {
      /* dismiss */
    }
  } finally {
    previewingDraft.value = false
  }
}

async function onSave() {
  const contract = props.contract
  if (!contract?.id) {
    await alertWarn(t('invoice.contractRequired'))
    return
  }
  if (!String(form.invoiceDate || '').trim()) {
    await alertWarn(t('invoice.invoiceDateRequired'))
    return
  }
  if (!String(form.paymentDueDate || '').trim()) {
    await alertWarn(t('invoice.paymentDueDateRequired'))
    return
  }
  const details = serviceDetailsPayload()
  if (!details.length) {
    await alertWarn(t('invoice.serviceDetailMinOne'))
    return
  }
  const salesManagerId =
    contract.salesManagerId?.trim() || userStore.user?.id?.trim() || null
  saving.value = true
  try {
    await createInvoiceApi({
      source: 'contract',
      contractId: contract.id,
      invoiceType: form.invoiceType || undefined,
      description: form.invoiceType || undefined,
      amount: feeAmountTotal.value,
      status: '已開票',
      invoiceDate: form.invoiceDate || undefined,
      paymentDueDate: form.paymentDueDate || undefined,
      salesManagerId,
      remark: form.remark.trim() || undefined,
      serviceDetails: details,
    })
    visible.value = false
    emit('saved')
  } catch {
    /* interceptor / silent */
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('invoice.create')"
    :width="dialogWidth"
    :fullscreen="isMobile"
    destroy-on-close
    append-to-body
    class="lb-dialog"
  >
    <el-form label-position="top" class="invoice-form">
      <div class="form-grid">
        <el-form-item :label="t('invoice.fields.invoiceCode')">
          <el-input v-model="form.invoiceCode" disabled :placeholder="t('invoice.codeAutoHint')" />
        </el-form-item>
        <el-form-item :label="t('invoice.fields.contractCode')" required>
          <SelectWithViewAction
            control="input"
            :disabled="!contract?.id"
            @view="contract?.id && emit('openContract', contract.id)"
          >
            <el-input
              :model-value="contract ? contractOptionLabel(contract) : ''"
              disabled
            />
          </SelectWithViewAction>
        </el-form-item>
        <el-form-item :label="t('invoice.fields.customerName')">
          <SelectWithViewAction
            control="input"
            :disabled="!contract?.customerId"
            @view="contract?.customerId && emit('openCustomer', contract.customerId)"
          >
            <el-input :model-value="contract?.customerName || ''" disabled />
          </SelectWithViewAction>
        </el-form-item>
        <el-form-item :label="t('invoice.fields.roomName')">
          <SelectWithViewAction
            control="input"
            :disabled="!contract?.roomId"
            @view="contract?.roomId && emit('openRoom', contract.roomId)"
          >
            <el-input
              :model-value="
                contract
                  ? `${contract.roomCode}${contract.roomName ? ' · ' + contract.roomName : ''}`
                  : ''
              "
              disabled
            />
          </SelectWithViewAction>
        </el-form-item>
        <el-form-item :label="t('invoice.fields.invoiceType')">
          <el-select v-model="form.invoiceType" style="width: 100%">
            <el-option
              v-for="s in CONTRACT_INVOICE_TYPES"
              :key="s"
              :label="typeLabel(s)"
              :value="s"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('invoice.fields.amount')" required>
          <el-input-number
            :model-value="feeAmountTotal"
            :min="0"
            :precision="2"
            :controls="false"
            disabled
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('invoice.fields.invoiceDate')" required>
          <el-date-picker
            v-model="form.invoiceDate"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('invoice.fields.paymentDueDate')" required>
          <el-date-picker
            v-model="form.paymentDueDate"
            type="date"
            value-format="YYYY-MM-DD"
            style="width: 100%"
          />
        </el-form-item>
      </div>

      <section class="form-section form-section--fees">
        <div class="period-section-head">
          <div class="period-section-head__left">
            <h3>{{ t('invoice.sections.serviceDetails') }}</h3>
            <el-button
              type="primary"
              size="small"
              plain
              :icon="Plus"
              class="period-add-btn"
              @click="addFeeRow"
            >
              {{ t('invoice.addServiceDetailRow') }}
            </el-button>
          </div>
          <div v-if="feeRows.length > FEE_PAGE_SIZE" class="period-table-pager">
            <el-pagination
              v-model:current-page="feePage"
              :page-size="FEE_PAGE_SIZE"
              :total="feeRows.length"
              layout="total, prev, pager, next"
              small
              background
              class="period-pager"
            />
          </div>
        </div>
        <div class="period-table-wrap">
          <div
            class="period-table fee-table"
            role="table"
            :style="{ '--period-page-size': FEE_PAGE_SIZE }"
          >
            <div class="period-table__head" role="row">
              <div class="period-table__cell period-table__cell--index" role="columnheader">#</div>
              <div class="period-table__cell fee-table__cell--desc" role="columnheader">
                <span class="req">*</span>{{ t('invoice.fields.feeDescription') }}
              </div>
              <div class="period-table__cell fee-table__cell--qty" role="columnheader">
                <span class="req">*</span>{{ t('invoice.fields.feeQuantity') }}
              </div>
              <div class="period-table__cell fee-table__cell--unit" role="columnheader">
                <span class="req">*</span>{{ t('invoice.fields.feeUnitAmount') }}
              </div>
              <div class="period-table__cell fee-table__cell--sub" role="columnheader">
                {{ t('invoice.fields.feeSubtotal') }}
              </div>
              <div class="period-table__cell fee-table__cell--remark" role="columnheader">
                {{ t('invoice.fields.feeRemark') }}
              </div>
              <div class="period-table__cell fee-table__cell--actions" role="columnheader" />
            </div>
            <div
              class="period-table__body"
              :class="{ 'period-table__body--fixed': feeRows.length > FEE_PAGE_SIZE }"
            >
              <div
                v-for="{ row: fee, index: idx } in pagedFeeRows"
                :key="fee.uid"
                class="period-table__row"
                role="row"
                :class="{
                  'is-dragging': dragFeeUid === fee.uid,
                  'is-drag-over': dragOverFeeUid === fee.uid,
                  'is-editing-index': editingFeeIndexUid === fee.uid,
                }"
                @dragover="onFeeDragOver(fee.uid, $event)"
                @drop="onFeeDrop(fee.uid, $event)"
                @dragleave="dragOverFeeUid === fee.uid && (dragOverFeeUid = null)"
              >
                <div
                  class="period-table__cell period-table__cell--index"
                  :class="{ 'is-editing-index': editingFeeIndexUid === fee.uid }"
                  role="cell"
                >
                  <button
                    type="button"
                    class="period-row__handle"
                    draggable="true"
                    :title="t('invoice.dragServiceDetail')"
                    aria-label="drag"
                    @dragstart="onFeeDragStart(fee.uid, $event)"
                    @dragend="onFeeDragEnd"
                  >
                    <el-icon :size="14"><Rank /></el-icon>
                  </button>
                  <input
                    v-if="editingFeeIndexUid === fee.uid"
                    ref="feeIndexInputRef"
                    :value="editingFeeIndexDraft"
                    class="period-row__index-input"
                    type="text"
                    inputmode="numeric"
                    pattern="[0-9]*"
                    maxlength="4"
                    :aria-label="t('invoice.editServiceDetailIndex')"
                    @input="onFeeIndexDraftInput"
                    @keydown="onFeeIndexKeydown"
                    @blur="commitEditFeeIndex"
                  />
                  <button
                    v-else
                    type="button"
                    class="period-row__index"
                    :title="t('invoice.editServiceDetailIndexHint')"
                    @dblclick.stop="startEditFeeIndex(fee.uid, idx)"
                  >
                    {{ idx + 1 }}
                  </button>
                </div>
                <div class="period-table__cell fee-table__cell--desc" role="cell">
                  <el-input
                    v-model="fee.description"
                    type="textarea"
                    :rows="2"
                    resize="none"
                    class="fee-table__textarea"
                    :placeholder="t('invoice.fields.feeDescription')"
                  />
                </div>
                <div class="period-table__cell fee-table__cell--qty" role="cell">
                  <el-input-number
                    v-model="fee.quantity"
                    :min="0"
                    :precision="2"
                    controls-position="right"
                    style="width: 100%"
                  />
                </div>
                <div class="period-table__cell fee-table__cell--unit" role="cell">
                  <el-input-number
                    v-model="fee.unitAmount"
                    :min="0"
                    :precision="2"
                    controls-position="right"
                    style="width: 100%"
                  />
                </div>
                <div class="period-table__cell fee-table__cell--sub" role="cell">
                  {{ formatMoney(feeSubtotal(fee)) }}
                </div>
                <div class="period-table__cell fee-table__cell--remark" role="cell">
                  <el-input
                    v-model="fee.remark"
                    type="textarea"
                    :rows="2"
                    resize="none"
                    class="fee-table__textarea"
                    :placeholder="t('invoice.fields.feeRemark')"
                  />
                </div>
                <div class="period-table__cell fee-table__cell--actions" role="cell">
                  <el-button type="danger" link :icon="Delete" @click="removeFeeRow(idx)" />
                </div>
              </div>
              <div v-if="!feeRows.length" class="fee-table__empty">
                {{ t('invoice.noServiceDetailRows') }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <el-form-item :label="t('invoice.fields.remark')" class="invoice-form__remark">
        <el-input v-model="form.remark" type="textarea" :rows="2" />
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="dialog-footer">
        <el-button
          :loading="previewingDraft"
          :disabled="saving"
          @click="onPreviewInvoiceDraft"
        >
          {{ t('invoice.previewInvoice') }}
        </el-button>
        <el-button :disabled="saving || previewingDraft" @click="visible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button
          type="primary"
          class="lb-btn-primary"
          :loading="saving"
          :disabled="previewingDraft"
          @click="onSave"
        >
          {{ t('common.save') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 16px;
}

.invoice-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.invoice-form :deep(.el-form-item__label) {
  margin-bottom: 4px !important;
  line-height: 1.2;
}

.form-section--fees {
  margin-top: 12px;
  margin-bottom: 10px;
  padding-top: 8px;
  padding-bottom: 6px;
  border-top: 1px solid #edf2ef;
}

.invoice-form__remark {
  margin-top: 4px;
  margin-bottom: 0;
}

.period-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  min-height: 28px;
}

.period-section-head__left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.period-section-head h3 {
  margin: 0;
}

.period-add-btn {
  --el-button-bg-color: color-mix(in srgb, var(--lb-brand) 10%, #fff);
  --el-button-border-color: color-mix(in srgb, var(--lb-brand) 35%, #fff);
  --el-button-text-color: var(--lb-brand);
  --el-button-hover-bg-color: color-mix(in srgb, var(--lb-brand) 18%, #fff);
  --el-button-hover-border-color: var(--lb-brand);
  --el-button-hover-text-color: var(--lb-brand);
  font-weight: 600;
  border-radius: 999px;
  padding: 4px 12px;
  height: 26px;
}

.period-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #e4ebe6;
  border-radius: 8px;
  background: #fff;
}

.period-table-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  margin-left: auto;
  padding: 2px 4px 2px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 5%, #f4f7f5);
  border: 1px solid #e4ebe6;
}

.period-pager.el-pagination {
  --el-pagination-button-bg-color: #fff;
  --el-pagination-hover-color: var(--lb-brand, #0f4a32);
  --el-pagination-button-color: #4a5c54;
  font-weight: 600;
  gap: 2px;
}

.period-pager :deep(.el-pagination__total) {
  margin-right: 4px;
  color: #4a5c54;
  font-size: 0.78rem;
  font-weight: 650;
}

.period-pager :deep(.btn-prev),
.period-pager :deep(.btn-next),
.period-pager :deep(.el-pager li) {
  min-width: 26px !important;
  height: 26px !important;
  line-height: 26px !important;
  border-radius: 7px !important;
  margin: 0 2px !important;
}

.period-pager :deep(.el-pager li.is-active) {
  background: var(--lb-brand, #0f4a32) !important;
  color: #fff !important;
  font-weight: 700;
}

.period-pager :deep(.btn-prev:hover:not(:disabled)),
.period-pager :deep(.btn-next:hover:not(:disabled)),
.period-pager :deep(.el-pager li:hover:not(.is-active)) {
  color: var(--lb-brand, #0f4a32);
}

.period-table {
  --period-row-h: 44px;
  --period-page-size: 5;
  display: grid;
  min-width: 720px;
}

.fee-table.period-table {
  --period-row-h: 72px;
  --fee-textarea-h: 48px;
}

.fee-table.period-table .period-table__head,
.fee-table.period-table .period-table__row {
  display: grid;
  grid-template-columns:
    44px
    minmax(152px, 1.75fr)
    112px
    112px
    80px
    minmax(128px, 1.3fr)
    36px;
  align-items: center;
  column-gap: 4px;
  padding: 0 6px;
}

.fee-table .period-table__cell--index {
  gap: 0;
}

.fee-table .period-row__handle {
  width: 16px;
}

.fee-table .period-row__index {
  min-width: 0.9rem;
  padding: 0;
}

.fee-table .period-row__index-input {
  position: static;
  left: auto;
  top: auto;
  transform: none;
  width: 1.65rem;
  min-width: 1.65rem;
  flex: 0 0 auto;
}

.fee-table.period-table .period-table__row {
  padding-top: 6px;
  padding-bottom: 6px;
}

.period-table__head {
  min-height: 34px;
  background: #f4f7f5;
  border-bottom: 1px solid #e4ebe6;
  color: #3d4f45;
  font-size: 0.78rem;
  font-weight: 700;
}

.period-table__body {
  background: #fff;
}

.period-table__body--fixed {
  box-sizing: border-box;
  height: calc(var(--period-row-h) * var(--period-page-size));
  min-height: calc(var(--period-row-h) * var(--period-page-size));
  overflow: hidden;
}

.period-table__row {
  box-sizing: border-box;
  min-height: var(--period-row-h);
  height: var(--period-row-h);
  border-bottom: 1px solid #edf2ef;
  transition: background 0.12s ease, box-shadow 0.12s ease;
  background: #fff;
}

.period-table__body:not(.period-table__body--fixed) .period-table__row:last-child {
  border-bottom: none;
}

.period-table__row.is-dragging {
  opacity: 0.45;
}

.period-table__row.is-editing-index {
  position: relative;
  z-index: 4;
  overflow: visible;
}

.period-table__row.is-drag-over {
  background: color-mix(in srgb, var(--lb-brand) 6%, #fff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lb-brand) 35%, #fff);
}

.period-table__cell {
  display: flex;
  align-items: center;
  min-width: 0;
}

.period-table__cell--index {
  gap: 1px;
  justify-content: flex-start;
  position: relative;
  z-index: 1;
  overflow: visible;
}

.period-table__cell--index.is-editing-index {
  z-index: 5;
}

.fee-table__cell--actions {
  justify-content: center;
}

.fee-table .period-table__row .fee-table__cell--sub {
  justify-content: flex-end;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  color: #3d4f45;
}

.period-table__head .req {
  color: #e35d5d;
  margin-right: 2px;
}

.period-row__handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #8a9590;
  cursor: grab;
  flex: 0 0 auto;
}

.period-row__handle:hover {
  background: color-mix(in srgb, var(--lb-brand) 10%, #fff);
  color: var(--lb-brand);
}

.period-row__handle:active {
  cursor: grabbing;
}

.period-row__index {
  appearance: none;
  flex: 0 0 auto;
  min-width: 1rem;
  margin: 0;
  padding: 0 1px;
  border: none;
  border-radius: 4px;
  background: transparent;
  text-align: center;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #5a6b62;
  cursor: text;
  line-height: 1.4;
}

.period-row__index:hover {
  background: color-mix(in srgb, var(--lb-brand) 10%, #fff);
  color: var(--lb-brand);
}

.period-row__index-input {
  box-sizing: border-box;
  position: absolute;
  left: 18px;
  top: 50%;
  z-index: 6;
  width: 2.4rem;
  min-width: 2.4rem;
  height: 24px;
  margin: 0;
  padding: 0 3px;
  border: 1px solid var(--lb-brand, #0f4a32);
  border-radius: 5px;
  background: #fff;
  color: #0f4a32;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  text-align: center;
  line-height: 22px;
  outline: none;
  transform: translateY(-50%);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--lb-brand, #0f4a32) 18%, transparent);
}

.fee-table__empty {
  padding: 18px 12px;
  text-align: center;
  color: var(--lb-muted, #6a7a70);
  font-size: 0.84rem;
}

.fee-table__cell--desc,
.fee-table__cell--remark {
  align-self: stretch;
}

.fee-table__textarea {
  width: 100%;
}

.fee-table__textarea :deep(.el-textarea__inner) {
  box-sizing: border-box;
  height: var(--fee-textarea-h) !important;
  min-height: var(--fee-textarea-h) !important;
  max-height: var(--fee-textarea-h) !important;
  line-height: 1.35;
  padding: 4px 8px;
  resize: none;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: 0 0 0 1px #dbe4df inset;
}

.period-table__row :deep(.el-input__wrapper),
.period-table__row :deep(.el-select__wrapper) {
  min-height: 30px;
  box-shadow: 0 0 0 1px #dbe4df inset;
}

.period-table__row :deep(.el-input-number) {
  width: 100%;
}

.period-table__row :deep(.el-input-number .el-input__wrapper) {
  padding-left: 8px;
  padding-right: 8px;
}

.period-table__row :deep(.el-input-number.is-controls-right .el-input__wrapper) {
  padding-right: 36px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
