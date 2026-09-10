<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { createMenuApi, fetchMenus, updateMenuApi } from '@/api/menus'
import { fetchRoleMenuMatrixApi, saveRoleMenuMatrixApi } from '@/api/roles'
import type { MenuRecord, MenuType } from '@/types/menu'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import { measureActionColWidth } from '@/composables/useActionColWidth'
import { useNavStore } from '@/stores/nav'

const { t, locale, te } = useI18n()
const isMobile = useIsMobile()
const navStore = useNavStore()
const menuActionWidth = computed(() => {
  void locale.value
  return Math.max(
    measureActionColWidth([t('sysMenu.addChild'), t('common.edit')]),
    measureActionColWidth([t('common.edit')]),
  )
})

const loading = ref(false)
const saving = ref(false)
const formVisible = ref(false)
const editing = ref<MenuRecord | null>(null)
const flat = ref<MenuRecord[]>([])

const matrixRoles = ref<Array<{ id: string; code: string; name: string; isSystem: boolean }>>([])
const matrixMenus = ref<MenuRecord[]>([])
/** roleId -> Set(menuId) */
const matrixChecked = ref<Record<string, Set<string>>>({})

const dialogWidth = computed(() => (isMobile.value ? '94%' : '480px'))

const form = reactive({
  parentId: '' as string | '',
  type: 'menu' as MenuType,
  name: '',
  sortOrder: 0,
  active: true,
})

const parentOptions = computed(() =>
  flat.value
    .filter((m) => m.type === 'directory' && (!editing.value || m.id !== editing.value.id))
    .map((m) => ({ value: m.id, label: m.name })),
)

const typeOptions = computed(() => [
  { value: 'directory', label: t('sysMenu.type.directory') },
  { value: 'menu', label: t('sysMenu.type.menu') },
])

function menuLabel(node: MenuRecord) {
  const key = node.nameKey?.trim()
  if (key && te(key)) return t(key)
  return node.name
}

function rowClassName({ row }: { row: MenuRecord }) {
  return row.type === 'directory' ? 'menu-matrix-row--dir' : 'menu-matrix-row--leaf'
}

function collectChildIds(node: MenuRecord): string[] {
  const ids = [node.id]
  for (const c of node.children || []) ids.push(...collectChildIds(c))
  return ids
}

async function loadMatrix() {
  loading.value = true
  try {
    const [matrixRes, flatRes] = await Promise.all([
      fetchRoleMenuMatrixApi(),
      fetchMenus({ flat: true }),
    ])
    matrixRoles.value = matrixRes.data.roles
    matrixMenus.value = matrixRes.data.menus
    flat.value = flatRes.data
    const next: Record<string, Set<string>> = {}
    for (const role of matrixRes.data.roles) {
      next[role.id] = new Set(matrixRes.data.grants[role.id] || [])
    }
    matrixChecked.value = next
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void loadMatrix()
})

function isChecked(roleId: string, menuId: string) {
  return matrixChecked.value[roleId]?.has(menuId) ?? false
}

function isIndeterminate(roleId: string, row: MenuRecord) {
  const kids = collectChildIds(row)
  if (kids.length <= 1) return false
  const set = matrixChecked.value[roleId]
  if (!set) return false
  let n = 0
  for (const id of kids) if (set.has(id)) n += 1
  return n > 0 && n < kids.length
}

function toggleCell(roleId: string, row: MenuRecord, checked: boolean) {
  const set = new Set(matrixChecked.value[roleId] || [])
  for (const id of collectChildIds(row)) {
    if (checked) set.add(id)
    else set.delete(id)
  }
  matrixChecked.value = { ...matrixChecked.value, [roleId]: set }
}

async function saveMatrix() {
  saving.value = true
  try {
    const grants = matrixRoles.value.map((role) => ({
      roleId: role.id,
      menuIds: [...(matrixChecked.value[role.id] || [])],
    }))
    await saveRoleMenuMatrixApi(grants)
    ElMessage.success(t('role.menusUpdated'))
    await loadMatrix()
    void navStore.loadNav()
  } catch {
    /* interceptor */
  } finally {
    saving.value = false
  }
}

function openCreate(parentId?: string | null) {
  editing.value = null
  Object.assign(form, {
    parentId: parentId || '',
    type: parentId ? 'menu' : 'directory',
    name: '',
    sortOrder: (flat.value.at(-1)?.sortOrder ?? 0) + 1,
    active: true,
  })
  formVisible.value = true
}

function openEdit(row: MenuRecord) {
  editing.value = row
  Object.assign(form, {
    parentId: row.parentId || '',
    type: row.type,
    name: row.name,
    sortOrder: row.sortOrder,
    active: row.active,
  })
  formVisible.value = true
}

async function saveForm() {
  if (!form.name.trim()) {
    ElMessage.warning(t('sysMenu.nameRequired'))
    return
  }
  try {
    if (editing.value) {
      await updateMenuApi(editing.value.id, {
        parentId: form.parentId || null,
        type: form.type,
        name: form.name.trim(),
        sortOrder: form.sortOrder,
        active: form.active,
      })
      ElMessage.success(t('sysMenu.updated'))
    } else {
      await createMenuApi({
        parentId: form.parentId || null,
        type: form.type,
        name: form.name.trim(),
        sortOrder: form.sortOrder,
        active: form.active,
      })
      ElMessage.success(t('sysMenu.created'))
    }
    formVisible.value = false
    await loadMatrix()
    void navStore.loadNav()
  } catch {
    /* interceptor */
  }
}

async function toggleActive(row: MenuRecord) {
  try {
    await updateMenuApi(row.id, { active: !row.active })
    await loadMatrix()
    void navStore.loadNav()
  } catch {
    /* interceptor */
  }
}
</script>

<template>
  <div class="admin-page">
    <div class="admin-page-head">
      <h2>{{ t('menu.menus') }}</h2>
      <div class="head-actions">
        <el-button type="primary" class="lb-btn-primary" :loading="saving" @click="saveMatrix">
          {{ t('common.save') }}
        </el-button>
      </div>
    </div>

    <div class="table-card" v-loading="loading">
      <div class="table-scroll">
        <el-table
          :data="matrixMenus"
          height="100%"
          stripe
          border
          row-key="id"
          default-expand-all
          :tree-props="{ children: 'children' }"
          :row-class-name="rowClassName"
          empty-text="—"
          style="width: 100%"
          class="menu-matrix-table"
        >
          <el-table-column :label="t('role.matrixFunction')" min-width="220" fixed="left">
            <template #default="{ row }">
              <span class="menu-matrix-fn" :class="{ 'is-dir': row.type === 'directory' }">
                {{ menuLabel(row) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column
            v-for="role in matrixRoles"
            :key="role.id"
            :min-width="120"
            align="center"
          >
            <template #header>
              <div class="menu-matrix-colhead">
                <span>{{ role.name }}</span>
                <small>{{ t('role.matrixEditable') }}</small>
              </div>
            </template>
            <template #default="{ row }">
              <el-checkbox
                class="menu-matrix-check"
                :model-value="isChecked(role.id, row.id)"
                :indeterminate="isIndeterminate(role.id, row)"
                @change="(v: boolean | string | number) => toggleCell(role.id, row, Boolean(v))"
              />
            </template>
          </el-table-column>
          <el-table-column
            :label="t('sysMenu.fields.active')"
            width="100"
            align="center"
            fixed="right"
          >
            <template #default="{ row }">
              <el-switch :model-value="row.active" @change="() => toggleActive(row)" />
            </template>
          </el-table-column>
          <el-table-column
            :label="t('common.actions')"
            :width="menuActionWidth"
            fixed="right"
            class-name="col-actions"
            label-class-name="col-actions"
          >
            <template #default="{ row }">
              <div class="action-pills">
                <button
                  v-if="row.type === 'directory'"
                  type="button"
                  class="action-pill action-pill--view"
                  @click="openCreate(row.id)"
                >
                  {{ t('sysMenu.addChild') }}
                </button>
                <button type="button" class="action-pill action-pill--edit" @click="openEdit(row)">
                  {{ t('common.edit') }}
                </button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <el-dialog
      v-model="formVisible"
      :title="editing ? t('sysMenu.edit') : t('sysMenu.create')"
      :width="dialogWidth"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item :label="t('sysMenu.fields.parent')">
          <el-select
            v-model="form.parentId"
            clearable
            :placeholder="t('sysMenu.rootParent')"
            style="width: 100%"
          >
            <el-option
              v-for="opt in parentOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('sysMenu.fields.type')" required>
          <el-select v-model="form.type" style="width: 100%">
            <el-option
              v-for="opt in typeOptions"
              :key="opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('sysMenu.fields.name')" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="t('sysMenu.fields.sortOrder')">
          <el-input-number
            v-model="form.sortOrder"
            :min="0"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('sysMenu.fields.active')">
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

<style scoped>
.menu-matrix-fn {
  display: inline-block;
  line-height: 1.4;
  color: #3a4a42;
}

.menu-matrix-fn.is-dir {
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #0f4a32;
}

.menu-matrix-colhead {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  line-height: 1.2;
}

.menu-matrix-colhead small {
  font-size: 11px;
  font-weight: 600;
  color: #0f4a32;
  background: #e8f3ec;
  border-radius: 999px;
  padding: 2px 8px;
}

.menu-matrix-table :deep(.menu-matrix-row--dir > td.el-table__cell) {
  background: linear-gradient(180deg, #f3f7f4 0%, #e8f0eb 100%) !important;
}

.menu-matrix-table :deep(.menu-matrix-row--dir:hover > td.el-table__cell) {
  background: linear-gradient(180deg, #eaf3ee 0%, #dfece4 100%) !important;
}

.menu-matrix-table :deep(.menu-matrix-row--dir .el-table__expand-icon) {
  color: #0f4a32;
  font-weight: 700;
}

.menu-matrix-check :deep(.el-checkbox__inner) {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border-color: #b7c7bd;
  background: #fff;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.menu-matrix-check :deep(.el-checkbox__inner::after) {
  box-sizing: content-box;
  width: 5px;
  height: 9px;
  left: 50%;
  top: 46%;
  border-width: 2px;
  transform: translate(-50%, -55%) rotate(45deg) scaleY(0);
  transform-origin: center;
}

.menu-matrix-check :deep(.el-checkbox__input.is-checked .el-checkbox__inner::after) {
  transform: translate(-50%, -55%) rotate(45deg) scaleY(1);
}

.menu-matrix-check :deep(.el-checkbox__input.is-checked .el-checkbox__inner),
.menu-matrix-check :deep(.el-checkbox__input.is-indeterminate .el-checkbox__inner) {
  background-color: #0f4a32;
  border-color: #0f4a32;
  box-shadow: 0 0 0 3px rgba(15, 74, 50, 0.14);
}

.menu-matrix-check :deep(.el-checkbox__input.is-indeterminate .el-checkbox__inner::before) {
  top: 50%;
  left: 3px;
  right: 3px;
  width: auto;
  height: 2px;
  transform: translateY(-50%);
  background-color: #fff;
}

.menu-matrix-check :deep(.el-checkbox__inner:hover) {
  border-color: #0f4a32;
}

.menu-matrix-check :deep(.el-checkbox__input.is-focus .el-checkbox__inner) {
  border-color: #0f4a32;
  box-shadow: 0 0 0 3px rgba(15, 74, 50, 0.14);
}
</style>
