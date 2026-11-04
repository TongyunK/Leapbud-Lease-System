<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import type { ContractRecord } from '@/types/contract'
import { coerceContractPaymentCycle, formatContractOccupancyLabel } from '@/types/contract'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import AttachmentLink from '@/components/AttachmentLink.vue'
import CountListPill from '@/components/CountListPill.vue'
import DrawerDetailHeader from '@/components/DrawerDetailHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { contractOccupancyTone, contractStatusTone } from '@/constants/statusBadges'
import { formatMoney } from '@/utils/format'
import { previewAgreementPdfApi, prefetchAgreementPdfApi } from '@/api/document-templates'

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
  openInvoices: [contract: ContractRecord]
  openReceivables: [contract: ContractRecord]
  openReceipts: [contract: ContractRecord]
  openPeriods: [contract: ContractRecord]
  openTerminations: [contract: ContractRecord]
  openOtherFees: [contract: ContractRecord]
  openDepositDeductions: [contract: ContractRecord]
  openDepositRefunds: [contract: ContractRecord]
  openBookingDepositReceipt: [receiptId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const printing = ref(false)

function occupancyLabel(row: ContractRecord) {
  return formatContractOccupancyLabel(row, {
    whole: t('contract.occupancyWhole'),
    part: t('contract.occupancyPart'),
  })
}

watch(
  () => [visible.value, props.contract?.id] as const,
  ([open, id]) => {
    if (open && id) prefetchAgreementPdfApi(id)
  },
)

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

async function onPrintAgreement() {
  const c = props.contract
  if (!c?.id || printing.value) return
  printing.value = true
  try {
    await previewAgreementPdfApi(c.id, { autoPrint: false })
    ElMessage.success(t('contract.printAgreementPreviewReady'))
  } catch (e) {
    const msg = e instanceof Error && e.message ? e.message : t('contract.printAgreementFailed')
    ElMessage.error(msg)
  } finally {
    printing.value = false
  }
}

function emitIfCount(
  count: number | undefined,
  event:
    | 'openInvoices'
    | 'openReceivables'
    | 'openReceipts'
    | 'openPeriods'
    | 'openTerminations'
    | 'openOtherFees'
    | 'openDepositDeductions'
    | 'openDepositRefunds',
) {
  const c = props.contract
  if (!c || !count) return
  emit(event, c)
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
        :title="t('contract.detailTitle')"
        :code="contract?.contractCode"
      >
        <el-button
          v-if="contract"
          type="primary"
          class="lb-btn-primary drawer-header-action"
          :loading="printing"
          @mouseenter="contract?.id && prefetchAgreementPdfApi(contract.id)"
          @focus="contract?.id && prefetchAgreementPdfApi(contract.id)"
          @click="onPrintAgreement"
        >
          {{ t('contract.printAgreement') }}
        </el-button>
      </DrawerDetailHeader>
    </template>
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
            <dd>{{ dash(contract.roomName || contract.roomNameText) }}</dd>
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
            <dd>
              <StatusBadge
                :tone="contractOccupancyTone(contract.occupancyMode)"
                :label="occupancyLabel(contract)"
              />
            </dd>
          </div>
        </dl>
      </section>

      <section v-if="contract.periods?.length" class="detail-section">
        <h3>{{ t('contract.sections.periods') }}</h3>
        <div class="period-list">
          <div v-for="(p, i) in contract.periods" :key="p.id || i" class="period-list__item">
            <strong>{{ t(`contract.periodTypes.${p.dateType}`, p.dateType) }}</strong>
            <span>{{ p.dateValue }} {{ t(`contract.periodUnits.${p.dateUnit}`, p.dateUnit) }}</span>
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
            <dt>{{ t('contract.fields.electricityRate') }}</dt>
            <dd>{{ contract.electricityRate == null ? '—' : contract.electricityRate }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.doorKeyQty') }}</dt>
            <dd>{{ contract.doorKeyQty ?? 0 }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.mailboxKeyQty') }}</dt>
            <dd>{{ contract.mailboxKeyQty ?? 0 }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.miscDeposit') }}</dt>
            <dd>{{ money(contract.miscDeposit) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.doorKeyDeposit') }}</dt>
            <dd>{{ money(contract.doorKeyDeposit) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.mailboxKeyDeposit') }}</dt>
            <dd>{{ money(contract.mailboxKeyDeposit) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('contract.sections.payment') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('contract.fields.paymentCycle') }}</dt>
            <dd>{{
              contract.paymentCycle
                ? coerceContractPaymentCycle(contract.paymentCycle)
                : dash('')
            }}</dd>
          </div>
          <div>
            <dt>{{ t('receipt.fields.paymentMethod') }}</dt>
            <dd>{{ dash(contract.paymentMethod) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.bookingDeposit') }}</dt>
            <dd>{{ money(contract.bookingDeposit) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.paymentDate') }}</dt>
            <dd>{{ dash(contract.paymentDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.bookingDepositReceipt') }}</dt>
            <dd>
              <button
                v-if="contract.bookingDepositReceiptId"
                type="button"
                class="fk-link"
                @click="emit('openBookingDepositReceipt', contract.bookingDepositReceiptId)"
              >
                {{ t('contract.fields.bookingDepositReceipt') }}
              </button>
              <template v-else>—</template>
            </dd>
          </div>
          <div class="full">
            <dt>{{ t('contract.fields.paymentVoucher') }}</dt>
            <dd>
              <AttachmentLink v-if="contract.paymentVoucher" :value="contract.paymentVoucher" />
              <template v-else>—</template>
            </dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('contract.sections.extra') }}</h3>
        <dl class="detail-grid two">
          <div class="full">
            <dt>{{ t('contract.fields.attachment') }}</dt>
            <dd>
              <AttachmentLink v-if="contract.attachment" :value="contract.attachment" />
              <template v-else>—</template>
            </dd>
          </div>
          <div class="full">
            <dt>{{ t('contract.fields.remark') }}</dt>
            <dd>{{ dash(contract.remark) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('contract.sections.relatedRecords') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('contract.fields.invoiceCount') }}</dt>
            <dd>
              <CountListPill
                :count="contract.invoiceCount ?? 0"
                @click="emitIfCount(contract.invoiceCount, 'openInvoices')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.receivableCount') }}</dt>
            <dd>
              <CountListPill
                :count="contract.receivableCount ?? 0"
                @click="emitIfCount(contract.receivableCount, 'openReceivables')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.receiptCount') }}</dt>
            <dd>
              <CountListPill
                :count="contract.receiptCount ?? 0"
                @click="emitIfCount(contract.receiptCount, 'openReceipts')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.periodCount') }}</dt>
            <dd>
              <CountListPill
                :count="contract.periodCount ?? 0"
                @click="emitIfCount(contract.periodCount, 'openPeriods')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.terminationCount') }}</dt>
            <dd>
              <CountListPill
                :count="contract.terminationCount ?? 0"
                @click="emitIfCount(contract.terminationCount, 'openTerminations')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.otherFeeCount') }}</dt>
            <dd>
              <CountListPill
                :count="contract.otherFeeCount ?? 0"
                @click="emitIfCount(contract.otherFeeCount, 'openOtherFees')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.depositDeductionCount') }}</dt>
            <dd>
              <CountListPill
                :count="contract.depositDeductionCount ?? 0"
                @click="emitIfCount(contract.depositDeductionCount, 'openDepositDeductions')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('contract.fields.depositRefundCount') }}</dt>
            <dd>
              <CountListPill
                :count="contract.depositRefundCount ?? 0"
                @click="emitIfCount(contract.depositRefundCount, 'openDepositRefunds')"
              />
            </dd>
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
