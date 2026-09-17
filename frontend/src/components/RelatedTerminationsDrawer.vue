<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import type { ContractRecord } from '@/types/contract'
import type { LeaseTerminationRecord } from '@/types/lease-termination'
import { fetchLeaseTerminations } from '@/api/lease-terminations'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import TablePagination from '@/components/TablePagination.vue'
import { useTableColWidth } from '@/composables/useTableColWidth'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    contract?: ContractRecord | null
    customerId?: string
    roomId?: string
    titleContext?: string
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    contract: null,
    customerId: undefined,
    roomId: undefined,
    titleContext: undefined,
    desktopDirection: 'ltr',
    size: undefined,
  },
)

const emit = defineEmits<{ openTermination: [termination: LeaseTerminationRecord] }>()

const { t } = useI18n()
const isMobile = useIsMobile()
const { colW, codeColW, textColW, tableLayoutKey } = useTableColWidth()
const terminations = ref<LeaseTerminationRecord[]>([])
const loading = ref(false)
const keyword = ref('')

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))

const title = computed(() => {
  const ctx = props.titleContext?.trim()
  if (ctx) return t('common.relatedTerminationsWithContext', { context: ctx })
  const code = props.contract?.contractCode?.trim()
  return code
    ? t('contract.relatedTerminationsWithContract', { contract: code })
    : t('contract.relatedTerminations')
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return terminations.value
  return terminations.value.filter((row) =>
    [row.terminationCode, row.reason, row.terminationDate, row.relatedDepositRefund, row.roomCode]
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
    terminations.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await fetchLeaseTerminations({
      ...(customerId ? { customerId } : {}),
      ...(roomId ? { roomId } : {}),
      ...(!customerId && !roomId && contractId ? { contractId } : {}),
    })
    terminations.value = data.items
  } catch {
    terminations.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.customerId, props.roomId, props.contract?.id] as const,
  ([open, customerId, roomId, contractId]) => {
    if (open && (customerId || roomId || contractId)) {
      keyword.value = ''
      resetPage()
      void load()
    }
    if (!open) {
      terminations.value = []
      keyword.value = ''
    }
  },
)

function onRowClick(row: LeaseTerminationRecord, column?: { type?: string }, event?: Event) {
  if (column?.type === 'selection') return
  const el = event?.target as HTMLElement | null
  if (el?.closest('.el-checkbox, .el-table-column--selection, button, a')) return
  emit('openTermination', row)
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
          :placeholder="t('leaseTermination.searchPlaceholder')"
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
          empty-text="—"
          style="width: 100%"
          @row-click="onRowClick"
        >
          <el-table-column type="selection" width="48" align="center" header-align="center" />
          <el-table-column type="index" :index="rowIndex" label="#" width="48" align="center" header-align="center" />
          <el-table-column
            prop="terminationCode"
            :label="t('leaseTermination.fields.terminationCode')"
            :min-width="
              codeColW(t('leaseTermination.fields.terminationCode'), {
                samples: paged.map((r) => r.terminationCode),
              })
            "
            class-name="col-code"
            label-class-name="col-code"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('leaseTermination.fields.terminationDate')"
            :min-width="colW(t('leaseTermination.fields.terminationDate'), { contentMin: 110 })"
          >
            <template #default="{ row }">{{ row.terminationDate || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('leaseTermination.fields.reason')"
            :min-width="textColW(t('leaseTermination.fields.reason'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.reason || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('leaseTermination.fields.doorKeyReturnedQty')"
            :min-width="colW(t('leaseTermination.fields.doorKeyReturnedQty'), { contentMin: 72 })"
            align="right"
          >
            <template #default="{ row }">{{ row.doorKeyReturnedQty ?? '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('leaseTermination.fields.smartCardReturnedQty')"
            :min-width="colW(t('leaseTermination.fields.smartCardReturnedQty'), { contentMin: 72 })"
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
