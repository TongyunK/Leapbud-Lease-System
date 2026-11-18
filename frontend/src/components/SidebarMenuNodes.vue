<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { MenuRecord } from '@/types/menu'
import { resolveMenuIcon } from '@/utils/menuIcons'
import { menuDisplayName } from '@/utils/menuLabel'
import { useUserStore } from '@/stores/user'
import { useMenuRoleAccessStore } from '@/stores/menuRoleAccess'
import SidebarMenuRoleAccess from '@/components/SidebarMenuRoleAccess.vue'

const props = defineProps<{
  nodes: MenuRecord[]
}>()

const { t, te, locale } = useI18n()
const userStore = useUserStore()
const menuRoleAccess = useMenuRoleAccessStore()

/** 正在展开角色提示的菜单 id（避免移入气泡时徽章消失） */
const openTipMenuId = ref<string | null>(null)

const showAccessHints = computed(() => userStore.isSuperAdmin && menuRoleAccess.ready)

function labelOf(node: MenuRecord) {
  return menuDisplayName(node, locale.value, t, te)
}

function rolesOf(menuId: string) {
  return menuRoleAccess.rolesOf(menuId)
}

function onTipOpenChange(menuId: string, open: boolean) {
  openTipMenuId.value = open ? menuId : openTipMenuId.value === menuId ? null : openTipMenuId.value
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
        <SidebarMenuRoleAccess
          v-if="showAccessHints"
          :menu-id="node.id"
          :roles="rolesOf(node.id)"
          :class="{ 'is-forced-open': openTipMenuId === node.id }"
          @open-change="(open) => onTipOpenChange(node.id, open)"
        />
      </template>
      <SidebarMenuNodes v-if="node.children?.length" :nodes="node.children" />
    </el-sub-menu>
    <el-menu-item v-else-if="node.routeName" :index="node.routeName">
      <el-icon class="nav-icon" :size="20">
        <component :is="resolveMenuIcon(node.icon)" />
      </el-icon>
      <span class="nav-label">{{ labelOf(node) }}</span>
      <SidebarMenuRoleAccess
        v-if="showAccessHints"
        :menu-id="node.id"
        :roles="rolesOf(node.id)"
        :class="{ 'is-forced-open': openTipMenuId === node.id }"
        @open-change="(open) => onTipOpenChange(node.id, open)"
      />
    </el-menu-item>
  </template>
</template>
