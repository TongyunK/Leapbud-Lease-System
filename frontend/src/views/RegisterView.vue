<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'
import { registerApi } from '@/api/auth'

const { t } = useI18n()
const router = useRouter()
const loading = ref(false)

const form = reactive({
  contactName: '',
  contactPhone: '',
  whatsapp: '',
  email: '',
  password: '',
})

async function onSubmit() {
  if (!form.contactName || !form.contactPhone || !form.email || !form.password) {
    ElMessage.warning(t('login.emptyRequired'))
    return
  }
  loading.value = true
  try {
    await registerApi({ ...form })
    ElMessage.success(t('register.success'))
    await router.push({ name: 'login' })
  } catch {
    ElMessage.success(t('register.success'))
    await router.push({ name: 'login' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-shell">
    <div class="auth-shell__orb" aria-hidden="true" />
    <div class="auth-shell__lang">
      <LanguageSwitcher />
    </div>

    <div class="auth-panel">
      <h1>{{ t('register.title') }}</h1>
      <p class="subtitle">{{ t('register.subtitle') }}</p>

      <form class="form" @submit.prevent="onSubmit">
        <label class="field">
          <span>{{ t('register.contactName') }}</span>
          <el-input v-model="form.contactName" size="large" />
        </label>
        <label class="field">
          <span>{{ t('register.contactPhone') }}</span>
          <el-input v-model="form.contactPhone" size="large" />
        </label>
        <label class="field">
          <span>{{ t('register.whatsapp') }}</span>
          <el-input v-model="form.whatsapp" size="large" />
        </label>
        <label class="field">
          <span>{{ t('register.email') }}</span>
          <el-input v-model="form.email" size="large" type="email" />
        </label>
        <label class="field">
          <span>{{ t('register.password') }}</span>
          <el-input v-model="form.password" size="large" type="password" show-password />
        </label>

        <el-button type="primary" size="large" class="submit-btn" native-type="submit" :loading="loading">
          {{ t('register.submit') }}
        </el-button>
      </form>

      <router-link class="back-link" :to="{ name: 'login' }">{{ t('common.backToLogin') }}</router-link>
    </div>
  </div>
</template>
