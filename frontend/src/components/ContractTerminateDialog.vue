<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { Delete, Plus, QuestionFilled, Rank } from '@element-plus/icons-vue'
import type { ContractRecord } from '@/types/contract'
import {
  conductVacateSettlementApi,
  fetchTerminateConductPreviewApi,
  type TerminateConductPreview,
  type TerminateLoanCheckStatus,
} from '@/api/contract-settlements'
import { uploadDepositRefundAttachmentsApi } from '@/api/deposit-refunds'
import { formatMoney } from '@/utils/format'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { contractStatusTone } from '@/constants/statusBadges'
import AttachmentField from '@/components/AttachmentField.vue'
import MultiAttachmentField from '@/components/MultiAttachmentField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ContractReceivePaymentDialog from '@/components/ContractReceivePaymentDialog.vue'

const visible = defineModel<boolean>({ default: false })

const props = defineProps<{
  contract: ContractRecord | null
  /** 盖在合约「更多」面板之上时传入更高 z-index */
  zIndex?: number
}>()

const emit = defineEmits<{
  done: []
  openContract: [contractId: string]
  openCustomer: [customerId: string]
  openInvoice: [invoiceId: string]
  openReceivable: [receivableId: string]
  openReceipts: [contract: ContractRecord]
}>()

const { t, te } = useI18n()
const termPerms = useResourcePermissions('contractSettlements')
const receiptPerms = useResourcePermissions('receipts')

const loading = ref(false)
const submitting = ref(false)
const receivePayVisible = ref(false)
const preview = ref<TerminateConductPreview | null>(null)
const refundPendingAttachments = ref<Array<{ key: string; file: File }>>([])

function resetRefundAttachments() {
  refundPendingAttachments.value = []
}

function onAddRefundAttachments(files: File[]) {
  for (const file of files) {
    refundPendingAttachments.value.push({
      key: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      file,
    })
  }
}

function removeRefundPendingAttachment(key: string) {
  refundPendingAttachments.value = refundPendingAttachments.value.filter((p) => p.key !== key)
}

type LoanCheckRow = {
  loanFeeId: string
  description: string
  subtotal: number
  status: TerminateLoanCheckStatus
  deductAmount: number
}

type ExtraDeductionRow = {
  uid: string
  description: string
  quantity: number
  unitAmount: number
  remark: string
}

let extraUidSeq = 0
function newExtraUid() {
  extraUidSeq += 1
  return `xd-${Date.now()}-${extraUidSeq}`
}

function defaultExtraDeduction(): ExtraDeductionRow {
  return {
    uid: newExtraUid(),
    description: '',
    quantity: 1,
    unitAmount: 0,
    remark: '',
  }
}

function extraSubtotal(row: ExtraDeductionRow) {
  return Math.round((Number(row.quantity) || 0) * (Number(row.unitAmount) || 0) * 100) / 100
}

const EXTRA_PAGE_SIZE = 5
const extraDeductions = ref<ExtraDeductionRow[]>([])
const extraPage = ref(1)
const dragExtraUid = ref<string | null>(null)
const dragOverExtraUid = ref<string | null>(null)
const editingExtraIndexUid = ref<string | null>(null)
const editingExtraIndexDraft = ref('')
let extraIndexCommitLock = false

const pagedExtraDeductions = computed(() => {
  const start = (extraPage.value - 1) * EXTRA_PAGE_SIZE
  return extraDeductions.value.slice(start, start + EXTRA_PAGE_SIZE).map((row, i) => ({
    row,
    index: start + i,
  }))
})

const form = reactive({
  terminationDate: '' as string,
  terminationKind: 'expiry' as 'expiry' | 'early',
  reason: '',
  noticeAttachment: '',
  doorKeyReturnedQty: 0,
  smartCardReturnedQty: 0,
  /** 房门匙／智能卡未还自动扣除（可改） */
  doorKeyDeductAmount: 0,
  smartCardDeductAmount: 0,
  siteCondition: '',
  remark: '',
  loanChecks: [] as LoanCheckRow[],
  allowUnsettledReceivables: false,
  refundDate: '' as string,
  /** 退租时一并建单：有退款日期默认「已退」；可改「未退」表示稍后办理 */
  depositRefundStatus: '已退' as string,
  actualRefundAmount: 0,
  bookingDepositRefundAmount: 0,
  /** 超额是否用定金余额抵扣（默认否，日后退定金前收款仍可抵） */
  applyBookingDepositToExcess: false,
})

function keyUnitPrice(deposit: number, issued: number) {
  const qty = Math.max(0, Math.floor(issued) || 0)
  if (qty <= 0) return 0
  return Math.round((Math.max(0, deposit) / qty) * 100) / 100
}

function keyMissingQty(issued: number, returned: number) {
  return Math.max(0, Math.floor(issued || 0) - Math.floor(returned || 0))
}

function defaultKeyDeduct(deposit: number, issued: number, returned: number) {
  const missing = keyMissingQty(issued, returned)
  if (missing <= 0) return 0
  return Math.round(missing * keyUnitPrice(deposit, issued) * 100) / 100
}

/** 此刻退还按金／定金（开=已退，关=未退稍后办理） */
const refundNow = computed({
  get: () => form.depositRefundStatus === '已退',
  set: (v: boolean) => {
    form.depositRefundStatus = v ? '已退' : '未退'
    if (v) {
      if (!form.refundDate) form.refundDate = form.terminationDate || todayYmd()
    } else {
      form.refundDate = ''
      resetRefundAttachments()
    }
  },
})

function todayYmd() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function money(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

function statusLabel(status: string) {
  const key = `contract.status.${status}`
  return te(key) ? t(key) : status
}

const loanDeductionTotal = computed(() =>
  form.loanChecks
    .filter((r) => r.status !== 'returned')
    .reduce((s, r) => s + (Number(r.deductAmount) || 0), 0),
)

const extraDeductionTotal = computed(() =>
  extraDeductions.value.reduce((s, r) => s + extraSubtotal(r), 0),
)

const doorKeyIssued = computed(() => preview.value?.contract.doorKeyQty || 0)
const smartCardIssued = computed(() => preview.value?.contract.mailboxKeyQty || 0)
const doorKeyMissing = computed(() =>
  keyMissingQty(doorKeyIssued.value, form.doorKeyReturnedQty),
)
const smartCardMissing = computed(() =>
  keyMissingQty(smartCardIssued.value, form.smartCardReturnedQty),
)

const keyDeductionTotal = computed(() => {
  let sum = 0
  if (doorKeyMissing.value > 0) sum += Number(form.doorKeyDeductAmount) || 0
  if (smartCardMissing.value > 0) sum += Number(form.smartCardDeductAmount) || 0
  return Math.round(sum * 100) / 100
})

const deductionPreview = computed(() =>
  Math.round(
    (loanDeductionTotal.value + extraDeductionTotal.value + keyDeductionTotal.value) * 100,
  ) / 100,
)

/** 建议实退 = 已交按金 − 扣除（未交按金不作退款） */
const suggestedActualRefund = computed(() => {
  const paid = preview.value?.depositPaid ?? 0
  return Math.max(0, Math.round((paid - deductionPreview.value) * 100) / 100)
})

/** 超额赔偿毛额 = 预计扣除 − 已收按金 */
const excessCompensationGross = computed(() => {
  const paid = preview.value?.depositPaid ?? 0
  return Math.max(0, Math.round((deductionPreview.value - paid) * 100) / 100)
})

const bookingBalance = computed(() => Number(preview.value?.bookingDeposit.balance) || 0)

/** 勾选抵扣时：定金抵超额金额 */
const bookingOffsetToExcess = computed(() => {
  if (!form.applyBookingDepositToExcess) return 0
  if (excessCompensationGross.value <= 0.009 || bookingBalance.value <= 0.009) return 0
  return Math.round(Math.min(bookingBalance.value, excessCompensationGross.value) * 100) / 100
})

/** 赔偿开票／应收金额（抵扣后净额） */
const excessInvoiceAmount = computed(() =>
  Math.max(
    0,
    Math.round((excessCompensationGross.value - bookingOffsetToExcess.value) * 100) / 100,
  ),
)

/** 一并退还定金（抵扣后剩余） */
const bookingRefundDisplay = computed(() =>
  Math.max(0, Math.round((bookingBalance.value - bookingOffsetToExcess.value) * 100) / 100),
)

/** 本次实退后剩余待退按金（仅此刻退还且小于上限时） */
const remainingRoomRefund = computed(() => {
  if (!refundNow.value) return suggestedActualRefund.value
  return Math.max(
    0,
    Math.round((suggestedActualRefund.value - (Number(form.actualRefundAmount) || 0)) * 100) / 100,
  )
})

/**
 * 最後總共退還：
 * - 此刻退：本次实退按金 + 一并退定金（不含剩余待退）
 * - 未此刻退：剩余待退按金 + 一并退定金
 */
const finalRefundTotal = computed(() => {
  const room = refundNow.value
    ? Number(form.actualRefundAmount) || 0
    : remainingRoomRefund.value
  return Math.round((room + bookingRefundDisplay.value) * 100) / 100
})

watch(
  () => [visible.value, props.contract?.id] as const,
  async ([open, id]) => {
    if (!open || !id) {
      preview.value = null
      return
    }
    loading.value = true
    try {
      const { data } = await fetchTerminateConductPreviewApi(id)
      preview.value = {
        ...data,
        depositPaid: Number(data.depositPaid) || 0,
        depositUnpaid: Number(data.depositUnpaid) || 0,
        unpaidDepositReceivables: data.unpaidDepositReceivables || [],
        suggestedDepositRefund: Number(data.suggestedDepositRefund) || 0,
      }
      form.terminationDate = todayYmd()
      form.terminationKind = data.suggestedKind
      form.reason = data.suggestedKind === 'early' ? t('contract.terminateKindEarly') : t('contract.terminateKindExpiry')
      form.noticeAttachment = ''
      form.doorKeyReturnedQty = data.contract.doorKeyQty || 0
      form.smartCardReturnedQty = data.contract.mailboxKeyQty || 0
      form.doorKeyDeductAmount = 0
      form.smartCardDeductAmount = 0
      form.siteCondition = ''
      form.remark = ''
      form.allowUnsettledReceivables = false
      form.applyBookingDepositToExcess = false
      form.refundDate = form.terminationDate
      form.depositRefundStatus = '已退'
      form.loanChecks = data.loanItems.map((item) => ({
        loanFeeId: item.id,
        description: item.description || '—',
        subtotal: item.subtotal,
        status: 'returned' as TerminateLoanCheckStatus,
        deductAmount: item.subtotal,
      }))
      extraDeductions.value = []
      extraPage.value = 1
      resetRefundAttachments()
      form.actualRefundAmount = suggestedActualRefund.value
      form.bookingDepositRefundAmount = data.bookingDeposit.balance
    } catch (e) {
      preview.value = null
      resetRefundAttachments()
      const msg = e instanceof Error && e.message ? e.message : t('contract.terminateLoadFailed')
      await ElMessageBox.alert(msg, t('contract.terminateLease'), {
        type: 'error',
        confirmButtonText: t('common.confirm'),
      }).catch(() => undefined)
      visible.value = false
    } finally {
      loading.value = false
    }
  },
)

watch(
  () =>
    [
      form.terminationDate,
      preview.value?.lastBillingPeriodStart,
      preview.value?.contract.endDate,
    ] as const,
  ([date, lastStart, end]) => {
    if (!date) return
    // 踏入最后一期缴费首日（可自动开末期发票）起 → 到期退租；此前为提前
    if (lastStart) {
      form.terminationKind = date < lastStart ? 'early' : 'expiry'
      return
    }
    if (!end) return
    form.terminationKind = date < end ? 'early' : 'expiry'
  },
)

watch(deductionPreview, () => {
  form.actualRefundAmount = suggestedActualRefund.value
})

watch(suggestedActualRefund, (max) => {
  const cur = Number(form.actualRefundAmount)
  if (!Number.isFinite(cur) || cur > max) {
    form.actualRefundAmount = max
  }
})

function clampActualRefundAmount(value: number | undefined) {
  const max = suggestedActualRefund.value
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) {
    form.actualRefundAmount = 0
    return
  }
  form.actualRefundAmount = Math.min(max, Math.round(n * 100) / 100)
}

watch(
  () =>
    [
      form.doorKeyReturnedQty,
      preview.value?.contract.doorKeyQty,
      preview.value?.contract.doorKeyDeposit,
    ] as const,
  () => {
    const c = preview.value?.contract
    if (!c) return
    form.doorKeyDeductAmount = defaultKeyDeduct(
      Number(c.doorKeyDeposit) || 0,
      c.doorKeyQty || 0,
      form.doorKeyReturnedQty,
    )
  },
)

watch(
  () =>
    [
      form.smartCardReturnedQty,
      preview.value?.contract.mailboxKeyQty,
      preview.value?.contract.mailboxKeyDeposit,
    ] as const,
  () => {
    const c = preview.value?.contract
    if (!c) return
    form.smartCardDeductAmount = defaultKeyDeduct(
      Number(c.mailboxKeyDeposit) || 0,
      c.mailboxKeyQty || 0,
      form.smartCardReturnedQty,
    )
  },
)

/** 收款后刷新未结应收／定金余额，保留已填退租表单 */
async function refreshPreviewAfterCollect() {
  const id = props.contract?.id
  if (!id) return
  try {
    const { data } = await fetchTerminateConductPreviewApi(id)
    if (!preview.value) {
      preview.value = data
      return
    }
    preview.value.unsettledReceivables = data.unsettledReceivables
    preview.value.unsettledTotal = data.unsettledTotal
    preview.value.bookingDeposit = data.bookingDeposit
    preview.value.totalDeposit = data.totalDeposit
    preview.value.depositPaid = Number(data.depositPaid) || 0
    preview.value.depositUnpaid = Number(data.depositUnpaid) || 0
    preview.value.unpaidDepositReceivables = data.unpaidDepositReceivables || []
    preview.value.suggestedDepositRefund = Number(data.suggestedDepositRefund) || 0
    preview.value.lastBillingPeriodStart = data.lastBillingPeriodStart
    form.bookingDepositRefundAmount = data.bookingDeposit.balance
    form.actualRefundAmount = suggestedActualRefund.value
    if (data.unsettledTotal <= 0.009) {
      form.allowUnsettledReceivables = false
    }
  } catch {
    /* 刷新失败不打断退租；用户可关闭重开 */
  }
}

function onLoanStatusChange(row: LoanCheckRow) {
  if (row.status === 'returned') return
  if (!row.deductAmount || row.deductAmount <= 0) {
    row.deductAmount = row.subtotal
  }
}

function addExtraDeduction() {
  extraDeductions.value.push(defaultExtraDeduction())
  extraPage.value = Math.ceil(extraDeductions.value.length / EXTRA_PAGE_SIZE) || 1
}

function removeExtraDeduction(index: number) {
  extraDeductions.value.splice(index, 1)
  const maxPage = Math.max(1, Math.ceil(extraDeductions.value.length / EXTRA_PAGE_SIZE) || 1)
  if (extraPage.value > maxPage) extraPage.value = maxPage
}

function onExtraDragStart(uid: string, e: DragEvent) {
  dragExtraUid.value = uid
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', uid)
  }
}

function onExtraDragEnd() {
  dragExtraUid.value = null
  dragOverExtraUid.value = null
}

function onExtraDragOver(uid: string, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (dragExtraUid.value && dragExtraUid.value !== uid) dragOverExtraUid.value = uid
}

function onExtraDrop(uid: string, e: DragEvent) {
  e.preventDefault()
  const fromUid = dragExtraUid.value
  dragOverExtraUid.value = null
  dragExtraUid.value = null
  if (!fromUid || fromUid === uid) return
  const list = extraDeductions.value
  const from = list.findIndex((r) => r.uid === fromUid)
  const to = list.findIndex((r) => r.uid === uid)
  if (from < 0 || to < 0) return
  const [item] = list.splice(from, 1)
  if (!item) return
  list.splice(to, 0, item)
}

function beginEditExtraIndex(row: ExtraDeductionRow, index: number) {
  if (extraDeductions.value.length <= 1) return
  editingExtraIndexUid.value = row.uid
  editingExtraIndexDraft.value = String(index + 1)
  void nextTick(() => {
    const el = document.querySelector(
      `.term-dlg__extra-index-input[data-uid="${row.uid}"]`,
    ) as HTMLInputElement | null
    el?.focus()
    el?.select()
  })
}

function cancelEditExtraIndex() {
  editingExtraIndexUid.value = null
  editingExtraIndexDraft.value = ''
  extraIndexCommitLock = false
}

function commitEditExtraIndex(row: ExtraDeductionRow) {
  if (extraIndexCommitLock) return
  extraIndexCommitLock = true
  const list = extraDeductions.value
  const from = list.findIndex((r) => r.uid === row.uid)
  const raw = Number.parseInt(editingExtraIndexDraft.value.trim(), 10)
  editingExtraIndexUid.value = null
  editingExtraIndexDraft.value = ''
  if (from < 0 || !Number.isFinite(raw)) {
    extraIndexCommitLock = false
    return
  }
  const to = Math.min(list.length - 1, Math.max(0, raw - 1))
  if (to !== from) {
    const [item] = list.splice(from, 1)
    if (item) list.splice(to, 0, item)
    extraPage.value = Math.floor(to / EXTRA_PAGE_SIZE) + 1
  }
  void nextTick(() => {
    extraIndexCommitLock = false
  })
}

async function alertBox(msg: string, type: 'warning' | 'error' | 'success' = 'warning') {
  await ElMessageBox.alert(msg, t('contract.terminateLease'), {
    type,
    confirmButtonText: t('common.confirm'),
  }).catch(() => undefined)
}

async function onSubmit() {
  if (!props.contract?.id || !preview.value) return
  if (!termPerms.create) {
    await alertBox(t('contract.terminateNoPerm'))
    return
  }
  if (!preview.value.contract.terminable) {
    await alertBox(t('contract.terminateStatusNotAllowed', { status: preview.value.contract.status }))
    return
  }
  if (preview.value.existingSettlement) {
    await alertBox(
      t('contract.terminateAlreadyExists', {
        code: preview.value.existingSettlement.settlementCode,
      }),
    )
    return
  }
  if (!form.terminationDate) {
    await alertBox(t('contract.terminateNeedDate'))
    return
  }
  if (
    preview.value.unsettledTotal > 0.009 &&
    !form.allowUnsettledReceivables
  ) {
    await alertBox(
      t('contract.terminateUnsettledBlock', {
        amount: money(preview.value.unsettledTotal),
      }),
    )
    return
  }
  const filledExtras = extraDeductions.value.filter((r) => {
    const hasDesc = Boolean(r.description.trim())
    const hasAmt = extraSubtotal(r) > 0
    const touched =
      hasDesc ||
      hasAmt ||
      Boolean(r.remark.trim()) ||
      (Number(r.quantity) || 0) !== 1
    return touched
  })
  if (filledExtras.some((r) => !r.description.trim() || extraSubtotal(r) <= 0)) {
    await alertBox(t('contract.terminateExtraIncomplete'))
    return
  }
  if (refundNow.value) {
    clampActualRefundAmount(form.actualRefundAmount)
  }

  submitting.value = true
  try {
    const { data } = await conductVacateSettlementApi(
      {
        contractId: props.contract.id,
        terminationDate: form.terminationDate,
        terminationKind: form.terminationKind,
        reason: form.reason.trim(),
        noticeAttachment: form.noticeAttachment.trim() || undefined,
        doorKeyReturnedQty: form.doorKeyReturnedQty,
        smartCardReturnedQty: form.smartCardReturnedQty,
        doorKeyDeductAmount: doorKeyMissing.value > 0 ? form.doorKeyDeductAmount : undefined,
        smartCardDeductAmount:
          smartCardMissing.value > 0 ? form.smartCardDeductAmount : undefined,
        siteCondition: form.siteCondition.trim() || undefined,
        remark: form.remark.trim() || undefined,
        loanChecks: form.loanChecks.map((r) => ({
          loanFeeId: r.loanFeeId,
          status: r.status,
          deductAmount: r.status === 'returned' ? undefined : r.deductAmount,
        })),
        extraDeductions: filledExtras.map((r, i) => ({
          description: r.description.trim(),
          quantity: Number(r.quantity) || 0,
          unitAmount: Number(r.unitAmount) || 0,
          subtotal: extraSubtotal(r),
          remark: r.remark.trim() || undefined,
          sortOrder: i,
        })),
        allowUnsettledReceivables: form.allowUnsettledReceivables,
        createDepositRefund: true,
        refundDate:
          form.depositRefundStatus === '已退'
            ? form.refundDate || form.terminationDate
            : form.refundDate || undefined,
        actualRefundAmount: form.actualRefundAmount,
        bookingDepositRefundAmount: bookingRefundDisplay.value,
        depositRefundStatus: form.depositRefundStatus || '已退',
        applyBookingDepositToExcess:
          excessCompensationGross.value > 0.009 &&
          bookingBalance.value > 0.009 &&
          form.applyBookingDepositToExcess,
      },
      { silentError: true },
    )
    const pendingFiles = refundPendingAttachments.value.map((p) => p.file)
    let attachFailed = false
    if (data.depositRefundId && pendingFiles.length) {
      try {
        await uploadDepositRefundAttachmentsApi(data.depositRefundId, pendingFiles)
      } catch {
        attachFailed = true
      }
    }
    resetRefundAttachments()
    visible.value = false
    emit('done')
    if (attachFailed) {
      await alertBox(t('depositRefund.attachmentsUploadFailed'), 'warning')
    } else {
      await alertBox(t('contract.terminateDone'), 'success')
    }
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('contract.terminateFailed')
    await alertBox(msg, 'error')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('contract.terminateTitle')"
    width="900px"
    class="lb-dialog term-dlg-dialog"
    destroy-on-close
    append-to-body
    :z-index="zIndex"
  >
    <div v-loading="loading" class="term-dlg">
      <template v-if="preview">
        <header class="term-dlg__hero">
          <div class="term-dlg__hero-code">
            <strong>{{ preview.contract.contractCode }}</strong>
            <StatusBadge
              :tone="contractStatusTone(preview.contract.status)"
              :label="statusLabel(preview.contract.status)"
            />
          </div>
          <div class="term-dlg__hero-meta">
            <span>
              <em>{{ t('contract.fields.endDate') }}</em>
              {{ preview.contract.endDate || '—' }}
            </span>
            <span>
              <em>{{ t('contract.fields.customerName') }}</em>
              {{ preview.contract.customerName || '—' }}
            </span>
          </div>
        </header>

        <section class="term-dlg__section">
          <div class="term-dlg__section-head">
            <span class="term-dlg__step">1</span>
            <h4>{{ t('contract.terminateSectionBasic') }}</h4>
          </div>
          <el-form label-position="top" class="term-dlg__form">
            <div class="term-dlg__row2">
              <el-form-item :label="t('contract.terminateDate')" required>
                <el-date-picker
                  v-model="form.terminationDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item :label="t('contractSettlement.fields.reason')">
                <el-input v-model="form.reason" clearable />
              </el-form-item>
            </div>
            <div class="term-dlg__row2 term-dlg__row2--reason">
              <el-form-item :label="t('contractSettlement.fields.noticeAttachment')">
                <AttachmentField v-model="form.noticeAttachment" />
              </el-form-item>
            </div>
          </el-form>
        </section>

        <section class="term-dlg__section">
          <div class="term-dlg__section-head">
            <span class="term-dlg__step">2</span>
            <h4>{{ t('contract.terminateSectionLoans') }}</h4>
          </div>
          <p v-if="!form.loanChecks.length" class="term-dlg__empty">
            {{ t('contract.terminateNoLoans') }}
          </p>
          <div v-else class="term-dlg__loan-list">
            <div
              v-for="(row, idx) in form.loanChecks"
              :key="row.loanFeeId"
              class="term-dlg__loan"
              :class="{
                'is-ok': row.status === 'returned',
                'is-bad': row.status !== 'returned',
              }"
            >
              <div class="term-dlg__loan-top">
                <span class="term-dlg__loan-idx">{{ idx + 1 }}</span>
                <div class="term-dlg__loan-title">
                  <strong>{{ row.description }}</strong>
                  <span class="term-dlg__loan-amt">
                    <em>{{ t('contract.terminateLoanValue') }}</em>
                    {{ money(row.subtotal) }}
                  </span>
                </div>
                <div class="term-dlg__loan-status">
                  <button
                    type="button"
                    class="term-dlg__pill"
                    :class="{ 'is-active is-ok': row.status === 'returned' }"
                    @click="row.status = 'returned'; onLoanStatusChange(row)"
                  >
                    {{ t('contract.loanReturned') }}
                  </button>
                  <button
                    type="button"
                    class="term-dlg__pill"
                    :class="{ 'is-active is-danger': row.status === 'damaged' }"
                    @click="row.status = 'damaged'; onLoanStatusChange(row)"
                  >
                    {{ t('contract.loanDamaged') }}
                  </button>
                  <button
                    type="button"
                    class="term-dlg__pill"
                    :class="{ 'is-active is-warn': row.status === 'missing' }"
                    @click="row.status = 'missing'; onLoanStatusChange(row)"
                  >
                    {{ t('contract.loanMissing') }}
                  </button>
                </div>
              </div>
              <div v-if="row.status !== 'returned'" class="term-dlg__loan-deduct">
                <span class="term-dlg__loan-deduct-label">{{ t('contract.terminateDeductAmount') }}</span>
                <el-input-number
                  v-model="row.deductAmount"
                  :min="0"
                  :precision="2"
                  :step="100"
                  controls-position="right"
                  class="term-dlg__num"
                />
              </div>
            </div>
          </div>

          <div class="term-dlg__keys-block">
            <div class="term-dlg__keys-title">{{ t('contract.terminateKeysTitle') }}</div>
            <div class="term-dlg__row2 term-dlg__keys">
              <el-form-item label-position="top">
                <template #label>
                  <span>
                    {{ t('contractSettlement.fields.doorKeyReturnedQty') }}
                    <em v-if="doorKeyIssued > 0" class="term-dlg__keys-issued">
                      （{{ t('contract.terminateKeysIssued', { qty: doorKeyIssued }) }}）
                    </em>
                  </span>
                </template>
                <el-input-number
                  v-model="form.doorKeyReturnedQty"
                  :min="0"
                  :max="Math.max(doorKeyIssued, form.doorKeyReturnedQty)"
                  :precision="0"
                  controls-position="right"
                  style="width: 100%"
                />
                <div v-if="doorKeyMissing > 0" class="term-dlg__loan-deduct term-dlg__keys-deduct">
                  <span class="term-dlg__loan-deduct-label">
                    {{ t('contract.terminateDoorKeyMissing', { missing: doorKeyMissing }) }} ·
                    {{ t('contract.terminateKeyMissingDeduct') }}
                  </span>
                  <el-input-number
                    v-model="form.doorKeyDeductAmount"
                    :min="0"
                    :precision="2"
                    :step="1"
                    controls-position="right"
                    class="term-dlg__num"
                  />
                </div>
              </el-form-item>
              <el-form-item label-position="top">
                <template #label>
                  <span>
                    {{ t('contractSettlement.fields.smartCardReturnedQty') }}
                    <em v-if="smartCardIssued > 0" class="term-dlg__keys-issued">
                      （{{ t('contract.terminateKeysIssued', { qty: smartCardIssued }) }}）
                    </em>
                  </span>
                </template>
                <el-input-number
                  v-model="form.smartCardReturnedQty"
                  :min="0"
                  :max="Math.max(smartCardIssued, form.smartCardReturnedQty)"
                  :precision="0"
                  controls-position="right"
                  style="width: 100%"
                />
                <div v-if="smartCardMissing > 0" class="term-dlg__loan-deduct term-dlg__keys-deduct">
                  <span class="term-dlg__loan-deduct-label">
                    {{ t('contract.terminateSmartCardMissing', { missing: smartCardMissing }) }} ·
                    {{ t('contract.terminateKeyMissingDeduct') }}
                  </span>
                  <el-input-number
                    v-model="form.smartCardDeductAmount"
                    :min="0"
                    :precision="2"
                    :step="1"
                    controls-position="right"
                    class="term-dlg__num"
                  />
                </div>
              </el-form-item>
            </div>
          </div>
          <el-form-item
            :label="t('contractSettlement.fields.siteCondition')"
            label-position="top"
            class="term-dlg__tight-item"
          >
            <el-input
              v-model="form.siteCondition"
              type="textarea"
              :rows="2"
              resize="none"
            />
          </el-form-item>
        </section>

        <section class="term-dlg__section">
          <div class="term-dlg__section-head term-dlg__section-head--with-action">
            <div class="term-dlg__section-head-main">
              <span class="term-dlg__step">3</span>
              <h4 class="term-dlg__section-title-with-tip">
                {{ t('contract.terminateSectionExtraDeductions') }}
                <el-tooltip
                  :content="t('contract.terminateExtraDeductionsHint')"
                  placement="top"
                >
                  <el-icon class="term-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                </el-tooltip>
              </h4>
            </div>
            <el-button
              type="primary"
              size="small"
              plain
              :icon="Plus"
              class="term-dlg__add-btn"
              @click="addExtraDeduction"
            >
              {{ t('contract.terminateAddDeduction') }}
            </el-button>
          </div>
          <div v-if="!extraDeductions.length" class="term-dlg__empty">
            {{ t('contract.terminateExtraDeductionsEmpty') }}
          </div>
          <div v-else class="term-dlg__extra-wrap">
            <div
              v-if="extraDeductions.length > EXTRA_PAGE_SIZE"
              class="term-dlg__extra-pager"
            >
              <el-pagination
                v-model:current-page="extraPage"
                :page-size="EXTRA_PAGE_SIZE"
                :total="extraDeductions.length"
                layout="total, prev, pager, next"
                small
                background
              />
            </div>
            <div
              class="term-dlg__extra-table"
              role="table"
              :style="{ '--extra-page-size': EXTRA_PAGE_SIZE }"
            >
              <div class="term-dlg__extra-head" role="row">
                <div class="term-dlg__extra-cell term-dlg__extra-cell--idx" role="columnheader">#</div>
                <div class="term-dlg__extra-cell term-dlg__extra-cell--desc" role="columnheader">
                  <span class="req">*</span>{{ t('contractLoanItem.fields.description') }}
                </div>
                <div class="term-dlg__extra-cell term-dlg__extra-cell--qty" role="columnheader">
                  <span class="req">*</span>{{ t('contractLoanItem.fields.quantity') }}
                </div>
                <div class="term-dlg__extra-cell term-dlg__extra-cell--unit" role="columnheader">
                  <span class="req">*</span>{{ t('contract.terminateExtraUnitAmount') }}
                </div>
                <div class="term-dlg__extra-cell term-dlg__extra-cell--sub" role="columnheader">
                  {{ t('contractLoanItem.fields.subtotal') }}
                </div>
                <div class="term-dlg__extra-cell term-dlg__extra-cell--remark" role="columnheader">
                  {{ t('contractLoanItem.fields.remark') }}
                </div>
                <div class="term-dlg__extra-cell term-dlg__extra-cell--actions" role="columnheader" />
              </div>
              <div
                class="term-dlg__extra-body"
                :class="{ 'is-fixed': extraDeductions.length > EXTRA_PAGE_SIZE }"
              >
                <div
                  v-for="{ row, index } in pagedExtraDeductions"
                  :key="row.uid"
                  class="term-dlg__extra-row"
                  role="row"
                  :class="{
                    'is-dragging': dragExtraUid === row.uid,
                    'is-drag-over': dragOverExtraUid === row.uid,
                  }"
                  @dragover="onExtraDragOver(row.uid, $event)"
                  @drop="onExtraDrop(row.uid, $event)"
                  @dragleave="dragOverExtraUid === row.uid && (dragOverExtraUid = null)"
                >
                  <div class="term-dlg__extra-cell term-dlg__extra-cell--idx" role="cell">
                    <button
                      type="button"
                      class="term-dlg__extra-handle"
                      draggable="true"
                      :title="t('contract.terminateDragDeduction')"
                      @dragstart="onExtraDragStart(row.uid, $event)"
                      @dragend="onExtraDragEnd"
                    >
                      <el-icon :size="14"><Rank /></el-icon>
                    </button>
                    <button
                      v-if="editingExtraIndexUid !== row.uid"
                      type="button"
                      class="term-dlg__extra-index"
                      :title="t('contract.terminateEditDeductionIndex')"
                      @dblclick="beginEditExtraIndex(row, index)"
                    >
                      {{ index + 1 }}
                    </button>
                    <input
                      v-else
                      class="term-dlg__extra-index-input"
                      :data-uid="row.uid"
                      v-model="editingExtraIndexDraft"
                      @keydown.enter.prevent="commitEditExtraIndex(row)"
                      @keydown.esc.prevent="cancelEditExtraIndex"
                      @blur="commitEditExtraIndex(row)"
                    />
                  </div>
                  <div class="term-dlg__extra-cell term-dlg__extra-cell--desc" role="cell">
                    <el-input v-model="row.description" />
                  </div>
                  <div class="term-dlg__extra-cell term-dlg__extra-cell--qty" role="cell">
                    <el-input-number
                      v-model="row.quantity"
                      :min="0"
                      :precision="2"
                      controls-position="right"
                      style="width: 100%"
                    />
                  </div>
                  <div class="term-dlg__extra-cell term-dlg__extra-cell--unit" role="cell">
                    <el-input-number
                      v-model="row.unitAmount"
                      :min="0"
                      :precision="2"
                      :step="100"
                      controls-position="right"
                      style="width: 100%"
                    />
                  </div>
                  <div class="term-dlg__extra-cell term-dlg__extra-cell--sub" role="cell">
                    {{ money(extraSubtotal(row)) }}
                  </div>
                  <div class="term-dlg__extra-cell term-dlg__extra-cell--remark" role="cell">
                    <el-input v-model="row.remark" />
                  </div>
                  <div class="term-dlg__extra-cell term-dlg__extra-cell--actions" role="cell">
                    <el-button type="danger" link :icon="Delete" @click="removeExtraDeduction(index)" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="term-dlg__section">
          <div class="term-dlg__section-head">
            <span class="term-dlg__step">4</span>
            <h4>{{ t('contract.terminateSectionSettlement') }}</h4>
          </div>
          <div
            class="term-dlg__banner"
            :class="preview.unsettledTotal <= 0 ? 'is-ok' : 'is-warn'"
          >
            <div class="term-dlg__banner-dot" />
            <div class="term-dlg__banner-body">
              <p v-if="preview.unsettledTotal <= 0" class="term-dlg__banner-title">
                {{ t('contract.terminateSettledOk') }}
              </p>
              <template v-else>
                <div class="term-dlg__banner-head">
                  <p class="term-dlg__banner-title">
                    {{ t('contract.terminateUnsettledHint', { amount: money(preview.unsettledTotal) }) }}
                  </p>
                  <button
                    v-if="receiptPerms.create"
                    v-admin-glow="receiptPerms.codes.create"
                    type="button"
                    class="action-pill action-pill--accent term-dlg__recv-btn"
                    @click="receivePayVisible = true"
                  >
                    {{ t('contract.receivePayment') }}
                  </button>
                </div>
                <div v-if="preview.unsettledReceivables.length" class="term-dlg__unset-wrap">
                  <span class="term-dlg__unset-label">{{ t('contract.terminateUnsettledList') }}</span>
                  <ul class="term-dlg__unset">
                    <li v-for="r in preview.unsettledReceivables" :key="r.id">
                      <button
                        type="button"
                        class="term-dlg__unset-code term-dlg__unset-code--link"
                        @click="emit('openReceivable', r.id)"
                      >
                        {{ r.invoiceCode || r.receivableCode || '—' }}
                      </button>
                      <strong>{{ money(r.openAmount) }}</strong>
                    </li>
                  </ul>
                </div>
                <el-checkbox v-model="form.allowUnsettledReceivables" class="term-dlg__allow">
                  {{ t('contract.terminateAllowUnsettled') }}
                </el-checkbox>
              </template>
            </div>
          </div>
        </section>

        <section class="term-dlg__section">
          <div class="term-dlg__section-head">
            <span class="term-dlg__step">5</span>
            <h4>{{ t('contract.terminateSectionRefund') }}</h4>
          </div>
          <div class="term-dlg__tiles">
            <div class="term-dlg__tile">
              <span>{{ t('contract.terminateDepositPaid') }}</span>
              <strong>{{ money(preview.depositPaid ?? 0) }}</strong>
            </div>
            <div class="term-dlg__tile" :class="{ 'is-deduct': deductionPreview > 0 }">
              <span>{{ t('contract.terminateDeductionTotal') }}</span>
              <strong>{{ money(deductionPreview) }}</strong>
            </div>
            <div class="term-dlg__tile term-dlg__tile--accent">
              <span>{{ t('contract.terminateSuggestedRefund') }}</span>
              <strong>{{ money(suggestedActualRefund) }}</strong>
            </div>
            <div class="term-dlg__tile">
              <span>{{ t('contract.terminateBookingBalance') }}</span>
              <strong class="term-dlg__bal">{{ money(preview.bookingDeposit.balance) }}</strong>
            </div>
          </div>
          <div
            v-if="excessCompensationGross > 0.009"
            class="term-dlg__banner is-warn term-dlg__excess"
          >
            <div class="term-dlg__banner-dot" />
            <div class="term-dlg__banner-body">
              <div class="term-dlg__banner-head">
                <p class="term-dlg__banner-title">
                  {{ t('contract.terminateExcessCompensation') }}：{{ money(excessCompensationGross) }}
                </p>
              </div>
              <el-checkbox
                v-if="bookingBalance > 0.009"
                v-model="form.applyBookingDepositToExcess"
                class="term-dlg__allow"
              >
                <span class="term-dlg__check-label-with-tip">
                  {{ t('contract.terminateApplyBookingToExcess') }}
                  <el-tooltip
                    :content="
                      t('contract.terminateExcessCompensationHint', {
                        gross: money(excessCompensationGross),
                      })
                    "
                    placement="top"
                  >
                    <el-icon class="term-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </span>
              </el-checkbox>
              <dl
                v-if="form.applyBookingDepositToExcess && bookingOffsetToExcess > 0.009"
                class="term-dlg__excess-breakdown"
              >
                <div>
                  <dt>{{ t('contract.terminateBookingOffsetAmount') }}</dt>
                  <dd>{{ money(bookingOffsetToExcess) }}</dd>
                </div>
                <div>
                  <dt>{{ t('contract.terminateExcessInvoiceAmount') }}</dt>
                  <dd>{{ money(excessInvoiceAmount) }}</dd>
                </div>
              </dl>
            </div>
          </div>
          <div class="term-dlg__refund-fields">
            <label class="term-dlg__check-card">
              <el-checkbox v-model="refundNow">
                <span class="term-dlg__check-label-with-tip">
                  {{ t('contract.terminateRefundNow') }}
                  <el-tooltip
                    :content="t('contract.terminateRefundNowHint')"
                    placement="top"
                  >
                    <el-icon
                      class="term-dlg__label-tip"
                      :size="14"
                      @click.stop.prevent
                    >
                      <QuestionFilled />
                    </el-icon>
                  </el-tooltip>
                </span>
              </el-checkbox>
            </label>
            <el-form label-position="top" class="term-dlg__form">
              <template v-if="!refundNow">
                <div class="term-dlg__row3">
                  <el-form-item>
                    <template #label>
                      <span class="term-dlg__check-label-with-tip">
                        {{ t('contract.terminateRefundRemaining') }}
                        <el-tooltip
                          :content="t('contract.terminateRefundRemainingHint')"
                          placement="top"
                        >
                          <el-icon class="term-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                        </el-tooltip>
                      </span>
                    </template>
                    <div class="total-deposit-field term-dlg__final-total">
                      <span class="total-deposit-field__value">{{ money(remainingRoomRefund) }}</span>
                    </div>
                  </el-form-item>
                  <el-form-item>
                    <template #label>
                      <span class="term-dlg__check-label-with-tip">
                        {{ t('depositRefund.fields.bookingDepositRefundAmount') }}
                        <el-tooltip
                          :content="t('depositRefund.fields.bookingDepositMustFullHint')"
                          placement="top"
                        >
                          <el-icon class="term-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                        </el-tooltip>
                      </span>
                    </template>
                    <div class="total-deposit-field term-dlg__final-total">
                      <span class="total-deposit-field__value">
                        {{ money(bookingRefundDisplay) }}
                      </span>
                    </div>
                  </el-form-item>
                  <el-form-item :label="t('contract.terminateFinalRefundTotal')">
                    <div class="total-deposit-field term-dlg__final-total">
                      <span class="total-deposit-field__value">{{ money(finalRefundTotal) }}</span>
                    </div>
                  </el-form-item>
                </div>
              </template>
              <template v-else>
                <div class="term-dlg__row4">
                  <el-form-item :label="t('contract.terminateRefundThisTime')">
                    <el-input-number
                      v-model="form.actualRefundAmount"
                      :min="0"
                      :max="suggestedActualRefund"
                      :precision="2"
                      :step="100"
                      controls-position="right"
                      style="width: 100%"
                      @change="clampActualRefundAmount"
                    />
                  </el-form-item>
                  <el-form-item>
                    <template #label>
                      <span class="term-dlg__check-label-with-tip">
                        {{ t('depositRefund.fields.bookingDepositRefundAmount') }}
                        <el-tooltip
                          :content="t('depositRefund.fields.bookingDepositMustFullHint')"
                          placement="top"
                        >
                          <el-icon class="term-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                        </el-tooltip>
                      </span>
                    </template>
                    <div class="total-deposit-field term-dlg__final-total">
                      <span class="total-deposit-field__value">
                        {{ money(bookingRefundDisplay) }}
                      </span>
                    </div>
                  </el-form-item>
                  <el-form-item :label="t('contract.terminateFinalRefundTotal')">
                    <div class="total-deposit-field term-dlg__final-total">
                      <span class="total-deposit-field__value">{{ money(finalRefundTotal) }}</span>
                    </div>
                  </el-form-item>
                  <el-form-item :label="t('depositRefund.fields.refundDate')">
                    <el-date-picker
                      v-model="form.refundDate"
                      type="date"
                      value-format="YYYY-MM-DD"
                      style="width: 100%"
                    />
                  </el-form-item>
                </div>
                <div v-if="remainingRoomRefund > 0.009" class="term-dlg__row3">
                  <el-form-item>
                    <template #label>
                      <span class="term-dlg__check-label-with-tip">
                        {{ t('contract.terminateRefundRemaining') }}
                        <el-tooltip
                          :content="t('contract.terminateRefundRemainingHint')"
                          placement="top"
                        >
                          <el-icon class="term-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                        </el-tooltip>
                      </span>
                    </template>
                    <div class="total-deposit-field term-dlg__final-total">
                      <span class="total-deposit-field__value">{{ money(remainingRoomRefund) }}</span>
                    </div>
                  </el-form-item>
                </div>
                <div class="term-dlg__row1">
                  <el-form-item :label="t('depositRefund.fields.attachments')">
                    <MultiAttachmentField
                      :pending="refundPendingAttachments"
                      :disabled="submitting"
                      @add="onAddRefundAttachments"
                      @remove-pending="removeRefundPendingAttachment"
                    />
                  </el-form-item>
                </div>
              </template>
            </el-form>
          </div>
        </section>

        <el-form-item :label="t('contractSettlement.fields.remark')" label-position="top" class="term-dlg__remark">
          <el-input v-model="form.remark" type="textarea" :rows="2" resize="none" />
        </el-form-item>
      </template>
    </div>

    <template #footer>
      <el-button :disabled="submitting" @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button
        v-if="termPerms.create"
        v-admin-glow="termPerms.codes.create"
        type="primary"
        class="lb-btn-primary"
        :loading="submitting"
        :disabled="!preview?.contract.terminable"
        @click="onSubmit"
      >
        {{ t('contract.terminateSubmit') }}
      </el-button>
    </template>
  </el-dialog>

  <ContractReceivePaymentDialog
    v-model="receivePayVisible"
    :contract="contract"
    :z-index="zIndex != null ? zIndex + 100 : undefined"
    @collected="refreshPreviewAfterCollect"
    @open-contract="(id) => emit('openContract', id)"
    @open-customer="(id) => emit('openCustomer', id)"
    @open-invoice="(id) => emit('openInvoice', id)"
    @open-receipts="(c) => emit('openReceipts', c)"
  />
</template>

<style scoped>
.term-dlg {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 80px;
  font-size: 14px;
  color: #1a2a22;
}

.term-dlg__hero {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 10px;
  padding: 12px 16px;
  border: 1px solid #dfe8e2;
  border-radius: 12px;
  background: linear-gradient(180deg, #f7faf8 0%, #f1f6f3 100%);
}

.term-dlg__hero-code {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.term-dlg__hero-code strong {
  font-size: 15px;
  font-weight: 800;
  color: var(--lb-brand, #0f4a32);
  word-break: break-all;
}

.term-dlg__hero-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 20px;
  min-width: 0;
  font-size: 14px;
  font-weight: 700;
  color: #1a2a22;
}

.term-dlg__hero-meta em {
  font-style: normal;
  font-weight: 550;
  color: #6a7a70;
  margin-right: 4px;
}

/* 分区对齐编辑合约 .form-section：无厚卡片，左侧色条标题 */
.term-dlg__section {
  margin: 0 0 14px;
  padding: 0;
  border: none;
  background: transparent;
}

/* 区间距只由 section margin 承担，避免末项再叠一层 12px */
.term-dlg__section > :last-child {
  margin-bottom: 0 !important;
}

.term-dlg__section > .term-dlg__form > .term-dlg__row2:last-child :deep(.el-form-item) {
  margin-bottom: 0;
}

.term-dlg__section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 0 10px;
}

.term-dlg__section-head--with-action {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.term-dlg__section-head-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.term-dlg__section-head h4 {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 700;
  color: #0d3a28;
}

.term-dlg__add-btn {
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

.term-dlg__section-title-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.term-dlg__check-label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.term-dlg__label-tip {
  color: var(--lb-muted, #6a7a70);
  cursor: help;
  vertical-align: middle;
  flex-shrink: 0;
}

.term-dlg__extra-wrap {
  min-width: 0;
}

.term-dlg__extra-pager {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.term-dlg__extra-table {
  --extra-row-h: 44px;
  --extra-page-size: 5;
  border: 1px solid #e4ebe6;
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}

.term-dlg__extra-head,
.term-dlg__extra-row {
  display: grid;
  grid-template-columns:
    52px
    minmax(120px, 1.5fr)
    110px
    140px
    88px
    minmax(100px, 1fr)
    40px;
  align-items: center;
  column-gap: 6px;
  padding: 0 8px;
}

.term-dlg__extra-head {
  min-height: 34px;
  background: #f4f7f5;
  border-bottom: 1px solid #e4ebe6;
  color: #3d4f45;
  font-size: 0.78rem;
  font-weight: 700;
}

.term-dlg__extra-head .req {
  color: #e35d5d;
  margin-right: 2px;
}

.term-dlg__extra-body.is-fixed {
  height: calc(var(--extra-row-h) * var(--extra-page-size));
  overflow: hidden;
}

.term-dlg__extra-row {
  box-sizing: border-box;
  min-height: var(--extra-row-h);
  height: var(--extra-row-h);
  border-bottom: 1px solid #edf2ef;
}

.term-dlg__extra-row:last-child {
  border-bottom: none;
}

.term-dlg__extra-row.is-dragging {
  opacity: 0.45;
}

.term-dlg__extra-row.is-drag-over {
  background: color-mix(in srgb, var(--lb-brand) 6%, #fff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lb-brand) 35%, #fff);
}

.term-dlg__extra-cell {
  display: flex;
  align-items: center;
  min-width: 0;
}

.term-dlg__extra-cell--idx {
  gap: 2px;
}

.term-dlg__extra-cell--sub {
  justify-content: flex-end;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #0d3a28;
  font-size: 0.84rem;
}

.term-dlg__extra-cell--actions {
  justify-content: center;
}

.term-dlg__extra-handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #7a8a82;
  cursor: grab;
  padding: 0;
}

.term-dlg__extra-handle:active {
  cursor: grabbing;
}

.term-dlg__extra-index {
  border: 0;
  background: transparent;
  color: #3d4f45;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  padding: 0 2px;
  cursor: text;
}

.term-dlg__extra-index-input {
  width: 28px;
  height: 24px;
  border: 1px solid var(--lb-brand, #0f4a32);
  border-radius: 6px;
  text-align: center;
  font-size: 0.82rem;
  font-weight: 700;
}

.term-dlg__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: var(--lb-brand, #0f4a32);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  flex: 0 0 auto;
}

.term-dlg__form :deep(.el-form-item) {
  margin-bottom: 12px;
}

.term-dlg__form :deep(.el-form-item__label) {
  color: #6a7a70;
  font-weight: 550;
  font-size: 0.84rem;
  line-height: 1.25;
  margin-bottom: 6px !important;
}

.term-dlg__row1,
.term-dlg__row2 {
  display: grid;
  gap: 0 16px;
  align-items: start;
  margin-bottom: 12px;
}

.term-dlg__row1 {
  grid-template-columns: minmax(0, 1fr);
}

.term-dlg__row2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.term-dlg__row2--reason {
  align-items: start;
}

.term-dlg__row3,
.term-dlg__row4 {
  display: grid;
  gap: 0 16px;
  align-items: start;
  margin-bottom: 12px;
}

.term-dlg__row3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.term-dlg__row4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.term-dlg__span-2 {
  grid-column: span 2;
}

.term-dlg__span-3 {
  grid-column: span 3;
}

.term-dlg__row1 > :deep(.el-form-item),
.term-dlg__row2 > :deep(.el-form-item),
.term-dlg__row3 > :deep(.el-form-item),
.term-dlg__row4 > :deep(.el-form-item) {
  width: 100%;
  min-width: 0;
  /* 压过 EP 默认 18px，避免与下一行「凭证」之间空一大截 */
  margin-bottom: 0 !important;
}

.term-dlg__form > .term-dlg__row1:last-child,
.term-dlg__form > .term-dlg__row2:last-child,
.term-dlg__form > .term-dlg__row3:last-child,
.term-dlg__form > .term-dlg__row4:last-child {
  margin-bottom: 0;
}

.term-dlg__row1 :deep(.el-form-item__content),
.term-dlg__row2 :deep(.el-form-item__content),
.term-dlg__row3 :deep(.el-form-item__content),
.term-dlg__row4 :deep(.el-form-item__content) {
  width: 100%;
}

.term-dlg__row1 :deep(.el-input-number),
.term-dlg__row1 :deep(.el-date-editor),
.term-dlg__row2 :deep(.el-input-number),
.term-dlg__row2 :deep(.el-date-editor),
.term-dlg__row3 :deep(.el-input-number),
.term-dlg__row3 :deep(.el-date-editor),
.term-dlg__row4 :deep(.el-input-number),
.term-dlg__row4 :deep(.el-date-editor) {
  width: 100% !important;
}

.term-dlg__final-total {
  width: 100%;
  min-height: 32px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-radius: 8px;
  background: #f3f5f4;
  border: 1px solid #d7ded9;
  box-sizing: border-box;
}

.term-dlg__final-total .total-deposit-field__value {
  font-size: 15px;
  font-weight: 800;
  color: var(--lb-brand, #0f4a32);
  font-variant-numeric: tabular-nums;
}

.term-dlg__kind {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  width: auto;
  max-width: 100%;
}

.term-dlg__kind-btn {
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid #cfdad3;
  background: #fff;
  color: #3a4a42;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.term-dlg__kind-btn:hover {
  border-color: var(--lb-brand-mid, #2a6b4d);
}

.term-dlg__kind-btn.is-active {
  border-color: var(--lb-brand, #0f4a32);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #fff);
  color: var(--lb-brand, #0f4a32);
}

.term-dlg__kind-btn--early.is-active {
  border-color: #b86a1a;
  background: #fff7ed;
  color: #9a4f0a;
}

.term-dlg__empty {
  margin: 0 0 12px;
  padding: 12px 14px;
  text-align: center;
  color: #6a7a70;
  font-size: 0.84rem;
  background: #f6f9f7;
  border-radius: 8px;
  border: 1px dashed #d5e0d9;
}

.term-dlg__loan-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.term-dlg__loan {
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #e4ebe6;
  background: #fbfcfb;
}

.term-dlg__loan.is-ok {
  border-color: #d5e6dc;
  background: #f7fbf8;
}

.term-dlg__loan.is-bad {
  border-color: #edd7b8;
  background: #fffaf3;
}

.term-dlg__loan-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.term-dlg__loan-idx {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: #e8efeb;
  color: #0d3a28;
  font-size: 12px;
  font-weight: 800;
  flex: 0 0 auto;
}

.term-dlg__loan-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  min-width: 0;
  flex: 1 1 140px;
}

.term-dlg__loan-title strong {
  font-size: 14px;
  font-weight: 700;
  color: #1a2a22;
}

.term-dlg__loan-amt {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  font-size: 14px;
  font-weight: 700;
  color: #0d3a28;
}

.term-dlg__loan-amt em {
  font-style: normal;
  font-size: 12px;
  font-weight: 600;
  color: #7a8a82;
}

.term-dlg__loan-status {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
}

.term-dlg__pill {
  height: 28px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid #d0dbd4;
  background: #fff;
  color: #4a5a52;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.term-dlg__pill:hover {
  border-color: #a8bbb0;
}

.term-dlg__pill.is-active.is-ok {
  border-color: var(--lb-brand, #0f4a32);
  background: var(--lb-brand, #0f4a32);
  color: #fff;
}

.term-dlg__pill.is-active.is-warn {
  border-color: #b86a1a;
  background: #b86a1a;
  color: #fff;
}

.term-dlg__pill.is-active.is-danger {
  border-color: #b42318;
  background: #b42318;
  color: #fff;
}

.term-dlg__loan-deduct {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #e6d5bc;
}

.term-dlg__loan-deduct-label {
  font-size: 13px;
  font-weight: 700;
  color: #9a4f0a;
  white-space: nowrap;
}

.term-dlg__keys-block {
  margin: 0 0 12px;
  padding: 12px 14px 4px;
  border-radius: 10px;
  background: #f6f9f7;
  border: 1px solid #e4ebe6;
}

.term-dlg__keys-title {
  font-size: 0.84rem;
  font-weight: 700;
  color: #0d3a28;
  margin-bottom: 6px;
}

.term-dlg__keys-issued {
  font-style: normal;
  font-weight: 500;
  color: #7a8b82;
  margin-left: 2px;
}

.term-dlg__keys-deduct {
  margin-top: 8px;
  width: 100%;
}

.term-dlg__keys :deep(.el-form-item) {
  margin-bottom: 12px;
}

.term-dlg__keys :deep(.el-form-item__label) {
  color: #6a7a70;
  font-weight: 550;
  font-size: 0.84rem;
  margin-bottom: 6px !important;
}

.term-dlg__num {
  width: 100%;
  max-width: 160px;
}

.term-dlg__tight-item {
  margin-bottom: 12px;
}

.term-dlg__tight-item :deep(.el-form-item__label) {
  color: #6a7a70;
  font-weight: 550;
  font-size: 0.84rem;
  margin-bottom: 6px !important;
}

.term-dlg__banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid transparent;
}

.term-dlg__banner.is-ok {
  background: #f1f8f3;
  border-color: #cfe3d6;
}

.term-dlg__banner.is-warn {
  background: #fff7ed;
  border-color: #f0d2a8;
}

.term-dlg__banner-dot {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.term-dlg__banner.is-ok .term-dlg__banner-dot {
  background: #1f7a4c;
  box-shadow: 0 0 0 3px rgba(31, 122, 76, 0.14);
}

.term-dlg__banner.is-warn .term-dlg__banner-dot {
  background: #b86a1a;
  box-shadow: 0 0 0 3px rgba(184, 106, 26, 0.14);
}

.term-dlg__banner-body {
  min-width: 0;
  flex: 1 1 auto;
}

.term-dlg__banner-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px 14px;
  flex-wrap: wrap;
}

.term-dlg__banner-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
  flex: 1 1 auto;
  min-width: 0;
}

.term-dlg__recv-btn {
  flex: 0 0 auto;
  height: 28px;
  min-height: 28px;
  padding: 0 12px;
  font-size: 13px;
  line-height: 26px;
}

.term-dlg__banner.is-ok .term-dlg__banner-title {
  color: #1f5c3c;
}

.term-dlg__banner.is-warn .term-dlg__banner-title {
  color: #9a4f0a;
}

.term-dlg__unset-wrap {
  margin-top: 8px;
}

.term-dlg__unset-label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: 700;
  color: #8a6a45;
}

.term-dlg__unset {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.term-dlg__unset li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 7px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid #f0dfc4;
  font-size: 14px;
  color: #5a4a36;
}

.term-dlg__unset-code {
  font-size: 14px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  color: #3a2f22;
  line-height: 1.35;
}

.term-dlg__unset-code--link {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  color: var(--lb-brand, #0f4a32);
  text-align: left;
}

.term-dlg__unset-code--link:hover {
  text-decoration: underline;
}

.term-dlg__unset strong {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  color: #9a4f0a;
}

.term-dlg__allow {
  margin-top: 8px;
}

.term-dlg__tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px 12px;
  margin-bottom: 12px;
}

.term-dlg__excess {
  margin: 0 0 12px;
}

.term-dlg__excess-breakdown {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
  margin: 8px 0 0;
}

.term-dlg__excess-breakdown dt {
  font-size: 12px;
  font-weight: 650;
  color: #8a6a45;
}

.term-dlg__excess-breakdown dd {
  margin: 2px 0 0;
  font-size: 14px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  color: #5a4a36;
}

.term-dlg__tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #e4ebe6;
  background: #f8faf8;
  min-width: 0;
}

.term-dlg__tile span {
  font-size: 0.78rem;
  font-weight: 550;
  color: #6a7a70;
  line-height: 1.35;
}

.term-dlg__tile strong {
  font-size: 15px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: #1a2a22;
}

.term-dlg__tile.is-deduct strong {
  color: #b42318;
}

.term-dlg__tile.is-warn strong {
  color: #a15c00;
}

.term-dlg__hint {
  margin: 8px 0 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: #6a7a70;
}

.term-dlg__tile--accent {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #fff);
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 22%, #e4ebe6);
}

.term-dlg__tile--accent strong,
.term-dlg__bal {
  color: var(--lb-brand, #0f4a32);
}

.term-dlg__check-card {
  display: block;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #e4ebe6;
  background: #fbfcfb;
  margin-bottom: 4px;
  cursor: pointer;
  font-size: 14px;
}

.term-dlg__refund-fields {
  margin-top: 10px;
  width: 100%;
}

.term-dlg__refund-fields .term-dlg__check-card {
  margin-bottom: 0;
}

.term-dlg__refund-fields .term-dlg__form {
  margin-top: 12px;
}

.term-dlg__refund-fields .term-dlg__form > .term-dlg__span-all {
  margin-bottom: 0 !important;
}

.term-dlg__span-all {
  grid-column: 1 / -1;
  width: 100%;
}

.term-dlg__remark {
  margin: 0 0 4px;
  width: 100%;
}

.term-dlg__remark :deep(.el-form-item__label) {
  color: #6a7a70;
  font-weight: 550;
  font-size: 0.84rem;
  margin-bottom: 6px !important;
}

@media (max-width: 900px) {
  .term-dlg__tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .term-dlg__row4,
  .term-dlg__row3,
  .term-dlg__row2,
  .term-dlg__row1 {
    grid-template-columns: 1fr;
  }

  .term-dlg__span-2,
  .term-dlg__span-3 {
    grid-column: auto;
  }
}
</style>

<style>
/* 退租弹窗：小屏更高占用，大屏略收 */
.term-dlg-dialog.el-dialog {
  max-width: calc(100vw - 32px);
}

@media (max-height: 900px) {
  .term-dlg-dialog.el-dialog {
    margin-top: 3vh !important;
  }
}
</style>
