<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CashFlowRecord } from '@/types/cash-flow'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import DrawerDetailHeader from '@/components/DrawerDetailHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { cashFlowDirectionTone, cashFlowSourceTypeTone } from '@/constants/statusBadges'
import { formatMoney } from '@/utils/format'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    record: CashFlowRecord | null
    desktopDirection?: 'ltr' | 'rtl'
  
    /** 叠在其它弹窗／抽屉之上时传入更高 z-index */
    zIndex?: number
  }>(),
  { desktopDirection: 'rtl' ,
    zIndex: undefined,
  },
)

const emit = defineEmits<{
  openContract: [contractId: string]
  openCustomer: [customerId: string]
  openReceipt: [receiptId: string]
  openRefundOrder: [refundOrderId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => (isMobile.value ? '100%' : '520px'))

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function money(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

function onOpenSourceRef() {
  const row = props.record
  if (!row) return
  if (row.receiptId) {
    emit('openReceipt', row.receiptId)
    return
  }
  if (row.refundOrderId) emit('openRefundOrder', row.refundOrderId)
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
        :title="t('cashFlow.detailTitle')"
        :code="record?.flowCode"
      />
    </template>
    <template v-if="record">
      <section class="detail-section">
        <h3>{{ t('cashFlow.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('cashFlow.fields.flowCode') }}</dt>
            <dd>{{ record.flowCode }}</dd>
          </div>
          <div>
            <dt>{{ t('cashFlow.fields.direction') }}</dt>
            <dd>
              <StatusBadge
                :tone="cashFlowDirectionTone(record.direction)"
                :label="t(`cashFlow.direction.${record.direction}`, record.direction)"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('cashFlow.fields.amount') }}</dt>
            <dd>{{ money(record.amount) }}</dd>
          </div>
          <div>
            <dt>{{ t('cashFlow.fields.flowDate') }}</dt>
            <dd>{{ dash(record.flowDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('cashFlow.fields.sourceType') }}</dt>
            <dd>
              <StatusBadge
                :tone="cashFlowSourceTypeTone(record.sourceType)"
                :label="t(`cashFlow.sourceType.${record.sourceType}`, record.sourceType)"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('cashFlow.fields.sourceRef') }}</dt>
            <dd>
              <button
                v-if="record.receiptId || record.refundOrderId"
                type="button"
                class="fk-link"
                @click="onOpenSourceRef"
              >
                {{ record.receiptCode || record.refundOrderCode || '—' }}
              </button>
              <template v-else>
                {{ dash(record.receiptCode || record.refundOrderCode) }}
              </template>
            </dd>
          </div>
          <div>
            <dt>{{ t('cashFlow.fields.contractCode') }}</dt>
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
            <dt>{{ t('cashFlow.fields.customerName') }}</dt>
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
            <dt>{{ t('cashFlow.fields.paymentMethod') }}</dt>
            <dd>{{ dash(record.paymentMethod) }}</dd>
          </div>
          <div>
            <dt>{{ t('common.remark') }}</dt>
            <dd>{{ dash(record.remark) }}</dd>
          </div>
        </dl>
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
