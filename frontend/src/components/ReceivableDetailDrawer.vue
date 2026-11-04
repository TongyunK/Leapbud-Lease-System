<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ReceivableRecord } from '@/types/receivable'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import CountListPill from '@/components/CountListPill.vue'
import DrawerDetailHeader from '@/components/DrawerDetailHeader.vue'
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
  openReceipts: [row: ReceivableRecord]
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
        :title="t('receivable.detailTitle')"
        :code="record?.invoiceCode || record?.receivableCode"
      />
    </template>
    <template v-if="record">
      <section class="detail-section">
        <h3>{{ t('receivable.sections.basic') }}</h3>
        <dl class="detail-grid two">
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

      <section class="detail-section">
        <h3>{{ t('receivable.sections.relatedReceipts') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('receivable.fields.receiptCount') }}</dt>
            <dd>
              <CountListPill
                :count="record.receiptCount ?? record.receipts?.length ?? 0"
                @click="() => {
                  if ((record?.receiptCount ?? record?.receipts?.length ?? 0) > 0) {
                    emit('openReceipts', record)
                  }
                }"
              />
            </dd>
          </div>
          <div
            v-if="record.receipts?.length"
            class="full"
          >
            <dt>{{ t('receipt.fields.receiptCode') }}</dt>
            <dd>
              <ul class="receipt-code-list">
                <li v-for="rcp in record.receipts" :key="rcp.id">
                  <span class="receipt-code-list__code">{{ rcp.receiptCode || '—' }}</span>
                  <span class="receipt-code-list__meta">
                    {{ dash(rcp.paymentDate) }}
                    ·
                    {{ rcp.amount == null ? '—' : money(rcp.amount) }}
                  </span>
                </li>
              </ul>
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

<style scoped>
.receipt-code-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.receipt-code-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  font-size: 0.9rem;
}

.receipt-code-list__code {
  font-weight: 650;
  color: #2f3f36;
}

.receipt-code-list__meta {
  color: #6a7a70;
  font-variant-numeric: tabular-nums;
}
</style>
