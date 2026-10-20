<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDown } from '@element-plus/icons-vue'
import { setLocale, localeOptions, type AppLocale } from '@/i18n'

withDefaults(
  defineProps<{
    /** 深色鉴权页用 on-dark；浅色顶栏用 on-light */
    tone?: 'on-dark' | 'on-light'
  }>(),
  { tone: 'on-dark' },
)

const { t, locale } = useI18n()
const open = ref(false)

const current = computed(() => locale.value as AppLocale)

const currentLabel = computed(() => {
  const opt = localeOptions.find((o) => o.value === current.value)
  return opt ? t(opt.labelKey) : current.value
})

function onCommand(value: string) {
  if (value === 'zh-TW' || value === 'en') {
    setLocale(value)
  }
}
</script>

<template>
  <el-dropdown
    class="lang-dropdown"
    trigger="click"
    :teleported="true"
    popper-class="lang-dropdown-popper"
    @command="onCommand"
    @visible-change="(v: boolean) => (open = v)"
  >
    <button
      type="button"
      class="lang-switcher"
      :class="[tone, { open }]"
      :aria-label="t('language.label')"
    >
      <span class="lang-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18" />
          <path d="M12 3c2.5 2.8 3.8 5.8 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-5.8-3.8-9s1.3-6.2 3.8-9Z" />
        </svg>
      </span>
      <span class="lang-label">{{ currentLabel }}</span>
      <el-icon class="lang-caret" :size="12"><ArrowDown /></el-icon>
    </button>

    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="opt in localeOptions"
          :key="opt.value"
          :command="opt.value"
          :class="{ 'is-active-lang': current === opt.value }"
        >
          {{ t(opt.labelKey) }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.lang-dropdown {
  flex-shrink: 0;
}

.lang-switcher {
  border: 0;
  cursor: pointer;
  height: 36px;
  padding: 0 8px 0 6px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  white-space: nowrap;
  font-family: inherit;
  line-height: 1;
  outline: none;
  transition:
    background 0.15s ease,
    color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.lang-ico {
  width: 22px;
  height: 22px;
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  color: inherit;
  opacity: 0.88;
}

.lang-ico svg {
  width: 16px;
  height: 16px;
}

.lang-label {
  font-size: 0.86rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.lang-caret {
  margin-left: 1px;
  opacity: 0.55;
  transition: transform 0.18s ease, opacity 0.15s ease;
}

.lang-switcher.open .lang-caret {
  transform: rotate(180deg);
  opacity: 0.85;
}

.lang-switcher.on-light {
  background: transparent;
  color: #3a4a42;
}

.lang-switcher.on-light:hover,
.lang-switcher.on-light.open {
  background: rgba(15, 74, 50, 0.06);
  color: var(--lb-brand);
}

.lang-switcher.on-dark {
  background: rgba(255, 252, 247, 0.12);
  border: 1px solid rgba(244, 239, 230, 0.22);
  color: #fff;
  backdrop-filter: blur(10px);
}

.lang-switcher.on-dark:hover,
.lang-switcher.on-dark.open {
  background: rgba(255, 252, 247, 0.2);
}
</style>

<style>
/* 下拉菜单全局（teleport 到 body） */
.lang-dropdown-popper.el-popper {
  border: 1px solid #e2e8e5 !important;
  border-radius: 10px !important;
  box-shadow: 0 10px 28px rgba(15, 40, 30, 0.12) !important;
  overflow: hidden;
  padding: 0 !important;
}

.lang-dropdown-popper .el-dropdown-menu {
  padding: 6px !important;
  border: 0 !important;
  background: #fff !important;
  min-width: 128px;
}

.lang-dropdown-popper .el-dropdown-menu__item {
  border-radius: 7px;
  padding: 9px 12px !important;
  font-size: 0.88rem;
  font-weight: 550;
  color: #243029 !important;
  line-height: 1.3;
}

.lang-dropdown-popper .el-dropdown-menu__item:not(.is-disabled):hover {
  background: #f3f5f4 !important;
  color: var(--lb-brand) !important;
}

.lang-dropdown-popper .el-dropdown-menu__item.is-active-lang {
  background: rgba(15, 74, 50, 0.08) !important;
  color: var(--lb-brand) !important;
  font-weight: 700;
}
</style>
