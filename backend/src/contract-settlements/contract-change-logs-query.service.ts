import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { auditActorLabel, auditUserSelect } from '../common/audit'

@Injectable()
export class ContractChangeLogsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listByContract(contractId: string) {
    const rows = await this.prisma.contractChangeLog.findMany({
      where: { contractId },
      include: {
        createdByUser: { select: auditUserSelect },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return rows.map((row) => ({
      id: row.id,
      contractId: row.contractId,
      changeType: row.changeType,
      fieldPath: row.fieldPath,
      beforeJson: row.beforeJson,
      afterJson: row.afterJson,
      refType: row.refType,
      refId: row.refId,
      summary: row.summary,
      createdBy: auditActorLabel(row.createdByUser),
      createdAt: row.createdAt.toISOString(),
    }))
  }
}
