<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import { Collection, Iphone, Plus, Rank, Search, Tickets } from '@element-plus/icons-vue'
import {
  createWhatsappBusinessNumberApi,
  deleteWhatsappBusinessNumberApi,
  fetchWhatsappBusinessNumbers,
  reorderWhatsappBusinessNumbersApi,
  updateWhatsappBusinessNumberApi,
} from '@/api/whatsapp-business-numbers'
import {
  createWhatsappTemplateApi,
  deleteWhatsappTemplateApi,
  fetchWhatsappTemplates,
  reorderWhatsappTemplatesApi,
  updateWhatsappTemplateApi,
} from '@/api/whatsapp-templates'
import {
  createWhatsappTemplateCategoryApi,
  deleteWhatsappTemplateCategoryApi,
  fetchWhatsappTemplateCategories,
  reorderWhatsappTemplateCategoriesApi,
  updateWhatsappTemplateCategoryApi,
} from '@/api/whatsapp-template-categories'
import { fetchBuildings } from '@/api/buildings'
import { uploadAttachmentApi } from '@/api/uploads'
import type { WhatsappBusinessNumber, WhatsappTemplate, WhatsappTemplateCategory } from '@/types/whatsapp'
import type { BuildingRecord } from '@/types/building'
import { attachmentPublicUrl } from '@/utils/attachmentUrl'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import { useTableColWidth } from '@/composables/useTableColWidth'
import { useActionColWidth } from '@/composables/useActionColWidth'
import { useClientPagination } from '@/composables/useClientPagination'
import TablePagination from '@/components/TablePagination.vue'
import AttachmentImageViewer from '@/components/AttachmentImageViewer.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import {
  WHATSAPP_CATEGORY_BADGE_TONE_OPTIONS,
  whatsappTemplateCategoryTone,
} from '@/constants/statusBadges'
import type { WhatsappCategoryBadgeTone } from '@/types/whatsapp'

const { t } = useI18n()
const perms = useResourcePermissions('systemSettings')
const { colW, textColW, statusColW, tableLayoutKey } = useTableColWidth()

const { actionColW } = useActionColWidth()

/** 大屏（≥1440）列宽略收；小屏略宽，减少截断 */
const isWideViewport = ref(
  typeof window !== 'undefined' && window.matchMedia('(min-width: 1440px)').matches,
)
let wideViewportMql: MediaQueryList | null = null
function onWideViewportChange(e: MediaQueryListEvent) {
  isWideViewport.value = e.matches
}

/** 启用列：仅开关，按表头测宽即可，勿用 statusColW（会按状态徽章估过宽） */
const activeColW = computed(() =>
  colW(t('systemSettings.fields.whatsappActive'), { contentMin: 52 }),
)

const templateLabelColW = computed(() =>
  colW(t('systemSettings.fields.whatsappTemplateLabel'), {
    contentMin: isWideViewport.value ? 152 : 176,
  }),
)
const templateNameColW = computed(() =>
  colW(t('systemSettings.fields.whatsappTemplateName'), {
    contentMin: isWideViewport.value ? 160 : 188,
  }),
)
const templateDiagramColW = computed(() =>
  colW(t('systemSettings.fields.whatsappDiagram'), {
    contentMin: isWideViewport.value ? 52 : 64,
  }),
)
/** 固定 width：避免 min-width 被表格剩余空间拉宽；略收紧徽章列留白 */
const templateCategoryColW = computed(() =>
  Math.max(
    96,
    statusColW(
      t('systemSettings.fields.whatsappTemplateCategory'),
      [
        ...categories.value.map((c) => c.label),
        ...templates.value.map((r) => r.categoryLabel),
      ].filter(Boolean),
      { interactive: false },
    ) - 16,
  ),
)

type WaTab = 'numbers' | 'templates' | 'categories'
const activeTab = ref<WaTab>('numbers')
const keyword = ref('')

const numbersLoading = ref(false)
const templatesLoading = ref(false)
const numbersReordering = ref(false)
const templatesReordering = ref(false)
const numbers = ref<WhatsappBusinessNumber[]>([])
const templates = ref<WhatsappTemplate[]>([])
const categories = ref<WhatsappTemplateCategory[]>([])

const numberDialogVisible = ref(false)
const templateDialogVisible = ref(false)
const categoryDialogVisible = ref(false)
const numberSaving = ref(false)
const templateSaving = ref(false)
const categorySaving = ref(false)
const categoriesLoading = ref(false)
const categoriesReordering = ref(false)
const uploadingDiagram = ref(false)
const diagramInputRef = ref<HTMLInputElement | null>(null)
const diagramViewerVisible = ref(false)
const diagramViewerUrl = ref('')
const diagramViewerTitle = ref('')
const editingNumber = ref<WhatsappBusinessNumber | null>(null)
const editingTemplate = ref<WhatsappTemplate | null>(null)
const editingCategory = ref<WhatsappTemplateCategory | null>(null)

const dragNumberId = ref<string | null>(null)
const dragOverNumberId = ref<string | null>(null)
const dragOverNumberEdge = ref<'before' | 'after' | null>(null)
const dragTemplateId = ref<string | null>(null)
const dragOverTemplateId = ref<string | null>(null)
const dragOverTemplateEdge = ref<'before' | 'after' | null>(null)
const dragCategoryId = ref<string | null>(null)
const dragOverCategoryId = ref<string | null>(null)
const dragOverCategoryEdge = ref<'before' | 'after' | null>(null)

/** 落点在行上半 → before（上边框）；下半 → after（下边框） */
function dragEdgeFromEvent(e: DragEvent): 'before' | 'after' {
  const tr = (e.currentTarget as HTMLElement | null)?.closest?.('tr')
    || (e.target as HTMLElement | null)?.closest?.('tr')
  if (!tr) return 'before'
  const rect = tr.getBoundingClientRect()
  return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

function reorderByEdge<T>(list: T[], fromIdx: number, toIdx: number, edge: 'before' | 'after'): T[] {
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return list
  let insertIdx = edge === 'after' ? toIdx + 1 : toIdx
  const next = [...list]
  const [item] = next.splice(fromIdx, 1)
  if (fromIdx < insertIdx) insertIdx -= 1
  if (insertIdx === fromIdx) return list
  next.splice(insertIdx, 0, item)
  return next
}

const numberForm = reactive({
  label: '',
  phoneNumber: '',
  remark: '',
  active: true,
})

const templateForm = reactive({
  buildingIds: [] as string[],
  categoryId: '',
  label: '',
  templateName: '',
  remark: '',
  diagramKey: '',
  diagramUrl: '',
  active: true,
})

const categoryForm = reactive({
  code: '',
  label: '',
  badgeTone: 'neutral' as WhatsappCategoryBadgeTone | string,
  remark: '',
  active: true,
})

const categoryBadgeToneOptions = WHATSAPP_CATEGORY_BADGE_TONE_OPTIONS

/** 模板表单：大厦下拉懒加载 */
const buildingSelectOptions = ref<BuildingRecord[]>([])
const buildingSelectLoading = ref(false)
const buildingSelectLoadingMore = ref(false)
const buildingSelectPage = ref(1)
const buildingSelectHasMore = ref(true)
const buildingSelectKeyword = ref('')
let buildingSelectScrollEl: HTMLElement | null = null
let buildingSelectScrollRaf = 0

const diagramPreviewUrl = computed(
  () => templateForm.diagramUrl || attachmentPublicUrl(templateForm.diagramKey) || '',
)

const numberActionColW = actionColW([
  perms.update && t('common.edit'),
  perms.update && t('common.delete'),
])
const templateActionColW = numberActionColW

const numbersActiveCount = computed(() => numbers.value.filter((n) => n.active).length)
const templatesActiveCount = computed(() => templates.value.filter((n) => n.active).length)
const categoriesActiveCount = computed(() => categories.value.filter((n) => n.active).length)

const filteredNumbers = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return numbers.value
  return numbers.value.filter((n) =>
    [n.label, n.phoneNumber, n.remark]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

const filteredTemplates = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return templates.value
  return templates.value.filter((n) =>
    [n.label, n.templateName, n.buildingNames, n.categoryLabel, n.categoryCode, n.remark]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

const filteredCategories = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return categories.value
  return categories.value.filter((n) =>
    [n.label, n.code, n.remark].join(' ').toLowerCase().includes(q),
  )
})

const searchPlaceholder = computed(() => {
  if (activeTab.value === 'numbers') return t('systemSettings.whatsapp.searchNumbersPlaceholder')
  if (activeTab.value === 'categories') return t('systemSettings.whatsapp.searchCategoriesPlaceholder')
  return t('systemSettings.whatsapp.searchTemplatesPlaceholder')
})

const categorySelectOptions = computed(() => {
  const list = [...categories.value]
  const id = templateForm.categoryId
  if (id && !list.some((c) => c.id === id) && editingTemplate.value?.categoryId === id) {
    list.unshift({
      id,
      code: editingTemplate.value.categoryCode || '',
      label: editingTemplate.value.categoryLabel || id,
      badgeTone: editingTemplate.value.categoryBadgeTone || 'neutral',
      remark: '',
      sortOrder: 0,
      active: true,
      templateCount: 0,
      createdBy: '',
      createdAt: '',
      updatedBy: '',
      updatedAt: '',
    })
  }
  return list
})

const {
  page: numbersPage,
  pageSize: numbersPageSize,
  pageSizes: numbersPageSizes,
  paged: numbersPaged,
  total: numbersTotal,
  rowIndex: numbersRowIndex,
  resetPage: resetNumbersPage,
} = useClientPagination(filteredNumbers)

const {
  page: templatesPage,
  pageSize: templatesPageSize,
  pageSizes: templatesPageSizes,
  paged: templatesPaged,
  total: templatesTotal,
  rowIndex: templatesRowIndex,
  resetPage: resetTemplatesPage,
} = useClientPagination(filteredTemplates)

const {
  page: categoriesPage,
  pageSize: categoriesPageSize,
  pageSizes: categoriesPageSizes,
  paged: categoriesPaged,
  total: categoriesTotal,
  rowIndex: categoriesRowIndex,
  resetPage: resetCategoriesPage,
} = useClientPagination(filteredCategories)

watch(keyword, () => {
  resetNumbersPage()
  resetTemplatesPage()
  resetCategoriesPage()
})

function errMsg(e: unknown): string {
  const raw = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data
    ?.message
  if (Array.isArray(raw)) return raw.join('; ')
  if (typeof raw === 'string' && raw.trim()) return raw
  return e instanceof Error ? e.message : String(e)
}

function nextSortOrder(rows: Array<{ sortOrder: number }>) {
  return rows.reduce((max, row) => Math.max(max, row.sortOrder ?? 0), -1) + 1
}

function numbersRowClassName({ row }: { row: WhatsappBusinessNumber }) {
  const classes: string[] = []
  if (dragNumberId.value === row.id) classes.push('wa-row--dragging')
  if (dragOverNumberId.value === row.id) {
    classes.push(
      dragOverNumberEdge.value === 'after' ? 'wa-row--drag-over-after' : 'wa-row--drag-over-before',
    )
  }
  return classes.join(' ')
}

function templatesRowClassName({ row }: { row: WhatsappTemplate }) {
  const classes: string[] = []
  if (dragTemplateId.value === row.id) classes.push('wa-row--dragging')
  if (dragOverTemplateId.value === row.id) {
    classes.push(
      dragOverTemplateEdge.value === 'after'
        ? 'wa-row--drag-over-after'
        : 'wa-row--drag-over-before',
    )
  }
  return classes.join(' ')
}

function categoriesRowClassName({ row }: { row: WhatsappTemplateCategory }) {
  const classes: string[] = []
  if (dragCategoryId.value === row.id) classes.push('wa-row--dragging')
  if (dragOverCategoryId.value === row.id) {
    classes.push(
      dragOverCategoryEdge.value === 'after'
        ? 'wa-row--drag-over-after'
        : 'wa-row--drag-over-before',
    )
  }
  return classes.join(' ')
}

function appendUniqueById<T extends { id: string }>(prev: T[], next: T[]) {
  const seen = new Set(prev.map((x) => x.id))
  for (const item of next) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    prev.push(item)
  }
}

function onNumberDragStart(row: WhatsappBusinessNumber, e: DragEvent) {
  if (!perms.update) return
  dragNumberId.value = row.id
  e.dataTransfer?.setData('text/plain', row.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onNumberDragOver(row: WhatsappBusinessNumber, e: DragEvent) {
  if (!perms.update) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (!dragNumberId.value || dragNumberId.value === row.id) return
  dragOverNumberId.value = row.id
  dragOverNumberEdge.value = dragEdgeFromEvent(e)
}

function onNumberDragLeave(row: WhatsappBusinessNumber) {
  if (dragOverNumberId.value === row.id) {
    dragOverNumberId.value = null
    dragOverNumberEdge.value = null
  }
}

function onNumberDragEnd() {
  dragNumberId.value = null
  dragOverNumberId.value = null
  dragOverNumberEdge.value = null
}

async function onNumberDrop(target: WhatsappBusinessNumber, e: DragEvent) {
  e.preventDefault()
  const fromId = dragNumberId.value || e.dataTransfer?.getData('text/plain')
  const edge = dragOverNumberEdge.value || dragEdgeFromEvent(e)
  dragNumberId.value = null
  dragOverNumberId.value = null
  dragOverNumberEdge.value = null
  if (!perms.update || !fromId || fromId === target.id || numbersReordering.value) return

  const fromIdx = numbers.value.findIndex((n) => n.id === fromId)
  const toIdx = numbers.value.findIndex((n) => n.id === target.id)
  const list = reorderByEdge(numbers.value, fromIdx, toIdx, edge)
  if (list === numbers.value) return
  const items = list.map((n, i) => ({ id: n.id, sortOrder: i }))
  const prev = numbers.value
  numbers.value = list.map((n, i) => ({ ...n, sortOrder: i }))

  numbersReordering.value = true
  try {
    await reorderWhatsappBusinessNumbersApi(items)
  } catch (err) {
    numbers.value = prev
    await ElMessageBox.alert(errMsg(err), t('common.tip'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
  } finally {
    numbersReordering.value = false
  }
}

function onTemplateDragStart(row: WhatsappTemplate, e: DragEvent) {
  if (!perms.update) return
  dragTemplateId.value = row.id
  e.dataTransfer?.setData('text/plain', row.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onTemplateDragOver(row: WhatsappTemplate, e: DragEvent) {
  if (!perms.update) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (!dragTemplateId.value || dragTemplateId.value === row.id) return
  dragOverTemplateId.value = row.id
  dragOverTemplateEdge.value = dragEdgeFromEvent(e)
}

function onTemplateDragLeave(row: WhatsappTemplate) {
  if (dragOverTemplateId.value === row.id) {
    dragOverTemplateId.value = null
    dragOverTemplateEdge.value = null
  }
}

function onTemplateDragEnd() {
  dragTemplateId.value = null
  dragOverTemplateId.value = null
  dragOverTemplateEdge.value = null
}

async function onTemplateDrop(target: WhatsappTemplate, e: DragEvent) {
  e.preventDefault()
  const fromId = dragTemplateId.value || e.dataTransfer?.getData('text/plain')
  const edge = dragOverTemplateEdge.value || dragEdgeFromEvent(e)
  dragTemplateId.value = null
  dragOverTemplateId.value = null
  dragOverTemplateEdge.value = null
  if (!perms.update || !fromId || fromId === target.id || templatesReordering.value) return

  const fromIdx = templates.value.findIndex((n) => n.id === fromId)
  const toIdx = templates.value.findIndex((n) => n.id === target.id)
  const list = reorderByEdge(templates.value, fromIdx, toIdx, edge)
  if (list === templates.value) return
  const items = list.map((n, i) => ({ id: n.id, sortOrder: i }))
  const prev = templates.value
  templates.value = list.map((n, i) => ({ ...n, sortOrder: i }))

  templatesReordering.value = true
  try {
    await reorderWhatsappTemplatesApi(items)
  } catch (err) {
    templates.value = prev
    await ElMessageBox.alert(errMsg(err), t('common.tip'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
  } finally {
    templatesReordering.value = false
  }
}

async function loadNumbers() {
  numbersLoading.value = true
  try {
    const { data } = await fetchWhatsappBusinessNumbers({ activeOnly: false })
    numbers.value = data
  } catch (e) {
    await ElMessageBox.alert(errMsg(e), t('common.tip'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
  } finally {
    numbersLoading.value = false
  }
}

async function loadTemplates() {
  templatesLoading.value = true
  try {
    const { data } = await fetchWhatsappTemplates({ activeOnly: false })
    templates.value = data
  } catch (e) {
    await ElMessageBox.alert(errMsg(e), t('common.tip'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
  } finally {
    templatesLoading.value = false
  }
}

async function loadCategories() {
  categoriesLoading.value = true
  try {
    const { data } = await fetchWhatsappTemplateCategories({ activeOnly: false })
    categories.value = data
  } catch (e) {
    await ElMessageBox.alert(errMsg(e), t('common.tip'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
  } finally {
    categoriesLoading.value = false
  }
}

async function loadBuildingPage(reset: boolean) {
  if (reset) {
    buildingSelectLoading.value = true
    buildingSelectPage.value = 1
    buildingSelectHasMore.value = true
  } else {
    if (!buildingSelectHasMore.value || buildingSelectLoadingMore.value) return
    buildingSelectLoadingMore.value = true
  }
  const page = reset ? 1 : buildingSelectPage.value + 1
  const scrollEl = buildingSelectScrollEl
  const prevTop = scrollEl?.scrollTop ?? 0
  try {
    const { data } = await fetchBuildings({
      keyword: buildingSelectKeyword.value.trim() || undefined,
      activeOnly: true,
      page,
      pageSize: 20,
    })
    const items = data.items || []
    if (reset) {
      const pinned = buildingSelectOptions.value.filter((b) =>
        templateForm.buildingIds.includes(b.id),
      )
      buildingSelectOptions.value = pinned
      appendUniqueById(buildingSelectOptions.value, items)
    } else {
      appendUniqueById(buildingSelectOptions.value, items)
    }
    buildingSelectPage.value = page
    buildingSelectHasMore.value = items.length >= 20 && buildingSelectOptions.value.length < data.total
    if (!reset && scrollEl) {
      await nextTick()
      scrollEl.scrollTop = prevTop
    }
  } catch (e) {
    if (reset) {
      await ElMessageBox.alert(errMsg(e), t('common.tip'), {
        type: 'error',
        confirmButtonText: t('common.confirm'),
      })
    }
  } finally {
    buildingSelectLoading.value = false
    buildingSelectLoadingMore.value = false
  }
}

function searchBuildingRemote(q: string) {
  buildingSelectKeyword.value = q
  void loadBuildingPage(true)
}

function unbindBuildingSelectScroll() {
  if (buildingSelectScrollEl) {
    buildingSelectScrollEl.removeEventListener('scroll', onBuildingSelectScroll)
    buildingSelectScrollEl = null
  }
  if (buildingSelectScrollRaf) {
    cancelAnimationFrame(buildingSelectScrollRaf)
    buildingSelectScrollRaf = 0
  }
}

function onBuildingSelectScroll() {
  if (buildingSelectScrollRaf) return
  buildingSelectScrollRaf = requestAnimationFrame(() => {
    buildingSelectScrollRaf = 0
    const el = buildingSelectScrollEl
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) void loadBuildingPage(false)
  })
}

function onBuildingSelectVisible(open: boolean) {
  if (!open) {
    unbindBuildingSelectScroll()
    return
  }
  buildingSelectKeyword.value = ''
  void loadBuildingPage(true).then(() => {
    void nextTick(() => {
      const wrap =
        document.querySelector('.wa-building-select-popper .el-select-dropdown__wrap') ||
        document.querySelector('.wa-building-select-popper .el-scrollbar__wrap')
      if (wrap instanceof HTMLElement) {
        buildingSelectScrollEl = wrap
        wrap.addEventListener('scroll', onBuildingSelectScroll, { passive: true })
      }
    })
  })
}

function seedBuildingOptions(row: WhatsappTemplate) {
  const refs = row.buildings?.length
    ? row.buildings
    : (row.buildingIds || []).map((id) => ({ id, name: id }))
  for (const b of refs) {
    if (!b?.id) continue
    if (buildingSelectOptions.value.some((x) => x.id === b.id)) continue
    buildingSelectOptions.value.unshift({
      id: b.id,
      name: b.name || b.id,
      address: '',
      addressEn: '',
      manager: '',
      managerPhone: '',
      email: '',
      workingHours: '',
      roomIds: [],
      active: true,
      createdBy: '',
      createdAt: '',
      updatedBy: '',
      updatedAt: '',
    })
  }
}

function openCreateNumber() {
  editingNumber.value = null
  numberForm.label = ''
  numberForm.phoneNumber = ''
  numberForm.remark = ''
  numberForm.active = true
  numberDialogVisible.value = true
}

function openEditNumber(row: WhatsappBusinessNumber) {
  editingNumber.value = row
  numberForm.label = row.label
  numberForm.phoneNumber = row.phoneNumber
  numberForm.remark = row.remark ?? ''
  numberForm.active = row.active
  numberDialogVisible.value = true
}

async function saveNumber() {
  const label = numberForm.label.trim()
  const phoneNumber = numberForm.phoneNumber.trim()
  if (!label) {
    await ElMessageBox.alert(t('systemSettings.whatsapp.labelRequired'), t('common.tip'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  if (!phoneNumber) {
    await ElMessageBox.alert(t('systemSettings.whatsapp.phoneRequired'), t('common.tip'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  numberSaving.value = true
  const isCreate = !editingNumber.value
  try {
    const payload = {
      label,
      phoneNumber,
      remark: numberForm.remark.trim(),
      active: !!numberForm.active,
      ...(editingNumber.value ? {} : { sortOrder: nextSortOrder(numbers.value) }),
    }
    if (editingNumber.value) {
      await updateWhatsappBusinessNumberApi(editingNumber.value.id, payload)
    } else {
      await createWhatsappBusinessNumberApi(payload)
    }
    numberDialogVisible.value = false
    await loadNumbers()
    if (isCreate) resetNumbersPage()
  } catch (e) {
    await ElMessageBox.alert(errMsg(e), t('common.tip'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
  } finally {
    numberSaving.value = false
  }
}

async function onDeleteNumber(row: WhatsappBusinessNumber) {
  try {
    await ElMessageBox.confirm(
      t('systemSettings.whatsapp.deleteNumberConfirm', { label: row.label }),
      t('common.tip'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') },
    )
  } catch {
    return
  }
  try {
    await deleteWhatsappBusinessNumberApi(row.id)
    await loadNumbers()
  } catch (e) {
    await ElMessageBox.alert(errMsg(e), t('common.tip'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
  }
}


async function onToggleNumberActive(row: WhatsappBusinessNumber, active: boolean) {
  try {
    await updateWhatsappBusinessNumberApi(row.id, { active })
    row.active = active
  } catch (e) {
    await ElMessageBox.alert(errMsg(e), t('common.tip'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
    await loadNumbers()
  }
}

function openCreateTemplate() {
  editingTemplate.value = null
  templateForm.buildingIds = []
  templateForm.categoryId = ''
  templateForm.label = ''
  templateForm.templateName = ''
  templateForm.remark = ''
  templateForm.diagramKey = ''
  templateForm.diagramUrl = ''
  templateForm.active = true
  buildingSelectOptions.value = []
  void loadCategories()
  templateDialogVisible.value = true
}

function openEditTemplate(row: WhatsappTemplate) {
  editingTemplate.value = row
  templateForm.buildingIds = [...(row.buildingIds || [])]
  templateForm.categoryId = row.categoryId
  templateForm.label = row.label
  templateForm.templateName = row.templateName
  templateForm.remark = row.remark ?? ''
  templateForm.diagramKey = row.diagramKey ?? ''
  templateForm.diagramUrl = row.diagramUrl || attachmentPublicUrl(row.diagramKey) || ''
  templateForm.active = row.active
  seedBuildingOptions(row)
  void loadCategories()
  templateDialogVisible.value = true
}

function openCreateCategory() {
  editingCategory.value = null
  categoryForm.code = ''
  categoryForm.label = ''
  categoryForm.badgeTone = 'neutral'
  categoryForm.remark = ''
  categoryForm.active = true
  categoryDialogVisible.value = true
}

function openEditCategory(row: WhatsappTemplateCategory) {
  editingCategory.value = row
  categoryForm.code = row.code
  categoryForm.label = row.label
  categoryForm.badgeTone = row.badgeTone || 'neutral'
  categoryForm.remark = row.remark ?? ''
  categoryForm.active = row.active
  categoryDialogVisible.value = true
}

function openDiagramPicker() {
  if (!perms.update || uploadingDiagram.value) return
  diagramInputRef.value?.click()
}

function openDiagramViewer(url?: string, title?: string) {
  const src = (url || diagramPreviewUrl.value || '').trim()
  if (!src || diagramViewerVisible.value) return
  diagramViewerUrl.value = src
  diagramViewerTitle.value = (title || templateForm.label || '').trim()
  // 延后挂载：避免同一次 click 落到刚出现的 image-viewer 遮罩上，立刻 hide-on-click-modal 关掉
  void nextTick(() => {
    window.setTimeout(() => {
      if (diagramViewerUrl.value) diagramViewerVisible.value = true
    }, 0)
  })
}

function closeDiagramViewer() {
  diagramViewerVisible.value = false
  diagramViewerUrl.value = ''
  diagramViewerTitle.value = ''
}

function diagramUrlOf(row: WhatsappTemplate) {
  return row.diagramUrl || attachmentPublicUrl(row.diagramKey) || ''
}

function clearDiagram() {
  if (!perms.update || uploadingDiagram.value) return
  templateForm.diagramKey = ''
  templateForm.diagramUrl = ''
}

async function onDiagramFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !perms.update) return
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    await ElMessageBox.alert(t('systemSettings.whatsapp.diagramInvalidType'), t('common.tip'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    await ElMessageBox.alert(t('systemSettings.whatsapp.diagramTooLarge'), t('common.tip'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  uploadingDiagram.value = true
  try {
    const { data } = await uploadAttachmentApi(file)
    templateForm.diagramKey = data.storageKey
    templateForm.diagramUrl = data.publicUrl || attachmentPublicUrl(data.storageKey)
  } catch (e) {
    await ElMessageBox.alert(
      errMsg(e) || t('systemSettings.whatsapp.diagramUploadFailed'),
      t('common.tip'),
      { type: 'error', confirmButtonText: t('common.confirm') },
    )
  } finally {
    uploadingDiagram.value = false
  }
}

async function saveTemplate() {
  const buildingIds = [...new Set(templateForm.buildingIds.map((id) => id.trim()).filter(Boolean))]
  const categoryId = templateForm.categoryId.trim()
  const label = templateForm.label.trim()
  const templateName = templateForm.templateName.trim()
  if (!buildingIds.length) {
    await ElMessageBox.alert(t('systemSettings.whatsapp.buildingRequired'), t('common.tip'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  if (!categoryId) {
    await ElMessageBox.alert(t('systemSettings.whatsapp.categoryRequired'), t('common.tip'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  if (!label) {
    await ElMessageBox.alert(t('systemSettings.whatsapp.labelRequired'), t('common.tip'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  if (!templateName) {
    await ElMessageBox.alert(t('systemSettings.whatsapp.templateNameRequired'), t('common.tip'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  templateSaving.value = true
  const isCreate = !editingTemplate.value
  try {
    const payload = {
      buildingIds,
      categoryId,
      label,
      templateName,
      remark: templateForm.remark.trim(),
      diagramKey: templateForm.diagramKey.trim(),
      active: !!templateForm.active,
      ...(editingTemplate.value ? {} : { sortOrder: nextSortOrder(templates.value) }),
    }
    if (editingTemplate.value) {
      await updateWhatsappTemplateApi(editingTemplate.value.id, payload)
    } else {
      await createWhatsappTemplateApi(payload)
    }
    templateDialogVisible.value = false
    await loadTemplates()
    if (isCreate) resetTemplatesPage()
  } catch (e) {
    await ElMessageBox.alert(errMsg(e), t('common.tip'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
  } finally {
    templateSaving.value = false
  }
}

async function saveCategory() {
  const code = categoryForm.code.trim().toLowerCase()
  const label = categoryForm.label.trim()
  if (!code) {
    await ElMessageBox.alert(t('systemSettings.whatsapp.categoryCodeRequired'), t('common.tip'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  if (!label) {
    await ElMessageBox.alert(t('systemSettings.whatsapp.categoryLabelRequired'), t('common.tip'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  categorySaving.value = true
  const isCreate = !editingCategory.value
  try {
    const payload = {
      code,
      label,
      badgeTone: whatsappTemplateCategoryTone(categoryForm.badgeTone),
      remark: categoryForm.remark.trim(),
      active: !!categoryForm.active,
      ...(editingCategory.value ? {} : { sortOrder: nextSortOrder(categories.value) }),
    }
    if (editingCategory.value) {
      await updateWhatsappTemplateCategoryApi(editingCategory.value.id, payload)
    } else {
      await createWhatsappTemplateCategoryApi(payload)
    }
    categoryDialogVisible.value = false
    await loadCategories()
    if (isCreate) resetCategoriesPage()
  } catch (e) {
    await ElMessageBox.alert(errMsg(e), t('common.tip'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
  } finally {
    categorySaving.value = false
  }
}

async function onDeleteCategory(row: WhatsappTemplateCategory) {
  try {
    await ElMessageBox.confirm(
      t('systemSettings.whatsapp.deleteCategoryConfirm', { label: row.label }),
      t('common.tip'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') },
    )
  } catch {
    return
  }
  try {
    await deleteWhatsappTemplateCategoryApi(row.id)
    await loadCategories()
  } catch (e) {
    await ElMessageBox.alert(errMsg(e), t('common.tip'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
  }
}

async function onToggleCategoryActive(row: WhatsappTemplateCategory, active: boolean) {
  try {
    await updateWhatsappTemplateCategoryApi(row.id, { active })
    row.active = active
  } catch (e) {
    await ElMessageBox.alert(errMsg(e), t('common.tip'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
    await loadCategories()
  }
}

function onCategoryDragStart(row: WhatsappTemplateCategory, e: DragEvent) {
  if (!perms.update) return
  dragCategoryId.value = row.id
  e.dataTransfer?.setData('text/plain', row.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onCategoryDragOver(row: WhatsappTemplateCategory, e: DragEvent) {
  if (!perms.update) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  if (!dragCategoryId.value || dragCategoryId.value === row.id) return
  dragOverCategoryId.value = row.id
  dragOverCategoryEdge.value = dragEdgeFromEvent(e)
}

function onCategoryDragLeave(row: WhatsappTemplateCategory) {
  if (dragOverCategoryId.value === row.id) {
    dragOverCategoryId.value = null
    dragOverCategoryEdge.value = null
  }
}

function onCategoryDragEnd() {
  dragCategoryId.value = null
  dragOverCategoryId.value = null
  dragOverCategoryEdge.value = null
}

async function onCategoryDrop(target: WhatsappTemplateCategory, e: DragEvent) {
  e.preventDefault()
  const fromId = dragCategoryId.value || e.dataTransfer?.getData('text/plain')
  const edge = dragOverCategoryEdge.value || dragEdgeFromEvent(e)
  dragCategoryId.value = null
  dragOverCategoryId.value = null
  dragOverCategoryEdge.value = null
  if (!perms.update || !fromId || fromId === target.id || categoriesReordering.value) return

  const fromIdx = categories.value.findIndex((n) => n.id === fromId)
  const toIdx = categories.value.findIndex((n) => n.id === target.id)
  const list = reorderByEdge(categories.value, fromIdx, toIdx, edge)
  if (list === categories.value) return
  const items = list.map((n, i) => ({ id: n.id, sortOrder: i }))
  const prev = categories.value
  categories.value = list.map((n, i) => ({ ...n, sortOrder: i }))

  categoriesReordering.value = true
  try {
    await reorderWhatsappTemplateCategoriesApi(items)
  } catch (err) {
    categories.value = prev
    await ElMessageBox.alert(errMsg(err), t('common.tip'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
  } finally {
    categoriesReordering.value = false
  }
}

function openCreateForActiveTab() {
  if (activeTab.value === 'numbers') openCreateNumber()
  else if (activeTab.value === 'categories') openCreateCategory()
  else openCreateTemplate()
}

function addButtonLabel() {
  if (activeTab.value === 'numbers') return t('systemSettings.whatsapp.addNumber')
  if (activeTab.value === 'categories') return t('systemSettings.whatsapp.addCategory')
  return t('systemSettings.whatsapp.addTemplate')
}

async function onDeleteTemplate(row: WhatsappTemplate) {
  try {
    await ElMessageBox.confirm(
      t('systemSettings.whatsapp.deleteTemplateConfirm', { label: row.label }),
      t('common.tip'),
      { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') },
    )
  } catch {
    return
  }
  try {
    await deleteWhatsappTemplateApi(row.id)
    await loadTemplates()
  } catch (e) {
    await ElMessageBox.alert(errMsg(e), t('common.tip'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
  }
}

async function onToggleTemplateActive(row: WhatsappTemplate, active: boolean) {
  try {
    await updateWhatsappTemplateApi(row.id, { active })
    row.active = active
  } catch (e) {
    await ElMessageBox.alert(errMsg(e), t('common.tip'), {
      type: 'error',
      confirmButtonText: t('common.confirm'),
    })
    await loadTemplates()
  }
}

onMounted(() => {
  void loadNumbers()
  void loadTemplates()
  void loadCategories()
  if (typeof window === 'undefined') return
  wideViewportMql = window.matchMedia('(min-width: 1440px)')
  isWideViewport.value = wideViewportMql.matches
  wideViewportMql.addEventListener('change', onWideViewportChange)
})

onUnmounted(() => {
  unbindBuildingSelectScroll()
  wideViewportMql?.removeEventListener('change', onWideViewportChange)
  wideViewportMql = null
})
</script>

<template>
  <div class="wa-settings">
    <div class="wa-tabs-wrap">
      <div class="wa-tabs-wrap__actions">
        <el-input
          v-model="keyword"
          clearable
          class="head-search wa-tabs-wrap__search"
          :prefix-icon="Search"
          :placeholder="searchPlaceholder"
        />
        <el-button
          v-if="perms.update"
          v-admin-glow="perms.codes.update"
          type="primary"
          class="lb-btn-primary"
          @click="openCreateForActiveTab()"
        >
          <el-icon class="el-icon--left"><Plus /></el-icon>
          {{ addButtonLabel() }}
        </el-button>
      </div>

      <el-tabs v-model="activeTab" class="wa-tabs">
      <el-tab-pane name="numbers">
        <template #label>
          <span class="wa-tab-label">
            <el-icon :size="16"><Iphone /></el-icon>
            <span>{{ t('systemSettings.sections.whatsappNumbers') }}</span>
            <span class="wa-tab-count" :title="t('systemSettings.whatsapp.activeOfTotal', { active: numbersActiveCount, total: numbers.length })">
              {{ numbers.length }}
            </span>
          </span>
        </template>

        <div class="wa-pane">
          <div class="table-card wa-pane__table">
            <div
              v-loading="numbersLoading || numbersReordering"
              class="table-scroll"
              element-loading-background="rgba(247, 250, 248, 0.78)"
            >
              <el-table
                :key="`${tableLayoutKey}-numbers`"
                class="wa-table"
                :data="numbersPaged"
                row-key="id"
                height="100%"
                stripe
                border
                :row-class-name="numbersRowClassName"
                style="width: 100%"
              >
                <el-table-column
                  label="#"
                  :width="perms.update ? 60 : 44"
                  fixed="left"
                  align="center"
                  header-align="center"
                  class-name="col-wa-index"
                  label-class-name="col-wa-index"
                >
                  <template #default="{ row, $index }">
                    <div
                      class="wa-index-cell"
                      @dragover="onNumberDragOver(row, $event)"
                      @drop="onNumberDrop(row, $event)"
                      @dragleave="onNumberDragLeave(row)"
                    >
                      <button
                        v-if="perms.update"
                        type="button"
                        class="wa-row__handle"
                        draggable="true"
                        :title="t('systemSettings.whatsapp.dragReorder')"
                        aria-label="drag"
                        @dragstart="onNumberDragStart(row, $event)"
                        @dragend="onNumberDragEnd"
                      >
                        <el-icon :size="14"><Rank /></el-icon>
                      </button>
                      <span class="wa-index-cell__num">{{ numbersRowIndex($index) }}</span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column
                  prop="label"
                  :label="t('systemSettings.fields.whatsappNumberLabel')"
                  :min-width="colW(t('systemSettings.fields.whatsappNumberLabel'), { contentMin: 140 })"
                />
                <el-table-column
                  prop="phoneNumber"
                  :label="t('systemSettings.fields.whatsappPhoneNumber')"
                  :min-width="colW(t('systemSettings.fields.whatsappPhoneNumber'), { contentMin: 148 })"
                  class-name="col-code"
                  label-class-name="col-code"
                />
                <el-table-column
                  prop="remark"
                  :label="t('systemSettings.fields.whatsappRemark')"
                  :min-width="textColW(t('systemSettings.fields.whatsappRemark'), { kind: 'long' })"
                  show-overflow-tooltip
                />
                <el-table-column
                  prop="active"
                  :label="t('systemSettings.fields.whatsappActive')"
                  :width="activeColW"
                  align="center"
                  header-align="center"
                  class-name="col-switch"
                  label-class-name="col-switch"
                >
                  <template #default="{ row }">
                    <el-switch
                      :model-value="row.active"
                      :disabled="!perms.update"
                      @change="(v: string | number | boolean) => onToggleNumberActive(row, !!v)"
                    />
                  </template>
                </el-table-column>
                <el-table-column
                  v-if="perms.update"
                  :label="t('common.actions')"
                  :width="numberActionColW"
                  fixed="right"
                  class-name="col-actions"
                  label-class-name="col-actions"
                >
                  <template #default="{ row }">
                    <div class="action-pills">
                      <button
                        v-admin-glow="perms.codes.update"
                        type="button"
                        class="action-pill action-pill--edit"
                        @click="openEditNumber(row)"
                      >
                        {{ t('common.edit') }}
                      </button>
                      <button
                        v-admin-glow="perms.codes.update"
                        type="button"
                        class="action-pill action-pill--danger"
                        @click="onDeleteNumber(row)"
                      >
                        {{ t('common.delete') }}
                      </button>
                    </div>
                  </template>
                </el-table-column>
                <template #empty>
                  <div v-if="!keyword.trim() && !numbers.length" class="wa-empty">
                    <el-icon :size="28" class="wa-empty__icon"><Iphone /></el-icon>
                    <p class="wa-empty__title">{{ t('systemSettings.whatsapp.emptyNumbers') }}</p>
                    <el-button
                      v-if="perms.update"
                      v-admin-glow="perms.codes.update"
                      type="primary"
                      plain
                      @click="openCreateNumber"
                    >
                      <el-icon class="el-icon--left"><Plus /></el-icon>
                      {{ t('systemSettings.whatsapp.addNumber') }}
                    </el-button>
                  </div>
                  <span v-else>{{ t('common.noSearchResults') }}</span>
                </template>
              </el-table>
            </div>
            <div class="table-pagination">
              <TablePagination
                v-model:page="numbersPage"
                v-model:page-size="numbersPageSize"
                :total="numbersTotal"
                :page-sizes="numbersPageSizes"
              />
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane name="templates">
        <template #label>
          <span class="wa-tab-label">
            <el-icon :size="16"><Tickets /></el-icon>
            <span>{{ t('systemSettings.sections.whatsappTemplates') }}</span>
            <span
              class="wa-tab-count"
              :title="t('systemSettings.whatsapp.activeOfTotal', { active: templatesActiveCount, total: templates.length })"
            >
              {{ templates.length }}
            </span>
          </span>
        </template>

        <div class="wa-pane">
          <div class="table-card wa-pane__table">
            <div
              v-loading="templatesLoading || templatesReordering"
              class="table-scroll"
              element-loading-background="rgba(247, 250, 248, 0.78)"
            >
              <el-table
                :key="`${tableLayoutKey}-templates`"
                class="wa-table"
                :data="templatesPaged"
                row-key="id"
                height="100%"
                stripe
                border
                :row-class-name="templatesRowClassName"
                style="width: 100%"
              >
                <el-table-column
                  label="#"
                  :width="perms.update ? 60 : 44"
                  fixed="left"
                  align="center"
                  header-align="center"
                  class-name="col-wa-index"
                  label-class-name="col-wa-index"
                >
                  <template #default="{ row, $index }">
                    <div
                      class="wa-index-cell"
                      @dragover="onTemplateDragOver(row, $event)"
                      @drop="onTemplateDrop(row, $event)"
                      @dragleave="onTemplateDragLeave(row)"
                    >
                      <button
                        v-if="perms.update"
                        type="button"
                        class="wa-row__handle"
                        draggable="true"
                        :title="t('systemSettings.whatsapp.dragReorder')"
                        aria-label="drag"
                        @dragstart="onTemplateDragStart(row, $event)"
                        @dragend="onTemplateDragEnd"
                      >
                        <el-icon :size="14"><Rank /></el-icon>
                      </button>
                      <span class="wa-index-cell__num">{{ templatesRowIndex($index) }}</span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column
                  prop="label"
                  :label="t('systemSettings.fields.whatsappTemplateLabel')"
                  :min-width="templateLabelColW"
                  show-overflow-tooltip
                />
                <el-table-column
                  prop="templateName"
                  :label="t('systemSettings.fields.whatsappTemplateName')"
                  :min-width="templateNameColW"
                  class-name="col-code"
                  label-class-name="col-code"
                  show-overflow-tooltip
                />
                <el-table-column
                  prop="categoryLabel"
                  :label="t('systemSettings.fields.whatsappTemplateCategory')"
                  :width="templateCategoryColW"
                >
                  <template #default="{ row }">
                    <StatusBadge
                      :tone="whatsappTemplateCategoryTone(row.categoryBadgeTone || row.categoryCode)"
                      :label="row.categoryLabel"
                    />
                  </template>
                </el-table-column>
                <el-table-column
                  :label="t('systemSettings.fields.whatsappDiagram')"
                  :width="templateDiagramColW"
                  align="center"
                  header-align="center"
                  class-name="col-wa-diagram"
                  label-class-name="col-wa-diagram"
                >
                  <template #default="{ row }">
                    <button
                      v-if="diagramUrlOf(row)"
                      type="button"
                      class="wa-diagram-thumb"
                      :title="t('common.preview')"
                      :aria-label="t('common.preview')"
                      @click.stop="openDiagramViewer(diagramUrlOf(row), row.label)"
                    >
                      <img :src="diagramUrlOf(row)" alt="" />
                    </button>
                    <span v-else class="wa-diagram-empty">{{ t('systemSettings.whatsapp.noDiagram') }}</span>
                  </template>
                </el-table-column>
                <el-table-column
                  prop="buildingNames"
                  :label="t('systemSettings.fields.whatsappTemplateBuilding')"
                  :min-width="colW(t('systemSettings.fields.whatsappTemplateBuilding'), { contentMin: isWideViewport ? 140 : 160 })"
                  show-overflow-tooltip
                />
                <el-table-column
                  prop="remark"
                  :label="t('systemSettings.fields.whatsappRemark')"
                  :min-width="textColW(t('systemSettings.fields.whatsappRemark'), { kind: 'long' })"
                  show-overflow-tooltip
                />
                <el-table-column
                  prop="active"
                  :label="t('systemSettings.fields.whatsappActive')"
                  :width="activeColW"
                  align="center"
                  header-align="center"
                  class-name="col-switch"
                  label-class-name="col-switch"
                >
                  <template #default="{ row }">
                    <el-switch
                      :model-value="row.active"
                      :disabled="!perms.update"
                      @change="(v: string | number | boolean) => onToggleTemplateActive(row, !!v)"
                    />
                  </template>
                </el-table-column>
                <el-table-column
                  v-if="perms.update"
                  :label="t('common.actions')"
                  :width="templateActionColW"
                  fixed="right"
                  class-name="col-actions"
                  label-class-name="col-actions"
                >
                  <template #default="{ row }">
                    <div class="action-pills">
                      <button
                        v-admin-glow="perms.codes.update"
                        type="button"
                        class="action-pill action-pill--edit"
                        @click="openEditTemplate(row)"
                      >
                        {{ t('common.edit') }}
                      </button>
                      <button
                        v-admin-glow="perms.codes.update"
                        type="button"
                        class="action-pill action-pill--danger"
                        @click="onDeleteTemplate(row)"
                      >
                        {{ t('common.delete') }}
                      </button>
                    </div>
                  </template>
                </el-table-column>
                <template #empty>
                  <div v-if="!keyword.trim() && !templates.length" class="wa-empty">
                    <el-icon :size="28" class="wa-empty__icon"><Tickets /></el-icon>
                    <p class="wa-empty__title">{{ t('systemSettings.whatsapp.emptyTemplates') }}</p>
                    <el-button
                      v-if="perms.update"
                      v-admin-glow="perms.codes.update"
                      type="primary"
                      plain
                      @click="openCreateTemplate"
                    >
                      <el-icon class="el-icon--left"><Plus /></el-icon>
                      {{ t('systemSettings.whatsapp.addTemplate') }}
                    </el-button>
                  </div>
                  <span v-else>{{ t('common.noSearchResults') }}</span>
                </template>
              </el-table>
            </div>
            <div class="table-pagination">
              <TablePagination
                v-model:page="templatesPage"
                v-model:page-size="templatesPageSize"
                :total="templatesTotal"
                :page-sizes="templatesPageSizes"
              />
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane name="categories">
        <template #label>
          <span class="wa-tab-label">
            <el-icon :size="16"><Collection /></el-icon>
            <span>{{ t('systemSettings.sections.whatsappCategories') }}</span>
            <span
              class="wa-tab-count"
              :title="t('systemSettings.whatsapp.activeOfTotal', { active: categoriesActiveCount, total: categories.length })"
            >
              {{ categories.length }}
            </span>
          </span>
        </template>

        <div class="wa-pane">
          <div class="table-card wa-pane__table">
            <div
              v-loading="categoriesLoading || categoriesReordering"
              class="table-scroll"
              element-loading-background="rgba(247, 250, 248, 0.78)"
            >
              <el-table
                :key="`${tableLayoutKey}-categories`"
                class="wa-table"
                :data="categoriesPaged"
                row-key="id"
                height="100%"
                stripe
                border
                :row-class-name="categoriesRowClassName"
                style="width: 100%"
              >
                <el-table-column
                  label="#"
                  :width="perms.update ? 60 : 44"
                  align="center"
                  header-align="center"
                  class-name="col-wa-index"
                  label-class-name="col-wa-index"
                >
                  <template #default="{ row, $index }">
                    <div
                      class="wa-index-cell"
                      @dragover="onCategoryDragOver(row, $event)"
                      @drop="onCategoryDrop(row, $event)"
                      @dragleave="onCategoryDragLeave(row)"
                    >
                      <button
                        v-if="perms.update"
                        type="button"
                        class="wa-row__handle"
                        draggable="true"
                        :title="t('systemSettings.whatsapp.dragReorder')"
                        :aria-label="t('systemSettings.whatsapp.dragReorder')"
                        @dragstart="onCategoryDragStart(row, $event)"
                        @dragend="onCategoryDragEnd"
                      >
                        <el-icon :size="14"><Rank /></el-icon>
                      </button>
                      <span class="wa-index-cell__num">{{ categoriesRowIndex($index) }}</span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column
                  prop="label"
                  :label="t('systemSettings.fields.whatsappCategoryLabel')"
                  :min-width="statusColW(
                    t('systemSettings.fields.whatsappCategoryLabel'),
                    categories.map((c) => c.label),
                    { interactive: false },
                  )"
                >
                  <template #default="{ row }">
                    <StatusBadge
                      :tone="whatsappTemplateCategoryTone(row.badgeTone)"
                      :label="row.label"
                    />
                  </template>
                </el-table-column>
                <el-table-column
                  prop="code"
                  :label="t('systemSettings.fields.whatsappCategoryCode')"
                  :min-width="colW(t('systemSettings.fields.whatsappCategoryCode'), { contentMin: 140 })"
                  class-name="col-code"
                  label-class-name="col-code"
                  show-overflow-tooltip
                />
                <el-table-column
                  prop="remark"
                  :label="t('systemSettings.fields.whatsappRemark')"
                  :min-width="textColW(t('systemSettings.fields.whatsappRemark'), { kind: 'long' })"
                  show-overflow-tooltip
                />
                <el-table-column
                  prop="templateCount"
                  :label="t('systemSettings.fields.whatsappCategoryTemplateCount')"
                  :width="colW(t('systemSettings.fields.whatsappCategoryTemplateCount'), { contentMin: 52 })"
                  align="center"
                  header-align="center"
                />
                <el-table-column
                  prop="active"
                  :label="t('systemSettings.fields.whatsappActive')"
                  :width="activeColW"
                  align="center"
                  header-align="center"
                  class-name="col-switch"
                  label-class-name="col-switch"
                >
                  <template #default="{ row }">
                    <el-switch
                      :model-value="row.active"
                      :disabled="!perms.update"
                      @change="(v: string | number | boolean) => onToggleCategoryActive(row, !!v)"
                    />
                  </template>
                </el-table-column>
                <el-table-column
                  v-if="perms.update"
                  :label="t('common.actions')"
                  :width="templateActionColW"
                  fixed="right"
                  class-name="col-actions"
                  label-class-name="col-actions"
                >
                  <template #default="{ row }">
                    <div class="action-pills">
                      <button
                        v-admin-glow="perms.codes.update"
                        type="button"
                        class="action-pill action-pill--edit"
                        @click="openEditCategory(row)"
                      >
                        {{ t('common.edit') }}
                      </button>
                      <button
                        v-admin-glow="perms.codes.update"
                        type="button"
                        class="action-pill action-pill--danger"
                        @click="onDeleteCategory(row)"
                      >
                        {{ t('common.delete') }}
                      </button>
                    </div>
                  </template>
                </el-table-column>
                <template #empty>
                  <div v-if="!keyword.trim() && !categories.length" class="wa-empty">
                    <el-icon :size="28" class="wa-empty__icon"><Collection /></el-icon>
                    <p class="wa-empty__title">{{ t('systemSettings.whatsapp.emptyCategories') }}</p>
                    <el-button
                      v-if="perms.update"
                      v-admin-glow="perms.codes.update"
                      type="primary"
                      plain
                      @click="openCreateCategory"
                    >
                      <el-icon class="el-icon--left"><Plus /></el-icon>
                      {{ t('systemSettings.whatsapp.addCategory') }}
                    </el-button>
                  </div>
                  <span v-else>{{ t('common.noSearchResults') }}</span>
                </template>
              </el-table>
            </div>
            <div class="table-pagination">
              <TablePagination
                v-model:page="categoriesPage"
                v-model:page-size="categoriesPageSize"
                :total="categoriesTotal"
                :page-sizes="categoriesPageSizes"
              />
            </div>
          </div>
        </div>
      </el-tab-pane>

      </el-tabs>
    </div>

    <el-dialog
      v-model="numberDialogVisible"
      class="lb-dialog"
      :title="
        editingNumber
          ? t('systemSettings.whatsapp.editNumber')
          : t('systemSettings.whatsapp.addNumber')
      "
      width="480px"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item :label="t('systemSettings.fields.whatsappNumberLabel')" required>
          <el-input v-model="numberForm.label" maxlength="80" />
        </el-form-item>
        <el-form-item :label="t('systemSettings.fields.whatsappPhoneNumber')" required>
          <el-input v-model="numberForm.phoneNumber" maxlength="40" />
        </el-form-item>
        <el-form-item :label="t('systemSettings.fields.whatsappRemark')">
          <el-input
            v-model="numberForm.remark"
            type="textarea"
            :rows="2"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
        <el-form-item :label="t('systemSettings.fields.whatsappActive')">
          <el-switch v-model="numberForm.active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="numberDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button
          v-admin-glow="perms.codes.update"
          type="primary"
          :loading="numberSaving"
          @click="saveNumber"
        >
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="templateDialogVisible"
      class="lb-dialog"
      :title="
        editingTemplate
          ? t('systemSettings.whatsapp.editTemplate')
          : t('systemSettings.whatsapp.addTemplate')
      "
      width="480px"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item :label="t('systemSettings.fields.whatsappTemplateBuilding')" required>
          <el-select
            v-model="templateForm.buildingIds"
            multiple
            filterable
            remote
            reserve-keyword
            clearable
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="2"
            class="wa-full-select"
            popper-class="wa-building-select-popper"
            :remote-method="searchBuildingRemote"
            :loading="buildingSelectLoading"
            :placeholder="t('common.pleaseSelect')"
            @visible-change="onBuildingSelectVisible"
          >
            <el-option
              v-for="b in buildingSelectOptions"
              :key="b.id"
              :label="b.name"
              :value="b.id"
            />
            <template #empty>
              <div class="wa-select-empty">{{ t('common.noSearchResults') }}</div>
            </template>
          </el-select>
        </el-form-item>
        <el-form-item :label="t('systemSettings.fields.whatsappTemplateCategory')" required>
          <el-select
            v-model="templateForm.categoryId"
            filterable
            clearable
            value-on-clear=""
            class="wa-full-select"
            :placeholder="t('common.pleaseSelect')"
          >
            <el-option
              v-for="c in categorySelectOptions"
              :key="c.id"
              :label="c.label"
              :value="c.id"
              :disabled="!c.active && c.id !== templateForm.categoryId"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('systemSettings.fields.whatsappTemplateLabel')" required>
          <el-input v-model="templateForm.label" maxlength="80" />
        </el-form-item>
        <el-form-item :label="t('systemSettings.fields.whatsappTemplateName')" required>
          <el-input v-model="templateForm.templateName" maxlength="120" />
        </el-form-item>
        <el-form-item :label="t('systemSettings.fields.whatsappDiagram')">
          <div class="wa-diagram-field">
            <button
              v-if="diagramPreviewUrl"
              type="button"
              class="wa-diagram-preview"
              :title="t('common.preview')"
              :aria-label="t('common.preview')"
              @click.stop="openDiagramViewer()"
            >
              <img :src="diagramPreviewUrl" alt="" />
            </button>
            <button
              v-else-if="perms.update"
              v-admin-glow="perms.codes.update"
              type="button"
              class="wa-diagram-upload-tile"
              :disabled="uploadingDiagram"
              :aria-busy="uploadingDiagram"
              @click="openDiagramPicker"
            >
              <el-icon :size="22"><Plus /></el-icon>
              <span>{{ uploadingDiagram ? t('common.loading') : t('systemSettings.whatsapp.uploadDiagram') }}</span>
            </button>
            <div class="wa-diagram-field__actions">
              <input
                ref="diagramInputRef"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                class="wa-diagram-field__input"
                @change="onDiagramFileChange"
              />
              <template v-if="perms.update && diagramPreviewUrl">
                <button
                  v-admin-glow="perms.codes.update"
                  type="button"
                  class="wa-diagram-action wa-diagram-action--primary"
                  :disabled="uploadingDiagram"
                  @click="openDiagramPicker"
                >
                  <el-icon class="el-icon--left"><Plus /></el-icon>
                  {{ uploadingDiagram ? t('common.loading') : t('systemSettings.whatsapp.uploadDiagram') }}
                </button>
                <button
                  type="button"
                  class="wa-diagram-action"
                  :disabled="uploadingDiagram"
                  @click="clearDiagram"
                >
                  {{ t('systemSettings.whatsapp.clearDiagram') }}
                </button>
              </template>
              <p class="wa-diagram-field__hint">{{ t('systemSettings.whatsapp.diagramHint') }}</p>
            </div>
          </div>
        </el-form-item>
        <el-form-item :label="t('systemSettings.fields.whatsappRemark')">
          <el-input
            v-model="templateForm.remark"
            type="textarea"
            :rows="2"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
        <el-form-item :label="t('systemSettings.fields.whatsappActive')">
          <el-switch v-model="templateForm.active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="templateDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button
          v-admin-glow="perms.codes.update"
          type="primary"
          :loading="templateSaving"
          @click="saveTemplate"
        >
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>


    <el-dialog
      v-model="categoryDialogVisible"
      class="lb-dialog"
      :title="
        editingCategory
          ? t('systemSettings.whatsapp.editCategory')
          : t('systemSettings.whatsapp.addCategory')
      "
      width="480px"
      destroy-on-close
    >
      <el-form label-position="top">
        <el-form-item :label="t('systemSettings.fields.whatsappCategoryLabel')" required>
          <el-input v-model="categoryForm.label" maxlength="80" />
        </el-form-item>
        <el-form-item :label="t('systemSettings.fields.whatsappCategoryCode')" required>
          <el-input
            v-model="categoryForm.code"
            maxlength="64"
            :disabled="!!editingCategory"
            :placeholder="t('systemSettings.whatsapp.categoryCodeHint')"
          />
        </el-form-item>
        <el-form-item :label="t('systemSettings.fields.whatsappCategoryBadgeTone')" required>
          <el-select
            v-model="categoryForm.badgeTone"
            class="wa-full-select wa-tone-select"
            popper-class="wa-tone-select-popper"
            :placeholder="t('common.pleaseSelect')"
          >
            <el-option
              v-for="tone in categoryBadgeToneOptions"
              :key="tone"
              :label="t(`systemSettings.whatsapp.badgeTones.${tone}`)"
              :value="tone"
            >
              <span
                class="wa-tone-swatch"
                :class="`lb-status--${tone}`"
                :title="t(`systemSettings.whatsapp.badgeTones.${tone}`)"
                aria-hidden="true"
              />
            </el-option>
            <template #prefix>
              <span
                v-if="categoryForm.badgeTone"
                class="wa-tone-swatch"
                :class="`lb-status--${whatsappTemplateCategoryTone(categoryForm.badgeTone)}`"
                :title="t(`systemSettings.whatsapp.badgeTones.${categoryForm.badgeTone}`)"
                aria-hidden="true"
              />
            </template>
          </el-select>
          <p class="wa-tone-select__hint">{{ t('systemSettings.whatsapp.badgeToneHint') }}</p>
        </el-form-item>
        <el-form-item :label="t('systemSettings.fields.whatsappRemark')">
          <el-input
            v-model="categoryForm.remark"
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
          />
        </el-form-item>
        <el-form-item :label="t('systemSettings.fields.whatsappActive')">
          <el-switch v-model="categoryForm.active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="categoryDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button
          v-admin-glow="perms.codes.update"
          type="primary"
          class="lb-btn-primary"
          :loading="categorySaving"
          @click="saveCategory"
        >
          {{ t('common.save') }}
        </el-button>
      </template>
    </el-dialog>

    <Teleport to="body">
      <AttachmentImageViewer
        v-if="diagramViewerVisible && diagramViewerUrl"
        :url-list="[diagramViewerUrl]"
        :title="diagramViewerTitle"
        @close="closeDiagramViewer"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.wa-settings {
  /* 与 .admin-page 列表表同字号阶梯（系统设置页不在 admin-page 下） */
  --lb-table-body: 0.87rem;
  --lb-table-head: 0.82rem;
  --lb-table-action: 0.78rem;
  --lb-action-pad-right: 10px;
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  min-height: 0;
}

@media (max-width: 1279.98px) {
  .wa-settings {
    --lb-table-body: 0.86rem;
    --lb-table-head: 0.8rem;
    --lb-table-action: 0.75rem;
  }
}

@media (max-width: 1439.98px) {
  .wa-settings {
    --lb-action-pad-right: 6px;
  }
}

@media (min-width: 1440px) {
  .wa-settings {
    --lb-table-body: 0.93rem;
    --lb-table-head: 0.85rem;
    --lb-table-action: 0.79rem;
  }
}

@media (min-width: 1800px) {
  .wa-settings {
    --lb-table-body: 0.97rem;
    --lb-table-head: 0.89rem;
    --lb-table-action: 0.81rem;
  }
}

/* 强制表体／表头用列表页字号，避免被系统设置页 --ss-body 影响观感 */
.wa-pane__table :deep(.el-table) {
  font-size: var(--lb-table-body);
}

.wa-pane__table :deep(.el-table th.el-table__cell) {
  font-size: var(--lb-table-head);
}

.wa-tabs-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.wa-tabs {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.wa-tabs :deep(.el-tabs__content) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.wa-tabs :deep(.el-tab-pane) {
  flex: 1;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.wa-tabs-wrap__actions {
  position: absolute;
  top: 5px;
  right: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
}

.wa-tabs-wrap__actions .el-button {
  height: 32px;
}

.wa-tabs-wrap__search {
  width: 220px;
  flex: 0 1 220px;
  min-width: 140px;
  max-width: 260px;
}

.wa-tabs-wrap__search :deep(.el-input__wrapper) {
  border-radius: 999px !important;
  min-height: 32px;
  box-shadow: 0 0 0 1px var(--lb-muted-border, #d0d0d0) inset !important;
  background: var(--lb-muted-fill, #f5f5f5);
}

.wa-full-select {
  width: 100%;
}

.wa-select-empty {
  padding: 10px 12px;
  color: #7a8a82;
  font-size: 0.88rem;
}

.wa-tabs :deep(.el-tabs__header) {
  flex-shrink: 0;
  margin: 0 0 12px;
  padding-right: 22rem;
}

.wa-tabs :deep(.el-tabs__nav-wrap::after) {
  height: 1px;
  background: rgba(15, 74, 50, 0.1);
}

.wa-tabs :deep(.el-tabs__item) {
  height: 42px;
  padding: 0 16px;
  font-size: 0.95rem;
  font-weight: 550;
  color: #5f7369;
}

.wa-tabs :deep(.el-tabs__item.is-active) {
  color: var(--lb-brand, #0f4a32);
  font-weight: 650;
}

.wa-tabs :deep(.el-tabs__active-bar) {
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--lb-brand, #0f4a32);
}

.wa-tabs :deep(.el-tabs__ink-bar) {
  background: var(--lb-brand, #0f4a32);
}

.wa-tab-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.wa-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1;
  color: #3d5c4e;
  background: rgba(15, 74, 50, 0.1);
}

.wa-tabs :deep(.el-tabs__item.is-active) .wa-tab-count {
  color: #fff;
  background: var(--lb-brand, #0f4a32);
}

.wa-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.wa-pane__table {
  flex: 1;
  min-height: 0;
}

.wa-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 40px 16px;
  color: #6b7c74;
}

.wa-empty__icon {
  color: rgba(15, 74, 50, 0.35);
}

.wa-empty__title {
  margin: 0;
  font-size: 0.92rem;
}

.wa-diagram-thumb {
  display: inline-flex;
  width: 36px;
  height: 38px;
  margin: 0;
  padding: 0;
  border-radius: 5px;
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, #e6e6e6);
  overflow: hidden;
  background: #f7faf8;
  cursor: zoom-in;
  vertical-align: middle;
}

.wa-diagram-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

.wa-table :deep(td.col-wa-diagram.el-table__cell) {
  padding-top: 1px;
  padding-bottom: 1px;
}

.wa-table :deep(td.col-wa-diagram > .cell) {
  display: flex;
  align-items: center;
  justify-content: center;
  padding-top: 0;
  padding-bottom: 0;
  line-height: 1;
}

.wa-diagram-empty {
  color: #9aa8a0;
  line-height: 1;
}

.wa-index-cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-height: 22px;
}

.wa-index-cell__num {
  min-width: 1em;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 35%, #666);
}

.wa-table :deep(th.col-wa-index > .cell),
.wa-table :deep(td.col-wa-index > .cell) {
  padding-left: 4px;
  padding-right: 4px;
}

.wa-row__handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--lb-muted, #666);
  cursor: grab;
  flex: 0 0 auto;
}

.wa-row__handle:hover {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #fff);
  color: var(--lb-brand, #0f4a32);
}

.wa-row__handle:active {
  cursor: grabbing;
}

.wa-table :deep(.wa-row--dragging > td.el-table__cell) {
  opacity: 0.55;
}

/* 拖到目标行上方 → 上边框；下方 → 下边框 */
.wa-table :deep(.wa-row--drag-over-before > td.el-table__cell) {
  box-shadow: inset 0 2px 0 0 var(--lb-brand, #0f4a32);
}

.wa-table :deep(.wa-row--drag-over-after > td.el-table__cell) {
  box-shadow: inset 0 -2px 0 0 var(--lb-brand, #0f4a32);
}

.wa-tone-select :deep(.el-select__wrapper) {
  min-height: 40px;
}

.wa-tone-select :deep(.el-select__prefix) {
  display: inline-flex;
  align-items: center;
}

.wa-tone-select :deep(.el-select__selected-item) {
  color: transparent !important;
  text-indent: -999px;
  overflow: hidden;
  width: 0;
  padding: 0;
  margin: 0;
}

.wa-tone-select :deep(.el-select__placeholder) {
  color: var(--el-text-color-placeholder);
}

.wa-tone-swatch {
  display: inline-block;
  width: 52px;
  height: 22px;
  border-radius: 999px;
  vertical-align: middle;
  flex: 0 0 auto;
}

.wa-tone-select__hint {
  margin: 6px 0 0;
  font-size: 0.82rem;
  color: var(--lb-muted, #666);
  line-height: 1.4;
}

.wa-diagram-field {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
}

.wa-diagram-preview {
  width: 96px;
  height: 96px;
  flex-shrink: 0;
  margin: 0;
  padding: 0;
  border-radius: 12px;
  overflow: hidden;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #f7faf8);
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, #e6e6e6);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, transparent);
  cursor: zoom-in;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.15s ease;
}

.wa-diagram-preview:hover {
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 32%, #e0e0e0);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, transparent);
  transform: translateY(-1px);
}

.wa-diagram-preview:focus-visible {
  outline: 2px solid var(--lb-brand, #0f4a32);
  outline-offset: 2px;
}

.wa-diagram-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  pointer-events: none;
}

.wa-diagram-upload-tile {
  box-sizing: border-box;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 96px;
  height: 96px;
  margin: 0;
  padding: 8px;
  border-radius: 12px;
  border: 1.5px dashed color-mix(in srgb, var(--lb-brand, #0f4a32) 28%, #c8d5ce);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 5%, #fff);
  color: var(--lb-brand, #0f4a32);
  font-size: 0.72rem;
  font-weight: 650;
  line-height: 1.25;
  text-align: center;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.wa-diagram-upload-tile:hover:not(:disabled) {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #fff);
  border-color: var(--lb-brand, #0f4a32);
  box-shadow: 0 6px 14px color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, transparent);
}

.wa-diagram-upload-tile:disabled {
  opacity: 0.65;
  cursor: wait;
}

.wa-diagram-field__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 180px;
  padding-top: 2px;
}

.wa-diagram-field__input {
  display: none;
}

.wa-diagram-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 32px;
  margin: 0;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 16%, #d6d6d6);
  background: #fff;
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 45%, #444);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.wa-diagram-action:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 35%, #d0d0d0);
  color: var(--lb-brand, #0f4a32);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 6%, #fff);
}

.wa-diagram-action--primary {
  border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 28%, #c8d5ce);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #fff);
  color: var(--lb-brand, #0f4a32);
}

.wa-diagram-action--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 16%, #fff);
  border-color: var(--lb-brand, #0f4a32);
}

.wa-diagram-action:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.wa-diagram-field__hint {
  margin: 0;
  width: 100%;
  font-size: 0.78rem;
  color: #6b7c74;
  line-height: 1.4;
}

.action-pills {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
}

@media (max-width: 720px) {
  .wa-tabs-wrap__btn {
    position: static;
    width: 100%;
    margin-bottom: 8px;
  }

  .wa-tabs :deep(.el-tabs__header) {
    padding-right: 0;
  }

  .wa-tabs :deep(.el-tabs__item) {
    padding: 0 10px;
  }
}
</style>

<style>
.wa-tone-select-popper .el-select-dropdown__item {
  display: flex;
  align-items: center;
  height: 36px;
  line-height: 1;
}
</style>
