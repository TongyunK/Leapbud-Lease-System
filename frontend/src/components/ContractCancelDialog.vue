<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import type { ContractRecord } from '@/types/contract'
import {
  conductCancelContractApi,
  fetchCancelContractPreviewApi,
  type CancelContractInvoiceRow,
  type CancelContractPreview,
  type ConductCancelContractResult,
} from '@/api/contracts'
import { uploadRefundOrderAttachmentsApi } from '@/api/refund-orders'
import MultiAttachmentField from '@/components/MultiAttachmentField.vue'
import type { MultiAttachmentPending } from '@/components/MultiAttachmentField.vue'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import {
  OVERLAY_ABOVE_FEATURE_MENU_Z,
  useOverlayStackZ,
} from '@/composables/useOverlayStackZ'
import { formatMoney } from '@/utils/format'
import { contractStatusTone } from '@/constants/statusBadges'
import StatusBadge from '@/components/StatusBadge.vue'

const visible = defineModel<boolean>({ default: false })

const props = defineProps<{
  contract: ContractRecord | null
  zIndex?: number
}>()

const emit = defineEmits<{
  done: []
  openInvoice: [invoiceId: string, opts?: { zIndex?: number }]
  openReceipt: [receiptId: string, opts?: { zIndex?: number }]
  openSettlement: [settlementId: string, opts?: { zIndex?: number }]
  openRefundOrder: [refundOrderId: string, opts?: { zIndex?: number }]
}>()

const { t, te } = useI18n()
const perms = useResourcePermissions('contracts')
const { raiseFloor } = useOverlayStackZ()

/** 本弹窗实际叠层（抬高更多菜单时用 props.zIndex；否则也保底盖过默认 EP overlay） */
const dialogZ = computed(
  () => Math.max(Number(props.zIndex) || 0, OVERLAY_ABOVE_FEATURE_MENU_Z) + 40,
)

/** 弹窗可能抬到更多菜单之上（~4600）；tooltip / 日期浮层默认 z-index 会落在弹窗下 */
const tipPopperStyle = computed(() => ({
  zIndex: Math.max(dialogZ.value + 40, 3200),
}))
const fieldPopperStyle = computed(() => ({
  zIndex: dialogZ.value + 20,
}))

/** 保持取消弹窗打开，仅抬高叠层后开关联抽屉 */
function openRelated(kind: 'invoice' | 'receipt', id: string) {
  const z = dialogZ.value
  raiseFloor(z)
  if (kind === 'invoice') emit('openInvoice', id, { zIndex: z })
  else emit('openReceipt', id, { zIndex: z })
}

const loading = ref(false)
const submitting = ref(false)
const preview = ref<CancelContractPreview | null>(null)
const refundPendingAttachments = ref<MultiAttachmentPending[]>([])

const form = reactive({
  cancelDate: '' as string,
  refundDate: '' as string,
  remark: '',
})

/**
 * 按发票已收结算：需退基数=已收（另收+定金抵扣），扣除上限=已收合计。
 * 立刻退额由全局 FIFO 分摊。
 */
type InvoiceSettleRow = {
  invoiceId: string
  invoiceCode: string
  invoiceType: string
  /** 已收合计／扣除与需退共用上限 */
  dueMax: number
  /** 另收（展示用） */
  cashMax: number
  deductAmount: number
}

type RefundPoolItem = {
  key: string
  kind: 'invoice' | 'deposit'
  invoiceId?: string
  label: string
  due: number
}

const invoiceSettles = ref<InvoiceSettleRow[]>([])
const depositDeductAmount = ref(0)
/** 全局：此刻退 / 稍后退 */
const refundTiming = ref<'now' | 'later'>('now')
/** 此刻退总额（FIFO 分摊到各需退行） */
const refundNowAmount = ref(0)

function money(n: number) {
  return formatMoney(n)
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

/** 行内需退（与是否立刻退无关）= 已收 − 扣除 */
function invoiceDueOf(row: InvoiceSettleRow) {
  return round2(Math.max(0, row.dueMax - round2(Math.max(0, Number(row.deductAmount) || 0))))
}
function depositDueOf() {
  return round2(
    Math.max(0, depositBalance.value - round2(Math.max(0, Number(depositDeductAmount.value) || 0))),
  )
}

function cashMaxOf(inv: CancelContractInvoiceRow) {
  return round2(inv.cashReceivedAmount ?? 0)
}
function depAppliedOf(inv: CancelContractInvoiceRow) {
  return round2(inv.depositAppliedAmount ?? 0)
}
/** 需退基数＝另收＋定金抵扣（抵扣已从定金余额划到发票，必须算进发票需退） */
function dueMaxOf(inv: CancelContractInvoiceRow) {
  return round2(cashMaxOf(inv) + depAppliedOf(inv))
}

function todayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function statusLabel(status: string) {
  const key = `contract.status.${status}`
  return te(key) ? t(key) : status
}

function messageBoxOpts(extra: Record<string, unknown> = {}) {
  return {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    draggable: true,
    ...extra,
  }
}

async function alertBox(message: string, type: 'success' | 'warning' | 'error' | 'info' = 'warning') {
  try {
    await ElMessageBox.alert(message, t('contract.cancelTitle'), messageBoxOpts({ type }))
  } catch {
    /* dismiss */
  }
}

const depositPrincipal = computed(() => preview.value?.bookingDeposit.principal ?? 0)
const depositApplied = computed(() => preview.value?.bookingDeposit.applied ?? 0)
const depositBalance = computed(() => preview.value?.bookingDeposit.balance ?? 0)
const cashReceivedTotal = computed(() => preview.value?.cashReceivedTotal ?? 0)
const hasBookingBalance = computed(() => depositBalance.value > 0.009)
const hasInvoiceRows = computed(
  () => (preview.value?.unpaidInvoices.length ?? 0) + (preview.value?.paidInvoices.length ?? 0) > 0,
)
const invoiceSettleById = computed(() => {
  const map = new Map<string, InvoiceSettleRow>()
  for (const row of invoiceSettles.value) map.set(row.invoiceId, row)
  return map
})

/** 需退池：发票列表顺序 + 定金（与收款 FIFO 同构） */
const refundPool = computed((): RefundPoolItem[] => {
  const items: RefundPoolItem[] = []
  for (const row of invoiceSettles.value) {
    const due = invoiceDueOf(row)
    if (due <= 0.009) continue
    items.push({
      key: `inv:${row.invoiceId}`,
      kind: 'invoice',
      invoiceId: row.invoiceId,
      label: row.invoiceCode || row.invoiceId,
      due,
    })
  }
  if (hasBookingBalance.value) {
    const due = depositDueOf()
    if (due > 0.009) {
      items.push({
        key: 'deposit',
        kind: 'deposit',
        label:
          preview.value?.bookingDeposit.receiptCode ||
          t('contract.cancelDepositReceipt'),
        due,
      })
    }
  }
  return items
})

const summaryRefundDue = computed(() =>
  round2(refundPool.value.reduce((sum, r) => sum + r.due, 0)),
)

const maxRefundNow = computed(() => summaryRefundDue.value)

const refundNowClamped = computed(() => {
  if (refundTiming.value !== 'now') return 0
  const n = round2(Math.max(0, Number(refundNowAmount.value) || 0))
  return Math.min(n, maxRefundNow.value)
})

/** FIFO 分摊预览：本次立刻退 → 各需退行 */
const refundAllocPreview = computed(() => {
  let left = refundNowClamped.value
  return refundPool.value.map((item) => {
    const refundPart = round2(Math.min(item.due, left))
    left = round2(Math.max(0, left - refundPart))
    return {
      ...item,
      refundPart,
      remainAfter: round2(Math.max(0, item.due - refundPart)),
    }
  })
})

const refundAllocByKey = computed(() => {
  const map = new Map<string, number>()
  for (const row of refundAllocPreview.value) map.set(row.key, row.refundPart)
  return map
})

function invoiceRefundAllocated(invoiceId: string) {
  return refundAllocByKey.value.get(`inv:${invoiceId}`) ?? 0
}
function depositRefundAllocated() {
  return refundAllocByKey.value.get('deposit') ?? 0
}

const outcomeCashDeduct = computed(() =>
  round2(invoiceSettles.value.reduce((sum, r) => sum + (Number(r.deductAmount) || 0), 0)),
)
const outcomeBdForfeit = computed(() =>
  hasBookingBalance.value ? round2(Math.max(0, Number(depositDeductAmount.value) || 0)) : 0,
)
const hasImmediateRefund = computed(
  () => refundTiming.value === 'now' && refundNowClamped.value > 0.009,
)
const showRefundSection = computed(() => summaryRefundDue.value > 0.009)

/** 主信息线：共收款 / 扣除 / 共需退 */
const summaryDepositCollected = computed(() => round2(depositPrincipal.value))
const summaryInvoiceCash = computed(() => round2(cashReceivedTotal.value))
/** 共收款 = 各发票另收 + 定金收款本金（不扣定金抵扣，避免与「另收」混淆） */
const summaryCollectedTotal = computed(() =>
  round2(summaryDepositCollected.value + summaryInvoiceCash.value),
)
const summaryDeduct = computed(() => round2(outcomeCashDeduct.value + outcomeBdForfeit.value))
const hasMoneySummary = computed(
  () =>
    summaryCollectedTotal.value > 0.009 ||
    summaryDeduct.value > 0.009 ||
    summaryRefundDue.value > 0.009 ||
    hasBookingBalance.value ||
    invoiceSettles.value.length > 0,
)

function syncRefundNowAmount(fillMax = false) {
  const max = maxRefundNow.value
  if (fillMax) {
    refundNowAmount.value = max
    return
  }
  if (refundTiming.value === 'now' && refundNowAmount.value > max + 0.009) {
    refundNowAmount.value = max
  }
}

function onInvoiceDeductChange(row: InvoiceSettleRow) {
  let deduct = round2(Math.max(0, Number(row.deductAmount) || 0))
  // 扣除可覆盖另收＋定金抵扣（先另收后抵扣，由后端拆分）
  if (deduct > row.dueMax) deduct = row.dueMax
  row.deductAmount = deduct
  syncRefundNowAmount()
}
function onDepositDeductChange() {
  let deduct = round2(Math.max(0, Number(depositDeductAmount.value) || 0))
  if (deduct > depositBalance.value) deduct = depositBalance.value
  depositDeductAmount.value = deduct
  syncRefundNowAmount()
}
function setRefundTiming(mode: 'now' | 'later') {
  refundTiming.value = mode
  if (mode === 'now') syncRefundNowAmount(true)
  else refundNowAmount.value = 0
}

function resetRefundAttachments() {
  refundPendingAttachments.value = []
}

function onAddRefundAttachments(files: File[]) {
  for (const file of files) {
    refundPendingAttachments.value.push({
      key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`,
      file,
    })
  }
}

function removeRefundPendingAttachment(key: string) {
  refundPendingAttachments.value = refundPendingAttachments.value.filter((p) => p.key !== key)
}

function resetForm(p: CancelContractPreview) {
  form.cancelDate = p.suggestedCancelDate || todayYmd()
  form.refundDate = form.cancelDate || todayYmd()
  form.remark = ''
  invoiceSettles.value = p.paidInvoices
    .filter((inv) => dueMaxOf(inv) > 0.009)
    .map((inv) => ({
      invoiceId: inv.id,
      invoiceCode: inv.invoiceCode || inv.id,
      invoiceType: inv.invoiceType || '',
      dueMax: dueMaxOf(inv),
      cashMax: cashMaxOf(inv),
      deductAmount: 0,
    }))
  depositDeductAmount.value = 0
  refundTiming.value = 'now'
  // 下一 tick 用 computed 池填满；此处先按预览粗算
  const invDue = round2(
    invoiceSettles.value.reduce((sum, r) => sum + invoiceDueOf(r), 0),
  )
  const bdDue =
    p.bookingDeposit.balance > 0.009
      ? round2(Math.max(0, p.bookingDeposit.balance - 0))
      : 0
  refundNowAmount.value = round2(invDue + bdDue)
  resetRefundAttachments()
}

watch(
  () => form.cancelDate,
  (d) => {
    if (d && !form.refundDate) form.refundDate = d
  },
)

async function loadPreview() {
  if (!props.contract?.id) return
  loading.value = true
  preview.value = null
  try {
    const { data } = await fetchCancelContractPreviewApi(props.contract.id)
    preview.value = data
    resetForm(data)
    if (!data.contract.cancellable) {
      await alertBox(
        t('contract.cancelStatusNotAllowed', { status: statusLabel(data.contract.status) }),
      )
    }
  } catch {
    await alertBox(t('contract.cancelLoadFailed'), 'error')
    visible.value = false
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, dialogZ.value] as const,
  ([open, z]) => {
    if (open) {
      raiseFloor(z)
      void loadPreview()
    }
  },
)

async function onSubmit() {
  if (!props.contract?.id || !preview.value) return
  if (!perms.update) {
    await alertBox(t('contract.cancelNoPerm'))
    return
  }
  if (!preview.value.contract.cancellable) {
    await alertBox(
      t('contract.cancelStatusNotAllowed', { status: statusLabel(preview.value.contract.status) }),
    )
    return
  }
  if (!form.cancelDate) {
    await alertBox(t('contract.cancelNeedDate'))
    return
  }
  if (hasImmediateRefund.value && !form.refundDate) {
    await alertBox(t('contract.cancelNeedRefundDate'))
    return
  }
  for (const row of invoiceSettles.value) {
    const deduct = round2(Number(row.deductAmount) || 0)
    const due = invoiceDueOf(row)
    const refund = invoiceRefundAllocated(row.invoiceId)
    if (deduct < 0 || deduct > row.dueMax + 0.009) {
      await alertBox(
        t('contract.cancelInvoiceSettleInvalid', {
          code: row.invoiceCode,
          max: money(row.dueMax),
        }),
      )
      return
    }
    if (refund < 0 || refund > due + 0.009 || refund + deduct > row.dueMax + 0.009) {
      await alertBox(
        t('contract.cancelInvoiceSettleInvalid', {
          code: row.invoiceCode,
          max: money(row.dueMax),
        }),
      )
      return
    }
  }
  if (hasBookingBalance.value) {
    const deduct = round2(Number(depositDeductAmount.value) || 0)
    const refund = depositRefundAllocated()
    if (deduct < 0 || deduct > depositBalance.value + 0.009) {
      await alertBox(t('contract.cancelForfeitInvalid', { max: money(depositBalance.value) }))
      return
    }
    if (refund + deduct > depositBalance.value + 0.009) {
      await alertBox(t('contract.cancelForfeitInvalid', { max: money(depositBalance.value) }))
      return
    }
  }
  if (refundTiming.value === 'now' && refundNowClamped.value > maxRefundNow.value + 0.009) {
    await alertBox(t('contract.cancelRefundNowInvalid', { max: money(maxRefundNow.value) }))
    return
  }

  submitting.value = true
  try {
    const { data: result } = await conductCancelContractApi(
      props.contract.id,
      {
        cancelDate: form.cancelDate,
        refundDate: hasImmediateRefund.value
          ? form.refundDate || form.cancelDate
          : undefined,
        remark: form.remark.trim() || undefined,
        invoiceSettlements: invoiceSettles.value.map((r) => ({
          invoiceId: r.invoiceId,
          refundAmount: invoiceRefundAllocated(r.invoiceId),
          deductAmount: round2(Number(r.deductAmount) || 0),
        })),
        bookingDepositRefundAmount: hasBookingBalance.value ? depositRefundAllocated() : 0,
        bookingDepositForfeitAmount: hasBookingBalance.value
          ? round2(Number(depositDeductAmount.value) || 0)
          : 0,
      },
      { silentError: true },
    )
    const pendingFiles = refundPendingAttachments.value.map((p) => p.file)
    let attachFailed = false
    if (result?.refundOrderId && pendingFiles.length) {
      try {
        await uploadRefundOrderAttachmentsApi(result.refundOrderId, pendingFiles)
      } catch {
        attachFailed = true
      }
    }
    resetRefundAttachments()
    visible.value = false
    emit('done')
    await showCancelSuccess(result, attachFailed)
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('contract.cancelFailed')
    await alertBox(msg, 'error')
  } finally {
    submitting.value = false
  }
}

async function showCancelSuccess(
  result: ConductCancelContractResult | undefined,
  attachFailed: boolean,
) {
  const settlementCode = result?.settlementCode?.trim() || ''
  const refundOrderCode = result?.refundOrderCode?.trim() || ''
  const settlementId = result?.settlementId?.trim() || ''
  const refundOrderId = result?.refundOrderId?.trim() || ''

  const lines = [t('contract.cancelDone')]
  if (settlementCode) lines.push(`${t('contract.cancelDoneSettlement')}: ${settlementCode}`)
  if (refundOrderCode) lines.push(`${t('contract.cancelDoneRefundOrder')}: ${refundOrderCode}`)
  if (attachFailed) lines.push(t('refundOrder.attachmentsUploadFailed'))
  const message = lines.join('\n')
  const boxType = attachFailed ? 'warning' : 'success'

  if (settlementId) {
    try {
      await ElMessageBox.confirm(message, t('contract.cancelTitle'), {
        ...messageBoxOpts({
          type: boxType,
          confirmButtonText: t('contract.cancelViewSettlement'),
          cancelButtonText: t('common.close'),
          distinguishCancelAndClose: true,
        }),
      })
      const z = dialogZ.value
      raiseFloor(z)
      emit('openSettlement', settlementId, { zIndex: z })
    } catch {
      /* close / dismiss */
    }
    return
  }

  if (refundOrderId) {
    try {
      await ElMessageBox.confirm(message, t('contract.cancelTitle'), {
        ...messageBoxOpts({
          type: boxType,
          confirmButtonText: t('contract.cancelViewRefundOrder'),
          cancelButtonText: t('common.close'),
          distinguishCancelAndClose: true,
        }),
      })
      const z = dialogZ.value
      raiseFloor(z)
      emit('openRefundOrder', refundOrderId, { zIndex: z })
    } catch {
      /* close / dismiss */
    }
    return
  }

  await alertBox(message, boxType)
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="t('contract.cancelTitle')"
    width="800px"
    class="lb-dialog cancel-dlg-dialog"
    destroy-on-close
    append-to-body
    :z-index="dialogZ"
  >
    <div v-loading="loading" class="cancel-dlg">
      <template v-if="preview">
        <header class="cancel-dlg__hero">
          <div class="cancel-dlg__hero-code">
            <strong>{{ preview.contract.contractCode }}</strong>
            <StatusBadge
              :tone="contractStatusTone(preview.contract.status)"
              :label="statusLabel(preview.contract.status)"
            />
          </div>
          <div class="cancel-dlg__hero-meta">
            <span>
              <em>{{ t('contract.fields.customerName') }}</em>
              {{ preview.contract.customerName || '—' }}
            </span>
            <span>
              <em>{{ t('contract.fields.roomCode') }}</em>
              {{ preview.contract.roomCode || '—' }}
            </span>
          </div>
        </header>

        <section class="cancel-dlg__section">
          <div class="cancel-dlg__section-head">
            <span class="cancel-dlg__step">1</span>
            <h4>{{ t('contract.cancelSectionBasic') }}</h4>
          </div>
          <el-form label-position="top" class="cancel-dlg__form">
            <el-form-item :label="t('contract.cancelDate')" required>
              <el-date-picker
                v-model="form.cancelDate"
                type="date"
                value-format="YYYY-MM-DD"
                :popper-style="fieldPopperStyle"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('contract.fields.remark')">
              <el-input
                v-model="form.remark"
                type="textarea"
                :rows="2"
                maxlength="500"
                show-word-limit
              />
            </el-form-item>
          </el-form>
        </section>

        <section class="cancel-dlg__section">
          <div class="cancel-dlg__section-head">
            <span class="cancel-dlg__step">2</span>
            <h4 class="cancel-dlg__section-title-with-tip">
              {{ t('contract.cancelSectionMoney') }}
              <el-tooltip
                :content="t('contract.cancelMoneyHint')"
                placement="top"
                :popper-style="tipPopperStyle"
              >
                <el-icon class="cancel-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
              </el-tooltip>
            </h4>
          </div>

          <div v-if="hasInvoiceRows" class="cancel-dlg__unset-wrap">
            <span class="cancel-dlg__unset-label">{{ t('contract.cancelInvoiceList') }}</span>
            <ul class="cancel-dlg__unset">
              <li
                v-for="inv in [...preview.unpaidInvoices, ...preview.paidInvoices]"
                :key="inv.id"
                class="cancel-dlg__card"
              >
                <div class="cancel-dlg__card-row">
                  <div class="cancel-dlg__unset-main">
                    <button
                      type="button"
                      class="cancel-dlg__unset-code cancel-dlg__unset-code--link"
                      @click="openRelated('invoice', inv.id)"
                    >
                      {{ inv.invoiceCode || inv.id }}
                    </button>
                    <span v-if="inv.invoiceType" class="cancel-dlg__unset-type">{{ inv.invoiceType }}</span>
                  </div>
                  <div class="cancel-dlg__unset-amts">
                    <div class="cancel-dlg__unset-amt">
                      <span class="cancel-dlg__unset-amt-label">{{ t('contract.cancelAmtInvoiced') }}</span>
                      <span class="cancel-dlg__unset-amt-val">{{ money(inv.totalAmount) }}</span>
                    </div>
                    <template v-if="inv.paid && depAppliedOf(inv) > 0.009">
                      <div class="cancel-dlg__unset-amt">
                        <span class="cancel-dlg__unset-amt-label">{{ t('contract.cancelAmtCash') }}</span>
                        <span class="cancel-dlg__unset-amt-val">{{ money(cashMaxOf(inv)) }}</span>
                      </div>
                      <div class="cancel-dlg__unset-amt">
                        <span class="cancel-dlg__unset-amt-label">{{
                          t('contract.cancelAmtDepositApplied')
                        }}</span>
                        <span class="cancel-dlg__unset-amt-val">{{ money(depAppliedOf(inv)) }}</span>
                      </div>
                    </template>
                    <template v-else-if="inv.paid">
                      <div class="cancel-dlg__unset-amt">
                        <span class="cancel-dlg__unset-amt-label">{{ t('contract.cancelAmtReceived') }}</span>
                        <span class="cancel-dlg__unset-amt-val">{{ money(dueMaxOf(inv)) }}</span>
                      </div>
                    </template>
                    <div v-else class="cancel-dlg__unset-amt">
                      <span class="cancel-dlg__unset-amt-label">{{ t('contract.cancelAmtOpen') }}</span>
                      <strong class="cancel-dlg__unset-amt-val is-open">{{ money(inv.openAmount) }}</strong>
                    </div>
                    <template v-if="invoiceSettleById.get(inv.id)">
                      <div class="cancel-dlg__unset-amt cancel-dlg__unset-amt--edit">
                        <span class="cancel-dlg__unset-amt-label">{{ t('contract.cancelAmtDeductEdit') }}</span>
                        <el-input-number
                          v-model="invoiceSettleById.get(inv.id)!.deductAmount"
                          :min="0"
                          :max="invoiceSettleById.get(inv.id)!.dueMax"
                          :step="100"
                          :precision="2"
                          controls-position="right"
                          size="small"
                          class="cancel-dlg__amt-input"
                          @change="onInvoiceDeductChange(invoiceSettleById.get(inv.id)!)"
                        />
                      </div>
                      <div class="cancel-dlg__unset-amt">
                        <span class="cancel-dlg__unset-amt-label">{{ t('contract.cancelAmtRefundEdit') }}</span>
                        <strong class="cancel-dlg__unset-amt-val cancel-dlg__unset-recv">{{
                          money(invoiceDueOf(invoiceSettleById.get(inv.id)!))
                        }}</strong>
                      </div>
                    </template>
                  </div>
                </div>
              </li>
            </ul>
          </div>
          <p v-else class="cancel-dlg__empty">{{ t('contract.cancelNoInvoices') }}</p>

          <div
            v-if="
              preview.bookingDeposit.receiptId ||
              summaryDepositCollected > 0.009 ||
              depositApplied > 0.009 ||
              depositBalance > 0.009
            "
            class="cancel-dlg__unset-wrap"
          >
            <span class="cancel-dlg__unset-label">{{ t('contract.cancelDepositList') }}</span>
            <ul class="cancel-dlg__unset">
              <li class="cancel-dlg__card">
                <div class="cancel-dlg__card-row">
                  <div class="cancel-dlg__unset-main">
                    <button
                      v-if="preview.bookingDeposit.receiptId"
                      type="button"
                      class="cancel-dlg__unset-code cancel-dlg__unset-code--link"
                      @click="openRelated('receipt', preview.bookingDeposit.receiptId!)"
                    >
                      {{ preview.bookingDeposit.receiptCode || preview.bookingDeposit.receiptId }}
                    </button>
                    <span v-else class="cancel-dlg__unset-type">{{ t('contract.cancelDepositReceipt') }}</span>
                  </div>
                  <div class="cancel-dlg__unset-amts">
                    <div class="cancel-dlg__unset-amt">
                      <span class="cancel-dlg__unset-amt-label">{{ t('contract.cancelDepositAmtCollected') }}</span>
                      <span class="cancel-dlg__unset-amt-val">{{ money(summaryDepositCollected) }}</span>
                    </div>
                    <div class="cancel-dlg__unset-amt">
                      <span class="cancel-dlg__unset-amt-label">{{ t('contract.cancelDepositAmtApplied') }}</span>
                      <span class="cancel-dlg__unset-amt-val">{{ money(depositApplied) }}</span>
                    </div>
                    <div class="cancel-dlg__unset-amt">
                      <span class="cancel-dlg__unset-amt-label">{{ t('contract.cancelDepositAmtBalance') }}</span>
                      <span class="cancel-dlg__unset-amt-val">{{ money(depositBalance) }}</span>
                    </div>
                    <template v-if="hasBookingBalance">
                      <div class="cancel-dlg__unset-amt cancel-dlg__unset-amt--edit">
                        <span class="cancel-dlg__unset-amt-label">{{ t('contract.cancelAmtDeductEdit') }}</span>
                        <el-input-number
                          v-model="depositDeductAmount"
                          :min="0"
                          :max="depositBalance"
                          :step="100"
                          :precision="2"
                          controls-position="right"
                          size="small"
                          class="cancel-dlg__amt-input"
                          @change="onDepositDeductChange"
                        />
                      </div>
                      <div class="cancel-dlg__unset-amt">
                        <span class="cancel-dlg__unset-amt-label">{{ t('contract.cancelAmtRefundEdit') }}</span>
                        <strong class="cancel-dlg__unset-amt-val cancel-dlg__unset-recv">{{
                          money(depositDueOf())
                        }}</strong>
                      </div>
                    </template>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <div v-if="hasMoneySummary" class="cancel-dlg__tiles cancel-dlg__tiles--summary">
            <div class="cancel-dlg__tile">
              <span>{{ t('contract.cancelSummaryCollected') }}</span>
              <strong>{{ money(summaryCollectedTotal) }}</strong>
            </div>
            <div
              class="cancel-dlg__tile"
              :class="{ 'cancel-dlg__tile--warn': summaryDeduct > 0.009 }"
            >
              <span>{{ t('contract.cancelSummaryDeduct') }}</span>
              <strong>{{ money(summaryDeduct) }}</strong>
            </div>
            <div class="cancel-dlg__tile cancel-dlg__tile--accent">
              <span>{{ t('contract.cancelSummaryRefundDue') }}</span>
              <strong>{{ money(summaryRefundDue) }}</strong>
            </div>
          </div>
          <p v-else class="cancel-dlg__empty">{{ t('contract.cancelOutcomeNone') }}</p>
        </section>

        <section v-if="showRefundSection" class="cancel-dlg__section">
          <div class="cancel-dlg__section-head">
            <span class="cancel-dlg__step">3</span>
            <h4 class="cancel-dlg__section-title-with-tip">
              {{ t('contract.cancelSectionRefundTiming') }}
              <el-tooltip
                :content="t('contract.cancelRefundTimingHint')"
                placement="top"
                :popper-style="tipPopperStyle"
              >
                <el-icon class="cancel-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
              </el-tooltip>
            </h4>
          </div>
          <div class="cancel-dlg__timing">
            <div class="cancel-dlg__seg cancel-dlg__seg--lg" role="group">
              <button
                type="button"
                class="cancel-dlg__seg-btn"
                :class="{ 'is-active': refundTiming === 'now' }"
                @click="setRefundTiming('now')"
              >
                {{ t('contract.cancelQuickRefundNow') }}
              </button>
              <button
                type="button"
                class="cancel-dlg__seg-btn"
                :class="{ 'is-active': refundTiming === 'later' }"
                @click="setRefundTiming('later')"
              >
                {{ t('contract.cancelQuickDefer') }}
              </button>
            </div>
          </div>
          <el-form v-if="refundTiming === 'now'" label-position="top" class="cancel-dlg__form">
            <div class="cancel-dlg__form-row">
              <el-form-item required>
                <template #label>
                  <span class="cancel-dlg__label-with-tip">
                    {{ t('contract.cancelRefundNowAmount') }}
                    <el-tooltip
                      :content="
                        t('contract.cancelRefundNowAmountHint', { max: money(maxRefundNow) })
                      "
                      placement="top"
                      :popper-style="tipPopperStyle"
                    >
                      <el-icon class="cancel-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </span>
                </template>
                <el-input-number
                  v-model="refundNowAmount"
                  :min="0"
                  :max="maxRefundNow"
                  :step="100"
                  :precision="2"
                  controls-position="right"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item :label="t('depositRefund.fields.refundDate')" required>
                <el-date-picker
                  v-model="form.refundDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  placement="top-start"
                  :popper-style="fieldPopperStyle"
                  style="width: 100%"
                />
              </el-form-item>
            </div>
            <div v-if="refundAllocPreview.some((r) => r.refundPart > 0.009)" class="cancel-dlg__alloc">
              <div class="cancel-dlg__alloc-head">
                <span>{{ t('contract.cancelRefundAllocPreview') }}</span>
                <el-tooltip
                  :content="t('contract.cancelRefundAllocFifoHint')"
                  placement="top"
                  :fallback-placements="['top', 'left', 'right']"
                  :popper-style="tipPopperStyle"
                >
                  <el-icon class="cancel-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                </el-tooltip>
              </div>
              <ul class="cancel-dlg__alloc-list">
                <li v-for="row in refundAllocPreview" :key="row.key" class="cancel-dlg__alloc-row">
                  <span class="cancel-dlg__alloc-code">{{ row.label }}</span>
                  <span class="cancel-dlg__alloc-parts">
                    <span class="cancel-dlg__alloc-tag is-due">
                      {{ t('contract.cancelRefundAllocDue', { amount: money(row.due) }) }}
                    </span>
                    <span v-if="row.refundPart > 0.009" class="cancel-dlg__alloc-tag is-now">
                      {{ t('contract.cancelRefundAllocNow', { amount: money(row.refundPart) }) }}
                    </span>
                    <span
                      v-if="row.remainAfter <= 0.009 && row.refundPart > 0.009"
                      class="cancel-dlg__alloc-tag is-settled"
                    >
                      {{ t('contract.cancelRefundAllocSettled') }}
                    </span>
                    <span v-else-if="row.remainAfter > 0.009" class="cancel-dlg__alloc-tag is-later">
                      {{ t('contract.cancelRefundAllocLater', { amount: money(row.remainAfter) }) }}
                    </span>
                  </span>
                </li>
              </ul>
            </div>
            <el-form-item :label="t('depositRefund.fields.attachments')">
              <MultiAttachmentField
                :pending="refundPendingAttachments"
                :disabled="submitting"
                @add="onAddRefundAttachments"
                @remove-pending="removeRefundPendingAttachment"
              />
            </el-form-item>
          </el-form>
        </section>
      </template>
    </div>

    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button
        v-if="perms.update"
        v-admin-glow="perms.codes.update"
        type="danger"
        :loading="submitting"
        :disabled="loading || !preview?.contract.cancellable"
        @click="onSubmit"
      >
        {{ t('contract.cancelSubmit') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.cancel-dlg {
  min-height: 120px;
}

.cancel-dlg__hero {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 6%, #fff);
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 16%, #e4ebe6);
}

.cancel-dlg__hero-code {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.cancel-dlg__hero-code strong {
  font-size: 1.05rem;
  font-weight: 750;
  color: #1a2a22;
}

.cancel-dlg__hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  font-size: 0.88rem;
  color: #3a4a42;
}

.cancel-dlg__hero-meta em {
  font-style: normal;
  color: #6a7a70;
  margin-right: 6px;
}

.cancel-dlg__section {
  margin-bottom: 18px;
}

.cancel-dlg__section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.cancel-dlg__section-head h4 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: #1a2a22;
}

.cancel-dlg__section-title-with-tip,
.cancel-dlg__label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.cancel-dlg__label-tip {
  color: #8a9690;
  cursor: help;
  outline: none;
}

.cancel-dlg__label-tip:hover {
  color: var(--lb-brand, #0f4a32);
}

.cancel-dlg__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--lb-brand, #0f4a32);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
}

.cancel-dlg__form {
  display: grid;
  gap: 4px;
}

.cancel-dlg__form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  align-items: start;
}

.cancel-dlg__form-row > .el-form-item {
  margin-bottom: 0;
}

.cancel-dlg__choice-block {
  margin-top: 4px;
}

.cancel-dlg__choice-label {
  margin: 0 0 8px;
  font-size: 0.84rem;
  font-weight: 600;
  color: #3a4a42;
}

.cancel-dlg__choice-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cancel-dlg__choice {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: auto;
  max-width: 100%;
  margin: 0;
  padding: 6px 12px;
  border: 1px solid #e4ebe6;
  border-radius: 8px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}

.cancel-dlg__choice:hover {
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 35%, #e4ebe6);
}

.cancel-dlg__choice.is-active {
  border-color: var(--lb-brand, #0f4a32);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #fff);
}

.cancel-dlg__choice-dot {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 1.5px solid #b7c4bc;
  background: #fff;
  box-sizing: border-box;
  position: relative;
}

.cancel-dlg__choice.is-active .cancel-dlg__choice-dot {
  border-color: var(--lb-brand, #0f4a32);
  background: var(--lb-brand, #0f4a32);
}

.cancel-dlg__choice.is-active .cancel-dlg__choice-dot::after {
  content: '';
  position: absolute;
  inset: 3px;
  border-radius: 999px;
  background: #fff;
}

.cancel-dlg__choice-text {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 6px;
  min-width: 0;
}

.cancel-dlg__choice-text strong {
  font-size: 0.84rem;
  font-weight: 650;
  color: #1a2a22;
  line-height: 1.3;
}

.cancel-dlg__choice.is-active .cancel-dlg__choice-text strong {
  color: var(--lb-brand, #0f4a32);
}

.cancel-dlg__choice-text em {
  font-style: normal;
  font-size: 0.75rem;
  color: #6a7a70;
  line-height: 1.3;
}

.cancel-dlg__forfeit {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px dashed color-mix(in srgb, var(--lb-brand, #0f4a32) 28%, #e4ebe6);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 4%, #fff);
}

.cancel-dlg__forfeit-label {
  display: block;
  margin-bottom: 8px;
  font-size: 0.84rem;
  font-weight: 600;
  color: #3a4a42;
}

.cancel-dlg__field-hint {
  margin: 6px 0 0;
  font-size: 0.82rem;
  color: #6a7a70;
  line-height: 1.45;
}

.cancel-dlg__empty {
  margin: 0;
  font-size: 0.88rem;
  color: #8a9690;
}

.cancel-dlg__tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-bottom: 10px;
}

.cancel-dlg__tiles--2 {
  grid-template-columns: repeat(2, minmax(140px, 1fr));
}

.cancel-dlg__tiles--summary {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin-top: 14px;
}

.cancel-dlg__unset-wrap {
  margin-top: 12px;
}

.cancel-dlg__unset-wrap + .cancel-dlg__unset-wrap {
  margin-top: 16px;
}

.cancel-dlg__unset-label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #6a7a70;
}

.cancel-dlg__unset {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: min(360px, 42vh);
  overflow: auto;
}

.cancel-dlg__card {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 12px 14px;
  border-radius: 10px;
  background: #f8faf8;
  border: 1px solid #e4ebe6;
  box-shadow: 0 1px 0 color-mix(in srgb, #0f4a32 4%, transparent);
}

.cancel-dlg__card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
  flex-wrap: wrap;
}

.cancel-dlg__unset-main {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}

.cancel-dlg__unset-code {
  font-size: 14px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: #3a2f22;
  line-height: 1.35;
}

.cancel-dlg__unset-code--link {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  color: var(--lb-brand, #0f4a32);
  text-align: left;
}

.cancel-dlg__unset-code--link:hover {
  text-decoration: underline;
}

.cancel-dlg__unset-type {
  font-size: 12px;
  font-weight: 550;
  color: #8a9a92;
}

.cancel-dlg__seg {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border-radius: 8px;
  background: #f1f4f2;
  border: 1px solid #e4ebe6;
}

.cancel-dlg__seg--lg .cancel-dlg__seg-btn {
  padding: 6px 14px;
  font-size: 13px;
}

.cancel-dlg__seg-btn {
  margin: 0;
  padding: 4px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: #5a6a62;
  cursor: pointer;
  line-height: 1.3;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.cancel-dlg__seg-btn:hover {
  color: var(--lb-brand, #0f4a32);
}

.cancel-dlg__seg-btn.is-active {
  background: #fff;
  color: var(--lb-brand, #0f4a32);
  box-shadow: 0 1px 2px color-mix(in srgb, #0f4a32 12%, transparent);
}

.cancel-dlg__timing {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
}

.cancel-dlg__alloc {
  margin: 6px 0 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f4f7f5;
  border: 1px solid #e4ebe6;
}

.cancel-dlg__alloc-head {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 8px;
  font-size: 0.86rem;
  font-weight: 700;
  color: #2f3f36;
}

.cancel-dlg__alloc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cancel-dlg__alloc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e0e8e3;
}

.cancel-dlg__alloc-code {
  min-width: 0;
  font-size: 0.84rem;
  font-weight: 650;
  color: #3a4a42;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cancel-dlg__alloc-parts {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.cancel-dlg__alloc-tag {
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 2px 7px;
  border-radius: 999px;
}

.cancel-dlg__alloc-tag.is-due {
  color: #5a3d12;
  background: #f3e6d0;
}

.cancel-dlg__alloc-tag.is-now {
  color: #0f4a32;
  background: #ddeee4;
}

.cancel-dlg__alloc-tag.is-settled {
  color: #0f4a32;
  background: #d8f0e4;
}

.cancel-dlg__alloc-tag.is-later {
  color: #8a2f2f;
  background: #f6e0e0;
}

.cancel-dlg__unset-amts {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px 16px;
  flex: 0 1 auto;
  min-width: 0;
  margin-left: auto;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: #5a6a62;
}

.cancel-dlg__unset-amt {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 0;
  white-space: nowrap;
}

.cancel-dlg__unset-amt--edit {
  min-width: 108px;
}

.cancel-dlg__unset-amt-label {
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.2;
  color: #8a9a92;
}

.cancel-dlg__unset-amt-val {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.3;
  color: #1a2a22;
}

.cancel-dlg__unset-recv {
  color: #0d3a28;
  font-weight: 750;
}

.cancel-dlg__unset-amt-val.cancel-dlg__unset-recv {
  font-weight: 750;
}

.cancel-dlg__unset-amts strong.is-open {
  color: #a15c00;
  font-weight: 750;
}

.cancel-dlg__amt-input {
  width: 108px;
}

.cancel-dlg__amt-input :deep(.el-input__wrapper) {
  border-radius: 8px;
  padding-left: 6px;
  padding-right: 0;
}

.cancel-dlg__amt-input :deep(.el-input__inner) {
  text-align: right;
  font-size: 14px;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  font-weight: 400;
  color: #1a2a22;
}

.cancel-dlg__tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid #e4ebe6;
  background: #f8faf8;
  min-width: 0;
}

.cancel-dlg__tile span {
  font-size: 0.78rem;
  font-weight: 550;
  color: #6a7a70;
}

.cancel-dlg__tile strong {
  font-size: 1.05rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  color: #1a2a22;
  line-height: 1.25;
}

.cancel-dlg__tile--accent {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #fff);
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 22%, #e4ebe6);
}

.cancel-dlg__tile--accent strong {
  color: var(--lb-brand, #0f4a32);
}

.cancel-dlg__tile--warn {
  background: #fdf6e8;
  border-color: #f0d9a8;
}

.cancel-dlg__tile--warn strong {
  color: #a15c00;
}

.cancel-dlg__list-code {
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: #1a2a22;
  text-align: left;
}

.cancel-dlg__list-code--link {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--lb-brand, #0f4a32);
  cursor: pointer;
  text-decoration: none;
}

.cancel-dlg__list-code--link:hover {
  text-decoration: underline;
}

@media (max-width: 720px) {
  .cancel-dlg__tiles {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .cancel-dlg__tiles--2,
  .cancel-dlg__tiles--summary {
    grid-template-columns: 1fr;
  }

  .cancel-dlg__form-row {
    grid-template-columns: 1fr;
  }

  .cancel-dlg__card-row {
    align-items: flex-start;
  }

  .cancel-dlg__unset-amts {
    margin-left: 0;
    justify-content: flex-start;
    width: 100%;
  }

  .cancel-dlg__unset-amt {
    align-items: flex-start;
  }
}
</style>

<style>
.cancel-dlg-dialog.el-dialog {
  max-width: calc(100vw - 32px);
}

@media (max-height: 900px) {
  .cancel-dlg-dialog.el-dialog {
    margin-top: 3vh !important;
  }
}
</style>
