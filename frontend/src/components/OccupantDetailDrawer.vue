<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OccupantRecord } from '@/types/customer'
import {
  fetchOccupantPastCustomers,
  type OccupantPastCustomer,
} from '@/api/occupants'
import { useIsMobile } from '@/composables/useMediaQuery'
import { formatDateTime } from '@/utils/format'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import AttachmentLink from '@/components/AttachmentLink.vue'
import CountListPill from '@/components/CountListPill.vue'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    occupant: OccupantRecord | null
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
}>()

const { t } = useI18n()
const isMobile = useIsMobile()

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '520px'))
const pastListSize = computed(() => (isMobile.value ? '100%' : '420px'))

const pastCustomers = ref<OccupantPastCustomer[]>([])
const pastLoading = ref(false)
const pastListVisible = ref(false)

watch(
  () => [visible.value, props.occupant?.id] as const,
  async ([open, id]) => {
    if (!open || !id) {
      pastCustomers.value = []
      pastListVisible.value = false
      return
    }
    pastLoading.value = true
    try {
      const { data } = await fetchOccupantPastCustomers(id)
      pastCustomers.value = data
    } catch {
      pastCustomers.value = []
    } finally {
      pastLoading.value = false
    }
  },
  { immediate: true },
)

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function periodLabel(startedAt: string, endedAt: string) {
  return `${formatDateTime(startedAt)} → ${formatDateTime(endedAt)}`
}

const customerLabel = computed(() => {
  const o = props.occupant
  if (!o) return '—'
  return (o.customerName || o.relatedCustomerName || '—').trim() || '—'
})

function onCustomerClick() {
  const id = props.occupant?.customerId
  if (id) emit('openCustomer', id)
}

function openPastList() {
  if (!pastCustomers.value.length) return
  pastListVisible.value = true
}

function openPastCustomer(customerId: string) {
  emit('openCustomer', customerId)
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :title="t('occupant.detailTitle')"
    :direction="direction"
    class="responsive-drawer"
  >
    <template v-if="occupant">
      <section class="detail-section">
        <h3>{{ t('occupant.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('occupant.fields.name') }}</dt>
            <dd>{{ occupant.name }}</dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.customer') }}</dt>
            <dd>
              <button
                v-if="occupant.customerId"
                type="button"
                class="fk-link"
                @click="onCustomerClick"
              >
                {{ customerLabel }}
              </button>
              <template v-else>{{ customerLabel }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.idCardNo') }}</dt>
            <dd>{{ dash(occupant.idCardNo) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('occupant.sections.contact') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('occupant.fields.whatsapp') }}</dt>
            <dd>{{ dash(occupant.whatsapp) }}</dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.mobilePhone') }}</dt>
            <dd>{{ dash(occupant.mobilePhone) }}</dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.contactPhone') }}</dt>
            <dd>{{ dash(occupant.contactPhone) }}</dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.email') }}</dt>
            <dd>{{ dash(occupant.email) }}</dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.fax') }}</dt>
            <dd>{{ dash(occupant.fax) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('occupant.fields.address') }}</dt>
            <dd>{{ dash(occupant.address) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('occupant.sections.docs') }}</h3>
        <dl class="detail-grid">
          <div>
            <dt>{{ t('occupant.fields.idCardImage') }}</dt>
            <dd><AttachmentLink :value="occupant.idCardImage" /></dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.addressProofCopy') }}</dt>
            <dd><AttachmentLink :value="occupant.addressProofCopy" /></dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.remark') }}</dt>
            <dd>{{ dash(occupant.remark) }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('occupant.sections.pastCustomers') }}</dt>
            <dd>
              <CountListPill
                :count="pastLoading ? 0 : pastCustomers.length"
                @click="openPastList"
              />
            </dd>
          </div>
        </dl>
      </section>

      <AuditDetailSection
        :created-by="occupant.createdBy"
        :created-at="occupant.createdAt"
        :updated-by="occupant.updatedBy"
        :updated-at="occupant.updatedAt"
      />
    </template>
  </el-drawer>

  <el-drawer
    v-model="pastListVisible"
    :size="pastListSize"
    :title="t('occupant.sections.pastCustomers')"
    :direction="direction"
    append-to-body
    class="responsive-drawer"
  >
    <p v-if="!pastCustomers.length" class="past-hint">{{ t('occupant.pastCustomerEmpty') }}</p>
    <ul v-else class="past-list">
      <li v-for="row in pastCustomers" :key="row.id">
        <button type="button" class="fk-link" @click="openPastCustomer(row.customerId)">
          {{ row.customerCode }} · {{ row.customerName }}
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
