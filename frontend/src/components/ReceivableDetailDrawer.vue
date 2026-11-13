<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ReceivableRecord } from '@/types/receivable'
import type { ReceivableWriteoffRecord } from '@/types/contract-settlement'
import { fetchWriteoffsByReceivable } from '@/api/contract-settlements'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import CountListPill from '@/components/CountListPill.vue'
import DrawerDetailHeader from '@/components/DrawerDetailHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import {
  receivableValidityKey,
  receivableValidityTone,
} from '@/constants/statusBadges'
import { formatMoney } from '@/utils/format'
import { pairDepositAppliesWithCash } from '@/utils/pairReceivableCollections'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    record: ReceivableRecord | null
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
    /** 叠在其它弹窗（如退租详情）之上时传入更高 z-index */
    zIndex?: number
  }>(),
  {
    desktopDirection: 'rtl',
    size: undefined,
    zIndex: undefined,
  },
)

const emit = defineEmits<{
  openInvoice: [invoiceId: string]
  openContract: [contractId: string]
  openCustomer: [customerId: string]
  openReceipts: [row: ReceivableRecord]
  openReceipt: [receiptId: string]
  openCashFlows: [row: ReceivableRecord]
}>()

const { t, te } = useI18n()
const isMobile = useIsMobile()
const writeoffs = ref<ReceivableWriteoffRecord[]>([])
const writeoffsLoading = ref(false)

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '560px'))

function writeoffReasonLabel(code?: string | null) {
  const c = (code || '').trim()
  if (!c) return '—'
  const key = `contractSettlement.writeoffReason.${c}`
  return te(key) ? t(key) : c
}

function writeoffDirectionLabel(code?: string | null) {
  const c = (code || '').trim()
  if (!c) return '—'
  const key = `contractSettlement.writeoffDirection.${c}`
  return te(key) ? t(key) : c
}

const pairedCollections = computed(() =>
  pairDepositAppliesWithCash(
    props.record?.bookingDepositApplies ?? [],
    (props.record?.receipts ?? []).map((r) => ({
      id: r.id,
      receiptCode: r.receiptCode,
      paymentDate: r.paymentDate,
      paymentMethod: r.paymentMethod,
      amount: r.amount,
      status: r.status,
    })),
  ),
)

/** 仅展示含定金抵扣的配对 */
const depositApplyPairs = computed(() => pairedCollections.value.filter((row) => !!row.apply))

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function money(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

function validityLabel(invoiceStatus: string | null | undefined) {
  return receivableValidityKey(invoiceStatus) === 'invalid'
    ? t('receivable.quickFilterInvalid')
    : t('receivable.quickFilterActive')
}

async function loadWriteoffs(id: string) {
  writeoffsLoading.value = true
  try {
    const { data } = await fetchWriteoffsByReceivable(id)
    writeoffs.value = data ?? []
  } catch {
    writeoffs.value = []
  } finally {
    writeoffsLoading.value = false
  }
}

watch(
  () => [visible.value, props.record?.id] as const,
  ([open, id]) => {
    if (open && id) void loadWriteoffs(id)
    if (!open) writeoffs.value = []
  },
)
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
        :title="t('receivable.detailTitle')"
        :code="record?.invoiceCode || record?.receivableCode"
      />
    </template>
    <template v-if="record">
      <section class="detail-section">
        <h3>{{ t('receivable.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('receivable.fields.invoiceCode') }}</dt>
            <dd>
              <button
                v-if="record.invoiceId"
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
            <dt>{{ t('receivable.fields.contractCode') }}</dt>
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
            <dt>{{ t('receivable.fields.customerName') }}</dt>
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
            <dt>{{ t('receivable.fields.validity') }}</dt>
            <dd>
              <StatusBadge
                :tone="receivableValidityTone(record.invoiceStatus)"
                :label="validityLabel(record.invoiceStatus)"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('receivable.fields.invoiceDate') }}</dt>
            <dd>{{ dash(record.invoiceDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('receivable.fields.paymentDueDate') }}</dt>
            <dd>{{ dash(record.paymentDueDate) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('receivable.sections.finance') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('receivable.fields.invoiceAmount') }}</dt>
            <dd>{{ money(record.invoiceAmount) }}</dd>
          </div>
          <div>
            <dt>{{ t('receivable.fields.receivedAmount') }}</dt>
            <dd>{{ money(record.receivedAmount) }}</dd>
          </div>
          <div>
            <dt>{{ t('receivable.fields.receivableAmount') }}</dt>
            <dd>{{ money(record.receivableAmount) }}</dd>
          </div>
          <div>
            <dt>{{ t('receivable.fields.refundedAmount') }}</dt>
            <dd>{{ money(record.refundedAmount) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('receivable.fields.remark') }}</dt>
            <dd>{{ dash(record.remark) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('receivable.sections.relatedReceipts') }}</h3>
        <dl
          class="detail-grid receipt-collect-grid"
          :class="{ 'receipt-collect-grid--pairs': depositApplyPairs.length }"
        >
          <div class="receipt-collect-grid__count">
            <dt>{{ t('receivable.fields.receiptCount') }}</dt>
            <dd>
              <CountListPill
                :count="record.receipts?.length ?? record.receiptCount ?? 0"
                @click="() => {
                  const n = record?.receipts?.length ?? record?.receiptCount ?? 0
                  if (n > 0) emit('openReceipts', record)
                }"
              />
            </dd>
          </div>
          <div class="receipt-collect-grid__count">
            <dt>{{ t('receivable.fields.cashFlowCount') }}</dt>
            <dd>
              <CountListPill
                :count="record.cashFlowCount ?? 0"
                @click="() => {
                  if ((record?.cashFlowCount ?? 0) > 0) emit('openCashFlows', record)
                }"
              />
            </dd>
          </div>
          <div
            v-if="depositApplyPairs.length"
            class="receipt-collect-grid__pairs"
          >
            <dt>{{ t('receivable.fields.collectionPairs') }}</dt>
            <dd>
              <ul class="receipt-pair-list">
                <li v-for="row in depositApplyPairs" :key="row.key" class="receipt-pair">
                  <span class="receipt-pair__part">
                    <span class="receipt-pair__tag">{{ t('receivable.fields.bookingDepositApplies') }}</span>
                    <button
                      type="button"
                      class="fk-link"
                      @click="
                        row.apply?.bookingDepositReceiptId &&
                          emit('openReceipt', row.apply.bookingDepositReceiptId)
                      "
                    >
                      {{ money(row.apply?.amount) }}
                    </button>
                  </span>
                  <span class="receipt-pair__sep" aria-hidden="true">·</span>
                  <span class="receipt-pair__part">
                    <span class="receipt-pair__tag">{{ t('receivable.fields.cashCollections') }}</span>
                    <template v-if="row.cash">
                      <button
                        type="button"
                        class="fk-link"
                        @click="emit('openReceipt', row.cash.id)"
                      >
                        {{
                          t('receivable.cashCollectionLine', {
                            amount: row.cash.amount == null ? '—' : money(row.cash.amount),
                            method: dash(row.cash.paymentMethod),
                          })
                        }}
                      </button>
                    </template>
                    <span v-else class="receipt-pair__empty">—</span>
                  </span>
                </li>
              </ul>
            </dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('receivable.sections.writeoffs') }}</h3>
        <el-table
          v-loading="writeoffsLoading"
          :data="writeoffs"
          border
          empty-text="—"
        >
          <el-table-column
            prop="writeoffCode"
            :label="t('receivable.fields.writeoffCode')"
            min-width="140"
          />
          <el-table-column :label="t('common.amount')" width="110" align="right">
            <template #default="{ row }">{{ money(row.amount) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('receivable.fields.writeoffDirection')"
            min-width="90"
          >
            <template #default="{ row }">{{ writeoffDirectionLabel(row.direction) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('receivable.fields.writeoffReason')"
            min-width="120"
          >
            <template #default="{ row }">{{ writeoffReasonLabel(row.reasonType) }}</template>
          </el-table-column>
          <el-table-column
            prop="writeoffDate"
            :label="t('receivable.fields.writeoffDate')"
            width="120"
          />
        </el-table>
      </section>

      <AuditDetailSection
        :created-by="record.createdBy"
        :created-at="record.createdAt"
        :updated-by="record.updatedBy"
        :updated-at="record.updatedAt"
      />
    </template>
  </el-drawer>
</template>

<style scoped>
/* 收據窄列 + 收款明細宽列（约 1:3.5，对齐设计稿） */
.receipt-collect-grid.receipt-collect-grid--pairs {
  grid-template-columns: minmax(64px, 22%) minmax(0, 78%);
}

.receipt-collect-grid__count,
.receipt-collect-grid__pairs {
  min-width: 0;
}

@media (max-width: 520px) {
  .receipt-collect-grid.receipt-collect-grid--pairs {
    grid-template-columns: 1fr;
  }
}

.receipt-pair-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.receipt-pair {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 6px;
  font-size: 0.86rem;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
}

.receipt-pair__part {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}

.receipt-pair__tag {
  color: #6a7a70;
  font-weight: 650;
}

.receipt-pair__sep {
  color: #b0bbb5;
  user-select: none;
}

.receipt-pair__empty {
  color: #9aa69f;
}
</style>
