<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import type { ReceiptRecord } from '@/types/receipt'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import { formatMoney } from '@/utils/format'
import { previewReceiptPdfApi, prefetchReceiptPdfApi } from '@/api/document-templates'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    record: ReceiptRecord | null
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
  openContract: [contractId: string]
  openInvoice: [invoiceId: string]
  openReceivable: [receivableId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const printing = ref(false)

watch(
  () => [visible.value, props.record?.id] as const,
  ([open, id]) => {
    if (open && id) prefetchReceiptPdfApi(id)
  },
)

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '560px'))

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function money(v: number | null | undefined) {
  return v == null ? '—' : formatMoney(v)
}

async function onPrintReceipt() {
  const row = props.record
  if (!row?.id || printing.value) return
  printing.value = true
  try {
    await previewReceiptPdfApi(row.id, { autoPrint: false })
    ElMessage.success(t('receipt.printReceiptPreviewReady'))
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('receipt.printReceiptFailed')
    ElMessage.error(msg)
  } finally {
    printing.value = false
  }
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
      <div class="drawer-header-with-action">
        <h4 :id="titleId" :class="titleClass">{{ t('receipt.detailTitle') }}</h4>
        <el-button
          v-if="record"
          type="primary"
          class="lb-btn-primary drawer-header-action"
          :loading="printing"
          @mouseenter="record?.id && prefetchReceiptPdfApi(record.id)"
          @focus="record?.id && prefetchReceiptPdfApi(record.id)"
          @click="onPrintReceipt"
        >
          {{ t('receipt.printReceipt') }}
        </el-button>
      </div>
    </template>
    <template v-if="record">
      <section class="detail-section">
        <h3>{{ t('receipt.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('receipt.fields.receiptCode') }}</dt>
            <dd>{{ record.receiptCode }}</dd>
          </div>
          <div>
            <dt>{{ t('receipt.fields.paymentMethod') }}</dt>
            <dd>{{ dash(record.paymentMethod) }}</dd>
          </div>
          <div>
            <dt>{{ t('receipt.fields.customerName') }}</dt>
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
            <dt>{{ t('receipt.fields.paymentDate') }}</dt>
            <dd>{{ dash(record.paymentDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('receipt.fields.contractCode') }}</dt>
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
            <dt>{{ t('receipt.fields.invoiceCode') }}</dt>
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
            <dt>{{ t('receipt.fields.receivableCode') }}</dt>
            <dd>
              <button
                v-if="record.receivableId"
                type="button"
                class="fk-link"
                @click="emit('openReceivable', record.receivableId)"
              >
                {{ record.receivableCode || '—' }}
              </button>
              <template v-else>{{ dash(record.receivableCode) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('receipt.fields.amount') }}</dt>
            <dd>{{ money(record.amount) }}</dd>
          </div>
        </dl>
      </section>
      <section class="detail-section">
        <h3>{{ t('receipt.sections.finance') }}</h3>
        <dl class="detail-grid two">
          <div class="full">
            <dt>{{ t('receipt.fields.voucher1') }}</dt>
            <dd class="path-text">{{ dash(record.voucher1) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('receipt.fields.voucher2') }}</dt>
            <dd class="path-text">{{ dash(record.voucher2) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('receipt.fields.remark') }}</dt>
            <dd>{{ dash(record.remark) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('receipt.fields.changeLog') }}</dt>
            <dd>{{ dash(record.changeLog) }}</dd>
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
