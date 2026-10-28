/**
 * 幂等写入：定時任務菜單 + 預置租金開票任務，並掛到 admin / superAdmin。
 * 用法：node scripts/ensure-scheduled-jobs.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'admin' } })
  const actorId = admin?.id ?? null

  await prisma.menu.upsert({
    where: { id: 'menu_scheduled_jobs' },
    create: {
      id: 'menu_scheduled_jobs',
      parentId: 'menu_system',
      type: 'menu',
      name: '定時任務',
      nameKey: 'menu.scheduledJobs',
      routeName: 'scheduledJobs',
      path: 'system/scheduled-jobs',
      icon: 'Timer',
      sortOrder: 45,
      active: true,
      createdById: actorId,
      updatedById: actorId,
    },
    update: {
      parentId: 'menu_system',
      type: 'menu',
      name: '定時任務',
      nameKey: 'menu.scheduledJobs',
      routeName: 'scheduledJobs',
      path: 'system/scheduled-jobs',
      icon: 'Timer',
      sortOrder: 45,
      active: true,
      updatedById: actorId,
    },
  })

  await prisma.scheduledJob.upsert({
    where: { code: 'rent_invoice_due' },
    create: {
      id: 'sjob_rent_invoice_due',
      code: 'rent_invoice_due',
      name: '租金自動開票',
      handlerKey: 'rent_invoice_due',
      enabled: true,
      scheduleKind: 'recurring',
      recurrence: 'daily',
      runTime: '01:00',
      recurrenceConfig: '{}',
      sortOrder: 10,
      remark: '按系統設置「繳費期前自動開票天數」為租賃中合約開立到期租金發票',
      createdById: actorId,
      updatedById: actorId,
    },
    update: {
      handlerKey: 'rent_invoice_due',
      sortOrder: 10,
      updatedById: actorId,
    },
  })

  for (const code of ['admin', 'superAdmin']) {
    const role = await prisma.role.findUnique({ where: { code } })
    if (!role) continue
    await prisma.roleMenu.upsert({
      where: {
        roleId_menuId: { roleId: role.id, menuId: 'menu_scheduled_jobs' },
      },
      create: { roleId: role.id, menuId: 'menu_scheduled_jobs' },
      update: {},
    })
  }

  console.log('scheduled jobs menu + rent_invoice_due job ready')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
