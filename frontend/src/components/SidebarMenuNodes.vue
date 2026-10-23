<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MenuRecord } from '@/types/menu'
import { resolveMenuIcon } from '@/utils/menuIcons'
import { menuDisplayName } from '@/utils/menuLabel'

const props = defineProps<{
  nodes: MenuRecord[]
}>()

const { t, te, locale } = useI18n()

function labelOf(node: MenuRecord) {
  return menuDisplayName(node, locale.value, t, te)
}

const items = computed(() => props.nodes || [])
</script>

<template>
  <template v-for="node in items" :key="node.id">
    <el-sub-menu v-if="node.type === 'directory'" :index="node.id">
      <template #title>
        <el-icon class="nav-icon" :size="20">
          <component :is="resolveMenuIcon(node.icon)" />
        </el-icon>
        <span class="nav-label">{{ labelOf(node) }}</span>
      </template>
      <SidebarMenuNodes v-if="node.children?.length" :nodes="node.children" />
    </el-sub-menu>
    <el-menu-item v-else-if="node.routeName" :index="node.routeName">
      <el-icon class="nav-icon" :size="20">
        <component :is="resolveMenuIcon(node.icon)" />
      </el-icon>
      <span class="nav-label">{{ labelOf(node) }}</span>
    </el-menu-item>
  </template>
</template>
