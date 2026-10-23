<script setup lang="ts">
import { useResourcePermissions } from '@/composables/useResourcePermissions'
const perms = useResourcePermissions('menus')
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Rank } from '@element-plus/icons-vue'
import { fetchMenus, reorderMenusApi, updateMenuApi } from '@/api/menus'
import { fetchRoleMenuMatrixApi, saveRoleMenuMatrixApi } from '@/api/roles'
import type { MenuRecord, MenuType } from '@/types/menu'
import { useIsMobile } from '@/composables/useMediaQuery'
import AuditDetailSection from '@/components/AuditDetailSection.vue'
import { measureActionColWidth } from '@/composables/useActionColWidth'
import { useNavStore } from '@/stores/nav'
import { menuDisplayName } from '@/utils/menuLabel'

const { t, locale, te } = useI18n()
const isMobile = useIsMobile()
const navStore = useNavStore()
const menuActionWidth = computed(() => {
  void locale.value
  return measureActionColWidth([t('common.edit')])
})

const loading = ref(false)
const saving = ref(false)
const reordering = ref(false)
const formVisible = ref(false)
const editing = ref<MenuRecord | null>(null)
const flat = ref<MenuRecord[]>([])

const matrixRoles = ref<Array<{ id: string; code: string; name: string; isSystem: boolean }>>([])
const matrixMenus = ref<MenuRecord[]>([])
/** roleId -> Set(menuId) */
const matrixChecked = ref<Record<string, Set<string>>>({})

const dragMenuId = ref<string | null>(null)
const dragOverMenuId = ref<string | null>(null)

const dialogWidth = computed(() => (isMobile.value ? '94%' : '480px'))

const form = reactive({
  parentId: '' as string | '',
  type: 'menu' as MenuType,
  name: '',
  nameEn: '',
  sortOrder: 0,
  active: true,
})

const parentOptions = computed(() =>
  flat.value
    .filter((m) => m.type === 'directory' && (!editing.value || m.id !== editing.value.id))
    .map((m) => ({ value: m.id, label: menuLabel(m) })),
)

const typeOptions = computed(() => [
  { value: 'directory', label: t('sysMenu.type.directory') },
  { value: 'menu', label: t('sysMenu.type.menu') },
])

function menuLabel(node: MenuRecord) {
  void locale.value
  return menuDisplayName(node, locale.value, t, te)
}

function parentKey(parentId: string | null | undefined) {
  return parentId || ''
}

/** 依赖拖拽态，保证行 class 随 drag 更新 */
const tableRowClassName = computed(() => {
  const dragging = dragMenuId.value
  const over = dragOverMenuId.value
  return ({ row }: { row: MenuRecord }) => {
    const classes = [row.type === 'directory' ? 'menu-matrix-row--dir' : 'menu-matrix-row--leaf']
    if (dragging === row.id) classes.push('menu-matrix-row--dragging')
    if (over === row.id) classes.push('menu-matrix-row--drag-over')
    return classes.join(' ')
  }
})

function collectChildIds(node: MenuRecord): string[] {
  const ids = [node.id]
  for (const c of node.children || []) ids.push(...collectChildIds(c))
  return ids
}

/** 取得同级菜单所在数组（根或某目录的 children） */
function getSiblingList(parentId: string | null): MenuRecord[] | null {
  if (!parentId) return matrixMenus.value
  const find = (nodes: MenuRecord[]): MenuRecord[] | null => {
    for (const n of nodes) {
      if (n.id === parentId) {
        if (!n.children) n.children = []
        return n.children
      }
      if (n.children?.length) {
        const found = find(n.children)
        if (found) return found
      }
    }
    return null
  }
  return find(matrixMenus.value)
}

function findNode(nodes: MenuRecord[], id: string): MenuRecord | null {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.children?.length) {
      const found = findNode(n.children, id)
      if (found) return found
    }
  }
  return null
}

function onMenuDragStart(row: MenuRecord, e: DragEvent) {
  dragMenuId.value = row.id
  e.dataTransfer?.setData('text/plain', row.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onMenuDragOver(row: MenuRecord, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (!dragMenuId.value || dragMenuId.value === row.id) return
  dragOverMenuId.value = row.id
}

function onMenuDragLeave(row: MenuRecord) {
  if (dragOverMenuId.value === row.id) dragOverMenuId.value = null
}

function onMenuDragEnd() {
  dragMenuId.value = null
  dragOverMenuId.value = null
}

async function onMenuDrop(target: MenuRecord, e: DragEvent) {
  e.preventDefault()
  const fromId = dragMenuId.value || e.dataTransfer?.getData('text/plain')
  dragMenuId.value = null
  dragOverMenuId.value = null
  if (!fromId || fromId === target.id || reordering.value) return

  const source = findNode(matrixMenus.value, fromId)
  if (!source) return

  if (parentKey(source.parentId) !== parentKey(target.parentId)) {
    ElMessage.warning(t('sysMenu.reorderSameParentOnly'))
    return
  }

  const list = getSiblingList(source.parentId)
  if (!list) return

  const fromIdx = list.findIndex((m) => m.id === fromId)
  const toIdx = list.findIndex((m) => m.id === target.id)
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return

  const [item] = list.splice(fromIdx, 1)
  list.splice(toIdx, 0, item)

  const items = list.map((m, i) => {
    m.sortOrder = i
    return { id: m.id, sortOrder: i }
  })

  matrixMenus.value = [...matrixMenus.value]

  reordering.value = true
  try {
    await reorderMenusApi(items)
    ElMessage.success(t('sysMenu.reordered'))
    void navStore.loadNav()
    const orderMap = new Map(items.map((i) => [i.id, i.sortOrder]))
    flat.value = flat.value.map((m) =>
      orderMap.has(m.id) ? { ...m, sortOrder: orderMap.get(m.id)! } : m,
    )
  } catch {
    await loadMatrix()
  } finally {
    reordering.value = false
  }
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

function openEdit(row: MenuRecord) {
  editing.value = row
  Object.assign(form, {
    parentId: row.parentId || '',
    type: row.type,
    name: row.name || '',
    nameEn: row.nameEn || '',
    sortOrder: row.sortOrder,
    active: row.active,
  })
  formVisible.value = true
}

async function saveForm() {
  if (!editing.value) return
  const nameZh = form.name.trim()
  const nameEn = form.nameEn.trim()
  if (!nameZh) {
    ElMessage.warning(t('sysMenu.nameRequired'))
    return
  }
  if (!nameEn) {
    ElMessage.warning(t('sysMenu.nameEnRequired'))
    return
  }
  try {
    await updateMenuApi(editing.value.id, {
      parentId: form.parentId || null,
      type: form.type,
      name: nameZh,
      nameEn,
      sortOrder: form.sortOrder,
      active: form.active,
    })
    ElMessage.success(t('sysMenu.updated'))
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
        <el-button
          v-if="perms.update" v-admin-glow="perms.codes.update"
          type="primary"
          class="lb-btn-primary"
          :loading="saving"
          @click="saveMatrix"
        >
          {{ t('common.save') }}
        </el-button>
      </div>
    </div>

    <div class="table-card" v-loading="loading || reordering">
      <div class="table-scroll">
        <el-table
          :data="matrixMenus"
          height="100%"
          stripe
          border
          row-key="id"
          default-expand-all
          :tree-props="{ children: 'children' }"
          :row-class-name="tableRowClassName"
          style="width: 100%"
          class="menu-matrix-table"
        >
          <el-table-column :label="t('role.matrixFunction')" min-width="240" fixed="left">
            <template #default="{ row }">
              <div
                class="menu-matrix-fn-wrap"
                @dragover="onMenuDragOver(row, $event)"
                @drop="onMenuDrop(row, $event)"
                @dragleave="onMenuDragLeave(row)"
              >
                <button
                  type="button"
                  class="menu-row__handle"
                  draggable="true"
                  :title="t('sysMenu.dragReorder')"
                  aria-label="drag"
                  @dragstart="onMenuDragStart(row, $event)"
                  @dragend="onMenuDragEnd"
                >
                  <el-icon :size="14"><Rank /></el-icon>
                </button>
                <span class="menu-matrix-fn" :class="{ 'is-dir': row.type === 'directory' }">
                  {{ menuLabel(row) }}
                </span>
              </div>
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
            header-align="center"
            class-name="col-switch"
            label-class-name="col-switch"
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
    </div>

    <el-dialog
      v-model="formVisible"
      :title="t('sysMenu.edit')"
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
        <el-form-item :label="t('sysMenu.fields.nameEn')" required>
          <el-input v-model="form.nameEn" />
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
        <AuditDetailSection
          v-if="editing"
          :created-by="editing.createdBy"
          :created-at="editing.createdAt"
          :updated-by="editing.updatedBy"
          :updated-at="editing.updatedAt"
        />
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
.menu-matrix-fn-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
}

.menu-row__handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: #8a9590;
  cursor: grab;
  flex: 0 0 auto;
}

.menu-row__handle:hover {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #fff);
  color: var(--lb-brand, #0f4a32);
}

.menu-row__handle:active {
  cursor: grabbing;
}

.menu-matrix-fn {
  display: inline-block;
  line-height: 1.4;
  color: #3a4a42;
  min-width: 0;
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

.menu-matrix-table :deep(.menu-matrix-row--dragging > td.el-table__cell) {
  opacity: 0.55;
}

.menu-matrix-table :deep(.menu-matrix-row--drag-over > td.el-table__cell) {
  box-shadow: inset 0 -2px 0 0 var(--lb-brand, #0f4a32);
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
