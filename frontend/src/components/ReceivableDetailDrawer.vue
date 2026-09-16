<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ReceivableRecord } from '@/types/receivable'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import { formatMoney } from '@/utils/format'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    record: ReceivableRecord | null
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    desktopDirection: 'rtl',
    size: undefined,
  },
)

const emit = defineEmits<{
  openInvoice: [invoiceId: string]
  openContract: [contractId: string]
  openCustomer: [customerId: string]
  openDepositRefund: [depositRefundId: string]
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
    :title="t('receivable.detailTitle')"
    :direction="direction"
    class="responsive-drawer"
  >
    <template v-if="record">
      <section class="detail-section">
        <h3>{{ t('receivable.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('receivable.fields.receivableCode') }}</dt>
            <dd>{{ record.receivableCode }}</dd>
          </div>
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
            <dt>{{ t('receivable.fields.invoiceDate') }}</dt>
            <dd>{{ dash(record.invoiceDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('receivable.fields.paymentDueDate') }}</dt>
            <dd>{{ dash(record.paymentDueDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('receivable.fields.depositRefundCode') }}</dt>
            <dd>
              <button
                v-if="record.depositRefundId"
                type="button"
                class="fk-link"
                @click="emit('openDepositRefund', record.depositRefundId)"
              >
                {{ record.depositRefundCode || '—' }}
              </button>
              <template v-else>{{ dash(record.depositRefundCode) }}</template>
            </dd>
          </div>
          <div class="full">
            <dt>{{ t('receivable.fields.relatedReceiptRef') }}</dt>
            <dd>{{ dash(record.relatedReceiptRef) }}</dd>
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
          <div class="full">
            <dt>{{ t('receivable.fields.remark') }}</dt>
            <dd>{{ dash(record.remark) }}</dd>
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
