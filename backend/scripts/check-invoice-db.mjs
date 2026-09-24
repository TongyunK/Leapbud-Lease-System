import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
try {
  const total = await prisma.invoice.count()
  const detailCount = await prisma.invoiceServiceDetail.count()
  const codeLikeOld = await prisma.invoice.count({
    where: { invoiceCode: { startsWith: 'W' } },
  })
  const samples = await prisma.invoice.findMany({
    take: 8,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      invoiceCode: true,
      notes: true,
      remark: true,
      description: true,
      amount: true,
      contractId: true,
    },
  })
  console.log({ total, detailCount, codeLikeOld })
  console.log(JSON.stringify(samples, null, 2))
} finally {
  await prisma.$disconnect()
}
