<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDown, ArrowUp, Calendar, Close, Filter, Search, Sort } from '@element-plus/icons-vue'
import {
  EMPTY_FILTER_VALUE,
  type ColumnOption,
  type DateRangeValue,
  type SortOrder,
} from '@/composables/useTableSortFilter'
import { isEmptyFilterValue } from '@/utils/columnFilter'

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
    // 选了日期范围则去掉空值勾选
    if (hasEmptyFilter.value) {
      selected.value = selected.value.filter((x) => !isEmptyFilterValue(x))
    }
  }
}

function toggleEmptyFilter() {
  const next = new Set(selected.value)
  if (next.has(EMPTY_FILTER_VALUE)) next.delete(EMPTY_FILTER_VALUE)
  else next.add(EMPTY_FILTER_VALUE)
  selected.value = [...next]
  if (next.has(EMPTY_FILTER_VALUE) && props.dateRange) {
    draftRange.value = null
    emit('update:dateRangeValue', null)
  }
}

const interactive = computed(() => props.sortable || props.filterable || props.dateRange)

const hasDateRange = computed(
  () => Boolean(props.dateRangeValue?.[0] && props.dateRangeValue?.[1]),
)

const hasEmptyFilter = computed(() => selected.value.some(isEmptyFilterValue))

const hasFilter = computed(
  () =>
    (props.filterable && selected.value.length > 0) ||
    (props.dateRange && (hasDateRange.value || hasEmptyFilter.value)),
)

const hasSort = computed(() => Boolean(props.sortOrder))

const hasActive = computed(() => hasFilter.value || hasSort.value)

const filterBadge = computed(() => {
  if (props.filterable && selected.value.length > 0) return selected.value.length
  if (props.dateRange && (hasDateRange.value || hasEmptyFilter.value)) {
    return (hasDateRange.value ? 1 : 0) + (hasEmptyFilter.value ? 1 : 0)
  }
  return 0
})

const activeHint = computed(() => {
  if (hasFilter.value && hasSort.value) return t('tableColumn.filteredAndSortedHint')
  if (hasFilter.value) return t('tableColumn.filteredHint')
  if (hasSort.value) return t('tableColumn.sortedHint')
  return t('tableColumn.menu')
})

const emptyOption = computed<ColumnOption>(() => ({
  value: EMPTY_FILTER_VALUE,
  label: t('tableColumn.filterEmptyValue'),
}))

/** 合并 props.options 与已选值，并始终置顶「(空)」 */
const baseOptions = computed(() => {
  const map = new Map(props.options.map((o) => [o.value, o]))
  for (const v of selected.value) {
    if (!v || isEmptyFilterValue(v) || map.has(v)) continue
    map.set(v, { value: v, label: v })
  }
  const rest = [...map.values()].filter((o) => !isEmptyFilterValue(o.value))
  return [emptyOption.value, ...rest]
})

const allSelected = computed(
  () => baseOptions.value.length > 0 && selected.value.length === baseOptions.value.length,
)

const filteredOptions = computed(() => {
  if (!filterSearch.value.trim()) return baseOptions.value
  const search = filterSearch.value.toLowerCase().trim()
  return baseOptions.value.filter((opt) => opt.label.toLowerCase().includes(search))
})

const popoverWidth = computed(() => (props.dateRange ? 300 : 248))

function setSort(order: 'asc' | 'desc') {
  emit('update:sortOrder', props.sortOrder === order ? null : order)
}

function clearSort() {
  emit('update:sortOrder', null)
}

function selectAll() {
  selected.value = baseOptions.value.map((o) => o.value)
}

function clearFilter() {
  selected.value = []
}

function clearDateRange() {
  draftRange.value = null
  emit('update:dateRangeValue', null)
}

/** 表头叉号：一键清空本列多选/日期筛选与排序 */
function clearColumnConditions(e: Event) {
  e.preventDefault()
  e.stopPropagation()
  visible.value = false
  if (selected.value.length) clearFilter()
  if (props.dateRange && hasDateRange.value) clearDateRange()
  if (props.sortable && props.sortOrder) clearSort()
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

        <div v-if="filterable" class="lb-col-panel__filter">
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
            <button
              type="button"
              class="lb-col-link"
              :disabled="!baseOptions.length || allSelected"
              @click="selectAll"
            >
              {{ t('tableColumn.selectAll') }}
            </button>
            <button type="button" class="lb-col-link" :disabled="!selected.length" @click="clearFilter">
              {{ t('tableColumn.clearFilter') }}
            </button>
          </div>
          <div v-if="filteredOptions.length" class="lb-col-panel__options">
            <label v-for="opt in filteredOptions" :key="opt.value" class="lb-col-option">
              <el-checkbox
                :model-value="selected.includes(opt.value)"
                @update:model-value="() => toggleOption(opt.value)"
              />
              <span class="lb-col-option__text" :title="opt.label">{{ opt.label }}</span>
            </label>
          </div>
          <div v-else class="lb-col-panel__empty">{{ t('tableColumn.filterEmpty') }}</div>
        </div>

        <div v-if="dateRange" class="lb-col-panel__filter" @mousedown.stop>
          <div class="lb-col-panel__filter-head">
            <el-icon :size="14"><Calendar /></el-icon>
            <span>{{ t('tableColumn.dateRange') }}</span>
          </div>
          <!-- 仅日期列（无多选区）时，在此提供空值勾选 -->
          <label v-if="!filterable" class="lb-col-option lb-col-option--empty">
            <el-checkbox
              :model-value="hasEmptyFilter"
              @update:model-value="toggleEmptyFilter"
            />
            <span class="lb-col-option__text">{{ t('tableColumn.filterEmptyValue') }}</span>
          </label>
          <div class="lb-col-panel__filter-actions">
            <button
              type="button"
              class="lb-col-link"
              :disabled="!hasDateRange && !hasEmptyFilter"
              @click="
                () => {
                  clearDateRange()
                  if (hasEmptyFilter) clearFilter()
                }
              "
            >
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

    <button
      v-if="interactive && hasActive"
      type="button"
      class="lb-col-head__clear"
      :title="t('tableColumn.clearColumnConditions')"
      :aria-label="t('tableColumn.clearColumnConditions')"
      @click="clearColumnConditions"
    >
      <el-icon :size="11"><Close /></el-icon>
    </button>

    <span v-else-if="!interactive" class="lb-col-head__label">{{ label }}</span>
  </div>
</template>
