<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { InvoiceRecord } from '@/types/invoice'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import CountListPill from '@/components/CountListPill.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { invoiceStatusTone } from '@/constants/statusBadges'
import { formatMoney } from '@/utils/format'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    record: InvoiceRecord | null
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
  openReceivables: [row: InvoiceRecord]
  openReceipts: [row: InvoiceRecord]
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
  const key = `invoice.status.${status}`
  return t(key) === key ? status : t(key)
}

function typeLabel(type: string) {
  const map: Record<string, string> = {
    會議室短租: t('invoice.types.meetingRoomShort'),
    Deposit: t('invoice.types.deposit'),
    '1, Charging Period': t('invoice.types.chargingPeriod'),
    '10, Other charges': t('invoice.types.otherCharges'),
  }
  return map[type] || type
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :title="t('invoice.detailTitle')"
    :direction="direction"
    class="responsive-drawer"
  >
    <template v-if="record">
      <section class="detail-section">
        <h3>{{ t('invoice.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('invoice.fields.invoiceCode') }}</dt>
            <dd>{{ record.invoiceCode }}</dd>
          </div>
          <div>
            <dt>{{ t('invoice.fields.status') }}</dt>
            <dd>
              <StatusBadge
                :tone="invoiceStatusTone(record.status)"
                :label="statusLabel(record.status)"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('invoice.fields.contractCode') }}</dt>
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
            <dt>{{ t('invoice.fields.customerName') }}</dt>
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
            <dt>{{ t('invoice.fields.roomName') }}</dt>
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
            <dt>{{ t('invoice.fields.roomNameText') }}</dt>
            <dd>{{ dash(record.roomNameText) }}</dd>
          </div>
          <div>
            <dt>{{ t('invoice.fields.invoiceType') }}</dt>
            <dd>{{ typeLabel(record.invoiceType) }}</dd>
          </div>
          <div>
            <dt>{{ t('invoice.fields.salesManager') }}</dt>
            <dd>{{ dash(record.salesManager) }}</dd>
          </div>
          <div>
            <dt>{{ t('invoice.fields.invoiceDate') }}</dt>
            <dd>{{ dash(record.invoiceDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('invoice.fields.paymentDueDate') }}</dt>
            <dd>{{ dash(record.paymentDueDate) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('invoice.fields.description') }}</dt>
            <dd>{{ dash(record.description) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('invoice.sections.finance') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('invoice.fields.amount') }}</dt>
            <dd>{{ money(record.amount) }}</dd>
          </div>
          <div>
            <dt>{{ t('invoice.fields.relatedReceivableRef') }}</dt>
            <dd>{{ dash(record.relatedReceivableRef) }}</dd>
          </div>
          <div>
            <dt>{{ t('invoice.fields.whatsappNumber') }}</dt>
            <dd>{{ dash(record.whatsappNumber) }}</dd>
          </div>
          <div>
            <dt>{{ t('invoice.fields.shortTermRentalCode') }}</dt>
            <dd>{{ dash(record.shortTermRentalCode) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('invoice.fields.attachment') }}</dt>
            <dd class="path-text">{{ dash(record.attachment) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('invoice.fields.notes') }}</dt>
            <dd>{{ dash(record.notes) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('invoice.fields.remark') }}</dt>
            <dd>{{ dash(record.remark) }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="record.serviceDetails?.length" class="detail-section">
        <h3>{{ t('invoice.sections.serviceDetails') }}</h3>
        <div class="fee-list">
          <div
            v-for="(fee, i) in record.serviceDetails"
            :key="fee.id || i"
            class="fee-list__item"
          >
            <strong>{{ fee.description || '—' }}</strong>
            <span>× {{ fee.quantity }}</span>
            <span>{{ money(fee.unitAmount) }}</span>
            <span>{{ money(fee.subtotal ?? (Number(fee.quantity) || 0) * (Number(fee.unitAmount) || 0)) }}</span>
          </div>
        </div>
      </section>

            <section class="detail-section">
        <h3>{{ t('invoice.sections.relatedRecords') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('invoice.fields.receivableCount') }}</dt>
            <dd>
              <CountListPill
                :count="record.receivableCount ?? 0"
                @click="() => { if (record?.receivableCount) emit('openReceivables', record) }"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('invoice.fields.receiptCount') }}</dt>
            <dd>
              <CountListPill
                :count="record.receiptCount ?? 0"
                @click="() => { if (record?.receiptCount) emit('openReceipts', record) }"
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
