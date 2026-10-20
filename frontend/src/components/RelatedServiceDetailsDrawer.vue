<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search } from '@element-plus/icons-vue'
import type { InvoiceServiceDetailListRecord } from '@/types/invoice-service-detail'
import { fetchInvoiceServiceDetails } from '@/api/invoice-service-details'
import { useIsMobile } from '@/composables/useMediaQuery'
import { useClientPagination } from '@/composables/useClientPagination'
import TablePagination from '@/components/TablePagination.vue'
import { formatMoney } from '@/utils/format'
import { useTableColWidth } from '@/composables/useTableColWidth'

const visible = defineModel<boolean>({ default: false })

const props = withDefaults(
  defineProps<{
    invoiceId?: string
    titleContext?: string
    desktopDirection?: 'ltr' | 'rtl'
    size?: string
  }>(),
  {
    invoiceId: undefined,
    titleContext: undefined,
    desktopDirection: 'ltr',
    size: undefined,
  },
)

const emit = defineEmits<{
  openServiceDetail: [detail: InvoiceServiceDetailListRecord]
}>()

const { t } = useI18n()
const isMobile = useIsMobile()
const { colW, textColW, tableLayoutKey } = useTableColWidth()
const details = ref<InvoiceServiceDetailListRecord[]>([])
const loading = ref(false)
const keyword = ref('')

const direction = computed(() => (isMobile.value ? 'btt' : props.desktopDirection))
const drawerSize = computed(() => props.size || (isMobile.value ? '100%' : '860px'))

const title = computed(() => {
  const ctx = props.titleContext?.trim()
  if (ctx) return t('common.relatedServiceDetailsWithContext', { context: ctx })
  return t('common.relatedServiceDetails')
})

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase()
  if (!q) return details.value
  return details.value.filter((row) =>
    [row.description, row.remark, row.invoiceCode, String(row.quantity), String(row.unitAmount)]
      .join(' ')
      .toLowerCase()
      .includes(q),
  )
})

const { page, pageSize, pageSizes, paged, total, rowIndex, resetPage } =
  useClientPagination(filtered)

watch(keyword, () => resetPage())

async function loadDetails() {
  const invoiceId = props.invoiceId?.trim()
  if (!invoiceId) {
    details.value = []
    return
  }
  loading.value = true
  try {
    const { data } = await fetchInvoiceServiceDetails({ invoiceId })
    details.value = data.items
  } catch {
    details.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => [visible.value, props.invoiceId] as const,
  ([open, invoiceId]) => {
    if (open && invoiceId) {
      keyword.value = ''
      resetPage()
      void loadDetails()
    }
    if (!open) {
      details.value = []
      keyword.value = ''
    }
  },
)

function onRowClick(row: InvoiceServiceDetailListRecord, column?: { type?: string }, event?: Event) {
  if (column?.type === 'selection') return
  const el = event?.target as HTMLElement | null
  if (el?.closest('.el-checkbox, .el-table-column--selection, button, a')) return
  emit('openServiceDetail', row)
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
          :placeholder="t('invoiceServiceDetail.searchPlaceholder')"
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
          />
          <el-table-column
            :label="t('invoiceServiceDetail.fields.description')"
            :min-width="textColW(t('invoiceServiceDetail.fields.description'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.description || '—' }}</template>
          </el-table-column>
          <el-table-column
            :label="t('invoiceServiceDetail.fields.quantity')"
            :min-width="colW(t('invoiceServiceDetail.fields.quantity'), { contentMin: 72 })"
            align="right"
          >
            <template #default="{ row }">
              {{ row.quantity == null ? '—' : row.quantity }}
            </template>
          </el-table-column>
          <el-table-column
            :label="t('invoiceServiceDetail.fields.unitAmount')"
            :min-width="colW(t('invoiceServiceDetail.fields.unitAmount'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">
              {{ row.unitAmount == null ? '—' : formatMoney(row.unitAmount) }}
            </template>
          </el-table-column>
          <el-table-column
            :label="t('invoiceServiceDetail.fields.subtotal')"
            :min-width="colW(t('invoiceServiceDetail.fields.subtotal'), { contentMin: 100 })"
            align="right"
          >
            <template #default="{ row }">
              {{ row.subtotal == null ? '—' : formatMoney(row.subtotal) }}
            </template>
          </el-table-column>
          <el-table-column
            :label="t('invoiceServiceDetail.fields.remark')"
            :min-width="textColW(t('invoiceServiceDetail.fields.remark'), { kind: 'long' })"
            show-overflow-tooltip
          >
            <template #default="{ row }">{{ row.remark || '—' }}</template>
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
