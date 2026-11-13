<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import type { ContractRecord } from '@/types/contract'
import type { ContractSettlementRecord } from '@/types/contract-settlement'
import { fetchContractSettlements } from '@/api/contract-settlements'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import TablePagination from '@/components/TablePagination.vue'
import { useTableColWidth } from '@/composables/useTableColWidth'
import StatusBadge from '@/components/StatusBadge.vue'
import { contractSettlementTypeTone } from '@/constants/statusBadges'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    contract?: ContractRecord | null
    customerId?: string
    roomId?: string
    /** 默认仅 VACATE（退租结算） */
    type?: string
    titleContext?: string
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  
    /** 叠在其它弹窗／抽屉之上时传入更高 z-index */
    zIndex?: number
  }>(),
  {
    contract: null,
    customerId: undefined,
    roomId: undefined,
    type: 'VACATE',
    titleContext: undefined,
    desktopDirection: 'ltr',
    size: undefined,
  
    zIndex: undefined,
  },
)

const emit = defineEmits<{
  openSettlement: [settlement: ContractSettlementRecord]
  openContract: [contractId: string]
  openRoom: [roomId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const { colW, codeColW, textColW, tableLayoutKey } = useTableColWidth()
const settlements = ref<ContractSettlementRecord[]>([])
const loading = ref(false)
const keyword = ref('')

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))

const title = computed(() => {
  const ctx = props.titleContext?.trim()
  if (ctx) return t('common.relatedVacateSettlementsWithContext', { context: ctx })
  const code = props.contract?.contractCode?.trim()
  return code
    ? t('contract.relatedVacateSettlementsWithContract', { contract: code })
    : t('contract.relatedVacateSettlements')
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return settlements.value
  return settlements.value.filter((row) =>
    [
      row.settlementCode,
      row.legacyTerminationCode,
      row.reason,
      row.terminationDate,
      row.roomCode,
      row.siteCondition,
    ]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } = useClientPagination(filtered)
watch(keyword, () => resetPage())

async function load() {
  const customerId = props.customerId?.trim()
  const roomId = props.roomId?.trim()
  const contractId = props.contract?.id
  if (!customerId && !roomId && !contractId) {
    settlements.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await fetchContractSettlements({
      type: props.type || 'VACATE',
      ...(customerId ? { customerId } : {}),
      ...(!customerId && !roomId && contractId ? { contractId } : {}),
      ...(customerId && contractId ? { contractId } : {}),
    })
    let items = data.items ?? []
    if (roomId) {
      items = items.filter((r) => r.roomId === roomId)
    }
    settlements.value = items
  } catch {
    settlements.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.customerId, props.roomId, props.contract?.id, props.type] as const,
  ([open, customerId, roomId, contractId]) => {
    if (open && (customerId || roomId || contractId)) {
      keyword.value = ''
      resetPage()
      void load()
    }
    if (!open) {
      settlements.value = []
      keyword.value = ''
    }
  },
)

function onRowClick(row: ContractSettlementRecord, column?: { type?: string }, event?: Event) {
  if (column?.type === 'selection') return
  const el = event?.target as HTMLElement | null
  if (el?.closest('.el-checkbox, .el-table-column--selection, button, a')) return
  emit('openSettlement', row)
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :title="title"
    :direction="direction"
    class="responsive-drawer related-list-drawer"
  
    append-to-body
  
    :z-index="zIndex"
  >
    <div v-loading="loading" class="related-list">
      <div class="related-list__toolbar">
        <el-input
          v-model="keyword"
          clearable
          class="related-list__search"
          :prefix-icon="Search"
          :placeholder="t('contractSettlement.searchVacatePlaceholder')"
        />
      </div>
      <div class="related-list__body">
        <p v-if="!loading && !filtered.length" class="related-list__empty">—</p>
        <el-table
          v-else
          :key="tableLayoutKey"
          class="related-list__table related-list__table--clickable"
          :data="paged"
          height="100%"
          stripe
          border
          scrollbar-always-on
          style="width: 100%"
          @row-click="onRowClick"
        >
          <el-table-column
            type="index"
            :index="rowIndex"
            label="#"
            width="48"
            align="center"
            header-align="center"
            fixed="left"
          />
          <el-table-column
            prop="settlementCode"
            :label="t('contractSettlement.fields.settlementCode')"
            :min-width="
              codeColW(t('contractSettlement.fields.settlementCode'), {
                samples: paged.map((r) => r.settlementCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            show-overflow-tooltip
            fixed="left"
          />
          <el-table-column
            :label="t('contractSettlement.fields.type')"
            :min-width="colW(t('contractSettlement.fields.type'), { contentMin: 72 })"
          >
            <template #default="{ row }">
              <StatusBadge
                :tone="contractSettlementTypeTone(row.type)"
                :label="t(`contractSettlement.type.${row.type}`, row.type)"
              />
            </template>
          </el-table-column>
          <el-table-column
            :label="t('contractSettlement.fields.contractCode')"
            :min-width="
              codeColW(t('contractSettlement.fields.contractCode'), {
                samples: paged.map((r) => r.contractCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #default="{ row }">
              <button
                v-if="row.contractId"
                type="button"
                class="fk-link"
                @click.stop="emit('openContract', row.contractId)"
              >
                {{ row.contractCode || '—' }}
              </button>
              <template v-else>{{ row.contractCode || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('contractSettlement.fields.roomCode')"
            :min-width="
              codeColW(t('contractSettlement.fields.roomCode'), {
                samples: paged.map((r) => r.roomCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
          >
            <template #default="{ row }">
              <button
                v-if="row.roomId"
                type="button"
                class="fk-link"
                @click.stop="emit('openRoom', row.roomId)"
              >
                {{ row.roomCode || '—' }}
              </button>
              <template v-else>{{ row.roomCode || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('contractSettlement.fields.terminationDate')"
            :min-width="colW(t('contractSettlement.fields.terminationDate'), { contentMin: 110 })"
          >
            <template #default="{ row }">{{ row.terminationDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('contractSettlement.fields.reason')"
            :min-width="textColW(t('contractSettlement.fields.reason'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.reason || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('contractSettlement.fields.doorKeyReturnedQty')"
            :min-width="colW(t('contractSettlement.fields.doorKeyReturnedQty'), { contentMin: 72 })"
            align="right"
          >
            <template #default="{ row }">{{ row.doorKeyReturnedQty ?? '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('contractSettlement.fields.smartCardReturnedQty')"
            :min-width="colW(t('contractSettlement.fields.smartCardReturnedQty'), { contentMin: 72 })"
            align="right"
          >
            <template #default="{ row }">{{ row.smartCardReturnedQty ?? '—' }}</template>
          </el-table-column>
        </el-table>
      </div>
      <div v-if="total" class="related-list__pager">
        <TablePagination v-model:page="page" v-model:page-size="pageSize" :total="total" :page-sizes="pageSizes" />
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.related-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  height: 100%;
}
.related-list__toolbar {
  flex: 0 0 auto;
}
.related-list__search {
  max-width: 360px;
}
.related-list__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.related-list__empty {
  margin: 12px 0 0;
  color: var(--lb-muted, #6a7a70);
}
.related-list__table {
  flex: 1 1 auto;
  min-height: 0;
  height: 100% !important;
}
.related-list__table :deep(.el-table__inner-wrapper) {
  height: 100%;
}
.related-list__table--clickable :deep(.el-table__body tr) {
  cursor: pointer;
}
.related-list__pager {
  flex: 0 0 auto;
  margin: 0 -4px -4px;
  border: 1px solid #e6ebe8;
  border-radius: 10px;
  overflow: hidden;
}
.related-list__pager :deep(.lb-pager) {
  border-top: none;
}
</style>
