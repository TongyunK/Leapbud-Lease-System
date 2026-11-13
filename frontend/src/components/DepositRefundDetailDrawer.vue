<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DepositRefundRecord } from '@/types/deposit-refund'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import CountListPill from '@/components/CountListPill.vue'
import DepositRefundAttachmentList from '@/components/DepositRefundAttachmentList.vue'
import DrawerDetailHeader from '@/components/DrawerDetailHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { depositRefundStatusTone } from '@/constants/statusBadges'
import { formatMoney } from '@/utils/format'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    record: DepositRefundRecord | null
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
  openContract: [contractId: string]
  openCustomer: [customerId: string]
  openRoom: [roomId: string]
  openReceivables: [row: DepositRefundRecord]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '560px'))

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function money(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

function statusLabel(status: string) {
  const key = `depositRefund.status.${status}`
  return t(key) === key ? status : t(key)
}

/** 应退按金（已收按金 − 扣除后的快照；兼容旧单无 refundDueAmount） */
const refundDue = computed(() => {
  const r = props.record
  if (!r) return null
  const due = Number(r.refundDueAmount)
  if (Number.isFinite(due) && due >= 0) return due
  return Number(r.actualRefundAmount) || 0
})

const refundRemaining = computed(() =>
  Math.max(0, refundDue.value - (Number(props.record?.actualRefundAmount) || 0)),
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
        :title="t('depositRefund.detailTitle')"
        :code="record?.refundCode"
      />
    </template>
    <template v-if="record">
      <section class="detail-section">
        <h3>{{ t('depositRefund.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('depositRefund.fields.refundCode') }}</dt>
            <dd>{{ record.refundCode }}</dd>
          </div>
          <div>
            <dt>{{ t('depositRefund.fields.status') }}</dt>
            <dd>
              <StatusBadge
                :tone="depositRefundStatusTone(record.status)"
                :label="statusLabel(record.status)"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('depositRefund.fields.contractCode') }}</dt>
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
            <dt>{{ t('depositRefund.fields.customerName') }}</dt>
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
            <dt>{{ t('depositRefund.fields.roomName') }}</dt>
            <dd>
              <button
                v-if="record.roomId"
                type="button"
                class="fk-link"
                @click="emit('openRoom', record.roomId)"
              >
                {{ record.roomName || record.roomCode || '—' }}
              </button>
              <template v-else>{{ dash(record.roomName || record.roomCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('depositRefund.fields.handler') }}</dt>
            <dd>{{ dash(record.handler) }}</dd>
          </div>
          <div>
            <dt>{{ t('depositRefund.fields.terminationDate') }}</dt>
            <dd>{{ dash(record.terminationDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('depositRefund.fields.refundDate') }}</dt>
            <dd>{{ dash(record.refundDate) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('depositRefund.sections.finance') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('depositRefund.fields.refundDueAmount') }}</dt>
            <dd>{{ money(refundDue) }}</dd>
          </div>
          <div>
            <dt>{{ t('depositRefund.fields.actualRefundAmount') }}</dt>
            <dd>{{ money(record.actualRefundAmount) }}</dd>
          </div>
          <div>
            <dt>{{ t('depositRefund.fields.refundRemaining') }}</dt>
            <dd>{{ money(refundRemaining) }}</dd>
          </div>
          <div>
            <dt>{{ t('depositRefund.fields.bookingDepositRefundAmount') }}</dt>
            <dd>{{ money(record.bookingDepositRefundAmount) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('depositRefund.fields.attachments') }}</dt>
            <dd>
              <DepositRefundAttachmentList
                :deposit-refund-id="record.id"
                :attachments="record.attachments || []"
              />
            </dd>
          </div>
          <div class="full">
            <dt>{{ t('depositRefund.fields.remark') }}</dt>
            <dd>{{ dash(record.remark) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('depositRefund.sections.relatedRecords') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('depositRefund.fields.receivableCount') }}</dt>
            <dd>
              <CountListPill
                :count="record.receivableCount ?? 0"
                @click="() => { if (record?.receivableCount) emit('openReceivables', record) }"
              />
            </dd>
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
</template>
