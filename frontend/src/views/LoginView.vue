<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { User, Lock, View, Hide, RefreshRight } from '@element-plus/icons-vue'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { useUserStore } from '@/stores/user'
import { useBrandingStore } from '@/stores/branding'
import { fetchLoginCaptchaApi, fetchLoginOptionsApi } from '@/api/auth'
import { isValidLoginAccount, sanitizeAccountInput } from '@/utils/validators'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const brandingStore = useBrandingStore()
const { logoUrl, title: brandTitle, loginHeroTitle, logoFrameless } = storeToRefs(brandingStore)

const account = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const formError = ref('')
const captchaEnabled = ref(false)
const captchaId = ref('')
const captchaCode = ref('')
const captchaImage = ref('')
const captchaLoading = ref(false)

const heroTitleRef = ref<HTMLElement | null>(null)
const brandPaneRef = ref<HTMLElement | null>(null)
let heroResizeObs: ResizeObserver | null = null
/** 标题过长时允许换行的字号下限（rem） */
const HERO_TITLE_MIN_REM = 1.05

function fitHeroTitle() {
  const el = heroTitleRef.value
  if (!el) return

  // 先回到 CSS 默认字号，测「首选」是否单行塞得下
  el.style.fontSize = ''
  el.style.whiteSpace = 'nowrap'

  const preferredPx = parseFloat(getComputedStyle(el).fontSize) || 24
  const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const minPx = HERO_TITLE_MIN_REM * rootPx

  let size = preferredPx
  el.style.fontSize = `${size}px`

  // 略超宽：逐步缩小，尽量保持单行
  let guard = 48
  while (el.scrollWidth > el.clientWidth + 0.5 && size > minPx && guard-- > 0) {
    size = Math.max(minPx, size - 0.5)
    el.style.fontSize = `${size}px`
  }

  // 缩到下限仍放不下 → 允许换行
  if (el.scrollWidth > el.clientWidth + 0.5) {
    el.style.whiteSpace = 'normal'
    el.style.fontSize = `${minPx}px`
  }
}

function scheduleFitHeroTitle() {
  void nextTick(() => fitHeroTitle())
}

async function loadCaptcha() {
  if (!captchaEnabled.value) return
  captchaLoading.value = true
  try {
    const { data } = await fetchLoginCaptchaApi()
    captchaId.value = data.captchaId
    captchaImage.value = data.imageDataUrl
    captchaCode.value = ''
  } catch {
    captchaId.value = ''
    captchaImage.value = ''
    formError.value = t('login.captchaLoadFailed')
  } finally {
    captchaLoading.value = false
  }
}

async function loadLoginOptions() {
  try {
    const { data } = await fetchLoginOptionsApi()
    captchaEnabled.value = !!data.captchaEnabled
    if (captchaEnabled.value) await loadCaptcha()
  } catch {
    captchaEnabled.value = false
  }
}

onMounted(() => {
  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'
  document.body.style.height = '100%'
  scheduleFitHeroTitle()
  if (typeof ResizeObserver !== 'undefined' && brandPaneRef.value) {
    heroResizeObs = new ResizeObserver(() => fitHeroTitle())
    heroResizeObs.observe(brandPaneRef.value)
  }
  window.addEventListener('resize', scheduleFitHeroTitle)
  void loadLoginOptions()
})

onUnmounted(() => {
  document.documentElement.style.overflow = ''
  document.body.style.overflow = ''
  document.body.style.height = ''
  heroResizeObs?.disconnect()
  heroResizeObs = null
  window.removeEventListener('resize', scheduleFitHeroTitle)
})

watch(loginHeroTitle, () => scheduleFitHeroTitle())

function onLogoClick() {
  window.location.reload()
}

function onAccountInput(value: string) {
  account.value = sanitizeAccountInput(value)
  formError.value = ''
}

function apiErrorMessage(e: unknown, fallback: string) {
  const err = e as { response?: { data?: { message?: string | string[]; code?: string } } }
  const data = err?.response?.data
  if (data?.code === 'CAPTCHA_INVALID') return t('login.captchaInvalid')
  const msg = data?.message
  if (Array.isArray(msg) && msg[0]) return String(msg[0])
  if (typeof msg === 'string' && msg.trim()) return msg
  return fallback
}

async function onSubmit() {
  formError.value = ''
  const accountVal = account.value.trim()
  const passwordVal = password.value

  if (!accountVal || !passwordVal) {
    formError.value = t('login.emptyRequired')
    return
  }

  if (!isValidLoginAccount(accountVal)) {
    formError.value = t('login.invalidAccount')
    return
  }

  if (captchaEnabled.value && !captchaCode.value.trim()) {
    formError.value = t('login.captchaRequired')
    return
  }

  loading.value = true
  try {
    await userStore.login({
      account: accountVal,
      password: passwordVal,
      captchaId: captchaEnabled.value ? captchaId.value : undefined,
      captchaCode: captchaEnabled.value ? captchaCode.value.trim() : undefined,
    })
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/home'
    await router.replace(redirect || '/home')
  } catch (e: unknown) {
    const data = (
      e as {
        response?: {
          data?: {
            code?: string
            remainingMinutes?: number
            failedAttempts?: number
            maxFailedAttempts?: number
            message?: string | string[]
          }
        }
      }
    )?.response?.data
    if (data?.code === 'LOGIN_LOCKED' && data.remainingMinutes != null) {
      formError.value = t('login.locked', { n: data.remainingMinutes })
    } else if (
      data?.code === 'LOGIN_FAILED' &&
      data.failedAttempts != null &&
      data.maxFailedAttempts != null
    ) {
      formError.value = t('login.loginFailedWithCount', {
        n: data.failedAttempts,
        max: data.maxFailedAttempts,
      })
    } else if (data?.code === 'CAPTCHA_INVALID') {
      formError.value = t('login.captchaInvalid')
    } else {
      formError.value = apiErrorMessage(e, t('login.loginFailed'))
    }
    if (captchaEnabled.value) void loadCaptcha()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login">
    <div class="login__lang">
      <LanguageSwitcher />
    </div>

    <div class="login__stage" :class="{ 'login__stage--captcha': captchaEnabled }">
      <aside ref="brandPaneRef" class="login__brand">
        <button
          type="button"
          class="brand-mark"
          :class="{ 'is-frameless': logoFrameless }"
          :aria-label="loginHeroTitle"
          @click="onLogoClick"
        >
          <img :src="logoUrl" :alt="brandTitle" />
        </button>
        <div class="brand-copy">
          <p class="brand-kicker">{{ brandTitle }}</p>
          <h1 ref="heroTitleRef">{{ loginHeroTitle }}</h1>
        </div>
      </aside>

      <section class="login__form-pane">
        <header class="form-head">
          <h2>{{ t('login.title') }}</h2>
        </header>

        <form class="form" @submit.prevent="onSubmit">
          <label class="field">
            <span>{{ t('login.account') }}</span>
            <el-input
              :model-value="account"
              maxlength="32"
              clearable
              :placeholder="t('login.accountPlaceholder')"
              @update:model-value="onAccountInput"
            >
              <template #prefix>
                <el-icon><User /></el-icon>
              </template>
            </el-input>
          </label>

          <label class="field">
            <span>{{ t('login.password') }}</span>
            <el-input
              v-model="password"
              maxlength="64"
              :type="showPassword ? 'text' : 'password'"
              :placeholder="t('login.passwordPlaceholder')"
              @input="formError = ''"
            >
              <template #prefix>
                <el-icon><Lock /></el-icon>
              </template>
              <template #suffix>
                <button
                  type="button"
                  class="eye-btn"
                  :aria-label="showPassword ? 'hide' : 'show'"
                  @click="showPassword = !showPassword"
                >
                  <el-icon>
                    <View v-if="showPassword" />
                    <Hide v-else />
                  </el-icon>
                </button>
              </template>
            </el-input>
          </label>

          <label v-if="captchaEnabled" class="field field--captcha">
            <span>{{ t('login.captcha') }}</span>
            <div class="captcha-row">
              <el-input
                v-model="captchaCode"
                maxlength="8"
                clearable
                :placeholder="t('login.captchaPlaceholder')"
                @input="formError = ''"
              />
              <button
                type="button"
                class="captcha-img-btn"
                :title="t('login.captchaRefresh')"
                :aria-label="t('login.captchaRefresh')"
                :disabled="captchaLoading"
                @click="loadCaptcha"
              >
                <img v-if="captchaImage" :src="captchaImage" alt="" class="captcha-img" />
                <el-icon v-else class="captcha-img-btn__fallback" :size="18"><RefreshRight /></el-icon>
              </button>
            </div>
          </label>

          <p v-if="formError" class="form-error" role="alert">{{ formError }}</p>

          <el-button
            type="primary"
            class="submit"
            native-type="submit"
            :loading="loading"
          >
            {{ loading ? t('login.loggingIn') : t('login.login') }}
          </el-button>
        </form>

        <footer class="form-foot">
          <router-link :to="{ name: 'forgot-password' }">{{ t('login.forgotPassword') }}</router-link>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.login {
  position: relative;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  display: grid;
  place-items: center;
  padding: clamp(20px, 4.5vh, 48px) clamp(20px, 5vw, 64px);
  background:
    radial-gradient(ellipse 70% 50% at 15% 20%, rgba(217, 130, 43, 0.16), transparent 55%),
    linear-gradient(
      145deg,
      var(--lb-login-page-from, color-mix(in srgb, var(--lb-brand, #0f4a32) 45%, #333)) 0%,
      var(--lb-login-page-mid, #3e5b45) 48%,
      var(--lb-login-page-to, #2a3f31) 100%
    );
}

.login__lang {
  position: absolute;
  top: max(12px, env(safe-area-inset-top));
  right: max(12px, env(safe-area-inset-right));
  z-index: 5;
}

/* 默认按笔记本视口：卡片约占屏宽 ~70%、屏高 ~62% */
.login__stage {
  width: min(720px, 72vw);
  height: min(460px, 64dvh);
  display: grid;
  grid-template-columns: 1fr 1.05fr;
  border-radius: 24px;
  overflow: hidden;
  background: #fffaf4;
  box-shadow:
    0 24px 64px rgba(0, 0, 0, 0.26),
    0 0 0 1px rgba(255, 255, 255, 0.08);
  animation: stage-in 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.login__stage--captcha {
  height: min(520px, 72dvh);
}

/* 大屏台式机再放大一点 */
@media (min-width: 1440px) {
  .login__stage {
    width: min(820px, 58vw);
    height: min(520px, 58dvh);
    border-radius: 26px;
  }

  .login__stage--captcha {
    height: min(580px, 64dvh);
  }
}

@media (min-width: 1800px) {
  .login__stage {
    width: min(900px, 50vw);
    height: min(540px, 52dvh);
    border-radius: 28px;
  }

  .login__stage--captcha {
    height: min(600px, 58dvh);
  }
}

.login__brand {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 18px;
  padding: clamp(24px, 4vh, 40px);
  color: #f4efe6;
  background:
    radial-gradient(ellipse 80% 60% at 20% 15%, rgba(217, 130, 43, 0.22), transparent 55%),
    linear-gradient(
      165deg,
      var(--lb-login-brand-from, #4a6b52) 0%,
      var(--lb-login-brand-mid, #3e5b45) 42%,
      var(--lb-login-brand-to, color-mix(in srgb, var(--lb-brand, #0f4a32) 45%, #333)) 100%
    );
  isolation: isolate;
  overflow: hidden;
}

.login__brand::before {
  content: '';
  position: absolute;
  inset: -20% auto auto 35%;
  width: 280px;
  height: 280px;
  border: 1px solid rgba(244, 239, 230, 0.12);
  border-radius: 32% 68% 45% 55% / 55% 38% 62% 45%;
  z-index: 0;
  pointer-events: none;
}

.login__brand::after {
  content: '';
  position: absolute;
  inset: auto -10% -25% auto;
  width: 240px;
  height: 240px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(217, 130, 43, 0.28), transparent 70%);
  z-index: 0;
  pointer-events: none;
}

.brand-mark {
  position: absolute;
  top: 24px;
  left: 24px;
  z-index: 1;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
}

.brand-mark img {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  object-fit: cover;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
}

/* 透明无边 PNG：去掉方框裁切与矩形阴影，改用贴合轮廓的 drop-shadow */
.brand-mark.is-frameless img {
  border-radius: 0;
  object-fit: contain;
  box-shadow: none;
  filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.28));
}

.brand-copy {
  position: relative;
  z-index: 1;
  min-width: 0;
  max-width: 100%;
}

.brand-kicker {
  margin: 0 0 6px;
  font-size: 0.78rem;
  letter-spacing: 0.28em;
  text-transform: lowercase;
  color: var(--lb-accent);
  font-weight: 600;
}

.brand-copy h1 {
  margin: 0;
  max-width: 100%;
  font-size: clamp(1.35rem, 2.6vw, 1.85rem);
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 0.01em;
  /* 默认由 JS 尽量压成单行；过长时再允许换行 */
  overflow-wrap: anywhere;
}

.login__form-pane {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: clamp(22px, 4vh, 40px) clamp(22px, 3.5vw, 42px);
  background: linear-gradient(180deg, #fffefb 0%, #f7f2ea 100%);
}

.form-head {
  margin-bottom: clamp(14px, 2.5vh, 24px);
}

.form-head h2 {
  margin: 0;
  font-size: 1.45rem;
  font-weight: 700;
  color: var(--lb-brand);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--lb-ink);
}

.captcha-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.captcha-img-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 132px;
  height: 42px;
  margin: 0;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 16%, #d8d8d8);
  border-radius: 12px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 4%, #fff);
  cursor: pointer;
  overflow: hidden;
  flex-shrink: 0;
  transition:
    border-color 0.15s ease,
    background 0.15s ease;
}

.captcha-img-btn:hover:not(:disabled) {
  border-color: var(--lb-brand, #0f4a32);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #fff);
}

.captcha-img-btn:disabled {
  cursor: wait;
  opacity: 0.75;
}

.captcha-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.captcha-img-btn__fallback {
  color: var(--lb-brand, #0f4a32);
}

.form :deep(.el-input__wrapper) {
  border-radius: 12px;
  min-height: 42px;
  background: #fff;
  box-shadow: 0 0 0 1px rgba(62, 91, 69, 0.14) inset;
  transition: box-shadow 0.2s ease;
}

.form :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(62, 91, 69, 0.28) inset;
}

.form :deep(.el-input__wrapper.is-focus) {
  box-shadow:
    0 0 0 1px var(--lb-brand) inset,
    0 0 0 3px rgba(62, 91, 69, 0.1);
}

.eye-btn {
  display: inline-flex;
  border: 0;
  background: transparent;
  color: var(--lb-muted);
  cursor: pointer;
  padding: 0;
}

.eye-btn:hover {
  color: var(--lb-accent);
}

.form-error {
  margin: 0;
  color: var(--lb-danger);
  font-size: 0.84rem;
}

.submit {
  width: 100%;
  height: 44px;
  margin-top: 4px;
  border-radius: 12px !important;
  font-weight: 650;
  letter-spacing: 0.04em;
  --el-button-bg-color: var(--lb-accent);
  --el-button-border-color: var(--lb-accent);
  --el-button-hover-bg-color: var(--lb-accent-hover);
  --el-button-hover-border-color: var(--lb-accent-hover);
  box-shadow: 0 12px 28px rgba(217, 130, 43, 0.28);
}

.form-foot {
  margin-top: 18px;
  display: flex;
  justify-content: flex-start;
  font-size: 0.88rem;
  font-weight: 500;
}

.form-foot a {
  color: var(--lb-brand-mid);
}

.form-foot a:hover {
  color: var(--lb-accent);
}

@keyframes stage-in {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (max-width: 860px) {
  .login__stage {
    grid-template-columns: 1fr;
    width: min(420px, 92vw);
    height: auto;
    max-height: calc(100dvh - 32px);
    overflow: auto;
  }

  .login__brand {
    min-height: 160px;
    justify-content: center;
    padding: 20px 22px 18px;
  }

  .brand-mark {
    position: static;
    margin-bottom: 4px;
  }

  .brand-mark img {
    width: 48px;
    height: 48px;
  }

  .brand-copy h1 {
    font-size: 1.25rem;
  }

  .login__form-pane {
    padding: 20px 22px 22px;
  }
}

@media (max-height: 700px) and (min-width: 861px) {
  .login__stage {
    width: min(680px, 74vw);
    height: min(420px, 78dvh);
  }

  .form {
    gap: 10px;
  }

  .form-head {
    margin-bottom: 12px;
  }

  .form :deep(.el-input__wrapper) {
    min-height: 38px;
  }

  .submit {
    height: 40px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login__stage {
    animation: none;
  }
}
</style>
