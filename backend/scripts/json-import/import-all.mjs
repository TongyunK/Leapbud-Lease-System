/**
 * 工程师：从 data/ 简道云 JSON 全量导入业务数据。
 * 用户日常仍用 Excel；本脚本只解决旧系统 _id 关联。
 *
 * 前置：已执行 wipe-business-data.mjs（或库为空）
 *
 * 用法（backend 目录）：
 *   node scripts/json-import/import-all.mjs --dry-run
 *   node scripts/json-import/import-all.mjs
 *   node scripts/json-import/import-all.mjs --only=finance
 *   node scripts/json-import/import-all.mjs --only=rooms,customers,contracts,finance
 */
import { PrismaClient } from '@prisma/client'
import {
  loadEntity,
  s,
  num,
  dec,
  decOrNull,
  dateOrNull,
  dataOf,
  codeFromLegacy,
  mapRoomStatus,
  mapRoomConfigType,
  dryRunFlag,
  logPhase,
} from './lib.mjs'

const prisma = new PrismaClient()
const dryRun = dryRunFlag()
const onlyArg = process.argv.find((a) => a.startsWith('--only='))
const ONLY = onlyArg
  ? new Set(
      onlyArg
        .slice('--only='.length)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean),
    )
  : null

function want(phase) {
  return !ONLY || ONLY.has(phase)
}

/** 进程内 legacyId → id（dry-run 也写入，便于校验父子关联） */
const mem = Object.create(null)
/** 合约 legacyId → 房间 id（发票等缺房间字段时回填） */
const contractRoomByLegacy = new Map()
/** 合约 legacyId → 客户 id */
const contractCustomerByLegacy = new Map()

function dryId(legacyId) {
  return `dry:${legacyId}`
}

function remember(model, legacyId, id) {
  if (!legacyId || !id) return
  if (!mem[model]) mem[model] = new Map()
  mem[model].set(legacyId, id)
}

async function legacyMap(model) {
  if (!mem[model]) mem[model] = new Map()
  const map = mem[model]
  if (map.size === 0 || !dryRun) {
    const rows = await prisma[model].findMany({
      where: { legacyId: { not: null } },
      select: { id: true, legacyId: true },
    })
    for (const r of rows) map.set(r.legacyId, r.id)
  }
  return map
}

/** 旧用户 _id → 本系统 user.id（依赖先跑 sync-users-legacy.mjs） */
function userIdOf(users, row, fields, fieldName) {
  const legacy = s(dataOf(row, fields, fieldName))
  if (!legacy) return null
  return users.get(legacy) || null
}

async function importBuildings() {
  const { rows, fields, file } = loadEntity('1.', '大廈_entity')
  let created = 0
  let skipped = 0
  for (const row of rows) {
    const legacyId = s(row._id)
    if (!legacyId) continue
    const name = s(dataOf(row, fields, '大廈名稱')) || codeFromLegacy('BLD', legacyId)
    const exists = await prisma.building.findUnique({ where: { legacyId } })
    if (exists) {
      remember('building', legacyId, exists.id)
      skipped += 1
      continue
    }
    if (!dryRun) {
      const createdRow = await prisma.building.create({
        data: {
          legacyId,
          name,
          address: s(dataOf(row, fields, '地址')),
          addressEn: s(dataOf(row, fields, '地址（英文）')),
          manager: s(dataOf(row, fields, '負責人')),
          managerPhone: s(dataOf(row, fields, '負責人電話')),
          email: s(dataOf(row, fields, '大廈郵箱')),
          workingHours: s(dataOf(row, fields, '工作時間')),
          fpsId: s(dataOf(row, fields, 'FPS_ID')) || null,
          bankAccountHolder: s(dataOf(row, fields, '銀行戶主名稱')) || null,
          bankAccount: s(dataOf(row, fields, '大廈銀行賬戶')) || null,
          chequePaymentBy: s(dataOf(row, fields, 'Cheque Payment By Post')) || null,
          paymentAdvice: s(dataOf(row, fields, 'Payment Advice')) || null,
          apiTemplateSuffix: s(dataOf(row, fields, 'API模板名稱后缀')) || null,
          useWbaNumber: s(dataOf(row, fields, '使用WBA_NUMBER')) || null,
          active: true,
        },
      })
      remember('building', legacyId, createdRow.id)
    } else {
      remember('building', legacyId, dryId(legacyId))
    }
    created += 1
  }
  logPhase('buildings', { file, created, skipped })
}

async function importRoomConfigs() {
  const { rows, fields, file } = loadEntity('1.', '房間配置')
  let created = 0
  let skipped = 0
  let sort = 0
  for (const row of rows) {
    const legacyId = s(row._id)
    if (!legacyId) continue
    const exists = await prisma.roomConfigOption.findUnique({ where: { legacyId } })
    if (exists) {
      skipped += 1
      continue
    }
    const type = mapRoomConfigType(dataOf(row, fields, '配置類型'))
    const label = s(dataOf(row, fields, '配置描述')) || codeFromLegacy('CFG', legacyId)
    if (!dryRun) {
      const createdRow = await prisma.roomConfigOption.create({
        data: {
          legacyId,
          type,
          label,
          brand: s(dataOf(row, fields, '品牌')),
          model: s(dataOf(row, fields, '型號')),
          sortOrder: sort++,
          active: true,
        },
      })
      remember('roomConfigOption', legacyId, createdRow.id)
    } else {
      remember('roomConfigOption', legacyId, dryId(legacyId))
    }
    created += 1
  }
  logPhase('roomConfigs', { file, created, skipped })
}

async function importRooms() {
  const { rows, fields, file } = loadEntity('1.', '房間_entity')
  const buildings = await legacyMap('building')
  let created = 0
  let skipped = 0
  let unlinked = 0
  for (const row of rows) {
    const legacyId = s(row._id)
    if (!legacyId) continue
    const exists = await prisma.room.findUnique({ where: { legacyId } })
    if (exists) {
      remember('room', legacyId, exists.id)
      skipped += 1
      continue
    }
    const buildingLegacy = s(dataOf(row, fields, '所屬大廈'))
    const buildingId = buildings.get(buildingLegacy)
    if (!buildingId) {
      unlinked += 1
      continue
    }
    let roomCode = s(dataOf(row, fields, '房間編號')) || s(dataOf(row, fields, '編號'))
    if (!roomCode) roomCode = codeFromLegacy('RM', legacyId)
    // 编号冲突时加后缀
    const codeTaken = await prisma.room.findUnique({ where: { roomCode } })
    if (codeTaken) roomCode = codeFromLegacy('RM', legacyId)

    if (!dryRun) {
      const createdRow = await prisma.room.create({
        data: {
          legacyId,
          roomCode,
          name: s(dataOf(row, fields, '房間名稱')) || roomCode,
          roomType: s(dataOf(row, fields, '房間類型')),
          buildingId,
          status: mapRoomStatus(dataOf(row, fields, '狀態')),
          monthlyRent: dec(dataOf(row, fields, '月租')),
          dailyRent: dec(dataOf(row, fields, '日租')),
          hourlyRent: dec(dataOf(row, fields, '時租')),
          sizeSqft: dec(dataOf(row, fields, '房間呎寸')),
          description: s(dataOf(row, fields, '房間描述')) || null,
          remark: s(dataOf(row, fields, '備注')) || null,
        },
      })
      remember('room', legacyId, createdRow.id)
    } else {
      remember('room', legacyId, dryId(legacyId))
    }
    created += 1
  }
  logPhase('rooms', { file, created, skipped, unlinked })
}

async function importCustomers() {
  const { rows, fields, file } = loadEntity('2.', '客戶_entity')
  const users = await legacyMap('user')
  let created = 0
  let skipped = 0
  let managersLinked = 0
  for (const row of rows) {
    const legacyId = s(row._id)
    if (!legacyId) continue
    const exists = await prisma.customer.findUnique({ where: { legacyId } })
    if (exists) {
      remember('customer', legacyId, exists.id)
      skipped += 1
      continue
    }
    let customerCode = s(dataOf(row, fields, '客戶編號'))
    if (!customerCode) customerCode = codeFromLegacy('CSM', legacyId)
    const taken = await prisma.customer.findUnique({ where: { customerCode } })
    if (taken) customerCode = codeFromLegacy('CSM', legacyId)

    const accountManagerId = userIdOf(users, row, fields, '客戶經理')
    const createdById = userIdOf(users, row, fields, '創建人')
    if (accountManagerId) managersLinked += 1

    if (!dryRun) {
      const createdRow = await prisma.customer.create({
        data: {
          legacyId,
          customerCode,
          name: s(dataOf(row, fields, '客戶名稱')) || customerCode,
          status: s(dataOf(row, fields, '狀態')) || '',
          accountManagerId,
          companyNameZh: s(dataOf(row, fields, '公司名稱（中文）')),
          companyNameEn: s(dataOf(row, fields, '公司名稱（英文）')),
          businessRegNo: s(dataOf(row, fields, '商業登記號碼')),
          businessNature: s(dataOf(row, fields, '業務性質')),
          source: s(dataOf(row, fields, '客戶來源')),
          remark: s(dataOf(row, fields, '備注')),
          createdById,
        },
      })
      remember('customer', legacyId, createdRow.id)
    } else {
      remember('customer', legacyId, dryId(legacyId))
    }
    created += 1
  }
  logPhase('customers', { file, created, skipped, managersLinked, usersMapped: users.size })
}

async function importOccupants() {
  const { rows, fields, file } = loadEntity('2.', '使用者_entity')
  const customers = await legacyMap('customer')
  let created = 0
  let skipped = 0
  for (const row of rows) {
    const legacyId = s(row._id)
    if (!legacyId) continue
    const exists = await prisma.occupant.findUnique({ where: { legacyId } })
    if (exists) {
      skipped += 1
      continue
    }
    const customerId = customers.get(s(dataOf(row, fields, '關聯客戶'))) || null
    if (!dryRun) {
      const createdRow = await prisma.occupant.create({
        data: {
          legacyId,
          name: s(dataOf(row, fields, '姓名')) || codeFromLegacy('OCC', legacyId),
          customerId,
          whatsapp: String(dataOf(row, fields, 'Whatsapp號碼（需加上區號）') ?? ''),
          mobilePhone: s(dataOf(row, fields, '手提電話')),
          contactPhone: s(dataOf(row, fields, '聯絡電話')),
          email: s(dataOf(row, fields, '電郵')),
          fax: s(dataOf(row, fields, '傳真')),
          address: s(dataOf(row, fields, '通訊地址')),
          idCardNo: s(dataOf(row, fields, '身份證號碼')),
          remark: s(dataOf(row, fields, '備注')),
        },
      })
      remember('occupant', legacyId, createdRow.id)
    } else {
      remember('occupant', legacyId, dryId(legacyId))
    }
    created += 1
  }

  // 回填客户 primaryOccupant
  if (!dryRun) {
    const custFile = loadEntity('2.', '客戶_entity')
    const occupants = await legacyMap('occupant')
    let linked = 0
    for (const row of custFile.rows) {
      const custLegacy = s(row._id)
      const primaryLegacy = s(dataOf(row, custFile.fields, '主要聯絡人'))
      if (!custLegacy || !primaryLegacy) continue
      const customerId = customers.get(custLegacy)
      const occupantId = occupants.get(primaryLegacy)
      if (!customerId || !occupantId) continue
      await prisma.customer.update({
        where: { id: customerId },
        data: { primaryOccupantId: occupantId },
      })
      linked += 1
    }
    logPhase('occupants', { file, created, skipped, primaryLinked: linked })
  } else {
    logPhase('occupants', { file, created, skipped })
  }
}

async function importRequirements() {
  const { rows, fields, file } = loadEntity('2.', '客戶需求')
  const customers = await legacyMap('customer')
  const users = await legacyMap('user')
  let created = 0
  let skipped = 0
  let unlinked = 0
  let managersLinked = 0
  for (const row of rows) {
    const legacyId = s(row._id)
    if (!legacyId) continue
    const exists = await prisma.customerRequirement.findUnique({ where: { legacyId } })
    if (exists) {
      skipped += 1
      continue
    }
    const customerId = customers.get(s(dataOf(row, fields, '客戶名稱')))
    if (!customerId) {
      unlinked += 1
      continue
    }
    let requirementCode = s(dataOf(row, fields, '需求編號'))
    if (!requirementCode) requirementCode = codeFromLegacy('REQ', legacyId)
    const taken = await prisma.customerRequirement.findUnique({ where: { requirementCode } })
    if (taken) requirementCode = codeFromLegacy('REQ', legacyId)

    const salesManagerId = userIdOf(users, row, fields, '銷售經理')
    const createdById = userIdOf(users, row, fields, '創建人')
    if (salesManagerId) managersLinked += 1

    if (!dryRun) {
      const createdRow = await prisma.customerRequirement.create({
        data: {
          legacyId,
          requirementCode,
          customerId,
          salesManagerId,
          requirementDate: dateOrNull(dataOf(row, fields, '創建日期')),
          status: s(dataOf(row, fields, '狀態')) || '跟進中',
          leaseDuration: s(dataOf(row, fields, '租賃時長')),
          budget: decOrNull(dataOf(row, fields, '預算')),
          content: s(dataOf(row, fields, '需求内容')),
          remark: s(dataOf(row, fields, '備注')),
          createdById,
        },
      })
      remember('customerRequirement', legacyId, createdRow.id)
    } else {
      remember('customerRequirement', legacyId, dryId(legacyId))
    }
    created += 1
  }
  logPhase('requirements', { file, created, skipped, unlinked, managersLinked })
}

async function importContracts() {
  const { rows, fields, file } = loadEntity('3.', '合約_entity')
  const rooms = await legacyMap('room')
  const customers = await legacyMap('customer')
  const requirements = await legacyMap('customerRequirement')
  const users = await legacyMap('user')
  let created = 0
  let skipped = 0
  let unlinked = 0
  let managersLinked = 0
  for (const row of rows) {
    const legacyId = s(row._id)
    if (!legacyId) continue
    const exists = await prisma.contract.findUnique({
      where: { legacyId },
      select: { id: true, roomId: true, customerId: true },
    })
    if (exists) {
      remember('contract', legacyId, exists.id)
      contractRoomByLegacy.set(legacyId, exists.roomId)
      contractCustomerByLegacy.set(legacyId, exists.customerId)
      skipped += 1
      continue
    }
    const roomId = rooms.get(s(dataOf(row, fields, '房間編號')))
    const customerId = customers.get(s(dataOf(row, fields, '客戶名稱')))
    if (!roomId || !customerId) {
      unlinked += 1
      continue
    }
    let contractCode = s(dataOf(row, fields, '合約編號'))
    if (!contractCode) contractCode = codeFromLegacy('CTR', legacyId)
    const taken = await prisma.contract.findUnique({ where: { contractCode } })
    if (taken) contractCode = codeFromLegacy('CTR', legacyId)

    const salesManagerId = userIdOf(users, row, fields, '銷售經理')
    const createdById = userIdOf(users, row, fields, '創建人')
    if (salesManagerId) managersLinked += 1

    if (!dryRun) {
      const createdRow = await prisma.contract.create({
        data: {
          legacyId,
          contractCode,
          roomId,
          customerId,
          salesManagerId,
          requirementId: requirements.get(s(dataOf(row, fields, '需求編號'))) || null,
          startDate: dateOrNull(dataOf(row, fields, '合約開始日期')),
          endDate: dateOrNull(dataOf(row, fields, '合約到期日期')),
          actualEndDate: dateOrNull(dataOf(row, fields, '實際退租日期')),
          leaseType: s(dataOf(row, fields, '租賃方式')),
          status: s(dataOf(row, fields, '狀態')) || '草稿',
          roomDeposit: decOrNull(dataOf(row, fields, '房間按金')),
          monthlyRent: decOrNull(dataOf(row, fields, '租金/月')),
          bookingDeposit: decOrNull(dataOf(row, fields, '訂金')),
          paymentCycle: s(dataOf(row, fields, '繳費周期')),
          electricityRate: decOrNull(dataOf(row, fields, '電費/度')),
          miscDeposit: decOrNull(dataOf(row, fields, '雜項按金')),
          doorKeyQty: Math.round(num(dataOf(row, fields, '房門匙數量 按金$100/支'))),
          mailboxKeyQty: Math.round(num(dataOf(row, fields, '信箱匙數量 按金 $100/張'))),
          roomNameText: s(dataOf(row, fields, '房間名稱text')),
          subleaseMark: s(dataOf(row, fields, '分租符號')),
          remark: s(dataOf(row, fields, '備注')),
          createdById,
        },
      })
      remember('contract', legacyId, createdRow.id)
    } else {
      remember('contract', legacyId, dryId(legacyId))
    }
    contractRoomByLegacy.set(legacyId, roomId)
    contractCustomerByLegacy.set(legacyId, customerId)
    created += 1
  }
  logPhase('contracts', { file, created, skipped, unlinked, managersLinked })
}

async function importContractPeriods() {
  const { rows, fields, file } = loadEntity('3.', '合約期')
  const contracts = await legacyMap('contract')
  let created = 0
  let skipped = 0
  let unlinked = 0
  let sort = 0
  for (const row of rows) {
    const legacyId = s(row._id)
    if (!legacyId) continue
    const exists = await prisma.contractPeriod.findUnique({ where: { legacyId } })
    if (exists) {
      skipped += 1
      continue
    }
    const contractId = contracts.get(s(dataOf(row, fields, '關聯合約')))
    if (!contractId) {
      unlinked += 1
      continue
    }
    const startDate = dateOrNull(dataOf(row, fields, '開始日期'))
    const endDate = dateOrNull(dataOf(row, fields, '結束日期'))
    if (!startDate || !endDate) {
      unlinked += 1
      continue
    }
    if (!dryRun) {
      const createdRow = await prisma.contractPeriod.create({
        data: {
          legacyId,
          contractId,
          dateType: s(dataOf(row, fields, '日期類型')) || '合約期',
          dateUnit: s(dataOf(row, fields, '日期單位')) || '月',
          dateValue: Math.round(num(dataOf(row, fields, '日期數值'))),
          startDate,
          endDate,
          sortOrder: sort++,
        },
      })
      remember('contractPeriod', legacyId, createdRow.id)
    } else {
      remember('contractPeriod', legacyId, dryId(legacyId))
    }
    created += 1
  }
  logPhase('contractPeriods', { file, created, skipped, unlinked })
}

async function importTerminations() {
  const { rows, fields, file } = loadEntity('3.', '退租記錄')
  const contracts = await legacyMap('contract')
  const customers = await legacyMap('customer')
  const rooms = await legacyMap('room')
  let created = 0
  let skipped = 0
  let unlinked = 0
  for (const row of rows) {
    const legacyId = s(row._id)
    if (!legacyId) continue
    const exists = await prisma.leaseTermination.findUnique({ where: { legacyId } })
    if (exists) {
      skipped += 1
      continue
    }
    const contractId = contracts.get(s(dataOf(row, fields, '合約編號')))
    const customerId = customers.get(s(dataOf(row, fields, '客戶名稱')))
    const roomId = rooms.get(s(dataOf(row, fields, '房間編號')))
    if (!contractId || !customerId || !roomId) {
      unlinked += 1
      continue
    }
    let terminationCode = s(dataOf(row, fields, '退租編號'))
    if (!terminationCode) terminationCode = codeFromLegacy('TRM', legacyId)
    const taken = await prisma.leaseTermination.findUnique({ where: { terminationCode } })
    if (taken) terminationCode = codeFromLegacy('TRM', legacyId)

    if (!dryRun) {
      const createdRow = await prisma.leaseTermination.create({
        data: {
          legacyId,
          terminationCode,
          contractId,
          customerId,
          roomId,
          reason: s(dataOf(row, fields, '退租原因')),
          terminationDate: dateOrNull(dataOf(row, fields, '退租日期')),
          siteCondition: s(dataOf(row, fields, '現場情況')),
          remark: s(dataOf(row, fields, '備注')),
          doorKeyReturnedQty: Math.round(num(dataOf(row, fields, '房門匙 - 已回收數量'))),
          smartCardReturnedQty: Math.round(num(dataOf(row, fields, '智能咭 - 已回收數量'))),
        },
      })
      remember('leaseTermination', legacyId, createdRow.id)
    } else {
      remember('leaseTermination', legacyId, dryId(legacyId))
    }
    created += 1
  }
  logPhase('terminations', { file, created, skipped, unlinked })
}

async function importOtherFees() {
  const { rows, fields, file } = loadEntity('3.', '借出產品')
  const contracts = await legacyMap('contract')
  const terminations = await legacyMap('leaseTermination')
  let created = 0
  let skipped = 0
  let unlinked = 0
  let sort = 0
  for (const row of rows) {
    const legacyId = s(row._id)
    if (!legacyId) continue
    const exists = await prisma.contractOtherFee.findUnique({ where: { legacyId } })
    if (exists) {
      skipped += 1
      continue
    }
    const contractId = contracts.get(s(dataOf(row, fields, '合約編號')))
    if (!contractId) {
      unlinked += 1
      continue
    }
    if (!dryRun) {
      const createdRow = await prisma.contractOtherFee.create({
        data: {
          legacyId,
          contractId,
          terminationId: terminations.get(s(dataOf(row, fields, '退租單'))) || null,
          description: s(dataOf(row, fields, '描述')),
          quantity: dec(dataOf(row, fields, '數量')),
          unitAmount: dec(dataOf(row, fields, '按金')),
          subtotal: dec(dataOf(row, fields, '小計')),
          remark: s(dataOf(row, fields, '備注')),
          sortOrder: sort++,
        },
      })
      remember('contractOtherFee', legacyId, createdRow.id)
    } else {
      remember('contractOtherFee', legacyId, dryId(legacyId))
    }
    created += 1
  }
  logPhase('otherFees', { file, created, skipped, unlinked })
}

async function importDepositRefunds() {
  const { rows, fields, file } = loadEntity('4.', '按金退還')
  const contracts = await legacyMap('contract')
  const customers = await legacyMap('customer')
  const rooms = await legacyMap('room')
  let created = 0
  let skipped = 0
  let unlinked = 0
  for (const row of rows) {
    const legacyId = s(row._id)
    if (!legacyId) continue
    const exists = await prisma.depositRefund.findUnique({ where: { legacyId } })
    if (exists) {
      skipped += 1
      continue
    }
    const contractId = contracts.get(s(dataOf(row, fields, '合約編號')))
    const customerId = customers.get(s(dataOf(row, fields, '客戶名稱')))
    const roomId = rooms.get(s(dataOf(row, fields, '房間名稱')))
    if (!contractId || !customerId || !roomId) {
      unlinked += 1
      continue
    }
    const refundCode = codeFromLegacy('DRF', legacyId)
    if (!dryRun) {
      const createdRow = await prisma.depositRefund.create({
        data: {
          legacyId,
          refundCode,
          contractId,
          customerId,
          roomId,
          status: s(dataOf(row, fields, '狀態')),
          terminationDate: dateOrNull(dataOf(row, fields, '退租日期')),
          refundDate: dateOrNull(dataOf(row, fields, '退款日期')),
          totalDeposit: dec(dataOf(row, fields, '按金總額')),
          actualRefundAmount: dec(dataOf(row, fields, '實退按金金額')),
          remark: s(dataOf(row, fields, '備注')),
        },
      })
      remember('depositRefund', legacyId, createdRow.id)
    } else {
      remember('depositRefund', legacyId, dryId(legacyId))
    }
    created += 1
  }
  logPhase('depositRefunds', { file, created, skipped, unlinked })
}

async function importInvoices() {
  const { rows, fields, file } = loadEntity('4.', '發票_entity')
  const contracts = await legacyMap('contract')
  const customers = await legacyMap('customer')
  const rooms = await legacyMap('room')
  const users = await legacyMap('user')
  let created = 0
  let skipped = 0
  let unlinked = 0
  let managersLinked = 0
  for (const row of rows) {
    const legacyId = s(row._id)
    if (!legacyId) continue
    const exists = await prisma.invoice.findUnique({ where: { legacyId } })
    if (exists) {
      remember('invoice', legacyId, exists.id)
      skipped += 1
      continue
    }
    const contractLegacy = s(dataOf(row, fields, '合約單編號'))
    const contractId = contracts.get(contractLegacy)
    let customerId = customers.get(s(dataOf(row, fields, '客戶名稱')))
    let roomId = rooms.get(s(dataOf(row, fields, '房間名稱')))
    if (!customerId && contractLegacy) customerId = contractCustomerByLegacy.get(contractLegacy)
    if (!roomId && contractLegacy) roomId = contractRoomByLegacy.get(contractLegacy)
    if (!contractId || !customerId || !roomId) {
      unlinked += 1
      continue
    }
    let invoiceCode = s(dataOf(row, fields, '發票編號')) || null
    // 旧系统：未到支付时编号为空，勿生成 INV… 占位码
    if (invoiceCode) {
      const taken = await prisma.invoice.findUnique({ where: { invoiceCode } })
      if (taken) invoiceCode = null
    }

    const salesManagerId = userIdOf(users, row, fields, '銷售經理')
    const createdById = userIdOf(users, row, fields, '創建人')
    if (salesManagerId) managersLinked += 1

    if (!dryRun) {
      const createdRow = await prisma.invoice.create({
        data: {
          legacyId,
          invoiceCode,
          contractId,
          customerId,
          roomId,
          salesManagerId,
          invoiceType: s(dataOf(row, fields, '發票類型')),
          description: s(dataOf(row, fields, '發票描述')),
          amount: dec(dataOf(row, fields, '開票金額')),
          status: s(dataOf(row, fields, '狀態')) || '待開票',
          invoiceDate: dateOrNull(dataOf(row, fields, '發票日期')),
          paymentDueDate: dateOrNull(dataOf(row, fields, '收款期限')),
          roomNameText: s(dataOf(row, fields, '房間名稱text')),
          notes: s(dataOf(row, fields, '備注')),
          remark: s(dataOf(row, fields, 'remark')),
          whatsappNumber: String(dataOf(row, fields, 'Whatsapp號碼') ?? ''),
          createdById,
        },
      })
      remember('invoice', legacyId, createdRow.id)
    } else {
      remember('invoice', legacyId, dryId(legacyId))
    }
    created += 1
  }
  logPhase('invoices', { file, created, skipped, unlinked, managersLinked })
}

async function importServiceDetails() {
  const { rows, fields, file } = loadEntity('4.', '服務細節')
  const invoices = await legacyMap('invoice')
  let created = 0
  let skipped = 0
  let unlinked = 0
  const batch = []
  const flush = async () => {
    if (!batch.length || dryRun) {
      batch.length = 0
      return
    }
    await prisma.invoiceServiceDetail.createMany({ data: batch, skipDuplicates: true })
    batch.length = 0
  }
  for (const row of rows) {
    const legacyId = s(row._id)
    if (!legacyId) continue
    const exists = await prisma.invoiceServiceDetail.findUnique({ where: { legacyId } })
    if (exists) {
      skipped += 1
      continue
    }
    const invoiceId = invoices.get(s(dataOf(row, fields, '所屬發票')))
    if (!invoiceId) {
      unlinked += 1
      continue
    }
    const quantity = num(dataOf(row, fields, '數量'))
    const unitAmount = num(dataOf(row, fields, '單價'))
    let subtotal = num(dataOf(row, fields, '小計'))
    if (!subtotal) subtotal = quantity * unitAmount
    created += 1
    if (!dryRun) {
      batch.push({
        legacyId,
        invoiceId,
        description: s(dataOf(row, fields, '服務描述')),
        quantity: dec(quantity),
        unitAmount: dec(unitAmount),
        subtotal: dec(subtotal),
        remark: s(dataOf(row, fields, '備注')),
        sortOrder: 0,
      })
      if (batch.length >= 300) await flush()
    } else {
      remember('invoiceServiceDetail', legacyId, dryId(legacyId))
    }
  }
  await flush()
  logPhase('serviceDetails', { file, created, skipped, unlinked })
}

async function importReceivables() {
  const { rows, fields, file } = loadEntity('4.', '應收帳')
  const invoices = await legacyMap('invoice')
  const contracts = await legacyMap('contract')
  const customers = await legacyMap('customer')
  const refunds = await legacyMap('depositRefund')
  let created = 0
  let skipped = 0
  let unlinked = 0
  for (const row of rows) {
    const legacyId = s(row._id)
    if (!legacyId) continue
    const exists = await prisma.receivable.findUnique({ where: { legacyId } })
    if (exists) {
      skipped += 1
      continue
    }
    const invoiceId = invoices.get(s(dataOf(row, fields, '所屬發票')))
    const contractId = contracts.get(s(dataOf(row, fields, '合約單編號')))
    const customerId = customers.get(s(dataOf(row, fields, '客戶')))
    if (!invoiceId || !contractId || !customerId) {
      unlinked += 1
      continue
    }
    const receivableCode = codeFromLegacy('AR', legacyId)
    if (!dryRun) {
      const createdRow = await prisma.receivable.create({
        data: {
          legacyId,
          receivableCode,
          invoiceId,
          contractId,
          customerId,
          invoiceDate: dateOrNull(dataOf(row, fields, '發票日期')),
          paymentDueDate: dateOrNull(dataOf(row, fields, '收款期限')),
          invoiceAmount: dec(dataOf(row, fields, '開票金額')),
          receivedAmount: dec(dataOf(row, fields, '已收金額')),
          receivableAmount: dec(dataOf(row, fields, '應收金額')),
          remark: s(dataOf(row, fields, '備注')),
          depositRefundId: refunds.get(s(dataOf(row, fields, '按金退還記錄'))) || null,
        },
      })
      remember('receivable', legacyId, createdRow.id)
    } else {
      remember('receivable', legacyId, dryId(legacyId))
    }
    created += 1
  }
  logPhase('receivables', { file, created, skipped, unlinked })
}

async function importReceipts() {
  const { rows, fields, file } = loadEntity('4.', '收據_entity')
  const customers = await legacyMap('customer')
  const contracts = await legacyMap('contract')
  const invoices = await legacyMap('invoice')
  const receivables = await legacyMap('receivable')
  let created = 0
  let skipped = 0
  let unlinked = 0
  for (const row of rows) {
    const legacyId = s(row._id)
    if (!legacyId) continue
    const exists = await prisma.receipt.findUnique({ where: { legacyId } })
    if (exists) {
      skipped += 1
      continue
    }
    const customerId = customers.get(s(dataOf(row, fields, '客戶')))
    if (!customerId) {
      unlinked += 1
      continue
    }
    let receiptCode = s(dataOf(row, fields, '收據編號'))
    if (!receiptCode) receiptCode = codeFromLegacy('RCP', legacyId)
    const taken = await prisma.receipt.findUnique({ where: { receiptCode } })
    if (taken) receiptCode = codeFromLegacy('RCP', legacyId)

    if (!dryRun) {
      const createdRow = await prisma.receipt.create({
        data: {
          legacyId,
          receiptCode,
          customerId,
          contractId: contracts.get(s(dataOf(row, fields, '合約編號'))) || null,
          invoiceId: invoices.get(s(dataOf(row, fields, '所屬發票'))) || null,
          receivableId: receivables.get(s(dataOf(row, fields, '所屬應收'))) || null,
          paymentDate: dateOrNull(dataOf(row, fields, '收款日期')),
          paymentMethod: s(dataOf(row, fields, '收款方式')),
          amount: dec(dataOf(row, fields, '收款金額')),
          remark: s(dataOf(row, fields, '備注')),
        },
      })
      remember('receipt', legacyId, createdRow.id)
    } else {
      remember('receipt', legacyId, dryId(legacyId))
    }
    created += 1
  }
  logPhase('receipts', { file, created, skipped, unlinked })
}

async function main() {
  console.log(dryRun ? '[dry-run] JSON 全量导入' : '[write] JSON 全量导入')
  if (ONLY) console.log('only phases:', [...ONLY].join(','))

  if (want('rooms')) {
    await importBuildings()
    await importRoomConfigs()
    await importRooms()
  }
  if (want('customers')) {
    await importCustomers()
    await importOccupants()
    await importRequirements()
  }
  if (want('contracts')) {
    await importContracts()
    await importContractPeriods()
    await importTerminations()
    await importOtherFees()
  }
  if (want('finance')) {
    await importDepositRefunds()
    await importInvoices()
    await importServiceDetails()
    await importReceivables()
    await importReceipts()
  }

  console.log('\n全部阶段结束。')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
