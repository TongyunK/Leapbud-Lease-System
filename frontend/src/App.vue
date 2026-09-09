<script setup lang="ts">
import { ElConfigProvider } from 'element-plus'
import GlobalStatusDialog from '@/components/GlobalStatusDialog.vue'

const dialogConfig = {
  alignCenter: true,
  draggable: true,
  overflow: true,
}
</script>

<template>
  <el-config-provider :dialog="dialogConfig">
    <router-view />
    <GlobalStatusDialog />
  </el-config-provider>
</template>
