<script setup lang="ts">
import { watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useStatusStore } from '@/stores/status'

const statusStore = useStatusStore()

watch(
  () => statusStore.visible,
  (visible) => {
    if (!visible || !statusStore.message) return
    const opts = { message: statusStore.message, duration: 3200 }
    if (statusStore.type === 'success') {
      ElMessage.success(opts)
    } else if (statusStore.type === 'info') {
      ElMessage.info(opts)
    } else {
      ElMessage.error(opts)
    }
    statusStore.clear()
  },
)
</script>

<template>
  <span class="sr-only" aria-hidden="true" />
</template>
