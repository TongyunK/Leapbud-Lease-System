<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElDialog, ElMessageBox } from 'element-plus'
import { Delete, Plus, QuestionFilled, Rank } from '@element-plus/icons-vue'
import type { ContractRecord } from '@/types/contract'
import {
  CONTRACT_PAYMENT_CYCLES,
  CONTRACT_PERIOD_UNITS,
  coerceContractPaymentCycle,
  formatContractOccupancyLabel,
} from '@/types/contract'
import type { ContractConfigOption } from '@/types/contract-config'
import {
  fetchContractRenewalPreviewApi,
  renewContractApi,
  type ContractRenewalPreview,
} from '@/api/contracts'
import { fetchContractConfigs } from '@/api/contract-configs'
import { previewAgreementDraftPdfApi } from '@/api/document-templates'
import { useResourcePermissions } from '@/composables/useResourcePermissions'
import {
  OVERLAY_ABOVE_FEATURE_MENU_Z,
  useOverlayStackZ,
} from '@/composables/useOverlayStackZ'
import { formatMoney } from '@/utils/format'
import {
  addDaysYmd,
  endDateFromDuration,
  findFirstPeriodOverlap,
  inferPeriodDurationFromDates,
} from '@/utils/contractPeriodDuration'
import { contractOccupancyTone, contractStatusTone } from '@/constants/statusBadges'
import StatusBadge from '@/components/StatusBadge.vue'

const visible = defineModel<boolean>({ default: false })

const props = defineProps<{
  contract: ContractRecord | null
  zIndex?: number
}>()

const emit = defineEmits<{
  done: [payload: { newContractId: string; newContractCode: string }]
  openRoom: [roomId: string, opts?: { zIndex?: number }]
  openCustomer: [customerId: string, opts?: { zIndex?: number }]
}>()

const { t, locale } = useI18n()
const perms = useResourcePermissions('contracts')
const { raiseFloor } = useOverlayStackZ()

const dialogZ = computed(
  () => Math.max(Number(props.zIndex) || 0, OVERLAY_ABOVE_FEATURE_MENU_Z) + 40,
)

function openRelated(kind: 'room' | 'customer', id: string) {
  const z = dialogZ.value
  raiseFloor(z)
  if (kind === 'room') emit('openRoom', id, { zIndex: z })
  else emit('openCustomer', id, { zIndex: z })
}
const tipPopperStyle = computed(() => ({
  zIndex: Math.max(dialogZ.value + 40, 3200),
}))
const fieldPopperStyle = computed(() => ({ zIndex: dialogZ.value + 20 }))

const loading = ref(false)
const submitting = ref(false)
const previewing = ref(false)
const preview = ref<ContractRenewalPreview | null>(null)
const periodTypeOptions = ref<ContractConfigOption[]>([])

const form = reactive({
  monthlyRent: 0 as number | null,
  startDate: '',
  endDate: '',
  paymentCycle: CONTRACT_PAYMENT_CYCLES[0] as string,
  electricityRate: null as number | null,
  doorKeyQty: 0,
  mailboxKeyQty: 0,
  remark: '',
})

type PeriodFormRow = {
  uid: string
  dateType: string
  dateUnit: string
  dateValue: number
  startDate: string
  endDate: string
}

function newPeriodUid() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function defaultPeriodRow(): PeriodFormRow {
  const first = periodTypeOptions.value[0]?.label || '使用期'
  return {
    uid: newPeriodUid(),
    dateType: first,
    dateUnit: '月',
    dateValue: 12,
    startDate: '',
    endDate: '',
  }
}

const periods = ref<PeriodFormRow[]>([defaultPeriodRow()])
const PERIOD_PAGE_SIZE = 5
const periodPage = ref(1)
const periodTableEn = computed(() => String(locale.value).toLowerCase().startsWith('en'))

const periodTotalPages = computed(() =>
  Math.max(1, Math.ceil(periods.value.length / PERIOD_PAGE_SIZE) || 1),
)
const pagedPeriods = computed(() => {
  const start = (periodPage.value - 1) * PERIOD_PAGE_SIZE
  return periods.value.slice(start, start + PERIOD_PAGE_SIZE).map((p, i) => ({
    p,
    index: start + i,
  }))
})

function money(n: number | null | undefined) {
  return formatMoney(n)
}

function apiErrorMessage(e: unknown, fallback: string) {
  const err = e as { response?: { data?: { message?: string | string[] } }; message?: string }
  const msg = err?.response?.data?.message
  if (Array.isArray(msg) && msg[0]) return String(msg[0])
  if (typeof msg === 'string' && msg.trim()) return msg
  if (err?.message?.trim()) return err.message
  return fallback
}

function todayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addYearsYmd(ymd: string, years: number) {
  const raw = (ymd || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ''
  const d = new Date(`${raw}T00:00:00.000Z`)
  d.setUTCFullYear(d.getUTCFullYear() + years)
  d.setUTCDate(d.getUTCDate() - 1)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function statusLabel(status?: string | null) {
  const s = (status || '').trim()
  if (!s) return '—'
  const key = `contract.status.${s}`
  const translated = t(key)
  return translated === key ? s : translated
}

function occupancyLabelOf(src: ContractRenewalPreview['source']) {
  return formatContractOccupancyLabel(
    { occupancyMode: src.occupancyMode, partLabel: src.partLabel },
    {
      whole: t('contract.occupancyWhole'),
      part: t('contract.occupancyPart'),
    },
  )
}

function periodDurationLabel(p: PeriodFormRow): string {
  const n = Number(p.dateValue) || 0
  return `${n} ${p.dateUnit === '日' ? t('contract.periodUnits.日') : t('contract.periodUnits.月')}`
}

let periodDateDurationSyncing = false

function syncPeriodDurationFromDates(p: PeriodFormRow) {
  if (periodDateDurationSyncing) return
  const hit = inferPeriodDurationFromDates(p.startDate, p.endDate)
  if (!hit) return
  if (p.dateUnit === hit.dateUnit && Number(p.dateValue) === hit.dateValue) return
  periodDateDurationSyncing = true
  try {
    p.dateUnit = hit.dateUnit
    p.dateValue = hit.dateValue
  } finally {
    periodDateDurationSyncing = false
  }
}

function ensurePeriodStartDate(p: PeriodFormRow, index: number): string {
  const existing = String(p.startDate || '').trim()
  if (existing) return existing
  if (index <= 0) {
    const contractStart = form.startDate?.trim() || ''
    if (!contractStart) return ''
    p.startDate = contractStart
    return contractStart
  }
  const prevEnd = periods.value[index - 1]?.endDate?.trim() || ''
  if (!prevEnd) return ''
  const next = addDaysYmd(prevEnd, 1)
  if (!next) return ''
  p.startDate = next
  return next
}

function syncPeriodDatesFromDuration(p: PeriodFormRow, index: number) {
  if (periodDateDurationSyncing) return
  const start = ensurePeriodStartDate(p, index)
  if (!start) return
  const end = endDateFromDuration(start, p.dateUnit, p.dateValue)
  if (!end) return
  if (p.endDate === end) return
  periodDateDurationSyncing = true
  try {
    p.endDate = end
  } finally {
    periodDateDurationSyncing = false
  }
}

function syncContractDatesFromPeriods() {
  const firstStart = String(periods.value[0]?.startDate || '').trim()
  const lastEnd = String(periods.value[periods.value.length - 1]?.endDate || '').trim()
  const needStart = Boolean(firstStart && form.startDate !== firstStart)
  const needEnd = Boolean(lastEnd && form.endDate !== lastEnd)
  if (!needStart && !needEnd) return
  periodDateDurationSyncing = true
  try {
    if (needStart) form.startDate = firstStart
    if (needEnd) form.endDate = lastEnd
  } finally {
    nextTick(() => {
      periodDateDurationSyncing = false
    })
  }
}

function cascadeFollowingPeriods(fromIndex: number) {
  if (fromIndex >= 0 && fromIndex < periods.value.length - 1) {
    periodDateDurationSyncing = true
    try {
      for (let i = fromIndex + 1; i < periods.value.length; i++) {
        const prevEnd = String(periods.value[i - 1]?.endDate || '').trim()
        if (!prevEnd) break
        const nextStart = addDaysYmd(prevEnd, 1)
        if (!nextStart) break
        const row = periods.value[i]
        if (row.startDate !== nextStart) row.startDate = nextStart
        const newEnd = endDateFromDuration(nextStart, row.dateUnit, row.dateValue)
        if (newEnd && row.endDate !== newEnd) row.endDate = newEnd
      }
    } finally {
      periodDateDurationSyncing = false
    }
  }
  syncContractDatesFromPeriods()
}

function onPeriodDatesChange(p: PeriodFormRow, index: number) {
  const s = String(p.startDate || '').trim()
  const e = String(p.endDate || '').trim()
  if (s && e) syncPeriodDurationFromDates(p)
  else if (s) syncPeriodDatesFromDuration(p, index)
  cascadeFollowingPeriods(index)
}

function onPeriodDurationChange(p: PeriodFormRow, index: number) {
  syncPeriodDatesFromDuration(p, index)
  cascadeFollowingPeriods(index)
}

function clampPeriodPage() {
  periodPage.value = Math.min(Math.max(1, periodPage.value), periodTotalPages.value)
}

function addPeriod() {
  const row = defaultPeriodRow()
  const prev = periods.value[periods.value.length - 1]
  const prevEnd = prev?.endDate?.trim() || ''
  if (prevEnd) {
    row.startDate = addDaysYmd(prevEnd, 1)
    const contractEnd = form.endDate?.trim() || ''
    if (contractEnd && contractEnd >= row.startDate) {
      row.endDate = contractEnd
      syncPeriodDurationFromDates(row)
    }
  }
  periods.value.push(row)
  periodPage.value = Math.ceil(periods.value.length / PERIOD_PAGE_SIZE)
}

function removePeriod(idx: number) {
  periods.value.splice(idx, 1)
  if (!periods.value.length) {
    addPeriod()
    return
  }
  clampPeriodPage()
  if (idx <= 0) {
    const first = periods.value[0]
    const contractStart = form.startDate?.trim() || ''
    if (first && contractStart && first.startDate !== contractStart) {
      first.startDate = contractStart
    }
    if (first) onPeriodDatesChange(first, 0)
  } else {
    cascadeFollowingPeriods(idx - 1)
  }
}

const editingPeriodIndexUid = ref<string | null>(null)
const editingPeriodIndexFrom = ref(-1)
const editingPeriodIndexDraft = ref('')
const periodIndexInputRef = ref<HTMLInputElement | null>(null)
let periodIndexCommitLock = false

function goToPeriodIndex(absoluteIdx: number) {
  periodPage.value = Math.floor(absoluteIdx / PERIOD_PAGE_SIZE) + 1
}

async function startEditPeriodIndex(uid: string, currentIndex: number) {
  if (periods.value.length <= 1) return
  periodIndexCommitLock = false
  editingPeriodIndexUid.value = uid
  editingPeriodIndexFrom.value = currentIndex
  editingPeriodIndexDraft.value = String(currentIndex + 1)
  await nextTick()
  const el = periodIndexInputRef.value
  if (!el) return
  el.focus()
  el.select()
}

function cancelEditPeriodIndex() {
  editingPeriodIndexUid.value = null
  editingPeriodIndexFrom.value = -1
  editingPeriodIndexDraft.value = ''
}

function commitEditPeriodIndex() {
  if (periodIndexCommitLock) return
  periodIndexCommitLock = true
  const uid = editingPeriodIndexUid.value
  const fromIdx = editingPeriodIndexFrom.value
  const draft = String(editingPeriodIndexDraft.value ?? '').trim()
  cancelEditPeriodIndex()
  if (!uid || fromIdx < 0) {
    periodIndexCommitLock = false
    return
  }
  const total = periods.value.length
  const raw = Number.parseInt(draft, 10)
  if (!Number.isFinite(raw)) {
    periodIndexCommitLock = false
    return
  }
  const toIdx = Math.min(total, Math.max(1, raw)) - 1
  const list = periods.value
  if (list[fromIdx]?.uid !== uid) {
    periodIndexCommitLock = false
    return
  }
  if (toIdx !== fromIdx) {
    const [item] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, item)
    goToPeriodIndex(toIdx)
    onPeriodDatesChange(list[0], 0)
  }
  periodIndexCommitLock = false
}

function onPeriodIndexKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    commitEditPeriodIndex()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelEditPeriodIndex()
  }
}

const dragPeriodUid = ref<string | null>(null)
const dragOverPeriodUid = ref<string | null>(null)

function onPeriodDragStart(uid: string, e: DragEvent) {
  dragPeriodUid.value = uid
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', uid)
  }
}

function onPeriodDragEnd() {
  dragPeriodUid.value = null
  dragOverPeriodUid.value = null
}

function onPeriodDragOver(uid: string, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOverPeriodUid.value = uid
}

function onPeriodDrop(uid: string, e: DragEvent) {
  e.preventDefault()
  const fromUid = dragPeriodUid.value
  dragPeriodUid.value = null
  dragOverPeriodUid.value = null
  if (!fromUid || fromUid === uid) return
  const list = periods.value
  const fromIdx = list.findIndex((p) => p.uid === fromUid)
  const toIdx = list.findIndex((p) => p.uid === uid)
  if (fromIdx < 0 || toIdx < 0) return
  const [item] = list.splice(fromIdx, 1)
  list.splice(toIdx, 0, item)
  goToPeriodIndex(toIdx)
  onPeriodDatesChange(list[0], 0)
}

function validatePeriodsAgainstContractDates(): string | null {
  const contractStart = form.startDate?.trim() || ''
  const contractEnd = form.endDate?.trim() || ''
  if (!contractStart || !contractEnd) return t('contract.contractDatesRequired')
  if (contractEnd < contractStart) return t('contract.contractDateRangeInvalid')
  const ordered = periods.value
  if (!ordered.length) return t('contract.periodRequired')
  for (const p of ordered) {
    const s = p.startDate?.trim() || ''
    const e = p.endDate?.trim() || ''
    if (!s || !e) return t('contract.periodRequired')
    if (e < s) return t('contract.periodRangeInvalid')
  }
  const overlap = findFirstPeriodOverlap(ordered)
  if (overlap) return t('contract.periodOverlap', { a: overlap.i + 1, b: overlap.j + 1 })
  if (ordered[0].startDate.trim() !== contractStart) {
    return t('contract.periodMustMatchContractStart')
  }
  if (ordered[ordered.length - 1].endDate.trim() !== contractEnd) {
    return t('contract.periodMustMatchContractEnd')
  }
  return null
}

watch(
  () => form.startDate,
  (v) => {
    if (periodDateDurationSyncing) return
    const start = String(v || '').trim()
    if (!periods.value.length) periods.value = [defaultPeriodRow()]
    const first = periods.value[0]
    if (!first) return
    if (first.startDate !== start) first.startDate = start
    onPeriodDatesChange(first, 0)
  },
)

watch(
  () => form.endDate,
  (v) => {
    if (periodDateDurationSyncing) return
    const end = String(v || '').trim()
    if (!periods.value.length) periods.value = [defaultPeriodRow()]
    const last = periods.value[periods.value.length - 1]
    const lastIndex = periods.value.length - 1
    if (!last) return
    if (last.endDate !== end) last.endDate = end
    onPeriodDatesChange(last, lastIndex)
  },
)

function seedPeriodsFromPreview(p: ContractRenewalPreview) {
  const nextStart = form.startDate
  const nextEnd = form.endDate
  const srcPeriods = p.source.periods || []
  if (srcPeriods.length) {
    const oldStart = p.source.startDate
    const dayDelta =
      oldStart && nextStart
        ? Math.round(
            (new Date(`${nextStart}T00:00:00.000Z`).getTime() -
              new Date(`${oldStart}T00:00:00.000Z`).getTime()) /
              86400000,
          )
        : 0
    periods.value = srcPeriods.map((row) => ({
      uid: newPeriodUid(),
      dateType: row.dateType || periodTypeOptions.value[0]?.label || '使用期',
      dateUnit: row.dateUnit || '月',
      dateValue: Number(row.dateValue) || 0,
      startDate: dayDelta ? addDaysYmd(row.startDate, dayDelta) : row.startDate,
      endDate: dayDelta ? addDaysYmd(row.endDate, dayDelta) : row.endDate,
    }))
    // 末段对齐新约结束日
    const last = periods.value[periods.value.length - 1]
    if (last && nextEnd) last.endDate = nextEnd
    const first = periods.value[0]
    if (first && nextStart) first.startDate = nextStart
    periodDateDurationSyncing = true
    try {
      for (const row of periods.value) syncPeriodDurationFromDates(row)
    } finally {
      periodDateDurationSyncing = false
    }
  } else {
    const row = defaultPeriodRow()
    row.startDate = nextStart
    row.endDate = nextEnd
    syncPeriodDurationFromDates(row)
    periods.value = [row]
  }
  periodPage.value = 1
}

function resetFormFromPreview(p: ContractRenewalPreview) {
  const src = p.source
  const nextStart = addDaysYmd(src.endDate, 1) || todayYmd()
  periodDateDurationSyncing = true
  try {
    form.monthlyRent = src.monthlyRent ?? 0
    form.startDate = nextStart
    form.endDate = addYearsYmd(nextStart, 1) || nextStart
    form.paymentCycle = coerceContractPaymentCycle(src.paymentCycle)
    form.electricityRate = src.electricityRate
    form.doorKeyQty = Number(src.doorKeyQty) || 0
    form.mailboxKeyQty = Number(src.mailboxKeyQty) || 0
    form.remark = ''
  } finally {
    periodDateDurationSyncing = false
  }
  seedPeriodsFromPreview(p)
  seedLoanItemsFromPreview(p)
}

async function loadPeriodTypes() {
  try {
    const { data } = await fetchContractConfigs({ type: 'periodType', activeOnly: true })
    periodTypeOptions.value = data ?? []
  } catch {
    periodTypeOptions.value = []
  }
}

async function loadPreview() {
  const id = props.contract?.id
  if (!id) {
    preview.value = null
    return
  }
  loading.value = true
  try {
    await loadPeriodTypes()
    const { data } = await fetchContractRenewalPreviewApi(id, { silentError: true })
    preview.value = data
    if (data) resetFormFromPreview(data)
  } catch (e) {
    preview.value = null
    await ElMessageBox.alert(
      apiErrorMessage(e, t('contract.renewLoadFailed')),
      t('contract.renewTitle'),
      { type: 'error', confirmButtonText: t('common.confirm') },
    )
    visible.value = false
  } finally {
    loading.value = false
  }
}

type RenewLoanItemRow = {
  uid: string
  /** 旧约带入：不可删除；描述／单价／备注只读 */
  fromSource: boolean
  description: string
  quantity: number | null
  unitAmount: number | null
  remark: string
}

function newLoanItemUid() {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function defaultNewLoanItemRow(): RenewLoanItemRow {
  return {
    uid: newLoanItemUid(),
    fromSource: false,
    description: '',
    quantity: null,
    unitAmount: null,
    remark: '',
  }
}

function loanItemSubtotal(row: RenewLoanItemRow) {
  if (row.quantity == null || row.unitAmount == null) return 0
  return (
    Math.round(Math.max(0, Number(row.quantity) || 0) * Math.max(0, Number(row.unitAmount) || 0) * 100) /
    100
  )
}

function isNewLoanItemComplete(row: RenewLoanItemRow) {
  return (
    Boolean(row.description.trim()) &&
    row.quantity != null &&
    !Number.isNaN(Number(row.quantity)) &&
    row.unitAmount != null &&
    !Number.isNaN(Number(row.unitAmount))
  )
}

function isNewLoanItemEmpty(row: RenewLoanItemRow) {
  return (
    !row.fromSource &&
    !row.description.trim() &&
    row.quantity == null &&
    row.unitAmount == null &&
    !row.remark.trim()
  )
}

const LOAN_ITEM_PAGE_SIZE = 5
const loanItemPage = ref(1)
const loanItems = ref<RenewLoanItemRow[]>([])
const loanItemTotalPages = computed(() =>
  Math.max(1, Math.ceil(loanItems.value.length / LOAN_ITEM_PAGE_SIZE) || 1),
)
const pagedLoanItems = computed(() => {
  const start = (loanItemPage.value - 1) * LOAN_ITEM_PAGE_SIZE
  return loanItems.value.slice(start, start + LOAN_ITEM_PAGE_SIZE).map((row, i) => ({
    row,
    index: start + i,
  }))
})

function seedLoanItemsFromPreview(p: ContractRenewalPreview) {
  loanItems.value = (p.source.loanItems || []).map((f) => ({
    uid: newLoanItemUid(),
    fromSource: true,
    description: f.description || '',
    quantity: Number(f.quantity) || 0,
    unitAmount: Number(f.unitAmount) || 0,
    remark: f.remark || '',
  }))
  loanItemPage.value = 1
}

function addLoanItem() {
  loanItems.value.push(defaultNewLoanItemRow())
  loanItemPage.value = Math.ceil(loanItems.value.length / LOAN_ITEM_PAGE_SIZE)
}

async function removeLoanItem(idx: number) {
  const row = loanItems.value[idx]
  if (!row) return
  if (row.fromSource) {
    await ElMessageBox.alert(t('contract.renewLoanItemsCannotDeleteSource'), t('contract.renewTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  loanItems.value.splice(idx, 1)
  loanItemPage.value = Math.min(Math.max(1, loanItemPage.value), loanItemTotalPages.value)
}

watch(
  () => loanItems.value.length,
  () => {
    loanItemPage.value = Math.min(Math.max(1, loanItemPage.value), loanItemTotalPages.value)
  },
)

watch(
  () => [visible.value, props.contract?.id] as const,
  ([open]) => {
    if (open) void loadPreview()
    else {
      preview.value = null
      submitting.value = false
      previewing.value = false
      loanItems.value = []
      loanItemPage.value = 1
    }
  },
)

async function onPreviewAgreement() {
  const src = preview.value?.source
  if (!src?.id || previewing.value || submitting.value) return
  if (!form.startDate || !form.endDate) {
    await ElMessageBox.alert(t('contract.renewNeedDates'), t('contract.renewTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  const periodErr = validatePeriodsAgainstContractDates()
  if (periodErr) {
    await ElMessageBox.alert(periodErr, t('contract.renewTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  previewing.value = true
  try {
    await previewAgreementDraftPdfApi(
      src.id,
      {
        roomId: src.roomId,
        customerId: src.customerId,
        startDate: form.startDate,
        endDate: form.endDate,
        leaseType: src.leaseType,
        paymentCycle: form.paymentCycle,
        monthlyRent: Number(form.monthlyRent) || 0,
        roomDeposit: src.roomDeposit,
        bookingDeposit: preview.value?.transfer.bookingDepositTransferred ?? 0,
        miscDeposit: src.miscDeposit,
        electricityRate: form.electricityRate,
        doorKeyQty: Math.max(0, Math.trunc(Number(form.doorKeyQty) || 0)),
        mailboxKeyQty: Math.max(0, Math.trunc(Number(form.mailboxKeyQty) || 0)),
        roomNameText: src.roomNameText || src.roomName,
        remark: form.remark.trim() || undefined,
        periods: periods.value.map((p) => ({
          dateType: p.dateType,
          dateUnit: p.dateUnit,
          dateValue: Number(p.dateValue) || 0,
          startDate: p.startDate,
          endDate: p.endDate,
        })),
      },
      { silentError: true },
    )
  } catch (e) {
    await ElMessageBox.alert(
      apiErrorMessage(e, t('contract.printAgreementFailed')),
      t('contract.renewTitle'),
      { type: 'error', confirmButtonText: t('common.confirm') },
    )
  } finally {
    previewing.value = false
  }
}

async function onSubmit() {
  const id = props.contract?.id
  if (!id || submitting.value || !perms.create) return
  if (!preview.value?.renewable) {
    await ElMessageBox.alert(
      preview.value?.blockReason || t('contract.renewNotAllowed'),
      t('contract.renewTitle'),
      { type: 'warning', confirmButtonText: t('common.confirm') },
    )
    return
  }
  const rent = Number(form.monthlyRent)
  if (!Number.isFinite(rent) || rent < 0) {
    await ElMessageBox.alert(t('contract.renewNeedRent'), t('contract.renewTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  if (!form.startDate || !form.endDate) {
    await ElMessageBox.alert(t('contract.renewNeedDates'), t('contract.renewTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  if (form.endDate < form.startDate) {
    await ElMessageBox.alert(t('contract.renewDateOrder'), t('contract.renewTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }
  const periodErr = validatePeriodsAgainstContractDates()
  if (periodErr) {
    await ElMessageBox.alert(periodErr, t('contract.renewTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }

  // 去掉空白新增行；其余新增行须填完整
  const loanPayloadRows = loanItems.value.filter((f) => f.fromSource || !isNewLoanItemEmpty(f))
  const incompleteLoan = loanPayloadRows.find((f) => !f.fromSource && !isNewLoanItemComplete(f))
  if (incompleteLoan) {
    await ElMessageBox.alert(t('contract.renewLoanItemIncomplete'), t('contract.renewTitle'), {
      type: 'warning',
      confirmButtonText: t('common.confirm'),
    })
    return
  }

  try {
    await ElMessageBox.confirm(
      t('contract.renewConfirm', {
        code: preview.value.source.contractCode,
        roomDeposit: money(preview.value.transfer.roomDepositTransferred),
        bookingDeposit: money(preview.value.transfer.bookingDepositTransferred),
      }),
      t('contract.renewTitle'),
      {
        type: 'warning',
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
      },
    )
  } catch {
    return
  }

  submitting.value = true
  try {
    const { data } = await renewContractApi(
      id,
      {
        monthlyRent: rent,
        startDate: form.startDate,
        endDate: form.endDate,
        paymentCycle: form.paymentCycle,
        electricityRate: form.electricityRate,
        doorKeyQty: Math.max(0, Math.trunc(Number(form.doorKeyQty) || 0)),
        mailboxKeyQty: Math.max(0, Math.trunc(Number(form.mailboxKeyQty) || 0)),
        periods: periods.value.map((p, i) => ({
          dateType: p.dateType,
          dateUnit: p.dateUnit,
          dateValue: Number(p.dateValue) || 0,
          startDate: p.startDate,
          endDate: p.endDate,
          sortOrder: i,
        })),
        loanItems: loanPayloadRows.map((f, i) => ({
          description: f.description.trim(),
          quantity: Math.max(0, Number(f.quantity) || 0),
          unitAmount: Math.max(0, Number(f.unitAmount) || 0),
          subtotal: loanItemSubtotal(f),
          remark: f.remark || '',
          sortOrder: i,
        })),
        remark: form.remark.trim() || undefined,
      },
      { silentError: true },
    )
    const newCode = data?.contract?.contractCode || ''
    const newId = data?.contract?.id || ''
    await ElMessageBox.alert(
      t('contract.renewSuccess', { code: newCode }),
      t('contract.renewTitle'),
      { type: 'success', confirmButtonText: t('common.confirm') },
    )
    visible.value = false
    emit('done', { newContractId: newId, newContractCode: newCode })
  } catch (e) {
    await ElMessageBox.alert(
      apiErrorMessage(e, t('contract.renewFailed')),
      t('contract.renewTitle'),
      { type: 'error', confirmButtonText: t('common.confirm') },
    )
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    class="lb-dialog renew-dlg-dialog"
    :title="t('contract.renewTitle')"
    width="900px"
    :z-index="dialogZ"
    destroy-on-close
    @closed="preview = null"
  >
    <div v-loading="loading" class="renew-dlg">
      <template v-if="preview">
        <header class="renew-dlg__hero">
          <div class="renew-dlg__hero-code">
            <strong>{{ preview.source.contractCode || '—' }}</strong>
            <StatusBadge
              :tone="contractStatusTone(preview.source.status)"
              :label="statusLabel(preview.source.status)"
            />
          </div>
          <div class="renew-dlg__hero-meta renew-dlg__hero-meta--grid">
            <div class="renew-dlg__hero-cell">
              <em>{{ t('contract.fields.roomCode') }}</em>
              <button
                v-if="preview.source.roomId"
                type="button"
                class="fk-link"
                @click="openRelated('room', preview.source.roomId)"
              >
                {{ preview.source.roomCode || '—' }}
              </button>
              <span v-else>{{ preview.source.roomCode || '—' }}</span>
            </div>
            <div class="renew-dlg__hero-cell">
              <em>{{ t('contract.fields.customerName') }}</em>
              <button
                v-if="preview.source.customerId"
                type="button"
                class="fk-link"
                @click="openRelated('customer', preview.source.customerId)"
              >
                {{ preview.source.customerName || '—' }}
              </button>
              <span v-else>{{ preview.source.customerName || '—' }}</span>
            </div>
            <div class="renew-dlg__hero-cell renew-dlg__hero-occupancy">
              <em>{{ t('contract.fields.occupancyMode') }}</em>
              <StatusBadge
                :tone="contractOccupancyTone(preview.source.occupancyMode)"
                :label="occupancyLabelOf(preview.source)"
              />
            </div>
            <div class="renew-dlg__hero-cell">
              <em>{{ t('contract.fields.startDate') }}</em>
              <span>{{ preview.source.startDate || '—' }}</span>
            </div>
            <div class="renew-dlg__hero-cell">
              <em>{{ t('contract.fields.endDate') }}</em>
              <span>{{ preview.source.endDate || '—' }}</span>
            </div>
            <div class="renew-dlg__hero-cell">
              <em>{{ t('contract.fields.monthlyRent') }}</em>
              <span>{{ money(preview.source.monthlyRent) }}</span>
            </div>
          </div>
        </header>

        <section class="renew-dlg__section">
          <div class="renew-dlg__section-head">
            <span class="renew-dlg__step">1</span>
            <h4 class="renew-dlg__section-title-with-tip">
              {{ t('contract.renewSectionTransfer') }}
              <el-tooltip
                :content="t('contract.renewNoAdjustHint')"
                placement="top"
                :popper-style="tipPopperStyle"
              >
                <el-icon class="renew-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
              </el-tooltip>
            </h4>
          </div>

          <div class="renew-dlg__amt-grid renew-dlg__amt-grid--3">
            <div class="renew-dlg__amt-card">
              <span class="renew-dlg__amt-label">{{ t('contract.renewRoomDepositTransfer') }}</span>
              <strong class="renew-dlg__amt-val">{{
                money(preview.transfer.roomDepositTransferred)
              }}</strong>
            </div>
            <div class="renew-dlg__amt-card">
              <span class="renew-dlg__amt-label">{{ t('contract.renewBookingDepositTransfer') }}</span>
              <strong class="renew-dlg__amt-val">{{
                money(preview.transfer.bookingDepositTransferred)
              }}</strong>
            </div>
            <div class="renew-dlg__amt-card">
              <span class="renew-dlg__amt-label renew-dlg__amt-label--with-tip">
                {{ t('contract.renewLoanItemsTransfer') }}
                <el-tooltip
                  :content="t('contract.renewLoanItemsHint')"
                  placement="top"
                  :popper-style="tipPopperStyle"
                >
                  <el-icon class="renew-dlg__label-tip" :size="13"><QuestionFilled /></el-icon>
                </el-tooltip>
              </span>
              <strong class="renew-dlg__amt-val renew-dlg__amt-val--sm">
                {{
                  t('contract.renewLoanItemsCount', {
                    n: loanItems.length,
                    amount: money(preview.transfer.loanItemsDeposit ?? preview.source.loanItemsDeposit),
                  })
                }}
              </strong>
            </div>
          </div>

          <div
            v-if="preview.hint || (!preview.renewable && preview.blockReason)"
            class="renew-dlg__banner"
            :class="preview.renewable ? 'is-warn' : 'is-danger'"
          >
            <span class="renew-dlg__banner-dot" />
            <div class="renew-dlg__banner-body">
              <p class="renew-dlg__banner-title">
                {{ preview.renewable ? preview.hint : preview.blockReason }}
              </p>
            </div>
          </div>
        </section>

        <section class="renew-dlg__section">
          <div class="renew-dlg__section-head">
            <span class="renew-dlg__step">2</span>
            <h4>{{ t('contract.renewSectionNew') }}</h4>
          </div>
          <el-form label-position="top" class="renew-dlg__form" @submit.prevent>
            <div class="renew-dlg__row3">
              <el-form-item :label="t('contract.fields.monthlyRent')" required>
                <el-input-number
                  v-model="form.monthlyRent"
                  :min="0"
                  :precision="2"
                  :step="100"
                  controls-position="right"
                  class="renew-dlg__num"
                />
              </el-form-item>
              <el-form-item :label="t('contract.fields.startDate')" required>
                <el-date-picker
                  v-model="form.startDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  :clearable="false"
                  :popper-style="fieldPopperStyle"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item :label="t('contract.fields.endDate')" required>
                <el-date-picker
                  v-model="form.endDate"
                  type="date"
                  value-format="YYYY-MM-DD"
                  :clearable="false"
                  :popper-style="fieldPopperStyle"
                  style="width: 100%"
                />
              </el-form-item>
            </div>
            <div class="renew-dlg__row2">
              <el-form-item :label="t('contract.fields.paymentCycle')">
                <el-select
                  clearable
                  value-on-clear=""
                  fit-input-width
                  v-model="form.paymentCycle"
                  :popper-style="fieldPopperStyle"
                  style="width: 100%"
                >
                  <el-option
                    v-for="pc in CONTRACT_PAYMENT_CYCLES"
                    :key="pc"
                    :label="pc"
                    :value="pc"
                  />
                </el-select>
              </el-form-item>
              <el-form-item :label="t('contract.fields.electricityRate')">
                <el-input-number
                  v-model="form.electricityRate"
                  :min="0"
                  :precision="2"
                  :step="0.1"
                  controls-position="right"
                  class="renew-dlg__num"
                />
              </el-form-item>
            </div>
            <div class="renew-dlg__row2">
              <el-form-item>
                <template #label>
                  <span class="renew-dlg__label-with-tip">
                    {{ t('contract.fields.doorKeyQty') }}
                    <el-tooltip
                      :content="t('contract.renewKeysHint')"
                      placement="top"
                      :popper-style="tipPopperStyle"
                    >
                      <el-icon class="renew-dlg__label-tip" :size="13"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </span>
                </template>
                <el-input-number
                  v-model="form.doorKeyQty"
                  :min="0"
                  :step="1"
                  :precision="0"
                  controls-position="right"
                  class="renew-dlg__num"
                />
              </el-form-item>
              <el-form-item :label="t('contract.fields.mailboxKeyQty')">
                <el-input-number
                  v-model="form.mailboxKeyQty"
                  :min="0"
                  :step="1"
                  :precision="0"
                  controls-position="right"
                  class="renew-dlg__num"
                />
              </el-form-item>
            </div>
            <el-form-item :label="t('contract.fields.remark')">
              <el-input
                v-model="form.remark"
                type="textarea"
                :rows="2"
                maxlength="500"
                show-word-limit
              />
            </el-form-item>
          </el-form>
        </section>

        <section class="renew-dlg__section">
          <div class="renew-dlg__section-head renew-dlg__section-head--periods">
            <div class="renew-dlg__period-head-left">
              <span class="renew-dlg__step">3</span>
              <h4>{{ t('contract.sections.periods') }}</h4>
              <el-button
                type="primary"
                size="small"
                plain
                :icon="Plus"
                class="renew-dlg__period-add"
                @click="addPeriod"
              >
                {{ t('contract.addPeriod') }}
              </el-button>
            </div>
            <div v-if="periods.length > PERIOD_PAGE_SIZE" class="period-table-pager">
              <el-pagination
                v-model:current-page="periodPage"
                :page-size="PERIOD_PAGE_SIZE"
                :total="periods.length"
                layout="total, prev, pager, next"
                small
                background
                class="period-pager"
              />
            </div>
          </div>

          <div class="period-table-wrap">
            <div
              class="period-table"
              :class="{ 'period-table--en': periodTableEn }"
              role="table"
              :style="{ '--period-page-size': PERIOD_PAGE_SIZE }"
            >
              <div class="period-table__head" role="row">
                <div class="period-table__cell period-table__cell--index" role="columnheader">#</div>
                <div class="period-table__cell period-table__cell--type" role="columnheader">
                  <span class="req">*</span>{{ t('contract.fields.dateType') }}
                </div>
                <div class="period-table__cell period-table__cell--unit" role="columnheader">
                  {{ t('contract.fields.dateUnit') }}
                </div>
                <div class="period-table__cell period-table__cell--value" role="columnheader">
                  {{ t('contract.fields.dateValue') }}
                </div>
                <div class="period-table__cell period-table__cell--duration" role="columnheader">
                  {{ t('contract.fields.duration') }}
                </div>
                <div class="period-table__cell period-table__cell--start" role="columnheader">
                  <span class="req">*</span>{{ t('contract.fields.periodStart') }}
                </div>
                <div class="period-table__cell period-table__cell--to" role="columnheader" />
                <div class="period-table__cell period-table__cell--end" role="columnheader">
                  <span class="req">*</span>{{ t('contract.fields.periodEnd') }}
                </div>
                <div class="period-table__cell period-table__cell--actions" role="columnheader" />
              </div>
              <div
                class="period-table__body"
                :class="{ 'period-table__body--fixed': periods.length > PERIOD_PAGE_SIZE }"
              >
                <div
                  v-for="{ p, index } in pagedPeriods"
                  :key="p.uid"
                  class="period-table__row"
                  role="row"
                  :class="{
                    'is-dragging': dragPeriodUid === p.uid,
                    'is-drag-over': dragOverPeriodUid === p.uid,
                    'is-editing-index': editingPeriodIndexUid === p.uid,
                  }"
                  @dragover="onPeriodDragOver(p.uid, $event)"
                  @drop="onPeriodDrop(p.uid, $event)"
                  @dragleave="dragOverPeriodUid === p.uid && (dragOverPeriodUid = null)"
                >
                  <div
                    class="period-table__cell period-table__cell--index"
                    :class="{ 'is-editing-index': editingPeriodIndexUid === p.uid }"
                    role="cell"
                  >
                    <button
                      type="button"
                      class="period-row__handle"
                      draggable="true"
                      :title="t('contract.dragPeriod')"
                      aria-label="drag"
                      @dragstart="onPeriodDragStart(p.uid, $event)"
                      @dragend="onPeriodDragEnd"
                    >
                      <el-icon :size="14"><Rank /></el-icon>
                    </button>
                    <input
                      v-if="editingPeriodIndexUid === p.uid"
                      ref="periodIndexInputRef"
                      :value="editingPeriodIndexDraft"
                      class="period-row__index-input"
                      type="text"
                      inputmode="numeric"
                      pattern="[0-9]*"
                      maxlength="4"
                      :aria-label="t('contract.editPeriodIndex')"
                      @input="
                        editingPeriodIndexDraft = ($event.target as HTMLInputElement).value.replace(
                          /\D/g,
                          '',
                        )
                      "
                      @keydown="onPeriodIndexKeydown"
                      @blur="commitEditPeriodIndex"
                    />
                    <button
                      v-else
                      type="button"
                      class="period-row__index"
                      :title="t('contract.editPeriodIndexHint')"
                      @dblclick.stop="startEditPeriodIndex(p.uid, index)"
                    >
                      {{ index + 1 }}
                    </button>
                  </div>
                  <div class="period-table__cell period-table__cell--type" role="cell">
                    <el-select
                      clearable
                      value-on-clear=""
                      fit-input-width
                      v-model="p.dateType"
                      style="width: 100%"
                      :popper-style="fieldPopperStyle"
                    >
                      <el-option
                        v-for="pt in periodTypeOptions"
                        :key="pt.id"
                        :label="pt.label"
                        :value="pt.label"
                      />
                      <el-option
                        v-if="
                          p.dateType &&
                          !periodTypeOptions.some((o) => o.label === p.dateType)
                        "
                        :label="p.dateType"
                        :value="p.dateType"
                      />
                    </el-select>
                  </div>
                  <div class="period-table__cell period-table__cell--unit" role="cell">
                    <el-select
                      clearable
                      value-on-clear=""
                      fit-input-width
                      v-model="p.dateUnit"
                      style="width: 100%"
                      :popper-style="fieldPopperStyle"
                      @change="onPeriodDurationChange(p, index)"
                    >
                      <el-option
                        v-for="u in CONTRACT_PERIOD_UNITS"
                        :key="u"
                        :label="t(`contract.periodUnits.${u}`)"
                        :value="u"
                      />
                    </el-select>
                  </div>
                  <div class="period-table__cell period-table__cell--value" role="cell">
                    <el-input-number
                      v-model="p.dateValue"
                      :min="0"
                      :controls="false"
                      style="width: 100%"
                      @change="onPeriodDurationChange(p, index)"
                    />
                  </div>
                  <div class="period-table__cell period-table__cell--duration" role="cell">
                    <span class="period-row__duration">{{ periodDurationLabel(p) }}</span>
                  </div>
                  <div class="period-table__cell period-table__cell--start" role="cell">
                    <el-date-picker
                      v-model="p.startDate"
                      type="date"
                      value-format="YYYY-MM-DD"
                      :placeholder="t('contract.fields.periodStart')"
                      style="width: 100%"
                      :popper-style="fieldPopperStyle"
                      @change="onPeriodDatesChange(p, index)"
                    />
                  </div>
                  <div class="period-table__cell period-table__cell--to" role="cell">
                    <span class="period-row__to">至</span>
                  </div>
                  <div class="period-table__cell period-table__cell--end" role="cell">
                    <el-date-picker
                      v-model="p.endDate"
                      type="date"
                      value-format="YYYY-MM-DD"
                      :placeholder="t('contract.fields.periodEnd')"
                      style="width: 100%"
                      :popper-style="fieldPopperStyle"
                      @change="onPeriodDatesChange(p, index)"
                    />
                  </div>
                  <div class="period-table__cell period-table__cell--actions" role="cell">
                    <el-button type="danger" link :icon="Delete" @click="removePeriod(index)" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="renew-dlg__section">
          <div class="renew-dlg__section-head renew-dlg__section-head--periods">
            <div class="renew-dlg__period-head-left">
              <span class="renew-dlg__step">4</span>
              <h4 class="renew-dlg__section-title-with-tip">
                {{ t('contract.sections.loanItems') }}
                <el-tooltip
                  :content="t('contract.renewLoanItemsHint')"
                  placement="top"
                  :popper-style="tipPopperStyle"
                >
                  <el-icon class="renew-dlg__label-tip" :size="14"><QuestionFilled /></el-icon>
                </el-tooltip>
              </h4>
              <el-button
                type="primary"
                size="small"
                plain
                :icon="Plus"
                class="renew-dlg__period-add"
                @click="addLoanItem"
              >
                {{ t('contract.addLoanItem') }}
              </el-button>
            </div>
            <div v-if="loanItems.length > LOAN_ITEM_PAGE_SIZE" class="period-table-pager">
              <el-pagination
                v-model:current-page="loanItemPage"
                :page-size="LOAN_ITEM_PAGE_SIZE"
                :total="loanItems.length"
                layout="total, prev, pager, next"
                small
                background
                class="period-pager"
              />
            </div>
          </div>

          <p v-if="!loanItems.length" class="renew-dlg__empty">
            {{ t('contract.renewLoanItemsEmpty') }}
          </p>
          <div v-else class="period-table-wrap">
            <div
              class="period-table loan-item-table"
              role="table"
              :style="{ '--period-page-size': LOAN_ITEM_PAGE_SIZE }"
            >
              <div class="period-table__head" role="row">
                <div class="period-table__cell period-table__cell--index" role="columnheader">#</div>
                <div class="period-table__cell loan-item-table__cell--desc" role="columnheader">
                  {{ t('contractLoanItem.fields.description') }}
                </div>
                <div class="period-table__cell loan-item-table__cell--qty" role="columnheader">
                  <span class="renew-dlg__qty-head">
                    {{ t('contractLoanItem.fields.quantity') }}
                    <el-tooltip
                      :content="t('contract.renewLoanItemsQtyHint')"
                      placement="top"
                      :popper-style="tipPopperStyle"
                    >
                      <el-icon class="renew-dlg__label-tip" :size="12"><QuestionFilled /></el-icon>
                    </el-tooltip>
                  </span>
                </div>
                <div class="period-table__cell loan-item-table__cell--unit" role="columnheader">
                  {{ t('contractLoanItem.fields.unitAmount') }}
                </div>
                <div class="period-table__cell loan-item-table__cell--sub" role="columnheader">
                  {{ t('contractLoanItem.fields.subtotal') }}
                </div>
                <div class="period-table__cell loan-item-table__cell--remark" role="columnheader">
                  {{ t('contractLoanItem.fields.remark') }}
                </div>
                <div class="period-table__cell loan-item-table__cell--actions" role="columnheader" />
              </div>
              <div
                class="period-table__body"
                :class="{ 'period-table__body--fixed': loanItems.length > LOAN_ITEM_PAGE_SIZE }"
              >
                <div
                  v-for="{ row, index } in pagedLoanItems"
                  :key="row.uid"
                  class="period-table__row"
                  role="row"
                >
                  <div class="period-table__cell period-table__cell--index" role="cell">
                    <span class="period-row__index is-readonly">{{ index + 1 }}</span>
                  </div>
                  <div class="period-table__cell loan-item-table__cell--desc" role="cell">
                    <el-input
                      v-if="!row.fromSource"
                      v-model="row.description"
                      :placeholder="t('contractLoanItem.fields.description')"
                    />
                    <span v-else class="renew-dlg__cell-text">{{ row.description || '—' }}</span>
                  </div>
                  <div class="period-table__cell loan-item-table__cell--qty" role="cell">
                    <el-input-number
                      v-model="row.quantity"
                      :min="0"
                      :precision="2"
                      :step="1"
                      controls-position="right"
                      style="width: 100%"
                    />
                  </div>
                  <div class="period-table__cell loan-item-table__cell--unit" role="cell">
                    <el-input-number
                      v-if="!row.fromSource"
                      v-model="row.unitAmount"
                      :min="0"
                      :precision="2"
                      :step="1"
                      controls-position="right"
                      style="width: 100%"
                    />
                    <span v-else class="renew-dlg__cell-num">{{ money(row.unitAmount) }}</span>
                  </div>
                  <div class="period-table__cell loan-item-table__cell--sub" role="cell">
                    <span class="renew-dlg__cell-num is-strong">{{ money(loanItemSubtotal(row)) }}</span>
                  </div>
                  <div class="period-table__cell loan-item-table__cell--remark" role="cell">
                    <el-input
                      v-if="!row.fromSource"
                      v-model="row.remark"
                      :placeholder="t('contractLoanItem.fields.remark')"
                    />
                    <span v-else class="renew-dlg__cell-text">{{ row.remark || '—' }}</span>
                  </div>
                  <div class="period-table__cell loan-item-table__cell--actions" role="cell">
                    <el-button
                      v-if="!row.fromSource"
                      type="danger"
                      link
                      :icon="Delete"
                      @click="removeLoanItem(index)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </template>
    </div>

    <template #footer>
      <div class="renew-dlg__footer">
        <el-button :disabled="submitting || previewing" @click="visible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button
          :loading="previewing"
          :disabled="loading || submitting || !preview"
          @click="onPreviewAgreement"
        >
          {{ t('contract.previewAgreement') }}
        </el-button>
        <el-button
          v-if="perms.create"
          v-admin-glow="perms.codes.create"
          type="primary"
          :loading="submitting"
          :disabled="loading || previewing || !preview?.renewable"
          @click="onSubmit"
        >
          {{ t('contract.renewSubmit') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.renew-dlg {
  min-height: 120px;
}

.renew-dlg__hero {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 6%, #fff);
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 16%, #e6e6e6);
}

.renew-dlg__hero-code {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.renew-dlg__hero-code strong {
  font-size: 1.05rem;
  font-weight: 750;
  color: var(--lb-ink, #1a1a1a);
}

.renew-dlg__hero-meta--grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px 16px;
  font-size: 0.88rem;
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 35%, #333);
}

.renew-dlg__hero-cell {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.renew-dlg__hero-cell em {
  flex: 0 0 auto;
  font-style: normal;
  color: var(--lb-muted, #666);
}

.renew-dlg__hero-cell > span,
.renew-dlg__hero-cell > .fk-link {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.renew-dlg__hero-occupancy {
  align-items: center;
}

.renew-dlg__section {
  margin-bottom: 18px;
}

.renew-dlg__section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.renew-dlg__section-head--periods {
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.renew-dlg__period-head-left {
  display: flex;
  align-items: center;
  gap: 8px 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.renew-dlg__section-head h4 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--lb-ink, #1a1a1a);
}

.renew-dlg__section-title-with-tip,
.renew-dlg__label-with-tip,
.renew-dlg__amt-label--with-tip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.renew-dlg__label-tip {
  color: var(--lb-muted, #666);
  cursor: help;
  outline: none;
}

.renew-dlg__label-tip:hover {
  color: var(--lb-brand, #0f4a32);
}

.renew-dlg__step {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  background: var(--lb-brand, #0f4a32);
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
}

.renew-dlg__period-add.el-button {
  --el-button-bg-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 10%, #fff);
  --el-button-border-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 32%, #e6e6e6);
  --el-button-text-color: var(--lb-brand, #0f4a32);
  --el-button-hover-bg-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 16%, #fff);
  --el-button-hover-border-color: var(--lb-brand, #0f4a32);
  --el-button-hover-text-color: var(--lb-brand, #0f4a32);
  --el-button-active-bg-color: color-mix(in srgb, var(--lb-brand, #0f4a32) 20%, #fff);
  --el-button-active-border-color: var(--lb-brand, #0f4a32);
  margin-left: 4px;
  height: 28px;
  padding: 0 12px 0 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 650;
  letter-spacing: 0.01em;
  box-shadow: 0 1px 0 color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, transparent);
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.12s ease;
}

.renew-dlg__period-add.el-button:hover {
  box-shadow: 0 2px 6px color-mix(in srgb, var(--lb-brand, #0f4a32) 16%, transparent);
}

.renew-dlg__period-add.el-button:active {
  transform: translateY(0.5px);
}

.renew-dlg__period-add.el-button :deep(.el-icon) {
  font-size: 13px;
  margin-right: 2px;
}

.renew-dlg__amt-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
  margin-bottom: 10px;
}

.renew-dlg__amt-grid--3 {
  grid-template-columns: 1fr 1fr 1fr;
}

.renew-dlg__amt-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, #e6e6e6);
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 2%, #fff);
}

.renew-dlg__amt-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--lb-muted, #666);
  line-height: 1.35;
}

.renew-dlg__amt-val {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--lb-brand, #0f4a32);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
}

.renew-dlg__amt-val--sm {
  font-size: 0.95rem;
  font-weight: 750;
}

.renew-dlg__banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid transparent;
}

.renew-dlg__banner.is-warn {
  background: #fff7ed;
  border-color: #f0d2a8;
}

.renew-dlg__banner.is-danger {
  background: #fef3f2;
  border-color: #f0c4bf;
}

.renew-dlg__banner-dot {
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.renew-dlg__banner.is-warn .renew-dlg__banner-dot {
  background: #b86a1a;
  box-shadow: 0 0 0 3px rgba(184, 106, 26, 0.14);
}

.renew-dlg__banner.is-danger .renew-dlg__banner-dot {
  background: #b42318;
  box-shadow: 0 0 0 3px rgba(180, 35, 24, 0.14);
}

.renew-dlg__banner-body {
  min-width: 0;
  flex: 1 1 auto;
}

.renew-dlg__banner-title {
  margin: 0;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.45;
}

.renew-dlg__banner.is-warn .renew-dlg__banner-title {
  color: #9a4f0a;
}

.renew-dlg__banner.is-danger .renew-dlg__banner-title {
  color: #912018;
}

.renew-dlg__form {
  display: grid;
  gap: 4px;
}

.renew-dlg__form :deep(.el-form-item__label) {
  color: var(--lb-muted, #666);
  font-weight: 550;
  font-size: 0.84rem;
  margin-bottom: 6px !important;
}

.renew-dlg__row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
  align-items: start;
}

.renew-dlg__row3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px 16px;
  align-items: start;
}

.renew-dlg__row2 > .el-form-item,
.renew-dlg__row3 > .el-form-item {
  margin-bottom: 18px;
}

.renew-dlg__num {
  width: 100%;
}

.period-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, #e6e6e6);
  border-radius: 8px;
  background: #fff;
}

.period-table-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex: 0 0 auto;
  margin-left: auto;
  padding: 2px 4px 2px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 5%, #fff);
  border: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 14%, #e6e6e6);
}

.period-pager.el-pagination {
  --el-pagination-button-bg-color: #fff;
  --el-pagination-hover-color: var(--lb-brand, #0f4a32);
  --el-pagination-button-color: var(--lb-muted, #666);
  font-weight: 600;
  gap: 2px;
}

.period-table {
  --period-row-h: 44px;
  --period-page-size: 5;
  --period-col-unit: 72px;
  --period-col-value: 72px;
  --period-col-duration: 72px;
  display: grid;
  min-width: 780px;
}

.period-table--en {
  --period-col-unit: 104px;
  --period-col-value: 56px;
  --period-col-duration: 96px;
  min-width: 820px;
}

.period-table__head,
.period-table__row {
  display: grid;
  grid-template-columns:
    52px
    minmax(118px, 1.2fr)
    var(--period-col-unit)
    var(--period-col-value)
    var(--period-col-duration)
    minmax(128px, 1fr)
    28px
    minmax(128px, 1fr)
    40px;
  align-items: center;
  column-gap: 6px;
  padding: 0 8px;
}

.period-table__head {
  min-height: 34px;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 5%, #fff);
  border-bottom: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 12%, #e8e8e8);
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 28%, #333);
  font-size: 0.78rem;
  font-weight: 700;
}

.period-table__body--fixed {
  box-sizing: border-box;
  height: calc(var(--period-row-h) * var(--period-page-size));
  min-height: calc(var(--period-row-h) * var(--period-page-size));
  overflow: hidden;
}

.period-table__row {
  box-sizing: border-box;
  min-height: var(--period-row-h);
  height: var(--period-row-h);
  border-bottom: 1px solid color-mix(in srgb, var(--lb-brand, #0f4a32) 8%, #eee);
  background: #fff;
}

.period-table__body:not(.period-table__body--fixed) .period-table__row:last-child {
  border-bottom: none;
}

.period-table__row.is-dragging {
  opacity: 0.45;
}

.period-table__row.is-editing-index {
  position: relative;
  z-index: 4;
  overflow: visible;
}

.period-table__row.is-drag-over {
  background: color-mix(in srgb, var(--lb-brand) 6%, #fff);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lb-brand) 35%, #fff);
}

.period-table__cell {
  display: flex;
  align-items: center;
  min-width: 0;
}

.period-table__cell--index {
  gap: 1px;
  position: relative;
  overflow: visible;
}

.period-table__cell--to,
.period-table__cell--actions,
.period-table__cell--duration {
  justify-content: center;
}

.period-table__head .req {
  color: #e35d5d;
  margin-right: 2px;
}

.period-row__handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--lb-muted, #666);
  cursor: grab;
}

.period-row__handle:hover {
  background: color-mix(in srgb, var(--lb-brand) 10%, #fff);
  color: var(--lb-brand);
}

.period-row__index {
  appearance: none;
  min-width: 1rem;
  margin: 0;
  padding: 0 1px;
  border: none;
  border-radius: 4px;
  background: transparent;
  text-align: center;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--lb-muted, #666);
  cursor: text;
}

.period-row__index-input {
  box-sizing: border-box;
  position: absolute;
  left: 18px;
  top: 50%;
  z-index: 6;
  width: 2.4rem;
  height: 24px;
  margin: 0;
  padding: 0 3px;
  border: 1px solid var(--lb-brand, #0f4a32);
  border-radius: 5px;
  background: #fff;
  color: var(--lb-brand, #0f4a32);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  text-align: center;
  transform: translateY(-50%);
}

.period-row__duration {
  color: var(--lb-muted, #666);
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}

.period-row__to {
  color: var(--lb-muted, #666);
  font-size: 0.78rem;
}

.period-row__index.is-readonly {
  cursor: default;
}

.period-row__index.is-readonly:hover {
  background: transparent;
  color: var(--lb-muted, #666);
}

.loan-item-table.period-table .period-table__head,
.loan-item-table.period-table .period-table__row {
  grid-template-columns:
    44px
    minmax(140px, 1.6fr)
    100px
    110px
    110px
    minmax(100px, 1fr)
    40px;
}

.loan-item-table__cell--actions {
  justify-content: center;
}

.renew-dlg__cell-text {
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.84rem;
  color: var(--lb-ink, #1a1a1a);
}

.renew-dlg__cell-num {
  font-size: 0.84rem;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--lb-brand, #0f4a32) 35%, #333);
}

.renew-dlg__cell-num.is-strong {
  font-weight: 700;
  color: var(--lb-brand, #0f4a32);
}

.renew-dlg__qty-head {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.renew-dlg__empty {
  margin: 0;
  padding: 14px 16px;
  text-align: center;
  color: var(--lb-muted, #666);
  font-size: 0.84rem;
  background: color-mix(in srgb, var(--lb-brand, #0f4a32) 4%, #fff);
  border-radius: 8px;
  border: 1px dashed color-mix(in srgb, var(--lb-brand, #0f4a32) 22%, #e0e0e0);
}

.renew-dlg__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  width: 100%;
}

@media (max-height: 900px) {
  .renew-dlg__row2,
  .renew-dlg__row3,
  .renew-dlg__hero-meta--grid,
  .renew-dlg__amt-grid,
  .renew-dlg__amt-grid--3 {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .renew-dlg__amt-grid--3 {
    grid-template-columns: 1fr;
  }
  .renew-dlg__row2,
  .renew-dlg__row3,
  .renew-dlg__hero-meta--grid {
    grid-template-columns: 1fr;
  }
}
</style>

<style>
.renew-dlg-dialog.lb-dialog {
  max-width: calc(100vw - 32px);
}

.renew-dlg-dialog .el-dialog__footer {
  display: flex;
  justify-content: flex-end;
}
</style>
