<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowDown } from '@element-plus/icons-vue'
import StatusBadge from '@/components/StatusBadge.vue'
import type {
  RoomOccupancy,
  RoomLeaseCapability,
  RoomOccupancySlot,
  RoomStatus,
} from '@/types/room'
import { roomStatusTone, type StatusTone } from '@/constants/statusBadges'

/** 全局仅保留一个份位汽包；点外关闭，但忽略汽包自身与左侧合约抽屉（避免抢焦点卡顿） */
let dismissActiveSplitPopover: (() => void) | null = null
let splitPopoverOutsideBound = false

function shouldIgnoreSplitPopoverOutside(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true
  if (target.closest('.room-occ-popper')) return true
  if (target.closest('.occ-trigger')) return true
  if (target.closest('.el-drawer')) return true
  if (target.closest('.el-message-box')) return true
  if (target.closest('.el-dialog')) return true
  const overlay = target.closest('.el-overlay')
  if (overlay?.querySelector('.el-drawer, .el-dialog, .el-message-box')) return true
  return false
}

function onSplitPopoverDocPointerDown(e: PointerEvent) {
  if (shouldIgnoreSplitPopoverOutside(e.target)) return
  dismissActiveSplitPopover?.()
}

function onSplitPopoverDocKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  dismissActiveSplitPopover?.()
}

function bindSplitPopoverOutsideClose() {
  if (splitPopoverOutsideBound) return
  splitPopoverOutsideBound = true
  // 错开打开当次点击，避免刚打开就被关掉
  requestAnimationFrame(() => {
    if (!splitPopoverOutsideBound) return
    document.addEventListener('pointerdown', onSplitPopoverDocPointerDown, true)
    document.addEventListener('keydown', onSplitPopoverDocKeydown, true)
  })
}

function unbindSplitPopoverOutsideClose() {
  if (!splitPopoverOutsideBound) return
  splitPopoverOutsideBound = false
  document.removeEventListener('pointerdown', onSplitPopoverDocPointerDown, true)
  document.removeEventListener('keydown', onSplitPopoverDocKeydown, true)
}

const props = withDefaults(
  defineProps<{
    occupancy?: RoomOccupancy | null
    leaseCapability?: RoomLeaseCapability | string
    splitLabels?: string[]
    /** compact=列表单元格（分租可点开）；expanded=详情抽屉直接列出份位 */
    variant?: 'compact' | 'expanded'
  }>(),
  {
    occupancy: null,
    leaseCapability: 'flexible',
    splitLabels: () => [],
    variant: 'compact',
  },
)

const emit = defineEmits<{
  openContract: [contractId: string]
}>()

const { t } = useI18n()
/** manual：点份额开抽屉不会因点外/失焦关掉，避免与抽屉抢焦点造成卡顿 */
const popoverVisible = ref(false)

const summary = computed(() => props.occupancy?.summary || 'idle')

const slots = computed((): RoomOccupancySlot[] => {
  if (props.occupancy?.slots?.length) return props.occupancy.slots
  if (props.leaseCapability !== 'flexible') return []
  return (props.splitLabels || []).map((label) => ({ label, occupied: false }))
})

/** idle | whole | split */
const kind = computed<'idle' | 'whole' | 'split'>(() => {
  if (summary.value === 'whole') return 'whole'
  if (summary.value === 'idle') return 'idle'
  return 'split'
})

/** 合约业务状态 → 房间四态（闲置中 / 签约中 / 租赁中 / 退租中） */
function contractToRoomStatus(raw?: string | null): RoomStatus {
  const s = (raw || '').trim()
  if (!s) return 'idle'
  if (s === '退租中') return 'terminating'
  if (s === '租賃中' || s === '已續約') return 'leased'
  if (s === '簽約中' || s === '已簽約' || s === '交吉中') return 'signing'
  return 'leased'
}

/** 租用情况摘要：整租→四态；分租→分租中；闲置→闲置中 */
const badge = computed(() => {
  if (kind.value === 'split') {
    return { tone: 'leasing' as StatusTone, label: t('room.occupancy.split') }
  }
  if (kind.value === 'whole') {
    const st = contractToRoomStatus(props.occupancy?.wholeStatus)
    return { tone: roomStatusTone(st), label: t(`room.status.${st}`) }
  }
  return { tone: 'idle' as StatusTone, label: t('room.status.idle') }
})

const wholeContractId = computed(() => props.occupancy?.wholeContractId || '')

const wholeTitle = computed(() => {
  if (kind.value !== 'whole') return ''
  const tip = [props.occupancy?.wholeContractCode, props.occupancy?.wholeCustomerName]
    .filter(Boolean)
    .join(' · ')
  if (wholeContractId.value) {
    return tip ? `${tip} · ${t('room.occupancy.openContractHint')}` : t('room.occupancy.openContractHint')
  }
  return tip
})

const occupiedCount = computed(() => slots.value.filter((s) => s.occupied).length)
const totalCount = computed(() => Math.max(slots.value.length, occupiedCount.value))

function slotRoomStatus(slot: RoomOccupancySlot): RoomStatus {
  if (!slot.occupied) return 'idle'
  return contractToRoomStatus(slot.status)
}

function slotStatusLabel(slot: RoomOccupancySlot) {
  return t(`room.status.${slotRoomStatus(slot)}`)
}

function toggleSplitPopover() {
  if (popoverVisible.value) {
    dismissActiveSplitPopover?.()
    return
  }
  dismissActiveSplitPopover?.()
  popoverVisible.value = true
  dismissActiveSplitPopover = () => {
    popoverVisible.value = false
    dismissActiveSplitPopover = null
    unbindSplitPopoverOutsideClose()
  }
  bindSplitPopoverOutsideClose()
}

onBeforeUnmount(() => {
  if (popoverVisible.value) dismissActiveSplitPopover?.()
})

function openContract(contractId?: string | null) {
  if (!contractId) return
  emit('openContract', contractId)
}

function onWholeClick() {
  openContract(wholeContractId.value)
}

function onSlotClick(slot: RoomOccupancySlot) {
  if (!slot.occupied || !slot.contractId) return
  openContract(slot.contractId)
}

function onSlotKeydown(slot: RoomOccupancySlot, e: KeyboardEvent) {
  if (e.key !== 'Enter' && e.key !== ' ') return
  e.preventDefault()
  onSlotClick(slot)
}
</script>

<template>
  <div class="occ-root" :class="`occ-root--${variant}`" @click.stop>
    <!-- 整租 / 閑置：仅徽章（整租可点开合约） -->
    <template v-if="kind !== 'split'">
      <button
        v-if="kind === 'whole' && wholeContractId"
        type="button"
        class="occ-whole-btn"
        :title="wholeTitle || t('room.occupancy.openContractHint')"
        @click="onWholeClick"
      >
        <StatusBadge :tone="badge.tone" :label="badge.label" />
      </button>
      <StatusBadge
        v-else
        :tone="badge.tone"
        :label="badge.label"
        :title="wholeTitle || undefined"
      />
    </template>

    <!-- 分租 · 详情抽屉：直接列出全部份位 -->
    <template v-else-if="variant === 'expanded'">
      <div class="occ-expanded">
        <div class="occ-expanded__summary">
          <StatusBadge :tone="badge.tone" :label="badge.label" />
          <span class="occ-expanded__ratio">{{ occupiedCount }}/{{ totalCount }}</span>
        </div>
        <ul class="occ-panel__list occ-panel__list--embedded">
          <li
            v-for="slot in slots"
            :key="slot.label"
            class="occ-slot"
            :class="{
              'occ-slot--busy': slot.occupied,
              'occ-slot--free': !slot.occupied,
              'occ-slot--clickable': slot.occupied && !!slot.contractId,
            }"
            :role="slot.occupied && slot.contractId ? 'button' : undefined"
            :tabindex="slot.occupied && slot.contractId ? 0 : undefined"
            :title="slot.occupied && slot.contractId ? t('room.occupancy.openContractHint') : undefined"
            @click="onSlotClick(slot)"
            @keydown="onSlotKeydown(slot, $event)"
          >
            <span class="occ-slot__badge" aria-hidden="true">{{ slot.label }}</span>
            <div class="occ-slot__main">
              <template v-if="slot.occupied">
                <div class="occ-slot__name" :title="slot.customerName">
                  {{ slot.customerName || '—' }}
                </div>
                <div v-if="slot.contractCode" class="occ-slot__code">{{ slot.contractCode }}</div>
              </template>
              <div v-else class="occ-slot__free">{{ t('room.occupancy.slotFreeShort') }}</div>
            </div>
            <StatusBadge
              :tone="roomStatusTone(slotRoomStatus(slot))"
              :label="slotStatusLabel(slot)"
            />
          </li>
        </ul>
      </div>
    </template>

    <!-- 分租 · 列表：点击查看份位，再点已租行开合约 -->
    <el-popover
      v-else
      :visible="popoverVisible"
      placement="bottom-start"
      :width="320"
      trigger="manual"
      :show-arrow="true"
      popper-class="room-occ-popper"
    >
      <template #reference>
        <button
          type="button"
          class="occ-trigger"
          :title="t('room.occupancy.splitHint')"
          @click.stop="toggleSplitPopover"
        >
          <StatusBadge :tone="badge.tone" :label="badge.label" />
          <span class="occ-trigger__meta">
            <span class="occ-trigger__ratio">{{ occupiedCount }}/{{ totalCount }}</span>
            <el-icon class="occ-trigger__caret" :size="12"><ArrowDown /></el-icon>
          </span>
        </button>
      </template>

      <div class="occ-panel">
        <header class="occ-panel__head">
          <span class="occ-panel__title">{{ t('room.occupancy.splitDetail') }}</span>
          <span class="occ-panel__ratio">{{ occupiedCount }}/{{ totalCount }}</span>
        </header>
        <ul class="occ-panel__list">
          <li
            v-for="slot in slots"
            :key="slot.label"
            class="occ-slot"
            :class="{
              'occ-slot--busy': slot.occupied,
              'occ-slot--free': !slot.occupied,
              'occ-slot--clickable': slot.occupied && !!slot.contractId,
            }"
            :role="slot.occupied && slot.contractId ? 'button' : undefined"
            :tabindex="slot.occupied && slot.contractId ? 0 : undefined"
            :title="slot.occupied && slot.contractId ? t('room.occupancy.openContractHint') : undefined"
            @click="onSlotClick(slot)"
            @keydown="onSlotKeydown(slot, $event)"
          >
            <span class="occ-slot__badge" aria-hidden="true">{{ slot.label }}</span>
            <div class="occ-slot__main">
              <template v-if="slot.occupied">
                <div class="occ-slot__name" :title="slot.customerName">
                  {{ slot.customerName || '—' }}
                </div>
                <div v-if="slot.contractCode" class="occ-slot__code">{{ slot.contractCode }}</div>
              </template>
              <div v-else class="occ-slot__free">{{ t('room.occupancy.slotFreeShort') }}</div>
            </div>
            <StatusBadge
              :tone="roomStatusTone(slotRoomStatus(slot))"
              :label="slotStatusLabel(slot)"
            />
          </li>
        </ul>
      </div>
    </el-popover>
  </div>
</template>

<style scoped>
.occ-root {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
}

.occ-root--expanded {
  display: block;
  width: 100%;
}

.occ-expanded {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.occ-expanded__summary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.occ-expanded__ratio {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  color: #0284c7;
  background: #eef6fb;
  box-shadow: inset 0 0 0 1px #b7d7ea;
}

.occ-panel__list--embedded {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.occ-whole-btn {
  display: inline-flex;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 999px;
}

.occ-whole-btn:hover :deep(.lb-status) {
  filter: brightness(0.97);
}

.occ-whole-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lb-brand) 18%, transparent);
}

.occ-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  max-width: 100%;
  border-radius: 999px;
}

.occ-trigger:hover :deep(.lb-status) {
  filter: brightness(0.98);
}

.occ-trigger:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--lb-brand) 18%, transparent);
}

.occ-trigger__meta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 7px 2px 8px;
  border-radius: 999px;
  background: #eef6fb;
  box-shadow: inset 0 0 0 1px #b7d7ea;
  color: #0284c7;
  font-size: 0.78rem;
  font-weight: 650;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
}

.occ-trigger__caret {
  opacity: 0.75;
}

/* 抽屉内嵌份位行（与全局 room-occ-popper 视觉一致） */
.occ-root--expanded .occ-slot {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 9px 11px;
  border-radius: 10px;
  border: 1px solid transparent;
}

.occ-root--expanded .occ-slot--busy {
  background: linear-gradient(180deg, #e8f3fc 0%, #dfeef9 100%);
  border-color: #c5ddf0;
}

.occ-root--expanded .occ-slot--clickable {
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.occ-root--expanded .occ-slot--clickable:hover {
  border-color: #8ebfdf;
  box-shadow: 0 2px 10px rgba(23, 109, 176, 0.12);
}

.occ-root--expanded .occ-slot--clickable:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, #0284c7 22%, transparent);
}

.occ-root--expanded .occ-slot--free {
  background: #f6f8f7;
  border-color: #e4ebe7;
}

.occ-root--expanded .occ-slot__badge {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: 750;
}

.occ-root--expanded .occ-slot--busy .occ-slot__badge {
  color: #176db0;
  background: #fff;
  box-shadow: inset 0 0 0 1px #9fc5e5;
}

.occ-root--expanded .occ-slot--free .occ-slot__badge {
  color: #6a7a70;
  background: #fff;
  box-shadow: inset 0 0 0 1px #d0d8d3;
}

.occ-root--expanded .occ-slot__main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.occ-root--expanded .occ-slot__name {
  font-size: 0.82rem;
  font-weight: 650;
  color: #243029;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.occ-root--expanded .occ-slot__code {
  font-size: 0.76rem;
  color: var(--lb-muted, #6a7a70);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.occ-root--expanded .occ-slot__free {
  font-size: 0.82rem;
  color: var(--lb-muted, #6a7a70);
}

.occ-root--expanded .occ-slot .lb-status {
  font-size: 0.82rem;
}
</style>
