<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { View } from '@element-plus/icons-vue'

defineEmits<{
  click: [event: MouseEvent]
}>()

const { t } = useI18n()
</script>

<template>
  <button
    type="button"
    class="action-pill action-pill--detail action-pill--icon"
    :title="t('common.detail')"
    :aria-label="t('common.detail')"
    @click.stop="$emit('click', $event)"
  >
    <el-icon :size="15" class="action-pill__detail-icon"><View /></el-icon>
  </button>
</template>
