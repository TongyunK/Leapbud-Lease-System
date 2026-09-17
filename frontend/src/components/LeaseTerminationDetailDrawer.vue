<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { LeaseTerminationRecord } from '@/types/lease-termination'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import CountListPill from '@/components/CountListPill.vue'
import { formatMoney } from '@/utils/format'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    termination: LeaseTerminationRecord | null
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
  openOtherFees: [row: LeaseTerminationRecord]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '640px'))

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function money(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :title="t('leaseTermination.detailTitle')"
    :direction="direction"
    class="responsive-drawer"
  >
    <template v-if="termination">
      <section class="detail-section">
        <h3>{{ t('leaseTermination.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('leaseTermination.fields.terminationCode') }}</dt>
            <dd>{{ termination.terminationCode }}</dd>
          </div>
          <div>
            <dt>{{ t('leaseTermination.fields.terminationDate') }}</dt>
            <dd>{{ dash(termination.terminationDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('leaseTermination.fields.contractCode') }}</dt>
            <dd>
              <button
                v-if="termination.contractId"
                type="button"
                class="fk-link"
                @click="emit('openContract', termination.contractId)"
              >
                {{ termination.contractCode || '—' }}
              </button>
              <template v-else>{{ dash(termination.contractCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('leaseTermination.fields.customerName') }}</dt>
            <dd>
              <button
                v-if="termination.customerId"
                type="button"
                class="fk-link"
                @click="emit('openCustomer', termination.customerId)"
              >
                {{ termination.customerName || '—' }}
              </button>
              <template v-else>{{ dash(termination.customerName) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('leaseTermination.fields.roomCode') }}</dt>
            <dd>
              <button
                v-if="termination.roomId"
                type="button"
                class="fk-link"
                @click="emit('openRoom', termination.roomId)"
              >
                {{ termination.roomCode || '—' }}
              </button>
              <template v-else>{{ dash(termination.roomCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('leaseTermination.fields.relatedDepositRefund') }}</dt>
            <dd>{{ dash(termination.relatedDepositRefund) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('leaseTermination.fields.reason') }}</dt>
            <dd>{{ dash(termination.reason) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('leaseTermination.fields.siteCondition') }}</dt>
            <dd>{{ dash(termination.siteCondition) }}</dd>
          </div>
          <div>
            <dt>{{ t('leaseTermination.fields.doorKeyReturnedQty') }}</dt>
            <dd>{{ termination.doorKeyReturnedQty ?? 0 }}</dd>
          </div>
          <div>
            <dt>{{ t('leaseTermination.fields.smartCardReturnedQty') }}</dt>
            <dd>{{ termination.smartCardReturnedQty ?? 0 }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('leaseTermination.fields.noticeAttachment') }}</dt>
            <dd class="path-text">{{ dash(termination.noticeAttachment) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('leaseTermination.fields.remark') }}</dt>
            <dd>{{ dash(termination.remark) }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="termination.otherFees?.length" class="detail-section">
        <h3>{{ t('leaseTermination.sections.otherFees') }}</h3>
        <div class="fee-list">
          <div v-for="(fee, i) in termination.otherFees" :key="fee.id || i" class="fee-list__item">
            <strong>{{ fee.description || '—' }}</strong>
            <span>× {{ fee.quantity }}</span>
            <span>{{ money(fee.unitAmount) }}</span>
            <span>{{ money(fee.subtotal ?? fee.quantity * fee.unitAmount) }}</span>
          </div>
        </div>
      </section>

            <section class="detail-section">
        <h3>{{ t('leaseTermination.sections.relatedRecords') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('leaseTermination.fields.otherFeeCount') }}</dt>
            <dd>
              <CountListPill
                :count="termination.otherFeeCount ?? 0"
                @click="() => { if (termination?.otherFeeCount) emit('openOtherFees', termination) }"
              />
            </dd>
          </div>
        </dl>
      </section>

      <AuditDetailSection
        :created-by="termination.createdBy"
        :created-at="termination.createdAt"
        :updated-by="termination.updatedBy"
        :updated-at="termination.updatedAt"
      />
    </template>
  </el-drawer>
</template>

<style scoped>
.fee-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fee-list__item {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px 12px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--lb-surface-muted, rgba(0, 0, 0, 0.03));
  font-size: 0.9rem;
}

.fee-list__item strong {
  min-width: 6rem;
}
</style>
