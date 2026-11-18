<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
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
  Message,
  OfficeBuilding,
  Search,
  SwitchButton,
} from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import SidebarMenuNodes from '@/components/SidebarMenuNodes.vue'
import { storeToRefs } from 'pinia'
import { useUserStore } from '@/stores/user'
import { useBuildingScopeStore } from '@/stores/buildingScope'
import { useNavStore } from '@/stores/nav'
import { useStatusStore } from '@/stores/status'
import { useBrandingStore } from '@/stores/branding'
import { useMenuRoleAccessStore } from '@/stores/menuRoleAccess'
import { changeEmailApi, changePasswordApi, fetchMeApi } from '@/api/auth'
import { isAxiosError } from 'axios'
import { useIsCompact, useIsMobile } from '@/composables/useMediaQuery'
import { useFrequentRoutes, type FrequentRouteName } from '@/composables/useFrequentRoutes'
import { registerMainBoundsPublisher } from '@/utils/layoutMainBounds'
import { sweepOrphanOverlays } from '@/utils/sweepStuckOverlays'
import type { MenuRecord } from '@/types/menu'
import { menuDisplayName } from '@/utils/menuLabel'

const { t, te, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const buildingScope = useBuildingScopeStore()
const navStore = useNavStore()
const brandingStore = useBrandingStore()
const menuRoleAccess = useMenuRoleAccessStore()
const { logoUrl, title: brandTitle, subtitle: brandSubtitle, logoFrameless } =
  storeToRefs(brandingStore)

function syncMenuRoleAccess() {
  if (userStore.isLoggedIn && userStore.isSuperAdmin) {
    void menuRoleAccess.load()
  } else {
    menuRoleAccess.clear()
  }
}
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
/**
 * 右侧主区 `.main`（红框区域：侧栏以右整块，含顶栏快捷/大厦筛选与内容白卡片）。
 * 弹窗「内容区全屏」对齐此处，侧栏未折叠时侧栏仍完整可见。
 */
const mainEl = ref<HTMLElement | null>(null)
const layoutEl = ref<HTMLElement | null>(null)
let mainBoundsRo: ResizeObserver | null = null

function publishMainBounds() {
  const el = mainEl.value
  const root = document.documentElement
  if (!el) {
    root.style.setProperty('--lb-main-top', '0px')
    root.style.setProperty('--lb-main-left', '0px')
    root.style.setProperty('--lb-main-right', '0px')
    root.style.setProperty('--lb-main-bottom', '0px')
    root.style.setProperty('--lb-main-width', '100vw')
    root.style.setProperty('--lb-main-height', '100vh')
    return
  }
  const r = el.getBoundingClientRect()
  const top = Math.round(r.top)
  const left = Math.round(r.left)
  const width = Math.max(0, Math.round(r.width))
  const height = Math.max(0, Math.round(r.height))
  root.style.setProperty('--lb-main-top', `${top}px`)
  root.style.setProperty('--lb-main-left', `${left}px`)
  root.style.setProperty('--lb-main-right', `${Math.max(0, Math.round(window.innerWidth - r.right))}px`)
  root.style.setProperty('--lb-main-bottom', `${Math.max(0, Math.round(window.innerHeight - r.bottom))}px`)
  root.style.setProperty('--lb-main-width', `${width}px`)
  root.style.setProperty('--lb-main-height', `${height}px`)
}
const pwdVisible = ref(false)
const pwdForm = reactive({
  current: '',
  next: '',
  confirm: '',
})
const emailVisible = ref(false)
const emailLoading = ref(false)
const emailSaving = ref(false)
const emailForm = reactive({
  current: '',
  next: '',
  password: '',
})

function accountErrorMessage(e: unknown, fallback: string) {
  if (isAxiosError(e)) {
    const msg = (e.response?.data as { message?: string | string[] } | undefined)?.message
    if (Array.isArray(msg) && msg[0]) return String(msg[0])
    if (typeof msg === 'string' && msg.trim()) return msg
  }
  if (e instanceof Error && e.message) return e.message
  return fallback
}

const displayName = computed(
  () => userStore.user?.displayName || userStore.user?.account || 'User',
)
const avatarLetter = computed(() => displayName.value.slice(0, 1))

const activeMenu = computed(() => (typeof route.name === 'string' ? route.name : ''))
const sidebarCollapsed = computed(() => !isMobile.value && collapsed.value)
const showLabels = computed(() => isMobile.value || !collapsed.value)
const menuRevision = computed(() => navStore.revision)

const menuKeyword = ref('')

function menuNodeMatches(node: MenuRecord, q: string) {
  const label = menuDisplayName(node, locale.value, t, te).toLowerCase()
  if (label.includes(q)) return true
  if (String(node.name || '').toLowerCase().includes(q)) return true
  if (String(node.nameEn || '').toLowerCase().includes(q)) return true
  return false
}

function filterMenuTree(nodes: MenuRecord[], q: string): MenuRecord[] {
  if (!q) return nodes
  const out: MenuRecord[] = []
  for (const node of nodes) {
    if (node.type === 'directory') {
      const selfHit = menuNodeMatches(node, q)
      const children = filterMenuTree(node.children || [], q)
      if (selfHit) {
        out.push({ ...node, children: node.children ? [...node.children] : [] })
      } else if (children.length) {
        out.push({ ...node, children })
      }
      continue
    }
    if (node.routeName && menuNodeMatches(node, q)) out.push(node)
  }
  return out
}

function collectDirectoryIds(nodes: MenuRecord[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (node.type !== 'directory') continue
    ids.push(node.id)
    if (node.children?.length) ids.push(...collectDirectoryIds(node.children))
  }
  return ids
}

const filteredMenuTree = computed(() => {
  const q = menuKeyword.value.trim().toLowerCase()
  return filterMenuTree(navStore.tree, q)
})

const menuSearchActive = computed(() => Boolean(menuKeyword.value.trim()))

/** 根据当前路由展开对应目录；搜索时展开筛选结果中的全部目录 */
const openMenus = computed(() => {
  if (menuSearchActive.value) return collectDirectoryIds(filteredMenuTree.value)
  if (typeof route.name !== 'string') return []
  return navStore.openIdsForRoute(route.name)
})

watch(sidebarCollapsed, (collapsedNow) => {
  if (collapsedNow) menuKeyword.value = ''
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
      syncMenuRoleAccess()
    } else {
      navStore.clear()
      buildingScope.clear()
      menuRoleAccess.clear()
    }
  },
)

watch(
  () => userStore.isSuperAdmin,
  () => {
    syncMenuRoleAccess()
  },
)

onMounted(() => {
  if (userStore.isLoggedIn) {
    void navStore.loadNav()
    void buildingScope.load()
    syncMenuRoleAccess()
  }
  registerMainBoundsPublisher(publishMainBounds)
  void nextTick(() => {
    publishMainBounds()
    if (typeof ResizeObserver !== 'undefined') {
      mainBoundsRo = new ResizeObserver(() => publishMainBounds())
      if (mainEl.value) mainBoundsRo.observe(mainEl.value)
      if (layoutEl.value) mainBoundsRo.observe(layoutEl.value)
    }
  })
  window.addEventListener('resize', publishMainBounds)
  window.addEventListener('scroll', publishMainBounds, true)
})

onBeforeUnmount(() => {
  registerMainBoundsPublisher(null)
  mainBoundsRo?.disconnect()
  mainBoundsRo = null
  window.removeEventListener('resize', publishMainBounds)
  window.removeEventListener('scroll', publishMainBounds, true)
})

watch([collapsed, mobileOpen, isMobile, isCompact, sidebarCollapsed], () => {
  void nextTick(() => {
    publishMainBounds()
    // 侧栏宽度有 transition，动画结束后再测一次
    window.setTimeout(publishMainBounds, 220)
  })
})

function onBuildingChange(id: string) {
  buildingScope.select(!id || id === ALL_BUILDINGS ? null : id)
}

function onSelect(index: string) {
  if (!index) return
  // 弹窗关闭后偶发残留遮罩挡侧栏：先清再跳转，避免「点一下没反应」
  sweepOrphanOverlays()
  router.push({ name: index })
  mobileOpen.value = false
  menuKeyword.value = ''
}

function onLogout() {
  userStore.logout()
  navStore.clear()
  buildingScope.clear()
  menuRoleAccess.clear()
  useStatusStore().clear()
  router.replace({ name: 'login' })
}

function onUserCommand(cmd: string) {
  if (cmd === 'password') {
    pwdForm.current = ''
    pwdForm.next = ''
    pwdForm.confirm = ''
    pwdVisible.value = true
  } else if (cmd === 'email') {
    void openEmailDialog()
  } else if (cmd === 'logout') {
    onLogout()
  }
}

async function openEmailDialog() {
  emailForm.current = (userStore.user?.email || '').trim()
  emailForm.next = ''
  emailForm.password = ''
  emailVisible.value = true
  emailLoading.value = true
  try {
    const { data } = await fetchMeApi()
    const email = (data?.email || '').trim()
    emailForm.current = email
    userStore.patchUser({ email })
  } catch (e: unknown) {
    await ElMessageBox.alert(
      accountErrorMessage(e, t('account.emailLoadFailed')),
      t('common.tip'),
      { type: 'error' },
    )
  } finally {
    emailLoading.value = false
  }
}

async function submitPassword() {
  if (!pwdForm.current || !pwdForm.next) {
    await ElMessageBox.alert(t('account.passwordRequired'), t('common.tip'), { type: 'warning' })
    return
  }
  if (pwdForm.next !== pwdForm.confirm) {
    await ElMessageBox.alert(t('account.passwordMismatch'), t('common.tip'), { type: 'warning' })
    return
  }
  if (pwdForm.next.length < 6) {
    await ElMessageBox.alert(t('account.passwordTooShort'), t('common.tip'), { type: 'warning' })
    return
  }
  if (pwdForm.current === pwdForm.next) {
    await ElMessageBox.alert(t('account.passwordSameAsCurrent'), t('common.tip'), {
      type: 'warning',
    })
    return
  }
  try {
    await changePasswordApi({
      currentPassword: pwdForm.current,
      newPassword: pwdForm.next,
    })
    await ElMessageBox.alert(t('account.passwordChanged'), t('common.tip'), { type: 'success' })
    pwdVisible.value = false
    onLogout()
  } catch {
    /* interceptor shows 目前密碼不正確 等业务错误；勿当 401 踢出 */
  }
}

async function submitEmail() {
  const next = emailForm.next.trim()
  const password = emailForm.password.trim()
  if (!next) {
    await ElMessageBox.alert(t('account.emailRequired'), t('common.tip'), { type: 'warning' })
    return
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
    await ElMessageBox.alert(t('account.emailInvalid'), t('common.tip'), { type: 'warning' })
    return
  }
  if (next.toLowerCase() === emailForm.current.trim().toLowerCase()) {
    await ElMessageBox.alert(t('account.emailSameAsCurrent'), t('common.tip'), { type: 'warning' })
    return
  }
  if (!password) {
    await ElMessageBox.alert(t('account.emailPasswordRequired'), t('common.tip'), {
      type: 'warning',
    })
    return
  }
  emailSaving.value = true
  try {
    const { data } = await changeEmailApi({ email: next, currentPassword: password })
    const email = (data?.user?.email || next).trim()
    userStore.patchUser({ email })
    // 先提示再关弹窗，避免 destroy-on-close 与 MessageBox 抢遮罩导致成功框被推迟
    await ElMessageBox.alert(t('account.emailChanged'), t('common.tip'), { type: 'success' })
    emailVisible.value = false
  } catch (e: unknown) {
    await ElMessageBox.alert(
      accountErrorMessage(e, t('account.emailRequired')),
      t('common.tip'),
      { type: 'error' },
    )
  } finally {
    emailSaving.value = false
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
  sweepOrphanOverlays()
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
  <div
    ref="layoutEl"
    class="app-layout"
    :class="{ collapsed: sidebarCollapsed, 'mobile-open': mobileOpen }"
  >
    <div
      v-if="isMobile && mobileOpen"
      class="sidebar-mask"
      @click="mobileOpen = false"
    />

    <aside class="sidebar" :class="{ 'is-drawer': isMobile, open: mobileOpen }">
      <div class="sidebar-brand" @click="router.push({ name: 'home' }); mobileOpen = false">
        <div class="brand-mark" :class="{ 'is-frameless': logoFrameless }">
          <img :src="logoUrl" :alt="brandTitle" class="brand-logo" />
        </div>
        <div v-show="showLabels" class="brand-text">
          <strong>{{ brandTitle }}</strong>
          <span>{{ brandSubtitle }}</span>
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

      <div v-show="showLabels" class="sidebar-menu-search" @mousedown.stop @click.stop>
        <el-input
          v-model="menuKeyword"
          clearable
          :prefix-icon="Search"
          :placeholder="t('layout.menuSearchPlaceholder')"
          class="sidebar-menu-search__input"
        />
      </div>

      <div class="sidebar-nav">
        <el-menu
          :key="`${isMobile}-${sidebarCollapsed}-${menuRevision}-${menuKeyword.trim()}`"
          :default-active="activeMenu"
          :default-openeds="openMenus"
          :collapse="sidebarCollapsed"
          :collapse-transition="false"
          popper-class="sidebar-menu-popper"
          class="sidebar-menu"
          @select="onSelect"
        >
          <SidebarMenuNodes :nodes="filteredMenuTree" />
        </el-menu>
        <p v-if="menuSearchActive && !filteredMenuTree.length" class="sidebar-menu-search__empty">
          {{ t('layout.menuSearchEmpty') }}
        </p>
      </div>
    </aside>

    <div ref="mainEl" class="main">
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
              <el-dropdown-item command="email">
                <el-icon><Message /></el-icon>
                <span>{{ t('account.manageEmail') }}</span>
              </el-dropdown-item>
              <el-dropdown-item divided command="logout">
                <el-icon><SwitchButton /></el-icon>
                <span>{{ t('home.logout') }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>

      <div class="content-shell" :class="{ 'content-shell--home': route.name === 'home' }">
        <router-view :key="buildingScope.viewKey" />
      </div>
    </div>

    <el-dialog
      v-model="pwdVisible"
      :title="t('account.changePassword')"
      width="420px"
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

    <el-dialog
      v-model="emailVisible"
      :title="t('account.manageEmail')"
      width="420px"
      destroy-on-close
      class="lb-dialog"
    >
      <el-form v-loading="emailLoading" label-position="top">
        <p class="account-email-hint">{{ t('account.emailHint') }}</p>
        <el-form-item :label="t('account.currentEmail')">
          <el-input
            :model-value="emailForm.current || t('account.emailEmpty')"
            disabled
          />
        </el-form-item>
        <el-form-item :label="t('account.newEmail')" required>
          <el-input
            v-model="emailForm.next"
            type="email"
            autocomplete="email"
            :placeholder="t('account.newEmail')"
          />
        </el-form-item>
        <el-form-item :label="t('account.currentPassword')" required>
          <el-input
            v-model="emailForm.password"
            type="password"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="emailVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="emailSaving" @click="submitEmail">
          {{ t('common.confirm') }}
        </el-button>
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
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 3%, #f3f3f3);
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
  background: linear-gradient(
    180deg,
    var(--lb-sidebar-from, #115338) 0%,
    var(--lb-sidebar-mid, #0f4a32) 42%,
    var(--lb-sidebar-to, #0c3d29) 100%
  );
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
  padding: 16px 10px 4px;
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
  flex-shrink: 0;
  overflow: hidden;
}

.brand-mark.is-frameless {
  background: transparent;
  border: 0;
  overflow: visible;
}

.brand-logo {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  object-position: center;
}

.brand-mark.is-frameless .brand-logo {
  object-fit: contain;
  filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.25));
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

.sidebar-menu-search {
  flex-shrink: 0;
  /* 上移与品牌区距离、下收与首个菜单间距 */
  padding: 26px 14px 6px;
}

.sidebar-menu-search__input {
  width: 100%;
}

.sidebar-menu-search__input :deep(.el-input__wrapper) {
  min-height: 32px;
  padding-inline: 11px 9px;
  border-radius: 999px !important;
  /* 融入侧栏：半透明浅绿底，避免纯白高对比 */
  background: rgba(255, 255, 255, 0.12) !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14) inset !important;
  transition:
    background 0.15s ease,
    box-shadow 0.15s ease;
}

.sidebar-menu-search__input :deep(.el-input__wrapper:hover) {
  background: rgba(255, 255, 255, 0.16) !important;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22) inset !important;
}

.sidebar-menu-search__input :deep(.el-input__wrapper.is-focus) {
  background: rgba(255, 255, 255, 0.2) !important;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.32) inset,
    0 0 0 3px rgba(158, 187, 176, 0.22) !important;
}

.sidebar-menu-search__input :deep(.el-input__inner) {
  color: rgba(255, 255, 255, 0.92);
  font-size: 0.84rem;
  font-weight: 500;
}

.sidebar-menu-search__input :deep(.el-input__inner::placeholder) {
  color: rgba(255, 255, 255, 0.42);
  font-weight: 450;
}

.sidebar-menu-search__input :deep(.el-input__prefix),
.sidebar-menu-search__input :deep(.el-input__suffix) {
  color: rgba(255, 255, 255, 0.55);
}

.sidebar-menu-search__input :deep(.el-input__clear) {
  color: rgba(255, 255, 255, 0.5);
}

.sidebar-menu-search__input :deep(.el-input__clear:hover) {
  color: rgba(255, 255, 255, 0.85);
}

.sidebar-menu-search__empty {
  margin: 18px 8px 8px;
  padding: 0 6px;
  color: rgba(255, 255, 255, 0.55);
  font-size: 0.82rem;
  font-weight: 500;
  text-align: center;
  line-height: 1.4;
}

.sidebar-nav {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 2px 6px 14px;
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
  position: relative;
  margin: 2px 0;
  border-radius: 10px;
  height: 40px;
  line-height: 40px;
  color: #fff !important;
  display: flex !important;
  align-items: center;
  transition: background 0.15s ease, color 0.15s ease;
}

.sidebar-menu :deep(.el-menu-item:hover),
.sidebar-menu :deep(.el-sub-menu__title:hover) {
  background: rgba(255, 255, 255, 0.1) !important;
}

.sidebar-menu :deep(.el-menu-item:hover > .nav-role-access),
.sidebar-menu :deep(.el-sub-menu__title:hover > .nav-role-access),
.sidebar-menu :deep(.nav-role-access.is-open),
.sidebar-menu :deep(.nav-role-access.is-forced-open) {
  opacity: 1;
  transform: translate(0, -50%);
  pointer-events: auto;
}

/* 仅悬停显示权限徽章时，才给标题让出右侧空间 */
.sidebar-menu :deep(.el-menu-item:hover > .nav-label),
.sidebar-menu :deep(.el-menu-item:has(.nav-role-access.is-open) > .nav-label),
.sidebar-menu :deep(.el-menu-item:has(.nav-role-access.is-forced-open) > .nav-label) {
  padding-right: 52px;
}

.sidebar-menu :deep(.el-sub-menu__title:hover > .nav-label),
.sidebar-menu :deep(.el-sub-menu__title:has(.nav-role-access.is-open) > .nav-label),
.sidebar-menu :deep(.el-sub-menu__title:has(.nav-role-access.is-forced-open) > .nav-label) {
  padding-right: 58px;
}

.sidebar-menu :deep(.el-sub-menu__title) {
  font-weight: 650;
  padding-right: 32px !important;
}

.sidebar-menu :deep(.el-sub-menu__title > .nav-role-access) {
  right: 28px;
}

.app-layout.collapsed .sidebar-menu :deep(.nav-role-access) {
  display: none !important;
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
  display: flex !important;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 0 !important;
  box-sizing: border-box;
}

/* 与 Element Plus 菜单默认一致（约 14px）；此前未 :deep，大屏实际一直是这档 */
.sidebar-menu :deep(.nav-label) {
  flex: 1;
  min-width: 0;
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

.app-layout.collapsed .sidebar-menu.el-menu--collapse :deep(.el-sub-menu__title),
.app-layout.collapsed .sidebar-menu.el-menu--collapse :deep(.el-menu-item),
.app-layout.collapsed .sidebar-menu.el-menu--collapse :deep(.el-menu-tooltip__trigger) {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 0 !important;
  margin-inline: 0;
}

.app-layout.collapsed .sidebar-menu :deep(.el-sub-menu__icon-arrow),
.app-layout.collapsed .sidebar-menu :deep(.nav-label) {
  display: none !important;
}

.app-layout.collapsed .sidebar-menu :deep(.nav-icon) {
  margin: 0 !important;
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  line-height: 1;
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
  border-bottom: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #e6e6e6);
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
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, #fff);
  box-shadow: 0 0 0 1px var(--lb-brand, #0f4a32) inset !important;
}

.utility-building :deep(.el-select__wrapper.is-hovering:not(.is-disabled)),
.utility-building :deep(.el-select__wrapper.is-focused) {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 18%, #fff);
  box-shadow:
    0 0 0 1px var(--lb-brand, #0f4a32) inset,
    0 2px 8px color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, transparent) !important;
}

.utility-building :deep(.el-select__wrapper.is-disabled) {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 5%, #f3f3f3);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, #d0d0d0) inset !important;
  cursor: default;
}

.utility-building :deep(.el-select__selected-item),
.utility-building :deep(.el-select__placeholder) {
  color: var(--lb-brand, #0f4a32);
  font-size: 0.82rem;
  font-weight: 650;
}

.utility-building :deep(.el-select__caret),
.utility-building__icon {
  color: var(--lb-brand, #0f4a32);
}

/* 仅一栋大厦可访问时隐藏下拉箭头，避免误导可切换 */
.utility-building--locked :deep(.el-select__suffix),
.utility-building--locked :deep(.el-select__caret) {
  display: none !important;
}

.utility-building--locked :deep(.el-select__wrapper) {
  padding-right: 10px;
  cursor: default;
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
  color: var(--lb-muted, #888);
  white-space: nowrap;
}

.header-fold-btn {
  width: 34px;
  height: 34px;
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, #e0e0e0);
  border-radius: 10px;
  background: #fff;
  color: var(--lb-brand, #0f4a32);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.header-fold-btn:hover {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 5%, #f5f5f5);
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 28%, #c8c8c8);
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
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 6%, transparent);
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
  background: var(--lb-brand, #0f4a32);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  flex-shrink: 0;
}

.user-name {
  font-size: 0.84rem;
  color: var(--lb-ink, #1a1a1a);
  font-weight: 560;
  max-width: 110px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-caret {
  color: var(--lb-muted, #666);
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
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #e6e6e6);
  box-shadow: 0 8px 28px color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, transparent);
  overflow: hidden;
  padding: 12px 14px 10px;
  display: flex;
  flex-direction: column;
}

.content-shell > * {
  flex: 1;
  min-height: 0;
}

/* 首页：外壳滚动，避免内容被 overflow:hidden 裁切 */
.content-shell--home {
  padding: 10px 12px 12px;
  /* 勿用旧绿灰 #eef1f0；中性浅灰 + 主题淡染 */
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 3%, #f3f3f3);
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 28%, transparent) transparent;
}

.content-shell--home > * {
  flex: 0 0 auto;
  min-height: auto;
  height: auto;
  overflow: visible;
}

.content-shell--home::-webkit-scrollbar {
  width: 8px;
}

.content-shell--home::-webkit-scrollbar-track {
  background: transparent;
  margin-block: 8px;
}

.content-shell--home::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 20%, transparent);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

.content-shell--home::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 38%, transparent);
  background-clip: padding-box;
}

.content-shell--home::-webkit-scrollbar-button,
.content-shell--home::-webkit-scrollbar-corner {
  display: none;
  width: 0;
  height: 0;
}

@media (max-width: 959.98px) {
  .content-shell--home {
    padding: 8px;
  }
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

.account-email-hint {
  margin: 0 0 12px;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--lb-muted, #666);
}
</style>

<style>
.nav-role-access-popper.el-popper {
  max-width: 240px;
  min-width: 148px;
  padding: 0 !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 12px !important;
  background: linear-gradient(180deg, #3a4048 0%, #2a2f36 100%) !important;
  box-shadow:
    0 14px 36px rgba(0, 0, 0, 0.34),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset !important;
  overflow: hidden;
}

.nav-role-access-popper .el-popper__arrow::before {
  background: #323841 !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
}

.nav-role-access-tip {
  padding: 10px 11px 9px;
}

.nav-role-access-tip__head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  padding-bottom: 7px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.nav-role-access-tip__head-icon {
  color: #7dd3fc;
  flex-shrink: 0;
}

.nav-role-access-tip__title {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.04em;
  color: rgba(255, 255, 255, 0.58);
}

.nav-role-access-tip__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(125, 211, 252, 0.2);
  color: #bae6fd;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.nav-role-access-tip__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-role-access-tip__list li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 4px 6px;
  border-radius: 7px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: #f8fafc;
  transition: background 0.12s ease;
}

.nav-role-access-tip__list li:hover {
  background: rgba(255, 255, 255, 0.06);
}

.nav-role-access-tip__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #7dd3fc;
  box-shadow: 0 0 0 3px rgba(125, 211, 252, 0.16);
}

.nav-role-access-tip__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-role-access-tip__empty {
  margin: 2px 0 0;
  padding: 4px 2px;
  font-size: 14px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.5);
}

.user-dropdown-popper.el-popper {
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #e6e6e6) !important;
  border-radius: 10px !important;
  box-shadow: 0 10px 28px color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, transparent) !important;
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
  color: var(--lb-muted, #666);
}

.user-dropdown-popper .el-dropdown-menu__item:not(.is-disabled):hover {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #fff) !important;
  color: var(--lb-brand) !important;
}

.user-dropdown-popper .el-dropdown-menu__item:not(.is-disabled):hover .el-icon {
  color: var(--lb-brand);
}

.user-dropdown-popper .el-dropdown-menu__item--divided {
  margin-top: 6px;
  border-top: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #e8e8e8);
}

.user-dropdown-popper .el-dropdown-menu__item--divided::before {
  display: none;
}

/* 侧栏折叠后的悬浮子菜单 */
.sidebar-menu-popper.el-popper {
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #e6e6e6) !important;
  border-radius: 12px !important;
  box-shadow: 0 12px 32px color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, transparent) !important;
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
  color: var(--lb-muted, #666) !important;
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
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #fff) !important;
  color: var(--lb-brand) !important;
}

.sidebar-menu-popper .el-menu-item:hover .nav-icon {
  color: var(--lb-brand) !important;
}

.sidebar-menu-popper .el-menu-item.is-active {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, #fff) !important;
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
