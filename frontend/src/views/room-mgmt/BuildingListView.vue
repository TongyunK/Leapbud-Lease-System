<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, Search } from '@element-plus/icons-vue'
import { fetchBuildings, updateBuildingApi } from '@/api/buildings'
import type { BuildingRecord } from '@/types/building'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import { useTableSortFilter } from '@/composables/useTableSortFilter'
import TablePagination from '@/components/TablePagination.vue'
import TableColumnHeader from '@/components/TableColumnHeader.vue'

const { t } = useI18n()
const isMobile = useIsMobile()
const useCards = computed(() => isMobile.value)

const keyword = ref('')
const loading = ref(false)
const drawerVisible = ref(false)
const formVisible = ref(false)
const current = ref<BuildingRecord | null>(null)
const editing = ref<BuildingRecord | null>(null)

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

const dialogWidth = computed(() => (isMobile.value ? '94%' : '720px'))
const drawerSize = computed(() => (isMobile.value ? '100%' : '520px'))

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
    list.value.unshift({
      id: `b${Date.now()}`,
      ...form,
      roomIds: [],
      updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    })
  }
  formVisible.value = false
}

function fileLabel(name?: string) {
  return name || t('common.none')
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
      </div>
    </div>

    <div v-if="!useCards" class="table-card" v-loading="loading">
      <div class="table-scroll">
        <el-table :data="paged" height="100%" stripe border empty-text="—" style="width: 100%">
          <el-table-column type="index" :index="rowIndex" label="#" width="52" fixed="left" align="center" header-align="center" />
          <el-table-column prop="name" min-width="220">
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
          <el-table-column prop="manager" min-width="128">
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
          <el-table-column prop="managerPhone" :label="t('building.fields.managerPhone')" min-width="142" />
          <el-table-column prop="email" :label="t('building.fields.email')" min-width="200" />
          <el-table-column prop="workingHours" :label="t('building.fields.workingHours')" min-width="176" />
          <el-table-column min-width="128" align="center">
            <template #header>
              <TableColumnHeader
                :label="t('building.fields.rooms')"
                sortable
                :sort-order="sortOrderOf('roomCount')"
                @update:sort-order="(v) => setSort('roomCount', v)"
              />
            </template>
            <template #default="{ row }">
              <el-tag effect="plain">{{ row.roomIds.length }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column width="128">
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
              <el-switch :model-value="row.active" @change="() => toggleActive(row)" />
            </template>
          </el-table-column>
          <el-table-column prop="updatedAt" min-width="152">
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
                <button type="button" class="action-pill action-pill--view" @click="openDetail(row as BuildingRecord)">
                  {{ t('common.detail') }}
                </button>
                <button type="button" class="action-pill action-pill--edit" @click="openEdit(row as BuildingRecord)">
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
          <el-tag effect="plain">{{ row.roomIds.length }} {{ t('building.fields.rooms') }}</el-tag>
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
            <dt>{{ t('common.updatedAt') }}</dt>
            <dd>{{ row.updatedAt }}</dd>
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

    <el-drawer
      v-model="drawerVisible"
      :size="drawerSize"
      :title="t('building.detailTitle')"
      :direction="isMobile ? 'btt' : 'rtl'"
      class="responsive-drawer"
    >
      <template v-if="current">
        <section class="detail-section">
          <h3>{{ t('building.sections.basic') }}</h3>
          <dl class="detail-grid">
            <div><dt>{{ t('building.fields.name') }}</dt><dd>{{ current.name }}</dd></div>
            <div><dt>{{ t('building.fields.address') }}</dt><dd>{{ current.address }}</dd></div>
            <div><dt>{{ t('building.fields.addressEn') }}</dt><dd>{{ current.addressEn }}</dd></div>
            <div><dt>{{ t('building.fields.manager') }}</dt><dd>{{ current.manager }}</dd></div>
            <div><dt>{{ t('building.fields.managerPhone') }}</dt><dd>{{ current.managerPhone }}</dd></div>
            <div><dt>{{ t('building.fields.email') }}</dt><dd>{{ current.email }}</dd></div>
            <div><dt>{{ t('building.fields.workingHours') }}</dt><dd>{{ current.workingHours }}</dd></div>
            <div>
              <dt>{{ t('building.fields.active') }}</dt>
              <dd>{{ current.active ? t('user.status.active') : t('user.status.disabled') }}</dd>
            </div>
            <div><dt>{{ t('building.fields.buildingConfig') }}</dt><dd>{{ current.buildingConfig || '—' }}</dd></div>
            <div><dt>{{ t('building.fields.useWbaNumber') }}</dt><dd>{{ current.useWbaNumber || '—' }}</dd></div>
          </dl>
        </section>

        <section class="detail-section">
          <h3>{{ t('building.sections.finance') }}</h3>
          <dl class="detail-grid">
            <div><dt>FPS_ID</dt><dd>{{ current.fpsId || '—' }}</dd></div>
            <div><dt>{{ t('building.fields.bankAccountHolder') }}</dt><dd>{{ current.bankAccountHolder || '—' }}</dd></div>
            <div><dt>{{ t('building.fields.bankAccount') }}</dt><dd>{{ current.bankAccount || '—' }}</dd></div>
            <div><dt>Cheque Payment By</dt><dd>{{ current.chequePaymentBy || '—' }}</dd></div>
            <div><dt>Payment Advice</dt><dd>{{ current.paymentAdvice || '—' }}</dd></div>
          </dl>
        </section>

        <section class="detail-section">
          <h3>{{ t('building.sections.templates') }}</h3>
          <dl class="detail-grid">
            <div><dt>{{ t('building.fields.agreementTemplate') }}</dt><dd>{{ fileLabel(current.agreementTemplate) }}</dd></div>
            <div><dt>{{ t('building.fields.invoiceTemplate') }}</dt><dd>{{ fileLabel(current.invoiceTemplate) }}</dd></div>
            <div><dt>{{ t('building.fields.receiptTemplate') }}</dt><dd>{{ fileLabel(current.receiptTemplate) }}</dd></div>
            <div><dt>{{ t('building.fields.apiTemplateSuffix') }}</dt><dd>{{ current.apiTemplateSuffix || '—' }}</dd></div>
          </dl>
          <div class="logo-row">
            <div
              v-for="item in [
                { label: t('building.fields.agreementLogo'), src: current.agreementLogo },
                { label: 'logo2', src: current.logo2 },
                { label: t('building.fields.invoiceLogo'), src: current.invoiceLogo },
                { label: t('building.fields.receiptTopLogo'), src: current.receiptTopLogo },
                { label: t('building.fields.receiptLeftLogo'), src: current.receiptLeftLogo },
                { label: t('building.fields.receiptRightLogo'), src: current.receiptRightLogo },
              ]"
              :key="item.label"
              class="logo-item"
            >
              <span>{{ item.label }}</span>
              <img v-if="item.src" :src="item.src" alt="" />
              <em v-else>—</em>
            </div>
          </div>
        </section>
      </template>
    </el-drawer>

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('building.edit') : t('building.create')"
      :width="dialogWidth"
      :fullscreen="isMobile"
      destroy-on-close
      align-center
      class="lb-dialog"
    >
      <el-form label-position="top">
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
          <el-form-item :label="t('building.fields.workingHours')">
            <el-input v-model="form.workingHours" />
          </el-form-item>
          <el-form-item :label="t('building.fields.active')">
            <el-switch v-model="form.active" />
          </el-form-item>
          <el-form-item :label="t('building.fields.buildingConfig')">
            <el-input v-model="form.buildingConfig" />
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
.logo-row {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.logo-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.75rem;
  color: var(--lb-muted);
}

.logo-item img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: 10px;
  border: 1px solid var(--lb-border);
}

@media (max-width: 640px) {
  .logo-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
