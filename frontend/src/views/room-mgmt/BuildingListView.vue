<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search, Upload, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import * as XLSX from 'xlsx'
import { fetchBuildings, updateBuildingApi } from '@/api/buildings'
import type { BuildingRecord } from '@/types/building'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'
import BuildingDetailDrawer from '@/components/BuildingDetailDrawer.vue'
import ExportIcon from '@/components/icons/ExportIcon.vue'
import WorkingHoursField from '@/components/WorkingHoursField.vue'
import { buildingIoTemplateExampleRow, buildingToIoRow } from '@/utils/buildingExport'
import { useUserStore } from '@/stores/user'

const { t } = useI18n()
const userStore = useUserStore()
const isMobile = useIsMobile()
const useCards = computed(() => isMobile.value)

const keyword = ref('')
const loading = ref(false)
const drawerVisible = ref(false)
const formVisible = ref(false)
const current = ref<BuildingRecord | null>(null)
const editing = ref<BuildingRecord | null>(null)
const importInputRef = ref<HTMLInputElement | null>(null)

const list = ref<BuildingRecord[]>([])

const {
  filters,
  setFilter,
  setSort,
  sortOrderOf,
  apply: applySortFilter,
  uniqueOptions,
  sortKey,
  sortOrder,
} = useTableSortFilter<BuildingRecord>()

const columnGetters = {
  name: (b: BuildingRecord) => b.name,
  manager: (b: BuildingRecord) => b.manager,
  roomCount: (b: BuildingRecord) => b.roomIds.length,
  active: (b: BuildingRecord) => String(b.active),
  createdBy: (b: BuildingRecord) => b.createdBy,
  createdAt: (b: BuildingRecord) => b.createdAt,
  updatedBy: (b: BuildingRecord) => b.updatedBy,
  updatedAt: (b: BuildingRecord) => b.updatedAt,
}

const managerFilterOptions = computed(() => uniqueOptions(list.value, (b) => b.manager))
const activeFilterOptions = computed(() => [
  { value: 'true', label: t('user.status.active') },
  { value: 'false', label: t('user.status.disabled') },
])

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  const base = !q
    ? list.value
    : list.value.filter((b) =>
        [b.name, b.address, b.addressEn, b.manager, b.email, b.managerPhone]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
  return applySortFilter(base, columnGetters)
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)

watch([keyword, filters, sortKey, sortOrder], () => resetPage(), { deep: true })

async function loadList() {
  loading.value = true
  try {
    const { data } = await fetchBuildings({ activeOnly: false })
    list.value = data
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadList()
})

const dialogWidth = computed(() => (isMobile.value ? '94%' : '760px'))

const form = reactive({
  name: '',
  address: '',
  addressEn: '',
  manager: '',
  managerPhone: '',
  email: '',
  workingHours: '',
  fpsId: '',
  bankAccountHolder: '',
  bankAccount: '',
  apiTemplateSuffix: '',
  useWbaNumber: '',
  buildingConfig: '',
  chequePaymentBy: '',
  paymentAdvice: '',
  active: true,
})

function openDetail(row: BuildingRecord) {
  current.value = row
  drawerVisible.value = true
}

function onBuildingRowClick(row: BuildingRecord, _column: unknown, event: Event) {
  const el = event.target as HTMLElement | null
  if (el?.closest('.action-pills, button, a, .el-switch, input, textarea, .el-checkbox')) return
  openDetail(row)
}

function onDataIoCommand(cmd: string | number) {
  if (cmd === 'import') {
    importInputRef.value?.click()
    return
  }
  if (cmd === 'template') {
    const example = buildingIoTemplateExampleRow(t)
    const ws = XLSX.utils.json_to_sheet([example])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Buildings')
    XLSX.writeFile(wb, 'buildings-import-template.xlsx')
    ElMessage.success(t('building.templateDone'))
    return
  }
  if (cmd === 'export') {
    const rows = filtered.value
    if (!rows.length) {
      ElMessage.warning(t('building.exportEmpty'))
      return
    }
    const sheetRows = rows.map((b) => buildingToIoRow(b, t))
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Buildings')
    XLSX.writeFile(wb, `buildings-${new Date().toISOString().slice(0, 10)}.xlsx`)
    ElMessage.success(t('building.exportDone', { n: rows.length }))
  }
}

function onImportFile(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  ElMessage.info(t('building.importPending', { name: file.name }))
}

function openCreate() {
  editing.value = null
  Object.assign(form, {
    name: '',
    address: '',
    addressEn: '',
    manager: '',
    managerPhone: '',
    email: '',
    workingHours: '',
    fpsId: '',
    bankAccountHolder: '',
    bankAccount: '',
    apiTemplateSuffix: '',
    useWbaNumber: '',
    buildingConfig: '',
    chequePaymentBy: '',
    paymentAdvice: '',
    active: true,
  })
  formVisible.value = true
}

function openEdit(row: BuildingRecord) {
  editing.value = row
  Object.assign(form, {
    name: row.name,
    address: row.address,
    addressEn: row.addressEn,
    manager: row.manager,
    managerPhone: row.managerPhone,
    email: row.email,
    workingHours: row.workingHours,
    fpsId: row.fpsId || '',
    bankAccountHolder: row.bankAccountHolder || '',
    bankAccount: row.bankAccount || '',
    apiTemplateSuffix: row.apiTemplateSuffix || '',
    useWbaNumber: row.useWbaNumber || '',
    buildingConfig: row.buildingConfig || '',
    chequePaymentBy: row.chequePaymentBy || '',
    paymentAdvice: row.paymentAdvice || '',
    active: row.active,
  })
  formVisible.value = true
}

async function toggleActive(row: BuildingRecord) {
  try {
    await updateBuildingApi(row.id, { active: !row.active })
    await loadList()
  } catch {
    /* interceptor */
  }
}

async function saveForm() {
  if (!form.name.trim()) return
  if (editing.value) {
    try {
      await updateBuildingApi(editing.value.id, { ...form })
      await loadList()
    } catch {
      return
    }
  } else {
    const actor = userStore.user?.account || ''
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
    list.value.unshift({
      id: `b${Date.now()}`,
      ...form,
      roomIds: [],
      createdBy: actor,
      createdAt: now,
      updatedBy: actor,
      updatedAt: now,
    })
  }
  formVisible.value = false
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.buildings') }}</h2>
      <div class="head-actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search"
          :prefix-icon="Search"
          :placeholder="t('building.searchPlaceholder')"
        />
        <el-button type="primary" :icon="Plus" class="lb-btn-primary" @click="openCreate">
          {{ t('building.create') }}
        </el-button>
        <el-dropdown
          trigger="hover"
          placement="bottom-end"
          popper-class="room-io-popper"
          @command="onDataIoCommand"
        >
          <el-button class="room-io-btn" :aria-label="t('building.dataIo')">
            <el-icon :size="16"><ExportIcon /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="import">
                <el-icon><Upload /></el-icon>
                <span>{{ t('building.import') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="template">
                <el-icon><Download /></el-icon>
                <span>{{ t('building.downloadTemplate') }}</span>
              </el-dropdown-item>
              <el-dropdown-item command="export" divided>
                <el-icon><Download /></el-icon>
                <span>{{ t('building.export') }}</span>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <input
          ref="importInputRef"
          type="file"
          class="room-io-file"
          accept=".xlsx,.xls,.csv"
          @change="onImportFile"
        />
      </div>
    </div>

    <div v-if="!useCards" class="table-card" v-loading="loading">
      <div class="table-scroll">
        <el-table
          :data="paged"
          height="100%"
          stripe
          border
          empty-text="—"
          class="building-table--clickable"
          style="width: 100%"
          @row-click="onBuildingRowClick"
        >
          <el-table-column type="index" :index="rowIndex" label="#" width="52" fixed="left" align="center" header-align="center" />
          <el-table-column prop="name" min-width="168">
            <template #header>
              <TableColumnHeader
                :label="t('building.fields.name')"
                sortable
                :sort-order="sortOrderOf('name')"
                @update:sort-order="(v) => setSort('name', v)"
              />
            </template>
          </el-table-column>
          <el-table-column
            prop="address"
            :label="t('building.fields.address')"
            min-width="240"
            class-name="col-address"
            label-class-name="col-address"
            show-overflow-tooltip
          />
          <el-table-column prop="manager" min-width="110">
            <template #header>
              <TableColumnHeader
                :label="t('building.fields.manager')"
                filterable
                sortable
                :options="managerFilterOptions"
                :model-value="filters.manager || []"
                :sort-order="sortOrderOf('manager')"
                @update:model-value="(v) => setFilter('manager', v)"
                @update:sort-order="(v) => setSort('manager', v)"
              />
            </template>
          </el-table-column>
          <el-table-column prop="managerPhone" :label="t('building.fields.managerPhone')" min-width="130" />
          <el-table-column prop="email" :label="t('building.fields.email')" min-width="200" />
          <el-table-column prop="workingHours" :label="t('building.fields.workingHours')" min-width="176" />
          <el-table-column min-width="88" align="center">
            <template #header>
              <TableColumnHeader
                :label="t('building.fields.rooms')"
                sortable
                :sort-order="sortOrderOf('roomCount')"
                @update:sort-order="(v) => setSort('roomCount', v)"
              />
            </template>
            <template #default="{ row }">
              <span
                class="lb-room-count"
                :class="{ 'is-empty': !(row as BuildingRecord).roomIds.length }"
              >
                {{ (row as BuildingRecord).roomIds.length }}
              </span>
            </template>
          </el-table-column>
          <el-table-column width="88" align="center">
            <template #header>
              <TableColumnHeader
                :label="t('building.fields.active')"
                filterable
                :options="activeFilterOptions"
                :model-value="filters.active || []"
                @update:model-value="(v) => setFilter('active', v)"
              />
            </template>
            <template #default="{ row }">
              <el-switch
                :model-value="(row as BuildingRecord).active"
                @change="() => toggleActive(row as BuildingRecord)"
              />
            </template>
          </el-table-column>
          <el-table-column prop="createdBy" :label="t('common.createdBy')" min-width="100" show-overflow-tooltip />
          <el-table-column prop="createdAt" width="160" class-name="col-datetime" label-class-name="col-datetime">
            <template #header>
              <TableColumnHeader
                :label="t('common.createdAt')"
                sortable
                :sort-order="sortOrderOf('createdAt')"
                @update:sort-order="(v) => setSort('createdAt', v)"
              />
            </template>
          </el-table-column>
          <el-table-column prop="updatedBy" :label="t('common.updatedBy')" min-width="100" show-overflow-tooltip />
          <el-table-column prop="updatedAt" width="160" class-name="col-datetime" label-class-name="col-datetime">
            <template #header>
              <TableColumnHeader
                :label="t('common.updatedAt')"
                sortable
                :sort-order="sortOrderOf('updatedAt')"
                @update:sort-order="(v) => setSort('updatedAt', v)"
              />
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="150" fixed="right">
            <template #default="{ row }">
              <div class="action-pills">
                <button type="button" class="action-pill action-pill--view" @click.stop="openDetail(row as BuildingRecord)">
                  {{ t('common.detail') }}
                </button>
                <button type="button" class="action-pill action-pill--edit" @click.stop="openEdit(row as BuildingRecord)">
                  {{ t('common.edit') }}
                </button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <div class="table-pagination">
        <TablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" :page-sizes="pageSizes" />
      </div>
    </div>

    <div v-else class="data-cards">
      <article v-for="row in paged" :key="row.id" class="data-card">
        <div class="data-card__head">
          <div>
            <h3 class="data-card__title">{{ row.name }}</h3>
            <p class="data-card__meta">{{ row.address }}</p>
          </div>
          <el-tag effect="plain" class="lb-room-count-tag" :class="{ 'is-empty': !row.roomIds.length }">
            {{ row.roomIds.length }} {{ t('building.fields.rooms') }}
          </el-tag>
        </div>
        <dl class="data-card__grid">
          <div>
            <dt>{{ t('building.fields.manager') }}</dt>
            <dd>{{ row.manager }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.managerPhone') }}</dt>
            <dd>{{ row.managerPhone }}</dd>
          </div>
          <div class="full">
            <dt>{{ t('building.fields.email') }}</dt>
            <dd>{{ row.email }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.workingHours') }}</dt>
            <dd>{{ row.workingHours }}</dd>
          </div>
          <div>
            <dt>{{ t('building.fields.active') }}</dt>
            <dd>
              <el-switch :model-value="row.active" @change="() => toggleActive(row)" />
            </dd>
          </div>
          <div>
            <dt>{{ t('common.createdBy') }}</dt>
            <dd>{{ row.createdBy || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('common.createdAt') }}</dt>
            <dd>{{ row.createdAt || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('common.updatedBy') }}</dt>
            <dd>{{ row.updatedBy || '—' }}</dd>
          </div>
          <div>
            <dt>{{ t('common.updatedAt') }}</dt>
            <dd>{{ row.updatedAt || '—' }}</dd>
          </div>
        </dl>
        <div class="data-card__actions">
          <button type="button" class="action-pill action-pill--view" @click="openDetail(row)">
            {{ t('common.detail') }}
          </button>
          <button type="button" class="action-pill action-pill--edit" @click="openEdit(row)">
            {{ t('common.edit') }}
          </button>
        </div>
      </article>
      <el-empty v-if="!filtered.length" />
      <div v-if="filtered.length" class="table-pagination cards-pagination">
        <TablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" :page-sizes="pageSizes" />
      </div>
    </div>

    <BuildingDetailDrawer v-model="drawerVisible" :building="current" />

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('building.edit') : t('building.create')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      align-center
      class="lb-dialog"
    >
      <el-form label-position="top" class="building-form">
        <div class="form-grid">
          <div class="form-section">
            <h3>{{ t('building.sections.basic') }}</h3>
          </div>
          <el-form-item :label="t('building.fields.name')" required>
            <el-input v-model="form.name" />
          </el-form-item>
          <el-form-item :label="t('building.fields.manager')">
            <el-input v-model="form.manager" />
          </el-form-item>
          <el-form-item :label="t('building.fields.address')" class="span-2">
            <el-input v-model="form.address" />
          </el-form-item>
          <el-form-item :label="t('building.fields.addressEn')" class="span-2">
            <el-input v-model="form.addressEn" />
          </el-form-item>
          <el-form-item :label="t('building.fields.managerPhone')">
            <el-input v-model="form.managerPhone" />
          </el-form-item>
          <el-form-item :label="t('building.fields.email')">
            <el-input v-model="form.email" />
          </el-form-item>
          <el-form-item :label="t('building.fields.workingHours')" class="span-2">
            <WorkingHoursField v-model="form.workingHours" />
          </el-form-item>
          <el-form-item :label="t('building.fields.buildingConfig')">
            <el-input v-model="form.buildingConfig" />
          </el-form-item>
          <el-form-item :label="t('building.fields.active')">
            <el-switch v-model="form.active" />
          </el-form-item>

          <div class="form-section">
            <h3>{{ t('building.sections.finance') }}</h3>
          </div>
          <el-form-item label="FPS_ID">
            <el-input v-model="form.fpsId" />
          </el-form-item>
          <el-form-item :label="t('building.fields.bankAccountHolder')">
            <el-input v-model="form.bankAccountHolder" />
          </el-form-item>
          <el-form-item :label="t('building.fields.bankAccount')">
            <el-input v-model="form.bankAccount" />
          </el-form-item>
          <el-form-item :label="t('building.fields.useWbaNumber')">
            <el-input v-model="form.useWbaNumber" />
          </el-form-item>
          <el-form-item :label="t('building.fields.apiTemplateSuffix')">
            <el-input v-model="form.apiTemplateSuffix" />
          </el-form-item>
          <el-form-item label="Cheque Payment By">
            <el-input v-model="form.chequePaymentBy" />
          </el-form-item>
          <el-form-item label="Payment Advice" class="span-2">
            <el-input v-model="form.paymentAdvice" type="textarea" :rows="2" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveForm">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.building-table--clickable :deep(.el-table__body tr) {
  cursor: pointer;
}

.building-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.building-form :deep(.el-form-item__label) {
  margin-bottom: 4px !important;
  line-height: 1.2;
}
</style>
