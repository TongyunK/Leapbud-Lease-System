<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Filter } from '@element-plus/icons-vue'

defineProps<{
  count: number
}>()

defineEmits<{
  clear: []
}>()

const { t } = useI18n()
</script>

<template>
  <el-button
    v-if="count > 0"
    class="lb-clear-filters-btn"
    :title="t('tableColumn.clearAllFilters')"
    @click="$emit('clear')"
  >
    <el-icon :size="14"><Filter /></el-icon>
    <span>{{ t('tableColumn.clearAllFilters') }}</span>
    <span class="lb-clear-filters-btn__count">{{ count }}</span>
  </el-button>
</template>
