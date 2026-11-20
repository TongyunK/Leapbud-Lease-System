<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import {
  Ticket,
  Message,
  Brush,
  Lock,
  ChatDotRound,
  QuestionFilled,
  RefreshRight,
  Plus,
} from '@element-plus/icons-vue'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { fetchSystemSettings, updateSystemSettingsApi } from '@/api/system-settings'
import { uploadAttachmentApi } from '@/api/uploads'
import AttachmentImageViewer from '@/components/AttachmentImageViewer.vue'
import WhatsappSettingsPanel from '@/components/WhatsappSettingsPanel.vue'
import { useBrandingStore, DEFAULT_BRANDING } from '@/stores/branding'
import { isHexColor } from '@/utils/brandTheme'
import { probeImageHasTransparency } from '@/utils/logoFrame'
import { formatDateTime } from '@/utils/format'
import type { BrandingConfig, MailSmtpConfig } from '@/types/system-setting'

type SettingsSectionId = 'branding' | 'billing' | 'mail' | 'login' | 'whatsapp'

const PASSWORD_MASK = '********'
const DEFAULT_LOGO = '/leapbud_logo.png'

const { t } = useI18n()
const perms = useResourcePermissions('systemSettings')
const brandingStore = useBrandingStore()

const loading = ref(false)
const saving = ref(false)
const uploadingLogo = ref(false)
const dirty = ref(false)
const activeSection = ref<SettingsSectionId>('branding')
const logoInputRef = ref<HTMLInputElement | null>(null)
const logoPreviewVisible = ref(false)

const meta = reactive({
  updatedAt: null as string | null,
  updatedBy: null as string | null,
})

const defaultMail = (): MailSmtpConfig => ({
  host: 'mail.wisesystemtech.com',
  port: 587,
  secure: false,
  email: 'rentalsystem@wisesystemtech.com',
  password: '',
  fromName: 'Leapbud 租賃系統',
  hasPassword: false,
})

const defaultBranding = (): BrandingConfig => ({ ...DEFAULT_BRANDING })

const form = reactive({
  rentInvoiceLeadDays: 7,
  loginMaxFailedAttempts: 5,
  loginLockoutMinutes: 15,
  loginCaptchaEnabled: false,
  mailSmtp: defaultMail(),
  branding: defaultBranding(),
})

const snapshot = reactive({
  rentInvoiceLeadDays: 7,
  loginMaxFailedAttempts: 5,
  loginLockoutMinutes: 15,
  loginCaptchaEnabled: false,
  mailSmtp: defaultMail(),
  branding: defaultBranding(),
})

const sections = computed(() => [
  {
    id: 'branding' as const,
    icon: Brush,
    title: t('systemSettings.sections.branding'),
    desc: t('systemSettings.sections.brandingNavDesc'),
  },
  {
    id: 'billing' as const,
    icon: Ticket,
    title: t('systemSettings.sections.billing'),
    desc: t('systemSettings.sections.billingNavDesc'),
  },
  {
    id: 'mail' as const,
    icon: Message,
    title: t('systemSettings.sections.mail'),
    desc: t('systemSettings.sections.mailNavDesc'),
  },
  {
    id: 'login' as const,
    icon: Lock,
    title: t('systemSettings.sections.login'),
    desc: t('systemSettings.sections.loginNavDesc'),
  },
  {
    id: 'whatsapp' as const,
    icon: ChatDotRound,
    title: t('systemSettings.sections.whatsapp'),
    desc: t('systemSettings.sections.whatsappNavDesc'),
  },
])

const logoPreviewUrl = computed(
  () => form.branding.logoUrl || DEFAULT_LOGO,
)
/** 设置页预览用：跟表单当前 Logo 走，未保存也可去掉透明 PNG 方框 */
const logoPreviewFrameless = ref(false)
let logoPreviewProbeSeq = 0

watch(
  logoPreviewUrl,
  (url) => {
    const seq = ++logoPreviewProbeSeq
    void probeImageHasTransparency(url).then((hasAlpha) => {
      if (seq !== logoPreviewProbeSeq) return
      logoPreviewFrameless.value = hasAlpha
    })
  },
  { immediate: true },
)

function openLogoPreview() {
  if (!logoPreviewUrl.value) return
  logoPreviewVisible.value = true
}

function mailEqual(a: MailSmtpConfig, b: MailSmtpConfig) {
  return (
    a.host === b.host &&
    a.port === b.port &&
    a.secure === b.secure &&
    a.email === b.email &&
    a.fromName === b.fromName &&
    a.password === b.password
  )
}

function brandingEqual(a: BrandingConfig, b: BrandingConfig) {
  return (
    (a.logoKey || '') === (b.logoKey || '') &&
    (a.themeColor || '').toLowerCase() === (b.themeColor || '').toLowerCase() &&
    (a.title || '') === (b.title || '') &&
    (a.subtitle || '') === (b.subtitle || '')
  )
}

function markDirty() {
  dirty.value =
    Math.trunc(Number(form.rentInvoiceLeadDays)) !== snapshot.rentInvoiceLeadDays ||
    Math.trunc(Number(form.loginMaxFailedAttempts)) !== snapshot.loginMaxFailedAttempts ||
    Math.trunc(Number(form.loginLockoutMinutes)) !== snapshot.loginLockoutMinutes ||
    !!form.loginCaptchaEnabled !== !!snapshot.loginCaptchaEnabled ||
    !mailEqual(form.mailSmtp, snapshot.mailSmtp) ||
    !brandingEqual(form.branding, snapshot.branding)
}

function applyMail(src: MailSmtpConfig): MailSmtpConfig {
  return {
    host: src.host || '',
    port: Number(src.port) || 587,
    secure: !!src.secure,
    email: src.email || '',
    // 管理端回传明文，便于管理员点小眼睛核对
    password: String(src.password || ''),
    fromName: src.fromName || '',
    hasPassword: !!src.hasPassword,
  }
}

function applyBranding(src: BrandingConfig | null | undefined): BrandingConfig {
  const base = src || defaultBranding()
  return {
    logoKey: String(base.logoKey || ''),
    logoUrl: String(base.logoUrl || DEFAULT_LOGO) || DEFAULT_LOGO,
    themeColor: String(base.themeColor || DEFAULT_BRANDING.themeColor),
    title: String(base.title || DEFAULT_BRANDING.title),
    subtitle: String(base.subtitle || DEFAULT_BRANDING.subtitle),
  }
}

function applySnapshot() {
  snapshot.rentInvoiceLeadDays = Math.trunc(Number(form.rentInvoiceLeadDays)) || 7
  snapshot.loginMaxFailedAttempts = Math.trunc(Number(form.loginMaxFailedAttempts)) || 5
  snapshot.loginLockoutMinutes = Math.trunc(Number(form.loginLockoutMinutes)) || 15
  snapshot.loginCaptchaEnabled = !!form.loginCaptchaEnabled
  snapshot.mailSmtp = { ...form.mailSmtp }
  snapshot.branding = { ...form.branding }
  dirty.value = false
}

function selectSection(id: SettingsSectionId) {
  activeSection.value = id
}

function apiErrorMessage(e: unknown, fallback: string) {
  const err = e as { response?: { data?: { message?: string | string[] } }; message?: string }
  const msg = err?.response?.data?.message
  if (Array.isArray(msg) && msg[0]) return String(msg[0])
  if (typeof msg === 'string' && msg.trim()) return msg
  if (err?.message?.trim()) return err.message
  return fallback
}

async function load() {
  loading.value = true
  try {
    const { data } = await fetchSystemSettings()
    form.rentInvoiceLeadDays = data.rentInvoiceLeadDays
    form.loginMaxFailedAttempts = data.loginMaxFailedAttempts ?? 5
    form.loginLockoutMinutes = data.loginLockoutMinutes ?? 15
    form.loginCaptchaEnabled = !!data.loginCaptchaEnabled
    form.mailSmtp = applyMail(data.mailSmtp || defaultMail())
    form.branding = applyBranding(data.branding)
    meta.updatedAt = data.updatedAt
    meta.updatedBy = data.updatedBy
    brandingStore.patchFromSettings(form.branding)
    applySnapshot()
  } catch (e: unknown) {
    await ElMessageBox.alert(apiErrorMessage(e, t('systemSettings.loadFailed')), t('common.tip'), {
      type: 'error',
    })
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.rentInvoiceLeadDays = snapshot.rentInvoiceLeadDays
  form.loginMaxFailedAttempts = snapshot.loginMaxFailedAttempts
  form.loginLockoutMinutes = snapshot.loginLockoutMinutes
  form.loginCaptchaEnabled = snapshot.loginCaptchaEnabled
  form.mailSmtp = { ...snapshot.mailSmtp }
  form.branding = { ...snapshot.branding }
  dirty.value = false
}

function openLogoPicker() {
  if (!perms.update || uploadingLogo.value) return
  logoInputRef.value?.click()
}

async function onLogoFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !perms.update) return
  if (!file.type.startsWith('image/')) {
    await ElMessageBox.alert(t('systemSettings.logoInvalidType'), t('common.tip'), {
      type: 'warning',
    })
    return
  }
  if (file.size > 2 * 1024 * 1024) {
    await ElMessageBox.alert(t('systemSettings.logoTooLarge'), t('common.tip'), {
      type: 'warning',
    })
    return
  }
  uploadingLogo.value = true
  try {
    const { data } = await uploadAttachmentApi(file)
    form.branding.logoKey = data.storageKey
    form.branding.logoUrl = data.publicUrl || DEFAULT_LOGO
    markDirty()
  } catch (e: unknown) {
    await ElMessageBox.alert(apiErrorMessage(e, t('systemSettings.logoUploadFailed')), t('common.tip'), {
      type: 'error',
    })
  } finally {
    uploadingLogo.value = false
  }
}

function onThemeColorPick(value: string | null) {
  form.branding.themeColor = value || DEFAULT_BRANDING.themeColor
  markDirty()
}

async function save() {
  if (!perms.update) return
  const days = Math.trunc(Number(form.rentInvoiceLeadDays))
  if (!Number.isFinite(days) || days < 1 || days > 90) {
    await ElMessageBox.alert(t('systemSettings.leadDaysInvalid'), t('common.tip'), {
      type: 'warning',
    })
    return
  }
  const maxFailed = Math.trunc(Number(form.loginMaxFailedAttempts))
  if (!Number.isFinite(maxFailed) || maxFailed < 1 || maxFailed > 30) {
    await ElMessageBox.alert(t('systemSettings.loginMaxFailedInvalid'), t('common.tip'), {
      type: 'warning',
    })
    return
  }
  const lockMinutes = Math.trunc(Number(form.loginLockoutMinutes))
  if (!Number.isFinite(lockMinutes) || lockMinutes < 1 || lockMinutes > 1440) {
    await ElMessageBox.alert(t('systemSettings.loginLockoutMinutesInvalid'), t('common.tip'), {
      type: 'warning',
    })
    return
  }
  const host = form.mailSmtp.host.trim()
  const email = form.mailSmtp.email.trim()
  if (!host || !email) {
    await ElMessageBox.alert(t('systemSettings.mailRequired'), t('common.tip'), { type: 'warning' })
    return
  }
  const themeColor = String(form.branding.themeColor || '').trim()
  const title = String(form.branding.title || '').trim()
  const subtitle = String(form.branding.subtitle || '').trim()
  if (!isHexColor(themeColor)) {
    await ElMessageBox.alert(t('systemSettings.themeColorInvalid'), t('common.tip'), {
      type: 'warning',
    })
    return
  }
  if (!title || !subtitle) {
    await ElMessageBox.alert(t('systemSettings.brandNameRequired'), t('common.tip'), {
      type: 'warning',
    })
    return
  }
  saving.value = true
  try {
    const pwd = form.mailSmtp.password
    const { data } = await updateSystemSettingsApi({
      rentInvoiceLeadDays: days,
      loginMaxFailedAttempts: maxFailed,
      loginLockoutMinutes: lockMinutes,
      loginCaptchaEnabled: !!form.loginCaptchaEnabled,
      mailSmtp: {
        host,
        port: Math.trunc(Number(form.mailSmtp.port)) || 587,
        secure: !!form.mailSmtp.secure,
        email,
        // 空 / 掩码 → 不改库内密码；仅提交用户新输入的明文
        password: !pwd.trim() || pwd === PASSWORD_MASK ? undefined : pwd,
        fromName: form.mailSmtp.fromName.trim(),
      },
      branding: {
        logoKey: form.branding.logoKey || '',
        themeColor: themeColor.toLowerCase(),
        title,
        subtitle,
      },
    })
    form.rentInvoiceLeadDays = data.rentInvoiceLeadDays
    form.loginMaxFailedAttempts = data.loginMaxFailedAttempts ?? maxFailed
    form.loginLockoutMinutes = data.loginLockoutMinutes ?? lockMinutes
    form.loginCaptchaEnabled = !!data.loginCaptchaEnabled
    form.mailSmtp = applyMail(data.mailSmtp || defaultMail())
    form.branding = applyBranding(data.branding)
    meta.updatedAt = data.updatedAt
    meta.updatedBy = data.updatedBy
    brandingStore.patchFromSettings(form.branding)
    applySnapshot()
    await ElMessageBox.alert(t('systemSettings.saved'), t('common.tip'), { type: 'success' })
  } catch (e: unknown) {
    await ElMessageBox.alert(apiErrorMessage(e, t('systemSettings.saveFailed')), t('common.tip'), {
      type: 'error',
    })
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
        @click="selectSection(sec.id)"
      >
        <span class="system-settings__nav-icon" aria-hidden="true">
          <el-icon :size="19"><component :is="sec.icon" /></el-icon>
        </span>
        <span class="system-settings__nav-text">
          <span class="system-settings__nav-label">{{ sec.title }}</span>
          <span class="system-settings__nav-desc">{{ sec.desc }}</span>
        </span>
      </button>
    </aside>

    <div class="system-settings__main">
      <div
        class="system-settings__canvas"
        :class="{ 'system-settings__canvas--fill': activeSection === 'whatsapp' }"
      >
        <el-form label-position="top" class="system-settings__form" @submit.prevent>
          <section v-if="activeSection === 'branding'" class="settings-card">
            <header class="settings-card__head">
              <div class="settings-card__icon" aria-hidden="true">
                <el-icon :size="19"><Brush /></el-icon>
              </div>
              <div class="settings-card__head-text">
                <h3 class="settings-card__title">
                  <span>{{ t('systemSettings.sections.branding') }}</span>
                  <el-tooltip
                    :content="t('systemSettings.sections.brandingDesc')"
                    placement="top"
                    :fallback-placements="['top', 'left', 'right']"
                  >
                    <el-icon class="settings-tip" :size="15"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </h3>
              </div>
            </header>

            <div class="settings-card__body">
              <div class="field-grid">
                <div class="field-block field-block--logo">
                  <label class="field-block__label">
                    <span>{{ t('systemSettings.fields.brandLogo') }}</span>
                    <el-tooltip
                      :content="t('systemSettings.hints.brandLogo')"
                      placement="top"
                      :fallback-placements="['top', 'left', 'right']"
                    >
                      <el-icon class="settings-tip" :size="16"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </label>
                  <div class="logo-row">
                    <button
                      type="button"
                      class="logo-preview"
                      :class="{ 'is-frameless': logoPreviewFrameless }"
                      :title="t('common.preview')"
                      :aria-label="t('common.preview')"
                      @click="openLogoPreview"
                    >
                      <img :src="logoPreviewUrl" alt="" />
                    </button>
                    <div class="logo-actions">
                      <input
                        ref="logoInputRef"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                        class="logo-file-input"
                        @change="onLogoFileChange"
                      />
                      <el-button
                        v-if="perms.update"
                        v-admin-glow="perms.codes.update"
                        type="primary"
                        plain
                        :loading="uploadingLogo"
                        @click="openLogoPicker"
                      >
                        <el-icon class="el-icon--left"><Plus /></el-icon>
                        {{ t('systemSettings.uploadLogo') }}
                      </el-button>
                      <p class="logo-hint">{{ t('systemSettings.logoHint') }}</p>
                    </div>
                  </div>
                </div>

                <div class="field-block">
                  <label class="field-block__label" for="ss-brand-theme">
                    <span>{{ t('systemSettings.fields.brandThemeColor') }}</span>
                    <el-tooltip
                      :content="t('systemSettings.hints.brandThemeColor')"
                      placement="top"
                      :fallback-placements="['top', 'left', 'right']"
                    >
                      <el-icon class="settings-tip" :size="16"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </label>
                  <div class="theme-color-row">
                    <el-color-picker
                      id="ss-brand-theme"
                      v-model="form.branding.themeColor"
                      :disabled="!perms.update"
                      color-format="hex"
                      @change="onThemeColorPick"
                    />
                    <el-input
                      v-model="form.branding.themeColor"
                      class="theme-color-input"
                      :disabled="!perms.update"
                      maxlength="7"
                      placeholder="#0f4a32"
                      @input="markDirty"
                    />
                  </div>
                </div>

                <div class="field-block">
                  <label class="field-block__label" for="ss-brand-title">
                    <span>{{ t('systemSettings.fields.brandTitle') }}</span>
                    <el-tooltip
                      :content="t('systemSettings.hints.brandTitle')"
                      placement="top"
                      :fallback-placements="['top', 'left', 'right']"
                    >
                      <el-icon class="settings-tip" :size="16"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </label>
                  <el-input
                    id="ss-brand-title"
                    v-model="form.branding.title"
                    :disabled="!perms.update"
                    maxlength="80"
                    @input="markDirty"
                  />
                </div>

                <div class="field-block">
                  <label class="field-block__label" for="ss-brand-subtitle">
                    <span>{{ t('systemSettings.fields.brandSubtitle') }}</span>
                    <el-tooltip
                      :content="t('systemSettings.hints.brandSubtitle')"
                      placement="top"
                      :fallback-placements="['top', 'left', 'right']"
                    >
                      <el-icon class="settings-tip" :size="16"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </label>
                  <el-input
                    id="ss-brand-subtitle"
                    v-model="form.branding.subtitle"
                    :disabled="!perms.update"
                    maxlength="120"
                    @input="markDirty"
                  />
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="activeSection === 'billing'" class="settings-card">
            <header class="settings-card__head">
              <div class="settings-card__icon" aria-hidden="true">
                <el-icon :size="19"><Ticket /></el-icon>
              </div>
              <div class="settings-card__head-text">
                <h3 class="settings-card__title">
                  <span>{{ t('systemSettings.sections.billing') }}</span>
                  <el-tooltip
                    :content="t('systemSettings.sections.billingDesc')"
                    placement="top"
                    :fallback-placements="['top', 'left', 'right']"
                  >
                    <el-icon class="settings-tip" :size="15"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </h3>
              </div>
            </header>

            <div class="settings-card__body">
              <div class="field-block field-block--inline">
                <div class="field-block__copy">
                  <label class="field-block__label" for="ss-lead-days">
                    <span>{{ t('systemSettings.fields.rentInvoiceLeadDays') }}</span>
                    <el-tooltip
                      :content="t('systemSettings.hints.rentInvoiceLeadDays')"
                      placement="top"
                      :fallback-placements="['top', 'left', 'right']"
                    >
                      <el-icon class="settings-tip" :size="16"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </label>
                </div>
                <div class="field-block__control field-block__control--compact">
                  <el-input-number
                    id="ss-lead-days"
                    v-model="form.rentInvoiceLeadDays"
                    class="settings-num"
                    size="large"
                    :min="1"
                    :max="90"
                    :step="1"
                    :disabled="!perms.update"
                    controls-position="right"
                    @change="markDirty"
                  />
                  <span class="field-block__unit">{{ t('systemSettings.unit.days') }}</span>
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="activeSection === 'login'" class="settings-card">
            <header class="settings-card__head">
              <div class="settings-card__icon" aria-hidden="true">
                <el-icon :size="19"><Lock /></el-icon>
              </div>
              <div class="settings-card__head-text">
                <h3 class="settings-card__title">
                  <span>{{ t('systemSettings.sections.login') }}</span>
                  <el-tooltip
                    :content="t('systemSettings.sections.loginDesc')"
                    placement="top"
                    :fallback-placements="['top', 'left', 'right']"
                  >
                    <el-icon class="settings-tip" :size="15"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </h3>
              </div>
            </header>

            <div class="settings-card__body">
              <div class="field-block field-block--inline">
                <div class="field-block__copy">
                  <label class="field-block__label" for="ss-login-max-failed">
                    <span>{{ t('systemSettings.fields.loginMaxFailedAttempts') }}</span>
                    <el-tooltip
                      :content="t('systemSettings.hints.loginMaxFailedAttempts')"
                      placement="top"
                      :fallback-placements="['top', 'left', 'right']"
                    >
                      <el-icon class="settings-tip" :size="16"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </label>
                </div>
                <div class="field-block__control field-block__control--compact">
                  <el-input-number
                    id="ss-login-max-failed"
                    v-model="form.loginMaxFailedAttempts"
                    class="settings-num"
                    size="large"
                    :min="1"
                    :max="30"
                    :step="1"
                    :disabled="!perms.update"
                    controls-position="right"
                    @change="markDirty"
                  />
                  <span class="field-block__unit">{{ t('systemSettings.unit.times') }}</span>
                </div>
              </div>

              <div class="field-block field-block--inline">
                <div class="field-block__copy">
                  <label class="field-block__label" for="ss-login-lockout-minutes">
                    <span>{{ t('systemSettings.fields.loginLockoutMinutes') }}</span>
                    <el-tooltip
                      :content="t('systemSettings.hints.loginLockoutMinutes')"
                      placement="top"
                      :fallback-placements="['top', 'left', 'right']"
                    >
                      <el-icon class="settings-tip" :size="16"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </label>
                </div>
                <div class="field-block__control field-block__control--compact">
                  <el-input-number
                    id="ss-login-lockout-minutes"
                    v-model="form.loginLockoutMinutes"
                    class="settings-num"
                    size="large"
                    :min="1"
                    :max="1440"
                    :step="1"
                    :disabled="!perms.update"
                    controls-position="right"
                    @change="markDirty"
                  />
                  <span class="field-block__unit">{{ t('systemSettings.unit.minutes') }}</span>
                </div>
              </div>

              <div class="field-block field-block--inline">
                <div class="field-block__copy">
                  <label class="field-block__label" for="ss-login-captcha">
                    <span>{{ t('systemSettings.fields.loginCaptchaEnabled') }}</span>
                    <el-tooltip
                      :content="t('systemSettings.hints.loginCaptchaEnabled')"
                      placement="top"
                      :fallback-placements="['top', 'left', 'right']"
                    >
                      <el-icon class="settings-tip" :size="16"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </label>
                </div>
                <div class="field-block__control field-block__control--compact">
                  <el-switch
                    id="ss-login-captcha"
                    v-model="form.loginCaptchaEnabled"
                    :disabled="!perms.update"
                    @change="markDirty"
                  />
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="activeSection === 'mail'" class="settings-card">
            <header class="settings-card__head">
              <div class="settings-card__icon" aria-hidden="true">
                <el-icon :size="19"><Message /></el-icon>
              </div>
              <div class="settings-card__head-text">
                <h3 class="settings-card__title">
                  <span>{{ t('systemSettings.sections.mail') }}</span>
                  <el-tooltip
                    :content="t('systemSettings.sections.mailDesc')"
                    placement="top"
                    :fallback-placements="['top', 'left', 'right']"
                  >
                    <el-icon class="settings-tip" :size="15"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </h3>
              </div>
            </header>

            <div class="settings-card__body">
              <div class="field-grid">
                <div class="field-block">
                  <label class="field-block__label" for="ss-mail-host">
                    <span>{{ t('systemSettings.fields.mailHost') }}</span>
                    <el-tooltip
                      :content="t('systemSettings.hints.mailHost')"
                      placement="top"
                      :fallback-placements="['top', 'left', 'right']"
                    >
                      <el-icon class="settings-tip" :size="16"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </label>
                  <el-input
                    id="ss-mail-host"
                    v-model="form.mailSmtp.host"
                    :disabled="!perms.update"
                    maxlength="200"
                    @input="markDirty"
                  />
                </div>

                <div class="field-block">
                  <label class="field-block__label" for="ss-mail-port">
                    <span>{{ t('systemSettings.fields.mailPort') }}</span>
                    <el-tooltip
                      :content="t('systemSettings.hints.mailPort')"
                      placement="top"
                      :fallback-placements="['top', 'left', 'right']"
                    >
                      <el-icon class="settings-tip" :size="16"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </label>
                  <div class="field-block__control field-block__control--port">
                    <el-input-number
                      id="ss-mail-port"
                      v-model="form.mailSmtp.port"
                      class="settings-num settings-num--port"
                      size="large"
                      :min="1"
                      :max="65535"
                      :step="1"
                      :disabled="!perms.update"
                      controls-position="right"
                      @change="markDirty"
                    />
                    <div class="ssl-toggle">
                      <el-switch
                        v-model="form.mailSmtp.secure"
                        :disabled="!perms.update"
                        @change="markDirty"
                      />
                      <span class="ssl-toggle__text">{{ t('systemSettings.fields.mailSecure') }}</span>
                    </div>
                  </div>
                </div>

                <div class="field-block">
                  <label class="field-block__label" for="ss-mail-from-name">
                    <span>{{ t('systemSettings.fields.mailFromName') }}</span>
                    <el-tooltip
                      :content="t('systemSettings.hints.mailFromName')"
                      placement="top"
                      :fallback-placements="['top', 'left', 'right']"
                    >
                      <el-icon class="settings-tip" :size="16"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </label>
                  <el-input
                    id="ss-mail-from-name"
                    v-model="form.mailSmtp.fromName"
                    :disabled="!perms.update"
                    maxlength="120"
                    @input="markDirty"
                  />
                </div>

                <div class="field-block">
                  <label class="field-block__label" for="ss-mail-email">
                    <span>{{ t('systemSettings.fields.mailEmail') }}</span>
                    <el-tooltip
                      :content="t('systemSettings.hints.mailEmail')"
                      placement="top"
                      :fallback-placements="['top', 'left', 'right']"
                    >
                      <el-icon class="settings-tip" :size="16"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </label>
                  <el-input
                    id="ss-mail-email"
                    v-model="form.mailSmtp.email"
                    :disabled="!perms.update"
                    maxlength="200"
                    @input="markDirty"
                  />
                </div>

                <div class="field-block">
                  <label class="field-block__label" for="ss-mail-password">
                    <span>{{ t('systemSettings.fields.mailPassword') }}</span>
                    <el-tooltip
                      :content="t('systemSettings.hints.mailPassword')"
                      placement="top"
                      :fallback-placements="['top', 'left', 'right']"
                    >
                      <el-icon class="settings-tip" :size="16"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </label>
                  <el-input
                    id="ss-mail-password"
                    v-model="form.mailSmtp.password"
                    type="password"
                    show-password
                    :disabled="!perms.update"
                    maxlength="200"
                    :placeholder="
                      form.mailSmtp.hasPassword
                        ? t('systemSettings.mailPasswordKeep')
                        : t('systemSettings.mailPasswordPlaceholder')
                    "
                    @input="markDirty"
                  />
                </div>
              </div>
            </div>
          </section>

          <section v-else-if="activeSection === 'whatsapp'" class="settings-card">
            <header class="settings-card__head">
              <div class="settings-card__icon" aria-hidden="true">
                <el-icon :size="19"><ChatDotRound /></el-icon>
              </div>
              <div class="settings-card__head-text">
                <h3 class="settings-card__title">
                  <span>{{ t('systemSettings.sections.whatsapp') }}</span>
                  <el-tooltip
                    :content="t('systemSettings.sections.whatsappDesc')"
                    placement="top"
                    :fallback-placements="['top', 'left', 'right']"
                  >
                    <el-icon class="settings-tip" :size="15"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </h3>
              </div>
            </header>
            <div class="settings-card__body settings-card__body--fill">
              <WhatsappSettingsPanel />
            </div>
          </section>
        </el-form>
      </div>

      <footer v-if="activeSection !== 'whatsapp'" class="system-settings__footer">
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
        <div v-if="perms.update" class="system-settings__actions">
          <el-button :disabled="!dirty || saving" @click="resetForm">
            <el-icon class="el-icon--left"><RefreshRight /></el-icon>
            {{ t('systemSettings.reset') }}
          </el-button>
          <el-button
            v-admin-glow="perms.codes.update"
            type="primary"
            class="lb-btn-primary"
            :loading="saving"
            :disabled="!dirty"
            @click="save"
          >
            {{ t('common.save') }}
          </el-button>
        </div>
      </footer>
    </div>

    <Teleport to="body">
      <AttachmentImageViewer
        v-if="logoPreviewVisible && logoPreviewUrl"
        :url-list="[logoPreviewUrl]"
        @close="logoPreviewVisible = false"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.system-settings {
  --ss-body: 0.92rem;
  --ss-label: 0.95rem;
  --ss-muted: 0.88rem;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 18px;
  align-items: stretch;
  width: 100%;
  height: 100%;
  min-height: 0;
  font-size: var(--ss-body);
}

/* 小屏（约 14 寸笔记本）：设置分类侧栏略收窄，给右侧表格更多横向空间 */
@media (max-width: 1439.98px) {
  .system-settings {
    grid-template-columns: 168px minmax(0, 1fr);
    gap: 12px;
  }

  .system-settings__nav {
    padding: 8px;
  }

  .system-settings__nav-item {
    gap: 8px;
    padding: 8px;
  }

  .system-settings__nav-icon {
    width: 30px;
    height: 30px;
  }

  .system-settings__nav-desc {
    display: none;
  }
}

.system-settings__nav {
  align-self: stretch;
  height: 100%;
  min-height: 0;
  overflow: auto;
  padding: 10px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #e6e6e6);
  background:
    linear-gradient(165deg, color-mix(in srgb, var(--lb-brand, #0f4a32) 3%, #f7f7f7) 0%, #ffffff 55%),
    #fff;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--lb-brand, #0f4a32) 6%, transparent);
}

.system-settings__nav-title {
  margin: 2px 8px 12px;
  font-size: var(--ss-label);
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--lb-muted, #666);
}

.system-settings__nav-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  margin: 0 0 4px;
  padding: 10px 10px;
  border: 0;
  border-radius: 11px;
  background: transparent;
  color: var(--lb-ink, #1a1a1a);
  text-align: left;
  cursor: pointer;
  transition:
    background 0.16s ease,
    box-shadow 0.16s ease,
    color 0.16s ease;
}

.system-settings__nav-item:hover {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 6%, transparent);
}

.system-settings__nav-item.is-active {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #fff);
  box-shadow: inset 3px 0 0 var(--lb-brand, #0f4a32);
  color: var(--lb-brand, #0f4a32);
}

.system-settings__nav-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: 9px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #fff);
  color: var(--lb-brand, #0f4a32);
}

.system-settings__nav-item.is-active .system-settings__nav-icon {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 16%, #fff);
  color: var(--lb-brand, #0f4a32);
}

.system-settings__nav-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding-top: 2px;
}

.system-settings__nav-label {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
}

.system-settings__nav-desc {
  font-size: 13px;
  line-height: 1.4;
  color: #888;
}

.system-settings__nav-item.is-active .system-settings__nav-desc {
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 45%, #888);
}

.system-settings__main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.system-settings__canvas {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
  overflow: auto;
  padding-right: 2px;
}

.system-settings__canvas--fill {
  overflow: hidden;
}

.system-settings__canvas--fill .system-settings__form,
.system-settings__canvas--fill .settings-card {
  min-height: 0;
  height: 100%;
}

.system-settings__form {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  gap: 14px;
  min-height: 100%;
}

.settings-card {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #e6e6e6);
  background: #fff;
  box-shadow:
    0 1px 0 rgb(255 255 255 / 80%) inset,
    0 10px 28px color-mix(in srgb, var(--lb-brand, #0f4a32) 6%, transparent);
  overflow: hidden;
  scroll-margin-top: 14px;
}

.settings-card__head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #ebebeb);
  /* 勿再叠旧橙色 radial（accent #d9822b）；仅中性浅灰 + 主题淡染 */
  background: linear-gradient(
    180deg,
    #fafafa 0%,
    color-mix(in srgb, var(--lb-brand, #0f4a32) 4%, #f5f5f5) 100%
  );
}

.settings-card__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  flex-shrink: 0;
  color: var(--lb-brand, #0f4a32);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, #fff);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, transparent);
}

.settings-card__icon--accent {
  color: var(--lb-accent, #d9822b);
  background: color-mix(in srgb, var(--lb-accent, #d9822b) 14%, #fff);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--lb-accent, #d9822b) 18%, transparent);
}

.settings-card__head-text {
  min-width: 0;
  display: flex;
  align-items: center;
}

.settings-card__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 1.08rem;
  font-weight: 750;
  line-height: 1.2;
  color: var(--lb-ink, #1a1a1a);
  letter-spacing: 0.01em;
}

.settings-tip {
  color: #8a8a8a;
  cursor: help;
  flex-shrink: 0;
  vertical-align: middle;
}

.settings-tip:hover {
  color: var(--lb-brand, #0f4a32);
}

.settings-card__body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 16px 18px 18px;
}

.settings-card__body--fill {
  display: flex;
  flex-direction: column;
  /* WhatsApp 等满高面板：收紧标题栏与内容（Tab）间距；用完整 padding 避免被媒体查询简写冲掉 */
  padding: 8px 18px 18px;
}

.settings-card__body--fill > * {
  flex: 1;
  min-height: 0;
}

/* 小屏（笔记本宽度）：一行两列；大屏（≥1440）：单列通栏 */
.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px 14px;
}

@media (min-width: 1440px) {
  .field-grid {
    grid-template-columns: 1fr;
  }
}

.field-block {
  min-width: 0;
}

.field-block--logo {
  grid-column: 1 / -1;
}

.logo-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.logo-preview {
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  margin: 0;
  padding: 0;
  border-radius: 14px;
  overflow: hidden;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #f5f5f5);
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, #e6e6e6);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, transparent);
  cursor: zoom-in;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.logo-preview:hover {
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 28%, #e0e0e0);
  box-shadow: 0 10px 24px color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, transparent);
}

.logo-preview:focus-visible {
  outline: 2px solid var(--lb-brand, #0f4a32);
  outline-offset: 2px;
}

.logo-preview.is-frameless {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.logo-preview.is-frameless:hover {
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 22%, #e0e0e0);
  box-shadow: none;
}

.logo-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

.logo-preview.is-frameless img {
  object-fit: contain;
  filter: drop-shadow(0 4px 10px color-mix(in srgb, var(--lb-brand, #0f4a32) 16%, transparent));
}

.logo-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.logo-file-input {
  display: none;
}

.logo-hint {
  margin: 4px 0 0;
  width: 100%;
  font-size: var(--ss-muted);
  color: var(--lb-muted, #666);
  line-height: 1.45;
}

.theme-color-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.theme-color-input {
  width: 140px;
}

.field-block--inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 3%, #f5f5f5);
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #e6e6e6);
}

.settings-card__body > .field-block--inline + .field-block--inline {
  margin-top: 12px;
}

.field-block__copy {
  min-width: 0;
  flex: 1;
}

.field-block__label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 8px;
  font-size: var(--ss-label);
  font-weight: 700;
  color: var(--lb-ink, #1a1a1a);
  line-height: 1.35;
}

.field-block--inline .field-block__label {
  margin-bottom: 0;
}

.field-block__control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.field-block__control--compact {
  flex-shrink: 0;
}

.field-block__control--port {
  flex-wrap: wrap;
  align-items: center;
}

.field-block__unit {
  font-size: var(--ss-body);
  font-weight: 650;
  color: var(--lb-muted, #666);
  white-space: nowrap;
  line-height: 40px;
}

.ssl-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 4%, #f5f5f5);
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, #e6e6e6);
  box-sizing: border-box;
}

.ssl-toggle__text {
  font-size: var(--ss-body);
  font-weight: 650;
  color: var(--lb-muted, #666);
}

.field-block > :deep(.el-input) {
  width: 100%;
  font-size: var(--ss-body);
}

.field-block :deep(.el-input__inner) {
  font-size: var(--ss-body);
}

.field-block :deep(.el-input__wrapper) {
  border-radius: 10px;
  min-height: 40px;
  height: 40px;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, #d8d8d8) inset;
  background: #fff;
}

.field-block :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 28%, #b8b8b8) inset;
}

.field-block :deep(.el-input__wrapper.is-focus) {
  box-shadow:
    0 0 0 1px var(--lb-brand, #0f4a32) inset,
    0 0 0 3px color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, transparent);
}

/* 数字框与普通输入框同高 40px */
.field-block :deep(.settings-num.el-input-number) {
  --el-input-height: 40px;
  --el-component-size: 40px;
  --el-input-number-controls-height: 19px;
  width: 148px;
  height: 40px;
  line-height: 40px;
}

.field-block :deep(.settings-num .el-input) {
  height: 40px;
  line-height: 40px;
}

.field-block :deep(.settings-num .el-input__wrapper) {
  height: 40px !important;
  min-height: 40px !important;
  padding-left: 12px;
  padding-right: 34px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, #d8d8d8) inset !important;
}

.field-block :deep(.settings-num .el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 28%, #b8b8b8) inset !important;
}

.field-block :deep(.settings-num .el-input__wrapper.is-focus) {
  box-shadow:
    0 0 0 1px var(--lb-brand, #0f4a32) inset,
    0 0 0 3px color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, transparent) !important;
}

.field-block :deep(.settings-num .el-input__inner) {
  height: 38px;
  line-height: 38px;
  text-align: left;
  font-size: var(--ss-body);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: var(--lb-ink, #1a1a1a);
}

.field-block :deep(.settings-num .el-input-number__increase),
.field-block :deep(.settings-num .el-input-number__decrease) {
  width: 28px;
  height: var(--el-input-number-controls-height);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 4%, #f5f5f5);
  border-left: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, #e6e6e6);
  color: var(--lb-muted, #666);
}

.field-block :deep(.settings-num .el-input-number__increase) {
  border-top-right-radius: 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, #e6e6e6);
  top: 1px;
}

.field-block :deep(.settings-num .el-input-number__decrease) {
  border-bottom-right-radius: 10px;
  bottom: 1px;
  top: auto;
}

.field-block :deep(.settings-num .el-input-number__increase:hover),
.field-block :deep(.settings-num .el-input-number__decrease:hover) {
  color: var(--lb-brand, #0f4a32);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #fff);
}

.field-block :deep(.settings-num.is-controls-right .el-input__wrapper) {
  padding-right: 34px;
}

.system-settings__footer {
  flex: 0 0 auto;
  z-index: 2;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #e6e6e6);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 3%, #f7f7f7);
  box-shadow: 0 -6px 20px color-mix(in srgb, var(--lb-brand, #0f4a32) 6%, transparent);
}

.system-settings__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  font-size: var(--ss-muted);
  font-weight: 500;
  color: var(--lb-muted, #666);
}

.system-settings__dirty {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 700;
  color: #8a5a12;
  background: #f8ecd6;
}

.system-settings__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.system-settings__actions :deep(.el-button) {
  font-size: var(--ss-body);
}

.system-settings__actions :deep(.lb-btn-primary) {
  --el-button-bg-color: var(--lb-accent);
  --el-button-border-color: var(--lb-accent);
  --el-button-hover-bg-color: var(--lb-accent-hover);
  --el-button-hover-border-color: var(--lb-accent-hover);
  --el-button-active-bg-color: var(--lb-accent-hover);
  --el-button-active-border-color: var(--lb-accent-hover);
  font-weight: 650;
  min-width: 96px;
}

.logo-actions :deep(.el-button) {
  font-size: var(--ss-body);
}

@media (max-width: 900px) {
  .system-settings {
    grid-template-columns: 1fr;
    height: 100%;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .system-settings__nav {
    align-self: stretch;
    height: auto;
    max-height: none;
    overflow: visible;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 10px;
  }

  .system-settings__nav-title {
    width: 100%;
    margin: 0 4px 4px;
  }

  .system-settings__nav-item {
    flex: 1 1 150px;
    margin: 0;
  }

  .system-settings__nav-desc {
    display: none;
  }

  .field-block--inline {
    flex-direction: column;
    align-items: stretch;
  }

  .field-block__control--compact {
    justify-content: flex-start;
  }
}

@media (max-height: 900px) {
  .system-settings {
    --ss-body: 0.88rem;
    --ss-label: 0.9rem;
    --ss-muted: 0.84rem;
  }

  .system-settings__nav-label {
    font-size: 14px;
  }

  .system-settings__nav-desc {
    font-size: 12.5px;
  }

  .settings-card__title {
    font-size: 1rem;
  }

  .settings-card__body {
    padding: 14px 16px 16px;
  }

  .settings-card__body--fill {
    padding: 6px 16px 16px;
  }

  .field-grid {
    gap: 14px 12px;
  }
}
</style>
