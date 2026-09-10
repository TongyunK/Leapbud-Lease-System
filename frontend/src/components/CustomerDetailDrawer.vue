<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CustomerRecord } from '@/types/customer'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import CountListPill from '@/components/CountListPill.vue'
import { customerStatusTone } from '@/constants/statusBadges'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    customer: CustomerRecord | null
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    desktopDirection: 'rtl',
    size: undefined,
  },
)

const emit = defineEmits<{
  openOccupants: [customer: CustomerRecord]
  openBuilding: [buildingId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '560px'))

const primary = computed(() => props.customer?.primaryOccupant ?? null)

function statusLabel(status: string) {
  return t(`customer.status.${status}`, status)
}

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function onOccupantCountClick() {
  const c = props.customer
  if (!c?.occupantCount) return
  emit('openOccupants', c)
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :title="t('customer.detailTitle')"
    :direction="direction"
    class="responsive-drawer"
  >
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
          <div>
            <dt>{{ t('customer.fields.occupantCount') }}</dt>
            <dd>
              <CountListPill
                :count="customer.occupantCount ?? 0"
                @click="onOccupantCountClick"
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
            <dd class="path-text">{{ dash(customer.businessRegCopy) }}</dd>
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
            <dd class="path-text">{{ dash(primary?.idCardImage) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('occupant.fields.addressProofCopy') }}</dt>
            <dd class="path-text">{{ dash(primary?.addressProofCopy) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('occupant.fields.remark') }}</dt>
            <dd>{{ dash(primary?.remark) }}</dd>
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
</template>

<style scoped>
.path-text {
  word-break: break-all;
  font-size: 0.82rem;
  color: var(--lb-muted, #6a7a70);
}
</style>
