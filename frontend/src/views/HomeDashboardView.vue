<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useNavStore } from '@/stores/nav'
import { useUserStore } from '@/stores/user'
import type { MenuRecord } from '@/types/menu'
import { menuDisplayName } from '@/utils/menuLabel'
import { resolveMenuIcon } from '@/utils/menuIcons'

type DashItem = {
  routeName: string
  label: string
  icon: Component
}

type DashSection = {
  id: string
  title: string
  items: DashItem[]
}

const { t, te, locale } = useI18n()
const router = useRouter()
const navStore = useNavStore()
const userStore = useUserStore()

const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (!navStore.loaded && !navStore.loading) {
    void navStore.loadNav()
  }
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const clockLocale = computed(() => (String(locale.value).startsWith('zh') ? 'zh-HK' : 'en-HK'))

const dateLabel = computed(() =>
  new Intl.DateTimeFormat(clockLocale.value, {
    timeZone: 'Asia/Hong_Kong',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now.value),
)

const timeLabel = computed(() =>
  new Intl.DateTimeFormat(clockLocale.value, {
    timeZone: 'Asia/Hong_Kong',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now.value),
)

const welcomeName = computed(() => {
  const u = userStore.user
  return u?.displayName?.trim() || u?.account || ''
})

function labelOf(node: MenuRecord) {
  return menuDisplayName(node, locale.value, t, te)
}

/** 收集目录下所有可跳转的叶子菜单（保持侧栏顺序） */
function collectMenuItems(nodes: MenuRecord[] | undefined, out: DashItem[] = []): DashItem[] {
  if (!nodes?.length) return out
  for (const node of nodes) {
    if (node.type === 'directory') {
      collectMenuItems(node.children, out)
      continue
    }
    if (node.type === 'menu' && node.routeName?.trim() && node.active !== false) {
      out.push({
        routeName: node.routeName,
        label: labelOf(node),
        icon: resolveMenuIcon(node.icon),
      })
    }
  }
  return out
}

/** 与左侧菜单栏同结构：顶级目录 = 分组；顶级菜单单独成组 */
const sections = computed((): DashSection[] => {
  void locale.value
  const roots = navStore.tree || []
  const result: DashSection[] = []
  const loose: DashItem[] = []

  for (const node of roots) {
    if (node.active === false) continue

    if (node.type === 'directory') {
      const items = collectMenuItems(node.children)
      if (!items.length) continue
      result.push({
        id: node.id,
        title: labelOf(node),
        items,
      })
      continue
    }

    if (node.type === 'menu' && node.routeName?.trim()) {
      loose.push({
        routeName: node.routeName,
        label: labelOf(node),
        icon: resolveMenuIcon(node.icon),
      })
    }
  }

  if (loose.length) {
    result.push({
      id: '__root_menus',
      title: t('home.sections.shortcuts'),
      items: loose,
    })
  }

  return result
})

function go(routeName: string) {
  if (router.currentRoute.value.name === routeName) return
  void router.push({ name: routeName })
}
</script>

<template>
  <div class="home-dash">
    <section class="home-hero">
      <div class="home-hero__main">
        <p class="home-hero__eyebrow">Leapbud</p>
        <h1 class="home-hero__title">{{ t('home.title') }}</h1>
        <p class="home-hero__desc">
          {{
            welcomeName
              ? t('home.welcomeNamed', { name: welcomeName })
              : t('home.welcome')
          }}
        </p>
      </div>
      <div class="home-clock" aria-live="polite">
        <div class="home-clock__date">{{ dateLabel }}</div>
        <div class="home-clock__time">{{ timeLabel }}</div>
        <div class="home-clock__tz">Asia/Hong_Kong</div>
      </div>
    </section>

    <section v-for="section in sections" :key="section.id" class="home-section">
      <h2 class="home-section__title">{{ section.title }}</h2>
      <div class="home-grid">
        <button
          v-for="item in section.items"
          :key="item.routeName"
          type="button"
          class="home-card"
          @click="go(item.routeName)"
        >
          <span class="home-card__icon" aria-hidden="true">
            <el-icon :size="20"><component :is="item.icon" /></el-icon>
          </span>
          <span class="home-card__label">{{ item.label }}</span>
        </button>
      </div>
    </section>

    <p v-if="navStore.loaded && !sections.length" class="home-empty">{{ t('home.empty') }}</p>
    <p v-else-if="navStore.loading && !sections.length" class="home-empty">{{ t('common.loading') }}</p>
  </div>
</template>

<style scoped>
.home-dash {
  --home-card-min: 200px;
  --home-gap: 12px;
  --home-section-gap: 16px;
  box-sizing: border-box;
  width: 100%;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--home-section-gap);
  padding: 2px 2px 8px;
  background: transparent;
}

.home-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: clamp(12px, 2vw, 20px);
  padding: clamp(14px, 2vw, 22px) clamp(14px, 2.2vw, 24px);
  border-radius: 16px;
  background:
    radial-gradient(120% 140% at 100% 0%, rgba(15, 74, 50, 0.1) 0%, transparent 55%),
    linear-gradient(135deg, #ffffff 0%, #f3faf6 100%);
  border: 1px solid #dce5e0;
  box-shadow: 0 8px 24px rgba(15, 40, 30, 0.05);
}

.home-hero__main {
  min-width: 0;
  flex: 1;
}

.home-hero__eyebrow {
  margin: 0 0 4px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6e9784;
}

.home-hero__title {
  margin: 0 0 8px;
  font-size: clamp(1.25rem, 1.6vw + 0.7rem, 1.75rem);
  font-weight: 750;
  letter-spacing: -0.02em;
  color: #0f4a32;
  line-height: 1.2;
}

.home-hero__desc {
  margin: 0;
  max-width: 56rem;
  font-size: clamp(0.82rem, 0.2vw + 0.78rem, 0.9rem);
  line-height: 1.5;
  color: #6a7a70;
}

.home-clock {
  flex-shrink: 0;
  min-width: min(200px, 100%);
  padding: 12px 16px;
  border-radius: 14px;
  border: 1px solid #c9ddd2;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
}

.home-clock__date {
  font-size: 0.78rem;
  font-weight: 650;
  color: #3d4f45;
  line-height: 1.35;
}

.home-clock__time {
  margin-top: 4px;
  font-size: clamp(1.35rem, 1.2vw + 1rem, 1.7rem);
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.03em;
  color: #0f4a32;
  line-height: 1.1;
}

.home-clock__tz {
  margin-top: 6px;
  font-size: 0.72rem;
  color: #8a9690;
}

.home-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.home-section__title {
  margin: 0;
  padding-left: 2px;
  font-size: 0.95rem;
  font-weight: 750;
  color: #1a2a22;
}

.home-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--home-card-min)), 1fr));
  gap: var(--home-gap);
}

.home-card {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  min-height: 68px;
  padding: 12px 14px;
  border: 1px solid #dde5e1;
  border-radius: 14px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease,
    background 0.15s ease;
}

.home-card:hover {
  border-color: color-mix(in srgb, #0f4a32 32%, #dde5e1);
  background: #f7fbf8;
  box-shadow: 0 8px 18px rgba(15, 40, 30, 0.08);
  transform: translateY(-1px);
}

.home-card:focus-visible {
  outline: 2px solid #0f4a32;
  outline-offset: 2px;
}

.home-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  color: #0f4a32;
  background: color-mix(in srgb, #0f4a32 11%, #fff);
}

.home-card__label {
  min-width: 0;
  font-size: clamp(0.84rem, 0.2vw + 0.8rem, 0.94rem);
  font-weight: 700;
  color: #1a2a22;
  line-height: 1.35;
  word-break: break-word;
}

.home-empty {
  margin: 8px 0 0;
  color: #6a7a70;
  font-size: 0.9rem;
}

@media (min-width: 1440px) {
  .home-dash {
    --home-card-min: 220px;
    --home-gap: 14px;
  }
}

@media (max-width: 1279.98px) {
  .home-dash {
    --home-card-min: 180px;
  }
}

@media (max-width: 959.98px) {
  .home-dash {
    --home-card-min: 160px;
    --home-section-gap: 14px;
  }

  .home-hero {
    flex-direction: column;
    align-items: stretch;
  }

  .home-clock {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas:
      'date time'
      'tz time';
    align-items: center;
    column-gap: 12px;
  }

  .home-clock__date {
    grid-area: date;
  }

  .home-clock__time {
    grid-area: time;
    margin-top: 0;
    justify-self: end;
  }

  .home-clock__tz {
    grid-area: tz;
    margin-top: 2px;
  }
}

@media (max-width: 560px) {
  .home-dash {
    --home-card-min: 100%;
    --home-gap: 10px;
  }

  .home-card {
    min-height: 60px;
  }

  .home-clock {
    grid-template-columns: 1fr;
    grid-template-areas:
      'date'
      'time'
      'tz';
  }

  .home-clock__time {
    justify-self: start;
  }
}

@media (max-height: 820px) {
  .home-dash {
    --home-section-gap: 12px;
    --home-gap: 10px;
  }

  .home-hero {
    padding: 12px 16px;
  }

  .home-hero__eyebrow {
    display: none;
  }

  .home-hero__title {
    margin-bottom: 4px;
    font-size: 1.25rem;
  }

  .home-hero__desc {
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .home-clock {
    padding: 10px 12px;
  }

  .home-clock__time {
    font-size: 1.35rem;
  }

  .home-section__title {
    font-size: 0.88rem;
  }

  .home-card {
    min-height: 56px;
    padding: 10px 12px;
    gap: 10px;
  }

  .home-card__icon {
    width: 34px;
    height: 34px;
    border-radius: 9px;
  }
}

@media (max-height: 700px) {
  .home-hero__desc {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}
</style>
