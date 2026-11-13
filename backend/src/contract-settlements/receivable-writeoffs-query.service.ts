import { Injectable } from '@nestjs/common'
import { ContractSettlementType, Prisma, ReceivableWriteoffDirection } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { auditActorLabel, auditUserInclude } from '../common/audit'
import { ReceivableWriteoffsService } from './receivable-writeoffs.service'

function dateOnly(d: Date | null | undefined): string {
  if (!d) return ''
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function num(v: Prisma.Decimal | number | null | undefined) {
  if (v == null) return 0
  if (typeof v === 'number') return v
  return Number(v.toString())
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

const include = {
  receivable: { select: { id: true, receivableCode: true } },
  ...auditUserInclude,
} satisfies Prisma.ReceivableWriteoffInclude

@Injectable()
export class ReceivableWriteoffsQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly writeoffs: ReceivableWriteoffsService,
  ) {}

  private toDto(row: any) {
    return {
      id: row.id,
      writeoffCode: row.writeoffCode,
      receivableId: row.receivableId,
      receivableCode: row.receivable?.receivableCode ?? '',
      amount: num(row.amount),
      direction: row.direction,
      reasonType: row.reasonType ?? '',
      settlementId: row.settlementId,
      settlementItemId: row.settlementItemId,
      receiptId: row.receiptId,
      writeoffDate: dateOnly(row.writeoffDate),
      remark: row.remark ?? '',
      createdBy: auditActorLabel(row.createdByUser),
      createdAt: row.createdAt.toISOString(),
    }
  }

  async listBySettlement(settlementId: string) {
    const rows = await this.prisma.receivableWriteoff.findMany({
      where: { settlementId },
      include,
      orderBy: [{ writeoffDate: 'desc' }, { createdAt: 'desc' }],
    })
    return rows.map((r) => this.toDto(r))
  }

  async listByReceivable(receivableId: string) {
    await this.backfillMissingCancelWriteoff(receivableId)
    const rows = await this.prisma.receivableWriteoff.findMany({
      where: { receivableId },
      include,
      orderBy: [{ writeoffDate: 'desc' }, { createdAt: 'desc' }],
    })
    return rows.map((r) => this.toDto(r))
  }

  /**
   * 兼容历史：取消时选「暂不退」→ 后办冲销另收，但未写 receivable_writeoffs。
   * 打开应收详情时若已取消发票且仍有未收／未记退另收、又无核销留痕，则补一条 void_cancel。
   */
  private async backfillMissingCancelWriteoff(receivableId: string) {
    const id = (receivableId || '').trim()
    if (!id) return

    const existing = await this.prisma.receivableWriteoff.count({
      where: { receivableId: id },
    })
    if (existing > 0) return

    const recv = await this.prisma.receivable.findUnique({
      where: { id },
      select: {
        id: true,
        contractId: true,
        receivableAmount: true,
        receivedAmount: true,
        refundedAmount: true,
        invoice: { select: { status: true } },
      },
    })
    if (!recv || recv.invoice?.status !== '已取消') return

    let amount = round2(Number(recv.receivableAmount?.toString() ?? 0))
    if (amount <= 0.009) {
      const received = round2(Number(recv.receivedAmount?.toString() ?? 0))
      const refunded = round2(Number(recv.refundedAmount?.toString() ?? 0))
      amount = round2(Math.max(0, received - refunded))
    }
    if (amount <= 0.009) return

    const contractId = recv.contractId
    const settlement = contractId
      ? await this.prisma.contractSettlement.findFirst({
          where: {
            contractId,
            type: ContractSettlementType.CANCEL,
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, settlementDate: true },
        })
      : null

    await this.writeoffs.create({
      receivableId: id,
      amount,
      direction: ReceivableWriteoffDirection.reduce,
      reasonType: 'void_cancel',
      writeoffDate: settlement?.settlementDate ?? new Date(),
      settlementId: settlement?.id ?? null,
      remark: '取消合约作废应收（补记）',
    })
  }
}
