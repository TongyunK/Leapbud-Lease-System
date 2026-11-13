<script setup lang="ts">
import { useResourcePermissions } from '@/composables/useResourcePermissions'
const perms = useResourcePermissions('scheduledJobs')
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Clock, EditPen, QuestionFilled, Search, Timer } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import {
  fetchScheduledJobLogs,
  fetchScheduledJobs,
  runScheduledJobApi,
  updateScheduledJobApi,
} from '@/api/scheduled-jobs'
import type {
  ScheduledJobLogRecord,
  ScheduledJobRecord,
  ScheduledJobRecurrence,
} from '@/types/scheduled-job'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import { measureActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { formatDateTime } from '@/utils/format'
import {
  MONTH_DAY_VALUES,
  RECURRENCE_OPTIONS,
  WEEKDAY_VALUES,
  WEEK_ORDINAL_VALUES,
  defaultRecurrenceConfig,
  mmDdToYearly,
  parseRecurrenceConfig,
  serializeRecurrenceConfig,
  validateRecurrenceConfig,
  yearlyToMmDd,
  type ScheduledJobRecurrenceConfig,
} from '@/utils/scheduledJobRecurrence'

const { t, locale } = useI18n()
const isMobile = useIsMobile()
const { colW, textColW, codeColW, statusColW, datetimeColWidth, tableLayoutKey } =
  useTableColWidth()

const loading = ref(false)
const keyword = ref('')
const list = ref<ScheduledJobRecord[]>([])
const runningIds = ref<Set<string>>(new Set())
const togglingIds = ref<Set<string>>(new Set())

const formVisible = ref(false)
const logsVisible = ref(false)
const editing = ref<ScheduledJobRecord | null>(null)
const logsLoading = ref(false)
const logs = ref<ScheduledJobLogRecord[]>([])
const logsJobName = ref('')

const form = reactive({
  name: '',
  handlerLabel: '',
  handlerDescription: '',
  runTime: '01:00',
  recurrence: 'daily' as ScheduledJobRecurrence,
  weekdays: [] as number[],
  monthDays: [] as number[],
  weekOrdinal: 1 as number,
  monthWeekday: 1 as number,
  yearlyMmDd: '01-01',
})

function weekdayLabel(d: number) {
  return t(`scheduledJob.weekdays.${d}`)
}

function weekOrdinalLabel(w: number) {
  return t(`scheduledJob.weekOrdinal.${String(w)}`)
}

function cycleDetail(recurrence: string, rawCfg: string): string {
  const cfg = parseRecurrenceConfig(rawCfg)
  switch (recurrence) {
    case 'weekly': {
      const days = (cfg.weekdays || []).map(Number).sort((a, b) => a - b)
      if (!days.length) return ''
      return days.map(weekdayLabel).join('、')
    }
    case 'monthly_days': {
      const days = (cfg.days || []).map(Number).sort((a, b) => a - b)
      if (!days.length) return ''
      return days.map((d) => t('scheduledJob.monthDay', { d })).join('、')
    }
    case 'monthly_weekday':
      return `${weekOrdinalLabel(Number(cfg.week ?? 1))}${weekdayLabel(Number(cfg.weekday ?? 1))}`
    case 'yearly': {
      const m = Number(cfg.month) || 1
      const d = Number(cfg.day) || 1
      return t('scheduledJob.yearlyDate', { m, d })
    }
    default:
      return ''
  }
}

function cycleLabel(row: ScheduledJobRecord) {
  if (row.scheduleKind === 'once') {
    return row.onceAt ? formatDateTime(row.onceAt) : '—'
  }
  const detail = cycleDetail(row.recurrence, row.recurrenceConfig)
  const base = t('scheduledJob.cycleAt', {
    recurrence: t(`scheduledJob.recurrence.${row.recurrence}`),
    time: row.runTime || '—',
  })
  return detail ? `${base}（${detail}）` : base
}

function lastRunTone(status: string): 'success' | 'danger' | 'info' | 'warning' {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'warning'
  return 'info'
}

/** 操作列：运行 + 编辑并排；勿过窄导致换行堆叠 */
const actionColWidth = computed(() => {
  void locale.value
  return measureActionColWidth([t('scheduledJob.run'), t('common.edit')])
})

/** 名称按实际文案测宽（+ 编辑图标余量） */
const nameColWidth = computed(
  () =>
    codeColW(t('scheduledJob.fields.name'), {
      interactive: true,
      samples: list.value.map((r) => r.name),
    }) + 22,
)

/** 周期胶囊：文案 + 图标/内边距 */
const cycleColWidth = computed(
  () =>
    Math.max(
      128,
      codeColW(t('scheduledJob.fields.cycle'), {
        interactive: true,
        samples: list.value.map((r) => cycleLabel(r)),
      }) + 36,
    ),
)

/** 执行功能：弹性列；说明两行截断 + tooltip，避免 long 下限撑太宽 */
const handlerColWidth = computed(() =>
  colW(t('scheduledJob.fields.handler'), { interactive: true, contentMin: 168 }),
)

const logsColWidth = computed(() => colW(t('scheduledJob.fields.logs'), { contentMin: 56 }))

/** 状态列：开关宽度即可，勿按 StatusBadge 估宽 */
const enabledColWidth = computed(() =>
  colW(t('scheduledJob.fields.enabled'), { interactive: true, contentMin: 88 }),
)

const {
  filters,
  setFilter,
  setSort,
  setDateRange,
  dateRangeOf,
  dateRanges,
  sortOrderOf,
  activeConditionCount,
  clearAll,
  apply: applySortFilter,
  sortKey,
  sortOrder,
  uniqueOptions,
} = useTableSortFilter<ScheduledJobRecord>()

const enabledFilterOptions = computed(() => [
  { value: 'true', label: t('scheduledJob.status.on') },
  { value: 'false', label: t('scheduledJob.status.off') },
])

const columnGetters = {
  name: (o: ScheduledJobRecord) => o.name,
  enabled: (o: ScheduledJobRecord) => String(o.enabled),
  runTime: (o: ScheduledJobRecord) => cycleLabel(o),
  handlerLabel: (o: ScheduledJobRecord) => o.handlerLabel || o.handlerKey,
  nextRunAt: (o: ScheduledJobRecord) => o.nextRunAt || '',
}

const nameFilterOptions = computed(() => uniqueOptions(list.value, (o) => o.name))
const runTimeFilterOptions = computed(() => uniqueOptions(list.value, (o) => cycleLabel(o)))
const handlerLabelFilterOptions = computed(() =>
  uniqueOptions(list.value, (o) => o.handlerLabel || o.handlerKey),
)

const sorted = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const base = kw
    ? list.value.filter((row) => {
        const hay = [row.name, row.handlerLabel, row.handlerKey, row.runTime, row.remark]
          .join(' ')
          .toLowerCase()
        return hay.includes(kw)
      })
    : list.value
  const applied = applySortFilter(base, columnGetters)
  if (!sortKey.value) {
    return [...applied].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-Hant'),
    )
  }
  return applied
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(sorted)

watch([filters, dateRanges, sortKey, sortOrder, keyword], () => resetPage(), { deep: true })

const dialogWidth = computed(() => (isMobile.value ? '96%' : '640px'))
const logsDialogWidth = computed(() => (isMobile.value ? '96%' : '720px'))

/** 年历仅取月日；用固定年份驱动 date-picker */
const yearlyPickerValue = computed({
  get: () => `2000-${form.yearlyMmDd}`,
  set: (v: string | null) => {
    const m = String(v || '').match(/(\d{2})-(\d{2})$/)
    form.yearlyMmDd = m ? `${m[1]}-${m[2]}` : '01-01'
  },
})

function applyConfigToForm(cfg: ScheduledJobRecurrenceConfig) {
  form.weekdays = [...(cfg.weekdays || [])]
  form.monthDays = [...(cfg.days || [])]
  form.weekOrdinal = Number(cfg.week ?? 1)
  form.monthWeekday = Number(cfg.weekday ?? 1)
  form.yearlyMmDd = yearlyToMmDd(cfg)
}

function currentFormConfig(): ScheduledJobRecurrenceConfig {
  switch (form.recurrence) {
    case 'weekly':
      return { weekdays: [...form.weekdays] }
    case 'monthly_days':
      return { days: [...form.monthDays] }
    case 'monthly_weekday':
      return { week: form.weekOrdinal, weekday: form.monthWeekday }
    case 'yearly':
      return mmDdToYearly(form.yearlyMmDd)
    default:
      return {}
  }
}

function onRecurrenceChange(next: ScheduledJobRecurrence | string) {
  const key = (next || 'daily') as ScheduledJobRecurrence
  form.recurrence = key
  applyConfigToForm(defaultRecurrenceConfig(key))
}

async function loadList() {
  loading.value = true
  try {
    const { data } = await fetchScheduledJobs()
    list.value = data
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadList()
})

async function toggleEnabled(row: ScheduledJobRecord) {
  if (!perms.update || togglingIds.value.has(row.id)) return
  const next = !row.enabled
  togglingIds.value = new Set(togglingIds.value).add(row.id)
  try {
    await updateScheduledJobApi(row.id, { enabled: next })
    row.enabled = next
    ElMessage.success(next ? t('scheduledJob.enabledOn') : t('scheduledJob.enabledOff'))
    await loadList()
  } catch {
    /* interceptor */
  } finally {
    const s = new Set(togglingIds.value)
    s.delete(row.id)
    togglingIds.value = s
  }
}

async function onRun(row: ScheduledJobRecord) {
  if (!perms.update || runningIds.value.has(row.id)) return
  runningIds.value = new Set(runningIds.value).add(row.id)
  try {
    await runScheduledJobApi(row.id)
    ElMessage.success(t('scheduledJob.runDone'))
    await loadList()
  } catch {
    /* interceptor */
  } finally {
    const s = new Set(runningIds.value)
    s.delete(row.id)
    runningIds.value = s
  }
}

function openEdit(row: ScheduledJobRecord) {
  editing.value = row
  form.name = row.name
  form.handlerLabel = row.handlerLabel || row.handlerKey
  form.handlerDescription = row.handlerDescription || ''
  form.runTime = row.runTime || '01:00'
  const recurrence = (row.recurrence as ScheduledJobRecurrence) || 'daily'
  form.recurrence = recurrence
  const parsed = parseRecurrenceConfig(row.recurrenceConfig)
  const merged = { ...defaultRecurrenceConfig(recurrence), ...parsed }
  applyConfigToForm(merged)
  formVisible.value = true
}

async function saveForm() {
  if (!editing.value) return
  if (!form.name.trim()) {
    ElMessage.warning(t('scheduledJob.nameRequired'))
    return
  }
  if (!/^\d{1,2}:\d{2}$/.test(form.runTime.trim())) {
    ElMessage.warning(t('scheduledJob.runTimeRequired'))
    return
  }
  const cfg = currentFormConfig()
  const invalid = validateRecurrenceConfig(form.recurrence, cfg)
  if (invalid === 'weekly') {
    ElMessage.warning(t('scheduledJob.weeklyRequired'))
    return
  }
  if (invalid === 'monthly_days') {
    ElMessage.warning(t('scheduledJob.monthDaysRequired'))
    return
  }
  if (invalid === 'yearly') {
    ElMessage.warning(t('scheduledJob.yearlyRequired'))
    return
  }
  try {
    await updateScheduledJobApi(editing.value.id, {
      name: form.name.trim(),
      runTime: form.runTime.trim(),
      recurrence: form.recurrence,
      recurrenceConfig: serializeRecurrenceConfig(form.recurrence, cfg),
    })
    ElMessage.success(t('scheduledJob.updated'))
    formVisible.value = false
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function openLogs(row: ScheduledJobRecord) {
  logsJobName.value = row.name
  logsVisible.value = true
  logsLoading.value = true
  logs.value = []
  try {
    const { data } = await fetchScheduledJobLogs(row.id, 50)
    logs.value = data
  } catch {
    /* interceptor */
  } finally {
    logsLoading.value = false
  }
}

function logStatusLabel(status: string) {
  const key = `scheduledJob.logStatus.${status}`
  const translated = t(key)
  return translated === key ? status : translated
}

function triggerLabel(trigger: string) {
  if (trigger === 'manual') return t('scheduledJob.trigger.manual')
  if (trigger === 'auto') return t('scheduledJob.trigger.auto')
  return trigger
}
</script>

<template>
  <div class="admin-page scheduled-jobs-page">
    <div class="admin-page-head">
      <div class="head-title-block">
        <h2>{{ t('menu.scheduledJobs') }}</h2>
        <p class="head-subtitle">{{ t('scheduledJob.subtitle') }}</p>
      </div>
      <div class="head-actions">
        <ClearTableFiltersButton :count="activeConditionCount" @clear="clearAll" />
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('scheduledJob.searchPlaceholder')"
        />
      </div>
    </div>

    <div class="table-card" v-loading="loading">
      <div class="table-scroll">
        <el-table
          :key="tableLayoutKey"
          :data="paged"
          row-key="id"
          height="100%"
          stripe
          border
          style="width: 100%"
        >
          <el-table-column
            type="index"
            :index="rowIndex"
            label="#"
            width="52"
            fixed="left"
            align="center"
            header-align="center"
          />
          <el-table-column
            :min-width="nameColWidth"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('scheduledJob.fields.name')"
                filterable
                sortable
                :options="nameFilterOptions"
                :model-value="filters.name || []"
                :sort-order="sortOrderOf('name')"
                @update:model-value="(v) => setFilter('name', v)"
                @update:sort-order="(v) => setSort('name', v)"
              />
            </template>
            <template #default="{ row }">
              <button
                v-if="perms.update"
                type="button"
                class="name-edit-link"
                @click="openEdit(row)"
              >
                <span class="name-edit-link__text">{{ row.name }}</span>
                <el-icon :size="14" class="name-edit-link__icon"><EditPen /></el-icon>
              </button>
              <span v-else class="name-edit-link__text">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :width="enabledColWidth"
            align="center"
            header-align="center"
            class-name="col-switch"
            label-class-name="col-switch"
          >
            <template #header>
              <TableColumnHeader
                :label="t('scheduledJob.fields.enabled')"
                filterable
                :options="enabledFilterOptions"
                :model-value="filters.enabled || []"
                @update:model-value="(v) => setFilter('enabled', v)"
              />
            </template>
            <template #default="{ row }">
              <el-switch
                :model-value="row.enabled"
                :disabled="!perms.update || togglingIds.has(row.id)"
                @change="() => toggleEnabled(row)"
              />
            </template>
          </el-table-column>
          <el-table-column :width="cycleColWidth">
            <template #header>
              <TableColumnHeader
                :label="t('scheduledJob.fields.cycle')"
                filterable
                sortable
                :options="runTimeFilterOptions"
                :model-value="filters.runTime || []"
                :sort-order="sortOrderOf('runTime')"
                @update:model-value="(v) => setFilter('runTime', v)"
                @update:sort-order="(v) => setSort('runTime', v)"
              />
            </template>
            <template #default="{ row }">
              <span class="cycle-chip">
                <el-icon :size="14" class="cycle-chip__icon"><Timer /></el-icon>
                {{ cycleLabel(row) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :min-width="handlerColWidth">
            <template #header>
              <TableColumnHeader
                :label="t('scheduledJob.fields.handler')"
                filterable
                sortable
                :options="handlerLabelFilterOptions"
                :model-value="filters.handlerLabel || []"
                :sort-order="sortOrderOf('handlerLabel')"
                @update:model-value="(v) => setFilter('handlerLabel', v)"
                @update:sort-order="(v) => setSort('handlerLabel', v)"
              />
            </template>
            <template #default="{ row }">
              <el-tooltip
                :content="row.handlerDescription || row.handlerLabel || row.handlerKey"
                placement="top"
                :disabled="!row.handlerDescription"
                :show-after="350"
              >
                <div class="handler-cell">
                  <div class="handler-cell__title">{{ row.handlerLabel || row.handlerKey }}</div>
                  <div v-if="row.handlerDescription" class="handler-cell__desc">
                    {{ row.handlerDescription }}
                  </div>
                </div>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column
            :width="datetimeColWidth"
            class-name="col-datetime"
            label-class-name="col-datetime"
          >
            <template #header>
              <TableColumnHeader
                :label="t('scheduledJob.fields.nextRunAt')"
                sortable
                date-range
                :model-value="filters.nextRunAt || []"
                :sort-order="sortOrderOf('nextRunAt')"
                :date-range-value="dateRangeOf('nextRunAt')"
                @update:sort-order="(v) => setSort('nextRunAt', v)"
                @update:model-value="(v) => setFilter('nextRunAt', v)"
                @update:date-range-value="(v) => setDateRange('nextRunAt', v)"
              />
            </template>
            <template #default="{ row }">
              {{ row.nextRunAtDisplay || formatDateTime(row.nextRunAt) || '—' }}
            </template>
          </el-table-column>
          <el-table-column
            :width="logsColWidth"
            align="center"
            header-align="center"
          >
            <template #header>
              <TableColumnHeader :label="t('scheduledJob.fields.logs')" />
            </template>
            <template #default="{ row }">
              <button type="button" class="log-link" @click="openLogs(row)">
                {{ t('scheduledJob.viewLogs') }}
              </button>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('common.actions')"
            :width="actionColWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills">
                <button
                  v-if="perms.update"
                  v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--info"
                  :disabled="runningIds.has(row.id)"
                  @click="onRun(row)"
                >
                  {{ t('scheduledJob.run') }}
                </button>
                <button
                  v-if="perms.update"
                  v-admin-glow="perms.codes.update"
                  type="button"
                  class="action-pill action-pill--edit"
                  @click="openEdit(row)"
                >
                  {{ t('common.edit') }}
                </button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="table-pagination">
        <TablePagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="pageSizes"
        />
      </div>
    </div>

    <el-dialog
      v-model="formVisible"
      :title="t('scheduledJob.edit')"
      :width="dialogWidth"
      class="scheduled-job-dialog"
      destroy-on-close
    >
      <el-form label-position="top" class="scheduled-job-form" @submit.prevent>
        <div class="job-form-grid">
          <el-form-item :label="t('scheduledJob.fields.name')" required class="job-form-grid__full">
            <el-input v-model="form.name" maxlength="120" show-word-limit />
          </el-form-item>

          <el-form-item :label="t('scheduledJob.fields.handler')" class="job-form-grid__full">
            <div class="handler-readonly" aria-readonly="true">
              <div class="handler-readonly__icon" aria-hidden="true">
                <el-icon :size="18"><Timer /></el-icon>
              </div>
              <div class="handler-readonly__body">
                <div class="handler-readonly__title">{{ form.handlerLabel }}</div>
                <div v-if="form.handlerDescription" class="handler-readonly__desc">
                  {{ form.handlerDescription }}
                </div>
              </div>
            </div>
          </el-form-item>

          <el-form-item :label="t('scheduledJob.fields.runTime')" required class="job-form-grid__full">
            <el-time-picker
              v-model="form.runTime"
              format="HH:mm"
              value-format="HH:mm"
              :prefix-icon="Clock"
              :clearable="false"
              class="job-time-picker"
              style="width: 100%"
            />
          </el-form-item>
        </div>

        <section
          v-if="editing?.scheduleKind !== 'once'"
          class="recurrence-card"
        >
          <header class="recurrence-card__head">
            <span class="recurrence-card__title">
              {{ t('scheduledJob.fields.recurrence') }}
              <el-tooltip :content="t('scheduledJob.recurrenceHint')" placement="top">
                <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </header>

          <el-radio-group
            :model-value="form.recurrence"
            class="recurrence-tabs"
            @change="onRecurrenceChange"
          >
            <el-radio-button
              v-for="key in RECURRENCE_OPTIONS"
              :key="key"
              :value="key"
            >
              {{ t(`scheduledJob.recurrence.${key}`) }}
            </el-radio-button>
          </el-radio-group>

          <div v-if="form.recurrence === 'daily'" class="recurrence-panel recurrence-panel--empty">
            <span class="recurrence-empty">{{ t('scheduledJob.dailyHint') }}</span>
          </div>

          <div v-else-if="form.recurrence === 'weekly'" class="recurrence-panel">
            <el-checkbox-group v-model="form.weekdays" class="weekday-checks">
              <el-checkbox
                v-for="d in WEEKDAY_VALUES"
                :key="d"
                :value="d"
                class="weekday-chip"
                border
              >
                {{ weekdayLabel(d) }}
              </el-checkbox>
            </el-checkbox-group>
          </div>

          <div v-else-if="form.recurrence === 'monthly_days'" class="recurrence-panel">
            <div class="recurrence-panel__label">{{ t('scheduledJob.selectDate') }}</div>
            <el-select
              v-model="form.monthDays"
              multiple
              filterable
              collapse-tags
              collapse-tags-tooltip
              :max-collapse-tags="6"
              :placeholder="t('common.pleaseSelect')"
              style="width: 100%"
            >
              <el-option
                v-for="d in MONTH_DAY_VALUES"
                :key="d"
                :label="String(d)"
                :value="d"
              />
            </el-select>
          </div>

          <div
            v-else-if="form.recurrence === 'monthly_weekday'"
            class="recurrence-panel recurrence-panel--row"
          >
            <el-select v-model="form.weekOrdinal" class="recurrence-select">
              <el-option
                v-for="w in WEEK_ORDINAL_VALUES"
                :key="w"
                :label="weekOrdinalLabel(w)"
                :value="w"
              />
            </el-select>
            <el-select v-model="form.monthWeekday" class="recurrence-select">
              <el-option
                v-for="d in WEEKDAY_VALUES"
                :key="d"
                :label="weekdayLabel(d)"
                :value="d"
              />
            </el-select>
          </div>

          <div v-else-if="form.recurrence === 'yearly'" class="recurrence-panel">
            <el-date-picker
              v-model="yearlyPickerValue"
              type="date"
              format="MM-DD"
              value-format="YYYY-MM-DD"
              :placeholder="t('common.pleaseSelect')"
              style="width: 100%"
            />
          </div>

        </section>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="formVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" class="lb-btn-primary" @click="saveForm">
            {{ t('common.confirm') }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog
      v-model="logsVisible"
      :title="t('scheduledJob.logsTitle', { name: logsJobName })"
      :width="logsDialogWidth"
      destroy-on-close
    >
      <div v-loading="logsLoading" class="logs-table-wrap">
        <el-table :data="logs" stripe border height="360" style="width: 100%">
          <el-table-column
            :label="t('scheduledJob.logFields.startedAt')"
            :width="datetimeColWidth"
            class-name="col-datetime"
            label-class-name="col-datetime"
          >
            <template #default="{ row }">
              {{ row.startedAtDisplay || formatDateTime(row.startedAt) }}
            </template>
          </el-table-column>
          <el-table-column
            :label="t('scheduledJob.logFields.trigger')"
            :min-width="colW(t('scheduledJob.logFields.trigger'), { contentMin: 80 })"
          >
            <template #default="{ row }">{{ triggerLabel(row.trigger) }}</template>
          </el-table-column>
          <el-table-column
            :label="t('scheduledJob.logFields.status')"
            :min-width="
              statusColW(t('scheduledJob.logFields.status'), [
                t('scheduledJob.logStatus.success'),
                t('scheduledJob.logStatus.failed'),
                t('scheduledJob.logStatus.running'),
              ])
            "
          >
            <template #default="{ row }">
              <el-tag size="small" effect="light" round :type="lastRunTone(row.status)">
                {{ logStatusLabel(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('scheduledJob.logFields.message')"
            :min-width="textColW(t('scheduledJob.logFields.message'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.message || '—' }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!logsLoading && !logs.length" :description="t('scheduledJob.noLogs')" />
      </div>
      <template #footer>
        <el-button @click="logsVisible = false">{{ t('common.close') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.head-title-block {
  min-width: 0;
}

.head-subtitle {
  margin: 4px 0 0;
  max-width: 42rem;
  font-size: 13px;
  line-height: 1.45;
  color: var(--el-text-color-secondary);
  font-weight: 400;
}

.name-edit-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.name-edit-link__text {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.name-edit-link:hover .name-edit-link__text {
  color: var(--el-color-primary);
}

.name-edit-link__icon {
  flex-shrink: 0;
  opacity: 0.45;
  color: var(--el-color-primary);
}

.name-edit-link:hover .name-edit-link__icon {
  opacity: 1;
}

.cycle-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--el-color-primary) 8%, #fff);
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 18%, transparent);
  color: var(--el-color-primary);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
}

.cycle-chip__icon {
  flex-shrink: 0;
  opacity: 0.85;
}

.handler-cell__title {
  font-weight: 550;
  color: var(--el-text-color-primary);
  line-height: 1.35;
}

.handler-cell__desc {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  cursor: default;
}

.log-link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--el-color-primary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.log-link:hover {
  text-decoration: underline;
}

.scheduled-job-form {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.job-form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px 16px;
}

.job-form-grid__full {
  grid-column: 1 / -1;
}

.job-form-grid :deep(.el-form-item) {
  margin-bottom: 14px;
}

.handler-readonly {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid #e3ebe7;
  border-radius: 12px;
  background: linear-gradient(180deg, #f8fbf9 0%, #f3f7f5 100%);
}

.handler-readonly__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: 10px;
  background: color-mix(in srgb, var(--el-color-primary) 12%, #fff);
  color: var(--el-color-primary);
}

.handler-readonly__body {
  min-width: 0;
  flex: 1;
}

.handler-readonly__title {
  font-weight: 650;
  font-size: 14px;
  color: var(--el-text-color-primary);
  line-height: 1.35;
}

.handler-readonly__desc {
  margin-top: 6px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.job-time-picker {
  width: 100%;
}

.recurrence-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  border: 1px solid #e3ebe7;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 1px 2px rgb(15 23 42 / 3%);
}

.recurrence-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.recurrence-card__title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 650;
  color: var(--el-text-color-primary);
  letter-spacing: 0.01em;
}

.form-label-tip {
  color: var(--lb-muted, #6a7a70);
  cursor: help;
  vertical-align: middle;
  flex-shrink: 0;
}

.recurrence-tabs {
  display: flex;
  flex-wrap: wrap;
  width: 100%;
  gap: 0;
}

.recurrence-tabs :deep(.el-radio-button) {
  --el-radio-button-checked-bg-color: var(--el-color-primary);
  --el-radio-button-checked-text-color: #fff;
  --el-radio-button-checked-border-color: var(--el-color-primary);
}

.recurrence-tabs :deep(.el-radio-button__inner) {
  padding: 9px 12px;
  font-weight: 550;
  border-color: #d7e2dc !important;
  box-shadow: none !important;
}

.recurrence-tabs :deep(.el-radio-button:first-child .el-radio-button__inner) {
  border-radius: 8px 0 0 8px;
}

.recurrence-tabs :deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-radius: 0 8px 8px 0;
}

.recurrence-tabs :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: var(--el-color-primary);
  border-color: var(--el-color-primary) !important;
  color: #fff;
  font-weight: 650;
}

.recurrence-panel {
  width: 100%;
  padding: 12px 12px 10px;
  border-radius: 10px;
  background: #f6f9f7;
  border: 1px solid #e8f0ec;
}

.recurrence-panel--empty {
  padding: 14px 12px;
}

.recurrence-panel--row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.recurrence-panel__label {
  margin-bottom: 8px;
  font-size: 12.5px;
  font-weight: 550;
  color: var(--el-text-color-regular);
}

.recurrence-empty {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  line-height: 1.45;
}

.recurrence-select {
  width: min(160px, 100%);
}

.weekday-checks {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  width: 100%;
}

.weekday-chip {
  margin: 0 !important;
  height: auto !important;
  flex: 1 1 0;
  min-width: 0;
  justify-content: center;
}

.weekday-chip :deep(.el-checkbox__label) {
  padding-left: 4px;
  font-weight: 550;
  font-size: 12.5px;
  line-height: 1.2;
}

.weekday-chip :deep(.el-checkbox__inner) {
  border-radius: 4px;
  width: 14px;
  height: 14px;
}

.weekday-chip :deep(.el-checkbox__inner::after) {
  width: 3px;
  height: 7px;
  left: 4px;
}

.weekday-chip.is-bordered {
  padding: 6px 4px;
  border-radius: 8px;
  border-color: #d7e2dc;
  background: #fff;
  display: inline-flex;
  justify-content: center;
}

.weekday-chip.is-bordered.is-checked {
  border-color: color-mix(in srgb, var(--el-color-primary) 45%, #d7e2dc);
  background: color-mix(in srgb, var(--el-color-primary) 8%, #fff);
}

@media (max-width: 560px) {
  .weekday-checks {
    flex-wrap: wrap;
  }

  .weekday-chip {
    flex: 1 1 calc(25% - 6px);
  }
}

.logs-table-wrap {
  min-height: 200px;
}

.action-pills {
  display: inline-flex;
  flex-wrap: nowrap;
  gap: 6px;
  justify-content: center;
  align-items: center;
  white-space: nowrap;
}

.action-pill:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
