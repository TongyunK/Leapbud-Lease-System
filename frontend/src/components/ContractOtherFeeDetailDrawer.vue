<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ContractOtherFeeRecord } from '@/types/contract-other-fee'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import DrawerDetailHeader from '@/components/DrawerDetailHeader.vue'
import { formatMoney } from '@/utils/format'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    fee: ContractOtherFeeRecord | null
    /** i18n 命名空间：合约其他费用 / 按金扣除 */
    i18nNs?: 'contractOtherFee' | 'depositDeduction'
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    i18nNs: 'contractOtherFee',
    desktopDirection: 'rtl',
    size: undefined,
  },
)

const emit = defineEmits<{
  openContract: [contractId: string]
  openCustomer: [customerId: string]
  openRoom: [roomId: string]
  openTermination: [terminationId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '560px'))
const ns = computed(() => props.i18nNs)

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function money(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

function f(key: string) {
  return t(`${ns.value}.fields.${key}`)
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :direction="direction"
    class="responsive-drawer"
  >
    <template #header="{ titleId, titleClass }">
      <DrawerDetailHeader
        :title-id="titleId"
        :title-class="titleClass"
        :title="t(`${ns}.detailTitle`)"
        :code="fee?.contractCode || fee?.description"
      />
    </template>
    <template v-if="fee">
      <section class="detail-section">
        <h3>{{ t(`${ns}.sections.basic`) }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ f('contractCode') }}</dt>
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
            <dt>{{ f('terminationCode') }}</dt>
            <dd>
              <button
                v-if="fee.terminationId"
                type="button"
                class="fk-link"
                @click="emit('openTermination', fee.terminationId)"
              >
                {{ fee.terminationCode || '—' }}
              </button>
              <template v-else>{{ dash(fee.terminationCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ f('customerName') }}</dt>
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
            <dt>{{ f('roomCode') }}</dt>
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
            <dt>{{ f('description') }}</dt>
            <dd>{{ dash(fee.description) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t(`${ns}.sections.finance`) }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ f('quantity') }}</dt>
            <dd>{{ fee.quantity ?? '—' }}</dd>
          </div>
          <div>
            <dt>{{ f('unitAmount') }}</dt>
            <dd>{{ money(fee.unitAmount) }}</dd>
          </div>
          <div>
            <dt>{{ f('subtotal') }}</dt>
            <dd>{{ money(fee.subtotal) }}</dd>
          </div>
          <div class="full">
            <dt>{{ f('remark') }}</dt>
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
