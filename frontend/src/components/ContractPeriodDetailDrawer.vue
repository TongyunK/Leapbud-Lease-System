<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ContractPeriodListRecord } from '@/types/contract-period'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    period: ContractPeriodListRecord | null
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
}>()

const { t } = useI18n()
const isMobile = useIsMobile()

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '560px'))

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function periodTypeLabel(dateType: string) {
  return t(`contract.periodTypes.${dateType}`, dateType)
}

function periodUnitLabel(dateUnit: string) {
  return t(`contract.periodUnits.${dateUnit}`, dateUnit)
}

function durationLabel(row: ContractPeriodListRecord) {
  return `${row.dateValue}${periodUnitLabel(row.dateUnit)}`
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :title="t('contractPeriod.detailTitle')"
    :direction="direction"
    class="responsive-drawer"
  >
    <template v-if="period">
      <section class="detail-section">
        <h3>{{ t('contractPeriod.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('contractPeriod.fields.contractCode') }}</dt>
            <dd>
              <button
                v-if="period.contractId"
                type="button"
                class="fk-link"
                @click="emit('openContract', period.contractId)"
              >
                {{ period.contractCode || '—' }}
              </button>
              <template v-else>{{ dash(period.contractCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('contractPeriod.fields.dateType') }}</dt>
            <dd>{{ periodTypeLabel(period.dateType) }}</dd>
          </div>
          <div>
            <dt>{{ t('contractPeriod.fields.customerName') }}</dt>
            <dd>
              <button
                v-if="period.customerId"
                type="button"
                class="fk-link"
                @click="emit('openCustomer', period.customerId)"
              >
                {{ period.customerName || '—' }}
              </button>
              <template v-else>{{ dash(period.customerName) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('contractPeriod.fields.roomCode') }}</dt>
            <dd>
              <button
                v-if="period.roomId"
                type="button"
                class="fk-link"
                @click="emit('openRoom', period.roomId)"
              >
                {{ period.roomCode || '—' }}
              </button>
              <template v-else>{{ dash(period.roomCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('contractPeriod.fields.dateUnit') }}</dt>
            <dd>{{ periodUnitLabel(period.dateUnit) }}</dd>
          </div>
          <div>
            <dt>{{ t('contractPeriod.fields.dateValue') }}</dt>
            <dd>{{ period.dateValue }}</dd>
          </div>
          <div>
            <dt>{{ t('contractPeriod.fields.duration') }}</dt>
            <dd>{{ durationLabel(period) }}</dd>
          </div>
          <div>
            <dt>{{ t('contractPeriod.fields.sortOrder') }}</dt>
            <dd>{{ period.sortOrder }}</dd>
          </div>
          <div>
            <dt>{{ t('contractPeriod.fields.startDate') }}</dt>
            <dd>{{ dash(period.startDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('contractPeriod.fields.endDate') }}</dt>
            <dd>{{ dash(period.endDate) }}</dd>
          </div>
        </dl>
      </section>

      <AuditDetailSection :created-at="period.createdAt" :updated-at="period.updatedAt" />
    </template>
  </el-drawer>
</template>
