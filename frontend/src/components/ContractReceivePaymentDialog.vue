<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { QuestionFilled, UploadFilled } from '@element-plus/icons-vue'
import type { ContractRecord } from '@/types/contract'
import type { ReceivableRecord } from '@/types/receivable'
import { INVOICE_TYPE_I18N_KEY } from '@/types/invoice'
import { fetchReceivables } from '@/api/receivables'
import {
  collectWithBookingDepositApi,
  fetchBookingDepositByContractApi,
  uploadReceiptAttachmentsApi,
  type BookingDepositAccount,
} from '@/api/receipts'
import { RECEIPT_PAYMENT_METHODS } from '@/types/receipt'
import { useIsMobile, useMediaQuery } from '@/composables/useMediaQuery'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useTableSelection } from '@/composables/useTableSelection'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { formatMoney } from '@/utils/format'
import { isImageAttachment, isPdfAttachment } from '@/utils/attachmentUrl'
import TablePagination from '@/components/TablePagination.vue'
import { useClientPagination } from '@/composables/useClientPagination'

const visible = defineModel<boolean>({ default: false })

const props = defineProps<{
  contract: ContractRecord | null
  /** 叠在其它弹窗（如办理退租）之上时传入更高 z-index */
  zIndex?: number
}>()

const emit = defineEmits<{
  openContract: [contractId: string]
  openCustomer: [customerId: string]
  openInvoice: [invoiceId: string]
  openReceipts: [contract: ContractRecord]
  collected: []
}>()

function onOpenReceipts() {
  const c = props.contract
  if (!c?.id) return
  emit('openReceipts', c)
}

function onOpenInvoice(row: ReceivableRecord) {
  const id = row.invoiceId?.trim()
  if (!id) return
  emit('openInvoice', id)
}

const { t } = useI18n()
const isMobile = useIsMobile()
/** 与样式 max-height:900px 对齐：14 寸等矮屏 */
const isShortViewport = useMediaQuery('(max-height: 900px)')
const receiptPerms = useResourcePermissions('receipts')
const { colW, codeColW, textColW, tableLayoutKey } = useTableColWidth()

function invoiceTypeLabel(type?: string | null) {
  const raw = (type || '').trim()
  if (!raw) return '—'
  const key = INVOICE_TYPE_I18N_KEY[raw]
  return key ? t(`invoice.types.${key}`) : raw
}
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
const bookingAccount = ref<BookingDepositAccount | null>(null)
/** 表格容器实测高度（px）；el-table 的 height% 常无法解析，需像素值才能内部滚动 */
const tableWrapRef = ref<HTMLElement | null>(null)
const tableHeight = ref(320)
let tableWrapRo: ResizeObserver | null = null

async function alertBox(msg: string, type: 'warning' | 'error' | 'success' | 'info' = 'warning') {
  try {
    await ElMessageBox.alert(msg, t('contract.receivePaymentTitle'), {
      type,
      confirmButtonText: t('common.confirm'),
    })
  } catch {
    /* dismiss */
  }
}

function measureTableHeight() {
  const el = tableWrapRef.value
  if (!el) return
  // 小屏上 wrap 可能只有 ~90px；门槛过高压住旧高度会把下方统计挤出 overflow
  // 小屏表格区有固定高度，按实测像素喂给 el-table
  const shortViewport =
    typeof window !== 'undefined' && window.matchMedia('(max-height: 900px)').matches
  const floor = shortViewport ? 160 : 120
  const h = Math.max(floor, Math.floor(el.getBoundingClientRect().height))
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
  revokePayPreviewUrls()
})

const dialogWidth = computed(() => {
  if (isMobile.value) return '96%'
  // 小屏略收窄，给两侧留白、表格列仍够用
  if (isShortViewport.value) return '920px'
  return '1040px'
})
const payDialogWidth = computed(() => (isMobile.value ? '96%' : '720px'))

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

const unpaidBillCount = computed(
  () => rows.value.filter((r) => Number(r.receivableAmount ?? 0) > 0.009).length,
)

const bookingBalance = computed(() => Math.max(0, Number(bookingAccount.value?.balance ?? 0)))

const bookingDepositSummary = computed(() => ({
  principal: Math.max(0, Number(bookingAccount.value?.principal ?? 0)),
  applied: Math.max(0, Number(bookingAccount.value?.applied ?? 0)),
  balance: bookingBalance.value,
}))

const maxBookingApply = computed(() =>
  Math.min(bookingBalance.value, selectedOutstanding.value),
)

const bookingApplyAmount = computed(() => {
  const n = Number(payForm.bookingDepositApply ?? 0)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, maxBookingApply.value)
})

/** 定金抵扣后最多可收的现金上限 */
const maxCashAmount = computed(() =>
  Math.max(0, Math.round((selectedOutstanding.value - bookingApplyAmount.value) * 100) / 100),
)

const cashCollectAmount = computed(() => {
  const n = Number(payForm.cashAmount ?? 0)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, maxCashAmount.value)
})

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** 与后端 FIFO 一致：按勾选列表顺序先抵定金、再摊现金 */
const allocationPreview = computed(() => {
  let depositLeft = bookingApplyAmount.value
  let cashLeft = cashCollectAmount.value
  const out: Array<{
    id: string
    label: string
    /**
     * 应收展示额：优先开票金额；若与本次未收不一致（曾部分收款），
     * 改用未收，保证 应收 ≈ 定金抵扣 + 另收 + 尚欠。
     */
    invoiceAmt: number
    depositPart: number
    cashPart: number
    /** 本次入账后该笔仍欠 */
    remainAfter: number
  }> = []
  for (const r of collectableSelected.value) {
    const due = round2(Math.max(0, Number(r.receivableAmount ?? 0)))
    if (due <= 0) continue
    const invoiceAmtRaw = Number(r.invoiceAmount ?? NaN)
    const billed = Number.isFinite(invoiceAmtRaw)
      ? round2(Math.max(0, invoiceAmtRaw))
      : due
    const depositPart = round2(Math.min(due, depositLeft))
    depositLeft = round2(depositLeft - depositPart)
    const cashDue = round2(due - depositPart)
    const cashPart = round2(Math.min(cashDue, cashLeft))
    cashLeft = round2(cashLeft - cashPart)
    if (depositPart <= 0 && cashPart <= 0) continue
    out.push({
      id: r.id,
      label: (r.invoiceCode || r.receivableCode || '').trim() || r.id,
      invoiceAmt: Math.abs(billed - due) <= 0.009 ? billed : due,
      depositPart,
      cashPart,
      remainAfter: round2(cashDue - cashPart),
    })
  }
  return out
})

const showAllocationPreview = computed(
  () =>
    payVisible.value &&
    allocationPreview.value.length > 0 &&
    (bookingApplyAmount.value > 0.009 || cashCollectAmount.value > 0.009),
)

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } = useClientPagination(rows)

const payVisible = ref(false)
const payForm = reactive({
  paymentDate: '' as string,
  paymentMethod: '' as string,
  bookingDepositApply: 0 as number,
  cashAmount: 0 as number,
  remark: '',
})

/** 改定金抵扣时，把现金收款钳到新上限；打开时默认收齐上限 */
watch(
  () => payForm.bookingDepositApply,
  () => {
    if (!payVisible.value) return
    const max = maxCashAmount.value
    if (payForm.cashAmount > max) payForm.cashAmount = max
  },
)
const payPendingFiles = ref<File[]>([])
const payFileInput = ref<HTMLInputElement | null>(null)
const payPreviewUrls = ref<string[]>([])
const payImageViewerVisible = ref(false)
const payImageViewerList = ref<string[]>([])
const payImageViewerIndex = ref(0)

function isImageFile(file: File) {
  return file.type.startsWith('image/') || isImageAttachment(file.name)
}

function isPdfFile(file: File) {
  return file.type === 'application/pdf' || isPdfAttachment(file.name)
}

function revokePayPreviewUrls() {
  for (const u of payPreviewUrls.value) URL.revokeObjectURL(u)
  payPreviewUrls.value = []
}

function syncPayPreviewUrls(files: File[]) {
  revokePayPreviewUrls()
  payPreviewUrls.value = files.map((f) => URL.createObjectURL(f))
}

function previewPayFile(idx: number) {
  const file = payPendingFiles.value[idx]
  const url = payPreviewUrls.value[idx]
  if (!file || !url) return
  if (isImageFile(file)) {
    const imageIdxs = payPendingFiles.value
      .map((f, i) => (isImageFile(f) ? i : -1))
      .filter((i) => i >= 0)
    payImageViewerList.value = imageIdxs.map((i) => payPreviewUrls.value[i]!).filter(Boolean)
    const pos = imageIdxs.indexOf(idx)
    payImageViewerIndex.value = Math.max(0, pos)
    payImageViewerVisible.value = true
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

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
    bookingAccount.value = null
    return
  }
  loading.value = true
  try {
    const [{ data }, accountRes] = await Promise.all([
      fetchReceivables({
        contractId,
        page: 1,
        pageSize: 500,
        sortBy: 'invoiceDate',
        sortDir: 'asc',
      }),
      fetchBookingDepositByContractApi(contractId).catch(() => ({ data: null })),
    ])
    rows.value = data?.items ?? []
    bookingAccount.value = accountRes.data ?? null
    resetPage()
    clearSelection()
  } catch {
    rows.value = []
    bookingAccount.value = null
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
      payPendingFiles.value = []
      revokePayPreviewUrls()
      payImageViewerVisible.value = false
    }
  },
)

watch(payVisible, (open) => {
  if (!open) {
    revokePayPreviewUrls()
    payImageViewerVisible.value = false
  }
})

function openCollect() {
  if (!receiptPerms.create) {
    void alertBox(t('contract.receivePaymentNoPerm'))
    return
  }
  if (!collectableSelected.value.length) {
    void alertBox(t('contract.receivePaymentSelectFirst'))
    return
  }
  payForm.paymentDate = todayYmd()
  payForm.paymentMethod = ''
  payForm.bookingDepositApply = 0
  payForm.cashAmount = Math.max(
    0,
    Math.round(selectedOutstanding.value * 100) / 100,
  )
  payForm.remark = ''
  payPendingFiles.value = []
  revokePayPreviewUrls()
  payImageViewerVisible.value = false
  payVisible.value = true
}

function onPickPayFiles(ev: Event) {
  const input = ev.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (files.length) {
    payPendingFiles.value = [...payPendingFiles.value, ...files]
    syncPayPreviewUrls(payPendingFiles.value)
  }
  input.value = ''
}

function removePayFile(idx: number) {
  payPendingFiles.value = payPendingFiles.value.filter((_, i) => i !== idx)
  syncPayPreviewUrls(payPendingFiles.value)
}

async function submitCollect() {
  const targets = collectableSelected.value
  const contractId = props.contract?.id?.trim()
  if (!targets.length || !contractId) {
    await alertBox(t('contract.receivePaymentSelectFirst'))
    return
  }
  if (!payForm.paymentDate) {
    await alertBox(t('contract.receivePaymentNeedDate'))
    return
  }
  const apply = bookingApplyAmount.value
  const cash = cashCollectAmount.value
  if (apply <= 0 && cash <= 0) {
    await alertBox(t('contract.receivePaymentNeedCashOrDeposit'))
    return
  }
  if (cash > maxCashAmount.value + 0.009) {
    await alertBox(
      t('contract.receivePaymentCashExceed', {
        amount: formatMoney(maxCashAmount.value),
      }),
    )
    return
  }
  if (cash > 0 && !payForm.paymentMethod) {
    await alertBox(t('contract.receivePaymentNeedMethod'))
    return
  }
  if (apply > maxBookingApply.value + 0.009) {
    await alertBox(
      t('contract.receivePaymentBookingApplyExceed', {
        balance: formatMoney(bookingBalance.value),
      }),
    )
    return
  }

  submitting.value = true
  try {
    const { data } = await collectWithBookingDepositApi(
      {
        contractId,
        receivableIds: targets.map((r) => r.id),
        bookingDepositApply: apply,
        cashAmount: cash,
        paymentDate: payForm.paymentDate,
        paymentMethod: cash > 0 ? payForm.paymentMethod : undefined,
        remark: payForm.remark || undefined,
      },
      { silentError: true },
    )
    const receiptIds = data?.receiptIds ?? []
    if (payPendingFiles.value.length && receiptIds.length) {
      for (const rid of receiptIds) {
        try {
          await uploadReceiptAttachmentsApi(rid, payPendingFiles.value)
        } catch {
          /* 附件失败不阻断 */
        }
      }
    }
    await alertBox(
      t('contract.receivePaymentDone', { n: targets.length }),
      'success',
    )
    payVisible.value = false
    await loadRows()
    emit('collected')
  } catch (e) {
    const msg =
      e instanceof Error && e.message ? e.message : t('contract.receivePaymentFailed')
    await alertBox(msg, 'error')
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
    append-to-body
    :z-index="zIndex"
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
            <span class="receive-pay__bill-meta" :title="t('contract.receivePaymentBillCount', { n: total })">
              <span class="receive-pay__bill-chip">
                {{ t('contract.receivePaymentBillCount', { n: total }) }}
              </span>
              <span
                v-if="unpaidBillCount > 0"
                class="receive-pay__bill-chip receive-pay__bill-chip--due"
              >
                {{ t('contract.receivePaymentUnpaidBillCount', { n: unpaidBillCount }) }}
              </span>
            </span>
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
            <button
              type="button"
              class="action-pill action-pill--leave receive-pay__records-btn"
              :disabled="!contract?.id"
              @click="onOpenReceipts"
            >
              {{ t('contract.receivePaymentRecords') }}
            </button>
          </div>
          <span class="receive-pay__sel">{{ t('common.selectedCount', { n: selectedCount }) }}</span>
        </div>
      </div>

      <div
        ref="tableWrapRef"
        class="receive-pay__table-wrap"
        :class="{ 'is-scrollable-hint': total > 1 }"
      >
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
          <template #default="{ row }">{{ invoiceTypeLabel(row.invoiceType) }}</template>
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
            <span class="receive-pay__total-label">
              {{ t('contract.receivePaymentTotalReceived') }}
              <el-tooltip
                :content="t('contract.receivePaymentTotalReceivedHint')"
                placement="top"
              >
                <el-icon class="receive-pay__label-tip" :size="14"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
            <el-input :model-value="formatMoney(totals.received)" readonly />
          </div>
          <div class="receive-pay__total receive-pay__total--due">
            <span class="receive-pay__total-label">{{ t('contract.receivePaymentTotalDue') }}</span>
            <el-input :model-value="formatMoney(totals.outstanding)" readonly />
          </div>
        </div>
        <div class="receive-pay__totals receive-pay__totals--deposit">
          <div class="receive-pay__total">
            <span class="receive-pay__total-label">{{ t('contract.receivePaymentBookingPrincipal') }}</span>
            <el-input :model-value="formatMoney(bookingDepositSummary.principal)" readonly />
          </div>
          <div class="receive-pay__total">
            <span class="receive-pay__total-label">{{ t('contract.receivePaymentBookingApplied') }}</span>
            <el-input :model-value="formatMoney(bookingDepositSummary.applied)" readonly />
          </div>
          <div class="receive-pay__total receive-pay__total--balance">
            <span class="receive-pay__total-label">{{ t('contract.receivePaymentBookingBalance') }}</span>
            <el-input :model-value="formatMoney(bookingDepositSummary.balance)" readonly />
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.close') }}</el-button>
      <el-button
        v-if="receiptPerms.create"
        v-admin-glow="receiptPerms.codes.create"
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
    :width="payDialogWidth"
    append-to-body
    destroy-on-close
    class="lb-dialog"
  >
    <el-form label-position="top" class="receive-pay-form">
      <div class="receive-pay-form__grid">
        <el-form-item :label="t('contract.receivePaymentCollectHint')">
          <el-input
            :model-value="t('contract.receivePaymentCollectSummary', {
              n: collectableSelected.length,
              amount: formatMoney(selectedOutstanding),
            })"
            disabled
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
        <el-form-item
          v-if="bookingBalance > 0"
          :label="t('contract.receivePaymentBookingApply')"
        >
          <el-input-number
            v-model="payForm.bookingDepositApply"
            :min="0"
            :max="maxBookingApply"
            :precision="2"
            :step="100"
            controls-position="right"
            style="width: 100%"
          />
          <div class="receive-pay-hint">
            {{
              t('contract.receivePaymentBookingBalanceHint', {
                balance: formatMoney(bookingBalance),
                cash: formatMoney(maxCashAmount),
              })
            }}
          </div>
        </el-form-item>
        <el-form-item
          :label="t('contract.receivePaymentCashAmount')"
          required
          :class="{ 'receive-pay-form__span-2': bookingBalance <= 0 }"
        >
          <el-input-number
            v-model="payForm.cashAmount"
            :min="0"
            :max="maxCashAmount"
            :precision="2"
            :step="100"
            controls-position="right"
            style="width: 100%"
          />
          <div class="receive-pay-hint">
            {{
              t('contract.receivePaymentCashAmountHint', {
                max: formatMoney(maxCashAmount),
              })
            }}
          </div>
        </el-form-item>
      </div>
      <div v-if="showAllocationPreview" class="receive-pay-alloc">
        <div class="receive-pay-alloc__head">
          <span class="receive-pay-alloc__title">
            {{ t('contract.receivePaymentAllocPreview') }}
            <el-tooltip :content="t('contract.receivePaymentAllocFifoHint')" placement="top">
              <el-icon class="receive-pay__label-tip" :size="14"><QuestionFilled /></el-icon>
            </el-tooltip>
          </span>
        </div>
        <ul class="receive-pay-alloc__list">
          <li v-for="row in allocationPreview" :key="row.id" class="receive-pay-alloc__row">
            <span class="receive-pay-alloc__code" :title="row.label">{{ row.label }}</span>
            <span class="receive-pay-alloc__parts">
              <span class="receive-pay-alloc__tag is-due">
                {{
                  t('contract.receivePaymentAllocInvoice', {
                    amount: formatMoney(row.invoiceAmt),
                  })
                }}
              </span>
              <span v-if="row.depositPart > 0.009" class="receive-pay-alloc__tag is-deposit">
                {{
                  t('contract.receivePaymentAllocDeposit', {
                    amount: formatMoney(row.depositPart),
                  })
                }}
              </span>
              <span v-if="row.cashPart > 0.009" class="receive-pay-alloc__tag is-cash">
                {{
                  t('contract.receivePaymentAllocCash', {
                    amount: formatMoney(row.cashPart),
                  })
                }}
              </span>
              <span
                v-if="row.remainAfter <= 0.009"
                class="receive-pay-alloc__tag is-settled"
              >
                {{ t('contract.receivePaymentAllocSettled') }}
              </span>
              <span v-else class="receive-pay-alloc__tag is-remain">
                {{
                  t('contract.receivePaymentAllocRemain', {
                    amount: formatMoney(row.remainAfter),
                  })
                }}
              </span>
            </span>
          </li>
        </ul>
      </div>
      <div class="receive-pay-form__grid">
        <el-form-item
          :label="t('receipt.fields.paymentMethod')"
          :required="cashCollectAmount > 0"
        >
          <el-select
            v-model="payForm.paymentMethod"
            filterable
            clearable
            value-on-clear=""
            :disabled="cashCollectAmount <= 0"
            :placeholder="
              cashCollectAmount > 0
                ? t('common.pleaseSelect')
                : t('contract.receivePaymentMethodNotNeeded')
            "
            style="width: 100%"
          >
            <el-option v-for="m in RECEIPT_PAYMENT_METHODS" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('receipt.fields.attachments')">
        <div class="recv-pay-att">
          <input
            ref="payFileInput"
            type="file"
            class="recv-pay-att__input"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip"
            @change="onPickPayFiles"
          />
          <div class="recv-pay-att__trigger-row">
            <button type="button" class="recv-pay-att__trigger" @click="payFileInput?.click()">
              <el-icon class="recv-pay-att__cloud" :size="18"><UploadFilled /></el-icon>
              <span class="recv-pay-att__trigger-text">{{ t('attachment.upload') }}</span>
              <span class="recv-pay-att__count">
                {{ t('attachment.countOnly', { current: payPendingFiles.length }) }}
              </span>
            </button>
          </div>
          <div
            v-for="(f, idx) in payPendingFiles"
            :key="`${f.name}-${idx}`"
            class="recv-pay-att__chip-wrap"
          >
            <button
              type="button"
              class="recv-pay-att__chip recv-pay-att__chip--clickable"
              :title="t('attachment.preview')"
              @click="previewPayFile(idx)"
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
              @click="removePayFile(idx)"
            >
              ×
            </button>
          </div>
          <p v-if="!payPendingFiles.length" class="recv-pay-att__empty">
            {{ t('attachment.empty') }}
          </p>
          <AttachmentImageViewer
            v-if="payImageViewerVisible && payImageViewerList.length"
            :url-list="payImageViewerList"
            :initial-index="payImageViewerIndex"
            @close="payImageViewerVisible = false"
          />
        </div>
        </el-form-item>
      </div>
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
  min-height: 120px;
  height: 0; /* 配合 flex:1，强制吃掉剩余高度，供表格像素测高 */
  overflow: hidden;
}

.receive-pay__table-wrap.is-scrollable-hint::after {
  content: '';
  position: absolute;
  left: 1px;
  right: 1px;
  bottom: 0;
  height: 22px;
  pointer-events: none;
  border-radius: 0 0 10px 10px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(243, 247, 245, 0.95));
  z-index: 2;
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

.receive-pay__records-btn {
  height: 28px;
  min-height: 28px;
  padding: 0 12px;
  font-size: 13px;
  line-height: 26px;
  border-radius: 8px;
}

.receive-pay__records-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.receive-pay__section {
  font-size: 15px;
  font-weight: 700;
  color: #0d3a28;
}

.receive-pay__bill-meta {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.receive-pay__bill-chip {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  color: #3a4a42;
  background: #e8efeb;
  border: 1px solid #d5dfd9;
  font-variant-numeric: tabular-nums;
}

.receive-pay__bill-chip--due {
  color: #9a3b2a;
  background: #fceceb;
  border-color: #f0cfc8;
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
  gap: 4px 8px;
  align-items: center;
  margin-top: 4px;
  padding: 8px;
  border: 1px solid #e2e8e5;
  border-radius: 8px;
  background: #fbfcfb;
}

.receive-pay__totals--deposit {
  margin-top: 4px;
  background: #f3f8f5;
  border-color: #d5e4db;
}

.receive-pay__total {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  min-width: 0;
}

.receive-pay__total-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 0;
  font-size: 12px;
  line-height: 1;
  color: #5b6b63;
  font-weight: 650;
}

.receive-pay__total-label :deep(.el-tooltip__trigger) {
  display: inline-flex;
  align-items: center;
  line-height: 1;
}

.receive-pay__label-tip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  color: var(--lb-muted, #6a7a70);
  cursor: help;
  flex-shrink: 0;
  line-height: 1;
}

.receive-pay__total :deep(.el-input) {
  line-height: 1;
}

.receive-pay__total :deep(.el-input__wrapper) {
  min-height: 28px;
  padding-top: 0;
  padding-bottom: 0;
  box-shadow: 0 0 0 1px #d7ded9 inset;
  background: #fff;
}

.receive-pay__total :deep(.el-input__inner) {
  font-size: 14px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: #0d3a28;
  height: 28px;
  line-height: 28px;
}

.receive-pay__total--due :deep(.el-input__inner) {
  color: #c0392b;
  font-weight: 750;
}

.receive-pay__total--balance :deep(.el-input__inner) {
  color: var(--lb-brand, #0f4a32);
  font-weight: 750;
}

.receive-pay-form__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
  align-items: start;
}

.receive-pay-form__span-2 {
  grid-column: 1 / -1;
}

.receive-pay-form__grid > :deep(.el-form-item) {
  margin-bottom: 12px;
  min-width: 0;
}

.receive-pay-hint {
  margin-top: 6px;
  font-size: 0.78rem;
  color: #5a6b62;
  line-height: 1.4;
}

@media (max-width: 640px) {
  .receive-pay-form__grid {
    grid-template-columns: 1fr;
  }

  .receive-pay-form__span-2 {
    grid-column: auto;
  }
}

.receive-pay-alloc {
  margin: 0 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f4f7f5;
  border: 1px solid #e4ebe6;
}

.receive-pay-alloc__head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin: 0 0 8px;
}

.receive-pay-alloc__title {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 700;
  color: #2f3f36;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.receive-pay-alloc__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.receive-pay-alloc__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e0e8e3;
}

.receive-pay-alloc__code {
  min-width: 0;
  font-size: 0.84rem;
  font-weight: 650;
  color: #3a4a42;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.receive-pay-alloc__parts {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.receive-pay-alloc__tag {
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 2px 7px;
  border-radius: 999px;
}

.receive-pay-alloc__tag.is-deposit {
  color: #7a4a12;
  background: #f8ead4;
}

.receive-pay-alloc__tag.is-due {
  color: #5a3d12;
  background: #f3e6d0;
}

.receive-pay-alloc__tag.is-cash {
  color: #0f4a32;
  background: #ddeee4;
}

.receive-pay-alloc__tag.is-settled {
  color: #0f4a32;
  background: #d8f0e4;
}

.receive-pay-alloc__tag.is-remain {
  color: #8a2f2f;
  background: #f6e0e0;
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
  /* 大屏上下留白对称；小屏见 media 收紧且同样上下一致 */
  --receive-pay-pad-y: 12px;
  --receive-pay-pad-x: 20px;
  --receive-pay-header-y: 14px;
  --receive-pay-footer-y: 12px;
  --receive-pay-dialog-h: min(80vh, calc(100dvh - 24px));
  height: var(--receive-pay-dialog-h);
  max-height: var(--receive-pay-dialog-h);
  margin-top: max(12px, calc((100dvh - var(--receive-pay-dialog-h)) / 2)) !important;
  margin-bottom: max(12px, calc((100dvh - var(--receive-pay-dialog-h)) / 2)) !important;
}

.receive-pay-dialog.el-dialog > .el-dialog__header {
  flex: 0 0 auto;
  flex-shrink: 0;
  padding: var(--receive-pay-header-y) 78px var(--receive-pay-header-y) var(--receive-pay-pad-x) !important;
}

.receive-pay-dialog.el-dialog > .el-dialog__header::before {
  top: var(--receive-pay-header-y);
  bottom: var(--receive-pay-header-y);
}

.receive-pay-dialog.el-dialog > .el-dialog__footer {
  flex: 0 0 auto;
  flex-shrink: 0;
  padding: var(--receive-pay-footer-y) var(--receive-pay-pad-x) !important;
}

.receive-pay-dialog.el-dialog > .el-dialog__body {
  flex: 1 1 auto !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important; /* 覆盖全局 body 滚动，改由表格内部滚动 */
  max-height: none !important;
  padding: var(--receive-pay-pad-y) var(--receive-pay-pad-x) !important;
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

.receive-pay-dialog.el-dialog.lb-dialog--content-fs .receive-pay {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.receive-pay-dialog.el-dialog.lb-dialog--content-fs .receive-pay__table-wrap {
  flex: 1 1 auto;
  height: 0;
  min-height: 160px;
  max-height: none;
}

.receive-pay-dialog.el-dialog.lb-dialog--content-fs .receive-pay__bottom {
  flex: 0 0 auto;
  margin-top: 0;
  padding-bottom: 0;
}

/* 小屏（约 14 寸笔记本可视高度）：再拉高一点；表格吃满中间、统计贴底 */
@media (max-height: 900px) {
  .receive-pay-dialog.el-dialog {
    --receive-pay-pad-y: 8px;
    --receive-pay-pad-x: 14px;
    --receive-pay-header-y: 8px;
    --receive-pay-footer-y: 8px;
    --receive-pay-dialog-h: min(98vh, calc(100dvh - 4px));
    margin-top: max(2px, calc((100dvh - var(--receive-pay-dialog-h)) / 2)) !important;
    margin-bottom: max(2px, calc((100dvh - var(--receive-pay-dialog-h)) / 2)) !important;
  }

  .receive-pay-dialog.el-dialog > .el-dialog__body {
    overflow: hidden !important;
  }

  .receive-pay-dialog .receive-pay {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .receive-pay-dialog .receive-pay__meta {
    margin-bottom: 8px;
    padding: 6px 10px;
  }

  .receive-pay-dialog .receive-pay__toolbar {
    margin-bottom: 4px;
  }

  /* 表格吃满剩余高度，统计贴脚（非全屏 / 全屏同一套） */
  .receive-pay-dialog .receive-pay__table-wrap {
    flex: 1 1 auto;
    height: 0;
    min-height: 160px;
    max-height: none;
  }

  .receive-pay-dialog .receive-pay__bottom {
    flex: 0 0 auto;
    margin-top: 6px;
    padding-bottom: 0;
  }

  .receive-pay-dialog .receive-pay__table .el-table__cell {
    padding: 8px 0;
  }

  .receive-pay-dialog .receive-pay__totals {
    gap: 3px 6px;
    margin-top: 3px;
    padding: 6px;
  }

  .receive-pay-dialog .receive-pay__total {
    gap: 1px;
  }

  .receive-pay-dialog .receive-pay__total .el-input__wrapper {
    min-height: 26px;
  }

  .receive-pay-dialog .receive-pay__total .el-input__inner {
    height: 26px;
    line-height: 26px;
  }

  .receive-pay-dialog.el-dialog.lb-dialog--content-fs .receive-pay__table-wrap {
    min-height: 140px;
  }
}
</style>
