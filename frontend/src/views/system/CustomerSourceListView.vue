<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  createCustomerSourceApi,
  deleteCustomerSourceApi,
  fetchCustomerSources,
  updateCustomerSourceApi,
} from '@/api/customer-sources'
import type { CustomerSourceOption } from '@/types/customer-source'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import { useActionColWidth } from '@/composables/useActionColWidth'

const { t } = useI18n()
const isMobile = useIsMobile()
const { actionColWidth } = useActionColWidth()

const loading = ref(false)
const formVisible = ref(false)
const editing = ref<CustomerSourceOption | null>(null)
const list = ref<CustomerSourceOption[]>([])

const {
  filters,
  setFilter,
  setSort,
  sortOrderOf,
  apply: applySortFilter,
  sortKey,
  sortOrder,
} = useTableSortFilter<CustomerSourceOption>()

const columnGetters = {
  label: (o: CustomerSourceOption) => o.label,
  sortOrder: (o: CustomerSourceOption) => o.sortOrder,
  active: (o: CustomerSourceOption) => String(o.active),
}

const activeFilterOptions = computed(() => [
  { value: 'true', label: t('user.status.active') },
  { value: 'false', label: t('user.status.disabled') },
])

const sorted = computed(() => {
  const applied = applySortFilter(list.value, columnGetters)
  if (!sortKey.value) {
    return [...applied].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
  }
  return applied
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(sorted)

watch([filters, sortKey, sortOrder], () => resetPage(), { deep: true })

const dialogWidth = computed(() => (isMobile.value ? '94%' : '480px'))

const form = reactive({
  label: '',
  sortOrder: 0,
  active: true,
})

async function loadList() {
  loading.value = true
  try {
    const { data } = await fetchCustomerSources({ activeOnly: false })
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
    label: '',
    sortOrder: (sorted.value.at(-1)?.sortOrder ?? 0) + 1,
    active: true,
  })
  formVisible.value = true
}

function openEdit(row: CustomerSourceOption) {
  editing.value = row
  Object.assign(form, {
    label: row.label,
    sortOrder: row.sortOrder,
    active: row.active,
  })
  formVisible.value = true
}

async function saveForm() {
  if (!form.label.trim()) {
    ElMessage.warning(t('customerSource.labelRequired'))
    return
  }
  try {
    const payload = {
      label: form.label.trim(),
      sortOrder: form.sortOrder,
      active: form.active,
    }
    if (editing.value) {
      await updateCustomerSourceApi(editing.value.id, payload)
      ElMessage.success(t('customerSource.updated'))
    } else {
      await createCustomerSourceApi(payload)
      ElMessage.success(t('customerSource.created'))
    }
    formVisible.value = false
    await loadList()
    resetPage()
  } catch {
    /* interceptor */
  }
}

async function onDelete(row: CustomerSourceOption) {
  try {
    await ElMessageBox.confirm(
      t('customerSource.deleteConfirm', { label: row.label }),
      t('common.deleteTitle'),
      { type: 'warning' },
    )
    await deleteCustomerSourceApi(row.id)
    ElMessage.success(t('customerSource.deleted'))
    await loadList()
  } catch {
    /* cancel */
  }
}

async function toggleActive(row: CustomerSourceOption) {
  try {
    await updateCustomerSourceApi(row.id, { active: !row.active })
    await loadList()
  } catch {
    /* interceptor */
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.customerSources') }}</h2>
      <div class="head-actions">
        <el-button type="primary" :icon="Plus" class="lb-btn-primary" @click="openCreate">
          {{ t('customerSource.create') }}
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
          <el-table-column min-width="180">
            <template #header>
              <TableColumnHeader
                :label="t('customerSource.fields.label')"
                sortable
                :sort-order="sortOrderOf('label')"
                @update:sort-order="(v) => setSort('label', v)"
              />
            </template>
            <template #default="{ row }">{{ row.label }}</template>
          </el-table-column>
          <el-table-column prop="sortOrder" width="120">
            <template #header>
              <TableColumnHeader
                :label="t('customerSource.fields.sortOrder')"
                sortable
                :sort-order="sortOrderOf('sortOrder')"
                @update:sort-order="(v) => setSort('sortOrder', v)"
              />
            </template>
          </el-table-column>
          <el-table-column width="128">
            <template #header>
              <TableColumnHeader
                :label="t('customerSource.fields.active')"
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
          <el-table-column
            :label="t('common.actions')"
            :width="actionColWidth.two"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
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
      :title="editing ? t('customerSource.edit') : t('customerSource.create')"
      :width="dialogWidth"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item :label="t('customerSource.fields.label')" required>
          <el-input v-model="form.label" />
        </el-form-item>
        <el-form-item :label="t('customerSource.fields.sortOrder')">
          <el-input-number
            v-model="form.sortOrder"
            :min="0"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('customerSource.fields.active')">
          <el-switch v-model="form.active" />
        </el-form-item>
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
          <el-button type="primary" class="lb-btn-primary" @click="saveForm">
            {{ t('common.save') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>
