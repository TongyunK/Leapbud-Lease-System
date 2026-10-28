/**
 * 向指定大厦随机灌入本地测试数据：房间 / 客户 / 需求 / 合约（含合约期）。
 *
 * 用法：
 *   node scripts/seed-building-demo-data.mjs [buildingId]
 * 默认 buildingId = cmv96pfhh0001mdbgex3xe0q5
 */
import { PrismaClient, Prisma } from '@prisma/client'

const BUILDING_ID = process.argv[2] || 'cmv96pfhh0001mdbgex3xe0q5'
const ROOM_COUNT = 8
const CUSTOMER_COUNT = 6
const REQUIREMENT_COUNT = 5
const CONTRACT_COUNT = 4

const prisma = new PrismaClient()

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function ymd(d) {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addMonthsUtc(date, months) {
  const day = date.getUTCDate()
  const base = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()
  base.setUTCDate(Math.min(day, last))
  return base
}

function utcToday() {
  const n = new Date()
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()))
}

const SURNAMES = ['陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊']
const GIVEN = ['志明', '雅婷', '家豪', '淑芬', '冠宇', '詩涵', '承恩', '宜臻', '俊傑', '曉彤']
const COMPANIES = ['躍芽貿易', '青禾顧問', '星河科技', '海納物流', '晴空設計', '木棉工作室']
const SOURCES = ['網上查詢', '轉介', 'Walk-in', '舊客戶', '廣告']

async function main() {
  const building = await prisma.building.findUnique({
    where: { id: BUILDING_ID },
    select: { id: true, name: true, active: true },
  })
  if (!building) {
    throw new Error(`Building not found: ${BUILDING_ID}`)
  }
  console.log(`Target building: ${building.name} (${building.id})`)

  const actor =
    (await prisma.user.findFirst({
      where: { role: { in: ['superAdmin', 'admin'] }, status: 'active' },
      select: { id: true, account: true },
      orderBy: { createdAt: 'asc' },
    })) || null
  const actorId = actor?.id ?? null
  if (actor) console.log(`Actor: ${actor.account}`)

  const roomType =
    (await prisma.roomTypeOption.findFirst({
      where: { active: true },
      orderBy: { sortOrder: 'asc' },
      select: { label: true },
    })) || { label: '辦公室' }

  const periodUsage =
    (await prisma.contractConfigOption.findFirst({
      where: {
        type: 'periodType',
        active: true,
        OR: [{ code: 'usage' }, { label: { contains: '使用' } }],
      },
      select: { code: true, label: true },
    })) || { code: 'usage', label: '使用期' }

  const leaseTypes = await prisma.contractConfigOption.findMany({
    where: { type: 'leaseType', active: true },
    orderBy: { sortOrder: 'asc' },
    select: { code: true, label: true },
  })
  const leaseLabel = (lt) => lt?.label || lt?.code || '整租'
  const paymentCycles = ['月繳-1', '季繳-3']
  const paymentMethods = ['轉數快', '銀行過數', '現金', '支票']

  const stamp = Date.now().toString(36).slice(-4).toUpperCase()
  const today = utcToday()
  const roomTypeLabel = roomType.label || '辦公室'

  // —— 房间 ——
  const rooms = []
  for (let i = 1; i <= ROOM_COUNT; i++) {
    const floor = randInt(3, 18)
    const unit = String(randInt(1, 20)).padStart(2, '0')
    const roomCode = `T${stamp}${floor}${unit}`
    const monthlyRent = new Prisma.Decimal(randInt(80, 220) * 100)
    const flexible = i % 4 === 0
    const room = await prisma.room.create({
      data: {
        buildingId: BUILDING_ID,
        roomCode,
        name: `${building.name} ${floor}F-${unit}`,
        roomType: roomTypeLabel,
        leaseCapability: flexible ? 'flexible' : 'whole_only',
        splitLabels: flexible ? ['A', 'B'] : [],
        sizeSqft: new Prisma.Decimal(randInt(80, 480)),
        monthlyRent,
        dailyRent: new Prisma.Decimal(0),
        hourlyRent: new Prisma.Decimal(0),
        status: 'idle',
        remark: `demo seed ${stamp}`,
        description: `示範房間 seed ${stamp}`,
        createdById: actorId,
        updatedById: actorId,
      },
    })
    rooms.push(room)
  }
  console.log(`Rooms created: ${rooms.length}`)

  // —— 客户（挂到该大厦） ——
  const customers = []
  for (let i = 1; i <= CUSTOMER_COUNT; i++) {
    const isCompany = i % 3 === 0
    const person = `${pick(SURNAMES)}${pick(GIVEN)}`
    const customerCode = `CM-DEMO-${stamp}${String(i).padStart(2, '0')}`
    const customer = await prisma.customer.create({
      data: {
        customerCode,
        name: isCompany ? pick(COMPANIES) : person,
        status: pick(['新客戶', '已查詢', '簽約中']),
        companyNameZh: isCompany ? pick(COMPANIES) : '',
        companyNameEn: isCompany ? `Demo Co ${stamp}${i}` : '',
        businessRegNo: isCompany ? `BR${randInt(1000000, 9999999)}` : '',
        businessNature: isCompany ? pick(['貿易', '顧問', '科技', '物流']) : '',
        source: pick(SOURCES),
        buildingId: BUILDING_ID,
        remark: `demo seed ${stamp} / building ${BUILDING_ID}`,
        createdById: actorId,
        updatedById: actorId,
      },
    })
    customers.push(customer)
  }
  console.log(`Customers created: ${customers.length}`)

  // —— 客户需求 ——
  const requirements = []
  for (let i = 1; i <= REQUIREMENT_COUNT; i++) {
    const customer = pick(customers)
    const reqCode = `REQ-DEMO-${stamp}${String(i).padStart(2, '0')}`
    const reqDate = new Date(today.getTime() - randInt(0, 20) * 86400000)
    const requirement = await prisma.customerRequirement.create({
      data: {
        requirementCode: reqCode,
        customerId: customer.id,
        requirementDate: reqDate,
        status: pick(['跟進中', '已簽約']),
        rentalType: 'long',
        leaseDuration: pick(['6個月', '12個月', '24個月']),
        budget: new Prisma.Decimal(randInt(80, 220) * 100),
        content: `示範需求：希望租用「${building.name}」附近单位（seed ${stamp}）`,
        remark: `demo seed ${stamp}`,
        createdById: actorId,
        updatedById: actorId,
      },
    })
    requirements.push(requirement)
  }
  console.log(`Requirements created: ${requirements.length}`)

  // —— 合约（签约中 / 租赁中） ——
  const contracts = []
  const usedRoomIds = new Set()
  for (let i = 1; i <= CONTRACT_COUNT; i++) {
    const room = rooms.find((r) => !usedRoomIds.has(r.id)) || pick(rooms)
    usedRoomIds.add(room.id)
    const customer = pick(customers)
    const requirement =
      requirements.find((r) => r.customerId === customer.id) || pick(requirements)
    const status = i <= 2 ? '簽約中' : '租賃中'
    const start = new Date(today.getTime() - randInt(0, 45) * 86400000)
    const endExclusive = addMonthsUtc(start, 12)
    const endInclusive = new Date(endExclusive.getTime() - 86400000)
    const lease = leaseTypes.length ? pick(leaseTypes) : null
    const paymentCycle = pick(paymentCycles)
    const monthlyRent = room.monthlyRent ?? new Prisma.Decimal(12000)
    const contractCode = `${room.roomCode}-${ymd(today).replace(/-/g, '')}${i}`

    const contract = await prisma.contract.create({
      data: {
        contractCode,
        roomId: room.id,
        customerId: customer.id,
        requirementId: requirement?.id ?? null,
        startDate: start,
        endDate: endInclusive,
        leaseType: leaseLabel(lease),
        occupancyMode: 'whole',
        partLabel: '',
        status,
        roomDeposit: monthlyRent,
        monthlyRent,
        bookingDeposit: new Prisma.Decimal(randInt(20, 50) * 100),
        paymentDate: start,
        paymentCycle,
        paymentMethod: pick(paymentMethods),
        paymentVoucher: status === '租賃中' ? `demo-voucher-${stamp}-${i}.png` : '',
        electricityRate: new Prisma.Decimal('1.2000'),
        miscDeposit: new Prisma.Decimal(randInt(5, 20) * 100),
        doorKeyQty: 2,
        mailboxKeyQty: 1,
        doorKeyDeposit: new Prisma.Decimal(200),
        mailboxKeyDeposit: new Prisma.Decimal(100),
        roomNameText: room.name,
        subleaseMark: '',
        attachment: status === '租賃中' ? `demo-sign-${stamp}-${i}.pdf` : '',
        remark: `demo seed ${stamp}`,
        createdById: actorId,
        updatedById: actorId,
        periods: {
          create: [
            {
              dateType: periodUsage.code || 'usage',
              dateUnit: '月',
              dateValue: 12,
              startDate: start,
              endDate: endInclusive,
              sortOrder: 0,
            },
          ],
        },
      },
      include: { periods: true },
    })

    await prisma.room.update({
      where: { id: room.id },
      data: {
        status: status === '租賃中' ? 'leased' : 'signing',
        latestContract: contract.contractCode,
        updatedById: actorId,
      },
    })

    contracts.push(contract)
  }
  console.log(`Contracts created: ${contracts.length}`)

  console.log('\nSummary')
  console.log(
    JSON.stringify(
      {
        buildingId: BUILDING_ID,
        buildingName: building.name,
        stamp,
        rooms: rooms.map((r) => r.roomCode),
        customers: customers.map((c) => ({ code: c.customerCode, name: c.name })),
        requirements: requirements.map((r) => r.requirementCode),
        contracts: contracts.map((c) => ({ code: c.contractCode, status: c.status })),
      },
      null,
      2,
    ),
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
