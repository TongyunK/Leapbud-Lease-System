<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { OccupantRecord } from '@/types/customer'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'

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

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
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
            <dt>{{ t('occupant.fields.relatedCustomerName') }}</dt>
            <dd>{{ dash(occupant.relatedCustomerName) }}</dd>
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
            <dd class="path-text">{{ dash(occupant.idCardImage) }}</dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.addressProofCopy') }}</dt>
            <dd class="path-text">{{ dash(occupant.addressProofCopy) }}</dd>
          </div>
          <div>
            <dt>{{ t('occupant.fields.remark') }}</dt>
            <dd>{{ dash(occupant.remark) }}</dd>
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
</template>

<style scoped>
.path-text {
  word-break: break-all;
  font-size: 0.82rem;
  color: var(--lb-muted, #6a7a70);
}
</style>
