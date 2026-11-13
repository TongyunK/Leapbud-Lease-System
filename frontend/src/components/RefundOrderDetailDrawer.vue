<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { QuestionFilled } from '@element-plus/icons-vue'
import type { RefundOrderRecord } from '@/types/refund-order'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import CountListPill from '@/components/CountListPill.vue'
import DrawerDetailHeader from '@/components/DrawerDetailHeader.vue'
import RefundOrderAttachmentList from '@/components/RefundOrderAttachmentList.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { refundOrderStatusTone } from '@/constants/statusBadges'
import { formatMoney } from '@/utils/format'
import { buildRefundOrderItemAlloc } from '@/utils/refundOrderAlloc'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    record: RefundOrderRecord | null
    desktopDirection?: 'ltr' | 'rtl'
    /** 叠在其它弹窗（如退租详情）之上时传入更高 z-index */
    zIndex?: number
  }>(),
  { desktopDirection: 'rtl', zIndex: undefined },
)

const emit = defineEmits<{
  openContract: [contractId: string]
  openCustomer: [customerId: string]
  openRoom: [roomId: string]
  openSettlement: [settlementId: string]
  openCashFlows: [record: RefundOrderRecord]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => (isMobile.value ? '100%' : '560px'))

const allocRows = computed(() => {
  const row = props.record
  if (!row) return []
  return buildRefundOrderItemAlloc(row.items || [], Number(row.paidAmount) || 0)
})

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function money(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

function onOpenCashFlows() {
  if (!props.record || !(props.record.cashFlowCount ?? 0)) return
  emit('openCashFlows', props.record)
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
        :title="t('refundOrder.detailTitle')"
        :code="record?.refundCode"
      />
    </template>
    <template v-if="record">
      <section class="detail-section">
        <h3>{{ t('refundOrder.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('refundOrder.fields.refundCode') }}</dt>
            <dd>{{ record.refundCode }}</dd>
          </div>
          <div>
            <dt>{{ t('refundOrder.fields.status') }}</dt>
            <dd>
              <StatusBadge
                :tone="refundOrderStatusTone(record.status)"
                :label="t(`refundOrder.status.${record.status}`, record.status)"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('refundOrder.fields.contractCode') }}</dt>
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
            <dt>{{ t('refundOrder.fields.customerName') }}</dt>
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
            <dt>{{ t('refundOrder.fields.settlementCode') }}</dt>
            <dd>
              <button
                v-if="record.settlementId"
                type="button"
                class="fk-link"
                @click="emit('openSettlement', record.settlementId)"
              >
                {{ record.settlementCode || '—' }}
              </button>
              <template v-else>{{ dash(record.settlementCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('refundOrder.fields.roomCode') }}</dt>
            <dd>
              <button
                v-if="record.roomId"
                type="button"
                class="fk-link"
                @click="emit('openRoom', record.roomId)"
              >
                {{ record.roomCode || '—' }}
              </button>
              <template v-else>{{ dash(record.roomCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('refundOrder.fields.amount') }}</dt>
            <dd>{{ money(record.amount) }}</dd>
          </div>
          <div>
            <dt>{{ t('refundOrder.fields.paidAmount') }}</dt>
            <dd>{{ money(record.paidAmount) }}</dd>
          </div>
          <div>
            <dt>{{ t('refundOrder.fields.remainingAmount') }}</dt>
            <dd>
              {{
                money(
                  record.remainingAmount != null
                    ? record.remainingAmount
                    : Math.max(0, Number(record.amount || 0) - Number(record.paidAmount || 0)),
                )
              }}
            </dd>
          </div>
          <div>
            <dt>{{ t('refundOrder.fields.paymentMethod') }}</dt>
            <dd>{{ dash(record.paymentMethod) }}</dd>
          </div>
          <div>
            <dt>{{ t('refundOrder.fields.handler') }}</dt>
            <dd>{{ dash(record.handler) }}</dd>
          </div>
          <div>
            <dt>{{ t('refundOrder.fields.cashFlowCount') }}</dt>
            <dd>
              <CountListPill
                :count="record.cashFlowCount ?? 0"
                @click="onOpenCashFlows"
              />
            </dd>
          </div>
          <div class="full">
            <dt>{{ t('refundOrder.fields.attachments') }}</dt>
            <dd>
              <RefundOrderAttachmentList
                :refund-order-id="record.id"
                :attachments="record.attachments || []"
              />
            </dd>
          </div>
          <div class="full">
            <dt>{{ t('common.remark') }}</dt>
            <dd class="remark-text">{{ dash(record.remark) }}</dd>
          </div>
        </dl>
      </section>

      <section
        v-if="record.settlementId && (record.settlementRefundDueTotal != null || record.settlementRefundRemaining != null)"
        class="detail-section"
      >
        <h3>{{ t('refundOrder.sections.settlement') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('refundOrder.fields.settlementRefundDue') }}</dt>
            <dd>{{ money(record.settlementRefundDueTotal) }}</dd>
          </div>
          <div>
            <dt>{{ t('refundOrder.fields.settlementRefunded') }}</dt>
            <dd>{{ money(record.settlementRefundedTotal) }}</dd>
          </div>
          <div>
            <dt>{{ t('refundOrder.fields.settlementRefundRemaining') }}</dt>
            <dd>{{ money(record.settlementRefundRemaining) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('refundOrder.sections.items') }}</h3>
        <div v-if="allocRows.length" class="refund-alloc">
          <div class="refund-alloc__head">
            <span>{{ t('contract.cancelRefundAllocPreview') }}</span>
            <el-tooltip
              :content="t('contract.cancelRefundAllocFifoHint')"
              placement="top"
              :fallback-placements="['top', 'left', 'right']"
            >
              <el-icon class="refund-alloc__tip" :size="14"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
          <ul class="refund-alloc__list">
            <li v-for="row in allocRows" :key="row.key" class="refund-alloc__row">
              <span class="refund-alloc__code">{{ row.label }}</span>
              <span class="refund-alloc__parts">
                <span class="refund-alloc__tag is-due">
                  {{ t('contract.cancelRefundAllocDue', { amount: money(row.due) }) }}
                </span>
                <span v-if="row.refundPart > 0.009" class="refund-alloc__tag is-now">
                  {{
                    t('refundOrder.allocPaid', {
                      amount: money(row.refundPart),
                    })
                  }}
                </span>
                <span
                  v-if="row.remainAfter <= 0.009 && row.refundPart > 0.009"
                  class="refund-alloc__tag is-settled"
                >
                  {{ t('contract.cancelRefundAllocSettled') }}
                </span>
                <span v-else-if="row.remainAfter > 0.009" class="refund-alloc__tag is-later">
                  {{
                    t('contract.cancelRefundAllocLater', {
                      amount: money(row.remainAfter),
                    })
                  }}
                </span>
              </span>
            </li>
          </ul>
        </div>
        <p v-else class="refund-alloc__empty">{{ t('refundOrder.noItems') }}</p>
      </section>

      <AuditDetailSection
        :created-by="record.createdBy"
        :updated-by="record.updatedBy"
        :created-at="record.createdAt"
        :updated-at="record.updatedAt"
      />
    </template>
  </el-drawer>
</template>

<style scoped>
.refund-alloc {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f4f7f5;
  border: 1px solid #e4ebe6;
}
.refund-alloc__head {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 8px;
  font-size: 0.86rem;
  font-weight: 700;
  color: #2f3f36;
}
.refund-alloc__tip {
  color: #8a9a90;
  cursor: help;
}
.refund-alloc__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.refund-alloc__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 9px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid #e0e8e3;
}
.refund-alloc__code {
  min-width: 0;
  font-size: 0.84rem;
  font-weight: 650;
  color: #3a4a42;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.refund-alloc__parts {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  flex-shrink: 0;
}
.refund-alloc__tag {
  font-size: 0.75rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 2px 7px;
  border-radius: 999px;
}
.refund-alloc__tag.is-due {
  color: #5a3d12;
  background: #f3e6d0;
}
.refund-alloc__tag.is-now {
  color: #0f4a32;
  background: #ddeee4;
}
.refund-alloc__tag.is-settled {
  color: #0f4a32;
  background: #d8f0e4;
}
.refund-alloc__tag.is-later {
  color: #8a2f2f;
  background: #f6e0e0;
}
.refund-alloc__empty {
  margin: 0;
  color: #7a8a80;
  font-size: 0.9rem;
}
</style>
