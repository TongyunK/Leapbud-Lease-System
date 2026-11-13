<script setup lang="ts">
import { useResourcePermissions } from '@/composables/useResourcePermissions'
const perms = useResourcePermissions('numberingRules')
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EditPen, QuestionFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  fetchNumberingRules,
  resetNumberingRuleApi,
  updateNumberingRuleApi,
} from '@/api/numbering-rules'
import type { NumberingResetCycle, NumberingRule } from '@/types/numbering-rule'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import ClearTableFiltersButton from '@/components/ClearTableFiltersButton.vue'
import { measureActionColWidth } from '@/composables/useActionColWidth'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { renderNumberingFormat } from '@/utils/numberingFormat'

const RESET_CYCLES: NumberingResetCycle[] = ['none', 'daily', 'monthly', 'yearly']

const { t, locale } = useI18n()
const isMobile = useIsMobile()
const { colW, codeColW, textColW, datetimeColWidth, auditUserColWidth, tableLayoutKey } =
  useTableColWidth()

const actionColWidth = computed(() => {
  void locale.value
  return measureActionColWidth([t('autoNumbering.edit'), t('autoNumbering.reset')])
})

const loading = ref(false)
const formVisible = ref(false)
const editing = ref<NumberingRule | null>(null)
const list = ref<NumberingRule[]>([])

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
} = useTableSortFilter<NumberingRule>()

function displayName(row: NumberingRule) {
  if (row.bizKey) return t(`autoNumbering.bizKey.${row.bizKey}`)
  return row.name
}

const columnGetters = {
  name: (o: NumberingRule) => displayName(o),
  format: (o: NumberingRule) => o.format,
  preview: (o: NumberingRule) => o.preview,
  startValue: (o: NumberingRule) => o.startValue,
  currentSeq: (o: NumberingRule) => o.currentSeq,
  resetCycle: (o: NumberingRule) => o.resetCycle,
  active: (o: NumberingRule) => String(o.active),
  updatedBy: (o: NumberingRule) => o.updatedBy,
  updatedAt: (o: NumberingRule) => o.updatedAt,
}

const nameFilterOptions = computed(() => uniqueOptions(list.value, (o) => displayName(o)))
const formatFilterOptions = computed(() => uniqueOptions(list.value, (o) => o.format))
const previewFilterOptions = computed(() => uniqueOptions(list.value, (o) => o.preview))
const startValueFilterOptions = computed(() => uniqueOptions(list.value, (o) => o.startValue))
const currentSeqFilterOptions = computed(() => uniqueOptions(list.value, (o) => o.currentSeq))
const activeFilterOptions = computed(() => [
  { value: 'true', label: t('user.status.active') },
  { value: 'false', label: t('user.status.disabled') },
])

const resetCycleFilterOptions = computed(() =>
  RESET_CYCLES.map((k) => ({ value: k, label: t(`autoNumbering.resetCycle.${k}`) })),
)
const updatedByFilterOptions = computed(() => uniqueOptions(list.value, (r) => r.updatedBy))

const sorted = computed(() => {
  const applied = applySortFilter(list.value, columnGetters)
  if (!sortKey.value) {
    return [...applied].sort(
      (a, b) => a.sortOrder - b.sortOrder || displayName(a).localeCompare(displayName(b)),
    )
  }
  return applied
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(sorted)

watch([filters, dateRanges, sortKey, sortOrder], () => resetPage(), { deep: true })

const dialogWidth = computed(() => (isMobile.value ? '94%' : '520px'))

const form = reactive({
  format: '',
  startValue: 1,
  currentSeq: 0,
  resetCycle: 'none' as NumberingResetCycle,
  active: true,
})

/** 编辑弹窗：按当前格式 / 当前值实时预览下一编号 */
const livePreview = computed(() => {
  const format = form.format.trim()
  if (!format) return '—'
  const nextSeq = Math.max(Number(form.currentSeq) + 1, Number(form.startValue) || 0)
  if (!Number.isFinite(nextSeq) || nextSeq < 0) return '—'
  try {
    return renderNumberingFormat(format, new Date(), nextSeq) || '—'
  } catch {
    return '—'
  }
})

async function loadList() {
  loading.value = true
  try {
    const { data } = await fetchNumberingRules({ activeOnly: false })
    // 仅展示已绑定业务的系统规则
    list.value = data.filter((r) => !!r.bizKey)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadList()
})

function openEdit(row: NumberingRule) {
  editing.value = row
  Object.assign(form, {
    format: row.format,
    startValue: row.startValue,
    currentSeq: row.currentSeq,
    resetCycle: row.resetCycle,
    active: row.active,
  })
  formVisible.value = true
}

async function saveForm() {
  if (!editing.value) return
  if (!form.format.trim()) {
    ElMessage.warning(t('autoNumbering.formatRequired'))
    return
  }
  if (!/%0?\d*d/.test(form.format)) {
    ElMessage.warning(t('autoNumbering.formatSeqRequired'))
    return
  }
  try {
    await updateNumberingRuleApi(editing.value.id, {
      format: form.format.trim(),
      startValue: form.startValue,
      currentSeq: form.currentSeq,
      resetCycle: form.resetCycle,
      active: form.active,
    })
    ElMessage.success(t('autoNumbering.updated'))
    formVisible.value = false
    await loadList()
    resetPage()
  } catch {
    /* interceptor */
  }
}

async function onReset(row: NumberingRule) {
  try {
    await ElMessageBox.confirm(
      t('autoNumbering.resetConfirm', { name: displayName(row) }),
      t('autoNumbering.reset'),
      { type: 'warning' },
    )
    await resetNumberingRuleApi(row.id)
    ElMessage.success(t('autoNumbering.resetDone'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function toggleActive(row: NumberingRule) {
  try {
    await updateNumberingRuleApi(row.id, { active: !row.active })
    await loadList()
  } catch {
    /* interceptor */
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.autoNumbering') }}</h2>
      <div class="head-actions">
        <ClearTableFiltersButton :count="activeConditionCount" @clear="clearAll" />
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
            :min-width="textColW(t('autoNumbering.fields.name'), { interactive: true, kind: 'name' })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('autoNumbering.fields.name')"
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
              <button type="button" class="name-edit-link" @click="openEdit(row)">
                <span>{{ displayName(row) }}</span>
                <el-icon :size="14" class="name-edit-link__icon"><EditPen /></el-icon>
              </button>
            </template>
          </el-table-column>
          <el-table-column
            :min-width="codeColW(t('autoNumbering.fields.format'), { interactive: true, samples: list.map((r) => r.format) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('autoNumbering.fields.format')"
                filterable
                sortable
                :options="formatFilterOptions"
                :model-value="filters.format || []"
                :sort-order="sortOrderOf('format')"
                @update:model-value="(v) => setFilter('format', v)"
                @update:sort-order="(v) => setSort('format', v)"
              />
            </template>
            <template #default="{ row }">{{ row.format }}</template>
          </el-table-column>
          <el-table-column
            :min-width="codeColW(t('autoNumbering.fields.preview'), { samples: list.map((r) => r.preview) })"
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #header>
              <TableColumnHeader
                :label="t('autoNumbering.fields.preview')"
                filterable
                sortable
                :options="previewFilterOptions"
                :model-value="filters.preview || []"
                :sort-order="sortOrderOf('preview')"
                @update:model-value="(v) => setFilter('preview', v)"
                @update:sort-order="(v) => setSort('preview', v)"
              />
            </template>
            <template #default="{ row }">{{ row.preview }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('autoNumbering.fields.startValue'), { interactive: true, contentMin: 100 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('autoNumbering.fields.startValue')"
                filterable
                sortable
                :options="startValueFilterOptions"
                :model-value="filters.startValue || []"
                :sort-order="sortOrderOf('startValue')"
                @update:model-value="(v) => setFilter('startValue', v)"
                @update:sort-order="(v) => setSort('startValue', v)"
              />
            </template>
            <template #default="{ row }">{{ row.startValue }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('autoNumbering.fields.currentSeq'), { interactive: true, contentMin: 100 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('autoNumbering.fields.currentSeq')"
                filterable
                sortable
                :options="currentSeqFilterOptions"
                :model-value="filters.currentSeq || []"
                :sort-order="sortOrderOf('currentSeq')"
                @update:model-value="(v) => setFilter('currentSeq', v)"
                @update:sort-order="(v) => setSort('currentSeq', v)"
              />
            </template>
            <template #default="{ row }">{{ row.currentSeq }}</template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('autoNumbering.fields.resetCycle'), { interactive: true, contentMin: 120 })"
          >
            <template #header>
              <TableColumnHeader
                :label="t('autoNumbering.fields.resetCycle')"
                filterable
                :options="resetCycleFilterOptions"
                :model-value="filters.resetCycle || []"
                @update:model-value="(v) => setFilter('resetCycle', v)"
              />
            </template>
            <template #default="{ row }">
              {{ t(`autoNumbering.resetCycle.${row.resetCycle}`) }}
            </template>
          </el-table-column>
          <el-table-column
            :min-width="colW(t('autoNumbering.fields.active'), { interactive: true, contentMin: 100 })"
            align="center"
            header-align="center"
            class-name="col-switch"
            label-class-name="col-switch"
          >
            <template #header>
              <TableColumnHeader
                :label="t('autoNumbering.fields.active')"
                filterable
                :options="activeFilterOptions"
                :model-value="filters.active || []"
                @update:model-value="(v) => setFilter('active', v)"
              />
            </template>
            <template #default="{ row }">
              <el-switch :model-value="row.active" @change="() => toggleActive(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :min-width="auditUserColWidth"
            show-overflow-tooltip
          >
            <template #header>
              <TableColumnHeader
                :label="t('common.updatedBy')"
                filterable
                sortable
                :options="updatedByFilterOptions"
                :model-value="filters.updatedBy || []"
                :sort-order="sortOrderOf('updatedBy')"
                @update:model-value="(v) => setFilter('updatedBy', v)"
                @update:sort-order="(v) => setSort('updatedBy', v)"
              />
            </template>
            <template #default="{ row }">{{ row.updatedBy || '—' }}</template>
          </el-table-column>
          <el-table-column
            prop="updatedAt"
            :width="datetimeColWidth"
            class-name="col-datetime"
            label-class-name="col-datetime"
          >
            <template #header>
              <TableColumnHeader
                :label="t('common.updatedAt')"
                sortable
                date-range
                :model-value="filters.updatedAt || []"
                :sort-order="sortOrderOf('updatedAt')"
                :date-range-value="dateRangeOf('updatedAt')"
                @update:date-range-value="(v) => setDateRange('updatedAt', v)"
                @update:sort-order="(v) => setSort('updatedAt', v)"
                @update:model-value="(v) => setFilter('updatedAt', v)"
              />
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
                <button v-if="perms.update" v-admin-glow="perms.codes.update" type="button" class="action-pill action-pill--edit" @click="openEdit(row)">
                  {{ t('autoNumbering.edit') }}
                </button>
                <button v-if="perms.update" v-admin-glow="perms.codes.update" type="button" class="action-pill action-pill--warn" @click="onReset(row)">
                  {{ t('autoNumbering.reset') }}
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
      :title="t('autoNumbering.edit')"
      :width="dialogWidth"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item :label="t('autoNumbering.fields.name')">
          <el-input :model-value="editing ? displayName(editing) : ''" disabled />
        </el-form-item>
        <el-form-item required>
          <template #label>
            <span class="form-label-with-tip">
              {{ t('autoNumbering.fields.format') }}
              <el-tooltip placement="top">
                <template #content>
                  <div class="form-tip-multiline">{{ t('autoNumbering.formatHint') }}</div>
                </template>
                <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <el-input v-model="form.format" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12">
            <el-form-item :label="t('autoNumbering.fields.startValue')">
              <el-input-number
                v-model="form.startValue"
                :min="0"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :xs="24" :sm="12">
            <el-form-item>
              <template #label>
                <span class="form-label-with-tip">
                  {{ t('autoNumbering.fields.currentSeq') }}
                  <el-tooltip :content="t('autoNumbering.currentSeqHint')" placement="top">
                    <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
                  </el-tooltip>
                </span>
              </template>
              <el-input-number
                v-model="form.currentSeq"
                :min="0"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item>
          <template #label>
            <span class="form-label-with-tip">
              {{ t('autoNumbering.livePreview') }}
              <el-tooltip :content="t('autoNumbering.livePreviewHint')" placement="top">
                <el-icon class="form-label-tip" :size="14"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <div class="live-preview" aria-live="polite">
            <code class="live-preview__code">{{ livePreview }}</code>
          </div>
        </el-form-item>
        <el-form-item :label="t('autoNumbering.fields.resetCycle')">
          <el-select v-model="form.resetCycle" style="width: 100%">
            <el-option
              v-for="c in RESET_CYCLES"
              :key="c"
              :label="t(`autoNumbering.resetCycle.${c}`)"
              :value="c"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('autoNumbering.fields.active')">
          <el-switch v-model="form.active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="formVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" class="lb-btn-primary" @click="saveForm">
            {{ t('common.save') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.name-edit-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.name-edit-link:hover {
  color: var(--el-color-primary);
}
.name-edit-link__icon {
  opacity: 0.55;
}
.name-edit-link:hover .name-edit-link__icon {
  opacity: 1;
}
.form-label-with-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.form-label-tip {
  color: var(--lb-muted, #6a7a70);
  cursor: help;
  vertical-align: middle;
  flex-shrink: 0;
}
.form-tip-multiline {
  white-space: pre-line;
  max-width: 320px;
  line-height: 1.45;
}
.live-preview {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  background: #f6f8f7;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.live-preview__code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 1.05rem;
  font-weight: 600;
  color: #0f4a32;
  word-break: break-all;
  line-height: 1.35;
}
</style>
