<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CustomerRequirementRecord } from '@/types/customer-requirement'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import CountListPill from '@/components/CountListPill.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { customerRequirementStatusTone } from '@/constants/statusBadges'
import { formatMoney } from '@/utils/format'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    requirement: CustomerRequirementRecord | null
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
  openContracts: [row: CustomerRequirementRecord]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '560px'))

function dash(v?: string | null) {
  return v?.trim() ? v : '—'
}

function statusLabel(status: string) {
  return t(`customerRequirement.status.${status}`, status)
}

function onCustomerClick() {
  const id = props.requirement?.customerId
  if (id) emit('openCustomer', id)
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :title="t('customerRequirement.detailTitle')"
    :direction="direction"
    class="responsive-drawer"
  >
    <template v-if="requirement">
      <section class="detail-section">
        <h3>{{ t('customerRequirement.sections.basic') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('customerRequirement.fields.requirementCode') }}</dt>
            <dd>{{ requirement.requirementCode }}</dd>
          </div>
          <div>
            <dt>{{ t('customerRequirement.fields.customerName') }}</dt>
            <dd>
              <button
                v-if="requirement.customerId"
                type="button"
                class="fk-link"
                @click="onCustomerClick"
              >
                {{ requirement.customerName || '—' }}
              </button>
              <template v-else>{{ dash(requirement.customerName) }}</template>
            </dd>
          </div>
          <div>
            <dt>{{ t('customerRequirement.fields.status') }}</dt>
            <dd>
              <StatusBadge
                :tone="customerRequirementStatusTone(requirement.status)"
                :label="statusLabel(requirement.status)"
              />
            </dd>
          </div>
          <div>
            <dt>{{ t('customerRequirement.fields.salesManager') }}</dt>
            <dd>{{ dash(requirement.salesManager) }}</dd>
          </div>
          <div>
            <dt>{{ t('customerRequirement.fields.requirementDate') }}</dt>
            <dd>{{ dash(requirement.requirementDate) }}</dd>
          </div>
          <div>
            <dt>{{ t('customerRequirement.fields.leaseDuration') }}</dt>
            <dd>{{ dash(requirement.leaseDuration) }}</dd>
          </div>
          <div>
            <dt>{{ t('customerRequirement.fields.budget') }}</dt>
            <dd>{{ requirement.budget != null ? formatMoney(requirement.budget) : '—' }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('customerRequirement.sections.config') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('customerRequirement.fields.sizeConfig') }}</dt>
            <dd>{{ dash(requirement.sizeConfigLabel) }}</dd>
          </div>
          <div>
            <dt>{{ t('customerRequirement.fields.acConfig') }}</dt>
            <dd>{{ dash(requirement.acConfigLabel) }}</dd>
          </div>
          <div>
            <dt>{{ t('customerRequirement.fields.windowConfig') }}</dt>
            <dd>{{ dash(requirement.windowConfigLabel) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('customerRequirement.fields.content') }}</dt>
            <dd>{{ dash(requirement.content) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('customerRequirement.fields.remark') }}</dt>
            <dd>{{ dash(requirement.remark) }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('customerRequirement.fields.attachment') }}</dt>
            <dd class="path-text">{{ dash(requirement.attachment) }}</dd>
          </div>
        </dl>
      </section>

            <section class="detail-section">
        <h3>{{ t('customerRequirement.sections.relatedRecords') }}</h3>
        <dl class="detail-grid two">
          <div>
            <dt>{{ t('customerRequirement.fields.contractCount') }}</dt>
            <dd>
              <CountListPill
                :count="requirement.contractCount ?? 0"
                @click="() => { if (requirement?.contractCount) emit('openContracts', requirement) }"
              />
            </dd>
          </div>
        </dl>
      </section>

      <AuditDetailSection
        :created-by="requirement.createdBy"
        :created-at="requirement.createdAt"
        :updated-by="requirement.updatedBy"
        :updated-at="requirement.updatedAt"
      />
    </template>
  </el-drawer>
</template>
