<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ContractRecord } from '@/types/contract'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { contractStatusTone } from '@/constants/statusBadges'
import { formatMoney } from '@/utils/format'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    contract: ContractRecord | null
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    desktopDirection: 'rtl',
    size: undefined,
  },
)

const emit = defineEmits<{
  openCustomer: [customerId: string]
  openRoom: [roomId: string]
  openBuilding: [buildingId: string]
  openRequirement: [requirementId: string]
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

function statusLabel(status: string) {
  return t(`contract.status.${status}`, status)
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :title="t('contract.detailTitle')"
    :direction="direction"
    class="responsive-drawer"
  >
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
            <dd>{{ dash(contract.roomNameText || contract.roomName) }}</dd>
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
            <dd>{{ dash(contract.leaseType) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.paymentCycle') }}</dt>
            <dd>{{ dash(contract.paymentCycle) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.subleaseMark') }}</dt>
            <dd>{{ dash(contract.subleaseMark) }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="contract.periods?.length" class="detail-section">
        <h3>{{ t('contract.sections.periods') }}</h3>
        <div class="period-list">
          <div v-for="(p, i) in contract.periods" :key="p.id || i" class="period-list__item">
            <strong>{{ t(`contract.periodTypes.${p.dateType}`, p.dateType) }}</strong>
            <span>{{ p.dateValue }}{{ t(`contract.periodUnits.${p.dateUnit}`, p.dateUnit) }}</span>
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
            <dt>{{ t('contract.fields.bookingDeposit') }}</dt>
            <dd>{{ money(contract.bookingDeposit) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.miscDeposit') }}</dt>
            <dd>{{ money(contract.miscDeposit) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.doorKeyQty') }}</dt>
            <dd>{{ contract.doorKeyQty ?? 0 }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.doorKeyDeposit') }}</dt>
            <dd>{{ money(contract.doorKeyDeposit) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.mailboxKeyQty') }}</dt>
            <dd>{{ contract.mailboxKeyQty ?? 0 }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.mailboxKeyDeposit') }}</dt>
            <dd>{{ money(contract.mailboxKeyDeposit) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.electricityRate') }}</dt>
            <dd>{{ contract.electricityRate == null ? '—' : contract.electricityRate }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('contract.sections.extra') }}</h3>
        <dl class="detail-grid two">
          <div class="full">
            <dt>{{ t('contract.fields.attachment') }}</dt>
            <dd class="path-text">{{ dash(contract.attachment) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('contract.fields.remark') }}</dt>
            <dd>{{ dash(contract.remark) }}</dd>
          </div>
        </dl>
      </section>

      <AuditDetailSection
        :created-by="contract.createdBy"
        :created-at="contract.createdAt"
        :updated-by="contract.updatedBy"
        :updated-at="contract.updatedAt"
      />
    </template>
  </el-drawer>
</template>

<style scoped>
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
</style>
