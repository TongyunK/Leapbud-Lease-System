<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ContractLoanItemRecord } from '@/types/contract-loan-item'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import DrawerDetailHeader from '@/components/DrawerDetailHeader.vue'
import { formatMoney } from '@/utils/format'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    fee: ContractLoanItemRecord | null
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
        :title="t('contractLoanItem.detailTitle')"
        :code="fee?.contractCode || fee?.description"
      />
    </template>
    <template v-if="fee">
      <section class="detail-section">
        <h3>{{ t('contractLoanItem.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('contractLoanItem.fields.contractCode') }}</dt>
            <dd>
              <button
                v-if="fee.contractId"
                type="button"
                class="fk-link"
                @click="emit('openContract', fee.contractId)"
              >
                {{ fee.contractCode || '—' }}
              </button>
              <template v-else>{{ dash(fee.contractCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('contractLoanItem.fields.customerName') }}</dt>
            <dd>
              <button
                v-if="fee.customerId"
                type="button"
                class="fk-link"
                @click="emit('openCustomer', fee.customerId)"
              >
                {{ fee.customerName || '—' }}
              </button>
              <template v-else>{{ dash(fee.customerName) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('contractLoanItem.fields.roomCode') }}</dt>
            <dd>
              <button
                v-if="fee.roomId"
                type="button"
                class="fk-link"
                @click="emit('openRoom', fee.roomId)"
              >
                {{ fee.roomCode || '—' }}
              </button>
              <template v-else>{{ dash(fee.roomCode) }}</template>
            </dd>
          </div>
          <div class="full">
            <dt>{{ t('contractLoanItem.fields.description') }}</dt>
            <dd>{{ dash(fee.description) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('contractLoanItem.sections.finance') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('contractLoanItem.fields.quantity') }}</dt>
            <dd>{{ fee.quantity ?? '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('contractLoanItem.fields.unitAmount') }}</dt>
            <dd>{{ money(fee.unitAmount) }}</dd>
          </div>
          <div>
            <dt>{{ t('contractLoanItem.fields.subtotal') }}</dt>
            <dd>{{ money(fee.subtotal) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('contractLoanItem.fields.remark') }}</dt>
            <dd>{{ dash(fee.remark) }}</dd>
          </div>
        </dl>
      </section>

      <AuditDetailSection
        :created-by="fee.createdBy"
        :created-at="fee.createdAt"
        :updated-by="fee.updatedBy"
        :updated-at="fee.updatedAt"
      />
    </template>
  </el-drawer>
</template>
