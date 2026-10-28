import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'admin' } })
  const actorId = admin?.id ?? null

  await prisma.role.upsert({
    where: { code: 'superAdmin' },
    create: {
      id: 'role_super_admin',
      code: 'superAdmin',
      name: '超級管理員',
      description: '超級管理員：全部菜單與全部大廈，並可在列表行內修改白名單字段',
      sortOrder: 0,
      active: true,
      isSystem: true,
      createdById: actorId,
      updatedById: actorId,
    },
    update: {
      name: '超級管理員',
      description: '超級管理員：全部菜單與全部大廈，並可在列表行內修改白名單字段',
      active: true,
      isSystem: true,
      updatedById: actorId,
    },
  })

  const role = await prisma.role.findUniqueOrThrow({ where: { code: 'superAdmin' } })
  const menus = await prisma.menu.findMany({ select: { id: true } })
  await prisma.roleMenu.deleteMany({ where: { roleId: role.id } })
  if (menus.length) {
    await prisma.roleMenu.createMany({
      data: menus.map((m) => ({ roleId: role.id, menuId: m.id })),
    })
  }

  const hash = await bcrypt.hash('admin123', 10)
  const user = await prisma.user.upsert({
    where: { account: 'superadmin' },
    create: {
      account: 'superadmin',
      passwordHash: hash,
      displayName: 'superAdmin',
      role: 'superAdmin',
      status: 'active',
      email: 'superadmin@leapbud.local',
      createdById: actorId,
      updatedById: actorId,
    },
    update: {
      passwordHash: hash,
      displayName: 'superAdmin',
      role: 'superAdmin',
      status: 'active',
      updatedById: actorId,
    },
  })

  // superAdmin 默认可访问全部大厦：清空绑定，与 admin 一致
  await prisma.userBuilding.deleteMany({ where: { userId: user.id } })

  console.log('superAdmin role + user ready (account: superadmin / admin123, all buildings)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
