<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import type { BuildingRecord } from '@/types/building'
import { previewDocumentTemplateApi } from '@/api/document-templates'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import CountListPill from '@/components/CountListPill.vue'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    building: BuildingRecord | null
    /** 桌面端默认；移动端始终 btt */
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    desktopDirection: 'rtl',
    size: undefined,
  },
)

const emit = defineEmits<{
  openRooms: [building: BuildingRecord]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const previewingTemplateId = ref('')

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '520px'))

function templateLabel(name?: string, fileName?: string) {
  const n = (name || '').trim()
  const f = (fileName || '').trim()
  if (n && f) return `${n}（${f}）`
  return n || f || t('common.none')
}

const roomCount = computed(() => props.building?.roomIds?.length ?? 0)

function onRoomsClick() {
  const b = props.building
  if (!b?.roomIds?.length) return
  emit('openRooms', b)
}

async function onPreviewTemplate(id?: string | null) {
  if (!id || previewingTemplateId.value) return
  previewingTemplateId.value = id
  try {
    await previewDocumentTemplateApi(id)
  } catch (e) {
    const msg =
      e instanceof Error && e.message ? e.message : t('building.templatePreviewFailed')
    ElMessage.error(msg)
  } finally {
    previewingTemplateId.value = ''
  }
}

const logoItems = computed(() => {
  const b = props.building
  if (!b) return []
  return [
    { label: t('building.fields.agreementLogo'), src: b.agreementLogo },
    { label: 'logo2', src: b.logo2 },
    { label: t('building.fields.invoiceLogo'), src: b.invoiceLogo },
    { label: t('building.fields.receiptTopLogo'), src: b.receiptTopLogo },
    { label: t('building.fields.receiptLeftLogo'), src: b.receiptLeftLogo },
    { label: t('building.fields.receiptRightLogo'), src: b.receiptRightLogo },
  ]
})
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :title="t('building.detailTitle')"
    :direction="direction"
    class="responsive-drawer"
  >
    <template v-if="building">
      <section class="detail-section">
        <h3>{{ t('building.sections.basic') }}</h3>
        <dl class="detail-grid">
          <div>
            <dt>{{ t('building.fields.name') }}</dt>
            <dd>{{ building.name }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.address') }}</dt>
            <dd>{{ building.address }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.addressEn') }}</dt>
            <dd>{{ building.addressEn }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.manager') }}</dt>
            <dd>{{ building.manager }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.managerPhone') }}</dt>
            <dd>{{ building.managerPhone }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.email') }}</dt>
            <dd>{{ building.email }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.workingHours') }}</dt>
            <dd>{{ building.workingHours }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.rooms') }}</dt>
            <dd>
              <CountListPill :count="roomCount" @click="onRoomsClick" />
            </dd>
          </div>
          <div>
            <dt>{{ t('building.fields.active') }}</dt>
            <dd>{{ building.active ? t('user.status.active') : t('user.status.disabled') }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.buildingConfig') }}</dt>
            <dd>{{ building.buildingConfig || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.useWbaNumber') }}</dt>
            <dd>{{ building.useWbaNumber || '—' }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('building.sections.finance') }}</h3>
        <dl class="detail-grid">
          <div>
            <dt>{{ t('building.fields.fpsId') }}</dt>
            <dd>{{ building.fpsId || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.bankAccountHolder') }}</dt>
            <dd>{{ building.bankAccountHolder || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.bankAccount') }}</dt>
            <dd>{{ building.bankAccount || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.chequePaymentBy') }}</dt>
            <dd>{{ building.chequePaymentBy || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.paymentAdvice') }}</dt>
            <dd>{{ building.paymentAdvice || '—' }}</dd>
          </div>
        </dl>
      </section>

      <section class="detail-section">
        <h3>{{ t('building.sections.templates') }}</h3>
        <dl class="detail-grid">
          <div>
            <dt>{{ t('building.fields.agreementTemplate') }}</dt>
            <dd>
              <button
                v-if="building.agreementTemplateId"
                type="button"
                class="template-preview-link"
                :title="t('building.templatePreviewHint')"
                :disabled="previewingTemplateId === building.agreementTemplateId"
                @click="onPreviewTemplate(building.agreementTemplateId)"
              >
                {{ templateLabel(building.agreementTemplateName, building.agreementTemplateFileName) }}
              </button>
              <span v-else>{{ t('common.none') }}</span>
            </dd>
          </div>
          <div>
            <dt>{{ t('building.fields.invoiceTemplate') }}</dt>
            <dd>
              <button
                v-if="building.invoiceTemplateId"
                type="button"
                class="template-preview-link"
                :title="t('building.templatePreviewHint')"
                :disabled="previewingTemplateId === building.invoiceTemplateId"
                @click="onPreviewTemplate(building.invoiceTemplateId)"
              >
                {{ templateLabel(building.invoiceTemplateName, building.invoiceTemplateFileName) }}
              </button>
              <span v-else>{{ t('common.none') }}</span>
            </dd>
          </div>
          <div>
            <dt>{{ t('building.fields.receiptTemplate') }}</dt>
            <dd>
              <button
                v-if="building.receiptTemplateId"
                type="button"
                class="template-preview-link"
                :title="t('building.templatePreviewHint')"
                :disabled="previewingTemplateId === building.receiptTemplateId"
                @click="onPreviewTemplate(building.receiptTemplateId)"
              >
                {{ templateLabel(building.receiptTemplateName, building.receiptTemplateFileName) }}
              </button>
              <span v-else>{{ t('common.none') }}</span>
            </dd>
          </div>
          <div>
            <dt>{{ t('building.fields.apiTemplateSuffix') }}</dt>
            <dd>{{ building.apiTemplateSuffix || '—' }}</dd>
          </div>
        </dl>
        <div class="logo-row">
          <div v-for="item in logoItems" :key="item.label" class="logo-item">
            <span>{{ item.label }}</span>
            <img v-if="item.src" :src="item.src" alt="" />
            <em v-else>—</em>
          </div>
        </div>
      </section>

      <AuditDetailSection
        :created-by="building.createdBy"
        :created-at="building.createdAt"
        :updated-by="building.updatedBy"
        :updated-at="building.updatedAt"
      />
    </template>
  </el-drawer>
</template>

<style scoped>
.template-preview-link {
  appearance: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-weight: 500;
  color: #409eff;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  text-align: left;
  max-width: 100%;
  word-break: break-all;
}

.template-preview-link:hover:not(:disabled) {
  color: #337ecc;
}

.template-preview-link:disabled {
  cursor: wait;
  opacity: 0.7;
}

.logo-row {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.logo-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--lb-muted);
}

.logo-item img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid var(--lb-border);
}

@media (max-width: 640px) {
  .logo-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
