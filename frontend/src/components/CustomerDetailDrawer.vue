<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CustomerRecord } from '@/types/customer'
import {
  fetchCustomerPastOccupants,
  type CustomerPastOccupant,
} from '@/api/customers'
import { useIsMobile } from '@/composables/useMediaQuery'
import { formatDateTime } from '@/utils/format'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import AttachmentLink from '@/components/AttachmentLink.vue'
import DrawerDetailHeader from '@/components/DrawerDetailHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import CountListPill from '@/components/CountListPill.vue'
import { customerStatusTone } from '@/constants/statusBadges'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    customer: CustomerRecord | null
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
  openOccupants: [customer: CustomerRecord]
  openRequirements: [customer: CustomerRecord]
  openContracts: [customer: CustomerRecord]
  openInvoices: [customer: CustomerRecord]
  openReceivables: [customer: CustomerRecord]
  openReceipts: [customer: CustomerRecord]
  openTerminations: [customer: CustomerRecord]
  openDepositRefunds: [customer: CustomerRecord]
  openBuilding: [buildingId: string]
  openOccupant: [occupantId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '560px'))
const pastListSize = computed(() => (isMobile.value ? '100%' : '420px'))

const primary = computed(() => props.customer?.primaryOccupant ?? null)
const pastOccupants = ref<CustomerPastOccupant[]>([])
const pastLoading = ref(false)
const pastListVisible = ref(false)

watch(
  () => [visible.value, props.customer?.id] as const,
  async ([open, id]) => {
    if (!open || !id) {
      pastOccupants.value = []
      pastListVisible.value = false
      return
    }
    pastLoading.value = true
    try {
      const { data } = await fetchCustomerPastOccupants(id)
      pastOccupants.value = data
    } catch {
      pastOccupants.value = []
    } finally {
      pastLoading.value = false
    }
  },
  { immediate: true },
)

function statusLabel(status: string) {
  return t(`customer.status.${status}`, status)
}

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function periodLabel(startedAt: string, endedAt: string) {
  return `${formatDateTime(startedAt)} → ${formatDateTime(endedAt)}`
}

function openPastList() {
  if (!pastOccupants.value.length) return
  pastListVisible.value = true
}

function openPastOccupant(occupantId: string) {
  emit('openOccupant', occupantId)
}

function emitIfCount(
  count: number | undefined | null,
  event:
    | 'openOccupants'
    | 'openRequirements'
    | 'openContracts'
    | 'openInvoices'
    | 'openReceivables'
    | 'openReceipts'
    | 'openTerminations'
    | 'openDepositRefunds',
) {
  const c = props.customer
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
  
    append-to-body
  
    :z-index="zIndex"
  >
    <template #header="{ titleId, titleClass }">
      <DrawerDetailHeader
        :title-id="titleId"
        :title-class="titleClass"
        :title="t('customer.detailTitle')"
        :code="customer?.customerCode"
      />
    </template>
    <template v-if="customer">
      <section class="detail-section">
        <h3>{{ t('customer.sections.info') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('customer.fields.customerCode') }}</dt>
            <dd>{{ customer.customerCode }}</dd>
          </div>
          <div>
            <dt>{{ t('customer.fields.name') }}</dt>
            <dd>{{ customer.name }}</dd>
          </div>
          <div>
            <dt>{{ t('customer.fields.status') }}</dt>
            <dd>
              <StatusBadge
                :tone="customerStatusTone(customer.status)"
                :label="statusLabel(customer.status)"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('customer.fields.accountManager') }}</dt>
            <dd>{{ dash(customer.accountManager) }}</dd>
          </div>
          <div>
            <dt>{{ t('customer.fields.source') }}</dt>
            <dd>{{ dash(customer.source) }}</dd>
          </div>
          <div>
            <dt>{{ t('customer.fields.buildingName') }}</dt>
            <dd>
              <button
                v-if="customer.buildingId"
                type="button"
                class="fk-link"
                @click="emit('openBuilding', customer.buildingId)"
              >
                {{ customer.buildingName || '—' }}
              </button>
              <template v-else>{{ dash(customer.buildingName) }}</template>
            </dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('customer.sections.relatedRecords') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('customer.fields.occupantCount') }}</dt>
            <dd>
              <CountListPill
                :count="customer.occupantCount ?? 0"
                @click="emitIfCount(customer.occupantCount, 'openOccupants')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('customer.fields.requirementCount') }}</dt>
            <dd>
              <CountListPill
                :count="customer.requirementCount ?? 0"
                @click="emitIfCount(customer.requirementCount, 'openRequirements')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('customer.fields.contractCount') }}</dt>
            <dd>
              <CountListPill
                :count="customer.contractCount ?? 0"
                @click="emitIfCount(customer.contractCount, 'openContracts')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('customer.fields.invoiceCount') }}</dt>
            <dd>
              <CountListPill
                :count="customer.invoiceCount ?? 0"
                @click="emitIfCount(customer.invoiceCount, 'openInvoices')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('customer.fields.receivableCount') }}</dt>
            <dd>
              <CountListPill
                :count="customer.receivableCount ?? 0"
                @click="emitIfCount(customer.receivableCount, 'openReceivables')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('customer.fields.receiptCount') }}</dt>
            <dd>
              <CountListPill
                :count="customer.receiptCount ?? 0"
                @click="emitIfCount(customer.receiptCount, 'openReceipts')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('customer.fields.terminationCount') }}</dt>
            <dd>
              <CountListPill
                :count="customer.terminationCount ?? 0"
                @click="emitIfCount(customer.terminationCount, 'openTerminations')"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('customer.fields.depositRefundCount') }}</dt>
            <dd>
              <CountListPill
                :count="customer.depositRefundCount ?? 0"
                @click="emitIfCount(customer.depositRefundCount, 'openDepositRefunds')"
              />
            </dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('customer.sections.company') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('customer.fields.companyNameZh') }}</dt>
            <dd>{{ dash(customer.companyNameZh) }}</dd>
          </div>
          <div>
            <dt>{{ t('customer.fields.companyNameEn') }}</dt>
            <dd>{{ dash(customer.companyNameEn) }}</dd>
          </div>
          <div>
            <dt>{{ t('customer.fields.businessRegNo') }}</dt>
            <dd>{{ dash(customer.businessRegNo) }}</dd>
          </div>
          <div>
            <dt>{{ t('customer.fields.businessNature') }}</dt>
            <dd>{{ dash(customer.businessNature) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('customer.fields.businessRegCopy') }}</dt>
            <dd><AttachmentLink :value="customer.businessRegCopy" /></dd>
          </div>
          <div class="full">
            <dt>{{ t('customer.fields.remark') }}</dt>
            <dd>{{ dash(customer.remark) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('customer.fields.rentedRooms') }}</dt>
            <dd>{{ dash(customer.rentedRooms) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('customer.sections.occupant') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('occupant.fields.name') }}</dt>
            <dd>{{ dash(primary?.name || customer.primaryContact) }}</dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.mobilePhone') }}</dt>
            <dd>{{ dash(primary?.mobilePhone || customer.mobilePhone) }}</dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.whatsapp') }}</dt>
            <dd>{{ dash(primary?.whatsapp) }}</dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.contactPhone') }}</dt>
            <dd>{{ dash(primary?.contactPhone) }}</dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.email') }}</dt>
            <dd>{{ dash(primary?.email) }}</dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.fax') }}</dt>
            <dd>{{ dash(primary?.fax) }}</dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.idCardNo') }}</dt>
            <dd>{{ dash(primary?.idCardNo) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('occupant.fields.address') }}</dt>
            <dd>{{ dash(primary?.address) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('occupant.fields.idCardImage') }}</dt>
            <dd><AttachmentLink :value="primary?.idCardImage" /></dd>
          </div>
          <div class="full">
            <dt>{{ t('occupant.fields.addressProofCopy') }}</dt>
            <dd><AttachmentLink :value="primary?.addressProofCopy" /></dd>
          </div>
          <div class="full">
            <dt>{{ t('occupant.fields.remark') }}</dt>
            <dd>{{ dash(primary?.remark) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('customer.sections.pastOccupants') }}</dt>
            <dd>
              <CountListPill
                :count="pastLoading ? 0 : pastOccupants.length"
                @click="openPastList"
              />
            </dd>
          </div>
        </dl>
      </section>

      <AuditDetailSection
        :created-by="customer.createdBy"
        :created-at="customer.createdAt"
        :updated-by="customer.updatedBy"
        :updated-at="customer.updatedAt"
      />
    </template>
  </el-drawer>

  <el-drawer
    v-model="pastListVisible"
    :size="pastListSize"
    :title="t('customer.sections.pastOccupants')"
    :direction="direction"
    append-to-body
    class="responsive-drawer"
  
    :z-index="zIndex"
  >
    <p v-if="!pastOccupants.length" class="past-hint">{{ t('customer.pastOccupantEmpty') }}</p>
    <ul v-else class="past-list">
      <li v-for="row in pastOccupants" :key="row.id">
        <button type="button" class="fk-link" @click="openPastOccupant(row.occupantId)">
          {{ row.occupantName }}
        </button>
        <span class="past-meta">{{ periodLabel(row.startedAt, row.endedAt) }}</span>
      </li>
    </ul>
  </el-drawer>
</template>

<style scoped>
.path-text {
  word-break: break-all;
  font-size: 0.82rem;
  color: var(--lb-muted, #6a7a70);
}

.past-hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--lb-muted, #6a7a70);
}

.past-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.past-list li {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--lb-border, rgba(40, 70, 55, 0.1));
}

.past-list li:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.past-meta {
  font-size: 0.78rem;
  color: var(--lb-muted, #6a7a70);
}
</style>
