/**
 * One-shot: replace f.xxx?.length ? [...f.xxx] : undefined with packFilterValues(f.xxx)
 * and add import { packFilterValues } from '@/utils/columnFilter' in ListView buildQuery files.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('frontend/src/views')
const files = [
  'room-mgmt/BuildingListView.vue',
  'room-mgmt/RoomListView.vue',
  'customer-mgmt/CustomerListView.vue',
  'customer-mgmt/OccupantListView.vue',
  'customer-mgmt/CustomerRequirementListView.vue',
  'contract-mgmt/ContractListView.vue',
  'contract-mgmt/LeaseTerminationListView.vue',
  'contract-mgmt/ContractOtherFeeListView.vue',
  'finance-mgmt/InvoiceListView.vue',
  'finance-mgmt/ReceivableListView.vue',
  'finance-mgmt/ReceiptListView.vue',
  'finance-mgmt/DepositRefundListView.vue',
  'finance-mgmt/DepositDeductionListView.vue',
  'finance-mgmt/InvoiceServiceDetailListView.vue',
]

const reSimple =
  /(\w+):\s*f\.(\w+)\?\.length\s*\?\s*\[\.\.\.f\.\2\]\s*:\s*undefined/g

for (const rel of files) {
  const fp = path.join(root, rel)
  let src = fs.readFileSync(fp, 'utf8')
  const before = src

  // Simple pattern
  src = src.replace(reSimple, '$1: packFilterValues(f.$2)')

  // buildingNames / buildingIds gated by buildingScope.selectedId
  src = src.replace(
    /buildingNames:\s*\n?\s*buildingScope\.selectedId\s*\|\|\s*!f\.buildingName\?\.length\s*\?\s*undefined\s*:\s*\[\.\.\.f\.buildingName\]/g,
    'buildingNames: buildingScope.selectedId ? undefined : packFilterValues(f.buildingName)',
  )
  src = src.replace(
    /buildingIds:\s*\n?\s*buildingScope\.selectedId\s*\|\|\s*!f\.buildingId\?\.length\s*\?\s*undefined\s*:\s*\[\.\.\.f\.buildingId\]/g,
    'buildingIds: buildingScope.selectedId ? undefined : packFilterValues(f.buildingId)',
  )

  // Invoice buildingNames multiline variant
  src = src.replace(
    /buildingNames:\s*\n?\s*buildingScope\.selectedId\s*\|\|\s*!f\.buildingName\?\.length\s*\n?\s*\?\s*undefined\s*\n?\s*:\s*\[\.\.\.f\.buildingName\]/g,
    'buildingNames: buildingScope.selectedId ? undefined : packFilterValues(f.buildingName)',
  )

  // Room leaseCapabilities
  src = src.replace(
    /leaseCapabilities:\s*!leaseCapabilityFilter\.value\s*&&\s*f\.leaseCapability\?\.length\s*\n?\s*\?\s*\[\.\.\.f\.leaseCapability\]\s*\n?\s*:\s*undefined/g,
    'leaseCapabilities: !leaseCapabilityFilter.value\n        ? packFilterValues(f.leaseCapability)\n        : undefined',
  )

  // Contract statuses / occupancyKeys / Receipt kinds
  src = src.replace(
    /statuses:\s*soon\s*\?\s*undefined\s*:\s*f\.status\?\.length\s*\?\s*\[\.\.\.f\.status\]\s*:\s*undefined/g,
    'statuses: soon ? undefined : packFilterValues(f.status)',
  )
  src = src.replace(
    /occupancyKeys:\s*chipKey\s*\n?\s*\?\s*\[chipKey\]\s*\n?\s*:\s*f\.leaseType\?\.length\s*\n?\s*\?\s*\[\.\.\.f\.leaseType\]\s*\n?\s*:\s*undefined/g,
    'occupancyKeys: chipKey ? [chipKey] : packFilterValues(f.leaseType)',
  )
  src = src.replace(
    /kinds:\s*chipKey\s*\?\s*\[chipKey\]\s*:\s*f\.kind\?\.length\s*\?\s*\[\.\.\.f\.kind\]\s*:\s*undefined/g,
    'kinds: chipKey ? [chipKey] : packFilterValues(f.kind)',
  )

  // LeaseTermination smartCard multiline
  src = src.replace(
    /smartCardReturnedQtys:\s*f\.smartCardReturnedQty\?\.length\s*\n?\s*\?\s*\[\.\.\.f\.smartCardReturnedQty\]\s*\n?\s*:\s*undefined/g,
    'smartCardReturnedQtys: packFilterValues(f.smartCardReturnedQty)',
  )

  // Invoice / deposit-refund single-value status → packed CSV-ready array join via statuses-like
  // Keep field name; send joined pack so blank sentinel survives
  src = src.replace(
    /status:\s*f\.status\?\.\[0\]/g,
    'status: packFilterValues(f.status)?.join(",")',
  )
  src = src.replace(
    /billingKind:\s*f\.billingKind\?\.\[0\]/g,
    'billingKind: packFilterValues(f.billingKind)?.join(",")',
  )

  if (!src.includes("from '@/utils/columnFilter'") && src.includes('packFilterValues')) {
    // insert import after last @/utils import or before vue import
    const utilImport = "import { packFilterValues } from '@/utils/columnFilter'\n"
    const m = src.match(/import .+ from '@\/utils\/[^\n]+\n(?:import .+ from '@\/utils\/[^\n]+\n)*/)
    if (m) {
      const idx = m.index + m[0].length
      src = src.slice(0, idx) + utilImport + src.slice(idx)
    } else {
      src = src.replace(
        /(import \{[^}]+\} from 'vue'\n)/,
        `${utilImport}$1`,
      )
    }
  }

  if (src !== before) {
    fs.writeFileSync(fp, src, 'utf8')
    console.log('updated', rel)
  } else {
    console.log('no change', rel)
  }
}
