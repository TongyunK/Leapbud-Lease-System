<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import type { ContractRecord } from '@/types/contract'
import type {
  ContractSettlementItemRecord,
  ContractSettlementRecord,
} from '@/types/contract-settlement'
import type { ReceivableRecord } from '@/types/receivable'
import type { RefundOrderRecord } from '@/types/refund-order'
import {
  fetchContractSettlement,
  fetchContractSettlements,
} from '@/api/contract-settlements'
import { fetchReceivables } from '@/api/receivables'
import { fetchRefundOrders } from '@/api/refund-orders'
import { formatMoney } from '@/utils/format'
import AttachmentField from '@/components/AttachmentField.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import {
  contractSettlementRefundStatusTone,
  contractStatusTone,
  receivableValidityKey,
  receivableValidityTone,
  refundOrderStatusTone,
} from '@/constants/statusBadges'
import { OVERLAY_ABOVE_FEATURE_MENU_Z } from '@/composables/useOverlayStackZ'
import { useResourcePermissions } from '@/composables/useResourcePermissions'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    contract: ContractRecord | null
    /** VACATE=退租结算详情；CANCEL=取消结算详情（同款弹窗） */
    settlementType?: 'VACATE' | 'CANCEL'
    /** 盖在合约「更多」面板之上时传入更高 z-index */
    zIndex?: number
    /** 父级收款／退款完成后递增，触发本弹窗重载 */
    refreshKey?: number
  }>(),
  {
    settlementType: 'VACATE',
    zIndex: undefined,
    refreshKey: 0,
  },
)

const emit = defineEmits<{
  openReceivable: [receivableId: string]
  openRefundOrder: [refundOrderId: string]
  collectPayment: []
  refund: []
}>()

const { t, te } = useI18n()
const receiptPerms = useResourcePermissions('receipts')
const refundOrderPerms = useResourcePermissions('refundOrders')
const loading = ref(false)
const record = ref<ContractSettlementRecord | null>(null)
const receivables = ref<ReceivableRecord[]>([])
const refundOrders = ref<RefundOrderRecord[]>([])

const isCancelDetail = computed(() => props.settlementType === 'CANCEL')
const fallbackContractStatus = computed(() => (isCancelDetail.value ? '已取消' : '已退租'))
const missingDetailMessage = computed(() =>
  isCancelDetail.value ? t('contract.cancelDetailNotFound') : t('contract.vacateDetailNotFound'),
)
const dialogTitle = computed(() =>
  isCancelDetail.value ? t('contract.cancelDetailTitle') : t('contract.vacateDetailTitle'),
)
const basicSectionTitle = computed(() =>
  isCancelDetail.value ? t('contract.cancelSectionBasic') : t('contract.terminateSectionBasic'),
)
const dateFieldLabel = computed(() =>
  isCancelDetail.value ? t('contract.cancelDate') : t('contract.terminateDate'),
)

const showCollectAction = computed(
  () => !isCancelDetail.value && receiptPerms.create,
)
const showRefundAction = computed(
  () => isCancelDetail.value && refundOrderPerms.update,
)

/** 备注与终止原因相同时不重复展示 */
const showRemark = computed(() => {
  const remark = (record.value?.remark || '').trim()
  if (!remark) return false
  const reason = (record.value?.reason || '').trim()
  return remark !== reason
})

/** 问号 tooltip 须高于本弹窗（弹窗常抬到更多菜单之上） */
const tipZIndex = computed(
  () => Math.max(Number(props.zIndex) || 0, OVERLAY_ABOVE_FEATURE_MENU_Z) + 20,
)

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function money(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

function statusLabel(status?: string | null) {
  const s = (status || '').trim()
  if (!s) return '—'
  const key = `contract.status.${s}`
  return te(key) ? t(key) : s
}

function returnStatusLabel(code?: string | null) {
  const c = (code || '').trim()
  if (!c) return '—'
  const key = `depositDeduction.returnStatus.${c}`
  return te(key) ? t(key) : c
}

/** 定金抵扣行（非按金扣除；含历史误记为 PENALTY + booking_offset_excess） */
function isBookingDepositOffsetItem(it: ContractSettlementItemRecord) {
  if (it.itemType === 'BOOKING_DEPOSIT_OFFSET') return true
  return (it.remark || '').trim() === 'booking_offset_excess'
}

function isDepositDeductionItem(it: ContractSettlementItemRecord) {
  if (isBookingDepositOffsetItem(it)) return false
  return it.itemType === 'DAMAGE_DEDUCTION' || it.itemType === 'PENALTY_DEDUCTION'
}

const loanItems = computed(() =>
  (record.value?.items || []).filter(
    (it) => Boolean(it.sourceLoanItemId) && isDepositDeductionItem(it),
  ),
)

const extraDeductionItems = computed(() =>
  (record.value?.items || []).filter(
    (it) => !it.sourceLoanItemId && isDepositDeductionItem(it),
  ),
)

/** 全部按金扣除明细（借出损坏／未还 + 其他扣除 + 钥匙未还；不含定金抵扣） */
const allDeductionItems = computed(() =>
  (record.value?.items || []).filter((it) => isDepositDeductionItem(it)),
)

const deductionItemsSum = computed(() =>
  round2(allDeductionItems.value.reduce((s, it) => s + (Number(it.amount) || 0), 0)),
)

const bookingOffsetAmount = computed(() =>
  round2(
    (record.value?.items || [])
      .filter((it) => isBookingDepositOffsetItem(it))
      .reduce((s, it) => s + (Number(it.amount) || 0), 0),
  ),
)

/** 展示用按金扣除合计：优先明细加总；兼容历史 deductionTotal 误含定金抵扣 */
const depositDeductionTotal = computed(() => {
  if (allDeductionItems.value.length) return deductionItemsSum.value
  const stored = Number(record.value?.deductionTotal) || 0
  return round2(Math.max(0, stored - bookingOffsetAmount.value))
})

/** 扣除超过已收按金的超额毛额 */
const excessOverDeposit = computed(() =>
  round2(Math.max(0, depositDeductionTotal.value - depositPaid.value)),
)

/** 应补／赔偿开票（超额 − 定金抵扣） */
const excessInvoiceAmount = computed(() =>
  round2(Math.max(0, excessOverDeposit.value - bookingOffsetAmount.value)),
)

/**
 * 定金应退展示：退款单中的定金行 + 用于抵扣超额的定金
 * （本例抵扣 3999、未另退定金时仍显示 3999）
 */
const bookingDepositDue = computed(() => {
  const fromOrders = round2(
    refundOrders.value.reduce((sum, o) => {
      const items = o.items || []
      const part = items
        .filter((it) => (it.itemType || '').trim() === 'booking_deposit')
        .reduce((s, it) => s + (Number(it.amount) || 0), 0)
      if (items.length) return sum + part
      return sum
    }, 0),
  )
  return round2(fromOrders + bookingOffsetAmount.value)
})

/** 按金应退：已收按金（退还计算基数） */
const roomDepositDue = computed(() => depositPaid.value)

const refundStatus = computed(
  () => record.value?.refundStatus || record.value?.status || '',
)

function isDepositInvoiceType(invoiceType?: string | null) {
  const t = (invoiceType || '').trim().toLowerCase()
  if (!t) return false
  if (t === 'deposit') return true
  if (t.includes('按金') || t.includes('deposit')) return true
  return false
}

/**
 * 已收按金：按金发票已收合计（与办理退租口径一致；含已作废票上的历史已收）
 * 退还基数是已收而非合约按金总额。
 */
const depositPaid = computed(() =>
  round2(
    receivables.value
      .filter((r) => isDepositInvoiceType(r.invoiceType))
      .reduce((s, r) => s + (Number(r.receivedAmount) || 0), 0),
  ),
)

/** 有效应收（未作废发票）用于结清判断 */
const activeReceivables = computed(() =>
  receivables.value.filter((r) => receivableValidityKey(r.invoiceStatus) !== 'invalid'),
)

const receivableInvoiceTotal = computed(() =>
  round2(activeReceivables.value.reduce((s, r) => s + (Number(r.invoiceAmount) || 0), 0)),
)

const receivableReceivedTotal = computed(() =>
  round2(activeReceivables.value.reduce((s, r) => s + (Number(r.receivedAmount) || 0), 0)),
)

const receivableOpenTotal = computed(() =>
  round2(activeReceivables.value.reduce((s, r) => s + (Number(r.receivableAmount) || 0), 0)),
)

const receivableSettled = computed(() => receivableOpenTotal.value <= 0.009)

/** 取消详情：发票口径（含已作废）— 开票／已收／需退／未退 */
const cancelInvoiceTotal = computed(() =>
  round2(receivables.value.reduce((s, r) => s + (Number(r.invoiceAmount) || 0), 0)),
)
const cancelReceivedTotal = computed(() =>
  round2(receivables.value.reduce((s, r) => s + (Number(r.receivedAmount) || 0), 0)),
)
/** 需退＝取消前已收（应退回的收款） */
const cancelRefundDueTotal = computed(() => cancelReceivedTotal.value)
const cancelRefundedTotal = computed(() =>
  round2(receivables.value.reduce((s, r) => s + (Number(r.refundedAmount) || 0), 0)),
)
const cancelRefundRemainTotal = computed(() =>
  round2(Math.max(0, cancelRefundDueTotal.value - cancelRefundedTotal.value)),
)
const cancelInvoiceRefundSettled = computed(() => cancelRefundRemainTotal.value <= 0.009)

function cancelRowRefundDue(r: ReceivableRecord) {
  return round2(Number(r.receivedAmount) || 0)
}
function cancelRowRefunded(r: ReceivableRecord) {
  return round2(Number(r.refundedAmount) || 0)
}
function cancelRowRefundRemain(r: ReceivableRecord) {
  return round2(Math.max(0, cancelRowRefundDue(r) - cancelRowRefunded(r)))
}

/** 待收合计中，扣除退租应补后的其他未结（租金等） */
const otherReceivableOpen = computed(() =>
  round2(Math.max(0, receivableOpenTotal.value - excessInvoiceAmount.value)),
)

/** 「待收合計」问号：有拆分时展示其中退租应补／其他未结，否则展示口径说明 */
const openTotalTip = computed(() => {
  if (excessInvoiceAmount.value > 0.009 && otherReceivableOpen.value > 0.009) {
    return t('contract.vacateOpenBreakdown', {
      vacate: money(excessInvoiceAmount.value),
      other: money(otherReceivableOpen.value),
    })
  }
  if (excessInvoiceAmount.value > 0.009 && receivableOpenTotal.value > 0.009) {
    return t('contract.vacateOpenAllVacateCollect', {
      vacate: money(excessInvoiceAmount.value),
    })
  }
  return t('contract.vacateOpenTotalHint')
})

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function validityLabel(invoiceStatus: string | null | undefined) {
  return receivableValidityKey(invoiceStatus) === 'invalid'
    ? t('receivable.quickFilterInvalid')
    : t('receivable.quickFilterActive')
}

function isReceivableInvalid(r: ReceivableRecord) {
  return receivableValidityKey(r.invoiceStatus) === 'invalid'
}

/** 失效应收旁标注说明：有已收净额→「需退」；未交作废→「不退」 */
function receivableInvalidNote(r: ReceivableRecord): 'needRefund' | 'noRefund' | null {
  if (!isReceivableInvalid(r)) return null
  const received = Number(r.receivedAmount) || 0
  const refunded = Number(r.refundedAmount) || 0
  return received - refunded > 0.009 ? 'needRefund' : 'noRefund'
}

/** 退租超额赔付开具的发票／应收（结算明细 remark=excess_compensation，或描述含「超出按金」） */
function isExcessCompensationReceivable(r: ReceivableRecord) {
  for (const it of record.value?.items || []) {
    if ((it.remark || '').trim() !== 'excess_compensation') continue
    if (it.receivableId && it.receivableId === r.id) return true
    if (it.invoiceId && it.invoiceId === r.invoiceId) return true
  }
  const blob = `${r.invoiceDescription || ''}${r.remark || ''}`
  return /超出按金/.test(blob) || /excess.?compensat/i.test(blob)
}

async function alertMissing() {
  await ElMessageBox.alert(missingDetailMessage.value, dialogTitle.value, {
    type: 'warning',
    confirmButtonText: t('common.confirm'),
  })
}

async function load() {
  const contractId = props.contract?.id
  if (!contractId) {
    record.value = null
    receivables.value = []
    refundOrders.value = []
    return
  }
  loading.value = true
  try {
    const { data: listData } = await fetchContractSettlements({
      contractId,
      types: [props.settlementType],
      page: 1,
      pageSize: 20,
    })
    const items = listData.items ?? []
    const first = items[0]
    if (!first?.id) {
      record.value = null
      receivables.value = []
      refundOrders.value = []
      await alertMissing()
      visible.value = false
      return
    }
    const [settlementRes, recvRes, refundRes] = await Promise.all([
      fetchContractSettlement(first.id),
      fetchReceivables({
        contractId,
        validity: 'all',
        page: 1,
        pageSize: 200,
        sortBy: 'paymentDueDate',
        sortDir: 'asc',
      }),
      fetchRefundOrders({
        settlementId: first.id,
        page: 1,
        pageSize: 100,
      }),
    ])
    record.value = settlementRes.data
    receivables.value = recvRes.data.items ?? []
    refundOrders.value = (refundRes.data.items ?? []).filter(
      (o) => (o.status || '').trim() !== 'cancelled',
    )
  } catch {
    record.value = null
    receivables.value = []
    refundOrders.value = []
    await alertMissing()
    visible.value = false
  } finally {
    loading.value = false
  }
}

watch(
  () =>
    [visible.value, props.contract?.id, props.settlementType, props.refreshKey] as const,
  ([open]) => {
    if (open) void load()
    if (!open) {
      record.value = null
      receivables.value = []
      refundOrders.value = []
    }
  },
)

function loanToneClass(row: ContractSettlementItemRecord) {
  const st = (row.returnStatus || '').trim()
  if (st === 'returned' || st === '已歸還' || st === '已归还') return 'is-ok'
  if (st) return 'is-bad'
  return ''
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="900px"
    class="lb-dialog term-dlg-dialog"
    destroy-on-close
    append-to-body
    :z-index="zIndex"
  >
    <div v-loading="loading" class="term-dlg">
      <template v-if="record">
        <header class="term-dlg__hero">
          <div class="term-dlg__hero-code">
            <strong>{{ record.contractCode || contract?.contractCode || '—' }}</strong>
            <StatusBadge
              :tone="contractStatusTone(contract?.status || fallbackContractStatus)"
              :label="statusLabel(contract?.status || fallbackContractStatus)"
            />
          </div>
          <div class="term-dlg__hero-meta">
            <span>
              <em>{{ t('contractSettlement.fields.settlementCode') }}</em>
              {{ record.settlementCode }}
            </span>
            <span>
              <em>{{ t('contractSettlement.fields.roomCode') }}</em>
              {{ dash(record.roomCode || contract?.roomCode) }}
            </span>
            <span>
              <em>{{ t('contractSettlement.fields.customerName') }}</em>
              {{ dash(record.customerName || contract?.customerName) }}
            </span>
          </div>
          <div class="term-dlg__hero-meta">
            <span class="term-dlg__status-pair">
              <em>{{ t('contractSettlement.fields.refundStatus') }}</em>
              <StatusBadge
                :tone="contractSettlementRefundStatusTone(refundStatus)"
                :label="
                  t(`contractSettlement.refundStatus.${refundStatus}`, refundStatus || '—')
                "
              />
            </span>
            <span class="term-dlg__status-pair">
              <em>
                {{
                  isCancelDetail
                    ? t('contract.cancelInvoiceRefundStatus')
                    : t('contract.vacateReceivableStatus')
                }}
              </em>
              <StatusBadge
                v-if="isCancelDetail"
                :tone="cancelInvoiceRefundSettled ? 'idle' : 'signing'"
                :label="
                  cancelInvoiceRefundSettled
                    ? t('contractSettlement.refundStatus.settled')
                    : t('contractSettlement.refundStatus.pending_refund')
                "
              />
              <StatusBadge
                v-else
                :tone="receivableSettled ? 'idle' : 'signing'"
                :label="
                  receivableSettled
                    ? t('contractSettlement.collectStatus.settled')
                    : t('contractSettlement.collectStatus.pending_collect')
                "
              />
            </span>
          </div>
        </header>

        <section class="term-dlg__section">
          <div class="term-dlg__section-head">
            <span class="term-dlg__step">1</span>
            <h4>{{ basicSectionTitle }}</h4>
          </div>
          <el-form label-position="top" class="term-dlg__form">
            <div class="term-dlg__row2">
              <el-form-item :label="dateFieldLabel">
                <el-input
                  :model-value="dash(record.terminationDate || record.settlementDate)"
                  disabled
                />
              </el-form-item>
              <el-form-item
                v-if="!isCancelDetail"
                :label="t('contractSettlement.fields.reason')"
              >
                <el-input :model-value="dash(record.reason)" disabled />
              </el-form-item>
            </div>
            <div v-if="!isCancelDetail" class="term-dlg__row2 term-dlg__row2--reason">
              <el-form-item :label="t('contractSettlement.fields.noticeAttachment')">
                <AttachmentField
                  :model-value="record.noticeAttachment || ''"
                  disabled
                />
              </el-form-item>
            </div>
          </el-form>
        </section>

        <section v-if="!isCancelDetail" class="term-dlg__section">
          <div class="term-dlg__section-head">
            <span class="term-dlg__step">2</span>
            <h4>{{ t('contract.terminateSectionLoans') }}</h4>
          </div>
          <p v-if="!loanItems.length" class="term-dlg__empty">
            {{ t('contract.terminateNoLoans') }}
          </p>
          <div v-else class="term-dlg__loan-list">
            <div
              v-for="(row, idx) in loanItems"
              :key="row.id"
              class="term-dlg__loan"
              :class="loanToneClass(row)"
            >
              <div class="term-dlg__loan-top">
                <span class="term-dlg__loan-idx">{{ idx + 1 }}</span>
                <div class="term-dlg__loan-title">
                  <strong>{{ row.description || '—' }}</strong>
                  <span class="term-dlg__loan-amt">
                    <em>{{ t('common.amount') }}</em>
                    {{ money(row.amount) }}
                  </span>
                </div>
                <div class="term-dlg__loan-status">
                  <span
                    class="term-dlg__pill is-active"
                    :class="{
                      'is-ok': loanToneClass(row) === 'is-ok',
                      'is-danger': loanToneClass(row) === 'is-bad',
                    }"
                  >
                    {{ returnStatusLabel(row.returnStatus) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="term-dlg__keys-block">
            <div class="term-dlg__keys-title">{{ t('contract.terminateKeysTitle') }}</div>
            <div class="term-dlg__row2 term-dlg__keys">
              <el-form-item
                :label="t('contractSettlement.fields.doorKeyReturnedQty')"
                label-position="top"
              >
                <el-input :model-value="String(record.doorKeyReturnedQty ?? 0)" disabled />
              </el-form-item>
              <el-form-item
                :label="t('contractSettlement.fields.smartCardReturnedQty')"
                label-position="top"
              >
                <el-input :model-value="String(record.smartCardReturnedQty ?? 0)" disabled />
              </el-form-item>
            </div>
          </div>
          <el-form-item
            :label="t('contractSettlement.fields.siteCondition')"
            label-position="top"
            class="term-dlg__tight-item"
          >
            <el-input
              :model-value="dash(record.siteCondition)"
              type="textarea"
              :rows="2"
              resize="none"
              disabled
            />
          </el-form-item>
        </section>

        <section v-if="!isCancelDetail" class="term-dlg__section">
          <div class="term-dlg__section-head">
            <span class="term-dlg__step">3</span>
            <h4>{{ t('contract.terminateSectionExtraDeductions') }}</h4>
          </div>
          <p v-if="!extraDeductionItems.length" class="term-dlg__empty">
            {{ t('contract.terminateNoExtraDeductions') }}
          </p>
          <div v-else class="term-dlg__loan-list">
            <div
              v-for="(row, idx) in extraDeductionItems"
              :key="row.id"
              class="term-dlg__loan"
            >
              <div class="term-dlg__loan-top">
                <span class="term-dlg__loan-idx">{{ idx + 1 }}</span>
                <div class="term-dlg__loan-title">
                  <strong>{{ row.description || '—' }}</strong>
                  <span class="term-dlg__loan-amt">
                    <em>×{{ row.quantity ?? 1 }}</em>
                    {{ money(row.amount) }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="term-dlg__section">
          <div class="term-dlg__section-head">
            <span class="term-dlg__step">{{ isCancelDetail ? 2 : 4 }}</span>
            <h4>
              {{
                isCancelDetail
                  ? t('contract.cancelSectionMoney')
                  : t('contract.terminateSectionRefund')
              }}
            </h4>
          </div>
          <div class="term-dlg__tiles term-dlg__tiles--5">
            <div class="term-dlg__tile term-dlg__tile--refund">
              <span class="term-dlg__tile-label-with-tip">
                {{ t('contract.vacateRoomDepositDue') }}
                <el-tooltip
                  :content="t('contract.vacateRoomDepositDueHint')"
                  placement="top"
                  :z-index="tipZIndex"
                  :show-after="200"
                >
                  <el-icon class="term-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                </el-tooltip>
              </span>
              <strong>{{ money(roomDepositDue) }}</strong>
            </div>
            <div class="term-dlg__tile term-dlg__tile--refund">
              <span class="term-dlg__tile-label-with-tip">
                {{ t('contract.vacateBookingDepositDue') }}
                <el-tooltip
                  :content="t('contract.vacateBookingDepositDueHint')"
                  placement="top"
                  :z-index="tipZIndex"
                  :show-after="200"
                >
                  <el-icon class="term-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                </el-tooltip>
              </span>
              <strong>{{ money(bookingDepositDue) }}</strong>
            </div>
            <div class="term-dlg__tile" :class="{ 'is-deduct': depositDeductionTotal > 0 }">
              <span class="term-dlg__tile-label-with-tip">
                {{ t('contract.vacateDeductionShort') }}
                <el-tooltip
                  :content="t('contract.vacateDeductionTotalHint')"
                  placement="top"
                  :z-index="tipZIndex"
                  :show-after="200"
                >
                  <el-icon class="term-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                </el-tooltip>
              </span>
              <strong>{{ money(depositDeductionTotal) }}</strong>
            </div>
            <div class="term-dlg__tile term-dlg__tile--accent term-dlg__tile--refund">
              <span class="term-dlg__tile-label-with-tip">
                {{ t('contract.vacateRefundDueTotal') }}
                <el-tooltip
                  :content="
                    t('contract.vacateRefundFormulaHint', {
                      paid: money(depositPaid),
                      deduct: money(depositDeductionTotal),
                      due: money(record.refundDueTotal),
                    })
                  "
                  placement="top"
                  :z-index="tipZIndex"
                  :show-after="200"
                >
                  <el-icon class="term-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                </el-tooltip>
              </span>
              <strong>{{ money(record.refundDueTotal) }}</strong>
            </div>
            <div
              class="term-dlg__tile term-dlg__tile--collect"
              :class="{ 'is-collect': excessInvoiceAmount > 0.009 }"
            >
              <span class="term-dlg__tile-label-with-tip">
                {{ t('contract.vacateCollectDue') }}
                <el-tooltip
                  :content="t('contract.vacateCollectDueHint')"
                  placement="top"
                  :z-index="tipZIndex"
                  :show-after="200"
                >
                  <el-icon class="term-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                </el-tooltip>
              </span>
              <strong>{{ money(excessInvoiceAmount) }}</strong>
              <p
                v-if="excessInvoiceAmount > 0.009"
                class="term-dlg__tile-breakdown is-collect-note"
              >
                {{ t('contract.vacateCollectIncludedInOpen') }}
              </p>
            </div>
          </div>
          <p v-if="!refundOrders.length" class="term-dlg__empty">
            {{ t('contract.vacateNoRefundOrders') }}
          </p>
          <div v-else class="term-dlg__unset-wrap">
            <span class="term-dlg__unset-label">{{ t('contract.vacateRefundList') }}</span>
            <ul class="term-dlg__unset">
              <li v-for="o in refundOrders" :key="o.id">
                <div class="term-dlg__unset-main">
                  <button
                    type="button"
                    class="term-dlg__unset-code term-dlg__unset-code--link"
                    @click="emit('openRefundOrder', o.id)"
                  >
                    {{ o.refundCode || '—' }}
                  </button>
                  <StatusBadge
                    :tone="refundOrderStatusTone(o.status)"
                    :label="t(`refundOrder.status.${o.status}`, o.status)"
                  />
                </div>
                <div class="term-dlg__unset-amts">
                  <div class="term-dlg__unset-amt">
                    <span class="term-dlg__unset-amt-label">{{ t('contract.vacateAmtDue') }}</span>
                    <span>{{ money(o.amount) }}</span>
                  </div>
                  <div class="term-dlg__unset-amt">
                    <span class="term-dlg__unset-amt-label">{{ t('contract.vacateAmtPaid') }}</span>
                    <span class="term-dlg__unset-recv">{{ money(o.paidAmount) }}</span>
                  </div>
                  <div class="term-dlg__unset-amt">
                    <span class="term-dlg__unset-amt-label">{{ t('contract.vacateAmtRemain') }}</span>
                    <strong :class="{ 'is-open': (Number(o.remainingAmount) || 0) > 0.009 }">
                      {{ money(o.remainingAmount) }}
                    </strong>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </section>
        <section class="term-dlg__section">
          <div class="term-dlg__section-head term-dlg__section-head--with-action">
            <div class="term-dlg__section-head-main">
              <span class="term-dlg__step">{{ isCancelDetail ? 3 : 5 }}</span>
              <h4>
                {{
                  isCancelDetail
                    ? t('contract.cancelSectionInvoices')
                    : t('contract.terminateSectionSettlement')
                }}
              </h4>
            </div>
            <button
              v-if="showCollectAction"
              v-admin-glow="receiptPerms.codes.create"
              type="button"
              class="action-pill action-pill--accent term-dlg__head-action"
              :disabled="receivableSettled"
              :title="
                receivableSettled
                  ? t('contract.vacateReceivableSettledOk')
                  : undefined
              "
              @click="emit('collectPayment')"
            >
              {{ t('contract.receivePayment') }}
            </button>
            <button
              v-if="showRefundAction"
              v-admin-glow="refundOrderPerms.codes.update"
              type="button"
              class="action-pill action-pill--accent term-dlg__head-action"
              :disabled="cancelInvoiceRefundSettled"
              :title="
                cancelInvoiceRefundSettled
                  ? t('contract.cancelInvoiceRefundSettledOk')
                  : undefined
              "
              @click="emit('refund')"
            >
              {{ t('contract.cancelRefund') }}
            </button>
          </div>
          <template v-if="isCancelDetail">
            <div
              class="term-dlg__banner"
              :class="cancelInvoiceRefundSettled ? 'is-ok' : 'is-warn'"
            >
              <div class="term-dlg__banner-dot" />
              <div class="term-dlg__banner-body">
                <p v-if="cancelInvoiceRefundSettled" class="term-dlg__banner-title">
                  {{ t('contract.cancelInvoiceRefundSettledOk') }}
                </p>
                <p v-else class="term-dlg__banner-title">
                  {{
                    t('contract.cancelInvoiceRefundUnsettledHint', {
                      amount: money(cancelRefundRemainTotal),
                    })
                  }}
                </p>
              </div>
            </div>
            <div class="term-dlg__tiles">
              <div class="term-dlg__tile">
                <span>{{ t('contract.vacateInvoiceTotal') }}</span>
                <strong>{{ money(cancelInvoiceTotal) }}</strong>
              </div>
              <div class="term-dlg__tile">
                <span>{{ t('contract.vacateReceivedTotal') }}</span>
                <strong>{{ money(cancelReceivedTotal) }}</strong>
              </div>
              <div class="term-dlg__tile">
                <span>{{ t('contract.vacateRefundDueTotal') }}</span>
                <strong>{{ money(cancelRefundDueTotal) }}</strong>
              </div>
              <div
                class="term-dlg__tile"
                :class="{ 'is-warn': cancelRefundRemainTotal > 0.009 }"
              >
                <span>{{ t('contract.vacateRefundRemainTotal') }}</span>
                <strong>{{ money(cancelRefundRemainTotal) }}</strong>
              </div>
            </div>
            <p v-if="!receivables.length" class="term-dlg__empty">
              {{ t('contract.vacateNoReceivables') }}
            </p>
            <div v-else class="term-dlg__unset-wrap">
              <span class="term-dlg__unset-label">{{ t('contract.cancelInvoiceList') }}</span>
              <ul class="term-dlg__unset">
                <li v-for="r in receivables" :key="r.id">
                  <div class="term-dlg__unset-main">
                    <button
                      type="button"
                      class="term-dlg__unset-code term-dlg__unset-code--link"
                      @click="emit('openReceivable', r.id)"
                    >
                      {{ r.invoiceCode || r.receivableCode || '—' }}
                    </button>
                    <StatusBadge
                      :tone="receivableValidityTone(r.invoiceStatus)"
                      :label="validityLabel(r.invoiceStatus)"
                    />
                    <StatusBadge
                      v-if="cancelRowRefundRemain(r) > 0.009"
                      tone="signing"
                      :label="t('contract.vacateReceivableNeedRefund')"
                      :title="t('contract.vacateReceivableNeedRefundHint')"
                    />
                    <StatusBadge
                      v-else-if="cancelRowRefundDue(r) <= 0.009"
                      tone="neutral"
                      :label="t('contract.vacateReceivableNoRefund')"
                      :title="t('contract.vacateReceivableNoRefundHint')"
                    />
                  </div>
                  <div class="term-dlg__unset-amts term-dlg__unset-amts--4">
                    <div class="term-dlg__unset-amt">
                      <span class="term-dlg__unset-amt-label">{{
                        t('contract.vacateAmtInvoiced')
                      }}</span>
                      <span>{{ money(r.invoiceAmount) }}</span>
                    </div>
                    <div class="term-dlg__unset-amt">
                      <span class="term-dlg__unset-amt-label">{{
                        t('contract.vacateAmtReceived')
                      }}</span>
                      <span class="term-dlg__unset-recv">{{ money(r.receivedAmount) }}</span>
                    </div>
                    <div class="term-dlg__unset-amt">
                      <span class="term-dlg__unset-amt-label">{{
                        t('contract.vacateAmtRefundDue')
                      }}</span>
                      <span>{{ money(cancelRowRefundDue(r)) }}</span>
                    </div>
                    <div class="term-dlg__unset-amt">
                      <span class="term-dlg__unset-amt-label">{{
                        t('contract.vacateAmtRefundRemain')
                      }}</span>
                      <strong :class="{ 'is-open': cancelRowRefundRemain(r) > 0.009 }">
                        {{ money(cancelRowRefundRemain(r)) }}
                      </strong>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </template>
          <template v-else>
            <div
              class="term-dlg__banner"
              :class="receivableSettled ? 'is-ok' : 'is-warn'"
            >
              <div class="term-dlg__banner-dot" />
              <div class="term-dlg__banner-body">
                <p v-if="receivableSettled" class="term-dlg__banner-title">
                  {{ t('contract.vacateReceivableSettledOk') }}
                </p>
                <p v-else class="term-dlg__banner-title">
                  {{
                    t('contract.vacateReceivableUnsettledHint', {
                      amount: money(receivableOpenTotal),
                    })
                  }}
                </p>
              </div>
            </div>
            <div class="term-dlg__tiles">
              <div class="term-dlg__tile">
                <span>{{ t('contract.vacateInvoiceTotal') }}</span>
                <strong>{{ money(receivableInvoiceTotal) }}</strong>
              </div>
              <div class="term-dlg__tile">
                <span>{{ t('contract.vacateReceivedTotal') }}</span>
                <strong>{{ money(receivableReceivedTotal) }}</strong>
              </div>
              <div
                class="term-dlg__tile"
                :class="{ 'is-warn': receivableOpenTotal > 0.009 }"
              >
                <span class="term-dlg__tile-label-with-tip">
                  {{ t('contract.vacateOpenTotal') }}
                  <el-tooltip
                    :content="openTotalTip"
                    placement="top"
                    :z-index="tipZIndex"
                    :show-after="200"
                  >
                    <el-icon class="term-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </span>
                <strong>{{ money(receivableOpenTotal) }}</strong>
              </div>
            </div>
            <p v-if="!receivables.length" class="term-dlg__empty">
              {{ t('contract.vacateNoReceivables') }}
            </p>
            <div v-else class="term-dlg__unset-wrap">
              <span class="term-dlg__unset-label">{{ t('contract.vacateReceivableList') }}</span>
              <ul class="term-dlg__unset">
                <li v-for="r in receivables" :key="r.id">
                  <div class="term-dlg__unset-main">
                    <button
                      type="button"
                      class="term-dlg__unset-code term-dlg__unset-code--link"
                      @click="emit('openReceivable', r.id)"
                    >
                      {{ r.invoiceCode || r.receivableCode || '—' }}
                    </button>
                    <StatusBadge
                      :tone="receivableValidityTone(r.invoiceStatus)"
                      :label="validityLabel(r.invoiceStatus)"
                    />
                    <StatusBadge
                      v-if="receivableInvalidNote(r) === 'needRefund'"
                      tone="signing"
                      :label="t('contract.vacateReceivableNeedRefund')"
                      :title="t('contract.vacateReceivableNeedRefundHint')"
                    />
                    <StatusBadge
                      v-else-if="receivableInvalidNote(r) === 'noRefund'"
                      tone="neutral"
                      :label="t('contract.vacateReceivableNoRefund')"
                      :title="t('contract.vacateReceivableNoRefundHint')"
                    />
                    <template v-if="isExcessCompensationReceivable(r)">
                      <StatusBadge
                        tone="signing"
                        :label="t('contract.vacateReceivableExcessComp')"
                      />
                      <el-tooltip
                        :content="t('contract.vacateReceivableExcessCompNote')"
                        placement="top"
                        :z-index="tipZIndex"
                        :show-after="200"
                      >
                        <el-icon class="term-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                      </el-tooltip>
                    </template>
                  </div>
                  <div class="term-dlg__unset-amts">
                    <div class="term-dlg__unset-amt">
                      <span class="term-dlg__unset-amt-label">{{
                        t('contract.vacateAmtInvoiced')
                      }}</span>
                      <span>{{ money(r.invoiceAmount) }}</span>
                    </div>
                    <div class="term-dlg__unset-amt">
                      <span class="term-dlg__unset-amt-label">{{
                        t('contract.vacateAmtReceived')
                      }}</span>
                      <span class="term-dlg__unset-recv">{{ money(r.receivedAmount) }}</span>
                    </div>
                    <div class="term-dlg__unset-amt">
                      <span class="term-dlg__unset-amt-label">{{ t('contract.vacateAmtOpen') }}</span>
                      <strong :class="{ 'is-open': (Number(r.receivableAmount) || 0) > 0.009 }">
                        {{ money(r.receivableAmount) }}
                      </strong>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </template>
        </section>
        <el-form-item
          v-if="showRemark"
          :label="t('contractSettlement.fields.remark')"
          label-position="top"
          class="term-dlg__remark"
        >
          <el-input
            :model-value="record.remark"
            type="textarea"
            :rows="2"
            resize="none"
            disabled
          />
        </el-form-item>

      </template>
    </div>

    <template #footer>
      <el-button type="primary" class="lb-btn-primary" @click="visible = false">
        {{ t('common.close') }}
      </el-button>
    </template>
  </el-dialog>
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

.term-dlg__status-pair {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.term-dlg__banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid transparent;
  margin-bottom: 12px;
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

.term-dlg__banner-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.4;
}

.term-dlg__banner.is-ok .term-dlg__banner-title {
  color: #1f5c3c;
}

.term-dlg__banner.is-warn .term-dlg__banner-title {
  color: #9a4f0a;
}

.term-dlg__unset-wrap {
  margin-top: 4px;
}

.term-dlg__unset-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #6a7a70;
}

.term-dlg__unset {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.term-dlg__unset li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #f8faf8;
  border: 1px solid #e4ebe6;
  flex-wrap: wrap;
}

.term-dlg__unset-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}

.term-dlg__unset-code {
  font-size: 14px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
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

.term-dlg__unset-amts {
  display: inline-flex;
  align-items: flex-end;
  gap: 14px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: #5a6a62;
}

.term-dlg__unset-amts--4 {
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.term-dlg__unset-amt {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.term-dlg__unset-amt-label {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.2;
  color: #8a9a92;
}

.term-dlg__unset-recv {
  color: #0d3a28;
  font-weight: 650;
}

.term-dlg__unset-amts strong {
  font-size: 14px;
  font-weight: 750;
  color: #1a2a22;
}

.term-dlg__unset-amts strong.is-open {
  color: #a15c00;
}

.term-dlg__section {
  margin: 0 0 14px;
  padding: 0;
  border: none;
  background: transparent;
}

.term-dlg__section > :last-child {
  margin-bottom: 0;
}

.term-dlg__section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  padding: 0 0 0 10px;
  border-left: 3px solid var(--lb-brand, #0f4a32);
}

.term-dlg__section-head--with-action {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding-right: 2px;
}

.term-dlg__section-head-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.term-dlg__section-head h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 750;
  color: #0d3a28;
}

.term-dlg__head-action {
  flex: 0 0 auto;
  height: 28px;
  min-height: 28px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 650;
  line-height: 26px;
  border-radius: 999px;
  box-shadow: 0 1px 0 rgba(15, 74, 50, 0.06);
}

.term-dlg__head-action:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
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

.term-dlg__row2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
  align-items: start;
  margin-bottom: 12px;
}

.term-dlg__row2 > :deep(.el-form-item) {
  width: 100%;
  min-width: 0;
  margin-bottom: 0 !important;
}

.term-dlg__kind {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
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
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
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
  font-variant-numeric: tabular-nums;
  color: #b42318;
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
  display: inline-flex;
  align-items: center;
}

.term-dlg__pill.is-active.is-ok {
  border-color: var(--lb-brand, #0f4a32);
  background: var(--lb-brand, #0f4a32);
  color: #fff;
}

.term-dlg__pill.is-active.is-danger {
  border-color: #b42318;
  background: #b42318;
  color: #fff;
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

.term-dlg__keys :deep(.el-form-item) {
  margin-bottom: 12px;
}

.term-dlg__keys :deep(.el-form-item__label) {
  color: #6a7a70;
  font-weight: 550;
  font-size: 0.84rem;
  margin-bottom: 6px !important;
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

.term-dlg__tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px 12px;
  margin-bottom: 12px;
}

.term-dlg__tiles--5 {
  grid-template-columns: repeat(5, minmax(0, 1fr));
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

.term-dlg__tile-label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.term-dlg__label-tip {
  color: #8a9a92;
  cursor: help;
  flex: 0 0 auto;
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

.term-dlg__excess-note {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: #8a6a45;
  font-weight: 500;
}

.term-dlg__tile-breakdown {
  margin: 2px 0 0;
  font-size: 11px;
  font-weight: 550;
  line-height: 1.35;
  color: #8a6a45;
}

.term-dlg__tile-breakdown.is-collect-note {
  color: #b42318;
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

.term-dlg__tile--accent {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #fff);
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 22%, #e4ebe6);
}

.term-dlg__tile--refund strong {
  color: var(--lb-brand, #0f4a32);
}

.term-dlg__tile--accent strong {
  color: var(--lb-brand, #0f4a32);
}

.term-dlg__tile--collect {
  background: #fff8f6;
  border-color: #f0d0c8;
}

.term-dlg__tile--collect.is-collect strong {
  color: #b42318;
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
  .term-dlg__tiles,
  .term-dlg__row2 {
    grid-template-columns: 1fr;
  }
}
</style>
