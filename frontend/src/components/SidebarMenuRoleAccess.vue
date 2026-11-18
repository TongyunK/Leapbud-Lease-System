<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Key } from '@element-plus/icons-vue'
import type { MenuAccessRole } from '@/stores/menuRoleAccess'

const props = defineProps<{
  menuId: string
  roles: MenuAccessRole[]
}>()

const emit = defineEmits<{
  openChange: [open: boolean]
}>()

const { t } = useI18n()
const tipOpen = ref(false)

const count = computed(() => props.roles.length)

function onTipVisible(visible: boolean) {
  tipOpen.value = visible
  emit('openChange', visible)
}
</script>

<template>
  <span
    class="nav-role-access"
    :class="{ 'is-open': tipOpen }"
    @click.stop
    @mousedown.stop
  >
    <el-tooltip
      placement="right-start"
      effect="dark"
      :show-after="160"
      :hide-after="100"
      :offset="10"
      popper-class="nav-role-access-popper"
      @show="onTipVisible(true)"
      @hide="onTipVisible(false)"
    >
      <template #content>
        <div class="nav-role-access-tip">
          <div class="nav-role-access-tip__head">
            <el-icon class="nav-role-access-tip__head-icon" :size="13"><Key /></el-icon>
            <span class="nav-role-access-tip__title">{{ t('layout.menuRoleAccessTitle') }}</span>
            <span v-if="count" class="nav-role-access-tip__badge">{{ count }}</span>
          </div>
          <ul v-if="roles.length" class="nav-role-access-tip__list">
            <li v-for="role in roles" :key="role.id">
              <span class="nav-role-access-tip__dot" aria-hidden="true" />
              <span class="nav-role-access-tip__name">{{ role.name }}</span>
            </li>
          </ul>
          <p v-else class="nav-role-access-tip__empty">{{ t('layout.menuRoleAccessEmpty') }}</p>
        </div>
      </template>
      <button
        type="button"
        class="nav-role-access__chip"
        :aria-label="t('layout.menuRoleAccessHint')"
      >
        <span class="nav-role-access__icon-wrap">
          <el-icon :size="12"><Key /></el-icon>
        </span>
        <span class="nav-role-access__count">{{ count }}</span>
      </button>
    </el-tooltip>
  </span>
</template>

<style scoped>
/* 绝对定位叠在右侧，不占文档流，避免菜单名被提前挤成省略号 */
.nav-role-access {
  position: absolute;
  top: 50%;
  right: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  opacity: 0;
  transform: translate(4px, -50%) scale(0.92);
  pointer-events: none;
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.nav-role-access.is-open,
.nav-role-access.is-forced-open {
  opacity: 1;
  transform: translate(0, -50%);
  pointer-events: auto;
}

.nav-role-access__chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 7px 0 5px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.2) 0%,
    rgba(255, 255, 255, 0.08) 100%
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.22),
    0 4px 10px rgba(0, 0, 0, 0.12);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  cursor: default;
  user-select: none;
  backdrop-filter: blur(8px);
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.nav-role-access__chip:hover {
  border-color: rgba(186, 230, 253, 0.55);
  background: linear-gradient(
    180deg,
    rgba(186, 230, 253, 0.32) 0%,
    rgba(125, 211, 252, 0.16) 100%
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 6px 14px rgba(0, 0, 0, 0.16);
  transform: translateY(-0.5px);
}

.nav-role-access__icon-wrap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(125, 211, 252, 0.28);
  color: #e0f2fe;
}

.nav-role-access__chip:hover .nav-role-access__icon-wrap {
  background: rgba(125, 211, 252, 0.42);
  color: #fff;
}

.nav-role-access__count {
  min-width: 0.75em;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  color: #f8fafc;
}
</style>
