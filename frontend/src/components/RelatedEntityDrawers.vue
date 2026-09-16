<script setup lang="ts">
/**
 * 合约相关列表共用的关联实体左侧抽屉链：
 * 客户 / 房间 / 楼宇 / 需求 / 入住人，以及客户下入住人列表、需求列表、楼宇下房间列表。
 */
import { ref } from 'vue'
import { fetchBuilding } from '@/api/buildings'
import { fetchCustomer } from '@/api/customers'
import { fetchCustomerRequirement } from '@/api/customer-requirements'
import { fetchRoom } from '@/api/rooms'
import BuildingDetailDrawer from '@/components/BuildingDetailDrawer.vue'
import CustomerDetailDrawer from '@/components/CustomerDetailDrawer.vue'
import CustomerRequirementDetailDrawer from '@/components/CustomerRequirementDetailDrawer.vue'
import OccupantDetailDrawer from '@/components/OccupantDetailDrawer.vue'
import RelatedCustomerRequirementsDrawer from '@/components/RelatedCustomerRequirementsDrawer.vue'
import RelatedOccupantsDrawer from '@/components/RelatedOccupantsDrawer.vue'
import RelatedRoomsDrawer from '@/components/RelatedRoomsDrawer.vue'
import RoomDetailDrawer from '@/components/RoomDetailDrawer.vue'
import type { BuildingRecord } from '@/types/building'
import type { CustomerRecord, OccupantRecord } from '@/types/customer'
import type { CustomerRequirementRecord } from '@/types/customer-requirement'
import type { RoomRecord } from '@/types/room'

const relatedCustomer = ref<CustomerRecord | null>(null)
const customerDrawerVisible = ref(false)
const customerDrawerDirection = ref<'ltr' | 'rtl'>('ltr')

const relatedRoom = ref<RoomRecord | null>(null)
const roomDrawerVisible = ref(false)
const roomDrawerDirection = ref<'ltr' | 'rtl'>('ltr')

const relatedBuilding = ref<BuildingRecord | null>(null)
const buildingDrawerVisible = ref(false)

const relatedRoomsBuilding = ref<BuildingRecord | null>(null)
const relatedRoomsDrawer = ref(false)

const relatedOccupantsListDrawer = ref(false)
const relatedRequirementsListDrawer = ref(false)

const relatedOccupant = ref<OccupantRecord | null>(null)
const relatedOccupantDrawer = ref(false)
const occupantDrawerDirection = ref<'ltr' | 'rtl'>('ltr')

const relatedRequirement = ref<CustomerRequirementRecord | null>(null)
const relatedRequirementDrawer = ref(false)

async function openCustomerSide(customerId?: string | null, direction: 'ltr' | 'rtl' = 'ltr') {
  if (!customerId) return
  try {
    const { data } = await fetchCustomer(customerId)
    relatedCustomer.value = data
    customerDrawerDirection.value = direction
    customerDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openRoomSide(roomId?: string | null, direction: 'ltr' | 'rtl' = 'ltr') {
  if (!roomId) return
  try {
    const { data } = await fetchRoom(roomId)
    relatedRoom.value = data
    roomDrawerDirection.value = direction
    roomDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openBuildingSide(buildingId?: string | null) {
  if (!buildingId) return
  try {
    const { data } = await fetchBuilding(buildingId)
    relatedBuilding.value = data
    buildingDrawerVisible.value = true
  } catch {
    /* interceptor */
  }
}

async function openRequirementSide(requirementId?: string | null) {
  if (!requirementId) return
  try {
    const { data } = await fetchCustomerRequirement(requirementId)
    relatedRequirement.value = data
    relatedRequirementDrawer.value = true
  } catch {
    /* interceptor */
  }
}

function openOccupantsSide(row: CustomerRecord) {
  if (!row.occupantCount) return
  relatedCustomer.value = row
  relatedOccupantsListDrawer.value = true
}

function openRequirementsSide(row: CustomerRecord) {
  if (!row.requirementCount) return
  relatedCustomer.value = row
  relatedRequirementsListDrawer.value = true
}

function onOpenOccupantFromCustomer(occupant: OccupantRecord) {
  relatedOccupant.value = occupant
  occupantDrawerDirection.value = 'ltr'
  relatedOccupantDrawer.value = true
}

function onOpenRequirementFromList(requirement: CustomerRequirementRecord) {
  relatedRequirement.value = requirement
  relatedRequirementDrawer.value = true
}

function openRoomsSide(row: BuildingRecord) {
  if (!row.roomIds?.length) return
  relatedRoomsBuilding.value = row
  relatedRoomsDrawer.value = true
}

function onOpenRoomFromList(room: RoomRecord) {
  relatedRoom.value = room
  roomDrawerDirection.value = 'ltr'
  roomDrawerVisible.value = true
}

async function openCustomerFromOccupant(customerId: string) {
  await openCustomerSide(customerId, 'ltr')
}

defineExpose({
  openCustomerSide,
  openRoomSide,
  openBuildingSide,
  openRequirementSide,
})
</script>

<template>
  <CustomerDetailDrawer
    v-model="customerDrawerVisible"
    :customer="relatedCustomer"
    :desktop-direction="customerDrawerDirection"
    @open-occupants="openOccupantsSide"
    @open-requirements="openRequirementsSide"
    @open-building="openBuildingSide"
  />
  <RelatedOccupantsDrawer
    v-model="relatedOccupantsListDrawer"
    :customer="relatedCustomer"
    desktop-direction="ltr"
    @open-occupant="onOpenOccupantFromCustomer"
  />
  <RelatedCustomerRequirementsDrawer
    v-model="relatedRequirementsListDrawer"
    :customer="relatedCustomer"
    desktop-direction="ltr"
    @open-requirement="onOpenRequirementFromList"
  />
  <CustomerRequirementDetailDrawer
    v-model="relatedRequirementDrawer"
    :requirement="relatedRequirement"
    desktop-direction="ltr"
    @open-customer="(id) => openCustomerSide(id, 'ltr')"
  />
  <OccupantDetailDrawer
    v-model="relatedOccupantDrawer"
    :occupant="relatedOccupant"
    :desktop-direction="occupantDrawerDirection"
    @open-customer="openCustomerFromOccupant"
  />
  <BuildingDetailDrawer
    v-model="buildingDrawerVisible"
    :building="relatedBuilding"
    desktop-direction="ltr"
    @open-rooms="openRoomsSide"
  />
  <RelatedRoomsDrawer
    v-model="relatedRoomsDrawer"
    :building="relatedRoomsBuilding"
    desktop-direction="ltr"
    @open-room="onOpenRoomFromList"
  />
  <RoomDetailDrawer
    v-model="roomDrawerVisible"
    :room="relatedRoom"
    :desktop-direction="roomDrawerDirection"
    @open-building="openBuildingSide"
  />
</template>
