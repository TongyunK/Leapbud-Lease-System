<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import type { ReceiptRecord } from '@/types/receipt'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import CountListPill from '@/components/CountListPill.vue'
import DrawerDetailHeader from '@/components/DrawerDetailHeader.vue'
import ReceiptAttachmentList from '@/components/ReceiptAttachmentList.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { receiptKindTone } from '@/constants/statusBadges'
import { formatMoney } from '@/utils/format'
import { formatBookingDepositChangeLog } from '@/utils/bookingDepositChangeLog'
import { previewReceiptPdfApi, prefetchReceiptPdfApi } from '@/api/document-templates'
import {
  fetchBookingDepositByReceiptApi,
  refundBookingDepositApi,
  type BookingDepositAccount,
} from '@/api/receipts'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    record: ReceiptRecord | null
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
  openContract: [contractId: string]
  openInvoice: [invoiceId: string]
  openReceivable: [receivableId: string]
  openCashFlows: [row: ReceiptRecord]
  bookingDepositChanged: []
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const receiptPerms = useResourcePermissions('receipts')
const printing = ref(false)
const account = ref<BookingDepositAccount | null>(null)
const accountLoading = ref(false)
const refundVisible = ref(false)
const refundSubmitting = ref(false)
const refundForm = reactive({
  amount: 0 as number,
  refundDate: '' as string,
  remark: '',
})
const isBookingDeposit = computed(() => props.record?.kind === 'booking_deposit')

watch(
  () => [visible.value, props.record?.id] as const,
  ([open, id]) => {
    if (open && id) prefetchReceiptPdfApi(id)
  },
)

watch(
  () => [visible.value, props.record?.id, props.record?.kind] as const,
  async ([open, id, kind]) => {
    if (!open || !id || kind !== 'booking_deposit') {
      account.value = null
      return
    }
    accountLoading.value = true
    try {
      const { data } = await fetchBookingDepositByReceiptApi(id)
      account.value = data ?? null
    } catch {
      account.value = null
    } finally {
      accountLoading.value = false
    }
  },
)

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '560px'))

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function money(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

const changeLogDisplay = computed(() => {
  const raw = props.record?.changeLog
  if (!raw?.trim()) return '—'
  return formatBookingDepositChangeLog(raw, (key, values) => t(key, values)) || '—'
})

function kindLabel(kind?: string | null) {
  const k = (kind || 'invoice').trim()
  const key = `receipt.kind.${k}`
  return t(key) === key ? k : t(key)
}

function movementTypeLabel(type: string) {
  if (type === 'apply') return t('receipt.bookingDeposit.typeApply')
  if (type === 'top_up') return t('receipt.bookingDeposit.typeTopUp')
  if (type === 'forfeit') return t('receipt.bookingDeposit.typeForfeit')
  return t('receipt.bookingDeposit.typeRefund')
}

/** 默认「定金抵扣」备注与类型标题重复，有发票编号时不再展示 */
function movementRemarkVisible(remark?: string | null, invoiceCode?: string | null) {
  const text = (remark || '').trim()
  if (!text) return false
  if (invoiceCode?.trim() && (text === '定金抵扣' || text === 'Booking deposit apply')) return false
  return true
}

function todayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

async function onPrintReceipt() {
  const row = props.record
  if (!row?.id || printing.value) return
  printing.value = true
  try {
    await previewReceiptPdfApi(row.id, { autoPrint: false })
    await ElMessageBox.alert(t('receipt.printReceiptPreviewReady'), t('receipt.detailTitle'), {
      type: 'success',
      confirmButtonText: t('common.confirm'),
    })
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('receipt.printReceiptFailed')
    try {
      await ElMessageBox.alert(msg, t('receipt.detailTitle'), {
        type: 'error',
        confirmButtonText: t('common.confirm'),
      })
    } catch {
      /* dismiss */
    }
  } finally {
    printing.value = false
  }
}

/** 退还上限取合约池余额；单张收据视角下本金／动账仅本收据 */
const refundableBalance = computed(() => {
  const a = account.value
  if (!a) return 0
  const pool = Number(a.contractBalance ?? a.balance ?? 0)
  return Number.isFinite(pool) ? pool : 0
})

function openRefund() {
  const bal = refundableBalance.value
  if (bal <= 0) return
  refundForm.amount = bal
  refundForm.refundDate = todayYmd()
  refundForm.remark = ''
  refundVisible.value = true
}

async function submitRefund() {
  const contractId = props.record?.contractId?.trim()
  const receiptId = props.record?.id?.trim()
  const bal = refundableBalance.value
  const amount = Number(refundForm.amount ?? 0)
  if (!contractId) return
  if (!Number.isFinite(amount) || amount <= 0) {
    await ElMessageBox.alert(t('receipt.bookingDeposit.refundNeedAmount'), t('receipt.bookingDeposit.refundTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  if (amount > bal + 0.009) {
    await ElMessageBox.alert(
      t('receipt.bookingDeposit.refundExceed', { balance: formatMoney(bal) }),
      t('receipt.bookingDeposit.refundTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm') },
    )
    return
  }
  if (!refundForm.refundDate) return
  refundSubmitting.value = true
  try {
    await refundBookingDepositApi(
      {
        contractId,
        amount,
        refundDate: refundForm.refundDate,
        remark: refundForm.remark || undefined,
      },
      { silentError: true },
    )
    if (receiptId) {
      try {
        const { data } = await fetchBookingDepositByReceiptApi(receiptId)
        account.value = data ?? account.value
      } catch {
        /* keep previous */
      }
    }
    refundVisible.value = false
    emit('bookingDepositChanged')
    await ElMessageBox.alert(t('receipt.bookingDeposit.refundDone'), t('receipt.bookingDeposit.refundTitle'), {
      type: 'success',
      confirmButtonText: t('common.confirm'),
    })
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('common.failed')
    try {
      await ElMessageBox.alert(msg, t('receipt.bookingDeposit.refundTitle'), {
        type: 'error',
        confirmButtonText: t('common.confirm'),
      })
    } catch {
      /* dismiss */
    }
  } finally {
    refundSubmitting.value = false
  }
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
        :title="t('receipt.detailTitle')"
        :code="record?.receiptCode"
      >
        <el-button
          v-if="record"
          type="primary"
          class="lb-btn-primary drawer-header-action"
          :loading="printing"
          @mouseenter="record?.id && prefetchReceiptPdfApi(record.id)"
          @focus="record?.id && prefetchReceiptPdfApi(record.id)"
          @click="onPrintReceipt"
        >
          {{ t('receipt.printReceipt') }}
        </el-button>
      </DrawerDetailHeader>
    </template>
    <template v-if="record">
      <section class="detail-section">
        <h3>{{ t('receipt.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('receipt.fields.receiptCode') }}</dt>
            <dd>{{ record.receiptCode }}</dd>
          </div>
          <div>
            <dt>{{ t('receipt.fields.kind') }}</dt>
            <dd>
              <StatusBadge
                :tone="receiptKindTone(record.kind)"
                :label="kindLabel(record.kind)"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('receipt.fields.paymentMethod') }}</dt>
            <dd>{{ dash(record.paymentMethod) }}</dd>
          </div>
          <div>
            <dt>{{ t('receipt.fields.customerName') }}</dt>
            <dd>
              <button
                v-if="record.customerId"
                type="button"
                class="fk-link"
                @click="emit('openCustomer', record.customerId)"
              >
                {{ record.customerName || '—' }}
              </button>
              <template v-else>{{ dash(record.customerName) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('receipt.fields.paymentDate') }}</dt>
            <dd>{{ dash(record.paymentDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('receipt.fields.contractCode') }}</dt>
            <dd>
              <button
                v-if="record.contractId"
                type="button"
                class="fk-link"
                @click="emit('openContract', record.contractId)"
              >
                {{ record.contractCode || '—' }}
              </button>
              <template v-else>{{ dash(record.contractCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('receipt.fields.invoiceCode') }}</dt>
            <dd>
              <button
                v-if="record.invoiceId && !(record.allocations && record.allocations.length > 1)"
                type="button"
                class="fk-link"
                @click="emit('openInvoice', record.invoiceId)"
              >
                {{ record.invoiceCode || '—' }}
              </button>
              <template v-else>{{ dash(record.invoiceCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('receipt.fields.receivableCode') }}</dt>
            <dd>
              <button
                v-if="record.receivableId && !(record.allocations && record.allocations.length > 1)"
                type="button"
                class="fk-link"
                @click="emit('openReceivable', record.receivableId)"
              >
                {{ record.receivableCode || '—' }}
              </button>
              <template v-else>{{ dash(record.receivableCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('receipt.fields.amount') }}</dt>
            <dd>{{ money(record.amount) }}</dd>
          </div>
        </dl>
      </section>

      <section
        v-if="record.allocations && record.allocations.length"
        class="detail-section"
      >
        <h3>{{ t('receipt.sections.allocations') }}</h3>
        <ul class="receipt-alloc-list">
          <li
            v-for="a in record.allocations"
            :key="a.id"
            class="receipt-alloc"
          >
            <div class="receipt-alloc__main">
              <button
                v-if="a.receivableId"
                type="button"
                class="fk-link"
                @click="emit('openReceivable', a.receivableId)"
              >
                {{ a.invoiceCode || a.receivableCode || '—' }}
              </button>
              <span v-else>{{ a.invoiceCode || a.receivableCode || '—' }}</span>
              <strong>{{ money(a.amount) }}</strong>
            </div>
            <div v-if="a.receivableCode && a.invoiceCode" class="receipt-alloc__meta">
              {{ a.receivableCode }}
            </div>
          </li>
        </ul>
      </section>

      <section v-if="isBookingDeposit" class="detail-section" v-loading="accountLoading">
        <div class="booking-dep-head">
          <h3>{{ t('receipt.sections.bookingDeposit') }}</h3>
          <div class="booking-dep-head__actions">
            <el-button
              v-if="receiptPerms.create && refundableBalance > 0"
              v-admin-glow="receiptPerms.codes.create"
              type="primary"
              class="lb-btn-primary"
              size="small"
              @click="openRefund"
            >
              {{ t('receipt.bookingDeposit.refundAction') }}
            </el-button>
          </div>
        </div>
        <dl v-if="account" class="detail-grid two">
          <div>
            <dt>{{ t('receipt.bookingDeposit.receiptPrincipal') }}</dt>
            <dd>{{ money(account.principal) }}</dd>
          </div>
          <div>
            <dt>{{ t('receipt.bookingDeposit.contractBalance') }}</dt>
            <dd class="booking-dep-balance">{{ money(refundableBalance) }}</dd>
          </div>
          <div>
            <dt>{{ t('receipt.bookingDeposit.applied') }}</dt>
            <dd>{{ money(account.applied) }}</dd>
          </div>
          <div>
            <dt>{{ t('receipt.bookingDeposit.refunded') }}</dt>
            <dd>{{ money(account.refunded) }}</dd>
          </div>
        </dl>
        <h4 class="booking-dep-mov-title">
          {{ t('receipt.bookingDeposit.receiptMovements') }}
        </h4>
        <div v-if="account?.movements?.length" class="booking-dep-mov-list">
          <div
            v-for="m in account.movements"
            :key="m.id"
            class="booking-dep-mov"
          >
            <div class="booking-dep-mov__main">
              <span class="booking-dep-mov__type">{{ movementTypeLabel(m.type) }}</span>
              <span class="booking-dep-mov__amt">{{ formatMoney(m.amount) }}</span>
            </div>
            <div class="booking-dep-mov__meta">
              <span>{{ m.movementDate || '—' }}</span>
              <template v-if="m.invoiceCode?.trim()">
                <span>· </span>
                <button
                  v-if="m.receivableId"
                  type="button"
                  class="fk-link booking-dep-mov__target"
                  @click="emit('openReceivable', m.receivableId)"
                >
                  {{ t('receipt.bookingDeposit.movementTarget', { invoice: m.invoiceCode }) }}
                </button>
                <span v-else>
                  {{ t('receipt.bookingDeposit.movementTarget', { invoice: m.invoiceCode }) }}
                </span>
              </template>
              <span v-else-if="m.offsetReceiptCode">· {{ m.offsetReceiptCode }}</span>
              <span v-if="movementRemarkVisible(m.remark, m.invoiceCode)">· {{ m.remark }}</span>
            </div>
          </div>
        </div>
        <div v-else class="booking-dep-empty">
          {{ t('receipt.bookingDeposit.emptyMovements') }}
        </div>
      </section>

      <section class="detail-section">
        <h3>{{ t('receipt.sections.finance') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('receipt.fields.cashFlowCount') }}</dt>
            <dd>
              <CountListPill
                :count="record.cashFlowCount ?? 0"
                @click="() => {
                  if ((record?.cashFlowCount ?? 0) > 0) emit('openCashFlows', record)
                }"
              />
            </dd>
          </div>
          <div class="detail-span-2">
            <dt>{{ t('receipt.fields.attachments') }}</dt>
            <dd>
              <ReceiptAttachmentList
                :receipt-id="record.id"
                :attachments="record.attachments || []"
              />
            </dd>
          </div>
          <div class="detail-span-2">
            <dt>{{ t('receipt.fields.remark') }}</dt>
            <dd>{{ dash(record.remark) }}</dd>
          </div>
          <div v-if="!isBookingDeposit" class="detail-span-2">
            <dt>{{ t('receipt.fields.changeLog') }}</dt>
            <dd class="change-log-text">{{ changeLogDisplay }}</dd>
          </div>
        </dl>
      </section>
      <AuditDetailSection
        :created-by="record.createdBy"
        :created-at="record.createdAt"
        :updated-by="record.updatedBy"
        :updated-at="record.updatedAt"
      />
    </template>
  </el-drawer>

  <el-dialog
    v-model="refundVisible"
    :title="t('receipt.bookingDeposit.refundTitle')"
    width="420px"
    append-to-body
    destroy-on-close
    class="lb-dialog"
  >
    <el-form label-position="top">
      <el-form-item :label="t('receipt.bookingDeposit.refundAmount')" required>
        <el-input-number
          v-model="refundForm.amount"
          :min="0.01"
          :max="refundableBalance"
          :precision="2"
          controls-position="right"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item :label="t('receipt.bookingDeposit.refundDate')" required>
        <el-date-picker
          v-model="refundForm.refundDate"
          type="date"
          value-format="YYYY-MM-DD"
          style="width: 100%"
        />
      </el-form-item>
      <el-form-item :label="t('receipt.fields.remark')">
        <el-input v-model="refundForm.remark" type="textarea" :rows="2" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button :disabled="refundSubmitting" @click="refundVisible = false">
        {{ t('common.cancel') }}
      </el-button>
      <el-button
        type="primary"
        class="lb-btn-primary"
        :loading="refundSubmitting"
        @click="submitRefund"
      >
        {{ t('common.submit') }}
      </el-button>
    </template>
  </el-dialog>

</template>

<style scoped>
.receipt-alloc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.receipt-alloc {
  padding: 8px 10px;
  border-radius: 8px;
  background: #f4f7f5;
  border: 1px solid #e4ebe6;
}

.receipt-alloc__main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.receipt-alloc__main strong {
  font-variant-numeric: tabular-nums;
  color: var(--lb-brand, #0f4a32);
}

.receipt-alloc__meta {
  margin-top: 4px;
  font-size: 12px;
  color: #6a7a70;
}

.booking-dep-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.booking-dep-head h3 {
  margin: 0;
}

.booking-dep-head__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.booking-dep-balance {
  font-weight: 700;
  color: var(--lb-brand, #0f4a32);
}

.booking-dep-mov-title {
  margin: 14px 0 8px;
  font-size: 0.86rem;
  color: #3d4f45;
}

.booking-dep-mov-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.booking-dep-mov {
  padding: 8px 10px;
  border-radius: 8px;
  background: #f4f7f5;
  border: 1px solid #e4ebe6;
}

.booking-dep-mov__main {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-weight: 650;
}

.booking-dep-mov__meta {
  margin-top: 4px;
  font-size: 0.78rem;
  color: #6a7a70;
}

.booking-dep-mov__target {
  font-size: inherit;
  vertical-align: baseline;
}

.booking-dep-empty {
  padding: 12px;
  text-align: center;
  color: #6a7a70;
  font-size: 0.84rem;
}

.change-log-text {
  white-space: pre-line;
  word-break: break-word;
}
</style>
