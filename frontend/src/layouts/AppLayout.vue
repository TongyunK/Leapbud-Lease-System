<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  DArrowLeft,
  DArrowRight,
  Menu as MenuIcon,
  Close,
  ArrowDown,
  Filter,
  Lock,
  OfficeBuilding,
  SwitchButton,
} from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import SidebarMenuNodes from '@/components/SidebarMenuNodes.vue'
import { useUserStore } from '@/stores/user'
import { useBuildingScopeStore } from '@/stores/buildingScope'
import { useNavStore } from '@/stores/nav'
import { changePasswordApi } from '@/api/auth'
import { useIsCompact, useIsMobile } from '@/composables/useMediaQuery'
import { useFrequentRoutes, type FrequentRouteName } from '@/composables/useFrequentRoutes'

const { t, te } = useI18n()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const buildingScope = useBuildingScopeStore()
const navStore = useNavStore()
const ALL_BUILDINGS = '__all__'
const isMobile = useIsMobile()
const isCompact = useIsCompact()
const { shortcuts, removeShortcut } = useFrequentRoutes()
/** 小屏最多 6 个快捷，给大厦筛选留出完整显示空间 */
const visibleShortcuts = computed(() =>
  shortcuts.value.slice(0, isCompact.value || isMobile.value ? 6 : 8),
)

const collapsed = ref(false)
const mobileOpen = ref(false)
const userMenuOpen = ref(false)
const pwdVisible = ref(false)
const pwdForm = reactive({
  current: '',
  next: '',
  confirm: '',
})

const displayName = computed(
  () => userStore.user?.displayName || userStore.user?.account || 'User',
)
const avatarLetter = computed(() => displayName.value.slice(0, 1))

const activeMenu = computed(() => (typeof route.name === 'string' ? route.name : ''))
const sidebarCollapsed = computed(() => !isMobile.value && collapsed.value)
const showLabels = computed(() => isMobile.value || !collapsed.value)
const menuRevision = computed(() => navStore.revision)

/** 根据当前路由展开对应目录 */
const openMenus = computed(() => {
  if (typeof route.name !== 'string') return []
  return navStore.openIdsForRoute(route.name)
})

watch(
  () => route.fullPath,
  () => {
    mobileOpen.value = false
  },
)

watch(isMobile, (mobile) => {
  if (!mobile) mobileOpen.value = false
})

watch(
  isCompact,
  (compact) => {
    if (compact) collapsed.value = false
  },
  { immediate: true },
)

watch(
  () => userStore.isLoggedIn,
  (ok) => {
    if (ok) {
      void navStore.loadNav()
      void buildingScope.load()
      void userStore.loadPermissions()
    } else {
      navStore.clear()
      buildingScope.clear()
    }
  },
)

onMounted(() => {
  if (userStore.isLoggedIn) {
    void navStore.loadNav()
    void buildingScope.load()
    void userStore.loadPermissions()
  }
})

function onBuildingChange(id: string) {
  buildingScope.select(!id || id === ALL_BUILDINGS ? null : id)
}

function onSelect(index: string) {
  if (!index) return
  router.push({ name: index })
  mobileOpen.value = false
}

function onLogout() {
  userStore.logout()
  navStore.clear()
  buildingScope.clear()
  router.replace({ name: 'login' })
}

function onUserCommand(cmd: string) {
  if (cmd === 'password') {
    pwdForm.current = ''
    pwdForm.next = ''
    pwdForm.confirm = ''
    pwdVisible.value = true
  } else if (cmd === 'logout') {
    onLogout()
  }
}

async function submitPassword() {
  if (!pwdForm.current || !pwdForm.next) {
    ElMessage.warning(t('account.passwordRequired'))
    return
  }
  if (pwdForm.next !== pwdForm.confirm) {
    ElMessage.warning(t('account.passwordMismatch'))
    return
  }
  if (pwdForm.next.length < 6) {
    ElMessage.warning(t('account.passwordTooShort'))
    return
  }
  if (pwdForm.current === pwdForm.next) {
    ElMessage.warning(t('account.passwordSameAsCurrent'))
    return
  }
  try {
    await changePasswordApi({
      currentPassword: pwdForm.current,
      newPassword: pwdForm.next,
    })
    pwdVisible.value = false
    ElMessage.success(t('account.passwordChanged'))
    onLogout()
  } catch {
    /* interceptor shows 目前密碼不正確 等业务错误；勿当 401 踢出 */
  }
}

function toggleNav() {
  if (isMobile.value) {
    mobileOpen.value = !mobileOpen.value
  } else {
    collapsed.value = !collapsed.value
  }
}

function shortcutLabel(name: FrequentRouteName) {
  const matched = router.getRoutes().find((r) => r.name === name)
  const titleKey = matched?.meta?.titleKey
  if (typeof titleKey === 'string' && te(titleKey)) return t(titleKey)
  return name
}

function goShortcut(name: FrequentRouteName) {
  if (route.name === name) return
  router.push({ name })
}

function onRemoveShortcut(name: FrequentRouteName, event: Event) {
  event.preventDefault()
  event.stopPropagation()
  removeShortcut(name)
}
</script>

<template>
  <div class="app-layout" :class="{ collapsed: sidebarCollapsed, 'mobile-open': mobileOpen }">
    <div
      v-if="isMobile && mobileOpen"
      class="sidebar-mask"
      @click="mobileOpen = false"
    />

    <aside class="sidebar" :class="{ 'is-drawer': isMobile, open: mobileOpen }">
      <div class="sidebar-brand" @click="router.push({ name: 'buildings' }); mobileOpen = false">
        <div class="brand-mark">
          <img src="/leapbud_logo.png" alt="leapbud" class="brand-logo" />
        </div>
        <div v-show="showLabels" class="brand-text">
          <strong>leapbud</strong>
          <span>{{ t('layout.systemName') }}</span>
        </div>
        <button
          v-if="isMobile"
          type="button"
          class="drawer-close"
          :aria-label="t('common.cancel')"
          @click.stop="mobileOpen = false"
        >
          <el-icon :size="16"><Close /></el-icon>
        </button>
      </div>

      <div class="sidebar-nav">
        <el-menu
          :key="`${isMobile}-${sidebarCollapsed}-${menuRevision}-${activeMenu}`"
          :default-active="activeMenu"
          :default-openeds="openMenus"
          :collapse="sidebarCollapsed"
          :collapse-transition="false"
          popper-class="sidebar-menu-popper"
          class="sidebar-menu"
          @select="onSelect"
        >
          <SidebarMenuNodes :nodes="navStore.tree" />
        </el-menu>
      </div>
    </aside>

    <div class="main">
      <header class="utility">
        <button
          type="button"
          class="header-fold-btn"
          :aria-label="sidebarCollapsed ? 'Expand' : 'Collapse'"
          @click="toggleNav"
        >
          <el-icon :size="16">
            <MenuIcon v-if="isMobile" />
            <DArrowRight v-else-if="sidebarCollapsed" />
            <DArrowLeft v-else />
          </el-icon>
        </button>

        <nav class="quick-nav" :aria-label="t('layout.shortcuts')">
          <template v-for="(name, idx) in visibleShortcuts" :key="name">
            <span v-if="idx > 0" class="quick-sep" aria-hidden="true">|</span>
            <span class="quick-item">
              <button
                type="button"
                class="quick-link"
                :class="{ active: activeMenu === name }"
                @click="goShortcut(name)"
              >
                {{ shortcutLabel(name) }}
              </button>
              <button
                type="button"
                class="quick-remove"
                :title="t('layout.removeShortcut')"
                :aria-label="t('layout.removeShortcut')"
                @click="onRemoveShortcut(name, $event)"
              >
                ×
              </button>
            </span>
          </template>
          <span v-if="!visibleShortcuts.length" class="quick-empty">{{ t('layout.shortcutsEmpty') }}</span>
        </nav>

        <div class="utility-spacer" />
        <el-select
          v-if="buildingScope.loaded && buildingScope.options.length"
          :model-value="buildingScope.selectedId || ALL_BUILDINGS"
          class="utility-building"
          :class="{ 'utility-building--locked': buildingScope.locked }"
          popper-class="utility-building-popper"
          filterable
          :disabled="buildingScope.locked"
          :aria-label="t('layout.currentBuilding')"
          :title="buildingScope.selectedId ? buildingScope.options.find((b) => b.id === buildingScope.selectedId)?.name : t('layout.allBuildings')"
          @update:model-value="onBuildingChange"
        >
          <template #prefix>
            <el-icon class="utility-building__icon"><OfficeBuilding /></el-icon>
          </template>
          <el-option
            v-if="!buildingScope.locked"
            :label="t('layout.allBuildings')"
            :value="ALL_BUILDINGS"
          >
            <span class="utility-building-option">
              <el-icon><Filter /></el-icon>
              <span>{{ t('layout.allBuildings') }}</span>
            </span>
          </el-option>
          <el-option
            v-for="b in buildingScope.options"
            :key="b.id"
            :label="b.name"
            :value="b.id"
          >
            <span class="utility-building-option">
              <el-icon><OfficeBuilding /></el-icon>
              <span>{{ b.name }}</span>
            </span>
          </el-option>
        </el-select>
        <span v-else-if="buildingScope.loaded && !userStore.isAdmin" class="utility-building-empty">
          {{ t('layout.noBuildingAccess') }}
        </span>
        <LanguageSwitcher tone="on-light" />
        <el-dropdown
          trigger="click"
          :teleported="true"
          popper-class="user-dropdown-popper"
          @command="onUserCommand"
          @visible-change="(v: boolean) => (userMenuOpen = v)"
        >
          <button type="button" class="user-chip" :class="{ open: userMenuOpen }">
            <span class="user-avatar">{{ avatarLetter }}</span>
            <span class="user-name">{{ displayName }}</span>
            <el-icon class="user-caret" :size="12"><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="password">
                <el-icon><Lock /></el-icon>
                <span>{{ t('account.changePassword') }}</span>
              </el-dropdown-item>
              <el-dropdown-item divided command="logout">
                <el-icon><SwitchButton /></el-icon>
                <span>{{ t('home.logout') }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>

      <div class="content-shell">
        <router-view :key="buildingScope.viewKey" />
      </div>
    </div>

    <el-dialog
      v-model="pwdVisible"
      :title="t('account.changePassword')"
      width="420px"
      align-center
      destroy-on-close
      class="lb-dialog"
    >
      <el-form label-position="top">
        <el-form-item :label="t('account.currentPassword')" required>
          <el-input v-model="pwdForm.current" type="password" show-password autocomplete="current-password" />
        </el-form-item>
        <el-form-item :label="t('account.newPassword')" required>
          <el-input v-model="pwdForm.next" type="password" show-password autocomplete="new-password" />
        </el-form-item>
        <el-form-item :label="t('account.confirmPassword')" required>
          <el-input v-model="pwdForm.confirm" type="password" show-password autocomplete="new-password" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pwdVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="submitPassword">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.app-layout {
  --sidebar-w: 220px;
  --sidebar-w-collapsed: 68px;
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  height: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
  background: #eef1f0;
  transition: grid-template-columns 0.22s ease;
}

.app-layout.collapsed {
  grid-template-columns: var(--sidebar-w-collapsed) minmax(0, 1fr);
}

/* 小笔记本：侧栏更窄，给内容区更多宽度 */
@media (max-width: 1279.98px) and (min-width: 960px) {
  .app-layout {
    --sidebar-w: 200px;
    --sidebar-w-collapsed: 64px;
  }
}

@media (min-width: 1440px) {
  .app-layout {
    --sidebar-w: 218px;
  }
}

@media (min-width: 1800px) {
  .app-layout {
    --sidebar-w: 226px;
  }
}

.sidebar-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(12, 28, 20, 0.42);
  backdrop-filter: blur(2px);
}

.sidebar {
  position: sticky;
  top: 0;
  align-self: start;
  width: var(--sidebar-w);
  height: 100vh;
  height: 100dvh;
  background: linear-gradient(180deg, #115338 0%, #0f4a32 42%, #0c3d29 100%);
  color: #fff;
  display: flex;
  flex-direction: column;
  z-index: 50;
  overflow: hidden;
  box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.06);
}

.app-layout.collapsed .sidebar {
  width: var(--sidebar-w-collapsed);
}

.sidebar.is-drawer {
  position: fixed;
  left: 0;
  top: 0;
  /* 小屏抽屉：约占视口 68%，上限 240px，避免占满半屏 */
  width: min(240px, 68vw);
  max-width: 240px;
  transform: translateX(-105%);
  transition: transform 0.22s ease;
  box-shadow: 10px 0 36px rgba(0, 0, 0, 0.28);
}

.sidebar.is-drawer.open {
  transform: translateX(0);
}

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 16px 10px 12px;
  cursor: pointer;
  min-height: 64px;
}

.app-layout.collapsed .sidebar-brand {
  justify-content: center;
  padding-inline: 10px;
}

.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.16);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  overflow: hidden;
}

.brand-logo {
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
  min-width: 0;
  flex: 1;
}

.brand-text strong {
  font-size: 1.08rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: lowercase;
}

.brand-text span {
  margin-top: 4px;
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: rgba(255, 255, 255, 0.68);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (min-width: 1440px) {
  .brand-text strong {
    font-size: 1.16rem;
  }

  .brand-text span {
    font-size: 0.86rem;
  }
}

@media (min-width: 1800px) {
  .brand-text strong {
    font-size: 1.24rem;
  }

  .brand-text span {
    font-size: 0.9rem;
  }
}

.drawer-close {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.drawer-close:hover {
  background: rgba(255, 255, 255, 0.18);
}

.sidebar-nav {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 8px 6px 14px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.28) transparent;
}

.sidebar-nav::-webkit-scrollbar {
  width: 6px;
}

.sidebar-nav::-webkit-scrollbar-track {
  background: transparent;
  margin-block: 4px;
}

.sidebar-nav::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  border: 1px solid transparent;
  background-clip: padding-box;
}

.sidebar-nav::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.4);
  background-clip: padding-box;
}

.sidebar-nav::-webkit-scrollbar-button,
.sidebar-nav::-webkit-scrollbar-corner {
  display: none;
  width: 0;
  height: 0;
}

.app-layout.collapsed .sidebar-nav {
  padding-inline: 6px;
}

.sidebar-menu {
  border-right: none !important;
  background: transparent !important;
  width: 100% !important;
  --el-menu-bg-color: transparent;
  --el-menu-text-color: rgba(255, 255, 255, 0.92);
  --el-menu-hover-bg-color: rgba(255, 255, 255, 0.1);
  --el-menu-active-color: #fff;
  --el-menu-item-height: 40px;
  --el-menu-base-level-padding: 10px;
  --el-menu-level-padding: 18px;
  --el-menu-icon-width: 22px;
}

.sidebar-menu:not(.el-menu--collapse) {
  width: 100%;
}

.sidebar-menu :deep(.el-menu-item),
.sidebar-menu :deep(.el-sub-menu__title) {
  margin: 2px 0;
  border-radius: 10px;
  height: 40px;
  line-height: 40px;
  color: #fff !important;
  transition: background 0.15s ease, color 0.15s ease;
}

.sidebar-menu :deep(.el-menu-item:hover),
.sidebar-menu :deep(.el-sub-menu__title:hover) {
  background: rgba(255, 255, 255, 0.1) !important;
}

.sidebar-menu :deep(.el-sub-menu__title) {
  font-weight: 650;
  padding-right: 32px !important;
}

.sidebar-menu :deep(.el-sub-menu__icon-arrow) {
  color: rgba(255, 255, 255, 0.6);
  right: 12px;
  font-size: 13px;
}

.sidebar-menu :deep(.el-sub-menu .el-menu) {
  background: transparent !important;
}

/* 参考图：白色实心剪影图标，无方框 */
.sidebar-menu :deep(.nav-icon) {
  margin-right: 8px;
  width: 1.35em;
  height: 1.35em;
  color: #fff;
  flex-shrink: 0;
}

.sidebar-menu :deep(.nav-icon svg) {
  width: 1.15em;
  height: 1.15em;
}

.sidebar-menu :deep(.el-menu-item.is-active) {
  background: rgba(255, 255, 255, 0.14) !important;
  color: #fff !important;
  font-weight: 700;
  position: relative;
  box-shadow: none;
}

.sidebar-menu :deep(.el-menu-item.is-active::before) {
  content: '';
  position: absolute;
  left: 0;
  top: 7px;
  bottom: 7px;
  width: 4px;
  border-radius: 0 4px 4px 0;
  background: #fff;
}

.sidebar-menu :deep(.el-menu-tooltip__trigger) {
  justify-content: center;
  padding: 0 !important;
}

/* 与 Element Plus 菜单默认一致（约 14px）；此前未 :deep，大屏实际一直是这档 */
.sidebar-menu :deep(.nav-label) {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 1440px) {
  .sidebar-menu {
    --el-menu-item-height: 42px;
  }

  .sidebar-menu :deep(.el-menu-item),
  .sidebar-menu :deep(.el-sub-menu__title) {
    height: 42px;
    line-height: 42px;
  }

  .sidebar-menu :deep(.nav-icon) {
    width: 1.35em;
    height: 1.35em;
  }
}

@media (min-width: 1800px) {
  .sidebar-menu {
    --el-menu-item-height: 44px;
  }

  .sidebar-menu :deep(.el-menu-item),
  .sidebar-menu :deep(.el-sub-menu__title) {
    height: 44px;
    line-height: 44px;
  }
}

.app-layout.collapsed .sidebar-menu :deep(.el-sub-menu__title),
.app-layout.collapsed .sidebar-menu :deep(.el-menu-item) {
  justify-content: center;
  padding: 0 !important;
}

.app-layout.collapsed .sidebar-menu :deep(.nav-icon) {
  margin-right: 0;
}

.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  padding: 0;
  gap: 0;
}

.utility {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  min-width: 0;
  padding: 8px 14px;
  background: #fff;
  border: 0;
  border-bottom: 1px solid #e2e8e5;
  border-radius: 0;
  box-shadow: none;
}

.utility-spacer {
  flex: 1;
  min-width: 4px;
}

.utility-building {
  width: 200px;
  min-width: 200px;
  max-width: 200px;
  flex: 0 0 200px;
}

.utility-building :deep(.el-select__wrapper) {
  border-radius: 999px !important;
  min-height: 32px;
  padding: 0 10px 0 8px;
  background: #e4efe9;
  box-shadow: 0 0 0 1px #0f4a32 inset !important;
}

.utility-building :deep(.el-select__wrapper.is-hovering:not(.is-disabled)),
.utility-building :deep(.el-select__wrapper.is-focused) {
  background: #d8ebe2;
  box-shadow:
    0 0 0 1px #0f4a32 inset,
    0 2px 8px rgba(15, 74, 50, 0.14) !important;
}

.utility-building :deep(.el-select__wrapper.is-disabled) {
  background: #eef3f0;
  box-shadow: 0 0 0 1px #c5d5cc inset !important;
  cursor: default;
}

.utility-building--locked :deep(.el-select__wrapper) {
  padding-right: 10px;
}

.utility-building--locked :deep(.el-select__suffix) {
  display: none;
}

.utility-building :deep(.el-select__selected-item),
.utility-building :deep(.el-select__placeholder) {
  color: #0f4a32;
  font-size: 0.82rem;
  font-weight: 650;
}

.utility-building :deep(.el-select__caret),
.utility-building__icon {
  color: #0f4a32;
}

.utility-building :deep(.el-select__selection) {
  flex-wrap: nowrap;
}

.utility-building :deep(.el-select__selected-item) {
  overflow: hidden;
  text-overflow: ellipsis;
}

.utility-building-empty {
  flex-shrink: 0;
  font-size: 0.78rem;
  color: #8a978f;
  white-space: nowrap;
}

.header-fold-btn {
  width: 34px;
  height: 34px;
  border: 1px solid #d5ddd8;
  border-radius: 10px;
  background: #fff;
  color: #0f4a32;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.header-fold-btn:hover {
  background: #f7f9f8;
  border-color: #b8c8bf;
}

.quick-nav {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
  gap: 0;
  padding: 0 2px;
}

.quick-nav::-webkit-scrollbar {
  display: none;
}

.quick-sep {
  color: #c5cec9;
  font-size: 0.78rem;
  padding: 0 2px;
  user-select: none;
}

.quick-item {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.quick-link {
  border: 0;
  background: transparent;
  cursor: pointer;
  padding: 6px 16px 6px 9px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 550;
  color: #5b6b63;
  white-space: nowrap;
  line-height: 1.2;
  transition: color 0.15s ease, background 0.15s ease;
}

.quick-link:hover {
  color: var(--lb-brand);
  background: rgba(15, 74, 50, 0.06);
}

.quick-link.active {
  color: var(--lb-brand);
  font-weight: 700;
}

.quick-remove {
  position: absolute;
  top: 1px;
  right: 2px;
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: 50%;
  padding: 0;
  background: transparent;
  color: #8a9a92;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  display: inline-grid;
  place-items: center;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
}

.quick-item:hover .quick-remove,
.quick-item:focus-within .quick-remove {
  opacity: 1;
}

.quick-remove:hover {
  background: rgba(192, 57, 43, 0.12);
  color: #c0392b;
}

.quick-empty {
  font-size: 0.78rem;
  color: #9aa89f;
  padding: 0 6px;
  white-space: nowrap;
}

.user-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 3px 8px 3px 3px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid #dce3df;
  min-width: 0;
  cursor: pointer;
  font-family: inherit;
  color: inherit;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}

.user-chip:hover,
.user-chip.open {
  border-color: #b8c8bf;
  box-shadow: 0 4px 14px rgba(15, 40, 30, 0.08);
}

.user-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: #0f4a32;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  flex-shrink: 0;
}

.user-name {
  font-size: 0.84rem;
  color: #1f2d27;
  font-weight: 560;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-caret {
  color: #6a7a70;
  flex-shrink: 0;
  transition: transform 0.18s ease;
}

.user-chip.open .user-caret {
  transform: rotate(180deg);
}

.content-shell {
  flex: 1;
  min-height: 0;
  margin: 10px 12px 12px;
  background: #fff;
  border-radius: 16px;
  border: 1px solid #e2e8e5;
  box-shadow: 0 8px 28px rgba(15, 40, 30, 0.06);
  overflow: hidden;
  padding: 12px 14px 10px;
  display: flex;
  flex-direction: column;
}

.content-shell > * {
  flex: 1;
  min-height: 0;
}

@media (max-width: 1279.98px) {
  .utility-building {
    width: 168px;
    min-width: 168px;
    max-width: 168px;
    flex: 0 0 168px;
  }
}

/* 含常见 14 寸笔记本最大化视口（约 1366～1439） */
@media (max-width: 1439.98px) {
  .sidebar-menu :deep(.nav-label) {
    font-size: 13px;
  }
}

@media (max-width: 959.98px) {
  .app-layout,
  .app-layout.collapsed {
    grid-template-columns: minmax(0, 1fr);
  }

  .main {
    padding: 0;
    gap: 0;
  }

  .utility {
    padding: 6px 10px;
    border-radius: 0;
  }

  .user-name {
    display: none;
  }

  .user-chip {
    padding: 3px 6px 3px 3px;
  }

  .content-shell {
    margin: 6px;
    padding: 10px;
    border-radius: 12px;
  }
}

@media (max-width: 520px) {
  .sidebar.is-drawer {
    width: min(220px, 72vw);
  }
}
</style>

<style>
.user-dropdown-popper.el-popper {
  border: 1px solid #e2e8e5 !important;
  border-radius: 10px !important;
  box-shadow: 0 10px 28px rgba(15, 40, 30, 0.12) !important;
  overflow: hidden;
  padding: 0 !important;
}

.user-dropdown-popper .el-dropdown-menu {
  padding: 6px !important;
  border: 0 !important;
  background: #fff !important;
  min-width: 160px;
}

.user-dropdown-popper .el-dropdown-menu__item {
  border-radius: 7px;
  padding: 9px 12px !important;
  font-size: 0.88rem;
  font-weight: 550;
  color: #243029 !important;
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1.3;
}

.user-dropdown-popper .el-dropdown-menu__item .el-icon {
  margin: 0;
  font-size: 15px;
  color: #5b6b63;
}

.user-dropdown-popper .el-dropdown-menu__item:not(.is-disabled):hover {
  background: #f3f5f4 !important;
  color: var(--lb-brand) !important;
}

.user-dropdown-popper .el-dropdown-menu__item:not(.is-disabled):hover .el-icon {
  color: var(--lb-brand);
}

.user-dropdown-popper .el-dropdown-menu__item--divided {
  margin-top: 6px;
  border-top: 1px solid #e8eeea;
}

.user-dropdown-popper .el-dropdown-menu__item--divided::before {
  display: none;
}

/* 侧栏折叠后的悬浮子菜单 */
.sidebar-menu-popper.el-popper {
  border: 1px solid #e2e8e5 !important;
  border-radius: 12px !important;
  box-shadow: 0 12px 32px rgba(15, 40, 30, 0.14) !important;
  overflow: hidden;
  padding: 0 !important;
  background: #fff !important;
}

.sidebar-menu-popper .el-menu--popup {
  min-width: 168px !important;
  padding: 6px !important;
  border: none !important;
  border-radius: 12px !important;
  background: #fff !important;
  box-shadow: none !important;
}

.sidebar-menu-popper .el-menu-item {
  margin: 2px 0 !important;
  height: 38px !important;
  line-height: 38px !important;
  padding: 0 12px !important;
  border-radius: 8px !important;
  color: #243029 !important;
  font-size: 0.82rem !important;
  font-weight: 600 !important;
  display: flex !important;
  align-items: center !important;
  gap: 0 !important;
}

.sidebar-menu-popper .el-menu-item .nav-icon {
  margin-right: 8px !important;
  width: 1.15em !important;
  height: 1.15em !important;
  color: #5b6b63 !important;
  flex-shrink: 0;
}

.sidebar-menu-popper .el-menu-item .nav-icon svg {
  width: 1.05em !important;
  height: 1.05em !important;
}

.sidebar-menu-popper .el-menu-item .nav-label {
  color: inherit;
  font-size: 0.82rem;
  font-weight: 600;
}

.sidebar-menu-popper .el-menu-item:hover {
  background: #eef5f1 !important;
  color: var(--lb-brand) !important;
}

.sidebar-menu-popper .el-menu-item:hover .nav-icon {
  color: var(--lb-brand) !important;
}

.sidebar-menu-popper .el-menu-item.is-active {
  background: #e4efe9 !important;
  color: var(--lb-brand) !important;
  font-weight: 700 !important;
  box-shadow: none !important;
}

.sidebar-menu-popper .el-menu-item.is-active::before {
  display: none !important;
}

.sidebar-menu-popper .el-menu-item.is-active .nav-icon {
  color: var(--lb-brand) !important;
}
</style>
