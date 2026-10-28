/**
 * 向指定大厦新增 20 条「簽約中」合约（含新房间），编号规则与系统一致：
 *   {roomCode}-{YYYYMMDD}，同日冲突再拼 HHmmss / -N
 * 合约起算日刻意落在「第 2 缴费期提前窗内」，便于验证「待開單」芯片列表滚动。
 *
 * 用法：
 *   node scripts/seed-building-contracts-20.mjs [buildingId]
 */
import { PrismaClient, Prisma } from '@prisma/client'

const BUILDING_ID = process.argv[2] || 'cmv96pfhh0001mdbgex3xe0q5'
const COUNT = 20
const prisma = new PrismaClient()

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
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

/** 与 ContractsService.hkDateTimeParts 一致（Asia/Hong_Kong） */
function hkDateTimeParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type) => parts.find((p) => p.type === type)?.value || ''
  return {
    datePart: `${get('year')}${get('month')}${get('day')}`,
    timePart: `${get('hour')}${get('minute')}${get('second')}`,
  }
}

async function nextContractCode(roomCode) {
  const base = String(roomCode || '').trim()
  if (!base) throw new Error('roomCode required')
  const { datePart, timePart } = hkDateTimeParts()
  const taken = async (code) =>
    !!(await prisma.contract.findFirst({ where: { contractCode: code }, select: { id: true } }))

  let code = `${base}-${datePart}`
  if (!(await taken(code))) return code

  code = `${base}-${datePart}${timePart}`
  let guard = 0
  while ((await taken(code)) && guard < 100) {
    guard += 1
    // 同秒批量创建时错开
    code = `${base}-${datePart}${timePart}-${guard}`
  }
  return code
}

async function main() {
  const building = await prisma.building.findUnique({
    where: { id: BUILDING_ID },
    select: { id: true, name: true },
  })
  if (!building) throw new Error(`Building not found: ${BUILDING_ID}`)
  console.log(`Target: ${building.name} (${building.id})`)

  const actor = await prisma.user.findFirst({
    where: { role: { in: ['superAdmin', 'admin'] }, status: 'active' },
    select: { id: true, account: true },
    orderBy: { createdAt: 'asc' },
  })
  const actorId = actor?.id ?? null

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
      select: { code: true },
    })) || { code: 'usage' }

  const leaseTypes = await prisma.contractConfigOption.findMany({
    where: { type: 'leaseType', active: true },
    orderBy: { sortOrder: 'asc' },
    select: { label: true, code: true },
  })
  const leaseLabel = leaseTypes[0]?.label || leaseTypes[0]?.code || '整租'

  let customers = await prisma.customer.findMany({
    where: { buildingId: BUILDING_ID },
    take: 30,
    orderBy: { createdAt: 'desc' },
  })
  if (customers.length < 5) {
    const stamp = Date.now().toString(36).slice(-3).toUpperCase()
    for (let i = 1; i <= 8; i++) {
      customers.push(
        await prisma.customer.create({
          data: {
            customerCode: `CM-C20-${stamp}${String(i).padStart(2, '0')}`,
            name: `測試客戶C20-${stamp}${i}`,
            status: '簽約中',
            buildingId: BUILDING_ID,
            remark: 'seed contracts-20',
            createdById: actorId,
            updatedById: actorId,
          },
        }),
      )
    }
  }

  const today = utcToday()
  // 月繳：首期约 1 个月前开始 → 第 2 期已进入 / 临近提前窗
  const start = new Date(today.getTime() - 25 * 86400000)
  const endInclusive = new Date(addMonthsUtc(start, 12).getTime() - 86400000)

  const stamp = Date.now().toString(36).slice(-4).toUpperCase()
  const created = []

  for (let i = 1; i <= COUNT; i++) {
    const floor = randInt(5, 28)
    const unit = String(100 + i).slice(-2)
    const roomCode = `C20${stamp}${String(i).padStart(2, '0')}`
    const monthlyRent = new Prisma.Decimal(randInt(90, 180) * 100)

    const room = await prisma.room.create({
      data: {
        buildingId: BUILDING_ID,
        roomCode,
        name: `${building.name} C20-${i}`,
        roomType: roomType.label || '辦公室',
        leaseCapability: 'whole_only',
        splitLabels: [],
        sizeSqft: new Prisma.Decimal(randInt(100, 400)),
        monthlyRent,
        status: 'idle',
        remark: `seed contracts-20 ${stamp}`,
        createdById: actorId,
        updatedById: actorId,
      },
    })

    const customer = pick(customers)
    const contractCode = await nextContractCode(room.roomCode)

    const contract = await prisma.contract.create({
      data: {
        contractCode,
        roomId: room.id,
        customerId: customer.id,
        startDate: start,
        endDate: endInclusive,
        leaseType: leaseLabel,
        occupancyMode: 'whole',
        partLabel: '',
        status: '簽約中',
        roomDeposit: monthlyRent,
        monthlyRent,
        bookingDeposit: new Prisma.Decimal(3000),
        paymentDate: start,
        paymentCycle: '月繳-1',
        paymentMethod: pick(['轉數快', '銀行過數', '現金']),
        paymentVoucher: '',
        electricityRate: new Prisma.Decimal('1.2000'),
        miscDeposit: new Prisma.Decimal(500),
        doorKeyQty: 1,
        mailboxKeyQty: 1,
        doorKeyDeposit: new Prisma.Decimal(200),
        mailboxKeyDeposit: new Prisma.Decimal(100),
        roomNameText: room.name,
        attachment: '',
        remark: `seed contracts-20 ${stamp} floor=${floor}${unit}`,
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
    })

    await prisma.room.update({
      where: { id: room.id },
      data: {
        status: 'signing',
        latestContract: contract.contractCode,
        updatedById: actorId,
      },
    })

    created.push({ roomCode: room.roomCode, contractCode: contract.contractCode })
    // 避免同秒撞号时 timePart 不变：轻微错开
    await new Promise((r) => setTimeout(r, 5))
  }

  console.log(`Created ${created.length} contracts (all 簽約中, paymentCycle=月繳-1)`)
  console.log(JSON.stringify({ buildingId: BUILDING_ID, stamp, sample: created.slice(0, 5), all: created }, null, 2))
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
