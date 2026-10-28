<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import type { ContractRecord } from '@/types/contract'
import type { ReceivableRecord } from '@/types/receivable'
import { fetchReceivables } from '@/api/receivables'
import { createReceiptApi, uploadReceiptAttachmentsApi } from '@/api/receipts'
import { RECEIPT_PAYMENT_METHODS } from '@/types/receipt'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useTableSelection } from '@/composables/useTableSelection'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { formatMoney } from '@/utils/format'
import TablePagination from '@/components/TablePagination.vue'
import { useClientPagination } from '@/composables/useClientPagination'

const visible = defineModel<boolean>({ default: false })

const props = defineProps<{
  contract: ContractRecord | null
}>()

const emit = defineEmits<{
  openContract: [contractId: string]
  openCustomer: [customerId: string]
  openInvoice: [invoiceId: string]
  collected: []
}>()

function onOpenInvoice(row: ReceivableRecord) {
  const id = row.invoiceId?.trim()
  if (!id) return
  emit('openInvoice', id)
}

const { t } = useI18n()
const isMobile = useIsMobile()
const receiptPerms = useResourcePermissions('receipts')
const { colW, codeColW, textColW, tableLayoutKey } = useTableColWidth()
const {
  tableRef,
  selectedCount,
  selectedIds,
  onSelectionChange,
  clearSelection,
} = useTableSelection<ReceivableRecord>()

const loading = ref(false)
const submitting = ref(false)
const rows = ref<ReceivableRecord[]>([])
/** 表格容器实测高度（px）；el-table 的 height% 常无法解析，需像素值才能内部滚动 */
const tableWrapRef = ref<HTMLElement | null>(null)
const tableHeight = ref(320)
let tableWrapRo: ResizeObserver | null = null

function measureTableHeight() {
  const el = tableWrapRef.value
  if (!el) return
  // 小屏上 wrap 可能只有 ~90px；门槛过高压住旧高度会把下方统计挤出 overflow
  const h = Math.max(80, Math.floor(el.getBoundingClientRect().height))
  if (h !== tableHeight.value) {
    tableHeight.value = h
  }
  void nextTick(() => {
    const tbl = tableRef.value as { doLayout?: () => void } | null
    tbl?.doLayout?.()
  })
}

function bindTableWrapObserver() {
  tableWrapRo?.disconnect()
  tableWrapRo = null
  const el = tableWrapRef.value
  if (!el || typeof ResizeObserver === 'undefined') return
  tableWrapRo = new ResizeObserver(() => measureTableHeight())
  tableWrapRo.observe(el)
  measureTableHeight()
}

onBeforeUnmount(() => {
  tableWrapRo?.disconnect()
  tableWrapRo = null
})

const dialogWidth = computed(() => (isMobile.value ? '96%' : '1040px'))

const totals = computed(() => {
  let invoice = 0
  let received = 0
  let outstanding = 0
  for (const r of rows.value) {
    invoice += Number(r.invoiceAmount ?? 0)
    received += Number(r.receivedAmount ?? 0)
    outstanding += Number(r.receivableAmount ?? 0)
  }
  return { invoice, received, outstanding }
})

const selectedRows = computed(() => {
  const ids = new Set(selectedIds.value)
  return rows.value.filter((r) => ids.has(r.id))
})

const selectedOutstanding = computed(() =>
  selectedRows.value.reduce((sum, r) => sum + Math.max(0, Number(r.receivableAmount ?? 0)), 0),
)

const collectableSelected = computed(() =>
  selectedRows.value.filter((r) => Number(r.receivableAmount ?? 0) > 0),
)

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } = useClientPagination(rows)

const payVisible = ref(false)
const payForm = reactive({
  paymentDate: '' as string,
  paymentMethod: RECEIPT_PAYMENT_METHODS[0] as string,
  remark: '',
})
const payPendingFiles = ref<File[]>([])
const payFileInput = ref<HTMLInputElement | null>(null)

function todayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function loadRows() {
  const contractId = props.contract?.id
  if (!contractId) {
    rows.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await fetchReceivables({
      contractId,
      page: 1,
      pageSize: 500,
      sortBy: 'invoiceDate',
      sortDir: 'asc',
    })
    rows.value = data?.items ?? []
    resetPage()
    clearSelection()
  } catch {
    rows.value = []
  } finally {
    loading.value = false
    await nextTick()
    measureTableHeight()
  }
}

watch(
  () => [visible.value, props.contract?.id] as const,
  async ([open]) => {
    if (open && props.contract?.id) {
      await loadRows()
      await nextTick()
      bindTableWrapObserver()
      // 弹窗入场 / 全屏切换后再测一次
      window.setTimeout(measureTableHeight, 80)
      window.setTimeout(measureTableHeight, 240)
      return
    }
    if (!open) {
      tableWrapRo?.disconnect()
      tableWrapRo = null
      rows.value = []
      clearSelection()
      payVisible.value = false
    }
  },
)

function openCollect() {
  if (!receiptPerms.create.value) {
    ElMessage.warning(t('contract.receivePaymentNoPerm'))
    return
  }
  if (!collectableSelected.value.length) {
    ElMessage.warning(t('contract.receivePaymentSelectFirst'))
    return
  }
  payForm.paymentDate = todayYmd()
  payForm.paymentMethod = RECEIPT_PAYMENT_METHODS[0]
  payForm.remark = ''
  payPendingFiles.value = []
  payVisible.value = true
}

function onPickPayFiles(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length) payPendingFiles.value = [...payPendingFiles.value, ...files]
  input.value = ''
}

function removePayFile(idx: number) {
  payPendingFiles.value = payPendingFiles.value.filter((_, i) => i !== idx)
}

async function submitCollect() {
  const targets = collectableSelected.value
  if (!targets.length) {
    ElMessage.warning(t('contract.receivePaymentSelectFirst'))
    return
  }
  if (!payForm.paymentDate) {
    ElMessage.warning(t('contract.receivePaymentNeedDate'))
    return
  }
  if (!payForm.paymentMethod) {
    ElMessage.warning(t('contract.receivePaymentNeedMethod'))
    return
  }

  submitting.value = true
  let ok = 0
  let fail = 0
  try {
    for (const row of targets) {
      const amount = Math.max(0, Number(row.receivableAmount ?? 0))
      if (amount <= 0) continue
      try {
        const { data: created } = await createReceiptApi({
          customerId: row.customerId,
          contractId: row.contractId,
          invoiceId: row.invoiceId,
          receivableId: row.id,
          paymentDate: payForm.paymentDate,
          paymentMethod: payForm.paymentMethod,
          amount,
          remark: payForm.remark || undefined,
        })
        if (created?.id && payPendingFiles.value.length) {
          try {
            await uploadReceiptAttachmentsApi(created.id, payPendingFiles.value)
          } catch {
            /* 附件失败不阻断已建收据 */
          }
        }
        ok += 1
      } catch {
        fail += 1
      }
    }
    if (ok) {
      ElMessage.success(
        fail
          ? t('contract.receivePaymentPartial', { ok, fail })
          : t('contract.receivePaymentDone', { n: ok }),
      )
      payVisible.value = false
      await loadRows()
      emit('collected')
    } else if (fail) {
      ElMessage.error(t('contract.receivePaymentFailed'))
    }
  } finally {
    submitting.value = false
  }
}

function onViewContract() {
  const id = props.contract?.id
  if (id) emit('openContract', id)
}

function onViewCustomer() {
  const id = props.contract?.customerId
  if (id) emit('openCustomer', id)
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('contract.receivePaymentTitle')"
    :width="dialogWidth"
    destroy-on-close
    class="lb-dialog receive-pay-dialog"
    @closed="clearSelection"
  >
    <div v-loading="loading" class="receive-pay">
      <div class="receive-pay__top">
        <div class="receive-pay__meta">
          <div class="receive-pay__meta-row">
            <span class="receive-pay__label">{{ t('contract.fields.contractCode') }}</span>
            <button
              v-if="contract?.id"
              type="button"
              class="receive-pay__link"
              @click="onViewContract"
            >
              {{ contract?.contractCode || '—' }}
            </button>
            <span v-else class="receive-pay__link-text">{{ contract?.contractCode || '—' }}</span>
            <button
              v-if="contract?.id"
              type="button"
              class="receive-pay__view"
              @click="onViewContract"
            >
              {{ t('common.detail') }}
            </button>
          </div>
          <div class="receive-pay__meta-row">
            <span class="receive-pay__label">{{ t('contract.fields.customerName') }}</span>
            <button
              v-if="contract?.customerId"
              type="button"
              class="receive-pay__link"
              @click="onViewCustomer"
            >
              {{ contract?.customerName || '—' }}
            </button>
            <span v-else class="receive-pay__link-text">{{ contract?.customerName || '—' }}</span>
            <button
              v-if="contract?.customerId"
              type="button"
              class="receive-pay__view"
              @click="onViewCustomer"
            >
              {{ t('common.detail') }}
            </button>
          </div>
        </div>

        <div class="receive-pay__toolbar">
          <div class="receive-pay__toolbar-left">
            <span class="receive-pay__section">{{ t('contract.receivePaymentBills') }}</span>
            <el-button
              v-if="receiptPerms.create"
              v-admin-glow="receiptPerms.codes.create"
              type="primary"
              class="lb-btn-primary receive-pay__collect-btn"
              :disabled="!collectableSelected.length"
              @click="openCollect"
            >
              {{ t('contract.receivePayment') }}
            </el-button>
          </div>
          <span class="receive-pay__sel">{{ t('common.selectedCount', { n: selectedCount }) }}</span>
        </div>
      </div>

      <div ref="tableWrapRef" class="receive-pay__table-wrap">
        <el-table
          :key="tableLayoutKey"
          ref="tableRef"
          :data="paged"
          border
          stripe
          :height="tableHeight"
          class="receive-pay__table"
          @selection-change="onSelectionChange"
        >
        <el-table-column type="selection" width="44" />
        <el-table-column type="index" label="#" width="52" :index="rowIndex" />
        <el-table-column
          :label="t('receivable.fields.invoiceCode')"
          :min-width="codeColW(t('receivable.fields.invoiceCode'), { samples: rows.map((r) => r.invoiceCode) })"
          class-name="col-code"
          label-class-name="col-code"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <button
              v-if="row.invoiceId"
              type="button"
              class="receive-pay__code-link"
              :title="row.invoiceCode || ''"
              @click.stop="onOpenInvoice(row)"
            >
              {{ row.invoiceCode || '—' }}
            </button>
            <template v-else>{{ row.invoiceCode || '—' }}</template>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('invoice.fields.invoiceType')"
          :min-width="colW(t('invoice.fields.invoiceType'), { contentMin: 120 })"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.invoiceType || '—' }}</template>
        </el-table-column>
        <el-table-column
          :label="t('invoice.fields.description')"
          :min-width="textColW(t('invoice.fields.description'), { kind: 'name' })"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.invoiceDescription || '—' }}</template>
        </el-table-column>
        <el-table-column
          :label="t('receivable.fields.invoiceAmount')"
          :min-width="colW(t('receivable.fields.invoiceAmount'), { contentMin: 100 })"
          align="right"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ formatMoney(row.invoiceAmount) }}</template>
        </el-table-column>
        <el-table-column
          :label="t('receivable.fields.receivedAmount')"
          :min-width="colW(t('receivable.fields.receivedAmount'), { contentMin: 100 })"
          align="right"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ formatMoney(row.receivedAmount) }}</template>
        </el-table-column>
        <el-table-column
          :label="t('receivable.fields.receivableAmount')"
          :min-width="colW(t('receivable.fields.receivableAmount'), { contentMin: 100 })"
          align="right"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <span
              :class="Number(row.receivableAmount ?? 0) > 0 ? 'is-due' : 'is-cleared'"
            >
              {{ formatMoney(row.receivableAmount) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('receivable.fields.invoiceDate')"
          :min-width="colW(t('receivable.fields.invoiceDate'), { contentMin: 110 })"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.invoiceDate || '—' }}</template>
        </el-table-column>
        <el-table-column
          :label="t('receivable.fields.paymentDueDate')"
          :min-width="colW(t('receivable.fields.paymentDueDate'), { contentMin: 110 })"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.paymentDueDate || '—' }}</template>
        </el-table-column>
        <el-table-column
          :label="t('receivable.fields.remark')"
          :min-width="textColW(t('receivable.fields.remark'), { kind: 'name' })"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.remark || '—' }}</template>
        </el-table-column>
        </el-table>
      </div>

      <div class="receive-pay__bottom">
        <TablePagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="pageSizes"
        />

        <div class="receive-pay__totals">
          <div class="receive-pay__total">
            <span class="receive-pay__total-label">{{ t('contract.receivePaymentTotalInvoice') }}</span>
            <el-input :model-value="formatMoney(totals.invoice)" readonly />
          </div>
          <div class="receive-pay__total">
            <span class="receive-pay__total-label">{{ t('contract.receivePaymentTotalReceived') }}</span>
            <el-input :model-value="formatMoney(totals.received)" readonly />
          </div>
          <div class="receive-pay__total receive-pay__total--due">
            <span class="receive-pay__total-label">{{ t('contract.receivePaymentTotalDue') }}</span>
            <el-input :model-value="formatMoney(totals.outstanding)" readonly />
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.close') }}</el-button>
      <el-button
        v-if="receiptPerms.create"
        type="primary"
        class="lb-btn-primary"
        :disabled="!collectableSelected.length"
        @click="openCollect"
      >
        {{ t('contract.receivePayment') }}
      </el-button>
    </template>
  </el-dialog>

  <el-dialog
    v-model="payVisible"
    :title="t('contract.receivePaymentCollectTitle')"
    width="480px"
    append-to-body
    destroy-on-close
    class="lb-dialog"
  >
    <el-form label-position="top" class="receive-pay-form">
      <el-form-item :label="t('contract.receivePaymentCollectHint')">
        <el-input
          :model-value="t('contract.receivePaymentCollectSummary', {
            n: collectableSelected.length,
            amount: formatMoney(selectedOutstanding),
          })"
          readonly
        />
      </el-form-item>
      <el-form-item :label="t('receipt.fields.paymentDate')" required>
        <el-date-picker
          v-model="payForm.paymentDate"
          type="date"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item :label="t('receipt.fields.paymentMethod')" required>
        <el-select v-model="payForm.paymentMethod" filterable style="width: 100%">
          <el-option v-for="m in RECEIPT_PAYMENT_METHODS" :key="m" :label="m" :value="m" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('receipt.fields.attachments')">
        <div class="receive-pay-att">
          <div
            v-for="(f, idx) in payPendingFiles"
            :key="`${f.name}-${idx}`"
            class="receive-pay-att__chip"
          >
            <span class="receive-pay-att__name">{{ f.name }}</span>
            <button type="button" class="receive-pay-att__remove" @click="removePayFile(idx)">
              ×
            </button>
          </div>
          <button type="button" class="receive-pay-att__add" @click="payFileInput?.click()">
            + {{ t('receipt.addAttachments') }}
          </button>
          <input
            ref="payFileInput"
            type="file"
            class="receive-pay-att__input"
            multiple
            @change="onPickPayFiles"
          />
        </div>
      </el-form-item>
      <el-form-item :label="t('receipt.fields.remark')">
        <el-input v-model="payForm.remark" type="textarea" :rows="2" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="submitting" @click="payVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button
        type="primary"
        class="lb-btn-primary"
        :loading="submitting"
        @click="submitCollect"
      >
        {{ t('common.submit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.receive-pay {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden; /* 高度吃紧时只裁表格区，不裁统计 */
  font-size: 14px;
  color: #1a2a22;
}

.receive-pay__top {
  flex: 0 0 auto;
}

.receive-pay__table-wrap {
  position: relative;
  flex: 1 1 auto;
  /* 14 寸矮屏：须让位给分页+统计；过高压住会把 totals 挤出 body */
  min-height: 88px;
  height: 0; /* 配合 flex:1，强制吃掉剩余高度，供表格像素测高 */
  overflow: hidden;
}

.receive-pay__bottom {
  flex: 0 0 auto;
  flex-shrink: 0;
  margin-top: 8px;
}

.receive-pay__meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px 28px;
  align-items: center;
  margin-bottom: 14px;
  padding: 12px 16px;
  border: 1px solid #e2e8e5;
  border-radius: 12px;
  background: linear-gradient(180deg, #f7faf8 0%, #f2f6f4 100%);
}

.receive-pay__meta-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.receive-pay__label {
  flex: 0 0 auto;
  color: #5b6b63;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.receive-pay__link,
.receive-pay__link-text {
  border: 0;
  background: transparent;
  color: var(--lb-brand);
  font: inherit;
  font-size: 15px;
  font-weight: 700;
  padding: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.receive-pay__link {
  cursor: pointer;
}

.receive-pay__link:hover {
  text-decoration: underline;
}

.receive-pay__view {
  border: 1px solid #c5d2cb;
  background: #fff;
  color: var(--lb-brand);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.receive-pay__view:hover {
  border-color: var(--lb-brand);
  background: rgba(15, 74, 50, 0.05);
}

.receive-pay__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.receive-pay__toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.receive-pay__collect-btn {
  height: 28px;
  padding: 4px 12px;
  font-size: 13px;
}

.receive-pay__section {
  font-size: 15px;
  font-weight: 700;
  color: #0d3a28;
}

.receive-pay__sel {
  color: #5b6b63;
  font-size: 13px;
  font-weight: 600;
}

.receive-pay__table {
  width: 100%;
  height: 100%;
  --el-table-header-bg-color: #f3f7f5;
  --el-table-header-text-color: #0d3a28;
  --el-table-text-color: #1a2a22;
  --el-table-row-hover-bg-color: #f0f6f3;
  border-radius: 10px;
  overflow: hidden;
}

.receive-pay__table :deep(.el-table__header th) {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.receive-pay__table :deep(.el-table__cell) {
  font-size: 14px;
  line-height: 1.4;
  padding: 12px 0;
}

.receive-pay__table :deep(.el-table__body .cell) {
  font-size: 14px;
  font-weight: 500;
  color: #1a2a22;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.receive-pay__table :deep(.col-code .cell) {
  font-weight: 650;
  letter-spacing: 0.01em;
}

.receive-pay__code-link {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--lb-brand);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  vertical-align: bottom;
}

.receive-pay__code-link:hover {
  text-decoration: underline;
}

.receive-pay__table :deep(.is-due) {
  color: #c0392b;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* 与主题深绿区分：用偏亮的成功绿，表示已结清 */
.receive-pay__table :deep(.is-cleared) {
  color: #12a35a;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.receive-pay__totals {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 8px;
  padding: 12px 14px;
  border: 1px solid #e2e8e5;
  border-radius: 12px;
  background: #fbfcfb;
}

.receive-pay__total-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: #5b6b63;
  font-weight: 650;
}

.receive-pay__total :deep(.el-input__wrapper) {
  min-height: 40px;
  box-shadow: 0 0 0 1px #d7ded9 inset;
  background: #fff;
}

.receive-pay__total :deep(.el-input__inner) {
  font-size: 16px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: #0d3a28;
}

.receive-pay__total--due :deep(.el-input__inner) {
  color: #c0392b;
  font-weight: 750;
}

.receive-pay-att {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.receive-pay-att__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 8px;
  background: #eef3f0;
  font-size: 0.8rem;
}

.receive-pay-att__remove,
.receive-pay-att__add {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: var(--lb-brand);
  font: inherit;
}

.receive-pay-att__add {
  border: 1px dashed #b8c8bf;
  border-radius: 8px;
  padding: 4px 10px;
}

.receive-pay-att__input {
  display: none;
}

@media (max-width: 720px) {
  .receive-pay__meta {
    grid-template-columns: 1fr;
  }

  .receive-pay__totals {
    grid-template-columns: 1fr;
  }
}
</style>

<!-- dialog 本体 teleported，需非 scoped 才能控 body 高度链 -->
<style>
.receive-pay-dialog.el-dialog {
  display: flex;
  flex-direction: column;
  /* 大屏（约 24 寸）：80vh；矮屏见下方 media → 90vh。再与 dvh 取 min，避免超出视口 */
  --receive-pay-dialog-h: min(80vh, calc(100dvh - 24px));
  height: var(--receive-pay-dialog-h);
  max-height: var(--receive-pay-dialog-h);
  margin-top: max(12px, calc((100dvh - var(--receive-pay-dialog-h)) / 2)) !important;
  margin-bottom: max(12px, calc((100dvh - var(--receive-pay-dialog-h)) / 2)) !important;
}

.receive-pay-dialog.el-dialog > .el-dialog__header,
.receive-pay-dialog.el-dialog > .el-dialog__footer {
  flex: 0 0 auto;
  flex-shrink: 0;
}

.receive-pay-dialog.el-dialog > .el-dialog__body {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important; /* 覆盖全局 body 滚动，改由表格内部滚动 */
  max-height: none !important;
}

/* 内容区全屏：占满右侧主区剩余高度，统计贴底 */
.receive-pay-dialog.el-dialog.lb-dialog--content-fs {
  max-height: none;
  height: 100%;
  margin: 0 !important;
}

.receive-pay-dialog.el-dialog.lb-dialog--content-fs > .el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
}

/* 小屏（约 14 寸笔记本可视高度）：拉高到 90vh，并略压内边距保住统计 */
@media (max-height: 900px) {
  .receive-pay-dialog.el-dialog {
    --receive-pay-dialog-h: min(90vh, calc(100dvh - 16px));
  }

  .receive-pay-dialog .receive-pay__meta {
    margin-bottom: 10px;
    padding: 8px 12px;
  }

  .receive-pay-dialog .receive-pay__toolbar {
    margin-bottom: 6px;
  }

  .receive-pay-dialog .receive-pay__totals {
    gap: 8px;
    margin-top: 6px;
    padding: 8px 10px;
  }

  .receive-pay-dialog .receive-pay__total-label {
    margin-bottom: 4px;
    font-size: 12px;
  }

  .receive-pay-dialog .receive-pay__total .el-input__wrapper {
    min-height: 34px;
  }

  .receive-pay-dialog .receive-pay__total .el-input__inner {
    font-size: 14px;
  }
}
</style>
