<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDown, ArrowUp, Calendar, Close, Filter, Search, Sort } from '@element-plus/icons-vue'
import type { ColumnOption, DateRangeValue, SortOrder } from '@/composables/useTableSortFilter'

const props = withDefaults(
  defineProps<{
    label: string
    sortable?: boolean
    filterable?: boolean
    /** 日期范围筛选（YYYY-MM-DD） */
    dateRange?: boolean
    options?: ColumnOption[]
    sortOrder?: SortOrder
    modelValue?: string[]
    dateRangeValue?: DateRangeValue
  }>(),
  {
    sortable: false,
    filterable: false,
    dateRange: false,
    options: () => [],
    sortOrder: null,
    modelValue: () => [],
    dateRangeValue: null,
  },
)

const emit = defineEmits<{
  'update:sortOrder': [SortOrder]
  'update:modelValue': [string[]]
  'update:dateRangeValue': [DateRangeValue]
}>()

const { t } = useI18n()
const visible = ref(false)
const filterSearch = ref('')
/** 本地草稿：选完起止日再回写，避免选一半时父级重渲染关掉弹层 */
const draftRange = ref<DateRangeValue>(props.dateRangeValue)

const selected = computed({
  get: () => props.modelValue,
  set: (v: string[]) => emit('update:modelValue', v),
})

watch(
  () => props.dateRangeValue,
  (v) => {
    draftRange.value = v
  },
)

watch(visible, (open) => {
  if (open) {
    draftRange.value = props.dateRangeValue
    filterSearch.value = ''
  }
})

function onDraftRangeUpdate(v: DateRangeValue | '' | null) {
  if (!v || !Array.isArray(v)) {
    draftRange.value = null
    emit('update:dateRangeValue', null)
    return
  }
  if (v[0] && v[1]) {
    draftRange.value = [v[0], v[1]]
    emit('update:dateRangeValue', [v[0], v[1]])
  }
}

const interactive = computed(() => props.sortable || props.filterable || props.dateRange)

const hasDateRange = computed(
  () => Boolean(props.dateRangeValue?.[0] && props.dateRangeValue?.[1]),
)

const hasFilter = computed(
  () => (props.filterable && selected.value.length > 0) || (props.dateRange && hasDateRange.value),
)

const hasSort = computed(() => Boolean(props.sortOrder))

const hasActive = computed(() => hasFilter.value || hasSort.value)

const filterBadge = computed(() => {
  if (props.filterable && selected.value.length > 0) return selected.value.length
  if (props.dateRange && hasDateRange.value) return 1
  return 0
})

const activeHint = computed(() => {
  if (hasFilter.value && hasSort.value) return t('tableColumn.filteredAndSortedHint')
  if (hasFilter.value) return t('tableColumn.filteredHint')
  if (hasSort.value) return t('tableColumn.sortedHint')
  return t('tableColumn.menu')
})

const allSelected = computed(
  () => props.options.length > 0 && selected.value.length === props.options.length,
)

const filteredOptions = computed(() => {
  if (!filterSearch.value.trim()) return props.options
  const search = filterSearch.value.toLowerCase().trim()
  return props.options.filter((opt) => opt.label.toLowerCase().includes(search))
})

const popoverWidth = computed(() => (props.dateRange ? 300 : 248))

function setSort(order: 'asc' | 'desc') {
  emit('update:sortOrder', props.sortOrder === order ? null : order)
}

function clearSort() {
  emit('update:sortOrder', null)
}

function selectAll() {
  selected.value = props.options.map((o) => o.value)
}

function clearFilter() {
  selected.value = []
}

function clearDateRange() {
  draftRange.value = null
  emit('update:dateRangeValue', null)
}

function toggleOption(value: string) {
  const next = new Set(selected.value)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  selected.value = [...next]
}
</script>

<template>
  <div
    class="lb-col-head"
    :class="{
      'is-active': hasActive,
      'is-filtered': hasFilter,
      'is-sorted': hasSort,
      'is-interactive': interactive,
    }"
  >
    <el-popover
      v-if="interactive"
      v-model:visible="visible"
      placement="bottom-start"
      :width="popoverWidth"
      trigger="click"
      popper-class="lb-col-head-popper"
      :show-arrow="false"
      :offset="6"
    >
      <template #reference>
        <button
          type="button"
          class="lb-col-head__hit"
          :class="{ 'is-on': hasActive, 'is-filtered': hasFilter, 'is-sorted': hasSort }"
          :title="activeHint"
          :aria-label="activeHint"
        >
          <span class="lb-col-head__label">{{ label }}</span>
          <span
            class="lb-col-head__trigger"
            :class="{ 'is-on': hasActive, 'is-filtered': hasFilter, 'is-sorted': hasSort }"
            aria-hidden="true"
          >
            <el-icon :size="12">
              <ArrowUp v-if="sortOrder === 'asc' && !hasFilter" />
              <ArrowDown v-else-if="sortOrder === 'desc' && !hasFilter" />
              <Calendar v-else-if="dateRange && (!filterable || hasDateRange)" />
              <Filter v-else-if="filterable" />
              <Sort v-else-if="sortable" />
              <Filter v-else />
            </el-icon>
            <span v-if="filterBadge > 0" class="lb-col-head__badge">
              {{ filterBadge > 9 ? '9+' : filterBadge }}
            </span>
            <span v-else-if="hasSort && hasFilter" class="lb-col-head__sort-dot" />
          </span>
        </button>
      </template>

      <div class="lb-col-panel">
        <div v-if="sortable" class="lb-col-panel__sort">
          <button
            type="button"
            class="lb-col-btn lb-col-btn--asc"
            :class="{ 'is-active': sortOrder === 'asc' }"
            @click="setSort('asc')"
          >
            <el-icon><ArrowUp /></el-icon>
            <span>{{ t('tableColumn.sortAsc') }}</span>
          </button>
          <button
            type="button"
            class="lb-col-btn lb-col-btn--desc"
            :class="{ 'is-active': sortOrder === 'desc' }"
            @click="setSort('desc')"
          >
            <el-icon><ArrowDown /></el-icon>
            <span>{{ t('tableColumn.sortDesc') }}</span>
          </button>
          <button type="button" class="lb-col-btn lb-col-btn--clear" @click="clearSort">
            <el-icon><Close /></el-icon>
            <span>{{ t('tableColumn.clearSort') }}</span>
          </button>
        </div>

        <div v-if="filterable && options.length" class="lb-col-panel__filter">
          <div class="lb-col-panel__filter-head">
            <el-icon :size="14"><Filter /></el-icon>
            <span>{{ t('tableColumn.filter') }}</span>
          </div>
          <div class="lb-col-panel__filter-search">
            <el-input
              v-model="filterSearch"
              size="small"
              :placeholder="t('tableColumn.searchPlaceholder')"
              clearable
              class="filter-search-input"
            >
              <template #prefix>
                <el-icon :size="14"><Search /></el-icon>
              </template>
            </el-input>
          </div>
          <div class="lb-col-panel__filter-actions">
            <button type="button" class="lb-col-link" :disabled="allSelected" @click="selectAll">
              {{ t('tableColumn.selectAll') }}
            </button>
            <button type="button" class="lb-col-link" :disabled="!selected.length" @click="clearFilter">
              {{ t('tableColumn.clearFilter') }}
            </button>
          </div>
          <div class="lb-col-panel__options">
            <label v-for="opt in filteredOptions" :key="opt.value" class="lb-col-option">
              <el-checkbox
                :model-value="selected.includes(opt.value)"
                @update:model-value="() => toggleOption(opt.value)"
              />
              <span class="lb-col-option__text" :title="opt.label">{{ opt.label }}</span>
            </label>
          </div>
        </div>

        <div v-if="dateRange" class="lb-col-panel__filter" @mousedown.stop>
          <div class="lb-col-panel__filter-head">
            <el-icon :size="14"><Calendar /></el-icon>
            <span>{{ t('tableColumn.dateRange') }}</span>
          </div>
          <div class="lb-col-panel__filter-actions">
            <button type="button" class="lb-col-link" :disabled="!hasDateRange" @click="clearDateRange">
              {{ t('tableColumn.clearFilter') }}
            </button>
          </div>
          <el-date-picker
            :model-value="draftRange"
            type="daterange"
            value-format="YYYY-MM-DD"
            unlink-panels
            :teleported="false"
            :start-placeholder="t('tableColumn.dateStart')"
            :end-placeholder="t('tableColumn.dateEnd')"
            class="lb-col-date-range"
            @update:model-value="onDraftRangeUpdate"
          />
        </div>
      </div>
    </el-popover>

    <span v-else class="lb-col-head__label">{{ label }}</span>
  </div>
</template>

<style scoped>
.lb-col-panel__filter-search {
  padding: 8px 12px 12px;
  background: linear-gradient(to bottom, #fafbfc 0%, #f5f7f9 100%);
  border-bottom: 1px solid #e8ecf0;
  margin: 0;
}

.lb-col-panel__filter-search :deep(.el-input) {
  width: 100%;
}

.lb-col-panel__filter-search :deep(.el-input__wrapper) {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 0 0 1px #e0e3e8 inset;
  background-color: #ffffff;
  border-radius: 6px;
  padding: 2px 12px;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.lb-col-panel__filter-search :deep(.el-input__wrapper:hover) {
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08), 0 0 0 1px #c5c9d0 inset;
  background-color: #ffffff;
}

.lb-col-panel__filter-search :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 3px 8px rgba(64, 158, 255, 0.12), 0 0 0 1px var(--el-color-primary) inset;
  background-color: #ffffff;
}

.lb-col-panel__filter-search :deep(.el-input__inner) {
  font-size: 13px;
  height: 30px;
  line-height: 30px;
  color: #303133;
  font-weight: 400;
}

.lb-col-panel__filter-search :deep(.el-input__inner::placeholder) {
  color: #b4b8c0;
  font-size: 13px;
  font-weight: 400;
}

.lb-col-panel__filter-search :deep(.el-input__prefix) {
  color: #909399;
  display: flex;
  align-items: center;
  transition: color 0.2s;
}

.lb-col-panel__filter-search :deep(.el-input__wrapper.is-focus .el-input__prefix) {
  color: var(--el-color-primary);
}

.lb-col-panel__filter-search :deep(.el-input__suffix) {
  display: flex;
  align-items: center;
}

.lb-col-panel__filter-search :deep(.el-input__clear) {
  font-size: 14px;
  color: #c0c4cc;
  transition: color 0.2s;
}

.lb-col-panel__filter-search :deep(.el-input__clear:hover) {
  color: #909399;
}

.lb-col-panel__filter-search :deep(.el-icon) {
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
