<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { InvoiceServiceDetailListRecord } from '@/types/invoice-service-detail'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import DrawerDetailHeader from '@/components/DrawerDetailHeader.vue'
import { formatMoney } from '@/utils/format'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    detail: InvoiceServiceDetailListRecord | null
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
  >
    <template #header="{ titleId, titleClass }">
      <DrawerDetailHeader
        :title-id="titleId"
        :title-class="titleClass"
        :title="t('invoiceServiceDetail.detailTitle')"
        :code="detail?.invoiceCode"
      />
    </template>
    <template v-if="detail">
      <section class="detail-section">
        <h3>{{ t('invoiceServiceDetail.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('invoiceServiceDetail.fields.invoiceCode') }}</dt>
            <dd>
              <button
                v-if="detail.invoiceId"
                type="button"
                class="fk-link"
                @click="emit('openInvoice', detail.invoiceId)"
              >
                {{ detail.invoiceCode || '—' }}
              </button>
              <template v-else>{{ dash(detail.invoiceCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('invoiceServiceDetail.fields.contractCode') }}</dt>
            <dd>
              <button
                v-if="detail.contractId"
                type="button"
                class="fk-link"
                @click="emit('openContract', detail.contractId)"
              >
                {{ detail.contractCode || '—' }}
              </button>
              <template v-else>{{ dash(detail.contractCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('invoiceServiceDetail.fields.customerName') }}</dt>
            <dd>
              <button
                v-if="detail.customerId"
                type="button"
                class="fk-link"
                @click="emit('openCustomer', detail.customerId)"
              >
                {{ detail.customerName || '—' }}
              </button>
              <template v-else>{{ dash(detail.customerName) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('invoiceServiceDetail.fields.roomCode') }}</dt>
            <dd>
              <button
                v-if="detail.roomId"
                type="button"
                class="fk-link"
                @click="emit('openRoom', detail.roomId)"
              >
                {{ detail.roomCode || '—' }}
              </button>
              <template v-else>{{ dash(detail.roomCode) }}</template>
            </dd>
          </div>
          <div class="full">
            <dt>{{ t('invoiceServiceDetail.fields.description') }}</dt>
            <dd>{{ dash(detail.description) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('invoiceServiceDetail.sections.finance') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('invoiceServiceDetail.fields.quantity') }}</dt>
            <dd>{{ detail.quantity ?? '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('invoiceServiceDetail.fields.unitAmount') }}</dt>
            <dd>{{ money(detail.unitAmount) }}</dd>
          </div>
          <div>
            <dt>{{ t('invoiceServiceDetail.fields.subtotal') }}</dt>
            <dd>{{ money(detail.subtotal) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('invoiceServiceDetail.fields.remark') }}</dt>
            <dd>{{ dash(detail.remark) }}</dd>
          </div>
        </dl>
      </section>

      <AuditDetailSection
        :created-by="detail.createdBy"
        :created-at="detail.createdAt"
        :updated-by="detail.updatedBy"
        :updated-at="detail.updatedAt"
      />
    </template>
  </el-drawer>
</template>
