<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Clock } from '@element-plus/icons-vue'

const model = defineModel<string>({ default: '09:00' })
withDefaults(
  defineProps<{
    placeholder?: string
  }>(),
  { placeholder: 'HH:mm' },
)

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)
const ITEM_H = 28
const VISIBLE = 5

const open = ref(false)
const draft = ref(model.value || '')
const rootRef = ref<HTMLElement | null>(null)
const hourWrapRef = ref<HTMLElement | null>(null)
const minuteWrapRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

const parsed = computed(() => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((model.value || '').trim())
  if (!m) return { h: 9, min: 0 }
  return {
    h: Math.min(23, Math.max(0, Number(m[1]))),
    min: Math.min(59, Math.max(0, Number(m[2]))),
  }
})

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toHhmm(h: number, min: number) {
  return `${pad2(h)}:${pad2(min)}`
}

function normalizeTyped(raw: string): string | null {
  const s = raw.trim()
  const m = /^(\d{1,2}):(\d{2})$/.exec(s)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return toHhmm(h, min)
}

const PANEL_W = 148

function placePanel() {
  const el = rootRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const panelH = ITEM_H * VISIBLE
  const gap = 6
  const spaceBelow = window.innerHeight - r.bottom - gap
  const placeAbove = spaceBelow < panelH + 12 && r.top > spaceBelow
  const top = placeAbove ? r.top - gap - panelH : r.bottom + gap
  // Align to input left; clamp so it stays on screen
  let left = r.left
  if (left + PANEL_W > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - PANEL_W - 8)
  }
  panelStyle.value = {
    top: `${Math.max(8, top)}px`,
    left: `${left}px`,
  }
}

function scrollToValue(h: number, min: number, smooth = false) {
  const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto'
  if (hourWrapRef.value) {
    hourWrapRef.value.scrollTo({ top: h * ITEM_H, behavior })
  }
  if (minuteWrapRef.value) {
    minuteWrapRef.value.scrollTo({ top: min * ITEM_H, behavior })
  }
}

async function openPanel() {
  open.value = true
  draft.value = model.value || ''
  placePanel()
  await nextTick()
  placePanel()
  scrollToValue(parsed.value.h, parsed.value.min, false)
}

function closePanel() {
  open.value = false
}

function commit(hhmm: string) {
  model.value = hhmm
  draft.value = hhmm
}

function pickHour(h: number) {
  const next = toHhmm(h, parsed.value.min)
  commit(next)
  nextTick(() => scrollToValue(h, parsed.value.min, true))
}

function pickMinute(min: number) {
  const next = toHhmm(parsed.value.h, min)
  commit(next)
  nextTick(() => scrollToValue(parsed.value.h, min, true))
}

function onDraftInput(e: Event) {
  const el = e.target as HTMLInputElement
  draft.value = el.value
  const normalized = normalizeTyped(el.value)
  if (!normalized) return
  commit(normalized)
  const [h, min] = normalized.split(':').map(Number)
  if (open.value) {
    nextTick(() => scrollToValue(h, min, true))
  } else {
    openPanel()
  }
}

function onDraftFocus() {
  if (!open.value) openPanel()
}

function onDraftBlur() {
  const normalized = normalizeTyped(draft.value)
  if (normalized) {
    commit(normalized)
  } else {
    draft.value = model.value || ''
  }
}

function onDraftKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    const normalized = normalizeTyped(draft.value)
    if (normalized) commit(normalized)
    closePanel()
    ;(e.target as HTMLInputElement).blur()
  } else if (e.key === 'Escape') {
    draft.value = model.value || ''
    closePanel()
  }
}

function onDocPointerDown(e: PointerEvent) {
  if (!open.value) return
  const t = e.target as Node
  if (rootRef.value?.contains(t)) return
  const panel = document.getElementById(panelId)
  if (panel?.contains(t)) return
  closePanel()
}

function onReposition() {
  if (!open.value) return
  placePanel()
}

const panelId = `thm-panel-${Math.random().toString(36).slice(2, 9)}`

watch(
  () => model.value,
  (v) => {
    if (document.activeElement && rootRef.value?.contains(document.activeElement)) return
    draft.value = v || ''
    if (open.value) {
      nextTick(() => scrollToValue(parsed.value.h, parsed.value.min, false))
    }
  },
)

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
  window.addEventListener('resize', onReposition)
  window.addEventListener('scroll', onReposition, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  window.removeEventListener('resize', onReposition)
  window.removeEventListener('scroll', onReposition, true)
})
</script>

<template>
  <div ref="rootRef" class="thm" :class="{ 'is-open': open }">
    <div class="thm__input-wrap" @click="openPanel">
      <el-icon class="thm__icon"><Clock /></el-icon>
      <input
        class="thm__input"
        type="text"
        inputmode="numeric"
        maxlength="5"
        :placeholder="placeholder"
        :value="draft"
        @input="onDraftInput"
        @focus="onDraftFocus"
        @blur="onDraftBlur"
        @keydown="onDraftKeydown"
      />
    </div>

    <Teleport to="body">
      <div
        v-show="open"
        :id="panelId"
        class="thm-panel"
        role="listbox"
        :style="panelStyle"
      >
        <div class="thm-panel__rail" aria-hidden="true" />
        <div class="thm-panel__cols">
          <div ref="hourWrapRef" class="thm-panel__col" aria-label="hours">
            <button
              v-for="h in HOURS"
              :key="`h-${h}`"
              type="button"
              class="thm-panel__item"
              :class="{ 'is-active': h === parsed.h }"
              @mousedown.prevent
              @click="pickHour(h)"
            >
              {{ pad2(h) }}
            </button>
          </div>
          <div ref="minuteWrapRef" class="thm-panel__col" aria-label="minutes">
            <button
              v-for="min in MINUTES"
              :key="`m-${min}`"
              type="button"
              class="thm-panel__item"
              :class="{ 'is-active': min === parsed.min }"
              @mousedown.prevent
              @click="pickMinute(min)"
            >
              {{ pad2(min) }}
            </button>
          </div>
        </div>
        <div class="thm-panel__fade thm-panel__fade--top" aria-hidden="true" />
        <div class="thm-panel__fade thm-panel__fade--bottom" aria-hidden="true" />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.thm {
  position: relative;
  flex: 1;
  min-width: 0;
}

.thm__input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  padding: 0 11px;
  border: 1px solid var(--lb-border, #d7ded9);
  border-radius: 8px;
  background: #fff;
  cursor: text;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.thm.is-open .thm__input-wrap,
.thm__input-wrap:focus-within {
  border-color: var(--lb-brand);
  box-shadow: 0 0 0 1px var(--lb-brand) inset, 0 0 0 3px rgba(15, 74, 50, 0.12);
}

.thm__icon {
  color: var(--lb-muted);
  font-size: 14px;
  flex: 0 0 auto;
}

.thm.is-open .thm__icon {
  color: var(--lb-brand);
}

.thm__input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
  color: #1f2a24;
  line-height: 1;
}
</style>

<style>
/* Teleported panel — unscoped */
.thm-panel {
  position: fixed;
  z-index: 5200;
  box-sizing: border-box;
  width: 148px;
  height: 140px;
  border: 1px solid #c9d5ce;
  border-radius: 10px;
  background: #fff;
  box-shadow:
    0 0 0 1px rgba(15, 74, 50, 0.04),
    0 12px 28px rgba(20, 40, 30, 0.14),
    0 2px 6px rgba(20, 40, 30, 0.06);
  overflow: hidden;
}

.thm-panel__rail {
  position: absolute;
  z-index: 1;
  left: 6px;
  right: 6px;
  top: 50%;
  height: 28px;
  margin-top: -14px;
  border-radius: 7px;
  background: #eef6f1;
  box-shadow: 0 0 0 1px rgba(15, 74, 50, 0.08) inset;
  pointer-events: none;
}

.thm-panel__cols {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns: 1fr 1fr;
  height: 100%;
}

.thm-panel__col {
  overflow-x: hidden;
  overflow-y: auto;
  scroll-snap-type: y mandatory;
  padding: 56px 0;
  border-right: 1px solid #e6ece8;
  scrollbar-width: thin;
  scrollbar-color: #c5d0c9 transparent;
}

.thm-panel__col:last-child {
  border-right: 0;
}

.thm-panel__col::-webkit-scrollbar {
  width: 6px;
}

.thm-panel__col::-webkit-scrollbar-thumb {
  background: #c5d0c9;
  border-radius: 999px;
}

.thm-panel__col::-webkit-scrollbar-track {
  background: transparent;
}

.thm-panel__item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 28px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #5a6b62;
  font: inherit;
  font-size: 0.84rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.03em;
  cursor: pointer;
  scroll-snap-align: center;
  transition: color 0.12s ease;
}

.thm-panel__item:hover {
  color: #1f2a24;
}

.thm-panel__item.is-active {
  color: var(--lb-brand, #0f4a32);
  font-weight: 700;
}

.thm-panel__fade {
  position: absolute;
  z-index: 3;
  left: 0;
  right: 0;
  height: 36px;
  pointer-events: none;
}

.thm-panel__fade--top {
  top: 0;
  background: linear-gradient(180deg, #fff 20%, rgba(255, 255, 255, 0));
}

.thm-panel__fade--bottom {
  bottom: 0;
  background: linear-gradient(0deg, #fff 20%, rgba(255, 255, 255, 0));
}
</style>
