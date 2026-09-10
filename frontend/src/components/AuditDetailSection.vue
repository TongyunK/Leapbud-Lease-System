<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatDateTime } from '@/utils/format'

defineProps<{
  createdBy?: string | null
  createdAt?: string | null
  updatedBy?: string | null
  updatedAt?: string | null
}>()

const { t } = useI18n()
</script>

<template>
  <section class="detail-section">
    <h3>{{ t('common.sections.audit') }}</h3>
    <dl class="detail-grid two">
      <div>
        <dt>{{ t('common.createdBy') }}</dt>
        <dd>{{ createdBy || '—' }}</dd>
      </div>
      <div>
        <dt>{{ t('common.createdAt') }}</dt>
        <dd>{{ formatDateTime(createdAt) }}</dd>
      </div>
      <div>
        <dt>{{ t('common.updatedBy') }}</dt>
        <dd>{{ updatedBy || '—' }}</dd>
      </div>
      <div>
        <dt>{{ t('common.updatedAt') }}</dt>
        <dd>{{ formatDateTime(updatedAt) }}</dd>
      </div>
    </dl>
  </section>
</template>
