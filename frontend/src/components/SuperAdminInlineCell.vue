<script setup lang="ts">
/**
 * superAdmin 专用行内编辑：铅笔 → select / text / number / date。
 * 非 superAdmin 仅渲染默认插槽（或 display 文案）。
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { EditPen } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import type { InlineEditType } from '@/config/inlineEditWhitelist'

export type InlineSelectOption = { value: string; label: string }

const props = withDefaults(
  defineProps<{
    value: string | number | null | undefined
    type: InlineEditType
    options?: InlineSelectOption[]
    precision?: number
    min?: number
    max?: number
    /** 未编辑时展示（不传则用默认插槽 / 原始值） */
    displayText?: string
    disabled?: boolean
  }>(),
  {
    options: () => [],
    precision: 2,
    min: undefined,
    max: undefined,
    displayText: undefined,
    disabled: false,
  },
)

const emit = defineEmits<{
  save: [value: string | number | null]
}>()

const userStore = useUserStore()
const canEdit = computed(() => userStore.isSuperAdmin && !props.disabled)

const editing = ref(false)
const draft = ref<string | number | null>('')
const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<{ focus?: () => void; $el?: HTMLElement } | null>(null)
const saving = ref(false)
let outsideBound = false
let blurTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.value,
  (v) => {
    if (!editing.value) draft.value = v ?? (props.type === 'number' ? null : '')
  },
)

function isInFloatingUi(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest(
      '.el-select__popper, .el-picker__popper, .el-popper, .el-select-dropdown, .el-picker-panel, .el-date-picker, .el-time-panel',
    ),
  )
}

function onPointerDownOutside(e: Event) {
  if (!editing.value) return
  const t = e.target
  if (rootRef.value?.contains(t as Node)) return
  if (isInFloatingUi(t)) return
  void finishEdit()
}

function bindOutside() {
  if (outsideBound) return
  document.addEventListener('mousedown', onPointerDownOutside, true)
  document.addEventListener('touchstart', onPointerDownOutside, true)
  outsideBound = true
}

function unbindOutside() {
  if (!outsideBound) return
  document.removeEventListener('mousedown', onPointerDownOutside, true)
  document.removeEventListener('touchstart', onPointerDownOutside, true)
  outsideBound = false
}

watch(editing, (v) => {
  if (v) bindOutside()
  else unbindOutside()
})

onBeforeUnmount(() => {
  unbindOutside()
  if (blurTimer) clearTimeout(blurTimer)
})

async function startEdit() {
  if (!canEdit.value) return
  draft.value =
    props.type === 'number'
      ? props.value == null || props.value === ''
        ? null
        : Number(props.value)
      : props.value == null
        ? ''
        : String(props.value)
  editing.value = true
  await nextTick()
  const el = inputRef.value as unknown as { focus?: () => void }
  el?.focus?.()
}

function cancel() {
  editing.value = false
  draft.value = props.value ?? (props.type === 'number' ? null : '')
}

function normalizeOut(): string | number | null {
  if (props.type === 'number') {
    if (draft.value === '' || draft.value == null) return null
    const n = Number(draft.value)
    return Number.isFinite(n) ? n : null
  }
  if (props.type === 'date') {
    const s = String(draft.value ?? '').trim()
    return s || null
  }
  return String(draft.value ?? '').trim()
}

function sameAsCurrent(next: string | number | null): boolean {
  const cur = props.value
  if (next == null && (cur == null || cur === '')) return true
  if (props.type === 'number') {
    return Number(next) === Number(cur)
  }
  return String(next ?? '') === String(cur ?? '')
}

/** 失焦 / 关闭面板：有改动则保存，否则还原展示 */
async function finishEdit() {
  if (!editing.value || saving.value) return
  const next = normalizeOut()
  if (sameAsCurrent(next)) {
    editing.value = false
    return
  }
  saving.value = true
  try {
    emit('save', next)
    editing.value = false
  } finally {
    saving.value = false
  }
}

function onSelectVisible(open: boolean) {
  if (!open) void finishEdit()
}

function onDateVisible(open: boolean) {
  if (!open) void finishEdit()
}

function onEditorBlur() {
  if (blurTimer) clearTimeout(blurTimer)
  blurTimer = setTimeout(() => {
    if (!editing.value) return
    const ae = document.activeElement
    if (ae && (rootRef.value?.contains(ae) || isInFloatingUi(ae))) return
    void finishEdit()
  }, 200)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    void finishEdit()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancel()
  }
}

const shownText = computed(() => {
  if (props.displayText != null && props.displayText !== '') return props.displayText
  if (props.value == null || props.value === '') return '—'
  return String(props.value)
})
</script>

<template>
  <div v-if="!canEdit" class="sa-inline">
    <slot>{{ shownText }}</slot>
  </div>
  <div v-else-if="!editing" class="sa-inline sa-inline--view">
    <span class="sa-inline__body">
      <slot>{{ shownText }}</slot>
    </span>
    <button
      type="button"
      class="sa-inline__pen"
      title="Edit"
      aria-label="Edit"
      @click.stop="startEdit"
    >
      <el-icon :size="12"><EditPen /></el-icon>
    </button>
  </div>
  <div
    v-else
    ref="rootRef"
    class="sa-inline sa-inline--edit"
    @keydown="onKeydown"
  >
    <el-select
      v-if="type === 'select'"
      ref="inputRef"
      v-model="draft"
      filterable
      size="small"
      style="width: 100%"
      teleported
      @change="finishEdit"
      @visible-change="onSelectVisible"
      @blur="onEditorBlur"
    >
      <el-option
        v-for="opt in options"
        :key="opt.value"
        :label="opt.label"
        :value="opt.value"
      />
    </el-select>
    <el-date-picker
      v-else-if="type === 'date'"
      ref="inputRef"
      v-model="draft"
      type="date"
      value-format="YYYY-MM-DD"
      size="small"
      style="width: 100%"
      teleported
      @change="finishEdit"
      @visible-change="onDateVisible"
      @blur="onEditorBlur"
    />
    <el-input-number
      v-else-if="type === 'number'"
      ref="inputRef"
      v-model="draft"
      size="small"
      :precision="precision"
      :min="min"
      :max="max"
      :controls="false"
      style="width: 100%"
      @blur="onEditorBlur"
      @keyup.enter="finishEdit"
    />
    <el-input
      v-else
      ref="inputRef"
      v-model="draft"
      size="small"
      @blur="onEditorBlur"
      @keyup.enter="finishEdit"
    />
  </div>
</template>

<style scoped>
.sa-inline {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  min-width: 0;
}

.sa-inline--view {
  position: relative;
  display: block;
  width: 100%;
  box-sizing: border-box;
  min-height: 22px;
  overflow: visible;
}

.sa-inline__body {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 右上角叠层：不占布局；仅本单元格悬停显示 */
.sa-inline__pen {
  position: absolute;
  top: -7px;
  right: -7px;
  left: auto;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: #fff;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, transparent),
    0 1px 4px rgb(15 74 50 / 10%);
  color: var(--lb-muted, #8a9590);
  cursor: pointer;
  line-height: 1;
  opacity: 0;
  pointer-events: none;
  transform: scale(0.88);
  transition:
    opacity 0.12s ease,
    color 0.12s ease,
    background 0.12s ease,
    transform 0.12s ease,
    box-shadow 0.12s ease;
}

.sa-inline--view:hover .sa-inline__pen,
.sa-inline--view:focus-within .sa-inline__pen {
  opacity: 0.96;
  pointer-events: auto;
  transform: scale(1);
}

.sa-inline__pen:hover {
  opacity: 1 !important;
  color: var(--lb-brand, #0f4a32);
  background: #fff;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 30%, transparent),
    0 2px 6px rgb(15 74 50 / 14%);
}

.sa-inline__pen:focus-visible {
  opacity: 1;
  pointer-events: auto;
  outline: 2px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 45%, transparent);
  outline-offset: 1px;
}

.sa-inline--edit {
  --sa-edit-h: 26px;
  width: 100%;
  min-width: 72px;
}

.sa-inline--edit :deep(.el-select),
.sa-inline--edit :deep(.el-input),
.sa-inline--edit :deep(.el-input-number),
.sa-inline--edit :deep(.el-date-editor) {
  width: 100%;
}

/* 输入本身扁平，淡环交给单元格 */
.sa-inline--edit :deep(.el-select__wrapper),
.sa-inline--edit :deep(.el-input__wrapper),
.sa-inline--edit :deep(.el-date-editor .el-input__wrapper) {
  min-height: var(--sa-edit-h) !important;
  height: var(--sa-edit-h);
  padding: 0 6px;
  border-radius: 6px;
  background: transparent !important;
  box-shadow: none !important;
}

.sa-inline--edit :deep(.el-select__wrapper.is-focused),
.sa-inline--edit :deep(.el-input__wrapper.is-focus),
.sa-inline--edit :deep(.el-select__wrapper:hover),
.sa-inline--edit :deep(.el-input__wrapper:hover) {
  background: transparent !important;
  box-shadow: none !important;
}

.sa-inline--edit :deep(.el-select__selected-item),
.sa-inline--edit :deep(.el-select__placeholder),
.sa-inline--edit :deep(.el-input__inner) {
  font-size: 0.84rem;
  font-weight: 600;
  color: #2c3a34;
  height: var(--sa-edit-h);
  line-height: var(--sa-edit-h);
}

.sa-inline--edit :deep(.el-select__caret),
.sa-inline--edit :deep(.el-input__prefix),
.sa-inline--edit :deep(.el-input__suffix) {
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 55%, #8a9590);
}

.sa-inline--edit :deep(.el-input-number) {
  width: 100%;
  line-height: var(--sa-edit-h);
}

.sa-inline--edit :deep(.el-input-number .el-input__wrapper) {
  padding-left: 6px;
  padding-right: 6px;
}

.sa-inline--edit :deep(.el-date-editor.el-input) {
  --el-date-editor-width: 100%;
  height: var(--sa-edit-h);
}
</style>

<style>
.el-table .cell:has(.sa-inline--view) {
  overflow: visible;
}

/* 编辑态：淡环包住整个单元格 */
.el-table .cell:has(.sa-inline--edit) {
  overflow: visible;
  position: relative;
  z-index: 2;
  border-radius: 8px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 4%, #fff);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--lb-brand, #0f4a32) 34%, #c5d4cc),
    0 0 0 3px color-mix(in srgb, var(--lb-brand, #0f4a32) 16%, transparent);
}
</style>
