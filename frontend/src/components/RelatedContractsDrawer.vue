<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import type { ContractRecord } from '@/types/contract'
import { CONTRACT_STATUSES } from '@/types/contract'
import { fetchContracts } from '@/api/contracts'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import TablePagination from '@/components/TablePagination.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { contractStatusTone } from '@/constants/statusBadges'
import { useTableColWidth } from '@/composables/useTableColWidth'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    customerId?: string
    roomId?: string
    requirementId?: string
    titleContext?: string
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    customerId: undefined,
    roomId: undefined,
    requirementId: undefined,
    titleContext: undefined,
    desktopDirection: 'ltr',
    size: undefined,
  },
)

const emit = defineEmits<{
  openContract: [contract: ContractRecord]
  openCustomer: [customerId: string]
  openRoom: [roomId: string]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const { colW, codeColW, textColW, statusColW, tableLayoutKey } = useTableColWidth()
const contracts = ref<ContractRecord[]>([])
const loading = ref(false)
const keyword = ref('')

const statusLabels = computed(() => CONTRACT_STATUSES.map((s) => t(`contract.status.${s}`, s)))
const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))

const title = computed(() => {
  const ctx = props.titleContext?.trim()
  if (ctx) return t('common.relatedContractsWithContext', { context: ctx })
  return t('common.relatedContracts')
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return contracts.value
  return contracts.value.filter((row) =>
    [row.contractCode, row.customerName, row.roomCode, row.roomName, row.status, row.startDate, row.endDate]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)

watch(keyword, () => resetPage())

const filterKey = computed(
  () => `${props.customerId || ''}|${props.roomId || ''}|${props.requirementId || ''}`,
)

async function loadContracts() {
  const customerId = props.customerId?.trim()
  const roomId = props.roomId?.trim()
  const requirementId = props.requirementId?.trim()
  if (!customerId && !roomId && !requirementId) {
    contracts.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await fetchContracts({
      ...(customerId ? { customerId } : {}),
      ...(roomId ? { roomId } : {}),
      ...(requirementId ? { requirementId } : {}),
    })
    contracts.value = data.items
  } catch {
    contracts.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, filterKey.value] as const,
  ([open]) => {
    if (open && filterKey.value.replace(/\|/g, '')) {
      keyword.value = ''
      resetPage()
      void loadContracts()
    }
    if (!open) {
      contracts.value = []
      keyword.value = ''
    }
  },
)

function onRowClick(row: ContractRecord, column?: { type?: string }, event?: Event) {
  if (column?.type === 'selection') return
  const el = event?.target as HTMLElement | null
  if (el?.closest('.el-checkbox, .el-table-column--selection, button, a')) return
  emit('openContract', row)
}

function statusLabel(status: string) {
  return t(`contract.status.${status}`, status)
}
</script>

<template>
  <el-drawer
    v-model="visible"
    :size="drawerSize"
    :title="title"
    :direction="direction"
    class="responsive-drawer related-list-drawer"
  >
    <div v-loading="loading" class="related-list">
      <div class="related-list__toolbar">
        <el-input
          v-model="keyword"
          clearable
          class="related-list__search"
          :prefix-icon="Search"
          :placeholder="t('contract.searchPlaceholder')"
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
            prop="contractCode"
            :label="t('contract.fields.contractCode')"
            :min-width="
              codeColW(t('contract.fields.contractCode'), {
                samples: paged.map((r) => r.contractCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            show-overflow-tooltip
            fixed="left"
          />
          <el-table-column
            prop="customerName"
            :label="t('contract.fields.customerName')"
            :min-width="textColW(t('contract.fields.customerName'), { kind: 'name' })"
          >
            <template #default="{ row }">
              <button
                v-if="row.customerId"
                type="button"
                class="fk-link"
                @click.stop="emit('openCustomer', row.customerId)"
              >
                {{ row.customerName || '—' }}
              </button>
              <template v-else>{{ row.customerName || '—' }}</template>
            </template>
          </el-table-column>
          <el-table-column
            prop="roomCode"
            :label="t('contract.fields.roomCode')"
            :min-width="
              codeColW(t('contract.fields.roomCode'), {
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
            :label="t('contract.fields.status')"
            :min-width="statusColW(t('contract.fields.status'), statusLabels, { interactive: false })"
          >
            <template #default="{ row }">
              <StatusBadge :tone="contractStatusTone(row.status)" :label="statusLabel(row.status)" />
            </template>
          </el-table-column>
          <el-table-column
            :label="t('contract.fields.startDate')"
            :min-width="colW(t('contract.fields.startDate'), { contentMin: 110 })"
          >
            <template #default="{ row }">{{ row.startDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('contract.fields.endDate')"
            :min-width="colW(t('contract.fields.endDate'), { contentMin: 110 })"
          >
            <template #default="{ row }">{{ row.endDate || '—' }}</template>
          </el-table-column>
        </el-table>
      </div>

      <div v-if="total" class="related-list__pager">
        <TablePagination
          v-model:page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="pageSizes"
        />
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
