import { BadRequestException, Injectable } from '@nestjs/common'
import {
  Prisma,
  RefundOrderStatus,
} from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CashFlowsService } from './cash-flows.service'
import { dec, nextRefundOrderCode, round2 } from './settlement-code.util'

type Db = Prisma.TransactionClient | PrismaService

export type RefundItemInput = {
  itemType: string
  description?: string
  amount: number
  receivableId?: string | null
  receiptId?: string | null
  settlementItemId?: string | null
  remark?: string
}

export type CreateRefundOrderInput = {
  contractId: string
  customerId: string
  roomId?: string | null
  settlementId?: string | null
  depositRefundId?: string | null
  status?: RefundOrderStatus
  amount: number
  /** 首笔打款金额（>0 时写流水并回写 paidAmount／status） */
  initialPaidAmount?: number
  refundDate?: Date | null
  paymentMethod?: string
  handlerId?: string | null
  remark?: string
  items: RefundItemInput[]
  actorId?: string | null
  /** @deprecated 改用 initialPaidAmount；若 status=paid 且无 initialPaidAmount 则整单打款 */
  writeCashFlow?: boolean
}

function statusFromPaid(amount: number, paidAmount: number): string {
  const due = round2(amount)
  const paid = round2(paidAmount)
  if (paid <= 0.009) return 'pending'
  if (paid + 0.009 >= due) return 'paid'
  return 'partial'
}

@Injectable()
export class RefundOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cashFlows: CashFlowsService,
  ) {}

  /** 回写已打合计与状态（含 partial；兼容未 regenerate 的 Prisma client） */
  private async writePaidState(
    client: Db,
    refundOrderId: string,
    paidAmount: number,
    status: string,
    extras?: {
      refundDate?: Date | null
      paymentMethod?: string
      handlerId?: string | null
      remark?: string
      actorId?: string | null
    },
  ) {
    await client.$executeRaw`
      UPDATE refund_orders
      SET
        paid_amount = ${dec(paidAmount)},
        status = CAST(${status} AS "RefundOrderStatus"),
        refund_date = COALESCE(${extras?.refundDate ?? null}, refund_date),
        payment_method = COALESCE(${extras?.paymentMethod ?? null}, payment_method),
        handler_id = COALESCE(${extras?.handlerId ?? null}, handler_id),
        remark = COALESCE(${extras?.remark ?? null}, remark),
        updated_by = ${extras?.actorId ?? null},
        updated_at = NOW()
      WHERE id = ${refundOrderId}
    `
  }

  async create(input: CreateRefundOrderInput, db?: Db) {
    const client = db ?? this.prisma
    const amount = round2(Math.max(0, Number(input.amount) || 0))
    if (amount <= 0.009 && !(input.items || []).length) {
      throw new BadRequestException('退款金额须大于 0')
    }
    const actorId = input.actorId || null

    if (input.settlementId) {
      const existing = await client.refundOrder.findFirst({
        where: {
          settlementId: input.settlementId,
          status: { not: RefundOrderStatus.cancelled },
        },
        select: { id: true, refundCode: true },
      })
      if (existing) {
        throw new BadRequestException(
          `该结算已有退款单 ${existing.refundCode}，不可再开新单`,
        )
      }
    }

    let initialPaid = round2(Math.max(0, Number(input.initialPaidAmount) || 0))
    if (
      initialPaid <= 0.009 &&
      input.status === RefundOrderStatus.paid &&
      input.writeCashFlow !== false
    ) {
      initialPaid = amount
    }
    if (initialPaid > amount + 0.009) {
      throw new BadRequestException('首笔打款不可超过应退总额')
    }

    const status = statusFromPaid(amount, initialPaid)
    // Prisma client 未 regenerate 时可能不认识 partial：先写 pending/paid，再 SQL 回写
    const bootstrapStatus =
      status === 'paid' ? RefundOrderStatus.paid : RefundOrderStatus.pending
    const refundCode = await nextRefundOrderCode(client)
    const refundDate =
      initialPaid > 0.009 ? input.refundDate ?? new Date() : input.refundDate ?? null

    const order = await client.refundOrder.create({
      data: {
        refundCode,
        status: bootstrapStatus,
        contractId: input.contractId,
        customerId: input.customerId,
        roomId: input.roomId || null,
        settlementId: input.settlementId || null,
        depositRefundId: input.depositRefundId || null,
        amount: dec(amount),
        refundDate,
        paymentMethod: (input.paymentMethod || '').trim(),
        handlerId: input.handlerId || null,
        remark: (input.remark || '').trim(),
        createdById: actorId,
        updatedById: actorId,
        items: {
          create: (input.items || []).map((it, i) => ({
            itemType: (it.itemType || 'other').trim() || 'other',
            description: (it.description || '').trim(),
            amount: dec(round2(Math.max(0, Number(it.amount) || 0))),
            receivableId: it.receivableId || null,
            receiptId: it.receiptId || null,
            settlementItemId: it.settlementItemId || null,
            sortOrder: i,
            remark: (it.remark || '').trim(),
            createdById: actorId,
            updatedById: actorId,
          })),
        },
      },
      include: { items: true },
    })

    if (initialPaid > 0.009 && refundDate) {
      await this.cashFlows.recordRefundOut(
        {
          refundOrderId: order.id,
          amount: initialPaid,
          flowDate: refundDate,
          paymentMethod: input.paymentMethod,
          contractId: input.contractId,
          customerId: input.customerId,
          actorId,
        },
        client,
      )
    }

    await this.writePaidState(client, order.id, initialPaid, status, {
      refundDate,
      paymentMethod: (input.paymentMethod || '').trim() || undefined,
      handlerId: input.handlerId || null,
      actorId,
    })

    return {
      ...order,
      status: status as RefundOrderStatus,
      paidAmount: dec(initialPaid),
    }
  }

  /**
   * 打款（可全额或部分）：写一条出账流水，回写 paidAmount／status。
   * amount 省略则打剩余全额。
   */
  async disburse(
    refundOrderId: string,
    params: {
      amount?: number
      refundDate: Date
      paymentMethod?: string
      handlerId?: string | null
      actorId?: string | null
      remark?: string
    },
    db?: Db,
  ) {
    const client = db ?? this.prisma
    const rows = await client.$queryRaw<
      Array<{
        id: string
        status: string
        amount: Prisma.Decimal
        paid_amount: Prisma.Decimal
        payment_method: string
        handler_id: string | null
        remark: string
        contract_id: string
        customer_id: string
      }>
    >`
      SELECT id, status::text AS status, amount, paid_amount, payment_method, handler_id, remark,
             contract_id, customer_id
      FROM refund_orders
      WHERE id = ${refundOrderId}
      LIMIT 1
    `
    const existing = rows[0]
    if (!existing) throw new BadRequestException('退款单不存在')
    if (existing.status === 'cancelled') {
      throw new BadRequestException('已取消的退款单不可打款')
    }
    if (existing.status === 'paid') {
      return client.refundOrder.findUniqueOrThrow({ where: { id: refundOrderId } })
    }

    const due = round2(Number(existing.amount.toString()))
    const paidBefore = round2(Number(existing.paid_amount?.toString?.() ?? 0))
    const remaining = round2(Math.max(0, due - paidBefore))
    if (remaining <= 0.009) {
      await this.writePaidState(client, refundOrderId, due, 'paid', {
        actorId: params.actorId || null,
      })
      return client.refundOrder.findUniqueOrThrow({ where: { id: refundOrderId } })
    }

    let pay = params.amount != null ? round2(Math.max(0, Number(params.amount) || 0)) : remaining
    if (pay <= 0.009) throw new BadRequestException('打款金额须大于 0')
    if (pay > remaining + 0.009) {
      throw new BadRequestException(`本次金额不可超过待退 ${remaining.toFixed(2)}`)
    }
    pay = Math.min(pay, remaining)

    const actorId = params.actorId || null
    const paymentMethod =
      (params.paymentMethod || '').trim() || existing.payment_method || ''

    // 打款备注只写资金流水，不回拼到退款单 remark（开单备注与打款备注分离）
    await this.cashFlows.recordRefundOut(
      {
        refundOrderId: existing.id,
        amount: pay,
        flowDate: params.refundDate,
        paymentMethod,
        contractId: existing.contract_id,
        customerId: existing.customer_id,
        actorId,
        remark: params.remark,
      },
      client,
    )

    const paidAfter = round2(paidBefore + pay)
    const status = statusFromPaid(due, paidAfter)

    await this.writePaidState(client, refundOrderId, paidAfter, status, {
      refundDate: params.refundDate,
      paymentMethod,
      handlerId: params.handlerId || existing.handler_id || actorId,
      actorId,
    })

    return client.refundOrder.findUniqueOrThrow({ where: { id: refundOrderId } })
  }

  /** @deprecated 使用 disburse；保留给旧调用整单打清 */
  async markPaid(
    refundOrderId: string,
    params: {
      refundDate: Date
      paymentMethod?: string
      handlerId?: string | null
      actorId?: string | null
      amount?: number
      remark?: string
    },
    db?: Db,
  ) {
    return this.disburse(refundOrderId, params, db)
  }

  /** 按出账流水重算 paidAmount／status（不改应退 amount） */
  async syncPaidFromCashFlows(
    refundOrderId: string,
    actorId?: string | null,
    db?: Db,
  ) {
    const client = db ?? this.prisma
    const existing = await client.refundOrder.findUnique({
      where: { id: refundOrderId },
    })
    if (!existing || existing.status === RefundOrderStatus.cancelled) return existing

    const agg = await client.cashFlow.aggregate({
      where: { refundOrderId, direction: 'out' },
      _sum: { amount: true },
      _max: { flowDate: true },
    })
    const paid = round2(Number(agg._sum.amount?.toString() ?? 0))
    const due = round2(Number(existing.amount.toString()))
    const status = statusFromPaid(due, paid)
    await this.writePaidState(client, refundOrderId, paid, status, {
      refundDate: agg._max.flowDate ?? existing.refundDate,
      actorId: actorId || null,
    })
    return client.refundOrder.findUnique({ where: { id: refundOrderId } })
  }
}
