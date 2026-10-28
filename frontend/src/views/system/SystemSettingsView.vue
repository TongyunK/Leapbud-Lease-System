<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Ticket, RefreshRight } from '@element-plus/icons-vue'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { fetchSystemSettings, updateSystemSettingsApi } from '@/api/system-settings'
import { formatDateTime } from '@/utils/format'

type SettingsSectionId = 'billing'

const { t } = useI18n()
const perms = useResourcePermissions('systemSettings')

const loading = ref(false)
const saving = ref(false)
const dirty = ref(false)
const activeSection = ref<SettingsSectionId>('billing')

const meta = reactive({
  updatedAt: null as string | null,
  updatedBy: null as string | null,
})

const form = reactive({
  rentInvoiceLeadDays: 7,
})

const snapshot = reactive({
  rentInvoiceLeadDays: 7,
})

const sections = computed(() => [
  {
    id: 'billing' as const,
    icon: Ticket,
    title: t('systemSettings.sections.billing'),
    desc: t('systemSettings.sections.billingNavDesc'),
  },
])

function markDirty() {
  dirty.value =
    Math.trunc(Number(form.rentInvoiceLeadDays)) !== snapshot.rentInvoiceLeadDays
}

function applySnapshot() {
  snapshot.rentInvoiceLeadDays = Math.trunc(Number(form.rentInvoiceLeadDays)) || 7
  dirty.value = false
}

async function scrollToSection(id: SettingsSectionId) {
  activeSection.value = id
  await nextTick()
  const el = document.getElementById(`settings-section-${id}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function load() {
  loading.value = true
  try {
    const { data } = await fetchSystemSettings()
    form.rentInvoiceLeadDays = data.rentInvoiceLeadDays
    meta.updatedAt = data.updatedAt
    meta.updatedBy = data.updatedBy
    applySnapshot()
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : t('systemSettings.loadFailed'))
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.rentInvoiceLeadDays = snapshot.rentInvoiceLeadDays
  dirty.value = false
}

async function save() {
  if (!perms.update.value) return
  const days = Math.trunc(Number(form.rentInvoiceLeadDays))
  if (!Number.isFinite(days) || days < 1 || days > 90) {
    ElMessage.warning(t('systemSettings.leadDaysInvalid'))
    return
  }
  saving.value = true
  try {
    const { data } = await updateSystemSettingsApi({ rentInvoiceLeadDays: days })
    form.rentInvoiceLeadDays = data.rentInvoiceLeadDays
    meta.updatedAt = data.updatedAt
    meta.updatedBy = data.updatedBy
    applySnapshot()
    ElMessage.success(t('systemSettings.saved'))
  } catch (e: unknown) {
    ElMessage.error(e instanceof Error ? e.message : t('systemSettings.saveFailed'))
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div v-loading="loading" class="system-settings">
    <aside class="system-settings__nav" :aria-label="t('menu.systemSettings')">
      <div class="system-settings__nav-title">{{ t('systemSettings.navTitle') }}</div>
      <button
        v-for="sec in sections"
        :key="sec.id"
        type="button"
        class="system-settings__nav-item"
        :class="{ 'is-active': activeSection === sec.id }"
        @click="scrollToSection(sec.id)"
      >
        <el-icon class="system-settings__nav-icon"><component :is="sec.icon" /></el-icon>
        <span class="system-settings__nav-text">
          <span class="system-settings__nav-label">{{ sec.title }}</span>
          <span class="system-settings__nav-desc">{{ sec.desc }}</span>
        </span>
      </button>
    </aside>

    <div class="system-settings__main">
      <el-form label-position="top" class="system-settings__form" @submit.prevent>
        <section id="settings-section-billing" class="settings-card">
          <header class="settings-card__head">
            <div class="settings-card__icon" aria-hidden="true">
              <el-icon :size="20"><Ticket /></el-icon>
            </div>
            <div class="settings-card__head-text">
              <h3 class="settings-card__title">{{ t('systemSettings.sections.billing') }}</h3>
              <p class="settings-card__desc">{{ t('systemSettings.sections.billingDesc') }}</p>
            </div>
          </header>

          <div class="settings-card__body">
            <div class="setting-row">
              <div class="setting-row__label">
                <div class="setting-row__name">
                  {{ t('systemSettings.fields.rentInvoiceLeadDays') }}
                </div>
                <div class="setting-row__hint">
                  {{ t('systemSettings.hints.rentInvoiceLeadDays') }}
                </div>
              </div>
              <div class="setting-row__control">
                <el-input-number
                  v-model="form.rentInvoiceLeadDays"
                  :min="1"
                  :max="90"
                  :step="1"
                  :disabled="!perms.update.value"
                  controls-position="right"
                  @change="markDirty"
                />
                <span class="setting-row__unit">{{ t('systemSettings.unit.days') }}</span>
              </div>
            </div>
          </div>
        </section>
      </el-form>

      <footer class="system-settings__footer">
        <div class="system-settings__meta">
          <template v-if="meta.updatedAt">
            {{
              t('systemSettings.lastUpdated', {
                by: meta.updatedBy || '—',
                at: formatDateTime(meta.updatedAt),
              })
            }}
          </template>
          <span v-if="dirty" class="system-settings__dirty">{{ t('systemSettings.unsaved') }}</span>
        </div>
        <div v-if="perms.update.value" class="system-settings__actions">
          <el-button :disabled="!dirty || saving" @click="resetForm">
            <el-icon class="el-icon--left"><RefreshRight /></el-icon>
            {{ t('systemSettings.reset') }}
          </el-button>
          <el-button type="primary" :loading="saving" :disabled="!dirty" @click="save">
            {{ t('common.save') }}
          </el-button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.system-settings {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
  min-height: min(70vh, 720px);
}

.system-settings__nav {
  position: sticky;
  top: 12px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
}

.system-settings__nav-title {
  margin: 0 8px 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--el-text-color-secondary);
}

.system-settings__nav-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.system-settings__nav-item:hover {
  background: var(--el-fill-color-light);
}

.system-settings__nav-item.is-active {
  background: color-mix(in srgb, var(--lb-brand, var(--el-color-primary)) 12%, transparent);
  color: var(--lb-brand, var(--el-color-primary));
}

.system-settings__nav-icon {
  margin-top: 2px;
  flex-shrink: 0;
  font-size: 18px;
}

.system-settings__nav-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.system-settings__nav-label {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
}

.system-settings__nav-desc {
  font-size: 12px;
  line-height: 1.35;
  color: var(--el-text-color-secondary);
}

.system-settings__nav-item.is-active .system-settings__nav-desc {
  color: color-mix(in srgb, var(--lb-brand, var(--el-color-primary)) 72%, var(--el-text-color-secondary));
}

.system-settings__main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.settings-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: var(--el-bg-color);
  box-shadow: 0 1px 2px rgb(15 23 42 / 4%);
  overflow: hidden;
  scroll-margin-top: 16px;
}

.settings-card__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  background: linear-gradient(
    180deg,
    var(--el-fill-color-blank) 0%,
    color-mix(in srgb, var(--el-fill-color-light) 55%, transparent) 100%
  );
}

.settings-card__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  flex-shrink: 0;
  color: var(--lb-brand, var(--el-color-primary));
  background: color-mix(in srgb, var(--lb-brand, var(--el-color-primary)) 14%, transparent);
}

.settings-card__head-text {
  min-width: 0;
}

.settings-card__title {
  margin: 0 0 4px;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.3;
  color: var(--el-text-color-primary);
}

.settings-card__desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.settings-card__body {
  padding: 4px 6px;
}

.setting-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px 24px;
  align-items: center;
  padding: 16px 12px;
  border-top: 1px solid var(--el-border-color-extra-light);
}

.setting-row:first-child {
  border-top: 0;
}

.setting-row__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  line-height: 1.35;
}

.setting-row__hint {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
  max-width: 52ch;
}

.setting-row__control {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.setting-row__unit {
  font-size: 13px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
}

.system-settings__footer {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 12px;
  background: color-mix(in srgb, var(--el-bg-color) 92%, transparent);
  backdrop-filter: blur(8px);
  box-shadow: 0 -4px 16px rgb(15 23 42 / 4%);
}

.system-settings__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.system-settings__dirty {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-warning-dark-2);
  background: var(--el-color-warning-light-9);
}

.system-settings__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

@media (max-width: 900px) {
  .system-settings {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .system-settings__nav {
    position: static;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px;
  }

  .system-settings__nav-title {
    width: 100%;
    margin: 0 4px 2px;
  }

  .system-settings__nav-item {
    flex: 1 1 160px;
  }

  .system-settings__nav-desc {
    display: none;
  }

  .setting-row {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .setting-row__control {
    justify-content: flex-start;
  }
}
</style>
