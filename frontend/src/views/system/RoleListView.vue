<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createRoleApi,
  deleteRoleApi,
  fetchRoles,
  updateRoleApi,
} from '@/api/roles'
import type { RoleRecord } from '@/types/role'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import { measureActionColWidth } from '@/composables/useActionColWidth'

const { t, locale } = useI18n()
const isMobile = useIsMobile()
const roleActionWidth = computed(() => {
  void locale.value
  return measureActionColWidth([t('common.edit'), t('common.delete')])
})

const loading = ref(false)
const formVisible = ref(false)
const editing = ref<RoleRecord | null>(null)
const list = ref<RoleRecord[]>([])

const {
  filters,
  setFilter,
  setSort,
  sortOrderOf,
  apply: applySortFilter,
  sortKey,
  sortOrder,
} = useTableSortFilter<RoleRecord>()

const columnGetters = {
  code: (o: RoleRecord) => o.code,
  name: (o: RoleRecord) => o.name,
  sortOrder: (o: RoleRecord) => o.sortOrder,
  active: (o: RoleRecord) => String(o.active),
  menuCount: (o: RoleRecord) => o.menuCount,
}

const activeFilterOptions = computed(() => [
  { value: 'true', label: t('user.status.active') },
  { value: 'false', label: t('user.status.disabled') },
])

const sorted = computed(() => {
  const applied = applySortFilter(list.value, columnGetters)
  if (!sortKey.value) {
    return [...applied].sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
  }
  return applied
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(sorted)

watch([filters, sortKey, sortOrder], () => resetPage(), { deep: true })

const dialogWidth = computed(() => (isMobile.value ? '94%' : '520px'))

const form = reactive({
  code: '',
  name: '',
  description: '',
  sortOrder: 0,
  active: true,
})

async function loadList() {
  loading.value = true
  try {
    const { data } = await fetchRoles()
    list.value = data
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadList()
})

function openCreate() {
  editing.value = null
  Object.assign(form, {
    code: '',
    name: '',
    description: '',
    sortOrder: (sorted.value.at(-1)?.sortOrder ?? 0) + 1,
    active: true,
  })
  formVisible.value = true
}

function openEdit(row: RoleRecord) {
  editing.value = row
  Object.assign(form, {
    code: row.code,
    name: row.name,
    description: row.description,
    sortOrder: row.sortOrder,
    active: row.active,
  })
  formVisible.value = true
}

async function saveForm() {
  if (!form.code.trim() || !form.name.trim()) {
    ElMessage.warning(t('role.codeNameRequired'))
    return
  }
  try {
    const payload = {
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      sortOrder: form.sortOrder,
      active: form.active,
    }
    if (editing.value) {
      await updateRoleApi(editing.value.id, payload)
      ElMessage.success(t('role.updated'))
    } else {
      await createRoleApi(payload)
      ElMessage.success(t('role.created'))
    }
    formVisible.value = false
    await loadList()
    resetPage()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: RoleRecord) {
  if (row.isSystem) {
    ElMessage.warning(t('role.systemProtected'))
    return
  }
  try {
    await ElMessageBox.confirm(
      t('role.deleteConfirm', { name: row.name }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteRoleApi(row.id)
    ElMessage.success(t('role.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function toggleActive(row: RoleRecord) {
  try {
    await updateRoleApi(row.id, { active: !row.active })
    await loadList()
  } catch {
    /* interceptor */
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.roles') }}</h2>
      <div class="head-actions">
        <el-button type="primary" :icon="Plus" class="lb-btn-primary" @click="openCreate">
          {{ t('role.create') }}
        </el-button>
      </div>
    </div>

    <div class="table-card" v-loading="loading">
      <div class="table-scroll">
        <el-table :data="paged" height="100%" stripe border empty-text="—" style="width: 100%">
          <el-table-column
            type="index"
            :index="rowIndex"
            label="#"
            width="52"
            fixed="left"
            align="center"
            header-align="center"
          />
          <el-table-column min-width="120">
            <template #header>
              <TableColumnHeader
                :label="t('role.fields.code')"
                sortable
                :sort-order="sortOrderOf('code')"
                @update:sort-order="(v) => setSort('code', v)"
              />
            </template>
            <template #default="{ row }">{{ row.code }}</template>
          </el-table-column>
          <el-table-column min-width="140">
            <template #header>
              <TableColumnHeader
                :label="t('role.fields.name')"
                sortable
                :sort-order="sortOrderOf('name')"
                @update:sort-order="(v) => setSort('name', v)"
              />
            </template>
            <template #default="{ row }">{{ row.name }}</template>
          </el-table-column>
          <el-table-column
            prop="description"
            :label="t('role.fields.description')"
            min-width="180"
            show-overflow-tooltip
          />
          <el-table-column prop="sortOrder" width="100">
            <template #header>
              <TableColumnHeader
                :label="t('role.fields.sortOrder')"
                sortable
                :sort-order="sortOrderOf('sortOrder')"
                @update:sort-order="(v) => setSort('sortOrder', v)"
              />
            </template>
          </el-table-column>
          <el-table-column width="100" align="center">
            <template #header>
              <TableColumnHeader
                :label="t('role.fields.menuCount')"
                sortable
                :sort-order="sortOrderOf('menuCount')"
                @update:sort-order="(v) => setSort('menuCount', v)"
              />
            </template>
            <template #default="{ row }">{{ row.menuCount }}</template>
          </el-table-column>
          <el-table-column width="110">
            <template #header>
              <TableColumnHeader
                :label="t('role.fields.active')"
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
          <el-table-column
            :label="t('common.actions')"
            :width="roleActionWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills">
                <button type="button" class="action-pill action-pill--edit" @click="openEdit(row)">
                  {{ t('common.edit') }}
                </button>
                <button
                  type="button"
                  class="action-pill action-pill--danger"
                  :disabled="row.isSystem"
                  @click="onDelete(row)"
                >
                  {{ t('common.delete') }}
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
      :title="editing ? t('role.edit') : t('role.create')"
      :width="dialogWidth"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item :label="t('role.fields.code')" required>
          <el-input v-model="form.code" :disabled="!!editing?.isSystem" />
        </el-form-item>
        <el-form-item :label="t('role.fields.name')" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="t('role.fields.description')">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item :label="t('role.fields.sortOrder')">
          <el-input-number
            v-model="form.sortOrder"
            :min="0"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('role.fields.active')">
          <el-switch v-model="form.active" />
        </el-form-item>
        <AuditDetailSection v-if="editing" :record="editing" />
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" class="lb-btn-primary" @click="saveForm">
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>
