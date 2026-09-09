<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createRoomConfigApi,
  deleteRoomConfigApi,
  fetchRoomConfigs,
  updateRoomConfigApi,
} from '@/api/room-configs'
import type { RoomConfigOption, RoomConfigType } from '@/types/room-config'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import SizeIcon from '@/components/icons/SizeIcon.vue'
import WindowIcon from '@/components/icons/WindowIcon.vue'
import AcIcon from '@/components/icons/AcIcon.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'

const { t } = useI18n()
const isMobile = useIsMobile()

const activeTab = ref<RoomConfigType>('size')
const loading = ref(false)
const formVisible = ref(false)
const editing = ref<RoomConfigOption | null>(null)
const list = ref<RoomConfigOption[]>([])

const tabMeta = [
  { type: 'size' as const, icon: SizeIcon },
  { type: 'window' as const, icon: WindowIcon },
  { type: 'ac' as const, icon: AcIcon },
]

const {
  filters,
  setFilter,
  setSort,
  sortOrderOf,
  apply: applySortFilter,
  sortKey,
  sortOrder,
} = useTableSortFilter<RoomConfigOption>()

const columnGetters = {
  label: (o: RoomConfigOption) => o.label,
  sortOrder: (o: RoomConfigOption) => o.sortOrder,
  active: (o: RoomConfigOption) => String(o.active),
  brand: (o: RoomConfigOption) => o.brand,
  minSqft: (o: RoomConfigOption) => o.minSqft ?? -Infinity,
}

const activeFilterOptions = computed(() => [
  { value: 'true', label: t('user.status.active') },
  { value: 'false', label: t('user.status.disabled') },
])

const tabCounts = computed(() => {
  const counts: Record<RoomConfigType, number> = { size: 0, window: 0, ac: 0 }
  for (const o of list.value) counts[o.type] += 1
  return counts
})

const filtered = computed(() => {
  const base = list.value.filter((o) => o.type === activeTab.value)
  const applied = applySortFilter(base, columnGetters)
  if (!sortKey.value) {
    return [...applied].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
  }
  return applied
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)

watch([activeTab, filters, sortKey, sortOrder], () => resetPage(), { deep: true })

const dialogWidth = computed(() => (isMobile.value ? '94%' : '520px'))

const form = reactive({
  label: '',
  minSqft: undefined as number | undefined,
  maxSqft: undefined as number | undefined,
  brand: '',
  model: '',
  sortOrder: 0,
  active: true,
})

async function loadList() {
  loading.value = true
  try {
    const { data } = await fetchRoomConfigs({ activeOnly: false })
    list.value = data
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadList()
})

watch(activeTab, () => {
  formVisible.value = false
  resetPage()
})

function openCreate() {
  editing.value = null
  Object.assign(form, {
    label: '',
    minSqft: undefined,
    maxSqft: undefined,
    brand: '',
    model: '',
    sortOrder: (filtered.value.at(-1)?.sortOrder ?? 0) + 1,
    active: true,
  })
  formVisible.value = true
}

function openEdit(row: RoomConfigOption) {
  editing.value = row
  Object.assign(form, {
    label: row.label,
    minSqft: row.minSqft ?? undefined,
    maxSqft: row.maxSqft ?? undefined,
    brand: row.brand || '',
    model: row.model || '',
    sortOrder: row.sortOrder,
    active: row.active,
  })
  formVisible.value = true
}

function rangeText(row: RoomConfigOption) {
  if (row.type !== 'size') return '—'
  const min = row.minSqft
  const max = row.maxSqft
  if (min != null && max != null) return `${min} – ${max}`
  if (min != null) return `≥ ${min}`
  if (max != null) return `< ${max}`
  return '—'
}

async function saveForm() {
  if (activeTab.value !== 'size' && !form.label.trim()) {
    ElMessage.warning(t('roomConfig.labelRequired'))
    return
  }
  if (activeTab.value === 'size' && form.minSqft == null && form.maxSqft == null && !form.label.trim()) {
    ElMessage.warning(t('roomConfig.sizeRequired'))
    return
  }

  try {
    const payload = {
      label: form.label.trim() || undefined,
      minSqft: activeTab.value === 'size' ? (form.minSqft ?? null) : null,
      maxSqft: activeTab.value === 'size' ? (form.maxSqft ?? null) : null,
      brand: form.brand.trim(),
      model: form.model.trim(),
      sortOrder: form.sortOrder,
      active: form.active,
    }
    if (editing.value) {
      await updateRoomConfigApi(editing.value.id, payload)
      ElMessage.success(t('roomConfig.updated'))
    } else {
      await createRoomConfigApi({ type: activeTab.value, ...payload })
      ElMessage.success(t('roomConfig.created'))
    }
    formVisible.value = false
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: RoomConfigOption) {
  try {
    await ElMessageBox.confirm(t('roomConfig.deleteConfirm', { label: row.label }), t('common.confirm'), {
      type: 'warning',
    })
    await deleteRoomConfigApi(row.id)
    ElMessage.success(t('roomConfig.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function toggleActive(row: RoomConfigOption) {
  try {
    await updateRoomConfigApi(row.id, { active: !row.active })
    await loadList()
  } catch {
    /* interceptor */
  }
}
</script>

<template>
  <div class="admin-page room-config-page">
    <div class="admin-page-head admin-page-head--with-config-tabs">
      <h2>{{ t('menu.roomConfigs') }}</h2>
      <div class="config-type-tabs" role="tablist" :aria-label="t('menu.roomConfigs')">
        <button
          v-for="tab in tabMeta"
          :key="tab.type"
          type="button"
          role="tab"
          class="config-type-tab"
          :class="{ 'is-active': activeTab === tab.type }"
          :aria-selected="activeTab === tab.type"
          @click="activeTab = tab.type"
        >
          <el-icon :size="14" class="config-type-tab__icon" aria-hidden="true">
            <component :is="tab.icon" />
          </el-icon>
          <span>{{ t(`roomConfig.types.${tab.type}`) }}</span>
          <span class="config-type-tab__count">({{ tabCounts[tab.type] }})</span>
        </button>
      </div>
      <div class="head-actions">
        <el-button type="primary" :icon="Plus" class="lb-btn-primary" @click="openCreate">
          {{ t(`roomConfig.createFor.${activeTab}`) }}
        </el-button>
      </div>
    </div>

    <div class="table-card" v-loading="loading">
      <div class="table-scroll">
        <el-table :data="paged" height="100%" stripe border empty-text="—" style="width: 100%">
          <el-table-column type="index" :index="rowIndex" label="#" width="52" fixed="left" align="center" header-align="center" />
          <el-table-column prop="label" min-width="200">
            <template #header>
              <TableColumnHeader
                :label="t('roomConfig.fields.label')"
                sortable
                :sort-order="sortOrderOf('label')"
                @update:sort-order="(v) => setSort('label', v)"
              />
            </template>
            <template #default="{ row }">
              <div class="config-label-cell">
                <span class="config-label-cell__text">{{ row.label || '—' }}</span>
                <span v-if="!row.active" class="config-label-cell__off">{{ t('user.status.disabled') }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column v-if="activeTab === 'size'" min-width="160">
            <template #header>
              <TableColumnHeader
                :label="t('roomConfig.fields.range')"
                sortable
                :sort-order="sortOrderOf('minSqft')"
                @update:sort-order="(v) => setSort('minSqft', v)"
              />
            </template>
            <template #default="{ row }">
              <span class="config-range-pill">{{ rangeText(row) }}</span>
            </template>
          </el-table-column>
          <el-table-column
            v-if="activeTab === 'ac'"
            prop="brand"
            :label="t('roomConfig.fields.brand')"
            min-width="120"
          >
            <template #default="{ row }">
              <span class="config-muted">{{ row.brand || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            v-if="activeTab === 'ac'"
            prop="model"
            :label="t('roomConfig.fields.model')"
            min-width="120"
          >
            <template #default="{ row }">
              <span class="config-muted">{{ row.model || '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="sortOrder" width="120" align="center" header-align="center">
            <template #header>
              <TableColumnHeader
                :label="t('roomConfig.fields.sortOrder')"
                sortable
                :sort-order="sortOrderOf('sortOrder')"
                @update:sort-order="(v) => setSort('sortOrder', v)"
              />
            </template>
            <template #default="{ row }">
              <span class="config-sort-num">{{ row.sortOrder }}</span>
            </template>
          </el-table-column>
          <el-table-column width="128">
            <template #header>
              <TableColumnHeader
                :label="t('roomConfig.fields.active')"
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
          <el-table-column prop="createdBy" :label="t('common.createdBy')" min-width="100" show-overflow-tooltip />
          <el-table-column
            prop="createdAt"
            :label="t('common.createdAt')"
            width="160"
            class-name="col-datetime"
            label-class-name="col-datetime"
          />
          <el-table-column prop="updatedBy" :label="t('common.updatedBy')" min-width="100" show-overflow-tooltip />
          <el-table-column
            prop="updatedAt"
            :label="t('common.updatedAt')"
            width="160"
            class-name="col-datetime"
            label-class-name="col-datetime"
          />
          <el-table-column :label="t('common.actions')" width="150" fixed="right">
            <template #default="{ row }">
              <div class="action-pills">
                <button type="button" class="action-pill action-pill--edit" @click="openEdit(row)">
                  {{ t('common.edit') }}
                </button>
                <button type="button" class="action-pill action-pill--danger" @click="onDelete(row)">
                  {{ t('common.delete') }}
                </button>
              </div>
            </template>
          </el-table-column>
          <template #empty>
            <div class="config-empty">{{ t('roomConfig.empty') }}</div>
          </template>
        </el-table>
      </div>
      <div class="table-pagination">
        <TablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" :page-sizes="pageSizes" />
      </div>
    </div>

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('roomConfig.edit') : t(`roomConfig.createFor.${activeTab}`)"
      :width="dialogWidth"
      destroy-on-close
      class="lb-dialog room-config-dialog"
    >
      <el-form label-position="top" class="room-config-form">
        <template v-if="activeTab === 'size'">
          <div class="form-grid form-grid--2">
            <el-form-item :label="t('roomConfig.fields.minSqft')">
              <el-input-number
                v-model="form.minSqft"
                :min="0"
                :precision="0"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
            <el-form-item :label="t('roomConfig.fields.maxSqft')">
              <el-input-number
                v-model="form.maxSqft"
                :min="0"
                :precision="0"
                controls-position="right"
                style="width: 100%"
              />
            </el-form-item>
          </div>
          <el-form-item :label="t('roomConfig.fields.labelOptional')">
            <el-input v-model="form.label" :placeholder="t('roomConfig.labelAuto')" />
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item :label="t('roomConfig.fields.label')" required>
            <el-input v-model="form.label" />
          </el-form-item>
        </template>
        <template v-if="activeTab === 'ac'">
          <div class="form-grid form-grid--2">
            <el-form-item :label="t('roomConfig.fields.brand')">
              <el-input v-model="form.brand" />
            </el-form-item>
            <el-form-item :label="t('roomConfig.fields.model')">
              <el-input v-model="form.model" />
            </el-form-item>
          </div>
        </template>
        <div class="form-grid form-grid--2">
          <el-form-item :label="t('roomConfig.fields.sortOrder')">
            <el-input-number v-model="form.sortOrder" :min="0" controls-position="right" style="width: 100%" />
          </el-form-item>
          <el-form-item :label="t('roomConfig.fields.active')">
            <el-switch v-model="form.active" />
          </el-form-item>
        </div>
        <AuditDetailSection
          v-if="editing"
          :created-by="editing.createdBy"
          :created-at="editing.createdAt"
          :updated-by="editing.updatedBy"
          :updated-at="editing.updatedAt"
        />
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="formVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" class="lb-btn-primary" @click="saveForm">{{ t('common.save') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.admin-page-head--with-config-tabs {
  flex-wrap: nowrap;
  align-items: center;
  gap: 10px 12px;
}

.admin-page-head--with-config-tabs h2 {
  height: 30px;
  line-height: 30px;
  flex: 0 0 auto;
}

.admin-page-head--with-config-tabs .head-actions {
  margin-left: auto;
  flex-shrink: 0;
}

.config-type-tabs {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
}

.config-type-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  height: 30px;
  margin: 0;
  padding: 0 12px;
  border: 1px solid #d7ded9;
  border-radius: 999px;
  background: #fff;
  color: #4a5c54;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  box-sizing: border-box;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.config-type-tab__icon {
  flex: 0 0 auto;
}

.config-type-tab__count {
  color: #7a8a82;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.config-type-tab:hover {
  border-color: #b7cbbf;
}

.config-type-tab.is-active {
  border-color: #0f4a32;
  background: #eef6f1;
  color: #0f4a32;
}

.config-type-tab.is-active .config-type-tab__count {
  color: #3d6b55;
}

.config-label-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
}

.config-label-cell__text {
  font-weight: 650;
  color: #1a2a22;
}

.config-label-cell__off {
  flex: 0 0 auto;
  padding: 1px 7px;
  border-radius: 999px;
  background: #f1f2f1;
  color: #8a9590;
  font-size: 0.72rem;
  font-weight: 650;
}

.config-range-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid #cfe0d6;
  background: transparent;
  color: #0f4a32;
  font-size: 0.82rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.config-muted {
  color: #5b6b63;
}

.config-sort-num {
  display: inline-flex;
  min-width: 1.6em;
  justify-content: center;
  font-variant-numeric: tabular-nums;
  font-weight: 650;
  color: #4a5c54;
}

.config-empty {
  padding: 28px 12px;
  color: #7a8a82;
  font-size: 0.88rem;
}

.form-grid--2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
}

@media (max-width: 640px) {
  .admin-page-head--with-config-tabs {
    flex-wrap: wrap;
  }

  .admin-page-head--with-config-tabs .config-type-tabs {
    order: 3;
    flex: 1 1 100%;
  }

  .form-grid--2 {
    grid-template-columns: 1fr;
  }
}
</style>
