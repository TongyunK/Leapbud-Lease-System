<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DepositRefundRecord } from '@/types/deposit-refund'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import CountListPill from '@/components/CountListPill.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { depositRefundStatusTone } from '@/constants/statusBadges'
import { formatMoney } from '@/utils/format'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    record: DepositRefundRecord | null
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    desktopDirection: 'rtl',
    size: undefined,
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
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :title="t('depositRefund.detailTitle')"
    :direction="direction"
    class="responsive-drawer"
  >
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
            <dt>{{ t('depositRefund.fields.totalDeposit') }}</dt>
            <dd>{{ money(record.totalDeposit) }}</dd>
          </div>
          <div>
            <dt>{{ t('depositRefund.fields.actualRefundAmount') }}</dt>
            <dd>{{ money(record.actualRefundAmount) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('depositRefund.fields.voucherImage') }}</dt>
            <dd class="path-text">{{ dash(record.voucherImage) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('depositRefund.fields.voucherAttachment') }}</dt>
            <dd class="path-text">{{ dash(record.voucherAttachment) }}</dd>
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
