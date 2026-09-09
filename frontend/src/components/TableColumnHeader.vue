<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDown, ArrowUp, Close, Filter, Sort } from '@element-plus/icons-vue'
import type { ColumnOption, SortOrder } from '@/composables/useTableSortFilter'

const props = withDefaults(
  defineProps<{
    label: string
    sortable?: boolean
    filterable?: boolean
    options?: ColumnOption[]
    sortOrder?: SortOrder
    modelValue?: string[]
  }>(),
  {
    sortable: false,
    filterable: false,
    options: () => [],
    sortOrder: null,
    modelValue: () => [],
  },
)

const emit = defineEmits<{
  'update:sortOrder': [SortOrder]
  'update:modelValue': [string[]]
}>()

const { t } = useI18n()
const visible = ref(false)

const selected = computed({
  get: () => props.modelValue,
  set: (v: string[]) => emit('update:modelValue', v),
})

const interactive = computed(() => props.sortable || props.filterable)

const hasActive = computed(
  () => Boolean(props.sortOrder) || (props.filterable && selected.value.length > 0),
)

const allSelected = computed(
  () => props.options.length > 0 && selected.value.length === props.options.length,
)

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

function toggleOption(value: string) {
  const next = new Set(selected.value)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  selected.value = [...next]
}
</script>

<template>
  <div class="lb-col-head" :class="{ 'is-active': hasActive, 'is-interactive': interactive }">
    <el-popover
      v-if="interactive"
      v-model:visible="visible"
      placement="bottom-start"
      :width="248"
      trigger="click"
      popper-class="lb-col-head-popper"
      :show-arrow="false"
      :offset="6"
    >
      <template #reference>
        <button
          type="button"
          class="lb-col-head__hit"
          :class="{ 'is-on': hasActive }"
          :aria-label="t('tableColumn.menu')"
        >
          <span class="lb-col-head__label">{{ label }}</span>
          <span class="lb-col-head__trigger" :class="{ 'is-on': hasActive }" aria-hidden="true">
            <el-icon :size="13">
              <Sort v-if="sortable && !filterable" />
              <Filter v-else />
            </el-icon>
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
          <div class="lb-col-panel__filter-actions">
            <button type="button" class="lb-col-link" :disabled="allSelected" @click="selectAll">
              {{ t('tableColumn.selectAll') }}
            </button>
            <button type="button" class="lb-col-link" :disabled="!selected.length" @click="clearFilter">
              {{ t('tableColumn.clearFilter') }}
            </button>
          </div>
          <div class="lb-col-panel__options">
            <label v-for="opt in options" :key="opt.value" class="lb-col-option">
              <el-checkbox
                :model-value="selected.includes(opt.value)"
                @update:model-value="() => toggleOption(opt.value)"
              />
              <span class="lb-col-option__text" :title="opt.label">{{ opt.label }}</span>
            </label>
          </div>
        </div>
      </div>
    </el-popover>

    <span v-else class="lb-col-head__label">{{ label }}</span>
  </div>
</template>
