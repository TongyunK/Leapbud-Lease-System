<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import type { ContractRecord } from '@/types/contract'
import {
  coerceContractPaymentCycle,
  formatContractOccupancyLabel,
} from '@/types/contract'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import AttachmentLink from '@/components/AttachmentLink.vue'
import BookingDepositAppliesDialog from '@/components/BookingDepositAppliesDialog.vue'
import CountListPill from '@/components/CountListPill.vue'
import DrawerDetailHeader from '@/components/DrawerDetailHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import {
  contractOccupancyTone,
  contractStatusTone,
  depositRefundStatusTone,
} from '@/constants/statusBadges'
import { formatDateTime, formatMoney } from '@/utils/format'
import { previewAgreementPdfApi, prefetchAgreementPdfApi } from '@/api/document-templates'
import {
  fetchBookingDepositByContractApi,
  type BookingDepositAccount,
} from '@/api/receipts'
import { fetchContractChangeLogs } from '@/api/contract-settlements'
import type { ContractChangeLogRecord } from '@/types/contract-settlement'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    contract: ContractRecord | null
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  
    /** 叠在其它弹窗／抽屉之上时传入更高 z-index */
    zIndex?: number
  }>(),
  {
    desktopDirection: 'rtl',
    size: undefined,
  
    zIndex: undefined,
  },
)

const emit = defineEmits<{
  openCustomer: [customerId: string]
  openRoom: [roomId: string]
  openBuilding: [buildingId: string]
  openRequirement: [requirementId: string]
  openInvoices: [contract: ContractRecord]
  openReceivables: [contract: ContractRecord]
  openReceipts: [contract: ContractRecord]
  openCashFlows: [contract: ContractRecord]
  openSettlement: [settlementId: string]
  openLoanItems: [contract: ContractRecord]
  openBookingDepositReceipt: [receiptId: string, opts?: { zIndex?: number }]
  openInvoice: [invoiceId: string, opts?: { zIndex?: number }]
  bookingDepositChanged: []
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const printing = ref(false)
const depositAccount = ref<BookingDepositAccount | null>(null)
const depositAccountLoading = ref(false)
const changeLogs = ref<ContractChangeLogRecord[]>([])
const changeLogsLoading = ref(false)
const appliesDialogVisible = ref(false)

async function reloadDepositAccount() {
  const id = props.contract?.id
  if (!id) {
    depositAccount.value = null
    return
  }
  depositAccountLoading.value = true
  try {
    const { data } = await fetchBookingDepositByContractApi(id)
    depositAccount.value = data ?? null
  } catch {
    depositAccount.value = null
  } finally {
    depositAccountLoading.value = false
  }
}

async function reloadChangeLogs() {
  const id = props.contract?.id
  if (!id) {
    changeLogs.value = []
    return
  }
  changeLogsLoading.value = true
  try {
    const { data } = await fetchContractChangeLogs(id)
    changeLogs.value = data ?? []
  } catch {
    changeLogs.value = []
  } finally {
    changeLogsLoading.value = false
  }
}

function occupancyLabel(row: ContractRecord) {
  return formatContractOccupancyLabel(row, {
    whole: t('contract.occupancyWhole'),
    part: t('contract.occupancyPart'),
  })
}

watch(
  () => [visible.value, props.contract?.id] as const,
  ([open, id]) => {
    if (open && id) prefetchAgreementPdfApi(id)
  },
)

watch(
  () => [visible.value, props.contract?.id] as const,
  async ([open, id]) => {
    if (!open || !id) {
      depositAccount.value = null
      changeLogs.value = []
      return
    }
    await Promise.all([reloadDepositAccount(), reloadChangeLogs()])
  },
)

const depositReceipts = computed(() => {
  const list = depositAccount.value?.receipts
  if (list?.length) return list
  const id =
    depositAccount.value?.receiptId ||
    props.contract?.bookingDepositReceiptId ||
    ''
  const code =
    depositAccount.value?.receiptCode?.trim() ||
    props.contract?.bookingDepositReceiptCode?.trim() ||
    ''
  if (!id && !code) return []
  return [
    {
      id: id || '',
      receiptCode: code,
      amount: Number(depositAccount.value?.principal ?? props.contract?.bookingDeposit ?? 0),
    },
  ]
})

const depositApplied = computed(() => depositAccount.value?.applied ?? 0)
const depositRefunded = computed(() => depositAccount.value?.refunded ?? 0)
const depositBalance = computed(() => {
  if (depositAccount.value) return depositAccount.value.balance
  const principal = Number(props.contract?.bookingDeposit ?? 0)
  return Number.isFinite(principal) ? principal : 0
})

const showDepositLedger = computed(() => {
  const principal = Number(props.contract?.bookingDeposit ?? 0)
  return (
    (Number.isFinite(principal) && principal > 0) ||
    depositReceipts.value.length > 0 ||
    (depositAccount.value?.principal ?? 0) > 0
  )
})

/** 借出物品總按金（合約級小計之和） */
const loanItemsDepositTotal = computed(() => {
  const c = props.contract
  if (!c) return 0
  if (c.loanItems?.length) {
    return (
      Math.round(c.loanItems.reduce((sum, f) => sum + (Number(f.subtotal) || 0), 0) * 100) / 100
    )
  }
  return Math.round((Number(c.loanItemAmountTotal) || 0) * 100) / 100
})

/** 按金總數 = 房間按金 + 借出物品 + 雜項 + 鑰匙（與編輯表單一致） */
const totalDepositAmount = computed(() => {
  const c = props.contract
  if (!c) return 0
  const total =
    (Number(c.roomDeposit) || 0) +
    loanItemsDepositTotal.value +
    (Number(c.miscDeposit) || 0) +
    (Number(c.doorKeyDeposit) || 0) +
    (Number(c.mailboxKeyDeposit) || 0)
  return Math.round(total * 100) / 100
})

/** 退租已退按金，或取消合约已退定金余额 → 按金总数旁显示「已退还」 */
const showTotalDepositRefundedBadge = computed(() => {
  if (props.contract?.depositRefundDone) return true
  if ((props.contract?.status || '').trim() === '已取消' && depositRefunded.value > 0.009) {
    return true
  }
  return false
})

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '640px'))

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function money(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

function statusLabel(status: string) {
  return t(`contract.status.${status}`, status)
}

async function onPrintAgreement() {
  const c = props.contract
  if (!c?.id || printing.value) return
  printing.value = true
  try {
    await previewAgreementPdfApi(c.id, { autoPrint: false })
    ElMessage.success(t('contract.printAgreementPreviewReady'))
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('contract.printAgreementFailed')
    ElMessage.error(msg)
  } finally {
    printing.value = false
  }
}

function emitIfCount(
  count: number | undefined,
  event: 'openInvoices' | 'openReceivables' | 'openReceipts' | 'openCashFlows' | 'openLoanItems',
) {
  const c = props.contract
  if (!c || !count) return
  emit(event, c)
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :direction="direction"
    class="responsive-drawer"
  
    append-to-body
  
    :z-index="zIndex"
  >
    <template #header="{ titleId, titleClass }">
      <DrawerDetailHeader
        :title-id="titleId"
        :title-class="titleClass"
        :title="t('contract.detailTitle')"
        :code="contract?.contractCode"
      >
        <el-button
          v-if="contract"
          type="primary"
          class="lb-btn-primary drawer-header-action"
          :loading="printing"
          @mouseenter="contract?.id && prefetchAgreementPdfApi(contract.id)"
          @focus="contract?.id && prefetchAgreementPdfApi(contract.id)"
          @click="onPrintAgreement"
        >
          {{ t('contract.printAgreement') }}
        </el-button>
      </DrawerDetailHeader>
    </template>
    <template v-if="contract">
      <section class="detail-section">
        <h3>{{ t('contract.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('contract.fields.contractCode') }}</dt>
            <dd>{{ contract.contractCode }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.status') }}</dt>
            <dd>
              <StatusBadge
                :tone="contractStatusTone(contract.status)"
                :label="statusLabel(contract.status)"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.roomCode') }}</dt>
            <dd>
              <button
                v-if="contract.roomId"
                type="button"
                class="fk-link"
                @click="emit('openRoom', contract.roomId)"
              >
                {{ contract.roomCode || '—' }}
              </button>
              <template v-else>{{ dash(contract.roomCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.roomName') }}</dt>
            <dd>{{ dash(contract.roomName || contract.roomNameText) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.buildingName') }}</dt>
            <dd>
              <button
                v-if="contract.buildingId"
                type="button"
                class="fk-link"
                @click="emit('openBuilding', contract.buildingId)"
              >
                {{ contract.buildingName || '—' }}
              </button>
              <template v-else>{{ dash(contract.buildingName) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.customerName') }}</dt>
            <dd>
              <button
                v-if="contract.customerId"
                type="button"
                class="fk-link"
                @click="emit('openCustomer', contract.customerId)"
              >
                {{ contract.customerName || '—' }}
              </button>
              <template v-else>{{ dash(contract.customerName) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.salesManager') }}</dt>
            <dd>{{ dash(contract.salesManager) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.requirementCode') }}</dt>
            <dd>
              <button
                v-if="contract.requirementId"
                type="button"
                class="fk-link"
                @click="emit('openRequirement', contract.requirementId)"
              >
                {{ contract.requirementCode || '—' }}
              </button>
              <template v-else>{{ dash(contract.requirementCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.startDate') }}</dt>
            <dd>{{ dash(contract.startDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.endDate') }}</dt>
            <dd>{{ dash(contract.endDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.actualEndDate') }}</dt>
            <dd>{{ dash(contract.actualEndDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.leaseType') }}</dt>
            <dd>
              <StatusBadge
                :tone="contractOccupancyTone(contract.occupancyMode)"
                :label="occupancyLabel(contract)"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.paymentCycle') }}</dt>
            <dd>{{
              contract.paymentCycle
                ? coerceContractPaymentCycle(contract.paymentCycle)
                : dash('')
            }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('contract.fields.attachment') }}</dt>
            <dd>
              <AttachmentLink v-if="contract.attachment" :value="contract.attachment" />
              <template v-else>—</template>
            </dd>
          </div>
          <div class="full">
            <dt>{{ t('contract.fields.remark') }}</dt>
            <dd>{{ dash(contract.remark) }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="contract.periods?.length" class="detail-section">
        <h3>{{ t('contract.sections.periods') }}</h3>
        <div class="period-list">
          <div v-for="(p, i) in contract.periods" :key="p.id || i" class="period-list__item">
            <strong>{{ t(`contract.periodTypes.${p.dateType}`, p.dateType) }}</strong>
            <span>{{ p.dateValue }} {{ t(`contract.periodUnits.${p.dateUnit}`, p.dateUnit) }}</span>
            <span>{{ p.startDate }} → {{ p.endDate }}</span>
          </div>
        </div>
      </section>

      <section class="detail-section">
        <h3>{{ t('contract.sections.finance') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('contract.fields.monthlyRent') }}</dt>
            <dd>{{ money(contract.monthlyRent) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.roomDeposit') }}</dt>
            <dd>{{ money(contract.roomDeposit) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.electricityRate') }}</dt>
            <dd>{{ contract.electricityRate == null ? '—' : contract.electricityRate }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.doorKeyQty') }}</dt>
            <dd>{{ contract.doorKeyQty ?? 0 }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.mailboxKeyQty') }}</dt>
            <dd>{{ contract.mailboxKeyQty ?? 0 }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.miscDeposit') }}</dt>
            <dd>{{ money(contract.miscDeposit) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.doorKeyDeposit') }}</dt>
            <dd>{{ money(contract.doorKeyDeposit) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.mailboxKeyDeposit') }}</dt>
            <dd>{{ money(contract.mailboxKeyDeposit) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.loanItemsDeposit') }}</dt>
            <dd>{{ money(loanItemsDepositTotal) }}</dd>
          </div>
          <div>
            <dt>
              <span class="detail-label-with-tip">
                {{ t('contract.fields.totalDeposit') }}
                <el-tooltip :content="t('contract.fields.totalDepositHint')" placement="top">
                  <el-icon class="detail-label-tip" :size="14"><QuestionFilled /></el-icon>
                </el-tooltip>
              </span>
            </dt>
            <dd class="detail-value-with-badge">
              <span class="booking-dep-balance">{{ money(totalDepositAmount) }}</span>
              <StatusBadge
                v-if="showTotalDepositRefundedBadge"
                :tone="depositRefundStatusTone('已退')"
                :label="t('contract.fields.depositRefundedBadge')"
              />
            </dd>
          </div>
        </dl>
      </section>

      <section class="detail-section" v-loading="depositAccountLoading">
        <h3>{{ t('contract.sections.payment') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('contract.fields.bookingDeposit') }}</dt>
            <dd>{{ money(depositAccount?.principal ?? contract.bookingDeposit) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.paymentDate') }}</dt>
            <dd>{{ dash(contract.paymentDate) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('contract.fields.bookingDepositReceipt') }}</dt>
            <dd>
              <div v-if="depositReceipts.length" class="booking-dep-receipts">
                <button
                  v-for="r in depositReceipts"
                  :key="r.id || r.receiptCode"
                  type="button"
                  class="fk-link"
                  :disabled="!r.id"
                  @click="r.id && emit('openBookingDepositReceipt', r.id)"
                >
                  {{ r.receiptCode || t('contract.fields.bookingDepositReceipt') }}
                  <span v-if="depositReceipts.length > 1" class="booking-dep-receipts__amt">
                    ({{ money(r.amount) }})
                  </span>
                </button>
              </div>
              <template v-else>—</template>
            </dd>
          </div>
          <template v-if="showDepositLedger">
            <div>
              <dt>{{ t('receipt.bookingDeposit.applied') }}</dt>
              <dd class="related-count-row">
                <span class="related-count-row__total">{{ money(depositApplied) }}</span>
                <button
                  v-if="depositApplied > 0.009"
                  type="button"
                  class="lb-inline-view-pill"
                  @click="appliesDialogVisible = true"
                >
                  <span class="lb-inline-view-pill__icon" aria-hidden="true">
                    <svg viewBox="0 0 16 16" width="13" height="13" fill="none">
                      <path
                        d="M2.5 3.25h8.5M2.5 7h7.25M2.5 10.75h5.5"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                      />
                      <circle
                        cx="11.25"
                        cy="11.1"
                        r="2.35"
                        stroke="currentColor"
                        stroke-width="1.45"
                      />
                      <path
                        d="M12.95 12.85 14.4 14.3"
                        stroke="currentColor"
                        stroke-width="1.45"
                        stroke-linecap="round"
                      />
                    </svg>
                  </span>
                  {{ t('contract.viewBookingDepositApplies') }}
                </button>
              </dd>
            </div>
            <div>
              <dt>{{ t('receipt.bookingDeposit.balance') }}</dt>
              <dd class="booking-dep-balance">{{ money(depositBalance) }}</dd>
            </div>
            <div>
              <dt>{{ t('receipt.bookingDeposit.refunded') }}</dt>
              <dd>{{ money(depositRefunded) }}</dd>
            </div>
          </template>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('contract.sections.relatedRecords') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('contract.fields.invoiceCount') }}</dt>
            <dd>
              <CountListPill
                :count="contract.invoiceCount ?? 0"
                @click="emitIfCount(contract.invoiceCount, 'openInvoices')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.receivableCount') }}</dt>
            <dd>
              <CountListPill
                :count="contract.receivableCount ?? 0"
                @click="emitIfCount(contract.receivableCount, 'openReceivables')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.receiptCount') }}</dt>
            <dd>
              <CountListPill
                :count="contract.receiptCount ?? 0"
                @click="emitIfCount(contract.receiptCount, 'openReceipts')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.cashFlowCount') }}</dt>
            <dd>
              <CountListPill
                :count="contract.cashFlowCount ?? 0"
                @click="emitIfCount(contract.cashFlowCount, 'openCashFlows')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.terminationCount') }}</dt>
            <dd>
              <button
                v-if="contract.vacateSettlementId"
                type="button"
                class="fk-link"
                @click="emit('openSettlement', contract.vacateSettlementId)"
              >
                {{ contract.vacateSettlementCode || contract.vacateSettlementId }}
              </button>
              <template v-else>—</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.loanItemCount') }}</dt>
            <dd>
              <CountListPill
                :count="contract.loanItemCount ?? 0"
                @click="emitIfCount(contract.loanItemCount, 'openLoanItems')"
              />
            </dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('contract.sections.changeLogs') }}</h3>
        <el-table
          v-loading="changeLogsLoading"
          :data="changeLogs"
          border
          empty-text="—"
        >
          <el-table-column
            :label="t('common.createdAt')"
            min-width="150"
          >
            <template #default="{ row }">
              {{ formatDateTime(row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('contract.fields.changeType')" min-width="110">
            <template #default="{ row }">
              {{ t(`contract.changeType.${row.changeType}`, row.changeType) }}
            </template>
          </el-table-column>
          <el-table-column prop="summary" :label="t('contract.fields.changeSummary')" min-width="180" />
          <el-table-column prop="createdBy" :label="t('common.createdBy')" min-width="100" />
        </el-table>
      </section>

      <AuditDetailSection
        :created-by="contract.createdBy"
        :created-at="contract.createdAt"
        :updated-by="contract.updatedBy"
        :updated-at="contract.updatedAt"
      />
    </template>
  </el-drawer>

  <BookingDepositAppliesDialog
    v-model="appliesDialogVisible"
    :contract-id="contract?.id"
    :contract-code="contract?.contractCode"
    :z-index="zIndex"
    @open-invoice="(id, opts) => emit('openInvoice', id, opts)"
    @open-receipt="(id, opts) => emit('openBookingDepositReceipt', id, opts)"
  />
</template>

<style scoped>
.detail-label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.detail-label-tip {
  color: #8a9a90;
  cursor: help;
  vertical-align: middle;
}

.related-count-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.related-count-row:has(.related-count-row__breakdown) {
  align-items: flex-start;
}

.related-count-row:has(.related-count-row__breakdown) .lb-count-list-pill {
  margin-top: 1px;
}

.related-count-row__total {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: #1f3d34;
  white-space: nowrap;
}

.related-count-row__breakdown {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-variant-numeric: tabular-nums;
  font-size: 0.86rem;
  font-weight: 600;
  line-height: 1.35;
  color: #1f3d34;
}

.booking-dep-receipts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  align-items: baseline;
}

.booking-dep-receipts__amt {
  margin-left: 2px;
  color: var(--lb-muted, #6a7a70);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.period-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.period-list__item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 12px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--lb-surface-muted, rgba(0, 0, 0, 0.03));
  font-size: 0.9rem;
}

.period-list__item strong {
  min-width: 5rem;
}

.detail-value-with-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.booking-dep-balance {
  font-weight: 700;
  color: var(--lb-brand, #0f4a32);
}
</style>
